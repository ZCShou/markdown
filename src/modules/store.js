/**
 * 本地存储管理器
 * 负责管理所有与 localStorage 相关的数据存储和读取
 * 支持异步操作以避免阻塞主线程
 * 
 * @example
 * ```js
 * // 保存内容
 * const result = StoreManager.saveContent('Hello World');
 * if (!result.success) {
 *   console.error(result.error);
 * }
 * 
 * // 加载内容
 * const content = StoreManager.loadContent('default content');
 * ```
 */
export class StoreManager {
    // ==================== 异步存储队列 ====================
    
    /** @type {Map} 待处理的存储操作队列 */
    static #pendingOperations = new Map();
    
    /** @type {boolean} 是否正在处理队列 */
    static #isProcessing = false;

    /**
     * 调度存储操作（异步）- 使用 async/await 重构
     * @private
     * @param {Function} operation - 存储操作（可以是同步或异步函数）
     * @returns {Promise} 操作结果
     */
    static async #scheduleAsync(operation) {
        const id = Date.now() + Math.random();
        
        return new Promise((resolve, reject) => {
            StoreManager.#pendingOperations.set(id, { operation, resolve, reject });
            
            if (!StoreManager.#isProcessing) {
                StoreManager.#processQueue();
            }
        });
    }

    /**
     * 处理操作队列 - 使用 async/await 重构
     * @private
     */
    static async #processQueue() {
        if (StoreManager.#pendingOperations.size === 0) {
            StoreManager.#isProcessing = false;
            return;
        }

        StoreManager.#isProcessing = true;

        const processNext = async () => {
            const entry = StoreManager.#pendingOperations.entries().next().value;
            if (!entry) {
                StoreManager.#isProcessing = false;
                return;
            }

            const [id, { operation, resolve, reject }] = entry;
            StoreManager.#pendingOperations.delete(id);

            try {
                // 支持同步和异步操作
                const result = await operation();
                resolve(result);
            } catch (error) {
                console.error('[StoreManager] Operation failed:', error);
                reject(error);
            }

            // 继续处理下一个操作
            if (StoreManager.#pendingOperations.size > 0) {
                if (typeof requestIdleCallback !== 'undefined') {
                    requestIdleCallback(() => processNext(), { timeout: 50 });
                } else {
                    setTimeout(() => processNext(), 0);
                }
            } else {
                StoreManager.#isProcessing = false;
            }
        };

        // 开始处理
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(() => processNext(), { timeout: 50 });
        } else {
            setTimeout(() => processNext(), 0);
        }
    }
    /**
     * 默认 Markdown 内容
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

__这段文本也会是粗体__

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
    // ==================== 存储键名常量 ====================
    
    /** @type {Object} 存储键名映射 */
    static #STORAGE_KEYS = {
        CONTENT: 'markdown_editor_content',
        DOCUMENTS: 'markdown_editor_documents',
        CURRENT_DOC_ID: 'markdown_editor_current_doc_id',
        THEME: 'markdown_editor_theme',
        LAYOUT: 'markdown_editor_layout',
        SECTION_PREFIX: 'markdown_editor_section_',
        SIDEBAR_LEFT: 'markdown_editor_sidebar_left',
        SIDEBAR_RIGHT: 'markdown_editor_sidebar_right'
    };

    /** @type {number} 最大存储大小（字节）- 约 5MB */
    static #MAX_STORAGE_SIZE = 5 * 1024 * 1024;

    // ==================== 内容存储 ====================
    
    /**
     * 保存编辑器内容到本地存储（异步）
     * @param {string} content - 编辑器内容
     * @returns {Promise<{success: boolean, error?: string}>} 保存结果
     */
    static async saveContentAsync(content) {
        try {
            await StoreManager.#scheduleAsync(() => {
                localStorage.setItem(StoreManager.#STORAGE_KEYS.CONTENT, content);
            });
            return { success: true };
        } catch (e) {
            const errorMsg = StoreManager.#handleStorageError(e, '保存内容失败');
            console.warn(`${errorMsg}:`, e);
            return { success: false, error: errorMsg };
        }
    }

    /**
     * 保存编辑器内容到本地存储（同步，兼容旧代码）
     * @param {string} content - 编辑器内容
     * @returns {{success: boolean, error?: string}} 保存结果
     */
    static saveContent(content) {
        try {
            localStorage.setItem(StoreManager.#STORAGE_KEYS.CONTENT, content);
            return { success: true };
        } catch (e) {
            const errorMsg = StoreManager.#handleStorageError(e, '保存内容失败');
            console.warn(`${errorMsg}:`, e);
            return { success: false, error: errorMsg };
        }
    }

    /**
     * 从本地存储加载编辑器内容
     * @param {string} defaultContent - 默认内容
     * @returns {string} 保存的内容或默认内容
     */
    static loadContent(defaultContent = '') {
        try {
            const saved = localStorage.getItem(StoreManager.#STORAGE_KEYS.CONTENT);
            return saved !== null ? saved : defaultContent;
        } catch (e) {
            console.warn('加载内容失败:', e);
            StoreManager.#clearCorruptedData(StoreManager.#STORAGE_KEYS.CONTENT);
            return defaultContent;
        }
    }

    /**
     * 清除编辑器内容
     * @returns {boolean} 是否成功
     */
    static clearContent() {
        try {
            localStorage.removeItem(StoreManager.#STORAGE_KEYS.CONTENT);
            return true;
        } catch (e) {
            console.warn('清除内容失败:', e);
            return false;
        }
    }

    // ==================== 文档管理 ====================

    /**
     * 保存文档列表（异步）
     * @param {Array} documents - 文档列表
     * @returns {Promise<{success: boolean, error?: string}>} 保存结果
     */
    static async saveDocumentsAsync(documents) {
        try {
            const serialized = JSON.stringify(documents);
            await StoreManager.#scheduleAsync(() => {
                localStorage.setItem(StoreManager.#STORAGE_KEYS.DOCUMENTS, serialized);
            });
            return { success: true };
        } catch (e) {
            const errorMsg = StoreManager.#handleStorageError(e, '保存文档列表失败');
            console.warn(`${errorMsg}:`, e);
            return { success: false, error: errorMsg };
        }
    }

    /**
     * 保存文档列表（同步，兼容旧代码）
     * @param {Array} documents - 文档列表
     * @returns {{success: boolean, error?: string}} 保存结果
     */
    static saveDocuments(documents) {
        try {
            const serialized = JSON.stringify(documents);
            localStorage.setItem(StoreManager.#STORAGE_KEYS.DOCUMENTS, serialized);
            return { success: true };
        } catch (e) {
            const errorMsg = StoreManager.#handleStorageError(e, '保存文档列表失败');
            console.warn(`${errorMsg}:`, e);
            return { success: false, error: errorMsg };
        }
    }

    /**
     * 加载文档列表
     * @returns {Array} 文档列表
     */
    static loadDocuments() {
        try {
            const saved = localStorage.getItem(StoreManager.#STORAGE_KEYS.DOCUMENTS);
            if (!saved) return [];
            
            const documents = JSON.parse(saved);
            // 验证数据格式
            if (!Array.isArray(documents)) {
                console.warn('文档列表格式错误，已重置');
                return [];
            }
            return documents;
        } catch (e) {
            console.warn('加载文档列表失败:', e);
            StoreManager.#clearCorruptedData(StoreManager.#STORAGE_KEYS.DOCUMENTS);
            return [];
        }
    }

    /**
     * 保存当前文档 ID
     * @param {string} docId - 文档 ID
     * @returns {{success: boolean, error?: string}} 保存结果
     */
    static saveCurrentDocId(docId) {
        try {
            localStorage.setItem(StoreManager.#STORAGE_KEYS.CURRENT_DOC_ID, docId);
            return { success: true };
        } catch (e) {
            const errorMsg = StoreManager.#handleStorageError(e, '保存当前文档 ID 失败');
            console.warn(`${errorMsg}:`, e);
            return { success: false, error: errorMsg };
        }
    }

    /**
     * 加载当前文档 ID
     * @returns {string|null} 文档 ID，如果不存在则返回 null
     */
    static loadCurrentDocId() {
        try {
            const saved = localStorage.getItem(StoreManager.#STORAGE_KEYS.CURRENT_DOC_ID);
            return saved || null;
        } catch (e) {
            console.warn('加载当前文档 ID 失败:', e);
            return null;
        }
    }

    // ==================== 主题设置 ====================

    /**
     * 保存主题设置
     * @param {string} theme - 主题名称
     * @returns {boolean} 是否成功
     */
    static saveTheme(theme) {
        try {
            localStorage.setItem(StoreManager.#STORAGE_KEYS.THEME, theme);
            return true;
        } catch (e) {
            console.warn('保存主题失败:', e);
            return false;
        }
    }

    /**
     * 加载主题设置
     * @param {string} defaultTheme - 默认主题
     * @returns {string} 主题名称
     */
    static loadTheme(defaultTheme = 'light') {
        try {
            const saved = localStorage.getItem(StoreManager.#STORAGE_KEYS.THEME);
            return saved || defaultTheme;
        } catch (e) {
            console.warn('加载主题失败:', e);
            return defaultTheme;
        }
    }

    // ==================== 布局设置 ====================

    /**
     * 保存布局设置
     * @param {string} layout - 布局模式
     * @returns {boolean} 是否成功
     */
    static saveLayout(layout) {
        try {
            localStorage.setItem(StoreManager.#STORAGE_KEYS.LAYOUT, layout);
            return true;
        } catch (e) {
            console.warn('保存布局失败:', e);
            return false;
        }
    }

    /**
     * 加载布局设置
     * @param {string} defaultLayout - 默认布局
     * @returns {string} 布局模式
     */
    static loadLayout(defaultLayout = 'layout-both') {
        try {
            const saved = localStorage.getItem(StoreManager.#STORAGE_KEYS.LAYOUT);
            return saved || defaultLayout;
        } catch (e) {
            console.warn('加载布局失败:', e);
            return defaultLayout;
        }
    }

    // ==================== 侧边栏状态 ====================

    /**
     * 保存侧边栏状态
     * @param {string} side - 'left' 或 'right'
     * @param {boolean} isOpen - 是否打开
     * @returns {boolean} 是否成功
     */
    static saveSidebarState(side, isOpen) {
        try {
            const key = side === 'left' 
                ? StoreManager.#STORAGE_KEYS.SIDEBAR_LEFT 
                : StoreManager.#STORAGE_KEYS.SIDEBAR_RIGHT;
            localStorage.setItem(key, JSON.stringify(isOpen));
            return true;
        } catch (e) {
            console.warn('保存侧边栏状态失败:', e);
            return false;
        }
    }

    /**
     * 加载侧边栏状态
     * @param {string} side - 'left' 或 'right'
     * @param {boolean} defaultState - 默认状态
     * @returns {boolean} 是否打开
     */
    static loadSidebarState(side, defaultState = false) {
        try {
            const key = side === 'left' 
                ? StoreManager.#STORAGE_KEYS.SIDEBAR_LEFT 
                : StoreManager.#STORAGE_KEYS.SIDEBAR_RIGHT;
            const saved = localStorage.getItem(key);
            return saved !== null ? JSON.parse(saved) : defaultState;
        } catch (e) {
            console.warn('加载侧边栏状态失败:', e);
            return defaultState;
        }
    }

    // ==================== 侧边栏折叠状态 ====================

    /**
     * 保存侧边栏折叠状态
     * @param {string} section - 区块名称
     * @param {boolean} collapsed - 是否折叠
     * @returns {boolean} 是否成功
     */
    static saveSectionState(section, collapsed) {
        try {
            const key = StoreManager.#STORAGE_KEYS.SECTION_PREFIX + section;
            localStorage.setItem(key, JSON.stringify(collapsed));
            return true;
        } catch (e) {
            console.warn('保存折叠状态失败:', e);
            return false;
        }
    }

    /**
     * 加载侧边栏折叠状态
     * @param {string} section - 区块名称
     * @param {boolean} defaultState - 默认状态
     * @returns {boolean} 是否折叠
     */
    static loadSectionState(section, defaultState = false) {
        try {
            const key = StoreManager.#STORAGE_KEYS.SECTION_PREFIX + section;
            const saved = localStorage.getItem(key);
            return saved !== null ? JSON.parse(saved) : defaultState;
        } catch (e) {
            console.warn('加载折叠状态失败:', e);
            return defaultState;
        }
    }

    /**
     * 清除所有数据
     * @returns {boolean} 是否成功
     */
    static clearAll() {
        try {
            Object.values(StoreManager.#STORAGE_KEYS).forEach(key => {
                localStorage.removeItem(key);
            });
            // 清除所有折叠状态
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith(StoreManager.#STORAGE_KEYS.SECTION_PREFIX)) {
                    localStorage.removeItem(key);
                }
            });
            return true;
        } catch (e) {
            console.warn('清除所有数据失败:', e);
            return false;
        }
    }

    // ==================== 私有辅助方法 ====================

    /**
     * 处理存储错误
     * @private
     * @param {Error} error - 错误对象
     * @param {string} defaultMessage - 默认错误消息
     * @returns {string} 错误消息
     */
    static #handleStorageError(error, defaultMessage) {
        if (error.name === 'QuotaExceededError') {
            return '存储空间不足，请清理浏览器缓存或删除部分文档';
        } else if (error.name === 'SecurityError') {
            return '浏览器安全设置阻止了存储操作';
        } else if (error.name === 'NS_ERROR_FILE_CORRUPTED') {
            return '存储数据已损坏，请清除浏览器缓存';
        } else if (error instanceof TypeError) {
            return '数据格式错误，无法序列化';
        }
        return defaultMessage;
    }

    /**
     * 清除损坏的数据
     * @private
     * @param {string} key - 存储键
     */
    static #clearCorruptedData(key) {
        try {
            localStorage.removeItem(key);
        } catch (cleanupError) {
            console.error('清理损坏数据失败:', cleanupError);
        }
    }
}
