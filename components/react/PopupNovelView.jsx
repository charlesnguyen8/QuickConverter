import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import PopupDeepseekCard from './PopupDeepseekCard.jsx';

const storage = () => (typeof window !== 'undefined' ? window.StorageService : null);
const queue = () => (typeof window !== 'undefined' ? window.DownloadQueueService : null);
const actions = () => (typeof window !== 'undefined' ? window.__popupActions : null);

function structural(state) {
  const at = state && state.activeTask;
  const q = (state && state.queue) || [];
  return `${at && at.id}|${q.map((t) => `${t.id}:${t.status}`).join(',')}|${!!(state && state.isPaused)}`;
}

function ActiveButton({ novelId, chNum, onCancel }) {
  const readPercent = () => {
    const q = queue();
    const st = q && typeof q.getChapterStatus === 'function' ? q.getChapterStatus(novelId, chNum) : null;
    const p = st && st.progress && st.progress.percent;
    return p === undefined || p === null ? 0 : p;
  };
  const [percent, setPercent] = useState(readPercent);

  useEffect(() => {
    const q = queue();
    if (!q || typeof q.subscribe !== 'function') return undefined;
    const unsub = q.subscribe(() => setPercent(readPercent()));
    return typeof unsub === 'function' ? unsub : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [novelId, chNum]);

  const ring = typeof window !== 'undefined' && typeof window.renderProgressRing === 'function'
    ? <span className="popup-active-ring-container flex items-center justify-center" dangerouslySetInnerHTML={{ __html: window.renderProgressRing(percent, 16, 2.5, false) }} />
    : (
      <span className="popup-active-ring-container flex items-center justify-center">
        <svg className="animate-spin h-3.5 w-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
        </svg>
      </span>
    );

  return (
    <button
      type="button"
      className="px-1.5 py-1 rounded text-[10px] font-mono font-semibold text-indigo-200 bg-indigo-600/40 hover:bg-rose-600 hover:text-white transition cursor-pointer flex-shrink-0 flex items-center gap-1 group/pactive"
      title={`Translating (${percent}%)... Click to cancel.`}
      data-active-chapter={String(chNum)}
      onClick={(e) => { e.stopPropagation(); onCancel(); }}
    >
      {ring}
      <span className="popup-active-text group-hover/pactive:hidden">{percent}%</span>
      <span className="hidden group-hover/pactive:inline font-bold">✕</span>
    </button>
  );
}

const ChapterRow = memo(function ChapterRow({ novel, chapter, downloadedChapter, queueStatus, onOpen, onDelete, onDownload }) {
  const chNum = Number(chapter.chapterNumber !== undefined ? chapter.chapterNumber : chapter.number);
  const isDownloaded = !!downloadedChapter;
  const q = queue();
  const taskId = `${novel.id}_ch${chNum}`;

  const rowClass = isDownloaded
    ? 'flex items-center justify-between p-2 rounded-md bg-slate-800 border border-slate-700/80 hover:border-indigo-500/60 transition group cursor-pointer'
    : 'flex items-center justify-between p-2 rounded-md bg-slate-800 border border-slate-700/80 hover:border-slate-600 transition group';

  return (
    <div className={rowClass} title={isDownloaded ? `Click to read ${chapter.title || 'Chapter ' + chNum}` : undefined} onClick={isDownloaded ? () => onOpen(chNum) : undefined}>
      <div className="flex items-center gap-2 overflow-hidden flex-1 min-w-0 pr-2">
        <span className={isDownloaded
          ? 'text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 text-indigo-300 border border-indigo-500/30 flex-shrink-0'
          : 'text-[11px] font-mono font-bold px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-700/80 flex-shrink-0'}>
          Ch. {chNum}
        </span>
        <span className={isDownloaded
          ? 'text-xs font-medium text-slate-100 truncate group-hover:text-indigo-300 transition'
          : 'text-xs font-medium text-slate-300 truncate group-hover:text-slate-200 transition'}>
          {chapter.title || `Chapter ${chNum}`}
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {isDownloaded ? (
          <>
            <span className="text-[10px] font-semibold text-indigo-400 group-hover:text-indigo-300 transition">Read</span>
            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">Saved</span>
            {downloadedChapter.translationCost && downloadedChapter.translationCost.formattedCost ? (
              <span
                className="text-[10px] font-mono font-medium px-1 py-0.5 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20"
                title={`Translation Cost: ${downloadedChapter.translationCost.formattedCost} USD • ${downloadedChapter.translationCost.ratePeriod}`}
              >
                {downloadedChapter.translationCost.formattedCost}
              </span>
            ) : null}
            <button
              type="button"
              className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700/80 transition focus:outline-none cursor-pointer flex-shrink-0"
              title={`Delete Chapter ${chNum}`}
              onClick={(e) => { e.stopPropagation(); onDelete(chNum); }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                <line x1="10" y1="11" x2="10" y2="17"></line>
                <line x1="14" y1="11" x2="14" y2="17"></line>
              </svg>
            </button>
          </>
        ) : queueStatus && queueStatus.status === 'processing' ? (
          <ActiveButton novelId={novel.id} chNum={chNum} onCancel={async () => { if (q) await q.remove(taskId); }} />
        ) : queueStatus && queueStatus.status === 'retry_pending' ? (
          <button
            type="button"
            className="px-1.5 py-1 rounded text-[10px] font-mono text-rose-300 bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25 transition cursor-pointer flex items-center gap-1"
            title={`Retry Pending (Attempt ${queueStatus.retryCount || 1}). Click to retry now.`}
            onClick={async (e) => {
              e.stopPropagation();
              if (!q) return;
              if (typeof q.retryNow === 'function') await q.retryNow();
              else if (typeof q.skipCooldown === 'function') await q.skipCooldown();
            }}
          >
            <span>🔄 Retry</span>
            <span className="font-bold text-rose-300">⚡</span>
          </button>
        ) : queueStatus && queueStatus.status === 'queued' ? (
          <button
            type="button"
            className="px-1.5 py-1 rounded text-[10px] font-mono text-amber-300 bg-amber-500/15 border border-amber-500/30 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/40 transition cursor-pointer flex items-center gap-1"
            title={`Queued (#${queueStatus.queuePosition}). Click to remove from queue.`}
            onClick={async (e) => { e.stopPropagation(); if (q) await q.remove(taskId); }}
          >
            <span>⏳#{queueStatus.queuePosition}</span>
            <span className="font-bold">✕</span>
          </button>
        ) : (
          <button
            type="button"
            className="p-1.5 rounded text-indigo-400 hover:text-white hover:bg-indigo-600/80 bg-slate-700/60 transition focus:outline-none cursor-pointer flex-shrink-0 flex items-center justify-center"
            title={`Download Chapter ${chNum}`}
            onClick={(e) => { e.stopPropagation(); onDownload(chNum); }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <polyline points="19 12 12 19 5 12"></polyline>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
});

export default function PopupNovelView({ hidden, novelId, onBack, onOpenSettings }) {
  const [novel, setNovel] = useState(null);
  const [downloaded, setDownloaded] = useState([]);
  const [qState, setQState] = useState(null);
  const [downloadAllBusy, setDownloadAllBusy] = useState(false);

  const load = useCallback(async () => {
    console.log('[PopupNovelView] load', novelId);
    const S = storage();
    if (!novelId || !S) { setNovel(null); return; }
    let n = await S.getNovelById(novelId);
    if (!n) { setNovel(null); return; }
    if ((n.chapterList || []).length === 0 && n.slug) {
      const updated = await S.syncNovelChapters(n.id);
      if (updated && updated.chapterList && updated.chapterList.length) n = updated;
    }
    setNovel(n);
    setDownloaded(await S.getNovelChapters(n.id));
  }, [novelId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const q = queue();
    if (!q || typeof q.subscribe !== 'function') return undefined;
    let last = null;
    const unsub = q.subscribe((state) => {
      const key = structural(state);
      if (key === last) return;
      last = key;
      setQState(state);
    });
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);

  // Whenever the queue structure changes (a task starts, finishes or is
  // cleared), re-read the downloaded chapters so finished rows flip to Saved.
  useEffect(() => {
    const S = storage();
    if (!novelId || !S) return undefined;
    let cancelled = false;
    S.getNovelChapters(novelId)
      .then((ch) => { if (!cancelled) setDownloaded(Array.isArray(ch) ? ch : []); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [qState, novelId]);

  const catalog = (novel && novel.chapterList) || [];
  const downloadedMap = useMemo(
    () => new Map(downloaded.map((c) => [Number(c.chapterNumber), c])),
    [downloaded]
  );
  const displayList = catalog.length > 0 ? catalog : downloaded;
  const totalChapters = (novel && novel.totalChapters) || catalog.length || 100;

  const statusIndex = useMemo(() => {
    const map = new Map();
    if (!qState || !novel) return map;
    const at = qState.activeTask;
    if (at && at.novelId === novel.id) {
      map.set(Number(at.chapterNumber), { status: 'processing' });
    }
    (qState.queue || []).forEach((t, i) => {
      if (t.novelId !== novel.id) return;
      const retry = t.status === 'retry_pending';
      map.set(Number(t.chapterNumber), {
        status: retry ? 'retry_pending' : 'queued',
        queuePosition: i + 1,
        retryCount: t.retryCount || 1
      });
    });
    return map;
  }, [qState, novel]);

  const unqueuedMissingCount = catalog.filter((c) => {
    const chNum = Number(c.chapterNumber !== undefined ? c.chapterNumber : c.number);
    return !downloadedMap.has(chNum) && !statusIndex.has(chNum);
  }).length;

  const openReader = useCallback((chNum) => {
    console.log('[PopupNovelView] open reader', chNum);
    const a = actions();
    if (a && a.openReader) a.openReader(chNum);
  }, []);

  const deleteChapter = useCallback(async (chNum) => {
    const S = storage();
    if (!S) return;
    console.log('[PopupNovelView] delete chapter', chNum);
    await S.deleteChapter(novel.id, chNum);
    await load();
  }, [novel, load]);

  const downloadChapter = useCallback((chNum) => {
    const a = actions();
    if (a && a.downloadChapter) a.downloadChapter(chNum, null, load);
  }, [load]);

  const downloadAll = useCallback(async () => {
    const a = actions();
    if (!a || !a.downloadAll) return;
    setDownloadAllBusy(true);
    try {
      await a.downloadAll(load);
    } finally {
      setDownloadAllBusy(false);
      await load();
    }
  }, [load]);

  console.log('[PopupNovelView] render', { hidden, novelId, chapters: displayList.length, downloaded: downloaded.length, active: statusIndex.size });

  return (
    <div id="view-novel" className={`flex flex-col gap-3${hidden ? ' hidden' : ''}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden">
          <button
            type="button"
            id="back-to-main-btn"
            onClick={onBack}
            className="flex items-center justify-center p-1.5 rounded-md text-slate-400 hover:text-slate-50 hover:bg-slate-800 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/50 flex-shrink-0 cursor-pointer"
            title="Back to Main Menu"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
          </button>
          <h1 className="text-lg font-bold leading-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent truncate">Novel Chapters</h1>
        </div>
        <button
          type="button"
          id="novel-settings-btn"
          onClick={onOpenSettings}
          className="flex items-center justify-center p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer flex-shrink-0"
          title="Settings"
          aria-label="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </div>

      {novel ? (
        <div className="flex items-center gap-3 p-3 rounded-md bg-slate-800 border border-slate-700 shadow-sm">
          <div className="w-14 aspect-[3/4] rounded overflow-hidden bg-slate-900 border border-slate-700/80 flex-shrink-0 shadow-sm">
            <img id="popup-novel-thumb" src={novel.thumbnail || 'https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp'} alt={novel.title} className="w-full h-full object-cover" />
          </div>
          <div className="flex flex-col gap-1 overflow-hidden flex-1 min-w-0">
            <h2 id="popup-novel-title" className="text-sm font-bold text-slate-100 truncate">{novel.title}</h2>
            <div className="flex items-center gap-1.5">
              <span id="popup-novel-domain" className="text-[11px] font-mono text-slate-400 truncate">{novel.domain || 'wetriedtls.com'}</span>
            </div>
            <span id="popup-novel-stats" className="text-xs text-indigo-300 font-medium">{downloaded.length} / {totalChapters} chapters downloaded</span>
          </div>
        </div>
      ) : null}

      <PopupDeepseekCard />

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center justify-between px-0.5">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Novel Chapters</h3>
          <div className="flex items-center gap-1.5">
            <button
              id="popup-download-all-btn"
              type="button"
              disabled={downloadAllBusy || !novel || catalog.length === 0 || unqueuedMissingCount === 0}
              onClick={downloadAll}
              title={catalog.length === 0 || unqueuedMissingCount === 0 ? 'All chapters are already downloaded or queued' : `Download and translate all ${unqueuedMissingCount} missing chapters`}
              className={`px-2 py-0.5 rounded text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition cursor-pointer shadow-sm flex items-center gap-1${!novel || catalog.length === 0 || unqueuedMissingCount === 0 ? ' opacity-50 pointer-events-none' : ''}`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                <polyline points="7 10 12 15 17 10"></polyline>
                <line x1="12" y1="15" x2="12" y2="3"></line>
              </svg>
              <span>{downloadAllBusy ? 'Queuing...' : 'Download All'}</span>
            </button>
            <span id="popup-chapter-count" className="text-xs text-indigo-400 font-medium bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">{displayList.length} Chapters</span>
          </div>
        </div>

        <div id="popup-chapter-list" className="flex flex-col gap-1.5 overflow-y-auto max-h-[220px]">
          {displayList.length === 0 ? (
            <div className="p-5 rounded-md bg-slate-800/60 border border-slate-700/50 text-center text-xs text-slate-500 italic">No chapters discovered yet.</div>
          ) : displayList.map((chapter, i) => {
            const chNum = Number(chapter.chapterNumber !== undefined ? chapter.chapterNumber : chapter.number);
            return (
              <ChapterRow
                key={`${chNum}-${i}`}
                novel={novel}
                chapter={chapter}
                downloadedChapter={downloadedMap.get(chNum)}
                queueStatus={statusIndex.get(chNum)}
                onOpen={openReader}
                onDelete={deleteChapter}
                onDownload={downloadChapter}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}
