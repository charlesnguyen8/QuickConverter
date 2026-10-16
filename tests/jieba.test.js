const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

console.log('\n--- Running Jieba Segmentation Test Suite ---');

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
  const env = { console, ...extra };
  env.window = env;
  env.globalThis = env;
  vm.createContext(env);
  vm.runInContext(read('src', 'services', 'jieba.js'), env);
  return env;
}

(async () => {
  const env = loadEnv();
  const started = Date.now();
  const jieba = env.Jieba.create({
    dictText: read('src', 'dict', 'jieba', 'dict.txt'),
    probEmit: JSON.parse(read('src', 'dict', 'jieba', 'prob_emit.json')),
    probTrans: JSON.parse(read('src', 'dict', 'jieba', 'prob_trans.json'))
  });
  const buildMs = Date.now() - started;
  const words = (text) => jieba.cut(text).map((token) => token.word);

  await test('segments like Jieba precise mode', () => {
    assert.deepStrictEqual([...words('我来到北京清华大学')], ['我', '来到', '北京', '清华大学']);
  });

  await test('the HMM finds words missing from the dictionary', () => {
    assert.deepStrictEqual([...words('他来到了网易杭研大厦')], ['他', '来到', '了', '网易', '杭研', '大厦']);
  });

  await test('dictionary words with Latin letters stay whole', () => {
    assert.deepStrictEqual([...words('AT&T和B超')], ['AT&T', '和', 'B超']);
  });

  await test('tokens carry their start offset in the text', () => {
    const tokens = jieba.cut('，我来到北京。');
    assert.deepStrictEqual(JSON.parse(JSON.stringify(tokens.map((t) => [t.word, t.start]))), [['，', 0], ['我', 1], ['来到', 2], ['北京', 4], ['。', 6]]);
    const text = '他来到了网易杭研大厦';
    jieba.cut(text).forEach((t) => assert.strictEqual(text.slice(t.start, t.start + t.word.length), t.word));
  });

  await test('hasWord reports dictionary words only, not prefixes or HMM words', () => {
    assert.strictEqual(jieba.hasWord('清华大学'), true);
    assert.strictEqual(jieba.hasWord('清华大'), false, 'a prefix is not a word');
    assert.strictEqual(jieba.hasWord('杭研'), false);
  });

  await test('builds the full dictionary in reasonable time', () => {
    assert(buildMs < 8000, `building took ${buildMs}ms`);
  });

  await test('Jieba.load fetches the bundled files once', async () => {
    const urls = [];
    const fetchEnv = loadEnv({
      fetch: async (url) => {
        urls.push(url);
        const body = url.endsWith('dict.txt') ? '北京 10 ns\n' : url.endsWith('prob_trans.json') ? read('src', 'dict', 'jieba', 'prob_trans.json') : '{"B":{},"M":{},"E":{},"S":{}}';
        return { ok: true, text: async () => body, json: async () => JSON.parse(body) };
      }
    });
    const first = await fetchEnv.Jieba.load();
    const second = await fetchEnv.Jieba.load();
    assert.strictEqual(first, second);
    assert.strictEqual(first.hasWord('北京'), true);
    assert.deepStrictEqual(urls.sort(), ['../dict/jieba/dict.txt', '../dict/jieba/prob_emit.json', '../dict/jieba/prob_trans.json']);
  });

  console.log(`--- Jieba Segmentation Test Suite: ${passed}/${passed + failed} passed (dictionary built in ${buildMs}ms) ---`);
  if (failed > 0) process.exit(1);
  console.log('Jieba Segmentation Test Suite: ALL TESTS PASSED!');
})();
