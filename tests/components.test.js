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

  test('ReaderPhrasePopover lets you save an empty meaning to hide a character', () => {
    const html = render(h(ReaderPhrasePopover, { phrase: { source: '的', reading: 'đích', translation: '', origin: 'soft' } }));
    assert(!/id="reader-phrase-use-btn"[^>]*\sdisabled=""/.test(html), 'Use works with an empty meaning');
    assert(!/id="reader-phrase-name-btn"[^>]*\sdisabled=""/.test(html), 'Save as name works with an empty meaning');
    assert(/id="reader-phrase-use-btn"[^>]*\sdisabled=""/.test(render(h(ReaderPhrasePopover, { phrase: { source: '的', reading: 'đích', translation: '', origin: 'soft' }, saving: true }))), 'still disabled while saving');
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
    assert(phrasePopover.includes('id="reader-phrase-use-btn"'), 'custom meaning can be applied');
    assert(phrasePopover.includes('id="reader-phrase-name-btn"'), 'phrase can be saved as a name');
    assert(phrasePopover.includes('Soft Glossary'), 'says which list a picked meaning is saved to');
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

  // --- Open-page-only sites (no background download) ---
  const ManualChapterAction = (await loadComponent('components/react/shared/ManualChapterAction.jsx')).default;
  const manualChapter = { chapterNumber: 3, title: 'Ch 3', url: 'https://www.nkwwlkj.cn/chapter/book_chapter_detail/100043460' };
  const lockedChapter = { chapterNumber: 5, title: 'Ch 5', url: 'https://www.nkwwlkj.cn/chapter/book_chapter_detail/100659849', locked: true };
  test('ManualChapterAction links unlocked chapters to the page and badges locked ones', () => {
    const open = render(h(ManualChapterAction, { chapter: manualChapter }));
    assert(open.includes('Open to save'), 'unlocked chapter offers Open to save');
    assert(open.includes(`href="${manualChapter.url}"`), 'link opens the chapter page');
    assert(open.includes('target="_blank"'), 'link opens in a new tab');
    const locked = render(h(ManualChapterAction, { chapter: lockedChapter }));
    assert(locked.includes('Locked'), 'locked chapter shows a Locked badge');
    assert(!locked.includes('<a'), 'locked chapter has no link');
  });

  const { ChapterRow: NovelChapterRow } = await loadComponent('components/react/novel/NovelChapters.jsx');
  const { ChapterRow: PopupChapterRow } = await loadComponent('components/react/popup/PopupNovelView.jsx');
  const rowNovel = { id: 'n1', title: 'N' };
  test('chapter rows swap Download for the open-page action on open-page-only sites', () => {
    const rows = [
      ['novel', (props) => render(h(NovelChapterRow, { novel: rowNovel, chNum: props.chapter.chapterNumber, onDelete() {}, ...props }))],
      ['reader', (props) => render(h(ReaderChapterRow, { novel: rowNovel, chNum: props.chapter.chapterNumber, ...props }))],
      ['popup', (props) => render(h(PopupChapterRow, { novel: rowNovel, onOpen() {}, onDelete() {}, onDownload() {}, ...props }))]
    ];
    for (const [name, renderRow] of rows) {
      const normal = renderRow({ chapter: manualChapter });
      assert(normal.includes('title="Download Chapter 3"'), `${name} row keeps Download by default`);
      const manual = renderRow({ chapter: manualChapter, manualOnly: true });
      assert(!manual.includes('title="Download Chapter 3"'), `${name} row hides Download on open-page-only sites`);
      assert(manual.includes('Open to save'), `${name} row offers Open to save`);
      const locked = renderRow({ chapter: lockedChapter, manualOnly: true });
      assert(locked.includes('Locked') && !locked.includes('title="Download Chapter 5"'), `${name} row badges locked chapters`);
      const lockedAnySite = renderRow({ chapter: lockedChapter });
      assert(!lockedAnySite.includes('title="Download Chapter 5"'), `${name} row never offers Download for a locked chapter`);
    }
  });

  test('ReaderNotSaved points to the chapter page instead of downloading on open-page-only sites', () => {
    const manual = render(h(ReaderNotSaved, { onDownload: () => {}, manualChapter }));
    assert(!manual.includes('id="reader-download-btn"'), 'no background download button');
    assert(manual.includes('id="reader-open-source-link"') && manual.includes(`href="${manualChapter.url}"`), 'links to the chapter page');
    const locked = render(h(ReaderNotSaved, { onDownload: () => {}, manualChapter: lockedChapter }));
    assert(!locked.includes('id="reader-download-btn"'), 'no download button for a locked chapter');
    assert(locked.includes('Locked'), 'explains the chapter is locked');
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
