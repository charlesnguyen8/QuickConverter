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

  const PopupMainView = (await loadComponent('components/react/PopupMainView.jsx')).default;
  const PopupNovelView = (await loadComponent('components/react/PopupNovelView.jsx')).default;
  const PopupDeepseekCard = (await loadComponent('components/react/PopupDeepseekCard.jsx')).default;
  const SettingsDeepSeekTab = (await loadComponent('components/react/SettingsDeepSeekTab.jsx')).default;
  const PopupApp = (await loadComponent('components/react/PopupApp.jsx')).default;

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
  const SettingsView = (await loadComponent('components/react/SettingsView.jsx')).default;
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
  const ReaderHeader = (await loadComponent('components/react/ReaderHeader.jsx')).default;
  const header = render(h(ReaderHeader));
  test('ReaderHeader renders nav, font stepper and typography popover', () => {
    for (const id of ['reading-progress-bar', 'back-to-novel-btn', 'header-novel-title',
      'header-chapter-title', 'toggle-source-drawer-btn', 'font-dec-btn', 'font-size-label',
      'font-inc-btn', 'reader-typography-wrapper', 'reader-typography-popover',
      'toggle-typography-popover-btn', 'reader-settings-btn']) {
      assert(header.includes(`id="${id}"`), `missing #${id}`);
    }
    assert(header.includes('value="unkempt"'), 'expected the font family options');
    assert(header.includes('width:0'), 'expected the progress bar width style');
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
