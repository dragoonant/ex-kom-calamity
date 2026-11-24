import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Vitest runs tests/ only; e2e/ belongs to Playwright. base './' so the build runs from a sub-path (Pages, Artifact).
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { rollupOptions: { input: { main: resolve(import.meta.dirname, 'index.html'), sounds: resolve(import.meta.dirname, 'sounds.html') } } },
  test: { include: ['tests/**/*.test.ts'] },
});
