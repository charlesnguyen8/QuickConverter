const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadComponent } = require('./helpers/render');

console.log('\n--- Running nkwwlkj.cn Provider Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(repoRoot, ...p), 'utf8');

function loadEnv(extra = {}) {
  const env = {
    console,
    URL,
    setTimeout,
    clearTimeout,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    ...extra
  };
  env.window = env;
  env.self = env;
  env.globalThis = env;
  vm.createContext(env);
  vm.runInContext(read('src', 'providers', 'wetriedtls.js'), env);
  vm.runInContext(read('src', 'providers', 'nkwwlkj.js'), env);
  vm.runInContext(read('src', 'providers', 'registry.js'), env);
  return env;
}

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

const BOOK_URL = 'https://www.nkwwlkj.cn/book/book_detail/100181750';
const CHAPTER_URL = 'https://www.nkwwlkj.cn/chapter/book_chapter_detail/100043460';

const DETAIL_HTML = `
<html><head><title>门户最新章节(守玄独阅读),门户无弹窗全文阅读-独阅读</title>
<meta name="description" content="门户是作者守玄独阅读倾情打造的一部小说"/></head><body>
<div class="row book-info-box">
  <img class="book-img lazyload"  src="https://www.nkwwlkj.cn/default.jpg" alt="门户"data-original="https://dede.cddaoyue.cn/du_novel/allimg/c220107/cover-100181750.jpg" />
  <div class="book-info">
    <div class="book-title">
      <span>门户</span>
    </div>
    <div class="row">
      <div class="tag tag-lianzai">连载</div>
      <div class="tag tag-qianyue">签约</div>
    </div>
  </div>
</div>
<div id="chapter_list" class="box chapter-list">
  <div class="chapter">
    <div class="chapter-title">番外</div>
    <div class="articles">
      <span class="chapter_item">
        <a href="https://www.nkwwlkj.cn/chapter/book_chapter_detail/100061390" target="_blank" style="color: #000000">
          调查报告  1        </a>
      </span>
      <span class="chapter_item">
        <i class="lock"><img src="https://www.nkwwlkj.cn/resources/images/lock.png"></i>
        <a href="https://www.nkwwlkj.cn/chapter/book_chapter_detail/100374104" target="_blank" style="color: #000000">
          小结        </a>
      </span>
      <hr>
    </div>
    <div class="chapter-title">正文</div>
    <div class="articles">
      <span class="chapter_item">
        <a href="https://www.nkwwlkj.cn/chapter/book_chapter_detail/100043460" target="_blank" style="color: #000000">
          第一章   张角        </a>
      </span>
      <span class="chapter_item">
        <a href="https://www.nkwwlkj.cn/chapter/book_chapter_detail/100043461" target="_blank" style="color: #000000">
          第二章   构陷        </a>
      </span>
      <hr>
    </div>
    <div class="chapter-title">夏政</div>
    <div class="articles">
      <span class="chapter_item">
        <i class="lock"><img src="https://www.nkwwlkj.cn/resources/images/lock.png"></i>
        <a href="https://www.nkwwlkj.cn/chapter/book_chapter_detail/100659849" target="_blank" style="color: #000000">
          第一百九十八章   斗争态势        </a>
      </span>
    </div>
  </div>
</div>
<div class="right"><div class="username text-primary">守玄独阅读</div></div>
</body></html>`;

const CHAPTER_HEAD = `
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

const RENDERED_CHAPTER_HTML = `${CHAPTER_HEAD}
    <div class="read-bd" id="J_BookRead"><p class="chapter">　　First line of the chapter.<i data-pgid="1" class="J_Num num num1">14</i></p>
<p class="chapter">　　“Second &amp; quoted” line.<i data-pgid="2" class="J_Num num"></i></p>
<p class="chapter">　　</p>
<p class="chapter">　　Third line.<i data-pgid="3" class="J_Num num num1">3</i></p>
    </div>
  </div>
</div></body></html>`;

const UNRENDERED_CHAPTER_HTML = `${CHAPTER_HEAD}
    <div class="read-bd" id="J_BookRead">
    </div>
  </div>
</div></body></html>`;

const LOCKED_CHAPTER_HTML = `${CHAPTER_HEAD}
    <div class="read-bd" id="J_ImgRead">
      <div class="read-bd-wrap" id="J_BookImage"><img id="realBookImage" src="https://www.nkwwlkj.cn/resources/images/empty.gif"/></div>
    </div>
  </div>
</div></body></html>`;

const fakeDoc = (html) => ({ documentElement: { outerHTML: html } });
const plain = (v) => JSON.parse(JSON.stringify(v));

(async () => {
  const env = loadEnv();
  const P = env.NkwwlkjProvider;

  await test('provider is exported and matches both hostnames', () => {
    assert(P, 'NkwwlkjProvider global must exist');
    assert.strictEqual(P.id, 'nkwwlkj');
    assert(P.matches(BOOK_URL));
    assert(P.matches('https://nkwwlkj.cn/book/book_detail/100181750'));
    assert(!P.matches('https://wetriedtls.com/series/x'));
  });

  await test('chapters download by opening their page', () => {
    assert.strictEqual(P.fetchMode, 'page');
    assert.strictEqual(P.supportsBulkDownload, undefined, 'queueable like every site');
  });

  await test('parseUrl resolves a book page to its numeric book id', () => {
    const info = P.parseUrl('https://nkwwlkj.cn/book/book_detail/100181750?from=x');
    assert.strictEqual(info.type, 'series');
    assert.strictEqual(info.slug, '100181750');
    assert.strictEqual(info.seriesUrl, BOOK_URL);
  });

  await test('parseUrl marks a chapter page and keeps the chapter id (book id comes from the page)', () => {
    const info = P.parseUrl(CHAPTER_URL);
    assert.strictEqual(info.type, 'chapter');
    assert.strictEqual(info.slug, null);
    assert.strictEqual(info.chapterSlug, '100043460');
    assert.strictEqual(info.chapterNumber, null);
  });

  await test('parseUrl recognises the homepage and auto-opens the popup only on home/book pages', () => {
    assert.strictEqual(P.parseUrl('https://www.nkwwlkj.cn/').type, 'home');
    assert.strictEqual(P.shouldAutoOpenPopup(BOOK_URL), true);
    assert.strictEqual(P.shouldAutoOpenPopup(CHAPTER_URL), false);
  });

  await test('parseSeriesHtml reads title, author, cover, status and chapter count', () => {
    const meta = P.parseSeriesHtml(DETAIL_HTML);
    assert.strictEqual(meta.title, '门户');
    assert.strictEqual(meta.author, '守玄独阅读');
    assert.strictEqual(meta.thumbnail, 'https://dede.cddaoyue.cn/du_novel/allimg/c220107/cover-100181750.jpg');
    assert.strictEqual(meta.status, 'Ongoing');
    assert.strictEqual(meta.totalChapters, 5);
  });

  await test('extractSeriesMetadata parses the live document the same way', () => {
    const meta = P.extractSeriesMetadata(fakeDoc(DETAIL_HTML));
    assert.strictEqual(meta.title, '门户');
    assert.strictEqual(meta.totalChapters, 5);
  });

  await test('parseChapterListHtml numbers chapters in page order across volumes and flags locked ones', () => {
    const list = plain(P.parseChapterListHtml(DETAIL_HTML));
    assert.deepStrictEqual(list.map((c) => c.chapterNumber), [1, 2, 3, 4, 5]);
    assert.deepStrictEqual(list.map((c) => c.slug), ['100061390', '100374104', '100043460', '100043461', '100659849']);
    assert.deepStrictEqual(list.map((c) => c.title), ['调查报告 1', '小结', '第一章 张角', '第二章 构陷', '第一百九十八章 斗争态势']);
    assert.deepStrictEqual(list.map((c) => c.locked), [false, true, false, false, true]);
    assert.deepStrictEqual(list.map((c) => c.volume), ['番外', '番外', '正文', '正文', '夏政']);
    assert.strictEqual(list[2].url, CHAPTER_URL);
  });

  await test('parseChapterPageHtml reads the rendered text and strips comment counters', () => {
    const page = P.parseChapterPageHtml(RENDERED_CHAPTER_HTML);
    assert.strictEqual(page.bookId, '100181750');
    assert.strictEqual(page.chapterSlug, '100043460');
    assert.strictEqual(page.title, '第一章 张角');
    assert.strictEqual(page.novelTitle, '门户');
    assert.strictEqual(page.locked, false);
    assert.strictEqual(page.rawText, 'First line of the chapter.\n\n“Second & quoted” line.\n\nThird line.');
  });

  await test('parseChapterPageHtml returns no text before the site has rendered it', () => {
    const page = P.parseChapterPageHtml(UNRENDERED_CHAPTER_HTML);
    assert.strictEqual(page.locked, false);
    assert.strictEqual(page.rawText, null);
  });

  await test('parseChapterPageHtml flags locked (image-only) chapters and returns no text', () => {
    const page = P.parseChapterPageHtml(LOCKED_CHAPTER_HTML);
    assert.strictEqual(page.locked, true);
    assert.strictEqual(page.rawText, null);
  });

  await test('resolveChapterPage returns the book id and chapter id from the open page', () => {
    assert.deepStrictEqual(
      plain(P.resolveChapterPage(fakeDoc(RENDERED_CHAPTER_HTML))),
      { slug: '100181750', chapterSlug: '100043460' }
    );
  });

  await test('extractChapterInfo captures the open chapter and skips locked ones', () => {
    const info = P.extractChapterInfo(fakeDoc(RENDERED_CHAPTER_HTML), 3);
    assert.strictEqual(info.chapterNumber, 3);
    assert.strictEqual(info.title, '第一章 张角');
    assert.strictEqual(info.novelTitle, '门户');
    assert(info.rawText.startsWith('First line'));
    assert.strictEqual(P.extractChapterInfo(fakeDoc(LOCKED_CHAPTER_HTML), 5), null);
    assert.strictEqual(P.extractChapterInfo(fakeDoc(UNRENDERED_CHAPTER_HTML), 3), null);
  });

  await test('fetchSeriesMetadata and fetchChapterList read the book page over HTTP', async () => {
    const calls = [];
    const fetchEnv = loadEnv({
      fetch: async (url) => {
        calls.push(url);
        return { ok: true, text: async () => DETAIL_HTML };
      }
    });
    const FP = fetchEnv.NkwwlkjProvider;
    const meta = await FP.fetchSeriesMetadata('100181750');
    assert.strictEqual(meta.title, '门户');
    const list = await FP.fetchChapterList('100181750');
    assert.strictEqual(list.length, 5);
    assert.deepStrictEqual(calls, [BOOK_URL, BOOK_URL]);
  });

  await test('the chapter list is read as the public page, so chapters the user bought still show as paid', async () => {
    const inits = [];
    const fetchEnv = loadEnv({
      fetch: async (url, init) => {
        inits.push(init || {});
        return { ok: true, text: async () => DETAIL_HTML };
      }
    });
    await fetchEnv.NkwwlkjProvider.fetchChapterList('100181750');
    await fetchEnv.NkwwlkjProvider.fetchSeriesMetadata('100181750');
    assert.deepStrictEqual(inits.map((i) => i.credentials), ['omit', 'omit'], 'the logged-in view hides the lock on bought chapters, so cookies are never sent');
  });

  await test('formatTitle drops the site suffix from page titles', () => {
    assert.strictEqual(P.formatTitle('100181750', '门户最新章节(守玄独阅读),门户无弹窗全文阅读'), '门户');
    assert.strictEqual(P.formatTitle('100181750', '门户'), '门户');
  });

  await test('registry registers the provider', () => {
    const R = env.ProviderRegistry;
    assert.strictEqual(R.getProviderForUrl(BOOK_URL).id, 'nkwwlkj');
    assert.strictEqual(R.getProviderForDomain('nkwwlkj.cn').id, 'nkwwlkj');
    assert.strictEqual(R.getProviderForNovel({ domain: 'www.nkwwlkj.cn' }).id, 'nkwwlkj');
  });

  await test('StorageService.getCatalogChapterNumber maps a chapter id to its catalog number', () => {
    const storageEnv = loadEnv({ indexedDB: { open() { throw new Error('not used'); } } });
    vm.runInContext(read('src', 'services', 'platform.js'), storageEnv);
    vm.runInContext(read('src', 'services', 'storage.js'), storageEnv);
    const S = storageEnv.StorageService || storageEnv.window.StorageService;
    const novel = { chapterList: P.parseChapterListHtml(DETAIL_HTML) };
    assert.strictEqual(S.getCatalogChapterNumber(novel, '100043460'), 3);
    assert.strictEqual(S.getCatalogChapterNumber(novel, 100659849), 5);
    assert.strictEqual(S.getCatalogChapterNumber(novel, '999'), null);
    assert.strictEqual(S.getCatalogChapterNumber({}, '100043460'), null);
  });

  await test('StorageService relays chapter-saved notices to open views', () => {
    const sent = [];
    const listeners = new Set();
    const fakeChrome = {
      runtime: {
        lastError: undefined,
        sendMessage(msg, cb) { sent.push(msg); for (const l of listeners) l(msg, {}, () => {}); if (cb) cb(); },
        onMessage: {
          addListener(l) { listeners.add(l); },
          removeListener(l) { listeners.delete(l); }
        }
      }
    };
    const storageEnv = loadEnv({ chrome: fakeChrome, indexedDB: { open() { throw new Error('not used'); } } });
    vm.runInContext(read('src', 'services', 'platform.js'), storageEnv);
    vm.runInContext(read('src', 'services', 'storage.js'), storageEnv);
    const S = storageEnv.StorageService || storageEnv.window.StorageService;

    const received = [];
    const unsubscribe = S.subscribeChapterSaved((msg) => received.push(plain(msg)));
    S.notifyChapterSaved('novel-9', 3);
    for (const l of listeners) l({ action: 'QUEUE_STATE_UPDATE' }, {}, () => {});
    assert.deepStrictEqual(plain(sent), [{ action: 'CHAPTER_SAVED', novelId: 'novel-9', chapterNumber: 3 }]);
    assert.deepStrictEqual(received, [{ action: 'CHAPTER_SAVED', novelId: 'novel-9', chapterNumber: 3 }], 'only CHAPTER_SAVED reaches the handler');

    unsubscribe();
    S.notifyChapterSaved('novel-9', 4);
    assert.strictEqual(received.length, 1, 'unsubscribe stops notices');
  });

  await test('StorageService chapter-saved helpers are safe without the extension runtime', () => {
    const storageEnv = loadEnv({ indexedDB: { open() { throw new Error('not used'); } } });
    vm.runInContext(read('src', 'services', 'platform.js'), storageEnv);
    vm.runInContext(read('src', 'services', 'storage.js'), storageEnv);
    const S = storageEnv.StorageService || storageEnv.window.StorageService;
    S.notifyChapterSaved('novel-9', 3);
    const unsubscribe = S.subscribeChapterSaved(() => {});
    assert.strictEqual(typeof unsubscribe, 'function');
    unsubscribe();
  });

  const OPEN_URL = 'https://www.nkwwlkj.cn/chapter/book_chapter_detail/100374104';

  function runHandOff(search) {
    const replaced = [];
    const pageEnv = {
      URL,
      URLSearchParams,
      location: { search, replace: (url) => replaced.push(url) },
      document: { body: { textContent: '' } }
    };
    pageEnv.globalThis = pageEnv;
    pageEnv.window = pageEnv;
    vm.createContext(pageEnv);
    vm.runInContext(read('extension', 'scripts', 'open-to-save-page.js'), pageEnv);
    return { replaced, body: pageEnv.document.body.textContent };
  }

  await test('the hand-off page replaces itself with the chapter page', () => {
    const { replaced } = runHandOff(`?url=${encodeURIComponent(OPEN_URL)}`);
    assert.deepStrictEqual(replaced, [OPEN_URL], 'location.replace, so the hand-off page leaves no history entry');
  });

  await test('the hand-off page only loads web pages', () => {
    for (const bad of ['', '?url=', `?url=${encodeURIComponent('javascript:alert(1)')}`, `?url=${encodeURIComponent('chrome://settings')}`]) {
      const { replaced, body } = runHandOff(bad);
      assert.deepStrictEqual(replaced, [], bad);
      assert(body.length > 0, 'says there is nothing to open');
    }
  });

  await test('the hand-off page is built, sends no referrer and runs no inline script', () => {
    const targets = read('build-targets.mjs');
    assert(/'views\/open-to-save\.html'/.test(targets), 'the extension build includes views/open-to-save.html');
    const html = read('src', 'views', 'open-to-save.html');
    assert(/<meta[^>]*name="referrer"[^>]*content="no-referrer"/.test(html), 'no referrer, like the rel=noreferrer link');
    assert(/<script src="\.\.\/scripts\/open-to-save-page\.js"><\/script>/.test(html), 'loads its script from the extension (CSP forbids inline scripts)');
  });

  await test('background opens download tabs on the hand-off page', () => {
    assert(/pageFor:[\s\S]{0,120}views\/open-to-save\.html/.test(read('extension', 'scripts', 'background.js')), 'download tabs open on the hand-off page');
  });

  await test('background announces each chapter saved from an open page', () => {
    const bg = read('extension', 'scripts', 'background.js');
    const saveHandler = bg.slice(bg.indexOf("message.action === 'SAVE_CHAPTER'"), bg.indexOf("message.action === 'UPDATE_NOVEL_METADATA'"));
    assert(/StorageService\.saveOpenedChapter\(/.test(saveHandler), 'SAVE_CHAPTER must save through StorageService.saveOpenedChapter, which announces the save (behavior covered in ocr-panel.test.js)');
  });

  const LOGGED_OUT_HEAD = `<script type="text/javascript">
        var SD = SD || {};
        SD.book = {book_id: "", chapter_id: "", up_reader_id: "", is_paid: 0};
        SD.userinfo = {reader_id: 0, reader_name: '""', avatar_thumb_url: '""', vip_lv: ""};
    </script>
    <div id="header"><a target="_blank"  href="https://www.nkwwlkj.cn/signup/login?redirect=https%3A%2F%2Fwww.nkwwlkj.cn%2F">登录</a></div>`;
  const LOGGED_IN_HEAD = `<script type="text/javascript">
        SD.userinfo = {reader_id: 327475, reader_name: '"\\u5b88\\u7384"', avatar_thumb_url: '"https:\\/\\/img.example\\/a.jpg"', vip_lv: "1"};
    </script>`;

  await test('parseLoginState reads the logged-out state from SD.userinfo', () => {
    assert.deepStrictEqual(plain(P.parseLoginState(LOGGED_OUT_HEAD)), { loggedIn: false, userId: null, userName: '' });
  });

  await test('parseLoginState reads the logged-in reader id and decoded name', () => {
    assert.deepStrictEqual(plain(P.parseLoginState(LOGGED_IN_HEAD)), { loggedIn: true, userId: '327475', userName: '守玄' });
    const plainName = "SD.userinfo = {reader_id: 12, reader_name: 'reader12', vip_lv: \"\"};";
    assert.deepStrictEqual(plain(P.parseLoginState(plainName)), { loggedIn: true, userId: '12', userName: 'reader12' });
  });

  await test('parseLoginState returns null when the page has no user info', () => {
    assert.strictEqual(P.parseLoginState('<html><body>maintenance</body></html>'), null);
    assert.strictEqual(P.parseLoginState(''), null);
  });

  await test('loginUrl points at the official login page and returns to the given page', () => {
    const url = new URL(P.loginUrl(BOOK_URL));
    assert.strictEqual(url.origin + url.pathname, 'https://www.nkwwlkj.cn/signup/login');
    assert.strictEqual(url.searchParams.get('redirect'), BOOK_URL);
    assert.strictEqual(new URL(P.loginUrl()).searchParams.get('redirect'), 'https://www.nkwwlkj.cn/');
  });

  await test('fetchLoginState asks the site with the user cookies and parses the answer', async () => {
    const calls = [];
    const fetchEnv = loadEnv({
      fetch: async (url, init) => {
        calls.push([url, init]);
        return { ok: true, text: async () => LOGGED_IN_HEAD };
      }
    });
    const state = await fetchEnv.NkwwlkjProvider.fetchLoginState();
    assert.deepStrictEqual(plain(state), { loggedIn: true, userId: '327475', userName: '守玄' });
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(new URL(calls[0][0]).hostname, 'www.nkwwlkj.cn');
    assert.strictEqual(calls[0][1].credentials, 'include', 'sends the site cookies');
    assert.strictEqual(calls[0][1].cache, 'no-store', 'never answers from cache');
  });

  await test('in the app, book pages and the login check are native desktop requests (a phone user agent is sent to the mobile site)', async () => {
    const fetched = [];
    const native = [];
    const pages = { [BOOK_URL]: DETAIL_HTML };
    const appEnv = loadEnv({
      fetch: async (url) => { fetched.push(url); throw new Error('fetch would send the phone user agent'); },
      Platform: {
        http: {
          async getText(url, init) {
            native.push([url, init]);
            return { ok: true, status: 200, text: pages[url] || LOGGED_IN_HEAD };
          }
        }
      }
    });
    const AP = appEnv.NkwwlkjProvider;
    assert.strictEqual((await AP.fetchSeriesMetadata('100181750')).title, '门户');
    assert.strictEqual((await AP.fetchChapterList('100181750')).length, 5);
    assert.deepStrictEqual(plain(await AP.fetchLoginState()), { loggedIn: true, userId: '327475', userName: '守玄' });
    assert.deepStrictEqual(fetched, [], 'never through fetch()');
    assert.deepStrictEqual(native.map(([url]) => new URL(url).hostname), ['www.nkwwlkj.cn', 'www.nkwwlkj.cn', 'www.nkwwlkj.cn']);

    const down = loadEnv({ Platform: { http: { async getText() { return { ok: false, status: 502, text: '' }; } } } });
    assert.strictEqual(await down.NkwwlkjProvider.fetchLoginState(), null);
    assert.deepStrictEqual(plain(await down.NkwwlkjProvider.fetchChapterList('100181750')), []);
  });

  await test('fetchLoginState returns null when the site cannot be reached', async () => {
    const down = loadEnv({ fetch: async () => { throw new Error('offline'); } });
    assert.strictEqual(await down.NkwwlkjProvider.fetchLoginState(), null);
    const bad = loadEnv({ fetch: async () => ({ ok: false, status: 502, text: async () => '' }) });
    assert.strictEqual(await bad.NkwwlkjProvider.fetchLoginState(), null);
  });

  const BALANCE_DIALOG = `<div id="tabs_reward">
            <div>推荐票余额：<b class="J_Recommend">3</b></div>
            <div>书币余额：<b class="J_HLB">1,250</b>
                赠点余额：<b class="J_GHLB">88</b>
            </div></div>`;

  await test('parseAccountBalance reads the coin and bonus coin balances a chapter page shows', () => {
    assert.deepStrictEqual(plain(P.parseAccountBalance(BALANCE_DIALOG)), { coins: 1250, bonusCoins: 88 });
    const zero = '<div>书币余额：<b class="J_HLB">0</b> 赠点余额：<b class="J_GHLB">0</b></div>';
    assert.deepStrictEqual(plain(P.parseAccountBalance(zero)), { coins: 0, bonusCoins: 0 });
    assert.deepStrictEqual(plain(P.parseAccountBalance('<b class="J_HLB">5</b>')), { coins: 5, bonusCoins: null });
  });

  await test('parseAccountBalance returns null on pages without a balance', () => {
    assert.strictEqual(P.parseAccountBalance(LOGGED_OUT_HEAD), null);
    assert.strictEqual(P.parseAccountBalance(''), null);
  });

  await test('fetchLoginState reads the balance from a chapter page of the novel', async () => {
    const calls = [];
    const fetchEnv = loadEnv({
      fetch: async (url) => {
        calls.push(url);
        return { ok: true, text: async () => LOGGED_IN_HEAD + BALANCE_DIALOG };
      }
    });
    const novel = { url: BOOK_URL, chapterList: [{ chapterNumber: 1, url: 'https://www.nkwwlkj.cn/chapter/book_chapter_detail/100043460' }] };
    const state = await fetchEnv.NkwwlkjProvider.fetchLoginState(novel);
    assert.deepStrictEqual(calls, ['https://www.nkwwlkj.cn/chapter/book_chapter_detail/100043460'], 'one request to a chapter page');
    assert.deepStrictEqual(plain(state), { loggedIn: true, userId: '327475', userName: '守玄', balance: { coins: 1250, bonusCoins: 88 } });
  });

  await test('fetchLoginState never asks a chapter page of another site', async () => {
    const calls = [];
    const fetchEnv = loadEnv({ fetch: async (url) => { calls.push(url); return { ok: true, text: async () => LOGGED_OUT_HEAD }; } });
    await fetchEnv.NkwwlkjProvider.fetchLoginState({ chapterList: [{ url: 'https://evil.example/chapter/1' }] });
    assert.strictEqual(new URL(calls[0]).hostname, 'www.nkwwlkj.cn');
  });

  await test('registry resolves the provider of a novel by url or domain', () => {
    const R = env.ProviderRegistry;
    assert.strictEqual(R.getProviderForNovel({ url: BOOK_URL }).id, 'nkwwlkj');
    assert.strictEqual(R.getProviderForNovel({ domain: 'nkwwlkj.cn' }).id, 'nkwwlkj');
    assert.strictEqual(R.getProviderForNovel(null), null);
    assert.strictEqual(R.getProviderForNovel({ url: 'https://example.com/x' }), null);
  });

  const { watchLoginState } = await loadComponent('components/react/shared/ProviderLogin.jsx');
  function fakeWindow() {
    const handlers = {};
    return {
      document: { visibilityState: 'visible' },
      addEventListener: (type, fn) => { (handlers[type] = handlers[type] || []).push(fn); },
      removeEventListener: (type, fn) => { handlers[type] = (handlers[type] || []).filter((f) => f !== fn); },
      fire: (type) => (handlers[type] || []).forEach((fn) => fn({ type })),
      count: () => Object.values(handlers).reduce((n, list) => n + list.length, 0)
    };
  }
  const tick = () => new Promise((r) => setTimeout(r, 0));

  await test('watchLoginState checks at once and again when the user comes back from the login tab', async () => {
    const answers = [{ loggedIn: false, userId: null, userName: '' }, { loggedIn: true, userId: '9', userName: '守玄' }];
    let checks = 0;
    const provider = { fetchLoginState: async () => answers[Math.min(checks++, answers.length - 1)] };
    const win = fakeWindow();
    const seen = [];
    const watcher = watchLoginState({ provider, target: win, onState: (s) => seen.push(s) });
    await tick();
    assert.deepStrictEqual(seen.map((s) => s && s.loggedIn), [false], 'shows logged out first');

    win.fire('focus');
    await tick();
    assert.deepStrictEqual(seen.map((s) => s && s.loggedIn), [false, true], 'reflects the login after returning');
    assert.strictEqual(seen[1].userName, '守玄');

    win.document.visibilityState = 'hidden';
    win.fire('visibilitychange');
    await tick();
    assert.strictEqual(checks, 2, 'does not check while the page is hidden');

    watcher.stop();
    assert.strictEqual(win.count(), 0, 'stop removes the listeners');
  });

  await test('watchLoginState passes the novel to the provider check', async () => {
    const seenArgs = [];
    const provider = { fetchLoginState: async (novel) => { seenArgs.push(novel); return { loggedIn: false, userId: null, userName: '' }; } };
    const novel = { id: 'n1', chapterList: [] };
    const watcher = watchLoginState({ provider, context: novel, target: fakeWindow(), onState: () => {} });
    await tick();
    assert.strictEqual(seenArgs[0], novel);
    watcher.stop();
  });

  await test('watchLoginState can be re-checked on demand and ignores answers after stop', async () => {
    let resolveLate;
    let checks = 0;
    const provider = {
      fetchLoginState: () => {
        checks++;
        if (checks === 1) return Promise.resolve({ loggedIn: false, userId: null, userName: '' });
        return new Promise((r) => { resolveLate = r; });
      }
    };
    const seen = [];
    const watcher = watchLoginState({ provider, target: fakeWindow(), onState: (s) => seen.push(s) });
    await tick();
    watcher.recheck();
    watcher.recheck();
    assert.strictEqual(checks, 2, 'overlapping checks are not started twice');
    watcher.stop();
    resolveLate({ loggedIn: true, userId: '1', userName: 'x' });
    await tick();
    assert.strictEqual(seen.length, 1, 'no update after stop');
  });

  await test('watchLoginState does nothing for providers without a login check', async () => {
    const win = fakeWindow();
    const seen = [];
    const watcher = watchLoginState({ provider: { id: 'wetriedtls' }, target: win, onState: (s) => seen.push(s) });
    await tick();
    assert.deepStrictEqual(seen, []);
    assert.strictEqual(win.count(), 0);
    watcher.stop();
  });

  await test('manifest grants the site and injects the content script on book and chapter pages', () => {
    const manifest = JSON.parse(read('extension', 'manifest.json'));
    assert(manifest.host_permissions.includes('*://*.nkwwlkj.cn/*'));
    assert(manifest.host_permissions.includes('*://nkwwlkj.cn/*'));
    const cs = manifest.content_scripts.find((c) => c.matches.some((m) => m.includes('nkwwlkj.cn')));
    assert(cs, 'a content script entry must match nkwwlkj.cn');
    assert(cs.matches.includes('*://*.nkwwlkj.cn/chapter/book_chapter_detail/*'));
    assert(cs.matches.includes('*://*.nkwwlkj.cn/book/book_detail/*'));
    assert.deepStrictEqual(cs.js, ['providers/nkwwlkj.js', 'providers/registry.js', 'services/site-page.js', 'scripts/content.js']);
  });

  await test('every view and the background worker load the provider before the registry', () => {
    const sources = ['library', 'novel', 'popup', 'reader', 'settings'].map((v) => [`views/${v}.html`, read('src', 'views', `${v}.html`)]);
    sources.push(['scripts/background.js', read('extension', 'scripts', 'background.js')]);
    for (const [name, src] of sources) {
      const p = src.indexOf('providers/nkwwlkj.js');
      const r = src.indexOf('providers/registry.js');
      assert(p >= 0, `${name} must load providers/nkwwlkj.js`);
      assert(p < r, `${name} must load providers/nkwwlkj.js before providers/registry.js`);
    }
  });

  console.log(`--- nkwwlkj.cn Provider Test Suite: ${passed}/${passed + failed} passed ---`);
  if (failed > 0) process.exit(1);
  console.log('nkwwlkj.cn Provider Test Suite: ALL TESTS PASSED!');
})();
