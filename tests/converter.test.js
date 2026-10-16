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
    assert.strictEqual(convert('他ＡＢ'), 'ThaAB');
    assert.strictEqual(convert('他１２３'), 'Tha 123', 'narrowed digits form a number, which QT appends as a word');
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
    assert.deepStrictEqual(Object.keys(converter.lists.dictionaries).sort(), ['pronouns', 'qtNames', 'vietPhrase']);
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
    'ChinesePhienAmWords.txt': '第=đệ\n章=chương\n来=lai',
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
    assert.deepStrictEqual(plain(lines[1]), { text: '', segments: [] });
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

  console.log(`--- Dictionary Converter Test Suite: ${passed}/${passed + failed} passed ---`);
  if (failed > 0) process.exit(1);
  console.log('Dictionary Converter Test Suite: ALL TESTS PASSED!');
})();
