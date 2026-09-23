// Compiles a .jsx/.js component with esbuild (JSX -> JS) and imports it so the
// Node test runner can render it. Bundles to tests/.tmp so bare imports like
// 'react' resolve from node_modules.
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const REPO = path.join(__dirname, '..', '..');
const TMP = path.join(__dirname, '..', '.tmp');

async function loadComponent(relPath) {
  const abs = path.resolve(REPO, 'src', relPath);
  fs.mkdirSync(TMP, { recursive: true });
  const outfile = path.join(TMP, path.basename(abs).replace(/[^\w.-]/g, '_') + '.mjs');
  await esbuild.build({
    entryPoints: [abs],
    bundle: true,
    format: 'esm',
    platform: 'node',
    jsx: 'automatic',
    outfile,
    external: ['react', 'react-dom', 'react-dom/server', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    logLevel: 'silent'
  });
  return import(pathToFileURL(outfile).href);
}

module.exports = { loadComponent };
