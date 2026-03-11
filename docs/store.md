# 数据存储设计文档

## 📋 目录

- [概述](#概述)
- [存储架构](#存储架构)
- [文本存储过程](#文本存储过程)
- [图片存储过程](#图片存储过程)
- [数据清理过程](#数据清理过程)
- [核心模块](#核心模块)
- [数据结构](#数据结构)
- [平台差异](#平台差异)
- [使用示例](#使用示例)
- [最佳实践](#最佳实践)

---

## 概述

本项目采用分层存储架构，将数据持久化分为三层：

1. **存储层 (StoreManager)**：负责与 IndexedDB 的底层交互
2. **持久化层 (PersistenceManager)**：负责状态变化的自动持久化调度
3. **状态层 (EditorState)**：负责状态管理和持久化触发

### 设计原则

- **渐进增强**：核心数据使用 IndexedDB，图片根据平台选择最优存储
- **自动持久化**：状态变化自动触发保存，无需手动调用
- **防抖优化**：高频更新场景使用防抖，避免频繁写入
- **平台适配**：Web 和桌面版根据平台能力选择存储方式

---

## 存储架构

### 整体架构图

```mermaid
graph TB
    subgraph "应用层"
        A[MarkdownEditor<br/>编辑器主控制器]
    end
    
    subgraph "状态管理层"
        B[EditorState<br/>状态管理器]
    end
    
    subgraph "持久化层"
        C[PersistenceManager<br/>持久化管理器]
    end
    
    subgraph "存储层"
        D[StoreManager<br/>数据存储管理器]
        E[helpers.js<br/>图片存储管理器]
    end
    
    subgraph "存储介质"
        F[(IndexedDB<br/>markdown-editor-db)]
        G[(IndexedDB<br/>markdown-editor-images)]
        H[文件系统<br/>Tauri 专用]
    end
    
    A --> B
    B --> C
    C --> D
    B -.->|状态变化| C
    C -.->|调度保存| D
    D --> F
    E --> G
    E -.->|Tauri 环境| H
```

### 数据流

```mermaid
sequenceDiagram
    participant User as 用户操作
    participant State as EditorState
    participant Persist as PersistenceManager
    participant Store as StoreManager
    participant IDB as IndexedDB

    User->>State: 修改内容/设置
    State->>State: #setState(updates)
    State->>Persist: schedule(changedKeys)
    
    alt 立即持久化
        Persist->>Store: saveCurrentDocId()
        Store->>IDB: 写入数据
    else 防抖持久化
        Persist->>Persist: 等待防抖延迟
        Persist->>Store: saveDocuments()
        Store->>IDB: 写入数据
    end
```

---

## 文本存储过程

### 整体流程

```mermaid
sequenceDiagram
    participant User as 用户编辑
    participant Editor as 编辑器组件
    participant State as EditorState
    participant Persist as PersistenceManager
    participant Store as StoreManager
    participant IDB as IndexedDB

    User->>Editor: 输入内容
    Editor->>State: updateContent(text)
    State->>State: #setState({content})
    State->>State: 更新 documents 数组
    State->>Persist: schedule(['documents'])
    
    alt 防抖延迟内无新操作
        Persist->>Persist: 等待 300ms
        Persist->>Store: saveDocuments(docs)
        Store->>IDB: transaction.put()
        IDB-->>Store: onsuccess
        Store-->>Persist: {success: true}
    end
```

### 详细步骤

#### 1. 状态更新（EditorState）

当用户编辑内容时，编辑器组件调用 `EditorState.updateContent()`:

```javascript
// src/EditorState.js
updateContent(content) {
    // 1. 查找当前文档
    const doc = this.#state.documents.find(d => d.id === this.#state.currentDocId);
    if (!doc) return;

    // 2. 创建更新后的文档对象
    const updatedDoc = {
        ...doc,
        content,
        updatedAt: new Date().toISOString()
    };

    // 3. 更新文档列表
    const documents = this.#state.documents.map(d =>
        d.id === doc.id ? updatedDoc : d
    );

    // 4. 触发状态更新（自动持久化）
    this.#setState({ content, documents });
}
```

#### 2. 持久化调度（PersistenceManager）

`#setState` 内部自动调用持久化管理器：

```javascript
// src/EditorState.js
#setState(updates, options = {}) {
    // ... 更新状态逻辑

    // 自动持久化（除非明确跳过）
    if (!options.skipPersist) {
        this.#persistence.schedule(changedKeys);
    }
}
```

PersistenceManager 根据配置决定持久化策略：

```javascript
// src/PersistenceManager.js
static DEFAULT_CONFIG = {
    documents: { debounce: 300 },    // 文档列表：300ms 防抖
    currentDocId: { immediate: true } // 当前文档 ID：立即保存
};

schedule(changedKeys) {
    // 分离立即持久化和延迟持久化的键
    const immediateKeys = [];
    const debouncedKeys = [];

    for (const key of changedKeys) {
        const config = this.#config[key];
        if (config?.immediate) {
            immediateKeys.push(key);
        } else if (config?.debounce) {
            debouncedKeys.push(key);
        }
    }

    // 立即持久化
    if (immediateKeys.length > 0) {
        this.#persistKeys(immediateKeys);
    }

    // 延迟持久化（防抖）
    if (debouncedKeys.length > 0) {
        this.#scheduleDebounced(debouncedKeys);
    }
}
```

#### 3. 数据写入（StoreManager）

持久化处理器调用 StoreManager 写入 IndexedDB：

```javascript
// src/PersistenceManager.js
static PERSIST_HANDLERS = {
    documents: state => StoreManager.saveDocuments(state.documents),
    // ...
};

// src/StoreManager.js
static saveDocuments(documents) {
    return setData(KEYS.DOCUMENTS, documents);
}

async function setData(key, value) {
    const database = await openDatabase();

    return new Promise(resolve => {
        const transaction = database.transaction([STORES.DATA], 'readwrite');
        const store = transaction.objectStore(STORES.DATA);

        // 存储格式：{ key: 'documents', value: [...] }
        const request = store.put({ key, value });

        request.onsuccess = () => resolve({ success: true });
        request.onerror = () => resolve({ success: false, error: request.error?.message });
    });
}
```

#### 4. IndexedDB 存储结构

```javascript
// 数据库配置
const DB_NAME = 'markdown-editor-db';
const DB_VERSION = 1;

// 对象存储
ObjectStore: 'data' { keyPath: 'key' }

// 存储记录示例
{
    key: 'documents',
    value: [
        {
            id: 'doc-1709234567890-abc123def',
            name: '我的文档',
            type: 'file',
            parentId: null,
            content: '# Hello World\n\n这是文档内容...',
            createdAt: '2026-03-11T10:30:00.000Z',
            updatedAt: '2026-03-11T10:35:00.000Z'
        }
    ]
}
```

### 防抖优化机制

```mermaid
graph LR
    A[用户输入] -->|t=0ms| B[schedule]
    B --> C[等待 300ms]
    D[用户继续输入] -->|t=150ms| E[schedule]
    E --> F[重置定时器]
    F --> G[等待 300ms]
    G -->|t=450ms| H[执行持久化]
    
    style H fill:#90EE90
```

防抖确保高频编辑时不会频繁写入存储，只在用户停止编辑 300ms 后才执行一次保存。

---

## 图片存储过程

### 整体流程

```mermaid
sequenceDiagram
    participant User as 用户粘贴
    participant Editor as 编辑器
    participant Helpers as helpers.js
    participant IDB as IndexedDB
    participant FS as 文件系统

    User->>Editor: Ctrl+V 粘贴图片
    Editor->>Helpers: extractImageFromClipboard()
    Helpers-->>Editor: File 对象
    Editor->>Helpers: handlePastedImage(file)
    
    alt 图片过大
        Helpers-->>Editor: 抛出错误
    end
    
    Helpers->>Helpers: generateImagePath(ext)
    
    alt Web 环境
        Helpers->>IDB: saveImage(path, blob)
        IDB-->>Helpers: 保存成功
    else Tauri 环境
        Helpers->>FS: writeFile(path, data)
        FS-->>Helpers: 保存成功
    end
    
    Helpers-->>Editor: 返回图片路径
    Editor->>Editor: 插入 ![image](path)
```

### 详细步骤

#### 1. 检测粘贴图片

编辑器监听粘贴事件，提取图片文件：

```javascript
// src/components/CodeMirrorEditor.js
async #handlePaste(event) {
    const imageFile = extractImageFromClipboard(event.clipboardData);
    if (imageFile) {
        const imagePath = await this.options.onImagePaste(imageFile);
        if (imagePath) this.#insertImage(imagePath);
    }
}

// src/utils/helpers.js
export function extractImageFromClipboard(clipboardData) {
    if (!clipboardData) return null;
    for (const item of clipboardData.items) {
        if (item.type.startsWith('image/')) {
            return item.getAsFile();
        }
    }
    return null;
}
```

#### 2. 校验图片大小

```javascript
// src/utils/helpers.js
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

export async function handlePastedImage(file) {
    // 校验文件大小
    if (file.size > MAX_IMAGE_SIZE) {
        throw new Error(`图片大小超过限制（最大 ${MAX_IMAGE_SIZE / 1024 / 1024}MB）`);
    }
    // ...
}
```

#### 3. 生成图片路径

```javascript
// src/utils/helpers.js
export function generateImagePath(ext = 'png') {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return `/imgs/${dateStr}/${randomString(16)}.${ext}`;
}

// 示例路径: /imgs/2026-03-11/a1b2c3d4e5f6g7h8.png
```

路径格式说明：
- `/imgs/` - 固定前缀目录
- `2026-03-11/` - 按日期分组，便于管理
- `a1b2c3d4e5f6g7h8` - 16位随机字符串，防止冲突
- `.png` - 根据 MIME 类型推断的扩展名

#### 4. Web 环境存储（IndexedDB）

```javascript
// src/utils/helpers.js
const DB_NAME = 'markdown-editor-images';
const STORE_NAME = 'images';

export async function saveImage(path, blob) {
    const database = await initImageDB();
    return new Promise((resolve, reject) => {
        const store = database.transaction([STORE_NAME], 'readwrite')
            .objectStore(STORE_NAME);
        
        // 存储结构：{ path, blob, timestamp }
        const request = store.put({ 
            path, 
            blob, 
            timestamp: Date.now() 
        });
        
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('Failed to save image'));
    });
}
```

#### 5. Tauri 环境存储（文件系统）

```javascript
// src/utils/helpers.js
export async function handlePastedImage(file) {
    // ...校验和路径生成

    if (window.__TAURI__) {
        const { writeFile, mkdir } = window.__TAURI__.fs;
        const { join, dirname, resourceDir } = window.__TAURI__.path;

        // 转换为 ArrayBuffer
        const arrayBuffer = await file.arrayBuffer();
        
        // 获取资源目录路径
        const resourceDirPath = await resourceDir();
        const fullPath = await join(resourceDirPath, imagePath.slice(1));
        const dirPath = await dirname(fullPath);

        // 创建目录（如果不存在）
        try { 
            await mkdir(dirPath, { recursive: true }); 
        } catch { /* ignore */ }
        
        // 写入文件
        await writeFile(fullPath, new Uint8Array(arrayBuffer));
        return imagePath;
    }

    // Web 环境降级
    await saveImage(imagePath, file);
    return imagePath;
}
```

### 图片读取流程

#### Web 环境：获取 Blob URL

```javascript
// src/utils/helpers.js
const blobUrlCache = new Map(); // 缓存避免重复读取

export function getImageUrl(path) {
    // 检查缓存
    if (blobUrlCache.has(path)) {
        return blobUrlCache.get(path);
    }

    const promise = initImageDB().then(database => {
        return new Promise((resolve, reject) => {
            const store = database.transaction([STORE_NAME], 'readonly')
                .objectStore(STORE_NAME);
            const request = store.get(path);
            
            request.onsuccess = () => {
                const result = request.result;
                if (result) {
                    // 创建 Blob URL 供 img 标签使用
                    resolve(URL.createObjectURL(result.blob));
                } else {
                    resolve(null);
                }
            };
            request.onerror = () => reject(new Error('Failed to get image'));
        });
    });

    blobUrlCache.set(path, promise);
    return promise;
}
```

#### Tauri 环境：转换为自定义协议

```javascript
// 在 Tauri 配置中，/imgs/ 路径映射到资源目录
// 图片 URL 自动转换为 tauri://localhost/imgs/... 或类似协议
```

### 导出时的图片处理

```javascript
// src/components/Exporter.js
async #loadImageAsBase64(src) {
    if (window.__TAURI__) {
        // Tauri：从文件系统读取
        const { readFile } = window.__TAURI__.fs;
        const { join, resourceDir } = window.__TAURI__.path;
        
        const resourceDirPath = await resourceDir();
        const fullPath = await join(resourceDirPath, src.replace(/^\/?/, ''));
        const uint8Array = await readFile(fullPath);
        
        // 转换为 Base64
        const ext = src.split('.').pop()?.toLowerCase() || 'png';
        const mime = { png: 'image/png', jpg: 'image/jpeg', ... }[ext];
        return `data:${mime};base64,${base64}`;
    }
    
    // Web：从 IndexedDB 读取
    return await getImageAsBase64(src);
}
```

---

## 数据清理过程

### 清理类型概览

| 清理类型 | 触发时机 | 影响范围 |
|----------|----------|----------|
| 单个图片删除 | 手动删除图片引用 | 释放单个图片存储 |
| Blob URL 缓存清理 | 内存管理/应用卸载 | 释放内存中的 URL 对象 |
| 文档删除 | 删除文档/文件夹 | 清除文档数据（图片需手动清理） |
| 全部数据清除 | 重置应用/清除缓存 | 清除所有持久化数据 |

### 1. 单个图片删除

```mermaid
sequenceDiagram
    participant User as 用户
    participant Helper as helpers.js
    participant Cache as BlobUrlCache
    participant IDB as IndexedDB
    participant FS as 文件系统

    User->>Helper: deleteImage(path)
    Helper->>Cache: revokeBlobUrl(path)
    Cache->>Cache: 从缓存移除
    Cache->>Cache: URL.revokeObjectURL()
    
    alt Web 环境
        Helper->>IDB: store.delete(path)
        IDB-->>Helper: 删除成功
    else Tauri 环境
        Helper->>FS: remove(fullPath)
        FS-->>Helper: 删除成功
    end
```

```javascript
// src/utils/helpers.js
export async function deleteImage(path) {
    // 1. 清理 Blob URL 缓存
    await revokeBlobUrl(path);

    // 2. Tauri 环境：从文件系统删除
    if (window.__TAURI__) {
        try {
            const { remove } = window.__TAURI__.fs;
            const { join, resourceDir } = window.__TAURI__.path;
            const resourceDirPath = await resourceDir();
            const fullPath = await join(resourceDirPath, path.replace(/^\/?/, ''));
            await remove(fullPath);
        } catch {
            // 文件可能不存在，忽略错误
        }
        return;
    }

    // 3. Web 环境：从 IndexedDB 删除
    const database = await initImageDB();
    return new Promise((resolve, reject) => {
        const store = database.transaction([STORE_NAME], 'readwrite')
            .objectStore(STORE_NAME);
        const request = store.delete(path);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('Failed to delete image'));
    });
}
```

### 2. Blob URL 缓存清理

Blob URL 是浏览器内存中的临时 URL，需要手动释放：

```javascript
// src/utils/helpers.js

// 清理单个 Blob URL
export async function revokeBlobUrl(path) {
    const promise = blobUrlCache.get(path);
    if (promise) {
        blobUrlCache.delete(path);
        try {
            const url = await promise;
            if (url) URL.revokeObjectURL(url); // 释放内存
        } catch {
            // Promise 失败时无需撤销
        }
    }
}

// 清理所有 Blob URL（应用卸载时调用）
export async function clearBlobUrlCache() {
    const promises = Array.from(blobUrlCache.values());
    blobUrlCache.clear();
    
    const urls = await Promise.allSettled(promises);
    for (const result of urls) {
        if (result.status === 'fulfilled' && result.value) {
            URL.revokeObjectURL(result.value);
        }
    }
}
```

### 3. 文档删除流程

```mermaid
sequenceDiagram
    participant User as 用户
    participant Sidebar as LeftSidebar
    participant State as EditorState
    participant Persist as PersistenceManager
    participant Store as StoreManager

    User->>Sidebar: 点击删除按钮
    Sidebar->>Sidebar: Dialog.confirm()
    
    alt 用户确认
        Sidebar->>State: deleteDocuments(docId)
        State->>State: #collectDescendants()
        State->>State: 收集所有子文档
        State->>State: 过滤掉待删除文档
        State->>Persist: schedule(['documents', 'currentDocId'])
        Persist->>Store: saveDocuments()
        Persist->>Store: saveCurrentDocId()
    else 用户取消
        Sidebar-->>User: 取消操作
    end
```

```javascript
// src/EditorState.js
deleteDocuments(docIds, options = {}) {
    const ids = Array.isArray(docIds) ? docIds : [docIds];
    if (ids.length === 0) return;

    const toDelete = new Set(ids);

    // 递归收集所有子项
    for (const docId of ids) {
        this.#collectDescendants(docId, toDelete);
    }

    // 过滤掉待删除的文档
    const documents = this.#state.documents.filter(
        doc => !toDelete.has(doc.id)
    );

    // 检查当前文档是否被删除
    const currentDocId = toDelete.has(this.#state.currentDocId)
        ? null
        : this.#state.currentDocId;

    // 触发状态更新和持久化
    this.#setState({ documents, currentDocId }, options);
}

// 递归收集子文档
#collectDescendants(docId, toDelete) {
    const stack = [docId];
    while (stack.length > 0) {
        const currentId = stack.pop();
        for (const doc of this.#state.documents) {
            if (doc.parentId === currentId && !toDelete.has(doc.id)) {
                toDelete.add(doc.id);
                stack.push(doc.id);
            }
        }
    }
}
```

> ⚠️ **注意**：当前实现中，删除文档时**不会自动清理**文档中引用的图片。如需清理图片，需要：
> 1. 解析文档内容提取图片路径
> 2. 调用 `deleteImage()` 删除每个图片

### 4. 全部数据清除

```javascript
// src/StoreManager.js
static async clearAll() {
    try {
        const database = await openDatabase();

        return new Promise((resolve, reject) => {
            const transaction = database.transaction([STORES.DATA], 'readwrite');
            const store = transaction.objectStore(STORES.DATA);
            const request = store.clear(); // 清空对象存储

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (e) {
        console.error('清除数据失败:', e);
    }
}
```

清除所有数据的完整流程：

```javascript
// 完整清除示例
async function clearAllData() {
    // 1. 清除文本数据（文档、设置等）
    await StoreManager.clearAll();
    
    // 2. 清除图片数据（Web 环境）
    if (!window.__TAURI__) {
        const database = await initImageDB();
        await new Promise((resolve, reject) => {
            const store = database.transaction([STORE_NAME], 'readwrite')
                .objectStore(STORE_NAME);
            const request = store.clear();
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
    
    // 3. 清理 Blob URL 缓存
    await clearBlobUrlCache();
    
    // 4. 重新加载应用
    location.reload();
}
```

---

## 核心模块

### StoreManager - 数据存储管理器

**文件位置**：[src/StoreManager.js](../src/StoreManager.js)

负责管理所有核心数据的 IndexedDB 存储操作。

#### 数据库配置

```javascript
const DB_NAME = 'markdown-editor-db';
const DB_VERSION = 1;

const STORES = {
    DATA: 'data'  // 单一对象存储，通过键区分数据类型
};

const KEYS = {
    DOCUMENTS: 'documents',      // 文档列表
    CURRENT_DOC_ID: 'currentDocId', // 当前文档 ID
    SETTINGS: 'settings'         // 用户设置
};
```

#### 核心 API

| 方法 | 说明 | 返回值 |
|------|------|--------|
| `init()` | 初始化数据库连接 | `Promise<void>` |
| `saveDocuments(docs)` | 保存文档列表 | `Promise<{success, error?}>` |
| `loadDocuments()` | 加载文档列表 | `Promise<Array>` |
| `saveCurrentDocId(id)` | 保存当前文档 ID | `Promise<{success, error?}>` |
| `loadCurrentDocId()` | 加载当前文档 ID | `Promise<string\|null>` |
| `saveSettings(settings)` | 保存用户设置 | `Promise<{success, error?}>` |
| `loadSettings()` | 加载用户设置 | `Promise<Object\|null>` |
| `clearAll()` | 清除所有数据 | `Promise<void>` |

#### 存储结构

IndexedDB 使用单一对象存储（Object Store），通过 `key` 字段区分不同数据：

```javascript
// 存储结构
{
    key: 'documents' | 'currentDocId' | 'settings',
    value: <实际数据>
}
```

---

### PersistenceManager - 持久化管理器

**文件位置**：[src/PersistenceManager.js](../src/PersistenceManager.js)

负责状态变化的自动持久化调度，支持防抖和立即保存策略。

#### 默认配置

```javascript
static DEFAULT_CONFIG = {
    documents: { debounce: 300 },    // 300ms 防抖
    currentDocId: { immediate: true }, // 立即保存
    editor: { debounce: 300 },
    interface: { debounce: 300 },
    export: { debounce: 300 }
};
```

#### 持久化处理器

```javascript
static PERSIST_HANDLERS = {
    documents: state => StoreManager.saveDocuments(state.documents),
    currentDocId: state => StoreManager.saveCurrentDocId(state.currentDocId),
    settings: state => StoreManager.saveSettings({
        editor: state.editor,
        interface: state.interface,
        export: state.export
    })
};
```

#### 工作流程

1. **状态变化检测**：EditorState 调用 `schedule(changedKeys)`
2. **策略分离**：
   - `immediate: true` → 立即持久化
   - `debounce: N` → 延迟 N 毫秒后持久化
3. **合并写入**：多个防抖键合并为一次写入
4. **处理器映射**：`editor/interface/export` 合并为 `settings` 存储

---

### 图片存储管理器

**文件位置**：[src/utils/helpers.js](../src/utils/helpers.js)

负责图片的存储和读取，根据运行环境选择不同存储方式。

#### 数据库配置

```javascript
const DB_NAME = 'markdown-editor-images';
const DB_VERSION = 1;
const STORE_NAME = 'images';
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
```

#### 图片路径格式

```javascript
// 格式: /imgs/YYYY-MM-DD/随机字符串.扩展名
// 示例: /imgs/2026-03-11/a1b2c3d4e5f6g7h8.png
function generateImagePath(ext = 'png') {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return `/imgs/${dateStr}/${randomString(16)}.${ext}`;
}
```

#### 核心 API

| 方法 | 说明 | 平台 |
|------|------|------|
| `handlePastedImage(file)` | 保存粘贴的图片 | 通用 |
| `getImageUrl(path)` | 获取图片 Blob URL | Web |
| `getImageAsBase64(path)` | 获取图片 Base64 | Web |
| `deleteImage(path)` | 删除图片 | 通用 |
| `isInternalImagePath(path)` | 检查是否为内部图片路径 | 通用 |

---

## 数据结构

### 文档数据结构

```typescript
interface Document {
    id: string;           // 唯一标识
    name: string;         // 文档名称
    type: 'file' | 'folder';  // 类型
    parentId: string | null;  // 父文件夹 ID
    content?: string;     // 文档内容（仅 file 类型）
    createdAt: string;    // 创建时间 ISO 字符串
    updatedAt: string;    // 更新时间 ISO 字符串
}
```

### 设置数据结构

```typescript
interface Settings {
    editor: {
        type: 'codemirror' | 'monaco';
        fontSize: number;
        lineHeight: number;
        autoSave: boolean;
        insertSpaces: boolean;
        tabSize: number;
        wordWrap: boolean;
        highlightActiveLine: boolean;
        codemirror: { /* CodeMirror 特有设置 */ };
        monaco: { /* Monaco 特有设置 */ };
    };
    interface: {
        theme: 'light' | 'dark';
        layout: string;
        leftRatio: number;
        leftSidebarOpen: boolean;
        rightSidebarOpen: boolean;
        syncScrollEnabled: boolean;
    };
    export: {
        includeStyle: boolean;
        codeHighlight: boolean;
    };
}
```

### 图片存储结构（Web 环境）

```typescript
interface ImageRecord {
    path: string;      // 图片路径（主键）
    blob: Blob;        // 图片二进制数据
    timestamp: number; // 保存时间戳
}
```

---

## 平台差异

### 环境检测

通过 `window.__TAURI__` 全局对象判断运行环境：

```javascript
if (window.__TAURI__) {
    // Tauri 桌面环境
} else {
    // Web 浏览器环境
}
```

### 存储策略对比

| 数据类型 | Web 环境 | 桌面环境 (Tauri) |
|----------|----------|------------------|
| 文档列表 | IndexedDB | IndexedDB |
| 当前文档 ID | IndexedDB | IndexedDB |
| 用户设置 | IndexedDB | IndexedDB |
| 图片文件 | IndexedDB | 文件系统 |

### 图片存储实现

#### Web 环境

```javascript
// src/utils/helpers.js - 保存图片
export async function saveImage(path, blob) {
    const database = await initImageDB();
    return new Promise((resolve, reject) => {
        const store = database.transaction([STORE_NAME], 'readwrite')
            .objectStore(STORE_NAME);
        const request = store.put({ path, blob, timestamp: Date.now() });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('Failed to save image'));
    });
}

// 获取图片 URL
export function getImageUrl(path) {
    // 使用缓存避免重复读取 IndexedDB
    if (blobUrlCache.has(path)) return blobUrlCache.get(path);
    // ... 从 IndexedDB 读取并创建 Blob URL
}
```

#### 桌面环境 (Tauri)

```javascript
// src/utils/helpers.js - 保存图片到文件系统
export async function handlePastedImage(file) {
    // ...
    if (window.__TAURI__) {
        const { writeFile, mkdir } = window.__TAURI__.fs;
        const { join, dirname, resourceDir } = window.__TAURI__.path;

        const arrayBuffer = await file.arrayBuffer();
        const resourceDirPath = await resourceDir();
        const fullPath = await join(resourceDirPath, imagePath.slice(1));
        const dirPath = await dirname(fullPath);

        try { await mkdir(dirPath, { recursive: true }); } catch { /* ignore */ }
        await writeFile(fullPath, new Uint8Array(arrayBuffer));
        return imagePath;
    }
    // Web 环境降级到 IndexedDB
}
```

### 图片删除实现

```javascript
// src/utils/helpers.js - 删除图片
export async function deleteImage(path) {
    await revokeBlobUrl(path); // 清理 Blob URL 缓存

    if (window.__TAURI__) {
        // 桌面版：从文件系统删除
        const { remove } = window.__TAURI__.fs;
        const { join, resourceDir } = window.__TAURI__.path;
        const resourceDirPath = await resourceDir();
        const fullPath = await join(resourceDirPath, path.replace(/^\/?/, ''));
        await remove(fullPath);
    } else {
        // Web 版：从 IndexedDB 删除
        const database = await initImageDB();
        // ... 删除操作
    }
}
```

### 导出时的图片处理

```javascript
// src/components/Exporter.js - 导出时加载图片
async #loadImageAsBase64(src) {
    if (window.__TAURI__) {
        // 桌面版：从文件系统读取
        const { readFile } = window.__TAURI__.fs;
        const { join, resourceDir } = window.__TAURI__.path;
        const fullPath = await join(resourceDirPath, src.replace(/^\/?/, ''));
        const uint8Array = await readFile(fullPath);
        return `data:${mime};base64,${base64}`;
    }
    // Web 版：从 IndexedDB 读取
    return await getImageAsBase64(src);
}
```

---

## 使用示例

### 初始化存储

```javascript
// src/EditorState.js - 初始化时加载数据
async init() {
    // 初始化 IndexedDB
    await StoreManager.init();

    // 加载保存的数据
    const documents = await StoreManager.loadDocuments();
    const savedDocId = await StoreManager.loadCurrentDocId();
    const savedSettings = await StoreManager.loadSettings();

    // 合并设置
    const settings = savedSettings
        ? { ...EditorState.DEFAULT_SETTINGS, ...savedSettings }
        : EditorState.DEFAULT_SETTINGS;

    // 初始化状态...
}
```

### 状态变化自动持久化

```javascript
// 状态更新时自动触发持久化
#setState(updates, options = {}) {
    // ... 更新状态逻辑

    // 自动持久化（除非明确跳过）
    if (!options.skipPersist) {
        this.#persistence.schedule(changedKeys);
    }
}
```

### 手动保存文档

```javascript
// 直接使用 StoreManager
await StoreManager.saveDocuments(documents);
await StoreManager.saveCurrentDocId(docId);
```

### 处理粘贴图片

```javascript
import { handlePastedImage, isInternalImagePath } from '../utils/helpers.js';

// 处理粘贴的图片
const imageFile = extractImageFromClipboard(clipboardData);
if (imageFile) {
    const imagePath = await handlePastedImage(imageFile);
    // 插入 Markdown 图片语法
    editor.insertText(`![image](${imagePath})`);
}
```

---

## 最佳实践

### 1. 使用状态 API 而非直接存储

```javascript
// ✅ 推荐：通过 EditorState 更新，自动持久化
state.updateContent(newContent);
state.updateEditorConfig({ fontSize: 18 });

// ❌ 不推荐：直接调用存储（除非有特殊需求）
StoreManager.saveDocuments(documents);
```

### 2. 高频更新使用防抖

```javascript
// 编辑器内容变化使用防抖持久化
// PersistenceManager 默认配置已处理
documents: { debounce: 300 }
```

### 3. 关键数据立即持久化

```javascript
// 当前文档 ID 变化立即保存
currentDocId: { immediate: true }
```

### 4. 批量操作跳过中间持久化

```javascript
// 批量更新时跳过持久化
#setState({ documents, content }, { skipPersist: true });
// 最后手动保存一次
await StoreManager.saveDocuments(documents);
```

### 5. 图片路径规范

```javascript
// ✅ 使用相对路径
const imagePath = '/imgs/2026-03-11/abc123.png';

// ✅ 检查是否为内部图片
if (isInternalImagePath(src)) {
    // 处理内部图片
}
```

### 6. 清理资源

```javascript
// 删除文档时清理关联图片
for (const image of images) {
    await deleteImage(image.path);
}
```

---

## 存储容量

### IndexedDB 限制

| 浏览器 | 默认配额 | 说明 |
|--------|----------|------|
| Chrome | 可用磁盘空间的 60% | 动态分配 |
| Firefox | 可用磁盘空间的 50% | 最小 10MB |
| Safari | 约 1GB | 固定配额 |

### 图片大小限制

```javascript
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

if (file.size > MAX_IMAGE_SIZE) {
    throw new Error(`图片大小超过限制（最大 ${MAX_IMAGE_SIZE / 1024 / 1024}MB）`);
}
```

---

## 错误处理

### 存储失败处理

```javascript
// StoreManager 返回统一格式
const result = await StoreManager.saveDocuments(documents);
if (!result.success) {
    console.error('保存失败:', result.error);
    // 显示用户友好的错误提示
}
```

### IndexedDB 降级

```javascript
// 初始化失败时的处理
try {
    await StoreManager.init();
} catch (error) {
    console.error('IndexedDB 初始化失败:', error);
    // 可考虑降级到 localStorage（容量更小）
}
```

---

## 相关文件

| 文件 | 说明 |
|------|------|
| [src/StoreManager.js](../src/StoreManager.js) | 数据存储管理器 |
| [src/PersistenceManager.js](../src/PersistenceManager.js) | 持久化管理器 |
| [src/EditorState.js](../src/EditorState.js) | 状态管理器 |
| [src/utils/helpers.js](../src/utils/helpers.js) | 图片存储管理 |
| [tests/store.test.js](../tests/store.test.js) | 存储单元测试 |
| [tests/persistence.test.js](../tests/persistence.test.js) | 持久化单元测试 |
