const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- Running Custom API & AI Provider Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');

// Mock browser environments for testing in Node
global.localStorage = {
  _data: {},
  getItem(k) { return this._data[k] !== undefined ? this._data[k] : null; },
  setItem(k, v) { this._data[k] = String(v); },
  removeItem(k) { delete this._data[k]; },
  clear() { this._data = {}; }
};

global.chrome = {
  storage: {
    local: {
      get(keys, cb) {
        const res = {};
        for (const k of keys) {
          if (global.localStorage.getItem(k) !== null) res[k] = global.localStorage.getItem(k);
        }
        cb(res);
      },
      set(items, cb) {
        for (const [k, v] of Object.entries(items)) {
          global.localStorage.setItem(k, v);
        }
        if (cb) cb();
      }
    }
  }
};

const CustomApiService = require(path.join(repoRoot, 'services', 'custom-api.js'));
const DeepSeekService = require(path.join(repoRoot, 'services', 'deepseek.js'));
const AIService = require(path.join(repoRoot, 'services', 'ai-service.js'));

// Test 1: Verify CustomApiService constants and standalone helpers
assert(CustomApiService.DEFAULT_BASE_URL === 'http://127.0.0.1:8000/v1', 'CustomApiService DEFAULT_BASE_URL must be http://127.0.0.1:8000/v1');
assert(CustomApiService.DEFAULT_KEY === 'sk-local', 'CustomApiService DEFAULT_KEY must be sk-local');
assert(CustomApiService.TIMEOUT_MS === 180000, 'CustomApiService TIMEOUT_MS must be 180s');
assert.strictEqual(CustomApiService.isLocalUrl('http://127.0.0.1:8000/v1'), true);
assert.strictEqual(CustomApiService.isLocalUrl('http://localhost:11434/v1'), true);
assert.strictEqual(CustomApiService.isLocalUrl('https://my-cloud-llm.com/v1'), false);
console.log('✓ CustomApiService constants, timeouts, and local loopback detection verified');

// Test 2: Verify CustomApiService configuration persistence
(async () => {
  await CustomApiService.setConfig({ customUrl: 'http://127.0.0.1:9999/v1', customApiKey: 'sk-custom-secret' });
  const cfg = await CustomApiService.getConfig();
  assert.strictEqual(cfg.customUrl, 'http://127.0.0.1:9999/v1');
  assert.strictEqual(cfg.customApiKey, 'sk-custom-secret');
  assert.strictEqual(cfg.isLocal, true);

  // Reset back to default
  await CustomApiService.setConfig({ customUrl: 'http://127.0.0.1:8000/v1', customApiKey: '' });
  const resetCfg = await CustomApiService.getConfig();
  assert.strictEqual(resetCfg.customUrl, 'http://127.0.0.1:8000/v1');
  console.log('✓ CustomApiService standalone storage and configuration persistence verified');

  // Test 3: Verify AIService provider coordination
  assert.strictEqual(AIService.PROVIDER_OFFICIAL, 'official');
  assert.strictEqual(AIService.PROVIDER_CUSTOM, 'custom');

  // Default is official
  let aiCfg = await AIService.getProviderConfig();
  assert.strictEqual(aiCfg.provider, 'official');
  assert.strictEqual(aiCfg.isOfficial, true);
  assert.strictEqual(aiCfg.baseUrl, 'https://api.deepseek.com');

  // Switch to custom
  await AIService.setProviderConfig({ provider: 'custom', customUrl: 'http://localhost:8000/v1' });
  aiCfg = await AIService.getProviderConfig();
  assert.strictEqual(aiCfg.provider, 'custom');
  assert.strictEqual(aiCfg.isCustom, true);
  assert.strictEqual(aiCfg.baseUrl, 'http://localhost:8000/v1');

  // Reset back to official
  await AIService.setProviderConfig({ provider: 'official' });
  aiCfg = await AIService.getProviderConfig();
  assert.strictEqual(aiCfg.provider, 'official');
  assert.strictEqual(aiCfg.isOfficial, true);
  console.log('✓ AIService provider router and configuration switching verified');

  // Test 4: Verify Backward-Compatibility on DeepSeekService
  assert.strictEqual(typeof DeepSeekService.getProviderConfig, 'function');
  assert.strictEqual(typeof DeepSeekService.setProviderConfig, 'function');
  assert.strictEqual(DeepSeekService.PROVIDER_CUSTOM, 'custom');
  assert.strictEqual(DeepSeekService.CUSTOM_DEFAULT_URL, 'http://127.0.0.1:8000/v1');
  console.log('✓ DeepSeekService backward-compatibility delegates verified');

  // Test 5: SSE Stream Reading & Content Accumulation
  function createMockSseResponse(chunks, headers = { 'content-type': 'text/event-stream' }) {
    const encoder = new TextEncoder();
    return {
      ok: true,
      status: 200,
      headers: {
        get: (h) => headers[h.toLowerCase()] || null
      },
      body: {
        getReader() {
          let idx = 0;
          return {
            async read() {
              if (idx >= chunks.length) return { done: true, value: undefined };
              const chunk = chunks[idx++];
              const bytes = typeof chunk === 'string' ? encoder.encode(chunk) : chunk;
              return { done: false, value: bytes };
            },
            releaseLock() {}
          };
        }
      }
    };
  }

  const sseChunksBasic = [
    'data: {"choices":[{"delta":{"role":"assistant"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"Chapter 1: "}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"The Wind Rises."}}]}\n\n',
    'data: [DONE]\n\n'
  ];
  const streamResult1 = await CustomApiService._readSseStream(createMockSseResponse(sseChunksBasic));
  assert.strictEqual(streamResult1.content, 'Chapter 1: The Wind Rises.');
  assert.strictEqual(streamResult1.reasoning, null);
  console.log('✓ SSE stream decoding and content accumulation verified');

  // Test 6: DeepSeek-R1 reasoning_content stream
  const sseChunksReasoning = [
    'data: {"choices":[{"delta":{"reasoning_content":"Thinking about character names... "}}]}\n\n',
    'data: {"choices":[{"delta":{"reasoning_content":"Translating tone..."}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"The night was quiet."}}]}\n\n',
    'data: [DONE]\n\n'
  ];
  const streamResult2 = await CustomApiService._readSseStream(createMockSseResponse(sseChunksReasoning));
  assert.strictEqual(streamResult2.reasoning, null, 'Reasoning process must be discarded and not accumulated');
  assert.strictEqual(streamResult2.content, 'The night was quiet.');
  console.log('✓ DeepSeek-R1 reasoning_content discarded from persistent output verified');

  // Test 7: Fragmented chunks across buffer boundaries (mid-JSON split)
  const fragmentedChunks = [
    'data: {"choices":[{"del',
    'ta":{"content":"Frag',
    'mented "}}]}\n\ndata: {"choices":[{"delta":{"content":"Text"}}]}\n\ndata: [DONE]\n\n'
  ];
  const streamResult3 = await CustomApiService._readSseStream(createMockSseResponse(fragmentedChunks));
  assert.strictEqual(streamResult3.content, 'Fragmented Text');
  console.log('✓ Fragmented SSE chunks reassembly across packet boundaries verified');

  // Test 8: onChunk callback verification (can still observe thinking in real-time if listener attached)
  const receivedChunks = [];
  await CustomApiService._readSseStream(createMockSseResponse(sseChunksReasoning), {
    onChunk: (c) => receivedChunks.push(c)
  });
  assert.strictEqual(receivedChunks.length, 3);
  assert.strictEqual(receivedChunks[0].type, 'reasoning');
  assert.strictEqual(receivedChunks[0].delta, 'Thinking about character names... ');
  assert.strictEqual(receivedChunks[2].type, 'content');
  assert.strictEqual(receivedChunks[2].delta, 'The night was quiet.');
  console.log('✓ onChunk streaming deltas callback verified');

  // Test 9: Non-streaming JSON fallback
  const mockJsonResponse = {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({
      choices: [{ message: { content: 'Fallback JSON content', reasoning_content: 'Fallback reasoning' } }],
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 }
    })
  };
  const streamResult4 = await CustomApiService._readSseStream(mockJsonResponse);
  assert.strictEqual(streamResult4.content, 'Fallback JSON content');
  assert.strictEqual(streamResult4.reasoning, null, 'Fallback reasoning must be discarded');
  assert.strictEqual(streamResult4.usage.total_tokens, 15);
  console.log('✓ Non-streaming application/json fallback verified');

  // Test 10: CustomApiService.translateChapter with streaming mock (reasoning discarded)
  const originalFetch = global.fetch;
  global.fetch = async (url, opts) => {
    assert(opts.body.includes('"stream":true'), 'Request payload must have stream: true');
    return createMockSseResponse([
      'data: {"choices":[{"delta":{"reasoning_content":"Step 1"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"Translated Chapter Stream"}}]}\n\n',
      'data: [DONE]\n\n'
    ]);
  };

  const customTransRes = await CustomApiService.translateChapter({
    rawText: '第一章 测试',
    prompt: 'Translate'
  });
  assert.strictEqual(customTransRes.translatedText, 'Translated Chapter Stream');
  assert.strictEqual(customTransRes.reasoningText, null, 'reasoningText must be discarded (null)');
  assert.strictEqual(customTransRes.isCustom, true);
  assert.strictEqual(customTransRes.costInfo.costUSD, 0);
  console.log('✓ CustomApiService.translateChapter stream: true end-to-end verified (reasoning discarded)');

  // Test 11: DeepSeekService.translateChapter with streaming mock and usage
  global.fetch = async (url, opts) => {
    assert(opts.body.includes('"stream":true'), 'Request payload must have stream: true');
    return createMockSseResponse([
      'data: {"choices":[{"delta":{"content":"Official Translation"}}]}\n\n',
      'data: {"choices":[],"usage":{"prompt_tokens":100,"completion_tokens":50,"total_tokens":150}}\n\n',
      'data: [DONE]\n\n'
    ]);
  };

  const dsTransRes = await DeepSeekService.translateChapter({
    apiKey: 'sk-test-key',
    rawText: '第一章 官方测试',
    prompt: 'Translate'
  });
  assert.strictEqual(dsTransRes.translatedText, 'Official Translation');
  assert.strictEqual(dsTransRes.usage.total_tokens, 150);
  assert(dsTransRes.costInfo !== null, 'Official service must calculate costInfo');
  console.log('✓ DeepSeekService.translateChapter stream: true end-to-end verified');

  // Restore fetch
  global.fetch = originalFetch;

  // Test 12: Verify live local bridge endpoint if running
  const http = require('http');
  const req = http.get('http://127.0.0.1:8000/v1/models', { timeout: 3000 }, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        const json = JSON.parse(data);
        if (json.data && Array.isArray(json.data)) {
          const modelIds = json.data.map(m => m.id);
          console.log(`✓ Live bridge active: ${modelIds.length} models detected via CustomApiService`);
        }
      } catch (e) {}
      console.log('\n🎉 Custom API & AI Provider Test Suite: ALL TESTS PASSED!\n');
    });
  });

  req.on('error', () => {
    console.log('ℹ Local bridge server not active; unit checks passed');
    console.log('\n🎉 Custom API & AI Provider Test Suite: ALL TESTS PASSED!\n');
  });

  req.on('timeout', () => {
    req.destroy();
    console.log('\n🎉 Custom API & AI Provider Test Suite: ALL TESTS PASSED!\n');
  });
})();
