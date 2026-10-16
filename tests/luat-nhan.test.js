const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('\n--- Running LuatNhan Rules & Numbers Test Suite ---');

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

const env = { console };
env.window = env;
env.globalThis = env;
vm.createContext(env);
vm.runInContext(read('src', 'services', 'qt-numbers.js'), env);
vm.runInContext(read('src', 'services', 'luat-nhan.js'), env);
const N = env.QtNumbers;
const L = env.LuatNhan;

test('findLongestNumber takes the longest number and skips a lone unit', () => {
  assert.deepStrictEqual(plain(N.findLongestNumber('三万五百人', 0)), { start: 0, length: 4, text: '三万五百' });
  assert.strictEqual(N.findLongestNumber('万', 0), null);
});

test('convertChineseNumber handles Chinese, digit-by-digit and mixed numbers', () => {
  assert.strictEqual(N.convertChineseNumber('十'), 10);
  assert.strictEqual(N.convertChineseNumber('一百二十三'), 123);
  assert.strictEqual(N.convertChineseNumber('一二三'), 123);
  assert.strictEqual(N.convertChineseNumber('3万5'), 35000);
  assert.strictEqual(N.convertChineseNumber('一亿二千三百四十五万六千七百八十九'), 123456789);
});

test('numberToVietnameseText and translateNumber follow QT formatting and ranges', () => {
  assert.strictEqual(N.numberToVietnameseText(1234), '1,234');
  assert.strictEqual(N.numberToVietnameseText(123456789), '1 ức 2,345 vạn 6,789');
  for (const [input, expected] of [
    ['三四万', '3-4 vạn'],
    ['三四千万', '3000-4000 vạn'],
    ['十一二万', '11 vạn-12 vạn'],
    ['三万四五', '3 vạn 4,000-3 vạn 5,000'],
    ['二十三四', '23-24'],
    ['一二', '1-2'],
    ['001', '001'],
    ['1.25', '1.25'],
    ['三百', '300']
  ]) {
    assert.strictEqual(N.translateNumber(input), expected, input);
  }
});

test('numberModifier moves 余/多 after a following large unit', () => {
  assert.strictEqual(N.numberModifier('三余万五多百'), '三万余五百多');
});

test('prescanNumbers skips numbers that are VietPhrase keys', () => {
  const vietPhrase = new Map([['一二三', 'một hai ba']]);
  const found = N.prescanNumbers('一二三', (key) => vietPhrase.has(key));
  assert.deepStrictEqual(plain([...found.values()]), [{ start: 1, length: 2, text: '二三' }]);
  assert.strictEqual(N.prescanNumbers('一二三', () => false).size, 1);
});

const RULES = [
  ['{s}年{s}月{s}号', 'ngày {3} tháng {2} năm {1}'],
  ['{s}月{s}号', 'ngày {2} tháng {1}'],
  ['{s}分之{s}', '{2}/{1}'],
  ['百分[之]?{s}', '{s}%'],
  ['第{s}(更|章)', 'chương {s}:'],
  ['在{n}身后', 'sau lưng {n}']
];

function engine(dictionaryN = new Map([['他', 'hắn']]), vietPhraseHas = () => false) {
  return L.createRules(RULES, { dictionaryN, vietPhraseHas });
}

function apply(rules, input) {
  const matched = rules.contains(input);
  assert(matched, `no rule matched ${input}`);
  return { matched, text: rules.translate(input.slice(matched.index, matched.index + matched.length), matched.key, matched.valueN) };
}

test('chapter, percentage, fraction and date rules translate like QT', () => {
  const rules = engine();
  for (const [input, expected] of [
    ['第十二章', 'chương 12:'],
    ['百分之三点五', '3.5%'],
    ['三分之四', '4/3'],
    ['2025年7月21号', 'ngày 21 tháng 7 năm 2025']
  ]) {
    const { matched, text } = apply(rules, input);
    assert.strictEqual(matched.index, 0, input);
    assert.strictEqual(text, expected, input);
  }
});

test('a single-digit day becomes "mùng"', () => {
  assert.strictEqual(apply(engine(), '三月五号').text, 'mùng 5 tháng 3');
});

test('{n} resolves through the pronoun/name list', () => {
  const { matched, text } = apply(engine(), '在他身后');
  assert.strictEqual(matched.valueN, 'hắn');
  assert.strictEqual(text, 'sau lưng hắn');
});

test('a failed {n} lookup moves on to the next non-overlapping match', () => {
  const matched = engine().contains('在X身后在他身后');
  assert.deepStrictEqual([matched.index, matched.length, matched.valueN], [4, 4, 'hắn']);
});

test('an {s} match that is itself a VietPhrase key is not used', () => {
  const rules = engine(new Map(), (key) => key === '第十二章');
  assert.strictEqual(rules.contains('第十二章'), null);
});

test('parseRules follows QT line rules and skips comments', () => {
  const parsed = L.parseRules('﻿# comment\n{s}年=năm {s}\n{s}年=khác\na=b=c\n\n第{s}章=chương {s}');
  assert.deepStrictEqual(plain(parsed), [['{s}年', 'năm {s}'], ['第{s}章', 'chương {s}']]);
});

test('every rule in the bundled LuatNhan.txt compiles', () => {
  const parsed = L.parseRules(read('src', 'dict', 'LuatNhan.txt'));
  assert(parsed.length > 250, `expected the full rule set, got ${parsed.length}`);
  const rules = L.createRules(parsed, { dictionaryN: new Map([['他', 'hắn']]), vietPhraseHas: () => false });
  assert(rules.ruleCount > 250, `compiled ${rules.ruleCount}`);
  const { text } = apply(rules, '第十二章');
  assert(/12/.test(text), `chapter rule from the real file: ${text}`);
});

console.log(`--- LuatNhan Rules & Numbers Test Suite: ${passed}/${passed + failed} passed ---`);
if (failed > 0) process.exit(1);
console.log('LuatNhan Rules & Numbers Test Suite: ALL TESTS PASSED!');
