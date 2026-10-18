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

  function createSiteSave({ browser, storage, loadScript = loadPageScript, hiddenWaitMs = 45000 }) {
    let chain = Promise.resolve();

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

    async function saveChapter(message) {
      const managed = await storage.getNovelBySlug(message.slug);
      if (!managed) return { status: 'not-managed' };
      const { novel, number } = await chapterNumberOf(managed, message);
      if (number === null || Number.isNaN(number)) return { status: 'not-in-catalog', novelId: novel.id };
      if (await storage.isChapterSaved(novel.id, number)) {
        return { status: 'already-saved', novelId: novel.id, chapterNumber: number };
      }
      const result = await storage.saveOpenedChapter({
        slug: message.slug,
        chapterNumber: number,
        title: message.title,
        url: message.url,
        rawText: message.rawText,
        domain: message.domain
      });
      return {
        status: result && result.success ? 'saved' : 'error',
        novelId: novel.id,
        chapterNumber: number,
        error: result && !result.success ? result.error : undefined
      };
    }

    function session(url, { login = false } = {}) {
      return new Promise((resolve) => {
        let finished = false;
        let timer = null;
        let unsubscribe = () => {};

        const finish = async (outcome) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          unsubscribe();
          if (outcome.status !== 'cancelled' && outcome.status !== 'closed') {
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
          } else if (message.type === 'empty' || message.type === 'other' || message.type === 'image') {
            reveal();
          }
        });

        (async () => {
          try {
            const script = login ? '' : await loadScript();
            await browser.open(url, { script, visible: login });
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
      }
    };
  }

  let shared = null;

  function sharedSiteSave() {
    const platform = global.Platform;
    const browser = platform && platform.siteBrowser;
    const storage = global.StorageService;
    if (!browser || !storage) return null;
    if (!shared) shared = createSiteSave({ browser, storage });
    return shared;
  }

  const SiteSave = {
    pageScriptFiles,
    bundlePageScript,
    createSiteSave,
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
    }
  };

  global.SiteSave = SiteSave;
  if (typeof module !== 'undefined' && module.exports) module.exports = SiteSave;
})(typeof globalThis !== 'undefined' ? globalThis : this);
