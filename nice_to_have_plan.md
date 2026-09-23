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

---

## NL-6 — Case-folding edges  *(edge, likely no-op)*

**Problem.** Case-insensitive highlighting lowercases per character (`value.toLowerCase()` for the
trie key, `ch.toLowerCase()` while scanning). A few characters fold awkwardly: some change **length**
(Turkish `İ` → `i` + combining dot; Greek final sigma), locale-specific pairs exist (Turkish
dotted/dotless I), and Unicode normalization differs ("é" precomposed vs `e` + accent) so visually
identical names may not match. In the length-changing case the trie (built from the whole lowercased
name) stores the fold as multiple nodes while the scanner looks it up as one key, so the name simply
won't highlight.

**Impact.** Essentially zero for normal novel data (English/Vietnamese/CJK). Only names with Turkish
dotted-I, Greek final sigma, or mixed composed/decomposed accents are affected.

**If ever done.** Normalize (NFC) both sides and/or use a consistent fold; note that normalization
changes lengths, so offsets would need mapping to keep `slice(index, index+length)` correct. JS has no
full Unicode casefold, so this is fiddly for a case nobody hits.

**Recommendation.** Leave the naive fold (current behavior is correct for real data).

---

## NL-10 — Batch renames  *(perf, optional)*

**Problem.** `StorageService.replaceInChapters(novelId, search, replacement)` loads all of the novel's
chapters (`getNovelChapters` reads every chapter's full text), scans each for the old translated name,
and writes back the ones that changed — **one full pass per rename**. Renaming many names in a row
(bulk-fixing a glossary) means N full passes over the whole library and repeated DB reads.

**If done.** A batched form, e.g. `replaceInChapters(novelId, pairs)` with
`pairs = [{ search, replacement }]`: read each chapter once, apply all pairs in memory, write each
changed chapter once (`20 names × all chapters` → `1 pass × all chapters with 20 replacements`). Needs
ordering rules for interacting renames (a→b and b→c), plus a UI to collect pending renames (a list +
Apply) since the current flow renames one entry at a time, each with its own confirm.

**Lighter alternative.** Stream chapters with an IndexedDB cursor instead of `getNovelChapters`, which
loads every chapter's full text at once — cuts the memory spike without changing the per-rename model.

**Recommendation.** Park until bulk-fixing glossaries is a real habit; a single rename over a large
library is a one-time pass.
