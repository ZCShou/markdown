import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  server: { port: 3000, open: true },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'markdown-vendor': ['marked', 'dompurify'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['marked', 'dompurify'],
  },
  resolve: {
    alias: { '@': resolve(__dirname, 'src') },
  },
});
