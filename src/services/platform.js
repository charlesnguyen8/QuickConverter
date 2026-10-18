// QuickConverter platform layer: the only place services touch browser-extension APIs.
// Every check happens per call, so the same code runs in the Chrome extension (pages and
// service worker), in a plain web page, and later in the Android app. A platform without a
// native capability returns null (or a no-op) and the caller keeps its own fallback.
(function (global) {
  function chromeApi() {
    return typeof chrome !== 'undefined' && chrome ? chrome : null;
  }

  function has(area) {
    const c = chromeApi();
    return !!(c && c[area]);
  }

  function lastError() {
    const c = chromeApi();
    return c && c.runtime && c.runtime.lastError ? c.runtime.lastError : null;
  }

  function isExtension() {
    const c = chromeApi();
    return !!(c && c.runtime && c.runtime.id);
  }

  function hasLocalStorage() {
    try {
      return typeof localStorage !== 'undefined' && !!localStorage;
    } catch (e) {
      return false;
    }
  }

  // --- Storage -------------------------------------------------------------------------

  function chromeArea(name) {
    const c = chromeApi();
    const area = c && c.storage ? c.storage[name] : null;
    if (!area) return null;
    return {
      get(keys) {
        return new Promise((resolve) => {
          try {
            area.get(keys, (result) => resolve(result || {}));
          } catch (e) {
            resolve({});
          }
        });
      },
      set(items) {
        return new Promise((resolve) => {
          try {
            area.set(items, () => resolve());
          } catch (e) {
            resolve();
          }
        });
      },
      remove(keys) {
        return new Promise((resolve) => {
          try {
            area.remove(keys, () => resolve());
          } catch (e) {
            resolve();
          }
        });
      }
    };
  }

  const memoryStore = {};

  const storage = {
    // The platform's native storage area ('local' or 'session'), or null when there is
    // none and the caller should use its localStorage/sessionStorage fallback.
    area(name) {
      return chromeArea(name);
    },

    onChanged(handler) {
      const c = chromeApi();
      if (!c || !c.storage || !c.storage.onChanged) return () => {};
      const listener = (changes, areaName) => handler(changes, areaName);
      c.storage.onChanged.addListener(listener);
      return () => {
        if (c.storage.onChanged.removeListener) c.storage.onChanged.removeListener(listener);
      };
    },

    // Simple single-key preference storage.
    async get(key) {
      const area = chromeArea('local');
      if (area) {
        const result = await area.get(key);
        return Object.prototype.hasOwnProperty.call(result, key) ? result[key] : undefined;
      }
      if (hasLocalStorage()) {
        const value = localStorage.getItem(key);
        return value === null ? undefined : value;
      }
      return memoryStore[key];
    },
    async set(key, value) {
      const area = chromeArea('local');
      if (area) return area.set({ [key]: value });
      if (hasLocalStorage()) localStorage.setItem(key, String(value));
      else memoryStore[key] = String(value);
      return undefined;
    },
    async remove(key) {
      const area = chromeArea('local');
      if (area) return area.remove(key);
      if (hasLocalStorage()) localStorage.removeItem(key);
      else delete memoryStore[key];
      return undefined;
    }
  };

  // --- Messaging -----------------------------------------------------------------------

  const pageListeners = new Set();

  function nativeMessaging() {
    const c = chromeApi();
    return !!(c && c.runtime && typeof c.runtime.sendMessage === 'function');
  }

  const messaging = {
    // True when messages travel through the extension runtime (pages <-> service worker).
    isNative() {
      return nativeMessaging();
    },

    // Resolves with the reply; rejects when the extension runtime reports an error
    // (e.g. no service worker listening), so callers can fall back to doing the work here.
    send(message) {
      if (nativeMessaging()) {
        return new Promise((resolve, reject) => {
          try {
            chromeApi().runtime.sendMessage(message, (response) => {
              const error = lastError();
              if (error) reject(new Error(error.message || 'Extension messaging failed'));
              else resolve(response);
            });
          } catch (e) {
            reject(e);
          }
        });
      }
      return new Promise((resolve) => {
        let answered = false;
        const sendResponse = (response) => {
          if (answered) return;
          answered = true;
          resolve(response);
        };
        let waiting = false;
        pageListeners.forEach((handler) => {
          try {
            if (handler(message, { id: 'page' }, sendResponse) === true) waiting = true;
          } catch (e) {}
        });
        if (!waiting && !answered) resolve(undefined);
      });
    },

    // handler(message, sender, sendResponse) may return true to reply asynchronously.
    subscribe(handler) {
      const c = chromeApi();
      if (c && c.runtime && c.runtime.onMessage) {
        const listener = (message, sender, sendResponse) => handler(message, sender, sendResponse);
        c.runtime.onMessage.addListener(listener);
        return () => {
          if (c.runtime.onMessage.removeListener) c.runtime.onMessage.removeListener(listener);
        };
      }
      pageListeners.add(handler);
      return () => pageListeners.delete(handler);
    }
  };

  // --- Alarms --------------------------------------------------------------------------

  const timers = new Map();
  const alarmListeners = new Set();

  function fireAlarm(name) {
    alarmListeners.forEach((handler) => {
      try {
        handler(name, { name });
      } catch (e) {}
    });
  }

  function clearTimer(name) {
    if (!timers.has(name)) return false;
    clearTimeout(timers.get(name));
    clearInterval(timers.get(name));
    timers.delete(name);
    return true;
  }

  const alarms = {
    // True when alarms survive the page (the extension service worker is woken for them).
    isNative() {
      return has('alarms') && typeof chromeApi().alarms.create === 'function';
    },
    async create(name, info) {
      if (has('alarms') && typeof chromeApi().alarms.create === 'function') {
        try {
          return chromeApi().alarms.create(name, info);
        } catch (e) {
          return undefined;
        }
      }
      clearTimer(name);
      if (!info) return undefined;
      if (info.periodInMinutes) {
        timers.set(name, setInterval(() => fireAlarm(name), info.periodInMinutes * 60000));
      } else {
        const delay = typeof info.when === 'number'
          ? Math.max(0, info.when - Date.now())
          : (info.delayInMinutes || 0) * 60000;
        timers.set(name, setTimeout(() => {
          timers.delete(name);
          fireAlarm(name);
        }, delay));
      }
      return undefined;
    },
    async clear(name) {
      if (has('alarms') && typeof chromeApi().alarms.clear === 'function') {
        return new Promise((resolve) => {
          try {
            const result = chromeApi().alarms.clear(name, (wasCleared) => resolve(wasCleared !== false));
            if (result && typeof result.then === 'function') result.then((v) => resolve(v !== false), () => resolve(false));
          } catch (e) {
            resolve(false);
          }
        });
      }
      return clearTimer(name);
    },
    subscribe(handler) {
      const c = chromeApi();
      if (c && c.alarms && c.alarms.onAlarm) {
        const listener = (alarm) => handler(alarm && alarm.name, alarm);
        c.alarms.onAlarm.addListener(listener);
        return () => {
          if (c.alarms.onAlarm.removeListener) c.alarms.onAlarm.removeListener(listener);
        };
      }
      alarmListeners.add(handler);
      return () => alarmListeners.delete(handler);
    }
  };

  // --- Identity (Google sign-in) -------------------------------------------------------

  const chromeIdentity = {
    getAuthToken({ interactive = false, scopes = [] } = {}) {
      return new Promise((resolve, reject) => {
        chromeApi().identity.getAuthToken({ interactive, scopes }, (token) => {
          const error = lastError();
          if (error) {
            reject(new Error(error.message || 'Google sign-in failed'));
            return;
          }
          if (!token) {
            reject(new Error('No Google auth token returned'));
            return;
          }
          resolve(token);
        });
      });
    },
    removeCachedAuthToken(token) {
      const identity = chromeApi().identity;
      if (typeof identity.removeCachedAuthToken !== 'function') return Promise.resolve();
      return new Promise((resolve) => identity.removeCachedAuthToken({ token }, () => resolve()));
    },
    clearAllCachedAuthTokens() {
      const identity = chromeApi().identity;
      if (typeof identity.clearAllCachedAuthTokens !== 'function') return Promise.resolve();
      return new Promise((resolve) => identity.clearAllCachedAuthTokens(() => resolve()));
    }
  };

  // --- Runtime -------------------------------------------------------------------------

  const runtime = {
    isExtension,
    getURL(path) {
      const c = chromeApi();
      if (c && c.runtime && typeof c.runtime.getURL === 'function') return c.runtime.getURL(path);
      return path;
    },
    openUrl(url) {
      const c = chromeApi();
      if (c && c.tabs && typeof c.tabs.create === 'function') {
        c.tabs.create({ url });
        return;
      }
      if (typeof global.open === 'function') global.open(url, '_blank');
    },
    async queryActiveTab() {
      const c = chromeApi();
      if (c && c.tabs && typeof c.tabs.query === 'function') {
        try {
          const [tab] = await c.tabs.query({ active: true, currentWindow: true });
          return tab ? { url: tab.url, title: tab.title } : null;
        } catch (e) {
          return null;
        }
      }
      return {
        url: (typeof location !== 'undefined' && location.href) || null,
        title: (typeof document !== 'undefined' && document.title) || ''
      };
    },
    // Keeps the extension service worker awake during long work; a no-op elsewhere.
    async ping() {
      const c = chromeApi();
      if (c && c.runtime && typeof c.runtime.getPlatformInfo === 'function') {
        try {
          c.runtime.getPlatformInfo(() => {});
        } catch (e) {}
      }
    }
  };

  const Platform = {
    get name() {
      return isExtension() ? 'chrome' : 'web';
    },
    get isExtension() {
      return isExtension();
    },
    get identity() {
      const c = chromeApi();
      return c && c.identity && typeof c.identity.getAuthToken === 'function' ? chromeIdentity : null;
    },
    storage,
    messaging,
    alarms,
    runtime
  };

  global.Platform = Platform;
  if (typeof window !== 'undefined') window.Platform = Platform;
  if (typeof self !== 'undefined') self.Platform = Platform;
  if (typeof module !== 'undefined' && module.exports) module.exports = Platform;
})(typeof globalThis !== 'undefined' ? globalThis : this);
