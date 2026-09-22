# current_plan.md

## Plan: Incremental migration to Vite + React

**Status:** proposed
**Owner:** pending
**Drivers:** UI complexity (queue dock, streaming translation, name list, reader typography)
and developer experience (inexperienced dev; React has the largest help/AI corpus).
**Related docs:** `context.md` (architecture + port rules), `AGENTS.md` (commands), `manifest.json`
**Scope:** build system + presentation layer. Business logic in `services/` stays framework-agnostic.

---

## 1. Decision & guardrails

Migrate **incrementally**, not big-bang. Introduce Vite first (no React), then ESM, then adopt
React **one view at a time**. This is low-risk because the app is a multi-page app (MPA): each
`views/*.html` is a separate entry, so a React page and a vanilla page can coexist during the
transition.

Hard rules carried over from `context.md`:

1. `services/` and `providers/` must stay usable from both React and vanilla code, and from
   Capacitor. No React imports inside `services/`.
2. Platform API isolation — no direct `chrome.*` in components; go through `services/` / a
   `Platform` adapter.
3. Web standards only; relative asset paths; mobile-first at 360px.
4. `npm test` must pass after every phase.

Non-goals for now: TypeScript, SSR, state libraries (Redux/Zustand), design-system rewrite.
Keep JavaScript to limit new concepts.

---

## 2. Current-state assessment (why this shapes the plan)

| Area | Current state | Migration impact |
|---|---|---|
| Views | 5 HTML entries (`library`, `novel`, `reader`, `settings`, `popup`), order-dependent classic scripts | MPA-friendly; can migrate per page |
| `services/`, `providers/` | Hybrid globals (`window.X`) **and** CommonJS (`module.exports`); tests `require()` them | ESM conversion must update tests + `background.js` |
| Background | `scripts/background.js` uses classic `importScripts(...)` | Becomes a module worker or a bundled IIFE |
| Content scripts | `manifest.json` injects `providers/wetriedtls.js`, `registry.js`, `scripts/content.js` as classic scripts | Must be built as a single IIFE bundle (ESM not allowed) |
| Shared UI | `components/queue-dock.js`, `add-book.js` (custom element), `ai-config-panel.js`, `ui-utils.js` (global IIFE) | Good React adoption targets; keep `ai-config-panel` logic framework-agnostic |
| CSS | Tailwind compiled by CLI to committed `styles/tailwind.css` | Keep CLI initially; optionally switch to PostCSS later |
| Tests | Zero-dep Node runner (`tests/run_all.js`) spawning `node <file>` | Files must stay runnable after ESM change |
| MV3 | popup + options + service worker + content scripts; `web_accessible_resources` | Vite must emit all MV3 entry types into `dist/` |

Key constraint: **Vite bundles `type="module"` scripts**, and the extension can't use ESM in the
service worker's `importScripts` or in content scripts directly. So Phase 1 keeps classic scripts
verbatim (served/copied, not bundled) and later phases convert deliberately.

---

## 3. Phases

Each phase ends green: `npm test` passes and the extension loads unpacked from `dist/`.

### Phase 0 — Baseline & spike
- Confirm `npm test` green; create `dist/` conventions and a `CHROME LOAD` note.
- Add a tiny `platform.js` interface definition (`storage`, `messaging`, `alarms`) with a
  `chromePlatform` implementation and a `webPlatform` fallback (no behavior change yet).
- **Exit:** interfaces defined, nothing wired, tests green.

### Phase 1 — Vite as build/dev server (no React, no ESM)
- `npm i -D vite`; add `vite.config.js` with MPA inputs:
  ```js
  build: { rollupOptions: { input: {
    library: 'views/library.html', novel: 'views/novel.html',
    reader: 'views/reader.html', settings: 'views/settings.html', popup: 'views/popup.html'
  } } }
  ```
- Copy `manifest.json`, `icons/`, `fonts/`, `styles/`, `providers/`, `services/`, `components/`,
  `scripts/` into `dist/` (via `publicDir` or a copy step) so classic scripts keep working.
- Keep `styles/tailwind.css` from the existing CLI for now (`build:css`).
- **Do not** convert scripts to modules yet. Validate: `vite build` → load `dist/` unpacked;
  `vite dev` serves pages over HTTP (chrome APIs absent → use the `webPlatform` fallback).
- **Exit:** extension runs from `dist/`; `vite dev` usable for UI iteration; tests green.

### Phase 2 — ESM-ify services, providers, and tests
- Convert `services/*.js` + `providers/*.js` from `window.X`/`module.exports` to ESM
  `export`/`import`. Remove the global assignments (views will import, or a thin `globals.js`
  shim re-exposes them for not-yet-migrated pages).
- Set `package.json` `"type": "module"`; rename `tailwind.config.js` → `tailwind.config.cjs`.
- Convert `tests/*.js` to ESM imports (or rename to `.cjs` if you prefer to keep `require`).
- Update `scripts/background.js`: either add `"type": "module"` to the MV3 background entry and
  use `import`, or compile it to an IIFE (Phase 3 decides).
- Route all `chrome.*` calls through the `Platform` adapter from Phase 0.
- **Exit:** `npm test` green under ESM; every view still loads (via shim or import).

### Phase 3 — MV3 build integration
- Build the three MV3 entry kinds from Vite:
  - Pages/HTML → bundled entries.
  - Service worker → module worker (`manifest.background.type = "module"`) or IIFE bundle.
  - Content script (`content.js` + provider deps) → rollup IIFE bundle referenced by
    `manifest.content_scripts`; ESM is not permitted in content scripts.
- `manifest.json` paths point into `dist/`. Keep `web_accessible_resources` for `fonts/*`.
- Add a `build:ext` script that runs `vite build` + copies the manifest.
- Note: no HMR inside the extension runtime — iterate against `vite dev` in a normal tab with the
  `webPlatform` stub, then rebuild + reload unpacked to test chrome-specific paths.
- Consider `@crxjs/vite-plugin` to automate MV3 entries; evaluate maturity before committing to it,
  otherwise hand-roll the config.
- **Exit:** `build:ext` produces a loadable extension; content script scrapes; background runs.

### Phase 4 — Adopt React, one entry at a time
- `npm i react react-dom`; `npm i -D @vitejs/plugin-react`.
- Migrate in this order (most self-contained / highest pain first):
  1. **Queue dock** (`components/queue-dock.js`) → `<QueueDock>` inside a surviving vanilla page
     (mount a React root into a single container; the rest of the page stays vanilla).
  2. **Novel view** (`novel.js`) — largest logic; includes `AiConfigPanel` + name list.
  3. **Library**, 4. **Reader**, 5. **Settings**, 6. **Popup**.
- Wrap `AiConfigPanel` as a React component that reuses the existing panel *logic* (extract the
  imperative core into a plain class/hook so both worlds share it). Do not fork the logic.
- Keep `services/` imports direct from React components.
- Because it's MPA, each page can flip independently; no routing framework required yet.
- **Exit per page:** visual/behavior parity vs the vanilla version; `npm test` green.

### Phase 5 — Capacitor prep (Android)
- Point Capacitor at the Vite output (`webDir: 'dist'` or `dist/views`).
- Implement the `Platform` adapter with Capacitor plugins (`@capacitor/preferences`, HTTP, etc.).
- `npx cap add android`; configure cleartext/localhost bridge access per `context.md`.
- **Exit:** app boots on Android/emulator using the same UI build.

---

## 4. Verification (every phase)

- `npm test` → all suites green.
- `node --check` on changed JS (until ESM linting is added).
- `npm run build:css` only if utilities changed (Tailwind gotcha in `AGENTS.md`).
- Load unpacked from `dist/` and smoke: popup open, library list, novel Name List + panel, reader
  load, settings save, download queue dock, content-script scrape on a series page.
- Manual 360px check; touch targets ≥ 40px.

---

## 5. Risks & mitigations

| Risk | Mitigation |
|---|---|
| MV3 service worker can't `importScripts` after ESM | Phase 3 chooses module worker (`type:"module"`) or IIFE bundle |
| Content scripts can't use ESM | Bundle to a single IIFE; no dynamic import |
| Vite dev needs `eval`/inline (CSP in extension) | Develop in a normal tab; production build only is loaded in Chrome |
| No HMR against extension runtime | `vite dev` + `webPlatform` stub for UI; reload `dist/` for chrome paths |
| ESM conversion breaks `require()` tests / `tailwind.config.js` | Phase 2: `"type":"module"`, rename config to `.cjs`, convert tests |
| Bundling breaks order-dependent classic scripts | Phase 1 keeps them copied/unbundled; convert deliberately in Phase 2+ |
| Inexperienced dev; steep tooling curve | Incremental phases; keep JS (no TS); spike one component before scaling |
| LLM/AI help skews to React patterns | Use it, but validate against this repo's rules and the MV3 constraints |
| Scope creep | One page per migration step; services stay framework-agnostic |

---

## 6. Rollback

Phases are additive. Each view can remain vanilla until migrated; keep the vanilla file until the
React version reaches parity, then delete. `git revert` a phase if the build regresses. The Vite
build can coexist with the current scripts+manifest for as long as needed.

---

## 7. Open questions

1. Service worker: module worker (`type:"module"`) vs IIFE bundle? (affects Phase 3 config)
2. Adopt `@crxjs/vite-plugin` or hand-roll MV3 entries?
3. Keep Tailwind CLI, or move to PostCSS via Vite after React lands?
4. React version pin (18 vs 19) for LLM/tutorial compatibility.
5. Does `settings.js` adopt React last, or stay vanilla if it remains simple?
6. Timeline/trigger for Phase 5 (Android) — ties to whether Capacitor happens before or after React.

---

## 8. Suggested first milestone

Phase 1 only: **Vite build that produces a loadable `dist/` extension with zero code changes.**
That single deliverable de-risks the entire migration, gives a real dev server, and commits to
nothing about React yet.
