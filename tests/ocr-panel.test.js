const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadComponent } = require('./helpers/render');

console.log('\n--- Running OCR Reading Panel Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');
const read = (...p) => fs.readFileSync(path.join(repoRoot, ...p), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));

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

function makeStorageEnv() {
  const stores = { novels: {}, chapters: {} };
  const makeRequest = (result) => {
    const req = { result, onsuccess: null, onerror: null };
    setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
    return req;
  };
  const fakeStore = (name) => ({
    getAll: () => makeRequest(Object.values(stores[name])),
    get: (id) => makeRequest(stores[name][id] || null),
    put: (record) => { stores[name][record.id] = { ...record }; },
    delete: (id) => { delete stores[name][id]; },
    clear: () => { stores[name] = {}; }
  });
  const mockDatabase = {
    transaction() {
      const tx = { objectStore: (name) => fakeStore(name), oncomplete: null, onerror: null };
      setTimeout(() => { if (tx.oncomplete) tx.oncomplete(); }, 0);
      return tx;
    }
  };
  const ls = { quickconverter_db_initialized: 'true' };
  const aiCalls = [];
  const provider = {
    fetchChapterContent: async () => ({ title: 'Ch 7', rawText: 'Lin Dong walked into Qingyang Town.' })
  };
  const env = {
    console,
    URL,
    setTimeout,
    clearTimeout,
    localStorage: {
      getItem: (k) => (k in ls ? ls[k] : null),
      setItem: (k, v) => { ls[k] = String(v); },
      removeItem: (k) => { delete ls[k]; }
    },
    indexedDB: {
      open() {
        const req = { result: mockDatabase, onsuccess: null, onerror: null, onupgradeneeded: null };
        setTimeout(() => { if (req.onsuccess) req.onsuccess(); }, 0);
        return req;
      }
    },
    ProviderRegistry: {
      getProviderForUrl: () => provider,
      getProviderForDomain: () => provider
    },
    AIService: {
      async getProviderConfig() {
        return { provider: 'custom', baseUrl: 'http://127.0.0.1:8000/v1', customUrl: 'http://127.0.0.1:8000/v1' };
      },
      async translateChapter(params) {
        aiCalls.push(params);
        if (typeof params.onChunk === 'function') params.onChunk({ type: 'content', fullText: 'EN' });
        return {
          translatedText: `VI[${params.rawText}]<<<NAME_LIST_START>>>Wang Lin=Vương Lâm<<<NAME_LIST_END>>>`,
          modelUsed: 'test-model',
          costInfo: { formattedCost: '$0.01' },
          usage: { total_tokens: 10 }
        };
      }
    }
  };
  env.window = env;
  env.self = env;
  env.globalThis = env;
  vm.createContext(env);
  vm.runInContext(read('src', 'services', 'name-matcher.js'), env);
  vm.runInContext(read('src', 'services', 'storage.js'), env);
  const S = env.StorageService || env.window.StorageService;
  return { env, S, stores, aiCalls };
}

async function seedNovel(S, stores) {
  stores.novels['novel-1'] = {
    id: 'novel-1',
    title: '武动',
    slug: '100181750',
    url: 'https://www.nkwwlkj.cn/book/book_detail/100181750',
    domain: 'www.nkwwlkj.cn',
    chapterList: [],
    createdAt: 1
  };
  await S.saveNameList('novel-1', [{ id: 'n1', original: 'Lin Dong', translation: 'Lâm Động', addedAt: 1 }]);
  await S.saveNameList('novel-1', [{ id: 'g1', original: 'Qingyang Town', translation: 'Thanh Dương trấn', addedAt: 1 }], 'locked');
}

const TRANSLATION = { enabled: true, apiKey: 'sk-local', prompt: 'Translate to English.', model: 'm1', provider: 'custom', baseUrl: 'http://127.0.0.1:8000/v1' };

(async () => {
  await test('characterization: downloadChapter tokenizes names, pre-translates locked terms and restores the result', async () => {
    const { S, stores, aiCalls } = makeStorageEnv();
    await seedNovel(S, stores);
    await S.downloadChapter('novel-1', 7, { translation: { ...TRANSLATION } });

    assert.strictEqual(aiCalls.length, 1);
    assert.strictEqual(aiCalls[0].rawText, '@1@ walked into §Thanh Dương trấn§.');
    assert(aiCalls[0].prompt.startsWith('Translate to English.'), 'uses the given prompt');
    assert(aiCalls[0].prompt.includes('@1@'), 'adds the placeholder instruction when names were tokenized');

    const saved = stores.chapters['novel-1_ch7'];
    assert(saved, 'chapter is saved');
    assert.strictEqual(saved.rawText, 'VI[Lâm Động walked into Thanh Dương trấn.]');
    assert.strictEqual(saved.originalRawText, 'Lin Dong walked into Qingyang Town.');
    assert.strictEqual(saved.isTranslated, true);
    assert.strictEqual(saved.modelUsed, 'test-model');

    const names = await S.getNameList('novel-1');
    assert(names.some((n) => n.original === 'Wang Lin' && n.translation === 'Vương Lâm'), 'captured names are added to the name list');
  });

  await test('translateText runs the same pipeline without saving anything', async () => {
    const { S, stores, aiCalls } = makeStorageEnv();
    await seedNovel(S, stores);
    const chunks = [];
    const result = await S.translateText('novel-1', 'Lin Dong walked into Qingyang Town.', { ...TRANSLATION }, { onChunk: (c) => chunks.push(c) });

    assert.strictEqual(aiCalls[0].rawText, '@1@ walked into §Thanh Dương trấn§.');
    assert.strictEqual(result.text, 'VI[Lâm Động walked into Thanh Dương trấn.]');
    assert.strictEqual(result.modelUsed, 'test-model');
    assert(plain(result.names).some((n) => n.original === 'Wang Lin' && n.translation === 'Vương Lâm'), 'returns the captured names');
    assert(chunks.length > 0, 'streams chunks to onChunk');
    assert.deepStrictEqual(Object.keys(stores.chapters), [], 'no chapter is saved');
    const names = await S.getNameList('novel-1');
    assert(!names.some((n) => n.original === 'Wang Lin'), 'name list is not modified');
  });

  await test('translateText tells the model the source came from OCR when asked', async () => {
    const { S, stores, aiCalls } = makeStorageEnv();
    await seedNovel(S, stores);
    await S.translateText('novel-1', 'Lin Dong walked into Qingyang Town.', { ...TRANSLATION }, { ocrSource: true });
    assert(/OCR/.test(aiCalls[0].prompt) && /misread/i.test(aiCalls[0].prompt), 'prompt explains the text came from OCR and may contain misread characters');
  });

  await test('translateText works without a managed novel', async () => {
    const { S, aiCalls } = makeStorageEnv();
    const result = await S.translateText(null, 'Lin Dong walked into Qingyang Town.', { ...TRANSLATION });
    assert.strictEqual(aiCalls[0].rawText, 'Lin Dong walked into Qingyang Town.', 'no name list or glossary applied');
    assert.strictEqual(aiCalls[0].prompt, 'Translate to English.');
    assert.strictEqual(result.text, 'VI[Lin Dong walked into Qingyang Town.]');
  });

  const ocrText = await loadComponent('components/react/ocr/ocrText.js');
  const line = (text, x, y, h = 24) => [{ text, box: { x, y, width: 700, height: h }, confidence: 0.99 }];

  await test('assembleParagraphs joins wrapped lines and splits on indented starts', () => {
    const lines = [
      line('汉末，天下将乱，黄巾未起。曹刘之辈', 46, 10),
      line('摩拳擦掌，意在争龙夺鼎。', 10, 44),
      line('陈舒不想夺鼎，他只想破除这吃人的世', 46, 78),
      line('道。', 10, 112)
    ];
    assert.strictEqual(
      ocrText.assembleParagraphs(lines),
      '汉末，天下将乱，黄巾未起。曹刘之辈摩拳擦掌，意在争龙夺鼎。\n\n陈舒不想夺鼎，他只想破除这吃人的世道。'
    );
  });

  await test('assembleParagraphs also splits on a large vertical gap and keeps same-line pieces in order', () => {
    const lines = [
      [{ text: '第一段', box: { x: 46, y: 10, width: 80, height: 24 }, confidence: 0.9 }, { text: '结束。', box: { x: 130, y: 10, width: 60, height: 24 }, confidence: 0.9 }],
      line('第二段开始。', 10, 120)
    ];
    assert.strictEqual(ocrText.assembleParagraphs(lines), '第一段结束。\n\n第二段开始。');
  });

  await test('assembleParagraphs detects indents with padded detection boxes (tall boxes, clamped left edge)', () => {
    const box = (x, y, text) => [{ text, box: { x, y, width: text.length * 18 + 48, height: 48 }, confidence: 0.99 }];
    const lines = [
      box(22, 0, '汉末，天下将乱，黄巾未起。曹刘之辈摩拳擦掌'),
      box(0, 40, '意在争龙夺鼎。'),
      box(22, 80, '陈舒不想夺鼎，他只想破除这吃人的世道。门户'),
      box(0, 120, '私计，我辈不为也！'),
      box(22, 160, '老者检查过陈舒的腿。')
    ];
    assert.strictEqual(
      ocrText.assembleParagraphs(lines),
      ['汉末，天下将乱，黄巾未起。曹刘之辈摩拳擦掌意在争龙夺鼎。', '陈舒不想夺鼎，他只想破除这吃人的世道。门户私计，我辈不为也！', '老者检查过陈舒的腿。'].join('\n\n')
    );
  });

  await test('assembleParagraphs ends a paragraph after a line that stops short of the right margin', () => {
    const box = (y, text, width) => [{ text, box: { x: 40, y, width, height: 22 }, confidence: 0.99 }];
    const lines = [
      box(15, '汉末，天下将乱，黄巾未起。曹刘之辈摩拳擦掌，意在争龙夺鼎', 576),
      box(55, '。', 20),
      box(95, '老者检查过陈舒的腿。', 190),
      box(135, '陈舒不想夺鼎。', 130)
    ];
    assert.strictEqual(
      ocrText.assembleParagraphs(lines),
      ['汉末，天下将乱，黄巾未起。曹刘之辈摩拳擦掌，意在争龙夺鼎。', '老者检查过陈舒的腿。', '陈舒不想夺鼎。'].join(String.fromCharCode(10, 10))
    );
  });

  await test('assembleParagraphs ignores empty input', () => {
    assert.strictEqual(ocrText.assembleParagraphs([]), '');
    assert.strictEqual(ocrText.assembleParagraphs(null), '');
  });

  await test('planStrips cuts a tall image only at blank rows near the target height', () => {
    const height = 3000;
    const blank = Array.from({ length: height }, (_, y) => y % 34 >= 26);
    const strips = ocrText.planStrips(blank, 1000);
    assert.strictEqual(strips[0][0], 0, 'starts at the top');
    assert.strictEqual(strips[strips.length - 1][1], height, 'ends at the bottom');
    for (let i = 1; i < strips.length; i++) {
      assert.strictEqual(strips[i][0], strips[i - 1][1], 'strips are contiguous');
      assert(blank[strips[i][0]], `cut at row ${strips[i][0]} is blank`);
    }
    for (const [a, b] of strips) assert(b - a <= 1000 && b - a > 0, `strip ${a}-${b} is within the target height`);
  });

  await test('planStrips keeps short images whole and falls back to a hard cut with no blank rows', () => {
    assert.deepStrictEqual(plain(ocrText.planStrips(Array(800).fill(false), 1000)), [[0, 800]]);
    const solid = ocrText.planStrips(Array(2500).fill(false), 1000);
    assert.deepStrictEqual(plain(solid), [[0, 1000], [1000, 2000], [2000, 2500]]);
  });

  await test('isOcrImageMessage accepts only image messages from the parent frame', () => {
    const parent = {};
    const bytes = new ArrayBuffer(8);
    const ok = { source: parent, data: { type: 'QC_OCR_IMAGE', bytes, mimeType: 'image/png' } };
    assert.strictEqual(ocrText.isOcrImageMessage(ok, parent), true);
    assert.strictEqual(ocrText.isOcrImageMessage({ ...ok, source: {} }, parent), false, 'other frames are ignored');
    assert.strictEqual(ocrText.isOcrImageMessage({ source: parent, data: { type: 'QC_OCR_IMAGE', bytes: 'x' } }, parent), false, 'bytes must be an ArrayBuffer');
    assert.strictEqual(ocrText.isOcrImageMessage({ source: parent, data: { type: 'OTHER', bytes } }, parent), false);
    assert.strictEqual(ocrText.isOcrImageMessage({ source: parent, data: null }, parent), false);
  });

  await test('the provider flags image-only chapter pages (paid chapters render as images even when unlocked)', () => {
    const env = { console, URL };
    env.globalThis = env;
    vm.createContext(env);
    vm.runInContext(read('src', 'providers', 'nkwwlkj.js'), env);
    const P = env.NkwwlkjProvider;
    const imagePage = '<div class="article-title">第一章</div><div class="read-bd" id="J_ImgRead"><div id="J_BookImage"></div></div>';
    const textPage = '<div class="article-title">第一章</div><div class="read-bd" id="J_BookRead"><p class="chapter">正文。</p></div>';
    assert.strictEqual(P.parseChapterPageHtml(imagePage).imageOnly, true);
    assert.strictEqual(P.parseChapterPageHtml(textPage).imageOnly, false);
    assert.strictEqual(P.isImageChapter({ documentElement: { outerHTML: imagePage } }), true);
    assert.strictEqual(P.isImageChapter({ documentElement: { outerHTML: textPage } }), false);
  });

  await test('captureChapterImage reuses the image the page already shows and never re-requests it', async () => {
    const env = { console, URL };
    env.globalThis = env;
    vm.createContext(env);
    vm.runInContext(read('src', 'providers', 'nkwwlkj.js'), env);
    const P = env.NkwwlkjProvider;

    const imageUrl = 'https://www.nkwwlkj.cn/chapter/book_chapter_image?chapter_id=1&image_code=once';
    const loaded = [];
    let fetched = false;
    class FakeImage {
      set src(v) { this._src = v; loaded.push(v); }
      get src() { return this._src; }
      async decode() { this.naturalWidth = 939; this.naturalHeight = 4200; }
    }
    const drawn = [];
    const fakeDoc = {
      getElementById: (id) => (id === 'J_BookImage' ? { id } : null),
      createElement: (tag) => {
        assert.strictEqual(tag, 'canvas');
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => ({ fillStyle: '', fillRect() {}, drawImage: (img, x, y) => drawn.push([img.src, x, y, canvas.width, canvas.height]) }),
          toBlob: (cb, type) => cb({ type, arrayBuffer: async () => new ArrayBuffer(16) })
        };
        return canvas;
      }
    };
    const fakeWin = {
      Image: FakeImage,
      fetch: () => { fetched = true; throw new Error('must not fetch'); },
      getComputedStyle: () => ({ backgroundImage: `url("${imageUrl}")` })
    };

    const result = await P.captureChapterImage(fakeDoc, fakeWin);
    assert.strictEqual(fetched, false, 'the one-time image URL is never fetched again');
    assert.deepStrictEqual(loaded, [imageUrl], 'loads the URL the page already displayed');
    assert.deepStrictEqual(drawn, [[imageUrl, 0, 0, 939, 4200]], 'draws it at full size');
    assert.strictEqual(result.width, 939);
    assert.strictEqual(result.height, 4200);
    assert.strictEqual(result.mimeType, 'image/png');
    assert.strictEqual(result.bytes.byteLength, 16, 'returns the PNG bytes from the canvas');
  });

  await test('captureChapterImage returns null when the page shows no chapter image', async () => {
    const env = { console, URL };
    env.globalThis = env;
    vm.createContext(env);
    vm.runInContext(read('src', 'providers', 'nkwwlkj.js'), env);
    const result = await env.NkwwlkjProvider.captureChapterImage(
      { getElementById: () => null },
      { getComputedStyle: () => ({ backgroundImage: 'none' }) }
    );
    assert.strictEqual(result, null);
  });

  await test('the OCR panel is built as an extension page with bundled models and the wasm runtime', () => {
    const vite = read('vite.config.mjs');
    assert(/ocr:\s*'views\/ocr-panel\.html'/.test(vite), 'vite builds views/ocr-panel.html');
    assert(/'ocr'/.test(vite), 'vite copies src/ocr into dist');
    assert(vite.includes('ort-wasm-simd-threaded.wasm'), 'vite copies the ONNX Runtime wasm binary');
    assert(vite.includes('ort-wasm-simd-threaded.mjs'), 'vite copies the ONNX Runtime wasm loader');
    assert(/onnxruntime-web\/wasm/.test(vite), 'onnxruntime-web is aliased to its wasm-only build');
    for (const f of ['PP-OCRv6_tiny_det.ort', 'PP-OCRv6_tiny_rec.ort', 'ppocrv6_tiny_dict.txt']) {
      assert(fs.existsSync(path.join(repoRoot, 'src', 'ocr', 'models', f)), `src/ocr/models/${f} is bundled`);
    }
    const html = read('src', 'views', 'ocr-panel.html');
    assert(html.includes('id="ocr-root"'), 'panel shell has #ocr-root');
    assert(html.includes('components/react/ocr/ocr-entry.jsx'), 'panel shell mounts the OCR entry');
    assert(html.indexOf('services/storage.js') >= 0 && html.indexOf('services/ai-service.js') >= 0, 'panel loads storage and AI services');
  });

  await test('the manifest allows WebAssembly on extension pages and exposes the panel to the site', () => {
    const manifest = JSON.parse(read('manifest.json'));
    const csp = manifest.content_security_policy && manifest.content_security_policy.extension_pages;
    assert(csp && csp.includes("'wasm-unsafe-eval'") && csp.includes("script-src 'self'"), 'extension_pages CSP allows wasm');
    const war = manifest.web_accessible_resources.find((r) => r.resources.includes('views/*'));
    assert(war, 'views/* stays web accessible so the panel can be framed');
  });

  console.log(`--- OCR Reading Panel Test Suite: ${passed}/${passed + failed} passed ---`);
  if (failed > 0) process.exit(1);
  console.log('OCR Reading Panel Test Suite: ALL TESTS PASSED!');
})();
