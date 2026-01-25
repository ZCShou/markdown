import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

/**
 * Vitest 配置文件
 * 用于单元测试和覆盖率报告
 */
export default defineConfig({
  test: {
    // 全局测试环境
    globals: true,
    
    // 测试环境配置
    environment: 'jsdom',
    
    // 设置全局变量
    setupFiles: ['./tests/setup.js'],
    
    // 覆盖率配置
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        'dist/',
        '**/*.config.js',
        '**/*.test.js',
        'public/',
        'docs/'
      ],
      // 覆盖率阈值
      thresholds: {
        lines: 70,
        functions: 70,
        branches: 70,
        statements: 70
      }
    },
    
    // 测试文件匹配模式
    include: [
      'tests/**/*.{test,spec}.{js,ts}',
      'src/**/*.{test,spec}.{js,ts}'
    ],
    
    // 排除的文件
    exclude: [
      'node_modules/',
      'dist/',
      '**/*.config.js'
    ]
  },
  
  // 路径解析（与 vite.config.js 保持一致）
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@components': resolve(__dirname, 'src/components'),
      '@modules': resolve(__dirname, 'src/modules'),
      '@utils': resolve(__dirname, 'src/utils'),
      '@styles': resolve(__dirname, 'src/styles')
    }
  }
});
