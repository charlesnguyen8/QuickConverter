# sangtacviet: how a chapter download succeeds or fails

**Status (2026-10-22):** findings from real pages; the classifier is built (see Built, at the end). Not yet checked in the extension or on the phone.

Samples were taken on the qidian book `qidian/1/1047557032` ("Uchiha đỏ thạch hành trình"), in the
owner's Chrome (logged in) and in a Chromium the site does not trust (the Claude app's browser).
The site's own reader script (inline on every chapter page) is the source for the response codes.

## How the site loads a chapter

1. The chapter page loads a loader script (`stv.readinit.js`, obfuscated). It makes a per-chapter
   token and POSTs `/index.php?bookid=…&h=…&c=…&ngmar=readc&sajax=readchapter&sty=1&exts=…`.
2. The JSON reply has a `code`:
   - `"0"`: success. The text goes into `#maincontent`, which is then **renamed**
     `cld-<bookid>-<chapterid>`. Each word is an `<i … t="<Chinese>">` tag; the first line is a
     site notice in a `<span>` ("@Bạn đang đọc bản lưu trong hệ thống"), which our extractor drops.
   - Anything else goes to `handlingReadException(x)`:
     - `12`: no login session: `alert(err)`, then the login box.
     - `13`: the login box.
     - `7`: reload, after `x.time` ms if given (seen as `{"code":7,"time":…}` when the loader's
       handshake has not happened).
     - `21`: Google captcha.
     - `15`: redirect to `x.url`; `18`: open `x.url`; `19`: `alert(err)` and open `x.url`.
     - `101`: comic.
     - `5`: `alert(err)` only; the spinner stays.
     - any other: `alert(err)` and `#maincontent` gets the message (the box is **not** renamed).
3. The page also: reloads after a 5xx; for non-qidian books shows "Tải quá thời gian, vui lòng tải
   lại trang." after 20 s; for qidian (and zongheng, faloo, biquge, jjwxc, 69shu, sfacg) adds a
   "Nội dung không đầy đủ?, nhấp để hệ thống tải lại." button when the loaded text has fewer than
   150 word tags and is under 150 characters.

## What we saw

| Case | Where | Result |
|---|---|---|
| Normal chapter (Ch. 1–4) | owner's Chrome | Loads by itself in 1.3–1.8 s (no tap, no language picker); `cld-…` box with 768–843 word tags. Four chapters back to back: no throttling. |
| Normal chapter | untrusted Chromium | First visit: a language picker ("Tùy chọn") and "Nhấp vào để tải chương…"; the loader never runs, nothing loads. Calling the endpoint directly: `code 7` (+`time`), then `code 5` "Lỗi không xác định, vui lòng thử lại sau, mã báo lỗi:4008." |
| Endpoint called for another chapter than the open page | owner's Chrome | `code 5`, "…mã báo lỗi:4008." (the token is per chapter). |
| VIP chapter (Ch. 60) | owner's Chrome, logged in | Alert and `#maincontent`: "Đây là chương vip của qidian, chưa thể tải chương này. Ghi chú về chương này: Qidian vừa nâng cấp bảo mật, nhiều truyện không thể tải được, xin chờ giải pháp." |
| Chapter id that does not exist | owner's Chrome | Alert and `#maincontent`: "Hệ thống không thể tải chương này do bạn mở 1 chương không tồn tại, hãy thử cập nhật danh sách chương trước." |
| App site window (from earlier) | Android WebView | Alert "Lỗi không xác định, vui lòng thử lại sau, mã báo lỗi: 4005". |

## What this means for us

- **A site message is never saved as a chapter**: errors stay in `#maincontent`; our extractor only
  reads a `cld-…` box with `<i t>` tags. Keep it that way (a test should pin it).
- **Today every failure looks like "the chapter did not load, log in"** after a 20 s wait, and the
  alert pop-up can freeze a background tab. Instead the page script should read the outcome
  directly:
  - catch `window.alert` in the download tab (the content script runs before the site's scripts,
    so it can replace it first) and report the message;
  - read `#maincontent` when it holds a message.
- **Classify** each outcome so bulk download knows what to do:

  | Kind | Signals | Queue action |
  |---|---|---|
  | saved | `cld-…` box with enough Chinese | save |
  | skip | "chương vip … chưa thể tải", "chương không tồn tại" | mark the chapter, go on (the missing case suggests Sync Catalog) |
  | needs you | login box (12/13), captcha (21), language picker / "Nhấp vào để tải chương" that never starts | wait for the user (Show page) |
  | retry later | code 7 / reload, 5xx, "Tải quá thời gian", 4008 (token) once | back off and retry, then needs you |
  | blocked | 4005 / 4008 repeatedly ("Lỗi không xác định … mã báo lỗi:400x") | stop: this browser is not trusted (the app's case) |
  | incomplete | `cld-…` box with < 150 word tags or the "Nội dung không đầy đủ?" button | retry once, then needs you |

- **VIP chapters** are flagged in the chapter list (`vip`). Qidian VIP chapters currently cannot be
  loaded at all ("Qidian vừa nâng cấp bảo mật"), even logged in, so bulk download should skip them
  up front instead of opening each one.
- **The app's 4005** is the loader refusing the WebView, not a login problem. The site trusts real
  Chrome; the app needs its site window to pass the loader (brand/UA already spoofed; something
  else in the WebView still differs) before sangtacviet can work there.
- Not seen yet: real throttling (four fast pages were fine), the captcha, a VIP chapter of a
  non-qidian source.

## Built

- `SangtacvietProvider.classifyPage({ document, alerts, final })` returns `{ outcome, reason }` or
  null: skip (VIP the site cannot load; chapter does not exist, with a Sync Catalog hint), blocked
  (`mã báo lỗi 400x`), retry ("Tải quá thời gian"), and once the wait is over needs-user (an
  unknown site alert; the "Nhấp vào để tải chương" prompt). A loaded `cld-…` box is never a failure.
- The page script (`site-page.js`) asks it on every poll and posts `{ type: 'failed', outcome, reason }`
  right away instead of a bare "empty" after 20 s. It reads site alerts from `<html data-qc-alerts>`
  and reports the chapter URL without the download marker.
- Extension: download tabs open the chapter with `#qc-download`; `extension/scripts/page-alerts.js`
  (world MAIN, document_start, sangtacviet chapter pages) records alerts there instead of showing
  them, so a hidden tab never freezes. Tabs the user opens keep the site's alerts.
- `PageSession`: needs-user waits for the user (Show page); skip, blocked and retry end the download
  with an error carrying `outcome`.
- Queue: skip records the chapter in `state.skipped` (last 50, with the reason) and goes on to the
  next chapter at once; blocked pauses the queue without spending retries; retry uses the normal
  retry path. The dock lists skipped chapters (also after the queue is done) with Dismiss
  (`clearSkipped`, forwarded to the worker as `QUEUE_CLEAR_SKIPPED`).

Still open: skipping VIP chapters up front from the chapter list's `vip` flag; the incomplete-text
case (< 150 words); site alerts in the app's site window (the WebView handles them natively, so
only the message left in `#maincontent` is read there).

