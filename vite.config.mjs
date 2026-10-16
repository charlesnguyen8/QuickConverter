import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, mkdirSync, readdirSync } from 'node:fs';

const legacyDirs = ['providers', 'services', 'scripts', 'styles', 'fonts', 'icons', 'ocr'];

export default defineConfig({
  root: 'src',
  base: './',
  plugins: [
    react(),
    {
      name: 'qc-copy-legacy',
      closeBundle() {
        for (const dir of legacyDirs) cpSync(`src/${dir}`, `dist/${dir}`, { recursive: true });
        cpSync('manifest.json', 'dist/manifest.json');
        mkdirSync('dist/ocr/ort', { recursive: true });
        for (const file of ['ort-wasm-simd-threaded.wasm', 'ort-wasm-simd-threaded.mjs']) {
          cpSync(`node_modules/onnxruntime-web/dist/${file}`, `dist/ocr/ort/${file}`);
        }
        for (const file of readdirSync('src/views')) {
          if (file.endsWith('.js')) cpSync(`src/views/${file}`, `dist/views/${file}`);
        }
      }
    }
  ],
  resolve: {
    alias: [{ find: /^onnxruntime-web$/, replacement: 'onnxruntime-web/wasm' }]
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        library: 'views/library.html',
        novel: 'views/novel.html',
        reader: 'views/reader.html',
        settings: 'views/settings.html',
        popup: 'views/popup.html',
        ocr: 'views/ocr-panel.html'
      }
    }
  }
});
