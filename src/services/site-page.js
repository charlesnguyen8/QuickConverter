// QuickConverter page runner for the app's SiteBrowser: injected into a site's page together
// with the providers and the registry, it reads the chapter the way the extension's content
// script does and posts one message describing the page.
(function (global) {
  'use strict';

  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function chapterTarget(provider, href, doc) {
    let info = provider.parseUrl(href);
    if (!info || info.type !== 'chapter') return null;
    if (!info.slug && typeof provider.resolveChapterPage === 'function') {
      const resolved = provider.resolveChapterPage(doc);
      if (resolved) info = { ...info, ...resolved };
    }
    return info;
  }

  async function run({ window: win, document: doc, post, waitMs, intervalMs = 500 } = {}) {
    const href = win && win.location ? win.location.href : '';
    const registry = global.ProviderRegistry;
    const provider = registry ? registry.getProviderForUrl(href) : null;
    if (!provider) {
      post({ type: 'other', url: href });
      return;
    }

    const limit = typeof waitMs === 'number' ? waitMs : (provider.contentWaitMs || 5000);
    const started = Date.now();
    let info = chapterTarget(provider, href, doc);
    if (!info) {
      post({ type: 'other', url: href, provider: provider.id });
      return;
    }

    const base = () => ({
      provider: provider.id,
      url: href,
      slug: info.slug || null,
      chapterSlug: info.chapterSlug || null,
      chapterNumber: info.chapterNumber === undefined ? null : info.chapterNumber,
      domain: provider.domains ? provider.domains[0] : null
    });

    for (;;) {
      if (!info.slug) info = chapterTarget(provider, href, doc) || info;
      if (typeof provider.isImageChapter === 'function' && provider.isImageChapter(doc)) {
        post({ type: 'image', ...base() });
        return;
      }
      const chapter = info.slug ? provider.extractChapterInfo(doc, info.chapterNumber) : null;
      if (chapter && chapter.rawText) {
        post({ type: 'chapter', ...base(), title: chapter.title, novelTitle: chapter.novelTitle, rawText: chapter.rawText });
        return;
      }
      if (Date.now() - started >= limit) {
        post({ type: 'empty', ...base() });
        return;
      }
      await wait(intervalMs);
    }
  }

  global.QCSitePage = { run };
})(typeof globalThis !== 'undefined' ? globalThis : this);
