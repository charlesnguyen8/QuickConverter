import React from 'react';
import AddBookButton from '../shared/AddBookButton.jsx';

const BADGES = {
  checking: {
    cls: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-700 text-slate-300',
    dot: null,
    text: 'Checking site...'
  },
  saved: {
    cls: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    dot: 'bg-emerald-400',
    text: 'Chapter Saved'
  },
  loading: {
    cls: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
    dot: 'bg-indigo-400',
    text: 'Chapter Loading'
  },
  managed: {
    cls: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    dot: 'bg-emerald-400',
    text: 'Already Managed'
  },
  detected: {
    cls: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
    dot: 'bg-indigo-400',
    text: 'Novel Detected'
  },
  supported: {
    cls: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
    dot: 'bg-emerald-400',
    text: 'Supported Site'
  },
  standard: {
    cls: 'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-700/60 text-slate-400 border border-slate-600/40',
    dot: null,
    text: 'Standard Mode'
  }
};

function StatusAction({ status, addBusy, onAddNovel }) {
  if (status.action !== 'add') return <div id="status-action" className="hidden pt-1"></div>;
  return (
    <div id="status-action" className="pt-1">
      <button
        id="add-novel-btn"
        type="button"
        disabled={addBusy}
        onClick={onAddNovel}
        className="w-full cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-white bg-indigo-500 transition hover:bg-indigo-600 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-sm flex items-center justify-center gap-1.5"
      >
        {addBusy ? (
          <>
            <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            <span>Populating Chapters...</span>
          </>
        ) : (
          <>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span>Manage This Novel</span>
          </>
        )}
      </button>
    </div>
  );
}

function NovelList({ novels, onOpenNovel, onDeleteNovel }) {
  if (novels.length === 0) {
    return (
      <div className="p-5 rounded-md bg-slate-800/60 border border-slate-700/50 text-center text-xs text-slate-500 italic">
        No novels currently managed.
      </div>
    );
  }
  return novels.map((novel) => (
    <div
      key={novel.id}
      className="flex items-center justify-between p-2.5 rounded-md bg-slate-800 border border-slate-700/80 hover:border-indigo-500/60 transition group cursor-pointer"
      title={`Click to view chapters for ${novel.title}`}
      onClick={() => onOpenNovel(novel)}
    >
      <div className="flex items-center gap-2.5 overflow-hidden flex-1 min-w-0 pr-2">
        <div className="w-8 h-8 rounded bg-slate-700/80 border border-slate-600/50 flex items-center justify-center flex-shrink-0 text-base">
          {novel.icon || '📖'}
        </div>
        <div className="flex flex-col overflow-hidden min-w-0">
          <span className="text-sm font-medium text-slate-200 group-hover:text-indigo-300 transition truncate">{novel.title}</span>
          <span className="text-xs text-slate-400 truncate">
            {novel.totalChapters ? `${novel.totalChapters} Chs • ` : ''}{novel.domain || 'wetriedtls.com'} • {novel.status || 'Active'}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/20">
          {novel.status || 'Active'}
        </span>
        <button
          type="button"
          className="p-1.5 rounded text-slate-500 hover:text-red-400 hover:bg-slate-700/80 transition focus:outline-none cursor-pointer flex-shrink-0"
          title={`Delete ${novel.title}`}
          onClick={(e) => { e.stopPropagation(); onDeleteNovel(novel); }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>
      </div>
    </div>
  ));
}

export default function PopupMainView({
  hidden,
  novels,
  status,
  addBusy,
  onOpenNovel,
  onDeleteNovel,
  onAddNovel,
  onOpenLibrary,
  onOpenSettings
}) {
  const badge = BADGES[status.variant] || BADGES.checking;
  const loose = status.variant === 'supported' || status.variant === 'standard';

  console.log('[PopupMainView] render', { hidden, novels: novels.length, variant: status.variant, action: status.action });

  return (
    <div id="view-main" className={`flex flex-col gap-3.5${hidden ? ' hidden' : ''}`}>
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-md bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-sm shadow-sm">
            Q
          </div>
          <h1 className="text-xl font-bold leading-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
            QuickConverter
          </h1>
        </div>
        <button
          type="button"
          id="settings-btn"
          onClick={onOpenSettings}
          className="flex items-center justify-center p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
          title="Settings"
          aria-label="Settings"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </header>

      <main className="flex flex-col gap-3.5">
        <section id="status-card" className="flex flex-col gap-2 rounded-md border border-slate-700 bg-slate-800 p-3.5 shadow-sm">
          <div className="flex items-center justify-between">
            <span id="badge" className={badge.cls}>
              {badge.dot ? <span className={`w-1.5 h-1.5 rounded-full ${badge.dot}`}></span> : null}
              {badge.text}
            </span>
            <span id="site-host" className="text-xs text-slate-400 font-mono truncate max-w-[140px]">{status.host || ''}</span>
          </div>
          <div id="status-message" className="text-sm text-slate-300 leading-relaxed">
            <p className={loose ? 'text-slate-300' : 'font-medium text-slate-100 truncate'}>
              {status.accent
                ? <>{status.titlePrefix}<span className={status.accentClass}>{status.accent}</span>{status.titleSuffix}</>
                : status.title}
            </p>
            <p className={`text-xs mt-0.5 ${status.subtitleClass || 'text-slate-400'}`}>{status.subtitle}</p>
          </div>
          <StatusAction status={status} addBusy={addBusy} onAddNovel={onAddNovel} />
        </section>

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-0.5">
            <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Managing these novel</h2>
            <div className="flex items-center gap-1.5">
              <AddBookButton compact />
              <span id="novel-count" className="text-xs text-indigo-400 font-medium bg-indigo-500/10 px-2 py-0.5 rounded-full border border-indigo-500/20">
                {novels.length} Novel{novels.length === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          <div id="novel-list" className="flex flex-col gap-1.5 overflow-y-auto max-h-[200px]">
            <NovelList novels={novels} onOpenNovel={onOpenNovel} onDeleteNovel={onDeleteNovel} />
          </div>
        </section>

        <div>
          <button
            type="button"
            id="open-library-btn"
            onClick={onOpenLibrary}
            className="w-full cursor-pointer rounded-md px-3 py-2 text-sm font-semibold text-white bg-indigo-500 transition hover:bg-indigo-600 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-indigo-500/50 shadow-sm flex items-center justify-center gap-2"
          >
            <span>Open Library</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
              <polyline points="15 3 21 3 21 9"></polyline>
              <line x1="10" y1="14" x2="21" y2="3"></line>
            </svg>
          </button>
        </div>
      </main>
    </div>
  );
}
