# current_plan.md

## Plan: Name List scalability & robustness

**Goal:** make the novel name list hold up at **thousands of entries** across reader
highlighting, translation tokenization, storage writes, and the drawer UI — without changing
observable behavior.

**Background / where we are:** the shared trie matcher already landed
(`src/services/name-matcher.js`, used by `splitByNames` and `tokenizeSource`; the 500-name cap
and the `N`-full-text-scan tokenizer are gone). The items below are the remaining scalability
concerns for the name list.

**Rule of engagement:** one item at a time to completion.
`npm test` green (test-first where behavior changes) → `npm run build:css` if new utility classes
→ `npm run build:ext` → owner loads `dist/` for parity → commit per item so each is
independently revertible. Report any test change and why (owner rules in `AGENTS.md`).

**Related docs:** `context.md`, `AGENTS.md`, `nice_to_have_plan.md`.

---

## Status

- Prior work (React migration M1–M8, name-list source/rename/tokenize features, trie matcher) is
  **complete and committed**.
- This plan tracks **NL-1 … NL-10** below; **NL-4 moved to `nice_to_have_plan.md`** (conditional).
- Done: **NL-1** (empty-translation guard), **NL-2** (dedicated name-list record), **NL-3** (drawer
  virtualization), **NL-9** (load-site contract test). Remaining: NL-5, NL-6, NL-7, NL-8, NL-10.

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

### NL-2 — Move `nameList` off the inline novel record  *(storage, bigger)* — **done**
`novel.nameList` was inline, so every `updateNovel` / `saveNameList` / `markNameSeen` rewrote the
whole array. Names now live in a **dedicated record in the same `novels` store**, keyed
`namelist::<novelId>` (`{ id, owner, list }`) — no schema/version bump, and still readable from the
service worker (unlike a preference, which isn't available in a worker).
- `getNameList`/`saveNameList` read/write the record; `getNovelById` attaches `nameList` (so
  `ReaderChapter`/`NovelHero`/tokenization are unchanged); `getManagedNovels` filters the records
  out; `updateNovel` routes any `nameList` update to `saveNameList` and never stores it inline.
- Legacy inline lists are migrated lazily on first read (write record, strip the inline field).
- Backup format is unchanged: `exportAll` re-attaches lists onto exported novels; `importAll`
  moves any inline `nameList` into the record form.
- Verify: `npm test` (name-list 20/20, backup/cloud-sync/reader all green), `build:ext`.

### NL-3 — Virtualize the Name List drawer  *(UI, when felt)* — **done**
`sortAndFilter` copies+sorts every render and every entry rendered a row with handlers; thousands
of rows would jank. The list now renders only the visible window plus overscan. A pure
`computeVirtualWindow(total, scrollTop, viewportHeight, rowHeight, overscan)` lives in
`nameListSource.js`; `NameListDrawer` tracks `scrollTop`/viewport (ResizeObserver + window resize),
renders `filtered.slice(start, end)` with top/bottom spacers, and uses fixed-height single-line rows
(truncated) of `ROW_HEIGHT`. Virtualization is skipped while inline-editing a row (its editor is
taller). Search/sort reset the scroll; "open + scroll to a name" scrolls by index math
(`index * ROW_HEIGHT` centred) when virtualized, else keeps `scrollIntoView`.
- Touches: `src/components/react/novel/NameListDrawer.jsx`, `.../nameListSource.js`.
- Tests: `computeVirtualWindow` unit cases in `components.test.js`.

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
