const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('\n--- Running Site Browser (app Open to save) Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(repoRoot, ...p), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));
const tick = () => new Promise((r) => setTimeout(r, 0));

let passed = 0;
let failed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n    ${e.message}`);
  }
}

const NK_HEAD = `
<html><head><title>第一章   张角 - 门户 - 独阅读</title>
<script>SD.book = {book_id: 100181750, chapter_id: 100043460, up_reader_id: 599503, is_paid: 1};</script>
</head><body>
<div class="book-read-box container white-bg">
  <div class="bread"><a href="https://www.nkwwlkj.cn/index">独阅读首页</a> >
    <a href="https://www.nkwwlkj.cn/book/book_detail/100181750">门户</a> >
    正文 >
    第一章   张角</div>
  <div class="article-title">第一章   张角    </div>
  <div class="article-content" id="J_BookCnt">`;
const NK_RENDERED = `${NK_HEAD}
    <div class="read-bd" id="J_BookRead"><p class="chapter">　　First line of the chapter.</p>
<p class="chapter">　　Second line.</p>
    </div></div></div></body></html>`;
const NK_UNRENDERED = `${NK_HEAD}
    <div class="read-bd" id="J_BookRead">
    </div></div></div></body></html>`;
const NK_IMAGE = `${NK_HEAD}
    <div class="read-bd" id="J_ImgRead">
      <div class="read-bd-wrap" id="J_BookImage"><img id="realBookImage" src="https://www.nkwwlkj.cn/resources/images/empty.gif"/></div>
    </div></div></div></body></html>`;
const NK_CHAPTER_URL = 'https://www.nkwwlkj.cn/chapter/book_chapter_detail/100043460';

function loadPage(href, html) {
  const document = { documentElement: { outerHTML: html } };
  const env = {
    console: { log() {}, warn() {}, error() {} },
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    btoa,
    document
  };
  env.window = env;
  env.self = env;
  env.globalThis = env;
  env.location = { href };
  vm.createContext(env);
  for (const file of ['providers/wetriedtls.js', 'providers/nkwwlkj.js', 'providers/sangtacviet.js', 'providers/registry.js', 'services/site-page.js']) {
    vm.runInContext(read('src', ...file.split('/')), env);
  }
  return env;
}

async function runPage(href, html, options = {}) {
  const env = loadPage(href, html);
  if (options.before) options.before(env);
  const posted = [];
  const run = env.QCSitePage.run({ window: env, document: env.document, post: (m) => posted.push(plain(m)), waitMs: 60, intervalMs: 10, ...options });
  if (options.during) options.during(env);
  await run;
  return posted;
}

function fakeBrowser() {
  const calls = [];
  let handler = null;
  return {
    calls,
    emit: async (msg) => { if (handler) await handler(msg); await tick(); await tick(); },
    get subscribed() { return !!handler; },
    open: async (url, opts) => { calls.push(['open', url, plain(opts)]); },
    show: async () => { calls.push(['show']); },
    hide: async () => { calls.push(['hide']); },
    close: async () => { calls.push(['close']); },
    subscribe(fn) {
      handler = fn;
      return () => { if (handler === fn) handler = null; };
    }
  };
}

function fakeStorage({ catalog = [{ chapterNumber: 1, slug: '100043460' }], saved = [], managed = true } = {}) {
  const calls = [];
  const novel = { id: 'novel-1', slug: '100181750', title: '门户', chapterList: catalog };
  return {
    calls,
    async getNovelBySlug(slug) { calls.push(['getNovelBySlug', slug]); return managed ? { ...novel } : null; },
    getCatalogChapterNumber(n, chapterSlug) {
      const match = (n.chapterList || []).find((c) => String(c.slug) === String(chapterSlug));
      return match ? Number(match.chapterNumber) : null;
    },
    async syncNovelChapters(id) {
      calls.push(['syncNovelChapters', id]);
      return { ...novel, chapterList: [...catalog, { chapterNumber: 2, slug: '100043461' }] };
    },
    async isChapterSaved(id, number) { return saved.includes(number); },
    async saveOpenedChapter(data) { calls.push(['saveOpenedChapter', plain(data)]); return { success: true, novelId: 'novel-1' }; },
    async saveRecognizedChapter(id, number, options) { calls.push(['saveRecognizedChapter', id, number, plain(options)]); return { id: `${id}-${number}` }; }
  };
}

function loadSiteSave() {
  const env = { console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, URL, atob };
  env.window = env;
  env.self = env;
  env.globalThis = env;
  vm.createContext(env);
  vm.runInContext(read('src', 'services', 'page-session.js'), env);
  vm.runInContext(read('src', 'services', 'site-save.js'), env);
  return env;
}

const CHAPTER_MSG = {
  type: 'chapter',
  provider: 'nkwwlkj',
  url: NK_CHAPTER_URL,
  slug: '100181750',
  chapterSlug: '100043460',
  chapterNumber: null,
  domain: 'www.nkwwlkj.cn',
  title: '第一章 张角',
  novelTitle: '门户',
  rawText: 'First line of the chapter.\n\nSecond line.'
};

let finished = false;
process.on('beforeExit', () => {
  if (!finished) {
    console.error('Site Browser suite stopped before its last test (a promise never settled)');
    process.exitCode = 1;
  }
});

(async () => {
  // --- The page script (runs inside the site page in the app's SiteBrowser) ---

  await test('page script reports a rendered nkwwlkj chapter with its book and chapter ids', async () => {
    const posted = await runPage(NK_CHAPTER_URL, NK_RENDERED);
    assert.strictEqual(posted.length, 1);
    const msg = posted[0];
    assert.strictEqual(msg.type, 'chapter');
    assert.strictEqual(msg.provider, 'nkwwlkj');
    assert.strictEqual(msg.slug, '100181750');
    assert.strictEqual(msg.chapterSlug, '100043460');
    assert.strictEqual(msg.url, NK_CHAPTER_URL);
    assert.strictEqual(msg.domain, 'www.nkwwlkj.cn');
    assert.strictEqual(msg.novelTitle, '门户');
    assert(/First line of the chapter\.[\s\S]*Second line\./.test(msg.rawText), 'chapter text');
  });

  await test('page script waits for the site to render the chapter', async () => {
    const posted = await runPage(NK_CHAPTER_URL, NK_UNRENDERED, {
      waitMs: 500,
      during: (env) => setTimeout(() => { env.document.documentElement.outerHTML = NK_RENDERED; }, 30)
    });
    assert.deepStrictEqual(posted.map((m) => m.type), ['chapter']);
  });

  await test('page script reports an empty chapter when the text never appears (login or a check)', async () => {
    const posted = await runPage(NK_CHAPTER_URL, NK_UNRENDERED);
    assert.deepStrictEqual(posted.map((m) => m.type), ['empty']);
    assert.strictEqual(posted[0].chapterSlug, '100043460');
  });

  const STV_URL = 'https://sangtacviet.com/truyen/qidian/1/1047557032/935406276/';
  const stvPage = (main) => `<html><body><div id="content-container"><div class="contentbox" id="maincontent">${main}</div></div></body></html>`;
  const STV_PROMPT = stvPage('<center><span class="spinner-border"></span><br>Nhấp vào để tải chương...</center>');

  await test('page script reports why a sangtacviet chapter failed instead of waiting it out', async () => {
    const posted = await runPage(STV_URL, stvPage('Đây là chương vip của qidian, chưa thể tải chương này. Ghi chú về chương này: Qidian vừa nâng cấp bảo mật, nhiều truyện không thể tải được, xin chờ giải pháp.'), { waitMs: 5000 });
    assert.deepStrictEqual(posted.map((m) => [m.type, m.outcome]), [['failed', 'skip']], 'right away, not after the wait');
    assert.strictEqual(posted[0].chapterSlug, '935406276');
    assert(/VIP/.test(posted[0].reason));
  });

  await test('page script reads the site alerts the download tab caught', async () => {
    const posted = await runPage(STV_URL, STV_PROMPT, {
      before: (env) => {
        env.document.documentElement.getAttribute = (name) => (name === 'data-qc-alerts' ? JSON.stringify(['Lỗi không xác định, vui lòng thử lại sau, mã báo lỗi:4005.\nhttps://sangtacviet.com/']) : null);
      }
    });
    assert.deepStrictEqual(posted.map((m) => [m.type, m.outcome]), [['failed', 'blocked']]);
    assert(posted[0].reason.includes('4005'));
  });

  await test('a sangtacviet 400x alert followed by the chapter loading saves the chapter instead of stopping', async () => {
    const STV_CHAPTER_URL = 'https://sangtacviet.com/truyen/uukanshu/1/92019/1122/';
    const loaded = '<html><body><div id="booknameholder">Book</div><div class="contentbox" id="cld-92019-1122"><i h="x" t="第一章">Chương 1</i><br><i h="y" t="林动">Lâm Động</i></div></body></html>';
    const posted = await runPage(STV_CHAPTER_URL, STV_PROMPT, {
      waitMs: 2000,
      before: (env) => {
        env.document.documentElement.getAttribute = (name) => (name === 'data-qc-alerts' ? JSON.stringify(['Lỗi không xác định, vui lòng thử lại sau, mã báo lỗi:4008.\nhttps://sangtacviet.com/']) : null);
      },
      during: (env) => {
        setTimeout(() => { env.document.documentElement.outerHTML = loaded; }, 40);
      }
    });
    assert.deepStrictEqual(posted.map((m) => m.type), ['chapter'], 'the chapter, not a "blocked" stop');
  });

  await test('page script says what the user must do when a sangtacviet chapter never starts loading', async () => {
    const posted = await runPage(STV_URL, STV_PROMPT);
    assert.deepStrictEqual(posted.map((m) => [m.type, m.outcome]), [['failed', 'needs-user']], 'not a bare "empty"');
    assert(/Nhấp vào để tải chương/.test(posted[0].reason));
  });

  await test('page script reports an image (paid) chapter instead of text', async () => {
    const posted = await runPage(NK_CHAPTER_URL, NK_IMAGE);
    assert.deepStrictEqual(posted.map((m) => m.type), ['image']);
    assert.strictEqual(posted[0].slug, '100181750');
  });

  await test('page script reports other pages (login, home) so the app can show them', async () => {
    const posted = await runPage('https://www.nkwwlkj.cn/signup/login', '<html><body>login</body></html>');
    assert.deepStrictEqual(posted, [{ type: 'other', url: 'https://www.nkwwlkj.cn/signup/login', provider: 'nkwwlkj' }]);
    const unknown = await runPage('https://example.com/', '<html></html>');
    assert.deepStrictEqual(unknown, [{ type: 'other', url: 'https://example.com/' }]);
  });

  const IMAGE = { bytes: new Uint8Array([1, 2, 3]).buffer, mimeType: 'image/png', width: 939, height: 4200 };

  await test('page script captures an image chapter and sends the picture to the app', async () => {
    const posted = await runPage(NK_CHAPTER_URL, NK_IMAGE, {
      before: (env) => { env.NkwwlkjProvider.captureChapterImage = async (doc, win) => (doc === env.document && win === env ? IMAGE : null); }
    });
    assert.strictEqual(posted.length, 1);
    assert.strictEqual(posted[0].type, 'image');
    assert.strictEqual(posted[0].chapterSlug, '100043460');
    assert.deepStrictEqual(posted[0].image, { base64: 'AQID', mimeType: 'image/png', width: 939, height: 4200 });
  });

  await test('page script retries the capture until the site has drawn the image', async () => {
    let attempts = 0;
    const posted = await runPage(NK_CHAPTER_URL, NK_IMAGE, {
      waitMs: 500,
      before: (env) => { env.NkwwlkjProvider.captureChapterImage = async () => (++attempts < 3 ? null : IMAGE); }
    });
    assert.strictEqual(attempts, 3);
    assert.strictEqual(posted[0].image.base64, 'AQID');
  });

  await test('page script still reports the image chapter when the picture cannot be captured', async () => {
    const posted = await runPage(NK_CHAPTER_URL, NK_IMAGE, {
      before: (env) => { env.NkwwlkjProvider.captureChapterImage = async () => { throw new Error('tainted canvas'); }; }
    });
    assert.deepStrictEqual(posted.map((m) => [m.type, m.image]), [['image', undefined]]);
    assert(/tainted canvas/.test(posted[0].error), 'says why');
  });

  // --- SiteSave: the app's site window on top of Platform.siteBrowser ---

  await test('the site window handles one page at a time', async () => {
    const { createSiteSave } = loadSiteSave().SiteSave;
    const browser = fakeBrowser();
    const save = createSiteSave({ browser, loadScript: async () => '' });
    const first = save.fetchPage(NK_CHAPTER_URL);
    const second = save.fetchPage('https://www.nkwwlkj.cn/chapter/book_chapter_detail/100043461');
    await tick(); await tick();
    assert.strictEqual(browser.calls.filter((c) => c[0] === 'open').length, 1, 'second waits');
    await browser.emit(CHAPTER_MSG);
    await first;
    await tick(); await tick();
    assert.strictEqual(browser.calls.filter((c) => c[0] === 'open').length, 2, 'second starts after the first');
    await browser.emit({ ...CHAPTER_MSG, chapterSlug: '100043461', url: 'https://www.nkwwlkj.cn/chapter/book_chapter_detail/100043461' });
    assert.strictEqual((await second).kind, 'text');
  });

  await test('each site opens with the user agent it needs (nkwwlkj desktop, sangtacviet phone Chrome)', async () => {
    const env = loadSiteSave();
    const { createSiteSave } = env.SiteSave;
    const browser = fakeBrowser();
    const save = createSiteSave({ browser, loadScript: async () => '', userAgentFor: async (url) => (url.includes('sangtacviet') ? 'PHONE' : 'DESKTOP') });
    const first = save.fetchPage('https://sangtacviet.com/truyen/uukanshu/1/92019/1122/');
    await tick(); await tick();
    await browser.emit({ type: 'closed' });
    await assert.rejects(first, /Closed before the chapter loaded/);
    const login = save.openLogin('https://www.nkwwlkj.cn/signup/login');
    await tick(); await tick();
    await browser.emit({ type: 'closed' });
    await login;
    assert.deepStrictEqual(browser.calls.filter((c) => c[0] === 'open').map((c) => c[2].userAgent), ['PHONE', 'DESKTOP']);

    const kinds = [];
    env.Platform = { async useSiteIdentity(url, kind) { kinds.push([new URL(url).hostname, kind]); return kind === 'desktop' ? 'DESKTOP-UA' : 'PHONE-UA'; } };
    vm.runInContext(read('src', 'providers', 'nkwwlkj.js'), env);
    vm.runInContext(read('src', 'providers', 'sangtacviet.js'), env);
    vm.runInContext(read('src', 'providers', 'wetriedtls.js'), env);
    vm.runInContext(read('src', 'providers', 'registry.js'), env);
    assert.strictEqual(await env.SiteSave.siteUserAgent('https://www.nkwwlkj.cn/chapter/book_chapter_detail/1'), 'DESKTOP-UA', 'nkwwlkj sends phones to its mobile site');
    assert.strictEqual(await env.SiteSave.siteUserAgent('https://sangtacviet.com/truyen/uukanshu/1/92019/1122/'), 'PHONE-UA', 'sangtacviet refuses a desktop identity on a phone');
    assert.strictEqual(await env.SiteSave.siteUserAgent('https://example.com/'), 'PHONE-UA');
    assert.deepStrictEqual(plain(kinds), [['www.nkwwlkj.cn', 'desktop'], ['sangtacviet.com', 'mobile'], ['example.com', 'mobile']], 'each site keeps one identity (the platform resets its cookies when it changes)');
  });

  // --- fetchPage: the app's page source for the download queue (returns, never saves) ---

  const EXPECT = { slug: '100181750', chapterSlug: '100043460' };

  await test('fetchPage returns the chapter the page shows, saves nothing and closes the page', async () => {
    const { createSiteSave } = loadSiteSave().SiteSave;
    const browser = fakeBrowser();
    const storage = fakeStorage();
    const done = createSiteSave({ browser, storage, loadScript: async () => 'SCRIPT', userAgentFor: async () => 'UA' }).fetchPage(NK_CHAPTER_URL, { expect: EXPECT });
    await tick(); await tick();
    assert.deepStrictEqual(browser.calls, [['open', NK_CHAPTER_URL, { script: 'SCRIPT', visible: false, userAgent: 'UA' }]]);
    await browser.emit(CHAPTER_MSG);
    const source = plain(await done);
    assert.deepStrictEqual(source, { kind: 'text', title: '第一章 张角', rawText: 'First line of the chapter.\n\nSecond line.', url: NK_CHAPTER_URL });
    assert.deepStrictEqual(storage.calls, [], 'nothing saved here; the download pipeline saves');
    assert.deepStrictEqual(browser.calls.slice(-1), [['close']]);
  });

  await test('fetchPage returns an image chapter\'s picture for OCR', async () => {
    const { createSiteSave } = loadSiteSave().SiteSave;
    const browser = fakeBrowser();
    const done = createSiteSave({ browser, storage: fakeStorage(), loadScript: async () => '' }).fetchPage(NK_CHAPTER_URL, { expect: EXPECT });
    await tick(); await tick();
    await browser.emit({ ...CHAPTER_MSG, type: 'image', rawText: undefined, image: { base64: 'AQID', mimeType: 'image/png', width: 939, height: 4200 } });
    const source = await done;
    assert.strictEqual(source.kind, 'image');
    assert.deepStrictEqual(Array.from(new Uint8Array(source.image.bytes)), [1, 2, 3]);
    assert.strictEqual(source.image.mimeType, 'image/png');
    assert.strictEqual(source.url, NK_CHAPTER_URL);
  });

  await test('fetchPage asks for the user (and shows the page) when the chapter does not come, then still returns it', async () => {
    const { createSiteSave } = loadSiteSave().SiteSave;
    for (const message of [
      { type: 'empty', url: NK_CHAPTER_URL },
      { type: 'other', url: 'https://www.nkwwlkj.cn/signup/login' },
      { ...CHAPTER_MSG, chapterSlug: '999' },
      { ...CHAPTER_MSG, type: 'image', rawText: undefined, error: 'tainted canvas' }
    ]) {
      const browser = fakeBrowser();
      const asks = [];
      const done = createSiteSave({ browser, storage: fakeStorage(), loadScript: async () => '' }).fetchPage(NK_CHAPTER_URL, { expect: EXPECT, onNeedsUser: (reason) => asks.push(reason) });
      await tick(); await tick();
      await browser.emit(message);
      assert.strictEqual(asks.length, 1, `${message.type}: asks once`);
      assert(asks[0].length > 5, `${message.type}: says why (${asks[0]})`);
      assert.deepStrictEqual(browser.calls.slice(1), [['show']], `${message.type}: shows the page`);
      await browser.emit(CHAPTER_MSG);
      assert.strictEqual((await done).kind, 'text', `${message.type}: the chapter still arrives`);
    }
  });

  await test('fetchPage fails when the user closes the page, or the download is cancelled', async () => {
    const { createSiteSave } = loadSiteSave().SiteSave;
    let browser = fakeBrowser();
    let done = createSiteSave({ browser, storage: fakeStorage(), loadScript: async () => '' }).fetchPage(NK_CHAPTER_URL, { expect: EXPECT });
    await tick(); await tick();
    await browser.emit({ type: 'closed' });
    await assert.rejects(() => done, /Closed before the chapter loaded/);

    browser = fakeBrowser();
    const controller = new AbortController();
    done = createSiteSave({ browser, storage: fakeStorage(), loadScript: async () => '' }).fetchPage(NK_CHAPTER_URL, { expect: EXPECT, signal: controller.signal });
    await tick(); await tick();
    controller.abort();
    await assert.rejects(() => done, /UserCancelled/);
    assert.deepStrictEqual(browser.calls.slice(-1), [['close']], 'the page is closed');
  });

  await test('fetchPage asks for the user when the page stays silent too long', async () => {
    const { createSiteSave } = loadSiteSave().SiteSave;
    const browser = fakeBrowser();
    const asks = [];
    const done = createSiteSave({ browser, storage: fakeStorage(), loadScript: async () => '', hiddenWaitMs: 20 }).fetchPage(NK_CHAPTER_URL, { expect: EXPECT, onNeedsUser: (r) => asks.push(r) });
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(asks.length, 1);
    assert.deepStrictEqual(browser.calls.slice(1), [['show']]);
    await browser.emit(CHAPTER_MSG);
    await done;
  });

  await test('the app offers the page source through the platform', () => {
    const env = loadSiteSave();
    env.Platform = { siteBrowser: {} };
    vm.runInContext(read('src', 'services', 'platform.js'), env);
    assert.strictEqual(env.Platform.pageSource, null, 'not without a site browser');
    const fetched = [];
    env.SiteSave.available = () => true;
    env.SiteSave.fetchPage = (url, opts) => { fetched.push([url, opts]); return Promise.resolve({ kind: 'text' }); };
    const source = env.Platform.pageSource;
    assert(source && typeof source.fetch === 'function', 'available with the site saver');
    source.fetch('https://x/1', { a: 1 });
    assert.deepStrictEqual(plain(fetched), [['https://x/1', { a: 1 }]]);
  });

  // --- Extension: the same page source over a background tab ---

  function loadTabSource() {
    const env = { console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, URL, atob, btoa };
    env.globalThis = env;
    vm.createContext(env);
    vm.runInContext(read('src', 'services', 'page-session.js'), env);
    vm.runInContext(read('src', 'services', 'tab-page-source.js'), env);
    return env.TabPageSource;
  }

  function fakeTabs() {
    const calls = [];
    let seq = 40;
    return {
      calls,
      create: async (props) => { calls.push(['create', props.url, props.active]); return { id: ++seq, windowId: 1 }; },
      remove: async (id) => { calls.push(['remove', id]); },
      activate: async (id) => { calls.push(['activate', id]); }
    };
  }

  await test('extension: a download opens the chapter in a background tab and returns what its page reports', async () => {
    const tabs = fakeTabs();
    const source = loadTabSource().create({ tabs, pageFor: (url) => `ext://open-to-save?url=${url}` });
    const done = source.fetch(NK_CHAPTER_URL, { expect: EXPECT });
    await tick(); await tick();
    assert.deepStrictEqual(tabs.calls, [['create', `ext://open-to-save?url=${NK_CHAPTER_URL}#qc-download`, false]], 'in the background, through the hand-off page, marked as a download tab');
    assert.deepStrictEqual(plain(source.sessionFor(41)), { expect: EXPECT }, 'the content script can ask whether its tab is a download');
    assert.strictEqual(source.sessionFor(99), null, 'other tabs are not');
    source.onTabMessage(41, CHAPTER_MSG);
    const result = plain(await done);
    assert.deepStrictEqual(result, { kind: 'text', title: '第一章 张角', rawText: 'First line of the chapter.\n\nSecond line.', url: NK_CHAPTER_URL });
    assert.deepStrictEqual(tabs.calls.slice(1), [['remove', 41]], 'the tab closes');
    assert.strictEqual(source.sessionFor(41), null);
  });

  await test('extension: download tabs record site alerts instead of showing them; other tabs are untouched', () => {
    const shown = [];
    const make = (hash) => {
      const attrs = {};
      const env = { location: { hash }, alert: (m) => shown.push(m), document: { documentElement: { setAttribute: (k, v) => { attrs[k] = v; }, getAttribute: (k) => (k in attrs ? attrs[k] : null) } } };
      env.window = env;
      env.globalThis = env;
      vm.createContext(env);
      vm.runInContext(read('extension', 'scripts', 'page-alerts.js'), env);
      return { env, attrs };
    };
    const download = make('#qc-download');
    vm.runInContext("alert('Lỗi không xác định, mã báo lỗi:4005\\nhttps://x'); window.alert('second')", download.env);
    assert.deepStrictEqual(shown, [], 'no pop-up in a download tab');
    assert.deepStrictEqual(JSON.parse(download.attrs['data-qc-alerts']), ['Lỗi không xác định, mã báo lỗi:4005\nhttps://x', 'second'], 'recorded for the page script');
    const reading = make('');
    vm.runInContext("alert('hello')", reading.env);
    assert.deepStrictEqual(shown, ['hello'], 'a tab the user opened still shows the site alerts');
    assert.strictEqual(reading.attrs['data-qc-alerts'], undefined);
  });

  await test('extension: the alert catcher runs in the page itself before the site scripts, on sangtacviet chapter pages', () => {
    const manifest = JSON.parse(read('extension', 'manifest.json'));
    const entry = manifest.content_scripts.find((c) => c.js.includes('scripts/page-alerts.js'));
    assert(entry, 'a content script entry for the alert catcher');
    assert.deepStrictEqual(entry.js, ['scripts/page-alerts.js']);
    assert.strictEqual(entry.world, 'MAIN', 'runs in the page context, where the site calls alert');
    assert.strictEqual(entry.run_at, 'document_start', 'before the site scripts');
    assert(entry.matches.includes('*://sangtacviet.com/truyen/*') && entry.matches.includes('*://*.sangtacviet.com/truyen/*'));
  });

  await test('the download tab marker does not change which chapter a page is', () => {
    const env = loadPage(NK_CHAPTER_URL, '<html></html>');
    for (const url of [NK_CHAPTER_URL, 'https://sangtacviet.com/truyen/qidian/1/1047557032/935406276/']) {
      const provider = env.ProviderRegistry.getProviderForUrl(url + '#qc-download');
      assert(provider, url);
      const { url: marked, ...ids } = plain(provider.parseUrl(url + '#qc-download'));
      const { url: plainUrl, ...expected } = plain(provider.parseUrl(url));
      assert.deepStrictEqual(ids, expected, url);
    }
  });

  await test('a download acts on why a page failed: skip and blocked end it, needs-user waits for the user', () => {
    const env = { console, setTimeout, clearTimeout, atob, btoa };
    env.globalThis = env;
    vm.createContext(env);
    vm.runInContext(read('src', 'services', 'page-session.js'), env);
    const start = () => {
      const seen = { asked: [], shown: 0, finished: [] };
      const session = env.PageSession.create({
        expect: { slug: 'qidian-1047557032', chapterSlug: '935406276' },
        onNeedsUser: (reason) => seen.asked.push(reason),
        show: () => { seen.shown++; },
        finish: (error, source) => seen.finished.push(error ? { message: error.message, outcome: error.outcome } : source)
      });
      return { session, seen };
    };
    const failed = (outcome, reason) => ({ type: 'failed', slug: 'qidian-1047557032', chapterSlug: '935406276', outcome, reason });

    for (const outcome of ['skip', 'blocked', 'retry']) {
      const { session, seen } = start();
      session.handle(failed(outcome, `why ${outcome}`));
      assert.deepStrictEqual(plain(seen.finished), [{ message: `why ${outcome}`, outcome }], `${outcome} ends the download with its reason`);
      assert.strictEqual(seen.shown, 0, `${outcome} does not bring the page forward`);
    }

    const { session, seen } = start();
    session.handle(failed('needs-user', 'Tap to load'));
    assert.deepStrictEqual(seen.asked, ['Tap to load'], 'needs-user asks for the user with the reason');
    assert.strictEqual(seen.shown, 1, 'and shows the page');
    assert.deepStrictEqual(seen.finished, [], 'and keeps waiting for the chapter');

    const other = start();
    other.session.handle({ ...failed('skip', 'VIP'), chapterSlug: '1' });
    assert.deepStrictEqual(other.seen.finished, [], 'a failure on a different chapter does not end this download');
    assert.strictEqual(other.seen.asked.length, 1, 'it asks for the user instead');
  });

  await test('page script reports the chapter URL without the download tab marker', async () => {
    const posted = await runPage(STV_URL + '#qc-download', STV_PROMPT);
    assert.strictEqual(posted[0].url, STV_URL);
  });

  await test('extension: when the page needs you the tab comes forward; closing it ends the download', async () => {
    const tabs = fakeTabs();
    const source = loadTabSource().create({ tabs, pageFor: (url) => url });
    const asks = [];
    let done = source.fetch(NK_CHAPTER_URL, { expect: EXPECT, onNeedsUser: (r) => asks.push(r) });
    await tick(); await tick();
    source.onTabMessage(41, { type: 'empty', url: NK_CHAPTER_URL });
    assert.strictEqual(asks.length, 1);
    assert.deepStrictEqual(tabs.calls.slice(1), [['activate', 41]]);
    source.onTabRemoved(41);
    await assert.rejects(() => done, /Closed before the chapter loaded/);
    assert(!tabs.calls.some((c) => c[0] === 'remove'), 'not removed again');

    const slow = fakeTabs();
    const timed = loadTabSource().create({ tabs: slow, pageFor: (url) => url, hiddenWaitMs: 20 });
    const waits = [];
    done = timed.fetch(NK_CHAPTER_URL, { expect: EXPECT, onNeedsUser: (r) => waits.push(r) });
    await new Promise((r) => setTimeout(r, 50));
    assert.strictEqual(waits.length, 1, 'a silent page (login, check) asks for you too');
    timed.onTabMessage(41, { ...CHAPTER_MSG, type: 'image', rawText: undefined, image: { base64: 'AQID', mimeType: 'image/png', width: 1, height: 1 } });
    const image = await done;
    assert.strictEqual(image.kind, 'image');
    assert.strictEqual(image.image.base64, 'AQID', 'keeps the picture as text for the OCR page');
    assert.deepStrictEqual(Array.from(new Uint8Array(image.image.bytes)), [1, 2, 3]);
  });

  await test('extension: a cancelled download closes its tab', async () => {
    const tabs = fakeTabs();
    const source = loadTabSource().create({ tabs, pageFor: (url) => url });
    const controller = new AbortController();
    const done = source.fetch(NK_CHAPTER_URL, { expect: EXPECT, signal: controller.signal });
    await tick(); await tick();
    controller.abort();
    await assert.rejects(() => done, /UserCancelled/);
    assert.deepStrictEqual(tabs.calls.slice(-1), [['remove', 41]]);
  });

  await test('extension: in a download tab the content script reports the page instead of saving it', async () => {
    const sent = [];
    const document = { documentElement: { outerHTML: NK_RENDERED }, getElementById: () => null, createElement: () => ({ style: {} }), body: { appendChild() {} } };
    const env = {
      console: { log() {}, warn() {}, error() {} },
      URL, URLSearchParams, setTimeout, clearTimeout, btoa,
      MutationObserver: class { observe() {} },
      document,
      chrome: {
        runtime: {
          lastError: undefined,
          getURL: (p) => `chrome-extension://abc/${p}`,
          sendMessage: (msg, cb) => {
            sent.push(JSON.parse(JSON.stringify(msg)));
            if (msg.action === 'PAGE_SOURCE_QUERY') setTimeout(() => cb({ expect: EXPECT }), 0);
            else if (cb) setTimeout(() => cb({ success: true }), 0);
          }
        }
      }
    };
    env.window = { location: { href: NK_CHAPTER_URL }, addEventListener() {}, removeEventListener() {} };
    env.location = env.window.location;
    env.globalThis = env;
    vm.createContext(env);
    for (const file of [['src', 'providers', 'nkwwlkj.js'], ['src', 'providers', 'registry.js'], ['src', 'services', 'site-page.js'], ['extension', 'scripts', 'content.js']]) {
      vm.runInContext(read(...file), env);
    }
    await new Promise((r) => setTimeout(r, 50));
    assert.deepStrictEqual(sent.map((m) => m.action), ['PAGE_SOURCE_QUERY', 'PAGE_SOURCE_RESULT']);
    assert.strictEqual(sent[1].message.type, 'chapter');
    assert.strictEqual(sent[1].message.chapterSlug, '100043460');
    assert(!sent.some((m) => m.action === 'SAVE_CHAPTER' || m.action === 'CHECK_CHAPTER'), 'the download pipeline saves, not the content script');
  });

  await test('extension: the worker answers download tabs, offers the page source and reads images offscreen', () => {
    const manifest = JSON.parse(read('extension', 'manifest.json'));
    const pageSites = manifest.content_scripts.filter((c) => c.js.includes('scripts/content.js') && c.matches.some((m) => /nkwwlkj|sangtacviet/.test(m)));
    assert.strictEqual(pageSites.length, 2);
    pageSites.forEach((c) => {
      assert(c.js.indexOf('services/site-page.js') > -1 && c.js.indexOf('services/site-page.js') < c.js.indexOf('scripts/content.js'), 'the page runner is injected before the content script');
    });
    assert(manifest.permissions.includes('offscreen'), 'offscreen permission for OCR');
    const background = read('extension', 'scripts', 'background.js');
    for (const file of ['../services/page-session.js', '../services/tab-page-source.js', '../services/offscreen-ocr.js']) {
      assert(background.includes(`'${file}'`), `the worker loads ${file}`);
    }
    for (const action of ['PAGE_SOURCE_QUERY', 'PAGE_SOURCE_RESULT']) assert(background.includes(`'${action}'`), `the worker handles ${action}`);
    assert(/Platform\.provide\(\{[\s\S]*pageSource[\s\S]*ocr[\s\S]*\}\)/.test(background), 'and provides the page source and OCR to the platform');
    assert(/ocroffscreen:\s*'views\/ocr-offscreen\.html'/.test(read('build-targets.mjs')), 'the offscreen OCR page is built for the extension');
  });

  await test('extension: OCR requests go to the offscreen page and come back as text', async () => {
    const env = { console: { log() {}, warn() {}, error() {} }, btoa };
    env.globalThis = env;
    vm.createContext(env);
    vm.runInContext(read('src', 'services', 'offscreen-ocr.js'), env);
    const sent = [];
    let ensured = 0;
    const ocr = env.OffscreenOcr.create({
      ensureDocument: async () => { ensured++; },
      send: async (msg) => { sent.push(msg); return msg.base64 === 'AQID' ? { text: '第一章' } : { error: 'model failed to load' }; }
    });
    assert.strictEqual(await ocr.recognize(new Uint8Array([1, 2, 3]).buffer, 'image/png'), '第一章');
    assert.deepStrictEqual(plain(sent[0]), { action: 'OCR_RECOGNIZE', target: 'offscreen', base64: 'AQID', mimeType: 'image/png' });
    assert.strictEqual(ensured, 1, 'makes sure the offscreen page exists');
    await assert.rejects(() => ocr.recognize(new Uint8Array([9]).buffer, 'image/png'), /model failed to load/);
  });

  await test('Log in opens the site visibly without the page script and ends when closed', async () => {
    const { createSiteSave } = loadSiteSave().SiteSave;
    const browser = fakeBrowser();
    const done = createSiteSave({ browser, storage: fakeStorage(), loadScript: async () => 'SCRIPT' }).openLogin('https://www.nkwwlkj.cn/signup/login');
    await tick(); await tick();
    assert.deepStrictEqual(browser.calls, [['open', 'https://www.nkwwlkj.cn/signup/login', { script: '', visible: true }]]);
    await browser.emit(CHAPTER_MSG);
    assert(!browser.calls.some((c) => c[0] === 'close'), 'a login is never auto-closed');
    await browser.emit({ type: 'closed' });
    assert.strictEqual((await done).status, 'closed');
  });

  await test('the page script bundle is the providers, the registry and the page runner, posting to the native bridge', async () => {
    const { pageScriptFiles, bundlePageScript } = loadSiteSave().SiteSave;
    assert.deepStrictEqual(plain(pageScriptFiles), [
      '../providers/wetriedtls.js',
      '../providers/nkwwlkj.js',
      '../providers/sangtacviet.js',
      '../providers/registry.js',
      '../services/site-page.js'
    ]);
    for (const file of pageScriptFiles) assert(fs.existsSync(path.join(repoRoot, 'src', file.replace('../', ''))), `${file} exists`);
    const bundle = bundlePageScript(['var A = 1;', 'var B = 2;']);
    const posted = [];
    const env = { QCSitePage: { run: (o) => { o.post({ type: 'x' }); } }, QCSiteBrowser: { post: (s) => posted.push(s) }, document: {} };
    env.window = env;
    vm.createContext(env);
    vm.runInContext(bundle, env);
    vm.runInContext(bundle, env);
    assert.deepStrictEqual(posted, ['{"type":"x"}'], 'posts JSON to the bridge, once per page');
  });

  // --- Wiring in the app ---

  await test('views that download load the site saver after storage', () => {
    for (const view of ['novel', 'reader']) {
      const html = read('src', 'views', `${view}.html`);
      const storageAt = html.indexOf('../services/storage.js');
      const saveAt = html.indexOf('../services/site-save.js');
      assert(saveAt > storageAt && storageAt > -1, `${view}.html loads site-save.js after storage.js`);
    }
  });

  await test('the app registers the native SiteBrowser plugin', () => {
    const activity = read('android', 'app', 'src', 'main', 'java', 'com', 'quickconverter', 'app', 'MainActivity.java');
    assert(/registerPlugin\(SiteBrowserPlugin\.class\)/.test(activity), 'registered');
    const plugin = read('android', 'app', 'src', 'main', 'java', 'com', 'quickconverter', 'app', 'SiteBrowserPlugin.java');
    assert(/@CapacitorPlugin\(name = "SiteBrowser"\)/.test(plugin), 'named SiteBrowser');
    for (const method of ['open', 'show', 'hide', 'close']) {
      assert(new RegExp(`@PluginMethod\\s+public void ${method}\\(PluginCall call\\)`).test(plugin), `has ${method}()`);
    }
    assert(/addJavascriptInterface\(new \w+\(\), "QCSiteBrowser"\)/.test(plugin),'exposes the QCSiteBrowser bridge to the page script');
    assert(/setAcceptThirdPartyCookies/.test(plugin), 'shares cookies with native HTTP');
    assert(/call\.getString\("userAgent"/.test(plugin) && /setUserAgentString\(userAgent\)/.test(plugin), 'loads pages with the user agent the app asks for (desktop, like native HTTP)');
    assert(/@PluginMethod\s+public void clearCookies\(PluginCall call\)/.test(plugin) && /Max-Age=0/.test(plugin) && /Domain=/.test(plugin), "can drop a site's cookies, including domain-wide ones");
    assert(/setRequestedWithHeaderOriginAllowList\([^,]+,\s*Collections\.emptySet\(\)\)/.test(plugin), 'no X-Requested-With app header, like a browser');
    assert(/"Android WebView"/.test(plugin) && /"Google Chrome"/.test(plugin) && /setUserAgentMetadata\(/.test(plugin), 'reports itself as Chrome, not Android WebView');
    assert(/isFeatureSupported\(WebViewFeature\.REQUESTED_WITH_HEADER_ALLOW_LIST\)/.test(plugin) && /isFeatureSupported\(WebViewFeature\.USER_AGENT_METADATA\)/.test(plugin), 'only where the WebView supports it');
    const appGradle = read('android', 'app', 'build.gradle');
    assert(/implementation "androidx\.webkit:webkit:\$androidxWebkitVersion"/.test(appGradle), 'the app compiles against androidx.webkit');
  });

  await test('Download is the only way to save a chapter from the library: Open to save is gone', () => {
    const env = loadSiteSave();
    const saver = env.SiteSave.createSiteSave({ browser: fakeBrowser() });
    assert.deepStrictEqual(Object.keys(saver).sort(), ['fetchPage', 'openLogin'], 'the app site window only fetches pages for downloads and opens logins');
    assert(!('open' in env.SiteSave) && !('onStatus' in env.SiteSave), 'no Open to save sessions or status');
    const storage = read('src', 'services', 'storage.js');
    assert(!/openChapterInBackground\(/.test(storage) && !/saveRecognizedChapter\(/.test(storage), 'storage has no Open to save or separate OCR save');
    const bg = read('extension', 'scripts', 'background.js');
    assert(!/OPEN_TO_SAVE|PAGE_CHAPTER_DONE|OpenToSave/.test(bg), 'the worker has no Open to save tracker or messages');
    assert(!/PAGE_CHAPTER_DONE|QC_OCR_SAVED/.test(read('extension', 'scripts', 'content.js')), 'the content script reports no Open to save tabs');
    assert(!fs.existsSync(path.join(repoRoot, 'src', 'services', 'open-to-save.js')), 'no tracker file');
    assert(!fs.existsSync(path.join(repoRoot, 'src', 'components', 'react', 'shared', 'ManualChapterAction.jsx')), 'no Open to save link');
    assert(!fs.existsSync(path.join(repoRoot, 'src', 'components', 'react', 'shared', 'SiteSaveStatus.jsx')), 'no Open to save status');
    assert(!/canBulkDownload/.test(read('src', 'providers', 'registry.js')), 'every site is queueable');
    for (const site of ['nkwwlkj.js', 'sangtacviet.js']) {
      const src = read('src', 'providers', site);
      assert(!/supportsBulkDownload|fetchChapterContent/.test(src) && /fetchMode: 'page'/.test(src), `${site} downloads through its page`);
    }
    assert(!/cannot be downloaded in the background/.test(read('src', 'services', 'download-queue.js')), 'the queue has no special case for it');
  });

  console.log(`--- Site Browser Test Suite: ${passed}/${passed + failed} passed ---`);
  if (failed > 0) {
    console.error('Site Browser Test Suite FAILED');
    process.exit(1);
  }
  console.log('Site Browser Test Suite: ALL TESTS PASSED!');
  finished = true;
})();
