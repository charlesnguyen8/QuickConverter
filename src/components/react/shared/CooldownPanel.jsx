import React, { useEffect, useState } from 'react';

const COOLDOWN_KEY = 'quickconverter_queue_cooldown';
const DEFAULTS = { enabled: true, minSec: 180, maxSec: 300 };

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
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(key, String(val));
  } catch (e) {}
}

export function readCooldown() {
  let cfg = { ...DEFAULTS };
  try {
    const raw = getStored(COOLDOWN_KEY, null);
    if (raw) cfg = { ...cfg, ...JSON.parse(raw) };
  } catch (e) {}
  return cfg;
}

function formatSecondsHuman(sec) {
  const s = Math.round(sec);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem === 0 ? `${m} min` : `${m}m ${rem}s`;
}

export default function CooldownPanel({ variant = 'full', ids = {}, className = '' }) {
  const compact = variant === 'compact';
  const [cooldown, setCooldown] = useState(DEFAULTS);

  useEffect(() => {
    setCooldown(readCooldown());
    if (typeof window === 'undefined') return undefined;
    const onChange = () => setCooldown(readCooldown());
    window.addEventListener('queue-cooldown-changed', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('queue-cooldown-changed', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);

  const persist = (changes) => {
    const next = { ...readCooldown(), ...changes };
    setCooldown(next);
    setStored(COOLDOWN_KEY, JSON.stringify(next));
    const q = typeof window !== 'undefined' ? window.DownloadQueueService : null;
    if (q && typeof q.setCooldownConfig === 'function') q.setCooldownConfig(next);
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof Event !== 'undefined') {
      window.dispatchEvent(new Event('queue-cooldown-changed'));
    }
  };

  const badge = !cooldown.enabled
    ? {
      text: compact ? 'Off' : 'Off (no wait)',
      cls: compact
        ? 'text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-700 text-slate-400 border border-slate-600'
        : 'text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700'
    }
    : {
      text: compact
        ? `${Math.round(cooldown.minSec / 60)}–${Math.round(cooldown.maxSec / 60)}m`
        : `${formatSecondsHuman(cooldown.minSec)} ~ ${formatSecondsHuman(cooldown.maxSec)}`,
      cls: compact
        ? 'text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30'
        : 'text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30'
    };
  const toggleLabelClass = cooldown.enabled
    ? (compact ? 'text-[10px] font-mono font-bold text-amber-400' : 'text-xs font-bold text-amber-400 font-mono')
    : (compact ? 'text-[10px] font-mono font-semibold text-slate-400' : 'text-xs font-semibold text-slate-400 font-mono');

  const toggle = (
    <label className="relative inline-flex items-center justify-center min-h-10 min-w-10 cursor-pointer flex-shrink-0" title="Wait a random time between chapter downloads">
      <input type="checkbox" id={ids.toggle} className="sr-only peer" checked={cooldown.enabled} onChange={(e) => persist({ enabled: e.target.checked })} />
      <div className={compact
        ? "w-8 h-4.5 cooldown-popup-track rounded-full peer-focus:outline-none peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-3.5 after:w-3.5 after:transition-all relative"
        : "w-11 h-6 cooldown-slider-track rounded-full peer-focus:outline-none peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all relative"}
      ></div>
    </label>
  );

  if (compact) {
    return (
      <div className={`flex items-center justify-between gap-2 px-3 py-1 rounded-lg bg-slate-800/60 border border-slate-700/60 ${className}`}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs">⏳</span>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[11px] font-bold text-slate-200">Rate Limit Cooldown</span>
              <span id={ids.badge} className={badge.cls}>{badge.text}</span>
            </div>
            <p className="text-[10px] text-slate-400 truncate">Wait between chapter downloads</p>
          </div>
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          <span id={ids.toggleLabel} className={toggleLabelClass}>{cooldown.enabled ? 'ON' : 'OFF'}</span>
          {toggle}
        </div>
      </div>
    );
  }

  const numberInput = (id, value, min, max, onValue) => (
    <div className="flex items-center rounded-lg border border-slate-700 bg-slate-950 overflow-hidden focus-within:border-amber-500 focus-within:ring-1 focus-within:ring-amber-500/40 transition">
      <input
        type="number"
        id={id}
        min={min}
        max={max}
        step="5"
        value={value}
        onChange={(e) => {
          const parsed = parseInt(e.target.value, 10);
          if (!Number.isNaN(parsed)) onValue(parsed);
        }}
        className="cooldown-number-input flex-1 min-w-0 min-h-10 px-3 py-1.5 text-xs font-mono font-bold"
      />
      <span className="px-2.5 py-1.5 text-[11px] font-mono font-semibold text-slate-400 bg-slate-900 border-l border-slate-700/80 select-none flex-shrink-0">seconds</span>
    </div>
  );

  return (
    <div className={`rounded-xl bg-slate-800/40 border border-slate-700/60 p-4 sm:p-5 flex flex-col gap-3.5 shadow-sm ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0 text-base">⏳</div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-100">Rate Limit Cooldown</h3>
              <span id={ids.badge} className={badge.cls}>{badge.text}</span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Wait a random time between chapters for every download, translated or not, so sites and translation APIs do not block you.</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span id={ids.toggleLabel} className={toggleLabelClass}>{cooldown.enabled ? 'ON' : 'OFF'}</span>
          {toggle}
        </div>
      </div>

      <div id={ids.inputs} className={`grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-slate-700/60 ${cooldown.enabled ? '' : 'opacity-40 pointer-events-none'}`}>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-slate-300">Minimum Wait</span>
            <span id={ids.minLabel} className="text-slate-400 font-mono font-medium">{formatSecondsHuman(cooldown.minSec)}</span>
          </div>
          {numberInput(ids.min, cooldown.minSec, '10', '600', (v) => persist({ minSec: Math.max(10, v), maxSec: Math.max(Math.max(10, v), cooldown.maxSec) }))}
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-slate-300">Maximum Wait</span>
            <span id={ids.maxLabel} className="text-slate-400 font-mono font-medium">{formatSecondsHuman(cooldown.maxSec)}</span>
          </div>
          {numberInput(ids.max, cooldown.maxSec, '10', '1200', (v) => persist({ maxSec: Math.max(cooldown.minSec, v) }))}
        </div>
      </div>
    </div>
  );
}
