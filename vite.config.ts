import { defineConfig } from 'vite';
export default defineConfig({
  build: { outDir: 'dist', assetsInlineLimit: 0, target: 'es2020' },
  server: { proxy: process.env.API_PROXY ? { '/api': process.env.API_PROXY } : undefined },
});
