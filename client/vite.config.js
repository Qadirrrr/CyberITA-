import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:4000', changeOrigin: true, xfwd: true },
      '/uploads': { target: 'http://127.0.0.1:4000', changeOrigin: true, xfwd: true },
      '/ws': { target: 'ws://127.0.0.1:4000', ws: true, xfwd: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
    // @novnc/novnc (the lab desktop viewer) ships a top-level await in its
    // WebCodecs detection, which needs an ES2022+ transpile target. Same
    // setting the VPS-Reselling client uses for the same library.
    target: 'es2022',
  },
});
