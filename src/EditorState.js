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
 * state.setState({ content: 'Hello' });
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
            fontSize: 14,
            lineHeight: 1.6,
            autoSave: true,
            insertSpaces: true,
            tabSize: 4
        },
        interface: {
            theme: 'light',
            layout: 'layout-both',
            leftRatio: 0.5,
            leftSidebarOpen: false,
            rightSidebarOpen: false,
            syncScrollEnabled: true,
            sections: {
                toc: true,
                export: true
            }
        },
        export: {
            includeStyle: true,
            codeHighlight: true,
            pdfSize: 'A4',
            pdfMargin: 'default'
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
        interface: { ...EditorState.DEFAULT_SETTINGS.interface },

        // 导出配置 - 引用默认设置
        export: { ...EditorState.DEFAULT_SETTINGS.export },

        // 渲染状态
        isRenderingMermaid: false,
        lastRenderedContent: '',
        headings: [], // 标题数据，用于目录生成

        // 通知状态
        notification: null // { message, type, timestamp }
    };

    /** @type {Map<string, Set<Function>>} 特定键的监听器 */
    #listeners = new Map();

    /** @type {Set<Function>} 全局监听器 */
    #globalListeners = new Set();

    /** @private */
    #persistence = new PersistenceManager(() => this.#state);

    /**
     * 获取单个状态值
     * @template T
     * @param {string} key - 状态键
     * @returns {T} 状态值
     */
    get(key) {
        return this.#state[key];
    }

    /**
     * 批量更新状态
     * @param {Object} updates - 要更新的状态对象
     * @param {Object} options - 选项
     * @param {boolean} [options.silent=false] - 是否静默更新（不触发通知）
     * @param {boolean} [options.force=false] - 是否强制更新（即使值相同也触发通知）
     * @param {boolean} [options.skipPersist=false] - 是否跳过持久化
     */
    setState(updates, options = {}) {
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

    // ==================== 持久化方法 ====================

    /**
     * 初始化状态（从 localStorage 加载，不触发监听器和持久化）
     * 在内部处理所有初始化逻辑，包括选择当前文档
     */
    init() {
        const documents = StoreManager.loadDocuments();
        const savedDocId = StoreManager.loadCurrentDocId();
        const savedSettings = StoreManager.loadSettings();

        // 合并保存的设置和默认设置
        const settings = savedSettings ? {
            editor: { ...EditorState.DEFAULT_SETTINGS.editor, ...savedSettings.editor },
            interface: { ...EditorState.DEFAULT_SETTINGS.interface, ...savedSettings.interface },
            export: { ...EditorState.DEFAULT_SETTINGS.export, ...savedSettings.export }
        } : {
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
            interface: settings.interface,
            export: settings.export
        });
    }

    /**
     * 启动自动持久化
     */
    startPersistence() {
        this.#persistence.start();
    }

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
     * @param {boolean} [options.silent=false] - 是否静默更新（不触发通知）
     */
    addDocument(doc, parentId = null, options = {}) {
        const newDoc = { ...doc, parentId };
        const documents = [...this.#state.documents, newDoc];
        this.setState({ documents }, options);
    }

    /**
     * 更新文档
     * @param {string} docId - 文档ID
     * @param {Object} updates - 更新内容
     * @param {Object} options - 选项
     * @param {boolean} [options.silent=false] - 是否静默更新（不触发通知）
     */
    updateDocument(docId, updates, options = {}) {
        const documents = this.#state.documents.map(doc =>
            doc.id === docId ? { ...doc, ...updates } : doc
        );
        this.setState({ documents }, options);
    }

    /**
     * 收集文档及其所有子项（优化版：单次遍历 + 递归）
     * @private
     * @param {string} docId - 文档ID
     * @param {Set} toDelete - 要删除的文档ID集合
     */
    #collectDescendants(docId, toDelete) {
        // 使用 Map 优化查找性能
        const docMap = new Map(this.#state.documents.map(d => [d.id, d]));
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
     * 删除文档（及其所有子项）
     * @param {string} docId - 文档ID
     * @param {Object} options - 选项
     * @param {boolean} [options.silent=false] - 是否静默更新（不触发通知）
     */
    deleteDocument(docId, options = {}) {
        const toDelete = new Set([docId]);
        this.#collectDescendants(docId, toDelete);

        const documents = this.#state.documents.filter(doc => !toDelete.has(doc.id));
        const currentDocId = this.#state.currentDocId === docId ? null : this.#state.currentDocId;
        this.setState({ documents, currentDocId }, options);
    }

    /**
     * 批量删除文档（优化版：一次性处理所有删除）
     * @param {string[]} docIds - 文档ID数组
     * @param {Object} options - 选项
     * @param {boolean} [options.silent=false] - 是否静默更新（不触发通知）
     */
    deleteDocuments(docIds, options = {}) {
        if (!docIds || docIds.length === 0) return;

        const toDelete = new Set(docIds);
        
        // 收集所有子项
        for (const docId of docIds) {
            this.#collectDescendants(docId, toDelete);
        }

        const documents = this.#state.documents.filter(doc => !toDelete.has(doc.id));
        
        // 检查当前文档是否被删除
        const currentDocId = toDelete.has(this.#state.currentDocId) 
            ? null 
            : this.#state.currentDocId;
        
        this.setState({ documents, currentDocId }, options);
    }

    /**
     * 设置当前文档（优化版：异步保存）
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

            // 更新状态（会自动持久化 currentDocId）
            this.setState(updates);
        }
    }

    /**
     * 切换文档选中状态（用于Ctrl+点击）
     * @param {string} docId - 文档ID
     */
    toggleDocumentSelection(docId) {
        const selectedDocIds = [...this.#state.selectedDocIds];
        const index = selectedDocIds.indexOf(docId);
        
        if (index > -1) {
            // 如果已选中，取消选中
            selectedDocIds.splice(index, 1);
            // 如果当前文档被取消选中，更新currentDocId为最后一个选中的文档
            if (this.#state.currentDocId === docId && selectedDocIds.length > 0) {
                this.setState({ 
                    currentDocId: selectedDocIds[selectedDocIds.length - 1],
                    selectedDocIds,
                    lastClickedDocId: docId
                });
            } else {
                this.setState({ selectedDocIds, lastClickedDocId: docId });
            }
        } else {
            // 如果未选中，添加到选中列表
            selectedDocIds.push(docId);
            this.setState({ 
                currentDocId: docId,
                selectedDocIds,
                lastClickedDocId: docId
            });
        }
    }

    /**
     * 范围选择文档（用于Shift+点击）
     * @param {string} endDocId - 结束文档ID
     */
    selectDocumentRange(endDocId) {
        const startDocId = this.#state.lastClickedDocId || this.#state.currentDocId;
        if (!startDocId) {
            // 如果没有起始点，直接选中当前文档
            this.setCurrentDocument(endDocId);
            return;
        }

        // 获取扁平的文档列表（按显示顺序）
        const flatDocs = this.#getFlatDocumentList();
        const startIndex = flatDocs.findIndex(d => d.id === startDocId);
        const endIndex = flatDocs.findIndex(d => d.id === endDocId);

        if (startIndex === -1 || endIndex === -1) return;

        // 确定范围
        const minIndex = Math.min(startIndex, endIndex);
        const maxIndex = Math.max(startIndex, endIndex);

        // 选中范围内的所有文档
        const selectedDocIds = flatDocs
            .slice(minIndex, maxIndex + 1)
            .map(doc => doc.id);

        this.setState({
            selectedDocIds,
            currentDocId: endDocId,
            lastClickedDocId: endDocId
        });
    }

    /**
     * 获取扁平的文档列表（按树型结构的显示顺序）
     * @private
     * @returns {Array} 扁平文档列表
     */
    #getFlatDocumentList() {
        const result = [];
        const tree = this.buildTree();

        const traverse = (nodes) => {
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
     * 更新当前文档内容
     * @param {string} content - 文档内容
     */
    updateContent(content) {
        // 只更新 content 状态，不触发 documents 更新
        // documents 的更新通过防抖保存机制处理，避免每次输入都重新渲染文档列表
        this.setState({ content });

        // 静默更新 documents 数组（不触发订阅者通知）
        if (this.#state.currentDocId) {
            const docIndex = this.#state.documents.findIndex(
                d => d.id === this.#state.currentDocId
            );
            if (docIndex !== -1) {
                this.#state.documents[docIndex].content = content;

                // 延迟更新 updatedAt（2秒），避免每次输入都创建新的 Date 对象
                if (this.#updateTimestampTimeout) {
                    clearTimeout(this.#updateTimestampTimeout);
                }
                this.#updateTimestampTimeout = setTimeout(() => {
                    this.#state.documents[docIndex].updatedAt = new Date().toISOString();
                    this.#updateTimestampTimeout = null;
                }, 2000);
            }
        }
    }

    // ==================== 树型结构操作 ====================

    /**
     * 构建树型结构
     * @returns {Array} 树型结构的文档数组
     */
    buildTree() {
        const docs = this.#state.documents;
        const docMap = new Map();

        // 创建所有节点的映射
        docs.forEach(doc => {
            docMap.set(doc.id, { ...doc, children: [] });
        });

        // 构建树型结构
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
     * 获取文档的所有子项
     * @param {string} folderId - 文件夹ID
     * @returns {Array} 子项数组
     */
    getChildren(folderId) {
        return this.#state.documents.filter(doc => doc.parentId === folderId);
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

    // ==================== 编辑器配置操作 ====================

    /**
     * 更新编辑器配置
     * @param {Object} config - 编辑器配置
     */
    updateEditorConfig(config) {
        this.setState({ 
            editor: { 
                ...this.#state.editor, 
                ...config 
            } 
        });
    }

    // ==================== 界面配置操作 ====================

    /**
     * 更新界面配置
     * @param {Object} config - 界面配置
     */
    updateInterfaceConfig(config) {
        this.setState({ 
            interface: { 
                ...this.#state.interface, 
                ...config 
            } 
        });
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
     * 切换区块状态
     * @param {string} sectionName - 区块名称
     */
    toggleSection(sectionName) {
        const sections = {
            ...this.#state.interface.sections,
            [sectionName]: !this.#state.interface.sections[sectionName]
        };
        this.updateInterfaceConfig({ sections });
    }

    // ==================== 导出配置操作 ====================

    /**
     * 更新导出配置
     * @param {Object} config - 导出配置
     */
    updateExportConfig(config) {
        this.setState({ 
            export: { 
                ...this.#state.export, 
                ...config 
            } 
        });
    }

    // ==================== 渲染状态 ====================

    /**
     * 更新最后渲染的内容
     * @param {string} content - 渲染的内容
     */
    updateLastRenderedContent(content) {
        this.setState({ lastRenderedContent: content });
    }

    // ==================== 通知状态 ====================

    /**
     * 显示通知
     * @param {string} message - 通知消息
     * @param {string} type - 通知类型
     */
    showNotification(message, type = 'info') {
        this.setState({
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
        this.setState({ notification: null });
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
