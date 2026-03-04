/**
 * 编辑器状态管理器
 * 采用观察者模式，实现状态驱动的UI更新
 * 集成自动持久化功能，统一管理数据存储
 *
 * @example
 * ```js
 * const state = new EditorState();
 * state.subscribe((newState, oldState) => {
 *   console.log('State changed:', newState);
 * });
 * // 使用公共 API 更新状态
 * state.updateContent('Hello');
 * state.updateEditorConfig({ fontSize: 16 });
 * state.addDocument(doc);
 * state.setCurrentDocument(docId);
 * ```
 */
import { StoreManager } from './StoreManager.js';
import { PersistenceManager } from './PersistenceManager.js';

/**
 *
 */
export class EditorState {
    // ==================== 静态常量 ====================

    /**
     * 默认设置配置
     * @static
     * @type {Object}
     */
    static DEFAULT_SETTINGS = {
        editor: {
            // 通用设置（适用于所有编辑器）
            type: 'monaco', // 编辑器类型: 'codemirror' | 'monaco'
            fontSize: 16,
            lineHeight: 1.6,
            autoSave: true,
            insertSpaces: true,
            tabSize: 4,
            wordWrap: true,
            highlightActiveLine: true,

            // CodeMirror 特有设置
            codemirror: {
                lineNumbers: true,
                bracketMatching: true,
                renderWhitespace: false // CodeMirror 只支持开/关
            },

            // Monaco 特有设置
            monaco: {
                minimap: true,
                bracketPairColorization: true,
                cursorBlinking: 'smooth',
                smoothScrolling: true,
                renderWhitespace: 'selection' // Monaco 支持完整选项
            }
        },
        interface: {
            theme: 'light',
            layout: 'layout-both',
            leftRatio: 0.5,
            leftSidebarOpen: false,
            rightSidebarOpen: false,
            syncScrollEnabled: true
        },
        export: {
            includeStyle: true,
            codeHighlight: true
        }
    };

    /**
     * 默认 Markdown 内容
     * @static
     * @type {string}
     */
    static DEFAULT_CONTENT = `# Markdown 语法指南

## 标题

# 这是一级标题
## 这是二级标题
###### 这是六级标题

## 强调

*这段文本会是斜体*

_这段文本也会是斜体_

**这段文本会是粗体**

__这段文本也会是粗体_

_你可以**组合**使用它们_

## 列表

### 无序列表

* 项目 1
* 项目 2
  * 项目 2a
  * 项目 2b

### 有序列表

1. 项目 1
2. 项目 2
3. 项目 3
  1. 项目 3a
  2. 项目 3b

### 复选列表

- [x] 已完成任务
- [ ] 未完成任务

## 代码

### 行内代码

这是一个 \`行内代码\` 示例。

### 代码块

#### JavaScript
\`\`\`javascript
function hello() {
    console.log("Hello, World!");
}
\`\`\`

#### Python
\`\`\`python
def hello():
    print("Hello, World!")
\`\`\`

#### Java
\`\`\`java
public class Hello {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
\`\`\`

#### C
\`\`\`c
#include <stdio.h>
int main() {
    printf("Hello, World!\\n");
    return 0;
}
\`\`\`

#### C++
\`\`\`cpp
#include <iostream>
int main() {
    std::cout << "Hello, World!" << std::endl;
    return 0;
}
\`\`\`

#### C#
\`\`\`csharp
using System;
class Program {
    static void Main() {
        Console.WriteLine("Hello, World!");
    }
}
\`\`\`

#### Ruby
\`\`\`ruby
puts "Hello, World!"
\`\`\`

#### Go
\`\`\`go
package main
import "fmt"
func main() {
    fmt.Println("Hello, World!")
}
\`\`\`

#### Rust
\`\`\`rust
fn main() {
    println!("Hello, World!");
}
\`\`\`

#### Swift
\`\`\`swift
print("Hello, World!")
\`\`\`

#### Kotlin
\`\`\`kotlin
fun main() {
    println("Hello, World!")
}
\`\`\`

#### TypeScript
\`\`\`typescript
function hello(): void {
    console.log("Hello, World!");
}
\`\`\`

#### SQL
\`\`\`sql
SELECT * FROM users WHERE name = 'Alice';
\`\`\`

#### Bash
\`\`\`bash
echo "Hello, World!"
\`\`\`

#### JSON
\`\`\`json
{
    "message": "Hello, World!"
}
\`\`\`

#### YAML
\`\`\`yaml
message: Hello, World!
\`\`\`

## 引用

> 这是一段引用文字。
>> 这是嵌套引用。

## 表格

| 左列 | 右列 |
| --- | --- |
| 左 foo | 右 foo |
| 左 bar | 右 bar |

## 链接

[访问 GitHub](https://github.com)

## Mermaid 图表

\`\`\`mermaid
graph TD
    A[开始] --> B{判断}
    B -->|是| C[执行]
    B -->|否| D[跳过]
    C --> E[结束]
    D --> E
\`\`\`

\`\`\`mermaid
sequenceDiagram
    participant A as 用户
    participant B as 系统
    A->>B: 发送请求
    B-->>A: 返回响应
\`\`\`

## 数学公式

### 行内公式

爱因斯坦质能方程是 $E = mc^2$，这是物理学中最著名的公式之一。

勾股定理：$a^2 + b^2 = c^2$

圆的面积：$A = \\pi r^2$

### 块级公式

#### 基础运算

$$
E = mc^2
$$

$$
a^2 + b^2 = c^2
$$

#### 分数和根号

$$
\\frac{a}{b} = \\frac{c}{d}
$$

$$
\\sqrt{x^2 + y^2}
$$

$$
\\sqrt[3]{x}
$$

#### 求和与积分

$$
\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}
$$

$$
\\sum_{i=1}^{\\infty} \\frac{1}{i^2} = \\frac{\\pi^2}{6}
$$

$$
\\int_{a}^{b} f(x) dx
$$

$$
\\int_{-\\infty}^{\\infty} e^{-x^2} dx = \\sqrt{\\pi}
$$

#### 极限

$$
\\lim_{x \\to \\infty} \\frac{1}{x} = 0
$$

$$
\\lim_{x \\to 0} \\frac{\\sin x}{x} = 1
$$

#### 矩阵

$$
\\begin{pmatrix}
a & b \\\\
c & d
\\end{pmatrix}
$$

$$
\\begin{bmatrix}
1 & 2 & 3 \\\\
4 & 5 & 6 \\\\
7 & 8 & 9
\\end{bmatrix}
$$

#### 方程组

$$
\\begin{cases}
x + y = 10 \\\\
x - y = 2
\\end{cases}
$$

解得：$x = 6, y = 4$

#### 复杂公式

$$
e^{i\\pi} + 1 = 0
$$

$$
\\nabla \\cdot \\mathbf{E} = \\frac{\\rho}{\\varepsilon_0}
$$

$$
i\\hbar \\frac{\\partial}{\\partial t}\\Psi(x,t) = \\hat{H}\\Psi(x,t)
$$
`;

    /**
     * 事件钩子类型定义
     * @deprecated 这个系统当前未被使用，已删除相关代码
     */

    // ==================== 私有字段 ====================

    /** @private */
    #updateTimestampTimeout = null;

    /** @type {Object} 核心状态对象 */
    #state = {
        // 文档相关
        documents: [],
        currentDocId: null,
        selectedDocIds: [], // 多选文档ID列表
        lastClickedDocId: null, // 用于Shift范围选择的起始点
        // 编辑器内容
        content: '',

        // 编辑器配置 - 引用默认设置
        editor: { ...EditorState.DEFAULT_SETTINGS.editor },

        // 界面配置 - 引用默认设置
        interface: {
            ...EditorState.DEFAULT_SETTINGS.interface
        },

        // 导出配置 - 引用默认设置
        export: { ...EditorState.DEFAULT_SETTINGS.export },

        // 渲染状态
        isRenderingMermaid: false,
        headings: [], // 标题数据，用于目录生成
        activeHeadingId: null, // 当前滚动高亮的标题 ID

        // 通知状态
        notification: null // { message, type, timestamp }
    };

    /** @type {Map<string, Set<Function>>} 特定键的监听器 */
    #listeners = new Map();

    /** @type {Set<Function>} 全局监听器 */
    #globalListeners = new Set();

    /** @private */
    #persistence = new PersistenceManager(() => this.#state);

    // ==================== 状态访问 ====================

    /**
     * 获取单个状态值
     * @template T
     * @param {string} key - 状态键
     * @param {boolean} [clone=false] - 是否返回深拷贝（需要修改数据时设为 true）
     * @returns {T} 状态值
     */
    get(key, clone = false) {
        const value = this.#state[key];
        if (!clone) {
            return value;
        }
        // 深拷贝逻辑
        if (value === null || value === undefined || typeof value !== 'object') {
            return value;
        }
        try {
            return structuredClone(value);
        } catch {
            return JSON.parse(JSON.stringify(value));
        }
    }

    /**
     * 批量更新状态（私有方法，仅供内部使用）
     * @private
     * @param {Object} updates - 要更新的状态对象
     * @param {Object} options - 选项
     * @param {boolean} [options.silent=false] - 是否静默更新（不触发通知）
     * @param {boolean} [options.force=false] - 是否强制更新（即使值相同也触发通知）
     * @param {boolean} [options.skipPersist=false] - 是否跳过持久化
     */
    #setState(updates, options = {}) {
        let hasChanges = false;
        const changedKeys = [];

        // 检查是否有实际变化（除非强制更新）
        if (!options.force) {
            for (const key in updates) {
                if (!Object.is(this.#state[key], updates[key])) {
                    hasChanges = true;
                    changedKeys.push(key);
                }
            }

            // 如果没有变化且不是静默更新，可以跳过
            if (!hasChanges && !options.silent) {
                return;
            }
        }

        // 只在需要通知时创建旧状态副本
        const oldState = !options.silent && hasChanges ? { ...this.#state } : null;

        // 更新状态
        Object.assign(this.#state, updates);

        // 如果不是静默更新，通知监听器（传递 force 选项）
        if (!options.silent && oldState) {
            this.#notify(oldState, this.#state, options.force, changedKeys);
        }

        // 自动持久化（除非明确跳过）
        if (!options.skipPersist) {
            this.#persistence.schedule(changedKeys);
        }
    }

    // ==================== 初始化和生命周期 ====================

    /**
     * 初始化状态（从 IndexedDB 加载，不触发监听器和持久化）
     * 在内部处理所有初始化逻辑，包括选择当前文档
     * @returns {Promise<void>}
     */
    async init() {
        // 初始化 IndexedDB
        await StoreManager.init();

        const documents = await StoreManager.loadDocuments();
        const savedDocId = await StoreManager.loadCurrentDocId();
        const savedSettings = await StoreManager.loadSettings();

        // 合并保存的设置和默认设置
        const settings = savedSettings
            ? {
                  editor: {
                      ...EditorState.DEFAULT_SETTINGS.editor,
                      ...savedSettings.editor,
                      // 深度合并嵌套的编辑器特定设置
                      codemirror: {
                          ...EditorState.DEFAULT_SETTINGS.editor.codemirror,
                          ...savedSettings.editor?.codemirror
                      },
                      monaco: {
                          ...EditorState.DEFAULT_SETTINGS.editor.monaco,
                          ...savedSettings.editor?.monaco
                      }
                  },
                  interface: {
                      ...EditorState.DEFAULT_SETTINGS.interface,
                      ...savedSettings.interface
                  },
                  export: { ...EditorState.DEFAULT_SETTINGS.export, ...savedSettings.export }
              }
            : {
                  editor: { ...EditorState.DEFAULT_SETTINGS.editor },
                  interface: { ...EditorState.DEFAULT_SETTINGS.interface },
                  export: { ...EditorState.DEFAULT_SETTINGS.export }
              };

        // 确定当前文档和内容
        let currentDocId = null;
        let content = EditorState.DEFAULT_CONTENT;

        // 尝试使用保存的文档 ID
        if (savedDocId) {
            const doc = documents.find(d => d.id === savedDocId && d.type !== 'folder');
            if (doc) {
                currentDocId = doc.id;
                content = doc.content || '';
            }
        }

        // 如果没有找到保存的文档，选择第一个非文件夹文档
        if (!currentDocId) {
            const firstDoc = documents.find(d => d.type !== 'folder');
            if (firstDoc) {
                currentDocId = firstDoc.id;
                content = firstDoc.content || '';
            }
        }

        // 直接初始化状态（不触发监听器和持久化）
        Object.assign(this.#state, {
            documents,
            content,
            currentDocId,
            selectedDocIds: currentDocId ? [currentDocId] : [],
            lastClickedDocId: currentDocId,
            editor: settings.editor,
            interface: {
                ...settings.interface
            },
            export: settings.export
        });
    }

    /**
     * 启动自动持久化
     */
    startPersistence() {
        this.#persistence.start();
    }

    // ==================== 观察者模式 ====================

    /**
     * 订阅状态变化
     * @param {Function} listener - 监听器函数 (newState, oldState) => void
     * @returns {Function} 取消订阅函数
     */
    subscribe(listener) {
        this.#globalListeners.add(listener);

        // 返回取消订阅函数
        return () => {
            this.#globalListeners.delete(listener);
        };
    }

    /**
     * 订阅特定状态键的变化
     * @param {string|string[]} keys - 状态键或键数组
     * @param {Function} listener - 监听器函数 (newValue, oldValue, key) => void
     * @returns {Function} 取消订阅函数
     */
    subscribeTo(keys, listener) {
        const keyArray = Array.isArray(keys) ? keys : [keys];

        keyArray.forEach(key => {
            if (!this.#listeners.has(key)) {
                this.#listeners.set(key, new Set());
            }
            this.#listeners.get(key).add(listener);
        });

        // 返回取消订阅函数
        return () => {
            keyArray.forEach(key => {
                const listeners = this.#listeners.get(key);
                if (listeners) {
                    listeners.delete(listener);
                }
            });
        };
    }

    /**
     * 通知所有监听器
     * @private
     * @param {Object} oldState - 旧状态
     * @param {Object} newState - 新状态
     * @param {boolean} force - 是否强制更新
     * @param {Array<string>} changedKeys - 变化的键列表
     */
    #notify(oldState, newState, force = false, changedKeys = []) {
        // 通知全局监听器
        this.#globalListeners.forEach(listener => {
            try {
                listener(newState, oldState);
            } catch (error) {
                console.error('State listener error:', error);
            }
        });

        // 通知特定键的监听器（只通知变化的键）
        const keysToNotify = force ? Object.keys(newState) : changedKeys;

        keysToNotify.forEach(key => {
            const listeners = this.#listeners.get(key);
            if (listeners) {
                listeners.forEach(listener => {
                    try {
                        listener(newState[key], oldState[key], key);
                    } catch (error) {
                        console.error(`State listener error for key "${key}":`, error);
                    }
                });
            }
        });
    }

    // ==================== 文档操作 ====================

    /**
     * 添加文档
     * @param {Object} doc - 文档对象
     * @param {string} [parentId] - 父文件夹ID
     * @param {Object} options - 选项
     * @param {boolean} [options.silent=false] - 是否静默更新
     */
    addDocument(doc, parentId = null, options = {}) {
        const newDoc = { ...doc, parentId };
        const documents = [...this.#state.documents, newDoc];
        this.#setState({ documents }, options);
    }

    /**
     * 更新文档
     * @param {string} docId - 文档ID
     * @param {Object} updates - 更新内容
     * @param {Object} options - 选项
     * @param {boolean} [options.silent=false] - 是否静默更新
     */
    updateDocument(docId, updates, options = {}) {
        const documents = this.#state.documents.map(doc =>
            doc.id === docId ? { ...doc, ...updates } : doc
        );
        this.#setState({ documents }, options);
    }

    /**
     * 收集文档及其所有子项
     * @private
     * @param {string} docId - 文档ID
     * @param {Set} toDelete - 要删除的文档ID集合
     */
    #collectDescendants(docId, toDelete) {
        const stack = [docId];

        while (stack.length > 0) {
            const currentId = stack.pop();

            // 查找所有子项
            for (const doc of this.#state.documents) {
                if (doc.parentId === currentId && !toDelete.has(doc.id)) {
                    toDelete.add(doc.id);
                    stack.push(doc.id);
                }
            }
        }
    }

    /**
     * 删除文档（支持单个或批量，自动删除子项）
     * @param {string|string[]} docIds - 文档ID或ID数组
     * @param {Object} options - 选项
     * @param {boolean} [options.silent=false] - 是否静默更新
     */
    deleteDocuments(docIds, options = {}) {
        // 统一转换为数组处理
        const ids = Array.isArray(docIds) ? docIds : [docIds];
        if (ids.length === 0) return;

        const toDelete = new Set(ids);

        // 收集所有子项
        for (const docId of ids) {
            this.#collectDescendants(docId, toDelete);
        }

        const documents = this.#state.documents.filter(doc => !toDelete.has(doc.id));

        // 检查当前文档是否被删除
        const currentDocId = toDelete.has(this.#state.currentDocId)
            ? null
            : this.#state.currentDocId;

        this.#setState({ documents, currentDocId }, options);
    }

    /**
     * 设置当前文档
     * @param {string} docId - 文档ID
     * @param {Object} options - 选项
     * @param {boolean} [options.clearSelection=true] - 是否清空多选状态
     */
    setCurrentDocument(docId, options = {}) {
        const { clearSelection = true } = options;

        // 如果文档 ID 没有变化，直接返回
        if (this.#state.currentDocId === docId && !clearSelection) {
            return;
        }

        const doc = this.#state.documents.find(d => d.id === docId);
        if (doc) {
            const updates = { currentDocId: docId, lastClickedDocId: docId };

            // 如果需要清空多选状态，只保留当前文档
            if (clearSelection) {
                updates.selectedDocIds = [docId];
            }

            // 只有当文档不是文件夹时，才更新内容
            if (doc.type !== 'folder') {
                updates.content = doc.content || '';
            }

            // 更新状态
            this.#setState(updates);
        }
    }

    /**
     * 选择文档（支持多种选择模式）
     * @param {string|string[]} docIds - 文档ID或ID数组
     * @param {Object} options - 选项
     * @param {string} [options.mode='set'] - 选择模式：'set'(设置), 'toggle'(切换), 'range'(范围)
     * @param {boolean} [options.clearCurrent=true] - 是否清空当前文档
     */
    selectDocuments(docIds, options = {}) {
        const { mode = 'set', clearCurrent: _clearCurrent = true } = options;

        if (mode === 'toggle') {
            // 切换选中状态（用于Ctrl+点击）
            const docId = typeof docIds === 'string' ? docIds : docIds[0];
            const selectedDocIds = [...this.#state.selectedDocIds];
            const index = selectedDocIds.indexOf(docId);

            if (index > -1) {
                selectedDocIds.splice(index, 1);
                if (this.#state.currentDocId === docId && selectedDocIds.length > 0) {
                    this.#setState({
                        currentDocId: selectedDocIds[selectedDocIds.length - 1],
                        selectedDocIds,
                        lastClickedDocId: docId
                    });
                } else {
                    this.#setState({ selectedDocIds, lastClickedDocId: docId });
                }
            } else {
                selectedDocIds.push(docId);
                this.#setState({
                    currentDocId: docId,
                    selectedDocIds,
                    lastClickedDocId: docId
                });
            }
        } else if (mode === 'range') {
            // 范围选择（用于Shift+点击）
            const endDocId = typeof docIds === 'string' ? docIds : docIds[0];
            const startDocId = this.#state.lastClickedDocId || this.#state.currentDocId;

            if (!startDocId) {
                this.setCurrentDocument(endDocId);
                return;
            }

            const flatDocs = this.#getFlatDocumentList();
            const startIndex = flatDocs.findIndex(d => d.id === startDocId);
            const endIndex = flatDocs.findIndex(d => d.id === endDocId);

            if (startIndex === -1 || endIndex === -1) return;

            const minIndex = Math.min(startIndex, endIndex);
            const maxIndex = Math.max(startIndex, endIndex);

            const selectedDocIds = flatDocs.slice(minIndex, maxIndex + 1).map(doc => doc.id);

            this.#setState({
                selectedDocIds,
                currentDocId: endDocId,
                lastClickedDocId: endDocId
            });
        } else {
            // 设置选中（默认）
            const ids = Array.isArray(docIds) ? docIds : [docIds];
            this.#setState({
                selectedDocIds: ids,
                currentDocId: ids[0] || null,
                lastClickedDocId: ids[0] || null
            });
        }
    }

    /**
     * 清空文档状态
     * @param {Object} options - 选项
     * @param {boolean} [options.selection=true] - 是否清空选中状态
     * @param {boolean} [options.current=false] - 是否清空当前文档
     */
    clearDocuments(options = {}) {
        const { selection = true, current = false } = options;
        const updates = {};

        if (selection) {
            updates.selectedDocIds = [];
        }
        if (current) {
            updates.currentDocId = null;
            updates.content = '';
        }

        if (Object.keys(updates).length > 0) {
            this.#setState(updates);
        }
    }

    /**
     * 获取扁平的文档列表（按树型结构的显示顺序）
     * @private
     * @returns {Array} 扁平文档列表
     */
    #getFlatDocumentList() {
        const result = [];
        const tree = this.getDocumentTree();

        const traverse = nodes => {
            for (const node of nodes) {
                result.push(node);
                if (node.children && node.children.length > 0) {
                    traverse(node.children);
                }
            }
        };

        traverse(tree);
        return result;
    }

    /**
     * 合并文档列表（私有方法）
     * @private
     * @param {Array} currentDocs - 当前文档
     * @param {Array} importDocs - 导入文档
     * @returns {Array} 合并后的文档
     */
    #mergeDocuments(currentDocs, importDocs) {
        const docMap = new Map(currentDocs.map(doc => [doc.id, doc]));

        importDocs.forEach(doc => {
            if (docMap.has(doc.id)) {
                // 更新现有文档
                docMap.set(doc.id, { ...docMap.get(doc.id), ...doc });
            } else {
                // 添加新文档
                docMap.set(doc.id, doc);
            }
        });

        return Array.from(docMap.values());
    }

    /**
     * 导入文档
     * @param {Array} docs - 要导入的文档数组
     * @param {string} mode - 导入模式：'replace' 或 'merge'
     * @param {boolean} [notify=true] - 是否触发通知
     */
    importDocuments(docs, mode = 'replace', notify = true) {
        const currentDocs = this.#state.documents;
        const newDocuments = mode === 'replace' ? docs : this.#mergeDocuments(currentDocs, docs);

        this.#setState({ documents: newDocuments }, { silent: !notify });
    }

    /**
     * 获取文档树（支持获取完整树或子树）
     * @param {string} [folderId] - 文件夹ID（不传则返回完整树）
     * @returns {Array} 树型结构的文档数组
     */
    getDocumentTree(folderId) {
        const docs = this.#state.documents;

        // 如果指定了文件夹ID，只返回该文件夹的子项
        if (folderId) {
            return docs.filter(doc => doc.parentId === folderId);
        }

        // 构建完整树型结构
        const docMap = new Map();
        docs.forEach(doc => {
            docMap.set(doc.id, { ...doc, children: [] });
        });

        const roots = [];
        docMap.forEach(doc => {
            if (doc.parentId && docMap.has(doc.parentId)) {
                docMap.get(doc.parentId).children.push(doc);
            } else {
                roots.push(doc);
            }
        });

        return roots;
    }

    /**
     * 移动文档到另一个文件夹
     * @param {string} docId - 文档ID
     * @param {string} targetFolderId - 目标文件夹ID（null表示移到根目录）
     * @returns {boolean} 是否移动成功
     */
    moveDocument(docId, targetFolderId) {
        // 防止将文件夹移动到其子文件夹中
        if (targetFolderId) {
            const findDoc = id => this.#state.documents.find(d => d.id === id);
            let current = findDoc(targetFolderId);
            while (current && current.parentId) {
                if (current.parentId === docId) {
                    // 无效移动，不执行操作
                    return false;
                }
                current = findDoc(current.parentId);
            }
        }

        this.updateDocument(docId, {
            parentId: targetFolderId,
            updatedAt: new Date().toISOString()
        });

        return true;
    }

    // ==================== 内容更新 ====================

    /**
     * 更新当前文档内容
     * @param {string} content - 文档内容
     * @description content 状态用于 UI 响应，实际持久化通过 documents 数组完成
     */
    updateContent(content) {
        // 更新 content 状态（触发订阅者，用于 UI 响应）
        this.#setState({ content }, { skipPersist: true });

        // 同步更新 documents 数组中的内容并触发持久化
        if (this.#state.currentDocId) {
            this.#updateDocumentContent(this.#state.currentDocId, content);
        }
    }

    /**
     * 更新文档内容（内部方法，带防抖时间戳更新）
     * @private
     * @param {string} docId - 文档ID
     * @param {string} content - 文档内容
     */
    #updateDocumentContent(docId, content) {
        const documents = this.#state.documents.map(doc =>
            doc.id === docId ? { ...doc, content } : doc
        );
        // 静默更新，避免重复触发订阅者
        Object.assign(this.#state, { documents });

        // 延迟更新 updatedAt（防抖），避免每次输入都创建新 Date
        if (this.#updateTimestampTimeout) {
            clearTimeout(this.#updateTimestampTimeout);
        }
        this.#updateTimestampTimeout = setTimeout(() => {
            this.#updateDocumentTimestamp(docId);
            this.#updateTimestampTimeout = null;
        }, 2000);
    }

    /**
     * 更新文档时间戳
     * @private
     * @param {string} docId - 文档ID
     */
    #updateDocumentTimestamp(docId) {
        const documents = this.#state.documents.map(doc =>
            doc.id === docId ? { ...doc, updatedAt: new Date().toISOString() } : doc
        );
        Object.assign(this.#state, { documents });
        // 触发持久化
        this.#persistence.schedule(['documents']);
    }

    // ==================== 标题 ====================

    /**
     * 更新标题数据
     * @param {Array} headings - 标题数组
     */
    updateHeadings(headings) {
        this.#setState({ headings });
    }

    /**
     * 更新当前滚动高亮的标题 ID
     * @param {string|null} headingId
     */
    updateActiveHeading(headingId) {
        this.#setState({ activeHeadingId: headingId }, { skipPersist: true });
    }

    // ==================== 配置更新（通用） ====================

    /**
     * 通用配置更新方法
     * @private
     * @param {string} key - 配置键名
     * @param {Object} config - 配置更新
     */
    #updateConfig(key, config) {
        this.#setState({
            [key]: { ...this.#state[key], ...config }
        });
    }

    // ==================== 编辑器配置操作 ====================

    /**
     * 更新编辑器配置
     * @param {Object} config - 编辑器配置
     */
    updateEditorConfig(config) {
        this.#updateConfig('editor', config);
    }

    // ==================== 界面配置操作 ====================

    /**
     * 更新界面配置
     * @param {Object} config - 界面配置
     */
    updateInterfaceConfig(config) {
        this.#updateConfig('interface', config);
    }

    /**
     * 切换主题
     * @returns {string} 新主题名称
     */
    toggleTheme() {
        const newTheme = this.#state.interface.theme === 'dark' ? 'light' : 'dark';
        this.updateInterfaceConfig({ theme: newTheme });
        return newTheme;
    }

    /**
     * 切换布局
     * @returns {string} 新布局名称
     */
    toggleLayout() {
        const layouts = ['layout-editor-only', 'layout-preview-only', 'layout-both'];
        const currentIndex = layouts.indexOf(this.#state.interface.layout);
        const nextLayout = layouts[(currentIndex + 1) % layouts.length];
        this.updateInterfaceConfig({ layout: nextLayout });
        return nextLayout;
    }

    /**
     * 关闭所有侧边栏
     */
    closeAllSidebars() {
        this.updateInterfaceConfig({
            leftSidebarOpen: false,
            rightSidebarOpen: false
        });
    }

    /**
     * 切换侧边栏状态
     * @param {string} side - 'left' 或 'right'
     * @returns {boolean} 新的状态值
     */
    toggleSidebar(side) {
        const stateKey = side === 'left' ? 'leftSidebarOpen' : 'rightSidebarOpen';
        const newValue = !this.#state.interface[stateKey];

        this.#setState({
            interface: {
                ...this.#state.interface,
                [stateKey]: newValue
            }
        });

        return newValue;
    }

    // ==================== 导出配置操作 ====================

    /**
     * 更新导出配置
     * @param {Object} config - 导出配置
     */
    updateExportConfig(config) {
        this.#updateConfig('export', config);
    }

    /**
     * 触发导出操作（事件驱动）
     * @param {string} type - 导出类型：'html' | 'md' | 'pdf'
     */
    triggerExport(type) {
        // 通知所有订阅了 export:trigger 事件的监听器
        const listeners = this.#listeners.get('export:trigger');
        if (listeners) {
            listeners.forEach(listener => {
                try {
                    listener(type);
                } catch (error) {
                    console.error('Export listener error:', error);
                }
            });
        }
    }

    /**
     * 触发导出准备（事件驱动）
     * Preview 收到后强制完整渲染，完成后调用 triggerExportReady
     * @param {string} type - 导出类型：'html' | 'pdf'
     */
    triggerExportPrepare(type) {
        const listeners = this.#listeners.get('export:prepare');
        if (listeners) {
            listeners.forEach(listener => {
                try {
                    listener(type);
                } catch (error) {
                    console.error('ExportPrepare listener error:', error);
                }
            });
        }
    }

    /**
     * 触发导出就绪（事件驱动）
     * Preview 完整渲染后调用，将渲染好的 HTML 快照传给 Exporter
     * @param {string} type - 导出类型：'html' | 'pdf'
     * @param {string} html - 完整渲染后的容器 innerHTML
     */
    triggerExportReady(type, html) {
        const listeners = this.#listeners.get('export:ready');
        if (listeners) {
            listeners.forEach(listener => {
                try {
                    listener(type, html);
                } catch (error) {
                    console.error('ExportReady listener error:', error);
                }
            });
        }
    }

    /**
     * 触发跳转到指定标题（事件驱动）
     * @param {string} headingId - 标题元素 ID
     */
    triggerScrollToHeading(headingId) {
        const listeners = this.#listeners.get('scroll:heading');
        if (listeners) {
            listeners.forEach(listener => {
                try {
                    listener(headingId);
                } catch (error) {
                    console.error('ScrollToHeading listener error:', error);
                }
            });
        }
    }

    // ==================== 通知状态 ====================

    /**
     * 显示通知
     * @param {string} message - 通知消息
     * @param {string} type - 通知类型
     */
    showNotification(message, type = 'info') {
        this.#setState({
            notification: {
                message,
                type,
                timestamp: Date.now()
            }
        });
    }

    /**
     * 清除通知
     */
    clearNotification() {
        this.#setState({ notification: null });
    }

    /**
     * 清理资源（通常不需要调用，因为这是全局单例）
     */
    destroy() {
        // 清理 updatedAt 更新定时器
        if (this.#updateTimestampTimeout) {
            clearTimeout(this.#updateTimestampTimeout);
            this.#updateTimestampTimeout = null;
        }

        // 清理所有监听器
        this.#listeners.clear();
        this.#globalListeners.clear();
    }
}

/**
 * 创建全局状态实例
 */
export const editorState = new EditorState();
