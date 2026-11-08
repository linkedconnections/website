import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  base: './',
  publicDir: false,
  build: {
    outDir: 'js/demo',
    emptyOutDir: true,
    sourcemap: false,
    rollupOptions: {
      input: fileURLToPath(new URL('./planner-demo.js', import.meta.url)),
      output: {
        entryFileNames: 'planner-demo.js',
        chunkFileNames: '[name]-[hash].js',
        assetFileNames: '[name]-[hash][extname]'
      }
    }
  },
  worker: { format: 'es' }
});
