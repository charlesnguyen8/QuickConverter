// QuickConverter page session: what a download does with the messages a chapter page sends (the
// page runner in site-page.js). Shared by the app's site window (site-save.js) and the extension's
// background tab (tab-page-source.js), so both resolve, wait or ask for the user the same way.
(function (global) {
  'use strict';

  function fromBase64(text) {
    const binary = global.atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  // finish(error, source) is called once: with { kind: 'text', title, rawText, url } or
  // { kind: 'image', image: { bytes, base64, mimeType, width, height }, url }, or an error.
  // show() brings the page to the user, once; onNeedsUser(reason) hears each new reason.
  function create({ expect = null, onNeedsUser = null, show = () => {}, finish }) {
    let done = false;
    let shown = false;
    let lastReason = null;

    const end = (error, source) => {
      if (done) return;
      done = true;
      finish(error, source);
    };

    const needUser = (reason) => {
      if (done) return;
      if (reason !== lastReason) {
        lastReason = reason;
        if (typeof onNeedsUser === 'function') {
          try {
            onNeedsUser(reason);
          } catch (e) {}
        }
      }
      if (!shown) {
        shown = true;
        try {
          const result = show();
          if (result && typeof result.catch === 'function') result.catch(() => {});
        } catch (e) {}
      }
    };

    const isExpected = (message) => !expect
      || ((!expect.slug || String(message.slug) === String(expect.slug))
        && (!expect.chapterSlug || String(message.chapterSlug) === String(expect.chapterSlug)));

    function handle(message) {
      if (done || !message || message.type === 'page') return;
      if (message.type === 'closed') {
        closed();
        return;
      }
      const isChapter = message.type === 'chapter' || message.type === 'image';
      if (isChapter && !isExpected(message)) {
        needUser('The site showed a different chapter. Open the right one, or close the page.');
        return;
      }
      if (message.type === 'chapter' && message.rawText) {
        end(null, { kind: 'text', title: message.title, rawText: message.rawText, url: message.url });
        return;
      }
      if (message.type === 'image' && message.image && message.image.base64) {
        const image = message.image;
        end(null, {
          kind: 'image',
          image: { bytes: fromBase64(image.base64), base64: image.base64, mimeType: image.mimeType, width: image.width, height: image.height },
          url: message.url
        });
        return;
      }
      if (message.type === 'image') needUser('The chapter picture could not be read. Make sure the chapter is unlocked and fully shown.');
      else if (message.type === 'empty') needUser('The chapter did not load. Log in or pass the site\'s check, then open the chapter again.');
      else needUser('This page is not the chapter. Log in if the site asks, then open the chapter again.');
    }

    function closed() {
      const error = new Error('Closed before the chapter loaded.');
      error.closedByUser = true;
      end(error);
    }

    return {
      handle,
      closed,
      fail: (error) => end(error),
      needUser,
      slow: () => needUser('The page is taking long to show the chapter.'),
      isDone: () => done
    };
  }

  const PageSession = { create, fromBase64 };
  global.PageSession = PageSession;
  if (typeof module !== 'undefined' && module.exports) module.exports = PageSession;
})(typeof globalThis !== 'undefined' ? globalThis : this);
