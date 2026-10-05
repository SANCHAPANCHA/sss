import { defineConfig } from 'vite';

export default defineConfig({
  // The dev server is embedded in server/index.js and reached through preview proxies.
  server: { allowedHosts: true },
});
