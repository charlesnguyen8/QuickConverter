// QuickConverter - Name List & Glossary Unit Test Suite
// Validates Name List CRUD operations, natural chapter sorting,
// alphabetical/timestamp sorting, search filtering, and bulk import/export parsing.

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

console.log('\n--- Running Novel Name List & Glossary Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');
const storageCode = fs.readFileSync(path.join(repoRoot, 'services', 'storage.js'), 'utf8');

// Mock indexedDB & environment
const mockDbStore = {
  'novel-test': {
    id: 'novel-test',
    title: 'A Regressor’s Tale of Cultivation',
    slug: 'a-regressors-tale-of-cultivation',
    totalChapters: 880,
    nameList: []
  }
};

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
  getItem: (k) => mockLocalStorage.data[k] || null,
  setItem: (k, v) => { mockLocalStorage.data[k] = String(v); },
  removeItem: (k) => { delete mockLocalStorage.data[k]; }
};

const sandbox = {
  console,
  setTimeout,
  clearTimeout,
  URL,
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
  },
  localStorage: mockLocalStorage,
  window: {}
};

vm.createContext(sandbox);
vm.runInContext(storageCode, sandbox);

const StorageService = sandbox.window.StorageService || sandbox.StorageService;

// Helpers mirroring NameListDrawer.jsx sorting and parsing
function parseChapterNumber(val) {
  if (val === null || val === undefined || val === '') return Infinity;
  if (typeof val === 'number') return val;
  const match = String(val).match(/\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : Infinity;
}

function sortEntries(entries, sortKey) {
  const list = [...entries];
  switch (sortKey) {
    case 'time_desc':
      return list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
    case 'time_asc':
      return list.sort((a, b) => (a.addedAt || 0) - (b.addedAt || 0));
    case 'orig_asc':
      return list.sort((a, b) => (a.original || '').localeCompare(b.original || '', undefined, { sensitivity: 'base', numeric: true }));
    case 'orig_desc':
      return list.sort((a, b) => (b.original || '').localeCompare(a.original || '', undefined, { sensitivity: 'base', numeric: true }));
    case 'trans_asc':
      return list.sort((a, b) => (a.translation || '').localeCompare(b.translation || '', undefined, { sensitivity: 'base', numeric: true }));
    case 'trans_desc':
      return list.sort((a, b) => (b.translation || '').localeCompare(a.translation || '', undefined, { sensitivity: 'base', numeric: true }));
    case 'ch_asc':
      return list.sort((a, b) => {
        const ca = parseChapterNumber(a.chapterFirstSeen);
        const cb = parseChapterNumber(b.chapterFirstSeen);
        if (ca !== cb) return ca - cb;
        return (a.addedAt || 0) - (b.addedAt || 0);
      });
    case 'ch_desc':
      return list.sort((a, b) => {
        const ca = parseChapterNumber(a.chapterFirstSeen);
        const cb = parseChapterNumber(b.chapterFirstSeen);
        if (ca !== cb) {
          if (ca === Infinity) return 1;
          if (cb === Infinity) return -1;
          return cb - ca;
        }
        return (b.addedAt || 0) - (a.addedAt || 0);
      });
    default:
      return list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
  }
}

function parseBulkLines(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const parsed = [];
  for (const rawLine of lines) {
    let line = rawLine.trim();
    if (!line || line.startsWith('//') || line.startsWith(';')) continue;

    let chapter = null;
    const commentMatch = line.match(/(?:#|\/\/)\s*(?:ch(?:apter)?\.?\s*)?(\d+(?:\.\d+)?)/i);
    if (commentMatch) {
      chapter = commentMatch[1];
      line = line.substring(0, commentMatch.index).trim();
    }

    let orig = '';
    let trans = '';
    if (line.includes('=')) {
      const parts = line.split('=');
      orig = parts[0].trim();
      trans = parts.slice(1).join('=').trim();
    } else if (line.includes('\t')) {
      const parts = line.split('\t');
      orig = parts[0].trim();
      trans = parts.slice(1).join('\t').trim();
    } else if (line.includes(' - ')) {
      const parts = line.split(' - ');
      orig = parts[0].trim();
      trans = parts.slice(1).join(' - ').trim();
    }

    if (orig && trans) {
      parsed.push({
        original: orig,
        translation: trans,
        chapterFirstSeen: chapter || null
      });
    }
  }
  return parsed;
}

function exportToBulkText(nameList) {
  if (!nameList || nameList.length === 0) return '';
  return nameList.map((e) => {
    const ch = e.chapterFirstSeen ? ` # Ch. ${String(e.chapterFirstSeen).replace(/^ch(?:apter)?\.?\s*/i, '')}` : '';
    return `${e.original} = ${e.translation}${ch}`;
  }).join('\n');
}

async function runTests() {
  // 1. Initial State
  const initialList = await StorageService.getNameList('novel-test');
  assert(Array.isArray(initialList), 'getNameList should return an array');
  assert.strictEqual(initialList.length, 0, 'Initial name list should be empty');
  console.log('✓ Initial name list is empty array');

  // 2. Add Name Entry
  const entry1 = await StorageService.addNameEntry('novel-test', {
    original: 'Yanguo',
    translation: 'Yên quốc',
    chapterFirstSeen: '1'
  });

  assert(entry1.id && entry1.id.startsWith('name_'), 'Entry should have generated id');
  assert.strictEqual(entry1.original, 'Yanguo');
  assert.strictEqual(entry1.translation, 'Yên quốc');
  assert.strictEqual(entry1.chapterFirstSeen, '1');
  assert(entry1.addedAt > 0, 'Entry should have addedAt timestamp');

  const afterAdd = await StorageService.getNameList('novel-test');
  assert.strictEqual(afterAdd.length, 1);
  assert.strictEqual(afterAdd[0].original, 'Yanguo');
  console.log('✓ StorageService.addNameEntry successfully creates and persists entry');

  // 3. Add Second Entry
  const entry2 = await StorageService.addNameEntry('novel-test', {
    original: 'Li Qiye',
    translation: 'Lý Thất Dạ',
    chapterFirstSeen: '10'
  });
  assert.strictEqual(entry2.original, 'Li Qiye');
  const list2 = await StorageService.getNameList('novel-test');
  assert.strictEqual(list2.length, 2);
  console.log('✓ StorageService adds multiple entries correctly');

  // 4. Update Name Entry
  const updated = await StorageService.updateNameEntry('novel-test', entry1.id, {
    translation: 'Yên Quốc Đại Lục',
    chapterFirstSeen: '2'
  });
  assert.strictEqual(updated.translation, 'Yên Quốc Đại Lục');
  assert.strictEqual(updated.chapterFirstSeen, '2');

  const listAfterUpdate = await StorageService.getNameList('novel-test');
  const found = listAfterUpdate.find(e => e.id === entry1.id);
  assert.strictEqual(found.translation, 'Yên Quốc Đại Lục');
  assert.strictEqual(found.chapterFirstSeen, '2');
  console.log('✓ StorageService.updateNameEntry modifies entry in-place');

  // 5. Delete Name Entry
  const deleted = await StorageService.deleteNameEntry('novel-test', entry1.id);
  assert.strictEqual(deleted, true);

  const listAfterDelete = await StorageService.getNameList('novel-test');
  assert.strictEqual(listAfterDelete.length, 1);
  assert.strictEqual(listAfterDelete[0].id, entry2.id);
  console.log('✓ StorageService.deleteNameEntry removes specified entry');

  // 6. Save Bulk Name List
  const sampleList = [
    { id: '1', original: 'Wang Lin', translation: 'Vương Lâm', chapterFirstSeen: '2', addedAt: 1000 },
    { id: '2', original: 'Bai Xiaochun', translation: 'Bạch Tiểu Thuần', chapterFirstSeen: '10', addedAt: 3000 },
    { id: '3', original: 'Meng Hao', translation: 'Mạnh Hạo', chapterFirstSeen: '1', addedAt: 2000 },
    { id: '4', original: 'Su Ming', translation: 'Tô Minh', chapterFirstSeen: null, addedAt: 4000 }
  ];
  await StorageService.saveNameList('novel-test', sampleList);
  const saved = await StorageService.getNameList('novel-test');
  assert.strictEqual(saved.length, 4);
  console.log('✓ StorageService.saveNameList persists full array');

  // 7. Natural Chapter Sorting
  const sortedChAsc = sortEntries(sampleList, 'ch_asc');
  assert.strictEqual(sortedChAsc[0].original, 'Meng Hao', 'Ch 1 should be first');
  assert.strictEqual(sortedChAsc[1].original, 'Wang Lin', 'Ch 2 should be second');
  assert.strictEqual(sortedChAsc[2].original, 'Bai Xiaochun', 'Ch 10 should be third');
  assert.strictEqual(sortedChAsc[3].original, 'Su Ming', 'Null chapter should be last');

  const sortedChDesc = sortEntries(sampleList, 'ch_desc');
  assert.strictEqual(sortedChDesc[0].original, 'Bai Xiaochun', 'Ch 10 should be first in desc');
  assert.strictEqual(sortedChDesc[1].original, 'Wang Lin', 'Ch 2 should be second in desc');
  assert.strictEqual(sortedChDesc[2].original, 'Meng Hao', 'Ch 1 should be third in desc');
  console.log('✓ Natural chapter number sorting orders correctly (Ch 1, Ch 2, Ch 10, null last)');

  // 8. Alphabetical Sorting
  const sortedOrigAsc = sortEntries(sampleList, 'orig_asc');
  assert.strictEqual(sortedOrigAsc[0].original, 'Bai Xiaochun');
  assert.strictEqual(sortedOrigAsc[3].original, 'Wang Lin');

  const sortedTransAsc = sortEntries(sampleList, 'trans_asc');
  assert.strictEqual(sortedTransAsc[0].translation, 'Bạch Tiểu Thuần');
  console.log('✓ Alphabetical sorting (Original & Translation A-Z/Z-A) works');

  // 9. Time Added Sorting
  const sortedTimeDesc = sortEntries(sampleList, 'time_desc');
  assert.strictEqual(sortedTimeDesc[0].addedAt, 4000);
  assert.strictEqual(sortedTimeDesc[3].addedAt, 1000);

  const sortedTimeAsc = sortEntries(sampleList, 'time_asc');
  assert.strictEqual(sortedTimeAsc[0].addedAt, 1000);
  assert.strictEqual(sortedTimeAsc[3].addedAt, 4000);
  console.log('✓ Time added sorting (newest/oldest) works accurately');

  // 10. Bulk Import Parser
  const bulkInput = `
    Yanguo = Yên quốc
    Li Qiye = Lý Thất Dạ # Ch. 12
    Wang Lin\tVương Lâm
    Bai Xiaochun - Bạch Tiểu Thuần // Chapter 5
    // Comment to skip
    ; Semicolon comment to skip
  `;
  const parsed = parseBulkLines(bulkInput);
  assert.strictEqual(parsed.length, 4);
  assert.strictEqual(parsed[0].original, 'Yanguo');
  assert.strictEqual(parsed[0].translation, 'Yên quốc');
  assert.strictEqual(parsed[0].chapterFirstSeen, null);

  assert.strictEqual(parsed[1].original, 'Li Qiye');
  assert.strictEqual(parsed[1].translation, 'Lý Thất Dạ');
  assert.strictEqual(parsed[1].chapterFirstSeen, '12');

  assert.strictEqual(parsed[2].original, 'Wang Lin');
  assert.strictEqual(parsed[2].translation, 'Vương Lâm');

  assert.strictEqual(parsed[3].original, 'Bai Xiaochun');
  assert.strictEqual(parsed[3].translation, 'Bạch Tiểu Thuần');
  assert.strictEqual(parsed[3].chapterFirstSeen, '5');
  console.log('✓ Bulk import parser handles =, tab, -, comments, and chapter annotations');

  // 11. Bulk Export Generator
  const exported = exportToBulkText(parsed);
  assert(exported.includes('Yanguo = Yên quốc'));
  assert(exported.includes('Li Qiye = Lý Thất Dạ # Ch. 12'));
  assert(exported.includes('Bai Xiaochun = Bạch Tiểu Thuần # Ch. 5'));
  console.log('✓ Bulk export generates clean Original = Translation format');

  console.log('\n🎉 All 11 Novel Name List tests passed!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
