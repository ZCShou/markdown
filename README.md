# Markdown 编辑器

一个简单、独立的 Markdown 编辑器，支持实时预览、代码高亮、Mermaid 图表等功能。

## 功能特性

- ✨ 实时预览 Markdown 内容
- 🎨 支持深色/浅色主题切换
- 📝 支持多种编程语言的代码高亮
- 📊 支持 Mermaid 图表渲染
- 📑 自动生成目录
- 💾 本地存储文档管理
- 📤 导出为 HTML 或 Markdown 文件
- 🔍 可拖拽调整编辑器和预览区域大小

## 安装和运行

### 安装依赖

```bash
npm install
```

### 启动服务器

```bash
npm start
```

或者使用开发模式（自动重启）：

```bash
npm run dev
```

### 访问编辑器

打开浏览器访问：http://localhost:3000

## 项目结构

```
markdown-editor/
├── public/
│   ├── css/
│   │   └── markdown.css      # 编辑器样式
│   └── js/
│       └── markdown.js       # 编辑器逻辑
├── views/
│   └── markdown.html         # 主页面
├── server.js                 # Express 服务器
├── package.json              # 项目配置
└── README.md                 # 项目说明
```

## 技术栈

- **后端**: Node.js + Express
- **前端**: 原生 JavaScript
- **Markdown 解析**: Marked.js
- **代码高亮**: Prism.js
- **图表渲染**: Mermaid.js
- **HTML 净化**: DOMPurify

## 使用说明

### 编辑 Markdown

在左侧编辑器中输入 Markdown 内容，右侧会实时显示预览效果。

### 管理文档

点击左上角的 📁 图标打开项目管理面板，可以：
- 创建新文档
- 切换文档
- 删除文档

### 导出文件

点击右上角的 ☰ 图标打开工具面板，可以：
- 导出为 HTML 文件
- 导出为 Markdown 文件

### 切换主题

点击右上角的 🌙/☀️ 图标切换深色/浅色主题。

### 调整布局

拖拽中间的分隔条可以调整编辑器和预览区域的大小。

## 快捷键

- `Ctrl/Cmd + S`: 保存当前内容到本地存储

## 浏览器支持

- Chrome/Edge (推荐)
- Firefox
- Safari

## 许可证

MIT
