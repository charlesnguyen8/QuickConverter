import React, { useCallback, useEffect, useRef, useState } from 'react';
import NovelHero from './NovelHero.jsx';
import NovelDeepseekCard from './NovelDeepseekCard.jsx';
import NovelChapters from './NovelChapters.jsx';
import NameListDrawer from './NameListDrawer.jsx';

function getNovelId() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('id');
}

function getQueueService() {
  return typeof window !== 'undefined' ? window.DownloadQueueService : null;
}

function Spinner({ className }) {
  return (
    <svg className={className} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

export default function NovelApp() {
  const [novelId] = useState(getNovelId);
  const [novel, setNovel] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [queuing, setQueuing] = useState(false);
  const [stats, setStats] = useState(null);
  const panelRef = useRef(null);

  useEffect(() => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!novelId || !storage) return;
    storage.getNovelById(novelId)
      .then((record) => { if (record) setNovel(record); })
      .catch((e) => console.error('Error loading novel details:', e));
  }, [novelId]);

  useEffect(() => {
    const onStats = (e) => {
      const detail = (e && e.detail) || {};
      setStats({
        downloaded: detail.downloaded || 0,
        total: detail.total || 0,
        unqueuedMissing: detail.unqueuedMissing || 0,
        hasCatalog: !!detail.hasCatalog
      });
    };
    window.addEventListener('novel-stats-updated', onStats);
    return () => window.removeEventListener('novel-stats-updated', onStats);
  }, []);

  const refreshChapterList = useCallback(() => {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('novel-chapters-refresh'));
  }, []);

  const enqueueChapterDownload = useCallback(async (chNum, chapterTitle) => {
    if (!novel) return;
    const options = panelRef.current ? panelRef.current.getDownloadOptions({ includeTopLevelCooldown: true }) : null;
    if (!options) return;

    const queueService = getQueueService();
    if (queueService && typeof queueService.enqueue === 'function') {
      await queueService.enqueue({
        novelId: novel.id,
        novelTitle: novel.title,
        chapterNumber: chNum,
        chapterTitle: chapterTitle || `Chapter ${chNum}`,
        options
      });
      refreshChapterList();
    } else {
      try {
        await window.StorageService.downloadChapter(novel.id, chNum, options);
        if (options.translation.enabled && options.translation.provider === 'official' && panelRef.current) {
          panelRef.current.refreshBalance(true);
        }
        refreshChapterList();
      } catch (err) {
        console.error('Error downloading chapter:', err);
      }
    }
  }, [novel, refreshChapterList]);

  useEffect(() => {
    const onDownload = (e) => {
      const detail = (e && e.detail) || {};
      enqueueChapterDownload(detail.chapterNumber, detail.chapterTitle);
    };
    window.addEventListener('novel-chapter-download', onDownload);
    return () => window.removeEventListener('novel-chapter-download', onDownload);
  }, [enqueueChapterDownload]);

  useEffect(() => {
    const queueService = getQueueService();
    if (!queueService || typeof queueService.subscribe !== 'function') return undefined;
    let hadActiveTask = false;
    const unsubscribe = queueService.subscribe((state) => {
      const hasActive = !!(state && state.activeTask);
      if (hadActiveTask && !hasActive) {
        if (panelRef.current) panelRef.current.refreshBalance(true);
      }
      hadActiveTask = hasActive;
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, []);

  const handleSync = useCallback(async () => {
    if (!novel || syncing) return;
    setSyncing(true);
    try {
      const updated = await window.StorageService.syncNovelChapters(novel.id);
      if (updated) setNovel(updated);
      refreshChapterList();
    } catch (e) {
      console.error('Error syncing catalog:', e);
    } finally {
      setSyncing(false);
    }
  }, [novel, syncing, refreshChapterList]);

  const handleDownloadAll = useCallback(async () => {
    if (!novel) {
      alert('No novel loaded. Please select a novel first.');
      return;
    }
    const catalog = novel.chapterList || [];
    if (catalog.length === 0) {
      alert('No chapters found in catalog. Please click "Sync Catalog" first.');
      return;
    }

    const queueService = getQueueService();
    const storageService = (typeof window !== 'undefined' && window.StorageService) || null;

    const downloadedChapters = storageService && typeof storageService.getNovelChapters === 'function'
      ? await storageService.getNovelChapters(novel.id)
      : [];
    const downloadedMap = new Map(downloadedChapters.map((c) => [Number(c.chapterNumber), c]));

    const unqueuedMissing = catalog.filter((c) => {
      const chNum = Number(c.chapterNumber !== undefined ? c.chapterNumber : c.number);
      if (downloadedMap.has(chNum)) return false;
      if (queueService && typeof queueService.isQueued === 'function' && queueService.isQueued(novel.id, chNum)) return false;
      return true;
    });

    if (unqueuedMissing.length === 0) {
      alert('All chapters are already downloaded or queued!');
      return;
    }

    const options = panelRef.current ? panelRef.current.getDownloadOptions({ includeTopLevelCooldown: true }) : null;
    if (!options) return;

    if (unqueuedMissing.length > 5) {
      const transDetail = options.translation.enabled
        ? `with translation enabled (${options.translation.model}, provider: ${options.translation.provider})`
        : `without translation (raw text)`;
      const confirmed = confirm(`You are about to queue ${unqueuedMissing.length} chapters for download ${transDetail}.\n\nDo you wish to proceed?`);
      if (!confirmed) return;
    }

    const tasksToEnqueue = unqueuedMissing.map((c) => {
      const chNum = Number(c.chapterNumber !== undefined ? c.chapterNumber : c.number);
      return {
        novelId: novel.id,
        novelTitle: novel.title,
        chapterNumber: chNum,
        chapterTitle: c.title || `Chapter ${chNum}`,
        options
      };
    });

    setQueuing(true);
    try {
      if (queueService && typeof queueService.enqueueBatch === 'function') {
        await queueService.enqueueBatch(tasksToEnqueue);
      } else if (queueService && typeof queueService.enqueue === 'function') {
        for (const task of tasksToEnqueue) {
          await queueService.enqueue(task);
        }
      }
      refreshChapterList();
    } catch (err) {
      console.error('Error queuing batch download:', err);
      alert('Error queuing chapters: ' + (err.message || err));
    } finally {
      setQueuing(false);
    }
  }, [novel, refreshChapterList]);

  const settingsHref = novelId
    ? `settings.html?from=novel&id=${encodeURIComponent(novelId)}`
    : 'settings.html?from=novel';
  const downloadAllDisabled = stats ? (!stats.hasCatalog || stats.unqueuedMissing === 0) : false;
  const downloadAllTitle = stats
    ? (downloadAllDisabled ? 'All chapters are already downloaded or queued' : `Download and translate all ${stats.unqueuedMissing} missing chapters`)
    : 'Download and translate all missing chapters';

  return (
    <>
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30 px-6 py-3.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <a
            href="library.html"
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-400 hover:text-white transition px-3 py-1.5 rounded-md hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span>Back to Library</span>
          </a>

          <div className="flex items-center gap-3">
            <a
              id="novel-settings-btn"
              href={settingsHref}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-300 hover:text-white transition px-2.5 py-1.5 rounded-md hover:bg-slate-800 border border-slate-700/60 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
              title="Open QuickConverter Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              <span>Settings</span>
            </a>

            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-xs shadow-sm">
                Q
              </div>
              <span className="text-xs font-semibold text-slate-400">QuickConverter</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto w-full px-6 py-8 flex-1 flex flex-col gap-8">
        <NovelHero />

        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-800">
            <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <span>Chapters</span>
              <span id="chapters-badge" className="text-xs font-medium px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/30">
                {stats ? `${stats.downloaded} / ${stats.total} Saved` : '0'}
              </span>
            </h2>

            <div className="flex items-center gap-2">
              <button
                id="download-all-btn"
                type="button"
                onClick={handleDownloadAll}
                disabled={queuing}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 border border-indigo-500 transition cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/40${downloadAllDisabled ? ' opacity-50 pointer-events-none' : ''}`}
                title={downloadAllTitle}
              >
                {queuing ? (
                  <>
                    <Spinner className="animate-spin h-3.5 w-3.5 text-white" />
                    <span>Queuing...</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                      <polyline points="7 10 12 15 17 10"></polyline>
                      <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    <span>Download All</span>
                  </>
                )}
              </button>
              <button
                id="sync-chapters-btn"
                type="button"
                onClick={handleSync}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
                title="Sync / Refresh Chapter Catalog"
              >
                {syncing ? (
                  <>
                    <Spinner className="animate-spin h-3.5 w-3.5 text-indigo-400" />
                    <span>Syncing...</span>
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10"></polyline>
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                    </svg>
                    <span>Sync Catalog</span>
                  </>
                )}
              </button>
            </div>
          </div>

          <NovelDeepseekCard ref={panelRef} />

          <NovelChapters />
        </section>
      </main>

      <NameListDrawer />
    </>
  );
}
