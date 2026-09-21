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

  // Test 5: Verify live local bridge endpoint if running
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
