const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('\n--- Running Text Processors Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(repoRoot, ...p), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}\n    ${e.message}`);
  }
}

function loadEnv({ withStorage = false } = {}) {
  const env = {
    console,
    URL,
    setTimeout,
    clearTimeout,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    indexedDB: { open() { throw new Error('not used'); } }
  };
  env.window = env;
  env.self = env;
  env.globalThis = env;
  vm.createContext(env);
  vm.runInContext(read('src', 'services', 'name-matcher.js'), env);
  vm.runInContext(read('src', 'services', 'longest-matcher.js'), env);
  vm.runInContext(read('src', 'services', 'text-processors.js'), env);
  if (withStorage) vm.runInContext(read('src', 'services', 'storage.js'), env);
  return env;
}

const NAMES = [{ id: 'n1', original: 'Lin Dong', translation: 'Lâm Động' }, { id: 'n2', original: 'Wang Lin', translation: '' }];
const LOCKED = [{ id: 'g1', original: 'Qingyang Town', translation: 'Thanh Dương trấn' }];
const SOURCE = 'Lin Dong walked into Qingyang Town. Wang Lin followed Lin Dong.';

test('prepareForAi tokenizes names, then pre-translates locked terms', () => {
  const T = loadEnv().TextProcessors;
  const prepared = T.prepareForAi(SOURCE, { names: NAMES, locked: LOCKED });
  assert.strictEqual(prepared.text, '@1@ walked into §Thanh Dương trấn§. Wang Lin followed @1@.');
  assert.deepStrictEqual(plain(prepared.mapping), [{ token: '@1@', original: 'Lin Dong', translation: 'Lâm Động' }]);
});

test('prepareForAi leaves text untouched with no names or locked terms', () => {
  const T = loadEnv().TextProcessors;
  const prepared = T.prepareForAi(SOURCE, {});
  assert.strictEqual(prepared.text, SOURCE);
  assert.deepStrictEqual(plain(prepared.mapping), []);
});

test('restoreFromAi restores tokens and strips locked markers', () => {
  const T = loadEnv().TextProcessors;
  const { mapping } = T.prepareForAi(SOURCE, { names: NAMES, locked: LOCKED });
  assert.strictEqual(
    T.restoreFromAi('@1@ đi vào §Thanh Dương trấn§. @ 1 @ cười.', mapping),
    'Lâm Động đi vào Thanh Dương trấn. Lâm Động cười.'
  );
});

test('the individual steps stay available and match the composite', () => {
  const T = loadEnv().TextProcessors;
  const tokenized = T.tokenizeSource(SOURCE, NAMES);
  const locked = T.applyLockedGlossary(tokenized.text, LOCKED);
  assert.strictEqual(locked, T.prepareForAi(SOURCE, { names: NAMES, locked: LOCKED }).text);
  assert.strictEqual(T.stripLockedMarkers('§a§b'), 'ab');
  assert.strictEqual(T.restoreTokens('@1@', tokenized.mapping), 'Lâm Động');
});

test('prepareForAi works on Chinese text without word boundaries', () => {
  const T = loadEnv().TextProcessors;
  const prepared = T.prepareForAi('林动走进青阳镇。林动笑了。', {
    names: [{ id: 'n1', original: '林动', translation: 'Lâm Động' }],
    locked: [{ id: 'g1', original: '青阳镇', translation: 'Thanh Dương trấn' }]
  });
  assert.strictEqual(prepared.text, '@1@走进§Thanh Dương trấn§。@1@笑了。');
  assert.strictEqual(T.restoreFromAi('@1@ đi vào §Thanh Dương trấn§.', prepared.mapping), 'Lâm Động đi vào Thanh Dương trấn.');
});

test('prepareForAi: a name starting inside a locked term wins', () => {
  const T = loadEnv().TextProcessors;
  const prepared = T.prepareForAi('大萧炎来了', {
    names: [{ id: 'n1', original: '萧炎', translation: 'Tiêu Viêm' }],
    locked: [{ id: 'g1', original: '大萧', translation: 'Đại Tiêu' }]
  });
  assert.strictEqual(prepared.text, '大@1@来了');
});

test('prepareForAi: a name at the start of a longer locked term still wins (as before)', () => {
  const T = loadEnv().TextProcessors;
  const prepared = T.prepareForAi('Lin Dong Sect rose.', {
    names: [{ id: 'n1', original: 'Lin Dong', translation: 'Lâm Động' }],
    locked: [{ id: 'g1', original: 'Lin Dong Sect', translation: 'Lâm Động tông' }]
  });
  assert.strictEqual(prepared.text, '@1@ Sect rose.');
});

test('prepareForAi keeps names case-sensitive and locked terms case-insensitive in one pass', () => {
  const T = loadEnv().TextProcessors;
  const prepared = T.prepareForAi('Wang Lin and wang lin met a CULTIVATOR.', {
    names: [{ id: 'n1', original: 'Wang Lin', translation: 'Vương Lâm' }],
    locked: [{ id: 'g1', original: 'cultivator', translation: 'tu sĩ' }]
  });
  assert.strictEqual(prepared.text, '@1@ and wang lin met a §tu sĩ§.');
});

test('prepareForAi numbers tokens by first appearance and leaves existing §...§ spans alone', () => {
  const T = loadEnv().TextProcessors;
  const prepared = T.prepareForAi('§Qi§ Qi, Wang Lin then Lin Dong, then Wang Lin.', {
    names: [{ id: 'a', original: 'Lin Dong', translation: 'Lâm Động' }, { id: 'b', original: 'Wang Lin', translation: 'Vương Lâm' }],
    locked: [{ id: 'g', original: 'Qi', translation: 'khí' }]
  });
  assert.strictEqual(prepared.text, '§Qi§ §khí§, @1@ then @2@, then @1@.');
  assert.deepStrictEqual(plain(prepared.mapping).map((m) => [m.token, m.original]), [['@1@', 'Wang Lin'], ['@2@', 'Lin Dong']]);
});

test('tokenizeSource and applyLockedGlossary also match Chinese text', () => {
  const T = loadEnv().TextProcessors;
  assert.strictEqual(T.tokenizeSource('林动走进', [{ original: '林动', translation: 'Lâm Động' }]).text, '@1@走进');
  assert.strictEqual(T.applyLockedGlossary('走进青阳镇', [{ original: '青阳镇', translation: 'Thanh Dương trấn' }]), '走进§Thanh Dương trấn§');
});

test('StorageService keeps delegating to the processors (same results)', () => {
  const env = loadEnv({ withStorage: true });
  const S = env.StorageService || env.window.StorageService;
  const T = env.TextProcessors;
  assert.deepStrictEqual(plain(S.tokenizeSource(SOURCE, NAMES)), plain(T.tokenizeSource(SOURCE, NAMES)));
  assert.strictEqual(S.applyLockedGlossary(SOURCE, LOCKED), T.applyLockedGlossary(SOURCE, LOCKED));
  assert.strictEqual(S.restoreTokens('@1@', [{ token: '@1@', translation: 'X' }]), 'X');
  assert.strictEqual(S.stripLockedMarkers('§a§'), 'a');
});

test('storage.js holds no copy of the processing code', () => {
  const storageSrc = read('src', 'services', 'storage.js');
  for (const fn of ['tokenizeSource', 'restoreTokens', 'applyLockedGlossary', 'stripLockedMarkers']) {
    assert(!new RegExp(`function ${fn}\\(`).test(storageSrc), `${fn} must live in text-processors.js only`);
  }
});

test('every page and the worker that load storage.js load text-processors.js before it', () => {
  const views = fs.readdirSync(path.join(repoRoot, 'src', 'views')).filter((f) => f.endsWith('.html'));
  for (const view of views) {
    const html = read('src', 'views', view);
    const storage = html.indexOf('services/storage.js');
    if (storage < 0) continue;
    const processors = html.indexOf('services/text-processors.js');
    assert(processors >= 0 && processors < storage, `${view} must load services/text-processors.js before storage.js`);
    const matcher = html.indexOf('services/longest-matcher.js');
    assert(matcher >= 0 && matcher < processors, `${view} must load services/longest-matcher.js before text-processors.js`);
  }
  const bg = read('src', 'scripts', 'background.js').match(/importScripts\(([^)]*)\)/)[1];
  assert(bg.includes('services/text-processors.js'), 'background.js must import text-processors.js');
  assert(bg.indexOf('services/text-processors.js') < bg.indexOf('services/storage.js'), 'worker imports text-processors.js before storage.js');
  assert(bg.includes('services/longest-matcher.js') && bg.indexOf('services/longest-matcher.js') < bg.indexOf('services/text-processors.js'), 'worker imports longest-matcher.js before text-processors.js');
});

console.log(`--- Text Processors Test Suite: ${passed}/${passed + failed} passed ---`);
if (failed > 0) process.exit(1);
console.log('Text Processors Test Suite: ALL TESTS PASSED!');
