const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('--- Running Reader & Storage Flow Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');
const storageCode = fs.readFileSync(path.join(repoRoot, 'services', 'storage.js'), 'utf8');

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
        }
      }),
      oncomplete: null,
      onerror: null
    };
    return tx;
  }
};

  const mockLocalStorage = {
    data: {},
    getItem(k) { return this.data[k] !== undefined ? this.data[k] : null; },
    setItem(k, v) { this.data[k] = String(v); },
    removeItem(k) { delete this.data[k]; }
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
          set(items) { Object.assign(this.data, items); }
        }
      }
    },
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

vm.createContext(testEnv);
vm.runInContext(storageCode, testEnv);
const StorageService = testEnv.StorageService || testEnv.window.StorageService;

async function runTests() {
  // Test 1: saveChapter
  const initialChapter = await StorageService.saveChapter({
    novelId: 'novel_cultivation',
    chapterNumber: 1,
    title: 'Chapter 1: The Mountain Gate',
    url: 'https://wetriedtls.com/series/cultivation/ch-1',
    rawText: 'This is the initial translated English text of chapter 1.',
    originalRawText: '第一章 山门之外，风雪交加。',
    isTranslated: true,
    modelUsed: 'deepseek-flash',
    translatedAt: 1726820000000
  });

  assert.strictEqual(initialChapter.id, 'novel_cultivation_ch1');
  assert.strictEqual(initialChapter.chapterNumber, 1);
  assert.strictEqual(initialChapter.title, 'Chapter 1: The Mountain Gate');
  assert.strictEqual(initialChapter.rawText, 'This is the initial translated English text of chapter 1.');
  assert.strictEqual(initialChapter.originalRawText, '第一章 山门之外，风雪交加。');
  assert.strictEqual(initialChapter.isTranslated, true);
  assert.strictEqual(initialChapter.modelUsed, 'deepseek-flash');
  console.log('✓ saveChapter: successfully preserved all metadata and raw text');

  // Test 2: updateChapter
  const editedChapter = await StorageService.updateChapter('novel_cultivation', 1, {
    title: 'Chapter 1: Beyond the Mountain Gate (Polished)',
    rawText: 'Beyond the mountain gate, wind and snow howled fiercely.\n\nHe stood firm amidst the biting frost.',
    isUserEdited: true,
    editedAt: Date.now()
  });

  assert.strictEqual(editedChapter.id, 'novel_cultivation_ch1');
  assert.strictEqual(editedChapter.title, 'Chapter 1: Beyond the Mountain Gate (Polished)');
  assert(editedChapter.rawText.includes('wind and snow howled fiercely'));
  assert.strictEqual(editedChapter.originalRawText, '第一章 山门之外，风雪交加。');
  assert.strictEqual(editedChapter.isTranslated, true);
  assert.strictEqual(editedChapter.isUserEdited, true);
  console.log('✓ updateChapter: successfully merged in-place edits and preserved source metadata');

  // Test 3: updateChapter error on missing chapter
  try {
    await StorageService.updateChapter('novel_cultivation', 9999, { rawText: 'No such chapter' });
    assert.fail('Expected updateChapter on missing chapter to throw');
  } catch (err) {
    assert(err.message.includes('not found'));
    console.log('✓ updateChapter: properly rejects non-existent chapter IDs');
  }

  // Test 4: Reader Text Parsing & Metrics Calculation
  const sampleEditedText = 'Paragraph 1: The cultivation path began.\n\nParagraph 2: With sword in hand, he stepped forward.';
  const paragraphs = sampleEditedText
    .split('\n\n')
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  assert.strictEqual(paragraphs.length, 2);
  const words = sampleEditedText.trim().split(/\s+/).length;
  assert.strictEqual(words, 15);
  const chars = sampleEditedText.length;
  assert.strictEqual(chars, 94);
  console.log('✓ Reader paragraph parsing and word/character metric calculations verified');

  // Test 5: StorageService Centralized Preference Storage
  assert.strictEqual(StorageService.getPreference('missing_key', 'default_val'), 'default_val');
  StorageService.setPreference('quickconverter_deepseek_model', 'deepseek-chat');
  assert.strictEqual(StorageService.getPreference('quickconverter_deepseek_model', 'fallback'), 'deepseek-chat');
  assert.strictEqual(testEnv.chrome.storage.local.data['quickconverter_deepseek_model'], 'deepseek-chat');
  console.log('✓ StorageService preference methods (getPreference, setPreference) verified');

  console.log('🎉 Reader & Storage Flow Test Suite: ALL TESTS PASSED!\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
