import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Développement : « npm run dev:server » (API :8900) + « npm run dev » (Vite :5173, relaie l'API).
export default defineConfig({
  root: 'web',
  plugins: [svelte(), tailwindcss()],
  build: { outDir: '../dist', emptyOutDir: true },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8900',
      '/socket.io': { target: 'http://localhost:8900', ws: true },
    },
  },
});
