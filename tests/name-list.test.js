// QuickConverter - Name List & Glossary Unit Test Suite
// Validates Name List CRUD operations, natural chapter sorting,
// alphabetical/timestamp sorting, search filtering, and bulk import/export parsing.

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const vm = require('vm');

console.log('\n--- Running Novel Name List & Glossary Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');
const storageCode = fs.readFileSync(path.join(repoRoot, 'src', 'services', 'storage.js'), 'utf8');
const nameMatcherCode = fs.readFileSync(path.join(repoRoot, 'src', 'services', 'name-matcher.js'), 'utf8');

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
        },
        index: () => ({
          getAll: (novelId) => {
            const req = {
              result: Object.values(mockDbStore).filter((r) => r && r.novelId === novelId),
              onsuccess: null,
              onerror: null
            };
            setTimeout(() => {
              if (req.onsuccess) req.onsuccess();
            }, 0);
            return req;
          }
        })
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
  IDBKeyRange: { only: (value) => value },
  window: {
    _events: [],
    dispatchEvent: function (e) { this._events.push(e); }
  },
  CustomEvent: class {
    constructor(type, init) {
      this.type = type;
      this.detail = init && init.detail;
    }
  }
};

vm.createContext(sandbox);
vm.runInContext(nameMatcherCode, sandbox);
vm.runInContext(fs.readFileSync(path.join(repoRoot, 'src', 'services', 'longest-matcher.js'), 'utf8'), sandbox);
vm.runInContext(fs.readFileSync(path.join(repoRoot, 'src', 'services', 'text-processors.js'), 'utf8'), sandbox);
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

  // 12. Auto-detected name list block parsing
  const withBlock = 'Chapter text line one.\n\n<<<NAME_LIST_START>>>\nYanguo=Yên quốc|Li Qiye=Lý Thất Dạ\n<<<NAME_LIST_END>>>\n';
  const parsedBlock = StorageService.parseNameListBlock(withBlock);
  assert.strictEqual(parsedBlock.names.length, 2);
  assert.strictEqual(parsedBlock.names[0].original, 'Yanguo');
  assert.strictEqual(parsedBlock.names[0].translation, 'Yên quốc');
  assert.strictEqual(parsedBlock.names[1].original, 'Li Qiye');
  assert(!parsedBlock.text.includes('NAME_LIST'), 'block markers must be stripped from the chapter');
  assert(parsedBlock.text.includes('Chapter text line one.'), 'chapter text must be preserved');

  const noBlock = StorageService.parseNameListBlock('Just a normal chapter.');
  assert.strictEqual(noBlock.names.length, 0);
  assert.strictEqual(noBlock.text, 'Just a normal chapter.');

  const nlBlock = StorageService.parseNameListBlock('<<<NAME_LIST_START>>>A=a1\nB=b1\n<<<NAME_LIST_END>>>');
  assert.strictEqual(nlBlock.names.length, 2, 'newline-separated entries must parse');
  console.log('✓ Auto-detected name list block is parsed and stripped');

  // 13. addNameEntries skips duplicates (case-insensitive) and batch duplicates
  await StorageService.saveNameList('novel-test', [{ id: 'x1', original: 'Yanguo', translation: 'Yên quốc', chapterFirstSeen: 1, addedAt: 1 }]);
  const addedEntries = await StorageService.addNameEntries('novel-test', [
    { original: 'yanguo', translation: 'SHOULD NOT OVERWRITE' },
    { original: 'Li Qiye', translation: 'Lý Thất Dạ' },
    { original: 'li qiye', translation: 'SHOULD BE DEDUPED' }
  ], 7);
  assert.strictEqual(addedEntries.length, 1, 'only the genuinely new name is added');
  assert.strictEqual(addedEntries[0].original, 'Li Qiye');
  assert.strictEqual(addedEntries[0].chapterFirstSeen, 7);
  assert.strictEqual(addedEntries[0].isNew, true, 'auto-captured names are flagged new');
  const nameListEvents = sandbox.window._events.filter((e) => e.type === 'novel-name-list-updated');
  assert.strictEqual(nameListEvents.length, 1, 'must emit novel-name-list-updated once');
  assert.strictEqual(nameListEvents[0].detail.count, 2, 'event carries the new total count');
  const afterAuto = await StorageService.getNameList('novel-test');
  assert.strictEqual(afterAuto.length, 2);
  assert.strictEqual(afterAuto.find((e) => e.original.toLowerCase() === 'yanguo').translation, 'Yên quốc', 'existing translation must be untouched');
  console.log('✓ addNameEntries skips existing names and batch duplicates');

  // 14. replaceInChapters (whole-word, case-sensitive, translated text only)
  mockDbStore['novel-test_ch1'] = { id: 'novel-test_ch1', novelId: 'novel-test', chapterNumber: 1, title: 'Ch 1', rawText: 'Lý Thất Dạ met Lý Thất Dạ, friend of Lý Thất Dạx.', originalRawText: 'SOURCE Lý Thất Dạ' };
  mockDbStore['novel-test_ch2'] = { id: 'novel-test_ch2', novelId: 'novel-test', chapterNumber: 2, title: 'Ch 2', rawText: 'lý thất dạ and LýThấtDạ', originalRawText: 'src' };

  const dry = await StorageService.replaceInChapters('novel-test', 'Lý Thất Dạ', 'Lý Tinh', { dryRun: true });
  assert.strictEqual(dry.count, 2, 'dry run counts only whole-word matches');
  assert.strictEqual(dry.chaptersChanged, 1);

  const applied = await StorageService.replaceInChapters('novel-test', 'Lý Thất Dạ', 'Lý Tinh');
  assert.strictEqual(applied.count, 2);

  const replacedCh1 = await StorageService.getChapter('novel-test', 1);
  assert.strictEqual(replacedCh1.rawText, 'Lý Tinh met Lý Tinh, friend of Lý Thất Dạx.');
  assert.strictEqual(replacedCh1.originalRawText, 'SOURCE Lý Thất Dạ', 'source text must be untouched');

  const replacedCh2 = await StorageService.getChapter('novel-test', 2);
  assert.strictEqual(replacedCh2.rawText, 'lý thất dạ and LýThấtDạ', 'case-sensitive + word-boundary guards apply');
  console.log('✓ replaceInChapters renames whole-word matches in translated text only');

  // 15. tokenizeSource (translation pre-processing)
  const tok = StorageService.tokenizeSource('Li Qiye met Wang Lin. Wang Lin knew Li Qiye.', [
    { original: 'Wang Lin', translation: 'Vương Lâm' }, { original: 'Li Qiye', translation: 'Lý Thất Dạ' }
  ]);
  assert.strictEqual(tok.mapping.length, 2);
  assert.strictEqual(tok.mapping[0].token, '@1@');
  assert.strictEqual(tok.mapping[0].original, 'Li Qiye', 'numbered by first appearance');
  assert.strictEqual(tok.mapping[1].token, '@2@');
  assert.strictEqual(tok.text, '@1@ met @2@. @2@ knew @1@.');

  const whole = StorageService.tokenizeSource('Ling and Lin met.', [{ original: 'Li', translation: 'Li' }, { original: 'Lin', translation: 'Lin' }]);
  assert.strictEqual(whole.mapping.length, 1, 'only whole-word matches tokenize');
  assert.strictEqual(whole.mapping[0].original, 'Lin');
  assert.strictEqual(StorageService.tokenizeSource('wang lin', [{ original: 'Wang Lin', translation: 'Vương Lâm' }]).mapping.length, 0, 'case-sensitive');

  const manyNames = Array.from({ length: 11 }, (_, i) => {
    const name = 'N' + String.fromCharCode(97 + i);
    return { original: name, translation: name };
  });
  const tokMany = StorageService.tokenizeSource(manyNames.map((n) => n.original).join(' '), manyNames);
  assert.strictEqual(tokMany.mapping[9].token, '@a@', '10th token is base36 a');
  assert.strictEqual(tokMany.mapping[10].token, '@b@', '11th token is base36 b');
  console.log('✓ tokenizeSource rewrites source names to ordered base36 @n@ tokens');

  // 16. restoreTokens (translation post-processing)
  const rmap = StorageService.tokenizeSource('Li Qiye met Wang Lin.', [
    { original: 'Li Qiye', translation: 'Lý Thất Dạ' },
    { original: 'Wang Lin', translation: 'Vương Lâm' }
  ]).mapping;
  assert.strictEqual(rmap[0].translation, 'Lý Thất Dạ', 'mapping carries the translated name');

  const restored = StorageService.restoreTokens('@1@ met @2@ and @ 1 @ and @9@.', rmap);
  assert.strictEqual(restored, 'Lý Thất Dạ met Vương Lâm and Lý Thất Dạ and @9@.', 'unknown tokens stay, spaces tolerated');
  assert.strictEqual(
    StorageService.restoreTokens('@A@', [{ token: '@a@', original: 'X', translation: 'Ex' }]),
    'Ex',
    'case-insensitive token match'
  );
  console.log('✓ restoreTokens swaps @n@ back to translated names (case-insensitive, spaces tolerated)');

  // 17. saveNameList collapses duplicate source names (oldest wins)
  await StorageService.saveNameList('novel-test', [
    { id: 'd1', original: 'Yanguo', translation: 'Newer', addedAt: 200 },
    { id: 'd2', original: 'yanguo', translation: 'Older', addedAt: 100 },
    { id: 'd3', original: 'Other', translation: 'X', addedAt: 50 }
  ]);
  const deduped = await StorageService.getNameList('novel-test');
  assert.strictEqual(deduped.length, 2, 'duplicate source names collapse to one');
  assert.strictEqual(deduped.find((e) => e.original.toLowerCase() === 'yanguo').translation, 'Older', 'oldest translation wins');
  console.log('✓ saveNameList merges duplicate names, keeping the oldest');

  // 18. tokenizeSource must not tokenize names with an empty translation
  const emptyTok = StorageService.tokenizeSource('Yanguo met Li Qiye.', [
    { id: 'e1', original: 'Yanguo', translation: '' },
    { id: 'e2', original: 'Li Qiye', translation: 'Lý Thất Dạ' }
  ]);
  assert.strictEqual(emptyTok.mapping.length, 1, 'only names with a translation are tokenized');
  assert.strictEqual(emptyTok.mapping[0].original, 'Li Qiye');
  assert.strictEqual(emptyTok.text, 'Yanguo met @1@.', 'blank-translation name is left untouched');
  assert.strictEqual(StorageService.restoreTokens(emptyTok.text, emptyTok.mapping), 'Yanguo met Lý Thất Dạ.', 'no token leaks');
  console.log('✓ tokenizeSource skips names with an empty translation');

  // 19. Name lists live in their own record, not inline on the novel
  await StorageService.saveNameList('novel-test', [{ id: 'p1', original: 'Aaa', translation: 'Bbb', addedAt: 1 }]);
  const rawNovel = mockDbStore['novel-test'];
  assert(!rawNovel || !('nameList' in rawNovel) || (Array.isArray(rawNovel.nameList) && rawNovel.nameList.length === 0), 'novel record must not carry the list');
  const listRecord = mockDbStore['namelist::novel-test'];
  assert(listRecord && Array.isArray(listRecord.list) && listRecord.list.length === 1, 'list stored in its own record');
  assert.strictEqual((await StorageService.getNameList('novel-test')).length, 1);
  assert.strictEqual((await StorageService.getNovelById('novel-test')).nameList.length, 1, 'getNovelById attaches the list');
  console.log('✓ name lists are stored per-novel, not inline on the novel record');

  // 20. Legacy inline lists are migrated to their own record on first read
  mockDbStore['novel-legacy'] = {
    id: 'novel-legacy', title: 'Legacy', slug: 'legacy', url: '', domain: 'x.com', totalChapters: 3, chapterList: [],
    nameList: [{ id: 'l1', original: 'Old', translation: 'New', addedAt: 1 }]
  };
  const migratedNovel = await StorageService.getNovelById('novel-legacy');
  assert.strictEqual(migratedNovel.nameList.length, 1, 'legacy list is returned');
  assert.strictEqual(migratedNovel.nameList[0].original, 'Old');
  assert(!('nameList' in mockDbStore['novel-legacy']), 'inline list stripped after migration');
  const migratedRecord = mockDbStore['namelist::novel-legacy'];
  assert(migratedRecord && migratedRecord.list.length === 1, 'legacy list moved to its own record');
  console.log('✓ legacy inline name lists migrate to their own record');

  // 21. updateNovel must not re-embed a legacy inline list
  mockDbStore['novel-sync'] = {
    id: 'novel-sync', title: 'Sync', slug: 'sync', url: '', domain: 'x.com', totalChapters: 3, chapterList: [],
    nameList: [{ id: 's1', original: 'Aa', translation: 'Bb', addedAt: 1 }]
  };
  await StorageService.updateNovel('novel-sync', { totalChapters: 42 });
  assert.strictEqual(mockDbStore['novel-sync'].totalChapters, 42);
  assert(!('nameList' in mockDbStore['novel-sync']), 'updateNovel must not keep the legacy inline list');
  const syncRecord = mockDbStore['namelist::novel-sync'];
  assert(syncRecord && syncRecord.list.length === 1, 'legacy list flushed to its own record first');
  console.log('✓ updateNovel flushes a legacy inline list instead of re-embedding it');

  // 22. Extra glossary kinds (locked / soft) share the list contract but stay isolated
  await StorageService.addNameEntry('novel-test', { original: 'Sect', translation: 'Tông môn' }, 'locked');
  await StorageService.addNameEntry('novel-test', { original: 'Elder', translation: 'Trưởng lão' }, 'soft');
  const locked = await StorageService.getNameList('novel-test', 'locked');
  const soft = await StorageService.getNameList('novel-test', 'soft');
  assert.strictEqual(locked.length, 1, 'locked glossary stores its own entry');
  assert.strictEqual(locked[0].translation, 'Tông môn');
  assert.strictEqual(soft.length, 1, 'soft glossary stores its own entry');
  assert.strictEqual(soft[0].translation, 'Trưởng lão');
  assert(mockDbStore['locked::novel-test'] && mockDbStore['locked::novel-test'].list.length === 1, 'locked list lives in its own record');
  assert(mockDbStore['soft::novel-test'] && mockDbStore['soft::novel-test'].list.length === 1, 'soft list lives in its own record');
  assert.strictEqual((await StorageService.getNameList('novel-test')).length, 1, 'name list is independent of glossaries');

  const lockedId = locked[0].id;
  await StorageService.updateNameEntry('novel-test', lockedId, { translation: 'Tông Môn' }, 'locked');
  assert.strictEqual((await StorageService.getNameList('novel-test', 'locked'))[0].translation, 'Tông Môn');
  await StorageService.deleteNameEntry('novel-test', lockedId, 'locked');
  assert.strictEqual((await StorageService.getNameList('novel-test', 'locked')).length, 0);
  assert.strictEqual((await StorageService.getNameList('novel-test', 'soft')).length, 1, 'deleting from locked must not touch soft');
  console.log('✓ locked/soft glossary kinds are isolated per novel and per kind');

  // 23. parseGlossaryBlocks strips/returns NAME_LIST, LOCKED_GLOSSARY and SOFT_GLOSSARY
  const annotated = [
    'The chapter body.',
    '<<<NAME_LIST_START>>>Yanguo=Yên quốc<<<NAME_LIST_END>>>',
    '<<<LOCKED_GLOSSARY_START>>>Qi=Prana|Dao=Đạo<<<LOCKED_GLOSSARY_END>>>',
    '<<<SOFT_GLOSSARY_START>>>Elder=Trưởng lão<<<SOFT_GLOSSARY_END>>>'
  ].join('\n');
  const blocks = StorageService.parseGlossaryBlocks(annotated);
  assert.strictEqual(blocks.names.length, 1, 'name list block parsed');
  assert.strictEqual(blocks.names[0].original, 'Yanguo');
  assert.strictEqual(blocks.locked.length, 2, 'locked glossary block parsed');
  assert.strictEqual(blocks.locked[1].translation, 'Đạo');
  assert.strictEqual(blocks.soft.length, 1, 'soft glossary block parsed');
  assert.strictEqual(blocks.soft[0].translation, 'Trưởng lão');
  assert(!/GLOSSARY|NAME_LIST/.test(blocks.text), 'all annotation markers stripped from chapter text');
  assert(blocks.text.includes('The chapter body.'), 'chapter body preserved');

  const noBlocks = StorageService.parseGlossaryBlocks('Just text.');
  assert.strictEqual(noBlocks.locked.length, 0);
  assert.strictEqual(noBlocks.soft.length, 0);
  assert.strictEqual(noBlocks.text, 'Just text.');
  console.log('✓ parseGlossaryBlocks strips NAME_LIST, LOCKED_GLOSSARY and SOFT_GLOSSARY blocks');

  // 24. addNameEntries routes auto-detected glossary entries to the requested kind
  const addedLocked = await StorageService.addNameEntries('novel-test', [{ original: 'Dao', translation: 'Đạo' }], 3, 'locked');
  assert.strictEqual(addedLocked.length, 1);
  assert(addedLocked[0].isNew === true, 'auto-captured glossary entries are flagged new');
  const autoLocked = await StorageService.getNameList('novel-test', 'locked');
  assert.strictEqual(autoLocked.length, 1, 'auto-detected locked entry persisted');
  assert.strictEqual(autoLocked[0].chapterFirstSeen, 3, 'auto-detected entry keeps its chapter');
  console.log('✓ addNameEntries auto-populates the locked/soft glossaries');

  // 25. moveNameEntry promotes a soft term to locked without duplicating an existing entry
  await StorageService.saveNameList('novel-test', [{ id: 's1', original: 'Elder', translation: 'Trưởng lão', addedAt: 5 }], 'soft');
  await StorageService.saveNameList('novel-test', [{ id: 'l1', original: 'Elder', translation: 'Old', addedAt: 1 }], 'locked');
  const movedDup = await StorageService.moveNameEntry('novel-test', 's1', 'soft', 'locked');
  assert.strictEqual(movedDup.id, 'l1', 'existing locked entry is reused, not duplicated');
  assert.strictEqual((await StorageService.getNameList('novel-test', 'locked')).length, 1, 'locked keeps a single entry');
  assert.strictEqual((await StorageService.getNameList('novel-test', 'soft')).length, 0, 'moved term is removed from soft');

  await StorageService.saveNameList('novel-test', [{ id: 's2', original: 'Qi', translation: 'Prana', addedAt: 9 }], 'soft');
  const movedNew = await StorageService.moveNameEntry('novel-test', 's2', 'soft', 'locked');
  assert.strictEqual(movedNew.original, 'Qi');
  assert.strictEqual(movedNew.translation, 'Prana');
  const lockedAfterMove = await StorageService.getNameList('novel-test', 'locked');
  assert(lockedAfterMove.some((e) => e.original === 'Qi'), 'new term lands in the locked glossary');
  assert.strictEqual((await StorageService.getNameList('novel-test', 'soft')).length, 0, 'soft glossary emptied by the move');
  assert.strictEqual(await StorageService.moveNameEntry('novel-test', 'missing', 'soft', 'locked'), null, 'missing entry returns null');
  console.log('✓ moveNameEntry promotes soft terms into the locked glossary');

  // 26. applyLockedGlossary: deterministic §...§ preprocessing of the source text
  const lockedTerms = [
    { original: 'cultivator', translation: 'tu sĩ' },
    { original: 'high-level cultivator', translation: 'tu sĩ cấp cao' },
    { original: 'Qi', translation: 'khí' }
  ];

  // normal + multi-word + repeated
  assert.strictEqual(
    StorageService.applyLockedGlossary('The first-rate cultivator examined his spiritual root.', [
      { original: 'first-rate', translation: 'nhất lưu' },
      { original: 'cultivator', translation: 'tu sĩ' },
      { original: 'spiritual root', translation: 'linh căn' }
    ]),
    'The §nhất lưu§ §tu sĩ§ examined his §linh căn§.',
    'normal and multi-word terms are wrapped'
  );
  assert.strictEqual(
    StorageService.applyLockedGlossary('A cultivator can sense Qi. Every cultivator knows.', lockedTerms),
    'A §tu sĩ§ can sense §khí§. Every §tu sĩ§ knows.',
    'every occurrence is replaced'
  );

  // overlapping terms: longest match wins
  assert.strictEqual(
    StorageService.applyLockedGlossary('A high-level cultivator and a cultivator.', lockedTerms),
    'A §tu sĩ cấp cao§ and a §tu sĩ§.',
    'longer overlapping term wins'
  );

  // case-insensitive while preserving the canonical Vietnamese value
  assert.strictEqual(
    StorageService.applyLockedGlossary('CULTIVATOR and qi', lockedTerms),
    '§tu sĩ§ and §khí§',
    'matching is case-insensitive'
  );

  // partial-word protection
  assert.strictEqual(
    StorageService.applyLockedGlossary('martial art', [{ original: 'art', translation: 'nghệ thuật' }]),
    'martial §nghệ thuật§',
    'whole-word term replaced beside a partial-word lookalike'
  );
  assert.strictEqual(
    StorageService.applyLockedGlossary('martial', [{ original: 'art', translation: 'nghệ thuật' }]),
    'martial',
    'partial-word lookalike is left untouched'
  );
  assert.strictEqual(
    StorageService.applyLockedGlossary('cultivators', lockedTerms),
    'cultivators',
    'whole-word matching does not invent plurals'
  );

  // existing @n@ placeholders and §...§ spans are never touched or double-wrapped
  assert.strictEqual(
    StorageService.applyLockedGlossary('The @1@ cultivator met @a@.', lockedTerms),
    'The @1@ §tu sĩ§ met @a@.',
    'name placeholders are preserved'
  );
  assert.strictEqual(
    StorageService.applyLockedGlossary('§tu sĩ§ cultivator', lockedTerms),
    '§tu sĩ§ §tu sĩ§',
    'existing §...§ text is not reprocessed'
  );
  assert.strictEqual(
    StorageService.applyLockedGlossary('§cultivator§', lockedTerms),
    '§cultivator§',
    'locked terms are never double-wrapped'
  );

  // no match stays byte-for-byte identical
  assert.strictEqual(
    StorageService.applyLockedGlossary('Nothing to see here.', lockedTerms),
    'Nothing to see here.',
    'unmatched input is unchanged'
  );

  // stripLockedMarkers removes the § signal before saving translated text
  assert.strictEqual(
    StorageService.stripLockedMarkers('The §nhất lưu§ §tu sĩ§ examined §linh căn§.'),
    'The nhất lưu tu sĩ examined linh căn.',
    '§ markers are stripped from the saved chapter'
  );
  assert.strictEqual(StorageService.stripLockedMarkers('plain text'), 'plain text');
  console.log('✓ applyLockedGlossary wraps whole-word locked terms and stripLockedMarkers unwraps them');

  // 27. parseGlossaryBlocks extracts and strips the <<<DELAY>>>Ns<<<DELAY>>> block
  const withDelay = StorageService.parseGlossaryBlocks('Body text.\n<<<DELAY>>>115s<<<DELAY>>>');
  assert.strictEqual(withDelay.delaySeconds, 115, 'integer seconds parsed from the DELAY marker');
  assert.strictEqual(withDelay.text, 'Body text.');
  assert(!withDelay.text.includes('DELAY'), 'DELAY marker stripped from the chapter text');
  assert.strictEqual(StorageService.parseGlossaryBlocks('No marker.').delaySeconds, 0, 'absent marker means no forced delay');
  assert.strictEqual(StorageService.parseGlossaryBlocks('<<<DELAY>>>115<<<DELAY>>>').delaySeconds, 0, 'the trailing "s" is required');
  assert.strictEqual(StorageService.parseGlossaryBlocks('<<<DELAY>>>115s<<<DELAY>>>').text, '', 'marker-only text cleans to empty');

  const combined = 'Ch.\n<<<NAME_LIST_START>>>A=a<<<NAME_LIST_END>>>\n<<<DELAY>>>10s<<<DELAY>>>';
  const parsedCombined = StorageService.parseGlossaryBlocks(combined);
  assert.strictEqual(parsedCombined.names.length, 1, 'glossary blocks still parse');
  assert.strictEqual(parsedCombined.delaySeconds, 10, 'delay coexists with glossary blocks');
  assert.strictEqual(parsedCombined.text, 'Ch.');
  console.log('✓ parseGlossaryBlocks extracts and strips the DELAY marker');

  // 28. Glossary list records must never surface as managed novels in the library
  await StorageService.saveNameList('novel-test', [{ id: 'n1', original: 'A', translation: 'B', addedAt: 1 }], 'namelist');
  await StorageService.saveNameList('novel-test', [{ id: 'l1', original: 'C', translation: 'D', addedAt: 1 }], 'locked');
  await StorageService.saveNameList('novel-test', [{ id: 's1', original: 'E', translation: 'F', addedAt: 1 }], 'soft');
  const managedNovels = await StorageService.getManagedNovels();
  assert(
    !managedNovels.some((n) => String(n.id).startsWith('namelist::') || String(n.id).startsWith('locked::') || String(n.id).startsWith('soft::')),
    'list records must not be listed as novels'
  );
  assert(managedNovels.some((n) => n.id === 'novel-test'), 'the real novel is still listed');
  console.log('✓ glossary records are hidden from the managed novel list');

  // 29. parseTranslationBlock reads the manual-prompt result block
  const tr = StorageService.parseTranslationBlock('<<<TRANSLATION_START>>>Yanguo=Yên quốc|Li Qiye=Lý Thất Dạ<<<TRANSLATION_END>>>');
  assert.strictEqual(tr.length, 2, 'both pairs in the TRANSLATION block parsed');
  assert.strictEqual(tr[0].original, 'Yanguo');
  assert.strictEqual(tr[0].translation, 'Yên quốc');
  assert.strictEqual(tr[1].translation, 'Lý Thất Dạ');
  const bare = StorageService.parseTranslationBlock('A=1\nB=2');
  assert.strictEqual(bare.length, 2, 'falls back to the raw body when markers are absent');
  assert.strictEqual(StorageService.parseTranslationBlock('no pairs here').length, 0, 'garbage yields no pairs');
  console.log('✓ parseTranslationBlock reads the pasted TRANSLATION result');

  console.log('\n🎉 All 29 Novel Name List tests passed!');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
