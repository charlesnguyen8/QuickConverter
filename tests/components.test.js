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

async function testAsync(name, fn) {
  try {
    await fn();
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

  // --- Backup to / from a file ---
  const backupFile = await loadComponent('components/react/settings/backupFile.js');
  test('backup files are named by date and validated before import', () => {
    assert.strictEqual(backupFile.backupFileName(new Date(2026, 9, 18, 23, 5)), 'quickconverter-backup-2026-10-18.json');
    const good = { format: 'quickconverter-backup', version: 1, novels: [{ id: 'n1' }], chapters: [], preferences: {} };
    assert.deepStrictEqual(backupFile.parseBackupFile(JSON.stringify(good)), good);
    assert.throws(() => backupFile.parseBackupFile('not json'), /not a QuickConverter backup/i);
    assert.throws(() => backupFile.parseBackupFile(JSON.stringify({ format: 'other', version: 1 })), /not a QuickConverter backup/i);
    assert.throws(() => backupFile.parseBackupFile(JSON.stringify({ ...good, version: 99 })), /newer version/i);
    assert.strictEqual(backupFile.describeImport({ novels: 3, chapters: 120 }), 'Imported 3 novels and 120 chapters.');
    assert.strictEqual(backupFile.describeImport({ novels: 1, chapters: 1 }), 'Imported 1 novel and 1 chapter.');
  });

  test('exporting a backup file downloads the whole library as JSON', async () => {
    const data = { format: 'quickconverter-backup', version: 1, novels: [{ id: 'n1' }], chapters: [], preferences: {} };
    const clicks = [];
    const doc = { createElement: () => ({ click() { clicks.push({ href: this.href, download: this.download }); } }) };
    const urls = [];
    const env = {
      document: doc,
      URL: { createObjectURL: (blob) => { urls.push(blob); return 'blob:qc-1'; }, revokeObjectURL: (u) => urls.push(`revoked ${u}`) },
      Blob: class { constructor(parts, opts) { this.text = parts.join(''); this.type = opts.type; } }
    };
    const summary = await backupFile.exportBackupFile({ exportAll: async () => data }, env, new Date(2026, 9, 18));
    assert.deepStrictEqual(clicks, [{ href: 'blob:qc-1', download: 'quickconverter-backup-2026-10-18.json' }]);
    assert.strictEqual(urls[0].type, 'application/json');
    assert.deepStrictEqual(JSON.parse(urls[0].text), data, 'the file is the exported library');
    assert.strictEqual(urls[1], 'revoked blob:qc-1', 'the temporary link is released');
    assert.strictEqual(summary, 'Saved 1 novel and 0 chapters to quickconverter-backup-2026-10-18.json.');
  });

  test('importing a backup file merges by default and replaces only when asked', async () => {
    const data = { format: 'quickconverter-backup', version: 1, novels: [], chapters: [], preferences: {} };
    const calls = [];
    const storage = { importAll: async (d, o) => { calls.push(o); return { novels: 2, chapters: 5 }; } };
    const file = { text: async () => JSON.stringify(data) };
    assert.strictEqual(await backupFile.importBackupFile(storage, file, { replace: false }), 'Imported 2 novels and 5 chapters.');
    await backupFile.importBackupFile(storage, file, { replace: true });
    assert.deepStrictEqual(calls, [{ replace: false }, { replace: true }]);
    await assert.rejects(() => backupFile.importBackupFile(storage, { text: async () => '{' }, { replace: false }), /not a QuickConverter backup/i);
    assert.strictEqual(calls.length, 2, 'a bad file never reaches storage');
  });

  test('in the app, a backup file is saved through the native file picker', async () => {
    const data = { format: 'quickconverter-backup', version: 1, novels: [{ id: 'n1' }, { id: 'n2' }], chapters: [{ id: 'c' }], preferences: {} };
    const saved = [];
    let accept = true;
    const env = {
      Platform: { files: { saveText: async (name, type, text) => { saved.push({ name, type, text }); return accept; } } },
      document: { createElement: () => { throw new Error('no download link in the app'); } }
    };
    const summary = await backupFile.exportBackupFile({ exportAll: async () => data }, env, new Date(2026, 9, 18));
    assert.strictEqual(saved.length, 1);
    assert.strictEqual(saved[0].name, 'quickconverter-backup-2026-10-18.json');
    assert.strictEqual(saved[0].type, 'application/json');
    assert.deepStrictEqual(JSON.parse(saved[0].text), data);
    assert.strictEqual(summary, 'Saved 2 novels and 1 chapter to quickconverter-backup-2026-10-18.json.');
    accept = false;
    assert.strictEqual(await backupFile.exportBackupFile({ exportAll: async () => data }, env, new Date(2026, 9, 18)), 'Save cancelled.');
  });

  // --- Android back button ---
  const back = await loadComponent('components/react/shared/backButton.js');
  function backEnv({ handled = false, active = null, path = '/views/reader.html' } = {}) {
    const log = [];
    const doc = {
      body: { id: 'body' },
      activeElement: active,
      dispatchEvent(event) { log.push(['escape-on', 'document', event.key]); if (handled) event.preventDefault(); return !handled; }
    };
    if (active) {
      active.dispatchEvent = (event) => { log.push(['escape-on', active.id, event.key]); if (handled) event.preventDefault(); return !handled; };
    }
    return {
      log,
      env: {
        document: doc,
        history: { back: () => log.push(['history-back']) },
        location: { pathname: path, set href(v) { log.push(['go', v]); } },
        minimizeApp: () => log.push(['minimize'])
      }
    };
  }

  test('Back first closes whatever is open (as Escape would)', () => {
    const { log, env } = backEnv({ handled: true });
    assert.strictEqual(back.handleBackPress({ canGoBack: true }, env), 'closed');
    assert.deepStrictEqual(log, [['escape-on', 'document', 'Escape']], 'nothing else happens');
    const focused = backEnv({ handled: true, active: { id: 'rename-input' } });
    back.handleBackPress({ canGoBack: true }, focused.env);
    assert.deepStrictEqual(focused.log, [['escape-on', 'rename-input', 'Escape']], 'a focused field gets it first');
  });

  test('Back then goes to the previous page, then the library, then leaves the app', () => {
    const prev = backEnv();
    assert.strictEqual(back.handleBackPress({ canGoBack: true }, prev.env), 'back');
    assert.deepStrictEqual(prev.log.slice(1), [['history-back']]);
    const home = backEnv({ path: '/views/reader.html' });
    assert.strictEqual(back.handleBackPress({ canGoBack: false }, home.env), 'home');
    assert.deepStrictEqual(home.log.slice(1), [['go', 'library.html']]);
    const leave = backEnv({ path: '/views/library.html' });
    assert.strictEqual(back.handleBackPress({ canGoBack: false }, leave.env), 'exit');
    assert.deepStrictEqual(leave.log.slice(1), [['minimize']]);
  });

  test('installBackButton listens only where the platform has a back button', () => {
    const handlers = [];
    const platform = { runtime: { onBackButton: (fn) => { handlers.push(fn); return () => handlers.splice(0); }, minimizeApp: () => {} } };
    const { log, env } = backEnv();
    const stop = back.installBackButton(platform, env);
    assert.strictEqual(handlers.length, 1);
    handlers[0]({ canGoBack: true });
    assert.deepStrictEqual(log.slice(1), [['history-back']]);
    stop();
    assert.strictEqual(handlers.length, 0);
    assert.strictEqual(typeof back.installBackButton(null, env), 'function', 'no platform: harmless no-op');
  });

  const SettingsBackupFile = (await loadComponent('components/react/settings/SettingsBackupFile.jsx')).default;
  test('Settings has backup-to-file export and import controls', () => {
    const html = render(h(SettingsBackupFile));
    assert(/<button[^>]*id="settings-backup-export"[^>]*>/.test(html), 'export button');
    const input = html.match(/<input[^>]*id="settings-backup-import"[^>]*>/);
    assert(input && /type="file"/.test(input[0]) && /accept="[^"]*\.json/.test(input[0]), 'file picker for .json backups');
    const replace = html.match(/<input[^>]*id="settings-backup-replace"[^>]*>/);
    assert(replace && /type="checkbox"/.test(replace[0]) && !/checked=""/.test(replace[0]), 'merge by default; replacing is opt-in');
    assert(/min-h-10/.test(html.match(/<button[^>]*id="settings-backup-export"[^>]*>/)[0]), 'touch-friendly');
    assert(/API keys/.test(html), 'says API keys are left out');
  });

  // --- SettingsView (shell) ---
  const SettingsView = (await loadComponent('components/react/settings/SettingsView.jsx')).default;
  const shell = render(h(SettingsView));
  test('SettingsView renders the shell, tabs and toast', () => {
    for (const id of ['settings-back-btn', 'settings-back-text', 'settings-save-pill',
      'settings-toast', 'settings-toast-msg', 'tab-content-deepseek', 'tab-content-reader',
      'tab-content-storage', 'tab-content-notes', 'tab-content-about']) {
      assert(shell.includes(`id="${id}"`), `missing #${id}`);
    }
    assert(shell.includes('settings-nav-btn active'), 'expected the first tab to be active');
    assert(shell.includes('About QuickConverter'), 'expected the About content');
  });

  // --- SettingsNotesTab ---
  const SettingsNotesTab = (await loadComponent('components/react/settings/SettingsNotesTab.jsx')).default;
  const notesTab = render(h(SettingsNotesTab));

  test('SettingsNotesTab renders the New Note button and empty state', () => {
    assert(notesTab.includes('id="notes-new-btn"'), 'expected the New Note button');
    assert(notesTab.includes('No notes yet'), 'expected the empty notes message');
    assert(notesTab.includes('No note selected'), 'expected the empty editor state');
    assert(!notesTab.includes('id="note-title-input"'), 'editor must not render without a note');
  });

  // --- ReaderHeader ---
  const headerMod = await loadComponent('components/react/reader/ReaderHeader.jsx');
  const ReaderHeader = headerMod.default;
  const { computeScrollProgress } = headerMod;
  const header = render(h(ReaderHeader));
  test('ReaderHeader renders nav, font stepper and typography popover', () => {
    for (const id of ['reading-progress-bar', 'back-to-novel-btn', 'header-novel-title',
      'header-chapter-title', 'toggle-source-drawer-btn', 'toggle-name-list-btn', 'toggle-chapter-list-btn', 'font-dec-btn', 'font-size-label',
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

  test('ReaderHeader exposes the chapter-list toggle reflecting open state', () => {
    const closed = render(h(ReaderHeader, { chaptersOpen: false }));
    assert(/id="toggle-chapter-list-btn"[^>]*aria-pressed="false"/.test(closed), 'toggle must be unpressed when collapsed');
    const opened = render(h(ReaderHeader, { chaptersOpen: true }));
    assert(/id="toggle-chapter-list-btn"[^>]*aria-pressed="true"/.test(opened), 'toggle must be pressed when expanded');
  });

  test('computeScrollProgress clamps the reading progress to 0-100', () => {
    assert.strictEqual(computeScrollProgress(0, 900), 0);
    assert.strictEqual(computeScrollProgress(450, 900), 50);
    assert.strictEqual(computeScrollProgress(1800, 900), 100);
    assert.strictEqual(computeScrollProgress(-50, 900), 0);
    assert.strictEqual(computeScrollProgress(10, 0), 0);
  });

  // --- Dictionary conversion: tappable phrases ---
  const ReaderPhraseText = (await loadComponent('components/react/reader/ReaderPhraseText.jsx')).default;
  const phrasePara = {
    text: 'Lâm Động nhìn về phía tha.',
    segments: [
      { start: 0, end: 8, source: '林动', reading: 'lâm động', translation: 'Lâm Động', origin: 'name', entryId: 'n1' },
      { start: 9, end: 21, source: '看向', reading: 'khán hướng', translation: 'nhìn về phía', origin: 'vietPhrase' },
      { start: 22, end: 25, source: '他', reading: 'tha', translation: 'tha', origin: 'hanViet' }
    ]
  };
  test('ReaderPhraseText makes every converted phrase a tappable word carrying its Chinese', () => {
    const html = render(h(ReaderPhraseText, { paragraph: phrasePara, onSelect: () => {} }));
    const words = html.match(/<span[^>]*data-phrase="[^"]*"[^>]*>[^<]*<\/span>/g) || [];
    assert.strictEqual(words.length, 3, 'one tappable word per phrase');
    assert(/data-phrase="1"[^>]*>nhìn về phía<\/span>/.test(html), 'the phrase shows its converted text');
    assert(/lang="zh"|data-source="看向"/.test(words[1]), 'each word carries its Chinese source');
    assert(words.every((w) => /role="button"/.test(w) && /tabindex="0"/.test(w)), 'words are keyboard and screen-reader reachable');
    assert(html.replace(/<[^>]+>/g, '') === phrasePara.text, 'text between phrases (spaces, punctuation) is kept as is');
    assert(/data-phrase="0"[^>]*class="[^"]*border-indigo-400/.test(html) || /class="[^"]*border-indigo-400[^"]*"[^>]*data-phrase="0"/.test(html), 'names keep the name highlight');
  });

  test('ReaderPhraseText styles name chunks only while name highlighting is on', () => {
    const named = { text: 'Lâm Động đi', segments: [
      { start: 0, end: 8, source: '林动', reading: 'lâm động', translation: 'Lâm Động', origin: 'name' },
      { start: 9, end: 11, source: '走', reading: 'tẩu', translation: 'đi', origin: 'vietPhrase' }
    ] };
    const on = render(h(ReaderPhraseText, { paragraph: named, onSelect: () => {} }));
    assert(/data-phrase="0"[^>]*class="[^"]*bg-indigo-500\/15/.test(on), 'names stand out by default');
    const off = render(h(ReaderPhraseText, { paragraph: named, onSelect: () => {}, highlightNames: false }));
    assert(!off.includes('bg-indigo-500/15'), 'no name styling when turned off');
    assert(/data-phrase="0"[^>]*role="button"|role="button"[^>]*data-phrase="0"/.test(off), 'the name is still a tappable phrase');
  });

  const ReaderNameText = (await loadComponent('components/react/reader/ReaderNameText.jsx')).default;
  test('ReaderNameText links Name List names only while name highlighting is on', () => {
    const segments = [{ text: 'Lâm Động', nameId: 'n1', original: '林动' }, { text: ' walked in.' }];
    const on = render(h(ReaderNameText, { segments, highlight: true, onOpenName: () => {} }));
    assert(/<span[^>]*role="button"[^>]*title="View &quot;林动&quot; in the Name List"/.test(on), 'names link to the Name List');
    assert(on.includes('bg-indigo-500/15'), 'and are highlighted');
    const off = render(h(ReaderNameText, { segments, highlight: false, onOpenName: () => {} }));
    assert.strictEqual(off, 'Lâm Động walked in.', 'plain text when turned off');
  });

  test('ReaderPhraseText highlights the phrase whose popup is open', () => {
    const html = render(h(ReaderPhraseText, { paragraph: phrasePara, activeIndex: 1, onSelect: () => {} }));
    const active = (html.match(/<span[^>]*data-phrase="1"[^>]*>/) || [''])[0];
    assert(/aria-pressed="true"/.test(active), 'open phrase is marked pressed');
    const other = (html.match(/<span[^>]*data-phrase="2"[^>]*>/) || [''])[0];
    assert(/aria-pressed="false"/.test(other));
  });

  test('ReaderPhraseText highlights every chunk of a grown selection', () => {
    const html = render(h(ReaderPhraseText, { paragraph: phrasePara, activeIndex: 0, activeEnd: 1, onSelect: () => {} }));
    const pressed = (i) => /aria-pressed="true"/.test((html.match(new RegExp(`<span[^>]*data-phrase="${i}"[^>]*>`)) || [''])[0]);
    assert.deepStrictEqual([pressed(0), pressed(1), pressed(2)], [true, true, false]);
  });

  const ReaderPhrasePopover = (await loadComponent('components/react/reader/ReaderPhrasePopover.jsx')).default;
  test('ReaderPhrasePopover shows the source as an editable text box and keeps the chunk arrows', () => {
    const html = render(h(ReaderPhrasePopover, {
      phrase: { source: '修养', reading: 'tu dưỡng', translation: 'tu dưỡng', origin: 'vietPhrase' },
      canExtendLeft: true,
      canExtendRight: true
    }));
    const input = html.match(/<input[^>]*id="reader-phrase-source"[^>]*>/);
    assert(input, 'source text box');
    assert(input[0].includes('value="修养"'), 'filled with the tapped chunk');
    assert(input[0].includes('lang="zh"'), 'marked as Chinese');
    assert(/min-h-10/.test(input[0]), 'touch-friendly height');
    assert(html.includes('id="reader-phrase-extend-left"') && html.includes('id="reader-phrase-extend-right"'), 'chunk arrows stay');
    assert(html.includes('tu dưỡng'), 'reading shown under the box');
  });

  test('ReaderPhrasePopover has no separate VietPhrase dropdown: the suggestions are the VietPhrase section', () => {
    const phrase = { source: '羽衣', reading: 'vũ y', translation: 'vũ y', origin: 'vietPhrase' };
    const html = render(h(ReaderPhrasePopover, { phrase, options: ['vũ y', 'áo lông vũ'], vietPhraseOf: () => ['vũ y', 'áo lông vũ'] }));
    assert(!html.includes('id="reader-phrase-vietphrase"') && !html.includes('No VietPhrase entry'), 'no dropdown');
    assert(html.includes('data-phrase-option="áo lông vũ"'), 'the meanings are the tap-to-save buttons');
    assert(!/Meanings/.test(html), 'the section is no longer called Meanings');
  });

  test('ReaderPhrasePopover says under each heading where VietPhrase and Name store entries come from', () => {
    const phrase = { source: '羽衣', reading: 'vũ y', translation: 'vũ y', origin: 'vietPhrase' };
    const note = (html, section) => {
      const m = html.match(new RegExp(`<p[^>]*data-section-sources="${section}"[^>]*>([\\s\\S]*?)</p>`));
      return m ? m[1].replace(/<[^>]+>/g, '') : null;
    };
    const html = render(h(ReaderPhrasePopover, { phrase, options: ['vũ y'], storeNamesOf: () => [] }));
    const vp = note(html, 'vietphrase');
    assert(vp, 'a source note under VietPhrase');
    for (const part of ['VietPhrase.txt', 'Pronouns.txt', 'Names.txt', 'Hán Việt']) assert(vp.includes(part), `VietPhrase note names ${part}`);
    const store = note(html, 'store');
    assert(store, 'a source note under Name store, even when it has no names');
    assert(/other books/.test(store) && store.includes('Names.txt'), 'Name store note names your other books and Names.txt');
    assert(!/data-source-tag/.test(html), 'the buttons themselves carry no source tags');
  });

  test('ReaderPhrasePopover offers names saved in the name store, and Delete name for this book\'s name', () => {
    const phrase = { source: '羽衣', reading: 'vũ y', translation: 'Vũ Y', origin: 'name', entryId: 'a' };
    const props = {
      phrase,
      storeNamesOf: (k) => (k === '羽衣' ? [{ translation: 'Hagoromo', from: '门户' }, { translation: 'Vũ Y Tiên', from: 'QT Names' }] : []),
      bookNameOf: (k) => (k === '羽衣' ? { id: 'a', original: '羽衣', translation: 'Vũ Y' } : null)
    };
    const html = render(h(ReaderPhrasePopover, props));
    assert(!/<select[^>]*id="reader-phrase-store"/.test(html), 'buttons, not a dropdown');
    assert(/Name store · tap to save to Name List/.test(html), 'says a tap saves the name to the Name List');
    const storeButton = (name) => (html.match(new RegExp(`<button[^>]*data-store-name="${name}"[^>]*>([\\s\\S]*?)</button>`)) || null);
    const hagoromo = storeButton('Hagoromo');
    assert(hagoromo && /Hagoromo/.test(hagoromo[1]) && /门户/.test(hagoromo[1]), 'each name is a button that says which book it came from');
    assert(/min-h-10/.test(hagoromo[0]), 'touch-friendly');
    const qt = storeButton('Vũ Y Tiên');
    assert(qt && /QT Names/.test(qt[1]), 'and QT Names');
    assert(!/<button[^>]*data-store-name="Hagoromo"[^>]*\sdisabled=""/.test(html), 'enabled');
    assert(/<button[^>]*data-store-name="Hagoromo"[^>]*\sdisabled=""/.test(render(h(ReaderPhrasePopover, { ...props, saving: true }))), 'disabled while saving');
    const del = html.match(/<button[^>]*id="reader-phrase-delete-name"[^>]*>([\s\S]*?)<\/button>/);
    assert(del && /Delete name/.test(del[1]) && /min-h-10/.test(del[0]), "Delete name for this book's name");
    const notInBook = render(h(ReaderPhrasePopover, { ...props, bookNameOf: () => null }));
    assert(!notInBook.includes('id="reader-phrase-delete-name"'), 'no Delete name when this book has no name for the text');
    const empty = render(h(ReaderPhrasePopover, { ...props, storeNamesOf: () => [] }));
    assert(!empty.includes('data-store-name=') && empty.includes('No saved names'), 'says when the store has nothing');
    const loading = render(h(ReaderPhrasePopover, { ...props, storeNamesOf: () => [], storeNamesLoading: true }));
    assert(loading.includes('Loading names from your other books') && !loading.includes('No saved names'), 'does not claim there are none while loading');
  });

  test('ReaderPhrasePopover says tapping a VietPhrase suggestion saves it to the Locked Glossary (or the Name List for names)', () => {
    const soft = render(h(ReaderPhrasePopover, { phrase: { source: '修养', reading: 'tu dưỡng', translation: 'tu dưỡng', origin: 'vietPhrase' }, options: ['tu dưỡng'] }));
    assert(/VietPhrase · tap to save to Locked Glossary/.test(soft), 'says what a tap does, not that something was saved');
    const name = render(h(ReaderPhrasePopover, { phrase: { source: '林动', reading: 'lâm động', translation: 'Lâm Động', origin: 'name' }, options: ['Lâm Động'] }));
    assert(/VietPhrase · tap to save to Name List/.test(name));
  });

  test('ReaderPhrasePopover lets you save an empty meaning to hide a character', () => {
    const html = render(h(ReaderPhrasePopover, { phrase: { source: '的', reading: 'đích', translation: '', origin: 'soft' } }));
    assert(!html.includes('id="reader-phrase-use-btn"'), 'no Use button: the meaning is saved with Save as name or Save as locked');
    assert(!/id="reader-phrase-name-btn"[^>]*\sdisabled=""/.test(html), 'Save as name works with an empty meaning');
    assert(/id="reader-phrase-name-btn"[^>]*\sdisabled=""/.test(render(h(ReaderPhrasePopover, { phrase: { source: '的', reading: 'đích', translation: '', origin: 'soft' }, saving: true }))), 'still disabled while saving');
  });

  test('ReaderPhrasePopover offers Save as locked next to Save as name', () => {
    const phrase = { source: '是很平静', reading: 'thị ngận bình tĩnh', translation: 'rất là bình tĩnh', origin: 'soft' };
    const html = render(h(ReaderPhrasePopover, { phrase, options: ['rất là bình tĩnh', 'thị ngận bình tĩnh'] }));
    const btn = html.match(/<button[^>]*id="reader-phrase-locked-btn"[^>]*>([\s\S]*?)<\/button>/);
    assert(btn, 'Save as locked button');
    assert(/Save as locked/.test(btn[1]), 'labelled Save as locked');
    assert(/min-h-10/.test(btn[0]), 'touch-friendly height');
    assert(/Locked Glossary/.test(btn[0]), 'tooltip names the Locked Glossary');
    assert(html.indexOf('id="reader-phrase-name-btn"') < html.indexOf('id="reader-phrase-locked-btn"'), 'sits after Save as name');
    assert(!/id="reader-phrase-locked-btn"[^>]*\sdisabled=""/.test(html), 'enabled for a phrase');
    const empty = render(h(ReaderPhrasePopover, { phrase: { ...phrase, translation: '' } }));
    assert(!/id="reader-phrase-locked-btn"[^>]*\sdisabled=""/.test(empty), 'works with an empty meaning, like Save as name');
    assert(/id="reader-phrase-locked-btn"[^>]*\sdisabled=""/.test(render(h(ReaderPhrasePopover, { phrase, saving: true }))), 'disabled while saving');
  });

  test('ReaderPhrasePopover lists possible names for the tapped phrase with add and reject actions', () => {
    const phrase = { source: '韩', reading: 'hàn', translation: 'hàn', origin: 'hanViet' };
    const html = render(h(ReaderPhrasePopover, {
      phrase,
      suggestions: [
        { text: '韩当', suggested: 'Hàn Đương', entityType: 'person', occurrences: 3 },
        { text: '青州郡', suggested: 'Thanh Châu quận', entityType: 'location', occurrences: 1 }
      ]
    }));
    assert(html.includes('id="reader-phrase-suggestions"'), 'suggestions section');
    assert(html.includes('Possible names'), 'labelled');
    assert(html.includes('韩当') && html.includes('Hàn Đương'), 'Chinese and suggested reading');
    assert((html.match(/data-suggestion-add=/g) || []).length === 2, 'an add button per candidate');
    assert((html.match(/data-suggestion-reject=/g) || []).length === 2, 'a reject button per candidate');
    assert(/data-suggestion-add="韩当"[^>]*class="[^"]*min-h-10/.test(html) || /class="[^"]*min-h-10[^"]*"[^>]*data-suggestion-add="韩当"/.test(html), 'touch target is at least 40px');
  });

  test('ReaderPhrasePopover shows a loading line while names are being found, and nothing when there are none', () => {
    const phrase = { source: '韩', reading: 'hàn', translation: 'hàn', origin: 'hanViet' };
    assert(render(h(ReaderPhrasePopover, { phrase, suggestionsLoading: true })).includes('Looking for names'));
    const none = render(h(ReaderPhrasePopover, { phrase, suggestions: [] }));
    assert(!none.includes('id="reader-phrase-suggestions"'));
  });

  test('ReaderPhrasePopover has left and right buttons that grow the selection by a chunk', () => {
    const both = render(h(ReaderPhrasePopover, {
      phrase: { source: '陈', reading: 'trần', translation: 'trần', origin: 'vietPhrase' },
      options: ['trần'],
      canExtendLeft: true,
      canExtendRight: true,
      onExtendLeft: () => {}, onExtendRight: () => {},
      onPick: () => {}, onSaveName: () => {}, onClose: () => {}
    }));
    const left = (both.match(/<button[^>]*id="reader-phrase-extend-left"[^>]*>/) || [''])[0];
    const right = (both.match(/<button[^>]*id="reader-phrase-extend-right"[^>]*>/) || [''])[0];
    assert(left && right, 'both extend buttons render');
    assert(/aria-label="[^"]*previous chunk[^"]*"/.test(left) && /aria-label="[^"]*next chunk[^"]*"/.test(right), 'buttons say they extend by a chunk');
    assert(!/\sdisabled=""/.test(left) && !/\sdisabled=""/.test(right));
    assert(/min-h-10/.test(left) && /w-10/.test(left), '40px touch target');

    const edge = render(h(ReaderPhrasePopover, {
      phrase: { source: '陈', reading: 'trần', translation: 'trần', origin: 'vietPhrase' },
      options: ['trần'],
      canExtendLeft: false,
      canExtendRight: true,
      onPick: () => {}, onSaveName: () => {}, onClose: () => {}
    }));
    assert(/<button[^>]*id="reader-phrase-extend-left"[^>]*\sdisabled=""/.test(edge), 'left is disabled with nothing touching on the left');
    assert(!/<button[^>]*id="reader-phrase-extend-right"[^>]*\sdisabled=""/.test(edge));
  });

  test('ReaderPhrasePopover labels a grown selection as your selection', () => {
    const sel = render(h(ReaderPhrasePopover, {
      phrase: { source: '陈舒', reading: 'trần thư', translation: 'trần thư', origin: 'selection' },
      options: ['trần thư', 'Trần Thư'],
      onPick: () => {}, onSaveName: () => {}, onClose: () => {}
    }));
    assert(/<input[^>]*id="reader-phrase-source"[^>]*lang="zh"[^>]*value="陈舒"/.test(sel), 'the selection is shown in the Chinese source box');
    assert(sel.includes('Selection'), 'origin label for a multi-chunk selection');
  });
  test('ReaderPhrasePopover shows Lạc Việt definitions for the phrase and its characters', () => {
    const asked = [];
    const definitionsOf = (source) => {
      asked.push(source);
      return [
        { source: '修养', entries: [{ pinyin: 'xiūyǎng', hanViet: '', senses: ['1. trình độ', '2. thái độ đúng mực'] }] },
        { source: '养', entries: [{ pinyin: 'yǎng', hanViet: 'DƯỠNG', senses: ['1. nuôi'] }, { pinyin: 'yàng', hanViet: 'DẠNG', senses: ['phụng dưỡng'] }] }
      ];
    };
    const html = render(h(ReaderPhrasePopover, { phrase: { source: '修养', reading: 'tu dưỡng', translation: 'tu dưỡng', origin: 'vietPhrase' }, definitionsOf }));
    assert.deepStrictEqual(asked, ['修养'], 'looks up the Chinese in the source box');
    const section = html.match(/<section[^>]*id="reader-phrase-dictionary"[\s\S]*?<\/section>/);
    assert(section, 'dictionary section');
    assert(/Lạc Việt/.test(section[0]), 'labelled with its source');
    assert(section[0].includes('data-definition="修养"') && section[0].includes('data-definition="养"'), 'one block per looked-up word');
    for (const text of ['xiūyǎng', '1. trình độ', '2. thái độ đúng mực', 'yǎng', 'DƯỠNG', '1. nuôi', 'yàng', 'DẠNG', 'phụng dưỡng']) {
      assert(section[0].includes(text), `shows ${text}`);
    }
    assert(html.indexOf('id="reader-phrase-name-btn"') < html.indexOf('id="reader-phrase-dictionary"'), 'definitions sit below the save buttons');
  });

  test('ReaderPhrasePopover shows the dictionary loading, empty and unavailable states', () => {
    const phrase = { source: '很', reading: 'ngận', translation: 'rất', origin: 'vietPhrase' };
    assert(render(h(ReaderPhrasePopover, { phrase, definitionsLoading: true })).includes('Loading the Lạc Việt dictionary'), 'loading');
    assert(render(h(ReaderPhrasePopover, { phrase, definitionsOf: () => [] })).includes('No Lạc Việt entry'), 'nothing found');
    assert(render(h(ReaderPhrasePopover, { phrase, definitionsError: true })).includes('Lạc Việt dictionary could not be loaded'), 'load failure');
    assert(!render(h(ReaderPhrasePopover, { phrase })).includes('id="reader-phrase-dictionary"'), 'no section when no dictionary is wired');
  });

  const popPhrase = { source: '工作人员', reading: 'công tác nhân viên', translation: 'nhân viên công tác', origin: 'vietPhrase' };
  const phrasePopover = render(h(ReaderPhrasePopover, {
    phrase: popPhrase,
    options: ['nhân viên công tác', 'nhân viên làm việc', 'công tác nhân viên'],
    onPick: () => {}, onSaveName: () => {}, onClose: () => {}
  }));
  test('ReaderPhrasePopover shows the Chinese, Hán Việt, current meaning and where it came from', () => {
    assert(phrasePopover.includes('id="reader-phrase-popover"'));
    assert(/<input[^>]*id="reader-phrase-source"[^>]*lang="zh"[^>]*value="工作人员"/.test(phrasePopover), 'Chinese source shown');
    assert(phrasePopover.includes('công tác nhân viên'), 'Hán Việt reading shown');
    assert(phrasePopover.includes('VietPhrase'), 'origin of the shown meaning is labelled');
  });

  test('ReaderPhrasePopover offers every meaning, a custom meaning and Save as name', () => {
    const options = phrasePopover.match(/data-phrase-option="[^"]*"/g) || [];
    assert.deepStrictEqual(options, [
      'data-phrase-option="nhân viên công tác"',
      'data-phrase-option="nhân viên làm việc"',
      'data-phrase-option="công tác nhân viên"'
    ]);
    assert(/data-phrase-option="nhân viên công tác"[^>]*aria-current="true"/.test(phrasePopover), 'the shown meaning is marked current');
    assert(/id="reader-phrase-custom"[^>]*value="nhân viên công tác"/.test(phrasePopover), 'custom field starts with the shown meaning');
    assert(!phrasePopover.includes('id="reader-phrase-use-btn"') && phrasePopover.includes('id="reader-phrase-locked-btn"'), 'a custom meaning is saved with Save as name or Save as locked, not a separate Use button');
    assert(phrasePopover.includes('id="reader-phrase-name-btn"'), 'phrase can be saved as a name');
    assert(phrasePopover.includes('tap to save to Locked Glossary'), 'says which list a tapped meaning is saved to (the Locked Glossary, by owner decision)');
    assert(!phrasePopover.includes('id="reader-phrase-open-name"'), 'no Name List link for dictionary phrases');
  });

  test('ReaderPhrasePopover is a full-width bottom sheet on phones with 40px touch targets', () => {
    assert(/id="reader-phrase-popover"[^>]*class="[^"]*fixed[^"]*inset-x-0[^"]*bottom-0/.test(phrasePopover), 'bottom sheet on phones');
    const buttons = phrasePopover.match(/<button[^>]*>/g) || [];
    assert(buttons.length >= 5);
    assert(buttons.every((b) => /min-h-10|h-10|w-10/.test(b)), 'every button is at least 40px tall');
  });

  test('ReaderPhrasePopover links name phrases to their Name List entry and saves edits there', () => {
    const named = render(h(ReaderPhrasePopover, {
      phrase: { source: '林动', reading: 'lâm động', translation: 'Lâm Động', origin: 'name', entryId: 'n1' },
      options: ['Lâm Động', 'lâm động'],
      onPick: () => {}, onSaveName: () => {}, onClose: () => {}
    }));
    assert(named.includes('id="reader-phrase-open-name"'), 'name phrases link to the Name List');
    assert(named.includes('Name List'));
    assert(!named.includes('Soft Glossary'), 'picks for a name update the Name List, not the soft glossary');
  });

  // --- ReaderNotSaved ---
  const ReaderDictionaryStatus = (await loadComponent('components/react/reader/ReaderDictionaryStatus.jsx')).default;
  test('ReaderDictionaryStatus shows dictionary loading and then how long it took, in conversion mode only', () => {
    const loading = render(h(ReaderDictionaryStatus, { conversionMode: true, loading: true }));
    assert(/id="reader-dict-timing"/.test(loading) && loading.includes('Loading dictionaries'), 'while loading');
    const done = render(h(ReaderDictionaryStatus, { conversionMode: true, timings: { total: 2412, build: 300, byName: { vietPhrase: 1900 } } }));
    assert(done.includes('Dictionaries loaded in 2.4 s') && done.includes('VietPhrase 1.9 s'), 'after loading');
    assert(/role="status"/.test(done), 'announced politely');
    assert.strictEqual(render(h(ReaderDictionaryStatus, { conversionMode: false, timings: { total: 1, build: 1, byName: {} } })), '', 'nothing outside conversion mode');
    assert.strictEqual(render(h(ReaderDictionaryStatus, { conversionMode: true })), '', 'nothing before anything happened');
  });

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

  test('ReaderApp renders the header, loading state, source drawer, name list and toast', () => {
    for (const id of ['reading-progress-bar', 'reader-loading', 'source-drawer', 'name-list-drawer-panel', 'reader-chapters-panel', 'save-toast', 'save-toast-msg']) {
      assert(readerApp.includes(`id="${id}"`), `missing #${id}`);
    }
    assert(readerApp.includes('id="toggle-name-list-btn"'), 'reader header must expose the Name List trigger');
    assert(/id="reader-chapters-panel"[^>]*aria-hidden="true"/.test(readerApp), 'chapter list must start collapsed');
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
    const novelHeader = novelApp.match(/<header[\s\S]*?<\/header>/);
    assert(novelHeader && novelHeader[0].includes('id="open-name-list-btn"'), 'novel Name List trigger must live in the top bar next to Settings');
  });

  const { syncCatalog } = await loadComponent('components/react/novel/NovelApp.jsx');
  await testAsync('Sync Catalog refreshes the book (cover, total) together with its catalog', async () => {
    const calls = [];
    const updated = { id: 'n1', thumbnail: 'cover.png', chapterList: [{ chapterNumber: 1 }] };
    const storage = {
      async syncNovel(id) { calls.push(['syncNovel', id]); return updated; },
      async syncNovelChapters(id) { calls.push(['syncNovelChapters', id]); return updated; }
    };
    assert.strictEqual(await syncCatalog(storage, { id: 'n1' }), updated, 'returns the refreshed book');
    assert.deepStrictEqual(calls, [['syncNovel', 'n1']], 'one full sync, not the catalog alone');
  });

  const NovelHero = (await loadComponent('components/react/novel/NovelHero.jsx')).default;
  test('NovelHero shows the book it is given, so a sync refreshes the cover and total', () => {
    const html = render(h(NovelHero, { novel: { id: 'n1', title: 'A Regressor’s Tale', thumbnail: 'https://media.reaperscans.net/c.png', totalChapters: 893, domain: 'wetriedtls.com' } }));
    assert(/id="novel-artwork"[^>]*src="https:\/\/media\.reaperscans\.net\/c\.png"/.test(html) || /src="https:\/\/media\.reaperscans\.net\/c\.png"[^>]*id="novel-artwork"/.test(html), 'cover from the given book');
    assert(html.includes('A Regressor’s Tale'), 'title from the given book');
    assert(html.includes('893'), 'total from the given book');
  });

  test('a long chapter title in Continue reading shrinks instead of pushing the header past its card', () => {
    const longTitle = 'Chapter 36 - Five Energies Converging to the Origin and the Changes that Followed';
    const html = render(h(NovelHero, { novel: { id: 'n1', title: 'A Regressor’s Tale of Cultivation', totalChapters: 893, lastRead: { chapterNumber: 36, title: longTitle } } }));
    const column = html.match(/<div class="([^"]*flex-1[^"]*)"><div><div class="flex items-center justify-between gap-2 mb-2">/);
    assert(column && /(^| )min-w-0( |$)/.test(column[1]), `the text column may shrink (${column ? column[1] : 'not found'})`);
    const button = html.match(/<a id="novel-continue-btn"[^>]*>([\s\S]*?)<\/a>/);
    assert(button, 'continue button');
    const titleSpan = button[1].match(/<span class="([^"]*)">Chapter 36 - Five Energies/);
    assert(titleSpan && /truncate/.test(titleSpan[1]) && /(^| )min-w-0( |$)/.test(titleSpan[1]), 'the title truncates (needs min-w-0 inside the inline-flex button)');
  });

  test('NovelApp has a per-novel dictionary conversion toggle, off by default', () => {
    assert(/id="conversion-mode-toggle"[^>]*role="switch"/.test(novelApp) || /role="switch"[^>]*id="conversion-mode-toggle"/.test(novelApp), 'toggle is a switch');
    assert(/id="conversion-mode-toggle"[^>]*aria-checked="false"/.test(novelApp) || /aria-checked="false"[^>]*id="conversion-mode-toggle"/.test(novelApp), 'off by default');
  });

  const { ConversionModeToggle } = await loadComponent('components/react/novel/ConversionModeToggle.jsx');
  test('ConversionModeToggle reflects its state and explains the mode', () => {
    const on = render(h(ConversionModeToggle, { checked: true, onChange() {} }));
    assert(/aria-checked="true"/.test(on), 'checked state');
    assert(on.includes('Dictionary conversion'), 'labelled');
    const off = render(h(ConversionModeToggle, { checked: false, disabled: true, onChange() {} }));
    assert(/aria-checked="false"/.test(off) && /disabled/.test(off), 'unchecked and disabled');
    assert(/min-h-10|h-10/.test(on), 'touch target is at least 40px');
  });

  test('NameListDrawer exposes the Name List, Locked and Soft glossary tabs', () => {
    for (const id of ['name-list-tabs', 'name-list-tab-namelist', 'name-list-tab-locked', 'name-list-tab-soft', 'name-list-generate-prompt-btn']) {
      assert(novelApp.includes(`id="${id}"`), `missing #${id}`);
    }
    assert(novelApp.includes('Locked Glossary'), 'expected the Locked Glossary tab label');
    assert(novelApp.includes('Soft Glossary'), 'expected the Soft Glossary tab label');
    assert(/id="name-list-tab-namelist"[^>]*aria-selected="true"/.test(novelApp), 'name list tab is selected by default');
    assert(!novelApp.includes('id="name-list-prompt-panel"'), 'translation prompt panel must not render until opened');
  });

  const { MoveEntryButtons } = await loadComponent('components/react/novel/NameListDrawer.jsx');
  test('Name List rows move to the Locked Glossary, Locked rows move to the Name List, Soft rows still move to Locked', () => {
    const moves = (tab) => {
      const html = render(h(MoveEntryButtons, { tab, onMove() {} }));
      return (html.match(/<button[^>]*>/g) || []).map((b) => [(b.match(/data-move-to="([^"]*)"/) || [])[1], (b.match(/title="([^"]*)"/) || [])[1], /min-h-10/.test(b)]);
    };
    assert.deepStrictEqual(moves('namelist'), [['locked', 'Move to Locked Glossary', true]]);
    assert.deepStrictEqual(moves('locked'), [['namelist', 'Move to Name List', true]]);
    assert.deepStrictEqual(moves('soft'), [['locked', 'Move to Locked Glossary', true]], 'the soft move is unchanged');
    assert.deepStrictEqual(moves('rejected'), [], 'other lists have no move');
  });

  // --- ReaderChapterRow (reader sidebar owns its own row) ---
  const { ReaderChapterRow } = await loadComponent('components/react/reader/ReaderChapterList.jsx');
  test('ReaderChapterRow shows the full title, no cost and no delete', () => {
    const novel = { id: 'n1', title: 'N' };
    const chapter = { chapterNumber: 3, title: 'A very long chapter title that would otherwise be cut off' };
    const downloaded = { chapterNumber: 3, translationCost: { formattedCost: '$0.01' } };

    const row = render(h(ReaderChapterRow, { novel, chapter, chNum: 3, downloadedChapter: downloaded, isCurrent: true }));
    assert(!row.includes('$0.01'), 'reader row must not show the translation cost');
    assert(!row.includes('truncate'), 'reader row must not truncate the title');
    assert(row.includes('A very long chapter title that would otherwise be cut off'), 'reader row shows the full title');
    assert(row.includes('ring-indigo-500/50'), 'current chapter is highlighted');

    const unsaved = render(h(ReaderChapterRow, { novel, chapter, chNum: 4 }));
    assert(unsaved.includes('Download'), 'reader row offers a download action for unsaved chapters');
    assert(!unsaved.includes('Delete'), 'reader row must not offer delete');
  });

  // --- Page sites (nkwwlkj): chapter rows and paid badges ---
  const manualChapter = { chapterNumber: 3, title: 'Ch 3', url: 'https://www.nkwwlkj.cn/chapter/book_chapter_detail/100043460' };
  const lockedChapter = { chapterNumber: 5, title: 'Ch 5', url: 'https://www.nkwwlkj.cn/chapter/book_chapter_detail/100659849', locked: true };
  const cover = await loadComponent('components/react/shared/novelCover.js');
  const LEGACY_PLACEHOLDER = 'https://media.reaperscans.net/file/7BSHk1m/yj1teaon5c2jweqry01yo9t4.webp';
  test('novels without a cover get the bundled default cover', () => {
    assert.strictEqual(cover.DEFAULT_COVER, '../icons/default-cover.png', 'a relative path that works from every view');
    assert(require('fs').existsSync(require('path').join(__dirname, '..', 'src', 'icons', 'default-cover.png')), 'the image is bundled');
    for (const missing of ['', null, undefined, '   ', LEGACY_PLACEHOLDER]) {
      assert.strictEqual(cover.coverSrc(missing), cover.DEFAULT_COVER, `${JSON.stringify(missing)} shows the default`);
    }
    assert.strictEqual(cover.coverSrc('https://img.uukanshu.com/fengmian/a.jpg'), 'https://img.uukanshu.com/fengmian/a.jpg', 'a real cover is kept');
  });

  test('a cover that fails to load falls back to the default once', () => {
    const img = { src: 'https://img.example/broken.jpg', getAttribute() { return this.src; } };
    cover.showDefaultCover({ currentTarget: img });
    assert.strictEqual(img.src, cover.DEFAULT_COVER);
    const looping = { src: cover.DEFAULT_COVER, getAttribute() { return cover.DEFAULT_COVER; }, set onerror(v) {} };
    cover.showDefaultCover({ currentTarget: looping });
    assert.strictEqual(looping.src, cover.DEFAULT_COVER, 'no error loop when the default itself fails');
  });

  const { NovelCard } = await loadComponent('components/react/library/LibraryView.jsx');
  test('library cards and the novel page show the default cover when a novel has none', () => {
    const card = (thumbnail) => render(h(NovelCard, { novel: { id: 'n1', title: 'N', totalChapters: 3, thumbnail }, stats: {} }));
    assert(card('').includes('src="../icons/default-cover.png"'), 'no cover');
    assert(card(LEGACY_PLACEHOLDER).includes('src="../icons/default-cover.png"'), 'old placeholder');
    assert(card('https://img.example/c.jpg').includes('src="https://img.example/c.jpg"'), 'real cover');
    assert(!render(h(NovelHero)).includes('reaperscans'), 'the novel page no longer uses the old placeholder');
    assert(render(h(NovelHero)).includes('src="../icons/default-cover.png"'));
  });

  const lastReadMod = await loadComponent('components/react/shared/lastRead.jsx');
  const readNovel = { id: 'n 1', title: 'N', totalChapters: 40, lastRead: { chapterNumber: 12, paragraph: 4, count: 40, title: 'Chương 12: Tuyết', updatedAt: 1 } };
  test('the Continue link opens the last read chapter at its paragraph', () => {
    assert.strictEqual(lastReadMod.continueHref(readNovel), 'reader.html?id=n%201&ch=12&p=4');
    assert.strictEqual(lastReadMod.continueHref({ ...readNovel, lastRead: { chapterNumber: 2 } }), 'reader.html?id=n%201&ch=2');
    assert.strictEqual(lastReadMod.continueHref({ id: 'n1' }), null, 'nothing read yet');
    assert.strictEqual(lastReadMod.lastReadLabel(readNovel), 'Ch. 12');
    assert.strictEqual(lastReadMod.isLastRead(readNovel, 12), true);
    assert.strictEqual(lastReadMod.isLastRead(readNovel, '12'), true);
    assert.strictEqual(lastReadMod.isLastRead(readNovel, 11), false);
    assert.strictEqual(lastReadMod.isLastRead(null, 12), false);
  });

  test('the reading position is the first paragraph still on screen below the header', () => {
    const rects = [{ top: -900, bottom: -300 }, { top: -280, bottom: 40 }, { top: 60, bottom: 400 }, { top: 420, bottom: 800 }];
    assert.strictEqual(lastReadMod.topParagraphIndex(rects, 64), 2, 'paragraph 1 ends under the header, so 2 is where you are');
    assert.strictEqual(lastReadMod.topParagraphIndex(rects, 0), 1);
    assert.strictEqual(lastReadMod.topParagraphIndex([], 64), 0);
    assert.strictEqual(lastReadMod.topParagraphIndex([{ top: -900, bottom: -10 }], 64), 0, 'past the end keeps the last paragraph');
  });

  test('a saved position scales when the chapter now has a different number of paragraphs', () => {
    assert.strictEqual(lastReadMod.restoreParagraph({ paragraph: 4, count: 40 }, 40), 4);
    assert.strictEqual(lastReadMod.restoreParagraph({ paragraph: 20, count: 40 }, 20), 10, 'saved text vs converted text');
    assert.strictEqual(lastReadMod.restoreParagraph({ paragraph: 50, count: 0 }, 10), 9, 'clamped to the last paragraph');
    assert.strictEqual(lastReadMod.restoreParagraph({ paragraph: 3 }, 10), 3, 'no saved count: use the index');
    assert.strictEqual(lastReadMod.restoreParagraph(null, 10), 0);
    assert.strictEqual(lastReadMod.restoreParagraph({ paragraph: 3, count: 10 }, 0), 0);
  });

  test('opening a saved chapter in the reader records it as last read', async () => {
    const calls = [];
    const storage = { setLastRead: async (...args) => { calls.push(args); return {}; } };
    await lastReadMod.recordChapterOpened(storage, 'n1', { chapterNumber: 7, title: 'Ch 7' }, 7, 3, 40);
    assert.deepStrictEqual(calls, [['n1', { chapterNumber: 7, paragraph: 3, count: 40, title: 'Ch 7' }]]);
    await lastReadMod.recordChapterOpened(storage, 'n1', null, 8, 0);
    assert.strictEqual(calls.length, 1, 'a chapter that is not saved is not recorded');
    await lastReadMod.recordChapterOpened(null, 'n1', { chapterNumber: 7 }, 7, 0);
  });

  test('ContinueReadingButton links to the last read chapter and hides when nothing was read', () => {
    const { ContinueReadingButton } = lastReadMod;
    const html = render(h(ContinueReadingButton, { novel: readNovel, id: 'novel-continue-btn' }));
    assert(/<a[^>]*id="novel-continue-btn"[^>]*href="reader\.html\?id=n%201&amp;ch=12&amp;p=4"/.test(html), 'links to the chapter and paragraph');
    assert(html.includes('Continue reading') && html.includes('Ch. 12') && html.includes('Chương 12: Tuyết'));
    assert(/min-h-10/.test(html), 'touch-friendly');
    assert.strictEqual(render(h(ContinueReadingButton, { novel: { id: 'n1' } })), '');
    assert(/target="_blank"/.test(render(h(ContinueReadingButton, { novel: readNovel, target: '_blank' }))), 'the popup opens the reader in a tab');
    assert(!/target=/.test(html), 'pages open the reader in place');
  });

  test('library cards show the last read chapter with a Continue link', () => {
    const html = render(h(NovelCard, { novel: readNovel, stats: {} }));
    assert(html.includes('Last read') && html.includes('Ch. 12'));
    assert(/<a[^>]*data-continue-reading[^>]*href="reader\.html\?id=n%201&amp;ch=12&amp;p=4"/.test(html) || /<a[^>]*href="reader\.html\?id=n%201&amp;ch=12&amp;p=4"[^>]*data-continue-reading/.test(html), 'continue link');
    assert(!render(h(NovelCard, { novel: { id: 'n2', title: 'M', totalChapters: 3 }, stats: {} })).includes('Last read'), 'nothing for an unread novel');
  });

  const providerLoginMod = await loadComponent('components/react/shared/ProviderLogin.jsx');
  const { ProviderLoginStatus } = providerLoginMod;
  const ProviderLoginBanner = providerLoginMod.default;
  const LOGIN_URL = 'https://www.nkwwlkj.cn/signup/login?redirect=https%3A%2F%2Fwww.nkwwlkj.cn%2F';
  const { SettingsDriveCard } = await loadComponent('components/react/settings/SettingsStorageTab.jsx');
  test('the Google Drive card leads with Sync now and says which actions replace data', () => {
    const noop = () => {};
    const handlers = { onSignIn: noop, onSync: noop, onUpload: noop, onDownload: noop, onSignOut: noop };
    const signedOut = render(h(SettingsDriveCard, { cloud: { connected: false }, busy: false, feedback: { text: '', cls: '' }, formatWhen: (x) => x, ...handlers }));
    assert(/<button[^>]*id="cloud-sync-btn"[^>]*disabled=""/.test(signedOut), 'Sync needs a sign-in');
    const html = render(h(SettingsDriveCard, {
      cloud: { connected: true, lastBackupAt: 'B', lastSyncAt: 'S' },
      busy: false,
      feedback: { text: '', cls: '' },
      formatWhen: (x) => `when(${x})`,
      ...handlers
    }));
    const sync = html.indexOf('id="cloud-sync-btn"');
    assert(sync > -1 && !/<button[^>]*id="cloud-sync-btn"[^>]*disabled=""/.test(html), 'Sync is available when signed in');
    assert(sync < html.indexOf('id="cloud-upload-btn"') && sync < html.indexOf('id="cloud-download-btn"'), 'Sync comes first');
    assert(html.includes('Sync now'), 'labelled');
    assert(html.includes('Replace Drive copy') && html.includes('Replace this device'), 'the one-way actions say what they replace');
    assert(html.includes('Last sync: when(S)'), 'shows the last sync');
    assert(/merg/i.test(html), 'explains that sync merges both sides');
  });

  test('the Google Drive card has a Sync automatically switch reflecting the setting', () => {
    const noop = () => {};
    const card = (autoSync) => render(h(SettingsDriveCard, {
      cloud: { connected: true }, busy: false, feedback: { text: '', cls: '' }, formatWhen: (x) => x,
      onSignIn: noop, onSync: noop, onUpload: noop, onDownload: noop, onSignOut: noop, autoSync, onToggleAuto: noop
    }));
    const on = card(true).match(/<input[^>]*id="auto-sync-toggle"[^>]*>/);
    assert(on && /type="checkbox"/.test(on[0]) && /checked=""/.test(on[0]), 'on');
    const off = card(false).match(/<input[^>]*id="auto-sync-toggle"[^>]*>/);
    assert(off && !/checked=""/.test(off[0]), 'off');
    assert(card(true).includes('Sync automatically'), 'labelled');
  });

  const { SyncStatusBadgeView } = await loadComponent('components/react/shared/SyncStatus.jsx');
  test('the library shows how the sync is doing', () => {
    const now = Date.parse('2026-10-19T12:00:00Z');
    const badge = (status) => render(h(SyncStatusBadgeView, { status, now, onSyncNow() {} }));
    assert.strictEqual(badge(null), '', 'nothing before the first status');
    assert.strictEqual(badge({ state: 'off' }), '', 'nothing when automatic sync is off');
    assert(badge({ state: 'syncing' }).includes('Syncing…'));
    assert(badge({ state: 'idle', lastSyncAt: '2026-10-19T11:58:00Z' }).includes('Synced 2 min ago'));
    assert(badge({ state: 'idle', lastSyncAt: '2026-10-19T11:59:40Z' }).includes('Synced just now'));
    assert(badge({ state: 'idle', lastSyncAt: '2026-10-19T09:00:00Z' }).includes('Synced 3 h ago'));
    const signedOut = badge({ state: 'signed-out' });
    assert(signedOut.includes('Sign in to sync') && /href="settings\.html/.test(signedOut), 'points to Settings to sign in');
    const failed = badge({ state: 'error', error: 'Google Drive upload failed (503)' });
    assert(failed.includes('Sync failed') && failed.includes('Google Drive upload failed (503)'), 'says what failed');
    const idle = badge({ state: 'idle', lastSyncAt: '2026-10-19T11:58:00Z' });
    assert(/<button[^>]*id="library-sync-status"/.test(idle) && /min-h-10/.test(idle), 'a tappable button that syncs now');
  });

  const { refreshOnSync } = await loadComponent('components/react/shared/SyncStatus.jsx');
  test('pages refresh what they show when a sync brings changes', () => {
    const listeners = {};
    const fired = [];
    const win = {
      addEventListener: (type, fn) => { listeners[type] = fn; },
      removeEventListener: (type) => { delete listeners[type]; },
      dispatchEvent: (e) => fired.push(e.type)
    };
    const stop = refreshOnSync(win, 'novel-chapters-refresh');
    listeners['library-synced']({ detail: { novels: 0, chapters: 3, deleted: 0 } });
    assert.deepStrictEqual(fired, ['novel-chapters-refresh']);
    stop();
    assert.strictEqual(listeners['library-synced'], undefined);
    const read = (entry) => require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'components', 'react', ...entry.split('/')), 'utf8');
    assert(/refreshOnSync\(window, 'novel-chapters-refresh'\)/.test(read('novel/novel-entry.jsx')), 'the novel page refreshes its chapters');
    assert(/refreshOnSync\(window, 'reader-chapter-refresh'\)/.test(read('reader/reader-entry.jsx')), 'the reader refreshes its chapter');
    const library = read('library/LibraryView.jsx');
    assert(/<SyncStatusBadge \/>/.test(library) && /'library-synced'/.test(library), 'the library shows the sync status and reloads after a sync');
  });

  const offscreenOcr = await loadComponent('components/react/ocr/ocrOffscreen.js');
  await testAsync('the offscreen OCR page reads pictures sent by the worker and answers with text or the error', async () => {
    const seen = [];
    const recognize = async (bytes, mime) => { seen.push([Array.from(new Uint8Array(bytes)), mime]); return '第一章'; };
    assert.deepStrictEqual(await offscreenOcr.handleOcrMessage({ action: 'OCR_RECOGNIZE', target: 'offscreen', base64: 'AQID', mimeType: 'image/png' }, recognize), { text: '第一章' });
    assert.deepStrictEqual(seen, [[[1, 2, 3], 'image/png']]);
    assert.strictEqual(await offscreenOcr.handleOcrMessage({ action: 'QUEUE_PROGRESS' }, recognize), null, 'ignores other messages');
    const failing = async () => { throw new Error('model failed to load'); };
    assert.deepStrictEqual(await offscreenOcr.handleOcrMessage({ action: 'OCR_RECOGNIZE', target: 'offscreen', base64: 'AQID', mimeType: 'image/png' }, failing), { error: 'model failed to load' });
    const html = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'views', 'ocr-offscreen.html'), 'utf8');
    assert(html.indexOf('../services/platform.js') > -1 && html.indexOf('ocr-offscreen-entry.js') > html.indexOf('../services/platform.js'), 'the page loads the platform, then the OCR entry');
  });

  const { installAppOcr } = await loadComponent('components/react/shared/appOcr.js');
  test('the novel and reader pages give downloads an OCR reader', () => {
    const win = {};
    installAppOcr(win);
    assert.strictEqual(typeof win.QCOcr.recognize, 'function');
    for (const entry of ['novel/novel-entry.jsx', 'reader/reader-entry.jsx']) {
      const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'components', 'react', ...entry.split('/')), 'utf8');
      assert(/installAppOcr\(/.test(src), `${entry} installs the OCR reader`);
    }
  });

  await testAsync('in the app, Log in opens the site inside the app and checks the login again when it closes', async () => {
    const { handleLoginLink } = providerLoginMod;
    const opened = [];
    let prevented = false;
    let rechecked = 0;
    const siteSave = { available: () => true, openLogin: async (url) => { opened.push(url); return { status: 'closed' }; } };
    handleLoginLink({ preventDefault() { prevented = true; } }, LOGIN_URL, { siteSave, onDone: () => { rechecked++; } });
    await new Promise((r) => setTimeout(r, 0));
    assert.deepStrictEqual(opened, [LOGIN_URL]);
    assert.strictEqual(prevented, true, 'no external browser');
    assert.strictEqual(rechecked, 1, 'login checked again after closing');

    prevented = false;
    handleLoginLink({ preventDefault() { prevented = true; } }, LOGIN_URL, { siteSave: { available: () => false }, onDone: () => {} });
    assert.strictEqual(prevented, false, 'the extension keeps the normal new-tab link');
  });

  test('ProviderLoginStatus shows a login link that opens the official site in a new tab when logged out', () => {
    const html = render(h(ProviderLoginStatus, { state: { loggedIn: false, userId: null, userName: '' }, providerName: '独阅读', loginUrl: LOGIN_URL, onRecheck: () => {} }));
    assert(html.includes('id="provider-login-status"'), 'status container');
    assert(/not logged in/i.test(html) && html.includes('独阅读'), 'says the user is not logged in to the site');
    const link = html.match(/<a[^>]*id="provider-login-btn"[^>]*>/);
    assert(link, 'login link');
    assert(link[0].includes(`href="${LOGIN_URL.replace(/&/g, '&amp;')}"`), 'links to the official login page');
    assert(link[0].includes('target="_blank"'), 'opens a new tab');
    assert(html.includes('id="provider-login-recheck-btn"'), 'offers a manual re-check');
  });

  test('ProviderLoginStatus reflects a logged-in user and hides the login link', () => {
    const html = render(h(ProviderLoginStatus, { state: { loggedIn: true, userId: '9', userName: '守玄' }, providerName: '独阅读', loginUrl: LOGIN_URL }));
    assert(/logged in/i.test(html) && !/not logged in/i.test(html), 'logged-in status');
    assert(html.includes('守玄'), 'shows the account name');
    assert(!html.includes('id="provider-login-btn"'), 'no login link once logged in');
  });

  test('ProviderLoginStatus shows the coin balance of a logged-in user', () => {
    const html = render(h(ProviderLoginStatus, { state: { loggedIn: true, userId: '9', userName: '守玄', balance: { coins: 1250, bonusCoins: 88 } }, providerName: '独阅读', loginUrl: LOGIN_URL }));
    const coins = html.match(/id="provider-coin-balance"[^>]*>([\s\S]*?)<\/span>/);
    assert(coins, 'coin balance element');
    assert(coins[1].includes('1,250') && /coins/i.test(coins[1]), 'shows the coin count');
    assert(html.includes('88') && /bonus/i.test(html), 'shows the bonus coins');
    const noBonus = render(h(ProviderLoginStatus, { state: { loggedIn: true, userId: '9', userName: '', balance: { coins: 0, bonusCoins: null } }, providerName: '独阅读', loginUrl: LOGIN_URL }));
    assert(/id="provider-coin-balance"[^>]*>[^<]*0 coins/i.test(noBonus), 'a zero balance is still shown');
    assert(!/bonus/i.test(noBonus), 'no bonus line when the site gives none');
  });

  test('ProviderLoginStatus hides the balance when it is unknown or the user is logged out', () => {
    const unknown = render(h(ProviderLoginStatus, { state: { loggedIn: true, userId: '9', userName: '守玄' }, providerName: '独阅读', loginUrl: LOGIN_URL }));
    assert(!unknown.includes('id="provider-coin-balance"'));
    const out = render(h(ProviderLoginStatus, { state: { loggedIn: false, userId: null, userName: '', balance: { coins: 0, bonusCoins: 0 } }, providerName: '独阅读', loginUrl: LOGIN_URL }));
    assert(!out.includes('id="provider-coin-balance"'), 'a logged-out page shows 0, which is not a real balance');
  });

  test('ProviderLoginStatus renders nothing until the status is known', () => {
    assert.strictEqual(render(h(ProviderLoginStatus, { state: null, providerName: '独阅读', loginUrl: LOGIN_URL })), '');
  });

  test('ProviderLoginBanner renders nothing for sites without login support', () => {
    assert.strictEqual(render(h(ProviderLoginBanner, { novel: { url: 'https://wetriedtls.com/series/x' } })), '');
    assert.strictEqual(render(h(ProviderLoginBanner, { novel: null })), '');
  });

  const { ChapterRow: NovelChapterRow } = await loadComponent('components/react/novel/NovelChapters.jsx');
  const { ChapterRow: PopupChapterRow } = await loadComponent('components/react/popup/PopupNovelView.jsx');
  const rowNovel = { id: 'n1', title: 'N' };
  const { ChapterAccessBadge } = await loadComponent('components/react/shared/ChapterAccessBadge.jsx');
  const accessOf = (html) => {
    const m = html.match(/data-chapter-access="(\w+)"[^>]*>((?:<span[^>]*>[^<]*<\/span>|[^<])*)<\/span>/);
    return m ? { kind: m[1], text: m[2].replace(/<[^>]+>/g, '').trim() } : null;
  };

  test('ChapterAccessBadge labels free and paid chapters and stays out of sites without paid chapters', () => {
    assert.deepStrictEqual(accessOf(render(h(ChapterAccessBadge, { chapter: { ...manualChapter, locked: false } }))), { kind: 'free', text: 'Free' });
    const paid = accessOf(render(h(ChapterAccessBadge, { chapter: lockedChapter })));
    assert.strictEqual(paid.kind, 'paid');
    assert(paid.text.includes('Paid'), 'paid label');
    assert.strictEqual(render(h(ChapterAccessBadge, { chapter: manualChapter })), '', 'no badge when the site has no free/paid split');
    assert.strictEqual(render(h(ChapterAccessBadge, { chapter: null })), '');
  });

  test('every chapter list marks the last read chapter', () => {
    const novelWithProgress = { ...rowNovel, lastRead: { chapterNumber: 3, paragraph: 0 } };
    const rows = [
      ['novel', (props) => render(h(NovelChapterRow, { novel: novelWithProgress, chNum: props.chapter.chapterNumber, onDelete() {}, ...props }))],
      ['reader', (props) => render(h(ReaderChapterRow, { novel: novelWithProgress, chNum: props.chapter.chapterNumber, ...props }))],
      ['popup', (props) => render(h(PopupChapterRow, { novel: novelWithProgress, onOpen() {}, onDelete() {}, onDownload() {}, ...props }))]
    ];
    for (const [name, renderRow] of rows) {
      const last = renderRow({ chapter: manualChapter });
      assert(/data-last-read="true"/.test(last) && last.includes('Last read'), `${name} row marks the last read chapter`);
      const other = renderRow({ chapter: lockedChapter });
      assert(!/data-last-read="true"/.test(other), `${name} row leaves other chapters alone`);
    }
  });

  test('every chapter list shows whether each chapter is free or paid', () => {
    const freeChapter = { ...manualChapter, locked: false };
    const rows = [
      ['novel', (props) => render(h(NovelChapterRow, { novel: rowNovel, chNum: props.chapter.chapterNumber, onDelete() {}, ...props }))],
      ['reader', (props) => render(h(ReaderChapterRow, { novel: rowNovel, chNum: props.chapter.chapterNumber, ...props }))],
      ['popup', (props) => render(h(PopupChapterRow, { novel: rowNovel, onOpen() {}, onDelete() {}, onDownload() {}, ...props }))]
    ];
    for (const [name, renderRow] of rows) {
      assert.strictEqual((accessOf(renderRow({ chapter: freeChapter })) || {}).kind, 'free', `${name} row marks free chapters`);
      assert.strictEqual((accessOf(renderRow({ chapter: lockedChapter })) || {}).kind, 'paid', `${name} row marks paid chapters`);
      const saved = renderRow({ chapter: lockedChapter, downloadedChapter: { chapterNumber: 5, title: 'Ch 5' } });
      assert.strictEqual((accessOf(saved) || {}).kind, 'paid', `${name} row keeps the paid mark once saved`);
      assert.strictEqual(accessOf(renderRow({ chapter: manualChapter })), null, `${name} row adds nothing on sites without paid chapters`);
    }
  });
  test('chapter rows offer Download on every site, also for page sites and paid chapters', () => {
    const pageNovel = { ...rowNovel, url: 'https://www.nkwwlkj.cn/book/book_detail/100181750' };
    const rows = [
      ['novel', (props) => render(h(NovelChapterRow, { novel: pageNovel, chNum: props.chapter.chapterNumber, onDelete() {}, ...props }))],
      ['reader', (props) => render(h(ReaderChapterRow, { novel: pageNovel, chNum: props.chapter.chapterNumber, ...props }))],
      ['popup', (props) => render(h(PopupChapterRow, { novel: pageNovel, onOpen() {}, onDelete() {}, onDownload() {}, ...props }))]
    ];
    for (const [name, renderRow] of rows) {
      const free = renderRow({ chapter: manualChapter, manualOnly: true });
      assert(free.includes('title="Download Chapter 3"') && !free.includes('Open to save'), `${name} row offers Download, never Open to save`);
      const paid = renderRow({ chapter: lockedChapter, manualOnly: true });
      assert(paid.includes('title="Download Chapter 5"') && !paid.includes('Open to save'), `${name} row offers Download for a paid chapter (the queue stops at the page if it is not unlocked)`);
    }
  });

  test('ReaderNotSaved offers Download for page-site chapters too', () => {
    const page = render(h(ReaderNotSaved, { onDownload: () => {}, manualChapter }));
    assert(page.includes('id="reader-download-btn"'), 'the download button');
    assert(!page.includes('id="reader-open-source-link"') && !page.includes('Open chapter page'), 'no Open chapter page link');
  });

  // --- OCR reading panel (image-only chapters, read-only) ---
  const ocrPanelMod = await loadComponent('components/react/ocr/OcrPanelApp.jsx');
  const OcrPanelApp = ocrPanelMod.default;
  const { OcrPanelView } = ocrPanelMod;
  const NL = String.fromCharCode(10, 10);
  test('OcrPanelApp starts waiting for the chapter image with translation disabled', () => {
    const html = render(h(OcrPanelApp));
    for (const id of ['ocr-panel', 'ocr-status', 'ocr-translate-btn', 'ocr-close-btn', 'ocr-deepseek-toggle']) {
      assert(html.includes(`id="${id}"`), `missing #${id}`);
    }
    assert(html.includes('Waiting for the chapter image'), 'initial status');
    assert(/id="ocr-translate-btn"[^>]*disabled/.test(html), 'translate is disabled until text is recognized');
    assert(html.includes('Nothing from this page is saved'), 'states the panel is read-only');
  });

  test('OcrPanelView shows recognized text and enables translation', () => {
    const html = render(h(OcrPanelView, { status: 'recognized', sourceText: '第一段。' + NL + '第二段。', showSource: true }));
    assert(!/id="ocr-translate-btn"[^>]*disabled/.test(html), 'translate is enabled once text is recognized');
    assert(html.includes('第一段。') && html.includes('第二段。'), 'recognized paragraphs are shown');
    assert(html.includes('id="ocr-source-text"'), 'source text container');
  });

  test('OcrPanelView renders the translation as paragraphs and hides the source when toggled off', () => {
    const html = render(h(OcrPanelView, { status: 'done', sourceText: '源文。', translatedText: 'First paragraph.' + NL + 'Second paragraph.', showSource: false }));
    assert(html.includes('id="ocr-translated-text"'), 'translation container');
    assert((html.match(/<p[ >]/g) || []).length >= 2, 'one <p> per translated paragraph');
    assert(html.includes('First paragraph.') && html.includes('Second paragraph.'));
    assert(!html.includes('id="ocr-source-text"'), 'source hidden when showSource is false');
  });

  test('OcrPanelView shows the size of the chapter image it read', () => {
    const html = render(h(OcrPanelView, { status: 'recognized', sourceText: '正文。', imageSize: { width: 939, height: 4200 } }));
    assert(html.includes('id="ocr-image-info"') && html.includes('939') && html.includes('4200'), 'image size is shown');
    assert(!render(h(OcrPanelView, { status: 'waiting' })).includes('id="ocr-image-info"'), 'hidden before an image arrives');
  });

  test('OcrPanelView surfaces errors', () => {
    const html = render(h(OcrPanelView, { status: 'error', error: 'Could not read the chapter image.' }));
    assert(html.includes('id="ocr-error"') && html.includes('Could not read the chapter image.'));
  });

  test('OcrPanelView in save mode says the recognized chapter is saved to the library', () => {
    const html = render(h(OcrPanelView, { status: 'waiting', saveMode: true }));
    assert(!html.includes('Nothing from this page is saved'), 'save mode is not read-only');
    assert(/saved to your library/i.test(html), 'explains the chapter will be saved');
  });

  test('OcrPanelView shows save progress and reports saved only in the saved state', () => {
    const saving = render(h(OcrPanelView, { status: 'saving', saveMode: true, sourceText: '正文。' }));
    assert(/Saving/.test(saving) && !/Saved to your library\./.test(saving), 'saving is shown as in progress');
    assert(/id="ocr-translate-btn"[^>]*disabled/.test(saving), 'translate is disabled while saving');
    const saved = render(h(OcrPanelView, { status: 'saved', saveMode: true, sourceText: '正文。' }));
    assert(saved.includes('Saved to your library.'), 'saved status');
    const translating = render(h(OcrPanelView, { status: 'translating', saveMode: true, progressText: 'Translating (40%)...' }));
    assert(translating.includes('Translating (40%)...'), 'translation progress is shown');
  });

  test('OcrPanelView offers a retry after a failed save', () => {
    const failed = render(h(OcrPanelView, { status: 'error', saveMode: true, error: 'No text was found in the chapter image. The chapter was not saved.', onRetry: () => {} }));
    assert(failed.includes('id="ocr-retry-btn"'), 'retry button');
    assert(failed.includes('The chapter was not saved.'));
    assert(!render(h(OcrPanelView, { status: 'saved', saveMode: true, onRetry: () => {} })).includes('id="ocr-retry-btn"'), 'no retry once saved');
  });

  // --- QueueDock paused banner ---
  const QueueDock = (await loadComponent('components/react/shared/QueueDock.jsx')).default;
  test('QueueDock paused banner surfaces the pause error', () => {
    const state = {
      activeTask: null,
      queue: [{ id: 'n1_ch3', novelId: 'n1', chapterNumber: 3, status: 'paused_error', chapterTitle: 'Ch 3' }],
      isPaused: true,
      isProcessing: false,
      totalCount: 1,
      cooldown: null,
      pauseError: 'Translation timed out: no data received for 60 seconds.'
    };
    const service = { getState: () => state, subscribe: (cb) => { cb(state); return () => {}; } };
    const html = render(h(QueueDock, { queueService: service, isPopup: false }));
    assert(html.includes('Queue paused — request failed'), 'paused banner heading');
    assert(html.includes('Translation timed out: no data received for 60 seconds.'), 'pause error message is shown');
  });

  test('QueueDock says when a chapter is waiting for you and offers to show its page', () => {
    const state = {
      activeTask: { id: 'n1_ch3', novelId: 'n1', novelTitle: '门户', chapterNumber: 3, chapterTitle: 'Chapter 3', status: 'processing', progress: { phase: 'needs-user', text: 'Log in to 独阅读' } },
      queue: [],
      isPaused: false,
      isProcessing: true,
      totalCount: 1,
      cooldown: null,
      pauseError: null
    };
    const service = { getState: () => state, subscribe: (cb) => { cb(state); return () => {}; } };
    const html = render(h(QueueDock, { queueService: service, isPopup: false }));
    assert(html.includes('Waiting for you') && html.includes('Log in to 独阅读'), 'says what the page needs');
    assert(/<button[^>]*id="queue-show-page-btn"/.test(html), 'a Show page button');
    assert(/min-h-10/.test((html.match(/<button[^>]*id="queue-show-page-btn"[^>]*>/) || [''])[0]), 'tappable');
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

  test('buildDownloadOptions replaces a stale/blank official model with deepseek-flash', () => {
    const legacy = buildDownloadOptions({ enabled: true, provider: 'official', apiKey: 'sk', model: 'auto' });
    assert.strictEqual(legacy.translation.model, 'deepseek-flash', 'legacy "auto" must not reach the official API');
    const blank = buildDownloadOptions({ enabled: true, provider: 'official', apiKey: 'sk', model: '  ' });
    assert.strictEqual(blank.translation.model, 'deepseek-flash');

    const custom = buildDownloadOptions({ enabled: true, provider: 'custom', customUrl: 'http://127.0.0.1:8000/v1', model: 'auto' });
    assert.strictEqual(custom.translation.model, 'auto', 'custom bridges keep their own model ids');
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

  // --- nameListSource helpers ---
  const { findMatches, buildSnippets, splitByNames, createNameMatcher, findNameConflicts, computeVirtualWindow } = await loadComponent('components/react/novel/nameListSource.js');

  test('findMatches locates whole-word, case-insensitive source occurrences', () => {
    assert.deepStrictEqual(findMatches('Wang Lin met wang lin.', 'Wang Lin').map((m) => m.index), [0, 13]);
    assert.deepStrictEqual(findMatches('abc', 'zzz'), []);
    assert.deepStrictEqual(findMatches('', 'a'), []);
    assert.deepStrictEqual(findMatches('aaaa', 'aa'), [], 'partial (non-whole-word) hits are excluded');
    assert.deepStrictEqual(findMatches('Just Ju.', 'Ju').map((m) => m.index), [5], 'Ju does not match inside Just');
    assert.deepStrictEqual(findMatches('ju JU', 'Ju').map((m) => m.index), [0, 3], 'case-insensitive');
  });

  test('buildSnippets wraps the match with elided context and caps the count', () => {
    const text = 'A'.repeat(200) + ' Wang Lin ' + 'B'.repeat(200);
    const { count, snippets } = buildSnippets(text, 'Wang Lin', { context: 10, max: 5 });
    assert.strictEqual(count, 1);
    assert.strictEqual(snippets.length, 1);
    assert.strictEqual(snippets[0].match, 'Wang Lin');
    assert(snippets[0].before.startsWith('…'), 'long leading context must be elided');
    assert(snippets[0].after.endsWith('…'), 'long trailing context must be elided');
    assert.strictEqual(snippets[0].before.length, 11, '10 chars of context plus the ellipsis');

    const many = ('X Wang Lin ').repeat(8);
    const capped = buildSnippets(many, 'Wang Lin', { max: 3 });
    assert.strictEqual(capped.count, 8);
    assert.strictEqual(capped.snippets.length, 3);
  });

  test('splitByNames marks whole-word, case-insensitive name matches', () => {
    const entries = [
      { id: 'n1', original: 'Li Qiye', translation: 'Lý Thất Dạ' },
      { id: 'n2', original: 'Wang Lin', translation: 'Vương Lâm' }
    ];
    const segs = splitByNames('Lý Thất Dạ met vương lâm and Lý Thất Dạx.', entries);
    assert.deepStrictEqual(segs.filter((s) => s.nameId).map((s) => s.nameId), ['n1', 'n2'], 'word boundary prevents Dạx');
    assert.strictEqual(segs.filter((s) => s.nameId)[1].text, 'vương lâm', 'case-insensitive');
    assert.strictEqual(segs.map((s) => s.text).join(''), 'Lý Thất Dạ met vương lâm and Lý Thất Dạx.', 'text is preserved');
    assert.deepStrictEqual(splitByNames('plain text', []), [{ text: 'plain text' }]);
  });

  test('createNameMatcher highlights case-sensitively when asked (reader view)', () => {
    const entries = [{ id: 'n1', original: 'Li Qiye', translation: 'Lý Thất Dạ' }];
    const sensitive = createNameMatcher(entries, { caseSensitive: true });
    assert.deepStrictEqual(sensitive.split('Lý Thất Dạ met lý thất dạ.').filter((s) => s.nameId).map((s) => s.text), ['Lý Thất Dạ'], 'lowercase spelling must not highlight');
    const insensitive = createNameMatcher(entries);
    assert.deepStrictEqual(insensitive.split('Lý Thất Dạ met lý thất dạ.').filter((s) => s.nameId).length, 2, 'default stays case-insensitive');
  });

  test('splitByNames prefers the longest overlapping name', () => {    const entries = [
      { id: 'short', original: 'a', translation: 'Vương' },
      { id: 'long', original: 'b', translation: 'Vương Lâm' }
    ];
    const segs = splitByNames('Vương Lâm arrived.', entries);
    const hit = segs.find((s) => s.nameId);
    assert.strictEqual(hit.nameId, 'long');
    assert.strictEqual(hit.text, 'Vương Lâm');
  });

  test('NameMatcher trie finds whole-word matches longest-first and replaces in one pass', () => {
    const api = globalThis.NameMatcher;
    assert(api && typeof api.createMatcher === 'function', 'NameMatcher must be exposed');
    const matcher = api.createMatcher(
      [{ id: 'a', original: 'Vương' }, { id: 'b', original: 'Vương Lâm' }],
      { field: 'original', caseSensitive: true }
    );
    const hits = matcher.findAll('Vương Lâm met Vương Lâmx');
    assert.deepStrictEqual(hits.map((h) => h.id), ['b'], 'Lâmx is not a whole-word match');
    assert.strictEqual(hits[0].index, 0, 'longer name wins at the same start');
    assert.strictEqual(matcher.findAll('vương lâm').length, 0, 'case-sensitive');
    assert.strictEqual(matcher.replaceAll('Vương Lâm and Vương', (m) => `[${m.id}]`), '[b] and [a]', 'single-pass replace');
  });

  test('whole-word matching treats hyphens as part of the word', () => {
    const api = globalThis.NameMatcher;
    const onlyJu = api.createMatcher([{ id: 'ju', original: 'Ju' }], { field: 'original', caseSensitive: true });
    assert.strictEqual(onlyJu.findAll('Ju-han').length, 0, 'Ju must not match inside Ju-han');
    assert.strictEqual(onlyJu.findAll('Just').length, 0, 'Ju must not match inside Just');
    assert.strictEqual(onlyJu.findAll('Ju.').length, 1, 'Ju matches standalone');
    const full = api.createMatcher([{ id: 'jh', original: 'Ju-han' }], { field: 'original', caseSensitive: true });
    assert.strictEqual(full.findAll('Ju-han met Ju-han.').length, 2, 'the full hyphenated name still matches');
  });

  test('NameMatcher matches astral-plane (surrogate-pair) names', () => {
    const api = globalThis.NameMatcher;
    const astral = String.fromCodePoint(0x20000);
    const matcher = api.createMatcher([{ id: 'z', original: astral, translation: astral }], { field: 'original', caseSensitive: true });
    const text = `Met ${astral} here.`;
    const hits = matcher.findAll(text);
    assert.strictEqual(hits.length, 1, 'astral name must match');
    assert.strictEqual(hits[0].length, 2, 'match length is measured in code units');
    assert.strictEqual(text.slice(hits[0].index, hits[0].index + hits[0].length), astral);
    const segs = splitByNames(`Go ${astral}.`, [{ id: 'z', original: 'x', translation: astral }]);
    assert.strictEqual(segs.find((s) => s.nameId === 'z').text, astral, 'splitByNames highlights astral names');
  });

  test('splitByNames scales to thousands of names', () => {
    const entries = [];
    for (let i = 0; i < 3000; i += 1) entries.push({ id: `n${i}`, original: `Name${i}`, translation: `Tên${i}` });
    const segs = splitByNames('Start Tên2500 and Tên3 end.', entries);
    assert.deepStrictEqual(segs.filter((s) => s.nameId).map((s) => s.nameId), ['n2500', 'n3']);
  });

  test('splitByNames caps highlights per paragraph', () => {
    const matcher = createNameMatcher([{ id: 'a', original: 'x', translation: 'Aaa' }], { maxMatches: 2 });
    const segs = matcher.split('Aaa Aaa Aaa Aaa');
    assert.strictEqual(segs.filter((s) => s.nameId).length, 2, 'only the cap number is highlighted');
    assert.strictEqual(segs.map((s) => s.text).join(''), 'Aaa Aaa Aaa Aaa', 'text is preserved');
    const uncapped = splitByNames('Aaa Aaa Aaa Aaa', [{ id: 'b', original: 'x', translation: 'Aaa' }]);
    assert.strictEqual(uncapped.filter((s) => s.nameId).length, 4, 'small inputs stay fully highlighted');
  });

  test('findNameConflicts flags mismatched overlapping names', () => {
    const mismatch = [
      { id: 'a', original: 'Byuk-ho', translation: 'Bich Ho' },
      { id: 'b', original: 'Jin Byuk-ho', translation: 'Tran Bich Hao' }
    ];
    const forgiving = findNameConflicts(mismatch);
    assert.strictEqual(forgiving.length, 1, 'overlapping entries with mismatched parts are flagged');
    assert.strictEqual(forgiving[0].longerId, 'b');
    assert.strictEqual(forgiving[0].shorterId, 'a');

    const contained = [
      { id: 'a', original: 'Byuk-ho', translation: 'Bích Hào' },
      { id: 'b', original: 'Jin Byuk-ho', translation: 'Trần Bích Hào' }
    ];
    assert.strictEqual(findNameConflicts(contained, { strict: true }).length, 0, 'contained translation is consistent');

    const caseDiff = [
      { id: 'a', original: 'Byuk-ho', translation: 'Bich Ho' },
      { id: 'b', original: 'Jin Byuk-ho', translation: 'Tran bich ho' }
    ];
    assert.strictEqual(findNameConflicts(caseDiff, { strict: true }).length, 1, 'strict flags a case difference');
    assert.strictEqual(findNameConflicts(caseDiff, { strict: false }).length, 0, 'forgiving ignores case');

    assert.strictEqual(findNameConflicts([
      { id: 'x', original: 'Alpha', translation: 'One' },
      { id: 'y', original: 'Beta', translation: 'Two' }
    ]).length, 0, 'non-overlapping names never conflict');

    assert.strictEqual(findNameConflicts([
      { id: 'm', original: 'Cheonji (Heaven Earth) Heart Method', translation: 'Thiên Địa Tâm Pháp' },
      { id: 'e', original: 'Earth', translation: 'Địa Cầu' }
    ]).length, 0, 'a middle (non-suffix) part is not flagged');

    const prefix = findNameConflicts([
      { id: 's', original: 'Seokyung', translation: 'Seokyung' },
      { id: 'sc', original: 'Seokyung city', translation: 'Tây Kinh thành' }
    ]);
    assert.strictEqual(prefix.length, 0, 'a prefix-only part is not flagged');
  });

  test('computeVirtualWindow slices the visible range with overscan', () => {
    assert.deepStrictEqual(computeVirtualWindow(0, 0, 640, 64, 6), { start: 0, end: 0 });
    const top = computeVirtualWindow(1000, 0, 640, 64, 6);
    assert.strictEqual(top.start, 0);
    assert(top.end > 0 && top.end < 60, 'first window is ~a screen plus overscan, not the whole list');
    const mid = computeVirtualWindow(1000, 6400, 640, 64, 6);
    assert.strictEqual(mid.start, 94, 'window follows the scroll position (100 - overscan)');
    assert(mid.end <= 1000);
    assert(mid.end > mid.start);
    const bottom = computeVirtualWindow(100, 999999, 640, 64, 6);
    assert.strictEqual(bottom.end, 100, 'end clamps to the list length');
    assert(bottom.start <= 100 && bottom.end > bottom.start, 'start stays inside the list');
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

  test('the sepia theme uses the soft parchment #EAE4D3 instead of the yellow sepia', () => {
    const choice = popover.match(/<[^>]*data-theme-choice="sepia"[^>]*>[\s\S]*?<\/button>/);
    assert(choice && /bg-\[#eae4d3\]/.test(choice[0]), 'the reader theme picker shows the new color');
    const settings = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'components', 'react', 'settings', 'SettingsReaderTab.jsx'), 'utf8');
    assert(/\['sepia',[^\]]*bg-\[#eae4d3\]/.test(settings), 'the Settings theme picker shows it too');
    const css = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'views', 'reader.html'), 'utf8');
    assert(/body\[data-theme="sepia"\] \{\s*background-color: #eae4d3 !important;/.test(css), 'the reader page background');
    for (const old of ['#fbf0d9', '#ede0cb', '#d8c4ab', '#dfceb5', '#e5d5be', '#f7ebce', '#f3e6cf', '#c9ad8a', 'rgba(251, 240, 217']) {
      assert(!css.includes(old) && !settings.includes(old), `no old yellow sepia tone ${old} left`);
    }
  });

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

  test('the reader settings popover fits a phone screen and keeps its switches full width', () => {
    const cls = (popover.match(/id="reader-typography-popover" class="([^"]*)"/) || [])[1] || '';
    assert(/(^| )fixed( |$)/.test(cls) && /(^| )left-2( |$)/.test(cls) && /(^| )right-2( |$)/.test(cls), `phones: pinned to the screen with margins (${cls})`);
    assert(/sm:absolute/.test(cls) && /sm:w-96/.test(cls), 'larger screens: anchored under its button as before');
    const section = popover.indexOf('id="reader-behaviour-switches"');
    assert(section > popover.indexOf('grid grid-cols-2 gap-3'), 'a full-width section after the two-column grid');
    for (const id of ['in-reader-swipe-chapters', 'in-reader-keep-screen-on']) {
      assert(popover.indexOf(`id="${id}"`) > section, `${id} sits in that section`);
    }
  });

  test('the reader settings offer swipe between chapters and keeping the screen on, both on by default', () => {
    for (const id of ['in-reader-swipe-chapters', 'in-reader-keep-screen-on']) {
      const input = popover.match(new RegExp(`<input[^>]*id="${id}"[^>]*>`));
      assert(input, `missing #${id}`);
      assert(/type="checkbox"/.test(input[0]) && /checked=""/.test(input[0]), `${id} is an on-by-default checkbox`);
    }
    assert(popover.includes('Swipe between chapters') && popover.includes('Keep screen on'), 'labelled');
  });

  const { adjacentChapter } = await loadComponent('components/react/reader/readerLocation.js');
  test('adjacentChapter follows the catalog order, then plain numbers when the chapter is not listed', () => {
    const novel = { totalChapters: 10, chapterList: [{ chapterNumber: 5 }, { chapterNumber: 1 }, { chapterNumber: 2.5 }, { chapterNumber: 2 }] };
    assert.strictEqual(adjacentChapter(novel, 2, 'next'), 2.5);
    assert.strictEqual(adjacentChapter(novel, 2.5, 'next'), 5);
    assert.strictEqual(adjacentChapter(novel, 2.5, 'prev'), 2);
    assert.strictEqual(adjacentChapter(novel, 1, 'prev'), null, 'nothing before the first chapter');
    assert.strictEqual(adjacentChapter(novel, 5, 'next'), null, 'nothing after the last listed chapter');
    assert.strictEqual(adjacentChapter(novel, 7, 'next'), 8, 'unlisted: the next number, up to the total');
    assert.strictEqual(adjacentChapter(novel, 7, 'prev'), 6);
    assert.strictEqual(adjacentChapter({ totalChapters: 7, chapterList: [] }, 7, 'next'), null);
    assert.strictEqual(adjacentChapter({ chapterList: [] }, 1, 'prev'), null);
    assert.strictEqual(adjacentChapter(null, 3, 'next'), null);
  });

  const gestures = await loadComponent('components/react/reader/readerGestures.js');
  test('a quick horizontal swipe changes chapter; scrolling, short or slow moves do not', () => {
    const { swipeDirection } = gestures;
    const at = (x, y, t) => ({ x, y, t });
    assert.strictEqual(swipeDirection(at(300, 400, 0), at(120, 420, 250)), 'next', 'right to left: next chapter');
    assert.strictEqual(swipeDirection(at(100, 400, 0), at(290, 380, 250)), 'prev', 'left to right: previous chapter');
    assert.strictEqual(swipeDirection(at(300, 400, 0), at(260, 400, 200)), null, 'too short');
    assert.strictEqual(swipeDirection(at(300, 400, 0), at(150, 300, 250)), null, 'too steep: that is scrolling');
    assert.strictEqual(swipeDirection(at(300, 400, 0), at(100, 400, 1500)), null, 'too slow: a drag, not a swipe');
  });

  test('swipes are ignored while text is selected, with two fingers, or inside a panel', () => {
    const listeners = {};
    const target = { addEventListener: (type, fn) => { listeners[type] = fn; }, removeEventListener: (type) => { delete listeners[type]; } };
    const swiped = [];
    let selected = '';
    let blocked = false;
    const stop = gestures.installSwipe(target, {
      onSwipe: (dir) => swiped.push(dir),
      selectionText: () => selected,
      isBlocked: () => blocked,
      now: (() => { let t = 0; return () => (t += 100); })()
    });
    const touch = (x, y) => ({ clientX: x, clientY: y });
    const swipe = (fingers = 1) => {
      listeners.touchstart({ touches: Array.from({ length: fingers }, () => touch(300, 400)), target: {} });
      listeners.touchend({ changedTouches: [touch(100, 405)], touches: [], target: {} });
    };
    swipe();
    selected = 'Lâm Động';
    swipe();
    selected = '';
    swipe(2);
    blocked = true;
    swipe();
    blocked = false;
    swipe();
    assert.deepStrictEqual(swiped, ['next', 'next'], 'only the plain swipes count');
    stop();
    assert.strictEqual(Object.keys(listeners).length, 0, 'stops listening');
  });

  const { releaseScreenOn } = await loadComponent('components/react/shared/screenOn.js');
  await testAsync('pages other than the reader let the screen turn off again', async () => {
    const calls = [];
    await releaseScreenOn({ Platform: { screen: { keepAwake: async (on) => { calls.push(on); return true; } } } });
    await releaseScreenOn({});
    assert.deepStrictEqual(calls, [false]);
    for (const entry of ['library/library-entry.jsx', 'novel/novel-entry.jsx', 'settings/settings-entry.jsx']) {
      const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'components', 'react', ...entry.split('/')), 'utf8');
      assert(/releaseScreenOn\(/.test(src), `${entry} releases the screen`);
    }
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
        fontSize: 24, fontFamily: 'mono', lineHeight: 'spacious', columnWidth: 'full', theme: 'oled', highlightNames: true,
        swipeChapters: true, keepScreenOn: true
      });
      data.quickconverter_reader_highlight_names = 'false';
      assert.strictEqual(prefsMod.readPrefs().highlightNames, false, 'name highlighting can be turned off');
      data.quickconverter_reader_swipe_chapters = 'false';
      data.quickconverter_reader_keep_screen_on = 'false';
      assert.strictEqual(prefsMod.readPrefs().swipeChapters, false, 'swiping can be turned off');
      assert.strictEqual(prefsMod.readPrefs().keepScreenOn, false, 'keeping the screen on can be turned off');
    } finally {
      global.localStorage = prev;
    }
  });

  test('writePrefs stores the highlight names setting', () => {
    const prev = global.localStorage;
    const stored = {};
    global.localStorage = { getItem: (k) => (k in stored ? stored[k] : null), setItem: (k, v) => { stored[k] = String(v); } };
    try {
      prefsMod.writePrefs({ fontSize: 18, fontFamily: 'sans', lineHeight: 'relaxed', columnWidth: 'standard', theme: 'slate', highlightNames: false });
      assert.strictEqual(stored.quickconverter_reader_highlight_names, 'false');
      assert.strictEqual(prefsMod.readPrefs().highlightNames, false);
      prefsMod.writePrefs({ ...prefsMod.readPrefs(), highlightNames: true });
      assert.strictEqual(prefsMod.readPrefs().highlightNames, true);
    } finally {
      global.localStorage = prev;
    }
  });

  test('ReaderPrefsPopover has a Highlight names switch, on by default', () => {
    const input = popover.match(/<input[^>]*id="in-reader-highlight-names"[^>]*>/);
    assert(input, 'switch is in the reader settings popover');
    assert(/type="checkbox"/.test(input[0]) && /checked=""/.test(input[0]), 'on unless turned off');
    assert(/Highlight names/.test(popover), 'labelled');
    const prev = global.localStorage;
    global.localStorage = { getItem: (k) => (k === 'quickconverter_reader_highlight_names' ? 'false' : null) };
    try {
      const off = render(h(ReaderPrefsPopover)).match(/<input[^>]*id="in-reader-highlight-names"[^>]*>/);
      assert(off && !/checked=""/.test(off[0]), 'reflects the stored setting');
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
