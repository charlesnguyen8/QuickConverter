// What each build produces. Both builds use the shared app in src/; the Chrome extension
// also gets the extension-only files from extension/, copied to the places the manifest
// expects. The app (Capacitor, later Android) leaves them out and starts on the library.

const SHARED_DIRS = ['providers', 'services', 'styles', 'fonts', 'icons', 'ocr', 'dict'];

const APP_PAGES = {
  library: 'views/library.html',
  novel: 'views/novel.html',
  reader: 'views/reader.html',
  settings: 'views/settings.html'
};

const EXTENSION_PAGES = {
  ...APP_PAGES,
  popup: 'views/popup.html',
  ocr: 'views/ocr-panel.html',
  opentosave: 'views/open-to-save.html',
  ocroffscreen: 'views/ocr-offscreen.html'
};

const APP_INDEX = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <script>location.replace('views/library.html');</script>
    <meta http-equiv="refresh" content="0; url=views/library.html" />
    <title>QuickConverter</title>
  </head>
  <body></body>
</html>
`;

export function buildTarget(name) {
  if (name === 'extension') {
    return {
      outDir: '../dist',
      inputs: EXTENSION_PAGES,
      copies: [
        ...SHARED_DIRS.map((dir) => [`src/${dir}`, `dist/${dir}`]),
        ['extension/scripts', 'dist/scripts'],
        ['extension/rules', 'dist/rules'],
        ['extension/manifest.json', 'dist/manifest.json']
      ],
      files: {}
    };
  }
  if (name === 'app') {
    return {
      outDir: '../dist-app',
      inputs: APP_PAGES,
      copies: SHARED_DIRS.map((dir) => [`src/${dir}`, `dist-app/${dir}`]),
      files: { 'index.html': APP_INDEX }
    };
  }
  throw new Error(`Unknown build target: ${name}`);
}
