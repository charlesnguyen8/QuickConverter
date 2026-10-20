# AGENTS.md

QuickConverter is an offline-first web novel reader, downloader, and AI translator
(Chrome MV3 extension; planned Android/Desktop ports via Capacitor/Electron/Tauri).

**Read `context.md` first** — it is the living architecture doc and the source of truth
for directory layout, porting rules, and feature checklists.

## Commands

- `npm test` — run the full Node test suite (27 suites) (`tests/run_all.js`). Must pass before finishing a task.
- `npm run build:css` — rebuild `src/styles/tailwind.css` from `src/styles/input.css` + scanned content.
- `npm run watch:css` — watch mode while developing UI.
- `npm run build:ext` — build the Chrome extension into `dist/`.
- `npm run build:app` — build the app (Capacitor, for Android) into `dist-app/`.

**Loading the extension:** run `npm run build:ext`, then load unpacked from `dist/` in
`chrome://extensions`. React pages (e.g. `novel.html`'s queue dock) only exist in the Vite
build, so the repo root is no longer a loadable target. `npm run dev` is for UI iteration.

**Two builds, one app:** `src/` is shared. Extension-only files live in `extension/`
(`manifest.json`, `scripts/background.js`, `scripts/content.js`, `scripts/open-to-save-page.js`,
`rules/`) and are copied into `dist/`; `build-targets.mjs` lists what each build contains.
Services and components reach `chrome.*` only through `src/services/platform.js` (a test enforces it).

**Android app (Capacitor 8):** `npm run build:app`, then `npx cap sync android`, then build the
APK with `android\gradlew assembleDebug` with `JAVA_HOME` set to a JDK 21–24 (Gradle 8.14 cannot
run on Java 25, which Android Studio bundles; this machine uses `C:\Program Files\Java\jdk-23`).
The APK lands in `android/app/build/outputs/apk/debug/app-debug.apk`. The owner installs and tests
it on their phone; never connect to the phone (adb, remote WebView debugging) yourself.
`capacitor.config.json` turns on CapacitorHttp/CapacitorCookies (native HTTP, no CORS).
Drive sync in the app uses the app's own `GoogleAuth` plugin (`android/app/src/main/java/com/quickconverter/app/GoogleAuthPlugin.java`,
Google's AuthorizationClient), reached through `Platform.identity`. It needs an "Android" OAuth
client in the same Google Cloud project as the extension (package `com.quickconverter.app` + the
SHA-1 of the signing key).

**Releases (Obtainium):** pushing a `v1.2.3` tag runs `.github/workflows/android-release.yml`: tests,
`build:app`, `cap sync`, then a signed `assembleRelease`, and attaches `QuickConverter-v1.2.3.apk` to a
GitHub Release. `android-version.mjs` turns the tag into versionName/versionCode (major*1e6 + minor*1e3 + patch).
The release key lives only in the gitignored `release-keys/` folder and the repo's `QC_KEYSTORE_*`/`QC_KEY_*`
Actions secrets; never commit or print it. Its SHA-1 must also be on the Android OAuth client.

**CSS gotcha:** Tailwind is compiled and committed. After editing any markup/JS that
introduces new utility classes, run `npm run build:css` (or the `watch` script). Missing
classes silently break layout (e.g. a missing `justify-end` makes the drawer anchor left)
because the committed `src/styles/tailwind.css` is stale.

**Testing:** `npm test` runs 27 suites via `tests/run_all.js`. Twenty-six are zero-dependency Node
suites (unit + static/contract, no DOM); one of them, `tests/components.test.js`, renders the
migrated React components with `react-dom/server` (`renderToString`) and asserts their markup.
JSX is compiled for Node by `tests/helpers/render.js` using the `esbuild` devDependency
(bundled to gitignored `tests/.tmp/`). Effects/`useEffect` do not run under `renderToString`, so
the component suite covers prop → markup only; wiring/timing still needs a manual `dist/` check.
When adding a component test: `const { default: View } = await loadComponent('components/react/<view>/X.jsx')`,
then `render(h(View, props))` and assert on the returned string (React separates adjacent text
nodes, so the helper's `render` strips `<!-- -->`).

**Testing expectations (owner rules)**
1. **Test-first for behavior.** For a new feature or a bug fix, write the failing test that
   reproduces it *before* the code, then implement until green. State the red → green in the
   commit message.
2. **Never edit an assertion because the code disagrees.** A red test is a signal, not an
   obstacle. You may only change an expectation when (a) the expectation was wrong about the
   *behavior*, or (b) the test's proxy changed — a file/ID moved, or a serializer's output format
   differs (e.g. SSR emits `style="width:0%"`). Say which, in the commit message.
3. **Never weaken or delete an assertion to go green.** No shrinking a check until it passes, no
   dropping a case. If a proxy assertion is genuinely obsolete, replace it with one that protects
   the same behavior.
4. **Prefer behavior-level assertions** (`render` a component/prop and assert output, or exercise
   the service) over static greps of source. Static/contract greps are allowed for things with no
   runtime (manifest keys, script tags) and must read the file that *owns* the ID; expect to
   repoint them when markup moves.
5. **Refactors are behavior-preserving.** Lock behavior with tests first (characterization), keep
   them green, and only repoint location-based proxies.
6. **Report test changes.** Every commit that touches a test must say why the test changed.

## Architecture rules (see `context.md` for full detail)

1. **Platform API isolation** — never call `chrome.*` directly in `src/views/` or
   `src/components/`; go through `src/services/` (e.g. `StorageService`) and guard with
   `typeof chrome !== 'undefined'`.
2. **Web standards only** — `window.indexedDB`, `fetch`/`EventSource`/`ReadableStream`,
   `TextDecoder`/`TextEncoder`/`crypto.subtle`. No Node-only deps in frontend code.
3. **Mobile-first** — must render at 360px; touch targets >= 40x40px; never hide critical
   actions behind `:hover` only.
4. **Portable assets** — relative paths only, never hardcoded `chrome-extension://` URLs.
5. **Offline-first** — reading must work with zero connectivity once downloaded.

## Code style

- **Views are React**, one folder per view under `src/components/react/<view>/` (plus `shared/`),
  mounted from a per-view entry (`<view>-entry.jsx` → `#<view>-root`); `src/services/`,
  `src/providers/` stay classic global scripts.
- **Do not add comments unless asked.**
- Reuse shared view modules (`src/components/react/shared/AiConfigPanel.jsx`, `QueueDock.jsx`,
  `AddBookButton.jsx`) instead of duplicating provider/DeepSeek UI across views. The AI panel is React:
  wrap it with view-specific `variant`/`ids`/`hooks` and read it back through its imperative ref
  (`getDownloadOptions`/`refreshBalance`). Remaining classic globals (`src/services/`,
  `src/providers/`) still load via `<script>`; register new ones as IIFE + `window.*` export.
- Keep `DownloadQueueService` runnable both in-thread and via background worker delegation.

## View rewrite status

Popup, Settings, Reader and Novel are fully React (no `src/views/*.js` logic scripts remain).
Shells are `src/views/<view>.html` + `src/components/react/<view>/<view>-entry.jsx`.

## Plans

Active plans live under `current_plan/` (one folder per effort, e.g.
`current_plan/android/overall_plan.md` for the Android app). Optional ideas go in `nice_to_have_plan.md`.
