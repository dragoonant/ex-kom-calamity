import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Vitest runs the rule-id tests under tests/ only; e2e/ belongs to Playwright (npm run e2e).
export default defineConfig({ base: './', plugins: [react()], test: { include: ['tests/**/*.test.ts'] } });
