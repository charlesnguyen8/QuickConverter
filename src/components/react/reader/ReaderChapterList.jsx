import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ProgressRing } from '../shared/QueueDock.jsx';
import ManualChapterAction, { ChapterAccessBadge, canBulkDownload } from '../shared/ManualChapterAction.jsx';
import ReaderDeepseekCard from './ReaderDeepseekCard.jsx';
import { navigateToChapter, useReaderSearch } from './readerLocation.js';

function getParams(search) {
  const params = new URLSearchParams(search || '');
  return { id: params.get('id'), ch: parseFloat(params.get('ch')) };
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

export function ReaderChapterRow({ novel, chapter, chNum, downloadedChapter, queueStatus, onDownload, isCurrent = false, manualOnly = false }) {
  const isDownloaded = !!downloadedChapter;
  const queueService = getQueueService();

  const goRead = () => {
    if (!isDownloaded) return;
    navigateToChapter(novel.id, chNum);
  };

  const startDownload = (e) => { e.stopPropagation(); if (onDownload) onDownload(chNum, chapter); };
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
      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        Saved
      </span>
    );
  } else if (queueStatus && queueStatus.status === 'processing') {
    const percent = queueStatus.progress?.percent !== undefined ? queueStatus.progress.percent : 10;
    action = (
      <button
        type="button"
        onClick={removeQueued}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-white bg-indigo-600 hover:bg-rose-600 transition cursor-pointer group/act"
        title="Downloading. Click to cancel."
      >
        <ProgressRing percent={percent} size={13} strokeWidth={2.5} showText={false} />
        <span className="group-hover/act:hidden">{percent}%</span>
        <span className="hidden group-hover/act:inline">Cancel ✕</span>
      </button>
    );
  } else if (queueStatus && queueStatus.status === 'retry_pending') {
    action = (
      <button
        type="button"
        onClick={retryNow}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-rose-300 bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 transition cursor-pointer"
        title="Rate-limit backoff active. Click to retry now."
      >
        🔄 Retry
      </button>
    );
  } else if (queueStatus && queueStatus.status === 'queued') {
    action = (
      <button
        type="button"
        onClick={removeQueued}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-amber-300 bg-amber-500/15 border border-amber-500/30 hover:bg-rose-500/20 hover:text-rose-300 transition cursor-pointer group/q"
        title={`Queued (#${queueStatus.queuePosition}). Click to remove.`}
      >
        <span className="group-hover/q:hidden">⏳ Queued</span>
        <span className="hidden group-hover/q:inline">Remove ✕</span>
      </button>
    );
  } else if (manualOnly || chapter.locked) {
    action = <ManualChapterAction chapter={chapter} compact />;
  } else {
    action = (
      <button
        type="button"
        onClick={startDownload}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-white bg-indigo-500 hover:bg-indigo-600 transition cursor-pointer"
        title={`Download Chapter ${chNum}`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <polyline points="19 12 12 19 5 12" />
        </svg>
        <span>Download</span>
      </button>
    );
  }

  return (
    <div
      data-chapter-item={chNum}
      onClick={goRead}
      title={isDownloaded ? `Read ${chapter.title || `Chapter ${chNum}`}` : undefined}
      className={`flex items-start justify-between gap-2 p-2.5 rounded-lg border transition group ${isCurrent ? 'bg-slate-800 border-indigo-500/60 ring-1 ring-indigo-500/50' : 'bg-slate-800/60 border-slate-700/50'} ${isDownloaded ? 'cursor-pointer hover:border-indigo-500/60 hover:bg-slate-800' : ''}`}
    >
      <div className="flex flex-col gap-0.5 min-w-0 flex-1">
        <span className={`text-[13px] leading-snug break-words ${isDownloaded ? 'font-semibold text-slate-100 group-hover:text-indigo-300 transition' : 'font-medium text-slate-300'}`}>
          {chapter.title || `Chapter ${chNum}`}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-slate-500">Ch. {chNum}</span>
          <ChapterAccessBadge chapter={chapter} compact />
        </span>
      </div>
      <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">{action}</div>
    </div>
  );
}

export default function ReaderChapterList({ open = false, onClose }) {
  const search = useReaderSearch();
  const { id, ch } = useMemo(() => getParams(search), [search]);
  const [novel, setNovel] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [downloadedMap, setDownloadedMap] = useState(new Map());
  const [queueState, setQueueState] = useState(() => {
    const q = getQueueService();
    return q && typeof q.getState === 'function' ? q.getState() : null;
  });
  const [loading, setLoading] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const scrollRef = useRef(null);
  const panelRef = useRef(null);

  const load = useCallback(async () => {
    if (!id) return;
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage) return;
    try {
      const record = await storage.getNovelById(id);
      if (!record) { setLoading(false); return; }
      const downloaded = await storage.getNovelChapters(record.id);
      const map = new Map(downloaded.map((c) => [Number(c.chapterNumber), c]));
      setNovel(record);
      setCatalog(Array.isArray(record.chapterList) ? record.chapterList : []);
      setDownloadedMap(map);
    } catch (e) {
      console.error('Error loading reader chapter list:', e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onRefresh = () => load();
    window.addEventListener('reader-chapter-refresh', onRefresh);
    window.addEventListener('novel-chapters-refresh', onRefresh);
    return () => {
      window.removeEventListener('reader-chapter-refresh', onRefresh);
      window.removeEventListener('novel-chapters-refresh', onRefresh);
    };
  }, [load]);

  useEffect(() => {
    const queueService = getQueueService();
    if (!queueService || typeof queueService.subscribe !== 'function') return undefined;
    const initial = typeof queueService.getState === 'function' ? queueService.getState() : null;
    let prevActiveId = initial && initial.activeTask ? initial.activeTask.id : null;
    const unsubscribe = queueService.subscribe((state) => {
      setQueueState(state);
      const activeId = state && state.activeTask ? state.activeTask.id : null;
      if (prevActiveId && activeId !== prevActiveId) load();
      prevActiveId = activeId;
    });
    return () => { if (typeof unsubscribe === 'function') unsubscribe(); };
  }, [load]);

  useEffect(() => {
    if (!open || loading) return;
    const container = scrollRef.current;
    if (!container) return;
    const el = container.querySelector(`[data-chapter-item="${ch}"]`);
    if (!el) return;
    container.scrollTop = Math.max(0, el.offsetTop - container.clientHeight / 2 + el.clientHeight / 2);
  }, [open, loading, ch, downloadedMap, catalog]);

  const handleDownload = useCallback(async (chNum, chapter) => {
    if (!novel) return;
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    const queueService = getQueueService();
    const options = panelRef.current ? panelRef.current.getDownloadOptions({ includeTopLevelCooldown: true }) : null;
    if (!options) return;

    const payload = {
      novelId: novel.id,
      novelTitle: novel.title,
      chapterNumber: chNum,
      chapterTitle: (chapter && chapter.title) || `Chapter ${chNum}`,
      options
    };

    if (queueService && typeof queueService.enqueue === 'function') {
      await queueService.enqueue(payload);
    } else if (storage && typeof storage.downloadChapter === 'function') {
      await storage.downloadChapter(novel.id, chNum, options);
      load();
    }
  }, [novel, load]);

  const queueService = getQueueService();
  const displayList = catalog.length > 0 ? catalog : Array.from(downloadedMap.values());

  return (
    <>
      <div
        id="reader-chapters-backdrop"
        className={`fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-sm lg:hidden ${open ? '' : 'hidden'}`}
        onClick={onClose}
        aria-hidden="true"
      />

      <aside
        id="reader-chapters-panel"
        aria-label="Chapter list"
        aria-hidden={!open}
        className={`fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-slate-900 border-r border-slate-800 shadow-2xl flex flex-col overflow-hidden transform transition-transform duration-300 lg:z-auto lg:shadow-none lg:self-start lg:sticky lg:inset-auto lg:top-[3.75rem] lg:h-[calc(100vh-3.75rem)] lg:max-h-[calc(100vh-3.75rem)] lg:translate-x-0 lg:transition-[width] ${open ? 'translate-x-0 lg:w-72' : '-translate-x-full lg:w-0'} ${open ? 'lg:border-r' : 'lg:border-r-0'}`}
      >
        <div className="w-72 max-w-[85vw] h-full flex flex-col">
          <div className="flex items-center justify-between gap-2 px-3 py-3 border-b border-slate-800 flex-shrink-0">
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base" aria-hidden="true">📚</span>
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-slate-100">Chapters</h2>
                <p className="text-[11px] text-slate-400 truncate">{novel ? novel.title : 'Loading...'}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              id="reader-chapters-collapse-btn"
              className="inline-flex items-center justify-center min-h-10 min-w-10 p-2 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition cursor-pointer flex-shrink-0"
              title="Collapse chapter list"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
          </div>

          <div ref={scrollRef} className="relative flex-1 overflow-y-auto p-2.5 flex flex-col gap-2">
            {loading ? (
              <div className="flex items-center justify-center gap-2 py-10 text-xs text-slate-400">
                <Spinner className="animate-spin h-4 w-4 text-indigo-400" />
                <span>Loading chapters...</span>
              </div>
            ) : displayList.length === 0 ? (
              <div className="text-center py-10 px-3">
                <p className="text-xs text-slate-400">No chapters available for this novel.</p>
              </div>
            ) : (
              displayList.map((chapter, idx) => {
                const chNum = Number(chapter.chapterNumber !== undefined ? chapter.chapterNumber : chapter.number);
                const downloadedChapter = downloadedMap.get(chNum) || null;
                const queueStatus = queueService && typeof queueService.getChapterStatus === 'function'
                  ? queueService.getChapterStatus(novel.id, chNum)
                  : null;
                return (
                  <ReaderChapterRow
                    key={`${chNum}-${idx}`}
                    novel={novel}
                    chapter={chapter}
                    chNum={chNum}
                    downloadedChapter={downloadedChapter}
                    queueStatus={queueStatus}
                    onDownload={handleDownload}
                    isCurrent={chNum === ch}
                    manualOnly={!canBulkDownload(novel)}
                  />
                );
              })
            )}
          </div>

          {open ? (
            <div className="border-t border-slate-800 p-2.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                className="w-full inline-flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700 transition cursor-pointer"
                title="Configure translation used for chapter downloads"
              >
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden="true">⚙</span>
                  <span>Translation settings</span>
                </span>
                <span className="text-slate-500">{settingsOpen ? '▾' : '▸'}</span>
              </button>
              <div className={settingsOpen ? 'mt-2.5 max-h-[50vh] overflow-y-auto' : 'hidden'}>
                <ReaderDeepseekCard
                  ref={panelRef}
                  idPrefix="reader-chapters"
                  variant="compact"
                  className="w-full text-left rounded-lg bg-slate-800/70 border border-slate-700/80 p-3"
                />
              </div>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}
