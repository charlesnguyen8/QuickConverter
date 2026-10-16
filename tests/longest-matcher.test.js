const assert = require('assert');
const path = require('path');

console.log('\n--- Running Longest Matcher Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');
const NameMatcher = require(path.join(repoRoot, 'src', 'services', 'name-matcher.js'));
const LongestMatcher = require(path.join(repoRoot, 'src', 'services', 'longest-matcher.js'));

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

const ids = (hits) => hits.map((h) => h.id);
const opts = { field: 'original', caseSensitive: true };

const PARITY_CASES = [
  {
    name: 'longer name wins at the same start; whole words only',
    entries: [{ id: 'a', original: 'Vương' }, { id: 'b', original: 'Vương Lâm' }],
    text: 'Vương Lâm met Vương Lâmx',
    expect: ['b']
  },
  {
    name: 'case-sensitive by option',
    entries: [{ id: 'a', original: 'Vương Lâm' }],
    text: 'vương lâm',
    expect: []
  },
  {
    name: 'case-insensitive by default',
    entries: [{ id: 'a', original: 'Lin Dong' }],
    text: 'lin dong and LIN DONG',
    options: { field: 'original' },
    expect: ['a', 'a']
  },
  { name: 'Ju does not match inside Ju-han', entries: [{ id: 'ju', original: 'Ju' }], text: 'Ju-han', expect: [] },
  { name: 'Ju does not match inside Just', entries: [{ id: 'ju', original: 'Ju' }], text: 'Just', expect: [] },
  { name: 'Ju matches standalone', entries: [{ id: 'ju', original: 'Ju' }], text: 'Ju.', expect: ['ju'] },
  { name: 'hyphenated name matches whole', entries: [{ id: 'jh', original: 'Ju-han' }], text: 'Ju-han met Ju-han.', expect: ['jh', 'jh'] },
  {
    name: 'astral-plane names match',
    entries: [{ id: 'z', original: String.fromCodePoint(0x20000) }],
    text: `Met ${String.fromCodePoint(0x20000)} here.`,
    expect: ['z']
  },
  {
    name: 'duplicate keys keep the first entry',
    entries: [{ id: 'first', original: 'Lin' }, { id: 'second', original: 'Lin' }],
    text: 'Lin.',
    expect: ['first']
  },
  {
    name: 'all mode returns every whole-word entry at each start (conflict detection)',
    entries: [{ id: 'full', original: 'Jin Byuk-ho' }, { id: 'given', original: 'Byuk-ho' }],
    text: 'Jin Byuk-ho',
    findOptions: { all: true },
    expect: ['full', 'given']
  }
];

for (const c of PARITY_CASES) {
  test(`parity with NameMatcher: ${c.name}`, () => {
    const options = c.options || opts;
    const legacy = NameMatcher.createMatcher(c.entries, options).findAll(c.text, c.findOptions);
    const next = LongestMatcher.createMatcher(c.entries, options).findAll(c.text, c.findOptions);
    assert.deepStrictEqual(ids(legacy), c.expect, 'fixture matches the current NameMatcher behaviour');
    assert.deepStrictEqual(ids(next), c.expect);
    assert.deepStrictEqual(
      next.map((h) => [h.index, h.length, h.value]),
      legacy.map((h) => [h.index, h.length, h.value]),
      'same positions and values as NameMatcher'
    );
  });
}

test('parity: replaceAll rewrites matches in one pass', () => {
  const entries = [{ id: 'a', original: 'Vương' }, { id: 'b', original: 'Vương Lâm' }];
  const text = 'Vương Lâm and Vương';
  const replace = (m) => `[${m.id}]`;
  assert.strictEqual(NameMatcher.createMatcher(entries, opts).replaceAll(text, replace), '[b] and [a]');
  assert.strictEqual(LongestMatcher.createMatcher(entries, opts).replaceAll(text, replace), '[b] and [a]');
});

test('Chinese names match with no word boundaries', () => {
  const matcher = LongestMatcher.createMatcher([{ id: 'ld', original: '林动' }, { id: 'qy', original: '青阳镇' }], opts);
  const hits = matcher.findAll('林动走进青阳镇。');
  assert.deepStrictEqual(ids(hits), ['ld', 'qy']);
  assert.deepStrictEqual(hits.map((h) => [h.index, h.length]), [[0, 2], [4, 3]]);
});

test('the longest Chinese entry wins at the same start', () => {
  const matcher = LongestMatcher.createMatcher([{ id: 'surname', original: '林' }, { id: 'full', original: '林动' }], opts);
  assert.deepStrictEqual(ids(matcher.findAll('林动看着林家。')), ['full', 'surname']);
});

test('adjacent Chinese names are both found', () => {
  const matcher = LongestMatcher.createMatcher([{ id: 'ld', original: '林动' }, { id: 'xy', original: '萧炎' }], opts);
  assert.deepStrictEqual(ids(matcher.findAll('林动萧炎')), ['ld', 'xy']);
});

test('replaceAll tokenizes Chinese text like the translation pipeline', () => {
  const matcher = LongestMatcher.createMatcher([{ id: 'ld', original: '林动' }, { id: 'qy', original: '青阳镇' }], opts);
  let n = 0;
  const tokens = new Map();
  const out = matcher.replaceAll('林动走进青阳镇，林动笑了。', (m) => {
    if (!tokens.has(m.id)) tokens.set(m.id, `@${++n}@`);
    return tokens.get(m.id);
  });
  assert.strictEqual(out, '@1@走进@2@，@1@笑了。');
});

test('Japanese and Korean names match inside unspaced text', () => {
  const ja = LongestMatcher.createMatcher([{ id: 'sato', original: '佐藤' }], opts);
  assert.deepStrictEqual(ids(ja.findAll('佐藤さんは来た。')), ['sato']);
  const ko = LongestMatcher.createMatcher([{ id: 'kim', original: '김철수' }], opts);
  assert.deepStrictEqual(ids(ko.findAll('김철수가 웃었다.')), ['kim'], 'a particle attached to the name does not block the match');
});

test('a higher-tier entry starting inside a lower-tier match wins (name priority)', () => {
  const T = LongestMatcher.TIERS;
  const matcher = LongestMatcher.createMatcher(
    [{ id: 'term', original: '大萧', tier: T.soft }, { id: 'name', original: '萧炎', tier: T.namelist }],
    opts
  );
  assert.deepStrictEqual(ids(matcher.findAll('大萧炎来了')), ['name']);
});

test('equal tiers keep plain greedy longest-match', () => {
  const matcher = LongestMatcher.createMatcher(
    [{ id: 'term', original: '大萧' }, { id: 'name', original: '萧炎' }],
    opts
  );
  assert.deepStrictEqual(ids(matcher.findAll('大萧炎来了')), ['term']);
});

test('after rejecting a lower-tier match the next shorter candidate is tried', () => {
  const T = LongestMatcher.TIERS;
  const matcher = LongestMatcher.createMatcher(
    [
      { id: 'short', original: '大', tier: T.soft },
      { id: 'long', original: '大萧', tier: T.soft },
      { id: 'name', original: '萧炎', tier: T.namelist }
    ],
    opts
  );
  assert.deepStrictEqual(ids(matcher.findAll('大萧炎')), ['short', 'name']);
});

test('tiers default to name list > locked glossary > soft glossary', () => {
  const T = LongestMatcher.TIERS;
  assert(T.namelist > T.locked && T.locked > T.soft, 'tier order');
  const matcher = LongestMatcher.createMatcher(
    [{ id: 'soft', original: '长老会', tier: T.soft }, { id: 'locked', original: '老会长', tier: T.locked }],
    opts
  );
  assert.deepStrictEqual(ids(matcher.findAll('长老会长')), ['locked']);
});

test('a duplicate key keeps the higher-tier entry', () => {
  const T = LongestMatcher.TIERS;
  const matcher = LongestMatcher.createMatcher(
    [
      { id: 'soft', original: '青阳', translation: 'Green Sun', tier: T.soft },
      { id: 'name', original: '青阳', translation: 'Qingyang', tier: T.namelist }
    ],
    opts
  );
  const [hit] = matcher.findAll('青阳');
  assert.strictEqual(hit.id, 'name');
  assert.strictEqual(hit.translation, 'Qingyang');
  assert.strictEqual(hit.tier, T.namelist);
});

test('a higher-tier entry at the same start beats a longer lower-tier entry', () => {
  const T = LongestMatcher.TIERS;
  const matcher = LongestMatcher.createMatcher(
    [{ id: 'sect', original: 'Lin Dong Sect', tier: T.locked }, { id: 'name', original: 'Lin Dong', tier: T.namelist }],
    opts
  );
  assert.deepStrictEqual(ids(matcher.findAll('Lin Dong Sect rose.')), ['name']);
});

test('entries can override case sensitivity individually', () => {
  const matcher = LongestMatcher.createMatcher(
    [{ id: 'name', original: 'Wang Lin', caseSensitive: true }, { id: 'term', original: 'Qi', caseSensitive: false }],
    { field: 'original', caseSensitive: true }
  );
  assert.deepStrictEqual(ids(matcher.findAll('Wang Lin felt QI. wang lin felt qi.')), ['name', 'term', 'term']);
  const hits = matcher.findAll('QI');
  assert.strictEqual(hits[0].value, 'Qi', 'reports the entry value, not the source casing');
});

test('a case-sensitive and a case-insensitive entry can share the same letters', () => {
  const T = LongestMatcher.TIERS;
  const matcher = LongestMatcher.createMatcher(
    [{ id: 'name', original: 'Lin', caseSensitive: true, tier: T.namelist }, { id: 'term', original: 'lin', caseSensitive: false, tier: T.locked }],
    opts
  );
  assert.deepStrictEqual(ids(matcher.findAll('Lin and lin and LIN.')), ['name', 'term', 'term']);
});

test('strict overlap mode rejects a match when a longer entry starts inside it', () => {
  const entries = [{ id: 'qy', original: '青阳' }, { id: 'yzz', original: '阳镇长' }];
  assert.deepStrictEqual(ids(LongestMatcher.createMatcher(entries, opts).findAll('青阳镇长')), ['qy'], 'greedy by default');
  assert.deepStrictEqual(
    ids(LongestMatcher.createMatcher(entries, { ...opts, overlap: 'strict' }).findAll('青阳镇长')),
    ['yzz'],
    'strict mode lets the longer overlapping entry win'
  );
});

test('matches report index, length, value, original, translation and tier', () => {
  const matcher = LongestMatcher.createMatcher([{ id: 'ld', original: '林动', translation: 'Lin Dong' }], opts);
  const [hit] = matcher.findAll('他是林动');
  assert.deepStrictEqual(
    { ...hit },
    { index: 2, length: 2, id: 'ld', value: '林动', original: '林动', translation: 'Lin Dong', tier: LongestMatcher.TIERS.namelist }
  );
});

test('a whole chapter with thousands of entries scans quickly', () => {
  const entries = [];
  for (let i = 0; i < 5000; i++) entries.push({ id: `n${i}`, original: `名${String.fromCharCode(0x4e00 + i)}字` });
  const text = '他说：“名一字来了。”'.repeat(2000);
  const started = Date.now();
  const hits = LongestMatcher.createMatcher(entries, opts).findAll(text);
  assert.strictEqual(hits.length, 2000);
  assert(Date.now() - started < 1000, `took ${Date.now() - started}ms`);
});

test('exposes the same global shape as NameMatcher', () => {
  assert.strictEqual(typeof globalThis.LongestMatcher.createMatcher, 'function');
  assert.strictEqual(typeof globalThis.LongestMatcher.isWordChar, 'function');
});

console.log(`--- Longest Matcher Test Suite: ${passed}/${passed + failed} passed ---`);
if (failed > 0) process.exit(1);
console.log('Longest Matcher Test Suite: ALL TESTS PASSED!');
