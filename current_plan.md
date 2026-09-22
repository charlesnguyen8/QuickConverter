# current_plan.md

## Plan: Rewrite the remaining views into React

**Goal:** every view is native React — no `dangerouslySetInnerHTML` bridges, no classic
`views/<view>.js` logic scripts. Pure HTML shells + a React entry per view.

**Rule of engagement:** one milestone at a time to completion (`npm run build:css` if classes
changed → `npm run build:ext` → `npm test` green → commit → owner loads `dist/` for parity).
No piecemeal approval requests. Commit per milestone so each is independently revertible.

**Status (as of M1–M3):** Popup is fully React (`views/popup.js` + `popupMarkup.mjs` deleted); the
Settings DeepSeek tab is JSX and its controller lives in `components/settings-deepseek.js`. Next is
**M4** (Settings shell/tabs → React, delete `views/settings.js`), then M5 Reader, M6 Novel, M7
cleanup; M8 (ESM/MV3) deferred.

**Related docs:** `context.md`, `AGENTS.md`.

---

## 1. Decisions locked

1. **Load from `dist/`** — `npm run build:ext`, then load unpacked from `dist/`. Repo root is not
   loadable (React pages need the bundle).
2. **Static layers stay classic for now** — `services/`, `providers/`, and shared `components/*.js`
   (`AiConfigPanel`, `UIUtils`, `AddBookButton`, `DownloadQueueService`) remain global scripts and
   are bridged through the ESM facade (`services/index.mjs`, `components/index.mjs`). Converting
   them to ESM is Phase 8 (optional, later).
3. **Per-view entry** — `components/react/<view>-entry.jsx` mounts `<View>` into `#<view>-root`
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
| Novel | hero, chapters, name-list drawer, dock | `views/novel.js` ~400 lines: panel init, sync/download-all, `enqueueChapterDownload`, `refreshChapterList`, `novel-chapter-download` listener, balance/queue hook |
| Reader | reading core, nav, source drawer | `views/reader.js` ~690 lines: header, typography popover, translation panel init, prefs application, not-saved/download flow |
| Settings | Storage tab, Reader tab, DeepSeek tab (`SettingsDeepSeekTab.jsx`) | `views/settings.js` ~177 lines: nav, tab switching, balance display, toasts, About; DeepSeek controller now in `components/settings-deepseek.js` |
| Popup | **fully React** (`PopupApp` + `PopupMainView` + `PopupNovelView` + `PopupDeepseekCard`) | `views/popup.js` and `popupMarkup.mjs` deleted; `popup.html` is a shell + entry |

Cross-view seams still in place:
- Popup: React exposes `window.__popupActions`, main/detail are props-driven.
- Settings: React entry calls `window.wireSettingsDeepseek()` (from `components/settings-deepseek.js`).
- Other views render `SettingsStorageTab` / `SettingsReaderTab` / Novel/Reader components; those view
  scripts (`novel.js`, `reader.js`) still own part of their logic (M5/M6).

Tests: 12 suites green. Tests that grep HTML for moved IDs read the React/JSX module instead —
update them whenever an ID moves (`bridge.test.js`, `settings.test.js`).

### Progress log

| Milestone | Commits |
|---|---|
| M1 Popup detail → React | `e8e868c` (+ `ebe3b53` queue re-render, `deeb0f7` downloaded refresh, `f1b683b` null-novel guard) |
| M2 Popup DeepSeek card → React, delete `popup.js` | `e083ef9`, `6d012f7` |
| M3 Settings DeepSeek tab JSX + controller move | `48c0bdc`, `af464f5` (emoji/save), `710ab4b` (wiring), `ee6a31d` |

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

### M5 — Reader: finish the remaining pieces  ← **next** (5a)
`views/reader.js` is ~701 lines with coupled subsystems; split into four slices. Each slice: convert
markup with the same IDs, keep `reader.js` wiring (React renders once, so DOM refs stay valid —
the bridge pattern used for the popup DeepSeek card), build + 13 suites + a `dist/` check.

- **5a — Header markup (next)**: `components/react/ReaderHeader.jsx` + `reader-header-entry.jsx`
  (flushSync mount).
  - Convert `views/reader.html` **lines 469–794**: progress bar, back link, novel/chapter titles,
    source-drawer toggle, A−/A+ font stepper, and the full typography popover.
  - Watch: `class`→`className`, `style="width: 0%;"`→`style={{ width: '0%' }}`, theme-preset
    `data-*` attributes stay as-is.
  - `reader.html`: replace 468–794 with `<div id="reader-header-root"></div>`; add the entry script.
  - `views/reader.js` unchanged.
- **5b — Typography popover logic → React**: `ReaderPrefsPopover.jsx` owns the popover state and
  `applyReaderPreferences`; move `initInReaderTypography` out of `reader.js`; keep the storage keys
  and the `reader-prefs-updated` event contract.
- **5c — Translation panel + source drawer**: render the `AiConfigPanel` container from React (same
  IDs) and move `initDeepSeekUI` wiring; hook the source drawer to React state.
- **5d — Chapter load / not-saved / download flow + toast + hotkeys**: port the remaining
  `reader.js` logic (load chapter, download, save toast, keyboard shortcuts).
- Finish: delete `views/reader.js`; `reader.html` becomes a shell + entry.

### M6 — Novel: finish the remaining pieces
- Move panel init, sync/download-all, `enqueueChapterDownload`, `refreshChapterList`,
  `novel-chapter-download` listener and the balance/queue hook into React.
- Delete `views/novel.js`; `novel.html` becomes a shell + entry.

### M7 — Cleanup
- Remove facade entries/globals no longer used; update `context.md` + `AGENTS.md`; rebuild
  `tailwind.css`; confirm no logic remains in `views/*.js` (shells only).

### M8 — (deferred) ESM + MV3 bundling
- Convert `services/` + `providers/` to ESM, module service worker, IIFE content bundle, drop the
  facade. Not required for the React rewrite.

---

## 4. Backlog (separate)

1. **OAuth under `dist/`** — dist extension ID differs from the registered client; register a second
   "Chrome Extension" OAuth client (or re-register) so cloud sync works in `dist/`.
2. **Scraper** — `wetriedtls` serves a Cloudflare interstitial; content script logs "Could not find
   chapter content in DOM after waiting". Needs real chapter DOM to update `providers/wetriedtls.js`
   selectors / add challenge handling.

---

## 5. Verification per milestone

- `node --check` on changed classic JS; `npm run build:ext`; `npm test` (12 suites).
- Reference-asset check: every local `src`/`href` in `dist/views/*.html` resolves.
- `npm run build:css` if new utility classes appear (commit `styles/tailwind.css`).
- Owner: load `dist/`, exercise the converted view, confirm parity.

## 6. Rollback

Each milestone is one commit; revert it to restore the previous state. A classic view script is only
deleted after the owner confirms parity, so any milestone can be backed out.
