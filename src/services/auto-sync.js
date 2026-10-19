// QuickConverter automatic Google Drive sync: syncs shortly after a page opens, about 30 s after
// the last change, when the page comes back after a minute away, and every 15 minutes while it
// stays open. One sync at a time per device (a short-lived lock shared by open pages); signed out,
// it waits for the next trigger instead of retrying.
(function (global) {
  'use strict';

  const KEYS = {
    lastSync: 'quickconverter_last_sync_at',
    dirty: 'quickconverter_sync_dirty_at',
    lock: 'quickconverter_sync_lock',
    enabled: 'quickconverter_auto_sync'
  };
  const OPEN_DELAY_MS = 2000;
  const VISIBLE_DELAY_MS = 2000;
  const CHANGE_DELAY_MS = 30000;
  const STALE_AFTER_MS = 60000;
  const PERIOD_MS = 15 * 60000;
  const RETRY_MS = 5 * 60000;
  const LOCK_TTL_MS = 2 * 60000;
  const LOCKED_RETRY_MS = 60000;

  function isSignedOutError(err) {
    const message = err && err.message ? err.message : String(err || '');
    return /auth token|not signed in|sign-in|signin|oauth|unauthori[sz]ed|\(401\)/i.test(message);
  }

  function create(deps) {
    let timer = null;
    let timerAt = Infinity;
    let periodic = null;
    let running = false;
    let again = false;
    const firstSync = deps.getPreference(KEYS.lastSync, null);
    let status = { state: firstSync ? 'idle' : 'waiting', lastSyncAt: firstSync };

    const enabled = () => deps.getPreference(KEYS.enabled, 'true') !== 'false';
    const lastSyncTime = () => {
      const t = Date.parse(deps.getPreference(KEYS.lastSync, '') || '');
      return Number.isFinite(t) ? t : 0;
    };
    const isDirty = () => !!deps.getPreference(KEYS.dirty, null);
    const isStale = () => !lastSyncTime() || deps.now() - lastSyncTime() > STALE_AFTER_MS;

    function report(next) {
      status = { lastSyncAt: deps.getPreference(KEYS.lastSync, null), ...next };
      try {
        deps.onStatus(status);
      } catch (e) {}
    }

    function schedule(delay, { debounce = false } = {}) {
      const at = deps.now() + delay;
      if (!debounce && timer !== null && timerAt <= at) return;
      if (timer !== null) deps.clearTimeout(timer);
      timerAt = at;
      timer = deps.setTimeout(() => {
        timer = null;
        timerAt = Infinity;
        return run();
      }, delay);
    }

    function resetPeriodic() {
      if (periodic !== null) deps.clearTimeout(periodic);
      periodic = deps.setTimeout(() => {
        periodic = null;
        return run();
      }, PERIOD_MS);
    }

    async function run() {
      if (!enabled()) {
        report({ state: 'off' });
        return;
      }
      if (running) {
        again = true;
        return;
      }
      const lockAt = Number(deps.getPreference(KEYS.lock, 0)) || 0;
      if (lockAt && deps.now() - lockAt < LOCK_TTL_MS) {
        schedule(LOCKED_RETRY_MS);
        return;
      }
      running = true;
      const startedAt = deps.now();
      deps.setPreference(KEYS.lock, String(startedAt));
      report({ state: 'syncing' });
      try {
        deps.hold('Syncing library…');
      } catch (e) {}
      try {
        const result = await deps.sync();
        const dirtyAt = Number(deps.getPreference(KEYS.dirty, 0)) || 0;
        if (dirtyAt && dirtyAt <= startedAt) deps.removePreference(KEYS.dirty);
        report({ state: 'idle', received: result && result.received ? result.received : null });
      } catch (err) {
        const message = err && err.message ? err.message : String(err);
        if (isSignedOutError(err)) {
          report({ state: 'signed-out' });
        } else {
          report({ state: 'error', error: message });
          schedule(RETRY_MS);
        }
      } finally {
        deps.removePreference(KEYS.lock);
        try {
          deps.release();
        } catch (e) {}
        running = false;
        resetPeriodic();
        if (again) {
          again = false;
          schedule(CHANGE_DELAY_MS, { debounce: true });
        }
      }
    }

    function start() {
      deps.subscribeChanges(() => schedule(CHANGE_DELAY_MS, { debounce: true }));
      deps.subscribeVisible(() => {
        if (isStale() || isDirty()) schedule(VISIBLE_DELAY_MS);
      });
      resetPeriodic();
      if (!enabled()) {
        report({ state: 'off' });
        return;
      }
      if (isStale() || isDirty()) schedule(OPEN_DELAY_MS);
    }

    return {
      start,
      syncSoon: () => schedule(VISIBLE_DELAY_MS),
      status: () => status
    };
  }

  let shared = null;

  function removePreference(key) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.removeItem(key);
    } catch (e) {}
  }

  function startShared() {
    const storage = global.StorageService;
    const cloud = global.CloudSyncService;
    const doc = global.document;
    if (shared || !storage || !cloud || typeof cloud.sync !== 'function' || !doc) return shared;
    const background = () => (global.Platform && global.Platform.background) || null;
    shared = create({
      sync: () => cloud.sync(),
      getPreference: (key, fallback) => storage.getPreference(key, fallback),
      setPreference: (key, value) => storage.setPreference(key, value),
      removePreference,
      subscribeChanges: (fn) => {
        const stopChanges = typeof storage.onLibraryChanged === 'function' ? storage.onLibraryChanged(fn) : () => {};
        const stopSaved = typeof storage.subscribeChapterSaved === 'function' ? storage.subscribeChapterSaved(fn) : () => {};
        return () => { stopChanges(); stopSaved(); };
      },
      subscribeVisible: (fn) => {
        const onVisible = () => { if (doc.visibilityState === 'visible') fn(); };
        doc.addEventListener('visibilitychange', onVisible);
        return () => doc.removeEventListener('visibilitychange', onVisible);
      },
      hold: (text) => { const b = background(); if (b) Promise.resolve(b.hold(text, 'sync')).catch(() => {}); },
      release: () => { const b = background(); if (b) Promise.resolve(b.release('sync')).catch(() => {}); },
      onStatus: (status) => {
        if (typeof global.dispatchEvent !== 'function' || typeof global.CustomEvent !== 'function') return;
        global.dispatchEvent(new global.CustomEvent('library-sync-status', { detail: status }));
        const got = status.received;
        if (status.state === 'idle' && got && got.novels + got.chapters + got.deleted > 0) {
          global.dispatchEvent(new global.CustomEvent('library-synced', { detail: got }));
        }
      },
      now: () => Date.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id)
    });
    shared.start();
    return shared;
  }

  const AutoSync = {
    create,
    start: startShared,
    status: () => (shared ? shared.status() : null),
    syncSoon: () => { if (shared) shared.syncSoon(); },
    isEnabled: () => {
      const storage = global.StorageService;
      return !storage || storage.getPreference(KEYS.enabled, 'true') !== 'false';
    },
    setEnabled: (on) => {
      const storage = global.StorageService;
      if (storage) storage.setPreference(KEYS.enabled, on ? 'true' : 'false');
      if (on && shared) shared.syncSoon();
    }
  };

  global.AutoSync = AutoSync;
  if (typeof module !== 'undefined' && module.exports) module.exports = AutoSync;
  if (global.document && global.StorageService && global.CloudSyncService) startShared();
})(typeof globalThis !== 'undefined' ? globalThis : this);
