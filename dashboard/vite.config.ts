import { defineConfig } from 'vite';
import solidPlugin from 'vite-plugin-solid';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [tailwindcss(), solidPlugin()],
  resolve: {
    alias: {
      'solid-js/web': '@solidjs/web',
      'lucide-solid': path.resolve(import.meta.dirname, 'src/icons.tsx')
    }
  },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://127.0.0.1:3030'
    }
  },
  build: {
    target: 'esnext',
    outDir: 'dist',
    emptyOutDir: true
  }
});
