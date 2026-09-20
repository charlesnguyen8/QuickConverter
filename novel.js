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

  if (!novelId || !window.StorageService) {
    if (titleEl) titleEl.textContent = 'Novel Not Found';
    return;
  }

  try {
    const novel = await window.StorageService.getNovelById(novelId);

    if (!novel) {
      if (titleEl) titleEl.textContent = 'Novel Not Found';
      return;
    }

    // Populate Novel Info
    document.title = `${novel.title} - QuickConverter`;
    titleEl.textContent = novel.title;

    if (artworkEl) {
      artworkEl.src = novel.thumbnail || 'https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp';
      artworkEl.alt = novel.title;
      artworkEl.onerror = () => {
        artworkEl.src = 'https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp';
      };
    }

    if (domainEl) domainEl.textContent = novel.domain || 'wetriedtls.com';
    if (statusEl) statusEl.textContent = novel.status || 'Active';

    // Fetch Chapters
    const chapters = await window.StorageService.getNovelChapters(novel.id);
    const totalChapters = novel.totalChapters || 100;
    const downloadedCount = chapters.length;
    const percent = totalChapters > 0 ? Math.min(100, Math.round((downloadedCount / totalChapters) * 100)) : 0;

    // Update Stats
    if (chaptersStatEl) chaptersStatEl.textContent = `${downloadedCount} / ${totalChapters}`;
    if (progressBarEl) progressBarEl.style.width = `${percent}%`;
    if (totalChaptersLabel) totalChaptersLabel.textContent = `${totalChapters} Total Chapters`;
    if (progressPercentEl) progressPercentEl.textContent = `${percent}%`;
    if (chaptersBadgeEl) chaptersBadgeEl.textContent = `${chapters.length} Saved`;

    // Render Chapters List
    if (!chaptersListEl) return;

    if (chapters.length === 0) {
      chaptersListEl.innerHTML = `
        <div class="p-8 rounded-lg bg-slate-800/40 border border-slate-700/50 text-center flex flex-col items-center justify-center gap-2">
          <div class="text-2xl">📖</div>
          <p class="text-sm font-medium text-slate-300">No chapters downloaded yet.</p>
          <p class="text-xs text-slate-500 max-w-sm">
            Visit any chapter of this novel on wetriedtls.com and QuickConverter will automatically save it.
          </p>
        </div>
      `;
      return;
    }

    chaptersListEl.innerHTML = '';

    chapters.forEach((chapter) => {
      const row = document.createElement('div');
      row.className = 'flex items-center justify-between p-3.5 rounded-lg bg-slate-800/80 border border-slate-700/60 hover:border-slate-600 transition group';

      // Left: Chapter number badge + Chapter title / name
      const leftCol = document.createElement('div');
      leftCol.className = 'flex items-center gap-3 overflow-hidden flex-1 min-w-0 pr-3';

      const chBadge = document.createElement('span');
      chBadge.className = 'text-xs font-mono font-bold px-2.5 py-1 rounded bg-slate-900 text-indigo-300 border border-slate-700/80 flex-shrink-0';
      chBadge.textContent = `Ch. ${chapter.chapterNumber}`;

      const nameEl = document.createElement('span');
      nameEl.className = 'text-sm font-semibold text-slate-200 truncate group-hover:text-indigo-300 transition';
      nameEl.textContent = chapter.title || `Chapter ${chapter.chapterNumber}`;

      leftCol.appendChild(chBadge);
      leftCol.appendChild(nameEl);

      // Right: Downloaded badge and link to open source on web
      const rightCol = document.createElement('div');
      rightCol.className = 'flex items-center gap-2.5 flex-shrink-0';

      const statusBadge = document.createElement('span');
      statusBadge.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20';
      statusBadge.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        Saved
      `;

      rightCol.appendChild(statusBadge);

      if (chapter.url) {
        const linkBtn = document.createElement('a');
        linkBtn.href = chapter.url;
        linkBtn.target = '_blank';
        linkBtn.rel = 'noreferrer';
        linkBtn.className = 'p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition';
        linkBtn.title = 'View on wetriedtls.com';
        linkBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            <polyline points="15 3 21 3 21 9"></polyline>
            <line x1="10" y1="14" x2="21" y2="3"></line>
          </svg>
        `;
        rightCol.appendChild(linkBtn);
      }

      row.appendChild(leftCol);
      row.appendChild(rightCol);
      chaptersListEl.appendChild(row);
    });
  } catch (err) {
    console.error('Error loading novel details:', err);
  }
});
