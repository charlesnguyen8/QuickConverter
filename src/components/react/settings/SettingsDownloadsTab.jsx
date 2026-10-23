import React, { useCallback, useEffect, useState } from 'react';

function getStored(key, fallback) {
  if (typeof window !== 'undefined' && window.StorageService && typeof window.StorageService.getPreference === 'function') {
    try { return window.StorageService.getPreference(key, fallback); } catch (e) {}
  }
  if (typeof localStorage !== 'undefined') {
    const value = localStorage.getItem(key);
    return value === null || value === undefined ? fallback : value;
  }
  return fallback;
}

function setStored(key, val) {
  if (typeof window !== 'undefined' && window.StorageService && typeof window.StorageService.setPreference === 'function') {
    try { window.StorageService.setPreference(key, val); return; } catch (e) {}
  }
  try { if (typeof localStorage !== 'undefined') localStorage.setItem(key, String(val)); } catch (e) {}
}

function readCooldown() {
  let cfg = { enabled: true, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 };
  try {
    const raw = getStored('quickconverter_queue_cooldown', null);
    if (raw) cfg = { ...cfg, ...JSON.parse(raw) };
  } catch (e) {}
  return cfg;
}

function formatSecHuman(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    return m > 0 ? `sec (${h}h ${m}m)` : `sec (${h}h)`;
  }
  const m = Math.floor(s / 60);
  return `sec (${m}m)`;
}

export default function SettingsDownloadsTab({ onSaved }) {
  const [cooldown, setCooldown] = useState({ enabled: true, minSec: 180, maxSec: 300, errorCooldownSec: 4500, maxRetries: 3 });

  useEffect(() => {
    setCooldown(readCooldown());
  }, []);

  const notify = useCallback((message) => {
    if (typeof onSaved === 'function') onSaved(message);
  }, [onSaved]);

  const persistCooldown = (next) => {
    setCooldown(next);
    const q = typeof window !== 'undefined' ? window.DownloadQueueService : null;
    if (q && typeof q.setCooldownConfig === 'function') q.setCooldownConfig(next);
    else setStored('quickconverter_queue_cooldown', JSON.stringify(next));
    notify('Queue cooldown settings saved');
  };

  const cooldownNumber = (value, min, current, key) => {
    const parsed = parseInt(value, 10);
    if (Number.isNaN(parsed)) return;
    persistCooldown({ ...current, [key]: Math.max(min, parsed) });
  };

  return (
    <>
      <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-5 shadow-sm backdrop-blur flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-200">Rate Limit Cooldown</h3>
            <p className="text-xs text-slate-400">Randomized wait between chapters for every download, translated or not, so sites and translation APIs do not block you.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input type="checkbox" id="queue-cooldown-toggle" className="sr-only peer" checked={cooldown.enabled} onChange={(e) => persistCooldown({ ...cooldown, enabled: e.target.checked })} />
            <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-indigo-500/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
          </label>
        </div>

        <div id="queue-cooldown-inputs-container" className={`grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-700/60 ${cooldown.enabled ? '' : 'opacity-50 pointer-events-none'}`}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="queue-cooldown-min" className="text-xs font-semibold text-slate-300">Minimum Wait</label>
            <div className="flex items-center rounded-lg border border-slate-700 bg-slate-900 overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/50">
              <input
                type="number"
                id="queue-cooldown-min"
                min="10"
                max="600"
                step="5"
                value={cooldown.minSec}
                onChange={(e) => cooldownNumber(e.target.value, 10, cooldown, 'minSec')}
                className="flex-1 min-w-0 px-3 py-2 bg-transparent text-sm font-mono font-bold text-slate-100 focus:outline-none"
              />
              <span className="px-3 py-2 text-xs font-mono font-semibold text-slate-400 bg-slate-800 border-l border-slate-700 select-none flex-shrink-0">sec (3m)</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="queue-cooldown-max" className="text-xs font-semibold text-slate-300">Maximum Wait</label>
            <div className="flex items-center rounded-lg border border-slate-700 bg-slate-900 overflow-hidden focus-within:border-indigo-500 focus-within:ring-1 focus-within:ring-indigo-500/50">
              <input
                type="number"
                id="queue-cooldown-max"
                min="10"
                max="1200"
                step="5"
                value={cooldown.maxSec}
                onChange={(e) => {
                  const parsed = parseInt(e.target.value, 10);
                  if (!Number.isNaN(parsed)) persistCooldown({ ...cooldown, maxSec: Math.max(cooldown.minSec, parsed) });
                }}
                className="flex-1 min-w-0 px-3 py-2 bg-transparent text-sm font-mono font-bold text-slate-100 focus:outline-none"
              />
              <span className="px-3 py-2 text-xs font-mono font-semibold text-slate-400 bg-slate-800 border-l border-slate-700 select-none flex-shrink-0">sec (5m)</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-slate-700/60">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="queue-error-cooldown" className="text-xs font-semibold text-slate-300">Rate Limit / Failure Backoff Duration</label>
            <div className="flex items-center rounded-lg border border-slate-700 bg-slate-900 overflow-hidden focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-500/50">
              <input
                type="number"
                id="queue-error-cooldown"
                min="60"
                max="86400"
                step="60"
                value={cooldown.errorCooldownSec}
                onChange={(e) => cooldownNumber(e.target.value, 60, cooldown, 'errorCooldownSec')}
                className="flex-1 min-w-0 px-3 py-2 bg-transparent text-sm font-mono font-bold text-slate-100 focus:outline-none"
              />
              <span id="queue-error-cooldown-unit" className="px-3 py-2 text-xs font-mono font-semibold text-slate-400 bg-slate-800 border-l border-slate-700 select-none flex-shrink-0">{formatSecHuman(cooldown.errorCooldownSec)}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="queue-max-retries" className="text-xs font-semibold text-slate-300">Max Automatic Retries</label>
            <div className="flex items-center rounded-lg border border-slate-700 bg-slate-900 overflow-hidden focus-within:border-rose-500 focus-within:ring-1 focus-within:ring-rose-500/50">
              <input
                type="number"
                id="queue-max-retries"
                min="1"
                max="10"
                step="1"
                value={cooldown.maxRetries}
                onChange={(e) => cooldownNumber(e.target.value, 1, cooldown, 'maxRetries')}
                className="flex-1 min-w-0 px-3 py-2 bg-transparent text-sm font-mono font-bold text-slate-100 focus:outline-none"
              />
              <span className="px-3 py-2 text-xs font-mono font-semibold text-slate-400 bg-slate-800 border-l border-slate-700 select-none flex-shrink-0">attempts</span>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 leading-relaxed bg-slate-900/60 p-3 rounded-lg border border-slate-700/40">
          💡 When enabled, the queue will wait for a randomized duration between <strong>180s (3m)</strong> and <strong>300s (5m)</strong> after each chapter it downloads. If a download or translation fails, the failed chapter is placed back at the top of the queue and pauses for <strong>1 hour 15 minutes</strong> before retrying automatically. You can click <strong>Retry Now 🔄</strong> or <strong>Skip ⏩</strong> in the floating Queue Dock at any time.
        </p>
      </div>

    </>
  );
}
