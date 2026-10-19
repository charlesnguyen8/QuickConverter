# Android Phase 2 — Sources (plan)

**Goal:** in the Capacitor app, adding a book, syncing its catalog and saving chapters works for
wetriedtls, nkwwlkj and sangtacviet. Parent plan: `overall_plan.md` §3, §6 Phase 2.

## What we found (2026-10-18)

- The app's `fetch` already goes through CapacitorHttp: a GET to another site is rewritten to
  `/_capacitor_http_interceptor_?u=…` and fetched natively (no CORS, CapacitorCookies). `AbortSignal`
  still works on that path.
- **wetriedtls already works over it.** Checked with `dist-app` served by a small emulator of that
  proxy path: series metadata (893 chapters, cover), catalog (889 entries from the API), and queued
  downloads of chapters 1–2 (22 kB / 33 kB of text) saved to IndexedDB with no extension present.
  The queue runs in the page and resumes a cut-off task on the next page load.
- **Gap:** a book's cover, title and total only refresh through `syncNovelMetadata`, which only the
  popup and the content script call. Neither exists in the app, so "Sync Catalog" never fixes a
  missing cover or a stale total there.
- `fetch` cannot set `Referer` (forbidden header), and the app has no declarativeNetRequest, so the
  sangtacviet chapter list needs a native request with the header set.
- nkwwlkj and sangtacviet chapters need the site's own page (scripts, login, coins, image chapters):
  only an embedded WebView can do that.

## Steps

1. **wetriedtls (this session).** "Sync Catalog" also refreshes the book's metadata (cover, title,
   total), so the app gets what the popup/content script did in the extension. Test-first in the
   storage/novel suites. APK checked by the owner: add a wetriedtls book, sync, download a few
   chapters, leave the page mid-download and come back.
   - **Built (2026-10-18):** `StorageService.syncNovel` (metadata, then catalog); the novel page's
     Sync Catalog uses it and the hero shows the refreshed book live (it used to load the book once).
     A sync takes ~15 s because the wetriedtls chapter API takes ~11 s for 889 entries even from a
     plain HTTP client. Released as v1.1.2; the owner confirmed it works on the phone.
2. **sangtacviet catalog.** `Platform.http.get(url, { headers })`: in the app it calls the native
   `CapacitorHttp.request` (which may set `Referer`); in the extension it is plain `fetch` (the
   existing DNR rule adds the header). The provider's chapter-list request goes through it.
3. **SiteBrowser** — an embedded WebView plugin (choice below), exposed as `Platform.siteBrowser`:
   `open(url, { visible })`, run our extraction script in the page, return
   `{ rawText | image bytes }`, `show()` when a login or Cloudflare check is needed, `close()`.
   Cookies are Android's app-wide CookieManager, shared with native HTTP, so login state and coins
   (`fetchLoginState`) work once the user signs in inside it.
4. **Open to save / Save next N in the app.** `StorageService.openChapterInBackground` uses
   SiteBrowser when there are no tabs; "Save next N" runs it one chapter at a time. nkwwlkj image
   chapters: capture in the site WebView (`captureChapterImage`), OCR in the app (speed measured in
   Phase 3, risk 4).
5. **sangtacviet chapters** through SiteBrowser (Chinese text after the page's own scripts run).

**Built (2026-10-18, steps 2–5, waiting on the phone check):** owner chose the custom Java plugin.
- `Platform.http.getText` (native `CapacitorHttp.request`); the sangtacviet chapter list sends
  `Referer: https://sangtacviet.com/` through it in the app.
- `SiteBrowserPlugin.java`: one WebView in an overlay with a host title and Close; hidden = drawn
  behind the app's WebView (still renders and runs scripts), shown = brought to the front; Back
  goes back in the site, then closes. Runs the page script on every page load; the page posts JSON
  through `QCSiteBrowser.post`. App-wide CookieManager, `; wv` dropped from the user agent.
- `src/services/site-page.js` (runs in the site page with the providers + registry) reports
  `chapter` / `empty` / `image` / `other`. `src/services/site-save.js` opens hidden, saves a
  `chapter` with `saveOpenedChapter` (syncing the catalog once for a new chapter), shows the page for
  anything else or after 45 s, one page at a time. `openChapterInBackground` uses it in the app, and
  the login banner's Log in opens the site in it and re-checks the login when closed.
- v1.1.4: nkwwlkj sends any Android user agent to its mobile site (m.cddaoyue.cn), so the app's
  native requests and the SiteBrowser present as desktop Chrome (`Platform.desktopUserAgent`).
- Image (paid) chapters: the page script captures the image (`captureChapterImage`, retried until
  the site has drawn it) and posts it as base64; SiteSave closes the site, runs OCR in the app page
  (`window.QCOcr`, installed by the novel and reader entries, lazy-loads `ocrEngine.js`) and saves
  with `saveRecognizedChapter` (untranslated, marked paid). A bottom message reports reading /
  saving / saved / errors. Released as v1.1.5; on the owner's Galaxy S23 it works and reads a 36,000-character
  chapter image in about 10–11 s.
  "Save next N" does not exist in the extension either; it stays a later idea.

**Done when:** for all three sites the owner can add a book, sync its catalog and save chapters on
the phone; `npm test` green; `build:ext` extension unchanged.

## SiteBrowser choice

| | Custom Java plugin `SiteBrowserPlugin` (recommended) | `cordova-plugin-inappbrowser` |
|---|---|---|
| Script injection | `evaluateJavascript` + a JS interface that hands back results (async OK) | `executeScript`, sync results only, so polling |
| Hidden load, show on demand | Yes, our own overlay/dialog | `hidden=yes` + `show()` |
| Back button, toolbar, dark UI | Ours, matches the app | Its own dated toolbar |
| Image capture bytes | Base64 through the JS interface | Base64 string through `executeScript` |
| Cookies with native HTTP | Shared CookieManager | Shared CookieManager |
| Effort / upkeep | ~300 lines Java, like `GoogleAuthPlugin`/`FileSaverPlugin` | Small JS glue; a Cordova plugin to keep compatible with Capacitor 8 |
