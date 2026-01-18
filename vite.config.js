import { defineConfig } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM 模式下获取 __dirname 的替代方案
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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
