import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  define: { __BUILD__: JSON.stringify(process.env.GITHUB_SHA ?? 'dev') },
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
});
