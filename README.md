# Markdown 编辑器

一个现代化的 Markdown 编辑器，**同时支持 Web 应用和桌面应用**，支持实时预览、文档管理、代码高亮、数学公式和图表渲染。

## ✨ 功能特性

### 编辑器

- **实时预览** - 左右分屏，即时渲染
- **多种编辑器** - 支持 Monaco Editor 和 CodeMirror
- **语法高亮** - 30+ 种编程语言（Prism.js 按需加载）
- **数学公式** - KaTeX 渲染 LaTeX 公式
- **图表支持** - Mermaid 流程图、时序图、甘特图等
- **自动保存** - IndexedDB 本地持久化

### 文档管理

- **树型结构** - 文件夹嵌套组织
- **拖拽操作** - 拖拽移动、批量操作
- **智能渲染** - 增量更新，支持大规模文档（1000+）
- **导入导出** - JSON 格式备份与恢复

### 界面

- **多主题** - 浅色/深色主题
- **响应式布局** - 可拖拽调整分栏大小
- **目录导航** - 基于标题自动生成，滚动同步高亮
- **导出功能** - HTML、Markdown、PDF

## 🏗️ 技术栈

- **构建工具** - Vite 7
- **Markdown** - Marked 17 + DOMPurify 3
- **代码高亮** - Prism.js 1.30（按需加载）
- **图表渲染** - Mermaid 11
- **数学公式** - KaTeX 0.16
- **编辑器** - Monaco Editor / CodeMirror 6
- **桌面应用** - Tauri 2（可选）

## 🚀 快速开始

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 生产构建
npm run build
```

## 📚 文档

| 文档 | 说明 |
|------|------|
| [架构设计](docs/arch.md) | 组件体系、状态管理、数据流 |
| [文档管理](docs/document.md) | 文档树功能实现与性能优化 |
| [预览功能](docs/preview.md) | Markdown 渲染、代码高亮、公式图表 |
| [构建部署](docs/build.md) | Vite 配置、构建流程 |
| [测试规范](docs/testing.md) | 测试框架、代码检查 |

## 🖥️ 桌面应用（Tauri）

```bash
# 开发模式
npm run tauri:dev

# 构建桌面应用
npm run tauri:build
```

## 📄 许可证

Apache License 2.0
