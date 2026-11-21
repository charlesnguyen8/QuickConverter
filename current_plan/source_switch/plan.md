# Switch source from a chapter onward

When a book's source breaks from some chapter on (e.g. a sangtacviet host stops at 2552),
the owner picks another source for that chapter onward and says which chapter of the new
source counts as that chapter. The chapter list then continues from the new source.

## How it works (agreed with the owner)

1. Novel page → **Switch source from chapter…** → enter the chapter (e.g. 2553) and paste
   the URL of the same book on another host.
2. The new source's chapter list is loaded. The owner **picks which of its chapters counts
   as 2553**. A best guess is pre-selected (a chapter whose title says 2553, or one whose
   title matches the current chapter 2552's next one), but the owner's pick decides.
3. The chapter list becomes chapters 1–2552 from the current source, then the picked
   chapter and everything after it from the new source, numbered 2553, 2554, ….
4. Download / Download All fetch chapters 2553+ from the new source. Sync Catalog keeps
   1–2552 from the current source and refreshes the new source from the picked chapter on,
   so new chapters keep appearing.
5. The book stays one book: same name list, reading position and saved chapters.

Decisions (owner: "go with your picks"):
- **Saved chapters ≥ the switch from the old source are kept**, marked "old source", with a
  one-tap "Re-download from new source".
- **Several switches** are allowed (e.g. from 3100 on, a third source). Each switch is a
  source plus a starting point, applied in chapter order.
- **Undo**: a switch can be removed; the list goes back to the earlier source from there.
- **Same site only for now**: the new source must be handled by the same provider
  (sangtacviet hosts), since that is the proven case.

## Data

On the book record (so Drive sync and backups carry it with the book):

```
sourceSwitches: [{ id, fromChapter, url, slug, startSlug, startTitle, createdAt }]
```

- `url` / `slug`: the new source's book URL and slug (e.g. `uukanshu-46924`).
- `startSlug`: the new source's chapter that counts as `fromChapter`; `startTitle` is shown
  in the UI and helps re-find it if the source renames slugs.
- Catalog entries from a switch carry `source: <switch id>` and `sourceSlug: <new slug>`;
  entries from the book's own source carry neither.

## Building the chapter list

`mergeSourceSwitches(mainList, switches, listsBySwitch, previous)` (pure, in storage.js):
- For each switch in `fromChapter` order: keep the current list's entries below
  `fromChapter`; append the switch's list from `startSlug` on, renumbered from
  `fromChapter`, tagged with `source` / `sourceSlug`.
- If a switch's list could not be loaded, or `startSlug` is gone from it, the entries that
  switch produced last time (`previous`) are kept, so a failed fetch never wipes chapters.

`guessSwitchStart(chapters, fromChapter)`: the first chapter whose title number
(`Thứ 2553 chương`, `Chương 2553:`, `Thứ 2,553 chương`, `第2553章`, `Chapter 2553`) equals
`fromChapter`; otherwise the chapter at position `fromChapter`, clamped to the list.

## Downloading

- A switched chapter's page is `item.url` (already the new source's URL); the page check
  expects `item.sourceSlug || novel.slug`.
- A saved chapter records the `source` it came from, so the list can mark chapters saved
  from the old source and offer re-downloading them.

## Phases (test-first, one commit each)

1. Pure helpers: title chapter numbers, `guessSwitchStart`, `mergeSourceSwitches`.
2. Storage: `previewSourceSwitch(novelId, url)`, `addSourceSwitch`, `removeSourceSwitch`;
   `syncNovelChapters` applies switches; downloads use `sourceSlug`; saved chapters record
   their source; sync / backup round trip.
3. UI: the Switch source dialog (chapter, URL, pick the start chapter with search and the
   pre-selected guess), the list of switches with Remove, "new source" badges, and "old
   source" marks with Re-download.
4. Docs.
