import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { buildTarget } from './build-targets.mjs';

// `vite build` builds the Chrome extension into dist/; `vite build --mode app` builds the
// app (Capacitor) into dist-app/. See build-targets.mjs.
export default defineConfig(({ mode }) => {
  const target = buildTarget(mode === 'app' ? 'app' : 'extension');
  const out = target.outDir.replace(/^\.\.\//, '');

  return {
    root: 'src',
    base: './',
    plugins: [
      react(),
      {
        name: 'qc-copy-legacy',
        closeBundle() {
          for (const [from, to] of target.copies) cpSync(from, to, { recursive: true });
          mkdirSync(`${out}/ocr/ort`, { recursive: true });
          for (const file of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
            cpSync(`node_modules/onnxruntime-web/dist/${file}`, `${out}/ocr/ort/${file}`);
          }
          for (const file of readdirSync('src/views')) {
            if (file.endsWith('.js')) cpSync(`src/views/${file}`, `${out}/views/${file}`);
          }
          for (const [file, content] of Object.entries(target.files)) writeFileSync(`${out}/${file}`, content);
        }
      }
    ],
    resolve: {
      alias: [{ find: /^onnxruntime-web$/, replacement: 'onnxruntime-web/wasm' }]
    },
    worker: {
      format: 'es'
    },
    build: {
      outDir: target.outDir,
      emptyOutDir: true,
      rollupOptions: {
        input: target.inputs
      }
    }
  };
});
