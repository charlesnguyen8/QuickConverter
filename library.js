document.addEventListener('DOMContentLoaded', async () => {
  const gridEl = document.getElementById('library-grid');
  const statsEl = document.getElementById('library-stats');

  if (!window.StorageService) {
    console.error('StorageService not available');
    return;
  }

  try {
    const novels = await window.StorageService.getManagedNovels();

    if (statsEl) {
      statsEl.textContent = `${novels.length} Novel${novels.length === 1 ? '' : 's'} Managed`;
    }

    if (!gridEl) return;

    if (novels.length === 0) {
      gridEl.className = 'flex flex-col items-center justify-center py-24 text-center';
      gridEl.innerHTML = `
        <div class="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-3xl mb-4">
          📚
        </div>
        <h2 class="text-lg font-bold text-slate-200">Your Library is Empty</h2>
        <p class="text-sm text-slate-400 max-w-sm mt-1">
          Visit any supported novel series on wetriedtls.com and add it to your library.
        </p>
      `;
      return;
    }

    gridEl.innerHTML = '';

    // Render cards
    for (const novel of novels) {
      const stats = await window.StorageService.getNovelDownloadStats(novel.id, novel.totalChapters || 100);
      const downloaded = stats.downloadedCount;
      const total = novel.totalChapters || stats.totalChapters || 100;
      const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;

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
            loading="lazy"
            onerror="this.onerror=null; this.src='https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp';"
          />
          <div class="absolute top-2 right-2">
            <span class="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-900/80 text-slate-300 border border-slate-700/80 backdrop-blur-sm shadow">
              ${total} Chapters
            </span>
          </div>
        </div>

        <!-- Card Content -->
        <div class="p-4 flex flex-col gap-3 flex-1 justify-between">
          <div>
            <h2 class="font-bold text-slate-100 text-sm md:text-base leading-snug line-clamp-2 title-novel" title="${novel.title}">
              ${novel.title}
            </h2>
            <span class="text-xs text-slate-400 font-mono mt-1 block">
              ${novel.domain || 'wetriedtls.com'}
            </span>
          </div>

          <!-- Download Statistics -->
          <div class="flex flex-col gap-1.5 pt-2 border-t border-slate-700/50">
            <div class="flex items-center justify-between text-xs font-medium">
              <span class="text-slate-400">Chapters Downloaded</span>
              <span class="text-indigo-300 font-semibold">${downloaded} / ${total}</span>
            </div>

            <!-- Progress Bar -->
            <div class="w-full bg-slate-700/60 rounded-full h-2 overflow-hidden">
              <div
                class="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-500"
                style="width: ${percent}%;"
              ></div>
            </div>

            <div class="flex items-center justify-between text-[11px] text-slate-400">
              <span>Progress</span>
              <span class="text-indigo-400 font-semibold">${percent}%</span>
            </div>
          </div>
        </div>
      `;

      gridEl.appendChild(card);
    }
  } catch (err) {
    console.error('Error loading library:', err);
  }
});
