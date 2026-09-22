// QuickConverter - React Component Render Test Suite
// Renders the migrated React components with react-dom/server and asserts the
// markup they produce. Uses esbuild (via tests/helpers/render.js) to compile
// JSX for Node. Effects do not run in renderToString, so these cover
// prop -> markup behavior, not async loading.

const assert = require('assert');
const React = require('react');
const { renderToString } = require('react-dom/server');
const { loadComponent } = require('./helpers/render');

const h = React.createElement;
// React SSR separates adjacent text nodes with <!-- -->; drop them so plain
// string assertions work.
const render = (el) => renderToString(el).replace(/<!--[\s\S]*?-->/g, '');
let failures = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    results.push(`  ✓ ${name}`);
  } catch (err) {
    failures++;
    results.push(`  ✗ ${name}\n      ${err.message}`);
  }
}

(async () => {
  console.log('--- Running React Component Render Test Suite ---');

  const PopupMainView = (await loadComponent('components/react/popup/PopupMainView.jsx')).default;
  const PopupNovelView = (await loadComponent('components/react/popup/PopupNovelView.jsx')).default;
  const PopupDeepseekCard = (await loadComponent('components/react/popup/PopupDeepseekCard.jsx')).default;
  const SettingsDeepSeekTab = (await loadComponent('components/react/settings/SettingsDeepSeekTab.jsx')).default;
  const PopupApp = (await loadComponent('components/react/popup/PopupApp.jsx')).default;

  const baseStatus = {
    variant: 'standard',
    host: 'example.com',
    titlePrefix: 'QuickConverter supports ',
    accent: 'We Tried TLS',
    accentClass: 'text-indigo-300 font-medium',
    titleSuffix: '.',
    subtitle: 'Visit a supported novel series to add it.',
    subtitleClass: 'text-slate-500'
  };

  const novels = [
    { id: 'n1', title: 'Novel One', icon: 'book', totalChapters: 10, domain: 'wetriedtls.com', status: 'Active' },
    { id: 'n2', title: 'Novel Two', domain: 'wetriedtls.com', status: 'Active' }
  ];

  // --- PopupMainView ---
  const detected = render(h(PopupMainView, {
    hidden: false,
    novels,
    status: { ...baseStatus, variant: 'detected', title: 'My Novel', subtitle: 'This novel is not managed yet.', action: 'add', novelInfo: {} },
    addBusy: false,
    onOpenNovel: () => {},
    onDeleteNovel: () => {},
    onAddNovel: () => {},
    onOpenLibrary: () => {},
    onOpenSettings: () => {}
  }));

  test('PopupMainView shows the detected badge and Manage button', () => {
    assert(detected.includes('Novel Detected'), 'expected "Novel Detected" badge');
    assert(detected.includes('Manage This Novel'), 'expected Manage This Novel button when action=add');
  });

  test('PopupMainView lists managed novels and the count', () => {
    assert(detected.includes('Novel One') && detected.includes('Novel Two'), 'expected both novel rows');
    assert(detected.includes('2 Novels'), 'expected the novel count');
    assert(detected.includes('10 Chs'), 'expected chapter count on the row');
    assert(detected.includes('Open Library'), 'expected Open Library button');
  });

  const managed = render(h(PopupMainView, {
    hidden: false,
    novels,
    status: { ...baseStatus, variant: 'managed', title: 'Novel One', subtitle: 'Already under management.', subtitleClass: 'text-emerald-400/90' },
    addBusy: false,
    onOpenNovel: () => {},
    onDeleteNovel: () => {},
    onAddNovel: () => {},
    onOpenLibrary: () => {},
    onOpenSettings: () => {}
  }));

  test('PopupMainView hides the Manage button when the novel is managed', () => {
    assert(managed.includes('Already Managed'), 'expected "Already Managed" badge');
    assert(!managed.includes('Manage This Novel'), 'Manage button must not render for managed novels');
  });

  test('PopupMainView empty state and hidden class', () => {
    const empty = render(h(PopupMainView, {
      hidden: true, novels: [], status: baseStatus, addBusy: false,
      onOpenNovel: () => {}, onDeleteNovel: () => {}, onAddNovel: () => {},
      onOpenLibrary: () => {}, onOpenSettings: () => {}
    }));
    assert(empty.includes('No novels currently managed.'), 'expected empty-state text');
    assert(/id="view-main" class="[^"]*hidden/.test(empty), 'expected hidden class on #view-main');
  });

  // --- PopupNovelView ---
  const novelEmpty = render(h(PopupNovelView, {
    hidden: true, novelId: null, onBack: () => {}, onOpenSettings: () => {}
  }));

  test('PopupNovelView renders empty detail view without a novel', () => {
    assert(novelEmpty.includes('Novel Chapters'), 'expected the detail header');
    assert(novelEmpty.includes('No chapters discovered yet.'), 'expected the empty chapter state');
    assert(/id="view-novel" class="[^"]*hidden/.test(novelEmpty), 'expected hidden class on #view-novel');
  });

  test('PopupNovelView renders the bridged DeepSeek card ids', () => {
    assert(novelEmpty.includes('id="deepseek-toggle"'), 'expected DeepSeek toggle');
    assert(novelEmpty.includes('id="popup-provider-btn-official"'), 'expected provider buttons');
    assert(novelEmpty.includes('id="popup-cooldown-toggle"'), 'expected cooldown toggle');
  });

  // --- PopupDeepseekCard ---
  const card = render(h(PopupDeepseekCard));
  test('PopupDeepseekCard contains the panel ids AiConfigPanel wires', () => {
    for (const id of ['deepseek-toggle', 'popup-provider-btn-official', 'popup-provider-btn-custom',
      'popup-custom-base-url', 'deepseek-model-select', 'deepseek-api-key', 'deepseek-prompt', 'popup-cooldown-toggle']) {
      assert(card.includes(`id="${id}"`), `missing #${id}`);
    }
  });

  // --- SettingsDeepSeekTab ---
  const settingsTab = render(h(SettingsDeepSeekTab));
  test('SettingsDeepSeekTab contains the controller ids', () => {
    for (const id of ['deepseek-master-toggle', 'provider-radio-official', 'provider-radio-bridge',
      'model-radio-flash', 'model-radio-chat', 'model-radio-reasoner', 'settings-api-key',
      'settings-custom-prompt', 'queue-cooldown-toggle', 'queue-cooldown-min', 'queue-cooldown-max',
      'queue-max-retries', 'bridge-url-input']) {
      assert(settingsTab.includes(`id="${id}"`), `missing #${id}`);
    }
  });

  // --- SettingsView (shell) ---
  const SettingsView = (await loadComponent('components/react/settings/SettingsView.jsx')).default;
  const shell = render(h(SettingsView));
  test('SettingsView renders the shell, tabs and toast', () => {
    for (const id of ['settings-back-btn', 'settings-back-text', 'settings-save-pill',
      'settings-toast', 'settings-toast-msg', 'tab-content-deepseek', 'tab-content-reader',
      'tab-content-storage', 'tab-content-about']) {
      assert(shell.includes(`id="${id}"`), `missing #${id}`);
    }
    assert(shell.includes('settings-nav-btn active'), 'expected the first tab to be active');
    assert(shell.includes('About QuickConverter'), 'expected the About content');
  });

  // --- ReaderHeader ---
  const headerMod = await loadComponent('components/react/reader/ReaderHeader.jsx');
  const ReaderHeader = headerMod.default;
  const { computeScrollProgress } = headerMod;
  const header = render(h(ReaderHeader));
  test('ReaderHeader renders nav, font stepper and typography popover', () => {
    for (const id of ['reading-progress-bar', 'back-to-novel-btn', 'header-novel-title',
      'header-chapter-title', 'toggle-source-drawer-btn', 'font-dec-btn', 'font-size-label',
      'font-inc-btn', 'reader-typography-wrapper', 'reader-typography-popover',
      'toggle-typography-popover-btn', 'reader-settings-btn']) {
      assert(header.includes(`id="${id}"`), `missing #${id}`);
    }
    assert(header.includes('value="unkempt"'), 'expected the font family options');
    assert(header.includes('width:0%') && !header.includes("0%;"), 'progress bar must start at width:0% with no malformed style value');
    assert(header.includes('id="reading-progress-track"'), 'expected a fixed progress track behind the bar');
    assert(/id="reading-progress-percent" class="[^"]*fixed/.test(header), 'percentage must be positioned with the top progress bar');
    assert(/id="reading-progress-percent" class="[^"]*transition-all/.test(header), 'percentage must animate at the same speed as the bar');
    assert(!header.includes('Reading progress'), 'percentage must not live in the header titles');
    assert(/id="toggle-source-drawer-btn" class="[^"]*hidden/.test(header), 'source button must start hidden');
  });

  test('ReaderHeader reflects titles, back/settings links and source visibility', () => {
    const configured = render(h(ReaderHeader, {
      novelTitle: 'My Novel',
      chapterTitle: 'Chapter 7',
      backHref: 'novel.html?id=n1',
      settingsHref: 'settings.html?from=reader&id=n1&ch=7',
      hasSource: true
    }));
    assert(configured.includes('My Novel</span>'), 'expected the novel title');
    assert(configured.includes('Chapter 7</span>'), 'expected the chapter title');
    assert(configured.includes('href="novel.html?id=n1"'), 'expected the contextual back link');
    assert(configured.includes('href="settings.html?from=reader&amp;id=n1&amp;ch=7"'), 'expected the contextual settings link');
    assert(!/id="toggle-source-drawer-btn" class="[^"]*hidden/.test(configured), 'source button must show when the chapter has source');
  });

  test('computeScrollProgress clamps the reading progress to 0-100', () => {
    assert.strictEqual(computeScrollProgress(0, 900), 0);
    assert.strictEqual(computeScrollProgress(450, 900), 50);
    assert.strictEqual(computeScrollProgress(1800, 900), 100);
    assert.strictEqual(computeScrollProgress(-50, 900), 0);
    assert.strictEqual(computeScrollProgress(10, 0), 0);
  });

  // --- ReaderNotSaved ---
  const ReaderNotSaved = (await loadComponent('components/react/reader/ReaderNotSaved.jsx')).default;

  test('ReaderNotSaved shows the DeepSeek card and download button', () => {
    const idle = render(h(ReaderNotSaved, { onDownload: () => {} }));
    assert(idle.includes('id="reader-download-btn"'), 'expected the download button');
    assert(idle.includes('Download Chapter'), 'expected the idle label');
    assert(idle.includes('id="reader-deepseek-toggle"'), 'expected the DeepSeek card container');
    assert(!/id="reader-download-btn"[^>]*disabled/.test(idle), 'idle button must be enabled');
  });

  test('ReaderNotSaved reflects downloading and failed states', () => {
    const busy = render(h(ReaderNotSaved, { downloading: true, translating: true, model: 'deepseek-flash', onDownload: () => {} }));
    assert(busy.includes('Translating (deepseek-flash)...'), 'expected the translating label');
    assert(/id="reader-download-btn"[^>]*disabled/.test(busy), 'downloading button must be disabled');

    const raw = render(h(ReaderNotSaved, { downloading: true, translating: false, model: 'deepseek-flash', onDownload: () => {} }));
    assert(raw.includes('Downloading Chapter...'), 'expected the download label without translation');

    const failed = render(h(ReaderNotSaved, { failed: true, onDownload: () => {} }));
    assert(failed.includes('Failed. Click to Retry'), 'expected the retry label');
    assert(!/id="reader-download-btn"[^>]*disabled/.test(failed), 'retry button must be enabled');
  });

  // --- ReaderApp ---
  const ReaderApp = (await loadComponent('components/react/reader/ReaderApp.jsx')).default;
  const readerApp = render(h(ReaderApp));

  test('ReaderApp renders the header, loading state, source drawer and toast', () => {
    for (const id of ['reading-progress-bar', 'reader-loading', 'source-drawer', 'save-toast', 'save-toast-msg']) {
      assert(readerApp.includes(`id="${id}"`), `missing #${id}`);
    }
    assert(!readerApp.includes('id="reader-not-saved"'), 'not-saved panel must not render while loading');
    assert(!readerApp.includes('id="reader-content-view"'), 'content view must not render while loading');
  });

  // --- NovelApp / NovelDeepseekCard ---
  const NovelApp = (await loadComponent('components/react/novel/NovelApp.jsx')).default;
  const novelApp = render(h(NovelApp));
  test('NovelApp renders the header, hero, chapters controls and DeepSeek panel', () => {
    for (const id of ['novel-settings-btn', 'novel-hero', 'chapters-badge', 'download-all-btn',
      'sync-chapters-btn', 'deepseek-toggle', 'novel-cooldown-toggle', 'name-list-drawer-panel']) {
      assert(novelApp.includes(`id="${id}"`), `missing #${id}`);
    }
    assert(novelApp.includes('Back to Library'), 'expected the back link');
    assert(novelApp.includes('Download All') && novelApp.includes('Sync Catalog'), 'expected the chapter action labels');
  });

  const NovelDeepseekCard = (await loadComponent('components/react/novel/NovelDeepseekCard.jsx')).default;
  const novelCard = render(h(NovelDeepseekCard));
  test('NovelDeepseekCard renders the AiConfigPanel ids and cooldown controls', () => {
    for (const id of ['deepseek-toggle', 'deepseek-toggle-badge', 'novel-provider-badge',
      'novel-provider-btn-official', 'novel-provider-btn-custom', 'novel-custom-api-row',
      'novel-custom-base-url', 'novel-bridge-preset-btn', 'novel-test-custom-btn', 'novel-api-key-label',
      'deepseek-api-key', 'remember-deepseek-key', 'clear-deepseek-btn', 'deepseek-prompt',
      'toggle-key-visibility', 'deepseek-config-fields', 'edit-prompt-btn', 'deepseek-model-select',
      'test-deepseek-btn', 'deepseek-test-status', 'deepseek-balance-badge', 'deepseek-balance-text',
      'deepseek-refresh-balance-btn', 'deepseek-refresh-balance-icon', 'deepseek-pricing-badge',
      'novel-cooldown-toggle', 'novel-cooldown-toggle-label', 'novel-cooldown-min', 'novel-cooldown-max',
      'novel-cooldown-min-label', 'novel-cooldown-max-label', 'novel-cooldown-badge',
      'novel-cooldown-inputs-container']) {
      assert(novelCard.includes(`id="${id}"`), `missing #${id}`);
    }
    assert(novelCard.includes('value="deepseek-reasoner"'), 'expected the reasoner model option');
    assert(novelCard.includes('DeepSeek Translation on Download'), 'expected the card heading');
    assert(novelCard.includes('Rate Limit Cooldown'), 'expected the cooldown section');
  });

  // --- buildDownloadOptions (shared panel) ---
  const { buildDownloadOptions } = await loadComponent('components/react/shared/aiConfigOptions.js');

  test('buildDownloadOptions refuses official translation without a key', () => {
    assert.strictEqual(buildDownloadOptions({ enabled: true, provider: 'official', apiKey: '' }), null);
  });

  test('buildDownloadOptions maps official config (no baseUrl)', () => {
    const opts = buildDownloadOptions({ enabled: true, provider: 'official', apiKey: ' sk-abc ', model: 'deepseek-chat', prompt: 'P' });
    assert.strictEqual(opts.translation.enabled, true);
    assert.strictEqual(opts.translation.apiKey, 'sk-abc');
    assert.strictEqual(opts.translation.model, 'deepseek-chat');
    assert.strictEqual(opts.translation.provider, 'official');
    assert.strictEqual(opts.translation.baseUrl, undefined);
    assert.strictEqual(opts.cooldown, undefined);
  });

  test('buildDownloadOptions fills sk-local and baseUrl for custom provider', () => {
    const opts = buildDownloadOptions({ enabled: true, provider: 'custom', customUrl: 'http://127.0.0.1:8000/v1', apiKey: '' });
    assert.strictEqual(opts.translation.apiKey, 'sk-local');
    assert.strictEqual(opts.translation.baseUrl, 'http://127.0.0.1:8000/v1');
  });

  test('buildDownloadOptions adds top-level cooldown on request and reflects the toggle', () => {
    const withCooldown = buildDownloadOptions(
      { enabled: true, provider: 'official', apiKey: 'sk', cooldown: { enabled: false, minSec: 180, maxSec: 300 } },
      { includeTopLevelCooldown: true }
    );
    assert.strictEqual(withCooldown.cooldown, false);
    assert.strictEqual(withCooldown.translation.cooldown, false);

    const noTopLevel = buildDownloadOptions({ enabled: true, provider: 'official', apiKey: 'sk', cooldown: { enabled: true } });
    assert.strictEqual('cooldown' in noTopLevel, false);
  });

  // --- ReaderPrefsPopover ---
  const prefsMod = await loadComponent('components/react/reader/ReaderPrefsPopover.jsx');
  const ReaderPrefsPopover = prefsMod.default;
  const readerPrefs = { fontSize: 22, fontFamily: 'serif', lineHeight: 'spacious', columnWidth: 'wide', theme: 'sepia' };
  const prevLocalStorage = global.localStorage;
  global.localStorage = {
    data: Object.fromEntries(Object.entries({
      quickconverter_reader_font_size: String(readerPrefs.fontSize),
      quickconverter_reader_font_family: readerPrefs.fontFamily,
      quickconverter_reader_line_height: readerPrefs.lineHeight,
      quickconverter_reader_column_width: readerPrefs.columnWidth,
      quickconverter_reader_theme: readerPrefs.theme
    })),
    getItem(k) { return k in this.data ? this.data[k] : null; }
  };
  const popover = render(h(ReaderPrefsPopover));
  global.localStorage = prevLocalStorage;

  test('ReaderPrefsPopover renders the typography controls reflecting prefs', () => {
    for (const id of ['reader-typography-wrapper', 'toggle-typography-popover-btn', 'reader-typography-popover',
      'close-typography-popover-btn', 'in-reader-font-slider', 'in-reader-font-val', 'in-reader-font-family',
      'in-reader-font-dec', 'in-reader-font-inc', 'popover-full-settings-link']) {
      assert(popover.includes(`id="${id}"`), `missing #${id}`);
    }
    assert(popover.includes('22px'), 'font size label must reflect prefs');
    assert(popover.includes('value="unkempt"') && popover.includes('value="mono"'), 'font family options must render');
    assert(/data-theme-choice="sepia"[^>]*active/.test(popover), 'selected theme must be marked active');
    assert(/data-line-choice="spacious"[^>]*active/.test(popover), 'selected line spacing must be marked active');
    assert(/data-width-choice="wide"[^>]*active/.test(popover), 'selected width must be marked active');
    assert(/id="reader-typography-popover" class="[^"]*hidden/.test(popover), 'popover must start closed');
  });

  test('readPrefs maps the shared reader storage keys', () => {
    const prev = global.localStorage;
    const data = {
      quickconverter_reader_font_size: '24',
      quickconverter_reader_font_family: 'mono',
      quickconverter_reader_line_height: 'spacious',
      quickconverter_reader_column_width: 'full',
      quickconverter_reader_theme: 'oled'
    };
    global.localStorage = { getItem: (k) => (k in data ? data[k] : null) };
    try {
      assert.deepStrictEqual(prefsMod.readPrefs(), {
        fontSize: 24, fontFamily: 'mono', lineHeight: 'spacious', columnWidth: 'full', theme: 'oled'
      });
    } finally {
      global.localStorage = prev;
    }
  });

  test('applyReaderPreferences sets the column width, theme and emits reader-prefs-updated', () => {
    const classes = new Set();
    const events = [];
    let theme = null;
    const prevDoc = global.document;
    const prevWin = global.window;
    global.document = {
      querySelector: (sel) => (sel === 'main'
        ? { classList: { remove: (...c) => c.forEach((x) => classes.delete(x)), add: (c) => classes.add(c) } }
        : null),
      body: { setAttribute: (k, v) => { if (k === 'data-theme') theme = v; } }
    };
    global.window = { dispatchEvent: (e) => events.push(e.type) };
    try {
      prefsMod.applyReaderPreferences({ fontSize: 18, fontFamily: 'sans', lineHeight: 'relaxed', columnWidth: 'wide', theme: 'forest' });
      assert(classes.has('max-w-4xl'), 'wide must map to max-w-4xl');
      assert.strictEqual(theme, 'forest', 'theme must be written to body[data-theme]');
      assert(events.includes('reader-prefs-updated'), 'must emit reader-prefs-updated');
    } finally {
      global.document = prevDoc;
      global.window = prevWin;
    }
  });

  // --- ReaderDeepseekCard ---
  const ReaderDeepseekCard = (await loadComponent('components/react/reader/ReaderDeepseekCard.jsx')).default;
  const deepseekCard = render(h(ReaderDeepseekCard));
  test('ReaderDeepseekCard renders the AiConfigPanel container ids', () => {
    for (const id of ['reader-deepseek-toggle', 'reader-deepseek-toggle-badge', 'reader-provider-badge',
      'reader-provider-btn-official', 'reader-provider-btn-custom', 'reader-custom-api-row',
      'reader-custom-base-url', 'reader-bridge-preset-btn', 'reader-test-custom-btn', 'reader-api-key-label',
      'reader-deepseek-api-key', 'reader-remember-deepseek-key', 'reader-clear-deepseek-btn',
      'reader-deepseek-prompt', 'reader-toggle-key-visibility', 'reader-deepseek-config-fields',
      'reader-edit-prompt-btn', 'reader-deepseek-model-select', 'reader-test-deepseek-btn',
      'reader-deepseek-test-status', 'reader-deepseek-balance-badge', 'reader-deepseek-balance-text',
      'reader-deepseek-refresh-balance-btn', 'reader-deepseek-refresh-balance-icon',
      'reader-deepseek-pricing-badge']) {
      assert(deepseekCard.includes(`id="${id}"`), `missing #${id}`);
    }
    assert(deepseekCard.includes('value="deepseek-reasoner"'), 'expected the reasoner model option');
    assert(deepseekCard.includes('DeepSeek Translation on Download'), 'expected the card heading');
  });

  // --- PopupApp smoke ---
  const app = render(h(PopupApp));
  test('PopupApp renders both views', () => {
    assert(app.includes('id="view-main"'), 'expected main view');
    assert(app.includes('id="view-novel"'), 'expected novel view');
  });

  for (const line of results) console.log(line);
  console.log(`--- React Component Render Test Suite: ${results.length - failures}/${results.length} passed ---`);

  if (failures > 0) {
    console.error(`React Component Test Suite FAILED (${failures} failure(s))`);
    process.exit(1);
  }
  console.log('React Component Test Suite: ALL TESTS PASSED!');
})();
