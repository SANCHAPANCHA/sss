import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  // Relative base so the build works from any host/subfolder (GitHub Pages, Netlify, etc.)
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        qr: resolve(__dirname, 'qr.html'),
      },
    },
  },
});
