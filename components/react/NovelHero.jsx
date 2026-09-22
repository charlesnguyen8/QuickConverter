import React, { useEffect, useState } from 'react';

const FALLBACK_THUMB = 'https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp';

function getNovelId() {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('id');
}

export default function NovelHero() {
  const [novel, setNovel] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [nameListCount, setNameListCount] = useState(0);
  const [stats, setStats] = useState({ downloaded: 0, total: 0 });

  useEffect(() => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    const id = getNovelId();
    if (!storage || !id) {
      setNotFound(true);
      return;
    }
    storage.getNovelById(id).then((record) => {
      if (!record) {
        setNotFound(true);
        return;
      }
      setNovel(record);
      setNameListCount(Array.isArray(record.nameList) ? record.nameList.length : 0);
      setStats({ downloaded: 0, total: record.totalChapters || 100 });
      document.title = `${record.title} - QuickConverter`;
    }).catch(() => setNotFound(true));
  }, []);

  useEffect(() => {
    const onStats = (e) => {
      const detail = (e && e.detail) || {};
      setStats({ downloaded: detail.downloaded || 0, total: detail.total || 0 });
    };
    const onNames = (e) => {
      const detail = (e && e.detail) || {};
      setNameListCount(detail.count || 0);
    };
    window.addEventListener('novel-stats-updated', onStats);
    window.addEventListener('novel-name-list-updated', onNames);
    return () => {
      window.removeEventListener('novel-stats-updated', onStats);
      window.removeEventListener('novel-name-list-updated', onNames);
    };
  }, []);

  const title = notFound ? 'Novel Not Found' : (novel ? novel.title : 'Loading Novel...');
  const artwork = novel && novel.thumbnail ? novel.thumbnail : FALLBACK_THUMB;
  const domain = (novel && novel.domain) || 'wetriedtls.com';
  const status = (novel && novel.status) || 'Active';
  const total = stats.total || (novel && novel.totalChapters) || 0;
  const percent = total > 0 ? Math.min(100, Math.round((stats.downloaded / total) * 100)) : 0;

  return (
    <section id="novel-hero" className="flex flex-col sm:flex-row gap-6 items-start bg-slate-800/60 border border-slate-700/60 rounded-xl p-6 shadow-sm backdrop-blur">
      <div className="w-44 sm:w-52 aspect-[3/4] rounded-lg overflow-hidden bg-slate-950 border border-slate-700 shadow-md flex-shrink-0 mx-auto sm:mx-0">
        <img
          id="novel-artwork"
          src={artwork}
          alt={title}
          className="w-full h-full object-cover"
          onError={(e) => { e.currentTarget.src = FALLBACK_THUMB; }}
        />
      </div>

      <div className="flex flex-col gap-3 flex-1 w-full justify-between self-stretch">
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2">
              <span id="novel-domain" className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-slate-700/80 text-slate-300 border border-slate-600/50">
                {domain}
              </span>
              <span id="novel-status" className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
                {status}
              </span>
            </div>
            <button
              id="open-name-list-btn"
              type="button"
              onClick={() => window.dispatchEvent(new Event('novel-open-name-list'))}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 hover:border-slate-600 transition cursor-pointer shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              title="Open Novel Name List & Glossary"
            >
              <span>📖 Name List</span>
              <span id="name-list-count-badge" className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-indigo-500/25 text-indigo-300 border border-indigo-500/30">
                {nameListCount}
              </span>
            </button>
          </div>

          <h1 id="novel-title" className="text-2xl sm:text-3xl font-extrabold text-slate-100 leading-tight">
            {title}
          </h1>
        </div>

        <div className="bg-slate-900/80 rounded-lg p-4 border border-slate-700/60 flex flex-col gap-2 mt-auto">
          <div className="flex items-center justify-between text-xs font-medium">
            <span className="text-slate-400">Downloaded Chapters</span>
            <span id="chapters-stat" className="text-indigo-300 font-semibold">{stats.downloaded} / {total}</span>
          </div>
          <div className="w-full bg-slate-700/60 rounded-full h-2 overflow-hidden">
            <div
              id="chapters-progress-bar"
              className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span id="total-chapters-label">{total} Total Chapters</span>
            <span id="progress-percent" className="text-indigo-400 font-semibold">{percent}%</span>
          </div>
        </div>
      </div>
    </section>
  );
}
