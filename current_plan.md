# current_plan.md

## Plan: Rewrite the remaining views into React

**Goal:** every view is native React — no `dangerouslySetInnerHTML` bridges, no classic
`views/<view>.js` logic scripts. Pure HTML shells + a React entry per view.

**Rule of engagement:** one milestone at a time to completion (`npm run build:css` if classes
changed → `npm run build:ext` → `npm test` green → commit → owner loads `dist/` for parity).
No piecemeal approval requests. Commit per milestone so each is independently revertible.

**Status (as of M1–M7):** Popup, Settings, Reader and Novel are fully React; no `views/*.js` logic
scripts remain and the dead ESM facade is gone. **M8** (next) converts the shared AI/DeepSeek panel
and settings controller to React — the last classic logic modules.

**Related docs:** `context.md`, `AGENTS.md`.

---

## 1. Decisions locked

1. **Load from `dist/`** — `npm run build:ext`, then load unpacked from `dist/`. Repo root is not
   loadable (React pages need the bundle).
2. **Static layers** — `services/` and `providers/` remain global scripts loaded via `<script>`
   before the view entry (converting them to ESM is dropped — not needed for the rewrite). The
   shared UI controllers `components/ai-config-panel.js` and `components/settings-deepseek.js` are
   converted to React in **M8**; the `<add-book-button>` custom element stays classic (optional
   follow-up).
3. **Per-view entry** — `components/react/<view>/<view>-entry.jsx` mounts `<View>` into `#<view>-root`
   with `flushSync` (so sibling classic scripts that run at `DOMContentLoaded` still find DOM).
4. **No `chrome.*` in `views/` or React components** — go through `services/` (platform/storage).
5. **Reuse shared modules** — DeepSeek/AI config must stay the shared `AiConfigPanel`; do not
   duplicate provider UI.
6. **Mobile-first + Tailwind** — rebuilt `styles/tailwind.css` is committed; rerun
   `npm run build:css` whenever new utility classes appear.

---

## 2. Current state

| View | React-owned | Still classic |
|---|---|---|
| Library | full (`LibraryView.jsx`) | — |
| Novel | **fully React** (`NovelApp` + hero, chapters list, DeepSeek card, name-list drawer, dock) | `views/novel.js` deleted; `novel.html` is a shell + `novel-entry.jsx` |
| Reader | **fully React** (`ReaderApp` + header, chapter, nav, source drawer, popover, DeepSeek card, toast) | `views/reader.js` deleted; `reader.html` is a shell + `reader-entry.jsx` |
| Settings | Storage tab, Reader tab, DeepSeek tab (`SettingsDeepSeekTab.jsx`) | `views/settings.js` ~177 lines: nav, tab switching, balance display, toasts, About; DeepSeek controller now in `components/settings-deepseek.js` |
| Popup | **fully React** (`PopupApp` + `PopupMainView` + `PopupNovelView` + `PopupDeepseekCard`) | `views/popup.js` and `popupMarkup.mjs` deleted; `popup.html` is a shell + entry |

Cross-view seams still in place:
- Popup: React exposes `window.__popupActions`, main/detail are props-driven.
- Settings: React entry calls `window.wireSettingsDeepseek()` (from `components/settings-deepseek.js`).
- Novel: `NovelDeepseekCard` registers `AiConfigPanel` and answers `novel-refresh-balance`;
  `NovelChapters` publishes `novel-stats-updated` (`{downloaded, total, unqueuedMissing, hasCatalog}`)
  so `NovelApp` renders the badge/Download-All state instead of mutating DOM; chapter rows dispatch
  `novel-chapter-download`, which `NovelApp` handles.

Tests: 13 suites green. Tests that grep HTML for moved IDs read the React/JSX module instead —
update them whenever an ID moves (`bridge.test.js`, `settings.test.js`).

### Progress log

| Milestone | Commits |
|---|---|
| M1 Popup detail → React | `e8e868c` (+ `ebe3b53` queue re-render, `deeb0f7` downloaded refresh, `f1b683b` null-novel guard) |
| M2 Popup DeepSeek card → React, delete `popup.js` | `e083ef9`, `6d012f7` |
| M3 Settings DeepSeek tab JSX + controller move | `48c0bdc`, `af464f5` (emoji/save), `710ab4b` (wiring), `ee6a31d` |
| M4 Settings shell → React, delete `settings.js` | `c3cedee`, `e755efc` |
| M5a Reader header → React | `6bf390a` |
| M5b Reader typography popover → React | `ReaderPrefsPopover.jsx` |
| M5c Reader DeepSeek card → React | `ReaderDeepseekCard.jsx` |
| M5d Reader app controller → React, delete `reader.js` | `ReaderApp.jsx` |
| M6 Novel app controller → React, delete `novel.js` | `dc2bd85` |
| M7 Cleanup | removed facade + `ui-utils.js`, docs (this milestone) |

---

## 3. Milestones

### M1 — Popup: detail view → React — **done**
- `components/react/PopupNovelView.jsx`: thumbnail/title/domain/stats, chapter count, chapter rows
  (status badge, active/queued/download/retry/delete actions), Download All.
- Port the chapter rendering + per-row actions from `popup.js` `renderPopupChapters` and the queue
  in-place progress (`updatePopupActiveProgressInPlace`, `handlePopupQueueChange`) into React.
- Delete `popupDetailHtml` and the now-dead main-view markup from `popupMarkup.mjs`; delete the file
  once its only export is gone. Move popup tests off `popupMarkup.mjs`.
- `popup.js` keeps: DeepSeek panel init, `extractNovelInfo`, status detection, tab query, queue
  subscription.

### M2 — Popup: DeepSeek panel + view deletion — **done**
- Render the shared `AiConfigPanel` container from React (same element IDs, `compact` variant),
  passing `currentActiveNovel` prompt hooks as props/state.
- Port the remaining `popup.js` glue (tab query, provider status) into React hooks; delete
  `views/popup.js`; `views/popup.html` becomes a shell + React entry.
- Drop `window.__popup*` globals.

### M3 — Settings: DeepSeek tab → React (real JSX) — **done**
- Replace the `deepseekTabMarkup.mjs` bridge with JSX + hooks wired to `AiConfigPanel`; delete
  `SettingsDeepSeekTab` bridge entry and `initDeepSeekSettings` from `settings.js`.

### M4 — Settings: shell + remaining tabs → React — **done**
`SettingsView.jsx` owns the header/back link, sidebar tab state, the four tab sections, About and
the toast/save-pill; the tab components render as direct children. `views/settings.js` is deleted,
`settings.html` is a shell with `#settings-root` + `settings-entry.jsx`, and the per-tab entries
(storage/reader/deepseek/shell) are gone. Balance/toast helpers live in `components/settings-deepseek.js`.

### M5 — Reader: finish the remaining pieces — **done**
`views/reader.js` (~310 lines) was split into four slices. Each slice: convert
markup with the same IDs, keep `reader.js` wiring (React renders once, so DOM refs stay valid —
the bridge pattern used for the popup DeepSeek card), build + 13 suites + a `dist/` check.

- **5a — Header markup — done**: `components/react/ReaderHeader.jsx` + `reader-header-entry.jsx`
  (flushSync); `views/reader.html` lines 469–794 replaced with `#reader-header-root`; `reader.js`
  unchanged (bridge pattern). Tests read `ReaderHeader.jsx` for the moved ids/options.
- **5b — Typography popover logic → React — done**: `components/react/ReaderPrefsPopover.jsx`
  owns prefs state (`readPrefs`/`writePrefs`/`applyReaderPreferences`) and the popover open state.
  `ReaderHeader` stays stateless (renders `<ReaderPrefsPopover />`, keeping the font stepper + popover
  siblings) so React never re-renders over `reader.js`'s DOM mutations. `reader.js` lost the
  typography block and now seams the T/Esc hotkeys through `reader-toggle-typography` /
  `reader-close-typography` window events. The shared storage keys and `reader-prefs-updated`
  contract are unchanged; `applyReaderPreferences` sets column width + `body[data-theme]` and emits
  the event (chapter body/title colors stay in `ReaderChapter`).
- **5c — Translation panel + source drawer — done**: `components/react/ReaderDeepseekCard.jsx`
  (`reader-deepseek-entry.jsx` → `#reader-deepseek-root`) renders the DeepSeek card with the same IDs
  and owns `AiConfigPanel.create({ variant:'full', capabilities:{cooldown:false},
  options:{readerPromptStyle:true} })` plus the novel prompt hooks (`getPrompt`/`savePrompt`). The
  source drawer was already React (`ReaderSourceDrawer` owns open state via
  `reader-open-source`/`reader-close-source`); `reader.js` dropped `initReaderDeepSeekUI`, the dead
  drawer button listeners, and now seams balance refresh (`reader-refresh-balance`) and the
  prompt-saved toast (`reader-show-toast`). The not-saved shell + download button stay static (5d).
- **5d — Chapter load / not-saved / download flow + toast + hotkeys — done**: `components/react/
  ReaderApp.jsx` is the single reader entry (`reader-entry.jsx` → `#reader-root`). It loads the
  novel/chapter, derives loading/invalid/error/content/not-saved, loads the chapter, runs the
  download flow (mirrors the old `reader.js` options/key/provider handling, with `downloading/
  failed/translating/model` state), owns the hotkeys and `document.title`, and renders `ReaderHeader`,
  `ReaderChapter`, `ReaderNav`, `ReaderNotSaved` (heading + `ReaderDeepseekCard` + download button),
  `ReaderSourceDrawer` and `ReaderToast`. `ReaderHeader` is now props-driven (titles/back/settings/
  `hasSource`) and drives the progress bar/percent by writing the DOM via refs (no per-scroll
  re-render); `ReaderToast` owns the `reader-show-toast` contract. Deleted `views/reader.js` and the
  per-section `reader-*-entry.jsx` files;
  `reader.html` is a shell (`#reader-root`) + `reader-entry.jsx`.

### M6 — Novel: finish the remaining pieces — **done**
`components/react/NovelApp.jsx` is the single novel entry (`novel-entry.jsx` → `#novel-root`). It
owns the header (contextual Settings link), the chapters section (badge, Download All, Sync Catalog),
the `novel-chapter-download` listener, `enqueueChapterDownload`, `refreshChapterList`, and the
queue/balance hook (dispatches `novel-refresh-balance`). `components/react/NovelDeepseekCard.jsx`
renders the DeepSeek card (same IDs, incl. the cooldown section) and registers `AiConfigPanel` with
the novel prompt hooks. `NovelChapters` now publishes `unqueuedMissing`/`hasCatalog` in
`novel-stats-updated` instead of mutating `#chapters-badge`/`#download-all-btn` directly. Deleted
`views/novel.js` and the per-section `novel-hero-entry`/`novel-chapters-entry`/`name-list-entry`
files; `novel.html` is a shell (`#novel-root`) + `novel-entry.jsx`.

### M7 — Cleanup — **done**
Removed the unused ESM facade (`services/index.mjs`, `components/index.mjs`) and the unused
`components/ui-utils.js` (`window.UIUtils`; its `<script>` tags dropped from novel/popup/reader),
plus the dead `window.QueueDockReact` and `window.AddBookButton` globals. Confirmed `views/` holds
only HTML shells (no `*.js`). Updated `context.md` + `AGENTS.md` and rebuilt `styles/tailwind.css`.

### M8 — Shared AI panel + Settings controller → React
The last classic logic modules. Replace the four duplicated DeepSeek card markups and the
imperative `components/ai-config-panel.js` (`createAiConfigPanel({ids, capabilities, hooks})`) /
`components/settings-deepseek.js` controllers with one React panel. **Behavior-preserving** —
characterization tests first (owner rules), then keep them green.

- **New `components/react/shared/AiConfigPanel.jsx`** — the single markup + state source for
  provider (official/custom), API key, model, prompt, cooldown and balance. Props: `variant`
  (`full`/`compact`), `capabilities`, copy overrides, and `hooks` (`getPrompt`/`savePrompt`/
  `onPromptSaved`). Expose an imperative handle (`useImperativeHandle`):
  `getDownloadOptions()`, `getProviderConfig()`, `refreshBalance(force)`, `showSaveIndicator()`.
- **View consumers** — `shared/NovelDeepseekCard`, `shared/ReaderDeepseekCard`,
  `popup/PopupDeepseekCard` and `settings/SettingsDeepSeekTab` become thin wrappers that render
  `<AiConfigPanel>` with view-specific copy/capabilities; the duplicated card JSX is deleted.
- **Download-option resolution** — `novel/NovelApp.jsx` (`resolveDownloadOptions`),
  `reader/ReaderApp.jsx` (`handleDownload`) and `popup/PopupApp.jsx` stop reading panel DOM ids
  (`getElementById('deepseek-toggle')` etc.) and use the panel ref instead; one shared option
  builder (or the handle) replaces the per-view copies.
- **Balance / toast** — `updateBalanceDisplay` and `triggerSaveIndicator` (currently
  `window.*`) move into React state; the storage tab already owns cloud sync, so
  `settings-deepseek.js` has no other job.
- **Delete** `components/ai-config-panel.js` and `components/settings-deepseek.js`; drop their
  `<script>` tags from novel/popup/reader/settings; remove `window.AiConfigPanel`,
  `window.wireSettingsDeepseek`, `window.triggerSaveIndicator`, `window.updateBalanceDisplay`,
  `window.__settingsDeepseekWired`.
- **Tests** — repoint the ID-contract suites (`bridge.test.js`, `settings.test.js`,
  `components.test.js`) to the shared component and add behavior tests: provider switch reflects in
  `getDownloadOptions()`, cooldown toggle, prompt edit/save, key show/hide. Report every changed
  expectation as a proxy move.

Out of scope: `components/add-book.js` (`<add-book-button>`) — independent custom element; convert
later only if wanted.

### Post-M7 — components/react reorg — **done**
`components/react/` is now one folder per view (`library/`, `novel/`, `popup/`, `reader/`,
`settings/`) plus `shared/` (`QueueDock.jsx`, `queue-dock-entry.jsx`); each `*-entry.jsx` lives in
its view folder. Pure move (no behavior change): updated the 5 view `<script>` paths, the
`NovelChapters` → `../shared/QueueDock.jsx` import, and test file paths. Build hashes unchanged.

---

## 4. Backlog (separate)

1. **OAuth under `dist/`** — dist extension ID differs from the registered client; register a second
   "Chrome Extension" OAuth client (or re-register) so cloud sync works in `dist/`.
2. **Scraper** — `wetriedtls` serves a Cloudflare interstitial; content script logs "Could not find
   chapter content in DOM after waiting". Needs real chapter DOM to update `providers/wetriedtls.js`
   selectors / add challenge handling.

---

## 5. Verification per milestone

- `node --check` on changed classic JS; `npm run build:ext`; `npm test` (13 suites).
- Reference-asset check: every local `src`/`href` in `dist/views/*.html` resolves.
- `npm run build:css` if new utility classes appear (commit `styles/tailwind.css`).
- Owner: load `dist/`, exercise the converted view, confirm parity.

## 6. Rollback

Each milestone is one commit; revert it to restore the previous state. A classic view script is only
deleted after the owner confirms parity, so any milestone can be backed out.
