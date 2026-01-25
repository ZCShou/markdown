# 测试与代码规范指南

本文档介绍项目的测试框架和代码规范工具的使用方法。

## 目录

- [测试框架 (Vitest)](#测试框架-vitest)
- [代码检查 (ESLint)](#代码检查-eslint)
- [代码格式化 (Prettier)](#代码格式化-prettier)
- [持续集成](#持续集成)

---

## 测试框架 (Vitest)

项目使用 Vitest 作为单元测试框架，它专为 Vite 项目优化，提供快速的测试体验。

### 安装依赖

```bash
npm install -D vitest jsdom @vitest/coverage-v8
```

### 运行测试

```bash
# 运行测试（监听模式）
npm run test

# 运行测试（生成覆盖率报告）
npm run test:coverage

# 运行测试（单次运行）
npm run test:run
```

### 测试文件结构

```
tests/
├── setup.js           # 测试环境设置
├── helpers.test.js    # 工具函数测试
├── store.test.js      # 存储管理器测试
└── state.test.js      # 状态管理器测试
```

### 编写测试

#### 基本测试示例

```javascript
import { describe, it, expect } from 'vitest';

describe('功能模块', () => {
  it('应该返回正确的结果', () => {
    const result = myFunction();
    expect(result).toBe('expected value');
  });
});
```

#### 异步测试

```javascript
it('应该处理异步操作', async () => {
  const result = await asyncFunction();
  expect(result).toBeTruthy();
});
```

#### Mock 和 Spy

```javascript
import { vi, beforeEach, afterEach } from 'vitest';

describe('Mock 测试', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('应该 mock 函数', () => {
    const fn = vi.fn();
    fn('arg');
    expect(fn).toHaveBeenCalledWith('arg');
  });
});
```

### 覆盖率目标

项目当前的覆盖率状态：

- **行覆盖率**: ~50%
- **函数覆盖率**: ~66%
- **分支覆盖率**: ~45%
- **语句覆盖率**: ~49%

> **注意**: 覆盖率阈值设置为 70%，但当前实际覆盖率约为 50%。核心功能已充分测试，未覆盖的主要是边界情况和错误处理路径。

### 测试最佳实践

1. **测试文件命名**: 使用 `.test.js` 或 `.spec.js` 后缀
2. **测试描述**: 使用清晰、描述性的测试名称
3. **单一职责**: 每个测试只验证一个功能点
4. **独立性**: 测试之间应该相互独立
5. **可读性**: 使用 `describe` 分组相关测试

---

## 代码检查 (ESLint)

项目使用 ESLint 进行代码质量检查，专注于发现潜在问题，格式化由 Prettier 负责。

### 配置文件

ESLint 配置位于项目根目录的 `eslint.config.js`。

### 运行 ESLint

```bash
# 检查代码
npm run lint
```

### 规则说明

项目配置的 ESLint 规则专注于代码质量检查：

#### 代码质量规则

- `no-console`: 警告使用 console（允许 warn 和 error）
- `no-debugger`: 警告使用 debugger
- `no-var`: 禁止使用 var（使用 const/let）
- `prefer-const`: 要求使用 const
- `eqeqeq`: 要求使用 === 和 !==
- `no-eval`: 禁止使用 eval

#### ES6+ 规则

- `no-duplicate-imports`: 禁止重复导入
- `object-shorthand`: 使用对象属性简写
- `prefer-spread`: 优先使用展开运算符
- `prefer-rest-params`: 优先使用剩余参数

### 自定义规则

如需自定义规则，编辑 `eslint.config.js`：

```javascript
export default [
  {
    rules: {
      'your-rule': 'error'
    }
  }
];
```

---

## 代码格式化 (Prettier)

项目使用 Prettier 进行代码格式化，确保代码风格一致。

### 配置文件

Prettier 配置位于项目根目录的 `.prettierrc`。

### 运行 Prettier

```bash
# 格式化所有文件
npm run format
```

### 格式化规则

项目配置的 Prettier 规则：

```json
{
  "semi": true,              // 使用分号
  "singleQuote": true,       // 使用单引号
  "trailingComma": "none",   // 不使用尾随逗号
  "printWidth": 100,         // 每行最大 100 字符
  "tabWidth": 4,             // 缩进 4 个空格
  "useTabs": false,          // 使用空格而非制表符
  "endOfLine": "lf"          // 使用 LF 换行符
}
```

### 编辑器集成

#### VS Code

安装扩展：
- ESLint
- Prettier - Code formatter
- Vitest

添加到 `.vscode/settings.json`：

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": true
  },
  "vitest.enable": true
}
```

---

## 持续集成

### 完整检查

在提交代码前，运行完整检查：

```bash
npm run check
```

这将依次执行：
1. ESLint 代码检查
2. Vitest 单元测试

### Git Hooks（可选）

可以使用 husky 和 lint-staged 在提交前自动运行检查：

```bash
npm install -D husky lint-staged
npx husky init
```

添加 `.husky/pre-commit`：

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npm run check
```

添加 `.husky/pre-commit`：

```bash
#!/bin/sh
. "$(dirname "$0")/_/husky.sh"

npm run check
```

配置 `lint-staged`（在 package.json 中）：

```json
{
  "lint-staged": {
    "*.{js,jsx}": [
      "eslint --fix",
      "prettier --write"
    ],
    "*.{json,md,css}": [
      "prettier --write"
    ]
  }
}
```

---

## 常见问题

### Q: 测试失败怎么办？

A: 查看测试输出，定位失败的测试用例。使用 `npm run test` 可以在监听模式下运行测试，文件变化会自动重新运行。

### Q: ESLint 报错太多？

A: ESLint 专注于代码质量检查，不会自动修复。需要根据错误提示手动修改代码。使用 `npm run format` 可以通过 Prettier 格式化代码。

### Q: Prettier 格式化不符合预期？

A: 检查 `.prettierrc` 配置文件，调整格式化规则。某些文件可能有特殊配置，查看 `.prettierignore`。

### Q: 如何忽略某行 ESLint 检查？

A: 使用注释：

```javascript
// eslint-disable-next-line no-console
console.log('this will be ignored');
```

---

## 参考资源

- [Vitest 官方文档](https://vitest.dev/)
- [ESLint 官方文档](https://eslint.org/)
- [Prettier 官方文档](https://prettier.io/)
- [JSDoc 官方文档](https://jsdoc.app/)
