# Android app — overall plan

**Goal:** ship QuickConverter as an Android app (Capacitor) while the Chrome extension keeps working.
One repository, one shared web app, two thin platform shells.

**Status (2026-10-19):** Phase 0 done. Phase 1 done in practice (its "done when" phone check not run
as one pass). Phase 2 done except sangtacviet chapters (parked; see `phase2_plan.md`), v1.1.8.
Phase 3: OCR on device and Drive sync already done; reading UX and background downloads left.

**Rule of engagement:** same as the extension — `npm test` green (test-first where behavior changes),
`npm run build:css` when new utility classes appear, `npm run build:ext` must keep producing a working
extension after every phase. Android builds are checked by the owner on a phone or emulator.

**Related docs:** `context.md` (porting rules, Rule 1–6), `AGENTS.md`, `nice_to_have_plan.md`.

---

## 1. Feasibility

Yes. The project was built for this from the start (`context.md` §3–4), and the code follows those
rules closely. The shared core runs in an Android WebView almost unchanged; the work is replacing what
Chrome does for us: content scripts, background tabs, network rules, the background worker and
Google sign-in.

Measured on the code (2026-10-17):

- About 20,000 lines of app JS/JSX; roughly 85–90% carries over as is.
- `chrome.*` calls live in 9 files, all services/scripts — views and components are already clean:
  `download-queue.js` (65), `storage.js` (25), `platform.js` (25), `deepseek.js` (23),
  `background.js` (15), `content.js` (12), `custom-api.js` (4), `ai-service.js` (4), `cloud-sync.js` (3),
  plus one guarded call in `AiConfigPanel.jsx`.
- Chrome APIs in use: `storage.local/session`, `runtime.sendMessage/onMessage/getURL/id`, `alarms`,
  `tabs.create/query/remove/onUpdated/onRemoved`, `identity` (Drive), `action.openPopup`,
  `declarativeNetRequest` (sangtacviet Referer rule), content scripts.
- Bundled data: `src/dict` 42 MB, `src/ocr` 6 MB.

## 2. What carries over

| Part | On Android |
|---|---|
| React views: library, novel, reader, settings | Run in Capacitor's WebView; already mobile-first (360px, 40px touch targets) |
| Converter, Luật Nhân, numbers, input cleanup, Lạc Việt, name finder, Jieba | Plain JS, unchanged |
| IndexedDB storage, backup export/import | WebView has IndexedDB |
| AI translation (DeepSeek, custom API) | Unchanged once requests go through native HTTP (CORS) |
| OCR (ONNX Runtime wasm, PaddleOCR models) | WebView supports WASM; slower on phones |
| Download queue | Already runs in the page when there is no extension background (`context.md` Rule 4) |
| Last read, name highlighting, phrase panel, glossaries | Unchanged |

## 3. What must be replaced

| Extension mechanism | Android replacement | Size |
|---|---|---|
| `host_permissions` (no CORS limits) | `CapacitorHttp` (native HTTP, patches `fetch`, shares cookies with the WebView via CapacitorCookies) | S |
| `declarativeNetRequest` Referer rule (sangtacviet chapter list) | Set the `Referer` header directly on the native request | S |
| `chrome.storage.local/session` | `localStorage` / Capacitor Preferences behind `platform.js` | S |
| Background worker + `runtime` messaging | Not needed: the app is one page. Queue runs in the page; `CHAPTER_SAVED` becomes an in-app event | M |
| `chrome.alarms` (queue cooldowns) | Timers while the app is open; Android WorkManager only if downloads must continue with the app closed | M |
| `chrome.identity` (Drive sync) | Google Sign-In plugin for the OAuth token; Drive REST code unchanged | M |
| Content scripts + "Open to save" background tab (nkwwlkj, sangtacviet) | **Embedded WebView** that loads the chapter page, runs our extraction, saves, closes | **L** |
| Popup | Dropped; the library is the home screen | S |
| `action.openPopup` on book pages | Dropped | S |

### The hard part: open-page sites

Android has no extension running on the site. The app opens the chapter in an in-app WebView (hidden,
or visible when the user must log in or pass a Cloudflare check), injects the same extraction logic
as `content.js`, sends the result back, saves it and closes the WebView.

- It must be a real embedded WebView, not Chrome Custom Tabs: Custom Tabs cannot run our script and do
  not share cookies with the app.
- Options:
  1. `cordova-plugin-inappbrowser` (works in Capacitor, has `executeScript`) — quickest to try;
  2. a small custom Kotlin plugin (`SiteBrowserPlugin`) — more work, full control over cookies,
     hidden loading and the back button.
- sangtacviet: an Android WebView is a real Chromium browser, so Cloudflare normally passes; if a
  challenge shows, the user solves it once in the visible WebView.
- nkwwlkj image chapters: capture the image in the WebView as today, then OCR in the app.

## 4. Risks to check early

1. **Dictionary memory and load time on phones.** VietPhrase is 28 MB of text; parsing it into a
   `Map` on a mid-range phone may take seconds and a few hundred MB of RAM. Test on the owner's phone
   first. Fallback: convert dictionaries at build time into a compact pre-indexed format and/or cache
   the parsed form in IndexedDB.
2. **App size.** Dictionaries + OCR models give an APK of about 50–60 MB. Fine for personal use;
   can shrink with compression.
3. **Background downloads.** Android pauses the WebView when the app is in the background. A queue
   that keeps running with the phone locked needs a native foreground service; the first version only
   downloads while the app is open.
4. **OCR speed.** Same engine on a phone CPU: seconds per chapter image. Measure before relying on it.
   **Measured (2026-10-19):** about 10–11 s for a 36,000-character chapter on the Galaxy S23 (v1.1.5).

## 5. Target structure

```text
QuickConverter/
├── src/                      # shared app: views, components, services, providers, dict, ocr
│   ├── services/platform.js  # the single platform switch
│   │                         #   chromePlatform  → chrome.storage / runtime / tabs / identity
│   │                         #   androidPlatform → Capacitor Preferences / Http / SiteBrowser / Google auth
│   └── scripts/content.js    # extraction logic, shared by both shells
├── extension/                # Chrome only: manifest.json, background.js, rules/, popup entry
├── android/                  # Capacitor-generated Android Studio project
│   └── app/src/main/java/…/SiteBrowserPlugin.kt   # embedded WebView: open, inject, capture, close
├── capacitor.config.ts
└── vite.config.mjs           # two builds: build:ext → dist/, build:app → dist-app/
```

Rule (unchanged from `context.md` Rule 1): views and components only talk to services; services only
touch `platform.js` for anything platform-specific. Today most services call `chrome.*` directly
behind `typeof chrome` guards — Phase 0 moves those behind `platform.js`.

## 6. Phases

Rough ranges for focused work. The real bottleneck is testing on a phone/emulator (owner).

### Phase 0 — Platform layer (≈2–3 days) — extension only, no Android yet

- Grow `platform.js` to cover storage (local + session), messaging, alarms, tabs/open-page, identity,
  and "open a page in the background".
- Move the direct `chrome.*` calls in the 9 files behind it (mechanical; existing tests cover it).
- Move extension-only files (`manifest.json`, `scripts/background.js`, `rules/`, popup entry) under
  `extension/`; keep `content.js` extraction logic shareable.
- Add a second Vite build target (`build:app` → `dist-app/`) that excludes extension-only files.
- **Done when:** all tests green, `build:ext` extension works exactly as before, `build:app` builds.
- **Result (2026-10-18):** done.
  - `platform.js` checks Chrome per call; services, components and providers use it (enforced by a
    test). Outside the extension, chapter-saved notices travel an in-page bus.
  - `extension/` holds `manifest.json`, `scripts/` (worker, content script, Open-to-save hand-off)
    and `rules/`. The HTML shells stay in `src/views` because Vite builds them; the app build leaves
    out `popup`, `ocr-panel` and `open-to-save`.
  - `build-targets.mjs` describes both builds; `npm run build:app` → `dist-app/` with an
    `index.html` that opens the library. `dist/` layout unchanged.
  - Checked in a plain browser (no `chrome`): library, novel, reader and settings load without
    errors; the only failure is CORS on catalog fetches, which Phase 1's native HTTP fixes.

### Phase 1 — Capacitor app shell (≈3–5 days)

- `npm install @capacitor/core @capacitor/cli @capacitor/android`, `npx cap init`, `npx cap add android`
  with `webDir: dist-app`.
- `androidPlatform` in `platform.js`: Preferences, CapacitorHttp (native HTTP + cookies), in-app
  events instead of runtime messaging, queue running in the page.
- Library as the start page; Android back button, status bar / safe areas, `navigator.storage.persist()`.
- Measure dictionary load time and memory on the owner's phone (risk 1); decide on the compact format.
- **Done when:** library, reader, converter, phrase panel, AI translation, backup export/import all
  work offline on the phone with already-saved chapters.
- **Progress (2026-10-18):** Capacitor 8.5.3 added (`capacitor.config.json`: app id
  `com.quickconverter.app`, `webDir: dist-app`, CapacitorHttp + CapacitorCookies on); `android/`
  generated; debug APK (33 MB) builds with JDK 23 and runs on the owner's Galaxy S23 (installed by
  the owner from the APK file; no adb). Since then: `navigator.storage.persist()` at startup,
  backup to/from a file in Settings, Drive sync through a native GoogleAuth plugin (pulled forward
  from Phase 3), and signed GitHub releases on `v*` tags for Obtainium (v1.1.0 published).
- **Risk 1 measured:** all dictionaries load and the converter builds in about 1 s on the S23, so
  the current dictionary format stays; no compact format needed.
- **v1.1.1:** Android back button (closes the open panel via Escape, then previous page, then the
  library, then minimizes; `@capacitor/app`), dark status/gesture bars matching the pages (Capacitor
  8 SystemBars pads the WebView, so no `viewport-fit=cover` CSS needed), and saving a backup file in
  the app through a native FileSaver plugin (Android's create-document picker).
- **Left:** the "done when" check on the phone.

### Phase 2 — Sources (≈1–1.5 weeks)

- wetriedtls over native HTTP (catalog + background chapter download).
- `SiteBrowser` embedded WebView (plugin choice above): open, inject extraction, capture, close; show
  it when login or a Cloudflare check is needed.
- nkwwlkj: chapter text, image chapters (capture + OCR), login status and coins.
- sangtacviet: chapter Chinese text; chapter list with `Referer` set natively.
- "Open to save" and "Save next N" flows on top of `SiteBrowser`.
- **Done when:** adding a book, syncing its catalog and saving chapters works for all three sites.

### Phase 3 — Device features and polish (≈1 week)

- OCR on device (measure speed, risk 4).
- Drive sync with a Google Sign-In plugin.
- Phone reading UX: gestures for next/previous chapter, keep-screen-on while reading, text size.
- Optional: foreground service / WorkManager for downloads with the app closed (risk 3).
- **Done when:** feature parity with the extension, minus the popup.

**Total:** about 3–4 weeks for full features. A useful first version (Phases 0–1: read and convert
everything already saved, translate, backup) comes much sooner.
