# Drive sync v3 — fine-grained, name-list aware (plan)

**Status (2026-10-19):** planned, not started. Current sync is v2 (released in v1.2.1).

**Goal:** a sync transfers only the small piece that changed, never loses name-list edits made on
two devices, and does not read the whole library on the device to find out what changed.

**Rules:** same as the rest of the repo (`AGENTS.md`): test-first, never weaken assertions, report
test changes in commits. Build on the two-device harness (`tests/helpers/fake-library.js`,
`tests/drive-sync.test.js`) and the merge tests (`tests/library-sync.test.js`).

---

## Where v2 stands

- `CloudSyncService.sync()` (`src/services/cloud-sync.js`): Drive's appDataFolder holds one file
  per book (`quickconverter-book-<id>.json`: book record with its name lists inline + all its
  chapters) and `quickconverter-index.json` (per-book fingerprint from change times, deletion
  markers, settings). A sync reads the index and downloads/uploads only books whose fingerprint
  differs. The old single `quickconverter-backup.json` is merged in on the first sync.
- `StorageService.mergeLibraries` / `applySync` (`src/services/storage.js`): newer book and chapter
  wins; reading position by its own time; **each name list (Name List, Locked, Soft) as a whole,
  newer list wins**; deletion markers for books and chapters.
- `AutoSync` (`src/services/auto-sync.js`): syncs on open, ~30 s after changes, on return after a
  minute, every 15 min.

## Problems

1. **Name-list conflicts lose data.** Lists merge as a whole. If the phone adds names (a translated
   chapter captures them) while the PC edits a name, one device's whole list replaces the other's.
2. **A book is one file.** Any change (one new chapter, one name, the reading position) re-uploads
   the book with all its chapters, and the other device downloads all of it again. A 900-chapter
   book means megabytes for one chapter.
3. **The device reads everything to sync.** `sync()` starts with `exportAll()`: every book and every
   chapter's text is loaded to compute fingerprints, even when nothing changed. Fine at today's
   size, slow and memory-hungry with tens of thousands of chapters, and it runs every ~30 s after
   changes.

---

## Plan

### Step 1 — Name lists merge per entry (fixes data loss; do first)

- Every entry gets `updatedAt`: set by `addNameEntry`/`addNameEntries`, `updateNameEntry`,
  `_addCapturedGlossary` and bulk `saveNameList` for entries that changed. Entries without it count
  as time 0 (old).
- Deleting an entry (`deleteNameEntry`, bulk replace dropping entries) leaves a marker
  `{ [novelId]: { [kind]: { [entryId]: time } } }` in the sync deletion markers
  (`quickconverter_sync_deleted`, next to `novels`/`chapters`).
- Merge per list: union by entry `id`; same id on both sides → newer `updatedAt` wins; an entry is
  dropped when a marker for it is newer than the entry; the same name added on both devices
  (same `original`, different ids) collapses into one, keeping the newer edit (reuse the
  `dedupeNameList` rules for which fields win).
- Moving a name between Locked and Soft (`moveNameEntry`) = marker in the source list + entry in
  the target list, so it syncs as a move.
- The list record keeps its `updatedAt` (max of its entries and markers) for fingerprints.
- **Tests:** add/edit/delete on two devices between syncs keeps both sides' changes; a deletion on
  one device removes the entry on the other; the same name added on both ends as one entry; a move
  Locked→Soft arrives as a move; old entries without times merge as a union.

### Step 2 — Smaller Drive pieces (fixes transfer size)

Drive layout v3 (all in appDataFolder):

| File | Holds | Changes when |
|---|---|---|
| `quickconverter-index.json` | per book: fingerprint of each piece + **reading position**; deletion markers; settings | every sync that changed something |
| `qc-book-<id>.json` | book record without lists and without `lastRead` (title, cover, catalog `chapterList`, settings) | Sync Catalog, book settings |
| `qc-names-<id>-<kind>.json` | one name list (`namelist`, `locked`, `soft`) | a name is added/edited/removed |
| `qc-chapters-<id>-<n>.json` | chapters `n*50 … n*50+49` (by position in the book's catalog order, falling back to chapter number) | a chapter in that batch is saved, translated or deleted |

- Reading position lives in the index entry (tiny, changes most often): reading on the phone
  uploads only the index.
- The index stores one fingerprint per piece (`book`, `names.namelist`, `names.locked`,
  `names.soft`, `chapters[n]`); a sync transfers exactly the pieces whose fingerprint differs.
- Index writes stay conditional (only when something changed). Pieces of a deleted book are
  deleted; empty batches are deleted.
- Batch size 50 is a constant; revisit if chapters are unusually large.
- **Tests (two devices, fake Drive):** a new chapter transfers one batch file + index; a reading
  position change transfers the index only; a new name transfers that list file + index; Sync
  Catalog transfers the book file + index; nothing changed → index read, nothing written; a book
  delete removes all its pieces.

### Step 3 — Sync without reading the whole library (fixes device cost)

- A per-book summary record in the `novels` store (e.g. `sync::<novelId>`): book `updatedAt`,
  `lastRead.updatedAt`, each list's time, and `{ chapterId: updatedAt }` for every chapter (no
  text). Kept current by `addNovel`, `updateNovel`, `setLastRead`, name-list writes, `saveChapter`,
  `updateChapter`, `deleteChapter`, `deleteNovel`, `applySync` and `importAll`.
- `sync()` reads the summaries (and the index), computes piece fingerprints from them, and loads
  from IndexedDB only the pieces that changed (one book record, one list, or one batch of chapters
  by id) instead of calling `exportAll()`.
- Missing summaries (existing libraries) are built once from a full read on the first v3 sync.
- `exportAll()` stays for backup files and Replace Drive copy.
- **Tests:** summaries follow every write path (including sync-applied ones); a sync with nothing
  changed reads no chapter records; a sync after one new chapter reads only that batch.

### Migration (with step 2)

- First v3 sync on a Drive with v2 files (`quickconverter-book-*.json`): read the v2 index and
  book files, merge as today, write the v3 pieces and a v3 index (`version: 3`), then delete the
  v2 book files. The old `quickconverter-backup.json` path keeps working as in v2.
- A device still on v2 must not overwrite a v3 Drive: v2 reads `version` and stops with "Update
  QuickConverter to sync" if it is newer than it knows. (Ship this guard in a small release before
  the v3 layout goes out.)
- Replace Drive copy / Replace this device move to the v3 layout.

## Done when

- Two devices editing the same book's names between syncs keep every change.
- Saving one chapter in a 900-chapter book transfers about one 50-chapter batch.
- A sync with nothing changed reads only the index on Drive and only the summaries on the device.
- `npm test` green; extension and app both sync against the same Drive data; checked on the phone
  and in the extension by the owner.
