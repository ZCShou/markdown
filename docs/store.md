# 数据存储设计文档

## 概述

本项目采用**双轨存储架构**，针对文本和图片的不同特性选择最优存储方案：

| 数据类型 | 存储位置 | 写入时机 | 写入方式 |
|----------|----------|----------|----------|
| 文档文本 | `markdown-editor-db` | 内容变化后 300ms | 防抖批量写入 |
| 图片文件 | `markdown-editor-images` / 文件系统 | 粘贴时立即 | 同步写入 |

### 设计原则

- **先图片后文本**：确保图片落盘后再保存引用，避免死链
- **防抖优化**：高频编辑场景使用 300ms 防抖，减少 I/O 开销
- **共享保护**：删除时检查图片引用，避免误删共享资源
- **平台适配**：Web 用 IndexedDB，Tauri 用文件系统

---

## 存储架构

```
┌─────────────────────────────────────────────────────────────────┐
│                         应用层                                   │
│  MarkdownEditor → EditorState → PersistenceManager              │
└─────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐     ┌─────────────────────────────────┐
│     文本存储通道         │     │          图片存储通道            │
│  StoreManager           │     │  helpers.js                     │
│  ↓                      │     │  ↓                              │
│  markdown-editor-db     │     │  Web: markdown-editor-images    │
│  (IndexedDB)            │     │  Tauri: 文件系统                 │
│  ↓                      │     │  ↓                              │
│  {key, value} 结构      │     │  {path, blob, timestamp} 结构   │
└─────────────────────────┘     └─────────────────────────────────┘
```

---

## 文本存储

### 存储结构

**数据库**：`markdown-editor-db` (IndexedDB)

**对象存储**：`data`，使用 `{key, value}` 结构

| 键名 | 说明 | 数据类型 |
|------|------|----------|
| `documents` | 文档列表 | `Document[]` |
| `currentDocId` | 当前文档 ID | `string \| null` |
| `settings` | 用户设置 | `Settings` |

**文档数据结构**：

```typescript
interface Document {
    id: string;              // 唯一标识
    name: string;            // 文档名称
    type: 'file' | 'folder'; // 类型
    parentId: string | null; // 父文件夹 ID
    content?: string;        // 文档内容（仅 file）
    createdAt: string;       // 创建时间 ISO
    updatedAt: string;       // 更新时间 ISO
}
```

### 保存流程

```
用户输入
    │
    ▼
CodeMirrorEditor/MonacoEditor.onChange(content)
    │
    ▼ (150ms 防抖)
MarkdownEditor.#handleEditorChange()
    │
    ▼
EditorState.updateContent(content)
    ├─ #setState({content}, {skipPersist:true})  ← 仅更新 UI
    └─ #updateDocumentContent(docId, content)
         │
         ▼
    documents.map(doc => {...doc, content, updatedAt})
         │
         ▼
    persistence.schedule(['documents'])
         │
         ▼ (300ms 防抖)
    StoreManager.saveDocuments() → IndexedDB
```

**时序说明**：

| 时刻 | 内存 | IndexedDB |
|------|------|-----------|
| 用户输入 | ✅ 已更新 | ❌ 未写入 |
| 停止输入后 150ms | ✅ | ❌ |
| 停止输入后 450ms | ✅ | ✅ 已持久化 |

### 删除流程

```
用户点击删除 → 确认对话框
    │
    ▼
EditorState.deleteDocuments(docIds)
    ├─ 收集所有子文档 ID
    ├─ 收集所有图片路径
    ├─ filter 过滤掉待删文档
    └─ #setState({documents, currentDocId})
         │
         ▼ (300ms 防抖)
    IndexedDB 覆盖写入
```

---

## 图片存储

### 存储结构

**Web 环境**：`markdown-editor-images` (IndexedDB)

```typescript
interface ImageRecord {
    path: string;      // 图片路径（主键）
    blob: Blob;        // 图片二进制数据
    timestamp: number; // 保存时间戳
}
```

**Tauri 环境**：文件系统

```
{resourceDir}/imgs/{YYYY-MM-DD}/{random16}.{ext}
```

### 保存流程

```
用户 Ctrl+V 粘贴图片
    │
    ▼
编辑器检测到图片 → extractImageFromClipboard()
    │
    ▼
MarkdownEditor.#handleImagePaste(file)
    │
    ▼ (立即同步)
handlePastedImage(file)
    ├─ 校验大小（≤10MB）
    ├─ 生成路径 /imgs/YYYY-MM-DD/随机.扩展名
    ├─ Web:   saveImage(path, blob) → IndexedDB
    └─ Tauri: writeFile(path, data) → 文件系统
    │
    ▼
返回 imagePath
    │
    ▼
编辑器插入 ![image](path)
    │
    ▼
触发 onChange → 进入文本保存流程
```

**关键点**：图片**立即同步写入**，文本引用**300ms 防抖写入**。这确保了图片先于引用落盘。

### 读取流程

**Web 环境获取图片 URL**：

```javascript
// helpers.js
export function getImageUrl(path) {
    // 使用缓存避免重复读取 IndexedDB
    if (blobUrlCache.has(path)) return blobUrlCache.get(path);
    
    // 从 IndexedDB 读取并创建 Blob URL
    const promise = initImageDB().then(db => {
        // ... 读取 blob 并返回 URL.createObjectURL(blob)
    });
    
    blobUrlCache.set(path, promise);
    return promise;
}
```

### 删除流程

```
EditorState.deleteDocuments(docIds)
    │
    ├─ 收集待删除文档中的所有图片路径
    │
    ├─ 过滤掉仍被存活文档引用的路径
    │   for (doc of 存活文档) {
    │       for (path of extractImagePaths(doc.content)) {
    │           imagePaths.delete(path);  // 共享图片不删除
    │       }
    │   }
    │
    ├─ 删除文档（300ms 防抖持久化）
    │
    └─ 异步删除未被引用的图片
        for (path of imagePaths) {
            deleteImage(path);
        }
```

**deleteImage 内部流程**：

```javascript
export async function deleteImage(path) {
    // 1. 清理 Blob URL 缓存
    await revokeBlobUrl(path);
    
    // 2. 从存储中删除
    if (window.__TAURI__) {
        // Tauri: 从文件系统删除
        await remove(fullPath);
    } else {
        // Web: 从 IndexedDB 删除
        await store.delete(path);
    }
}
```

---

## 统一的保存时序

粘贴图片并编辑的完整时序：

```
t=0ms    用户 Ctrl+V
         │
         ▼
t=0ms    图片 Blob 立即写入存储 ←──────────────── 同步
         │
         ▼
t=0ms    编辑器插入 ![](path)
         │
         ▼
t=0ms    onChange 触发
         │
         ▼
t=150ms  updateContent() 调用 ←────────────────── 150ms 防抖
         │
         ▼
t=150ms  documents 数组更新（含 content + updatedAt）
         │
         ▼
t=450ms  IndexedDB 写入 documents ←───────────── 300ms 防抖
```

---

## 统一的删除时序

删除文档的完整时序：

```
t=0ms    用户确认删除
         │
         ├─ 收集子文档 ID
         ├─ 收集图片路径
         ├─ 过滤共享图片引用
         │
         ▼
t=0ms    #setState({documents, currentDocId})
         │
         ├─ UI 立即更新
         │
         └─ persistence.schedule(['documents'])
              │
              ▼
t=300ms  IndexedDB 覆盖写入 ←────────────────── 300ms 防抖
         │
         ▼
t=0ms+   异步删除图片（不阻塞 UI）
         for (path of 未被引用的图片) {
             deleteImage(path);  // 清 Blob 缓存 + 删存储
         }
```

---

## 核心模块

### StoreManager

**文件**：[src/StoreManager.js](../src/StoreManager.js)

**职责**：管理文本数据的 IndexedDB 读写

```javascript
class StoreManager {
    static async init()                    // 初始化数据库
    static saveDocuments(docs)             // 保存文档列表
    static loadDocuments()                 // 加载文档列表
    static saveCurrentDocId(id)            // 保存当前文档 ID
    static loadCurrentDocId()              // 加载当前文档 ID
    static saveSettings(settings)          // 保存设置
    static loadSettings()                  // 加载设置
    static clearAll()                      // 清除所有数据
}
```

### PersistenceManager

**文件**：[src/PersistenceManager.js](../src/PersistenceManager.js)

**职责**：状态变化的自动持久化调度

```javascript
class PersistenceManager {
    static DEFAULT_CONFIG = {
        documents: { debounce: 300 },      // 300ms 防抖
        currentDocId: { immediate: true }, // 立即保存
        editor: { debounce: 300 },
        interface: { debounce: 300 },
        export: { debounce: 300 }
    };
    
    schedule(changedKeys)  // 调度持久化
    start()                // 启动
    stop()                 // 停止
}
```

### 图片存储管理器

**文件**：[src/utils/helpers.js](../src/utils/helpers.js)

**职责**：图片的存储、读取和删除

```javascript
// 保存
handlePastedImage(file)      // 处理粘贴图片
saveImage(path, blob)        // 保存到 IndexedDB

// 读取
getImageUrl(path)            // 获取 Blob URL（带缓存）
getImageAsBase64(path)       // 获取 Base64（用于导出）

// 删除
deleteImage(path)            // 删除图片
revokeBlobUrl(path)          // 清理单个 Blob URL 缓存
clearBlobUrlCache()          // 清理所有 Blob URL 缓存

// 工具
extractImagePaths(content)   // 从 Markdown 提取图片路径
isInternalImagePath(path)    // 检查是否为内部图片
generateImagePath(ext)       // 生成图片路径
```

---

## 平台差异

| 功能 | Web 环境 | Tauri 环境 |
|------|----------|------------|
| 文档存储 | IndexedDB | IndexedDB |
| 图片存储 | IndexedDB (`markdown-editor-images`) | 文件系统 (`{resourceDir}/imgs/`) |
| 图片路径 | `/imgs/...` (虚拟路径) | `/imgs/...` (映射到资源目录) |
| 图片读取 | Blob URL | 自定义协议 |

---

## Blob URL 缓存管理

为避免重复读取 IndexedDB，图片 URL 使用内存缓存：

```javascript
const blobUrlCache = new Map<string, Promise<string|null>>();

// 获取时缓存
export function getImageUrl(path) {
    if (blobUrlCache.has(path)) return blobUrlCache.get(path);
    // ... 读取并缓存
}

// 删除时清理
export async function revokeBlobUrl(path) {
    const promise = blobUrlCache.get(path);
    if (promise) {
        blobUrlCache.delete(path);
        const url = await promise;
        if (url) URL.revokeObjectURL(url);  // 释放内存
    }
}
```

---

## 最佳实践

### 1. 使用状态 API

```javascript
// ✅ 推荐：通过 EditorState 更新，自动持久化
state.updateContent(newContent);

// ❌ 不推荐：直接调用存储
StoreManager.saveDocuments(documents);
```

### 2. 批量操作跳过中间持久化

```javascript
// 批量更新时跳过持久化
#setState({ documents }, { skipPersist: true });
// 最后手动保存一次
await StoreManager.saveDocuments(documents);
```

### 3. 图片路径规范

```javascript
// ✅ 使用相对路径
const imagePath = '/imgs/2026-03-11/abc123.png';

// ✅ 检查是否为内部图片
if (isInternalImagePath(src)) {
    // 处理内部图片
}
```

---

## 相关文件

| 文件 | 说明 |
|------|------|
| [src/StoreManager.js](../src/StoreManager.js) | 文本数据存储管理 |
| [src/PersistenceManager.js](../src/PersistenceManager.js) | 持久化调度 |
| [src/EditorState.js](../src/EditorState.js) | 状态管理 |
| [src/utils/helpers.js](../src/utils/helpers.js) | 图片存储管理 |

