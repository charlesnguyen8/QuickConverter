import React, { useCallback, useEffect, useState } from 'react';

const FALLBACK_THUMB = 'https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp';

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

function NovelCard({ novel, stats }) {
  const downloaded = stats.downloadedCount || 0;
  const total = novel.totalChapters || stats.totalChapters || 100;
  const percent = total > 0 ? Math.min(100, Math.round((downloaded / total) * 100)) : 0;
  const formattedSize = stats.formattedSize || '0 B';
  const thumbnailSrc = novel.thumbnail || FALLBACK_THUMB;

  return (
    <div
      className="flex flex-col rounded-lg border border-slate-800 bg-slate-800/80 hover:border-indigo-500/60 hover:bg-slate-800 hover:shadow-md transition overflow-hidden shadow-sm group cursor-pointer"
      title={`Click to view chapters for ${novel.title}`}
      onClick={() => { window.location.href = `novel.html?id=${encodeURIComponent(novel.id)}`; }}
    >
      <div className="aspect-[3/4] w-full bg-slate-900 overflow-hidden relative">
        <img
          src={thumbnailSrc}
          alt={novel.title}
          className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-300"
          onError={(e) => { e.currentTarget.src = FALLBACK_THUMB; }}
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
        </div>

        <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-700/50">
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
    </div>
  );
}

export default function LibraryView() {
  const [novels, setNovels] = useState([]);
  const [diskUsage, setDiskUsage] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage) {
      console.error('StorageService not available');
      return;
    }
    try {
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
    return () => window.removeEventListener('novel-added', onAdded);
  }, [load]);

  const count = novels.length;
  const countText = `${count} Novel${count === 1 ? '' : 's'} Managed`;
  const diskText = diskUsage ? `Disk: ${diskUsage.formatted}` : 'Disk: Available';
  const diskTitle = diskUsage
    ? `Browser Storage: ${diskUsage.formatted} used across ${diskUsage.totalDownloadedChapters} saved chapters${diskUsage.formattedQuota ? ` • Quota: ~${diskUsage.formattedQuota}` : ''}${diskUsage.percentOfQuota ? ` (${diskUsage.percentOfQuota}%)` : ''}`
    : 'Current Browser Disk Usage for Saved Novels';

  return (
    <>
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-30 px-6 py-4">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
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

          <div id="library-stats" className="flex items-center gap-2 text-xs font-medium">
            <span id="library-novel-count" className="px-2.5 py-1 rounded-full bg-slate-800 border border-slate-700/80 text-slate-300">
              {countText}
            </span>
            <span id="library-disk-badge" className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-indigo-300 transition" title={diskTitle}>
              <span>💾</span>
              <span id="library-disk-text">{diskText}</span>
            </span>
            <add-book-button></add-book-button>
            <SettingsLink />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto w-full px-6 py-8 flex-1 flex flex-col gap-6">
        {loaded && count === 0 ? (
          <div id="library-grid" className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-16 h-16 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-3xl mb-4">
              📚
            </div>
            <h2 className="text-lg font-bold text-slate-200">Your Library is Empty</h2>
            <p className="text-sm text-slate-400 max-w-sm mt-1 mb-4">
              Paste a link from any supported novel website to add it to your library.
            </p>
            <add-book-button></add-book-button>
          </div>
        ) : (
          <div id="library-grid" className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
            {novels.map(({ novel, stats }) => (
              <NovelCard key={novel.id} novel={novel} stats={stats} />
            ))}
          </div>
        )}
      </main>
    </>
  );
}
