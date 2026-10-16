const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('\n--- Running Name Finder Test Suite ---');

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
vm.runInContext(read('src', 'services', 'jieba.js'), env);
vm.runInContext(read('src', 'services', 'name-finder.js'), env);
const jieba = env.Jieba.create({
  dictText: read('src', 'dict', 'jieba', 'dict.txt'),
  probEmit: JSON.parse(read('src', 'dict', 'jieba', 'prob_emit.json')),
  probTrans: JSON.parse(read('src', 'dict', 'jieba', 'prob_trans.json'))
});

const HAN_VIET = new Map(Object.entries({
  萧: 'tiêu', 炎: 'viêm', 林: 'lâm', 动: 'động', 天: 'thiên', 城: 'thành', 名: 'danh', 为: 'vi', 叫: 'khiếu',
  张: 'trương', 三: 'tam', 走: 'tẩu', 来: 'lai', 见: 'kiến', 到: 'đáo', 了: 'liễu', 幽: 'u', 暗: 'ám', 洞: 'động',
  穴: 'huyệt', 里: 'lí', 无: 'vô', 比: 'bỉ', 姜: 'khương', 太: 'thái', 阿: 'a', 转: 'chuyển', 身: 'thân', 的: 'đích',
  青: 'thanh', 阳: 'dương', 去: 'khứ', 很: 'ngận', 大: 'đại', 他: 'tha', 读: 'độc', 斗: 'đấu', 破: 'phá', 苍: 'thương', 穹: 'khung'
}));

function find(text, overrides = {}) {
  const deps = {
    jieba,
    hanViet: HAN_VIET,
    vietPhrase: new Map([['走来', 'đi tới']]),
    names: new Set(),
    hoNguoi: new Map([['萧', 'Tiêu'], ['张', 'Trương']]),
    hauTu: new Map(),
    danhTu: new Map([['之城', '{0} chi thành']]),
    known: new Map(),
    rejected: new Set(),
    ...overrides
  };
  return env.NameFinder.find(text, deps, overrides.options || {});
}

const byText = (candidates, text) => candidates.find((c) => c.text === text);

test('keeps a rare name after an introduction word, with a Hán Việt suggestion', () => {
  const candidate = byText(find('来人名为萧炎。'), '萧炎');
  assert(candidate, 'triggered rare name');
  assert.strictEqual(candidate.suggested, 'Tiêu Viêm');
  assert.strictEqual(candidate.entityType, 'person');
  assert.strictEqual(candidate.occurrences, 1);
});

test('names you already have are returned as known with your translation', () => {
  const candidate = byText(find('林动走来。', { known: new Map([['林动', 'Lâm Động']]) }), '林动');
  assert(candidate && candidate.known);
  assert.strictEqual(candidate.score, 1);
  assert.strictEqual(candidate.suggested, 'Lâm Động');
});

test('known names can be left out', () => {
  const found = find('林动走来。林动走来。', { known: new Map([['林动', 'Lâm Động']]), options: { includeKnown: false } });
  assert(!byText(found, '林动'));
});

test('rejected names stay suppressed', () => {
  assert(!byText(find('萧炎见到了萧炎。', { rejected: new Set(['萧炎']) }), '萧炎'));
});

test('names already in a names dictionary are not suggested again', () => {
  assert(!byText(find('来人名为萧炎。', { names: new Set(['萧炎']) }), '萧炎'));
});

test('a common VietPhrase word is rejected despite a surname prefix', () => {
  const found = find('幽暗洞穴里，幽暗无比。', { vietPhrase: new Map([['幽暗', 'u ám']]), hoNguoi: new Map([['幽', 'U']]) });
  assert(!byText(found, '幽暗'));
});

test('a surname followed by a known proper noun is kept', () => {
  const candidate = byText(find('姜太阿转身。', { vietPhrase: new Map([['太阿', 'Thái A']]), hoNguoi: new Map([['姜', 'Khương']]) }), '姜太阿');
  assert(candidate, 'surname + proper noun');
  assert.strictEqual(candidate.suggested, 'Khương Thái A');
});

test('candidates containing stopwords are rejected', () => {
  assert(find('幽暗的洞穴。幽暗的洞穴。').every((c) => !c.text.includes('的')));
});

test('places get a DanhTu-style suggestion', () => {
  const candidate = byText(find('他去了青阳城。青阳城很大。青阳城很大。青阳城很大。', { danhTu: new Map([['城', '{0} thành']]) }), '青阳城');
  assert(candidate, 'a place mentioned four times with a location suffix');
  assert(!byText(find('他去了青阳城。青阳城很大。', { danhTu: new Map([['城', '{0} thành']]) }), '青阳城'), 'two mentions alone stay below the 0.6 score threshold');
  assert.strictEqual(candidate.entityType, 'location');
  assert.strictEqual(candidate.suggested, 'Thanh Dương thành');
});

test('book titles in 《》 are suggested', () => {
  const candidate = byText(find('他读了《斗破苍穹》。'), '《斗破苍穹》');
  assert(candidate, 'book title');
  assert.strictEqual(candidate.entityType, 'title');
  assert.strictEqual(candidate.score, 0.9);
  assert(candidate.suggested.includes('Đấu Phá Thương Khung'), candidate.suggested);
});

test('fragments that always start inside a known or stronger name are dropped', () => {
  const deps = {
    hoNguoi: new Map([['萧', 'Tiêu'], ['张', 'Trương'], ['炎', 'Viêm']]),
    hauTu: new Map([['来', 'lai']])
  };
  const found = find('萧炎走来。萧炎走来。萧炎走来。', { ...deps, known: new Map([['萧炎', 'Tiêu Viêm']]) });
  assert(!byText(found, '炎走来'), 'starts inside 萧炎 every time');
  assert(byText(found, '萧炎'), 'the known name itself stays');
  const alone = find('炎走来。炎走来。炎走来。', deps);
  assert(byText(alone, '炎走来'), 'the same fragment on its own is still a candidate');
});

test('ranges are UTF-16 offsets into the text', () => {
  const candidate = byText(find('😀萧炎', { known: new Map([['萧炎', 'Tiêu Viêm']]) }), '萧炎');
  assert.deepStrictEqual(plain(candidate.ranges), [{ start: 2, length: 2 }]);
});

test('candidates are ordered known first, then by score', () => {
  const found = find('来人名为萧炎。林动走来。', { known: new Map([['林动', 'Lâm Động']]) });
  assert.strictEqual(found[0].text, '林动');
  for (let i = 2; i < found.length; i++) assert(found[i - 1].known || found[i - 1].score >= found[i].score);
});

console.log(`--- Name Finder Test Suite: ${passed}/${passed + failed} passed ---`);
if (failed > 0) process.exit(1);
console.log('Name Finder Test Suite: ALL TESTS PASSED!');
