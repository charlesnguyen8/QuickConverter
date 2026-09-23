import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, readdirSync } from 'node:fs';

const legacyDirs = ['providers', 'services', 'scripts', 'styles', 'fonts', 'icons'];

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
        for (const file of readdirSync('src/views')) {
          if (file.endsWith('.js')) cpSync(`src/views/${file}`, `dist/views/${file}`);
        }
      }
    }
  ],
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        library: 'views/library.html',
        novel: 'views/novel.html',
        reader: 'views/reader.html',
        settings: 'views/settings.html',
        popup: 'views/popup.html'
      }
    }
  }
});
