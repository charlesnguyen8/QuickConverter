# nice_to_have_plan.md

Items that are **not required** and only worth doing if a real need shows up. Moved out of
`current_plan.md` so the active plan stays focused.

Reference: `current_plan.md` (active NL items).

---

## NL-4 — Trie worst case → Aho–Corasick  *(conditional: only if profiling shows it)*

**Problem.** The shared matcher (`src/services/name-matcher.js`) is a character **trie** scanned
once per text. Typical cost is ~linear in the text, but the worst case is `O(T × L)` (`L` = longest
name): text that shares long prefixes with names (e.g. long CJK runs) re-walks the trie at each
position. Aho–Corasick removes that worst case with `O(T + matches)` by adding failure and output
links (it never needs to re-walk shared prefixes).

**Scope.** Self-contained: only `src/services/name-matcher.js` changes. No new files/submodules.
The trie/automaton is private inside that file.

**API is frozen** — the swap must keep:
- `NameMatcher.createMatcher(entries, { field, caseSensitive })` → `{ findAll(text), replaceAll(text, fn) }`
  and `NameMatcher.isWordChar`.
- Match objects `{ index, length, id, value, original, translation }`. Highlight uses
  `index`/`length`/`id`/`original`; tokenize uses `id`/`value`.
- Whole-word boundaries, longest-match-on-overlap, case-sensitivity flags, and the global
  registration / load sites (guarded by NL-9).

Consumers (`nameListSource.js`, `storage.js`) call only the public API and need **no changes**.

**When to do it.** Only with evidence: a measured slow case on a large list with shared-prefix text.
Otherwise the trie is fine and simpler to keep correct.

**Verification if done:** existing matcher tests stay green; add a shared-prefix stress case; measure
before/after (build + test).
