import React, { useEffect, useState } from 'react';

const HIDE_AFTER_MS = { saved: 4000, error: 12000 };

function messageFor(status) {
  const n = status.chapterNumber;
  if (status.status === 'reading') return `Reading the image of chapter ${n}… (the first one loads the OCR model)`;
  if (status.status === 'saving') return `Saving chapter ${n}…`;
  if (status.status === 'saved') return `Saved chapter ${n}.`;
  if (status.status === 'error') return `Chapter ${n} was not saved. ${status.error || ''}`.trim();
  return '';
}

export function SiteSaveStatusView({ status, onDismiss }) {
  if (!status) return null;
  const text = messageFor(status);
  if (!text) return null;
  const tone = status.status === 'error'
    ? 'bg-rose-950/95 border-rose-500/40 text-rose-100'
    : status.status === 'saved'
      ? 'bg-emerald-950/95 border-emerald-500/40 text-emerald-100'
      : 'bg-slate-900/95 border-indigo-500/40 text-slate-100';
  return (
    <div
      id="site-save-status"
      role="status"
      className={`fixed left-4 right-4 bottom-4 z-50 mx-auto max-w-md flex items-center gap-3 px-4 py-3 rounded-xl border shadow-lg text-sm ${tone}`}
    >
      <span className="flex-1 min-w-0">{text}</span>
      {onDismiss ? (
        <button
          type="button"
          onClick={onDismiss}
          className="min-h-10 min-w-10 px-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white"
          aria-label="Dismiss"
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}

export default function SiteSaveStatus() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    const siteSave = typeof window !== 'undefined' ? window.SiteSave : null;
    if (!siteSave || typeof siteSave.onStatus !== 'function') return undefined;
    return siteSave.onStatus((update) => setStatus(update));
  }, []);

  useEffect(() => {
    const delay = status ? HIDE_AFTER_MS[status.status] : 0;
    if (!delay) return undefined;
    const timer = setTimeout(() => setStatus(null), delay);
    return () => clearTimeout(timer);
  }, [status]);

  return <SiteSaveStatusView status={status} onDismiss={() => setStatus(null)} />;
}
