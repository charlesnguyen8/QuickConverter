import React, { useCallback, useEffect, useState } from 'react';
import { ProgressRing } from './QueueDock.jsx';

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

function rowClass(isDownloaded) {
  return isDownloaded
    ? 'flex items-center justify-between p-3.5 rounded-lg bg-slate-800/80 border border-slate-700/60 hover:border-indigo-500/60 hover:bg-slate-800 transition group cursor-pointer'
    : 'flex items-center justify-between p-3.5 rounded-lg bg-slate-800/60 border border-slate-700/50 hover:border-slate-600 transition group';
}

function ChapterRow({ novel, chapter, chNum, downloadedChapter, queueStatus, onDelete }) {
  const isDownloaded = !!downloadedChapter;
  const queueService = getQueueService();

  const goRead = () => {
    if (!isDownloaded) return;
    window.location.href = `reader.html?id=${encodeURIComponent(novel.id)}&ch=${encodeURIComponent(chNum)}`;
  };

  const requestDownload = (e) => {
    e.stopPropagation();
    window.dispatchEvent(new CustomEvent('novel-chapter-download', {
      detail: { novelId: novel.id, chapterNumber: chNum, chapterTitle: chapter.title || `Chapter ${chNum}` }
    }));
  };

  const removeQueued = async (e) => {
    e.stopPropagation();
    if (queueService) await queueService.remove(`${novel.id}_ch${chNum}`);
  };

  const retryNow = async (e) => {
    e.stopPropagation();
    if (!queueService) return;
    if (typeof queueService.retryNow === 'function') await queueService.retryNow();
    else if (typeof queueService.skipCooldown === 'function') await queueService.skipCooldown();
  };

  let action = null;
  if (isDownloaded) {
    action = (
      <>
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-400 group-hover:text-indigo-300 group-hover:translate-x-0.5 transition-all">
          <span>Read</span>
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </span>
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          Saved
        </span>
        {downloadedChapter.translationCost && downloadedChapter.translationCost.formattedCost ? (
          <span
            className="text-[11px] font-mono font-medium px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
            title={`Translation Cost: ${downloadedChapter.translationCost.formattedCost} USD${downloadedChapter.translationCost.ratePeriod ? ` • ${downloadedChapter.translationCost.ratePeriod}` : ''}`}
          >
            {downloadedChapter.translationCost.formattedCost}
          </span>
        ) : null}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(chNum); }}
          className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700/80 transition cursor-pointer"
          title={`Delete Chapter ${chNum}`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>
      </>
    );
  } else if (queueStatus && queueStatus.status === 'processing') {
    const percent = queueStatus.progress?.percent !== undefined ? queueStatus.progress.percent : 10;
    action = (
      <button
        type="button"
        onClick={removeQueued}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-indigo-600 hover:bg-rose-600 transition shadow-sm cursor-pointer group/activebtn"
        title="Currently downloading & translating. Click to cancel and skip to next."
      >
        <span className="flex items-center justify-center"><ProgressRing percent={percent} size={16} strokeWidth={2.5} showText={false} /></span>
        <span className="group-hover/activebtn:hidden">{percent}% Translating...</span>
        <span className="hidden group-hover/activebtn:inline font-bold">Cancel ✕</span>
      </button>
    );
  } else if (queueStatus && queueStatus.status === 'retry_pending') {
    action = (
      <button
        type="button"
        onClick={retryNow}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-rose-300 bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 transition shadow-sm cursor-pointer group/retrybtn"
        title={`Retry Pending (Attempt ${queueStatus.retryCount || 1}). Rate-limit backoff active. Click to retry now immediately.`}
      >
        <span className="group-hover/retrybtn:hidden">🔄 Retry Pending</span>
        <span className="hidden group-hover/retrybtn:inline font-bold">Retry Now ⚡</span>
      </button>
    );
  } else if (queueStatus && queueStatus.status === 'queued') {
    action = (
      <button
        type="button"
        onClick={removeQueued}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-amber-300 bg-amber-500/15 border border-amber-500/30 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/40 transition shadow-sm cursor-pointer group/qbtn"
        title={`Queued (#${queueStatus.queuePosition}). Click to remove from queue.`}
      >
        <span className="group-hover/qbtn:hidden">⏳ Queued (#{queueStatus.queuePosition})</span>
        <span className="hidden group-hover/qbtn:inline">Remove ✕</span>
        <span className="text-amber-400 group-hover/qbtn:text-rose-300 font-bold ml-0.5 group-hover/qbtn:hidden">✕</span>
      </button>
    );
  } else {
    action = (
      <button
        type="button"
        onClick={requestDownload}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white bg-indigo-500 hover:bg-indigo-600 transition shadow-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
        title={`Download Chapter ${chNum}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <polyline points="19 12 12 19 5 12" />
        </svg>
        <span>Download</span>
      </button>
    );
  }

  return (
    <div className={rowClass(isDownloaded)} title={isDownloaded ? `Click to read ${chapter.title || `Chapter ${chNum}`}` : undefined} onClick={goRead}>
      <div className="flex items-center gap-3 overflow-hidden flex-1 min-w-0 pr-3">
        <span className={isDownloaded
          ? 'text-xs font-mono font-bold px-2.5 py-1 rounded bg-slate-900 text-indigo-300 border border-indigo-500/30 flex-shrink-0'
          : 'text-xs font-mono font-bold px-2.5 py-1 rounded bg-slate-900 text-slate-400 border border-slate-700/80 flex-shrink-0'}
        >
          Ch. {chNum}
        </span>
        <span className={isDownloaded
          ? 'text-sm font-semibold text-slate-100 truncate group-hover:text-indigo-300 transition'
          : 'text-sm font-medium text-slate-300 truncate group-hover:text-slate-200 transition'}
        >
          {chapter.title || `Chapter ${chNum}`}
        </span>
      </div>

      <div className="flex items-center gap-2.5 flex-shrink-0">
        {action}
        {chapter.url ? (
          <a
            href={chapter.url}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="p-1.5 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition ml-0.5"
            title="Open chapter on web"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        ) : null}
      </div>
    </div>
  );
}

export default function NovelChapters() {
  const [novelId] = useState(getNovelId);
  const [novel, setNovel] = useState(null);
  const [downloadedMap, setDownloadedMap] = useState(new Map());
  const [catalog, setCatalog] = useState([]);
  const [queueState, setQueueState] = useState(() => {
    const q = getQueueService();
    return q && typeof q.getState === 'function' ? q.getState() : null;
  });
  const [loading, setLoading] = useState(true);
  const [fetchingCatalog, setFetchingCatalog] = useState(false);

  const load = useCallback(async () => {
    if (!novelId) return;
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage) return;

    let current = await storage.getNovelById(novelId);
    if (!current) return;

    let list = current.chapterList || [];
    if (list.length === 0 && current.slug) {
      setFetchingCatalog(true);
      try {
        const synced = await storage.syncNovelChapters(current.id);
        if (synced && synced.chapterList && synced.chapterList.length > 0) {
          current = synced;
          list = synced.chapterList;
        }
      } finally {
        setFetchingCatalog(false);
      }
    }

    const downloaded = await storage.getNovelChapters(current.id);
    const map = new Map(downloaded.map((c) => [Number(c.chapterNumber), c]));
    const displayList = list.length > 0 ? list : downloaded;
    const total = current.totalChapters || displayList.length || 100;

    setNovel(current);
    setCatalog(list);
    setDownloadedMap(map);
    setLoading(false);

    const downloadedMapLocal = map;
    const queueService = getQueueService();
    const unqueuedMissing = list.filter((c) => {
      const chNum = Number(c.chapterNumber !== undefined ? c.chapterNumber : c.number);
      if (downloadedMapLocal.has(chNum)) return false;
      if (queueService && typeof queueService.isQueued === 'function' && queueService.isQueued(current.id, chNum)) return false;
      return true;
    }).length;

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('novel-stats-updated', {
        detail: { downloaded: downloaded.length, total, unqueuedMissing, hasCatalog: list.length > 0 }
      }));
    }
  }, [novelId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const queueService = getQueueService();
    if (!queueService || typeof queueService.subscribe !== 'function') return undefined;
    const initial = typeof queueService.getState === 'function' ? queueService.getState() : null;
    let prevActiveId = initial && initial.activeTask ? initial.activeTask.id : null;
    const unsubscribe = queueService.subscribe((state) => {
      setQueueState(state);
      const activeId = state && state.activeTask ? state.activeTask.id : null;
      if (prevActiveId && activeId !== prevActiveId) {
        load();
      }
      prevActiveId = activeId;
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [load]);

  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener('novel-chapters-refresh', onRefresh);
    return () => window.removeEventListener('novel-chapters-refresh', onRefresh);
  }, [load]);

  const handleDelete = useCallback(async (chNum) => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage) return;
    await storage.deleteChapter(novelId, chNum);
    load();
  }, [novelId, load]);

  if (loading) {
    return (
      <div className="p-8 rounded-lg bg-slate-800/40 border border-slate-700/50 text-center flex flex-col items-center justify-center gap-2">
        <Spinner className="animate-spin h-6 w-6 text-indigo-400" />
        <p className="text-sm font-medium text-slate-300">Loading chapters...</p>
      </div>
    );
  }

  if (fetchingCatalog) {
    return (
      <div className="p-8 rounded-lg bg-slate-800/40 border border-slate-700/50 text-center flex flex-col items-center justify-center gap-2">
        <Spinner className="animate-spin h-6 w-6 text-indigo-400" />
        <p className="text-sm font-medium text-slate-300">Fetching chapter catalog from provider...</p>
      </div>
    );
  }

  const displayList = catalog.length > 0 ? catalog : Array.from(downloadedMap.values());
  const queueService = getQueueService();

  if (displayList.length === 0) {
    return (
      <div className="p-8 rounded-lg bg-slate-800/40 border border-slate-700/50 text-center flex flex-col items-center justify-center gap-2">
        <div className="text-2xl">📖</div>
        <p className="text-sm font-medium text-slate-300">No chapters found for this novel.</p>
        <p className="text-xs text-slate-500 max-w-sm">Click "Sync Catalog" above to fetch chapters from the provider.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {displayList.map((chapter, idx) => {
        const chNum = Number(chapter.chapterNumber !== undefined ? chapter.chapterNumber : chapter.number);
        const downloadedChapter = downloadedMap.get(chNum) || null;
        const queueStatus = queueService && typeof queueService.getChapterStatus === 'function'
          ? queueService.getChapterStatus(novel.id, chNum)
          : null;
        return (
          <ChapterRow
            key={`${chNum}-${idx}`}
            novel={novel}
            chapter={chapter}
            chNum={chNum}
            downloadedChapter={downloadedChapter}
            queueStatus={queueStatus}
            onDelete={handleDelete}
          />
        );
      })}
    </div>
  );
}
