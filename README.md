# Markdown 编辑器

一个现代化的、纯前端的 Markdown 编辑器，采用状态驱动 UI 架构，支持实时预览、文档管理、代码高亮、图表渲染等丰富功能。

## ✨ 核心特性

### 编辑体验
- **实时预览**：左右分屏，实时渲染 Markdown
- **语法高亮**：支持 30+ 种编程语言
- **数学公式**：基于 KaTeX 的 LaTeX 公式渲染
- **图表支持**：Mermaid 流程图、时序图、甘特图等
- **自动保存**：编辑内容自动保存到 localStorage

### 文档管理
- **树型结构**：支持文件夹嵌套，清晰的文档组织
- **拖拽排序**：直观的拖拽操作，轻松调整文档结构
- **批量操作**：创建、删除、重命名、移动文档
- **智能渲染**：增量更新机制，支持大规模文档管理（1000+ 文档）

### 界面功能
- **多主题**：浅色/深色主题切换
- **响应式布局**：可拖拽调整编辑器和预览区域大小
- **自动目录**：基于标题自动生成目录导航
- **同步滚动**：编辑器和预览区域滚动同步
- **导出功能**：支持导出为 HTML、Markdown、PDF

## 🏗️ 技术架构

### 核心设计
- **状态驱动 UI**：采用观察者模式，状态与 UI 完全解耦
- **组件化架构**：基于 BaseComponent 的组件继承体系
- **模块化设计**：ESM 模块系统，清晰的职责分离
- **性能优化**：增量渲染、DOM 缓存、RAF 批量更新

### 技术栈
- **构建工具**：Vite 5.0（极速开发体验）
- **核心库**：
  - Marked 12.0（Markdown 解析）
  - DOMPurify 3.1（XSS 防护）
  - Prism.js 1.29（代码高亮）
  - Mermaid 10.9（图表渲染）
  - KaTeX 0.16（数学公式）
- **图标库**：VS Code Codicons

### 架构亮点
- **纯前端实现**：无后端依赖，可离线使用
- **本地存储**：基于 localStorage 的数据持久化
- **PWA 支持**：可安装为桌面应用

## 🚀 快速开始

### 安装

```bash
# 克隆项目
git clone <repository-url>
cd markdown

# 安装依赖
npm install
```

### 开发

```bash
# 启动开发服务器
npm run dev

# 访问 http://localhost:3000
```

### 构建

```bash
# 生产构建
npm run build

# 预览构建结果
npm run preview
```

## 📚 文档

- **[架构设计文档](docs/arch.md)**：项目整体架构、组件体系、状态管理、数据流等
- **[DocumentList 组件详解](docs/project.md)**：文档列表组件的核心功能实现和性能优化
- **[构建与部署指南](docs/build.md)**：Vite 配置、构建流程、部署方案等

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 📄 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

---

**Made with ❤️ by Markdown Editor Team**
