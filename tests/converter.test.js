const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadComponent } = require('./helpers/render');

console.log('\n--- Running Dictionary Converter Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(repoRoot, ...p), 'utf8');

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

function loadEnv(extra = {}) {
  const env = { console, URL, setTimeout, clearTimeout, ...extra };
  env.window = env;
  env.self = env;
  env.globalThis = env;
  vm.createContext(env);
  vm.runInContext(read('src', 'services', 'longest-matcher.js'), env);
  vm.runInContext(read('src', 'services', 'text-processors.js'), env);
  vm.runInContext(read('src', 'services', 'han-viet.js'), env);
  vm.runInContext(read('src', 'services', 'qt-dictionaries.js'), env);
  return env;
}

const HAN_VIET = new Map(Object.entries({
  林: 'lâm', 动: 'động', 走: 'tẩu', 进: 'tiến', 青: 'thanh', 阳: 'dương', 镇: 'trấn',
  笑: 'tiếu', 了: 'liễu', 他: 'tha', 说: 'thuyết', 大: 'đại', 萧: 'tiêu', 炎: 'viêm', 来: 'lai'
}));
const NAMES = [{ id: 'n1', original: '林动', translation: 'Lâm Động' }];
const LOCKED = [{ id: 'g1', original: '青阳镇', translation: 'Thanh Dương trấn' }];

(async () => {
  const env = loadEnv();
  const T = env.TextProcessors;
  const convert = (text, lists = {}) => T.createConverter({ hanViet: HAN_VIET, ...lists }).convert(text);

  await test('names and locked terms are replaced; everything else gets its Hán Việt reading', () => {
    assert.strictEqual(
      convert('林动走进青阳镇。林动笑了。', { names: NAMES, locked: LOCKED }),
      'Lâm Động tẩu tiến Thanh Dương trấn. Lâm Động tiếu liễu.'
    );
  });

  await test('Chinese punctuation becomes ASCII with QT spacing and capitalization after sentence ends', () => {
    assert.strictEqual(convert('他说：“走！”'), 'Tha thuyết: "Tẩu!"');
    assert.strictEqual(convert('林动，走。', { names: NAMES }), 'Lâm Động, tẩu.');
  });

  await test('full-width ASCII is narrowed', () => {
    assert.strictEqual(convert('他１２３'), 'Tha123');
  });

  await test('a name starting inside a soft or locked term wins', () => {
    const lists = {
      names: [{ id: 'n', original: '萧炎', translation: 'Tiêu Viêm' }],
      soft: [{ id: 's', original: '大萧', translation: 'Đại Tiêu Soft' }]
    };
    assert.strictEqual(convert('大萧炎来了', lists), 'Đại Tiêu Viêm lai liễu');
  });

  await test('locked terms outrank soft terms', () => {
    const lists = {
      locked: [{ id: 'l', original: '阳镇', translation: 'LOCKED' }],
      soft: [{ id: 's', original: '青阳', translation: 'SOFT' }]
    };
    assert.strictEqual(convert('青阳镇', lists), 'Thanh LOCKED');
  });

  await test('characters missing from the Hán Việt list stay as they are', () => {
    assert.strictEqual(convert('他龘'), 'Tha龘');
  });

  await test('paragraph breaks are kept and each paragraph starts with a capital', () => {
    assert.strictEqual(convert('林动。\n\n走。', { names: NAMES }), 'Lâm Động.\n\nTẩu.');
  });

  await test('VietPhrase, QT Names and pronouns fill in everything your lists do not cover', () => {
    const dictionaries = {
      vietPhrase: new Map([['看向', 'nhìn về phía'], ['勉强', 'miễn cưỡng'], ['笑笑', 'cười cười'], ['他', 'y']]),
      qtNames: new Map([['张角', 'Trương Giác']]),
      pronouns: new Map([['他', 'hắn']])
    };
    const hv = new Map([...HAN_VIET, ['陈', 'trần'], ['舒', 'thư'], ['看', 'khán'], ['向', 'hướng'], ['张', 'trương'], ['角', 'giác'], ['勉', 'miễn'], ['强', 'cường']]);
    const converter = T.createConverter({
      hanViet: hv,
      names: [{ id: 'n', original: '陈舒', translation: 'Trần Thư' }],
      dictionaries
    });
    assert.strictEqual(converter.convert('陈舒看向张角，勉强笑笑。'), 'Trần Thư nhìn về phía Trương Giác, miễn cưỡng cười cười.');
    assert.strictEqual(converter.convert('他来了'), 'Hắn lai liễu', 'Pronouns.txt replaces the VietPhrase entry for the same key');
  });

  await test('ignored phrases (site spam) are removed before converting, whatever the spacing', () => {
    const converter = T.createConverter({ hanViet: HAN_VIET, ignoredPhrases: ['(看暴爽小说, 就 上 飞 卢 小说网! )'] });
    assert.strictEqual(converter.convert('他走。（看暴爽小说，就上飞卢小说网！）'), 'Tha tẩu.');
  });

  await test('QtDictionaries.parseDictionary follows QT rules and keeps the first meaning', () => {
    const map = env.QtDictionaries.parseDictionary('\uFEFF他=hắn/她\n你=ngươi|cậu\n你=khác\nbad\na=b=c\n');
    assert.strictEqual(map.get('他'), 'hắn');
    assert.strictEqual(map.get('你'), 'ngươi', 'first line wins and | also separates meanings');
    assert.strictEqual(map.has('a'), false);
    assert.strictEqual(map.size, 2);
  });

  await test('QtDictionaries.parseList reads one phrase per line', () => {
    assert.deepStrictEqual([...env.QtDictionaries.parseList('\uFEFFone\n\n two \r\nthree')], ['one', 'two', 'three']);
  });

  await test('QtDictionaries.load fetches each bundled file once', async () => {
    const urls = [];
    const fetchEnv = loadEnv({
      fetch: async (url) => {
        urls.push(url);
        return { ok: true, text: async () => '他=hắn\n' };
      }
    });
    const first = await fetchEnv.QtDictionaries.load('pronouns');
    await fetchEnv.QtDictionaries.load('pronouns');
    await fetchEnv.QtDictionaries.load('vietPhrase');
    await fetchEnv.QtDictionaries.load('qtNames');
    const ignored = await fetchEnv.QtDictionaries.load('ignoredPhrases');
    assert.strictEqual(first.get('他'), 'hắn');
    assert.deepStrictEqual([...ignored], ['他=hắn'], 'ignored phrases load as a list');
    assert.deepStrictEqual(urls, ['../dict/Pronouns.txt', '../dict/VietPhrase.txt', '../dict/Names.txt', '../dict/IgnoredChinesePhrases.txt']);
  });

  await test('the QT dictionaries ship with the extension and the reader loads the loader', () => {
    for (const f of ['VietPhrase.txt', 'Names.txt', 'Pronouns.txt', 'IgnoredChinesePhrases.txt']) {
      assert(fs.existsSync(path.join(repoRoot, 'src', 'dict', f)), `src/dict/${f} is bundled`);
    }
    const reader = read('src', 'views', 'reader.html');
    const loader = reader.indexOf('services/qt-dictionaries.js');
    assert(loader >= 0 && loader < reader.indexOf('reader-entry.jsx'), 'reader loads qt-dictionaries.js');
  });

  await test('HanViet.parse reads QT ChinesePhienAmWords format', () => {
    const map = env.HanViet.parse('﻿一=nhất\n丁=đinh\nbad line\na=b=c\n一=khác\n东=đông/đô\n');
    assert.strictEqual(map.get('一'), 'nhất', 'BOM stripped, first entry wins');
    assert.strictEqual(map.get('丁'), 'đinh');
    assert.strictEqual(map.get('东'), 'đông', 'first reading of a/b');
    assert.strictEqual(map.has('a'), false, 'lines with more than one = are skipped');
    assert.strictEqual(map.size, 3);
  });

  await test('HanViet.load fetches the bundled list once and caches it', async () => {
    let calls = 0;
    const fetchEnv = loadEnv({
      fetch: async (url) => {
        calls++;
        assert.strictEqual(url, '../dict/ChinesePhienAmWords.txt');
        return { ok: true, text: async () => '一=nhất\n' };
      }
    });
    const first = await fetchEnv.HanViet.load();
    const second = await fetchEnv.HanViet.load();
    assert.strictEqual(first.get('一'), 'nhất');
    assert.strictEqual(first, second);
    assert.strictEqual(calls, 1);
  });

  await test('the bundled Hán Việt list ships with the extension', () => {
    const data = read('src', 'dict', 'ChinesePhienAmWords.txt');
    const map = env.HanViet.parse(data);
    assert(map.size > 10000, `expected a full character list, got ${map.size}`);
    assert.strictEqual(map.get('林'), 'lâm');
    assert(/'dict'/.test(read('vite.config.mjs')), 'vite copies src/dict into dist');
    const reader = read('src', 'views', 'reader.html');
    const hv = reader.indexOf('services/han-viet.js');
    assert(hv >= 0 && hv < reader.indexOf('reader-entry.jsx'), 'reader loads han-viet.js');
  });

  const readerText = await loadComponent('components/react/reader/readerText.js');
  await test('reader shows the saved text when conversion mode is off', () => {
    const chapter = { rawText: 'Saved translation', originalRawText: '林动' };
    assert.strictEqual(readerText.chapterDisplayText(chapter, { conversionMode: false, convert: () => 'X' }), 'Saved translation');
    assert.strictEqual(readerText.chapterDisplayText({ convertedText: 'C', rawText: 'R' }, {}), 'C');
  });

  await test('reader converts the original Chinese of every chapter when conversion mode is on', () => {
    const seen = [];
    const convertFn = (text) => { seen.push(text); return `converted:${text}`; };
    assert.strictEqual(
      readerText.chapterDisplayText({ rawText: 'AI translation', originalRawText: '林动' }, { conversionMode: true, convert: convertFn }),
      'converted:林动',
      'translated chapters convert their original source'
    );
    assert.strictEqual(
      readerText.chapterDisplayText({ rawText: '林动走进' }, { conversionMode: true, convert: convertFn }),
      'converted:林动走进',
      'untranslated chapters convert their saved Chinese'
    );
    assert.deepStrictEqual(seen, ['林动', '林动走进']);
  });

  await test('reader falls back to the saved text while the converter is still loading', () => {
    assert.strictEqual(readerText.chapterDisplayText({ rawText: '林动' }, { conversionMode: true, convert: null }), '林动');
  });

  await test('buildReaderConverter loads every list and dictionary for the novel', async () => {
    const calls = [];
    const services = {
      storage: { getNameList: async (id, kind) => { calls.push(['list', id, kind]); return [{ original: kind, translation: kind }]; } },
      hanViet: { load: async () => { calls.push(['hanViet']); return new Map(); } },
      dictionaries: { load: async (name) => { calls.push(['dict', name]); return name === 'ignoredPhrases' ? ['x'] : new Map([[name, name]]); } },
      processors: { createConverter: (lists) => ({ lists }) }
    };
    const converter = await readerText.buildReaderConverter({ id: 'n1', nameList: [{ original: '林', translation: 'L' }] }, services);
    assert.deepStrictEqual(Object.keys(converter.lists.dictionaries).sort(), ['pronouns', 'qtNames', 'vietPhrase']);
    assert.deepStrictEqual(converter.lists.ignoredPhrases, ['x']);
    assert.strictEqual(converter.lists.names[0].original, '林');
    assert.strictEqual(converter.lists.locked[0].original, 'locked');
    assert.strictEqual(converter.lists.soft[0].original, 'soft');
    assert(calls.some((c) => c[0] === 'hanViet'));
  });

  await test('buildReaderConverter still converts when a dictionary fails to load', async () => {
    const services = {
      storage: { getNameList: async () => [] },
      hanViet: { load: async () => new Map() },
      dictionaries: { load: async (name) => { if (name === 'vietPhrase') throw new Error('out of memory'); return name === 'ignoredPhrases' ? [] : new Map(); } },
      processors: { createConverter: (lists) => ({ lists }) }
    };
    const errors = [];
    const converter = await readerText.buildReaderConverter({ id: 'n1', nameList: [] }, services, { onError: (e) => errors.push(e.message) });
    assert.strictEqual(converter.lists.dictionaries.vietPhrase, undefined, 'skips the failed dictionary');
    assert.deepStrictEqual(errors, ['out of memory']);
  });

  console.log(`--- Dictionary Converter Test Suite: ${passed}/${passed + failed} passed ---`);
  if (failed > 0) process.exit(1);
  console.log('Dictionary Converter Test Suite: ALL TESTS PASSED!');
})();
