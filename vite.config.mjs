import { defineConfig } from 'vite';
import { cpSync } from 'node:fs';

const legacyDirs = ['providers', 'services', 'components', 'scripts', 'styles', 'fonts', 'icons'];

export default defineConfig({
  base: './',
  plugins: [
    {
      name: 'qc-copy-legacy',
      closeBundle() {
        for (const dir of legacyDirs) cpSync(dir, `dist/${dir}`, { recursive: true });
        cpSync('manifest.json', 'dist/manifest.json');
      }
    }
  ],
  build: {
    outDir: 'dist',
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
