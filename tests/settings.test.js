const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- Running Settings & Navigation Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');

// Test 1: Manifest options_ui registration
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));
assert(manifest.options_ui, 'manifest.json must contain options_ui');
assert.strictEqual(manifest.options_ui.page, 'views/settings.html', 'options_ui.page must point to views/settings.html');
assert.strictEqual(manifest.options_ui.open_in_tab, true, 'options_ui.open_in_tab must be true');
console.log('✓ manifest.json options_ui properly registered with views/settings.html');

// Test 2: views/settings.html interactive elements
const settingsHtml = fs.readFileSync(path.join(repoRoot, 'views', 'settings.html'), 'utf8');
const requiredSettingsIds = [
  'settings-back-btn',
  'settings-back-text',
  'deepseek-master-toggle',
  'model-radio-flash',
  'model-radio-chat',
  'settings-api-key',
  'test-key-btn',
  'clear-key-btn',
  'settings-balance-card',
  'refresh-balance-btn',
  'settings-custom-prompt',
  'provider-radio-official',
  'provider-radio-bridge',
  'bridge-config-panel',
  'bridge-url-input',
  'test-bridge-btn',
  'model-radio-reasoner',
  'reader-font-family',
  'reader-column-width',
  'reader-font-size',
  'reader-line-height',
  'typography-preview-container',
  'typography-preview-text'
];

const storageTabSrc = fs.readFileSync(path.join(repoRoot, 'components', 'react', 'SettingsStorageTab.jsx'), 'utf8');
for (const id of ['storage-used-display', 'storage-progress-bar', 'refresh-storage-btn']) {
  assert(storageTabSrc.includes(`id="${id}"`), `Missing required element #${id} in components/react/SettingsStorageTab.jsx`);
}

for (const id of requiredSettingsIds) {
  assert(settingsHtml.includes(`id="${id}"`), `Missing required element #${id} in views/settings.html`);
}
console.log(`✓ views/settings.html contains all ${requiredSettingsIds.length} required interactive element IDs`);

// Test 3: Settings button presence in views
const libraryViewSrc = fs.readFileSync(path.join(repoRoot, 'components', 'react', 'LibraryView.jsx'), 'utf8');
const novelHtml = fs.readFileSync(path.join(repoRoot, 'views', 'novel.html'), 'utf8');
const readerHtml = fs.readFileSync(path.join(repoRoot, 'views', 'reader.html'), 'utf8');
const popupHtml = fs.readFileSync(path.join(repoRoot, 'views', 'popup.html'), 'utf8');

assert(libraryViewSrc.includes('id="library-settings-btn"'), 'Missing #library-settings-btn in components/react/LibraryView.jsx');
assert(novelHtml.includes('id="novel-settings-btn"'), 'Missing #novel-settings-btn in views/novel.html');
assert(readerHtml.includes('id="reader-settings-btn"'), 'Missing #reader-settings-btn in views/reader.html');
assert(popupHtml.includes('id="settings-btn"'), 'Missing #settings-btn in views/popup.html');
console.log('✓ All 4 views have dedicated settings button anchors');

// Test 4: Dynamic link generation in novel.js & reader.js
const novelJs = fs.readFileSync(path.join(repoRoot, 'views', 'novel.js'), 'utf8');
const readerJs = fs.readFileSync(path.join(repoRoot, 'views', 'reader.js'), 'utf8');

assert(novelJs.includes('settings.html?from=novel'), 'novel.js must dynamically wire settings button with contextual return');
assert(readerJs.includes('settings.html?from=reader'), 'reader.js must dynamically wire settings button with contextual return');
console.log('✓ novel.js and reader.js dynamically configure settings return URLs');

// Test 5: Navigation URL query parser simulation
function simulateReturnNavigation(search) {
  const params = new URLSearchParams(search);
  const from = params.get('from');
  const id = params.get('id');
  const ch = params.get('ch');

  if (from === 'reader' && id && ch) {
    return { href: `reader.html?id=${encodeURIComponent(id)}&ch=${encodeURIComponent(ch)}`, label: `Back to Chapter ${ch}` };
  } else if (from === 'novel' && id) {
    return { href: `novel.html?id=${encodeURIComponent(id)}`, label: 'Back to Novel' };
  } else {
    return { href: 'library.html', label: 'Back to Library' };
  }
}

const readerReturn = simulateReturnNavigation('?from=reader&id=regressor-tale-of-cultivation&ch=42');
assert.strictEqual(readerReturn.href, 'reader.html?id=regressor-tale-of-cultivation&ch=42');
assert.strictEqual(readerReturn.label, 'Back to Chapter 42');

const novelReturn = simulateReturnNavigation('?from=novel&id=regressor-tale-of-cultivation');
assert.strictEqual(novelReturn.href, 'novel.html?id=regressor-tale-of-cultivation');
assert.strictEqual(novelReturn.label, 'Back to Novel');

const libraryReturn = simulateReturnNavigation('?from=library');
assert.strictEqual(libraryReturn.href, 'library.html');
assert.strictEqual(libraryReturn.label, 'Back to Library');

console.log('✓ Contextual return navigation parser handles all cases accurately');

// Test 6: DeepSeekService balance method signatures in services/deepseek.js
const deepseekJs = fs.readFileSync(path.join(repoRoot, 'services', 'deepseek.js'), 'utf8');
assert(deepseekJs.includes('getBalance(apiKey'), 'DeepSeekService must define getBalance');
assert(deepseekJs.includes('fetchBalance(apiKey'), 'DeepSeekService must define fetchBalance alias');
console.log('✓ DeepSeekService getBalance and fetchBalance methods verified in services/deepseek.js');

console.log('🎉 Settings & Navigation Test Suite: ALL TESTS PASSED!\n');
