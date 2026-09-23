const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('--- Running Cloud Backup Export / Import Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');
const storageCode = fs.readFileSync(path.join(repoRoot, 'src', 'services', 'storage.js'), 'utf8');

const stores = { novels: {}, chapters: {} };

function makeRequest(result) {
  const req = { result, onsuccess: null, onerror: null };
  setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
  return req;
}

function fakeStore(name) {
  return {
    getAll: () => makeRequest(Object.values(stores[name])),
    put: (record) => { stores[name][record.id] = { ...record }; },
    clear: () => { stores[name] = {}; }
  };
}

const mockDatabase = {
  transaction(names) {
    const tx = { objectStore: (name) => fakeStore(name), oncomplete: null, onerror: null };
    setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
    return tx;
  }
};

const lsData = {};
const mockLocalStorage = {
  get length() { return Object.keys(lsData).length; },
  key(i) { return Object.keys(lsData)[i]; },
  getItem(k) { return k in lsData ? lsData[k] : null; },
  setItem(k, v) { lsData[k] = String(v); },
  removeItem(k) { delete lsData[k]; }
};

const testEnv = {
  console,
  setTimeout,
  clearTimeout,
  localStorage: mockLocalStorage,
  window: { localStorage: mockLocalStorage },
  self: {},
  globalThis: {},
  chrome: {
    storage: {
      local: {
        data: {},
        get(keys, cb) {
          const out = (keys === null || keys === undefined) ? { ...this.data } : {};
          if (typeof cb === 'function') cb(out);
        },
        set(items) { Object.assign(this.data, items); }
      }
    }
  },
  indexedDB: {
    open() {
      const req = { result: mockDatabase, onsuccess: null, onerror: null, onupgradeneeded: null };
      setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
      return req;
    }
  }
};

vm.createContext(testEnv);
vm.runInContext(storageCode, testEnv);
const StorageService = testEnv.StorageService || testEnv.window.StorageService;

(async () => {
  const seed = {
    format: 'quickconverter-backup',
    version: 1,
    novels: [
      { id: 'novel-1', title: 'Test Novel', slug: 'test-novel', totalChapters: 10 },
      { id: 'novel-2', title: 'Second Novel', slug: 'second-novel', totalChapters: 5 }
    ],
    chapters: [
      { id: 'novel-1_ch1', novelId: 'novel-1', chapterNumber: 1, rawText: 'Hello world', translatedText: 'Xin chao' },
      { id: 'novel-1_ch2', novelId: 'novel-1', chapterNumber: 2, rawText: 'Chapter two', translatedText: '' }
    ],
    preferences: {
      quickconverter_deepseek_model: 'deepseek-chat',
      quickconverter_deepseek_enabled: 'true',
      quickconverter_deepseek_key: 'SHOULD_NOT_EXPORT'
    }
  };
  await StorageService.importAll(seed, { replace: true });

  StorageService.setPreference('quickconverter_deepseek_key', 'SECRET_KEY');
  StorageService.setPreference('quickconverter_deepseek_key_storage', 'local');
  StorageService.setPreference('quickconverter_custom_api_key', 'SECRET_CUSTOM');
  StorageService.setPreference('quickconverter_deepseek_model', 'deepseek-reasoner');
  testEnv.chrome.storage.local.set({
    quickconverter_ai_provider: 'custom',
    quickconverter_ai_bridge_url: 'http://127.0.0.1:8000/v1',
    quickconverter_managed_novels: ['novel-1', 'novel-2'],
    quickconverter_deepseek_key: 'CHROME_SECRET'
  });

  const backup = await StorageService.exportAll();
  assert.strictEqual(backup.format, 'quickconverter-backup');
  assert.strictEqual(backup.version, 1);
  assert.strictEqual(backup.novels.length, 2, 'exports both novels');
  assert.strictEqual(backup.chapters.length, 2, 'exports both chapters');
  assert(backup.preferences.quickconverter_deepseek_model === 'deepseek-reasoner', 'exports normal prefs');
  assert.strictEqual(backup.preferences.quickconverter_deepseek_key, undefined, 'excludes DeepSeek API key');
  assert.strictEqual(backup.preferences.quickconverter_deepseek_key_storage, undefined, 'excludes key-storage pref');
  assert.strictEqual(backup.preferences.quickconverter_custom_api_key, undefined, 'excludes custom API key');
  assert.strictEqual(backup.preferences.quickconverter_ai_provider, 'custom', 'exports chrome.storage.local provider setting');
  assert.strictEqual(backup.preferences.quickconverter_ai_bridge_url, 'http://127.0.0.1:8000/v1', 'exports chrome-only bridge URL');
  assert.strictEqual(backup.preferences.quickconverter_deepseek_key, undefined, 'excludes chrome.storage.local API key');
  assert(Array.isArray(backup.preferences.quickconverter_managed_novels), 'preserves non-string chrome values');
  console.log('✓ exportAll: whole library with API keys stripped');

  await StorageService.importAll({ format: 'quickconverter-backup', version: 1, novels: [], chapters: [], preferences: {} }, { replace: true });
  assert.strictEqual((await StorageService.exportAll()).novels.length, 0, 'replace clears local novels');

  const result = await StorageService.importAll(backup, { replace: true });
  assert.strictEqual(result.novels, 2);
  assert.strictEqual(result.chapters, 2);
  assert.strictEqual((await StorageService.exportAll()).novels.length, 2, 'restores novels');
  assert.strictEqual((await StorageService.exportAll()).chapters.length, 2, 'restores chapters');
  assert(Array.isArray(testEnv.chrome.storage.local.data.quickconverter_managed_novels), 'restores non-string chrome values without stringifying');
  assert.strictEqual(testEnv.chrome.storage.local.data.quickconverter_ai_provider, 'custom', 'restores chrome-only provider setting');
  console.log('✓ importAll: replace restores the full library');

  const leaky = { ...backup, preferences: { ...backup.preferences, quickconverter_deepseek_key: 'LEAKED' } };
  await StorageService.importAll(leaky, { replace: true });
  assert.strictEqual(mockLocalStorage.getItem('quickconverter_deepseek_key'), 'SECRET_KEY', 'never overwrites/restores an API key from a backup');
  assert.strictEqual(mockLocalStorage.getItem('quickconverter_deepseek_model'), 'deepseek-reasoner', 'restores normal prefs');
  console.log('✓ importAll: refuses to restore API keys from remote payload');

  let threw = false;
  try {
    await StorageService.importAll({ format: 'nope', version: 1 }, { replace: true });
  } catch (e) {
    threw = true;
  }
  assert.strictEqual(threw, true, 'rejects unknown format');
  console.log('✓ importAll: rejects unsupported backup format');

  console.log('🎉 Cloud Backup Export / Import Test Suite: ALL TESTS PASSED!');
})().catch((err) => {
  console.error('✗ Backup test failed:', err.message);
  process.exit(1);
});
