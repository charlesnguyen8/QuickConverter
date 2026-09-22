import React, { useEffect, useState } from 'react';

export function detectPopup() {
  if (typeof window === 'undefined') return false;
  return (
    (typeof window.location !== 'undefined' && window.location.pathname.includes('popup.html')) ||
    (typeof document !== 'undefined' && document.body && document.body.clientWidth <= 420) ||
    window.innerWidth <= 420
  );
}

export function formatCooldownTime(sec) {
  const s = Math.max(0, Math.round(sec || 0));
  if (s >= 3600) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const rem = s % 60;
    return `${h}h ${m}m ${rem < 10 ? '0' : ''}${rem}s`;
  }
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m > 0) {
    return `${m}m ${rem < 10 ? '0' : ''}${rem}s`;
  }
  return `${rem}s`;
}

export function ProgressRing({ percent, size = 32, strokeWidth = 3, showText = true }) {
  const pct = Math.max(0, Math.min(100, Math.round(percent || 0)));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;
  return (
    <div className="relative flex items-center justify-center flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#334155" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#6366f1"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference.toFixed(1)}
          strokeDashoffset={offset.toFixed(1)}
          style={{ transition: 'stroke-dashoffset 0.8s ease' }}
        />
      </svg>
      {showText ? (
        <span className="absolute text-[9px] font-mono font-bold text-indigo-200 select-none">{pct}%</span>
      ) : null}
    </div>
  );
}

function CancelIcon({ size = 13 }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export default function QueueDock({ queueService, isPopup }) {
  const popup = typeof isPopup === 'boolean' ? isPopup : detectPopup();
  const service = queueService || (typeof window !== 'undefined' ? window.DownloadQueueService : null);

  const [expanded, setExpanded] = useState(!popup);
  const [state, setState] = useState(() => {
    if (service && typeof service.getState === 'function') return service.getState();
    return null;
  });

  useEffect(() => {
    if (!service || typeof service.subscribe !== 'function') return undefined;
    const unsubscribe = service.subscribe((next) => setState(next));
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [service]);

  const active = state?.activeTask;
  const cooldown = state?.cooldown;
  const isCooldown = !!(cooldown && cooldown.active);
  const queue = state?.queue || [];
  const total = (active ? 1 : 0) + queue.length;
  const isPaused = !!state?.isPaused;

  if (total === 0 && !isCooldown) return null;

  const call = (method) => {
    if (service && typeof service[method] === 'function') service[method]();
  };

  const wrapperClass = `fixed ${popup ? 'bottom-2 right-2' : 'bottom-5 right-5'} z-50 flex flex-col items-end transition-all duration-200`;

  if (!expanded) {
    const percent = active?.progress?.percent !== undefined ? active.progress.percent : (active ? 10 : 0);
    const isRetry = isCooldown && cooldown.type === 'retry';
    let activeText = `${total} Queued`;
    if (isPaused) {
      activeText = '⏸ Paused';
    } else if (isCooldown) {
      activeText = isRetry
        ? `⚠️ Retry Ch. ${cooldown.nextChapterNumber || ''} in ${formatCooldownTime(cooldown.secondsRemaining)}`
        : `⏳ Wait ${formatCooldownTime(cooldown.secondsRemaining)}`;
    } else if (active) {
      activeText = `Ch. ${active.chapterNumber} (${percent}%)`;
    }

    const borderClass = isRetry
      ? 'border-rose-500 hover:border-rose-400'
      : (isCooldown ? 'border-amber-500 hover:border-amber-400' : 'border-indigo-500 hover:border-indigo-400');
    const pillTextClass = isRetry ? 'text-rose-300' : (isCooldown ? 'text-amber-300' : 'text-slate-100');

    let indicator;
    if (active && !isPaused) {
      indicator = <ProgressRing percent={percent} size={20} strokeWidth={2.5} showText={false} />;
    } else if (isRetry) {
      indicator = (
        <span className="flex h-2.5 w-2.5 relative flex-shrink-0">
          <span className="animate-ping bg-rose-400 absolute inline-flex h-full w-full rounded-full opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500" />
        </span>
      );
    } else if (isCooldown) {
      indicator = (
        <span className="flex h-2.5 w-2.5 relative flex-shrink-0">
          <span className="animate-ping bg-amber-400 absolute inline-flex h-full w-full rounded-full opacity-75" />
          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
        </span>
      );
    } else {
      indicator = (
        <span className="flex h-2 w-2 relative flex-shrink-0">
          <span className={`${isPaused ? 'bg-amber-400' : 'animate-ping bg-indigo-400'} absolute inline-flex h-full w-full rounded-full opacity-75`} />
          <span className={`relative inline-flex rounded-full h-2 w-2 ${isPaused ? 'bg-amber-500' : 'bg-indigo-500'}`} />
        </span>
      );
    }

    return (
      <div className={wrapperClass}>
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className={`flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-900 border ${borderClass} shadow-2xl text-white text-xs font-semibold hover:bg-slate-800 transition cursor-pointer select-none`}
          title="Click to expand Download Queue details"
        >
          <div className="flex items-center justify-center flex-shrink-0">{indicator}</div>
          <span className={`truncate max-w-[150px] sm:max-w-[200px] ${pillTextClass}`}>{activeText}</span>
          <span className="px-1.5 py-0.5 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-500/40 text-[10px] font-mono font-bold flex-shrink-0">
            {total}
          </span>
          <span className="text-[11px] font-medium text-indigo-300 flex items-center gap-0.5 pl-1 border-l border-slate-700 hover:text-white">
            <span>Expand</span>
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="18 15 12 9 6 15" />
            </svg>
          </span>
        </button>
      </div>
    );
  }

  let activeSection = null;
  if (active) {
    const modelName = active.options?.translation?.model || 'deepseek';
    const percent = active.progress?.percent !== undefined ? active.progress.percent : 10;
    const progressText = active.progress?.text || (active.progress?.phase === 'translating' ? `Translating (${percent}%)...` : 'Translating...');
    activeSection = (
      <div className="p-2.5 sm:p-3 rounded-xl bg-slate-800 border border-indigo-500 flex flex-col gap-2 shadow-md">
        <div className="flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            <div className="flex items-center justify-center flex-shrink-0">
              <ProgressRing percent={percent} size={34} strokeWidth={3.5} showText />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-white truncate">{active.chapterTitle || `Chapter ${active.chapterNumber}`}</span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/40">{modelName}</span>
              </div>
              <span className="text-[11px] text-indigo-300 truncate font-medium">
                {active.novelTitle || 'Novel'} • {progressText}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => { if (service && active.id) service.remove(active.id); }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-700 transition cursor-pointer flex-shrink-0"
            title="Cancel active chapter and skip to next"
          >
            <CancelIcon size={14} />
          </button>
        </div>
        <div className="w-full bg-slate-900 rounded-full h-1 overflow-hidden border border-slate-700/50">
          <div className="bg-indigo-500 h-full rounded-full transition-all duration-300" style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  } else if (isCooldown) {
    const isRetry = cooldown.type === 'retry';
    const timeStr = formatCooldownTime(cooldown.secondsRemaining);
    const totalSec = cooldown.totalSeconds || (isRetry ? 4500 : 180);
    const progressPct = Math.max(0, Math.min(100, Math.round(((totalSec - cooldown.secondsRemaining) / totalSec) * 100)));
    const targetChapter = cooldown.nextChapterTitle || (cooldown.nextChapterNumber ? `Chapter ${cooldown.nextChapterNumber}` : 'next chapter');

    if (isRetry) {
      const retryCount = cooldown.retryCount || 1;
      const maxRetries = cooldown.maxRetries || 3;
      const errorMsg = cooldown.error || 'Rate limit or connection error';
      activeSection = (
        <div className="p-2.5 sm:p-3 rounded-xl bg-rose-950/40 border border-rose-500/60 flex flex-col gap-2 shadow-md">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className="text-xl flex-shrink-0 animate-pulse">⚠️</span>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-rose-200">Rate Limit / Failure Backoff</span>
                  <span className="text-[11px] font-mono font-extrabold text-rose-300 bg-rose-900/80 px-1.5 py-0.5 rounded border border-rose-500/40">{timeStr}</span>
                  <span className="text-[10px] font-mono text-rose-300/80 bg-rose-950 px-1.5 py-0.5 rounded border border-rose-800">
                    Attempt {retryCount}/{maxRetries}
                  </span>
                </div>
                <span className="text-[11px] text-rose-300/90 truncate font-medium" title={errorMsg}>
                  {targetChapter} failed: {errorMsg}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                type="button"
                onClick={() => { if (service && typeof service.retryNow === 'function') service.retryNow(); else call('skipCooldown'); }}
                className="px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 active:scale-95 shadow transition cursor-pointer flex items-center gap-1"
                title="Retry failed chapter immediately without waiting"
              >
                <span>Retry Now 🔄</span>
              </button>
              <button
                type="button"
                onClick={() => { if (service && typeof service.skipFailedChapter === 'function') service.skipFailedChapter(); }}
                className="px-2 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 active:scale-95 shadow transition cursor-pointer flex items-center gap-1"
                title="Discard this chapter and skip to remaining chapters"
              >
                <span>Skip ⏩</span>
              </button>
            </div>
          </div>
          <div className="w-full bg-slate-900 rounded-full h-1 overflow-hidden border border-rose-500/30">
            <div className="bg-rose-500 h-full rounded-full transition-all duration-1000" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      );
    } else {
      activeSection = (
        <div className="p-2.5 sm:p-3 rounded-xl bg-amber-950/40 border border-amber-500/60 flex flex-col gap-2 shadow-md">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <span className="text-xl flex-shrink-0 animate-pulse">⏳</span>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs font-bold text-amber-200">Rate Limit Cooldown</span>
                  <span className="text-[11px] font-mono font-extrabold text-amber-300 bg-amber-900/80 px-1.5 py-0.5 rounded border border-amber-500/40">{timeStr}</span>
                </div>
                <span className="text-[11px] text-amber-300/80 truncate font-medium">Waiting before {targetChapter}...</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => call('skipCooldown')}
              className="px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-95 shadow transition cursor-pointer flex items-center gap-1 flex-shrink-0"
              title="Skip wait and start downloading next chapter immediately"
            >
              <span>Skip ⏩</span>
            </button>
          </div>
          <div className="w-full bg-slate-900 rounded-full h-1 overflow-hidden border border-amber-500/30">
            <div className="bg-amber-400 h-full rounded-full transition-all duration-1000" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      );
    }
  } else if (isPaused) {
    activeSection = (
      <div className="p-2.5 sm:p-3 rounded-xl bg-slate-800 border border-amber-500 text-xs text-amber-300 flex items-center gap-2 shadow-md">
        <span className="text-sm">⏸</span>
        <span>Queue is paused. Click <strong>Resume</strong> to continue.</span>
      </div>
    );
  }

  const listMaxH = popup ? 'max-h-28' : 'max-h-48';
  const cardWidth = popup ? 'w-[calc(100vw-1rem)] max-w-[344px]' : 'w-80 sm:w-96';

  return (
    <div className={wrapperClass}>
      <div className={`${cardWidth} rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-3.5 sm:p-4 flex flex-col gap-3 select-none`}>
        <div className="flex items-center justify-between pb-2.5 border-b border-slate-800 gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-base flex-shrink-0">📥</span>
            <span className="text-xs font-bold text-slate-100 truncate">Download Queue</span>
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/40 flex-shrink-0">
              {total}
            </span>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => call(isPaused ? 'resume' : 'pause')}
              className={`px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 ${isPaused ? 'bg-emerald-950 text-emerald-300 hover:bg-emerald-900 border border-emerald-500/60' : 'bg-amber-950 text-amber-300 hover:bg-amber-900 border border-amber-500/60'}`}
              title={isPaused ? 'Resume queued downloads' : 'Pause queue (finishes current chapter)'}
            >
              <span>{isPaused ? '▶ Resume' : '⏸ Pause'}</span>
            </button>
            <button
              type="button"
              onClick={() => call('clearAll')}
              className="px-2 py-1 rounded text-[11px] font-medium text-slate-400 hover:text-rose-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer"
              title="Clear all waiting chapters and abort active"
            >
              Clear All
            </button>
            <button
              type="button"
              onClick={() => setExpanded(false)}
              className="px-2 py-1 rounded text-[11px] font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 hover:border-slate-600 transition cursor-pointer flex items-center gap-1"
              title="Collapse queue dock into small pill"
            >
              <span>Collapse</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>
        </div>

        {activeSection}

        {queue.length > 0 ? (
          <div className={`flex flex-col gap-1.5 ${listMaxH} overflow-y-auto pr-1 select-none`}>
            {queue.map((task, idx) => (
              <div key={task.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-800 border border-slate-700 text-xs hover:border-slate-600 transition group shadow-sm">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-700 flex-shrink-0">
                    #{idx + 1}
                  </span>
                  <span className="text-slate-200 truncate font-medium">{task.chapterTitle || `Chapter ${task.chapterNumber}`}</span>
                </div>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); if (service && task.id) service.remove(task.id); }}
                  className="p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-700 transition cursor-pointer flex-shrink-0"
                  title={`Remove Chapter ${task.chapterNumber} from queue`}
                >
                  <CancelIcon />
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
