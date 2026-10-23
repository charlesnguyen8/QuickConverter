// QuickConverter - Centralized Chapter Download Queue Service
// Manages sequential FIFO download & AI translation tasks with concurrency control (1 task at a time),
// pause/resume, clear all, individual item cancellation, and cross-extension state broadcasting.

(function (global) {
  const STORAGE_KEY = 'quickconverter_download_queue';

  function resolveStorageService() {
    if (typeof global !== 'undefined' && global.StorageService) return global.StorageService;
    if (typeof window !== 'undefined' && window.StorageService) return window.StorageService;
    if (typeof self !== 'undefined' && self.StorageService) return self.StorageService;
    if (typeof module !== 'undefined' && typeof require === 'function') {
      try { return require('./storage.js'); } catch (e) {}
    }
    return null;
  }

  function resolvePlatform() {
    if (typeof global !== 'undefined' && global.Platform) return global.Platform;
    if (typeof module !== 'undefined' && typeof require === 'function') {
      try { return require('./platform.js'); } catch (e) {}
    }
    return null;
  }

  function nativeMessaging() {
    const platform = resolvePlatform();
    return platform && platform.messaging.isNative() ? platform.messaging : null;
  }

  // Asks the extension service worker; resolves null when it cannot answer.
  function askWorker(message) {
    const messaging = nativeMessaging();
    if (!messaging) return Promise.resolve(null);
    return messaging.send(message).then((response) => response || null, () => null);
  }

  // Fire-and-forget broadcast to the other extension pages (harmless when none are open).
  function tellWorker(message) {
    const messaging = nativeMessaging();
    if (messaging) messaging.send(message).catch(() => {});
  }

  function localArea() {
    const platform = resolvePlatform();
    return platform ? platform.storage.area('local') : null;
  }

  function nativeAlarms() {
    const platform = resolvePlatform();
    return platform && platform.alarms.isNative() ? platform.alarms : null;
  }

  // In the Chrome extension the runtime has an id; UI views have window and document,
  // the background service worker has neither. In Android (Capacitor/WebView), Electron
  // or Node.js tests there is no extension runtime.
  const platformAtLoad = resolvePlatform();
  const isExtension = !!(platformAtLoad && platformAtLoad.runtime.isExtension());
  const isBackgroundWorker = typeof window === 'undefined' && typeof document === 'undefined';
  // Execution owner is the entity responsible for actively executing tasks in-memory:
  // In Chrome extension: strictly the background service worker.
  // In Standalone / Android / Node: the current execution context.
  const isExecutionOwner = isBackgroundWorker || !isExtension;

  let keepAliveInterval = null;
  function updateKeepAlive(isWorking) {
    const platform = resolvePlatform();
    if (!platform || !platform.runtime.isExtension()) return;
    if (isWorking) {
      if (!keepAliveInterval) {
        keepAliveInterval = setInterval(() => { platform.runtime.ping(); }, 15000);
      }
    } else {
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
      }
    }
  }

  function chapterLabel(task) {
    if (!task) return '';
    return task.chapterTitle || (task.chapterNumber !== undefined && task.chapterNumber !== null ? `Chapter ${task.chapterNumber}` : '');
  }

  // What keeps the app working in the background (the app's notification text), or null when the
  // queue can rest: paused, empty, or waiting out a long error backoff.
  function backgroundWorkText(state) {
    if (!state || state.isPaused) return null;
    const queued = (state.queue || []).length;
    if (state.activeTask) {
      const task = state.activeTask;
      if (task.progress && task.progress.phase === 'needs-user') {
        return `Waiting for you: ${task.progress.text} · ${chapterLabel(task)}`;
      }
      const base = `Downloading ${task.novelTitle || 'Novel'} · ${chapterLabel(task)}`;
      return queued > 0 ? `${base} · ${queued} more queued` : base;
    }
    const cooldown = state.cooldown;
    if (queued > 0 && cooldown && cooldown.active && cooldown.type !== 'retry') {
      return `Waiting before ${cooldown.nextNovelTitle || 'Novel'} · ${cooldown.nextChapterTitle || ''} · ${queued} queued`;
    }
    return null;
  }

  let heldText = null;
  let watchingPageHide = false;
  function updateBackgroundHold(state) {
    if (!isExecutionOwner) return;
    const platform = resolvePlatform();
    const background = platform && platform.background;
    if (!background) return;
    const text = backgroundWorkText(state);
    if (text === heldText) return;
    heldText = text;
    const win = typeof window !== 'undefined' ? window : null;
    if (text && !watchingPageHide && win && typeof win.addEventListener === 'function') {
      watchingPageHide = true;
      win.addEventListener('pagehide', () => {
        if (heldText === null) return;
        heldText = null;
        Promise.resolve(background.release('downloads')).catch(() => {});
      });
    }
    const call = text ? background.hold(text, 'downloads') : background.release('downloads');
    Promise.resolve(call).catch(() => {});
  }

  class DownloadQueue {
    constructor() {
      this.activeTask = null;
      this.queue = [];
      this.isPaused = false;
      this.isProcessing = false;
      this._isClearing = false;
      this.subscribers = new Set();
      this._initialized = false;
      this.cooldown = null;
      this.pauseError = null;
      this.skipped = [];
      this._cooldownTickInterval = null;
      this.cooldownEnabled = true;
      this.minCooldownSec = 180; // 3.0 minutes
      this.maxCooldownSec = 300; // 5.0 minutes
      this._lastCooldownDurationSec = null;
      this.errorCooldownSec = 4500; // 1 hour 15 minutes (75 mins)
      this.maxRetries = 3;

      this._init();
    }

    async _init() {
      if (this._initialized) return;
      this._initialized = true;

      // 1. Listen for runtime broadcasts across extension views (UI views in extension only)
      if (isExtension && !isBackgroundWorker && nativeMessaging()) {
        nativeMessaging().subscribe((msg) => {
          if (msg && msg.action === 'QUEUE_STATE_CHANGED' && msg.state) {
            // Update local state in view from broadcast
            this.activeTask = msg.state.activeTask;
            this.queue = msg.state.queue || [];
            this.isPaused = !!msg.state.isPaused;
            this.isProcessing = !!msg.state.isProcessing;
            this.pauseError = msg.state.pauseError || null;
            this.skipped = Array.isArray(msg.state.skipped) ? msg.state.skipped : [];
            this._notifySubscribers();
          } else if (msg && msg.action === 'QUEUE_PROGRESS' && this.activeTask) {
            // Lightweight in-place progress update without storage disk serialization overhead
            if (this.activeTask.id === msg.taskId || Number(this.activeTask.chapterNumber) === Number(msg.chapterNumber)) {
              this.activeTask.progress = msg.progress;
              this._notifySubscribers();
            }
          } else if (msg && msg.action === 'QUEUE_COOLDOWN_TICK') {
            this.cooldown = msg.cooldown || null;
            this._notifySubscribers();
          } else if (msg && msg.action === 'QUEUE_SET_COOLDOWN_CONFIG' && msg.config) {
            this.setCooldownConfig(msg.config);
          } else if (msg && msg.action === 'QUEUE_RETRY_NOW') {
            this.retryNow();
          } else if (msg && msg.action === 'QUEUE_SKIP_FAILED_CHAPTER') {
            this.skipFailedChapter();
          }
        });
      }

      // 2. Listen to storage changes so views navigating across pages immediately sync (UI views in extension only)
      if (isExtension && !isBackgroundWorker && platformAtLoad) {
        platformAtLoad.storage.onChanged((changes, area) => {
          if (area === 'local' && changes[STORAGE_KEY] && changes[STORAGE_KEY].newValue) {
            const saved = changes[STORAGE_KEY].newValue;
            this.activeTask = saved.activeTask || null;
            this.queue = saved.queue || [];
            this.isPaused = !!saved.isPaused;
            this.isProcessing = !!saved.activeTask;
            this.pauseError = saved.pauseError || null;
        this.skipped = Array.isArray(saved.skipped) ? saved.skipped : [];
            this._notifySubscribers();
          }
        });
      }

      // 3. Load initial state from storage (the platform's local area or localStorage)
      const local = localArea();
      if (local) {
        local.get([STORAGE_KEY, 'quickconverter_queue_cooldown']).then((res) => {
          if (res && res[STORAGE_KEY]) {
            this._restoreState(res[STORAGE_KEY]);
          }
          if (res && res.quickconverter_queue_cooldown) {
            this.setCooldownConfig(res.quickconverter_queue_cooldown);
          }
        });
      } else if (typeof localStorage !== 'undefined') {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw) {
            this._restoreState(JSON.parse(raw));
          }
          const rawCfg = localStorage.getItem('quickconverter_queue_cooldown');
          if (rawCfg) {
            this.setCooldownConfig(JSON.parse(rawCfg));
          }
        } catch (e) {}
      }

      // 4. In extension UI views, query background worker directly for live authoritative state
      if (isExtension && !isBackgroundWorker && nativeMessaging()) {
        try {
          askWorker({ action: 'QUEUE_GET_STATE' }).then((resp) => {
            if (!resp) return;
            this.activeTask = resp.activeTask || null;
            this.queue = resp.queue || [];
            this.isPaused = !!resp.isPaused;
            this.isProcessing = !!resp.activeTask;
            this.cooldown = resp.cooldown || null;
            this._notifySubscribers();
          });
        } catch (e) {}
      }
    }

    /**
     * Restores saved queue state on initialization.
     */
    _restoreState(saved) {
      if (!saved) return;
      const savedQueue = saved.queue || [];

      if (isExecutionOwner) {
        // Execution owner: only restore from storage if not already running tasks in memory
        if (this.activeTask || this.queue.length > 0 || this.isProcessing) {
          return;
        }

        if (saved.activeTask) {
          // If execution owner was terminated mid-stream, re-queue active task at front
          this.queue = [{ ...saved.activeTask, status: 'queued', progress: null }, ...savedQueue];
          this.activeTask = null;
        } else {
          this.queue = savedQueue;
        }

        this.isPaused = !!saved.isPaused;
        this.isProcessing = false;
        this.pauseError = saved.pauseError || null;
        this.skipped = Array.isArray(saved.skipped) ? saved.skipped : [];

        // Restore cooldown state if active
        if (saved.cooldown && saved.cooldown.active) {
          const retryAt = saved.cooldown.retryAt;
          const remSec = retryAt ? Math.max(0, Math.round((retryAt - Date.now()) / 1000)) : (saved.cooldown.secondsRemaining || 0);
          if (remSec <= 0) {
            this.cooldown = null;
            this._sync();
            if (!this.isPaused && this.queue.length > 0) {
              this._processNext();
              return;
            }
          } else {
            this.cooldown = { ...saved.cooldown, secondsRemaining: remSec };
            this._startRestoredCooldownTick();
          }
        }

        this._notifySubscribers();

        if (!this.isPaused && !this.cooldown && this.queue.length > 0) {
          this._processNext();
        }
      } else {
        this.activeTask = saved.activeTask || null;
        this.queue = savedQueue;
        this.isPaused = !!saved.isPaused;
        this.isProcessing = !!this.activeTask;
        this.pauseError = saved.pauseError || null;
        this.skipped = Array.isArray(saved.skipped) ? saved.skipped : [];
        if (saved.cooldown && saved.cooldown.active) {
          const retryAt = saved.cooldown.retryAt;
          const remSec = retryAt ? Math.max(0, Math.round((retryAt - Date.now()) / 1000)) : (saved.cooldown.secondsRemaining || 0);
          this.cooldown = remSec > 0 ? { ...saved.cooldown, secondsRemaining: remSec } : null;
        } else {
          this.cooldown = null;
        }
        this._notifySubscribers();
      }
    }

    /**
     * Serializes task object safe for JSON/storage (strips AbortController and DOM references).
     */
    _serializeTask(task) {
      if (!task) return null;
      const num = task.chapterNumber !== undefined ? Number(task.chapterNumber) : undefined;
      return {
        id: task.id || (task.novelId && num !== undefined ? `${task.novelId}_ch${num}` : undefined),
        novelId: task.novelId,
        novelTitle: task.novelTitle || 'Novel',
        chapterNumber: num,
        chapterTitle: task.chapterTitle || (num !== undefined ? `Chapter ${num}` : ''),
        options: task.options ? {
          translation: task.options.translation ? { ...task.options.translation } : null
        } : null,
        status: task.status || 'queued',
        progress: task.progress || null,
        error: task.error || null,
        retryCount: task.retryCount || 0,
        addedAt: task.addedAt || Date.now(),
        startedAt: task.startedAt || null
      };
    }

    getState() {
      return {
        activeTask: this._serializeTask(this.activeTask),
        queue: this.queue.map((t) => this._serializeTask(t)),
        isPaused: this.isPaused,
        isProcessing: this.isProcessing,
        totalCount: (this.activeTask ? 1 : 0) + this.queue.length,
        cooldown: this.cooldown ? { ...this.cooldown } : null,
        pauseError: this.pauseError || null,
        skipped: (this.skipped || []).map((entry) => ({ ...entry }))
      };
    }

    _sync() {
      const state = this.getState();

      // Persist to storage and broadcast ONLY from execution owner
      if (isExecutionOwner) {
        const local = localArea();
        if (local) {
          try {
            local.set({
              [STORAGE_KEY]: {
                activeTask: state.activeTask,
                queue: state.queue,
                isPaused: state.isPaused,
                cooldown: state.cooldown,
                pauseError: state.pauseError,
              skipped: state.skipped,
                skipped: state.skipped
              }
            });
          } catch (e) {}
        } else if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
              activeTask: state.activeTask,
              queue: state.queue,
              isPaused: state.isPaused,
              cooldown: state.cooldown,
              pauseError: state.pauseError,
              skipped: state.skipped
            }));
          } catch (e) {}
        }

        // Broadcast to other open extension tabs if running in extension
        if (isExtension) {
          tellWorker({ action: 'QUEUE_STATE_CHANGED', state });
        }
      }

      this._notifySubscribers();
    }

    _notifySubscribers() {
      const state = this.getState();
      updateBackgroundHold(state);
      this.subscribers.forEach((cb) => {
        try { cb(state); } catch (e) { console.error('[DownloadQueue] Subscriber error:', e); }
      });
    }

    /**
     * Subscribes a listener to queue state changes.
     * @param {function} callback
     * @returns {function} Unsubscribe function
     */
    subscribe(callback) {
      if (typeof callback !== 'function') return () => {};
      this.subscribers.add(callback);
      // Immediately call with current state
      try { callback(this.getState()); } catch (e) {}
      return () => this.subscribers.delete(callback);
    }

    /**
     * Check if a chapter is already active or in queue.
     * @param {string} novelId
     * @param {number|string} chapterNumber
     * @returns {boolean}
     */
    isQueued(novelId, chapterNumber) {
      const num = Number(chapterNumber);
      if (this.activeTask && this.activeTask.novelId === novelId && Number(this.activeTask.chapterNumber) === num) {
        return true;
      }
      return this.queue.some((t) => t.novelId === novelId && Number(t.chapterNumber) === num);
    }

    /**
     * Get queue status for a specific chapter.
     * @param {string} novelId
     * @param {number|string} chapterNumber
     * @returns {{ status: string, queuePosition?: number } | null}
     */
    getChapterStatus(novelId, chapterNumber) {
      const num = Number(chapterNumber);
      if (this.activeTask && this.activeTask.novelId === novelId && Number(this.activeTask.chapterNumber) === num) {
        return { status: 'processing', progress: this.activeTask.progress };
      }
      const idx = this.queue.findIndex((t) => t.novelId === novelId && Number(t.chapterNumber) === num);
      if (idx !== -1) {
        const item = this.queue[idx];
        const isRetry = item.status === 'retry_pending' || (this.cooldown && this.cooldown.active && this.cooldown.type === 'retry' && idx === 0);
        return {
          status: isRetry ? 'retry_pending' : 'queued',
          queuePosition: idx + 1,
          retryCount: item.retryCount || 1,
          cooldown: isRetry ? this.cooldown : null
        };
      }
      return null;
    }

    /**
     * Adds a chapter to the download queue.
     * @param {object} params
     * @param {string} params.novelId
     * @param {string} [params.novelTitle]
     * @param {number|string} params.chapterNumber
     * @param {string} [params.chapterTitle]
     * @param {object} [params.options]
     * @returns {Promise<{ success: boolean, task?: object, alreadyQueued?: boolean }>}
     */
    async enqueue({ novelId, novelTitle, chapterNumber, chapterTitle, options }) {
      if (!novelId || chapterNumber === undefined) {
        throw new Error('novelId and chapterNumber are required to enqueue a download.');
      }

      const num = Number(chapterNumber);
      const taskId = `${novelId}_ch${num}`;

      // Check for duplicate in queue or active
      if (this.isQueued(novelId, num)) {
        return { success: false, alreadyQueued: true, taskId };
      }

      const task = {
        id: taskId,
        novelId,
        novelTitle: novelTitle || 'Novel',
        chapterNumber: num,
        chapterTitle: chapterTitle || `Chapter ${num}`,
        options: options || {},
        status: 'queued',
        progress: null,
        abortController: null,
        addedAt: Date.now()
      };

      // If running inside extension view, delegate to background service worker
      if (isExtension && !isBackgroundWorker && nativeMessaging()) {
        try {
          const resp = await askWorker({ action: 'QUEUE_ENQUEUE', task: this._serializeTask(task) });
          if (resp) {
            if (resp.state) {
              this.activeTask = resp.state.activeTask || null;
              this.queue = resp.state.queue || [];
              this.isPaused = !!resp.state.isPaused;
              this.isProcessing = !!resp.state.isProcessing;
              this._notifySubscribers();
            }
            return resp;
          }
        } catch (e) {}
        return { success: false, error: 'Background queue service unreachable' };
      }

      this.queue.push(task);
      this._sync();
      if (isExecutionOwner) {
        this._processNext();
      }
      return { success: true, task: this._serializeTask(task) };
    }

    /**
     * Adds multiple chapters to the download queue in a single batch operation.
     * @param {Array<object>} tasks Array of chapter param objects
     * @returns {Promise<{ success: boolean, count: number, state?: object }>}
     */
    async enqueueBatch(tasks) {
      if (!Array.isArray(tasks) || tasks.length === 0) {
        return { success: true, count: 0, state: this.getState() };
      }

      // If running inside extension view, delegate to background service worker
      if (isExtension && !isBackgroundWorker && nativeMessaging()) {
        try {
          const serializedTasks = tasks.map((t) => this._serializeTask(t)).filter(Boolean);
          const resp = await askWorker({ action: 'QUEUE_ENQUEUE_BATCH', tasks: serializedTasks });
          if (resp) {
            if (resp.state) {
              this.activeTask = resp.state.activeTask || null;
              this.queue = resp.state.queue || [];
              this.isPaused = !!resp.state.isPaused;
              this.isProcessing = !!resp.state.isProcessing;
              this._notifySubscribers();
            }
            return resp;
          }
        } catch (e) {}
        return { success: false, error: 'Background queue service unreachable' };
      }

      let addedCount = 0;
      for (const item of tasks) {
        if (!item.novelId || item.chapterNumber === undefined) continue;
        const num = Number(item.chapterNumber);
        if (this.isQueued(item.novelId, num)) continue;

        const task = {
          id: `${item.novelId}_ch${num}`,
          novelId: item.novelId,
          novelTitle: item.novelTitle || 'Novel',
          chapterNumber: num,
          chapterTitle: item.chapterTitle || `Chapter ${num}`,
          options: item.options || {},
          status: 'queued',
          progress: null,
          abortController: null,
          addedAt: Date.now()
        };
        this.queue.push(task);
        addedCount++;
      }

      if (addedCount > 0) {
        this._sync();
        if (isExecutionOwner && !this.isProcessing && !this.isPaused && this.queue.length > 0) {
          this._processNext();
        }
      }

      return { success: true, count: addedCount, state: this.getState() };
    }

    /**
     * Removes an item from the queue by taskId, or cancels active task immediately.
     * @param {string} taskId
     * @returns {Promise<boolean>}
     */
    async remove(taskId) {
      if (!taskId) return false;

      // In extension UI views, delegate to background service worker
      if (isExtension && !isBackgroundWorker && nativeMessaging()) {
        try {
          const resp = await askWorker({ action: 'QUEUE_REMOVE', taskId });
          if (resp) {
            if (resp.state) {
              this.activeTask = resp.state.activeTask || null;
              this.queue = resp.state.queue || [];
              this.isPaused = !!resp.state.isPaused;
              this.isProcessing = !!resp.state.isProcessing;
              this._notifySubscribers();
            }
            return !!resp.success;
          }
        } catch (e) {}
        return false;
      }

      // Check if active task
      if (this.activeTask && this.activeTask.id === taskId) {
        if (this.activeTask.abortController) {
          try {
            this.activeTask.abortController.abort(new Error('UserCancelled'));
          } catch (e) {}
        } else {
          this.activeTask = null;
          this.isProcessing = false;
          this._sync();
          if (isExecutionOwner) {
            this._processNext();
          }
        }
        return true;
      }

      // Check waiting queue
      const idx = this.queue.findIndex((t) => t.id === taskId);
      if (idx !== -1) {
        this.queue.splice(idx, 1);
        if (this.cooldown && this.cooldown.nextTaskId === taskId) {
          if (this.queue.length === 0) {
            this._clearCooldownTimers();
            this.cooldown = null;
            updateKeepAlive(false);
          } else {
            const nextTask = this.queue[0];
            this.cooldown.nextTaskId = nextTask?.id || null;
            this.cooldown.nextChapterNumber = nextTask?.chapterNumber || null;
            this.cooldown.nextNovelTitle = nextTask?.novelTitle || 'Novel';
            this.cooldown.nextChapterTitle = nextTask?.chapterTitle || '';
          }
        }
        this._sync();
        return true;
      }

      return false;
    }

    /**
     * Pause Queue: Allows active chapter to complete, but stops starting next chapter.
     */
    pause() {
      this.isPaused = true;
      this.pauseError = null;
      if (this.cooldown) {
        this._clearCooldownTimers();
        this.cooldown = null;
      }
      if (isExtension && !isBackgroundWorker && nativeMessaging()) {
        try {
          askWorker({ action: 'QUEUE_PAUSE' }).then((resp) => {
            if (resp && resp.state) {
              this.activeTask = resp.state.activeTask || null;
              this.queue = resp.state.queue || [];
              this.isPaused = !!resp.state.isPaused;
              this.isProcessing = !!resp.state.isProcessing;
              this.cooldown = resp.state.cooldown || null;
              this._notifySubscribers();
            }
          });
        } catch (e) {}
        return;
      }
      this._sync();
    }

    /**
     * Resume Queue: Resumes processing remaining chapters.
     */
    resume() {
      this.isPaused = false;
      this.pauseError = null;
      if (isExtension && !isBackgroundWorker && nativeMessaging()) {
        try {
          askWorker({ action: 'QUEUE_RESUME' }).then((resp) => {
            if (resp && resp.state) {
              this.activeTask = resp.state.activeTask || null;
              this.queue = resp.state.queue || [];
              this.isPaused = !!resp.state.isPaused;
              this.isProcessing = !!resp.state.isProcessing;
              this.cooldown = resp.state.cooldown || null;
              this._notifySubscribers();
            }
          });
        } catch (e) {}
        return;
      }
      this._sync();
      if (isExecutionOwner && !this.activeTask && !this.cooldown && this.queue.length > 0) {
        this._processNext();
      }
    }

    /**
     * Clear All: Empties waiting queue and immediately aborts active task and cooldown.
     */
    clearAll() {
      this._isClearing = true;
      this._clearCooldownTimers();
      this.cooldown = null;
      this._lastCooldownDurationSec = null;
      this.queue = [];
      this.isPaused = false;
      this.pauseError = null;
      this.skipped = [];
      const active = this.activeTask;
      this.activeTask = null;
      this.isProcessing = false;

      if (isExtension && !isBackgroundWorker && nativeMessaging()) {
        try {
          askWorker({ action: 'QUEUE_CLEAR_ALL' }).then((resp) => {
            this._isClearing = false;
            if (resp && resp.state) {
              this.activeTask = resp.state.activeTask || null;
              this.queue = resp.state.queue || [];
              this.isPaused = !!resp.state.isPaused;
              this.isProcessing = !!resp.state.isProcessing;
              this.cooldown = resp.state.cooldown || null;
              this._notifySubscribers();
            }
          });
        } catch (e) {
          this._isClearing = false;
        }
        this._notifySubscribers();
        return;
      }

      if (active && active.abortController) {
        try {
          active.abortController.abort(new Error('UserCancelled'));
        } catch (e) {}
      }
      this._sync();
      updateKeepAlive(false);
      this._isClearing = false;
    }

    /**
     * Bypasses the cooldown wait immediately and starts the next chapter in queue.
     */
    // Forgets the chapters the site could not give (the dock's Dismiss).
    clearSkipped() {
      if (isExtension && !isBackgroundWorker && nativeMessaging()) {
        this.skipped = [];
        this._notifySubscribers();
        try {
          askWorker({ action: 'QUEUE_CLEAR_SKIPPED' }).catch(() => {});
        } catch (e) {}
        return;
      }
      this.skipped = [];
      this._sync();
      this._notifySubscribers();
    }

    skipCooldown() {
      if (isExtension && !isBackgroundWorker && nativeMessaging()) {
        try {
          askWorker({ action: 'QUEUE_SKIP_COOLDOWN' }).then((resp) => {
            if (resp && resp.state) {
              this.activeTask = resp.state.activeTask || null;
              this.queue = resp.state.queue || [];
              this.isPaused = !!resp.state.isPaused;
              this.isProcessing = !!resp.state.isProcessing;
              this.cooldown = resp.state.cooldown || null;
              this._notifySubscribers();
            }
          });
        } catch (e) {}
        return;
      }

      this._clearCooldownTimers();
      this.cooldown = null;
      this._sync();
      if (isExecutionOwner && !this.isPaused && this.queue.length > 0) {
        this._processNext();
      }
    }

    /**
     * Bypasses the retry cooldown wait immediately and retries the head chapter right away.
     */
    retryNow() {
      if (isExtension && !isBackgroundWorker && nativeMessaging()) {
        try {
          askWorker({ action: 'QUEUE_RETRY_NOW' }).then((resp) => {
            if (resp && resp.state) {
              this.activeTask = resp.state.activeTask || null;
              this.queue = resp.state.queue || [];
              this.isPaused = !!resp.state.isPaused;
              this.isProcessing = !!resp.state.isProcessing;
              this.cooldown = resp.state.cooldown || null;
              this._notifySubscribers();
            }
          });
        } catch (e) {}
        return;
      }
      this.skipCooldown();
    }

    /**
     * Discards the failed chapter at the head of the queue during retry cooldown
     * and proceeds immediately to the remaining chapters.
     */
    skipFailedChapter() {
      if (isExtension && !isBackgroundWorker && nativeMessaging()) {
        try {
          askWorker({ action: 'QUEUE_SKIP_FAILED_CHAPTER' }).then((resp) => {
            if (resp && resp.state) {
              this.activeTask = resp.state.activeTask || null;
              this.queue = resp.state.queue || [];
              this.isPaused = !!resp.state.isPaused;
              this.isProcessing = !!resp.state.isProcessing;
              this.cooldown = resp.state.cooldown || null;
              this._notifySubscribers();
            }
          });
        } catch (e) {}
        return;
      }

      this._clearCooldownTimers();
      this.cooldown = null;
      this.pauseError = null;
      if (this.queue.length > 0) {
        this.queue.shift();
      }
      this._sync();
      if (isExecutionOwner && !this.isPaused && this.queue.length > 0) {
        this._processNext();
      } else {
        updateKeepAlive(false);
      }
    }

    /**
     * Configures the cooldown duration range and toggle.
     */
    setCooldownConfig(config) {
      if (!config) return;
      if (typeof config.enabled === 'boolean') {
        this.cooldownEnabled = config.enabled;
      }
      if (typeof config.minSec === 'number' && config.minSec >= 0) {
        this.minCooldownSec = Math.round(config.minSec);
      }
      if (typeof config.maxSec === 'number' && config.maxSec >= 0) {
        this.maxCooldownSec = Math.max(this.minCooldownSec, Math.round(config.maxSec));
      }

      if (typeof config.errorCooldownSec === 'number' && config.errorCooldownSec > 0) {
        this.errorCooldownSec = Math.round(config.errorCooldownSec);
      }
      if (typeof config.maxRetries === 'number' && config.maxRetries >= 0) {
        this.maxRetries = Math.round(config.maxRetries);
      }

      const toSave = {
        enabled: this.cooldownEnabled,
        minSec: this.minCooldownSec,
        maxSec: this.maxCooldownSec,
        errorCooldownSec: this.errorCooldownSec,
        maxRetries: this.maxRetries
      };

      const local = localArea();
      if (local) {
        local.set({ quickconverter_queue_cooldown: toSave });
      } else if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem('quickconverter_queue_cooldown', JSON.stringify(toSave)); } catch (e) {}
      }

      if (isExtension && !isBackgroundWorker) {
        tellWorker({ action: 'QUEUE_SET_COOLDOWN_CONFIG', config: toSave });
      }
    }

    _clearCooldownTimers() {
      if (this._cooldownTickInterval) {
        clearInterval(this._cooldownTickInterval);
        this._cooldownTickInterval = null;
      }
      const alarms = nativeAlarms();
      if (alarms) alarms.clear('QUEUE_COOLDOWN_ALARM');
    }

    _startCooldown(forcedDurationSec) {
      this._clearCooldownTimers();

      if (this.isPaused || this.queue.length === 0 || this._isClearing) {
        this.cooldown = null;
        this._sync();
        updateKeepAlive(false);
        return;
      }

      const nextTask = this.queue[0];
      const forced = Number(forcedDurationSec);
      const min = Math.max(1, Math.min(this.minCooldownSec, this.maxCooldownSec));
      const max = Math.max(min, this.maxCooldownSec);
      const span = max - min;

      let durationSec;
      if (Number.isFinite(forced) && forced > 0) {
        // Model-requested delay (<<<DELAY>>>Ns<<<DELAY>>> + 5s): exact, ignores the toggle/min/max.
        durationSec = Math.round(forced);
      } else if (span <= 0) {
        durationSec = min;
      } else {
        const delta = Math.round(span * 0.25);
        if (this._lastCooldownDurationSec !== null && delta > 0) {
          const candidates = [];
          for (let s = min; s <= max; s++) {
            if (Math.abs(s - this._lastCooldownDurationSec) >= delta) {
              candidates.push(s);
            }
          }
          if (candidates.length > 0) {
            durationSec = candidates[Math.floor(Math.random() * candidates.length)];
          } else {
            durationSec = Math.floor(Math.random() * (span + 1)) + min;
          }
        } else {
          durationSec = Math.floor(Math.random() * (span + 1)) + min;
        }
      }

      this._lastCooldownDurationSec = durationSec;

      const retryAt = Date.now() + durationSec * 1000;
      this.cooldown = {
        active: true,
        type: 'normal',
        totalSeconds: durationSec,
        secondsRemaining: durationSec,
        retryAt,
        nextTaskId: nextTask?.id || null,
        nextChapterNumber: nextTask?.chapterNumber || null,
        nextNovelTitle: nextTask?.novelTitle || 'Novel',
        nextChapterTitle: nextTask?.chapterTitle || (nextTask?.chapterNumber ? `Chapter ${nextTask.chapterNumber}` : '')
      };

      const alarms = nativeAlarms();
      if (alarms) alarms.create('QUEUE_COOLDOWN_ALARM', { when: retryAt });

      updateKeepAlive(true);
      this._sync();

      this._cooldownTickInterval = setInterval(() => {
        if (!this.cooldown || !this.cooldown.active || this._isClearing || this.isPaused) {
          this._clearCooldownTimers();
          return;
        }

        if (this.cooldown.retryAt) {
          this.cooldown.secondsRemaining = Math.max(0, Math.round((this.cooldown.retryAt - Date.now()) / 1000));
        } else {
          this.cooldown.secondsRemaining -= 1;
        }

        if (this.cooldown.secondsRemaining <= 0) {
          this._clearCooldownTimers();
          this.cooldown = null;
          this._sync();
          this._processNext();
          return;
        }

        this._notifySubscribers();
        if (isExtension && isExecutionOwner) {
          tellWorker({ action: 'QUEUE_COOLDOWN_TICK', cooldown: this.cooldown });
        }
      }, 1000);
    }

    /**
     * Starts the automatic 1h 15m rate-limit and failure backoff timer on chapter failure.
     * Keeps the failed task at the top of the queue and counts down until automatic retry.
     */
    _startRetryCooldown(task, errorMessage, isRateLimit = false, durationOverrideSec = null) {
      this._clearCooldownTimers();

      if (this.isPaused || this.queue.length === 0 || this._isClearing) {
        this.cooldown = null;
        this._sync();
        updateKeepAlive(false);
        return;
      }

      const durationSec = durationOverrideSec || this.errorCooldownSec || 4500;
      const retryAt = Date.now() + durationSec * 1000;

      this.cooldown = {
        active: true,
        type: 'retry',
        rateLimit: !!isRateLimit,
        totalSeconds: durationSec,
        secondsRemaining: durationSec,
        retryAt,
        error: errorMessage || 'Download failed',
        retryCount: task.retryCount || 1,
        maxRetries: this.maxRetries || 3,
        nextTaskId: task.id || null,
        nextChapterNumber: task.chapterNumber || null,
        nextNovelTitle: task.novelTitle || 'Novel',
        nextChapterTitle: task.chapterTitle || (task.chapterNumber ? `Chapter ${task.chapterNumber}` : '')
      };

      const alarms = nativeAlarms();
      if (alarms) alarms.create('QUEUE_COOLDOWN_ALARM', { when: retryAt });

      updateKeepAlive(true);
      this._sync();

      this._cooldownTickInterval = setInterval(() => {
        if (!this.cooldown || !this.cooldown.active || this._isClearing || this.isPaused) {
          this._clearCooldownTimers();
          return;
        }

        if (this.cooldown.retryAt) {
          this.cooldown.secondsRemaining = Math.max(0, Math.round((this.cooldown.retryAt - Date.now()) / 1000));
        } else {
          this.cooldown.secondsRemaining -= 1;
        }

        if (this.cooldown.secondsRemaining <= 0) {
          this._clearCooldownTimers();
          this.cooldown = null;
          this._sync();
          this._processNext();
          return;
        }

        this._notifySubscribers();
        if (isExtension && isExecutionOwner) {
          tellWorker({ action: 'QUEUE_COOLDOWN_TICK', cooldown: this.cooldown });
        }
      }, 1000);
    }

    _startRestoredCooldownTick() {
      this._clearCooldownTimers();
      updateKeepAlive(true);

      this._cooldownTickInterval = setInterval(() => {
        if (!this.cooldown || !this.cooldown.active || this._isClearing || this.isPaused) {
          this._clearCooldownTimers();
          return;
        }

        if (this.cooldown.retryAt) {
          this.cooldown.secondsRemaining = Math.max(0, Math.round((this.cooldown.retryAt - Date.now()) / 1000));
        } else {
          this.cooldown.secondsRemaining -= 1;
        }

        if (this.cooldown.secondsRemaining <= 0) {
          this._clearCooldownTimers();
          this.cooldown = null;
          this._sync();
          this._processNext();
          return;
        }

        this._notifySubscribers();
        if (isExtension && isExecutionOwner) {
          tellWorker({ action: 'QUEUE_COOLDOWN_TICK', cooldown: this.cooldown });
        }
      }, 1000);
    }

    /**
     * Internal sequential processor (Processes 1 chapter at a time).
     */
    async _processNext() {
      if (this._isClearing || !isExecutionOwner) {
        // UI Views in extension mode never process tasks directly - processing is delegated to background service worker
        return;
      }

      if (this.isProcessing || this.isPaused || this.queue.length === 0) {
        if (this.queue.length === 0 && !this.activeTask) {
          updateKeepAlive(false);
        }
        return;
      }

      updateKeepAlive(true);
      this.isProcessing = true;
      const task = this.queue.shift();
      const abortController = new AbortController();
      task.abortController = abortController;
      task.status = 'processing';
      task.startedAt = Date.now();
      task.progress = { phase: 'starting', text: 'Initializing download...' };

      this.activeTask = task;
      this._sync();

      const storage = resolveStorageService();

      try {
        if (!storage || typeof storage.downloadChapter !== 'function') {
          throw new Error('StorageService is not available to download chapter.');
        }

        let lastNotifyTime = 0;
        let lastNotifiedPercent = -1;
        let lastSyncTime = 0;

        const taskOptions = {
          ...(task.options || {}),
          signal: abortController.signal,
          onProgress: (prog) => {
            if (!prog) return;
            task.progress = {
              phase: prog.phase || 'translating',
              percent: prog.percent !== undefined ? prog.percent : (task.progress?.percent || 0),
              text: prog.text || 'Processing...',
              currentChars: prog.currentChars,
              expectedChars: prog.expectedChars
            };

            const now = Date.now();
            const pct = prog.percent !== undefined ? prog.percent : 0;
            // Throttle progress updates to at most once per second (1000ms),
            // or on completion (>= 99%), or on large milestone jumps (>= 20% in tests/fast steps),
            // or on initial notification
            if (
              now - lastNotifyTime >= 1000 ||
              pct >= 99 ||
              Math.abs(pct - lastNotifiedPercent) >= 20 ||
              lastNotifiedPercent === -1
            ) {
              lastNotifyTime = now;
              lastNotifiedPercent = pct;

              // 1. In-memory notification for local subscribers
              this._notifySubscribers();

              // 2. In Chrome extension, broadcast lightweight progress IPC message without storage disk churn
              if (isExtension && isExecutionOwner) {
                tellWorker({ action: 'QUEUE_PROGRESS', taskId: task.id, chapterNumber: task.chapterNumber, progress: task.progress });
              }
            }
          },
          onChunk: (chunk) => {
            if (task.options && typeof task.options.onChunk === 'function') {
              task.options.onChunk(chunk);
            }
          },
          onNeedsUser: (reason) => {
            task.progress = {
              phase: 'needs-user',
              percent: task.progress && task.progress.percent !== undefined ? task.progress.percent : 5,
              text: reason || 'The chapter page needs you.'
            };
            this._notifySubscribers();
            if (isExtension && isExecutionOwner) {
              tellWorker({ action: 'QUEUE_PROGRESS', taskId: task.id, chapterNumber: task.chapterNumber, progress: task.progress });
            }
          }
        };

        const result = await storage.downloadChapter(task.novelId, task.chapterNumber, taskOptions);

        task.status = 'completed';
        task.result = result;
      } catch (err) {
        if (abortController.signal.aborted || err.message === 'Translation cancelled by user.' || err.message === 'UserCancelled') {
          task.status = 'cancelled';
        } else if (err && err.outcome === 'skip') {
          task.status = 'skipped';
          task.error = err.message || 'The site cannot give this chapter.';
        } else {
          console.error(`[DownloadQueue] Error downloading ${task.chapterTitle}:`, err);
          task.status = 'failed';
          task.error = err.message || 'Download failed';
          task.outcome = err && err.outcome ? err.outcome : null;
        }
      } finally {
        if (this._isClearing) {
          this.activeTask = null;
          this.isProcessing = false;
          this._sync();
          updateKeepAlive(false);
          return;
        }

        if (this.activeTask === task) {
          this.activeTask = null;
          this.isProcessing = false;

          // Check if this task experienced a genuine download/translation error (not user cancellation)
          const isUserCancelled = task.status === 'cancelled';
          const isGenuineFailure = task.status === 'failed';

          if (isGenuineFailure && !this._isClearing) {
            // Check for permanent authorization or zero-balance error
            const errLower = (task.error || '').toLowerCase();
            const isPermanentAuthOrBalance =
              errLower.includes('invalid api key') ||
              errLower.includes('insufficient account balance') ||
              errLower.includes('top up') ||
              errLower.includes('401') ||
              errLower.includes('402') ||
              errLower.includes('saved by opening its page') ||
              errLower.includes('closed before the chapter loaded') ||
              errLower.includes("not in the book's chapter list") ||
              errLower.includes('reading chapter images is not available') ||
              task.outcome === 'blocked';

            if (isPermanentAuthOrBalance) {
              // Place task back at top of queue, pause queue immediately, and notify
              task.status = 'paused_error';
              this.queue.unshift(task);
              this.isPaused = true;
              this.pauseError = task.error || null;
              this._clearCooldownTimers();
              this.cooldown = null;
              this._sync();
              this._notifySubscribers();
              updateKeepAlive(false);
              return;
            }

            // A page that did not load in time (outcome retry) is tried again shortly, a few times,
            // before the normal backoff; it never pauses the queue.
            if (task.outcome === 'retry' && (task.quickRetries || 0) < 3) {
              task.quickRetries = (task.quickRetries || 0) + 1;
              task.status = 'retry_pending';
              this.queue.unshift(task);
              this._startRetryCooldown(task, task.error, false, 30);
              return;
            }

            // No-response / timeout failures pause the queue and surface the error instead of
            // consuming the rate-limit retry budget. Resume re-attempts the same chapter.
            const isTimeout = task.outcome !== 'retry' && (errLower.includes('timed out') || errLower.includes('no data received'));
            if (isTimeout) {
              task.status = 'paused_error';
              this.queue.unshift(task);
              this.isPaused = true;
              this.pauseError = task.error || 'Translation timed out.';
              this._clearCooldownTimers();
              this.cooldown = null;
              this._sync();
              this._notifySubscribers();
              updateKeepAlive(false);
              return;
            }

            // Rate-limit (429) and other failures: back off ~1h15m and retry the chapter.
            const isRateLimit = errLower.includes('rate limit') || errLower.includes('429');
            const currentRetries = (task.retryCount || 0) + 1;
            task.retryCount = currentRetries;

            if (currentRetries > (this.maxRetries || 3)) {
              // Exceeded max retries: mark permanently failed, do not unshift, pause queue
              task.status = 'failed';
              this.isPaused = true;
              this.pauseError = task.error || null;
              this._clearCooldownTimers();
              this.cooldown = null;
              this._sync();
              this._notifySubscribers();
              updateKeepAlive(false);
              return;
            }

            // Put failed task back to the top of the queue to be downloaded next!
            task.status = 'retry_pending';
            this.queue.unshift(task);

            // Start 1 hour 15 minute backoff cooldown
            this._startRetryCooldown(task, task.error, isRateLimit);
            return;
          }

          if (task.status === 'skipped') {
            this.skipped = [...(this.skipped || []), {
              novelId: task.novelId,
              chapterNumber: task.chapterNumber,
              chapterTitle: task.chapterTitle || null,
              reason: task.error,
              at: Date.now()
            }].slice(-50);
            if (!this.isPaused && this.queue.length > 0) {
              this._sync();
              this._processNext();
              return;
            }
          }

          if (this.isPaused || this.queue.length === 0) {
            this._clearCooldownTimers();
            this.cooldown = null;
            this._sync();
            updateKeepAlive(false);
          } else {
            // Model-requested wait: <<<DELAY>>>Ns<<<DELAY>>> on a successful translation forces
            // exactly N + 5 seconds, regardless of the cooldown toggle/min/max.
            const requestedDelay = Number(task?.result?.translationDelay) || 0;
            if (requestedDelay > 0) {
              this._startCooldown(requestedDelay + 5);
              return;
            }

            // The rate limit cooldown paces every chapter download (raw or translated) while it is on.
            const isExplicitNoCooldown = task?.options?.cooldown === false || task?.options?.translation?.cooldown === false;
            const shouldCooldown = this.cooldownEnabled &&
              !isExplicitNoCooldown &&
              this.minCooldownSec > 0 &&
              this.maxCooldownSec >= this.minCooldownSec;

            if (shouldCooldown) {
              this._startCooldown();
            } else {
              this._processNext();
            }
          }
        }
      }
    }
  }

  // Singleton instance
  const DownloadQueueService = new DownloadQueue();
  DownloadQueueService.backgroundWorkText = backgroundWorkText;

  // Export to global scope
  if (typeof window !== 'undefined') {
    window.DownloadQueueService = DownloadQueueService;
  }
  if (typeof self !== 'undefined') {
    self.DownloadQueueService = DownloadQueueService;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = DownloadQueueService;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
