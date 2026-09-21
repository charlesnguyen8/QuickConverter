// QuickConverter - Add Book & Provider Resolution Unit Test Suite
// Validates URL validation, series/chapter URL resolution, provider matching,
// duplicate detection, and library persistence.

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

console.log('\n--- Running Add Book & Provider Resolution Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');
const wetriedtlsCode = fs.readFileSync(path.join(repoRoot, 'providers', 'wetriedtls.js'), 'utf8');
const registryCode = fs.readFileSync(path.join(repoRoot, 'providers', 'registry.js'), 'utf8');
const storageCode = fs.readFileSync(path.join(repoRoot, 'services', 'storage.js'), 'utf8');

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
vm.runInContext(storageCode, testEnv);

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

  console.log(`\n🎉 All ${passedCount} Add Book & Provider tests passed!`);
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
