import React, { useEffect, useState } from 'react';

function ago(iso, now) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const minutes = Math.floor((now - t) / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

const BASE = 'inline-flex items-center gap-1.5 min-h-10 px-2.5 py-1 rounded-full border text-xs font-medium transition';

export function SyncStatusBadgeView({ status, now, onSyncNow }) {
  if (!status || status.state === 'off' || status.state === 'waiting') return null;
  if (status.state === 'signed-out') {
    return (
      <a id="library-sync-status" href="settings.html?tab=storage" className={`${BASE} bg-slate-800 border-slate-700/80 text-slate-300 hover:text-white`}>
        <span aria-hidden="true">☁️</span>
        <span>Sign in to sync</span>
      </a>
    );
  }
  let text = 'Syncing…';
  let tone = 'bg-indigo-500/10 border-indigo-500/25 text-indigo-300';
  let title = 'Syncing your library with Google Drive';
  if (status.state === 'error') {
    text = 'Sync failed, retrying soon';
    tone = 'bg-rose-500/10 border-rose-500/30 text-rose-300';
    title = status.error || 'Sync failed';
  } else if (status.state === 'idle') {
    const when = ago(status.lastSyncAt, now);
    text = when ? `Synced ${when}` : 'Synced';
    tone = 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300';
    title = 'Synced with Google Drive. Tap to sync now.';
  }
  return (
    <button
      type="button"
      id="library-sync-status"
      onClick={onSyncNow}
      disabled={status.state === 'syncing'}
      className={`${BASE} ${tone} cursor-pointer disabled:cursor-default`}
      title={title}
    >
      <span aria-hidden="true">☁️</span>
      <span>{text}</span>
      {status.state === 'error' && status.error ? <span className="sr-only">{status.error}</span> : null}
    </button>
  );
}

export default function SyncStatusBadge() {
  const [status, setStatus] = useState(() => {
    const auto = typeof window !== 'undefined' ? window.AutoSync : null;
    return auto && typeof auto.status === 'function' ? auto.status() : null;
  });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const onStatus = (e) => setStatus(e.detail || null);
    window.addEventListener('library-sync-status', onStatus);
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      window.removeEventListener('library-sync-status', onStatus);
      clearInterval(tick);
    };
  }, []);

  useEffect(() => { setNow(Date.now()); }, [status]);

  const onSyncNow = () => {
    const auto = window.AutoSync;
    if (auto && typeof auto.syncSoon === 'function') auto.syncSoon();
  };

  return <SyncStatusBadgeView status={status} now={now} onSyncNow={onSyncNow} />;
}

export function refreshOnSync(win, eventName) {
  if (!win || typeof win.addEventListener !== 'function') return () => {};
  const onSynced = () => win.dispatchEvent(new Event(eventName));
  win.addEventListener('library-synced', onSynced);
  return () => win.removeEventListener('library-synced', onSynced);
}
