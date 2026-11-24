import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// One entry, no public copy: tools/make-artifact.mjs inlines this bundle; art and audio publish as supporting files.
export default defineConfig({ base: './', plugins: [react()], publicDir: false, define: { 'import.meta.env.VITE_ARTIFACT': '"1"' }, build: { outDir: 'dist-single', emptyOutDir: true, chunkSizeWarningLimit: 4000 } });
