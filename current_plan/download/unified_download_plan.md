# One Download for every site and platform (plan)

**Status (2026-10-20):** approved by the owner. Phases 1–2 built (phase 2 not yet checked on the phone); phases 3–5 to do.

**Goal:** a single `downloadChapter` that the queue calls for every site. Everything around it
(queue, Download All, cooldowns, retries, AI translation, progress dock, background
notification, sync afterwards) exists once. Only *how the chapter's source text is obtained*
differs, and that part is implemented per platform (Chrome extension / Android app).

**Owner decisions (2026-10-20):**
- nkwwlkj and sangtacviet go through the same queue; "Open to save" stops being a separate
  feature — its button becomes Download (enqueue).
- When a page-based chapter needs the user (login, Cloudflare check, a paid chapter not
  unlocked), the queue **pauses and shows the page**, and resumes when the chapter saves or the
  user closes the page.
- Paid image chapters are read with OCR inside the download and **translated like text
  chapters** when the book's translation is on.

**Rules:** as in `AGENTS.md`: test-first, behavior-preserving refactors locked by
characterization tests, never weaken assertions, report test changes in commits.

---

## Today: three separate paths

| Path | Used by | Where it lives | Queue / translation / retry |
|---|---|---|---|
| HTTP fetch | wetriedtls | `StorageService.downloadChapter` → `provider.fetchChapterContent` | yes |
| Open to save | nkwwlkj, sangtacviet | extension: `OPEN_TO_SAVE` → background tab (`open-to-save.js`) → `content.js` → `SAVE_CHAPTER` → `saveOpenedChapter`; app: `site-save.js` → SiteBrowser → `site-page.js` → `saveOpenedChapter` | no (raw save only) |
| Image chapter OCR | nkwwlkj paid chapters | extension: `content.js` → OCR panel iframe (`OcrPanelApp`, `ocrSave.js`) → `saveRecognizedChapter`; app: `site-save.js` → `window.QCOcr` → `saveRecognizedChapter` | no queue; translation only in the extension panel |

Open-page providers make `fetchChapterContent` throw ("cannot be downloaded in the background"),
`supportsBulkDownload: false` hides Download All, and the queue special-cases that error.

---

## Target design

### 1. `downloadChapter` is the only download

```
StorageService.downloadChapter(novelId, chapterNumber, options)
  1. resolve book, provider, catalog item (as today)
  2. source = await ChapterSources.get(novel, provider, catalogItem, { signal, onProgress, onNeedsUser })
        -> { kind: 'text', title, rawText }   or   { kind: 'image', image: { bytes, mimeType, width, height } }
  3. image -> text: Platform.ocr.recognize(bytes, mimeType) (progress phase 'reading')
  4. translation (existing _translateRaw path, now also for OCR text; ocrSource flag kept)
  5. save (one save routine: the current downloadChapter save plus saveRecognizedChapter's
     "image chapter = paid" marking), notifyChapterSaved, library-changed (sync)
```

`saveOpenedChapter` and `saveRecognizedChapter` become thin callers of step 4–5 (or are removed
once nothing else calls them).

### 2. Chapter sources: the only platform-specific part

`ChapterSources.get` picks by the provider's `fetchMode`:

- `'http'` (wetriedtls): `provider.fetchChapterContent` — same on every platform (native HTTP in
  the app already).
- `'page'` (nkwwlkj, sangtacviet): `Platform.pageSource.fetch(url, { userAgent, signal, onNeedsUser })`
  opens the chapter page, runs the existing page extraction (`site-page.js` logic: providers +
  `extractChapterInfo`, image capture), and resolves with text or image.
  - **App:** SiteBrowser + page script (today's `site-save.js` session, minus the saving).
  - **Extension:** background tab opened by the service worker (today's `open-to-save` tracker),
    the content script posts the extracted result back to the waiting fetch instead of saving
    it; the tab closes after the result.
- Both implementations report **needs-user** (empty page after the wait, login/other page, a
  paid chapter not unlocked) through `onNeedsUser`, and keep waiting for the page to yield the
  chapter.

`supportsBulkDownload` goes away; every provider is queueable.

### 3. OCR is a platform service

`Platform.ocr.recognize(bytes, mimeType) -> text`:
- **App:** the in-page engine (`ocrEngine.js`, today's `window.QCOcr`).
- **Extension:** the queue runs in the service worker, which has no DOM for the engine, so OCR
  runs in an **offscreen document** (`chrome.offscreen`, a new `views/ocr-offscreen.html` loading
  `ocrEngine.js`); the worker sends it the bytes and gets text back. Manifest gains the
  `offscreen` permission.
- The OCR panel stays only as a *reading* tool on the site (translate an image chapter you are
  looking at); saving from it goes through `downloadChapter` with the already-recognized text.

### 4. The queue gains one state: waiting for you

- On `onNeedsUser`, the active task's progress becomes `{ phase: 'needs-user', text: reason }`,
  the queue pauses after this task (no new tasks start), and the platform shows the page:
  app → SiteBrowser visible; extension → the tab is activated and its window focused.
- The task completes normally if the page then yields the chapter (queue resumes), or fails with
  "Closed before the chapter loaded" if the user closes the page (queue stays paused with that
  reason, like other errors that need the user).
- The dock shows "Waiting for you: log in to 独阅读" etc. with a **Show page** button.
- The background notification (app) says the same, so it is visible with the phone locked.

### 5. UI

- Chapter rows: one **Download** button for every site (was Open to save for nkwwlkj and
  sangtacviet). Paid/locked badges stay.
- Download All / Download next N available for every site; the per-site cooldown default for
  page sites starts higher (e.g. 20–40 s) since each chapter opens a real page.
- Reading a chapter on the site yourself (extension content script, Android share later) still
  saves it, through `downloadChapter` with a ready source (`options.source`), raw unless you
  enqueue it with translation.

---

## Phases

1. **One save pipeline (refactor, no behavior change).** Characterization tests for
   `downloadChapter`, `saveOpenedChapter`, `saveRecognizedChapter`; extract `ChapterSources`
   with the `'http'` source; `downloadChapter` accepts a ready `options.source`; the old save
   functions call the pipeline. All existing tests stay green.
   - **Built:** `StorageService._saveChapterFromSource(novel, n, source, options)` is the one
     translate-and-save pipeline; `source.origin` (`fetch` | `page` | `ocr`) carries the few
     differences that remain until phases 2–4 (title/URL choice, minimal record for untranslated
     page saves, paid marking and OCR flag for `ocr`, announcements for `page`/`ocr`, progress).
     `fetchChapterSource` is the http source (refuses `fetchMode: 'page'` providers);
     `downloadChapter` accepts `options.source`. `saveOpenedChapter` and `saveRecognizedChapter`
     call the pipeline. Locked by `tests/chapter-download.test.js` (7 characterization tests).
2. **Page source in the app.** `Platform.pageSource` from `site-save.js` (result instead of
   save), queue `needs-user` state and dock UI, Download button for page sites, Download All for
   every site. Two-device-style tests with a fake SiteBrowser.
   - **Built:** `SiteSave.fetchPage(url, { expect, onNeedsUser, signal })` returns the page's
     chapter (text, or an image chapter's picture) without saving; a different chapter, an empty
     page, another page or a silent page calls `onNeedsUser(reason)` and shows the page; closing it
     fails with "Closed before the chapter loaded." `Platform.pageSource` (app only) and
     `Platform.ocr` (the app's `QCOcr`). `fetchChapterSource` uses the page source for
     `fetchMode: 'page'` providers (nkwwlkj, sangtacviet) with the catalog URL; `downloadChapter`
     reads image sources with OCR (origin `ocr`: paid marking, translation). The queue passes
     `onNeedsUser` (progress phase `needs-user`, notification "Waiting for you: …"), pauses
     without backoff when the page is closed; the dock shows the reason and a Show page button.
     `ProviderRegistry.canBulkDownload` is true for page sites wherever a page source exists, so
     in the app they get Download / Download All and paid chapters get Download too. The
     extension is unchanged (Open to save) until phase 3. Checked in the app build in a browser
     with a fake site window: Download buttons, a chapter saved through the page, the
     waiting-for-you dock with Show page, and a wrong chapter refused.
3. **Page source in the extension.** Background-tab source in the service worker, content
   script result channel, tab activation on needs-user. Tests with fake `chrome.tabs` and content
   script messages.
4. **Image chapters.** `Platform.ocr` (app engine; extension offscreen document), OCR + translation
   in the pipeline, paid marking. OCR panel saving routed through `downloadChapter`.
5. **Remove the old paths.** `OPEN_TO_SAVE`/`SAVE_CHAPTER` messages, `site-save.js` sessions,
   `supportsBulkDownload`, the queue's "cannot be downloaded in the background" special case;
   update `context.md`, `AGENTS.md`, README.

Each phase ends with `npm test` green, `build:ext` and `build:app`, and an owner check on the
phone and in the extension.

## Open points to confirm while building

- **sangtacviet in the app** still gets error 4005 in the SiteBrowser (parked). With this design
  its downloads will stop at "needs you" on the phone; the extension works. Fine as is?
- **Coins:** queueing a paid nkwwlkj chapter you have not bought never buys it; it stops at
  needs-user. Should the queue skip such chapters in Download All instead of stopping?
- **Manual reading auto-save** (opening a chapter of a book in your library saves it): keep?
