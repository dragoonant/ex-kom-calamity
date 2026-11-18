import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vitest runs the rule-id tests under tests/ only; e2e/ belongs to Playwright (npm run e2e).
// The game is one self-contained bundle (index.html) so tools/make-artifact.mjs can inline it; the sound desk
// (sounds.html) is built on its own by vite.sounds.config.ts into the same dist/ (npm run build runs both).
export default defineConfig({ base: './', plugins: [react()], test: { include: ['tests/**/*.test.ts'] } });
