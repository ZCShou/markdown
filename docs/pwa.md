# PWA (Progressive Web App) 设计文档

## 📋 目录

- [概述](#概述)
- [配置](#配置)
- [构建产物](#构建产物)
- [功能特性](#功能特性)
- [调试方法](#调试方法)
- [注意事项](#注意事项)
- [最佳实践](#最佳实践)

---

## 概述

本项目采用 **vite-plugin-pwa** 插件实现 PWA 功能，支持离线访问、自动更新和安装到桌面。PWA（渐进式 Web 应用）结合了 Web 应用和原生应用的优势，提供更好的用户体验。

### 核心优势

- **离线支持**：预缓存静态资源，无网络时也可访问
- **自动更新**：检测到新版本时自动更新 Service Worker
- **安装体验**：可添加到桌面，类似原生应用
- **性能优化**：利用缓存策略提升加载速度

---

## 配置

### vite.config.js

PWA 配置集成在 Vite 配置文件中：

```javascript
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    VitePWA({
      // 自动更新策略
      registerType: 'autoUpdate',
      
      // 需要缓存的静态资源
      includeAssets: ['favicon.svg'],
      
      // PWA Manifest 配置
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
      
      // Workbox 配置
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024 // 10 MB
      },
      
      // 开发模式配置
      devOptions: {
        enabled: false // 开发模式下禁用 PWA，避免生成 dev-dist 目录
      }
    })
  ]
});
```

### 配置详解

#### registerType

| 值 | 说明 |
|---|---|
| `'autoUpdate'` | 自动更新，检测到新版本时立即激活 |
| `'prompt'` | 提示用户更新，需要用户确认 |

#### manifest 配置

| 属性 | 值 | 说明 |
|------|-----|------|
| `name` | Markdown | 应用完整名称 |
| `short_name` | Markdown | 应用短名称（主屏图标下显示） |
| `description` | 功能强大的在线 Markdown 编辑器 | 应用描述 |
| `start_url` | ./ | 启动 URL |
| `display` | standalone | 显示模式（独立窗口） |
| `background_color` | #ffffff | 启动画面背景色 |
| `theme_color` | #1e88e5 | 主题色（地址栏等） |

#### Workbox 配置

```javascript
workbox: {
  // 预缓存文件匹配模式
  globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
  
  // 单文件最大缓存大小（10 MB，适配 Monaco Editor）
  maximumFileSizeToCacheInBytes: 10 * 1024 * 1024
}
```

### public/manifest.json（可选）

如果需要单独配置 manifest，可在 `public/` 目录下创建：

```json
{
  "name": "Markdown",
  "short_name": "Markdown",
  "description": "功能强大的在线 Markdown 编辑器",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1e88e5",
  "icons": [
    {
      "src": "favicon.svg",
      "sizes": "any",
      "type": "image/svg+xml"
    }
  ]
}
```

> **注意**：VitePWA 插件会自动生成 manifest，优先使用插件配置。

---

## 构建产物

构建后会在 `dist/` 目录生成以下 PWA 相关文件：

```
dist/
├── index.html
├── favicon.svg
├── manifest.webmanifest    # PWA 清单（自动生成）
├── sw.js                   # Service Worker 主文件
├── workbox-*.js            # Workbox 运行时
├── registerSW.js           # SW 注册脚本
└── assets/
    └── ...
```

### 文件说明

| 文件 | 说明 |
|------|------|
| `manifest.webmanifest` | PWA 清单，定义应用元数据 |
| `sw.js` | Service Worker，处理缓存和离线逻辑 |
| `workbox-*.js` | Workbox 库文件，提供缓存管理 |
| `registerSW.js` | 自动生成的 SW 注册脚本 |

---

## 功能特性

### ✅ 离线访问

Service Worker 预缓存所有静态资源，包括：
- HTML、CSS、JavaScript
- 图片、图标
- 字体文件
- 第三方库（Monaco Editor、Mermaid 等）

**工作流程**：

```
用户访问 → SW 拦截请求 → 检查缓存 
  ↓
有缓存 → 返回缓存内容
无缓存 → 网络请求 → 缓存响应
```

### ✅ 自动更新

采用 `autoUpdate` 策略：

1. 部署新版本后，构建生成新的 `sw.js`
2. 用户访问时检测到 SW 变化
3. 自动下载并激活新版本
4. 页面刷新后使用新版本

### ✅ 安装到桌面

**触发条件**：
- HTTPS 协议（localhost 除外）
- 有效的 manifest 配置
- 注册了 Service Worker
- 有图标资源

**安装方式**：
- Chrome：地址栏右侧安装图标
- 移动端：浏览器菜单"添加到主屏幕"

---

## 调试方法

### Chrome DevTools

1. 打开 DevTools（F12）
2. 切换到 **Application** 面板
3. 左侧菜单选择 **Service Workers**

**可查看信息**：
- Service Worker 状态
- 更新状态
- 缓存内容
- 推送通知

### 缓存管理

**查看缓存**：
```
Application → Cache Storage → 预缓存列表
```

**清除缓存**：
```
Application → Clear storage → Clear site data
```

### 离线测试

1. DevTools → Application → Service Workers
2. 勾选 **Offline** 复选框
3. 刷新页面验证离线功能

### Lighthouse 审计

1. DevTools → Lighthouse
2. 选择 **Progressive Web App**
3. 运行审计获取 PWA 评分

---

## 注意事项

### HTTPS 要求

PWA 必须通过 HTTPS 提供服务，以下情况除外：
- `localhost` 和 `127.0.0.1`
- 部分开发环境

### 缓存策略

**Service Worker 缓存**：

```nginx
# Nginx 配置 - SW 不应被缓存
location /sw.js {
    add_header Cache-Control "no-cache";
    expires off;
}
```

**Manifest MIME 类型**：

```nginx
# Nginx 配置
types {
    application/manifest+json webmanifest;
}
```

### 开发模式

开发模式下 PWA 默认禁用（`devOptions.enabled: false`），原因：
- 避免开发时缓存干扰
- 减少不必要的 dev-dist 目录生成
- 保持 HMR 正常工作

### 大文件缓存

Monaco Editor 和 Mermaid 较大，配置了 10 MB 缓存限制：

```javascript
maximumFileSizeToCacheInBytes: 10 * 1024 * 1024
```

---

## 最佳实践

### 1. 版本更新

每次部署前确保更新版本号：

```json
// package.json
{
  "version": "1.0.1"
}
```

### 2. 缓存策略优化

针对不同资源类型设置策略：

```javascript
workbox: {
  runtimeCaching: [
    {
      urlPattern: /^https:\/\/fonts\.googleapis\.com/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'google-fonts',
        expiration: {
          maxEntries: 30,
          maxAgeSeconds: 60 * 60 * 24 * 365 // 1 年
        }
      }
    }
  ]
}
```

### 3. 更新提示

如需用户确认更新，改用 `prompt` 模式：

```javascript
VitePWA({
  registerType: 'prompt',
  // ...
})
```

添加 UI 提示组件处理更新事件。

### 4. 离线页面

可配置离线时显示的备用页面：

```javascript
workbox: {
  offlineGoogleAnalytics: true,
  navigateFallback: '/index.html'
}
```

---

**文档版本**：2.0.0  
**最后更新**：2026-03-01  
**维护者**：Markdown Editor Team
