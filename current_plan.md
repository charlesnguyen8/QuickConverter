# current_plan.md

## Plan: Rewrite the remaining views into React

**Goal:** every view is native React — no `dangerouslySetInnerHTML` bridges, no classic
`views/<view>.js` logic scripts. Pure HTML shells + a React entry per view.

**Rule of engagement:** one milestone at a time to completion (`npm run build:css` if classes
changed → `npm run build:ext` → `npm test` green → commit → owner loads `dist/` for parity).
No piecemeal approval requests. Commit per milestone so each is independently revertible.

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
| Settings | Storage tab, Reader tab | DeepSeek tab is **bridged** (`deepseekTabMarkup.mjs` + `SettingsDeepSeekTab.jsx`); `settings.js` still runs `initDeepSeekSettings`, tab shell, About |
| Popup | main view (`PopupMainView.jsx` + `PopupApp.jsx`) | detail view is **bridged** (`popupDetailHtml`); `views/popup.js` owns detail, chapters, DeepSeek panel, queue hooks |

Bridge API currently in use (Popup): React→JS `window.__popupActions`, JS→React
`window.__popupSetNovels/__popupSetStatus/__popupShowMain/__popupShowNovel`.

Tests: 12 suites green. Tests that grep HTML for moved IDs read the React/markup module instead —
update them whenever an ID moves.

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

### M3 — Settings: DeepSeek tab → React (real JSX)  ← **next**
- Replace the `deepseekTabMarkup.mjs` bridge with JSX + hooks wired to `AiConfigPanel`; delete
  `SettingsDeepSeekTab` bridge entry and `initDeepSeekSettings` from `settings.js`.

### M4 — Settings: shell + remaining tabs → React
- `SettingsView.jsx` owns the tab shell, tab navigation, About tab, and save-indicator; delete
  `views/settings.js` and `deepseekTabMarkup.mjs`; `settings.html` becomes a shell + entry.

### M5 — Reader: finish the remaining pieces
- Header + typography popover (`ReaderHeader.jsx` / `ReaderPrefsPopover.jsx`, owns prefs state),
  translation panel container via `AiConfigPanel`, prefs application + `reader-prefs-updated`
  handling, not-saved/download flow.
- Delete `views/reader.js`; `reader.html` becomes a shell + entry.

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
