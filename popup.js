document.addEventListener('DOMContentLoaded', async () => {
  // Views
  const viewMain = document.getElementById('view-main');
  const viewNovel = document.getElementById('view-novel');
  const backToMainBtn = document.getElementById('back-to-main-btn');

  // Main View Elements
  const badgeEl = document.getElementById('badge');
  const siteHostEl = document.getElementById('site-host');
  const statusMsgEl = document.getElementById('status-message');
  const statusActionEl = document.getElementById('status-action');
  const novelListEl = document.getElementById('novel-list');
  const novelCountEl = document.getElementById('novel-count');
  const openLibraryBtn = document.getElementById('open-library-btn');

  // Novel Detail View Elements
  const popupNovelThumb = document.getElementById('popup-novel-thumb');
  const popupNovelTitle = document.getElementById('popup-novel-title');
  const popupNovelDomain = document.getElementById('popup-novel-domain');
  const popupNovelStats = document.getElementById('popup-novel-stats');
  const popupChapterCount = document.getElementById('popup-chapter-count');
  const popupChapterList = document.getElementById('popup-chapter-list');
  const settingsBtn = document.getElementById('settings-btn');
  const novelSettingsBtn = document.getElementById('novel-settings-btn');

  // Settings button handlers (reserved for future functionality)
  [settingsBtn, novelSettingsBtn].forEach((btn) => {
    if (btn) {
      btn.addEventListener('click', () => {
        // Reserved for future settings view/modal
      });
    }
  });

  // --- DeepSeek Translation UI Wiring ---
  function initDeepSeekUI() {
    const toggleEl = document.getElementById('deepseek-toggle');
    const badgeEl = document.getElementById('deepseek-toggle-badge');
    const keyEl = document.getElementById('deepseek-api-key');
    const promptEl = document.getElementById('deepseek-prompt');
    const visibilityBtn = document.getElementById('toggle-key-visibility');
    const fieldsEl = document.getElementById('deepseek-config-fields');

    if (!toggleEl) return;

    const DEFAULT_PROMPT = 'Translate the novel chapter text to high-quality, fluent English. Maintain consistent character names, martial arts/cultivation terms, and literary tone.';

    const getStored = (key, fallback) => {
      try {
        const val = localStorage.getItem(key);
        return val !== null ? val : fallback;
      } catch (e) {
        return fallback;
      }
    };

    const setStored = (key, val) => {
      try {
        localStorage.setItem(key, val);
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ [key]: val });
        }
      } catch (e) {}
    };

    const isEnabled = getStored('quickconverter_deepseek_enabled', 'false') === 'true';
    const savedKey = getStored('quickconverter_deepseek_key', '');
    const savedPrompt = getStored('quickconverter_deepseek_prompt', DEFAULT_PROMPT);

    toggleEl.checked = isEnabled;
    if (keyEl) keyEl.value = savedKey;
    if (promptEl) promptEl.value = savedPrompt;

    function updateState(checked) {
      if (badgeEl) {
        if (checked) {
          badgeEl.textContent = 'Active (Translates on Download)';
          badgeEl.className = 'text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/30';
        } else {
          badgeEl.textContent = 'Off (Save Raw)';
          badgeEl.className = 'text-[10px] font-medium px-1.5 py-0.5 rounded bg-slate-700 text-slate-300 border border-slate-600';
        }
      }
      if (fieldsEl) {
        fieldsEl.className = checked
          ? 'flex flex-col gap-2 pt-2 border-t border-indigo-500/30 transition-all opacity-100'
          : 'flex flex-col gap-2 pt-2 border-t border-slate-700/60 transition-all opacity-60';
      }
    }

    updateState(isEnabled);

    toggleEl.addEventListener('change', () => {
      const checked = toggleEl.checked;
      setStored('quickconverter_deepseek_enabled', checked ? 'true' : 'false');
      updateState(checked);
    });

    if (keyEl) {
      keyEl.addEventListener('input', () => {
        setStored('quickconverter_deepseek_key', keyEl.value.trim());
      });
    }

    if (promptEl) {
      promptEl.addEventListener('input', () => {
        setStored('quickconverter_deepseek_prompt', promptEl.value);
      });
    }

    if (visibilityBtn && keyEl) {
      visibilityBtn.addEventListener('click', () => {
        const isPassword = keyEl.type === 'password';
        keyEl.type = isPassword ? 'text' : 'password';
        visibilityBtn.textContent = isPassword ? 'Hide' : 'Show';
      });
    }
  }

  initDeepSeekUI();

  // --- Novel & URL Detection Helpers ---
  function formatSlugToTitle(slug) {
    if (!slug) return '';
    return slug
      .split('-')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')
      .replace(/\bRegressors\b/i, "Regressor’s")
      .replace(/\bAcademys\b/i, "Academy’s");
  }

  function extractNovelInfo(urlStr, pageTitle) {
    if (!urlStr) return null;
    try {
      if (typeof ProviderRegistry === 'undefined') return null;
      const provider = ProviderRegistry.getProviderForUrl(urlStr);
      if (!provider) return null;

      const parsed = provider.parseUrl(urlStr);
      if (!parsed || !parsed.slug) return null;

      let title = '';
      if (pageTitle && typeof pageTitle === 'string') {
        const parts = pageTitle.split('-');
        if (parts.length > 0 && !parts[0].toLowerCase().includes('just a moment')) {
          title = parts[0].trim();
        }
      }
      title = provider.formatTitle(parsed.slug, title);

      return {
        slug: parsed.slug,
        title: title || formatSlugToTitle(parsed.slug),
        chapterNumber: parsed.chapterNumber,
        url: parsed.seriesUrl || urlStr,
        domain: provider.domains ? provider.domains[0] : (new URL(urlStr).hostname),
        icon: '📚',
        providerName: provider.name
      };
    } catch (e) {
      console.warn('Error parsing novel URL:', e);
    }
    return null;
  }

  // --- Query Active Tab ---
  let currentUrl = null;
  let tabTitle = '';

  if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        currentUrl = tab.url;
        tabTitle = tab.title || '';
      }
    } catch (e) {
      console.warn('Unable to query active tab:', e);
    }
  } else {
    currentUrl = window.location.href;
    tabTitle = document.title;
  }

  // --- View Switching ---
  function showMainView() {
    if (viewNovel) viewNovel.classList.add('hidden');
    if (viewMain) viewMain.classList.remove('hidden');
    refreshNovelsList();
    checkCurrentPageStatus();
  }

  async function showNovelDetailView(novelId) {
    if (!window.StorageService || !novelId) return;

    const novel = await window.StorageService.getNovelById(novelId);
    if (!novel) return;

    if (viewMain) viewMain.classList.add('hidden');
    if (viewNovel) viewNovel.classList.remove('hidden');

    // Populate Novel Info
    if (popupNovelTitle) popupNovelTitle.textContent = novel.title;
    if (popupNovelDomain) popupNovelDomain.textContent = novel.domain || 'wetriedtls.com';
    if (popupNovelThumb) {
      popupNovelThumb.src = novel.thumbnail || 'https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp';
      popupNovelThumb.alt = novel.title;
    }

    // Load and render chapters
    await renderPopupChapters(novel);
  }

  async function renderPopupChapters(novel) {
    if (!window.StorageService || !novel) return;

    let chaptersCatalog = novel.chapterList || [];

    // If chapter catalog is empty but novel has slug/provider, fetch catalog
    if (chaptersCatalog.length === 0 && novel.slug) {
      if (popupChapterList) {
        popupChapterList.innerHTML = `
          <div class="p-5 rounded-md bg-slate-800/60 border border-slate-700/50 text-center text-xs text-indigo-300 flex items-center justify-center gap-2">
            <svg class="animate-spin h-4 w-4 text-indigo-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>Loading chapter catalog...</span>
          </div>
        `;
      }
      const updated = await window.StorageService.syncNovelChapters(novel.id);
      if (updated && updated.chapterList && updated.chapterList.length > 0) {
        novel = updated;
        chaptersCatalog = novel.chapterList;
      }
    }

    const downloadedChapters = await window.StorageService.getNovelChapters(novel.id);
    const downloadedMap = new Map(downloadedChapters.map((c) => [Number(c.chapterNumber), c]));

    const totalChapters = novel.totalChapters || chaptersCatalog.length || 100;

    if (popupNovelStats) {
      popupNovelStats.textContent = `${downloadedChapters.length} / ${totalChapters} chapters downloaded`;
    }

    // Display items: use catalog if available; otherwise use downloaded chapters
    const displayList = chaptersCatalog.length > 0
      ? chaptersCatalog
      : downloadedChapters;

    if (popupChapterCount) {
      popupChapterCount.textContent = `${displayList.length} Chapters`;
    }

    if (!popupChapterList) return;

    if (displayList.length === 0) {
      popupChapterList.innerHTML = `
        <div class="p-5 rounded-md bg-slate-800/60 border border-slate-700/50 text-center text-xs text-slate-500 italic">
          No chapters discovered yet.
        </div>
      `;
      return;
    }

    popupChapterList.innerHTML = '';

    displayList.forEach((chapter) => {
      const chNum = Number(chapter.chapterNumber);
      const isDownloaded = downloadedMap.has(chNum);

      const row = document.createElement('div');
      row.className = isDownloaded
        ? 'flex items-center justify-between p-2 rounded-md bg-slate-800 border border-slate-700/80 hover:border-indigo-500/60 transition group cursor-pointer'
        : 'flex items-center justify-between p-2 rounded-md bg-slate-800 border border-slate-700/80 hover:border-slate-600 transition group';

      if (isDownloaded) {
        row.title = `Click to read ${chapter.title || 'Chapter ' + chNum}`;
        row.addEventListener('click', () => {
          const readerUrl = chrome.runtime && chrome.runtime.getURL
            ? chrome.runtime.getURL(`reader.html?id=${encodeURIComponent(novel.id)}&ch=${encodeURIComponent(chNum)}`)
            : `reader.html?id=${encodeURIComponent(novel.id)}&ch=${encodeURIComponent(chNum)}`;
          if (chrome.tabs && chrome.tabs.create) {
            chrome.tabs.create({ url: readerUrl });
          } else {
            window.open(readerUrl, '_blank');
          }
        });
      }

      // Left: Chapter number badge and chapter title/name
      const leftSection = document.createElement('div');
      leftSection.className = 'flex items-center gap-2 overflow-hidden flex-1 min-w-0 pr-2';

      const chBadge = document.createElement('span');
      chBadge.className = isDownloaded
        ? 'text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 text-indigo-300 border border-indigo-500/30 flex-shrink-0'
        : 'text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-700/80 flex-shrink-0';
      chBadge.textContent = `Ch. ${chNum}`;

      const nameEl = document.createElement('span');
      nameEl.className = isDownloaded
        ? 'text-xs font-medium text-slate-100 truncate group-hover:text-indigo-300 transition'
        : 'text-xs font-medium text-slate-300 truncate group-hover:text-slate-200 transition';
      nameEl.textContent = chapter.title || `Chapter ${chNum}`;

      leftSection.appendChild(chBadge);
      leftSection.appendChild(nameEl);

      // Right: Action area (Download downward arrow button OR Saved badge + Delete button)
      const rightSection = document.createElement('div');
      rightSection.className = 'flex items-center gap-1.5 flex-shrink-0';

      if (isDownloaded) {
        const readHint = document.createElement('span');
        readHint.className = 'text-[10px] font-semibold text-indigo-400 group-hover:text-indigo-300 transition';
        readHint.textContent = 'Read';

        const savedBadge = document.createElement('span');
        savedBadge.className = 'text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20';
        savedBadge.textContent = 'Saved';

        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700/80 transition focus:outline-none cursor-pointer flex-shrink-0';
        delBtn.title = `Delete Chapter ${chNum}`;
        delBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        `;

        delBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await window.StorageService.deleteChapter(novel.id, chNum);
          await renderPopupChapters(novel);
        });

        rightSection.appendChild(readHint);
        rightSection.appendChild(savedBadge);
        rightSection.appendChild(delBtn);
      } else {
        // Download button with downward arrow icon
        const dlBtn = document.createElement('button');
        dlBtn.type = 'button';
        dlBtn.className = 'p-1.5 rounded text-indigo-400 hover:text-white hover:bg-indigo-600/80 bg-slate-700/60 transition focus:outline-none cursor-pointer flex-shrink-0 flex items-center justify-center';
        dlBtn.title = `Download Chapter ${chNum}`;
        dlBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <polyline points="19 12 12 19 5 12"></polyline>
          </svg>
        `;

        dlBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          dlBtn.disabled = true;
          dlBtn.innerHTML = `
            <svg class="animate-spin h-3.5 w-3.5 text-indigo-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
          `;

          try {
            await window.StorageService.downloadChapter(novel.id, chNum);
            await renderPopupChapters(novel);
          } catch (err) {
            console.error('Error downloading chapter:', err);
            dlBtn.disabled = false;
            dlBtn.classList.add('text-red-400');
            dlBtn.innerHTML = `
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"></line>
                <polyline points="19 12 12 19 5 12"></polyline>
              </svg>
            `;
          }
        });

        rightSection.appendChild(dlBtn);
      }

      row.appendChild(leftSection);
      row.appendChild(rightSection);
      popupChapterList.appendChild(row);
    });
  }

  // --- Render Managed Novels List in Main View ---
  function renderNovels(novels) {
    if (!novelListEl || !novelCountEl) return;

    novelCountEl.textContent = `${novels.length} Novel${novels.length === 1 ? '' : 's'}`;
    novelListEl.innerHTML = '';

    if (novels.length === 0) {
      const emptyCard = document.createElement('div');
      emptyCard.className = 'p-5 rounded-md bg-slate-800/60 border border-slate-700/50 text-center text-xs text-slate-500 italic';
      emptyCard.textContent = 'No novels currently managed.';
      novelListEl.appendChild(emptyCard);
      return;
    }

    novels.forEach((novel) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'flex items-center justify-between p-2.5 rounded-md bg-slate-800 border border-slate-700/80 hover:border-indigo-500/60 transition group cursor-pointer';
      itemEl.title = `Click to view chapters for ${novel.title}`;

      // Clicking novel item navigates into the in-popup novel view
      itemEl.addEventListener('click', () => {
        showNovelDetailView(novel.id);
      });

      const leftSection = document.createElement('div');
      leftSection.className = 'flex items-center gap-2.5 overflow-hidden flex-1 min-w-0 pr-2';

      const iconBox = document.createElement('div');
      iconBox.className = 'w-8 h-8 rounded bg-slate-700/80 border border-slate-600/50 flex items-center justify-center flex-shrink-0 text-base';
      iconBox.textContent = novel.icon || '📖';

      const textContainer = document.createElement('div');
      textContainer.className = 'flex flex-col overflow-hidden min-w-0';

      const titleEl = document.createElement('span');
      titleEl.className = 'text-sm font-medium text-slate-200 group-hover:text-indigo-300 transition truncate';
      titleEl.textContent = novel.title;

      const subEl = document.createElement('span');
      subEl.className = 'text-xs text-slate-400 truncate';
      const chText = novel.totalChapters ? `${novel.totalChapters} Chs &bull; ` : '';
      subEl.innerHTML = `${chText}${novel.domain || 'wetriedtls.com'} &bull; ${novel.status || 'Active'}`;

      textContainer.appendChild(titleEl);
      textContainer.appendChild(subEl);
      leftSection.appendChild(iconBox);
      leftSection.appendChild(textContainer);

      const rightSection = document.createElement('div');
      rightSection.className = 'flex items-center gap-2 flex-shrink-0';

      const statusBadge = document.createElement('span');
      statusBadge.className = 'inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20';
      statusBadge.textContent = novel.status || 'Active';

      // Delete novel button
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700/80 transition focus:outline-none cursor-pointer flex-shrink-0';
      deleteBtn.title = `Delete ${novel.title}`;
      deleteBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          <line x1="10" y1="11" x2="10" y2="17"></line>
          <line x1="14" y1="11" x2="14" y2="17"></line>
        </svg>
      `;

      deleteBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (window.StorageService) {
          const updatedNovels = await window.StorageService.deleteNovel(novel.id);
          renderNovels(updatedNovels);
          checkCurrentPageStatus();
        }
      });

      rightSection.appendChild(statusBadge);
      rightSection.appendChild(deleteBtn);

      itemEl.appendChild(leftSection);
      itemEl.appendChild(rightSection);
      novelListEl.appendChild(itemEl);
    });
  }

  async function refreshNovelsList() {
    if (window.StorageService) {
      try {
        const novels = await window.StorageService.getManagedNovels();
        renderNovels(novels);
      } catch (err) {
        console.error('Failed to load managed novels:', err);
      }
    }
  }

  // --- Evaluate & Render Current Page Status ---
  async function checkCurrentPageStatus() {
    const novelInfo = extractNovelInfo(currentUrl, tabTitle);

    if (novelInfo) {
      siteHostEl.textContent = novelInfo.domain || 'wetriedtls.com';
      const novel = window.StorageService
        ? await window.StorageService.getNovelBySlug(novelInfo.slug)
        : null;

      const isAlreadyManaged = !!novel;

      // Case: Visiting a specific Chapter page
      if (novelInfo.chapterNumber !== null) {
        statusActionEl.innerHTML = '';
        statusActionEl.classList.add('hidden');

        let isChapterSaved = false;
        if (novel) {
          isChapterSaved = await window.StorageService.isChapterSaved(novel.id, novelInfo.chapterNumber);
        }

        if (isChapterSaved) {
          badgeEl.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
          badgeEl.innerHTML = `
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            Chapter Saved
          `;
          statusMsgEl.innerHTML = `
            <p class="font-medium text-slate-100 truncate">${novel.title}</p>
            <p class="text-xs text-emerald-400/90 mt-0.5">Chapter ${novelInfo.chapterNumber} is saved in QuickConverterDB.</p>
          `;
        } else {
          badgeEl.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30';
          badgeEl.innerHTML = `
            <span class="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
            Chapter Loading
          `;
          statusMsgEl.innerHTML = `
            <p class="font-medium text-slate-100 truncate">${novel ? novel.title : novelInfo.title}</p>
            <p class="text-xs text-slate-400 mt-0.5">Chapter ${novelInfo.chapterNumber} is being checked/saved.</p>
          `;
        }
        return;
      }

      // Case: Visiting Series Overview page
      if (isAlreadyManaged) {
        badgeEl.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
        badgeEl.innerHTML = `
          <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          Already Managed
        `;
        statusMsgEl.innerHTML = `
          <p class="font-medium text-slate-100 truncate">${novel.title}</p>
          <p class="text-xs text-emerald-400/90 mt-0.5">${novel.totalChapters ? novel.totalChapters + ' Total Chapters &bull; ' : ''}Already under management.</p>
        `;
        statusActionEl.innerHTML = '';
        statusActionEl.classList.add('hidden');

        // Background metadata sync
        if (window.StorageService && novel.slug) {
          window.StorageService.syncNovelMetadata(novel.slug).then((synced) => {
            if (synced && synced.totalChapters !== novel.totalChapters) {
              refreshNovelsList();
            }
          }).catch(() => {});
        }
      } else {
        badgeEl.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30';
        badgeEl.innerHTML = `
          <span class="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
          Novel Detected
        `;
        statusMsgEl.innerHTML = `
          <p class="font-medium text-slate-100 truncate">${novelInfo.title}</p>
          <p class="text-xs text-slate-400 mt-0.5">This novel is not managed yet.</p>
        `;

        statusActionEl.innerHTML = `
          <button
            id="add-novel-btn"
            type="button"
            class="w-full cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-white bg-indigo-500 transition hover:bg-indigo-600 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-sm flex items-center justify-center gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Manage This Novel</span>
          </button>
        `;
        statusActionEl.classList.remove('hidden');

        const addBtn = document.getElementById('add-novel-btn');
        if (addBtn) {
          addBtn.addEventListener('click', async () => {
            if (window.StorageService) {
              addBtn.disabled = true;
              addBtn.innerHTML = `
                <svg class="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
                <span>Populating Chapters...</span>
              `;

              await window.StorageService.addNovel(novelInfo);
              if (novelInfo.slug) {
                await Promise.all([
                  window.StorageService.syncNovelMetadata(novelInfo.slug),
                  window.StorageService.syncNovelChapters(novelInfo.slug)
                ]);
              }
              const latest = await window.StorageService.getManagedNovels();
              renderNovels(latest);
              checkCurrentPageStatus();
            }
          });
        }
      }
      return;
    }

    // Check if on a supported provider homepage or domain
    let matchedProvider = null;
    let hostname = '';
    if (currentUrl) {
      try {
        const parsed = new URL(currentUrl);
        hostname = parsed.hostname;
        if (typeof ProviderRegistry !== 'undefined') {
          matchedProvider = ProviderRegistry.getProviderForUrl(currentUrl);
          if (!matchedProvider) {
            matchedProvider = ProviderRegistry.getProviderForDomain(hostname);
          }
        }
      } catch (e) {}
    }

    statusActionEl.innerHTML = '';
    statusActionEl.classList.add('hidden');

    if (matchedProvider) {
      badgeEl.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
      badgeEl.innerHTML = `
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
        Supported Site
      `;
      siteHostEl.textContent = matchedProvider.domains[0] || hostname;
      statusMsgEl.innerHTML = `
        <p class="font-medium text-slate-100">QuickConverter supports <span class="text-indigo-300 font-semibold">${matchedProvider.name}</span>.</p>
        <p class="text-xs text-slate-400 mt-1">Open any novel series to manage it.</p>
      `;
    } else {
      badgeEl.className = 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-700/60 text-slate-400 border border-slate-600/40';
      badgeEl.textContent = 'Standard Mode';
      siteHostEl.textContent = hostname || 'Browser Tab';
      const supportedSites = (typeof ProviderRegistry !== 'undefined') 
        ? ProviderRegistry.getAllProviders().map((p) => p.name).join(', ')
        : 'We Tried TLS';
      statusMsgEl.innerHTML = `
        <p class="text-slate-300">QuickConverter supports <span class="text-indigo-300 font-medium">${supportedSites}</span>.</p>
        <p class="text-xs text-slate-500 mt-1">Visit a supported novel series to add it.</p>
      `;
    }
  }

  // --- Header Navigation & Open Library ---
  if (backToMainBtn) {
    backToMainBtn.addEventListener('click', () => {
      showMainView();
    });
  }

  if (openLibraryBtn) {
    openLibraryBtn.addEventListener('click', () => {
      const url = chrome.runtime && chrome.runtime.getURL ? chrome.runtime.getURL('library.html') : 'library.html';
      if (chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url });
      } else {
        window.open(url, '_blank');
      }
    });
  }

  // Initial Load
  await refreshNovelsList();
  checkCurrentPageStatus();
});
