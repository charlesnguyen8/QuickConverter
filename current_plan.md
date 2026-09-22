# current_plan.md

## Plan: Incremental React migration (load from `dist/`)

**Status:** in progress
**Related docs:** `context.md`, `AGENTS.md`
**Rule of engagement:** execute one phase at a time to completion (build + tests + commit),
then report. No piecemeal approval requests.

---

## 1. Decisions locked

1. **Load the extension from `dist/`** — `npm run build:ext` then load unpacked from `dist/`.
   (Repo root is no longer loadable: React pages need the bundle.)
2. **Do not convert classic scripts to ESM yet.** Keep the global-script architecture and bridge
   into React via the ESM facade `services/index.mjs` + `components/index.mjs` (read `globalThis.*`).
   ESM conversion + MV3 bundling is deferred (see Phase 8).
3. **Convert one view at a time.** A "view conversion" means: React owns the view's content
   (header + main + dynamic regions), the old `views/<view>.js` is deleted once verified, static
   services/providers stay classic.
4. **Per-page React entry**: `components/react/<view>-entry.jsx` mounts `<View>` into a root div.
5. Chrome-extension constraints respected: no ESM content scripts, no `eval`.

---

## 2. Current state (already done)

| Area | State |
|---|---|
| Vite build | MPA build to `dist/`, `base:'./'`, copies `providers/services/components/scripts/styles/fonts/icons/manifest.json` **and `views/*.js`** |
| React | React 19 + `@vitejs/plugin-react`; `react()` in `vite.config.mjs` |
| ESM facade | `services/index.mjs`, `components/index.mjs` (read `globalThis`) |
| QueueDock | **Done** — `components/react/QueueDock.jsx` + `queue-dock-entry.jsx`; used by all 4 dock pages; vanilla `queue-dock.js` deleted |
| Dev harness | `dev/queue-dock.html` for isolated UI iteration |
| Tests | 12 suites, all green; Tailwind scan globs include `.jsx` + `dev/` |

---

## 3. Phases

Each phase ends with: `npm run build:ext` succeeds → `npm test` green → reference-asset check →
commit. Browser parity check is done by the owner after each phase.

### Phase 2 — Library view → React  ⟵ **next**
- `components/react/LibraryView.jsx`: full page content (header with stats/add-book/settings,
  empty state, novel grid with progress + size), reading `window.StorageService`.
- `components/react/library-entry.jsx`: mount into `#library-root`.
- `views/library.html`: minimal shell (`<head>` unchanged, body → `#library-root`, keep classic
  service scripts + `components/add-book.js` custom element + queue-dock entry).
- Delete `views/library.js` once verified.
- Keep the `novel-added` listener (React re-loads on the window event).

### Phase 3 — Novel view → React (section by section)
Largest view. Convert one section at a time into its own React root; the rest of the page stays
static, and `novel.js` shrinks each step. Delete `novel.js` when nothing is left.

- **3a — Chapters list + progress stats**: `components/react/NovelChapters.jsx` mounted into a
  `#novel-chapters-root` section; own the list, per-chapter download/retry buttons, progress bar.
  Remove the corresponding code from `novel.js`.
- **3b — Hero** (artwork/title/domain/status + Name List button/count): `components/react/NovelHero.jsx`.
- **3c — Name List drawer**: `components/react/NameListDrawer.jsx` (the ~600-line imperative
  drawer ported last).
- DeepSeek/cooldown panel stays as the existing `AiConfigPanel` module (already shared); only its
  container is rendered by React with the same element IDs.
- Delete `views/novel.js` and `views/novel.html` shell once all sections are React.

### Phase 4 — Reader view → React
- `components/react/ReaderView.jsx` + `reader-entry.jsx`; delete `reader.js` after parity.

### Phase 5 — Settings view → React
- `components/react/SettingsView.jsx` + `settings-entry.jsx`; delete `settings.js` after parity.

### Phase 6 — Popup view → React
- `components/react/PopupView.jsx` + `popup-entry.jsx`; delete `popup.js` after parity.

### Phase 7 — Cleanup
- Delete now-dead globals/facade entries; update `context.md`/`AGENTS.md`;
  rebuild `tailwind.css`; confirm no `views/*.js` remain that React replaced.

### Phase 8 — (deferred) ESM + MV3 bundling
- Only if worth it: convert `services/`+`providers/` to ESM, module service worker, IIFE content
  bundle, drop the facade. Not required for React.

---

## 4. Backlog (separate from React phases)

1. **OAuth under `dist/`** — dist extension ID differs from the registered client; need a second
   "Chrome Extension" OAuth client for the dist ID (or re-register) for cloud sync to work in dist.
2. **Scraper** — `wetriedtls` returns a Cloudflare interstitial; content script logs
   "Could not find chapter content in DOM after waiting". Needs the real chapter DOM to update
   `providers/wetriedtls.js` selectors / add challenge handling.

---

## 5. Verification per phase

- `node --check` on changed classic JS; `npm run build:ext`; `npm test` (12 suites).
- Reference-asset check: every local `src`/`href` in `dist/views/*.html` resolves.
- `npm run build:css` if new utility classes appear (commit the rebuilt `tailwind.css`).
- Owner: load `dist/`, exercise the converted view, confirm parity.

---

## 6. Rollback

Each phase is one commit; revert it to restore the previous view. The classic view script is only
deleted after the owner confirms parity, so any phase can be backed out.
