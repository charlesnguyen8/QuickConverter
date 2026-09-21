document.addEventListener('DOMContentLoaded', async () => {
  const gridEl = document.getElementById('library-grid');
  const statsEl = document.getElementById('library-stats');
  const novelCountEl = document.getElementById('library-novel-count');
  const diskTextEl = document.getElementById('library-disk-text');
  const diskBadgeEl = document.getElementById('library-disk-badge');

  if (!window.StorageService) {
    console.error('StorageService not available');
    return;
  }

  async function loadLibrary() {
    try {
      const novels = await window.StorageService.getManagedNovels();

      // Fetch and display overall disk usage
      if (typeof window.StorageService.getDiskUsage === 'function') {
        try {
          const diskUsage = await window.StorageService.getDiskUsage();
          if (novelCountEl) {
            novelCountEl.textContent = `${novels.length} Novel${novels.length === 1 ? '' : 's'} Managed`;
          }
          if (diskTextEl) {
            diskTextEl.textContent = `Disk: ${diskUsage.formatted}`;
          }
          if (diskBadgeEl) {
            const quotaStr = diskUsage.formattedQuota ? ` • Quota: ~${diskUsage.formattedQuota}` : '';
            const pctStr = diskUsage.percentOfQuota ? ` (${diskUsage.percentOfQuota}%)` : '';
            diskBadgeEl.title = `Browser Storage: ${diskUsage.formatted} used across ${diskUsage.totalDownloadedChapters} saved chapters${quotaStr}${pctStr}`;
          }
        } catch (diskErr) {
          console.warn('Failed to calculate disk usage:', diskErr);
          if (diskTextEl) diskTextEl.textContent = 'Disk: Available';
        }
      } else if (novelCountEl) {
        novelCountEl.textContent = `${novels.length} Novel${novels.length === 1 ? '' : 's'} Managed`;
      }

      if (!gridEl) return;

      if (novels.length === 0) {
        gridEl.className = 'flex flex-col items-center justify-center py-24 text-center';
        gridEl.innerHTML = `
          <div class="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-3xl mb-4">
            📚
          </div>
          <h2 class="text-lg font-bold text-slate-200">Your Library is Empty</h2>
          <p class="text-sm text-slate-400 max-w-sm mt-1 mb-4">
            Paste a link from any supported novel website to add it to your library.
          </p>
          <add-book-button></add-book-button>
        `;
        return;
      }

      gridEl.className = 'grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6';
      gridEl.innerHTML = '';

      // Render cards
      for (const novel of novels) {
        const stats = await window.StorageService.getNovelDownloadStats(novel.id, novel.totalChapters || 100);
        const downloaded = stats.downloadedCount;
        const total = novel.totalChapters || stats.totalChapters || 100;
        const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
        const formattedSize = stats.formattedSize || '0 B';

        const card = document.createElement('div');
        card.className = 'flex flex-col rounded-lg border border-slate-800 bg-slate-800/80 hover:border-indigo-500/60 hover:bg-slate-800 hover:shadow-md transition overflow-hidden shadow-sm group cursor-pointer';
        card.title = `Click to view chapters for ${novel.title}`;
        card.addEventListener('click', () => {
          window.location.href = `novel.html?id=${encodeURIComponent(novel.id)}`;
        });

        const thumbnailSrc = novel.thumbnail || 'https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp';

        card.innerHTML = `
          <!-- Thumbnail -->
          <div class="aspect-[3/4] w-full bg-slate-900 overflow-hidden relative">
            <img
              src="${thumbnailSrc}"
              alt="${novel.title}"
              class="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
              onerror="this.src='https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp'"
            />
            <div class="absolute top-2 right-2 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-900/80 backdrop-blur border border-slate-700/60 text-slate-200 shadow">
              ${total} Chs
            </div>
          </div>

          <!-- Info -->
          <div class="p-4 flex flex-col flex-1 justify-between gap-3">
            <div>
              <div class="flex items-center gap-1.5 text-xs text-indigo-400 font-medium mb-1">
                <span>🌐</span>
                <span class="truncate">${novel.domain || 'wetriedtls.com'}</span>
              </div>
              <h3 class="font-bold text-sm text-slate-100 group-hover:text-indigo-300 transition line-clamp-2 leading-snug">
                ${novel.title}
              </h3>
            </div>

            <!-- Download Progress Bar & Storage Size -->
            <div class="flex flex-col gap-1.5 pt-2 border-t border-slate-700/50">
              <div class="w-full bg-slate-700/60 rounded-full h-2 overflow-hidden">
                <div
                  class="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                  style="width: ${percent}%;"
                ></div>
              </div>

              <div class="flex items-center justify-between text-[11px] text-slate-400">
                <div class="flex items-center gap-1">
                  <span>Progress:</span>
                  <span class="text-indigo-400 font-semibold">${percent}%</span>
                </div>
                <span class="inline-flex items-center gap-1 text-[10px] font-mono text-slate-400 bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-700/50" title="Disk storage used by this novel">
                  <span>💾</span>
                  <span>${formattedSize}</span>
                </span>
              </div>
            </div>
          </div>
        `;

        gridEl.appendChild(card);
      }
    } catch (err) {
      console.error('Error loading library:', err);
    }
  }

  // Initial load
  await loadLibrary();

  // Dynamically re-render when a novel is added from Add Book dialog
  window.addEventListener('novel-added', () => {
    loadLibrary();
  });
});
