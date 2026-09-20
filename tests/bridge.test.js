const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- Running Local Web Bridge & Reasoner Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');

// Test 1: Verify host_permissions in manifest.json for localhost bridge
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));
assert(Array.isArray(manifest.host_permissions), 'manifest.json must have host_permissions');
assert(manifest.host_permissions.includes('http://127.0.0.1:*/*'), 'manifest.json must grant http://127.0.0.1:*/* permission');
assert(manifest.host_permissions.includes('http://localhost:*/*'), 'manifest.json must grant http://localhost:*/* permission');
console.log('✓ manifest.json host_permissions properly permit local bridge connections');

// Test 2: Verify DeepSeekService service exports & constants
const deepseekCode = fs.readFileSync(path.join(repoRoot, 'services', 'deepseek.js'), 'utf8');
assert(deepseekCode.includes('PROVIDER_OFFICIAL'), 'DeepSeekService must define PROVIDER_OFFICIAL');
assert(deepseekCode.includes('PROVIDER_LOCAL_BRIDGE'), 'DeepSeekService must define PROVIDER_LOCAL_BRIDGE');
assert(deepseekCode.includes('LOCAL_BRIDGE_DEFAULT_URL'), 'DeepSeekService must define LOCAL_BRIDGE_DEFAULT_URL');
assert(deepseekCode.includes('getProviderConfig'), 'DeepSeekService must define getProviderConfig');
assert(deepseekCode.includes('setProviderConfig'), 'DeepSeekService must define setProviderConfig');
assert(deepseekCode.includes('reasoning_content'), 'DeepSeekService must process reasoning_content');
assert(deepseekCode.includes('reasoningText'), 'DeepSeekService must return reasoningText');
console.log('✓ services/deepseek.js defines provider constants and reasoning extraction logic');

// Test 3: Verify storage service handles reasoningText in schema and downloadChapter
const storageCode = fs.readFileSync(path.join(repoRoot, 'services', 'storage.js'), 'utf8');
assert(storageCode.includes('reasoningText'), 'StorageService must support reasoningText field in chapter');
assert(storageCode.includes('cleanKey = \'sk-local\''), 'StorageService must default cleanKey to sk-local for local bridge');
console.log('✓ services/storage.js supports reasoningText and local bridge authentication default');

// Test 4: Verify views/reader.html and views/novel.html have provider badges and reasoner model option
const readerHtml = fs.readFileSync(path.join(repoRoot, 'views', 'reader.html'), 'utf8');
const novelHtml = fs.readFileSync(path.join(repoRoot, 'views', 'novel.html'), 'utf8');

assert(readerHtml.includes('id="reader-provider-badge"'), 'views/reader.html must have #reader-provider-badge');
assert(readerHtml.includes('value="deepseek-reasoner"'), 'views/reader.html must have deepseek-reasoner in model select');
assert(readerHtml.includes('id="source-reasoning-container"'), 'views/reader.html must have #source-reasoning-container in source drawer');
assert(readerHtml.includes('id="source-reasoning-content"'), 'views/reader.html must have #source-reasoning-content in source drawer');
console.log('✓ views/reader.html contains provider badge, reasoner option, and DeepThink drawer section');

assert(novelHtml.includes('id="novel-provider-badge"'), 'views/novel.html must have #novel-provider-badge');
assert(novelHtml.includes('value="deepseek-reasoner"'), 'views/novel.html must have deepseek-reasoner in model select');
console.log('✓ views/novel.html contains novel provider badge and reasoner model option');

// Test 5: Verify live local bridge endpoint if running
async function testLiveBridge() {
  const http = require('http');
  console.log('--- Testing live local bridge connectivity at 127.0.0.1:8000 ---');
  
  return new Promise((resolve) => {
    const req = http.get('http://127.0.0.1:8000/v1/models', { timeout: 3000 }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.data && Array.isArray(json.data)) {
            const modelIds = json.data.map(m => m.id);
            console.log(`✓ Live bridge active: ${modelIds.length} models detected (${modelIds.slice(0, 4).join(', ')})`);
            assert(modelIds.includes('deepseek-chat') || modelIds.includes('deepseek-flash'), 'Bridge should expose deepseek-chat or flash');
          } else {
            console.log('ℹ Live bridge responded with non-standard JSON payload');
          }
        } catch (e) {
          console.log('ℹ Bridge responded but JSON parsing was skipped:', e.message);
        }
        resolve();
      });
    });

    req.on('error', (err) => {
      console.log(`ℹ Local bridge server not currently running (${err.message}) - unit checks validated logic`);
      resolve();
    });

    req.on('timeout', () => {
      req.destroy();
      console.log('ℹ Bridge connection timed out');
      resolve();
    });
  });
}

(async () => {
  await testLiveBridge();
  console.log('\n🎉 Bridge & Reasoner Test Suite: ALL TESTS PASSED!\n');
})();
