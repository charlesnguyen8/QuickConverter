document.addEventListener('DOMContentLoaded', async () => {
  // Novel Detail View Elements. The main view now lives in React
  // (components/react/PopupApp.jsx); this script still owns the detail view
  // and drives visibility through the window.__popupShow* hooks.
  const popupNovelThumb = document.getElementById('popup-novel-thumb');
  const popupNovelTitle = document.getElementById('popup-novel-title');
  const popupNovelDomain = document.getElementById('popup-novel-domain');
  const popupNovelStats = document.getElementById('popup-novel-stats');
  const popupChapterCount = document.getElementById('popup-chapter-count');
  const popupChapterList = document.getElementById('popup-chapter-list');
  const popupDownloadAllBtn = document.getElementById('popup-download-all-btn');
  const novelSettingsBtn = document.getElementById('novel-settings-btn');

  function openSettings() {
    const settingsUrl =
      typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
        ? chrome.runtime.getURL('views/settings.html')
        : 'settings.html';
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: settingsUrl });
    } else {
      window.open(settingsUrl, '_blank');
    }
  }

  function openLibrary() {
    const url =
      typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
        ? chrome.runtime.getURL('views/library.html')
        : 'library.html';
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url });
    } else {
      window.open(url, '_blank');
    }
  }

  if (novelSettingsBtn) novelSettingsBtn.addEventListener('click', openSettings);

  window.__popupActions = {
    openNovel: (id) => showNovelDetailView(id),
    onNovelsChanged: () => {
      console.log('[popup.js] onNovelsChanged');
      checkCurrentPageStatus();
    },
    openLibrary,
    openSettings
  };

  // --- DeepSeek Translation UI Wiring ---
  let currentActiveNovel = null;
  let aiConfigPanel = null;

  function initDeepSeekUI() {
    if (!window.AiConfigPanel || typeof window.AiConfigPanel.create !== 'function') {
      console.warn('[popup.js] AiConfigPanel module not loaded; DeepSeek panel disabled.');
      return;
    }

    aiConfigPanel = window.AiConfigPanel.create({
      variant: 'compact',
      ids: {
        toggle: 'deepseek-toggle',
        toggleBadge: 'deepseek-toggle-badge',
        providerBadge: 'popup-provider-badge',
        providerBtnOfficial: 'popup-provider-btn-official',
        providerBtnCustom: 'popup-provider-btn-custom',
        customRow: 'popup-custom-api-row',
        customUrl: 'popup-custom-base-url',
        presetBtn: 'popup-bridge-preset-btn',
        testCustomBtn: 'popup-test-custom-btn',
        testCustomStatus: 'popup-custom-test-status',
        apiKeyLabel: 'popup-api-key-label',
        apiKey: 'deepseek-api-key',
        rememberKey: 'remember-deepseek-key',
        clearKeyBtn: 'clear-deepseek-btn',
        prompt: 'deepseek-prompt',
        visibilityBtn: 'toggle-key-visibility',
        fields: 'deepseek-config-fields',
        editPromptBtn: 'edit-prompt-btn',
        modelSelect: 'deepseek-model-select',
        testBtn: 'test-deepseek-btn',
        testStatus: 'deepseek-test-status',
        balanceBadge: 'deepseek-balance-badge',
        balanceText: 'deepseek-balance-text',
        refreshBalanceBtn: 'deepseek-refresh-balance-btn',
        refreshBalanceIcon: 'deepseek-refresh-balance-icon',
        pricingBadge: 'deepseek-pricing-badge',
        cooldownToggle: 'popup-cooldown-toggle',
        cooldownToggleLabel: 'popup-cooldown-toggle-label',
        cooldownBadge: 'popup-cooldown-badge'
      },
      hooks: {
        getPrompt: () => (currentActiveNovel && currentActiveNovel.translationPrompt) || null,
        savePrompt: async (text) => {
          if (!currentActiveNovel) return;
          currentActiveNovel.translationPrompt = text;
          if (window.StorageService && typeof window.StorageService.updateNovel === 'function') {
            await window.StorageService.updateNovel(currentActiveNovel.id, { translationPrompt: text });
          }
        }
      }
    });

    if (aiConfigPanel) aiConfigPanel.refresh();
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

  // --- View Switching (visibility is owned by the React PopupApp) ---
  let isDetailView = false;

  function showMainView() {
    console.log('[popup.js] showMainView');
    isDetailView = false;
    if (window.__popupShowMain) window.__popupShowMain();
    refreshNovelsList();
    checkCurrentPageStatus();
  }

  async function showNovelDetailView(novelId) {
    console.log('[popup.js] showNovelDetailView', novelId);
    if (!window.StorageService || !novelId) return;

    const novel = await window.StorageService.getNovelById(novelId);
    if (!novel) return;

    isDetailView = true;
    if (window.__popupShowNovel) window.__popupShowNovel();

    // Populate Novel Info
    if (popupNovelTitle) popupNovelTitle.textContent = novel.title;
    if (popupNovelDomain) popupNovelDomain.textContent = novel.domain || 'wetriedtls.com';
    if (popupNovelThumb) {
      popupNovelThumb.src = novel.thumbnail || 'https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp';
      popupNovelThumb.alt = novel.title;
    }

    // Populate Novel Translation Prompt
    currentActiveNovel = novel;
    if (aiConfigPanel) {
      aiConfigPanel.setPrompt(currentActiveNovel.translationPrompt || undefined);
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
        currentActiveNovel = updated;
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

    if (popupDownloadAllBtn) {
      const queueService = (typeof window !== 'undefined' && window.DownloadQueueService);
      const unqueuedMissingCount = chaptersCatalog.filter((c) => {
        const chNum = Number(c.chapterNumber !== undefined ? c.chapterNumber : c.number);
        if (downloadedMap.has(chNum)) return false;
        if (queueService && typeof queueService.isQueued === 'function') {
          if (queueService.isQueued(novel.id, chNum)) return false;
        }
        return true;
      }).length;

      if (chaptersCatalog.length === 0 || unqueuedMissingCount === 0) {
        popupDownloadAllBtn.classList.add('opacity-50', 'pointer-events-none');
        popupDownloadAllBtn.title = 'All chapters are already downloaded or queued';
      } else {
        popupDownloadAllBtn.classList.remove('opacity-50', 'pointer-events-none');
        popupDownloadAllBtn.title = `Download and translate all ${unqueuedMissingCount} missing chapters`;
      }
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
            ? chrome.runtime.getURL(`views/reader.html?id=${encodeURIComponent(novel.id)}&ch=${encodeURIComponent(chNum)}`)
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

        const downloadedChapter = downloadedMap.get(chNum);
        if (downloadedChapter && downloadedChapter.translationCost && downloadedChapter.translationCost.formattedCost) {
          const costBadge = document.createElement('span');
          costBadge.className = 'text-[10px] font-mono font-medium px-1 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20';
          costBadge.textContent = downloadedChapter.translationCost.formattedCost;
          costBadge.title = `Translation Cost: ${downloadedChapter.translationCost.formattedCost} USD • ${downloadedChapter.translationCost.ratePeriod}`;
          rightSection.appendChild(costBadge);
        }

        rightSection.appendChild(delBtn);
      } else {
        const queueService = (typeof window !== 'undefined' && window.DownloadQueueService) ||
          (typeof globalThis !== 'undefined' && globalThis.DownloadQueueService);
        const qStatus = queueService && typeof queueService.getChapterStatus === 'function'
          ? queueService.getChapterStatus(novel.id, chNum)
          : null;

        if (qStatus && qStatus.status === 'processing') {
          const percent = qStatus.progress?.percent !== undefined ? qStatus.progress.percent : 10;
          const ringHtml = (typeof window !== 'undefined' && typeof window.renderProgressRing === 'function')
            ? window.renderProgressRing(percent, 16, 2.5, false)
            : `
            <svg class="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>`;

          const activeBtn = document.createElement('button');
          activeBtn.type = 'button';
          activeBtn.className = 'px-1.5 py-1 rounded text-[10px] font-mono font-semibold text-indigo-200 bg-indigo-600/40 hover:bg-rose-600 hover:text-white transition cursor-pointer flex-shrink-0 flex items-center gap-1 group/pactive';
          activeBtn.title = `Translating (${percent}%)... Click to cancel.`;
          activeBtn.dataset.activeChapter = String(chNum);
          activeBtn.innerHTML = `
            <span class="popup-active-ring-container flex items-center justify-center">${ringHtml}</span>
            <span class="popup-active-text group-hover/pactive:hidden">${percent}%</span>
            <span class="hidden group-hover/pactive:inline font-bold">✕</span>
          `;
          activeBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (queueService) await queueService.remove(`${novel.id}_ch${chNum}`);
          });
          rightSection.appendChild(activeBtn);
        } else if (qStatus && qStatus.status === 'retry_pending') {
          const retryBtn = document.createElement('button');
          retryBtn.type = 'button';
          retryBtn.className = 'px-1.5 py-1 rounded text-[10px] font-mono text-rose-300 bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 transition cursor-pointer flex items-center gap-1';
          retryBtn.title = `Retry Pending (Attempt ${qStatus.retryCount || 1}). Click to retry now.`;
          retryBtn.innerHTML = `
            <span>🔄 Retry</span>
            <span class="font-bold text-rose-300">⚡</span>
          `;
          retryBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (queueService) {
              if (typeof queueService.retryNow === 'function') {
                await queueService.retryNow();
              } else if (typeof queueService.skipCooldown === 'function') {
                await queueService.skipCooldown();
              }
            }
          });
          rightSection.appendChild(retryBtn);
        } else if (qStatus && qStatus.status === 'queued') {
          const queuedBtn = document.createElement('button');
          queuedBtn.type = 'button';
          queuedBtn.className = 'px-1.5 py-1 rounded text-[10px] font-mono text-amber-300 bg-amber-500/15 border border-amber-500/30 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/40 transition cursor-pointer flex items-center gap-1';
          queuedBtn.title = `Queued (#${qStatus.queuePosition}). Click to remove from queue.`;
          queuedBtn.innerHTML = `
            <span>⏳#${qStatus.queuePosition}</span>
            <span class="font-bold">✕</span>
          `;
          queuedBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (queueService) await queueService.remove(`${novel.id}_ch${chNum}`);
          });
          rightSection.appendChild(queuedBtn);
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

            const toggleEl = document.getElementById('deepseek-toggle');
            const keyEl = document.getElementById('deepseek-api-key');
            const promptEl = document.getElementById('deepseek-prompt');
            const modelSelectEl = document.getElementById('deepseek-model-select');

            const isTranslationEnabled = !!(toggleEl && toggleEl.checked);
            let apiKey = keyEl ? keyEl.value.trim() : '';
            const selectedModel = (modelSelectEl && modelSelectEl.value) || 'deepseek-flash';

            const deepseek = (typeof window !== 'undefined' && window.DeepSeekService) ||
              (typeof DeepSeekService !== 'undefined' && DeepSeekService);

            let curProvConfig = { provider: 'official', customUrl: 'http://127.0.0.1:8000/v1' };
            if (deepseek && typeof deepseek.getProviderConfig === 'function') {
              try {
                curProvConfig = await deepseek.getProviderConfig();
              } catch (e) {}
            }
            const isCustomMode = curProvConfig.provider !== 'official';
            const customUrlInputEl = document.getElementById('popup-custom-base-url');
            const effectiveCustomUrl = customUrlInputEl ? (customUrlInputEl.value.trim() || curProvConfig.customUrl || 'http://127.0.0.1:8000/v1') : (curProvConfig.customUrl || 'http://127.0.0.1:8000/v1');

            if (isTranslationEnabled && !apiKey) {
              if (isCustomMode) {
                apiKey = 'sk-local';
              } else if (deepseek && typeof deepseek.getApiKey === 'function') {
                try {
                  const stored = await deepseek.getApiKey();
                  if (stored && stored.apiKey) {
                    apiKey = stored.apiKey.trim();
                    if (keyEl) keyEl.value = apiKey;
                    const clearKeyBtn = document.getElementById('clear-deepseek-btn');
                    if (clearKeyBtn) clearKeyBtn.classList.remove('hidden');
                  }
                } catch (e) {}
              }
            }

            if (isTranslationEnabled && !apiKey && !isCustomMode) {
              if (keyEl) {
                keyEl.focus();
                keyEl.classList.add('border-rose-500', 'ring-1', 'ring-rose-500/50');
                setTimeout(() => {
                  keyEl.classList.remove('border-rose-500', 'ring-1', 'ring-rose-500/50');
                }, 2500);
              }
              alert('Please enter your DeepSeek API Key before translating.');
              return;
            }

            const popupCooldownToggleEl = document.getElementById('popup-cooldown-toggle');
            const isCooldownActive = popupCooldownToggleEl ? popupCooldownToggleEl.checked : true;
            const options = {
              cooldown: isCooldownActive,
              translation: {
                enabled: isTranslationEnabled,
                cooldown: isCooldownActive,
                apiKey: apiKey || (isCustomMode ? 'sk-local' : ''),
                prompt: promptEl ? promptEl.value : '',
                model: selectedModel,
                provider: curProvConfig.provider,
                baseUrl: isCustomMode ? effectiveCustomUrl : undefined
              }
            };

            if (queueService && typeof queueService.enqueue === 'function') {
              await queueService.enqueue({
                novelId: novel.id,
                novelTitle: novel.title,
                chapterNumber: chNum,
                chapterTitle: chapter.title || `Chapter ${chNum}`,
                options
              });
              await renderPopupChapters(novel);
            } else {
              dlBtn.disabled = true;
              dlBtn.innerHTML = `
                <svg class="animate-spin h-3.5 w-3.5 text-indigo-300" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
                </svg>
              `;

              try {
                await window.StorageService.downloadChapter(novel.id, chNum, options);
        if (aiConfigPanel && isTranslationEnabled && !isCustomMode) {
          aiConfigPanel.refreshBalance(true);
        }
                await renderPopupChapters(novel);
              } catch (err) {
                console.error('Error downloading chapter:', err);
                dlBtn.disabled = false;
                dlBtn.classList.add('text-red-400');
                dlBtn.title = err.message || 'Error downloading chapter';
                dlBtn.innerHTML = `
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="12" y1="5" x2="12" y2="19"></line>
                    <polyline points="19 12 12 19 5 12"></polyline>
                  </svg>
                `;
              }
            }
          });

          rightSection.appendChild(dlBtn);
        }
      }

      row.appendChild(leftSection);
      row.appendChild(rightSection);
      popupChapterList.appendChild(row);
    });
  }

  if (popupDownloadAllBtn) {
    popupDownloadAllBtn.addEventListener('click', async () => {
      if (!currentActiveNovel) return;
      const catalog = currentActiveNovel.chapterList || [];
      if (catalog.length === 0) {
        alert('No chapters found in catalog.');
        return;
      }

      const queueService = window.DownloadQueueService;
      const downloadedChapters = await window.StorageService.getNovelChapters(currentActiveNovel.id);
      const downloadedMap = new Map(downloadedChapters.map((c) => [Number(c.chapterNumber), c]));

      const unqueuedMissing = catalog.filter((c) => {
        const chNum = Number(c.chapterNumber !== undefined ? c.chapterNumber : c.number);
        if (downloadedMap.has(chNum)) return false;
        if (queueService && typeof queueService.isQueued === 'function') {
          if (queueService.isQueued(currentActiveNovel.id, chNum)) return false;
        }
        return true;
      });

      if (unqueuedMissing.length === 0) {
        alert('All chapters are already downloaded or queued!');
        return;
      }

      const toggleEl = document.getElementById('deepseek-toggle');
      const keyEl = document.getElementById('deepseek-api-key');
      const promptEl = document.getElementById('deepseek-prompt');
      const modelSelectEl = document.getElementById('deepseek-model-select');

      const isTranslationEnabled = !!(toggleEl && toggleEl.checked);
      let apiKey = keyEl ? keyEl.value.trim() : '';
      const selectedModel = (modelSelectEl && modelSelectEl.value) || 'deepseek-flash';

      const deepseek = (typeof window !== 'undefined' && window.DeepSeekService) ||
        (typeof DeepSeekService !== 'undefined' && DeepSeekService);

      let curProvConfig = { provider: 'official', customUrl: 'http://127.0.0.1:8000/v1' };
      if (deepseek && typeof deepseek.getProviderConfig === 'function') {
        try {
          curProvConfig = await deepseek.getProviderConfig();
        } catch (e) {}
      }
      const isCustomMode = curProvConfig.provider !== 'official';
      const customUrlInputEl = document.getElementById('popup-custom-base-url');
      const effectiveCustomUrl = customUrlInputEl ? (customUrlInputEl.value.trim() || curProvConfig.customUrl || 'http://127.0.0.1:8000/v1') : (curProvConfig.customUrl || 'http://127.0.0.1:8000/v1');

      if (isTranslationEnabled && !apiKey) {
        if (isCustomMode) {
          apiKey = 'sk-local';
        } else if (deepseek && typeof deepseek.getApiKey === 'function') {
          try {
            const stored = await deepseek.getApiKey();
            if (stored && stored.apiKey) {
              apiKey = stored.apiKey.trim();
              if (keyEl) keyEl.value = apiKey;
              const clearKeyBtn = document.getElementById('clear-deepseek-btn');
              if (clearKeyBtn) clearKeyBtn.classList.remove('hidden');
            }
          } catch (e) {}
        }
      }

      if (isTranslationEnabled && !apiKey && !isCustomMode) {
        if (keyEl) {
          keyEl.focus();
          keyEl.classList.add('border-rose-500', 'ring-1', 'ring-rose-500/50');
          setTimeout(() => {
            keyEl.classList.remove('border-rose-500', 'ring-1', 'ring-rose-500/50');
          }, 2500);
        }
        alert('Please enter your DeepSeek API Key before translating.');
        return;
      }

      if (unqueuedMissing.length > 5) {
        const transDetail = isTranslationEnabled
          ? `with translation enabled (${selectedModel}, provider: ${curProvConfig.provider})`
          : `without translation (raw text)`;
        const confirmed = confirm(`You are about to queue ${unqueuedMissing.length} chapters for download ${transDetail}.\n\nDo you wish to proceed?`);
        if (!confirmed) {
          return;
        }
      }

      const popupCooldownToggleEl = document.getElementById('popup-cooldown-toggle');
      const isCooldownActive = popupCooldownToggleEl ? popupCooldownToggleEl.checked : true;
      const options = {
        cooldown: isCooldownActive,
        translation: {
          enabled: isTranslationEnabled,
          cooldown: isCooldownActive,
          apiKey: apiKey || (isCustomMode ? 'sk-local' : ''),
          prompt: promptEl ? promptEl.value : '',
          model: selectedModel,
          provider: curProvConfig.provider,
          baseUrl: isCustomMode ? effectiveCustomUrl : undefined
        }
      };

      const tasksToEnqueue = unqueuedMissing.map((c) => {
        const chNum = Number(c.chapterNumber !== undefined ? c.chapterNumber : c.number);
        return {
          novelId: currentActiveNovel.id,
          novelTitle: currentActiveNovel.title,
          chapterNumber: chNum,
          chapterTitle: c.title || `Chapter ${chNum}`,
          options
        };
      });

      popupDownloadAllBtn.disabled = true;
      const originalHtml = popupDownloadAllBtn.innerHTML;
      popupDownloadAllBtn.innerHTML = `
        <svg class="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
        <span>Queuing...</span>
      `;

      try {
        if (queueService && typeof queueService.enqueueBatch === 'function') {
          await queueService.enqueueBatch(tasksToEnqueue);
        } else if (queueService && typeof queueService.enqueue === 'function') {
          for (const task of tasksToEnqueue) {
            await queueService.enqueue(task);
          }
        }
        await renderPopupChapters(currentActiveNovel);
      } catch (err) {
        console.error('Error queuing batch download in popup:', err);
        alert('Error queuing chapters: ' + (err.message || err));
      } finally {
        popupDownloadAllBtn.disabled = false;
        popupDownloadAllBtn.innerHTML = originalHtml;
      }
    });
  }

  // --- Render Managed Novels List in Main View ---
  async function refreshNovelsList() {
    if (!window.StorageService) return;
    try {
      const novels = await window.StorageService.getManagedNovels();
      console.log('[popup.js] refreshNovelsList', novels && novels.length);
      if (window.__popupSetNovels) window.__popupSetNovels(novels);
    } catch (err) {
      console.error('Failed to load managed novels:', err);
    }
  }

  // --- Evaluate & Render Current Page Status ---
  async function checkCurrentPageStatus() {
    const novelInfo = extractNovelInfo(currentUrl, tabTitle);
    console.log('[popup.js] checkCurrentPageStatus', { currentUrl, novelInfo });
    const setStatus = (next) => {
      if (window.__popupSetStatus) window.__popupSetStatus(next);
    };

    if (novelInfo) {
      const host = novelInfo.domain || 'wetriedtls.com';
      const novel = window.StorageService
        ? await window.StorageService.getNovelBySlug(novelInfo.slug)
        : null;

      // Case: Visiting a specific Chapter page
      if (novelInfo.chapterNumber !== null) {
        let isChapterSaved = false;
        if (novel) {
          isChapterSaved = await window.StorageService.isChapterSaved(novel.id, novelInfo.chapterNumber);
        }
        setStatus({
          variant: isChapterSaved ? 'saved' : 'loading',
          host,
          title: novel ? novel.title : novelInfo.title,
          subtitle: isChapterSaved
            ? `Chapter ${novelInfo.chapterNumber} is saved in QuickConverterDB.`
            : `Chapter ${novelInfo.chapterNumber} is being checked/saved.`,
          subtitleClass: isChapterSaved ? 'text-emerald-400/90' : 'text-slate-400'
        });
        return;
      }

      // Case: Visiting Series Overview page
      if (novel) {
        setStatus({
          variant: 'managed',
          host,
          title: novel.title,
          subtitle: `${novel.totalChapters ? novel.totalChapters + ' Total Chapters • ' : ''}Already under management.`,
          subtitleClass: 'text-emerald-400/90'
        });

        // Background metadata sync
        if (window.StorageService && novel.slug) {
          window.StorageService.syncNovelMetadata(novel.slug).then((synced) => {
            if (synced && synced.totalChapters !== novel.totalChapters) {
              refreshNovelsList();
            }
          }).catch(() => {});
        }
      } else {
        setStatus({
          variant: 'detected',
          host,
          title: novelInfo.title,
          subtitle: 'This novel is not managed yet.',
          subtitleClass: 'text-slate-400',
          action: 'add',
          novelInfo
        });
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

    if (matchedProvider) {
      setStatus({
        variant: 'supported',
        host: matchedProvider.domains[0] || hostname,
        titlePrefix: 'QuickConverter supports ',
        accent: matchedProvider.name,
        accentClass: 'text-indigo-300 font-semibold',
        titleSuffix: '.',
        subtitle: 'Open any novel series to manage it.',
        subtitleClass: 'text-slate-400'
      });
    } else {
      const supportedSites = (typeof ProviderRegistry !== 'undefined')
        ? ProviderRegistry.getAllProviders().map((p) => p.name).join(', ')
        : 'We Tried TLS';
      setStatus({
        variant: 'standard',
        host: hostname || 'Browser Tab',
        titlePrefix: 'QuickConverter supports ',
        accent: supportedSites,
        accentClass: 'text-indigo-300 font-medium',
        titleSuffix: '.',
        subtitle: 'Visit a supported novel series to add it.',
        subtitleClass: 'text-slate-500'
      });
    }
  }

  // --- Header Navigation (the bridged detail view is hidden by React) ---
  const backToMainBtn = document.getElementById('back-to-main-btn');
  if (backToMainBtn) {
    backToMainBtn.addEventListener('click', () => {
      showMainView();
    });
  }

  // Listen for queue state events to update chapter button states in popup
  let isUpdatingPopupQueue = false;
  let hasPendingPopupUpdate = false;
  let hadActivePopupTask = false;
  let lastPopupActiveTaskId = null;
  let lastPopupQueueCount = -1;
  let lastPopupIsPaused = null;

  function updatePopupActiveProgressInPlace(activeTask) {
    if (!activeTask || !popupChapterList) return false;
    const chNum = Number(activeTask.chapterNumber);
    const btn = popupChapterList.querySelector(`button[data-active-chapter="${chNum}"]`);
    if (!btn) return false;

    const percent = activeTask.progress?.percent !== undefined ? activeTask.progress.percent : 10;
    const ringContainer = btn.querySelector('.popup-active-ring-container');
    if (ringContainer) {
      const circle = ringContainer.querySelector('circle[stroke="#6366f1"]');
      if (circle) {
        const size = 16, strokeWidth = 2.5;
        const radius = (size - strokeWidth) / 2;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (Math.max(0, Math.min(100, percent)) / 100) * circumference;
        circle.style.strokeDashoffset = offset.toFixed(1);
      } else if (typeof window.renderProgressRing === 'function') {
        ringContainer.innerHTML = window.renderProgressRing(percent, 16, 2.5, false);
      }
    }
    const textEl = btn.querySelector('.popup-active-text');
    if (textEl) {
      textEl.textContent = `${percent}%`;
    }
    btn.title = `Translating (${percent}%)... Click to cancel.`;
    return true;
  }

  async function handlePopupQueueChange(state) {
    const currentActiveTaskId = state?.activeTask?.id || null;
    const currentQueueCount = Array.isArray(state?.queue) ? state.queue.length : 0;
    const currentIsPaused = !!state?.isPaused;

    // If active task and queue structure are unchanged, update only progress in place!
    if (
      currentActiveTaskId &&
      currentActiveTaskId === lastPopupActiveTaskId &&
      currentQueueCount === lastPopupQueueCount &&
      currentIsPaused === lastPopupIsPaused
    ) {
      const updated = updatePopupActiveProgressInPlace(state.activeTask);
      if (updated) {
        return; // Targeted in-place update with zero DOM rebuilding
      }
    }

    lastPopupActiveTaskId = currentActiveTaskId;
    lastPopupQueueCount = currentQueueCount;
    lastPopupIsPaused = currentIsPaused;

    if (isUpdatingPopupQueue) {
      hasPendingPopupUpdate = true;
      return;
    }
    isUpdatingPopupQueue = true;
    try {
      if (currentActiveNovel && isDetailView) {
        await renderPopupChapters(currentActiveNovel);
        if (hadActivePopupTask && (!state || !state.activeTask) && aiConfigPanel) {
          aiConfigPanel.refreshBalance(true);
        }
      }
      hadActivePopupTask = !!(state && state.activeTask);
    } catch (e) {
      console.warn('[popup.js] Error updating from queue change:', e);
    } finally {
      isUpdatingPopupQueue = false;
      if (hasPendingPopupUpdate) {
        hasPendingPopupUpdate = false;
        handlePopupQueueChange(window.DownloadQueueService ? window.DownloadQueueService.getState() : null);
      }
    }
  }

  const popupQueueService = (typeof window !== 'undefined' && window.DownloadQueueService);
  if (popupQueueService && typeof popupQueueService.subscribe === 'function') {
    popupQueueService.subscribe((state) => {
      handlePopupQueueChange(state);
    });
  }

  // Listen for newly added novels from Add Book modal
  window.addEventListener('novel-added', async () => {
    await refreshNovelsList();
    checkCurrentPageStatus();
  });

  // Initial Load
  await refreshNovelsList();
  checkCurrentPageStatus();
});
