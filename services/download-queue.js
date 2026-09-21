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

  // In Chrome extension, chrome.runtime.id is present.
  // UI views have window and document; background service worker has neither.
  // In Android (Capacitor/WebView) or Electron standalone, chrome.runtime.id is not present.
  // In Node.js testing, window and document are undefined.
  const isExtension = typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id);
  const isBackgroundWorker = typeof window === 'undefined' && typeof document === 'undefined';
  // Execution owner is the entity responsible for actively executing tasks in-memory:
  // In Chrome extension: strictly the background service worker.
  // In Standalone / Android / Node: the current execution context.
  const isExecutionOwner = isBackgroundWorker || !isExtension;

  let keepAliveInterval = null;
  function updateKeepAlive(isWorking) {
    if (typeof chrome === 'undefined' || !chrome.runtime) return;
    if (isWorking) {
      if (!keepAliveInterval) {
        keepAliveInterval = setInterval(() => {
          try {
            if (chrome.runtime && chrome.runtime.getPlatformInfo) {
              chrome.runtime.getPlatformInfo(() => {});
            }
          } catch (e) {}
        }, 15000);
      }
    } else {
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
      }
    }
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
      this._cooldownTickInterval = null;
      this.cooldownEnabled = true;
      this.minCooldownSec = 180; // 3.0 minutes
      this.maxCooldownSec = 300; // 5.0 minutes

      this._init();
    }

    async _init() {
      if (this._initialized) return;
      this._initialized = true;

      // 1. Listen for runtime broadcasts across extension views (UI views in extension only)
      if (isExtension && !isBackgroundWorker && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
        chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
          if (msg && msg.action === 'QUEUE_STATE_CHANGED' && msg.state) {
            // Update local state in view from broadcast
            this.activeTask = msg.state.activeTask;
            this.queue = msg.state.queue || [];
            this.isPaused = !!msg.state.isPaused;
            this.isProcessing = !!msg.state.isProcessing;
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
          }
        });
      }

      // 2. Listen to storage changes so views navigating across pages immediately sync (UI views in extension only)
      if (isExtension && !isBackgroundWorker && typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'local' && changes[STORAGE_KEY] && changes[STORAGE_KEY].newValue) {
            const saved = changes[STORAGE_KEY].newValue;
            this.activeTask = saved.activeTask || null;
            this.queue = saved.queue || [];
            this.isPaused = !!saved.isPaused;
            this.isProcessing = !!saved.activeTask;
            this._notifySubscribers();
          }
        });
      }

      // 3. Load initial state from storage (chrome.storage or localStorage)
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try {
          chrome.storage.local.get([STORAGE_KEY, 'quickconverter_queue_cooldown'], (res) => {
            if (res && res[STORAGE_KEY]) {
              this._restoreState(res[STORAGE_KEY]);
            }
            if (res && res.quickconverter_queue_cooldown) {
              this.setCooldownConfig(res.quickconverter_queue_cooldown);
            }
          });
        } catch (e) {}
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
      if (isExtension && !isBackgroundWorker && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          chrome.runtime.sendMessage({ action: 'QUEUE_GET_STATE' }, (resp) => {
            if (chrome.runtime.lastError || !resp) return;
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
        this._notifySubscribers();

        if (!this.isPaused && this.queue.length > 0) {
          this._processNext();
        }
      } else {
        this.activeTask = saved.activeTask || null;
        this.queue = savedQueue;
        this.isPaused = !!saved.isPaused;
        this.isProcessing = !!this.activeTask;
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
        cooldown: this.cooldown ? { ...this.cooldown } : null
      };
    }

    _sync() {
      const state = this.getState();

      // Persist to storage and broadcast ONLY from execution owner
      if (isExecutionOwner) {
        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
          try {
            chrome.storage.local.set({
              [STORAGE_KEY]: {
                activeTask: state.activeTask,
                queue: state.queue,
                isPaused: state.isPaused,
                cooldown: state.cooldown
              }
            });
          } catch (e) {}
        } else if (typeof localStorage !== 'undefined') {
          try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
              activeTask: state.activeTask,
              queue: state.queue,
              isPaused: state.isPaused,
              cooldown: state.cooldown
            }));
          } catch (e) {}
        }

        // Broadcast to other open extension tabs if running in extension
        if (isExtension && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          try {
            chrome.runtime.sendMessage({ action: 'QUEUE_STATE_CHANGED', state }, () => {
              if (chrome.runtime.lastError) {
                // Ignore harmless "Receiving end does not exist" when no tabs are open
              }
            });
          } catch (e) {}
        }
      }

      this._notifySubscribers();
    }

    _notifySubscribers() {
      const state = this.getState();
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
        return { status: 'queued', queuePosition: idx + 1 };
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
      if (isExtension && !isBackgroundWorker && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          const resp = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'QUEUE_ENQUEUE', task: this._serializeTask(task) }, (r) => {
              if (chrome.runtime.lastError || !r) resolve(null);
              else resolve(r);
            });
          });
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
      if (isExtension && !isBackgroundWorker && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          const serializedTasks = tasks.map((t) => this._serializeTask(t)).filter(Boolean);
          const resp = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'QUEUE_ENQUEUE_BATCH', tasks: serializedTasks }, (r) => {
              if (chrome.runtime.lastError || !r) resolve(null);
              else resolve(r);
            });
          });
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
      if (isExtension && !isBackgroundWorker && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          const resp = await new Promise((resolve) => {
            chrome.runtime.sendMessage({ action: 'QUEUE_REMOVE', taskId }, (r) => {
              if (chrome.runtime.lastError || !r) resolve(null);
              else resolve(r);
            });
          });
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
      if (this.cooldown) {
        this._clearCooldownTimers();
        this.cooldown = null;
      }
      if (isExtension && !isBackgroundWorker && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          chrome.runtime.sendMessage({ action: 'QUEUE_PAUSE' }, (resp) => {
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
      if (isExtension && !isBackgroundWorker && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          chrome.runtime.sendMessage({ action: 'QUEUE_RESUME' }, (resp) => {
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
      this.queue = [];
      const active = this.activeTask;
      this.activeTask = null;
      this.isProcessing = false;

      if (isExtension && !isBackgroundWorker && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          chrome.runtime.sendMessage({ action: 'QUEUE_CLEAR_ALL' }, (resp) => {
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
    skipCooldown() {
      if (isExtension && !isBackgroundWorker && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          chrome.runtime.sendMessage({ action: 'QUEUE_SKIP_COOLDOWN' }, (resp) => {
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

      const toSave = {
        enabled: this.cooldownEnabled,
        minSec: this.minCooldownSec,
        maxSec: this.maxCooldownSec
      };

      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        try { chrome.storage.local.set({ quickconverter_queue_cooldown: toSave }); } catch (e) {}
      } else if (typeof localStorage !== 'undefined') {
        try { localStorage.setItem('quickconverter_queue_cooldown', JSON.stringify(toSave)); } catch (e) {}
      }

      if (isExtension && !isBackgroundWorker && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        try {
          chrome.runtime.sendMessage({
            action: 'QUEUE_SET_COOLDOWN_CONFIG',
            config: toSave
          }, () => {
            if (chrome.runtime.lastError) {}
          });
        } catch (e) {}
      }
    }

    _clearCooldownTimers() {
      if (this._cooldownTickInterval) {
        clearInterval(this._cooldownTickInterval);
        this._cooldownTickInterval = null;
      }
    }

    _startCooldown() {
      this._clearCooldownTimers();

      if (this.isPaused || this.queue.length === 0 || this._isClearing) {
        this.cooldown = null;
        this._sync();
        updateKeepAlive(false);
        return;
      }

      const nextTask = this.queue[0];
      const min = Math.max(1, Math.min(this.minCooldownSec, this.maxCooldownSec));
      const max = Math.max(min, this.maxCooldownSec);
      const durationSec = Math.floor(Math.random() * (max - min + 1)) + min;

      this.cooldown = {
        active: true,
        totalSeconds: durationSec,
        secondsRemaining: durationSec,
        nextTaskId: nextTask?.id || null,
        nextChapterNumber: nextTask?.chapterNumber || null,
        nextNovelTitle: nextTask?.novelTitle || 'Novel',
        nextChapterTitle: nextTask?.chapterTitle || (nextTask?.chapterNumber ? `Chapter ${nextTask.chapterNumber}` : '')
      };

      updateKeepAlive(true);
      this._sync();

      this._cooldownTickInterval = setInterval(() => {
        if (!this.cooldown || !this.cooldown.active || this._isClearing || this.isPaused) {
          this._clearCooldownTimers();
          return;
        }

        this.cooldown.secondsRemaining -= 1;

        if (this.cooldown.secondsRemaining <= 0) {
          this._clearCooldownTimers();
          this.cooldown = null;
          this._sync();
          this._processNext();
          return;
        }

        this._notifySubscribers();
        if (isExtension && isExecutionOwner && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
          try {
            chrome.runtime.sendMessage({
              action: 'QUEUE_COOLDOWN_TICK',
              cooldown: this.cooldown
            }, () => {
              if (chrome.runtime.lastError) {}
            });
          } catch (e) {}
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
              if (isExtension && isExecutionOwner && typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                try {
                  chrome.runtime.sendMessage({
                    action: 'QUEUE_PROGRESS',
                    taskId: task.id,
                    chapterNumber: task.chapterNumber,
                    progress: task.progress
                  }, () => {
                    if (chrome.runtime.lastError) {
                      // Harmless when no UI views are open
                    }
                  });
                } catch (e) {}
              }
            }
          },
          onChunk: (chunk) => {
            if (task.options && typeof task.options.onChunk === 'function') {
              task.options.onChunk(chunk);
            }
          }
        };

        const result = await storage.downloadChapter(task.novelId, task.chapterNumber, taskOptions);

        task.status = 'completed';
        task.result = result;
      } catch (err) {
        if (abortController.signal.aborted || err.message === 'Translation cancelled by user.' || err.message === 'UserCancelled') {
          task.status = 'cancelled';
        } else {
          console.error(`[DownloadQueue] Error downloading ${task.chapterTitle}:`, err);
          task.status = 'failed';
          task.error = err.message || 'Download failed';
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

          if (this.isPaused || this.queue.length === 0) {
            this._clearCooldownTimers();
            this.cooldown = null;
            this._sync();
            updateKeepAlive(false);
          } else {
            // Cooldown applies when enabled AND task was translated (or has cooldown: true).
            // Raw chapter downloads without translation (options.translation.enabled: false) are not rate-limited and skip cooldown.
            const isExplicitNoTranslation = task?.options?.translation && task.options.translation.enabled === false;
            const isExplicitNoCooldown = task?.options?.cooldown === false || task?.options?.translation?.cooldown === false;
            const shouldCooldown = this.cooldownEnabled &&
              !isExplicitNoTranslation &&
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
