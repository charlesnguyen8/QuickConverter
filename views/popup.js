document.addEventListener('DOMContentLoaded', async () => {
  // The popup view now lives entirely in React (components/react/PopupApp.jsx).
  // This script only owns the DeepSeek card wiring and the download helpers;
  // React calls back through window.__popupActions.

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

  window.__popupActions = {
    openNovel: (id) => showNovelDetailView(id),
    backToMain: () => showMainView(),
    onNovelsChanged: () => {
      console.log('[popup.js] onNovelsChanged');
      checkCurrentPageStatus();
    },
    openReader: (chNum) => openReader(chNum),
    downloadChapter: (chNum, chapterTitle, onDone) => enqueueChapterDownload(chNum, chapterTitle, onDone),
    downloadAll: (onDone) => enqueueAllMissing(onDone),
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

    // The DeepSeek panel still lives here; wire it to this novel's prompt.
    currentActiveNovel = novel;
    if (aiConfigPanel) {
      aiConfigPanel.setPrompt(currentActiveNovel.translationPrompt || undefined);
    }

    if (window.__popupShowNovel) window.__popupShowNovel(novel.id);
  }

  // --- Download helpers (the DeepSeek card DOM is still owned by this script) ---
  async function buildDownloadOptions() {
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
      return null;
    }

    const popupCooldownToggleEl = document.getElementById('popup-cooldown-toggle');
    const isCooldownActive = popupCooldownToggleEl ? popupCooldownToggleEl.checked : true;
    return {
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
  }

  async function enqueueChapterDownload(chNum, chapterTitle, onDone) {
    console.log('[popup.js] enqueueChapterDownload', chNum);
    if (!currentActiveNovel) return;
    const options = await buildDownloadOptions();
    if (!options) return;
    const queueService = window.DownloadQueueService;
    if (queueService && typeof queueService.enqueue === 'function') {
      await queueService.enqueue({
        novelId: currentActiveNovel.id,
        novelTitle: currentActiveNovel.title,
        chapterNumber: chNum,
        chapterTitle: chapterTitle || `Chapter ${chNum}`,
        options
      });
    } else {
      await window.StorageService.downloadChapter(currentActiveNovel.id, chNum, options);
      if (aiConfigPanel && options.translation.enabled && options.translation.provider === 'official') {
        aiConfigPanel.refreshBalance(true);
      }
    }
    if (typeof onDone === 'function') await onDone();
  }

  async function enqueueAllMissing(onDone) {
    console.log('[popup.js] enqueueAllMissing');
    if (!currentActiveNovel) return;
    const fresh = await window.StorageService.getNovelById(currentActiveNovel.id);
    if (fresh) currentActiveNovel = fresh;
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
      if (queueService && typeof queueService.isQueued === 'function' && queueService.isQueued(currentActiveNovel.id, chNum)) return false;
      return true;
    });
    if (unqueuedMissing.length === 0) {
      alert('All chapters are already downloaded or queued!');
      return;
    }
    const options = await buildDownloadOptions();
    if (!options) return;
    if (unqueuedMissing.length > 5) {
      const transDetail = options.translation.enabled
        ? `with translation enabled (${options.translation.model}, provider: ${options.translation.provider})`
        : `without translation (raw text)`;
      if (!confirm(`You are about to queue ${unqueuedMissing.length} chapters for download ${transDetail}.\n\nDo you wish to proceed?`)) return;
    }
    const tasks = unqueuedMissing.map((c) => {
      const chNum = Number(c.chapterNumber !== undefined ? c.chapterNumber : c.number);
      return {
        novelId: currentActiveNovel.id,
        novelTitle: currentActiveNovel.title,
        chapterNumber: chNum,
        chapterTitle: c.title || `Chapter ${chNum}`,
        options
      };
    });
    try {
      if (queueService && typeof queueService.enqueueBatch === 'function') {
        await queueService.enqueueBatch(tasks);
      } else if (queueService && typeof queueService.enqueue === 'function') {
        for (const task of tasks) await queueService.enqueue(task);
      }
    } catch (err) {
      console.error('Error queuing batch download in popup:', err);
      alert('Error queuing chapters: ' + (err.message || err));
    }
    if (typeof onDone === 'function') await onDone();
  }

  function openReader(chNum) {
    console.log('[popup.js] openReader', chNum);
    if (!currentActiveNovel) return;
    const readerUrl = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
      ? chrome.runtime.getURL(`views/reader.html?id=${encodeURIComponent(currentActiveNovel.id)}&ch=${encodeURIComponent(chNum)}`)
      : `reader.html?id=${encodeURIComponent(currentActiveNovel.id)}&ch=${encodeURIComponent(chNum)}`;
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
      chrome.tabs.create({ url: readerUrl });
    } else {
      window.open(readerUrl, '_blank');
    }
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

  // Listen for newly added novels from Add Book modal
  window.addEventListener('novel-added', async () => {
    await refreshNovelsList();
    checkCurrentPageStatus();
  });

  // Initial Load
  await refreshNovelsList();
  checkCurrentPageStatus();
});
