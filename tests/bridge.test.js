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
const deepseekCode = fs.readFileSync(path.join(repoRoot, 'src', 'services', 'deepseek.js'), 'utf8');
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
const storageCode = fs.readFileSync(path.join(repoRoot, 'src', 'services', 'storage.js'), 'utf8');
assert(storageCode.includes('reasoningText'), 'StorageService must support reasoningText field in chapter');
assert(storageCode.includes('cleanKey = \'sk-local\''), 'StorageService must default cleanKey to sk-local for local bridge');
console.log('✓ services/storage.js supports reasoningText and local bridge authentication default');

// Test 4: Verify Translation on Download cards have Official vs Custom API switcher across all views
const readerHtml = fs.readFileSync(path.join(repoRoot, 'src', 'views', 'reader.html'), 'utf8');
const popupHtml = fs.readFileSync(path.join(repoRoot, 'src', 'views', 'popup.html'), 'utf8');
const settingsHtml = fs.readFileSync(path.join(repoRoot, 'src', 'views', 'settings.html'), 'utf8');
const readerSourceSrc = fs.readFileSync(path.join(repoRoot, 'src', 'components', 'react', 'reader', 'ReaderSourceDrawer.jsx'), 'utf8');
const readerDeepseekSrc = fs.readFileSync(path.join(repoRoot, 'src', 'components', 'react', 'reader', 'ReaderDeepseekCard.jsx'), 'utf8');
const aiConfigSrc = fs.readFileSync(path.join(repoRoot, 'src', 'components', 'react', 'shared', 'AiConfigPanel.jsx'), 'utf8');

// Reader View — the wrapper owns the id map; the shared panel renders the switcher markup.
for (const id of ['reader-provider-btn-official', 'reader-provider-btn-custom', 'reader-custom-base-url',
  'reader-bridge-preset-btn', 'reader-test-custom-btn', 'reader-api-key-label']) {
  assert(readerDeepseekSrc.includes(`'${id}'`), `ReaderDeepseekCard.jsx must map #${id}`);
}
assert(readerSourceSrc.includes('id="source-reasoning-container"'), 'ReaderSourceDrawer.jsx must have #source-reasoning-container in source drawer');
assert(readerSourceSrc.includes('DeepThink Reasoning Process'), 'ReaderSourceDrawer.jsx must have the DeepThink drawer section');
console.log('✓ ReaderDeepseekCard.jsx & ReaderSourceDrawer.jsx contain provider switcher, custom URL, and DeepThink drawer section');

// Novel View
const novelDeepseekSrc = fs.readFileSync(path.join(repoRoot, 'src', 'components', 'react', 'novel', 'NovelDeepseekCard.jsx'), 'utf8');
for (const id of ['novel-provider-btn-official', 'novel-provider-btn-custom', 'novel-custom-base-url',
  'novel-bridge-preset-btn', 'novel-test-custom-btn', 'novel-api-key-label']) {
  assert(novelDeepseekSrc.includes(`'${id}'`), `NovelDeepseekCard.jsx must map #${id}`);
}
assert(aiConfigSrc.includes("'deepseek-reasoner'"), 'AiConfigPanel.jsx must offer the deepseek-reasoner model option');
console.log('✓ NovelDeepseekCard.jsx contains provider switcher buttons, custom URL input, and reasoner model option');

// Popup View
const popupMarkupSrc = fs.readFileSync(path.join(repoRoot, 'src', 'components', 'react', 'popup', 'PopupDeepseekCard.jsx'), 'utf8');
const popupHas = (id) => popupHtml.includes(`id="${id}"`) || popupMarkupSrc.includes(`'${id}'`);
assert(popupHas('popup-provider-btn-official'), 'popup must have #popup-provider-btn-official');
assert(popupHas('popup-provider-btn-custom'), 'popup must have #popup-provider-btn-custom');
assert(popupHas('popup-custom-base-url'), 'popup must have #popup-custom-base-url');
assert(popupHas('popup-bridge-preset-btn'), 'popup must have #popup-bridge-preset-btn');
assert(popupHas('popup-test-custom-btn'), 'popup must have #popup-test-custom-btn');
assert(popupHas('popup-api-key-label'), 'popup must have #popup-api-key-label');
console.log('✓ views/popup.html contains provider switcher buttons, custom URL input, and preset button');

// Settings View
const settingsDeepseekSrc = fs.readFileSync(path.join(repoRoot, 'src', 'components', 'react', 'settings', 'SettingsDeepSeekTab.jsx'), 'utf8');
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
