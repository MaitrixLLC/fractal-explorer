/**
 * vite.config.ts — Vite configuration (React + GLSL assets)
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react()],
  assetsInclude: ['**/*.glsl', '**/*.frag', '**/*.vert'],
  build: {
    target: 'es2020'
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
});
