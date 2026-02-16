# PWA (Progressive Web App) 设计文档

## 概述

本项目采用 **vite-plugin-pwa** 实现 PWA 功能，以最简配置支持离线使用和安装到桌面。

## 配置

### vite.config.js

```javascript
VitePWA({
  registerType: 'autoUpdate',
  includeAssets: ['favicon.svg'],
  workbox: {
    globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
    maximumFileSizeToCacheInBytes: 10 * 1024 * 1024 // Monaco Editor 较大
  }
})
```

### public/manifest.json

```json
{
  "name": "Markdown Editor",
  "short_name": "Markdown",
  "display": "standalone",
  "theme_color": "#1e88e5",
  "icons": [{ "src": "/markdown/favicon.svg", "sizes": "any", "type": "image/svg+xml" }]
}
```

## 构建产物

```
dist/
├── registerSW.js        # SW 注册脚本
├── sw.js                # Service Worker
└── workbox-*.js         # Workbox 运行时
```

## 功能

- ✅ 离线访问（预缓存所有静态资源）
- ✅ 自动更新
- ✅ 安装到桌面

## 调试

Chrome DevTools → Application → Service Workers

## 注意

- 需要 HTTPS（localhost 除外）
- 修改代码后重新构建即可更新
