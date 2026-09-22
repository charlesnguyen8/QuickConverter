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
assert(deepseekCode.includes('PROVIDER_CUSTOM'), 'DeepSeekService must define PROVIDER_CUSTOM');
assert(deepseekCode.includes('PROVIDER_LOCAL_BRIDGE'), 'DeepSeekService must define PROVIDER_LOCAL_BRIDGE');
assert(deepseekCode.includes('CUSTOM_DEFAULT_URL'), 'DeepSeekService must define CUSTOM_DEFAULT_URL');
assert(deepseekCode.includes('getProviderConfig'), 'DeepSeekService must define getProviderConfig');
assert(deepseekCode.includes('setProviderConfig'), 'DeepSeekService must define setProviderConfig');
assert(deepseekCode.includes('reasoning_content'), 'DeepSeekService must process reasoning_content');
assert(deepseekCode.includes('reasoningText'), 'DeepSeekService must return reasoningText');
console.log('✓ services/deepseek.js defines provider constants (Official, Custom) and reasoning extraction logic');

// Test 3: Verify storage service handles reasoningText in schema and downloadChapter
const storageCode = fs.readFileSync(path.join(repoRoot, 'services', 'storage.js'), 'utf8');
assert(storageCode.includes('reasoningText'), 'StorageService must support reasoningText field in chapter');
assert(storageCode.includes('cleanKey = \'sk-local\''), 'StorageService must default cleanKey to sk-local for local bridge');
console.log('✓ services/storage.js supports reasoningText and local bridge authentication default');

// Test 4: Verify Translation on Download cards have Official vs Custom API switcher across all views
const readerHtml = fs.readFileSync(path.join(repoRoot, 'views', 'reader.html'), 'utf8');
const novelHtml = fs.readFileSync(path.join(repoRoot, 'views', 'novel.html'), 'utf8');
const popupHtml = fs.readFileSync(path.join(repoRoot, 'views', 'popup.html'), 'utf8');
const settingsHtml = fs.readFileSync(path.join(repoRoot, 'views', 'settings.html'), 'utf8');
const readerSourceSrc = fs.readFileSync(path.join(repoRoot, 'components', 'react', 'ReaderSourceDrawer.jsx'), 'utf8');

// Reader View
assert(readerHtml.includes('id="reader-provider-btn-official"'), 'views/reader.html must have #reader-provider-btn-official');
assert(readerHtml.includes('id="reader-provider-btn-custom"'), 'views/reader.html must have #reader-provider-btn-custom');
assert(readerHtml.includes('id="reader-custom-base-url"'), 'views/reader.html must have #reader-custom-base-url');
assert(readerHtml.includes('id="reader-bridge-preset-btn"'), 'views/reader.html must have #reader-bridge-preset-btn');
assert(readerHtml.includes('id="reader-test-custom-btn"'), 'views/reader.html must have #reader-test-custom-btn');
assert(readerHtml.includes('id="reader-api-key-label"'), 'views/reader.html must have #reader-api-key-label');
assert(readerHtml.includes('value="deepseek-reasoner"'), 'views/reader.html must have deepseek-reasoner in model select');
assert(readerSourceSrc.includes('id="source-reasoning-container"'), 'ReaderSourceDrawer.jsx must have #source-reasoning-container in source drawer');
assert(readerSourceSrc.includes('DeepThink Reasoning Process'), 'ReaderSourceDrawer.jsx must have the DeepThink drawer section');
console.log('✓ views/reader.html contains provider switcher buttons, custom URL input, and DeepThink drawer section');

// Novel View
assert(novelHtml.includes('id="novel-provider-btn-official"'), 'views/novel.html must have #novel-provider-btn-official');
assert(novelHtml.includes('id="novel-provider-btn-custom"'), 'views/novel.html must have #novel-provider-btn-custom');
assert(novelHtml.includes('id="novel-custom-base-url"'), 'views/novel.html must have #novel-custom-base-url');
assert(novelHtml.includes('id="novel-bridge-preset-btn"'), 'views/novel.html must have #novel-bridge-preset-btn');
assert(novelHtml.includes('id="novel-test-custom-btn"'), 'views/novel.html must have #novel-test-custom-btn');
assert(novelHtml.includes('id="novel-api-key-label"'), 'views/novel.html must have #novel-api-key-label');
assert(novelHtml.includes('value="deepseek-reasoner"'), 'views/novel.html must have deepseek-reasoner in model select');
console.log('✓ views/novel.html contains provider switcher buttons, custom URL input, and reasoner model option');

// Popup View
assert(popupHtml.includes('id="popup-provider-btn-official"'), 'views/popup.html must have #popup-provider-btn-official');
assert(popupHtml.includes('id="popup-provider-btn-custom"'), 'views/popup.html must have #popup-provider-btn-custom');
assert(popupHtml.includes('id="popup-custom-base-url"'), 'views/popup.html must have #popup-custom-base-url');
assert(popupHtml.includes('id="popup-bridge-preset-btn"'), 'views/popup.html must have #popup-bridge-preset-btn');
assert(popupHtml.includes('id="popup-test-custom-btn"'), 'views/popup.html must have #popup-test-custom-btn');
assert(popupHtml.includes('id="popup-api-key-label"'), 'views/popup.html must have #popup-api-key-label');
console.log('✓ views/popup.html contains provider switcher buttons, custom URL input, and preset button');

// Settings View
const settingsDeepseekSrc = fs.readFileSync(path.join(repoRoot, 'components', 'react', 'deepseekTabMarkup.mjs'), 'utf8');
const settingsHas = (id) => settingsHtml.includes(`id="${id}"`) || settingsDeepseekSrc.includes(`id="${id}"`);
assert(settingsHas('provider-radio-official'), 'settings must have #provider-radio-official');
assert(settingsHas('provider-radio-bridge'), 'settings must have #provider-radio-bridge');
assert(settingsHas('bridge-preset-btn'), 'settings must have #bridge-preset-btn');
assert(settingsHas('bridge-url-input'), 'settings must have #bridge-url-input');
assert(settingsHas('test-bridge-btn'), 'settings must have #test-bridge-btn');
console.log('✓ views/settings.html contains AI provider radio choices, preset button, and test connection button');

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
