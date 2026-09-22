# QuickConverter: Project Context & Architecture Guidelines

> **Living Documentation**: This document defines the high-level architecture of QuickConverter and establishes the development rules required to keep future ports to **Android** (via Capacitor) and **Windows Desktop** (via Electron/Tauri) fast, modular, and painless.

---

## 1. Project Overview

QuickConverter is an offline-first web novel reader, downloader, and AI translator. It enables users to catalog novel chapters from online providers, queue them for sequential background downloading, translate them in real-time via LLM APIs (Official DeepSeek or Local Web Bridges / Custom OpenAI-compatible endpoints) with live streaming progress, and read them with custom typography.

### Current Implementation Stack
- **Interface**: React 19 + Vite for the view layer (built to `dist/`; load unpacked from there), with the classic global-script services as the data layer. Tailwind CSS (compiled via CLI).
- **View apps**: Popup (`PopupApp`), Settings (`SettingsView`), Reader (`ReaderApp`) and Novel (`NovelApp`) are fully React; each HTML file is a shell mounting one `components/react/<view>/<view>-entry.jsx` into `#<view>-root` (see `current_plan.md`).
- **Persistent Storage**: W3C **IndexedDB** (`services/storage.js`) for novel metadata and chapter texts.
- **Queue & Background**: Centralized sequential FIFO queue (`services/download-queue.js`) with concurrency control (strictly 1 task at a time), pause/resume, individual item cancellation, and live circular progress.
- **Dock UI**: Reusable solid, opaque floating dock React component (`components/react/shared/QueueDock.jsx`) with expanded/collapsed modes, mounted via `components/react/shared/queue-dock-entry.jsx`.
- **AI Translation Coordinator**: `services/ai-service.js` routing between `services/deepseek.js` (Official Cloud API) and `services/custom-api.js` (Local Web Bridge / Custom OpenAI-compatible endpoints) with SSE streaming delta accumulation and DeepThink reasoning extraction/discarding.
- **Shared View Modules**: `components/ai-config-panel.js` (`window.AiConfigPanel`) provides the single DeepSeek / AI-provider configuration panel used by the novel, popup, and reader views via `createAiConfigPanel({ variant, ids, capabilities, hooks })`. `components/add-book.js` registers the `<add-book-button>` custom element. Loaded via classic `<script>` tags before the view entry.
- **Testing**: `npm test` runs 13 suites via `tests/run_all.js` — twelve zero-dependency Node suites (unit + static/contract) plus `tests/components.test.js`, which renders the React components with `react-dom/server` (`renderToString`); JSX is compiled by the `esbuild` devDependency via `tests/helpers/render.js`. Effects don't run server-side, so component tests cover prop → markup only.
- **Testing rules (owner)**: test-first for behavior and bug fixes; never edit an assertion just because the code disagrees (only when the expectation was wrong about behavior, or a file/format proxy moved); never weaken/delete assertions to go green; prefer behavior-level render assertions over static source greps; report every test change and why in the commit. See `AGENTS.md`.

---

## 2. Directory Structure

```text
QuickConverter/
├── components/          # Reusable UI modules (AiConfigPanel, add-book custom element) + react/<view> views
├── fonts/               # 11 offline web font binaries (Merriweather, Inter, etc.)
├── icons/               # Extension icons (16, 48, 128px)
├── providers/           # Web scraping catalog & content extractors (wetriedtls.js)
├── scripts/             # Chrome extension background service workers
├── services/            # Core business logic (Storage, AI, Queue, Custom API, Cloud Sync)
├── styles/              # input.css and tailwind.css build output
├── tests/               # Automated unit & integration tests
├── views/               # Application pages (library, novel, reader, settings, popup)
├── manifest.json        # Chrome Extension MV3 manifest
├── API_DOC.md           # Backend AI API documentation
└── context.md           # This document: architectural context & port rules
```

---

## 3. Development Rules for an Easy Android / Desktop Port

To ensure that 95%+ of the codebase can be wrapped directly into an Android app (via Capacitor) or Desktop app without a rewrite, all new features and modifications **must adhere to these rules**:

### Rule 1: Strict Platform API Isolation (No Direct `chrome.*` in Views or Components)
- **Never call `chrome.storage`, `chrome.runtime`, or `chrome.tabs` directly inside `views/` or `components/`.**
- All storage operations must go through `StorageService` (`services/storage.js`).
- If extension-specific APIs must be used (such as opening options pages or background message dispatching), always provide a fallback check:
  ```javascript
  // Good: Platform-safe navigation
  if (typeof chrome !== 'undefined' && chrome.runtime?.getURL) {
    window.location.href = chrome.runtime.getURL('views/settings.html');
  } else {
    window.location.href = 'settings.html';
  }
  ```

### Rule 2: Web Standards Only for Core Logic
- **Database**: Rely exclusively on standard W3C `window.indexedDB`. Both Android WebView and Desktop WebView2 natively support IndexedDB.
- **Networking**: Use standard `fetch`, `EventSource`, or standard `ReadableStream` readers.
- **Encoding/Hashing**: Use standard `TextDecoder`, `TextEncoder`, and `crypto.subtle`.
- **No Node-only packages**: Do not introduce dependencies that require Node `fs`, `net`, `child_process`, or native C++ add-ons into frontend files.

### Rule 3: Mobile-First Responsive UI & Touch Ergonomics
- **Screen Widths**: All layouts must be tested and responsive down to mobile viewports ($360\text{px} - 420\text{px}$).
- **Touch Targets**: All interactive elements (buttons, toggles, icons, chapter rows) must have a minimum clickable area of at least $40\text{px} \times 40\text{px}$ or generous tap padding.
- **No Mouse-Only Hover Traps**:
  - Never hide critical actions (like Delete, Download, Cancel) exclusively behind CSS `:hover` without a tap/touch alternative.
  - In mobile touch environments, `:hover` states do not trigger until after a tap. Use visible touch buttons or secondary toggle states.
- **Safe Areas**: Use Tailwind safe-padding utilities where necessary for mobile status bars and navigation notches (`env(safe-area-inset-bottom)`).

### Rule 4: Decouple Queue Execution from Extension Service Workers
- Currently, `scripts/background.js` executes queue tasks because Chrome MV3 extension tabs unload when navigated.
- In a native Android app (via Capacitor) or Desktop app (Electron/Tauri), the app is a single persistent web context.
- **Rule**: Keep `DownloadQueueService` capable of running either:
  1. In a UI thread / Web Worker directly (when running as an App or standalone tab).
  2. Delegating to `chrome.runtime.sendMessage` (only when running inside a Chrome extension popup/tab).

### Rule 5: Portable File and Image Assets
- Font binaries, icons, and stylesheets must always be referenced using **relative paths** (e.g. `../fonts/Merriweather-Regular.woff2` or `styles/tailwind.css`), rather than hardcoded `chrome-extension://...` URLs.
- This allows Android WebViews and local desktop web servers to resolve assets instantly without network requests.

### Rule 6: Offline-First Reliability
- Every reading feature must assume zero internet connectivity once a chapter is downloaded.
- Network calls must have timeouts and clear offline error messages.
- Request persistent storage on mobile startup:
  ```javascript
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist();
  }
  ```

---

## 4. Planned Migration Path (Capacitor for Android)

When feature implementation is complete in the web extension:
1. **Initialize Capacitor**:
   ```bash
   npm install @capacitor/core @capacitor/cli @capacitor/android
   npx cap init QuickConverter com.quickconverter.app --web-dir views
   ```
2. **Add Android Platform**:
   ```bash
   npx cap add android
   ```
3. **CORS & Direct Fetching**:
   - In the Android app, install `@capacitor/http` or configure Android WebView `network_security_config.xml` to allow direct scraping and local bridge connections (`http://127.0.0.1:8000`) without CORS barriers.
4. **Build & Run**:
   ```bash
   npx cap copy android
   npx cap open android
   ```

---

## 5. Summary Checklist for Every New Feature

Before committing any new feature, verify:
- [ ] Does it run completely offline with already-downloaded chapters?
- [ ] Does the UI render cleanly on a 360px mobile width?
- [ ] Are all buttons easily tappable with a thumb?
- [ ] Does it run without throwing errors if `chrome.runtime` is missing?
- [ ] Do all automated tests pass (`npm test`)?
