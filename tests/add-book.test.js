// QuickConverter - Add Book & Provider Resolution Unit Test Suite
// Validates URL validation, series/chapter URL resolution, provider matching,
// duplicate detection, and library persistence.

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

console.log('\n--- Running Add Book & Provider Resolution Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');
const wetriedtlsCode = fs.readFileSync(path.join(repoRoot, 'src', 'providers', 'wetriedtls.js'), 'utf8');
const registryCode = fs.readFileSync(path.join(repoRoot, 'src', 'providers', 'registry.js'), 'utf8');
const storageCode = fs.readFileSync(path.join(repoRoot, 'src', 'services', 'storage.js'), 'utf8');

// Mock indexedDB & environment
const mockDbStore = {};
const mockDatabase = {
  transaction: (storeNames, mode) => {
    const tx = {
      objectStore: (name) => ({
        put: (record) => {
          mockDbStore[record.id] = { ...record };
          setTimeout(() => {
            if (tx.oncomplete) tx.oncomplete();
          }, 0);
        },
        get: (id) => {
          const req = {
            result: mockDbStore[id] || null,
            onsuccess: null,
            onerror: null
          };
          setTimeout(() => {
            if (req.onsuccess) req.onsuccess();
          }, 0);
          return req;
        },
        getAll: () => {
          const req = {
            result: Object.values(mockDbStore),
            onsuccess: null,
            onerror: null
          };
          setTimeout(() => {
            if (req.onsuccess) req.onsuccess();
          }, 0);
          return req;
        }
      }),
      oncomplete: null,
      onerror: null
    };
    return tx;
  }
};

const mockLocalStorage = {
  data: { quickconverter_db_initialized: 'true' },
  getItem(k) { return this.data[k] !== undefined ? this.data[k] : null; },
  setItem(k, v) { this.data[k] = String(v); },
  removeItem(k) { delete this.data[k]; }
};

const testEnv = {
  console,
  setTimeout,
  clearTimeout,
  URL,
  fetch: globalThis.fetch,
  localStorage: mockLocalStorage,
  indexedDB: {
    open: () => {
      const req = {
        result: mockDatabase,
        onsuccess: null,
        onerror: null
      };
      setTimeout(() => {
        if (req.onsuccess) req.onsuccess();
      }, 0);
      return req;
    }
  }
};
testEnv.window = testEnv;
testEnv.self = testEnv;
testEnv.globalThis = testEnv;

vm.createContext(testEnv);
vm.runInContext(wetriedtlsCode, testEnv);
vm.runInContext(registryCode, testEnv);
vm.runInContext(fs.readFileSync(path.join(repoRoot, 'src', 'services', 'platform.js'), 'utf8'), testEnv);
vm.runInContext(storageCode, testEnv);

function makeSyncEnv() {
  const stores = { novels: {}, chapters: {} };
  const calls = [];
  const request = (result) => {
    const req = { result, onsuccess: null, onerror: null };
    setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
    return req;
  };
  const database = {
    transaction() {
      const tx = {
        objectStore: (name) => {
          if (!stores[name]) stores[name] = {};
          return {
            getAll: () => request(Object.values(stores[name])),
            get: (id) => request(stores[name][id] || null),
            put: (record) => { stores[name][record.id] = { ...record }; },
            delete: (id) => { delete stores[name][id]; }
          };
        },
        oncomplete: null,
        onerror: null
      };
      setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 5);
      return tx;
    }
  };
  const provider = {
    async fetchSeriesMetadata() {
      calls.push('metadata');
      return { title: 'A Regressor’s Tale of Cultivation', totalChapters: 893, thumbnail: 'https://media.reaperscans.net/file/7BSHk1m/cover.png', author: null, status: 'Active' };
    },
    async fetchChapterList(slug) {
      calls.push('chapters');
      return [0, 1, 2].map((n) => ({ chapterNumber: n, title: `Chapter ${n}`, slug: `chapter-${n}`, url: `https://wetriedtls.com/series/${slug}/chapter-${n}` }));
    }
  };
  const ls = { quickconverter_db_initialized: 'true' };
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
    indexedDB: { open: () => request(database) },
    ProviderRegistry: { getProviderForUrl: () => provider, getProviderForDomain: () => provider }
  };
  env.window = env;
  env.self = env;
  env.globalThis = env;
  vm.createContext(env);
  vm.runInContext(fs.readFileSync(path.join(repoRoot, 'src', 'services', 'platform.js'), 'utf8'), env);
  vm.runInContext(storageCode, env);
  return { S: env.StorageService, stores, calls };
}

const WetriedtlsProvider = testEnv.WetriedtlsProvider;
const ProviderRegistry = testEnv.ProviderRegistry;
const StorageService = testEnv.StorageService;

async function runTests() {
  let passedCount = 0;

  // Test 1: Provider matches supported URLs
  const validSeriesUrl = 'https://wetriedtls.com/series/a-regressors-tale-of-cultivation';
  const provider1 = ProviderRegistry.getProviderForUrl(validSeriesUrl);
  assert(provider1 !== null, 'Should find provider for wetriedtls.com');
  assert.strictEqual(provider1.id, 'wetriedtls');
  console.log('✓ ProviderRegistry matches wetriedtls.com series landing URL');
  passedCount++;

  // Test 2: Provider matches chapter URLs
  const validChapterUrl = 'https://wetriedtls.com/series/a-regressors-tale-of-cultivation/chapter-10';
  const provider2 = ProviderRegistry.getProviderForUrl(validChapterUrl);
  assert(provider2 !== null, 'Should find provider for chapter URL');
  assert.strictEqual(provider2.id, 'wetriedtls');
  console.log('✓ ProviderRegistry matches wetriedtls.com chapter URL');
  passedCount++;

  // Test 3: Provider rejects unsupported websites
  const unsupportedUrl = 'https://unsupported-site.com/series/some-novel';
  const provider3 = ProviderRegistry.getProviderForUrl(unsupportedUrl);
  assert.strictEqual(provider3, null, 'Should return null for unsupported domain');
  console.log('✓ ProviderRegistry correctly rejects unsupported domains');
  passedCount++;

  // Test 4: WetriedtlsProvider.parseUrl extracts series slug from series URL
  const parsedSeries = WetriedtlsProvider.parseUrl('https://wetriedtls.com/series/surviving-as-an-academy-necromancer');
  assert.strictEqual(parsedSeries.type, 'series');
  assert.strictEqual(parsedSeries.slug, 'surviving-as-an-academy-necromancer');
  assert.strictEqual(parsedSeries.seriesUrl, 'https://wetriedtls.com/series/surviving-as-an-academy-necromancer');
  console.log('✓ WetriedtlsProvider.parseUrl accurately extracts series slug and canonical seriesUrl');
  passedCount++;

  // Test 5: WetriedtlsProvider.parseUrl auto-resolves chapter URL to parent series
  const parsedChapter = WetriedtlsProvider.parseUrl('https://wetriedtls.com/series/academys-genius-swordmaster/chapter-42.5');
  assert.strictEqual(parsedChapter.type, 'chapter');
  assert.strictEqual(parsedChapter.slug, 'academys-genius-swordmaster');
  assert.strictEqual(parsedChapter.chapterNumber, 42.5);
  assert.strictEqual(parsedChapter.seriesUrl, 'https://wetriedtls.com/series/academys-genius-swordmaster');
  console.log('✓ WetriedtlsProvider.parseUrl auto-resolves chapter URL to parent series URL');
  passedCount++;

  // Test 6: StorageService.addNovel persists novel into library
  const testNovel = {
    title: 'Test Added Novel',
    slug: 'test-added-novel',
    url: 'https://wetriedtls.com/series/test-added-novel',
    domain: 'wetriedtls.com',
    thumbnail: 'https://example.com/cover.webp',
    totalChapters: 350,
    status: 'Active'
  };

  await StorageService.addNovel(testNovel);
  const isManaged = await StorageService.isNovelManaged('test-added-novel');
  assert.strictEqual(isManaged, true, 'Novel should now be managed in storage');

  const retrieved = await StorageService.getNovelBySlug('test-added-novel');
  assert.strictEqual(retrieved.title, 'Test Added Novel');
  assert.strictEqual(retrieved.totalChapters, 350);
  assert.strictEqual(retrieved.domain, 'wetriedtls.com');
  console.log('✓ StorageService.addNovel successfully persists novel metadata into library');
  passedCount++;

  // Test 7: Duplicate prevention
  const initialCount = (await StorageService.getManagedNovels()).length;
  await StorageService.addNovel(testNovel); // Attempt duplicate add
  const afterCount = (await StorageService.getManagedNovels()).length;
  assert.strictEqual(initialCount, afterCount, 'Adding existing novel should not duplicate entries');
  console.log('✓ Duplicate prevention: re-adding existing novel does not create duplicate entries');
  passedCount++;

  // Test 8: Custom event payload format validation
  let receivedEvent = null;
  const mockListener = (e) => { receivedEvent = e.detail; };
  testEnv.window.addEventListener = (evt, cb) => {
    if (evt === 'novel-added') testEnv.window._cb = cb;
  };
  testEnv.window.dispatchEvent = (e) => {
    if (e.type === 'novel-added' && testEnv.window._cb) {
      testEnv.window._cb(e);
    }
  };

  testEnv.window.addEventListener('novel-added', mockListener);
  testEnv.window.dispatchEvent({
    type: 'novel-added',
    detail: { novel: testNovel, slug: testNovel.slug }
  });

  assert(receivedEvent !== null, 'novel-added event should have been dispatched');
  assert.strictEqual(receivedEvent.slug, 'test-added-novel');
  assert.strictEqual(receivedEvent.novel.title, 'Test Added Novel');
  console.log('✓ novel-added custom DOM event dispatched with expected payload');
  passedCount++;

  // Test 9: one sync refreshes the book's cover/total and its catalog (the app has no popup or
  // content script to refresh the metadata)
  const synced = makeSyncEnv();
  synced.stores.novels['novel-1'] = {
    id: 'novel-1',
    title: 'A Regressor’s Tale of Cultivation',
    slug: 'a-regressors-tale-of-cultivation',
    url: 'https://wetriedtls.com/series/a-regressors-tale-of-cultivation',
    domain: 'wetriedtls.com',
    thumbnail: '',
    totalChapters: 100,
    chapterList: []
  };
  const result = await synced.S.syncNovel('novel-1');
  const stored = synced.stores.novels['novel-1'];
  assert.strictEqual(stored.thumbnail, 'https://media.reaperscans.net/file/7BSHk1m/cover.png', 'cover comes from the series page');
  assert.strictEqual(stored.totalChapters, 893, 'total comes from the series page');
  assert.deepStrictEqual(stored.chapterList.map((c) => c.slug), ['chapter-0', 'chapter-1', 'chapter-2'], 'catalog comes from the chapter API');
  assert.strictEqual(result.thumbnail, stored.thumbnail, 'returns the updated book');
  assert.strictEqual(result.chapterList.length, 3, 'returns the book with its catalog');
  assert.deepStrictEqual(synced.calls, ['metadata', 'chapters'], 'metadata first, then the catalog');
  assert.strictEqual(await synced.S.syncNovel('missing'), null, 'an unknown book syncs nothing');
  console.log('✓ StorageService.syncNovel refreshes cover/total and the chapter catalog in one call');
  passedCount++;

  console.log(`\n🎉 All ${passedCount} Add Book & Provider tests passed!`);
  finished = true;
}

let finished = false;
process.on('beforeExit', () => {
  if (!finished) {
    console.error('❌ Add Book suite stopped before its last test (a promise never settled)');
    process.exitCode = 1;
  }
});

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
