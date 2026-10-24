# QuickConverter

An offline-first web novel reader, downloader and translator. It saves chapters from supported
sites into your browser, converts Chinese to Vietnamese with QuickTranslator-style dictionaries,
translates with DeepSeek or any OpenAI-compatible API, and lets you read everything offline.

It ships as a **Chrome extension** (this guide) and as an **Android app** (see
[Android app](#android-app)).

Supported sites:

| Site | What works |
|---|---|
| [wetriedtls.com](https://wetriedtls.com) | Add a book, sync its chapter list, download chapters in the background (one at a time, with optional AI translation) |
| [nkwwlkj.cn](https://www.nkwwlkj.cn) (独阅读) | Add a book, sync its chapter list, download chapters (each opens in a background tab), paid image chapters read with built-in OCR, login and coin balance shown |
| [sangtacviet.com](https://sangtacviet.com) | Add a book, sync its chapter list, download chapters in their original Chinese (each opens in a background tab) |

## Build the extension

You need [Git](https://git-scm.com/) and [Node.js](https://nodejs.org/) **20.19+ or 22.12+**
(npm comes with it). Any OS works.

```bash
git clone https://github.com/charlesnguyen8/QuickConverter.git
```

```bash
cd QuickConverter
```

```bash
npm install
```

```bash
npm run build:ext
```

The extension is built into the `dist/` folder. Run `npm run build:ext` again after every
`git pull` to pick up changes.

Optionally, check that everything works first:

```bash
npm test
```

## Load it in Chrome

1. Open `chrome://extensions` (Edge: `edge://extensions`, Brave: `brave://extensions`).
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and choose the `dist` folder inside the repository (not the repository
   itself).
4. Pin QuickConverter from the puzzle-piece menu so its icon stays in the toolbar.

After rebuilding, press the **reload** arrow on the QuickConverter card in `chrome://extensions`,
then refresh any open QuickConverter tabs and site pages.

## Use it

### Your library

Click the QuickConverter icon and choose **Library** (or open **Settings** from the popup). The
library lists your books with their download progress.

- **Add Book**: paste a book or chapter link from a supported site; QuickConverter shows the title,
  cover and chapter count before you add it. Visiting a supported book page also opens the popup,
  where you can add it with one click.
- Open a book to see its chapters. **Sync Catalog** refreshes the chapter list, cover and total.

### Save chapters

- Press **Download** on a chapter or **Download All**, on every site. Chapters download one at a
  time in the background (you can close the tab); the dock at the bottom shows the queue, and you
  can pause, cancel or retry.
- **Several books at once:** if another book is already downloading, you're asked whether to add
  the chapters to its queue or start a new queue. Queues run side by side, each with its own
  Pause, Clear and cooldown; two books on the same site take turns, so the site sees one reader. Turn on **DeepSeek Translation on Download** to save translated
  chapters instead of the raw text.
- **nkwwlkj and sangtacviet** only show chapters to a real browser, so each download opens the
  chapter in a background tab, which closes once the chapter is read. If the page needs you (a
  login, a check, a chapter you have not unlocked), the queue waits and brings the tab forward;
  the dock says **Waiting for you**. Simply reading a chapter of a book in your library also
  saves it.
  - nkwwlkj: log in on the site (the book page shows your login state and coins) to save chapters
    you have unlocked. Paid chapters are images: downloads read them with OCR (offline, a few
    seconds) and save the text, translated like any other chapter.
  - sangtacviet: chapters are saved in their original Chinese, ready for dictionary conversion.

### Read

Open any saved chapter. In the reader:

- **Aa** sets the theme, font, size, line spacing and width; you can also turn off swiping
  between chapters and keeping the screen on.
- **Dictionary conversion** (per book) converts Chinese chapters to Vietnamese with the bundled
  QuickTranslator dictionaries, offline. Tap a phrase to see its Hán Việt reading and Lạc Việt
  dictionary entry.
- **Name List** keeps the names for a book (and Locked/Soft glossaries for AI translation); names
  are highlighted in the text.
- The left/right arrow keys (or `[` and `]`) move between chapters; your last-read position is
  remembered per book.

### AI translation

In **Settings → DeepSeek AI**, choose a provider:

- **Official DeepSeek API**: paste your API key (from [platform.deepseek.com](https://platform.deepseek.com)).
  The balance and off-peak pricing are shown.
- **Custom API**: any OpenAI-compatible endpoint, for example a local server at
  `http://127.0.0.1:8000/v1`.

API keys stay on your computer and are never included in backups.

### Backup and sync

- **Settings → Storage & Quota → Backup File** saves the whole library (books, chapters, name lists,
  reading positions, settings) to a `.json` file, or loads one (merged in, or replacing
  everything).
- **Google Drive Sync** keeps the extension and the Android app in step: it merges both sides,
  keeping the newer version of each book, chapter, name list and reading position, and syncs by
  itself when the library opens, after changes and every 15 minutes. Data goes to the app's
  private folder in your Drive.

  **Note for your own build:** Drive sign-in only works for the extension ID registered with the
  Google OAuth client in `extension/manifest.json`. A copy you load unpacked gets a different ID,
  so to use Drive sync create your own OAuth client: in the
  [Google Cloud Console](https://console.cloud.google.com/apis/credentials) enable the Google Drive
  API, create an OAuth client ID of type **Chrome extension** with your extension's ID (shown on
  its card in `chrome://extensions`), put that client ID in `oauth2.client_id` in
  `extension/manifest.json`, rebuild and reload. Everything else works without it.

## Android app

Signed APKs are attached to the [GitHub releases](https://github.com/charlesnguyen8/QuickConverter/releases)
(`QuickConverter-vX.Y.Z.apk`). You can install them by hand or keep them updated with
[Obtainium](https://github.com/ImranR98/Obtainium) by adding the repository URL. To build it
yourself, see the Android section of [AGENTS.md](AGENTS.md).

## Development

| Command | What it does |
|---|---|
| `npm test` | Runs all test suites (Node only, no browser needed) |
| `npm run build:ext` | Builds the Chrome extension into `dist/` |
| `npm run build:app` | Builds the Android app's web part into `dist-app/` |
| `npm run build:css` | Rebuilds `src/styles/tailwind.css` after adding Tailwind classes |
| `npm run dev` | Vite dev server for UI work |

Architecture, porting rules and contribution rules are in [context.md](context.md) and
[AGENTS.md](AGENTS.md).

## Licenses of bundled data

- The dictionaries in `src/dict/` come from QuickTranslator (QT2025) and quick-translator-engine
  (GPL-3.0) for **personal, non-distributed use**; see [src/dict/README.md](src/dict/README.md).
- The OCR models in `src/ocr/models/` are PaddleOCR-derived (Apache-2.0); see
  [src/ocr/models/README.md](src/ocr/models/README.md).
