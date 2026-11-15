# Common lists

Reusable, hand-edited lists of names and glossary terms that are shared by every novel.
You keep several of them ("Wuxia names", "Common titles", …) and apply whichever ones fit
the novel you are reading. Applying a list copies its entries into that novel's own lists,
and translation then works as it does today.

## Decisions (agreed with the owner)

- **Many lists, not one.** Each common list has a name and its own entries.
- **Entries keep their type.** Each entry is a Name, Locked or Soft term. Applying a list puts
  each entry into the novel's matching tab.
- **Applying is a one-time copy.** Editing a common list later never changes novels; apply it
  again to bring in new entries.
- **Clashes ask, one at a time,** both when adding to a common list and when applying one to a
  novel: keep the existing translation or take the incoming one, with "same for the rest".
- **Select on all three tabs.** The ✓ "Include in translation prompt" button becomes
  **Select**, on Name List, Locked and Soft.
- **Managed in the drawer.** A **Common** tab in the Name List drawer, on both the novel page and
  the reader.

## Data

A new `commonLists` record, stored outside any novel:

```
{ id, name, createdAt, updatedAt,
  entries: [{ id, original, translation, kind: 'namelist' | 'locked' | 'soft', addedAt, updatedAt }] }
```

- An entry is identified by its Chinese `original` within one list. The same original with a
  different translation, or a different type, counts as a clash.
- StorageService: `getCommonLists`, `createCommonList(name)`, `renameCommonList`,
  `deleteCommonList` (confirm first), `addToCommonList(listId, entries)`, which returns
  added / unchanged / clashes, `updateCommonEntry`, `removeCommonEntry`, and
  `applyCommonList(listId, novelId)`, which returns new / unchanged / clashes and writes
  resolved entries through the existing name-list APIs.
- Google Drive sync carries common lists like the novels' lists (merged per list by updatedAt,
  deletions kept as tombstones).

## Drawer UI

1. **Select.** Every entry row on Name List, Locked and Soft has a Select toggle (≥40px tap
   target, `aria-pressed`). The selection is kept while you switch tabs. Each tab has
   **Select all**.
2. **Selection bar.** When anything is selected, a bar sticks to the bottom of the drawer:
   `N selected · Add to prompt · Add to common list · Clear`.
3. **Add to prompt** opens the Generate Translation Prompt panel with the selected terms, as
   today (now including Soft terms).
4. **Add to common list** opens a picker with your lists plus "New list…" (name field). Then
   comes the clash dialog for each clash, then a summary such as
   "Added 12 · 3 already there · 2 replaced".
5. **Common tab.**
   - It lists your common lists: name, entry count, last edited, and **New list**.
   - Opening a list shows its entries with Name / Locked / Soft filter chips and search, plus
     add, edit and delete for each entry, **Rename** and **Delete list**.
   - **Apply to this novel** first shows a preview ("20 new · 5 already the same · 3 clashes"),
     then the clash dialog, then copies the entries into the novel's tabs and shows a summary.

## Phases (test-first, one commit each)

1. Storage and sync for common lists (library-sync / drive-sync tests).
2. Select toggle on all three tabs, the selection bar, and Add to prompt including Soft
   (component tests; the old ✓ tests are repointed to Select, rule 2b).
3. Add to common list: list picker, new list, clash dialog, summary.
4. Common tab: browse, edit and rename lists; Apply to this novel with preview and clashes.
5. Docs: context.md, README.
