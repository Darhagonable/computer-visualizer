import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Host: `ui/` · Tauri crate: `../app` (see docs/architecture.md for the repo layout).
// The Windows exe is cross-built from WSL with scripts/build-windows.sh.
export default defineConfig({
  plugins: [svelte()],
  clearScreen: false,
  server: {
    host: '0.0.0.0', // reachable from the Windows browser while running in WSL
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'esnext',
  },
});
