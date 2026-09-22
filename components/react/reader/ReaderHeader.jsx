import React, { useEffect, useRef } from 'react';
import ReaderPrefsPopover from './ReaderPrefsPopover.jsx';

export function computeScrollProgress(scrollY, scrollHeight) {
  return scrollHeight > 0 ? Math.min(100, Math.max(0, (scrollY / scrollHeight) * 100)) : 0;
}

export default function ReaderHeader({
  novelTitle = 'QuickConverter Reader',
  chapterTitle = 'Loading chapter...',
  backHref = 'library.html',
  settingsHref = 'settings.html?from=reader',
  hasSource = false
}) {
  const barRef = useRef(null);
  const percentRef = useRef(null);

  useEffect(() => {
    const onScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = computeScrollProgress(window.scrollY, scrollHeight);
      if (barRef.current) barRef.current.style.width = `${progress}%`;
      if (percentRef.current) {
        percentRef.current.textContent = `${Math.round(progress)}%`;
        percentRef.current.style.left = `clamp(1.25rem, ${progress}%, calc(100% - 1.25rem))`;
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const openSource = () => {
    window.dispatchEvent(new Event('reader-open-source'));
  };

  return (
    <>
      <div
        id="reading-progress-track"
        className="fixed top-0 left-0 right-0 h-1 bg-slate-800/80 z-50"
      >
        <div
          id="reading-progress-bar"
          ref={barRef}
          className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-75"
          style={{ width: '0%' }}
        ></div>
      </div>

      <span
        id="reading-progress-percent"
        ref={percentRef}
        className="fixed top-1.5 z-50 -translate-x-1/2 px-1.5 py-0.5 rounded-full bg-slate-800/95 border border-slate-700 text-[10px] font-mono font-semibold text-indigo-300 shadow-sm select-none pointer-events-none transition-all duration-75"
        style={{ left: '1.25rem' }}
      >
        0%
      </span>

      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40 px-4 sm:px-8 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-3">
          <a
            id="back-to-novel-btn"
            href={backHref}
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-medium text-slate-400 hover:text-white transition px-2.5 py-1.5 rounded-md hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 flex-shrink-0"
            title="Return to Novel Chapters"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            <span className="hidden sm:inline">Back to Novel</span>
          </a>

          <div className="flex flex-col items-center text-center overflow-hidden min-w-0 flex-1 px-2">
            <span id="header-novel-title" className="text-[11px] text-slate-400 truncate max-w-[200px] sm:max-w-sm">
              {novelTitle}
            </span>
            <span id="header-chapter-title" className="text-xs sm:text-sm font-bold text-slate-200 truncate max-w-[240px] sm:max-w-md">
              {chapterTitle}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              id="toggle-source-drawer-btn"
              onClick={openSource}
              className={`${hasSource ? '' : 'hidden '}inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer`}
              title="View Original Raw Source text (S)"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path>
                <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path>
              </svg>
              <span className="hidden sm:inline">Source</span>
            </button>

            <ReaderPrefsPopover />

            <a
              id="reader-settings-btn"
              href={settingsHref}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
              title="Open Reader & AI Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"></circle>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
              </svg>
              <span className="hidden sm:inline">Settings</span>
            </a>
          </div>
        </div>
      </header>
    </>
  );
}
