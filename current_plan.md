# current_plan.md

## Plan: Extract a shared AI Config Panel to de-duplicate the view layer

**Status:** proposed
**Owner:** pending
**Related docs:** `context.md` (architecture rules), `AGENTS.md` (commands), `API_DOC.md`
**Scope:** presentation layer only — `views/` and a new `components/` module. No changes to `services/` behavior.

---

## 1. Problem

The AI-provider / DeepSeek configuration UI is copy-pasted into three views. The
same control set is wired up three times with page-prefixed element IDs, so every
bug fix or feature (e.g. provider switching, balance refresh, key handling) must be
applied in up to three places and easily drifts.

Measured duplication:

| View | Function | Line range | ~Lines |
|---|---|---|---|
| `views/novel.js` | `initDeepSeekUI` | 34–663 | ~630 |
| `views/popup.js` | `initDeepSeekUI` | 49–613 | ~565 |
| `views/reader.js` | `initReaderDeepSeekUI` | 749–1274 | ~525 |

Total: **~1,700 lines** of near-identical logic. Additional duplicates:

- `applyProviderUI` — novel.js:84, reader.js:799 (near-identical), popup.js:93 (compact variant).
- `updateState` — novel.js:428, popup.js:415, reader.js:1135.
- `escapeHtml` — novel.js:694, reader.js:404.
- `resolveFontFamilyCss` — reader.js, settings.js (related, tracked separately).

Shared control IDs appear in 3+ files (`deepseek-api-key`, `deepseek-model-select`,
`deepseek-toggle`, `deepseek-prompt`, `clear-deepseek-btn`, `test-deepseek-btn`,
provider buttons/badges, custom URL rows, balance widgets, pricing badge).

`views/settings.js` (`initDeepSeekSettings`, 954 lines file) is a **different UI**
(radio model cards, tabbed layout) and is intentionally **out of scope** for this plan.

---

## 2. Goal

Create one framework-agnostic shared module that owns the provider/DeepSeek panel,
then replace the three copies with a config-driven call. Delete the duplicated code
while keeping every page visually and behaviorally identical.

Success criteria:

- One implementation of provider switching, key/balance handling, model select,
  translation toggle, pricing badge, and prompt editing.
- Net reduction of ~1,300+ lines across `views/`.
- All 9 test suites still pass (including `bridge.test.js` ID assertions).
- No visual/behavioral regressions on novel, popup, or reader.

---

## 3. Non-goals

- No migration to Vite/React (see discussion; independent decision).
- No changes to `services/*` behavior or public APIs.
- No restyling/redesign — output markup and classes stay equivalent to today.
- `settings.html` / `settings.js` untouched in this plan.
- No ID renames in HTML (avoids breaking `tests/bridge.test.js`); see Phase 6 for the
  optional standardization follow-up.

---

## 4. Target design

Follow existing repo conventions: classic scripts (no ESM), attaching to `window`,
loaded via `<script>` tags **before** the view script. No build step required.

### 4.1 New modules

| File | Global | Purpose |
|---|---|---|
| `components/ui-utils.js` | `window.UIUtils` | `escapeHtml`, `escapeAttr`, `formatDate` (extracted from views) |
| `components/ai-config-panel.js` | `window.AiConfigPanel` | `createAiConfigPanel(config)` factory returning the panel controller |

Load order in each view HTML (before the view script):

```html
<script src="../components/ui-utils.js"></script>
<script src="../components/ai-config-panel.js"></script>
<script src="novel.js"></script>
```

Add both files to `manifest.json` `web_accessible_resources` only if needed (they are
loaded by extension pages, not injected, so this is optional).

### 4.2 API contract

```js
const panel = AiConfigPanel.create({
  ids,            // role -> element id map (see 4.3)
  variant,        // 'full' (novel/reader) | 'compact' (popup)
  capabilities,   // { provider, balance, prompt, cooldown, modelSelect, testConnection }
  hooks: {
    getPrompt: () => string,
    savePrompt: (text) => Promise<void> | void,
    onToggle: (enabled) => void,       // view-specific side effects
    onProviderChange: (provider, url) => void
  }
});
await panel.refresh();          // load provider config, key, model, prompt, balance
panel.refreshBalance(force);    // replaces direct `novelBalanceTracker.refresh()`
panel.getApiKey();
panel.getProvider();            // { provider, baseUrl, customUrl }
panel.destroy();
```

### 4.3 Element role → ID map

The panel resolves every element through the map, so HTML IDs stay unchanged.
Example (novel):

```js
ids: {
  toggle: 'deepseek-toggle',
  toggleBadge: 'deepseek-toggle-badge',
  providerBadge: 'novel-provider-badge',
  providerBtnOfficial: 'novel-provider-btn-official',
  providerBtnCustom: 'novel-provider-btn-custom',
  customRow: 'novel-custom-api-row',
  customUrl: 'novel-custom-base-url',
  presetBtn: 'novel-bridge-preset-btn',
  testCustomBtn: 'novel-test-custom-btn',
  apiKeyLabel: 'novel-api-key-label',
  apiKey: 'deepseek-api-key',
  rememberKey: 'remember-deepseek-key',
  clearKeyBtn: 'clear-deepseek-btn',
  prompt: 'deepseek-prompt',
  editPromptBtn: 'edit-prompt-btn',
  visibilityBtn: 'toggle-key-visibility',
  fields: 'deepseek-config-fields',
  modelSelect: 'deepseek-model-select',
  testBtn: 'test-deepseek-btn',
  testStatus: 'deepseek-test-status',
  balanceBadge: 'deepseek-balance-badge',
  balanceText: 'deepseek-balance-text',
  refreshBalanceBtn: 'deepseek-refresh-balance-btn',
  refreshBalanceIcon: 'deepseek-refresh-balance-icon',
  pricingBadge: 'deepseek-pricing-badge',
  cooldownToggle: 'novel-cooldown-toggle',
  cooldownToggleLabel: 'novel-cooldown-toggle-label',
  cooldownMin: 'novel-cooldown-min',
  cooldownMax: 'novel-cooldown-max',
  cooldownMinLabel: 'novel-cooldown-min-label',
  cooldownMaxLabel: 'novel-cooldown-max-label',
  cooldownBadge: 'novel-cooldown-badge',
  cooldownInputs: 'novel-cooldown-inputs-container'
}
```

Popup uses `popup-*`; reader uses `reader-*` (including `reader-deepseek-api-key`,
`reader-clear-deepseek-btn`, etc.). Missing keys simply disable that control.

### 4.4 Per-view differences to encode

| Concern | novel | popup | reader |
|---|---|---|---|
| ID prefix | mixed `novel-*` + `deepseek-*` | mixed `popup-*` + `deepseek-*` | all `reader-*` |
| Styling | full | compact (`text-[11px]`, `px-2 py-1`) | full |
| Cooldown controls | yes (min/max/labels/badge) | toggle + badge only | no |
| Prompt scope | per-novel | global preference | per-novel |
| Balance tracker | exposed to view (used at novel.js:1714, 2049) | local | local |
| Test status target | `deepseek-test-status` | `deepseek-test-status` + `popup-custom-test-status` | `reader-deepseek-test-status` |
| Init timing | DOM ready | DOM ready | async, takes `novelRecord` |

`variant`/`capabilities` drive styling and which sub-sections render, so no branching
on file names inside the module.

---

## 5. Migration phases

Each phase is independently shippable and must end green (`npm test` + manual check).

### Phase 0 — Baseline & guardrails
- Confirm `npm test` passes; tag/note current commit.
- Extract shared `escapeHtml` into `components/ui-utils.js`; replace copies in
  novel.js and reader.js. Add script tag to the two view HTML files.
- **Exit:** tests green; no duplicated `escapeHtml` remains.

### Phase 1 — Build the module from the canonical implementation
- Copy `novel.js` `initDeepSeekUI` (34–663) into `components/ai-config-panel.js` as
  `createAiConfigPanel(config)`; replace hardcoded IDs with `ids[...]` lookups and
  view-specific behavior with `hooks`/`capabilities`.
- Keep the novel variant behavior identical first; do not yet delete novel.js code.
- Add unit-level smoke coverage if practical (the suite is Node/zero-dep and DOM is not
  available, so rely on `node --check` + manual verification).

### Phase 2 — Migrate `novel.js`
- Replace `initDeepSeekUI` body with `createAiConfigPanel({ ids, variant:'full',
  capabilities, hooks })` + `await panel.refresh()`.
- Re-wire the two external uses (`novel.js:1714`, `novel.js:2049`) to
  `panel.refreshBalance(true)`.
- Delete the old block and the local `applyProviderUI`/`updateState`.
- **Exit:** novel view behavior unchanged; tests green.

### Phase 3 — Migrate `popup.js`
- Map `popup-*` IDs, `variant:'compact'`, cooldown without min/max, global prompt hook.
- Delete the old `initDeepSeekUI` block (49–613).
- **Exit:** popup behavior unchanged (test connection, compact styling, toggle).

### Phase 4 — Migrate `reader.js`
- Map `reader-*` IDs; prompt hook bound to `novelRecord`; no cooldown capability.
- Delete `initReaderDeepSeekUI` block (749–1274) and its local helpers.
- **Exit:** reader panel unchanged; streaming/translate flow unaffected.

### Phase 5 — Cleanup & docs
- Remove now-dead helpers/globals; `grep` to prove single implementation.
- Update `context.md` §2/§11 to document `components/ai-config-panel.js` and
  `components/ui-utils.js`.
- Update `AGENTS.md` if new conventions were introduced.
- Rebuild CSS only if markup/classes changed (should be minimal): `npm run build:css`.

### Phase 6 (optional, separate) — Standardize IDs
- Replace per-page IDs with `data-role` attributes on a shared partial and delete the
  `ids` map. Requires updating `tests/bridge.test.js` (lines 41–74 assert current IDs).
- Deferred until the panel is stable.

---

## 6. Verification

- `npm test` after every phase (9 suites; must stay green).
- `node --check` on every modified JS file.
- `npm run build:css` only if new utility classes were introduced; verify no missing
  classes silently break layout (see AGENTS.md CSS gotcha).
- Manual matrix per view:
  - Provider toggle official ↔ custom; custom URL edit + preset; test connection.
  - API key: show/hide, remember, clear, test key, balance refresh + low/no-funds/error states.
  - Model select persistence (`quickconverter_deepseek_model`).
  - Translation toggle persistence (`quickconverter_deepseek_enabled`) + badge.
  - Prompt edit/save (per-novel vs global).
  - Cooldown (novel/popup): toggle, min/max clamping, labels, badge, disabled state styling.
  - 360px width render; touch targets >= 40px; no hover-only actions.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Hidden view-specific behavior not captured in `hooks` | Phase-by-phase diff review of old vs new; run manual matrix per view |
| `novelBalanceTracker` used outside the block | Expose `panel.refreshBalance()` and update novel.js:1714, 2049 |
| `bridge.test.js` asserts specific IDs in HTML | Do not rename IDs in Phases 0–5; ID map keeps HTML intact |
| Compact (popup) styling diverges | `variant` flag + class maps copied verbatim, not re-derived |
| Script load-order regressions | New scripts included before view script in each HTML; verify no `undefined` at runtime |
| Large single refactor | One view per phase; each independently revertible |
| Tests don't execute DOM code | Rely on `node --check` + manual matrix; no false confidence from green suite |

---

## 8. Rollback

Per phase, revert the single view file + its HTML script tags. The old code in
`novel.js`/`popup.js`/`reader.js` is only deleted after its view is verified, so any
phase can be backed out without affecting the others.

---

## 9. Open questions

1. Should `settings.js`'s provider/model UI eventually share the same module, or stay
   separate (different interaction model)?
2. Do we want `data-role` standardization now (cleaner) or defer until after a possible
   Vite/React migration?
3. Should the panel own the prompt (`getPrompt`/`savePrompt`) or should each view pass
   fully-resolved values?
4. Any value in also extracting the shared toast/`showToast` and `resolveFontFamilyCss`
   duplicates in this same pass, or keep this plan focused on the AI panel?
