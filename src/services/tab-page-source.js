// QuickConverter page source for the Chrome extension: the download queue (in the service worker)
// opens the chapter in a background tab, the content script there reports what the page shows
// (PAGE_SOURCE_RESULT), and the result goes back to the waiting download. When the page needs
// the user the tab is brought forward; the tab closes once the chapter is in.
(function (global) {
  'use strict';

  function create({ tabs, pageFor = (url) => url, hiddenWaitMs = 45000 }) {
    const sessions = new Map();

    function fetch(url, { expect = null, onNeedsUser = null, signal = null } = {}) {
      return new Promise((resolve, reject) => {
        let tabId = null;
        let timer = null;
        const onAbort = () => session.fail(new Error('UserCancelled'));
        const session = global.PageSession.create({
          expect,
          onNeedsUser,
          show: () => {
            clearTimeout(timer);
            if (tabId !== null) return tabs.activate(tabId);
            return undefined;
          },
          finish: async (error, source) => {
            clearTimeout(timer);
            if (signal) signal.removeEventListener('abort', onAbort);
            if (tabId !== null) {
              sessions.delete(tabId);
              if (!(error && error.closedByUser)) {
                try {
                  await tabs.remove(tabId);
                } catch (e) {}
              }
            }
            if (error) reject(error);
            else resolve(source);
          }
        });
        if (signal) {
          if (signal.aborted) {
            reject(new Error('UserCancelled'));
            return;
          }
          signal.addEventListener('abort', onAbort);
        }
        (async () => {
          try {
            const tab = await tabs.create({ url: pageFor(url.indexOf('#') === -1 ? url + '#qc-download' : url), active: false });
            tabId = tab && typeof tab.id === 'number' ? tab.id : null;
            if (tabId === null) throw new Error('Could not open the chapter page.');
            if (session.isDone()) {
              try { await tabs.remove(tabId); } catch (e) {}
              return;
            }
            sessions.set(tabId, { expect, session });
            timer = setTimeout(() => session.slow(), hiddenWaitMs);
          } catch (e) {
            session.fail(e instanceof Error ? e : new Error(String(e)));
          }
        })();
      });
    }

    return {
      fetch,
      // Whether a tab is a download tab (its content script asks before doing anything).
      sessionFor(tabId) {
        const entry = sessions.get(tabId);
        return entry ? { expect: entry.expect } : null;
      },
      onTabMessage(tabId, message) {
        const entry = sessions.get(tabId);
        if (entry) entry.session.handle(message);
      },
      onTabRemoved(tabId) {
        const entry = sessions.get(tabId);
        if (entry) entry.session.closed();
      }
    };
  }

  const TabPageSource = { create };
  global.TabPageSource = TabPageSource;
  if (typeof module !== 'undefined' && module.exports) module.exports = TabPageSource;
})(typeof globalThis !== 'undefined' ? globalThis : this);
