import React, { useCallback, useEffect, useState } from 'react';
import SettingsBackupFile from './SettingsBackupFile.jsx';

const STATUS_CONNECTED = 'flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30';
const STATUS_OFFLINE = 'flex-shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-700 text-slate-300 border border-slate-600';
const FEEDBACK_OK = 'text-xs font-medium text-emerald-400';
const FEEDBACK_ERR = 'text-xs font-medium text-rose-400';
const FEEDBACK_INFO = 'text-xs font-medium text-slate-400';

export function SettingsDriveCard({ cloud, busy, feedback, formatWhen, onSignIn, onSync, onUpload, onDownload, onSignOut, autoSync = true, onToggleAuto }) {
  const connected = !!(cloud && cloud.connected);
  let when = 'Not synced yet.';
  if (cloud && cloud.lastSyncAt) when = `Last sync: ${formatWhen(cloud.lastSyncAt)}`;
  else if (cloud && cloud.lastBackupAt) when = `Last backup: ${formatWhen(cloud.lastBackupAt)}`;
  return (
    <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-sm backdrop-blur flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <span>☁️</span>
            <span>Google Drive Sync</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Sync keeps your library (novels, chapters, name lists, reading position, settings) the same on every device: it merges this device with your Google Drive copy, keeping the newer version of each item. API keys are never uploaded.
          </p>
        </div>
        <span className={connected ? STATUS_CONNECTED : STATUS_OFFLINE}>
          {connected ? 'Connected' : 'Not signed in'}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!connected ? (
          <button type="button" onClick={onSignIn} disabled={busy} className="inline-flex items-center gap-1.5 min-h-10 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            <span>Sign in with Google</span>
          </button>
        ) : null}
        <button type="button" id="cloud-sync-btn" onClick={onSync} disabled={!connected || busy} className="inline-flex items-center gap-1.5 min-h-10 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
          <span>Sync now</span>
        </button>
        <button type="button" id="cloud-upload-btn" onClick={onUpload} disabled={!connected || busy} className="inline-flex items-center gap-1.5 min-h-10 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" title="Overwrite the Google Drive copy with this device's library">
          <span>Replace Drive copy</span>
        </button>
        <button type="button" id="cloud-download-btn" onClick={onDownload} disabled={!connected || busy} className="inline-flex items-center gap-1.5 min-h-10 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed" title="Overwrite this device's library with the Google Drive copy">
          <span>Replace this device</span>
        </button>
        {connected ? (
          <button type="button" onClick={onSignOut} disabled={busy} className="inline-flex items-center gap-1.5 min-h-10 px-3 py-1.5 rounded-lg text-xs font-semibold bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
            <span>Sign out</span>
          </button>
        ) : null}
      </div>

      <label htmlFor="auto-sync-toggle" className="flex items-center justify-between gap-3 min-h-10 cursor-pointer select-none">
        <span className="flex flex-col">
          <span className="text-xs font-semibold text-slate-200">Sync automatically</span>
          <span className="text-[11px] text-slate-400">When the library opens, after changes, and every 15 minutes while it is open</span>
        </span>
        <input
          type="checkbox"
          id="auto-sync-toggle"
          checked={autoSync !== false}
          onChange={(e) => onToggleAuto && onToggleAuto(e.target.checked)}
          className="w-5 h-5 accent-indigo-500 cursor-pointer flex-shrink-0"
        />
      </label>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-400">
        <span>{when}</span>
        <span className={feedback.cls}>{feedback.text}</span>
      </div>
    </div>
  );
}

export default function SettingsStorageTab() {
  const [disk, setDisk] = useState(null);
  const [novelCount, setNovelCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [cloud, setCloud] = useState({ connected: false, lastBackupAt: null });
  const [autoSync, setAutoSync] = useState(() => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    return !storage || storage.getPreference('quickconverter_auto_sync', 'true') !== 'false';
  });
  const [feedback, setFeedback] = useState({ text: '', cls: FEEDBACK_INFO });
  const [busy, setBusy] = useState(false);

  const loadStorage = useCallback(async () => {
    const storage = typeof window !== 'undefined' ? window.StorageService : null;
    if (!storage) { setLoading(false); return; }
    try {
      const d = await storage.getDiskUsage();
      const getNovelsFn = storage.getManagedNovels || storage.getAllNovels;
      const list = getNovelsFn ? await getNovelsFn.call(storage) : [];
      setDisk(d);
      setNovelCount(list.length);
    } catch (e) {
      console.error('Failed to load storage data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshCloud = useCallback(async () => {
    const CloudSync = typeof window !== 'undefined' ? window.CloudSyncService : null;
    if (!CloudSync) return;
    try { setCloud(await CloudSync.getStatus()); } catch (e) {}
  }, []);

  useEffect(() => { loadStorage(); refreshCloud(); }, [loadStorage, refreshCloud]);

  const setMsg = (text, cls) => setFeedback({ text, cls: cls || FEEDBACK_INFO });

  const formatWhen = (iso) => {
    const d = new Date(iso);
    return isNaN(d.getTime()) ? iso : d.toLocaleString();
  };

  const onRefreshStorage = async () => {
    setBusy(true);
    await loadStorage();
    setBusy(false);
  };

  const onSignIn = async () => {
    const CloudSync = window.CloudSyncService;
    if (!CloudSync) return;
    setMsg('Requesting Google sign-in...');
    try { await CloudSync.connect(); setMsg('Signed in ✓', FEEDBACK_OK); }
    catch (e) { setMsg(e.message || 'Sign-in failed', FEEDBACK_ERR); }
    await refreshCloud();
  };

  const onToggleAuto = (on) => {
    setAutoSync(on);
    const storage = window.StorageService;
    if (storage) storage.setPreference('quickconverter_auto_sync', on ? 'true' : 'false');
  };

  const onSync = async () => {
    const CloudSync = window.CloudSyncService;
    if (!CloudSync) return;
    setBusy(true);
    setMsg('Syncing...');
    try {
      const r = await CloudSync.sync();
      const got = r.received;
      const changes = got.novels + got.chapters + got.deleted;
      setMsg(changes ? `Synced ✓ ${got.novels} novels and ${got.chapters} chapters updated here, ${got.deleted} removed` : 'Synced ✓ already up to date', FEEDBACK_OK);
    } catch (e) { setMsg(e.message || 'Sync failed', FEEDBACK_ERR); }
    setBusy(false);
    await refreshCloud();
    await loadStorage();
  };

  const onBackup = async () => {
    const CloudSync = window.CloudSyncService;
    if (!CloudSync) return;
    if (!window.confirm('Replace the Google Drive copy with this device? Changes from other devices that are not synced here will be lost. Use Sync now to merge instead.')) return;
    setBusy(true);
    setMsg('Backing up...');
    try {
      const r = await CloudSync.backup();
      setMsg(`Backed up ${r.novels} novels, ${r.chapters} chapters ✓`, FEEDBACK_OK);
    } catch (e) { setMsg(e.message || 'Backup failed', FEEDBACK_ERR); }
    setBusy(false);
    await refreshCloud();
  };

  const onRestore = async () => {
    const CloudSync = window.CloudSyncService;
    if (!CloudSync) return;
    if (!window.confirm('Restore from Google Drive? This replaces ALL local novels, chapters and settings. This cannot be undone.')) return;
    setBusy(true);
    setMsg('Restoring...');
    try {
      const r = await CloudSync.restore();
      setMsg(`Restored ${r.novels} novels, ${r.chapters} chapters ✓`, FEEDBACK_OK);
    } catch (e) { setMsg(e.message || 'Restore failed', FEEDBACK_ERR); }
    setBusy(false);
    await refreshCloud();
    await loadStorage();
  };

  const onSignOut = async () => {
    const CloudSync = window.CloudSyncService;
    if (!CloudSync) return;
    try { await CloudSync.signOut(); setMsg('Signed out'); }
    catch (e) { setMsg(e.message || 'Sign-out failed', FEEDBACK_ERR); }
    await refreshCloud();
  };

  const usedDisplay = disk ? `${disk.formatted} used` : (loading ? 'Calculating...' : 'Storage unavailable');
  const quotaDisplay = `Quota: ~${(disk && disk.formattedQuota) || '120 GB'}`;
  let percent = 0.01;
  if (disk && disk.percentOfQuota) percent = Math.max(0.01, parseFloat(disk.percentOfQuota));
  else if (disk && disk.quotaBytes > 0) percent = Math.max(0.01, (disk.bytes / disk.quotaBytes) * 100);
  const chapterCount = disk ? (disk.totalDownloadedChapters || 0) : 0;
  const barWidth = Math.min(100, Math.max(1, percent));

  return (
    <>
      <div className="flex flex-col gap-1">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <span>💾</span>
          <span>Storage &amp; Quota Management</span>
        </h2>
        <p className="text-xs text-slate-400">
          Overview of local IndexedDB disk usage and chapter caching for offline reading.
        </p>
      </div>

      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-sm backdrop-blur flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">IndexedDB Storage Usage</h3>
            <p className="text-xs text-slate-400">Total estimated disk space occupied by cached novel chapters and artwork.</p>
          </div>
          <button
            type="button"
            id="refresh-storage-btn"
            onClick={onRefreshStorage}
            disabled={busy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-700 hover:bg-slate-600 text-slate-200 hover:text-white transition cursor-pointer disabled:opacity-50"
          >
            <span>↻ Recalculate</span>
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs font-mono font-medium">
            <span id="storage-used-display" className="text-indigo-400 font-bold">{usedDisplay}</span>
            <span id="storage-quota-display" className="text-slate-400">{quotaDisplay}</span>
          </div>
          <div className="w-full h-3 bg-slate-900 rounded-full overflow-hidden border border-slate-700/80">
            <div id="storage-progress-bar" className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-300" style={{ width: `${barWidth}%` }} />
          </div>
          <span id="storage-percent-display" className="text-[11px] text-slate-500 text-right">{percent.toFixed(2)}% of browser quota utilized</span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-700/60">
          <div className="flex flex-col gap-0.5 bg-slate-900/50 p-3 rounded-lg border border-slate-700/40">
            <span className="text-[11px] text-slate-400">Managed Novels</span>
            <span className="text-base font-bold text-slate-200">{novelCount}</span>
          </div>
          <div className="flex flex-col gap-0.5 bg-slate-900/50 p-3 rounded-lg border border-slate-700/40">
            <span className="text-[11px] text-slate-400">Downloaded Chapters</span>
            <span className="text-base font-bold text-indigo-400">{chapterCount}</span>
          </div>
          <div className="flex flex-col gap-0.5 bg-slate-900/50 p-3 rounded-lg border border-slate-700/40 col-span-2 sm:col-span-1">
            <span className="text-[11px] text-slate-400">Storage Engine</span>
            <span className="text-base font-bold text-emerald-400">IndexedDB</span>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between">
          <p className="text-xs text-slate-400">Need to free up disk space? You can remove completed novels from your Library.</p>
          <a href="library.html" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition">
            <span>Go to Library →</span>
          </a>
        </div>
      </div>

      <SettingsDriveCard
        cloud={cloud}
        busy={busy}
        feedback={feedback}
        formatWhen={formatWhen}
        onSignIn={onSignIn}
        onSync={onSync}
        onUpload={onBackup}
        onDownload={onRestore}
        onSignOut={onSignOut}
        autoSync={autoSync}
        onToggleAuto={onToggleAuto}
      />

      <SettingsBackupFile onImported={loadStorage} />
    </>
  );
}
