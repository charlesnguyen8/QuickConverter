# AGENTS.md

QuickConverter is an offline-first web novel reader, downloader, and AI translator
(Chrome MV3 extension; planned Android/Desktop ports via Capacitor/Electron/Tauri).

**Read `context.md` first** — it is the living architecture doc and the source of truth
for directory layout, porting rules, and feature checklists.

## Commands

- `npm test` — run the full Node test suite (13 suites) (`tests/run_all.js`). Must pass before finishing a task.
- `npm run build:css` — rebuild `styles/tailwind.css` from `styles/input.css` + scanned content.
- `npm run watch:css` — watch mode while developing UI.

**Loading the extension:** run `npm run build:ext`, then load unpacked from `dist/` in
`chrome://extensions`. React pages (e.g. `novel.html`'s queue dock) only exist in the Vite
build, so the repo root is no longer a loadable target. `npm run dev` is for UI iteration.

**CSS gotcha:** Tailwind is compiled and committed. After editing any markup/JS that
introduces new utility classes, run `npm run build:css` (or the `watch` script). Missing
classes silently break layout (e.g. a missing `justify-end` makes the drawer anchor left)
because the committed `styles/tailwind.css` is stale.

**Testing:** `npm test` runs 13 suites via `tests/run_all.js`. Twelve are zero-dependency Node
suites (unit + static/contract, no DOM); the thirteenth, `tests/components.test.js`, renders the
migrated React components with `react-dom/server` (`renderToString`) and asserts their markup.
JSX is compiled for Node by `tests/helpers/render.js` using the `esbuild` devDependency
(bundled to gitignored `tests/.tmp/`). Effects/`useEffect` do not run under `renderToString`, so
the component suite covers prop → markup only; wiring/timing still needs a manual `dist/` check.
When adding a component test: `const { default: View } = await loadComponent('components/react/X.jsx')`,
then `render(h(View, props))` and assert on the returned string (React separates adjacent text
nodes, so the helper's `render` strips `<!-- -->`).

## Architecture rules (see `context.md` for full detail)

1. **Platform API isolation** — never call `chrome.*` directly in `views/` or `components/`;
   go through `services/` (e.g. `StorageService`) and guard with `typeof chrome !== 'undefined'`.
2. **Web standards only** — `window.indexedDB`, `fetch`/`EventSource`/`ReadableStream`,
   `TextDecoder`/`TextEncoder`/`crypto.subtle`. No Node-only deps in frontend code.
3. **Mobile-first** — must render at 360px; touch targets >= 40x40px; never hide critical
   actions behind `:hover` only.
4. **Portable assets** — relative paths only, never hardcoded `chrome-extension://` URLs.
5. **Offline-first** — reading must work with zero connectivity once downloaded.

## Code style

- Vanilla HTML/CSS/JS (ES6+). Follow existing patterns in neighboring files.
- **Do not add comments unless asked.**
- Reuse shared view modules in `components/` (`AiConfigPanel`, `UIUtils`, `QueueDock`, `AddBookButton`)
  instead of duplicating provider/DeepSeek UI across views; load them via `<script>` before the view script.
  Register new global-script modules the same way (IIFE + `window.*` export).
- Keep `DownloadQueueService` runnable both in-thread and via background worker delegation.
