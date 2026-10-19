// QuickConverter "Open to save" in the app: opens a chapter in the native SiteBrowser (hidden
// behind the app), runs the page script there and saves the chapter it reports. The page is
// shown when the user has to act (log in, pass a check, an image chapter, a slow page); it
// closes itself once the chapter is saved. One page at a time.
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

  function fromBase64(text) {
    const binary = global.atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  function errorText(err) {
    return err && err.message ? err.message : String(err);
  }

  function createSiteSave({ browser, storage, loadScript = loadPageScript, hiddenWaitMs = 45000, recognize = null, userAgentFor = () => undefined }) {
    let chain = Promise.resolve();
    const statusListeners = new Set();

    function report(update) {
      statusListeners.forEach((handler) => {
        try {
          handler(update);
        } catch (e) {}
      });
    }

    async function chapterNumberOf(novel, message) {
      if (message.chapterNumber !== null && message.chapterNumber !== undefined) {
        return { novel, number: Number(message.chapterNumber) };
      }
      let number = storage.getCatalogChapterNumber(novel, message.chapterSlug);
      if (number === null) {
        novel = (await storage.syncNovelChapters(novel.id)) || novel;
        number = storage.getCatalogChapterNumber(novel, message.chapterSlug);
      }
      return { novel, number };
    }

    async function targetOf(message) {
      const managed = await storage.getNovelBySlug(message.slug);
      if (!managed) return { outcome: { status: 'not-managed' } };
      const { novel, number } = await chapterNumberOf(managed, message);
      if (number === null || Number.isNaN(number)) return { outcome: { status: 'not-in-catalog', novelId: novel.id } };
      if (await storage.isChapterSaved(novel.id, number)) {
        return { outcome: { status: 'already-saved', novelId: novel.id, chapterNumber: number } };
      }
      return { novel, number };
    }

    async function saveImageChapter(message, novel, number) {
      const where = { novelId: novel.id, chapterNumber: number };
      const fail = (error) => {
        report({ status: 'error', ...where, error });
        return { status: 'error', ...where, error };
      };
      if (typeof recognize !== 'function') return fail('Reading chapter images is not available on this page.');
      report({ status: 'reading', ...where });
      let text;
      try {
        text = String((await recognize(fromBase64(message.image.base64), message.image.mimeType)) || '').trim();
      } catch (e) {
        return fail(`Could not read the chapter image: ${errorText(e)}`);
      }
      if (!text) return fail('No text was found in the chapter image.');
      report({ status: 'saving', ...where });
      try {
        await storage.saveRecognizedChapter(novel.id, number, { text, url: message.url });
      } catch (e) {
        return fail(`Could not save the chapter: ${errorText(e)}`);
      }
      report({ status: 'saved', ...where });
      return { status: 'saved', ...where, ocr: true };
    }

    async function saveChapter(message) {
      const { novel, number, outcome } = await targetOf(message);
      if (outcome) return outcome;
      const result = await storage.saveOpenedChapter({
        slug: message.slug,
        chapterNumber: number,
        title: message.title,
        url: message.url,
        rawText: message.rawText,
        domain: message.domain
      });
      const saved = { status: result && result.success ? 'saved' : 'error', novelId: novel.id, chapterNumber: number };
      if (result && !result.success) saved.error = result.error;
      report(saved);
      return saved;
    }

    function session(url, { login = false } = {}) {
      return new Promise((resolve) => {
        let finished = false;
        let timer = null;
        let unsubscribe = () => {};

        const finish = async (outcome, { alreadyClosed = false } = {}) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          unsubscribe();
          if (!alreadyClosed && outcome.status !== 'cancelled' && outcome.status !== 'closed') {
            try {
              await browser.close();
            } catch (e) {}
          }
          resolve(outcome);
        };

        const reveal = () => {
          clearTimeout(timer);
          Promise.resolve(browser.show()).catch(() => {});
        };

        unsubscribe = browser.subscribe(async (message) => {
          if (finished || !message) return;
          if (message.type === 'closed') {
            finish({ status: login ? 'closed' : 'cancelled' });
            return;
          }
          if (login) return;
          if (message.type === 'chapter') {
            try {
              finish(await saveChapter(message));
            } catch (e) {
              finish({ status: 'error', error: e && e.message ? e.message : String(e) });
            }
          } else if (message.type === 'image' && message.image && message.image.base64) {
            clearTimeout(timer);
            try {
              const { novel, number, outcome } = await targetOf(message);
              if (outcome) {
                finish(outcome);
                return;
              }
              try {
                await browser.close();
              } catch (e) {}
              finish(await saveImageChapter(message, novel, number), { alreadyClosed: true });
            } catch (e) {
              finish({ status: 'error', error: errorText(e) });
            }
          } else if (message.type === 'empty' || message.type === 'other' || message.type === 'image') {
            reveal();
          }
        });

        (async () => {
          try {
            const script = login ? '' : await loadScript();
            const userAgent = await userAgentFor(url);
            await browser.open(url, userAgent ? { script, visible: login, userAgent } : { script, visible: login });
            if (!login && !finished) timer = setTimeout(reveal, hiddenWaitMs);
          } catch (e) {
            finish({ status: 'error', error: e && e.message ? e.message : String(e) });
          }
        })();
      });
    }

    function enqueue(url, options) {
      const run = chain.then(() => session(url, options));
      chain = run.catch(() => {});
      return run;
    }

    return {
      open(url) {
        return enqueue(url);
      },
      openLogin(url) {
        return enqueue(url, { login: true });
      },
      onStatus(handler) {
        statusListeners.add(handler);
        return () => statusListeners.delete(handler);
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
    const storage = global.StorageService;
    if (!browser || !storage) return null;
    if (!shared) {
      shared = createSiteSave({
        browser,
        storage,
        userAgentFor: siteUserAgent,
        recognize: (bytes, mimeType) => {
          const ocr = global.QCOcr;
          if (!ocr || typeof ocr.recognize !== 'function') throw new Error('Reading chapter images is not available on this page.');
          return ocr.recognize(bytes, mimeType);
        }
      });
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
    open(url) {
      const saver = sharedSiteSave();
      return saver ? saver.open(url) : Promise.resolve({ status: 'unavailable' });
    },
    openLogin(url) {
      const saver = sharedSiteSave();
      return saver ? saver.openLogin(url) : Promise.resolve({ status: 'unavailable' });
    },
    onStatus(handler) {
      const saver = sharedSiteSave();
      return saver ? saver.onStatus(handler) : () => {};
    }
  };

  global.SiteSave = SiteSave;
  if (typeof module !== 'undefined' && module.exports) module.exports = SiteSave;
})(typeof globalThis !== 'undefined' ? globalThis : this);
