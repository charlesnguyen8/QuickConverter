document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const novelId = urlParams.get('id');

  const titleEl = document.getElementById('novel-title');
  const artworkEl = document.getElementById('novel-artwork');
  const domainEl = document.getElementById('novel-domain');
  const statusEl = document.getElementById('novel-status');
  const chaptersStatEl = document.getElementById('chapters-stat');
  const progressBarEl = document.getElementById('chapters-progress-bar');
  const totalChaptersLabel = document.getElementById('total-chapters-label');
  const progressPercentEl = document.getElementById('progress-percent');
  const chaptersBadgeEl = document.getElementById('chapters-badge');
  const chaptersListEl = document.getElementById('chapters-list');
  const syncChaptersBtn = document.getElementById('sync-chapters-btn');

  if (!novelId || !window.StorageService) {
    if (titleEl) titleEl.textContent = 'Novel Not Found';
    return;
  }

  let currentNovel = null;

  async function updateStatsAndProgress(novel, downloadedCount, totalCount) {
    const total = totalCount || novel.totalChapters || 100;
    const percent = total > 0 ? Math.min(100, Math.round((downloadedCount / total) * 100)) : 0;

    if (chaptersStatEl) chaptersStatEl.textContent = `${downloadedCount} / ${total}`;
    if (progressBarEl) progressBarEl.style.width = `${percent}%`;
    if (totalChaptersLabel) totalChaptersLabel.textContent = `${total} Total Chapters`;
    if (progressPercentEl) progressPercentEl.textContent = `${percent}%`;
    if (chaptersBadgeEl) chaptersBadgeEl.textContent = `${downloadedCount} / ${total} Saved`;
  }

  async function renderChapters(novel) {
    if (!novel || !chaptersListEl) return;

    let catalog = novel.chapterList || [];

    // If catalog is empty but novel has slug, attempt initial auto-sync
    if (catalog.length === 0 && novel.slug) {
      chaptersListEl.innerHTML = `
        <div class="p-8 rounded-lg bg-slate-800/40 border border-slate-700/50 text-center flex flex-col items-center justify-center gap-2">
          <svg class="animate-spin h-6 w-6 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <p class="text-sm font-medium text-slate-300">Fetching chapter catalog from provider...</p>
        </div>
      `;

      const synced = await window.StorageService.syncNovelChapters(novel.id);
      if (synced && synced.chapterList && synced.chapterList.length > 0) {
        novel = synced;
        currentNovel = synced;
        catalog = novel.chapterList;
      }
    }

    const downloadedChapters = await window.StorageService.getNovelChapters(novel.id);
    const downloadedMap = new Map(downloadedChapters.map((c) => [Number(c.chapterNumber), c]));

    const displayList = catalog.length > 0 ? catalog : downloadedChapters;
    const totalCount = novel.totalChapters || displayList.length || 100;

    updateStatsAndProgress(novel, downloadedChapters.length, totalCount);

    if (displayList.length === 0) {
      chaptersListEl.innerHTML = `
        <div class="p-8 rounded-lg bg-slate-800/40 border border-slate-700/50 text-center flex flex-col items-center justify-center gap-2">
          <div class="text-2xl">📖</div>
          <p class="text-sm font-medium text-slate-300">No chapters found for this novel.</p>
          <p class="text-xs text-slate-500 max-w-sm">
            Click "Sync Catalog" above to fetch chapters from the provider.
          </p>
        </div>
      `;
      return;
    }

    chaptersListEl.innerHTML = '';

    displayList.forEach((chapter) => {
      const chNum = Number(chapter.chapterNumber);
      const isDownloaded = downloadedMap.has(chNum);

      const row = document.createElement('div');
      row.className = isDownloaded
        ? 'flex items-center justify-between p-3.5 rounded-lg bg-slate-800/80 border border-slate-700/60 hover:border-indigo-500/60 hover:bg-slate-800 transition group cursor-pointer'
        : 'flex items-center justify-between p-3.5 rounded-lg bg-slate-800/60 border border-slate-700/50 hover:border-slate-600 transition group';

      if (isDownloaded) {
        row.title = `Click to read ${chapter.title || 'Chapter ' + chNum}`;
        row.addEventListener('click', () => {
          window.location.href = `reader.html?id=${encodeURIComponent(novel.id)}&ch=${encodeURIComponent(chNum)}`;
        });
      }

      // Left: Chapter number badge + Chapter title
      const leftCol = document.createElement('div');
      leftCol.className = 'flex items-center gap-3 overflow-hidden flex-1 min-w-0 pr-3';

      const chBadge = document.createElement('span');
      chBadge.className = isDownloaded
        ? 'text-xs font-mono font-bold px-2.5 py-1 rounded bg-slate-900 text-indigo-300 border border-indigo-500/30 flex-shrink-0'
        : 'text-xs font-mono font-bold px-2.5 py-1 rounded bg-slate-900 text-slate-400 border border-slate-700/80 flex-shrink-0';
      chBadge.textContent = `Ch. ${chNum}`;

      const nameEl = document.createElement('span');
      nameEl.className = isDownloaded
        ? 'text-sm font-semibold text-slate-100 truncate group-hover:text-indigo-300 transition'
        : 'text-sm font-medium text-slate-300 truncate group-hover:text-slate-200 transition';
      nameEl.textContent = chapter.title || `Chapter ${chNum}`;

      leftCol.appendChild(chBadge);
      leftCol.appendChild(nameEl);

      // Right: Actions (Download button OR Saved badge + Delete button)
      const rightCol = document.createElement('div');
      rightCol.className = 'flex items-center gap-2.5 flex-shrink-0';

      if (isDownloaded) {
        const readHint = document.createElement('span');
        readHint.className = 'inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 group-hover:text-indigo-300 group-hover:translate-x-0.5 transition-all';
        readHint.innerHTML = `
          <span>Read</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="9 18 15 12 9 6"></polyline>
          </svg>
        `;

        const statusBadge = document.createElement('span');
        statusBadge.className = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20';
        statusBadge.innerHTML = `
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          Saved
        `;

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700/80 transition cursor-pointer';
        delBtn.title = `Delete Chapter ${chNum}`;
        delBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        `;

        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await window.StorageService.deleteChapter(novel.id, chNum);
          await renderChapters(currentNovel);
        });

        rightCol.appendChild(readHint);
        rightCol.appendChild(statusBadge);
        rightCol.appendChild(delBtn);
      } else {
        // Download button with downward arrow icon
        const dlBtn = document.createElement('button');
        dlBtn.type = 'button';
        dlBtn.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-600 transition shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/50';
        dlBtn.title = `Download Chapter ${chNum}`;
        dlBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <polyline points="19 12 12 19 5 12"></polyline>
          </svg>
          <span>Download</span>
        `;

        dlBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          dlBtn.disabled = true;
          dlBtn.innerHTML = `
            <svg class="animate-spin h-3.5 w-3.5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>Downloading...</span>
          `;

          try {
            await window.StorageService.downloadChapter(novel.id, chNum);
            await renderChapters(currentNovel);
          } catch (err) {
            console.error('Error downloading chapter:', err);
            dlBtn.disabled = false;
            dlBtn.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-red-500/80 hover:bg-red-500 transition shadow-sm cursor-pointer';
            dlBtn.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <polyline points="19 12 12 19 5 12"></polyline>
              </svg>
              <span>Retry</span>
            `;
          }
        });

        rightCol.appendChild(dlBtn);
      }

      if (chapter.url) {
        const linkBtn = document.createElement('a');
        linkBtn.href = chapter.url;
        linkBtn.target = '_blank';
        linkBtn.rel = 'noreferrer';
        linkBtn.className = 'p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition ml-0.5';
        linkBtn.title = 'Open chapter on web';
        linkBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        `;
        linkBtn.addEventListener('click', (e) => e.stopPropagation());
        rightCol.appendChild(linkBtn);
      }

      row.appendChild(leftCol);
      row.appendChild(rightCol);
      chaptersListEl.appendChild(row);
    });
  }

  try {
    const novel = await window.StorageService.getNovelById(novelId);
    if (!novel) {
      if (titleEl) titleEl.textContent = 'Novel Not Found';
      return;
    }

    currentNovel = novel;

    // Populate Novel Info
    document.title = `${novel.title} - QuickConverter`;
    if (titleEl) titleEl.textContent = novel.title;

    if (artworkEl) {
      artworkEl.src = novel.thumbnail || 'https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp';
      artworkEl.alt = novel.title;
      artworkEl.onerror = () => {
        artworkEl.src = 'https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp';
      };
    }

    if (domainEl) domainEl.textContent = novel.domain || 'wetriedtls.com';
    if (statusEl) statusEl.textContent = novel.status || 'Active';

    // Wire Sync Catalog button
    if (syncChaptersBtn) {
      syncChaptersBtn.addEventListener('click', async () => {
        syncChaptersBtn.disabled = true;
        syncChaptersBtn.innerHTML = `
          <svg class="animate-spin h-3.5 w-3.5 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
            <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
          </svg>
          <span>Syncing...</span>
        `;

        try {
          const updated = await window.StorageService.syncNovelChapters(currentNovel.id);
          if (updated) {
            currentNovel = updated;
          }
          await renderChapters(currentNovel);
        } catch (e) {
          console.error('Error syncing catalog:', e);
        } finally {
          syncChaptersBtn.disabled = false;
          syncChaptersBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            <span>Sync Catalog</span>
          `;
        }
      });
    }

    // Initial render
    await renderChapters(currentNovel);
  } catch (err) {
    console.error('Error loading novel details:', err);
  }
});
