# current_plan.md

## Plan: Name List scalability & robustness

**Goal:** make the novel name list hold up at **thousands of entries** across reader
highlighting, translation tokenization, storage writes, and the drawer UI — without changing
observable behavior.

**Background / where we are:** the shared trie matcher already landed
(`src/services/name-matcher.js`, used by `splitByNames` and `tokenizeSource`; the 500-name cap
and the `N`-full-text-scan tokenizer are gone). Full analysis and rationale live in
`explanation.md`. The items below are the leftovers from that doc's "Remaining concerns" list.

**Rule of engagement:** one item at a time to completion.
`npm test` green (test-first where behavior changes) → `npm run build:css` if new utility classes
→ `npm run build:ext` → owner loads `dist/` for parity → commit per item so each is
independently revertible. Report any test change and why (owner rules in `AGENTS.md`).

**Related docs:** `context.md`, `AGENTS.md`, `explanation.md`.

---

## Status

- Prior work (React migration M1–M8, name-list source/rename/tokenize features, trie matcher) is
  **complete and committed**.
- This plan tracks **NL-1 … NL-10** below. Nothing here is started yet.

---

## 1. Items (one at a time)

### NL-1 — Skip empty-translation names when tokenizing  *(correctness, small)* — **done**
`tokenizeSource` includes entries whose `translation` is blank; `restoreTokens` only maps
non-empty translations, so such a token (`@n@`) can never be swapped back and leaks into the
saved chapter. Filter blank-translation entries out of tokenization (mirror `splitByNames`).
- Touches: `src/services/storage.js` (`tokenizeSource`).
- Tests: `tests/name-list.test.js` — a list entry with an empty translation must not be tokenized,
  and its source name must appear unchanged in the output.
- Verify: `npm test`, `npm run build:ext`.

### NL-2 — Move `nameList` off the inline novel record  *(storage, bigger)*
Currently `novel.nameList` is stored inline, so every `updateNovel` / `saveNameList` /
`markNameSeen` rewrites the whole array, and cloud backups embed it. Move names to a dedicated
IndexedDB store (or per-novel key) and keep a `nameListCount` on the novel for the hero badge.
- Touches: `src/services/storage.js` (schema, `getNameList`/`saveNameList`/`addNameEntry(s)`/
  update/delete), backup export/import, `NameListDrawer`/`NovelHero` count handling.
- Notes: DB version bump + migration of existing inline lists; keep the public `StorageService`
  method signatures so callers/UI don't change.
- Verify: `npm test` (name-list, backup, cloud-sync suites), `build:ext`, manual `dist/` check.

### NL-3 — Virtualize the Name List drawer  *(UI, when felt)*
`sortAndFilter` copies+sorts every render and every entry renders a row with handlers; thousands
of rows will jank. Window/memoize rows (e.g. react-window-style slicing or a simple
scroll-window) while keeping search/sort and the "open + scroll to a name" behavior.
- Touches: `src/components/react/novel/NameListDrawer.jsx`.
- Verify: `npm test` (component suite), `build:css`, manual scroll check at thousands of rows.

### NL-4 — Trie worst case → Aho–Corasick  *(only if profiling shows it)*
Trie is `O(T×L)` on text sharing long prefixes with names. Aho–Corasick gives `O(T + matches)`
behind the same `createMatcher` API, so the swap is internal.
- Touches: `src/services/name-matcher.js`.
- Verify: matcher tests + a shared-prefix stress case; measure before/after.

### NL-5 — Astral-plane indexing  *(edge)*
The trie walks the pattern by code point but `findAll` indexes the text by code unit, so
surrogate-pair names can miss. Iterate the text by code point.
- Touches: `src/services/name-matcher.js`.
- Tests: a surrogate-pair name match case.

### NL-6 — Case-folding edges  *(edge, likely no-op)*
Case-insensitive highlight uses per-char `toLowerCase()` (no locale handling; some chars change
length). Revisit only if odd names stop highlighting. Decide whether to keep naive folding.

### NL-7 — Cache highlight segments per chapter  *(perf, defer)*
Removes the per-render rescan; costs invalidation on name-list change / rename cascade. Defer
until rendering is actually slow.

### NL-8 — Bound matches per paragraph  *(hardening)*
Cap the number of highlighted segments per paragraph so a pathological text can't create a huge
DOM node count.

### NL-9 — Load-site contract test  *(guard, small)* — **done**
Assert `name-matcher.js` is present in the downloading views (`novel/popup/reader.html`) and in
`src/scripts/background.js` `importScripts`, so a missing tag can't silently degrade
tokenization/highlighting.
- Touches: a static contract test in `tests/` (allowed for manifest/script-tag checks).

### NL-10 — Batch renames  *(perf, defer)*
`replaceInChapters` rescans all chapters per rename; batch if users start renaming many names in
a row.

---

## 2. Verification per item

- Test-first for behavior; `npm test` (13 suites) must be green.
- `npm run build:css` if new utility classes appear (commit `src/styles/tailwind.css`).
- `npm run build:ext`; check every local `src`/`href` in `dist/views/*.html` resolves.
- Owner: load `dist/`, exercise the change, confirm parity.

## 3. Rollback

One item = one commit; revert it to restore the previous state.
