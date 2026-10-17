(function (global) {
  'use strict';

  function isWebPage(url) {
    try {
      const protocol = new URL(url).protocol;
      return protocol === 'http:' || protocol === 'https:';
    } catch (e) {
      return false;
    }
  }

  // Tabs opened by "Open to save" stay in the background and are closed once their
  // chapter is saved. The ids are persisted so a restarted service worker still
  // recognises them; tabs the user opened are never touched.
  function createTracker({ tabs, store, pageFor }) {
    let ids = null;

    async function load() {
      if (ids === null) {
        let saved = [];
        try {
          saved = (await store.get()) || [];
        } catch (e) {
          saved = [];
        }
        if (ids === null) ids = Array.isArray(saved) ? saved.slice() : [];
      }
      return ids;
    }

    async function persist() {
      try {
        await store.set(ids.slice());
      } catch (e) {
        console.warn('[OpenToSave] Could not remember the opened tabs:', e);
      }
    }

    return {
      async open(url) {
        if (!isWebPage(url)) throw new Error('Open to save only opens web pages.');
        const tab = await tabs.create({ url: typeof pageFor === 'function' ? pageFor(url) : url, active: false });
        await load();
        if (tab && typeof tab.id === 'number' && !ids.includes(tab.id)) {
          ids.push(tab.id);
          await persist();
        }
        return tab;
      },

      async done(tabId) {
        await load();
        if (!ids.includes(tabId)) return false;
        ids = ids.filter((id) => id !== tabId);
        await persist();
        try {
          await tabs.remove(tabId);
        } catch (e) {
          console.warn('[OpenToSave] Could not close the tab:', e);
        }
        return true;
      },

      async forget(tabId) {
        await load();
        if (!ids.includes(tabId)) return;
        ids = ids.filter((id) => id !== tabId);
        await persist();
      }
    };
  }

  const OpenToSave = { createTracker, isWebPage };

  if (typeof self !== 'undefined') self.OpenToSave = OpenToSave;
  if (typeof globalThis !== 'undefined') globalThis.OpenToSave = OpenToSave;
  if (typeof module !== 'undefined' && module.exports) module.exports = OpenToSave;
})(typeof globalThis !== 'undefined' ? globalThis : this);
