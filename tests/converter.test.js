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
  vm.runInContext(read('src', 'services', 'qt-numbers.js'), env);
  vm.runInContext(read('src', 'services', 'luat-nhan.js'), env);
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
    assert.strictEqual(convert('他ＡＢ'), 'Tha AB', 'narrowed, and QT spaces Chinese from the Latin text after it');
    assert.strictEqual(convert('他１２３'), 'Tha 123', 'narrowed digits form a number, which QT appends as a word');
  });

  const T2S = new Map([['這', '这'], ['書', '书'], ['蕭', '萧'], ['動', '动'], ['陽', '阳'], ['鎮', '镇'], ['進', '进'], ['說', '说']]);
  const CLEAN_HV = new Map([...HAN_VIET, ['这', 'giá'], ['是', 'thị'], ['一', 'nhất'], ['本', 'bản'], ['书', 'thư'], ['她', 'tha']]);
  const cleanConvert = (text, lists = {}) => T.createConverter({ hanViet: CLEAN_HV, dictionaries: { traditional: T2S }, ...lists }).convert(text);

  await test('traditional Chinese is converted to simplified before matching', () => {
    assert.strictEqual(cleanConvert('這是本書'), cleanConvert('这是本书'));
    assert.strictEqual(cleanConvert('這是本書'), 'Giá thị bản thư');
    assert.strictEqual(cleanConvert('林動走進青陽鎮。', { names: NAMES, locked: LOCKED }), 'Lâm Động tẩu tiến Thanh Dương trấn.', 'names and glossary match traditional text');
  });

  await test('your own entries saved in traditional Chinese still match', () => {
    const names = [{ id: 'n9', original: '蕭炎', translation: 'Tiêu Viêm' }];
    assert.strictEqual(cleanConvert('萧炎说', { names }), 'Tiêu Viêm thuyết');
    assert.strictEqual(cleanConvert('蕭炎說', { names }), 'Tiêu Viêm thuyết');
  });

  await test('without the traditional table, text converts as before', () => {
    assert.strictEqual(T.createConverter({ hanViet: CLEAN_HV }).convert('这是本书'), 'Giá thị bản thư');
  });

  await test('HTML entities are decoded like .NET WebUtility.HtmlDecode', () => {
    assert.strictEqual(cleanConvert('他&amp;她'), 'Tha & tha');
    assert.strictEqual(cleanConvert('他&nbsp;说'), 'Tha thuyết', 'a non-breaking space separates like a space');
    assert.strictEqual(cleanConvert('&#x4ED6;说&#20182;'), 'Tha thuyết tha', 'hex and decimal character references');
    assert.strictEqual(cleanConvert('&lt;他&gt;&quot;'), '< tha >"', 'decoded, then spaced from the Chinese like typed brackets');
    assert.strictEqual(cleanConvert('他&NotEqualTilde;'), 'Tha &NotEqualTilde;', 'names .NET does not know stay as they are');
    assert.strictEqual(cleanConvert('他&amp说'), 'Tha &amp thuyết', 'no semicolon, no entity');
  });

  await test('QT spacing separates Chinese from Latin letters and digits on both sides', () => {
    assert.strictEqual(cleanConvert('这是本书。 他&amp;她 ＡＢＣ 等'), 'Giá thị bản thư. Tha & tha ABC 等');
    assert.strictEqual(cleanConvert('ABC他'), 'ABC tha');
    assert.strictEqual(cleanConvert('他(她)'), 'Tha (tha)');
    assert.strictEqual(cleanConvert('3.14他'), '3.14 tha', 'decimal points stay inside numbers');
  });

  await test('control characters are dropped and long dot runs collapse', () => {
    assert.strictEqual(cleanConvert('他\u0007她\u0000说'), 'Tha tha thuyết');
    assert.strictEqual(cleanConvert('他……'), 'Tha...');
    assert.strictEqual(cleanConvert('他. . . . . .'), 'Tha...');
  });

  await test('QtDictionaries loads the traditional-to-simplified table as a character map', async () => {
    const urls = [];
    const fetchEnv = loadEnv({
      fetch: async (url) => {
        urls.push(url);
        return { ok: true, text: async () => '﻿9019=8FD9\n66F8=4E66\nbad line\n' };
      }
    });
    const map = await fetchEnv.QtDictionaries.load('traditional');
    assert.deepStrictEqual(urls, ['../dict/TraditionalToSimplified.txt']);
    assert.strictEqual(map.get('這'), '这');
    assert.strictEqual(map.get('書'), '书');
    assert.strictEqual(map.size, 2, 'malformed lines are skipped');
    const bundled = read('src', 'dict', 'TraditionalToSimplified.txt').split(/\r?\n/).filter(Boolean);
    assert.strictEqual(bundled.length, 2619, 'the full Windows StrConv table is bundled');
  });

  await test('the bundled table matches the Windows StrConv samples QT relies on', () => {
    const map = new Map(read('src', 'dict', 'TraditionalToSimplified.txt').split(/\r?\n/).filter(Boolean).map((line) => {
      const [from, to] = line.split('=');
      return [String.fromCodePoint(parseInt(from, 16)), String.fromCodePoint(parseInt(to, 16))];
    }));
    const simplify = (text) => Array.from(text).map((ch) => map.get(ch) || ch).join('');
    assert.strictEqual(simplify('這是一本書'), '这是一本书');
    assert.strictEqual(simplify('著作與看著'), '着作与看着');
    assert.strictEqual(simplify('乾坤一擲'), '乾坤一掷');
    assert.strictEqual(simplify('後臺發展'), '後台发展');
    assert.strictEqual(simplify('滑鼠裡面'), '滑鼠里面');
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
    assert.strictEqual(convert('他龘'), 'Tha 龘', 'kept as is; QT only counts listed characters as Chinese, so it is spaced like other text');
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

  const RULE_HV = new Map([...HAN_VIET, ['三', 'tam'], ['百', 'bách'], ['步', 'bộ'], ['月', 'nguyệt'], ['五', 'ngũ'], ['号', 'hào'], ['年', 'niên'], ['轻', 'khinh'], ['人', 'nhân'], ['一', 'nhất'], ['二', 'nhị']]);
  const RULES = [['{s}月{s}号', 'ngày {2} tháng {1}'], ['{s}年', 'năm {s}']];

  await test('LuatNhan rules convert dates in running text', () => {
    const converter = T.createConverter({ hanViet: RULE_HV, luatNhan: RULES });
    assert.strictEqual(converter.convert('三月五号他走了'), 'Mùng 5 tháng 3 tha tẩu liễu');
  });

  await test('numbers no rule covers are converted on their own', () => {
    const converter = T.createConverter({ hanViet: RULE_HV, luatNhan: RULES });
    assert.strictEqual(converter.convert('他走了三百步'), 'Tha tẩu liễu 300 bộ');
  });

  await test('a dictionary phrase cannot cut a number in half', () => {
    const converter = T.createConverter({ hanViet: RULE_HV, dictionaries: { vietPhrase: new Map([['一二', 'x']]) } });
    assert.strictEqual(converter.convert('一二三'), '123');
  });

  await test('a rule without {n} gives way to a name starting inside it', () => {
    const converter = T.createConverter({
      hanViet: RULE_HV,
      luatNhan: RULES,
      names: [{ id: 'n', original: '年轻人', translation: 'Young Man' }]
    });
    assert.strictEqual(converter.convert('三年轻人'), '3 Young Man');
  });

  await test('converted segments include rule and number matches', () => {
    const converter = T.createConverter({ hanViet: RULE_HV, luatNhan: RULES });
    const [line] = converter.convertDetailed('三月五号他走了三百步');
    const origins = JSON.parse(JSON.stringify(line.segments.map((seg) => [seg.source, seg.origin])));
    assert.deepStrictEqual(origins.filter(([, origin]) => origin === 'luatNhan' || origin === 'number'), [['三月五号', 'luatNhan'], ['三百', 'number']]);
  });

  await test('surname + suffix names convert as "Ho hau" and give way to your name list', () => {
    const hv = new Map([...RULE_HV, ['李', 'lý'], ['哥', 'ca'], ['来', 'lai']]);
    const dictionaries = { hoNguoi: new Map([['李', 'Lý']]), hauTu: new Map([['哥', 'huynh']]) };
    assert.strictEqual(T.createConverter({ hanViet: hv, dictionaries, luatNhan: [] }).convert('李哥来了'), 'Lý huynh lai liễu');
    const mine = T.createConverter({ hanViet: hv, dictionaries, luatNhan: [], names: [{ id: 'n', original: '李哥', translation: 'Brother Li' }] });
    assert.strictEqual(mine.convert('李哥来了'), 'Brother Li lai liễu');
  });

  await test('QtDictionaries knows the surname, suffix and place-name files', async () => {
    const urls = [];
    const fetchEnv = loadEnv({ fetch: async (url) => { urls.push(url); return { ok: true, text: async () => '李=Lý\n' }; } });
    for (const name of ['hoNguoi', 'hauTu', 'danhTu']) await fetchEnv.QtDictionaries.load(name);
    assert.deepStrictEqual(urls, ['../dict/HoNguoi.txt', '../dict/HauTu.txt', '../dict/DanhTu.txt']);
    for (const f of ['HoNguoi.txt', 'HauTu.txt', 'DanhTu.txt']) assert(fs.existsSync(path.join(repoRoot, 'src', 'dict', f)), `src/dict/${f} is bundled`);
  });

  await test('buildReaderConverter loads the surname and suffix lists for the {h}{t} rule', async () => {
    const asked = [];
    const services = {
      storage: { getNameList: async () => [] },
      hanViet: { load: async () => new Map() },
      dictionaries: { load: async (name) => { asked.push(name); return name === 'luatNhan' || name === 'ignoredPhrases' ? [] : new Map([[name, name]]); } },
      processors: { createConverter: (lists) => ({ lists }) }
    };
    const { buildReaderConverter } = await loadComponent('components/react/reader/readerText.js');
    const converter = await buildReaderConverter({ id: 'n1', nameList: [] }, services);
    assert(asked.includes('hoNguoi') && asked.includes('hauTu'));
    assert(converter.lists.dictionaries.hoNguoi && converter.lists.dictionaries.hauTu);
  });

  await test('buildReaderConverter passes the traditional-to-simplified table to the converter', async () => {
    const asked = [];
    const table = new Map([['這', '这']]);
    const services = {
      storage: { getNameList: async () => [] },
      hanViet: { load: async () => new Map() },
      dictionaries: { load: async (name) => { asked.push(name); if (name === 'traditional') return table; return name === 'luatNhan' || name === 'ignoredPhrases' ? [] : new Map(); } },
      processors: { createConverter: (lists) => ({ lists }) }
    };
    const { buildReaderConverter } = await loadComponent('components/react/reader/readerText.js');
    const converter = await buildReaderConverter({ id: 'n1', nameList: [] }, services);
    assert(asked.includes('traditional'));
    assert.strictEqual(converter.lists.dictionaries.traditional, table);
  });

  await test('chapter titles are converted with the traditional-to-simplified table too', () => {
    const storage = read('src', 'services', 'storage.js');
    const titleConverter = storage.slice(storage.indexOf('async _titleConverter'), storage.indexOf('async _convertCatalogTitles'));
    assert(/dictionaries\.load\('traditional'\)/.test(titleConverter), '_titleConverter loads the table');
    assert(/traditional/.test(titleConverter.slice(titleConverter.indexOf('const loaded'))), '_titleConverter passes it to createConverter');
  });

  await test('QtDictionaries loads LuatNhan.txt as rules', async () => {
    const fetchEnv = loadEnv({ fetch: async (url) => ({ ok: true, text: async () => (url.endsWith('LuatNhan.txt') ? '# c\n{s}年=năm {s}\n' : '') }) });
    const rules = await fetchEnv.QtDictionaries.load('luatNhan');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(rules)), [['{s}年', 'năm {s}']]);
    assert(fs.existsSync(path.join(repoRoot, 'src', 'dict', 'LuatNhan.txt')), 'LuatNhan.txt is bundled');
  });

  await test('every page that converts loads the number and rule services', () => {
    for (const view of ['reader.html', 'novel.html', 'popup.html']) {
      const html = read('src', 'views', view);
      const processors = html.indexOf('services/text-processors.js');
      for (const service of ['services/qt-numbers.js', 'services/luat-nhan.js']) {
        const at = html.indexOf(service);
        assert(at >= 0 && at < processors, `${view} loads ${service} before text-processors.js`);
      }
    }
    const bg = read('src', 'scripts', 'background.js').match(/importScripts\(([^)]*)\)/)[1];
    for (const service of ['services/qt-numbers.js', 'services/luat-nhan.js']) {
      assert(bg.includes(service) && bg.indexOf(service) < bg.indexOf('services/text-processors.js'), `worker imports ${service}`);
    }
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
    assert.deepStrictEqual(Object.keys(converter.lists.dictionaries).sort(), ['hauTu', 'hoNguoi', 'pronouns', 'qtNames', 'traditional', 'vietPhrase']);
    assert.deepStrictEqual(converter.lists.ignoredPhrases, ['x']);
    assert.strictEqual(converter.lists.names[0].original, '林');
    assert.strictEqual(converter.lists.locked[0].original, 'locked');
    assert.strictEqual(converter.lists.soft[0].original, 'soft');
    assert(calls.some((c) => c[0] === 'hanViet'));
  });

  await test('buildReaderConverter passes the LuatNhan rules to the converter', async () => {
    const services = {
      storage: { getNameList: async () => [] },
      hanViet: { load: async () => new Map() },
      dictionaries: { load: async (name) => (name === 'luatNhan' ? [['{s}年', 'năm {s}']] : name === 'ignoredPhrases' ? [] : new Map()) },
      processors: { createConverter: (lists) => ({ lists }) }
    };
    const converter = await readerText.buildReaderConverter({ id: 'n1', nameList: [] }, services);
    assert.deepStrictEqual(converter.lists.luatNhan, [['{s}年', 'năm {s}']]);
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

  const readerLocation = await loadComponent('components/react/reader/readerLocation.js');
  const fakeWindow = (search, { history = true } = {}) => {
    const win = new EventTarget();
    win.location = { search, href: `chrome-extension://x/src/views/reader.html${search}` };
    win.pushed = [];
    win.scrolled = [];
    win.scrollTo = (x, y) => win.scrolled.push([x, y]);
    if (history) {
      win.history = {
        pushState: (state, title, url) => {
          win.pushed.push({ state, url });
          win.location.search = url.slice(url.indexOf('?'));
        }
      };
    }
    return win;
  };

  await test('readerChapterHref encodes the novel id and chapter', () => {
    assert.strictEqual(readerLocation.readerChapterHref('n 1&x', 3), 'reader.html?id=n%201%26x&ch=3');
    assert.strictEqual(readerLocation.readerChapterHref('n1', 2.5), 'reader.html?id=n1&ch=2.5');
    assert.strictEqual(readerLocation.readerChapterHref('n1', 3, 7), 'reader.html?id=n1&ch=3&p=7', 'a paragraph to continue from');
    assert.strictEqual(readerLocation.readerChapterHref('n1', 3, 0), 'reader.html?id=n1&ch=3', 'the top needs no paragraph');
  });

  await test('switching chapters updates the URL in place so loaded dictionaries survive', () => {
    const win = fakeWindow('?id=n1&ch=3');
    const events = [];
    win.addEventListener(readerLocation.READER_LOCATION_EVENT, () => events.push(win.location.search));
    readerLocation.navigateToChapter('n1', 4, win);
    assert.deepStrictEqual(win.pushed.map((p) => p.url), ['reader.html?id=n1&ch=4']);
    assert.deepStrictEqual(win.pushed[0].state, { id: 'n1', ch: 4 });
    assert.strictEqual(win.location.href, 'chrome-extension://x/src/views/reader.html?id=n1&ch=3', 'must not trigger a full page load');
    assert.deepStrictEqual(events, ['?id=n1&ch=4'], 'listeners see the new chapter');
    assert.deepStrictEqual(win.scrolled, [[0, 0]], 'the new chapter starts at the top');
  });

  await test('switching to the chapter already open does nothing', () => {
    const win = fakeWindow('?id=n1&ch=4');
    let fired = 0;
    win.addEventListener(readerLocation.READER_LOCATION_EVENT, () => { fired++; });
    readerLocation.navigateToChapter('n1', 4, win);
    assert.strictEqual(win.pushed.length, 0);
    assert.strictEqual(fired, 0);
  });

  await test('switching chapters falls back to a page load without the History API', () => {
    const win = fakeWindow('?id=n1&ch=3', { history: false });
    readerLocation.navigateToChapter('n1', 4, win);
    assert.strictEqual(win.location.href, 'reader.html?id=n1&ch=4');
  });

  await test('reader location subscribers follow in-page switches and back/forward', () => {
    const win = fakeWindow('?id=n1&ch=3');
    const seen = [];
    const unsubscribe = readerLocation.subscribeReaderLocation((search) => seen.push(search), win);
    readerLocation.navigateToChapter('n1', 4, win);
    win.location.search = '?id=n1&ch=3';
    win.dispatchEvent(new Event('popstate'));
    unsubscribe();
    readerLocation.navigateToChapter('n1', 5, win);
    assert.deepStrictEqual(seen, ['?id=n1&ch=4', '?id=n1&ch=3']);
  });

  await test('reader views switch chapters through navigateToChapter, not a page load', () => {
    for (const file of ['ReaderApp.jsx', 'ReaderNav.jsx', 'ReaderChapterList.jsx']) {
      const src = read('src', 'components', 'react', 'reader', file);
      assert(!/location\.href\s*=\s*`reader\.html/.test(src), `${file} must not reload the page to change chapter`);
      assert(src.includes('navigateToChapter('), `${file} must use navigateToChapter`);
    }
    for (const file of ['ReaderApp.jsx', 'ReaderNav.jsx', 'ReaderChapter.jsx', 'ReaderChapterList.jsx', 'ReaderSourceDrawer.jsx']) {
      const src = read('src', 'components', 'react', 'reader', file);
      assert(src.includes('useReaderSearch('), `${file} must follow in-page chapter changes`);
    }
  });

  const DICT_FILES = {
    'ChinesePhienAmWords.txt': '第=đệ\n章=chương\n来=lai\n林=lâm\n动=động\n了=liễu',
    'VietPhrase.txt': '第=thứ\n来了=tới',
    'Names.txt': '',
    'Pronouns.txt': '',
    'IgnoredChinesePhrases.txt': ''
  };
  const hasCjk = (s) => /[㐀-鿿]/.test(s);
  const loadStorageEnv = ({ failing = [] } = {}) => {
    const fetched = [];
    const saved = [];
    const env = loadEnv({
      fetch: async (url) => {
        const file = String(url).split('/').pop();
        fetched.push(file);
        if (failing.includes(file)) return { ok: false, status: 500, text: async () => '' };
        return { ok: true, status: 200, text: async () => DICT_FILES[file] || '' };
      },
      indexedDB: {
        open: () => {
          const req = {};
          setTimeout(() => {
            req.result = {
              transaction: () => {
                const tx = {
                  objectStore: () => ({
                    put: (record) => { saved.push(record); setTimeout(() => tx.oncomplete && tx.oncomplete(), 0); }
                  })
                };
                return tx;
              }
            };
            req.onsuccess && req.onsuccess();
          }, 0);
          return req;
        }
      }
    });
    vm.runInContext(read('src', 'services', 'platform.js'), env);
    vm.runInContext(read('src', 'services', 'storage.js'), env);
    const S = env.StorageService;
    return { env, S, fetched, saved };
  };
  const conversionNovel = (overrides = {}) => ({
    id: 'n1',
    slug: 'n1',
    url: 'https://example.test/n1',
    title: 'Novel',
    conversionMode: true,
    nameList: [{ id: 'a', original: '林动', translation: 'Lâm Động' }],
    chapterList: [],
    ...overrides
  });
  const stubNovel = (S, env, novel, chapters) => {
    const updates = [];
    S.getNovelById = async () => novel;
    S.getNovelBySlug = async () => novel;
    S.getNameList = async () => [];
    S.updateNovel = async (id, patch) => { updates.push(patch); return { ...novel, ...patch }; };
    const provider = {
      fetchChapterList: async () => chapters.map((c) => ({ ...c })),
      fetchChapterContent: async () => ({ title: '第2章 林动来了', rawText: '林动来了' })
    };
    env.ProviderRegistry = { getProviderForUrl: () => provider, getProviderForDomain: () => provider };
    return updates;
  };
  const readerConvert = async (env, novel) => (await readerText.buildReaderConverter(novel, {
    storage: { getNameList: async () => [] },
    hanViet: env.HanViet,
    dictionaries: env.QtDictionaries,
    processors: env.TextProcessors
  })).convert;

  await test('Sync Catalog saves chapter titles converted the same way the reader converts them', async () => {
    const { env, S } = loadStorageEnv();
    const novel = conversionNovel();
    const updates = stubNovel(S, env, novel, [
      { chapterNumber: 1, title: '第1章 林动来了', url: 'u1', slug: 's1', locked: true },
      { chapterNumber: 2, title: 'Chapter 2 already English', url: 'u2' }
    ]);
    await S.syncNovelChapters('n1');
    const list = updates[0].chapterList;
    const convert = await readerConvert(env, novel);
    assert.strictEqual(list[0].title, convert('第1章 林动来了'));
    assert(list[0].title.includes('Lâm Động') && !hasCjk(list[0].title), `expected a converted title, got ${list[0].title}`);
    assert.deepStrictEqual({ ...list[0], title: undefined }, { chapterNumber: 1, title: undefined, url: 'u1', slug: 's1', locked: true }, 'other catalog fields are kept');
    assert.strictEqual(list[1].title, 'Chapter 2 already English');
  });

  await test('Sync Catalog keeps the source titles and loads no dictionary when conversion is off', async () => {
    const { env, S, fetched } = loadStorageEnv();
    const updates = stubNovel(S, env, conversionNovel({ conversionMode: false }), [{ chapterNumber: 1, title: '第1章 林动' }]);
    await S.syncNovelChapters('n1');
    assert.strictEqual(updates[0].chapterList[0].title, '第1章 林动');
    assert.deepStrictEqual(fetched, []);
  });

  await test('Sync Catalog loads no dictionary when every title is already converted', async () => {
    const { env, S, fetched } = loadStorageEnv();
    const updates = stubNovel(S, env, conversionNovel(), [{ chapterNumber: 1, title: 'Thứ 1 chương' }]);
    await S.syncNovelChapters('n1');
    assert.strictEqual(updates[0].chapterList[0].title, 'Thứ 1 chương');
    assert.deepStrictEqual(fetched, []);
  });

  await test('Sync Catalog still saves the catalog when a dictionary fails to load', async () => {
    const { env, S } = loadStorageEnv({ failing: ['VietPhrase.txt'] });
    const updates = stubNovel(S, env, conversionNovel(), [{ chapterNumber: 1, title: '林动' }]);
    await S.syncNovelChapters('n1');
    assert.strictEqual(updates[0].chapterList[0].title, 'Lâm Động');
  });

  await test('downloading a chapter in conversion mode saves its title converted and its text untouched', async () => {
    const { env, S, saved } = loadStorageEnv();
    const novel = conversionNovel({ chapterList: [{ chapterNumber: 2, title: '第2章 林动来了' }] });
    stubNovel(S, env, novel, []);
    await S.downloadChapter('n1', 2, {});
    const chapter = saved.find((r) => r.id === 'n1_ch2');
    assert(chapter, 'chapter was saved');
    assert.strictEqual(chapter.title, (await readerConvert(env, novel))('第2章 林动来了'));
    assert(!hasCjk(chapter.title), `expected a converted title, got ${chapter.title}`);
    assert.strictEqual(chapter.rawText, '林动来了');
    assert.strictEqual(chapter.originalRawText, '林动来了');
  });

  await test('chapters saved from an open page get converted titles in conversion mode only', async () => {
    const on = loadStorageEnv();
    stubNovel(on.S, on.env, conversionNovel(), []);
    await on.S.saveChapter({ novelId: 'n1', chapterNumber: 3, title: '林动', rawText: '林动' });
    assert.strictEqual(on.saved[0].title, 'Lâm Động');
    assert.strictEqual(on.saved[0].rawText, '林动');

    const off = loadStorageEnv();
    stubNovel(off.S, off.env, conversionNovel({ conversionMode: false }), []);
    await off.S.saveChapter({ novelId: 'n1', chapterNumber: 3, title: '林动', rawText: '林动' });
    assert.strictEqual(off.saved[0].title, '林动');
    assert.deepStrictEqual(off.fetched, []);
  });

  await test('the background worker and conversion-capable views load the dictionary services', () => {
    const bg = read('src', 'scripts', 'background.js');
    for (const file of ['han-viet.js', 'qt-dictionaries.js']) {
      assert(bg.includes(`'../services/${file}'`), `background.js must import ${file}`);
    }
    for (const view of ['novel.html', 'popup.html', 'reader.html']) {
      const html = read('src', 'views', view);
      for (const file of ['han-viet.js', 'qt-dictionaries.js']) {
        assert(html.includes(`services/${file}`), `${view} must load ${file}`);
      }
    }
  });

  const plain = (value) => JSON.parse(JSON.stringify(value));

  await test('QtDictionaries keeps every meaning of a phrase while lookups still return the first', () => {
    const map = env.QtDictionaries.parseDictionary('工作人员=nhân viên công tác/nhân viên làm việc|công nhân viên/ nhân viên công tác\n他=hắn\n');
    assert.strictEqual(map.get('工作人员'), 'nhân viên công tác');
    assert.deepStrictEqual(plain(map.meanings('工作人员')), ['nhân viên công tác', 'nhân viên làm việc', 'công nhân viên']);
    assert.deepStrictEqual(plain(map.meanings('他')), ['hắn']);
    assert.deepStrictEqual(plain(map.meanings('missing')), []);
  });

  const detailLists = () => ({
    hanViet: new Map([...HAN_VIET, ['看', 'khán'], ['向', 'hướng'], ['勉', 'miễn'], ['强', 'cường']]),
    names: [{ id: 'n1', original: '林动', translation: 'Lâm Động' }],
    locked: [{ id: 'g1', original: '青阳镇', translation: 'Thanh Dương trấn' }],
    soft: [{ id: 's1', original: '笑笑', translation: 'cười cười' }],
    dictionaries: { vietPhrase: new Map([['看向', 'nhìn về phía'], ['勉强', 'miễn cưỡng']]) }
  });
  const DETAIL_TEXT = '林动看向青阳镇，勉强笑笑。他走了！\n\n“林动，走。”\n大龘来';

  await test('convertDetailed gives the same text as convert, line by line', () => {
    const converter = T.createConverter(detailLists());
    const lines = converter.convertDetailed(DETAIL_TEXT);
    assert.strictEqual(lines.map((l) => l.text).join('\n'), converter.convert(DETAIL_TEXT));
    assert.strictEqual(lines.length, 4);
    assert.deepStrictEqual(plain(lines[1]), { text: '', segments: [], source: '', hidden: [] });
  });

  await test('convertDetailed marks each phrase with its Chinese, Hán Việt reading and where the meaning came from', () => {
    const converter = T.createConverter(detailLists());
    const [first] = converter.convertDetailed(DETAIL_TEXT);
    const seen = plain(first.segments.map((s) => ({
      shown: first.text.slice(s.start, s.end),
      source: s.source,
      reading: s.reading,
      translation: s.translation,
      origin: s.origin
    })));
    assert.deepStrictEqual(seen, [
      { shown: 'Lâm Động', source: '林动', reading: 'lâm động', translation: 'Lâm Động', origin: 'name' },
      { shown: 'nhìn về phía', source: '看向', reading: 'khán hướng', translation: 'nhìn về phía', origin: 'vietPhrase' },
      { shown: 'Thanh Dương trấn', source: '青阳镇', reading: 'thanh dương trấn', translation: 'Thanh Dương trấn', origin: 'locked' },
      { shown: 'miễn cưỡng', source: '勉强', reading: 'miễn cường', translation: 'miễn cưỡng', origin: 'vietPhrase' },
      { shown: 'cười cười', source: '笑笑', reading: 'tiếu tiếu', translation: 'cười cười', origin: 'soft' },
      { shown: 'Tha', source: '他', reading: 'tha', translation: 'tha', origin: 'hanViet' },
      { shown: 'tẩu', source: '走', reading: 'tẩu', translation: 'tẩu', origin: 'hanViet' },
      { shown: 'liễu', source: '了', reading: 'liễu', translation: 'liễu', origin: 'hanViet' }
    ]);
    assert.strictEqual(first.segments[0].entryId, 'n1', 'name segments point at their Name List entry');
  });

  await test('convertDetailed segments stay aligned after quotes, capitals and unknown characters', () => {
    const converter = T.createConverter(detailLists());
    const lines = converter.convertDetailed(DETAIL_TEXT);
    const quoted = lines[2];
    assert.deepStrictEqual(plain(quoted.segments.map((s) => quoted.text.slice(s.start, s.end))), ['Lâm Động', 'tẩu']);
    const last = lines[3];
    assert.deepStrictEqual(plain(last.segments.map((s) => [last.text.slice(s.start, s.end), s.source])), [['Đại', '大'], ['lai', '来']]);
    assert(last.text.includes('龘'), 'characters with no reading stay as plain text');
  });

  await test('convertDetailed records where each phrase sits in the Chinese so touching phrases can be joined', () => {
    const converter = T.createConverter(detailLists());
    const [first] = converter.convertDetailed(DETAIL_TEXT);
    const bySource = (src) => first.segments.find((s) => s.source === src);
    assert.strictEqual(bySource('林动').sourceEnd, bySource('看向').sourceStart, '林动 touches 看向');
    assert.strictEqual(bySource('看向').sourceEnd, bySource('青阳镇').sourceStart, '看向 touches 青阳镇');
    assert.notStrictEqual(bySource('青阳镇').sourceEnd, bySource('勉强').sourceStart, 'the comma separates 青阳镇 and 勉强');
    assert.strictEqual(bySource('林动').sourceEnd - bySource('林动').sourceStart, 2);
  });

  await test('a selection can grow chunk by chunk over touching phrases on the same line only', () => {
    const converter = T.createConverter(detailLists());
    const [, para2] = readerText.paragraphsFromLines(converter.convertDetailed(DETAIL_TEXT));
    const [para1] = readerText.paragraphsFromLines(converter.convertDetailed(DETAIL_TEXT));
    const idx = (para, src) => para.segments.findIndex((s) => s.source === src);
    const lin = idx(para1, '林动');
    const kan = idx(para1, '看向');
    const qing = idx(para1, '青阳镇');
    assert.strictEqual(readerText.canExtendPhrase(para1, lin, lin, 'left'), false, 'nothing before the first chunk');
    assert.strictEqual(readerText.canExtendPhrase(para1, lin, lin, 'right'), true);
    assert.strictEqual(readerText.canExtendPhrase(para1, kan, qing, 'right'), false, 'punctuation stops the selection');
    const tau = idx(para2, '走');
    const dai = idx(para2, '大');
    assert.strictEqual(readerText.canExtendPhrase(para2, tau, tau, 'right'), false, 'a line break stops the selection');
    assert.strictEqual(readerText.canExtendPhrase(para2, dai, dai, 'left'), false);
  });

  await test('a grown selection joins the Chinese, readings and shown text of its chunks', () => {
    const converter = T.createConverter(detailLists());
    const [para1] = readerText.paragraphsFromLines(converter.convertDetailed(DETAIL_TEXT));
    const lin = para1.segments.findIndex((s) => s.source === '林动');
    const phrase = readerText.phraseRange(para1, lin, lin + 1);
    assert.deepStrictEqual(plain(phrase), {
      source: '林动看向',
      reading: 'lâm động khán hướng',
      translation: 'Lâm Động nhìn về phía',
      origin: 'selection'
    });
    assert.strictEqual(readerText.phraseRange(para1, lin, lin).source, '林动', 'one chunk is just that phrase');
    assert.strictEqual(readerText.phraseRange(para1, lin, lin).origin, 'name');
    assert.strictEqual(readerText.phraseSaveKind(phrase), 'soft');
  });

  await test('a grown selection also offers its Hán Việt reading in name case', () => {
    const segment = { source: '陈舒', reading: 'trần thư', translation: 'trần thư', origin: 'selection' };
    assert.deepStrictEqual(readerText.phraseOptions(segment, () => []), ['trần thư', 'Trần Thư']);
  });

  await test('reader groups converted lines into the same paragraphs as the plain text', () => {
    const converter = T.createConverter(detailLists());
    const lines = converter.convertDetailed(DETAIL_TEXT);
    const paragraphs = readerText.paragraphsFromLines(lines);
    const expected = converter.convert(DETAIL_TEXT).split('\n\n').map((p) => p.trim()).filter(Boolean);
    assert.deepStrictEqual(paragraphs.map((p) => p.text), expected);
    const firstPara = paragraphs[1];
    assert.deepStrictEqual(firstPara.segments.map((s) => firstPara.text.slice(s.start, s.end)), ['Lâm Động', 'tẩu', 'Đại', 'lai']);
  });

  await test('phrase options list the shown meaning, every dictionary meaning and the Hán Việt reading once each', () => {
    const segment = { source: '工作人员', reading: 'công tác nhân viên', translation: 'nhân viên công tác', origin: 'vietPhrase' };
    const meaningsOf = (key) => (key === '工作人员' ? ['nhân viên công tác', 'nhân viên làm việc', 'Công tác nhân viên'] : []);
    assert.deepStrictEqual(readerText.phraseOptions(segment, meaningsOf), [
      'nhân viên công tác', 'nhân viên làm việc', 'Công tác nhân viên', 'công tác nhân viên'
    ]);
    assert.deepStrictEqual(readerText.phraseOptions({ source: '龘', reading: '', translation: 'x', origin: 'soft' }, null), ['x']);
  });

  await test('a picked meaning is saved to the list the shown meaning came from, else the soft glossary', () => {
    assert.strictEqual(readerText.phraseSaveKind({ origin: 'name' }), 'namelist');
    assert.strictEqual(readerText.phraseSaveKind({ origin: 'locked' }), 'locked');
    assert.strictEqual(readerText.phraseSaveKind({ origin: 'soft' }), 'soft');
    for (const origin of ['vietPhrase', 'qtNames', 'hanViet']) {
      assert.strictEqual(readerText.phraseSaveKind({ origin }), 'soft', `${origin} picks go to the soft glossary`);
    }
  });

  await test('savePhraseEntry updates an existing entry for the same Chinese, or adds a new one', async () => {
    const calls = [];
    const lists = { soft: [{ id: 'e1', original: '笑笑', translation: 'old' }], namelist: [] };
    const storage = {
      getNameList: async (id, kind) => lists[kind] || [],
      updateNameEntry: async (...args) => { calls.push(['update', ...args]); return {}; },
      addNameEntry: async (...args) => { calls.push(['add', ...args]); return {}; }
    };
    await readerText.savePhraseEntry(storage, 'n1', 'soft', { original: '笑笑', translation: 'cười cười' });
    await readerText.savePhraseEntry(storage, 'n1', 'namelist', { original: '林动', translation: 'Lâm Động' });
    assert.deepStrictEqual(calls, [
      ['update', 'n1', 'e1', { translation: 'cười cười' }, 'soft'],
      ['add', 'n1', { original: '林动', translation: 'Lâm Động' }, 'namelist']
    ]);
  });

  const LAC_VIET_HAO = '✚[hǎo] Hán Việt: HẢO\\n\\t1. tốt; lành; hay\\n\\t2. đẹp; ngon';
  const LAC_VIET_LIANG = '✚[liáng] Hán Việt: LƯƠNG\\n\\t1. mát\\n\\t2. chán nản; nguội lạnh\\n✚ [liàng] Hán Việt: LƯỢNG để nguội';

  await test('parseLacViet splits readings into pinyin, Hán Việt and numbered senses', () => {
    assert.deepStrictEqual(JSON.parse(JSON.stringify(readerText.parseLacViet(LAC_VIET_HAO))), [
      { pinyin: 'hǎo', hanViet: 'HẢO', senses: ['1. tốt; lành; hay', '2. đẹp; ngon'] }
    ]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(readerText.parseLacViet(LAC_VIET_LIANG))), [
      { pinyin: 'liáng', hanViet: 'LƯƠNG', senses: ['1. mát', '2. chán nản; nguội lạnh'] },
      { pinyin: 'liàng', hanViet: 'LƯỢNG', senses: ['để nguội'] }
    ], 'each ✚ is a separate reading; a definition can follow the Hán Việt on the same line');
  });

  await test('parseLacViet handles entries without a Hán Việt line or numbering', () => {
    assert.deepStrictEqual(JSON.parse(JSON.stringify(readerText.parseLacViet('✚[báiyúnshí] bạch vân thạch (khoáng vật)'))), [
      { pinyin: 'báiyúnshí', hanViet: '', senses: ['bạch vân thạch (khoáng vật)'] }
    ]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(readerText.parseLacViet('✚[tǐngérzǒuxiǎn] Hán Việt: ĐĨNH NHI TẨU HIỂM bí quá hóa liều; chó cùng rứt giậu'))), [
      { pinyin: 'tǐngérzǒuxiǎn', hanViet: 'ĐĨNH NHI TẨU HIỂM', senses: ['bí quá hóa liều; chó cùng rứt giậu'] }
    ], 'a multi-syllable Hán Việt reading stops at the first lowercase word');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(readerText.parseLacViet('✚[xiǎn] Hán Việt: Hiểm\\n\\t1. hiểm (địa thế khó vượt qua)'))), [
      { pinyin: 'xiǎn', hanViet: 'Hiểm', senses: ['1. hiểm (địa thế khó vượt qua)'] }
    ], 'some entries write the reading in title case');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(readerText.parseLacViet('✚[xī] Hán Việt: HI, SI Họ Hi'))), [
      { pinyin: 'xī', hanViet: 'HI, SI', senses: ['Họ Hi'] }
    ], 'a capital reading stops before a capitalized definition');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(readerText.parseLacViet('✚[hóngguǎng] Hán Việt: HỒNG QUẢNG Khu Hồng Quảng'))), [
      { pinyin: 'hóngguǎng', hanViet: 'HỒNG QUẢNG', senses: ['Khu Hồng Quảng'] }
    ]);
    assert.deepStrictEqual(JSON.parse(JSON.stringify(readerText.parseLacViet('✚[gǔwù] \\n\\t1. ngũ cốc\\n\\t2. lương thực'))), [
      { pinyin: 'gǔwù', hanViet: '', senses: ['1. ngũ cốc', '2. lương thực'] }
    ]);
    assert.deepStrictEqual(readerText.parseLacViet(''), []);
  });

  await test('lookupDefinitions gives the phrase, then the dictionary words inside it, then each character', () => {
    const dict = new Map([
      ['修养', '✚[xiūyǎng] \\n\\t1. trình độ\\n\\t2. thái độ đúng mực'],
      ['修', '✚[xiū] Hán Việt: TU\\n\\t1. sửa'],
      ['养', '✚[yǎng] Hán Việt: DƯỠNG\\n\\t1. nuôi'],
      ['好', LAC_VIET_HAO]
    ]);
    const plain = (v) => JSON.parse(JSON.stringify(v));
    assert.deepStrictEqual(plain(readerText.lookupDefinitions(dict, '修养')).map((d) => d.source), ['修养', '修', '养']);
    assert.deepStrictEqual(plain(readerText.lookupDefinitions(dict, '修养很好')).map((d) => d.source), ['修养', '修', '养', '好'], 'words inside a longer phrase, then its characters; unknown characters are skipped');
    assert.strictEqual(plain(readerText.lookupDefinitions(dict, '好'))[0].entries[0].hanViet, 'HẢO');
    assert.deepStrictEqual(plain(readerText.lookupDefinitions(dict, '很')), []);
    assert.deepStrictEqual(plain(readerText.lookupDefinitions(null, '好')), []);
    assert.deepStrictEqual(plain(readerText.lookupDefinitions(dict, '')), []);
  });

  await test('QtDictionaries loads LacViet.txt as raw definitions, first entry wins', async () => {
    const urls = [];
    const fetchEnv = loadEnv({
      fetch: async (url) => {
        urls.push(url);
        return { ok: true, text: async () => '﻿好=✚[hǎo] a\n好=✚[hào] b\nbad line\nx=y=z\n' };
      }
    });
    const dict = await fetchEnv.QtDictionaries.load('lacViet');
    assert.deepStrictEqual(urls, ['../dict/LacViet.txt']);
    assert.strictEqual(dict.get('好'), '✚[hǎo] a', 'the raw definition is kept for display');
    assert.strictEqual(dict.size, 1, 'malformed lines are skipped like QT');
    assert(fs.existsSync(path.join(repoRoot, 'src', 'dict', 'LacViet.txt')), 'LacViet.txt is bundled');
  });

  await test('savePhraseEntry saves to the Locked Glossary, updating the same Chinese there', async () => {
    const calls = [];
    const lists = { locked: [{ id: 'l1', original: '平静', translation: 'old' }], namelist: [{ id: 'n1', original: '是很平静', translation: 'x' }] };
    const storage = {
      getNameList: async (id, kind) => lists[kind] || [],
      updateNameEntry: async (...args) => { calls.push(['update', ...args]); return {}; },
      addNameEntry: async (...args) => { calls.push(['add', ...args]); return {}; }
    };
    await readerText.savePhraseEntry(storage, 'n1', 'locked', { original: '是很平静', translation: 'rất là bình tĩnh' });
    await readerText.savePhraseEntry(storage, 'n1', 'locked', { original: '平静', translation: 'bình tĩnh' });
    assert.deepStrictEqual(calls, [
      ['add', 'n1', { original: '是很平静', translation: 'rất là bình tĩnh' }, 'locked'],
      ['update', 'n1', 'l1', { translation: 'bình tĩnh' }, 'locked']
    ], 'a Name List entry for the same Chinese does not count as a locked entry');
    assert.strictEqual(readerText.PHRASE_KIND_LABELS.locked, 'Locked Glossary');
  });

  await test('buildReaderConverter can list every dictionary meaning of a phrase', async () => {
    const vietPhrase = env.QtDictionaries.parseDictionary('工作=công tác/làm việc\n');
    const services = {
      storage: { getNameList: async () => [] },
      hanViet: { load: async () => new Map() },
      dictionaries: {
        load: async (name) => ({
          vietPhrase,
          qtNames: new Map([['工作', 'Công Tác']]),
          pronouns: new Map(),
          ignoredPhrases: []
        })[name]
      },
      processors: { createConverter: (lists) => ({ lists }) }
    };
    const converter = await readerText.buildReaderConverter({ id: 'n1', nameList: [] }, services);
    assert.deepStrictEqual(converter.meaningsOf('工作'), ['công tác', 'làm việc', 'Công Tác']);
    assert.deepStrictEqual(converter.meaningsOf('无'), []);
  });

  await test('rule and number chunks can be joined with the chunks around them', () => {
    const converter = T.createConverter({ hanViet: RULE_HV, luatNhan: RULES });
    const [para] = readerText.paragraphsFromLines(converter.convertDetailed('三月五号他走了三百步'));
    const rule = para.segments.findIndex((s) => s.origin === 'luatNhan');
    const number = para.segments.findIndex((s) => s.origin === 'number');
    assert.strictEqual(readerText.canExtendPhrase(para, rule, rule, 'right'), true, 'a rule chunk extends right');
    assert.strictEqual(readerText.canExtendPhrase(para, number, number, 'left'), true, 'a number chunk extends left');
    assert.strictEqual(readerText.phraseRange(para, number, number + 1).source, '三百步');
    assert.strictEqual(readerText.PHRASE_ORIGIN_LABELS.luatNhan, 'LuatNhan rule');
    assert.strictEqual(readerText.PHRASE_ORIGIN_LABELS.number, 'Number');
  });

  await test('a selection grows across a character hidden by an empty meaning and keeps it in the Chinese', () => {
    const hv = new Map([...HAN_VIET, ['的', 'đích']]);
    const lists = { hanViet: hv, soft: [{ original: '的', translation: '' }] };
    const converter = T.createConverter(lists);
    const [para] = readerText.paragraphsFromLines(converter.convertDetailed('他的大笑，来'));
    const idx = (src) => para.segments.findIndex((s) => s.source === src);
    assert.strictEqual(idx('的'), -1, 'the hidden character has no chunk of its own');
    assert.strictEqual(readerText.canExtendPhrase(para, idx('他'), idx('他'), 'right'), true, 'the arrow steps over the hidden character');
    assert.strictEqual(readerText.canExtendPhrase(para, idx('大'), idx('大'), 'left'), true);
    const phrase = readerText.phraseRange(para, idx('他'), idx('大'));
    assert.strictEqual(phrase.source, '他的大', 'the selected Chinese includes the hidden character');
    assert.strictEqual(phrase.translation, 'Tha đại');
    assert.strictEqual(readerText.canExtendPhrase(para, idx('笑'), idx('笑'), 'right'), false, 'punctuation still stops the selection');
    const saved = T.createConverter({ ...lists, names: [{ id: 's', original: phrase.source, translation: 'Saved' }] });
    assert.strictEqual(saved.convert('他的大笑'), 'Saved tiếu', 'the saved selection matches the text it came from');
  });

  await test('a selection grows across the spaces QT puts around Arabic digits', () => {
    const converter = T.createConverter({ hanViet: RULE_HV });
    const [para] = readerText.paragraphsFromLines(converter.convertDetailed('他走了3步'));
    const number = para.segments.findIndex((s) => s.origin === 'number');
    assert(number > 0, 'the digits are a number chunk');
    assert.strictEqual(readerText.canExtendPhrase(para, number, number, 'left'), true, 'joins the chunk before');
    assert.strictEqual(readerText.canExtendPhrase(para, number, number, 'right'), true, 'joins the chunk after');
    const phrase = readerText.phraseRange(para, number - 1, number + 1);
    assert(phrase, 'the chunks around the digits form one selection');
    const saved = T.createConverter({ hanViet: RULE_HV, names: [{ id: 's', original: phrase.source, translation: 'Saved' }] });
    assert.strictEqual(saved.convert('他走了3步'), 'Tha tẩu Saved', 'the saved selection matches the text it came from');
  });

  await test('an entry with an empty meaning hides those characters in conversion', () => {
    const hv = new Map([...HAN_VIET, ['的', 'đích'], ['书', 'thư']]);
    assert.strictEqual(T.createConverter({ hanViet: hv, names: [{ id: 'n', original: '的', translation: '' }] }).convert('他的书。'), 'Tha thư.');
    assert.strictEqual(T.createConverter({ hanViet: hv, soft: [{ id: 's', original: '的', translation: '' }] }).convert('他的书。'), 'Tha thư.');
    assert.strictEqual(T.createConverter({ hanViet: hv, locked: [{ id: 'l', original: '的', translation: '  ' }] }).convert('的书'), 'Thư', 'the next word still starts the sentence with a capital');
  });

  await test('savePhraseEntry saves an empty meaning but still needs the Chinese', async () => {
    const saved = [];
    const storage = {
      getNameList: async () => [],
      addNameEntry: async (id, entry, kind) => { saved.push([id, entry, kind]); return entry; },
      updateNameEntry: async () => null
    };
    await readerText.savePhraseEntry(storage, 'n1', 'soft', { original: '的', translation: '' });
    assert.deepStrictEqual(saved, [['n1', { original: '的', translation: '' }, 'soft']]);
    assert.strictEqual(await readerText.savePhraseEntry(storage, 'n1', 'soft', { original: ' ', translation: 'x' }), null);
  });

  await test('editedPhrase follows the text you type in the source box', () => {
    const phrase = { source: '修养', reading: 'tu dưỡng', translation: 'tu dưỡng', origin: 'vietPhrase' };
    const readingOf = (text) => Array.from(text).map((ch) => ({ 修: 'tu', 养: 'dưỡng' }[ch] || ch)).join(' ');
    const meaningsOf = (text) => ({ 修养: ['tu dưỡng', 'trình độ'], 修: ['sửa'] }[text] || []);
    const same = readerText.editedPhrase(phrase, '修养', { readingOf, meaningsOf });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(same)), { source: '修养', reading: 'tu dưỡng', options: ['tu dưỡng', 'trình độ'] });
    const part = readerText.editedPhrase(phrase, ' 修 ', { readingOf, meaningsOf });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(part)), { source: '修', reading: 'tu', options: ['sửa', 'tu'] });
    const empty = readerText.editedPhrase(phrase, '  ', { readingOf, meaningsOf });
    assert.deepStrictEqual(JSON.parse(JSON.stringify(empty)), { source: '', reading: '', options: [] });
  });

  await test('buildReaderConverter can read any text out in Hán Việt', async () => {
    const services = {
      storage: { getNameList: async () => [] },
      hanViet: { load: async () => new Map([['修', 'tu'], ['养', 'dưỡng']]) },
      dictionaries: { load: async (name) => (name === 'luatNhan' || name === 'ignoredPhrases' ? [] : new Map()) },
      processors: { createConverter: () => ({}) }
    };
    const converter = await readerText.buildReaderConverter({ id: 'n1', nameList: [] }, services);
    assert.strictEqual(converter.readingOf('修养'), 'tu dưỡng');
    assert.strictEqual(converter.readingOf('修X'), 'tu X');
  });

  await test('suggestionsForPhrase keeps candidates that contain or sit inside the tapped text', () => {
    const candidates = [
      { text: '韩当', suggested: 'Hàn Đương' },
      { text: '青州郡', suggested: 'Thanh Châu quận' },
      { text: '当铺', suggested: 'Đương Phô' },
      { text: '韩', suggested: 'Hàn' }
    ];
    const pick = (source, limit) => readerText.suggestionsForPhrase(candidates, { source }, limit).map((c) => c.text);
    assert.deepStrictEqual(pick('当'), ['韩当', '当铺']);
    assert.deepStrictEqual(pick('韩当说'), ['韩当', '韩']);
    assert.deepStrictEqual(pick('当', 1), ['韩当']);
    assert.deepStrictEqual(readerText.suggestionsForPhrase(null, { source: '当' }), []);
    assert.deepStrictEqual(readerText.suggestionsForPhrase(candidates, null), []);
  });

  await test('buildNameSuggestions runs the name finder with your names as known and your rejections', async () => {
    const seen = {};
    const services = {
      storage: { getNameList: async (id, kind) => (kind === 'rejectedNames' ? [{ original: '张三', translation: 'x' }] : []) },
      hanViet: { load: async () => new Map([['韩', 'hàn']]) },
      dictionaries: { load: async (name) => new Map([[name, name]]) },
      jieba: { load: async () => ({ cut: () => [], hasWord: () => false }) },
      finder: { find: (text, deps, options) => { Object.assign(seen, { text, deps, options }); return [{ text: '韩当' }]; } }
    };
    const novel = { id: 'n1', nameList: [{ original: '陈舒', translation: 'Trần Thư' }] };
    const found = await readerText.buildNameSuggestions(novel, '陈舒见到韩当。', services);
    assert.deepStrictEqual(found, [{ text: '韩当' }]);
    assert.strictEqual(seen.text, '陈舒见到韩当。');
    assert.strictEqual(seen.deps.known.get('陈舒'), 'Trần Thư');
    assert(seen.deps.rejected.has('张三'));
    assert(seen.deps.names.has('qtNames'), 'QT Names are treated as already-known names');
    assert(seen.deps.hoNguoi && seen.deps.hauTu && seen.deps.danhTu && seen.deps.vietPhrase && seen.deps.jieba);
    assert.strictEqual(seen.options.includeKnown, false);
  });

  await test('the reader loads Jieba and the name finder', () => {
    const reader = read('src', 'views', 'reader.html');
    const entry = reader.indexOf('reader-entry.jsx');
    for (const service of ['services/jieba.js', 'services/name-finder.js']) {
      const at = reader.indexOf(service);
      assert(at >= 0 && at < entry, `reader loads ${service}`);
    }
  });

  console.log(`--- Dictionary Converter Test Suite: ${passed}/${passed + failed} passed ---`);
  if (failed > 0) process.exit(1);
  console.log('Dictionary Converter Test Suite: ALL TESTS PASSED!');
})();
