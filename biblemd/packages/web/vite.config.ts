import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  resolve: { alias: { 'biblemd-core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) } },
  worker: { format: 'es' },
  build: { target: 'es2022', outDir: 'dist', sourcemap: true },
});
