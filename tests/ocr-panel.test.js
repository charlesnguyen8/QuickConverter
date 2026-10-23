const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadComponent } = require('./helpers/render');

console.log('\n--- Running OCR Reading Panel Test Suite ---');

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

function makeStorageEnv() {
  const stores = { novels: {}, chapters: {} };
  const makeRequest = (result, answered = () => {}) => {
    const req = { result, onsuccess: null, onerror: null };
    setTimeout(() => { if (req.onsuccess) req.onsuccess(); answered(); }, 0);
    return req;
  };
  const fakeStore = (name, request = makeRequest) => ({
    getAll: () => request(Object.values(stores[name])),
    get: (id) => request(stores[name][id] || null),
    put: (record) => { stores[name][record.id] = { ...record }; },
    delete: (id) => { delete stores[name][id]; },
    clear: () => { stores[name] = {}; }
  });
  const mockDatabase = {
    transaction() {
      let pending = 0;
      const tx = { objectStore: (name) => fakeStore(name, request), oncomplete: null, onerror: null };
      const settle = () => setTimeout(() => {
        if (pending === 0 && tx.oncomplete) {
          tx.oncomplete();
          tx.oncomplete = null;
        }
      }, 0);
      function request(result) {
        pending++;
        return makeRequest(result, () => { pending--; settle(); });
      }
      settle();
      return tx;
    }
  };
  const ls = { quickconverter_db_initialized: 'true' };
  const aiCalls = [];
  const provider = {
    fetchChapterContent: async () => ({ title: 'Ch 7', rawText: 'Lin Dong walked into Qingyang Town.' })
  };
  const env = {
    console,
    URL,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: (k) => (k in ls ? ls[k] : null),
      setItem: (k, v) => { ls[k] = String(v); },
      removeItem: (k) => { delete ls[k]; }
    },
    indexedDB: {
      open() {
        const req = { result: mockDatabase, onsuccess: null, onerror: null, onupgradeneeded: null };
        setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
        return req;
      }
    },
    ProviderRegistry: {
      getProviderForUrl: () => provider,
      getProviderForDomain: () => provider
    },
    AIService: {
      async getProviderConfig() {
        return { provider: 'custom', baseUrl: 'http://127.0.0.1:8000/v1', customUrl: 'http://127.0.0.1:8000/v1' };
      },
      async translateChapter(params) {
        aiCalls.push(params);
        if (typeof params.onChunk === 'function') params.onChunk({ type: 'content', fullText: 'EN' });
        return {
          translatedText: `VI[${params.rawText}]<<<NAME_LIST_START>>>Wang Lin=Vương Lâm<<<NAME_LIST_END>>>`,
          modelUsed: 'test-model',
          costInfo: { formattedCost: '$0.01' },
          usage: { total_tokens: 10 }
        };
      }
    }
  };
  env.window = env;
  env.self = env;
  env.globalThis = env;
  vm.createContext(env);
  vm.runInContext(read('src', 'services', 'name-matcher.js'), env);
  vm.runInContext(read('src', 'services', 'longest-matcher.js'), env);
  vm.runInContext(read('src', 'services', 'text-processors.js'), env);
  vm.runInContext(read('src', 'services', 'platform.js'), env);
  vm.runInContext(read('src', 'services', 'storage.js'), env);
  const S = env.StorageService || env.window.StorageService;
  return { env, S, stores, aiCalls };
}

async function seedNovel(S, stores) {
  stores.novels['novel-1'] = {
    id: 'novel-1',
    title: '武动',
    slug: '100181750',
    url: 'https://www.nkwwlkj.cn/book/book_detail/100181750',
    domain: 'www.nkwwlkj.cn',
    chapterList: [],
    createdAt: 1
  };
  await S.saveNameList('novel-1', [{ id: 'n1', original: 'Lin Dong', translation: 'Lâm Động', addedAt: 1 }]);
  await S.saveNameList('novel-1', [{ id: 'g1', original: 'Qingyang Town', translation: 'Thanh Dương trấn', addedAt: 1 }], 'locked');
}

const TRANSLATION = { enabled: true, apiKey: 'sk-local', prompt: 'Translate to English.', model: 'm1', provider: 'custom', baseUrl: 'http://127.0.0.1:8000/v1' };

let finished = false;
process.on('beforeExit', () => {
  if (!finished) {
    console.error('OCR Reading Panel suite stopped before its last test (a promise never settled)');
    process.exitCode = 1;
  }
});

(async () => {
  await test('characterization: downloadChapter tokenizes names, pre-translates locked terms and restores the result', async () => {
    const { S, stores, aiCalls } = makeStorageEnv();
    await seedNovel(S, stores);
    await S.downloadChapter('novel-1', 7, { translation: { ...TRANSLATION } });

    assert.strictEqual(aiCalls.length, 1);
    assert.strictEqual(aiCalls[0].rawText, '@1@ walked into §Thanh Dương trấn§.');
    assert(aiCalls[0].prompt.startsWith('Translate to English.'), 'uses the given prompt');
    assert(aiCalls[0].prompt.includes('@1@'), 'adds the placeholder instruction when names were tokenized');

    const saved = stores.chapters['novel-1_ch7'];
    assert(saved, 'chapter is saved');
    assert.strictEqual(saved.rawText, 'VI[Lâm Động walked into Thanh Dương trấn.]');
    assert.strictEqual(saved.originalRawText, 'Lin Dong walked into Qingyang Town.');
    assert.strictEqual(saved.isTranslated, true);
    assert.strictEqual(saved.modelUsed, 'test-model');

    const names = await S.getNameList('novel-1');
    assert(names.some((n) => n.original === 'Wang Lin' && n.translation === 'Vương Lâm'), 'captured names are added to the name list');
  });

  await test('translateText runs the same pipeline without saving anything', async () => {
    const { S, stores, aiCalls } = makeStorageEnv();
    await seedNovel(S, stores);
    const chunks = [];
    const result = await S.translateText('novel-1', 'Lin Dong walked into Qingyang Town.', { ...TRANSLATION }, { onChunk: (c) => chunks.push(c) });

    assert.strictEqual(aiCalls[0].rawText, '@1@ walked into §Thanh Dương trấn§.');
    assert.strictEqual(result.text, 'VI[Lâm Động walked into Thanh Dương trấn.]');
    assert.strictEqual(result.modelUsed, 'test-model');
    assert(plain(result.names).some((n) => n.original === 'Wang Lin' && n.translation === 'Vương Lâm'), 'returns the captured names');
    assert(chunks.length > 0, 'streams chunks to onChunk');
    assert.deepStrictEqual(Object.keys(stores.chapters), [], 'no chapter is saved');
    const names = await S.getNameList('novel-1');
    assert(!names.some((n) => n.original === 'Wang Lin'), 'name list is not modified');
  });

  await test('translateText tells the model the source came from OCR when asked', async () => {
    const { S, stores, aiCalls } = makeStorageEnv();
    await seedNovel(S, stores);
    await S.translateText('novel-1', 'Lin Dong walked into Qingyang Town.', { ...TRANSLATION }, { ocrSource: true });
    assert(/OCR/.test(aiCalls[0].prompt) && /misread/i.test(aiCalls[0].prompt), 'prompt explains the text came from OCR and may contain misread characters');
  });

  await test('translateText works without a managed novel', async () => {
    const { S, aiCalls } = makeStorageEnv();
    const result = await S.translateText(null, 'Lin Dong walked into Qingyang Town.', { ...TRANSLATION });
    assert.strictEqual(aiCalls[0].rawText, 'Lin Dong walked into Qingyang Town.', 'no name list or glossary applied');
    assert.strictEqual(aiCalls[0].prompt, 'Translate to English.');
    assert.strictEqual(result.text, 'VI[Lin Dong walked into Qingyang Town.]');
  });

  const CATALOG = [
    { chapterNumber: 6, title: '第六章 前情', slug: '100043459', url: 'https://www.nkwwlkj.cn/chapter/book_chapter_detail/100043459' },
    { chapterNumber: 7, title: '第七章 青阳镇', slug: '100043460', url: 'https://www.nkwwlkj.cn/chapter/book_chapter_detail/100043460', locked: true }
  ];
  const PAGE_URL = 'https://www.nkwwlkj.cn/chapter/book_chapter_detail/100043460?from=list';
  const OCR_TEXT = '林动走进青阳镇。' + '\n\n' + '第二段。';

  async function seedCatalogNovel(S, stores) {
    await seedNovel(S, stores);
    stores.novels['novel-1'].chapterList = CATALOG.map((c) => ({ ...c }));
  }

  await test('saveOpenedChapter keeps the existing text-chapter save: raw page text under the managed novel', async () => {
    const { S, stores, aiCalls } = makeStorageEnv();
    await seedCatalogNovel(S, stores);
    const announced = [];
    S.notifyChapterSaved = (novelId, chapterNumber) => announced.push([novelId, chapterNumber]);
    const resp = await S.saveOpenedChapter({
      slug: '100181750',
      chapterNumber: 6,
      title: '第六章 前情',
      url: 'https://www.nkwwlkj.cn/chapter/book_chapter_detail/100043459',
      rawText: '正文第一段。',
      domain: 'www.nkwwlkj.cn'
    });
    assert.strictEqual(resp.success, true);
    assert.strictEqual(resp.isSaved, true);
    assert.strictEqual(resp.novelId, 'novel-1');
    assert.strictEqual(resp.chapterId, 'novel-1_ch6');
    const saved = stores.chapters['novel-1_ch6'];
    assert.strictEqual(saved.rawText, '正文第一段。');
    assert.strictEqual(saved.title, '第六章 前情');
    assert.strictEqual(saved.url, 'https://www.nkwwlkj.cn/chapter/book_chapter_detail/100043459');
    assert.strictEqual(saved.chapterNumber, 6);
    assert.strictEqual(saved.isTranslated, undefined, 'text chapters are saved raw, not translated');
    assert.strictEqual(saved.ocrSource, undefined, 'text chapters are not flagged as OCR');
    assert.strictEqual(aiCalls.length, 0, 'no translation runs for an opened text chapter');
    assert.deepStrictEqual(announced, [['novel-1', 6]], 'announces the saved chapter so open views refresh');
  });

  await test('saveOpenedChapter refuses chapters of an unmanaged novel', async () => {
    const { S, stores } = makeStorageEnv();
    const resp = await S.saveOpenedChapter({ slug: 'unknown', chapterNumber: 1, rawText: 'x' });
    assert.strictEqual(resp.success, false);
    assert.strictEqual(resp.error, 'Novel is not managed');
    assert.deepStrictEqual(Object.keys(stores.chapters), []);
  });

  await test('downloadChapter saves an already-read image chapter with the catalog title, order and the page URL when translation is off', async () => {
    const { S, stores, aiCalls } = makeStorageEnv();
    await seedCatalogNovel(S, stores);
    const announced = [];
    S.notifyChapterSaved = (novelId, chapterNumber) => announced.push([novelId, chapterNumber, !!stores.chapters['novel-1_ch7']]);
    const saved = await S.downloadChapter('novel-1', 7, { source: { kind: 'image', text: OCR_TEXT, url: PAGE_URL }, translation: { ...TRANSLATION, enabled: false } });
    assert.strictEqual(aiCalls.length, 0, 'translation stays off when the user has it off');
    const record = stores.chapters['novel-1_ch7'];
    assert(record, 'chapter is saved');
    assert.strictEqual(saved.id, 'novel-1_ch7');
    assert.strictEqual(record.novelId, 'novel-1');
    assert.strictEqual(record.chapterNumber, 7);
    assert.strictEqual(record.title, '第七章 青阳镇');
    assert.strictEqual(record.url, PAGE_URL);
    assert.strictEqual(record.rawText, OCR_TEXT);
    assert.strictEqual(record.originalRawText, OCR_TEXT);
    assert.strictEqual(record.isTranslated, false);
    assert.strictEqual(record.ocrSource, true);
    assert.deepStrictEqual(announced, [['novel-1', 7, true]], 'announces the chapter only after it is stored');
  });

  await test('downloadChapter translates an already-read image chapter with the user settings and the OCR note when translation is on', async () => {
    const { S, stores, aiCalls } = makeStorageEnv();
    await seedCatalogNovel(S, stores);
    const progress = [];
    await S.downloadChapter('novel-1', 7, { source: { kind: 'image', text: 'Lin Dong walked into Qingyang Town.', url: PAGE_URL }, translation: { ...TRANSLATION }, onProgress: (p) => progress.push(p.phase) });
    assert.strictEqual(aiCalls.length, 1);
    assert.strictEqual(aiCalls[0].model, 'm1', 'uses the configured model');
    assert.strictEqual(aiCalls[0].provider, 'custom', 'uses the configured provider');
    assert(aiCalls[0].prompt.startsWith('Translate to English.'), 'uses the configured prompt');
    assert(/OCR/.test(aiCalls[0].prompt) && /misread/i.test(aiCalls[0].prompt), 'translation is told the source came from OCR');
    const record = stores.chapters['novel-1_ch7'];
    assert.strictEqual(record.rawText, 'VI[Lâm Động walked into Thanh Dương trấn.]');
    assert.strictEqual(record.originalRawText, 'Lin Dong walked into Qingyang Town.');
    assert.strictEqual(record.isTranslated, true);
    assert.strictEqual(record.modelUsed, 'test-model');
    assert.strictEqual(record.title, '第七章 青阳镇');
    assert(progress.includes('saving'), 'reports the saving phase');
    const names = await S.getNameList('novel-1');
    assert(names.some((n) => n.original === 'Wang Lin'), 'captured names are added like a normal download');
  });

  await test('downloadChapter marks an image chapter as paid in the catalog (image-only pages are paid chapters)', async () => {
    const { S, stores } = makeStorageEnv();
    await seedCatalogNovel(S, stores);
    stores.novels['novel-1'].chapterList[1].locked = false;
    S.updateNovel = async (id, updates) => (stores.novels[id] = { ...stores.novels[id], ...updates });
    await S.downloadChapter('novel-1', 7, { source: { kind: 'image', text: OCR_TEXT, url: PAGE_URL }, translation: { enabled: false } });
    const list = stores.novels['novel-1'].chapterList;
    assert.strictEqual(list.find((c) => c.chapterNumber === 7).locked, true, 'the OCR-saved chapter is paid');
    assert.strictEqual(list.find((c) => c.chapterNumber === 6).locked, undefined, 'other chapters are untouched');
  });

  await test('syncNovelChapters keeps a chapter paid after the user bought it', async () => {
    const { env, S, stores } = makeStorageEnv();
    await seedCatalogNovel(S, stores);
    S.updateNovel = async (id, updates) => (stores.novels[id] = { ...stores.novels[id], ...updates });
    const provider = env.ProviderRegistry.getProviderForUrl();
    provider.fetchChapterList = async () => CATALOG.map((c) => ({ ...c, locked: false }));
    await S.syncNovelChapters('novel-1');
    const list = stores.novels['novel-1'].chapterList;
    assert.strictEqual(list.find((c) => c.slug === '100043460').locked, true, 'a chapter seen as paid stays paid');
    assert.strictEqual(list.find((c) => c.slug === '100043459').locked, false, 'free chapters stay free');

    provider.fetchChapterList = async () => CATALOG.map((c) => ({ ...c, locked: true }));
    await S.syncNovelChapters('novel-1');
    assert.strictEqual(stores.novels['novel-1'].chapterList.find((c) => c.slug === '100043459').locked, true, 'a chapter the site starts charging for becomes paid');
  });

  await test('downloadChapter never saves an empty image chapter', async () => {
    const { S, stores } = makeStorageEnv();
    await seedCatalogNovel(S, stores);
    for (const text of ['', '   \n\n  ', null]) {
      await assert.rejects(() => S.downloadChapter('novel-1', 7, { source: { kind: 'image', text, url: PAGE_URL } }), /no text/i);
    }
    assert.deepStrictEqual(Object.keys(stores.chapters), [], 'nothing is saved');
  });

  const { saveImageChapter } = await loadComponent('components/react/ocr/ocrSave.js');
  const IMAGE = { bytes: new ArrayBuffer(8), mimeType: 'image/png', width: 939, height: 4200 };
  const TARGET = { novelId: 'novel-1', chapterNumber: 7, url: PAGE_URL };

  await test('saveImageChapter recognizes the image with the OCR engine, saves it and reports saved only after storage succeeds', async () => {
    const { S, stores } = makeStorageEnv();
    await seedCatalogNovel(S, stores);
    const recognized = [];
    const statuses = [];
    const result = await saveImageChapter({
      image: IMAGE,
      target: TARGET,
      storage: S,
      recognize: async (bytes, mimeType) => { recognized.push([bytes, mimeType]); return OCR_TEXT; },
      getTranslation: () => ({ ...TRANSLATION, enabled: false }),
      onStatus: (s) => statuses.push({ status: s.status, savedYet: !!stores.chapters['novel-1_ch7'] })
    });
    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.sourceText, OCR_TEXT);
    assert.deepStrictEqual(recognized, [[IMAGE.bytes, 'image/png']], 'the captured image goes to the OCR engine once');
    assert.deepStrictEqual(statuses.map((s) => s.status), ['recognizing', 'saving', 'saved']);
    assert.strictEqual(statuses.find((s) => s.status === 'saving').savedYet, false, 'not saved while saving is in progress');
    assert.strictEqual(statuses.find((s) => s.status === 'saved').savedYet, true, 'saved is reported after the record exists');
    assert.strictEqual(stores.chapters['novel-1_ch7'].rawText, OCR_TEXT);
    assert.strictEqual(stores.chapters['novel-1_ch7'].url, PAGE_URL);
  });

  await test('saveImageChapter saves through the one download, handing it the image with the text already read', async () => {
    const calls = [];
    const storage = { downloadChapter: async (id, n, options) => { calls.push([id, n, options.source, typeof options.onProgress, typeof options.onChunk]); return { rawText: OCR_TEXT, isTranslated: false }; } };
    const result = await saveImageChapter({
      image: IMAGE, target: { ...TARGET, title: 'Page title' }, storage,
      recognize: async () => OCR_TEXT,
      getTranslation: () => ({ ...TRANSLATION, enabled: false })
    });
    assert.strictEqual(result.ok, true);
    assert.deepStrictEqual(calls, [['novel-1', 7, { kind: 'image', text: OCR_TEXT, url: PAGE_URL, title: 'Page title' }, 'function', 'function']]);
  });

  await test('saveImageChapter translates with ocrSource and shows translation progress when the user has translation on', async () => {
    const { S, stores, aiCalls } = makeStorageEnv();
    await seedCatalogNovel(S, stores);
    const statuses = [];
    const result = await saveImageChapter({
      image: IMAGE,
      target: TARGET,
      storage: S,
      recognize: async () => 'Lin Dong walked into Qingyang Town.',
      getTranslation: () => ({ ...TRANSLATION }),
      onStatus: (s) => statuses.push(s)
    });
    assert.strictEqual(result.ok, true);
    assert(/misread/i.test(aiCalls[0].prompt), 'translation runs with ocrSource');
    assert.deepStrictEqual([...new Set(statuses.map((s) => s.status))], ['recognizing', 'translating', 'saving', 'saved']);
    assert(statuses.some((s) => s.status === 'translating' && s.translatedText === 'EN'), 'streams the translation to the panel');
    assert.strictEqual(result.translatedText, 'VI[Lâm Động walked into Thanh Dương trấn.]');
    assert.strictEqual(stores.chapters['novel-1_ch7'].isTranslated, true);
  });

  await test('saveImageChapter reports an OCR failure, saves nothing and can be retried', async () => {
    const { S, stores } = makeStorageEnv();
    await seedCatalogNovel(S, stores);
    const statuses = [];
    const result = await saveImageChapter({
      image: IMAGE,
      target: TARGET,
      storage: S,
      recognize: async () => { throw new Error('model failed to load'); },
      getTranslation: () => ({ ...TRANSLATION, enabled: false }),
      onStatus: (s) => statuses.push(s.status)
    });
    assert.strictEqual(result.ok, false);
    assert(/could not read the chapter image/i.test(result.error) && result.error.includes('model failed to load'), 'clear error with the cause');
    assert.strictEqual(statuses[statuses.length - 1], 'error');
    assert(!statuses.includes('saved'));
    assert.deepStrictEqual(Object.keys(stores.chapters), [], 'nothing is saved');

    const retry = await saveImageChapter({
      image: IMAGE, target: TARGET, storage: S,
      recognize: async () => OCR_TEXT,
      getTranslation: () => ({ ...TRANSLATION, enabled: false })
    });
    assert.strictEqual(retry.ok, true, 'a retry succeeds once OCR works');
    assert.strictEqual(stores.chapters['novel-1_ch7'].rawText, OCR_TEXT);
  });

  await test('saveImageChapter refuses an empty recognition result', async () => {
    const { S, stores } = makeStorageEnv();
    await seedCatalogNovel(S, stores);
    const statuses = [];
    const result = await saveImageChapter({
      image: IMAGE, target: TARGET, storage: S,
      recognize: async () => '  \n ',
      getTranslation: () => ({ ...TRANSLATION, enabled: false }),
      onStatus: (s) => statuses.push(s.status)
    });
    assert.strictEqual(result.ok, false);
    assert(/no text was found/i.test(result.error), 'explains that no text was found');
    assert(/not saved/i.test(result.error), 'says the chapter was not saved');
    assert.strictEqual(statuses[statuses.length - 1], 'error');
    assert.deepStrictEqual(Object.keys(stores.chapters), [], 'an empty chapter is never saved');
  });

  await test('saveImageChapter reports a missing chapter image without running OCR', async () => {
    const { S, stores } = makeStorageEnv();
    await seedCatalogNovel(S, stores);
    let ran = false;
    const result = await saveImageChapter({
      image: null, target: TARGET, storage: S,
      recognize: async () => { ran = true; return OCR_TEXT; },
      getTranslation: () => ({ ...TRANSLATION, enabled: false })
    });
    assert.strictEqual(result.ok, false);
    assert(/image/i.test(result.error));
    assert.strictEqual(ran, false);
    assert.deepStrictEqual(Object.keys(stores.chapters), []);
  });

  await test('saveImageChapter keeps the recognized text when saving fails, so a retry does not re-run OCR', async () => {
    const { S, stores } = makeStorageEnv();
    await seedCatalogNovel(S, stores);
    const failing = { downloadChapter: async () => { throw new Error('QuotaExceededError'); } };
    const first = await saveImageChapter({
      image: IMAGE, target: TARGET, storage: failing,
      recognize: async () => OCR_TEXT,
      getTranslation: () => ({ ...TRANSLATION, enabled: false })
    });
    assert.strictEqual(first.ok, false);
    assert(/could not save/i.test(first.error) && first.error.includes('QuotaExceededError'));
    assert.strictEqual(first.sourceText, OCR_TEXT, 'the recognized text is kept for the retry');

    let ocrRuns = 0;
    const retry = await saveImageChapter({
      image: IMAGE, target: TARGET, storage: S, sourceText: first.sourceText,
      recognize: async () => { ocrRuns++; return 'other'; },
      getTranslation: () => ({ ...TRANSLATION, enabled: false })
    });
    assert.strictEqual(retry.ok, true);
    assert.strictEqual(ocrRuns, 0, 'OCR is not repeated');
    assert.strictEqual(stores.chapters['novel-1_ch7'].rawText, OCR_TEXT);
  });

  await test('saveImageChapter stops with an error when translation is on but its settings are incomplete', async () => {
    const { S, stores } = makeStorageEnv();
    await seedCatalogNovel(S, stores);
    const result = await saveImageChapter({
      image: IMAGE, target: TARGET, storage: S,
      recognize: async () => OCR_TEXT,
      getTranslation: () => null
    });
    assert.strictEqual(result.ok, false);
    assert(/translat/i.test(result.error));
    assert.deepStrictEqual(Object.keys(stores.chapters), [], 'not saved untranslated behind the user\'s back');
  });

  function runContentScript({ html, check }) {
    const sent = [];
    const appended = [];
    const listeners = {};
    const makeEl = (tag) => ({ tagName: tag.toUpperCase(), style: {}, id: '', addEventListener() {}, remove() {} });
    const document = {
      documentElement: { outerHTML: html },
      getElementById: (id) => appended.find((el) => el.id === id) || null,
      createElement: makeEl,
      body: { appendChild: (el) => appended.push(el) }
    };
    const env = {
      console: { log() {}, warn() {}, error() {} },
      URL,
      URLSearchParams,
      setTimeout,
      clearTimeout,
      MutationObserver: class { observe() {} },
      document,
      chrome: {
        runtime: {
          lastError: undefined,
          getURL: (p) => `chrome-extension://abc/${p}`,
          sendMessage: (msg, cb) => {
            sent.push(msg);
            if (msg.action === 'CHECK_CHAPTER') setTimeout(() => cb(check), 0);
            else if (msg.action === 'SAVE_CHAPTER') setTimeout(() => cb({ success: true }), 0);
          }
        }
      }
    };
    env.window = {
      location: { href: PAGE_URL },
      addEventListener: (type, fn) => { listeners[type] = fn; },
      removeEventListener() {},
      getComputedStyle: () => ({ backgroundImage: 'none' })
    };
    env.globalThis = env;
    vm.createContext(env);
    vm.runInContext(read('src', 'providers', 'nkwwlkj.js'), env);
    vm.runInContext(read('src', 'providers', 'registry.js'), env);
    vm.runInContext(read('extension', 'scripts', 'content.js'), env);
    return { sent, appended, listeners };
  }

  const flush = () => new Promise((r) => setTimeout(r, 20));
  const BREAD = '<div class="crumbs"><a href="/book/book_detail/100181750">武动</a></div>';
  const SD = 'var sd = { book_id: 100181750, chapter_id: 100043460 };';

  await test('content script: an opened image chapter of a managed novel opens the OCR panel in save mode', async () => {
    const html = `<script>${SD}</script>${BREAD}<div class="article-title">第七章</div><div class="read-bd" id="J_ImgRead"><div id="J_BookImage"></div></div>`;
    const { sent, appended } = runContentScript({ html, check: { isManaged: true, isSaved: false, chapterNumber: 7, novelId: 'novel-1' } });
    await flush();
    assert(sent.some((m) => m.action === 'CHECK_CHAPTER'), 'checks whether the chapter is saved');
    assert(!sent.some((m) => m.action === 'SAVE_CHAPTER'), 'never saves the empty text of an image page');
    const frame = appended.find((el) => el.tagName === 'IFRAME');
    assert(frame, 'the OCR panel opens automatically');
    const src = new URL(frame.src);
    assert.strictEqual(src.searchParams.get('id'), 'novel-1');
    assert.strictEqual(src.searchParams.get('save'), '1', 'panel is in save mode');
    assert.strictEqual(src.searchParams.get('ch'), '7', 'panel knows the chapter number');
  });

  await test('content script: an already saved image chapter only offers the read-only panel', async () => {
    const html = `<script>${SD}</script>${BREAD}<div class="article-title">第七章</div><div class="read-bd" id="J_ImgRead"><div id="J_BookImage"></div></div>`;
    const { appended } = runContentScript({ html, check: { isManaged: true, isSaved: true, chapterNumber: 7, novelId: 'novel-1' } });
    await flush();
    assert(!appended.some((el) => el.tagName === 'IFRAME'), 'panel is not opened automatically');
    assert(appended.some((el) => el.tagName === 'BUTTON'), 'the translate button is still offered');
  });

  await test('content script: an opened text chapter is still saved with SAVE_CHAPTER and its page text', async () => {
    const html = `<script>${SD}</script>${BREAD}<div class="article-title">第七章 青阳镇</div><div class="read-bd" id="J_BookRead"><p class="chapter">正文第一段。</p></div>`;
    const { sent, appended } = runContentScript({ html, check: { isManaged: true, isSaved: false, chapterNumber: 7, novelId: 'novel-1' } });
    await flush();
    const save = sent.find((m) => m.action === 'SAVE_CHAPTER');
    assert(save, 'text chapter is saved');
    assert.strictEqual(save.slug, '100181750');
    assert.strictEqual(save.chapterNumber, 7);
    assert.strictEqual(save.rawText, '正文第一段。');
    assert.strictEqual(save.url, PAGE_URL);
    assert(!appended.some((el) => el.tagName === 'IFRAME'), 'no OCR panel for text chapters');
  });

  await test('saveImageChapter calls onSaved once, only after the chapter is stored', async () => {
    const { S, stores } = makeStorageEnv();
    await seedCatalogNovel(S, stores);
    const saved = [];
    await saveImageChapter({
      image: IMAGE, target: TARGET, storage: S,
      recognize: async () => OCR_TEXT,
      getTranslation: () => ({ ...TRANSLATION, enabled: false }),
      onSaved: () => saved.push(!!stores.chapters['novel-1_ch7'])
    });
    assert.deepStrictEqual(saved, [true]);
    const failed = [];
    await saveImageChapter({
      image: IMAGE, target: TARGET, storage: S,
      recognize: async () => '',
      getTranslation: () => ({ ...TRANSLATION, enabled: false }),
      onSaved: () => failed.push(true)
    });
    assert.deepStrictEqual(failed, [], 'not called when nothing was saved');
  });

  const ocrText = await loadComponent('components/react/ocr/ocrText.js');
  const line = (text, x, y, h = 24) => [{ text, box: { x, y, width: 700, height: h }, confidence: 0.99 }];

  await test('assembleParagraphs joins wrapped lines and splits on indented starts', () => {
    const lines = [
      line('汉末，天下将乱，黄巾未起。曹刘之辈', 46, 10),
      line('摩拳擦掌，意在争龙夺鼎。', 10, 44),
      line('陈舒不想夺鼎，他只想破除这吃人的世', 46, 78),
      line('道。', 10, 112)
    ];
    assert.strictEqual(
      ocrText.assembleParagraphs(lines),
      '汉末，天下将乱，黄巾未起。曹刘之辈摩拳擦掌，意在争龙夺鼎。\n\n陈舒不想夺鼎，他只想破除这吃人的世道。'
    );
  });

  await test('assembleParagraphs also splits on a large vertical gap and keeps same-line pieces in order', () => {
    const lines = [
      [{ text: '第一段', box: { x: 46, y: 10, width: 80, height: 24 }, confidence: 0.9 }, { text: '结束。', box: { x: 130, y: 10, width: 60, height: 24 }, confidence: 0.9 }],
      line('第二段开始。', 10, 120)
    ];
    assert.strictEqual(ocrText.assembleParagraphs(lines), '第一段结束。\n\n第二段开始。');
  });

  await test('assembleParagraphs detects indents with padded detection boxes (tall boxes, clamped left edge)', () => {
    const box = (x, y, text) => [{ text, box: { x, y, width: text.length * 18 + 48, height: 48 }, confidence: 0.99 }];
    const lines = [
      box(22, 0, '汉末，天下将乱，黄巾未起。曹刘之辈摩拳擦掌'),
      box(0, 40, '意在争龙夺鼎。'),
      box(22, 80, '陈舒不想夺鼎，他只想破除这吃人的世道。门户'),
      box(0, 120, '私计，我辈不为也！'),
      box(22, 160, '老者检查过陈舒的腿。')
    ];
    assert.strictEqual(
      ocrText.assembleParagraphs(lines),
      ['汉末，天下将乱，黄巾未起。曹刘之辈摩拳擦掌意在争龙夺鼎。', '陈舒不想夺鼎，他只想破除这吃人的世道。门户私计，我辈不为也！', '老者检查过陈舒的腿。'].join('\n\n')
    );
  });

  await test('assembleParagraphs ends a paragraph after a line that stops short of the right margin', () => {
    const box = (y, text, width) => [{ text, box: { x: 40, y, width, height: 22 }, confidence: 0.99 }];
    const lines = [
      box(15, '汉末，天下将乱，黄巾未起。曹刘之辈摩拳擦掌，意在争龙夺鼎', 576),
      box(55, '。', 20),
      box(95, '老者检查过陈舒的腿。', 190),
      box(135, '陈舒不想夺鼎。', 130)
    ];
    assert.strictEqual(
      ocrText.assembleParagraphs(lines),
      ['汉末，天下将乱，黄巾未起。曹刘之辈摩拳擦掌，意在争龙夺鼎。', '老者检查过陈舒的腿。', '陈舒不想夺鼎。'].join(String.fromCharCode(10, 10))
    );
  });

  await test('assembleParagraphs ignores empty input', () => {
    assert.strictEqual(ocrText.assembleParagraphs([]), '');
    assert.strictEqual(ocrText.assembleParagraphs(null), '');
  });

  const ocrPipeline = await loadComponent('components/react/ocr/ocrPipeline.js');
  await test('blankRowsFromPixels finds the rows that are only background', () => {
    const width = 3;
    const rows = [[255, 255, 255], [255, 0, 255], [250, 252, 255], [10, 10, 10]];
    const data = new Uint8ClampedArray(width * rows.length * 4);
    rows.forEach((row, y) => row.forEach((v, x) => { const i = (y * width + x) * 4; data[i] = v; data[i + 1] = v; data[i + 2] = v; data[i + 3] = 255; }));
    assert.deepStrictEqual(Array.from(ocrPipeline.blankRowsFromPixels(data, width, rows.length)), [true, false, true, false], 'near-background rows count as blank');
  });

  await test('the OCR pipeline decodes, cuts strips at blank rows, reads each strip and puts lines back in page order', async () => {
    const width = 4;
    const height = 2600;
    const drawn = [];
    const canvases = [];
    const makeCanvas = (w, h) => {
      const canvas = {
        width: w,
        height: h,
        getContext: () => ({
          fillStyle: '',
          fillRect() {},
          drawImage: (...args) => drawn.push([w, h, ...args.slice(1)]),
          getImageData: (x, y, cw, ch) => {
            const data = new Uint8ClampedArray(cw * ch * 4).fill(255);
            for (let row = 0; row < ch; row++) {
              if (row % 100 < 60) data[row * cw * 4] = 0;
            }
            return { data };
          }
        })
      };
      canvases.push(canvas);
      return canvas;
    };
    const decoded = [];
    const decode = async (bytes, mimeType) => { decoded.push([bytes.byteLength, mimeType]); return { width, height }; };
    const read = [];
    const service = {
      recognize: async (strip) => {
        read.push(strip.height);
        return { lines: [[{ text: `strip ${read.length}`, box: { x: 0, y: 5, width: 10, height: 20 }, confidence: 0.9 }]] };
      }
    };
    const text = await ocrPipeline.recognizeImage(service, new Uint8Array([1, 2, 3]).buffer, 'image/png', { decode, makeCanvas });
    assert.deepStrictEqual(decoded, [[3, 'image/png']]);
    assert(read.length >= 3, `a tall image is read in strips (${read.length})`);
    assert(read.every((h) => h <= 1200), 'no strip is taller than 1200 px');
    assert.strictEqual(read.reduce((a, b) => a + b, 0), height, 'the strips cover the whole image');
    const order = text.split('\n\n').join(' ');
    assert(order.indexOf('strip 1') < order.indexOf('strip 2') && order.indexOf('strip 2') < order.indexOf('strip 3'), `lines keep page order: ${order}`);
  });

  const ocrWorkerProtocol = await loadComponent('components/react/ocr/ocrWorkerProtocol.js');
  await test('the OCR worker answers each request with its id: the text, or the error', async () => {
    const ok = await ocrWorkerProtocol.handleWorkerRequest({ id: 7, bytes: new Uint8Array([1]).buffer, mimeType: 'image/png' }, async (bytes, mime) => `read ${bytes.byteLength} ${mime}`);
    assert.deepStrictEqual(plain(ok), { id: 7, text: 'read 1 image/png' });
    const bad = await ocrWorkerProtocol.handleWorkerRequest({ id: 8, bytes: new ArrayBuffer(1), mimeType: 'image/png' }, async () => { throw new Error('model failed'); });
    assert.deepStrictEqual(plain(bad), { id: 8, error: 'model failed' });
  });

  await test('the OCR client sends a copy of the image to one worker and matches replies by id', async () => {
    const workers = [];
    const createWorker = () => {
      const worker = {
        sent: [],
        listeners: {},
        addEventListener: (type, fn) => { worker.listeners[type] = fn; },
        postMessage: (message, transfer) => { worker.sent.push({ message, transfer }); },
        terminate: () => { worker.terminated = true; },
        reply: (data) => worker.listeners.message({ data }),
        crash: () => worker.listeners.error({ message: 'boom' })
      };
      workers.push(worker);
      return worker;
    };
    const client = ocrWorkerProtocol.createOcrClient(createWorker);
    const bytes = new Uint8Array([1, 2, 3]).buffer;
    const first = client.recognize(bytes, 'image/png');
    const second = client.recognize(new Uint8Array([4]).buffer, 'image/jpeg');
    assert.strictEqual(workers.length, 1, 'one worker for all requests');
    const [a, b] = workers[0].sent;
    assert.strictEqual(a.message.mimeType, 'image/png');
    assert.deepStrictEqual(a.transfer, [a.message.bytes], 'the image is transferred, not cloned');
    assert.notStrictEqual(a.message.bytes, bytes, 'a copy is sent');
    assert.strictEqual(bytes.byteLength, 3, "the caller's image stays usable");
    workers[0].reply({ id: b.message.id, text: 'second' });
    workers[0].reply({ id: a.message.id, text: 'first' });
    assert.strictEqual(await first, 'first');
    assert.strictEqual(await second, 'second');

    const failing = client.recognize(bytes, 'image/png');
    workers[0].reply({ id: workers[0].sent[2].message.id, error: 'model failed' });
    await assert.rejects(failing, /model failed/);

    const lost = client.recognize(bytes, 'image/png');
    workers[0].crash();
    await assert.rejects(lost, /boom|OCR worker/i, 'a crashed worker fails its pending requests');
    assert(workers[0].terminated, 'and is let go');
    client.recognize(bytes, 'image/png');
    assert.strictEqual(workers.length, 2, 'the next request starts a new worker');
  });

  await test('the OCR engine runs in a module worker the bundler builds as ES modules', () => {
    const engine = fs.readFileSync(path.join(repoRoot, 'src', 'components', 'react', 'ocr', 'ocrEngine.js'), 'utf8');
    assert(/new Worker\(new URL\('\.\/ocr\.worker\.js', import\.meta\.url\), \{ type: 'module' \}\)/.test(engine), 'ocrEngine starts ocr.worker.js as a module worker');
    assert(!/onnxruntime-web|ppu-paddle-ocr/.test(engine), 'the page itself no longer loads the OCR runtime');
    const worker = fs.readFileSync(path.join(repoRoot, 'src', 'components', 'react', 'ocr', 'ocr.worker.js'), 'utf8');
    assert(/ppu-paddle-ocr\/web/.test(worker) && /onnxruntime-web/.test(worker), 'the worker owns the OCR runtime');
    const vite = fs.readFileSync(path.join(repoRoot, 'vite.config.mjs'), 'utf8');
    assert(/worker:\s*\{\s*format:\s*'es'/.test(vite), 'workers are bundled as ES modules');
  });

  await test('planStrips cuts a tall image only at blank rows near the target height', () => {
    const height = 3000;
    const blank = Array.from({ length: height }, (_, y) => y % 34 >= 26);
    const strips = ocrText.planStrips(blank, 1000);
    assert.strictEqual(strips[0][0], 0, 'starts at the top');
    assert.strictEqual(strips[strips.length - 1][1], height, 'ends at the bottom');
    for (let i = 1; i < strips.length; i++) {
      assert.strictEqual(strips[i][0], strips[i - 1][1], 'strips are contiguous');
      assert(blank[strips[i][0]], `cut at row ${strips[i][0]} is blank`);
    }
    for (const [a, b] of strips) assert(b - a <= 1000 && b - a > 0, `strip ${a}-${b} is within the target height`);
  });

  await test('planStrips keeps short images whole and falls back to a hard cut with no blank rows', () => {
    assert.deepStrictEqual(plain(ocrText.planStrips(Array(800).fill(false), 1000)), [[0, 800]]);
    const solid = ocrText.planStrips(Array(2500).fill(false), 1000);
    assert.deepStrictEqual(plain(solid), [[0, 1000], [1000, 2000], [2000, 2500]]);
  });

  await test('isOcrImageMessage accepts only image messages from the parent frame', () => {
    const parent = {};
    const bytes = new ArrayBuffer(8);
    const ok = { source: parent, data: { type: 'QC_OCR_IMAGE', bytes, mimeType: 'image/png' } };
    assert.strictEqual(ocrText.isOcrImageMessage(ok, parent), true);
    assert.strictEqual(ocrText.isOcrImageMessage({ ...ok, source: {} }, parent), false, 'other frames are ignored');
    assert.strictEqual(ocrText.isOcrImageMessage({ source: parent, data: { type: 'QC_OCR_IMAGE', bytes: 'x' } }, parent), false, 'bytes must be an ArrayBuffer');
    assert.strictEqual(ocrText.isOcrImageMessage({ source: parent, data: { type: 'OTHER', bytes } }, parent), false);
    assert.strictEqual(ocrText.isOcrImageMessage({ source: parent, data: null }, parent), false);
  });

  await test('the provider flags image-only chapter pages (paid chapters render as images even when unlocked)', () => {
    const env = { console, URL };
    env.globalThis = env;
    vm.createContext(env);
    vm.runInContext(read('src', 'providers', 'nkwwlkj.js'), env);
    const P = env.NkwwlkjProvider;
    const imagePage = '<div class="article-title">第一章</div><div class="read-bd" id="J_ImgRead"><div id="J_BookImage"></div></div>';
    const textPage = '<div class="article-title">第一章</div><div class="read-bd" id="J_BookRead"><p class="chapter">正文。</p></div>';
    assert.strictEqual(P.parseChapterPageHtml(imagePage).imageOnly, true);
    assert.strictEqual(P.parseChapterPageHtml(textPage).imageOnly, false);
    assert.strictEqual(P.isImageChapter({ documentElement: { outerHTML: imagePage } }), true);
    assert.strictEqual(P.isImageChapter({ documentElement: { outerHTML: textPage } }), false);
  });

  await test('captureChapterImage reuses the image the page already shows and never re-requests it', async () => {
    const env = { console, URL };
    env.globalThis = env;
    vm.createContext(env);
    vm.runInContext(read('src', 'providers', 'nkwwlkj.js'), env);
    const P = env.NkwwlkjProvider;

    const imageUrl = 'https://www.nkwwlkj.cn/chapter/book_chapter_image?chapter_id=1&image_code=once';
    const loaded = [];
    let fetched = false;
    class FakeImage {
      set src(v) {
        this._src = v;
        loaded.push(v);
        setTimeout(() => { this.naturalWidth = 939; this.naturalHeight = 4200; if (this.onload) this.onload(); }, 0);
      }
      get src() { return this._src; }
    }
    const drawn = [];
    const fakeDoc = {
      getElementById: (id) => (id === 'J_BookImage' ? { id } : null),
      createElement: (tag) => {
        assert.strictEqual(tag, 'canvas');
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => ({ fillStyle: '', fillRect() {}, drawImage: (img, x, y) => drawn.push([img.src, x, y, canvas.width, canvas.height]) }),
          toBlob: (cb, type) => cb({ type, arrayBuffer: async () => new ArrayBuffer(16) })
        };
        return canvas;
      }
    };
    const fakeWin = {
      Image: FakeImage,
      fetch: () => { fetched = true; throw new Error('must not fetch'); },
      getComputedStyle: () => ({ backgroundImage: `url("${imageUrl}")` })
    };

    const result = await P.captureChapterImage(fakeDoc, fakeWin);
    assert.strictEqual(fetched, false, 'the one-time image URL is never fetched again');
    assert.deepStrictEqual(loaded, [imageUrl], 'loads the URL the page already displayed');
    assert.deepStrictEqual(drawn, [[imageUrl, 0, 0, 939, 4200]], 'draws it at full size');
    assert.strictEqual(result.width, 939);
    assert.strictEqual(result.height, 4200);
    assert.strictEqual(result.mimeType, 'image/png');
    assert.strictEqual(result.bytes.byteLength, 16, 'returns the PNG bytes from the canvas');
  });

  await test('captureChapterImage works in a background tab, where img.decode() waits until the tab is shown', async () => {
    const env = { console, URL };
    env.globalThis = env;
    vm.createContext(env);
    vm.runInContext(read('src', 'providers', 'nkwwlkj.js'), env);
    const imageUrl = 'https://www.nkwwlkj.cn/chapter/book_chapter_image?chapter_id=2&image_code=bg';
    class BackgroundTabImage {
      set src(v) {
        this._src = v;
        setTimeout(() => {
          this.naturalWidth = 939;
          this.naturalHeight = 4200;
          this.complete = true;
          if (this.onload) this.onload();
        }, 5);
      }
      get src() { return this._src; }
      decode() { return new Promise(() => {}); }
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ fillStyle: '', fillRect() {}, drawImage() {} }),
      toBlob: (cb, type) => cb({ type, arrayBuffer: async () => new ArrayBuffer(8) })
    };
    const capture = env.NkwwlkjProvider.captureChapterImage(
      { getElementById: (id) => (id === 'J_BookImage' ? { id } : null), createElement: () => canvas },
      { Image: BackgroundTabImage, getComputedStyle: () => ({ backgroundImage: `url("${imageUrl}")` }) }
    );
    const result = await Promise.race([capture, new Promise((r) => setTimeout(() => r('stalled'), 500))]);
    assert.notStrictEqual(result, 'stalled', 'the capture finishes without the tab being shown');
    assert.strictEqual(result.width, 939);
    assert.strictEqual(result.height, 4200);
    assert.strictEqual(result.bytes.byteLength, 8);
  });

  await test('captureChapterImage reports an image that fails to load', async () => {
    const env = { console, URL };
    env.globalThis = env;
    vm.createContext(env);
    vm.runInContext(read('src', 'providers', 'nkwwlkj.js'), env);
    class BrokenImage {
      set src(v) { this._src = v; setTimeout(() => { if (this.onerror) this.onerror(new Error('404')); }, 5); }
      get src() { return this._src; }
      decode() { return new Promise(() => {}); }
    }
    await assert.rejects(
      () => env.NkwwlkjProvider.captureChapterImage(
        { getElementById: () => ({}), createElement: () => ({}) },
        { Image: BrokenImage, getComputedStyle: () => ({ backgroundImage: 'url("https://www.nkwwlkj.cn/x.png")' }) }
      ),
      /chapter image could not be loaded/i
    );
  });

  await test('captureChapterImage returns null when the page shows no chapter image', async () => {
    const env = { console, URL };
    env.globalThis = env;
    vm.createContext(env);
    vm.runInContext(read('src', 'providers', 'nkwwlkj.js'), env);
    const result = await env.NkwwlkjProvider.captureChapterImage(
      { getElementById: () => null },
      { getComputedStyle: () => ({ backgroundImage: 'none' }) }
    );
    assert.strictEqual(result, null);
  });

  await test('the OCR panel is built as an extension page with bundled models and the wasm runtime', () => {
    const vite = read('vite.config.mjs');
    const targets = read('build-targets.mjs');
    assert(/ocr:\s*'views\/ocr-panel\.html'/.test(targets), 'the extension build includes views/ocr-panel.html');
    assert(/'ocr'/.test(targets), 'the build copies src/ocr into dist');
    assert(vite.includes('ort-wasm-simd-threaded.wasm'), 'vite copies the ONNX Runtime wasm binary');
    assert(vite.includes('ort-wasm-simd-threaded.mjs'), 'vite copies the ONNX Runtime wasm loader');
    assert(/onnxruntime-web\/wasm/.test(vite), 'onnxruntime-web is aliased to its wasm-only build');
    for (const f of ['PP-OCRv6_small_det.ort', 'PP-OCRv6_small_rec.ort', 'ppocrv6_dict.txt']) {
      assert(fs.existsSync(path.join(repoRoot, 'src', 'ocr', 'models', f)), `src/ocr/models/${f} is bundled`);
    }
    for (const f of ['PP-OCRv6_tiny_det.ort', 'PP-OCRv6_tiny_rec.ort', 'ppocrv6_tiny_dict.txt']) {
      assert(!fs.existsSync(path.join(repoRoot, 'src', 'ocr', 'models', f)), `the tiny model ${f} is no longer bundled`);
    }
    const dictionary = read('src', 'ocr', 'models', 'ppocrv6_dict.txt').split('\n').length;
    assert(dictionary > 15000, `the full dictionary covers rare characters (${dictionary} entries; tiny had about 6,900)`);
    const worker = read('src', 'components', 'react', 'ocr', 'ocr.worker.js');
    for (const f of ['PP-OCRv6_small_det.ort', 'PP-OCRv6_small_rec.ort', 'ppocrv6_dict.txt']) {
      assert(worker.includes(`../ocr/models/${f}`), `the OCR worker loads ${f}`);
    }
    const html = read('src', 'views', 'ocr-panel.html');
    assert(html.includes('id="ocr-root"'), 'panel shell has #ocr-root');
    assert(html.includes('components/react/ocr/ocr-entry.jsx'), 'panel shell mounts the OCR entry');
    assert(html.indexOf('services/storage.js') >= 0 && html.indexOf('services/ai-service.js') >= 0, 'panel loads storage and AI services');
  });

  await test('the manifest allows WebAssembly on extension pages and exposes the panel to the site', () => {
    const manifest = JSON.parse(read('extension', 'manifest.json'));
    const csp = manifest.content_security_policy && manifest.content_security_policy.extension_pages;
    assert(csp && csp.includes("'wasm-unsafe-eval'") && csp.includes("script-src 'self'"), 'extension_pages CSP allows wasm');
    const war = manifest.web_accessible_resources.find((r) => r.resources.includes('views/*'));
    assert(war, 'views/* stays web accessible so the panel can be framed');
  });

  console.log(`--- OCR Reading Panel Test Suite: ${passed}/${passed + failed} passed ---`);
  if (failed > 0) process.exit(1);
  console.log('OCR Reading Panel Test Suite: ALL TESTS PASSED!');
  finished = true;
})();
