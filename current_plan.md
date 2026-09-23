# current_plan.md

## Plan: Name List consistency check

**Goal:** surface inconsistent glossary entries — the same source sub-name translated two different
ways (e.g. `Byuk-ho = Bich Ho` but `Jin Byuk-ho = Tran Bich Hao`) — and let the user fix them. **No
automatic text changes**; it only flags and prompts.

**Rule of engagement:** `npm test` green (test-first where behavior changes) → `npm run build:css`
if new utility classes → `npm run build:ext` → owner loads `dist/` → commit.

**Related docs:** `context.md`, `AGENTS.md`, `nice_to_have_plan.md`.

---

## The check

A **conflict** is a pair of entries where:
- one `original` is a **prefix or suffix** of the other at a word boundary (`Byuk-ho` ⊂
  `Jin Byuk-ho`, `Seokyung` ⊂ `Seokyung city`; a shared given/part used alone), and
- the shorter's `translation` is **not** contained in the longer's.

Affix-only (prefix/suffix) deliberately avoids false positives from parenthetical glosses or
mid-string words (e.g. `Earth` inside `Cheonji (Heaven Earth) Heart Method` is neither, so it isn't
flagged).

Containment comparison has a **toggle**:
- **Strict** — exact (case- and accent-sensitive).
- **Forgiving** — lowercase + strip diacritics before comparing (`Bích Hào` ≡ `bich hao`).

The toggle is remembered in a preference (`quickconverter_namelist_strict_conflicts`); default
**forgiving**.

## Performance approach (decided)

- **No pairwise O(N²).** Build one trie matcher over all `original` names (existing
  `src/services/name-matcher.js`) and, for each name, run the matcher **inside that name's text** to
  find the names it contains. Cost ≈ `O(total name characters)`; only real overlaps get compared.
- **Memoized** on the entries + toggle (recompute only when they change).
- **Deferred** to the next frame (`requestAnimationFrame`) so opening the drawer never blocks the
  slide-in.
- Dedupe pairs; guard against pathological nesting.

## UX

- Conflicting (longer) rows get a **rose "⚠ Inconsistent" pill** (distinct from the amber "New").
- Clicking it opens an in-app dialog: *"‘Jin Byuk-ho’ is ‘Tran Bich Hao’ but ‘Byuk-ho’ is ‘Bich Ho’
  — make them consistent?"* → **Edit entry** (opens the existing inline editor) / **Keep as-is**
  (dismiss for this session).
- The `Strict/Forgiving` toggle sits in the search/sort bar.
- Still flag-only: saving a changed translation is what (optionally) triggers the existing rename
  cascade; nothing is rewritten automatically.

## Files

- `src/components/react/novel/nameListSource.js` — pure `findNameConflicts(entries, { strict })`.
- `src/components/react/novel/NameListDrawer.jsx` — toggle, deferred/memoized compute, flag + dialog.
- `tests/components.test.js` — `findNameConflicts` cases (strict/forgiving, contained vs not).

## Verification

- `npm test` (13 suites) green; `npm run build:css` if classes change; `npm run build:ext`.
- Manual: two overlapping entries with mismatched translations → flagged; contained pair → not
  flagged; toggle changes flagging; Fix opens the editor; Keep dismisses.
