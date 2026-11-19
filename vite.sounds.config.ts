import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

// The sound desk (sounds.html, KB recipe step 8), built after the game into the same dist/ without emptying it.
export default defineConfig({
  base: './',
  plugins: [react()],
  build: { emptyOutDir: false, rollupOptions: { input: fileURLToPath(new URL('./sounds.html', import.meta.url)) } },
});
