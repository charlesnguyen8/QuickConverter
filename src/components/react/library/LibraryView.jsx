import React, { useCallback, useEffect, useState } from 'react';
import AddBookButton from '../shared/AddBookButton.jsx';
import SyncStatusBadge from '../shared/SyncStatus.jsx';
import { coverSrc, showDefaultCover } from '../shared/novelCover.js';
import { continueHref, lastReadLabel } from '../shared/lastRead.jsx';
import { RecycleBinPage } from './RecycleBin.jsx';

function SettingsLink() {
  return (
    <a
      id="library-settings-btn"
      href="settings.html?from=library"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-slate-300 hover:text-white transition shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 cursor-pointer"
      title="Open QuickConverter Settings"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
      <span>Settings</span>
    </a>
  );
}

function RecycleBinLink({ count }) {
  return (
    <a
      id="library-bin-btn"
      href="#recycle-bin"
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-800 hover:bg-slate-700 border border-slate-700/80 text-slate-300 hover:text-white transition shadow-sm cursor-pointer"
      title="Open the Recycle Bin"
    >
      <span aria-hidden="true">🗑️</span>
      <span>Recycle Bin</span>
      {count > 0 ? <span className="px-1.5 rounded-full bg-slate-700 text-[10px] font-mono">{count}</span> : null}
    </a>
  );
}

const VIEW_MODE_KEY = 'quickconverter_library_view';
const VIEW_MODES = ['cards', 'list'];

function defaultStore() {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch (e) {
    return null;
  }
}

export function readLibraryViewMode(store = defaultStore()) {
  try {
    const saved = store ? store.getItem(VIEW_MODE_KEY) : null;
    return VIEW_MODES.includes(saved) ? saved : 'cards';
  } catch (e) {
    return 'cards';
  }
}

export function saveLibraryViewMode(mode, store = defaultStore()) {
  try {
    if (store) store.setItem(VIEW_MODE_KEY, mode);
  } catch (e) {}
}

export function LibraryViewToggle({ mode, onChange }) {
  const option = (value, label, icon) => (
    <button
      type="button"
      id={`library-view-${value}`}
      aria-pressed={mode === value}
      title={`Show books as ${label.toLowerCase()}`}
      onClick={() => onChange(value)}
      className={`inline-flex items-center gap-1.5 min-h-10 px-3 rounded-lg text-xs font-semibold transition cursor-pointer ${mode === value ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-300 hover:text-white hover:bg-slate-700'}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
  return (
    <div role="group" aria-label="Library view" className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-800 border border-slate-700/80">
      {option('cards', 'Cards', (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      ))}
      {option('list', 'List', (
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M8 6h13M8 12h13M8 18h13" />
          <circle cx="4" cy="6" r="1" />
          <circle cx="4" cy="12" r="1" />
          <circle cx="4" cy="18" r="1" />
        </svg>
      ))}
    </div>
  );
}

function MenuButton({ novel, open, onToggle, className = '' }) {
  return (
    <button
      type="button"
      id={`novel-menu-${novel.id}`}
      aria-label={`More options for ${novel.title}`}
      aria-haspopup="menu"
      aria-expanded={open}
      onClick={(e) => { e.stopPropagation(); onToggle(); }}
      className={`${className} min-h-10 min-w-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition cursor-pointer`}
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="2" />
        <circle cx="12" cy="12" r="2" />
        <circle cx="12" cy="19" r="2" />
      </svg>
    </button>
  );
}

function novelProgress(novel, stats) {
  const downloaded = stats.downloadedCount || 0;
  const total = novel.totalChapters || stats.totalChapters || 100;
  const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
  return { downloaded, total, percent, formattedSize: stats.formattedSize || '0 B' };
}

function openNovel(novel) {
  window.location.href = `novel.html?id=${encodeURIComponent(novel.id)}`;
}

export function NovelCardMenu({ novel, onDelete, onClose, placement = 'bottom-14 right-2' }) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); onClose(); }} />
      <div
        role="menu"
        className={`absolute ${placement} z-50 min-w-[10rem] rounded-xl bg-slate-900 border border-slate-700 shadow-2xl p-1 flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          role="menuitem"
          id={`novel-delete-${novel.id}`}
          onClick={() => { onClose(); onDelete(novel); }}
          className="min-h-10 px-3 rounded-lg text-left text-xs font-semibold text-rose-300 hover:bg-rose-900/40 transition cursor-pointer"
        >
          Delete
        </button>
      </div>
    </>
  );
}

export function DeleteNovelDialog({ novel, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" onClick={onCancel}>
      <div className="w-full max-w-sm rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-4 flex flex-col gap-3 text-slate-100" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm font-bold">Delete this book?</span>
        <span className="text-xs text-slate-400">
          <strong className="text-slate-200">{novel.title}</strong> moves to the Recycle Bin with its saved chapters. You can restore it from there for 60 days; after that it is deleted for good.
        </span>
        <div className="flex justify-end gap-2">
          <button type="button" id="cancel-delete-btn" onClick={onCancel} className="min-h-10 px-3 rounded-lg text-xs font-semibold text-slate-300 bg-slate-800 border border-slate-700 hover:bg-slate-700 transition cursor-pointer">
            Cancel
          </button>
          <button type="button" id="confirm-delete-btn" onClick={onConfirm} className="min-h-10 px-3 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition cursor-pointer">
            Move to Recycle Bin
          </button>
        </div>
      </div>
    </div>
  );
}

export function NovelCard({ novel, stats, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { total, percent, formattedSize } = novelProgress(novel, stats);
  const thumbnailSrc = coverSrc(novel.thumbnail);
  const continueLink = continueHref(novel);

  return (
    <div
      className="relative flex flex-col rounded-lg border border-slate-800 bg-slate-800/80 hover:border-indigo-500/60 hover:bg-slate-800 hover:shadow-md transition shadow-sm group cursor-pointer"
      title={`Click to view chapters for ${novel.title}`}
      onClick={() => openNovel(novel)}
    >
      <div className="aspect-[3/4] w-full bg-slate-900 overflow-hidden relative rounded-t-lg">
        <img
          src={thumbnailSrc}
          alt={novel.title}
          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
          onError={showDefaultCover}
        />
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-900/80 backdrop-blur border border-slate-700/60 text-slate-200 shadow">
          {total} Chs
        </div>
      </div>

      <div className="p-4 flex flex-col flex-1 justify-between gap-3">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-indigo-400 font-medium mb-1">
            <span>🌐</span>
            <span className="truncate">{novel.domain || 'wetriedtls.com'}</span>
          </div>
          <h3 className="font-bold text-sm text-slate-100 group-hover:text-indigo-300 transition line-clamp-2 leading-snug">
            {novel.title}
          </h3>
          {continueLink ? (
            <a
              href={continueLink}
              data-continue-reading="true"
              onClick={(e) => e.stopPropagation()}
              title={novel.lastRead.title ? `Continue: ${novel.lastRead.title}` : 'Continue reading'}
              className="mt-2 inline-flex items-center gap-1.5 min-h-10 px-3 rounded-lg text-xs font-semibold text-indigo-200 bg-indigo-500/15 border border-indigo-500/30 hover:bg-indigo-500/25 transition max-w-full"
            >
              <span aria-hidden="true">▶</span>
              <span className="truncate">Last read: {lastReadLabel(novel)}</span>
            </a>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5 pt-2 pr-11 border-t border-slate-700/50">
          <div className="w-full bg-slate-700/60 rounded-full h-2 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-2 rounded-full transition-all duration-500" style={{ width: `${percent}%` }} />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <div className="flex items-center gap-1">
              <span>Progress:</span>
              <span className="text-indigo-400 font-semibold">{percent}%</span>
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-400 bg-slate-900/60 px-1.5 py-0.5 rounded border border-slate-700/50" title="Disk storage used by this novel">
              <span>💾</span>
              <span>{formattedSize}</span>
            </span>
          </div>
        </div>
      </div>
      <MenuButton novel={novel} open={menuOpen} onToggle={() => setMenuOpen((open) => !open)} className="absolute bottom-2 right-2" />
      {menuOpen ? <NovelCardMenu novel={novel} onDelete={onDelete || (() => {})} onClose={() => setMenuOpen(false)} /> : null}
    </div>
  );
}

export function NovelListRow({ novel, stats, onDelete }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { downloaded, total, percent, formattedSize } = novelProgress(novel, stats);
  const continueLink = continueHref(novel);

  return (
    <li
      className="relative flex items-center gap-3 p-2.5 sm:p-3 rounded-lg border border-slate-800 bg-slate-800/80 hover:border-indigo-500/60 hover:bg-slate-800 transition shadow-sm group cursor-pointer"
      title={`Click to view chapters for ${novel.title}`}
      onClick={() => openNovel(novel)}
    >
      <img
        src={coverSrc(novel.thumbnail)}
        alt={novel.title}
        onError={showDefaultCover}
        className="w-12 h-16 rounded object-cover bg-slate-900 flex-shrink-0 self-start"
      />
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11px] text-indigo-400 font-medium min-w-0">
          <span aria-hidden="true">🌐</span>
          <span className="truncate">{novel.domain || 'wetriedtls.com'}</span>
        </div>
        <h3 className="font-bold text-sm text-slate-100 group-hover:text-indigo-300 transition line-clamp-1 leading-snug">
          {novel.title}
        </h3>
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-1 min-w-[3rem] bg-slate-700/60 rounded-full h-1.5 overflow-hidden">
            <div className="bg-gradient-to-r from-indigo-500 to-purple-500 h-1.5 rounded-full transition-all duration-500" style={{ width: `${percent}%` }} />
          </div>
          <span className="text-[11px] text-indigo-400 font-semibold">{percent}%</span>
          <span className="text-[11px] text-slate-400 font-mono" title="Saved chapters of all chapters">{downloaded}/{total}</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-400" title="Disk storage used by this novel">
            <span aria-hidden="true">💾</span>
            <span>{formattedSize}</span>
          </span>
        </div>
        {continueLink ? (
          <a
            href={continueLink}
            data-continue-reading="true"
            onClick={(e) => e.stopPropagation()}
            title={novel.lastRead.title ? `Continue: ${novel.lastRead.title}` : 'Continue reading'}
            className="self-start inline-flex items-center gap-1.5 min-h-10 px-3 rounded-lg text-xs font-semibold text-indigo-200 bg-indigo-500/15 border border-indigo-500/30 hover:bg-indigo-500/25 transition max-w-full"
          >
            <span aria-hidden="true">▶</span>
            <span className="truncate">Last read: {lastReadLabel(novel)}</span>
          </a>
        ) : null}
      </div>
      <MenuButton novel={novel} open={menuOpen} onToggle={() => setMenuOpen((open) => !open)} className="flex-shrink-0 self-start" />
      {menuOpen ? <NovelCardMenu novel={novel} placement="top-12 right-2" onDelete={onDelete || (() => {})} onClose={() => setMenuOpen(false)} /> : null}
    </li>
  );
}

export default function LibraryView() {
  const [novels, setNovels] = useState([]);
  const [diskUsage, setDiskUsage] = useState(null);
  const [loaded, setLoaded] = useState(false);
  const [binCount, setBinCount] = useState(0);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [viewMode, setViewMode] = useState(() => readLibraryViewMode());
  const [showBin, setShowBin] = useState(() => typeof window !== 'undefined' && !!window.location && window.location.hash === '#recycle-bin');

  const load = useCallback(async () => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage) {
      console.error('StorageService not available');
      return;
    }
    try {
      if (typeof storage.purgeRecycleBin === 'function') {
        try {
          await storage.purgeRecycleBin();
          setBinCount((await storage.getRecycleBin()).length);
        } catch (binErr) {
          console.warn('Failed to check the recycle bin:', binErr);
        }
      }
      const list = await storage.getManagedNovels();
      let disk = null;
      if (typeof storage.getDiskUsage === 'function') {
        try {
          disk = await storage.getDiskUsage();
        } catch (diskErr) {
          console.warn('Failed to calculate disk usage:', diskErr);
        }
      }
      const enriched = await Promise.all(list.map(async (novel) => {
        let stats = { downloadedCount: 0, formattedSize: '0 B', totalChapters: novel.totalChapters || 100 };
        try {
          stats = await storage.getNovelDownloadStats(novel.id, novel.totalChapters || 100);
        } catch (e) {}
        return { novel, stats };
      }));
      setNovels(enriched);
      setDiskUsage(disk);
    } catch (err) {
      console.error('Error loading library:', err);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    const onAdded = () => load();
    window.addEventListener('novel-added', onAdded);
    window.addEventListener('library-synced', onAdded);
    return () => {
      window.removeEventListener('novel-added', onAdded);
      window.removeEventListener('library-synced', onAdded);
    };
  }, [load]);

  useEffect(() => {
    const onHash = () => setShowBin(window.location.hash === '#recycle-bin');
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const confirmDelete = useCallback(async () => {
    const novel = pendingDelete;
    setPendingDelete(null);
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!novel || !storage) return;
    try {
      await storage.moveNovelToBin(novel.id);
    } catch (err) {
      console.error('Error deleting novel:', err);
    }
    load();
  }, [pendingDelete, load]);

  const chooseView = useCallback((mode) => {
    setViewMode(mode);
    saveLibraryViewMode(mode);
  }, []);

  const leaveBin = useCallback(() => {
    if (window.location.hash === '#recycle-bin') window.history.back();
    setShowBin(false);
  }, []);

  const count = novels.length;
  const countText = `${count} Novel${count === 1 ? '' : 's'} Managed`;
  const diskText = diskUsage ? `Disk: ${diskUsage.formatted}` : 'Disk: Available';
  const diskTitle = diskUsage
    ? `Browser Storage: ${diskUsage.formatted} used across ${diskUsage.totalDownloadedChapters} saved chapters${diskUsage.formattedQuota ? ` • Quota: ~${diskUsage.formattedQuota}` : ''}${diskUsage.percentOfQuota ? ` (${diskUsage.percentOfQuota}%)` : ''}`
    : 'Current Browser Disk Usage for Saved Novels';

  return (
    <>
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30 px-4 sm:px-6 py-3 sm:py-4">
        <div className="max-w-6xl mx-auto flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold text-base shadow-sm">
              Q
            </div>
            <div>
              <h1 className="text-xl font-bold leading-tight bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                QuickConverter Library
              </h1>
              <p className="text-xs text-slate-400">
                Managed novels &amp; chapter download status
              </p>
            </div>
          </div>

          <div id="library-stats" className="flex items-center gap-2 text-xs font-medium flex-wrap">
            <span id="library-novel-count" className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700/80 text-slate-300">
              {countText}
            </span>
            <span id="library-disk-badge" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 transition" title={diskTitle}>
              <span>💾</span>
              <span id="library-disk-text">{diskText}</span>
            </span>
            <SyncStatusBadge />
            <AddBookButton />
            <RecycleBinLink count={binCount} />
            <SettingsLink />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 sm:py-8 flex-1 flex flex-col gap-6">
        {showBin ? (
          <RecycleBinPage onBack={leaveBin} onChanged={load} />
        ) : loaded && count === 0 ? (
          <div id="library-grid" className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-3xl mb-4">
              📚
            </div>
            <h2 className="text-lg font-bold text-slate-200">Your Library is Empty</h2>
            <p className="text-sm text-slate-400 max-w-sm mt-1 mb-4">
              Paste a link from any supported novel website to add it to your library.
            </p>
            <AddBookButton />
          </div>
        ) : (
          <>
            <div className="flex justify-end -mb-2">
              <LibraryViewToggle mode={viewMode} onChange={chooseView} />
            </div>
            {viewMode === 'list' ? (
              <ul id="library-grid" className="flex flex-col gap-2">
                {novels.map(({ novel, stats }) => (
                  <NovelListRow key={novel.id} novel={novel} stats={stats} onDelete={setPendingDelete} />
                ))}
              </ul>
            ) : (
              <div id="library-grid" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                {novels.map(({ novel, stats }) => (
                  <NovelCard key={novel.id} novel={novel} stats={stats} onDelete={setPendingDelete} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
      {pendingDelete ? <DeleteNovelDialog novel={pendingDelete} onConfirm={confirmDelete} onCancel={() => setPendingDelete(null)} /> : null}
    </>
  );
}
