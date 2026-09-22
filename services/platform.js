(function (global) {
  function hasChromeArea(area) {
    return typeof chrome !== 'undefined' && !!chrome && !!chrome[area];
  }

  const chromePlatform = {
    name: 'chrome',
    isExtension: true,
    storage: {
      async get(key) {
        if (!hasChromeArea('storage') || !chrome.storage.local) return undefined;
        const result = await chrome.storage.local.get(key);
        if (!result || !Object.prototype.hasOwnProperty.call(result, key)) return undefined;
        return result[key];
      },
      async set(key, value) {
        if (!hasChromeArea('storage') || !chrome.storage.local) return;
        await chrome.storage.local.set({ [key]: value });
      },
      async remove(key) {
        if (!hasChromeArea('storage') || !chrome.storage.local) return;
        await chrome.storage.local.remove(key);
      }
    },
    messaging: {
      async send(message) {
        if (!hasChromeArea('runtime') || typeof chrome.runtime.sendMessage !== 'function') return undefined;
        return chrome.runtime.sendMessage(message);
      },
      subscribe(handler) {
        if (!hasChromeArea('runtime') || !chrome.runtime.onMessage) return () => {};
        const listener = (message, sender, sendResponse) => handler(message, sender, sendResponse);
        chrome.runtime.onMessage.addListener(listener);
        return () => {
          if (chrome.runtime.onMessage && chrome.runtime.onMessage.removeListener) {
            chrome.runtime.onMessage.removeListener(listener);
          }
        };
      }
    },
    alarms: {
      async create(name, info) {
        if (!hasChromeArea('alarms')) return;
        return chrome.alarms.create(name, info);
      },
      async clear(name) {
        if (!hasChromeArea('alarms') || typeof chrome.alarms.clear !== 'function') return false;
        return chrome.alarms.clear(name);
      },
      subscribe(handler) {
        if (!hasChromeArea('alarms') || !chrome.alarms.onAlarm) return () => {};
        const listener = (alarm) => handler(alarm && alarm.name, alarm);
        chrome.alarms.onAlarm.addListener(listener);
        return () => {
          if (chrome.alarms.onAlarm && chrome.alarms.onAlarm.removeListener) {
            chrome.alarms.onAlarm.removeListener(listener);
          }
        };
      }
    },
    runtime: {
      getURL(path) {
        if (hasChromeArea('runtime') && typeof chrome.runtime.getURL === 'function') return chrome.runtime.getURL(path);
        return path;
      },
      openUrl(url) {
        if (hasChromeArea('tabs') && typeof chrome.tabs.create === 'function') {
          chrome.tabs.create({ url });
          return;
        }
        if (typeof global.open === 'function') global.open(url, '_blank');
      }
    }
  };

  const webPlatform = {
    name: 'web',
    isExtension: false,
    storage: (() => {
      const memory = {};
      const hasLocalStorage = () => {
        try { return typeof localStorage !== 'undefined'; } catch (e) { return false; }
      };
      return {
        async get(key) {
          if (hasLocalStorage()) {
            const value = localStorage.getItem(key);
            return value === null ? undefined : value;
          }
          return memory[key];
        },
        async set(key, value) {
          if (hasLocalStorage()) localStorage.setItem(key, String(value));
          else memory[key] = String(value);
        },
        async remove(key) {
          if (hasLocalStorage()) localStorage.removeItem(key);
          else delete memory[key];
        }
      };
    })(),
    messaging: (() => {
      const listeners = new Set();
      return {
        async send(message) {
          listeners.forEach((handler) => {
            try { handler(message, { id: 'web' }); } catch (e) {}
          });
        },
        subscribe(handler) {
          listeners.add(handler);
          return () => listeners.delete(handler);
        }
      };
    })(),
    alarms: (() => {
      const timers = new Map();
      const listeners = new Set();
      const fire = (name) => {
        listeners.forEach((handler) => {
          try { handler(name, { name }); } catch (e) {}
        });
      };
      return {
        async create(name, info) {
          if (timers.has(name)) {
            clearTimeout(timers.get(name));
            clearInterval(timers.get(name));
            timers.delete(name);
          }
          if (!info) return;
          if (info.periodInMinutes) {
            timers.set(name, setInterval(() => fire(name), info.periodInMinutes * 60000));
          } else if (info.delayInMinutes) {
            timers.set(name, setTimeout(() => {
              timers.delete(name);
              fire(name);
            }, info.delayInMinutes * 60000));
          }
        },
        async clear(name) {
          if (!timers.has(name)) return false;
          clearTimeout(timers.get(name));
          clearInterval(timers.get(name));
          timers.delete(name);
          return true;
        },
        subscribe(handler) {
          listeners.add(handler);
          return () => listeners.delete(handler);
        }
      };
    })(),
    runtime: {
      getURL(path) {
        return path;
      },
      openUrl(url) {
        if (typeof global.open === 'function') global.open(url, '_blank');
      }
    }
  };

  const useChrome = typeof chrome !== 'undefined' && !!chrome && !!chrome.runtime && !!chrome.runtime.id;
  const Platform = useChrome ? chromePlatform : webPlatform;

  if (typeof window !== 'undefined') {
    window.Platform = Platform;
  }
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Platform;
    module.exports.chromePlatform = chromePlatform;
    module.exports.webPlatform = webPlatform;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
