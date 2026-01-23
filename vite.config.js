import { defineConfig, loadEnv } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ESM 模式下获取 __dirname 的替代方案
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig(({ mode }) => {
  // 使用 Vite 约定的 VITE_* 环境变量；未设置时退回根路径
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const base = env.VITE_BASE_URL || '/';

  return {
    base,
    server: {
      port: 3000,
      host: '0.0.0.0',
      open: true
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      sourcemap: true,
      cssCodeSplit: true,
      minify: 'terser',
      rollupOptions: {
        output: {
          manualChunks: {
            'markdown-vendor': ['marked', 'dompurify'],
            'prism-vendor': ['prismjs'],
            'mermaid-vendor': ['mermaid']
          },
        },
      },
    },
    optimizeDeps: {
      include: ['marked', 'dompurify', 'prismjs', 'mermaid'],
    },
    assetsInclude: ['**/*.ttf', '**/*.woff', '**/*.woff2', '**/*.eot'],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@components': resolve(__dirname, 'src/components'),
        '@modules': resolve(__dirname, 'src/modules'),
        '@utils': resolve(__dirname, 'src/utils'),
        '@styles': resolve(__dirname, 'src/styles')
      },
    },
  };
});
