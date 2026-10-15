const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

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

  await test('bulk downloads are disabled for this site', () => {
    assert.strictEqual(P.supportsBulkDownload, false);
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

  await test('fetchChapterContent never fetches and explains that chapters are captured from the open page', async () => {
    let fetched = false;
    const fetchEnv = loadEnv({ fetch: async () => { fetched = true; return { ok: true, text: async () => '' }; } });
    await assert.rejects(
      () => fetchEnv.NkwwlkjProvider.fetchChapterContent('100181750', '100043460'),
      /open/i
    );
    assert.strictEqual(fetched, false);
  });

  await test('formatTitle drops the site suffix from page titles', () => {
    assert.strictEqual(P.formatTitle('100181750', '门户最新章节(守玄独阅读),门户无弹窗全文阅读'), '门户');
    assert.strictEqual(P.formatTitle('100181750', '门户'), '门户');
  });

  await test('registry registers the provider and reports bulk-download support per novel', () => {
    const R = env.ProviderRegistry;
    assert.strictEqual(R.getProviderForUrl(BOOK_URL).id, 'nkwwlkj');
    assert.strictEqual(R.getProviderForDomain('nkwwlkj.cn').id, 'nkwwlkj');
    assert.strictEqual(R.canBulkDownload({ url: BOOK_URL }), false);
    assert.strictEqual(R.canBulkDownload({ domain: 'www.nkwwlkj.cn' }), false);
    assert.strictEqual(R.canBulkDownload({ url: 'https://wetriedtls.com/series/x' }), true);
    assert.strictEqual(R.canBulkDownload({ url: 'https://unknown.example/x' }), true);
    assert.strictEqual(R.canBulkDownload(null), true);
  });

  await test('StorageService.getCatalogChapterNumber maps a chapter id to its catalog number', () => {
    const storageEnv = loadEnv({ indexedDB: { open() { throw new Error('not used'); } } });
    vm.runInContext(read('src', 'services', 'storage.js'), storageEnv);
    const S = storageEnv.StorageService || storageEnv.window.StorageService;
    const novel = { chapterList: P.parseChapterListHtml(DETAIL_HTML) };
    assert.strictEqual(S.getCatalogChapterNumber(novel, '100043460'), 3);
    assert.strictEqual(S.getCatalogChapterNumber(novel, 100659849), 5);
    assert.strictEqual(S.getCatalogChapterNumber(novel, '999'), null);
    assert.strictEqual(S.getCatalogChapterNumber({}, '100043460'), null);
  });

  await test('manifest grants the site and injects the content script on book and chapter pages', () => {
    const manifest = JSON.parse(read('manifest.json'));
    assert(manifest.host_permissions.includes('*://*.nkwwlkj.cn/*'));
    assert(manifest.host_permissions.includes('*://nkwwlkj.cn/*'));
    const cs = manifest.content_scripts.find((c) => c.matches.some((m) => m.includes('nkwwlkj.cn')));
    assert(cs, 'a content script entry must match nkwwlkj.cn');
    assert(cs.matches.includes('*://*.nkwwlkj.cn/chapter/book_chapter_detail/*'));
    assert(cs.matches.includes('*://*.nkwwlkj.cn/book/book_detail/*'));
    assert.deepStrictEqual(cs.js, ['providers/nkwwlkj.js', 'providers/registry.js', 'scripts/content.js']);
  });

  await test('every view and the background worker load the provider before the registry', () => {
    const sources = ['library', 'novel', 'popup', 'reader', 'settings'].map((v) => [`views/${v}.html`, read('src', 'views', `${v}.html`)]);
    sources.push(['scripts/background.js', read('src', 'scripts', 'background.js')]);
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
