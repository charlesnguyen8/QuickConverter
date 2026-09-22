import React, { useEffect, useState } from 'react';

function getParams() {
  if (typeof window === 'undefined') return { id: null, ch: 0 };
  const params = new URLSearchParams(window.location.search);
  return { id: params.get('id'), ch: parseInt(params.get('ch'), 10) || 0 };
}

export default function ReaderNav() {
  const [{ id, ch }] = useState(getParams);
  const [novel, setNovel] = useState(null);

  useEffect(() => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage || !id) return;
    storage.getNovelById(id).then((record) => setNovel(record || null)).catch(() => setNovel(null));
  }, [id]);

  if (!novel) return null;

  const catalog = (novel.chapterList || []).slice().sort((a, b) => a.chapterNumber - b.chapterNumber);
  const currentIndex = catalog.findIndex((c) => Number(c.chapterNumber) === ch);

  let prevCh = null;
  let nextCh = null;
  if (currentIndex > 0) prevCh = catalog[currentIndex - 1].chapterNumber;
  else if (ch > 1) prevCh = ch - 1;

  if (currentIndex >= 0 && currentIndex < catalog.length - 1) nextCh = catalog[currentIndex + 1].chapterNumber;
  else if (currentIndex < 0 && (!novel.totalChapters || ch < novel.totalChapters)) nextCh = ch + 1;

  const go = (target) => {
    window.location.href = `reader.html?id=${encodeURIComponent(novel.id)}&ch=${encodeURIComponent(target)}`;
  };

  return (
    <nav className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-8 pb-4 border-t border-slate-800 mt-6">
      <button
        type="button"
        onClick={() => { if (prevCh !== null) go(prevCh); }}
        disabled={prevCh === null}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer disabled:opacity-30 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="15 18 9 12 15 6" />
        </svg>
        <span>Previous Chapter</span>
      </button>

      <a
        href={`novel.html?id=${encodeURIComponent(novel.id)}`}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 transition text-center"
      >
        Chapter List
      </a>

      <button
        type="button"
        onClick={() => { if (nextCh !== null) go(nextCh); }}
        disabled={nextCh === null}
        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-indigo-500 hover:bg-indigo-600 transition shadow-sm cursor-pointer disabled:opacity-30 disabled:pointer-events-none focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
      >
        <span>Next Chapter</span>
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="9 18 15 12 9 6" />
        </svg>
      </button>
    </nav>
  );
}
