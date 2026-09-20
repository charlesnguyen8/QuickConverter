const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('--- Running Typography & Web Fonts Test Suite ---');

const repoRoot = path.resolve(__dirname, '..');

const fonts = [
  { key: 'unkempt', name: 'Unkempt', files: ['fonts/unkempt-regular.woff2', 'fonts/unkempt-bold.woff2'], css: "'Unkempt', cursive, sans-serif" },
  { key: 'patrick-hand', name: 'Patrick Hand', files: ['fonts/patrick-hand.ttf'], css: "'Patrick Hand', cursive, sans-serif" },
  { key: 'merienda', name: 'Merienda', files: ['fonts/merienda-regular.ttf', 'fonts/merienda-bold.ttf'], css: "'Merienda', cursive, serif" },
  { key: 'pangolin', name: 'Pangolin', files: ['fonts/pangolin.ttf'], css: "'Pangolin', cursive, sans-serif" },
  { key: 'playwrite-vn', name: 'Playwrite VN', files: ['fonts/playwrite-vn.ttf'], css: "'Playwrite VN', cursive, sans-serif" },
  { key: 'sedgwick-ave', name: 'Sedgwick Ave Display', files: ['fonts/sedgwick-ave-display.ttf'], css: "'Sedgwick Ave Display', cursive, sans-serif" },
  { key: 'mynerve', name: 'Mynerve', files: ['fonts/mynerve.ttf'], css: "'Mynerve', cursive, sans-serif" },
  { key: 'fuzzy-bubbles', name: 'Fuzzy Bubbles', files: ['fonts/fuzzy-bubbles-regular.ttf', 'fonts/fuzzy-bubbles-bold.ttf'], css: "'Fuzzy Bubbles', cursive, sans-serif" }
];

// 1. Verify font files exist on disk
for (const font of fonts) {
  for (const file of font.files) {
    const fullPath = path.join(repoRoot, file);
    assert(fs.existsSync(fullPath), `Missing font file on disk: ${file}`);
  }
}
console.log('✓ All 11 font binaries exist on disk in fonts/');

// 2. Inspect views/reader.html
const readerHtml = fs.readFileSync(path.join(repoRoot, 'views', 'reader.html'), 'utf8');
assert(readerHtml.includes('href="../styles/tailwind.css"'), 'Missing ../styles/tailwind.css in views/reader.html');
for (const font of fonts) {
  assert(readerHtml.includes(`font-family: '${font.name}'`), `Missing @font-face for ${font.name} in views/reader.html`);
  assert(readerHtml.includes(`value="${font.key}"`), `Missing option value="${font.key}" in views/reader.html`);
}
assert(readerHtml.includes("url('../fonts/"), 'Font URLs in views/reader.html must use ../fonts/ prefix');
console.log('✓ views/reader.html: verified stylesheet, @font-face rules, and font options');

// 3. Inspect views/settings.html
const settingsHtml = fs.readFileSync(path.join(repoRoot, 'views', 'settings.html'), 'utf8');
assert(settingsHtml.includes('href="../styles/tailwind.css"'), 'Missing ../styles/tailwind.css in views/settings.html');
for (const font of fonts) {
  assert(settingsHtml.includes(`font-family: '${font.name}'`), `Missing @font-face for ${font.name} in views/settings.html`);
  assert(settingsHtml.includes(`value="${font.key}"`), `Missing option value="${font.key}" in views/settings.html`);
}
assert(settingsHtml.includes("url('../fonts/"), 'Font URLs in views/settings.html must use ../fonts/ prefix');
console.log('✓ views/settings.html: verified stylesheet, @font-face rules, and font options');

// 4. Inspect views/reader.js & views/settings.js font resolvers
const readerJs = fs.readFileSync(path.join(repoRoot, 'views', 'reader.js'), 'utf8');
const settingsJs = fs.readFileSync(path.join(repoRoot, 'views', 'settings.js'), 'utf8');

for (const font of fonts) {
  assert(readerJs.includes(`case '${font.key}':`), `Missing case '${font.key}' in views/reader.js`);
  assert(readerJs.includes(`return "${font.css}"`), `Missing return "${font.css}" in views/reader.js`);

  assert(settingsJs.includes(`case '${font.key}':`), `Missing case '${font.key}' in views/settings.js`);
  assert(settingsJs.includes(`return "${font.css}"`), `Missing return "${font.css}" in views/settings.js`);
}
console.log('✓ views/reader.js & views/settings.js: verified font CSS family resolution mapping');

// 5. Inspect manifest.json
const manifest = JSON.parse(fs.readFileSync(path.join(repoRoot, 'manifest.json'), 'utf8'));
assert(manifest.web_accessible_resources, 'Missing web_accessible_resources in manifest.json');
assert(manifest.web_accessible_resources[0].resources.includes('fonts/*'), 'Missing fonts/* in web_accessible_resources');

console.log('✓ manifest.json: web_accessible_resources verified');
console.log('🎉 Typography & Web Fonts Test Suite: ALL TESTS PASSED!\n');
