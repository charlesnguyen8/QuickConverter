const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { makeDatabase } = require('./helpers/fake-library');

console.log('\n--- Running Chapter Download Pipeline Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(repoRoot, ...p), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));

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

function makeEnv({ provider, translation } = {}) {
  const db = makeDatabase();
  const ls = { quickconverter_db_initialized: 'true' };
  const fetches = [];
  const aiCalls = [];
  const theProvider = provider || {
    id: 'wetriedtls',
    async fetchChapterContent(slug, chapterSlugOrNumber, opts) {
      fetches.push([slug, chapterSlugOrNumber, !!(opts && 'signal' in opts)]);
      return { title: 'Page title', rawText: 'Raw chapter text.' };
    }
  };
  const env = {
    console: { log() {}, warn() {}, error() {} },
    URL,
    setTimeout,
    clearTimeout,
    localStorage: {
      get length() { return Object.keys(ls).length; },
      key: (i) => Object.keys(ls)[i],
      getItem: (k) => (k in ls ? ls[k] : null),
      setItem: (k, v) => { ls[k] = String(v); },
      removeItem: (k) => { delete ls[k]; }
    },
    IDBKeyRange: { only: (value) => ({ only: value }) },
    indexedDB: { open: db.open },
    ProviderRegistry: { getProviderForUrl: () => theProvider, getProviderForDomain: () => theProvider },
    AIService: {
      async getProviderConfig() { return { provider: 'custom', baseUrl: 'http://127.0.0.1:8000/v1', customUrl: 'http://127.0.0.1:8000/v1' }; },
      async translateChapter(params) {
        aiCalls.push(params);
        return { translatedText: `EN[${params.rawText}]`, modelUsed: 'test-model', costInfo: { formattedCost: '$0.01' }, usage: { total_tokens: 10 }, ...(translation || {}) };
      }
    }
  };
  env.window = env;
  env.self = env;
  env.globalThis = env;
  vm.createContext(env);
  for (const file of ['name-matcher.js', 'longest-matcher.js', 'text-processors.js', 'platform.js', 'storage.js']) {
    vm.runInContext(read('src', 'services', file), env);
  }
  const S = env.StorageService;
  const notices = [];
  S.subscribeChapterSaved((msg) => notices.push([msg.novelId, msg.chapterNumber]));
  return { S, stores: db.stores, fetches, aiCalls, notices, provider: theProvider, global: env };
}

async function seed(S, stores, { catalog = true } = {}) {
  await S.addNovel({ id: 'n1', title: 'Book', slug: 'book', url: 'https://wetriedtls.com/series/book' });
  if (catalog) {
    stores.novels.n1.chapterList = [
      { chapterNumber: 3, slug: 'chapter-3', title: 'Catalog title 3', url: 'https://wetriedtls.com/series/book/chapter-3', locked: false },
      { chapterNumber: 4, slug: 'chapter-4', title: 'Catalog title 4', url: 'https://wetriedtls.com/series/book/chapter-4' }
    ];
  }
}

const TRANSLATION = { enabled: true, apiKey: 'sk', prompt: 'Translate.', model: 'm1', provider: 'custom', baseUrl: 'http://127.0.0.1:8000/v1' };
const recordFields = (r) => {
  const { updatedAt, ...rest } = r;
  if ('translatedAt' in rest && rest.translatedAt) rest.translatedAt = 'set';
  return rest;
};

let finished = false;
process.on('beforeExit', () => {
  if (!finished) {
    console.error('Chapter Download suite stopped before its last test (a promise never settled)');
    process.exitCode = 1;
  }
});

(async () => {
  // --- Characterization: today's three save paths (locked before merging them) ---

  await test('characterization: downloadChapter fetches through the provider and saves under the catalog title', async () => {
    const { S, stores, fetches, notices } = makeEnv();
    await seed(S, stores);
    const progress = [];
    const result = await S.downloadChapter('n1', 3, { onProgress: (p) => progress.push(p.phase) });
    assert.deepStrictEqual(fetches, [['book', 'chapter-3', true]]);
    assert.deepStrictEqual(plain(recordFields(stores.chapters.n1_ch3)), {
      id: 'n1_ch3', novelId: 'n1', chapterNumber: 3, title: 'Catalog title 3',
      url: 'https://wetriedtls.com/series/book/chapter-3', rawText: 'Raw chapter text.', convertedText: '',
      originalRawText: 'Raw chapter text.', reasoningText: null, isTranslated: false, modelUsed: null,
      translatedAt: null, translationCost: null, translationUsage: null
    });
    assert.deepStrictEqual(progress, ['fetching', 'saving', 'saving', 'completed']);
    assert.strictEqual(result.translationDelay, 0);
    assert.deepStrictEqual(notices, [], 'the queue reports its own saves');
  });

  await test('characterization: without a catalog entry downloadChapter uses the page title and a URL from the book', async () => {
    const { S, stores, fetches } = makeEnv();
    await seed(S, stores, { catalog: false });
    await S.downloadChapter('n1', 7, {});
    assert.deepStrictEqual(fetches, [['book', 7, true]]);
    assert.strictEqual(stores.chapters.n1_ch7.title, 'Page title');
    assert.strictEqual(stores.chapters.n1_ch7.url, 'https://wetriedtls.com/series/book/chapter-7');
  });

  await test('characterization: downloadChapter translates when asked and keeps the original', async () => {
    const { S, stores, aiCalls } = makeEnv();
    await seed(S, stores);
    await S.downloadChapter('n1', 3, { translation: TRANSLATION });
    const record = stores.chapters.n1_ch3;
    assert.strictEqual(aiCalls.length, 1);
    assert(record.rawText.startsWith('EN['), record.rawText);
    assert.strictEqual(record.originalRawText, 'Raw chapter text.');
    assert.strictEqual(record.isTranslated, true);
    assert.strictEqual(record.modelUsed, 'test-model');
    assert.strictEqual(record.ocrSource, undefined);
  });

  await test('characterization: downloadChapter errors (no provider, empty page, cancelled)', async () => {
    const empty = makeEnv({ provider: { async fetchChapterContent() { return { rawText: '' }; } } });
    await seed(empty.S, empty.stores);
    await assert.rejects(() => empty.S.downloadChapter('n1', 3, {}), /Failed to extract chapter content for Chapter 3/);
    const pageOnly = makeEnv({ provider: { async fetchChapterContent() { throw new Error('独阅读 chapters cannot be downloaded in the background.'); } } });
    await seed(pageOnly.S, pageOnly.stores);
    await assert.rejects(() => pageOnly.S.downloadChapter('n1', 3, {}), /cannot be downloaded in the background/);
    const { S, stores } = makeEnv();
    await seed(S, stores);
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(() => S.downloadChapter('n1', 3, { signal: controller.signal }), /UserCancelled/);
    await assert.rejects(() => S.downloadChapter('missing', 3, {}), /Novel not found/);
  });

  await test('characterization: saveOpenedChapter saves the page as given, by book slug, and announces it', async () => {
    const { S, stores, notices } = makeEnv();
    await seed(S, stores);
    stores.novels.n1.domain = '';
    const result = await S.saveOpenedChapter({ slug: 'book', chapterNumber: 3, title: 'Page title', url: 'https://page/3', rawText: '原文', domain: 'www.nkwwlkj.cn' });
    assert.deepStrictEqual(plain(recordFields(stores.chapters.n1_ch3)), {
      id: 'n1_ch3', novelId: 'n1', chapterNumber: 3, title: 'Page title', url: 'https://page/3', rawText: '原文', convertedText: ''
    });
    assert.strictEqual(stores.novels.n1.domain, 'www.nkwwlkj.cn', 'fills in a missing domain');
    assert.deepStrictEqual(plain(result), { success: true, isSaved: true, chapterId: 'n1_ch3', novelId: 'n1', novelTitle: 'Book' });
    assert.deepStrictEqual(notices, [['n1', 3]]);
    assert.deepStrictEqual(plain(await S.saveOpenedChapter({ slug: 'nope', chapterNumber: 1, rawText: 'x' })), { success: false, error: 'Novel is not managed' });
  });

  await test('characterization: an already-read image chapter is saved as a paid chapter and announced', async () => {
    const { S, stores, notices } = makeEnv();
    await seed(S, stores);
    const progress = [];
    await S.downloadChapter('n1', 3, { source: { kind: 'image', text: ' 第三章 ', url: 'https://page/3', title: 'Page title' }, onProgress: (p) => progress.push(p.phase) });
    assert.deepStrictEqual(plain(recordFields(stores.chapters.n1_ch3)), {
      id: 'n1_ch3', novelId: 'n1', chapterNumber: 3, title: 'Catalog title 3', url: 'https://page/3', rawText: '第三章', convertedText: '',
      originalRawText: '第三章', reasoningText: null, ocrSource: true, isTranslated: false, modelUsed: null,
      translatedAt: null, translationCost: null, translationUsage: null
    });
    assert.strictEqual(stores.novels.n1.chapterList[0].locked, true, 'marked paid');
    assert.deepStrictEqual(progress, ['saving', 'completed']);
    assert.deepStrictEqual(notices, [['n1', 3]]);
    await assert.rejects(() => S.downloadChapter('n1', 4, { source: { kind: 'image', text: '  ' } }), /No text was found/);
  });

  await test('characterization: an already-read image chapter is translated as an OCR source', async () => {
    const { S, stores, aiCalls } = makeEnv();
    await seed(S, stores);
    await S.downloadChapter('n1', 4, { source: { kind: 'image', text: '第四章' }, translation: TRANSLATION });
    const record = stores.chapters.n1_ch4;
    assert.strictEqual(aiCalls.length, 1);
    assert.strictEqual(record.isTranslated, true);
    assert.strictEqual(record.originalRawText, '第四章');
    assert.strictEqual(record.ocrSource, true);
    assert.strictEqual(record.url, 'https://wetriedtls.com/series/book/chapter-4', 'falls back to the catalog URL');
  });

  // --- The one pipeline ---

  await test('downloadChapter takes a source that is already in hand and skips fetching', async () => {
    const { S, stores, fetches, aiCalls } = makeEnv();
    await seed(S, stores);
    await S.downloadChapter('n1', 4, { source: { kind: 'text', title: 'From the page', rawText: 'Already here.', url: 'https://page/4' }, translation: TRANSLATION });
    assert.deepStrictEqual(fetches, [], 'no fetch');
    assert.strictEqual(aiCalls.length, 1, 'translated like any download');
    assert.strictEqual(stores.chapters.n1_ch4.originalRawText, 'Already here.');
    assert.strictEqual(stores.chapters.n1_ch4.title, 'Catalog title 4');
  });

  await test('the http source is the provider fetch, and pages-only providers say so', async () => {
    const { S, stores } = makeEnv();
    await seed(S, stores);
    const novel = await S.getNovelById('n1');
    const source = await S.fetchChapterSource(novel, 3, {});
    assert.deepStrictEqual(plain(source), { kind: 'text', title: 'Page title', rawText: 'Raw chapter text.' });
    const pageOnly = makeEnv({ provider: { id: 'nkwwlkj', fetchMode: 'page', async fetchChapterContent() { throw new Error('should not be called'); } } });
    await seed(pageOnly.S, pageOnly.stores);
    const pageBook = await pageOnly.S.getNovelById('n1');
    await assert.rejects(() => pageOnly.S.fetchChapterSource(pageBook, 3, {}), /opening its page/i);
  });

  // --- Page sites through the same download (the app's page source) ---

  const pageProvider = () => ({ id: 'nkwwlkj', fetchMode: 'page', domains: ['www.nkwwlkj.cn'], async fetchChapterContent() { throw new Error('never called'); } });

  async function seedPageBook(env) {
    await env.S.addNovel({ id: 'n1', title: '门户', slug: '100181750', url: 'https://www.nkwwlkj.cn/book/book_detail/100181750' });
    env.stores.novels.n1.chapterList = [
      { chapterNumber: 1, slug: '100043460', title: '第一章 张角', url: 'https://www.nkwwlkj.cn/chapter/book_chapter_detail/100043460', locked: false }
    ];
  }

  function withPageSource(env, result) {
    const calls = [];
    return { calls, install: (global) => {
      global.SiteSave = {
        available: () => true,
        fetchPage: async (url, opts) => {
          calls.push([url, JSON.parse(JSON.stringify({ expect: opts.expect })), typeof opts.onNeedsUser, !!opts.signal || 'signal' in opts]);
          if (opts.onNeedsUser) opts.onNeedsUser('Log in to 独阅读');
          return typeof result === 'function' ? result() : result;
        }
      };
    } };
  }

  await test('a page site downloads through the page source and saves like any download', async () => {
    const env = makeEnv({ provider: pageProvider() });
    await seedPageBook(env);
    const page = withPageSource(env, { kind: 'text', title: 'Page title', rawText: '原文。', url: 'https://www.nkwwlkj.cn/chapter/book_chapter_detail/100043460' });
    page.install(env.global);
    const asks = [];
    await env.S.downloadChapter('n1', 1, { translation: TRANSLATION, onNeedsUser: (r) => asks.push(r) });
    assert.deepStrictEqual(page.calls, [['https://www.nkwwlkj.cn/chapter/book_chapter_detail/100043460', { expect: { slug: '100181750', chapterSlug: '100043460' } }, 'function', true]]);
    assert.deepStrictEqual(asks, ['Log in to 独阅读'], 'the queue hears when the page needs the user');
    const record = env.stores.chapters.n1_ch1;
    assert.strictEqual(record.title, '第一章 张角', 'catalog title');
    assert.strictEqual(record.originalRawText, '原文。');
    assert.strictEqual(record.isTranslated, true, 'translated like any download');
  });

  await test('an image chapter from the page is read with OCR, saved as paid and translated', async () => {
    const env = makeEnv({ provider: pageProvider() });
    await seedPageBook(env);
    withPageSource(env, { kind: 'image', image: { bytes: new Uint8Array([1, 2]).buffer, base64: 'AQI=', mimeType: 'image/png' }, url: 'https://page/1' }).install(env.global);
    const read = [];
    env.global.QCOcr = { recognize: async (bytes, mime, base64) => { read.push([Array.from(new Uint8Array(bytes)), mime, base64]); return '第一章 张角\n\n正文'; } };
    const progress = [];
    await env.S.downloadChapter('n1', 1, { translation: TRANSLATION, onProgress: (p) => progress.push(p.phase) });
    assert.deepStrictEqual(read, [[[1, 2], 'image/png', 'AQI=']], 'the OCR also gets the base64, which the extension sends to its offscreen page');
    const record = env.stores.chapters.n1_ch1;
    assert.strictEqual(record.ocrSource, true);
    assert.strictEqual(record.originalRawText, '第一章 张角\n\n正文');
    assert.strictEqual(record.isTranslated, true);
    assert.strictEqual(env.stores.novels.n1.chapterList[0].locked, true, 'marked paid');
    assert(progress.includes('reading'), 'reports reading the image');
  });

  await test('an image chapter whose text was already read is saved as paid without running OCR again', async () => {
    const env = makeEnv({ provider: pageProvider() });
    await seedPageBook(env);
    let ocrRuns = 0;
    env.global.QCOcr = { recognize: async () => { ocrRuns++; return 'other'; } };
    await env.S.downloadChapter('n1', 1, { source: { kind: 'image', text: ' 第一章 张角\n\n正文 ', url: 'https://page/1' } });
    assert.strictEqual(ocrRuns, 0, 'OCR is not repeated');
    const record = env.stores.chapters.n1_ch1;
    assert.strictEqual(record.ocrSource, true);
    assert.strictEqual(record.originalRawText, '第一章 张角\n\n正文');
    assert.strictEqual(record.url, 'https://page/1');
    assert.strictEqual(env.stores.novels.n1.chapterList[0].locked, true, 'marked paid');
    await assert.rejects(() => env.S.downloadChapter('n1', 1, { source: { kind: 'image', text: '  ' } }), /No text was found/);
  });

  await test('without a page source or OCR the download says why', async () => {
    const none = makeEnv({ provider: pageProvider() });
    await seedPageBook(none);
    await assert.rejects(() => none.S.downloadChapter('n1', 1, {}), /saved by opening its page/);
    const noOcr = makeEnv({ provider: pageProvider() });
    await seedPageBook(noOcr);
    withPageSource(noOcr, { kind: 'image', image: { bytes: new ArrayBuffer(1), mimeType: 'image/png' } }).install(noOcr.global);
    await assert.rejects(() => noOcr.S.downloadChapter('n1', 1, {}), /Reading chapter images is not available/);
    const blank = makeEnv({ provider: pageProvider() });
    await seedPageBook(blank);
    withPageSource(blank, { kind: 'image', image: { bytes: new ArrayBuffer(1), mimeType: 'image/png' } }).install(blank.global);
    blank.global.QCOcr = { recognize: async () => '  ' };
    await assert.rejects(() => blank.S.downloadChapter('n1', 1, {}), /No text was found in the chapter image/);
  });

  console.log(`--- Chapter Download Test Suite: ${passed}/${passed + failed} passed ---`);
  if (failed > 0) {
    console.error('Chapter Download Test Suite FAILED');
    process.exit(1);
  }
  console.log('Chapter Download Test Suite: ALL TESTS PASSED!');
  finished = true;
})();
