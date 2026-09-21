// QuickConverter - Reusable Floating Download Queue Dock Component
// Solid, opaque dock displaying active & queued chapter downloads,
// with dedicated Collapse/Expand controls, Pause/Resume toggle, Clear All, and cancellation buttons.

(function (global) {
  function checkIsPopup() {
    if (typeof window === 'undefined') return false;
    return (
      (typeof window.location !== 'undefined' && window.location.pathname.includes('popup.html')) ||
      (typeof document !== 'undefined' && document.body && document.body.clientWidth <= 420) ||
      window.innerWidth <= 420
    );
  }

  function formatCooldownTime(sec) {
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

  function renderProgressRing(percent, size = 32, strokeWidth = 3, showText = true) {
    const pct = Math.max(0, Math.min(100, Math.round(percent || 0)));
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (pct / 100) * circumference;

    return `
      <div class="relative flex items-center justify-center flex-shrink-0" style="width: ${size}px; height: ${size}px;">
        <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="-rotate-90">
          <circle
            cx="${size / 2}"
            cy="${size / 2}"
            r="${radius}"
            fill="none"
            stroke="#334155"
            stroke-width="${strokeWidth}"
          />
          <circle
            cx="${size / 2}"
            cy="${size / 2}"
            r="${radius}"
            fill="none"
            stroke="#6366f1"
            stroke-width="${strokeWidth}"
            stroke-linecap="round"
            stroke-dasharray="${circumference.toFixed(1)}"
            stroke-dashoffset="${offset.toFixed(1)}"
            style="transition: stroke-dashoffset 0.8s ease;"
          />
        </svg>
        ${showText ? `<span class="absolute text-[9px] font-mono font-bold text-indigo-200 select-none">${pct}%</span>` : ''}
      </div>
    `;
  }

  class QueueDock {
    constructor() {
      const isPopup = checkIsPopup();
      // In compact popup window, start collapsed so it never covers popup content.
      // In full pages (novel, reader, library), start expanded by default.
      this.isExpanded = !isPopup;
      this.container = null;
      this._unsub = null;
      this._mounted = false;
      this.lastActiveId = null;
      this.lastTotal = -1;
      this.lastIsPaused = null;
      this.lastIsExpanded = null;
      this.lastIsCooldown = null;
    }

    /**
     * Mounts the queue dock onto the current document body.
     */
    mount() {
      if (this._mounted || typeof document === 'undefined') return;
      this._mounted = true;

      const isPopup = checkIsPopup();
      if (isPopup) {
        this.isExpanded = false;
      }

      // Create container element
      this.container = document.createElement('div');
      this.container.id = 'quickconverter-queue-dock';
      // In popup, pin at bottom-2 right-2; in full tabs, bottom-5 right-5
      this.container.className = isPopup
        ? 'fixed bottom-2 right-2 z-50 flex flex-col items-end transition-all duration-200 pointer-events-none opacity-0 translate-y-2'
        : 'fixed bottom-5 right-5 z-50 flex flex-col items-end transition-all duration-200 pointer-events-none opacity-0 translate-y-3';
      document.body.appendChild(this.container);

      // Subscribe to DownloadQueueService
      const queue = (typeof window !== 'undefined' && window.DownloadQueueService) ||
        (typeof global !== 'undefined' && global.DownloadQueueService);

      if (queue && typeof queue.subscribe === 'function') {
        this._unsub = queue.subscribe((state) => this.render(state));
      }
    }

    unmount() {
      if (this._unsub) {
        this._unsub();
        this._unsub = null;
      }
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
      this._mounted = false;
      this.lastActiveId = null;
      this.lastTotal = -1;
      this.lastIsPaused = null;
      this.lastIsExpanded = null;
      this.lastIsCooldown = null;
    }

    updateProgressInPlace(state) {
      if (!this.container) return false;
      const active = state?.activeTask;
      const cooldown = state?.cooldown;

      // Handle cooldown state updates in place
      if (cooldown && cooldown.active) {
        const timeStr = formatCooldownTime(cooldown.secondsRemaining);
        const totalSec = cooldown.totalSeconds || 180;
        const progressPct = Math.max(0, Math.min(100, Math.round(((totalSec - cooldown.secondsRemaining) / totalSec) * 100)));

        if (!this.isExpanded) {
          const textEl = this.container.querySelector('#queue-dock-pill-text');
          if (textEl) {
            textEl.textContent = cooldown.type === 'retry'
              ? `⚠️ Retry Ch. ${cooldown.nextChapterNumber || ''} in ${timeStr}`
              : `⏳ Wait ${timeStr}`;
          }
          return true;
        } else {
          const timeBadge = this.container.querySelector('#queue-dock-cooldown-time');
          if (timeBadge) {
            timeBadge.textContent = timeStr;
          }
          const barEl = this.container.querySelector('#queue-dock-cooldown-bar');
          if (barEl) {
            barEl.style.width = `${progressPct}%`;
          }
          return true;
        }
      }

      if (!active) return false;

      const percent = active.progress?.percent !== undefined ? active.progress.percent : 10;
      const progressText = active.progress?.text || (active.progress?.phase === 'translating' ? `Translating (${percent}%)...` : 'Translating...');

      if (!this.isExpanded) {
        // Collapsed Pill
        const ringEl = this.container.querySelector('#queue-dock-pill-ring');
        if (ringEl) {
          const circle = ringEl.querySelector('circle[stroke="#6366f1"]');
          if (circle) {
            const size = 20, strokeWidth = 2.5;
            const radius = (size - strokeWidth) / 2;
            const circumference = 2 * Math.PI * radius;
            const offset = circumference - (Math.max(0, Math.min(100, percent)) / 100) * circumference;
            circle.style.strokeDashoffset = offset.toFixed(1);
          }
        }
        const textEl = this.container.querySelector('#queue-dock-pill-text');
        if (textEl) {
          textEl.textContent = `Ch. ${active.chapterNumber} (${percent}%)`;
        }
        return true;
      } else {
        // Expanded Card
        const ringEl = this.container.querySelector('#queue-dock-expanded-ring');
        if (ringEl) {
          const circle = ringEl.querySelector('circle[stroke="#6366f1"]');
          if (circle) {
            const size = 34, strokeWidth = 3.5;
            const radius = (size - strokeWidth) / 2;
            const circumference = 2 * Math.PI * radius;
            const offset = circumference - (Math.max(0, Math.min(100, percent)) / 100) * circumference;
            circle.style.strokeDashoffset = offset.toFixed(1);
          }
          const textEl = ringEl.querySelector('span');
          if (textEl) {
            textEl.textContent = `${percent}%`;
          }
        }
        const subtitleEl = this.container.querySelector('#queue-dock-expanded-subtitle');
        if (subtitleEl) {
          subtitleEl.textContent = `${active.novelTitle || 'Novel'} • ${progressText}`;
        }
        const barEl = this.container.querySelector('#queue-dock-expanded-bar');
        if (barEl) {
          barEl.style.width = `${percent}%`;
        }
        return true;
      }
    }

    render(state) {
      if (!this.container) return;

      const active = state?.activeTask;
      const cooldown = state?.cooldown;
      const isCooldown = !!(cooldown && cooldown.active);
      const queue = state?.queue || [];
      const total = (active ? 1 : 0) + queue.length;
      const isPaused = !!state?.isPaused;
      const isPopup = checkIsPopup();
      const currentActiveId = active?.id || null;

      // Hide dock completely when queue is empty and not in cooldown
      if (total === 0 && !isCooldown) {
        this.container.classList.add('opacity-0', 'pointer-events-none');
        this.container.classList.remove('opacity-100', 'pointer-events-auto');
        this.container.innerHTML = '';
        this.lastActiveId = null;
        this.lastTotal = 0;
        this.lastIsPaused = false;
        this.lastIsExpanded = this.isExpanded;
        this.lastIsCooldown = false;
        return;
      }

      // In-place progress & cooldown update check: skip DOM rebuilding if structure is unchanged
      if (
        currentActiveId === this.lastActiveId &&
        isCooldown === this.lastIsCooldown &&
        total === this.lastTotal &&
        isPaused === this.lastIsPaused &&
        this.isExpanded === this.lastIsExpanded
      ) {
        if (this.updateProgressInPlace(state)) {
          return;
        }
      }

      this.lastActiveId = currentActiveId;
      this.lastTotal = total;
      this.lastIsPaused = isPaused;
      this.lastIsExpanded = this.isExpanded;
      this.lastIsCooldown = isCooldown;

      // Show dock
      this.container.classList.remove('opacity-0', 'pointer-events-none');
      this.container.classList.add('opacity-100', 'pointer-events-auto');

      // Collapsed Pill View (Compact, 100% solid/opaque, non-obtrusive)
      if (!this.isExpanded) {
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

        const pillTextClass = isRetry
          ? 'text-rose-300'
          : (isCooldown ? 'text-amber-300' : 'text-slate-100');

        this.container.innerHTML = `
          <button
            type="button"
            id="queue-dock-expand-btn"
            class="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-900 border ${borderClass} shadow-2xl text-white text-xs font-semibold hover:bg-slate-800 transition cursor-pointer select-none"
            title="Click to expand Download Queue details"
          >
            <div id="queue-dock-pill-ring" class="flex items-center justify-center flex-shrink-0">
              ${active && !isPaused ? renderProgressRing(percent, 20, 2.5, false) : (
                isRetry ? `
                  <span class="flex h-2.5 w-2.5 relative flex-shrink-0">
                    <span class="animate-ping bg-rose-400 absolute inline-flex h-full w-full rounded-full opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
                  </span>
                ` : (isCooldown ? `
                  <span class="flex h-2.5 w-2.5 relative flex-shrink-0">
                    <span class="animate-ping bg-amber-400 absolute inline-flex h-full w-full rounded-full opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>
                  </span>
                ` : `
                  <span class="flex h-2 w-2 relative flex-shrink-0">
                    <span class="${isPaused ? 'bg-amber-400' : 'animate-ping bg-indigo-400'} absolute inline-flex h-full w-full rounded-full opacity-75"></span>
                    <span class="relative inline-flex rounded-full h-2 w-2 ${isPaused ? 'bg-amber-500' : 'bg-indigo-500'}"></span>
                  </span>
                `)
              )}
            </div>
            <span id="queue-dock-pill-text" class="truncate max-w-[150px] sm:max-w-[200px] ${pillTextClass}">${activeText}</span>
            <span class="px-1.5 py-0.5 rounded-md bg-indigo-950 text-indigo-300 border border-indigo-500/40 text-[10px] font-mono font-bold flex-shrink-0">
              ${total}
            </span>
            <span class="text-[11px] font-medium text-indigo-300 flex items-center gap-0.5 pl-1 border-l border-slate-700 hover:text-white">
              <span>Expand</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="18 15 12 9 6 15"></polyline>
              </svg>
            </span>
          </button>
        `;

        const expandBtn = this.container.querySelector('#queue-dock-expand-btn');
        if (expandBtn) {
          expandBtn.onclick = () => {
            this.isExpanded = true;
            this.render(state);
          };
        }
        return;
      }

      // Expanded Card View (100% Solid/Opaque, No Transparency)
      let activeHtml = '';
      if (active) {
        const modelName = active.options?.translation?.model || 'deepseek';
        const percent = active.progress?.percent !== undefined ? active.progress.percent : 10;
        const progressText = active.progress?.text || (active.progress?.phase === 'translating' ? `Translating (${percent}%)...` : 'Translating...');

        activeHtml = `
          <div class="p-2.5 sm:p-3 rounded-xl bg-slate-800 border border-indigo-500 flex flex-col gap-2 shadow-md">
            <div class="flex items-center justify-between gap-2.5">
              <div class="flex items-center gap-2.5 min-w-0 flex-1">
                <div id="queue-dock-expanded-ring" class="flex items-center justify-center flex-shrink-0">
                  ${renderProgressRing(percent, 34, 3.5, true)}
                </div>
                <div class="flex flex-col min-w-0">
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-xs font-bold text-white truncate">${active.chapterTitle || 'Chapter ' + active.chapterNumber}</span>
                    <span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/40">${modelName}</span>
                  </div>
                  <span id="queue-dock-expanded-subtitle" class="text-[11px] text-indigo-300 truncate font-medium">${active.novelTitle || 'Novel'} • ${progressText}</span>
                </div>
              </div>
              <button
                type="button"
                data-cancel-id="${active.id}"
                class="queue-item-cancel-btn p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-700 transition cursor-pointer flex-shrink-0"
                title="Cancel active chapter and skip to next"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>
            <!-- Mini progress track under active task -->
            <div class="w-full bg-slate-900 rounded-full h-1 overflow-hidden border border-slate-700/50">
              <div id="queue-dock-expanded-bar" class="bg-indigo-500 h-full rounded-full transition-all duration-300" style="width: ${percent}%;"></div>
            </div>
          </div>
        `;
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

          activeHtml = `
            <div class="p-2.5 sm:p-3 rounded-xl bg-rose-950/40 border border-rose-500/60 flex flex-col gap-2 shadow-md">
              <div class="flex items-center justify-between gap-2.5">
                <div class="flex items-center gap-2.5 min-w-0 flex-1">
                  <span class="text-xl flex-shrink-0 animate-pulse">⚠️</span>
                  <div class="flex flex-col min-w-0">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span class="text-xs font-bold text-rose-200">Rate Limit / Failure Backoff</span>
                      <span id="queue-dock-cooldown-time" class="text-[11px] font-mono font-extrabold text-rose-300 bg-rose-900/80 px-1.5 py-0.5 rounded border border-rose-500/40">
                        ${timeStr}
                      </span>
                      <span class="text-[10px] font-mono text-rose-300/80 bg-rose-950 px-1.5 py-0.5 rounded border border-rose-800">
                        Attempt ${retryCount}/${maxRetries}
                      </span>
                    </div>
                    <span id="queue-dock-cooldown-subtitle" class="text-[11px] text-rose-300/90 truncate font-medium" title="${errorMsg}">
                      ${targetChapter} failed: ${errorMsg}
                    </span>
                  </div>
                </div>
                <div class="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    id="queue-dock-retry-now-btn"
                    class="px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 active:scale-95 shadow transition cursor-pointer flex items-center gap-1"
                    title="Retry failed chapter immediately without waiting"
                  >
                    <span>Retry Now 🔄</span>
                  </button>
                  <button
                    type="button"
                    id="queue-dock-skip-chapter-btn"
                    class="px-2 py-1 rounded-lg text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 active:scale-95 shadow transition cursor-pointer flex items-center gap-1"
                    title="Discard this chapter and skip to remaining chapters"
                  >
                    <span>Skip ⏩</span>
                  </button>
                </div>
              </div>
              <!-- Cooldown progress bar -->
              <div class="w-full bg-slate-900 rounded-full h-1 overflow-hidden border border-rose-500/30">
                <div id="queue-dock-cooldown-bar" class="bg-rose-500 h-full rounded-full transition-all duration-1000" style="width: ${progressPct}%;"></div>
              </div>
            </div>
          `;
        } else {
          activeHtml = `
            <div class="p-2.5 sm:p-3 rounded-xl bg-amber-950/40 border border-amber-500/60 flex flex-col gap-2 shadow-md">
              <div class="flex items-center justify-between gap-2.5">
                <div class="flex items-center gap-2.5 min-w-0 flex-1">
                  <span class="text-xl flex-shrink-0 animate-pulse">⏳</span>
                  <div class="flex flex-col min-w-0">
                    <div class="flex items-center gap-1.5 flex-wrap">
                      <span class="text-xs font-bold text-amber-200">Rate Limit Cooldown</span>
                      <span id="queue-dock-cooldown-time" class="text-[11px] font-mono font-extrabold text-amber-300 bg-amber-900/80 px-1.5 py-0.5 rounded border border-amber-500/40">
                        ${timeStr}
                      </span>
                    </div>
                    <span id="queue-dock-cooldown-subtitle" class="text-[11px] text-amber-300/80 truncate font-medium">
                      Waiting before ${targetChapter}...
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  id="queue-dock-skip-cooldown-btn"
                  class="px-2.5 py-1 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-500 active:scale-95 shadow transition cursor-pointer flex items-center gap-1 flex-shrink-0"
                  title="Skip wait and start downloading next chapter immediately"
                >
                  <span>Skip ⏩</span>
                </button>
              </div>
              <!-- Cooldown progress bar -->
              <div class="w-full bg-slate-900 rounded-full h-1 overflow-hidden border border-amber-500/30">
                <div id="queue-dock-cooldown-bar" class="bg-amber-400 h-full rounded-full transition-all duration-1000" style="width: ${progressPct}%;"></div>
              </div>
            </div>
          `;
        }
      } else if (isPaused) {
        activeHtml = `
          <div class="p-2.5 sm:p-3 rounded-xl bg-slate-800 border border-amber-500 text-xs text-amber-300 flex items-center gap-2 shadow-md">
            <span class="text-sm">⏸</span>
            <span>Queue is paused. Click <strong>Resume</strong> to continue.</span>
          </div>
        `;
      }

      let queueListHtml = '';
      const listMaxH = isPopup ? 'max-h-28' : 'max-h-48';
      if (queue.length > 0) {
        queueListHtml = `
          <div class="flex flex-col gap-1.5 ${listMaxH} overflow-y-auto pr-1 select-none">
            ${queue.map((task, idx) => `
              <div class="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-800 border border-slate-700 text-xs hover:border-slate-600 transition group shadow-sm">
                <div class="flex items-center gap-2 min-w-0 flex-1">
                  <span class="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-700 flex-shrink-0">
                    #${idx + 1}
                  </span>
                  <span class="text-slate-200 truncate font-medium">${task.chapterTitle || 'Chapter ' + task.chapterNumber}</span>
                </div>
                <button
                  type="button"
                  data-cancel-id="${task.id}"
                  class="queue-item-cancel-btn p-1 rounded text-slate-500 hover:text-rose-400 hover:bg-slate-700 transition cursor-pointer flex-shrink-0"
                  title="Remove Chapter ${task.chapterNumber} from queue"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                  </svg>
                </button>
              </div>
            `).join('')}
          </div>
        `;
      }

      // Responsive card width: in popup, strictly bounded to fit popup; in tabs, standard width
      const cardWidth = isPopup
        ? 'w-[calc(100vw-1rem)] max-w-[344px]'
        : 'w-80 sm:w-96';

      this.container.innerHTML = `
        <div class="${cardWidth} rounded-2xl bg-slate-900 border border-slate-700 shadow-2xl p-3.5 sm:p-4 flex flex-col gap-3 select-none">
          <!-- Dock Header -->
          <div class="flex items-center justify-between pb-2.5 border-b border-slate-800 gap-2">
            <div class="flex items-center gap-2 min-w-0">
              <span class="text-base flex-shrink-0">📥</span>
              <span class="text-xs font-bold text-slate-100 truncate">Download Queue</span>
              <span class="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-indigo-950 text-indigo-300 border border-indigo-500/40 flex-shrink-0">
                ${total}
              </span>
            </div>

            <div class="flex items-center gap-1.5 flex-shrink-0">
              <!-- Pause / Resume Button -->
              <button
                type="button"
                id="queue-dock-pause-btn"
                class="px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer flex items-center gap-1 ${isPaused ? 'bg-emerald-950 text-emerald-300 hover:bg-emerald-900 border border-emerald-500/60' : 'bg-amber-950 text-amber-300 hover:bg-amber-900 border border-amber-500/60'}"
                title="${isPaused ? 'Resume queued downloads' : 'Pause queue (finishes current chapter)'}"
              >
                <span>${isPaused ? '▶ Resume' : '⏸ Pause'}</span>
              </button>

              <!-- Clear All Button -->
              <button
                type="button"
                id="queue-dock-clear-btn"
                class="px-2 py-1 rounded text-[11px] font-medium text-slate-400 hover:text-rose-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition cursor-pointer"
                title="Clear all waiting chapters and abort active"
              >
                Clear All
              </button>

              <!-- Prominent Collapse Button -->
              <button
                type="button"
                id="queue-dock-collapse-btn"
                class="px-2 py-1 rounded text-[11px] font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 hover:text-white border border-slate-700 hover:border-slate-600 transition cursor-pointer flex items-center gap-1"
                title="Collapse queue dock into small pill"
              >
                <span>Collapse</span>
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>
          </div>

          <!-- Active Task Area -->
          ${activeHtml}

          <!-- Queue List Area -->
          ${queueListHtml}
        </div>
      `;

      // Wire Event Handlers
      const collapseBtn = this.container.querySelector('#queue-dock-collapse-btn');
      if (collapseBtn) {
        collapseBtn.onclick = () => {
          this.isExpanded = false;
          this.render(state);
        };
      }

      const pauseBtn = this.container.querySelector('#queue-dock-pause-btn');
      if (pauseBtn) {
        pauseBtn.onclick = () => {
          const q = (typeof window !== 'undefined' && window.DownloadQueueService);
          if (q) {
            if (isPaused) q.resume();
            else q.pause();
          }
        };
      }

      const clearBtn = this.container.querySelector('#queue-dock-clear-btn');
      if (clearBtn) {
        clearBtn.onclick = () => {
          const q = (typeof window !== 'undefined' && window.DownloadQueueService);
          if (q) q.clearAll();
        };
      }

      const skipBtn = this.container.querySelector('#queue-dock-skip-cooldown-btn');
      if (skipBtn) {
        skipBtn.onclick = () => {
          const q = (typeof window !== 'undefined' && window.DownloadQueueService);
          if (q && typeof q.skipCooldown === 'function') {
            q.skipCooldown();
          }
        };
      }

      const retryNowBtn = this.container.querySelector('#queue-dock-retry-now-btn');
      if (retryNowBtn) {
        retryNowBtn.onclick = () => {
          const q = (typeof window !== 'undefined' && window.DownloadQueueService);
          if (q && typeof q.retryNow === 'function') {
            q.retryNow();
          } else if (q && typeof q.skipCooldown === 'function') {
            q.skipCooldown();
          }
        };
      }

      const skipChapterBtn = this.container.querySelector('#queue-dock-skip-chapter-btn');
      if (skipChapterBtn) {
        skipChapterBtn.onclick = () => {
          const q = (typeof window !== 'undefined' && window.DownloadQueueService);
          if (q && typeof q.skipFailedChapter === 'function') {
            q.skipFailedChapter();
          }
        };
      }

      // Wire individual cancel/remove buttons
      const cancelBtns = this.container.querySelectorAll('.queue-item-cancel-btn');
      cancelBtns.forEach((btn) => {
        btn.onclick = (e) => {
          e.stopPropagation();
          const taskId = btn.dataset.cancelId;
          const q = (typeof window !== 'undefined' && window.DownloadQueueService);
          if (q && taskId) {
            q.remove(taskId);
          }
        };
      });
    }
  }

  // Singleton instance
  const QueueDockInstance = new QueueDock();

  // Auto-mount when DOM is ready
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => QueueDockInstance.mount());
    } else {
      QueueDockInstance.mount();
    }
  }

  // Export to global scope
  QueueDockInstance.renderProgressRing = renderProgressRing;
  if (typeof window !== 'undefined') {
    window.QueueDock = QueueDockInstance;
    window.renderProgressRing = renderProgressRing;
  }
  if (typeof module !== 'undefined' && module.exports) {
    QueueDock.renderProgressRing = renderProgressRing;
    module.exports = QueueDock;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
