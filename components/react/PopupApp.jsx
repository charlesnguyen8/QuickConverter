import React, { useCallback, useEffect, useRef, useState } from 'react';
import PopupMainView from './PopupMainView.jsx';
import PopupNovelView from './PopupNovelView.jsx';

const storage = () => (typeof window !== 'undefined' ? window.StorageService : null);
const deepseek = () => (typeof window !== 'undefined' ? window.DeepSeekService : null);
const platform = () => (typeof window !== 'undefined' ? window.Platform : null);

const CHECKING = {
  variant: 'checking',
  host: '',
  subtitle: 'Detecting current page compatibility...'
};

const PANEL_IDS = {
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
};

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
    console.warn('[PopupApp] Error parsing novel URL:', e);
  }
  return null;
}

async function buildStatus(url, pageTitle) {
  const novelInfo = extractNovelInfo(url, pageTitle);
  console.log('[PopupApp] buildStatus', { url, novelInfo });
  const S = storage();

  if (novelInfo) {
    const host = novelInfo.domain || 'wetriedtls.com';
    const novel = S ? await S.getNovelBySlug(novelInfo.slug) : null;

    if (novelInfo.chapterNumber !== null) {
      let isChapterSaved = false;
      if (novel) isChapterSaved = await S.isChapterSaved(novel.id, novelInfo.chapterNumber);
      return {
        variant: isChapterSaved ? 'saved' : 'loading',
        host,
        title: novel ? novel.title : novelInfo.title,
        subtitle: isChapterSaved
          ? `Chapter ${novelInfo.chapterNumber} is saved in QuickConverterDB.`
          : `Chapter ${novelInfo.chapterNumber} is being checked/saved.`,
        subtitleClass: isChapterSaved ? 'text-emerald-400/90' : 'text-slate-400'
      };
    }

    if (novel) {
      if (S && novel.slug) {
        S.syncNovelMetadata(novel.slug).catch(() => {});
      }
      return {
        variant: 'managed',
        host,
        title: novel.title,
        subtitle: `${novel.totalChapters ? novel.totalChapters + ' Total Chapters • ' : ''}Already under management.`,
        subtitleClass: 'text-emerald-400/90'
      };
    }

    return {
      variant: 'detected',
      host,
      title: novelInfo.title,
      subtitle: 'This novel is not managed yet.',
      subtitleClass: 'text-slate-400',
      action: 'add',
      novelInfo
    };
  }

  let matchedProvider = null;
  let hostname = '';
  if (url) {
    try {
      const parsed = new URL(url);
      hostname = parsed.hostname;
      if (typeof ProviderRegistry !== 'undefined') {
        matchedProvider = ProviderRegistry.getProviderForUrl(url);
        if (!matchedProvider) matchedProvider = ProviderRegistry.getProviderForDomain(hostname);
      }
    } catch (e) {}
  }

  if (matchedProvider) {
    return {
      variant: 'supported',
      host: matchedProvider.domains[0] || hostname,
      titlePrefix: 'QuickConverter supports ',
      accent: matchedProvider.name,
      accentClass: 'text-indigo-300 font-semibold',
      titleSuffix: '.',
      subtitle: 'Open any novel series to manage it.',
      subtitleClass: 'text-slate-400'
    };
  }

  const supportedSites = (typeof ProviderRegistry !== 'undefined')
    ? ProviderRegistry.getAllProviders().map((p) => p.name).join(', ')
    : 'We Tried TLS';
  return {
    variant: 'standard',
    host: hostname || 'Browser Tab',
    titlePrefix: 'QuickConverter supports ',
    accent: supportedSites,
    accentClass: 'text-indigo-300 font-medium',
    titleSuffix: '.',
    subtitle: 'Visit a supported novel series to add it.',
    subtitleClass: 'text-slate-500'
  };
}

export default function PopupApp() {
  const [novels, setNovels] = useState([]);
  const [status, setStatus] = useState(CHECKING);
  const [showDetail, setShowDetail] = useState(false);
  const [detailNovelId, setDetailNovelId] = useState(null);
  const [addBusy, setAddBusy] = useState(false);

  const currentUrlRef = useRef(null);
  const tabTitleRef = useRef('');
  const activeNovelRef = useRef(null);
  const panelRef = useRef(null);

  const loadNovels = useCallback(async () => {
    const S = storage();
    if (!S) return;
    try {
      const list = await S.getManagedNovels();
      console.log('[PopupApp] loadNovels', list && list.length);
      setNovels(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error('[PopupApp] Failed to load managed novels:', err);
    }
  }, []);

  const refreshStatus = useCallback(async () => {
    setStatus(await buildStatus(currentUrlRef.current, tabTitleRef.current));
  }, []);

  const openSettings = useCallback(() => {
    const p = platform();
    if (p) p.runtime.openUrl(p.runtime.getURL('views/settings.html'));
    else window.open('settings.html', '_blank');
  }, []);

  const openLibrary = useCallback(() => {
    const p = platform();
    if (p) p.runtime.openUrl(p.runtime.getURL('views/library.html'));
    else window.open('library.html', '_blank');
  }, []);

  const openReader = useCallback((chNum) => {
    const novel = activeNovelRef.current;
    if (!novel) return;
    const p = platform();
    const path = `views/reader.html?id=${encodeURIComponent(novel.id)}&ch=${encodeURIComponent(chNum)}`;
    if (p) p.runtime.openUrl(p.runtime.getURL(path));
    else window.open(path, '_blank');
  }, []);

  const openNovel = useCallback(async (novelId) => {
    console.log('[PopupApp] openNovel', novelId);
    const S = storage();
    if (!S || !novelId) return;
    const novel = await S.getNovelById(novelId);
    if (!novel) return;
    activeNovelRef.current = novel;
    if (panelRef.current) panelRef.current.setPrompt(novel.translationPrompt || undefined);
    setDetailNovelId(novelId);
    setShowDetail(true);
  }, []);

  const backToMain = useCallback(() => {
    console.log('[PopupApp] backToMain');
    setShowDetail(false);
    setDetailNovelId(null);
    loadNovels();
    refreshStatus();
  }, [loadNovels, refreshStatus]);

  const buildDownloadOptions = useCallback(async () => {
    const toggleEl = document.getElementById('deepseek-toggle');
    const keyEl = document.getElementById('deepseek-api-key');
    const promptEl = document.getElementById('deepseek-prompt');
    const modelSelectEl = document.getElementById('deepseek-model-select');

    const isTranslationEnabled = !!(toggleEl && toggleEl.checked);
    let apiKey = keyEl ? keyEl.value.trim() : '';
    const selectedModel = (modelSelectEl && modelSelectEl.value) || 'deepseek-flash';
    const ds = deepseek();

    let curProvConfig = { provider: 'official', customUrl: 'http://127.0.0.1:8000/v1' };
    if (ds && typeof ds.getProviderConfig === 'function') {
      try { curProvConfig = await ds.getProviderConfig(); } catch (e) {}
    }
    const isCustomMode = curProvConfig.provider !== 'official';
    const customUrlInputEl = document.getElementById('popup-custom-base-url');
    const effectiveCustomUrl = customUrlInputEl
      ? (customUrlInputEl.value.trim() || curProvConfig.customUrl || 'http://127.0.0.1:8000/v1')
      : (curProvConfig.customUrl || 'http://127.0.0.1:8000/v1');

    if (isTranslationEnabled && !apiKey) {
      if (isCustomMode) {
        apiKey = 'sk-local';
      } else if (ds && typeof ds.getApiKey === 'function') {
        try {
          const stored = await ds.getApiKey();
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
        setTimeout(() => keyEl.classList.remove('border-rose-500', 'ring-1', 'ring-rose-500/50'), 2500);
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
  }, []);

  const downloadChapter = useCallback(async (chNum, chapterTitle, onDone) => {
    const novel = activeNovelRef.current;
    console.log('[PopupApp] downloadChapter', chNum);
    if (!novel) return;
    const options = await buildDownloadOptions();
    if (!options) return;
    const q = window.DownloadQueueService;
    if (q && typeof q.enqueue === 'function') {
      await q.enqueue({
        novelId: novel.id,
        novelTitle: novel.title,
        chapterNumber: chNum,
        chapterTitle: chapterTitle || `Chapter ${chNum}`,
        options
      });
    } else if (storage()) {
      await storage().downloadChapter(novel.id, chNum, options);
      if (panelRef.current && options.translation.enabled && options.translation.provider === 'official') {
        panelRef.current.refreshBalance(true);
      }
    }
    if (typeof onDone === 'function') await onDone();
  }, [buildDownloadOptions]);

  const downloadAll = useCallback(async (onDone) => {
    const S = storage();
    let novel = activeNovelRef.current;
    console.log('[PopupApp] downloadAll');
    if (!novel || !S) return;
    const fresh = await S.getNovelById(novel.id);
    if (fresh) { novel = fresh; activeNovelRef.current = fresh; }

    const catalog = novel.chapterList || [];
    if (catalog.length === 0) { alert('No chapters found in catalog.'); return; }

    const q = window.DownloadQueueService;
    const downloaded = await S.getNovelChapters(novel.id);
    const downloadedMap = new Map(downloaded.map((c) => [Number(c.chapterNumber), c]));
    const unqueuedMissing = catalog.filter((c) => {
      const chNum = Number(c.chapterNumber !== undefined ? c.chapterNumber : c.number);
      if (downloadedMap.has(chNum)) return false;
      if (q && typeof q.isQueued === 'function' && q.isQueued(novel.id, chNum)) return false;
      return true;
    });
    if (unqueuedMissing.length === 0) { alert('All chapters are already downloaded or queued!'); return; }

    const options = await buildDownloadOptions();
    if (!options) return;
    if (unqueuedMissing.length > 5) {
      const transDetail = options.translation.enabled
        ? `with translation enabled (${options.translation.model}, provider: ${options.translation.provider})`
        : 'without translation (raw text)';
      if (!confirm(`You are about to queue ${unqueuedMissing.length} chapters for download ${transDetail}.\n\nDo you wish to proceed?`)) return;
    }

    const tasks = unqueuedMissing.map((c) => {
      const chNum = Number(c.chapterNumber !== undefined ? c.chapterNumber : c.number);
      return {
        novelId: novel.id,
        novelTitle: novel.title,
        chapterNumber: chNum,
        chapterTitle: c.title || `Chapter ${chNum}`,
        options
      };
    });

    try {
      if (q && typeof q.enqueueBatch === 'function') await q.enqueueBatch(tasks);
      else if (q && typeof q.enqueue === 'function') { for (const t of tasks) await q.enqueue(t); }
    } catch (err) {
      console.error('[PopupApp] Error queuing batch download:', err);
      alert('Error queuing chapters: ' + (err.message || err));
    }
    if (typeof onDone === 'function') await onDone();
  }, [buildDownloadOptions]);

  const handleDeleteNovel = useCallback(async (novel) => {
    const S = storage();
    if (!S) return;
    const updated = await S.deleteNovel(novel.id);
    setNovels(Array.isArray(updated) ? updated : []);
    refreshStatus();
  }, [refreshStatus]);

  const handleAddNovel = useCallback(async () => {
    const info = status.novelInfo;
    const S = storage();
    if (!info || !S) return;
    setAddBusy(true);
    try {
      await S.addNovel(info);
      if (info.slug) {
        await Promise.all([S.syncNovelMetadata(info.slug), S.syncNovelChapters(info.slug)]);
      }
      const latest = await S.getManagedNovels();
      setNovels(Array.isArray(latest) ? latest : []);
      await refreshStatus();
    } catch (err) {
      console.error('[PopupApp] add novel failed', err);
    } finally {
      setAddBusy(false);
    }
  }, [status, refreshStatus]);

  // Children read window.__popupActions at click time.
  if (typeof window !== 'undefined') {
    window.__popupActions = {
      openNovel,
      backToMain,
      onNovelsChanged: refreshStatus,
      openReader,
      downloadChapter,
      downloadAll,
      openLibrary,
      openSettings
    };
  }

  useEffect(() => {
    (async () => {
      const p = platform();
      let url = null;
      let title = '';
      if (p && p.runtime && typeof p.runtime.queryActiveTab === 'function') {
        const tab = await p.runtime.queryActiveTab();
        url = tab && tab.url;
        title = (tab && tab.title) || '';
      }
      currentUrlRef.current = url;
      tabTitleRef.current = title;
      console.log('[PopupApp] active tab', { url, title });
      await loadNovels();
      refreshStatus();
    })();

    if (typeof window !== 'undefined' && window.AiConfigPanel && typeof window.AiConfigPanel.create === 'function') {
      panelRef.current = window.AiConfigPanel.create({
        variant: 'compact',
        ids: PANEL_IDS,
        hooks: {
          getPrompt: () => (activeNovelRef.current && activeNovelRef.current.translationPrompt) || null,
          savePrompt: async (text) => {
            const novel = activeNovelRef.current;
            if (!novel) return;
            novel.translationPrompt = text;
            const S = storage();
            if (S && typeof S.updateNovel === 'function') {
              await S.updateNovel(novel.id, { translationPrompt: text });
            }
          }
        }
      });
      if (panelRef.current) panelRef.current.refresh();
    } else {
      console.warn('[PopupApp] AiConfigPanel not loaded; DeepSeek panel disabled.');
    }
  }, [loadNovels, refreshStatus]);

  console.log('[PopupApp] render', { novels: novels.length, variant: status.variant, showDetail, addBusy });

  return (
    <>
      <PopupMainView
        hidden={showDetail}
        novels={novels}
        status={status}
        addBusy={addBusy}
        onOpenNovel={(novel) => openNovel(novel.id)}
        onDeleteNovel={handleDeleteNovel}
        onAddNovel={handleAddNovel}
        onOpenLibrary={openLibrary}
        onOpenSettings={openSettings}
      />
      <PopupNovelView
        hidden={!showDetail}
        novelId={detailNovelId}
        onBack={backToMain}
        onOpenSettings={openSettings}
      />
    </>
  );
}
