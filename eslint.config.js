import js from '@eslint/js';
import globals from 'globals';

/**
 * ESLint 配置文件
 * 专注于代码质量检查，格式化由 Prettier 负责
 */
export default [
  // 基础 JavaScript 规则
  js.configs.recommended,
  
  {
    // 语言选项
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
        // Vitest 全局变量
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        vi: 'readonly'
      }
    },
    
    // 规则配置 - 只保留代码质量检查规则
    rules: {
      // ========== 代码质量 ==========
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      'no-debugger': 'warn',
      'no-alert': 'warn',
      'no-var': 'error',
      'prefer-const': 'error',
      'no-constant-condition': 'warn',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      
      // ========== 最佳实践 ==========
      'eqeqeq': ['error', 'always'],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-return-await': 'error',
      'require-await': 'warn',
      'no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_'
      }],
      'no-throw-literal': 'error',
      'prefer-promise-reject-errors': 'error',
      
      // ========== ES6+ 最佳实践 ==========
      'no-duplicate-imports': 'error',
      'no-useless-constructor': 'error',
      'object-shorthand': ['error', 'always'],
      'prefer-destructuring': ['warn', {
        array: true,
        object: true
      }],
      'prefer-spread': 'error',
      'prefer-rest-params': 'error',
      
      // ========== 潜在问题检查 ==========
      'no-async-promise-executor': 'warn',
      'no-await-in-loop': 'warn',
      'no-compare-neg-zero': 'error',
      'no-cond-assign': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-duplicate-case': 'error',
      'no-empty-character-class': 'error',
      'no-ex-assign': 'error',
      'no-func-assign': 'error',
      'no-inner-declarations': 'error',
      'no-invalid-regexp': 'error',
      'no-irregular-whitespace': 'error',
      'no-obj-calls': 'error',
      'no-prototype-builtins': 'error',
      'no-regex-spaces': 'error',
      'no-shadow': 'warn',
      'no-shadow-restricted-names': 'error',
      'no-sparse-arrays': 'error',
      'no-unreachable': 'error',
      'no-unsafe-finally': 'error',
      'no-unsafe-negation': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
      
      // ========== 代码逻辑问题 ==========
      'no-fallthrough': 'error',
      'no-octal': 'error',
      'no-redeclare': 'error',
      'no-self-assign': 'error',
      'no-self-compare': 'error',
      'no-sequences': 'error',
      'no-throw-literal': 'error',
      'no-unexpected-multiline': 'error',
      'no-unsafe-optional-chaining': 'error',
      'no-useless-backreference': 'error',
      'no-useless-catch': 'error',
      'no-useless-escape': 'error',
      'no-with': 'error',
      'no-nonoctal-decimal-escape': 'error',
      
      // ========== 函数和变量 ==========
      'no-loop-func': 'warn',
      'no-param-reassign': 'warn',
      'no-undef': 'error',
      'no-undef-init': 'warn',
      'no-unused-expressions': 'error',
      'no-useless-call': 'error',
      'no-useless-concat': 'warn',
      'no-useless-return': 'error'
    }
  },
  
  // 忽略文件
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '*.config.js',
      'public/**'
    ]
  }
];
