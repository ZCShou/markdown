import { defineConfig, loadEnv } from 'vite';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { VitePWA } from 'vite-plugin-pwa';

// ESM 模式下获取 __dirname 的替代方案
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Vite 配置工厂
 * @param {{mode: string}} param0 - Vite 提供的上下文对象
 * @returns {import('vite').UserConfig}
 */
export default defineConfig(({ mode }) => {
  // 使用 Vite 约定的 VITE_* 环境变量
  // Tauri 和 Web 部署都使用相对路径，确保在自定义域名和 GitHub Pages 原始域名下都能正常工作
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const base = env.VITE_BASE_URL || './';

  return {
    base,
    plugins: [
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg'],
        manifest: {
          name: 'Markdown',
          short_name: 'Markdown',
          description: '功能强大的在线 Markdown 编辑器',
          start_url: './',
          display: 'standalone',
          background_color: '#ffffff',
          theme_color: '#1e88e5',
          icons: [
            {
              src: 'favicon.svg',
              sizes: 'any',
              type: 'image/svg+xml',
              purpose: 'any maskable'
            }
          ]
        },
        workbox: {
          globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024 // 10 MB
        },
        devOptions: {
          enabled: false // 开发模式下禁用 PWA，避免生成 dev-dist 目录
        }
      })
    ],
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
      target: 'es2015', // 明确目标浏览器版本，支持现代浏览器
      reportCompressedSize: false, // 禁用压缩大小报告以提升构建速度
      chunkSizeWarningLimit: 1000, // 调整 chunk 大小警告阈值
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
