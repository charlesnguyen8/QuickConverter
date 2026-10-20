// The app's site window: downloads of page sites open the chapter in the native SiteBrowser
// (hidden behind the app), run the page script there and get back what the page shows; the page
// is shown when the user has to act. Log in opens the site visibly. One page at a time.
(function (global) {
  'use strict';

  const pageScriptFiles = [
    '../providers/wetriedtls.js',
    '../providers/nkwwlkj.js',
    '../providers/sangtacviet.js',
    '../providers/registry.js',
    '../services/site-page.js'
  ];

  function bundlePageScript(sources) {
    return [
      '(function () {',
      'if (window.__qcSitePageRan) return;',
      'window.__qcSitePageRan = true;',
      sources.join('\n;\n'),
      ';',
      'QCSitePage.run({ window: window, document: document, post: function (message) { QCSiteBrowser.post(JSON.stringify(message)); } });',
      '})();'
    ].join('\n');
  }

  let cachedScript = null;

  async function loadPageScript() {
    if (!cachedScript) {
      cachedScript = Promise.all(pageScriptFiles.map(async (file) => {
        const resp = await fetch(file);
        if (!resp.ok) throw new Error(`Could not load ${file}`);
        return resp.text();
      })).then(bundlePageScript, (err) => {
        cachedScript = null;
        throw err;
      });
    }
    return cachedScript;
  }

  function createSiteSave({ browser, loadScript = loadPageScript, hiddenWaitMs = 45000, userAgentFor = () => undefined }) {
    let chain = Promise.resolve();

    function loginSession(url) {
      return new Promise((resolve) => {
        let finished = false;
        let unsubscribe = () => {};

        const finish = (outcome) => {
          if (finished) return;
          finished = true;
          unsubscribe();
          resolve(outcome);
        };

        unsubscribe = browser.subscribe((message) => {
          if (!finished && message && message.type === 'closed') finish({ status: 'closed' });
        });

        (async () => {
          try {
            const userAgent = await userAgentFor(url);
            await browser.open(url, userAgent ? { script: '', visible: true, userAgent } : { script: '', visible: true });
          } catch (e) {
            finish({ status: 'error', error: e && e.message ? e.message : String(e) });
          }
        })();
      });
    }

    function enqueue(run) {
      const next = chain.then(run);
      chain = next.catch(() => {});
      return next;
    }

    // The app's page source for downloads: opens the chapter page hidden, and resolves with what
    // the page shows (text, or an image chapter's picture) without saving anything. When the page
    // needs the user it says why (onNeedsUser), shows the page and keeps waiting for the chapter.
    function fetchSession(url, { expect = null, onNeedsUser = null, signal = null } = {}) {
      return new Promise((resolve, reject) => {
        let timer = null;
        let unsubscribe = () => {};
        const onAbort = () => session.fail(new Error('UserCancelled'));
        const session = global.PageSession.create({
          expect,
          onNeedsUser,
          show: () => {
            clearTimeout(timer);
            return browser.show();
          },
          finish: async (error, source) => {
            clearTimeout(timer);
            unsubscribe();
            if (signal) signal.removeEventListener('abort', onAbort);
            if (!(error && error.closedByUser)) {
              try {
                await browser.close();
              } catch (e) {}
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
        unsubscribe = browser.subscribe((message) => session.handle(message));

        (async () => {
          try {
            const script = await loadScript();
            const userAgent = await userAgentFor(url);
            await browser.open(url, userAgent ? { script, visible: false, userAgent } : { script, visible: false });
            if (!session.isDone()) timer = setTimeout(() => session.slow(), hiddenWaitMs);
          } catch (e) {
            session.fail(e instanceof Error ? e : new Error(String(e)));
          }
        })();
      });
    }

    return {
      fetchPage(url, options) {
        return enqueue(() => fetchSession(url, options));
      },
      openLogin(url) {
        return enqueue(() => loginSession(url));
      }
    };
  }

  async function siteUserAgent(url) {
    const platform = global.Platform;
    if (!platform || typeof platform.useSiteIdentity !== 'function') return undefined;
    const registry = global.ProviderRegistry;
    const provider = registry && typeof registry.getProviderForUrl === 'function' ? registry.getProviderForUrl(url) : null;
    return platform.useSiteIdentity(url, provider && provider.appUserAgent === 'desktop' ? 'desktop' : 'mobile');
  }

  let shared = null;

  function sharedSiteSave() {
    const platform = global.Platform;
    const browser = platform && platform.siteBrowser;
    if (!browser) return null;
    if (!shared) {
      shared = createSiteSave({ browser, userAgentFor: siteUserAgent });
    }
    return shared;
  }

  const SiteSave = {
    pageScriptFiles,
    bundlePageScript,
    createSiteSave,
    siteUserAgent,
    available() {
      return !!sharedSiteSave();
    },
    openLogin(url) {
      const saver = sharedSiteSave();
      return saver ? saver.openLogin(url) : Promise.resolve({ status: 'unavailable' });
    },
    fetchPage(url, options) {
      const saver = sharedSiteSave();
      return saver ? saver.fetchPage(url, options) : Promise.reject(new Error('Opening chapter pages is not available here.'));
    }
  };

  global.SiteSave = SiteSave;
  if (typeof module !== 'undefined' && module.exports) module.exports = SiteSave;
})(typeof globalThis !== 'undefined' ? globalThis : this);
