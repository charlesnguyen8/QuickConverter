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
    async saveOpenedChapter(data) { calls.push(['saveOpenedChapter', plain(data)]); return { success: true, novelId: 'novel-1' }; }
  };
}

function loadSiteSave() {
  const env = { console: { log() {}, warn() {}, error() {} }, setTimeout, clearTimeout, URL };
  env.window = env;
  env.self = env;
  env.globalThis = env;
  vm.createContext(env);
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

  // --- SiteSave: the app-side Open to save on top of Platform.siteBrowser ---

  await test('Open to save loads the chapter hidden, saves what the page reports and closes it', async () => {
    const { createSiteSave } = loadSiteSave().SiteSave;
    const browser = fakeBrowser();
    const storage = fakeStorage();
    const save = createSiteSave({ browser, storage, loadScript: async () => 'SCRIPT' });
    const done = save.open(NK_CHAPTER_URL);
    await tick(); await tick();
    assert.deepStrictEqual(browser.calls, [['open', NK_CHAPTER_URL, { script: 'SCRIPT', visible: false }]]);
    await browser.emit(CHAPTER_MSG);
    const result = plain(await done);
    assert.strictEqual(result.status, 'saved');
    assert.strictEqual(result.chapterNumber, 1);
    const saveCall = storage.calls.find((c) => c[0] === 'saveOpenedChapter');
    assert.deepStrictEqual(saveCall[1], {
      slug: '100181750',
      chapterNumber: 1,
      title: '第一章 张角',
      url: NK_CHAPTER_URL,
      rawText: 'First line of the chapter.\n\nSecond line.',
      domain: 'www.nkwwlkj.cn'
    });
    assert.deepStrictEqual(browser.calls.slice(1), [['close']], 'closed once saved, never shown');
    assert.strictEqual(browser.subscribed, false, 'stops listening');
  });

  await test('Open to save syncs the catalog once when the chapter is new', async () => {
    const { createSiteSave } = loadSiteSave().SiteSave;
    const browser = fakeBrowser();
    const storage = fakeStorage();
    const done = createSiteSave({ browser, storage, loadScript: async () => '' }).open(NK_CHAPTER_URL);
    await tick(); await tick();
    await browser.emit({ ...CHAPTER_MSG, chapterSlug: '100043461' });
    const result = plain(await done);
    assert.strictEqual(result.status, 'saved');
    assert.strictEqual(result.chapterNumber, 2);
    assert(storage.calls.some((c) => c[0] === 'syncNovelChapters'), 'catalog synced');
  });

  await test('Open to save does not save a chapter twice or for a book that is not in the library', async () => {
    const { createSiteSave } = loadSiteSave().SiteSave;
    let browser = fakeBrowser();
    let storage = fakeStorage({ saved: [1] });
    let done = createSiteSave({ browser, storage, loadScript: async () => '' }).open(NK_CHAPTER_URL);
    await tick(); await tick();
    await browser.emit(CHAPTER_MSG);
    assert.strictEqual((await done).status, 'already-saved');
    assert(!storage.calls.some((c) => c[0] === 'saveOpenedChapter'));
    assert.deepStrictEqual(browser.calls.slice(-1), [['close']]);

    browser = fakeBrowser();
    storage = fakeStorage({ managed: false });
    done = createSiteSave({ browser, storage, loadScript: async () => '' }).open(NK_CHAPTER_URL);
    await tick(); await tick();
    await browser.emit(CHAPTER_MSG);
    assert.strictEqual((await done).status, 'not-managed');
    assert(!storage.calls.some((c) => c[0] === 'saveOpenedChapter'));
  });

  await test('Open to save shows the page when it needs the user, then saves once the chapter appears', async () => {
    const { createSiteSave } = loadSiteSave().SiteSave;
    for (const type of ['empty', 'other', 'image']) {
      const browser = fakeBrowser();
      const storage = fakeStorage();
      const done = createSiteSave({ browser, storage, loadScript: async () => '' }).open(NK_CHAPTER_URL);
      await tick(); await tick();
      await browser.emit({ type, url: NK_CHAPTER_URL });
      assert.deepStrictEqual(browser.calls.slice(1), [['show']], `${type}: shown to the user`);
      await browser.emit(CHAPTER_MSG);
      assert.strictEqual((await done).status, 'saved', `${type}: saved after the user's step`);
      assert.deepStrictEqual(browser.calls.slice(-1), [['close']]);
    }
  });

  await test('Open to save shows the page if nothing arrives in time, and ends when the user closes it', async () => {
    const { createSiteSave } = loadSiteSave().SiteSave;
    const browser = fakeBrowser();
    const done = createSiteSave({ browser, storage: fakeStorage(), loadScript: async () => '', hiddenWaitMs: 20 }).open(NK_CHAPTER_URL);
    await new Promise((r) => setTimeout(r, 50));
    assert.deepStrictEqual(browser.calls.slice(1), [['show']]);
    await browser.emit({ type: 'closed' });
    assert.strictEqual((await done).status, 'cancelled');
  });

  await test('Open to save handles one page at a time', async () => {
    const { createSiteSave } = loadSiteSave().SiteSave;
    const browser = fakeBrowser();
    const save = createSiteSave({ browser, storage: fakeStorage(), loadScript: async () => '' });
    const first = save.open(NK_CHAPTER_URL);
    const second = save.open('https://www.nkwwlkj.cn/chapter/book_chapter_detail/100043461');
    await tick(); await tick();
    assert.strictEqual(browser.calls.filter((c) => c[0] === 'open').length, 1, 'second waits');
    await browser.emit(CHAPTER_MSG);
    await first;
    await tick(); await tick();
    assert.strictEqual(browser.calls.filter((c) => c[0] === 'open').length, 2, 'second starts after the first');
    await browser.emit({ ...CHAPTER_MSG, chapterSlug: '100043461', url: 'https://www.nkwwlkj.cn/chapter/book_chapter_detail/100043461' });
    assert.strictEqual((await second).status, 'saved');
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

  await test('in the app, Open to save goes through SiteSave instead of a browser tab', async () => {
    const opened = [];
    const env = {
      console: { log() {}, warn() {}, error() {} },
      URL,
      setTimeout,
      clearTimeout,
      localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
      SiteSave: { available: () => true, open: (url) => { opened.push(url); return Promise.resolve({ status: 'saved' }); } },
      open: () => { throw new Error('no new window in the app'); }
    };
    env.window = env;
    env.self = env;
    env.globalThis = env;
    vm.createContext(env);
    vm.runInContext(read('src', 'services', 'platform.js'), env);
    vm.runInContext(read('src', 'services', 'storage.js'), env);
    assert.strictEqual(env.StorageService.openChapterInBackground(NK_CHAPTER_URL), true);
    assert.deepStrictEqual(opened, [NK_CHAPTER_URL]);
    env.SiteSave.available = () => false;
    assert.strictEqual(env.StorageService.openChapterInBackground(NK_CHAPTER_URL), false, 'no site browser: the link opens normally');
  });

  await test('views that offer Open to save load the site saver after storage', () => {
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
  });

  console.log(`--- Site Browser Test Suite: ${passed}/${passed + failed} passed ---`);
  if (failed > 0) {
    console.error('Site Browser Test Suite FAILED');
    process.exit(1);
  }
  console.log('Site Browser Test Suite: ALL TESTS PASSED!');
})();
