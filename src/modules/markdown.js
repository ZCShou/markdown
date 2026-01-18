/**
 * Markdown 编辑器管理器 - 独立版
 * 去除了对 itexp 项目的依赖，可作为独立项目使用
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import Prism from 'prismjs';
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-scala';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-makefile';
import 'prismjs/components/prism-nginx';
import 'prismjs/components/prism-perl';
import 'prismjs/components/prism-lua';
import 'prismjs/components/prism-r';
import 'prismjs/components/prism-matlab';
import 'prismjs/components/prism-groovy';
import mermaid from 'mermaid';
import { StoreManager } from './store.js';

export class MarkdownEditor {
    // ==================== 配置常量 ====================
    
    // 防抖延迟配置
    static DEBOUNCE_DELAY = { UPDATE: 300, SAVE: 1000 };
    
    // 拖拽配置
    static DRAG_CONFIG = { MIN_WIDTH: 100, BATCH_SIZE: 10 };
    
    // 默认 Markdown 内容
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
`;

    constructor() {
        // 状态属性
        this.isInitialized = false;
        this.isDragging = false;
        this.isRenderingMermaid = false;
        this.lastLeftRatio = 0.5;
        this.currentDocId = null;
        
        // 数据缓存
        this.documents = [];
        this.domCache = {};
        this.lastRenderedContent = '';
        this.timers = {};
    }

    // ==================== 工具函数 ====================
    
    /**
     * 获取 DOM 元素（带缓存）
     */
    getElement(id) {
        if (!this.domCache[id]) {
            this.domCache[id] = document.getElementById(id);
        }
        return this.domCache[id];
    }

    /**
     * 防抖函数
     */
    debounce(key, fn, delay) {
        if (this.timers[key]) {
            clearTimeout(this.timers[key]);
        }
        this.timers[key] = setTimeout(fn, delay);
    }

    /**
     * 显示消息
     */
    showMessage(message, type = 'info', duration = 2000) {
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        const overlay = this.getElement('status-overlay');
        const messageEl = this.getElement('status-message');

        if (overlay && messageEl) {
            messageEl.textContent = message;
            messageEl.className = 'status-message ' + type;
            overlay.classList.add('show');
            messageEl.classList.add('show');

            setTimeout(() => {
                overlay.classList.remove('show');
                messageEl.classList.remove('show');
            }, duration);
        }
    }

    /**
     * 处理缩进
     * @param {boolean} isRemove - 是否移除缩进（Shift+Tab）
     */
    handleIndent(isRemove = false) {
        const editor = this.getElement('markdown-editor');
        if (!editor) return;

        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        const value = editor.value;

        // 获取选中文本
        const selectedText = value.substring(start, end);

        // 如果没有选中文本，在光标位置插入/移除缩进
        if (selectedText.length === 0) {
            if (isRemove) {
                // 移除缩进：查找光标前的缩进字符
                const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                const lineText = value.substring(lineStart, start);
                const indentMatch = lineText.match(/^(\s*)/);
                const indent = indentMatch ? indentMatch[1] : '';

                if (indent.length > 0) {
                    // 移除一个缩进级别（2个空格或1个tab）
                    const indentSize = indent.startsWith('\t') ? 1 : Math.min(2, indent.length);
                    const newValue = value.substring(0, lineStart) + 
                                   indent.substring(indentSize) + 
                                   value.substring(lineStart + indentSize);
                    editor.value = newValue;
                    editor.selectionStart = editor.selectionEnd = start - indentSize;
                }
            } else {
                // 插入缩进
                const indent = '  '; // 使用2个空格作为缩进
                editor.value = value.substring(0, start) + indent + value.substring(end);
                editor.selectionStart = editor.selectionEnd = start + indent.length;
            }
        } else {
            // 有选中文本，处理多行缩进
            const lines = selectedText.split('\n');
            const indent = '  '; // 使用2个空格作为缩进

            // 检查是否选中了整行
            const lineStart = value.lastIndexOf('\n', start - 1) + 1;
            const lineEnd = value.indexOf('\n', end);
            const fullLineText = value.substring(lineStart, lineEnd === -1 ? value.length : lineEnd);

            // 如果选中了整行或多行，处理所有行
            if (start <= lineStart || selectedText.includes('\n')) {
                let newSelectedText;
                let cursorOffset = 0;

                if (isRemove) {
                    // 移除缩进
                    newSelectedText = lines.map((line, index) => {
                        if (line.startsWith('\t')) {
                            return line.substring(1);
                        } else if (line.startsWith('  ')) {
                            return line.substring(2);
                        } else if (line.startsWith(' ')) {
                            return line.substring(1);
                        }
                        return line;
                    }).join('\n');
                } else {
                    // 添加缩进
                    newSelectedText = lines.map(line => indent + line).join('\n');
                    cursorOffset = indent.length;
                }

                editor.value = value.substring(0, start) + newSelectedText + value.substring(end);
                
                // 恢复选区
                editor.selectionStart = start;
                editor.selectionEnd = start + newSelectedText.length;
            } else {
                // 只选中了行的一部分，只在光标位置插入/移除缩进
                if (isRemove) {
                    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                    const lineText = value.substring(lineStart, start);
                    const indentMatch = lineText.match(/^(\s*)/);
                    const indent = indentMatch ? indentMatch[1] : '';

                    if (indent.length > 0) {
                        const indentSize = indent.startsWith('\t') ? 1 : Math.min(2, indent.length);
                        editor.value = value.substring(0, lineStart) + 
                                       value.substring(lineStart, start).substring(indentSize) + 
                                       value.substring(start);
                        editor.selectionStart = editor.selectionEnd = end - indentSize;
                    }
                } else {
                    editor.value = value.substring(0, start) + indent + value.substring(end);
                    editor.selectionStart = editor.selectionEnd = start + indent.length;
                }
            }
        }

        // 触发 input 事件以更新预览
        editor.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // ==================== Markdown 渲染 ====================
    
    /**
     * 初始化 Mermaid
     */
    initMermaid() {
        mermaid.initialize({
            startOnLoad: false,
            theme: 'default',
            securityLevel: 'loose'
        });
    }

    /**
     * 渲染 Markdown 为 HTML
     */
    renderMarkdown(markdown) {
        try {
            let html = '';
            if (marked && marked.parse) {
                // 配置 marked 选项
                const options = {
                    breaks: true,
                    gfm: true
                };
                html = marked.parse(markdown, options);
            } else {
                html = this.escapeHtml(markdown);
            }

            if (DOMPurify && DOMPurify.sanitize) {
                // 配置 DOMPurify 允许图片标签及其属性
                html = DOMPurify.sanitize(html, {
                    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote', 
                                   'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                                   'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'img',
                                   'input', 'span', 'div', 'dd', 'dt', 'dl', 's'],
                    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'type', 'checked',
                                   'width', 'height', 'loading', 'colspan', 'rowspan', 'start'],
                    ALLOW_DATA_ATTR: true,
                    ADD_ATTR: ['data-*']
                });
            }

            return html;
        } catch (e) {
            console.warn('Markdown 渲染失败:', e);
            return this.escapeHtml(markdown);
        }
    }

    /**
     * 转义 HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * 更新预览（带防抖）
     */
    updatePreview(immediate = false) {
        const editor = this.getElement('markdown-editor');
        if (!editor) return;

        const markdown = editor.value;
        if (markdown === this.lastRenderedContent && !immediate) return;

        if (immediate) {
            this._doUpdatePreview(markdown);
        } else {
            this.debounce('update', () => this._doUpdatePreview(markdown), MarkdownEditor.DEBOUNCE_DELAY.UPDATE);
        }
    }

    /**
     * 执行预览更新
     */
    _doUpdatePreview(markdown) {
        const preview = this.getElement('markdown-preview');
        if (!preview) return;

        this.lastRenderedContent = markdown;
        preview.innerHTML = this.renderMarkdown(markdown);

        requestAnimationFrame(() => {
            this.highlightCode();
            this.renderMermaidCharts();
            this.addCopyButtons();
            this.checkImageLoad();
        });
    }

    /**
     * 检查图片加载状态
     */
    checkImageLoad() {
        const preview = this.getElement('markdown-preview');
        if (!preview) return;

        const images = preview.querySelectorAll('img');
        images.forEach((img) => {
            // 监听图片加载失败事件
            img.addEventListener('error', () => {
                img.alt = `图片加载失败: ${img.src}`;
                img.style.border = '2px dashed #f44336';
                img.style.padding = '10px';
            });
        });
    }

    // ==================== 代码高亮和图表 ====================
    
    /**
     * 应用代码高亮（分批处理）
     */
    highlightCode() {
        if (typeof Prism === 'undefined') return;

        const preview = this.getElement('markdown-preview');
        if (!preview) return;

        const codeBlocks = preview.querySelectorAll('pre code:not(.prism-highlighted)');
        if (codeBlocks.length === 0) return;

        const batchSize = MarkdownEditor.DRAG_CONFIG.BATCH_SIZE;
        let index = 0;

        const processBatch = () => {
            const end = Math.min(index + batchSize, codeBlocks.length);
            for (let i = index; i < end; i++) {
                Prism.highlightElement(codeBlocks[i]);
                codeBlocks[i].classList.add('prism-highlighted');
            }
            index = end;
            if (index < codeBlocks.length) {
                requestAnimationFrame(processBatch);
            }
        };

        processBatch();
    }

    /**
     * 渲染 Mermaid 图表
     */
    renderMermaidCharts() {
        if (typeof mermaid === 'undefined' || this.isRenderingMermaid) return;

        const preview = this.getElement('markdown-preview');
        if (!preview) return;

        const mermaidBlocks = preview.querySelectorAll('pre code.language-mermaid');
        if (mermaidBlocks.length === 0) return;

        this.isRenderingMermaid = true;
        const containers = [];

        mermaidBlocks.forEach((block) => {
            const code = block.textContent.trim();
            if (!code) return;

            const preElement = block.parentElement;
            const container = document.createElement('div');
            container.className = 'mermaid';
            container.textContent = code;

            if (preElement && preElement.parentNode) {
                preElement.parentNode.replaceChild(container, preElement);
                containers.push(container);
            }
        });

        if (containers.length === 0) {
            this.isRenderingMermaid = false;
            return;
        }

        mermaid.run({ nodes: containers })
            .then(() => { this.isRenderingMermaid = false; })
            .catch((err) => {
                console.warn('Mermaid 渲染失败:', err);
                containers.forEach((container) => {
                    container.textContent = '图表渲染失败: ' + err.message;
                    container.classList.add('render-error');
                });
                this.isRenderingMermaid = false;
            });
    }

    /**
     * 添加代码块复制按钮
     */
    addCopyButtons() {
        const preview = this.getElement('markdown-preview');
        if (!preview) return;

        const preElements = preview.querySelectorAll('pre:not(.has-copy-btn)');
        if (preElements.length === 0) return;

        preElements.forEach((pre) => {
            pre.classList.add('has-copy-btn');

            const btn = document.createElement('button');
            btn.className = 'md-btn md-btn-sm code-copy-btn';
            btn.textContent = '📋';
            btn.title = '复制代码';

            btn.onclick = (e) => {
                e.preventDefault();
                e.stopPropagation();

                const code = pre.querySelector('code');
                if (!code || btn.classList.contains('copied')) return;

                navigator.clipboard.writeText(code.textContent).then(() => {
                    btn.innerHTML = '✓';
                    btn.classList.add('copied');
                    setTimeout(() => {
                        btn.innerHTML = '📋';
                        btn.classList.remove('copied');
                    }, 2000);
                }).catch((err) => {
                    console.error('复制失败:', err);
                });
            };

            pre.appendChild(btn);
        });
    }

    // ==================== 分隔条拖拽 ====================
    
    /**
     * 设置拖拽分隔条
     */
    setupDivider() {
        const divider = this.getElement('md-divider');
        const editorPane = this.getElement('md-editor-pane');
        const previewPane = this.getElement('md-preview-pane');
        const container = this.getElement('md-container');

        if (!divider || !editorPane || !previewPane || !container) return;

        // 设置面板宽度的辅助函数
        const setPaneWidths = (ratio) => {
            const containerRect = container.getBoundingClientRect();
            const totalWidth = containerRect.width;
            const dividerWidth = divider.offsetWidth;
            const availableWidth = totalWidth - dividerWidth;
            const leftWidth = availableWidth * ratio;

            editorPane.style.width = leftWidth + 'px';
            editorPane.classList.add('fixed-width');
            previewPane.style.width = (availableWidth - leftWidth) + 'px';
            previewPane.classList.add('fixed-width');
        };

        // 初始化宽度
        setPaneWidths(0.5);
        setTimeout(() => setPaneWidths(0.5), 100);

        // 鼠标事件
        divider.addEventListener('mouseenter', () => {
            if (!this.isDragging) divider.classList.add('hover');
        });

        divider.addEventListener('mouseleave', () => {
            if (!this.isDragging) divider.classList.remove('hover');
        });

        divider.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            divider.classList.add('dragging');
            divider.classList.remove('hover');
            document.body.classList.add('is-dragging');
            e.preventDefault();
        });

        divider.addEventListener('dblclick', () => {
            setPaneWidths(0.5);
            this.lastLeftRatio = 0.5;
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;

            const containerRect = container.getBoundingClientRect();
            const totalWidth = containerRect.width;
            const dividerWidth = divider.offsetWidth;
            const minWidth = MarkdownEditor.DRAG_CONFIG.MIN_WIDTH;
            const maxWidth = totalWidth - minWidth - dividerWidth;
            const leftWidth = Math.max(minWidth, Math.min(e.clientX - containerRect.left, maxWidth));

            editorPane.style.width = leftWidth + 'px';
            editorPane.classList.add('fixed-width');
            previewPane.style.width = (totalWidth - leftWidth - dividerWidth) + 'px';
            previewPane.classList.add('fixed-width');

            this.lastLeftRatio = leftWidth / (totalWidth - dividerWidth);
        });

        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                divider.classList.remove('dragging', 'hover');
                document.body.classList.remove('is-dragging');
            }
        });

        window.addEventListener('resize', () => {
            setPaneWidths(this.lastLeftRatio);
        });
    }

    // ==================== 侧边栏管理 ====================
    
    /**
     * 切换侧边栏
     */
    toggleSidebar(side) {
        const sidebar = this.getElement(`md-sidebar-${side}`);
        const overlay = this.getElement('md-sidebar-overlay');
        if (!sidebar) return;

        const isOpen = sidebar.classList.toggle('open');
        if (overlay) {
            overlay.classList.toggle('show', isOpen);
        }

        if (isOpen && side === 'right') {
            this.generateTOC();
        }
    }

    /**
     * 关闭所有侧边栏
     */
    closeAllSidebars() {
        ['left', 'right'].forEach(side => {
            const sidebar = this.getElement(`md-sidebar-${side}`);
            if (sidebar) sidebar.classList.remove('open');
        });
        
        const overlay = this.getElement('md-sidebar-overlay');
        if (overlay) overlay.classList.remove('show');
    }

    /**
     * 切换侧边栏区块
     */
    toggleSection(sectionName) {
        const section = document.getElementById(`md-${sectionName}-section`);
        const content = document.getElementById(`md-${sectionName}-content`);
        if (!section || !content) return;

        const isCollapsed = content.classList.toggle('collapsed');
        StoreManager.saveSectionState(sectionName, !isCollapsed);
    }

    /**
     * 应用区块状态
     */
    applySectionStates() {
        ['toc', 'export'].forEach((sectionName) => {
            const isCollapsed = StoreManager.loadSectionState(sectionName);
            const content = document.getElementById(`md-${sectionName}-content`);

            if (content) content.classList.toggle('collapsed', isCollapsed);
        });
    }

    // ==================== 文档管理 ====================

    /**
     * 渲染文档列表
     */
    renderDocumentList() {
        const docList = this.getElement('md-doc-list');
        if (!docList) return;

        if (this.documents.length === 0) {
            docList.innerHTML = `<p class="md-empty-state">暂无文档</p>`;
            return;
        }

        const fragment = document.createDocumentFragment();

        this.documents.forEach((doc) => {
            const item = document.createElement('div');
            item.className = 'md-doc-item' + (doc.id === this.currentDocId ? ' active' : '');
            item.dataset.docId = doc.id;
            item.dataset.docType = doc.type || 'file';
            
            const icon = document.createElement('span');
            icon.className = 'md-doc-item-icon';
            icon.textContent = (doc.type === 'folder') ? '📁' : '📄';
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'md-doc-item-name';
            nameSpan.textContent = doc.name;
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'md-btn md-btn-icon md-btn-sm md-btn-danger md-doc-item-delete';
            deleteBtn.textContent = '🗑️';
            deleteBtn.title = '删除';
            deleteBtn.dataset.docId = doc.id;
            
            item.appendChild(icon);
            item.appendChild(nameSpan);
            item.appendChild(deleteBtn);
            fragment.appendChild(item);
        });

        docList.innerHTML = '';
        docList.appendChild(fragment);

        // 事件委托
        docList.onclick = (e) => {
            const deleteBtn = e.target.closest('.md-doc-item-delete');
            if (deleteBtn) {
                e.stopPropagation();
                this.deleteDocument(deleteBtn.dataset.docId);
                return;
            }

            const item = e.target.closest('.md-doc-item');
            if (item && item.dataset.docType !== 'folder') {
                const docId = item.dataset.docId;
                if (docId) this.openDocument(docId);
            }
        };
    }

    /**
     * 新建文档
     */
    newDocument() {
        this.createItem('file');
    }

    /**
     * 创建文件或文件夹
     */
    createItem(type = 'file') {
        const doc = {
            id: Date.now().toString(),
            name: type === 'folder' ? '新建文件夹' : '新建文档',
            type: type,
            content: type === 'file' ? '' : undefined,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.documents.push(doc);
        StoreManager.saveDocuments(this.documents);
        this.renderDocumentList();
        
        // 立即进入编辑模式
        this.editItemName(doc.id);
        
        if (type === 'file') {
            this.openDocument(doc.id);
        }
        
        this.showMessage(`${type === 'folder' ? '文件夹' : '文档'}已创建`, 'success');
    }

    /**
     * 编辑项目名称
     */
    editItemName(docId) {
        const docList = this.getElement('md-doc-list');
        if (!docList) return;

        const item = docList.querySelector(`[data-doc-id="${docId}"]`);
        if (!item) return;

        const nameSpan = item.querySelector('.md-doc-item-name');
        if (!nameSpan) return;

        const currentName = nameSpan.textContent;
        
        // 创建输入框
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'md-doc-item-input';
        input.value = currentName;
        
        // 替换名称显示为输入框
        nameSpan.replaceWith(input);
        item.classList.add('editing');
        
        // 选中文本
        input.focus();
        input.select();
        
        // 保存函数
        const save = () => {
            const newName = input.value.trim();
            if (!newName) {
                this.showMessage('名称不能为空', 'error');
                input.focus();
                return;
            }
            
            const doc = this.documents.find(d => d.id === docId);
            if (doc) {
                doc.name = newName;
                doc.updatedAt = new Date().toISOString();
                StoreManager.saveDocuments(this.documents);
                this.renderDocumentList();
                this.showMessage('重命名成功', 'success');
            }
        };
        
        // 取消函数
        const cancel = () => {
            this.renderDocumentList();
        };
        
        // 绑定事件
        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                save();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
            }
        });
    }

    /**
     * 重命名当前选中的项目
     */
    renameCurrentItem() {
        if (!this.currentDocId) {
            this.showMessage('请先选择一个项目', 'warning');
            return;
        }
        this.editItemName(this.currentDocId);
    }

    /**
     * 删除当前选中的项目
     */
    deleteCurrentItem() {
        if (!this.currentDocId) {
            this.showMessage('请先选择一个项目', 'warning');
            return;
        }
        this.deleteDocument(this.currentDocId);
    }

    /**
     * 打开文档
     */
    openDocument(docId) {
        const doc = this.documents.find((d) => d.id === docId);
        if (!doc) return;

        // 如果是文件夹，不执行打开操作
        if (doc.type === 'folder') {
            return;
        }

        this.currentDocId = docId;
        const editor = this.getElement('markdown-editor');
        if (editor) {
            editor.value = doc.content || '';
        }
        this.updatePreview(true);
        this.renderDocumentList();
    }

    /**
     * 保存当前文档
     */
    saveCurrentDocument() {
        if (!this.currentDocId) return;

        this.debounce('saveDoc', () => {
            const editor = this.getElement('markdown-editor');
            if (!editor) return;

            const doc = this.documents.find((d) => d.id === this.currentDocId);
            if (!doc || doc.type === 'folder') return;

            doc.content = editor.value;
            doc.updatedAt = new Date().toISOString();
            StoreManager.saveDocuments(this.documents);
        }, MarkdownEditor.DEBOUNCE_DELAY.SAVE);
    }

    /**
     * 删除文档
     */
    deleteDocument(docId) {
        const doc = this.documents.find((d) => d.id === docId);
        if (!doc) return;

        const itemType = doc.type === 'folder' ? '文件夹' : '文档';
        if (!confirm(`确定要删除这个${itemType}吗？`)) return;

        const index = this.documents.findIndex((d) => d.id === docId);
        if (index === -1) return;

        this.documents.splice(index, 1);
        StoreManager.saveDocuments(this.documents);

        if (docId === this.currentDocId) {
            this.currentDocId = null;
            const editor = this.getElement('markdown-editor');
            if (editor) editor.value = '';
            this.lastRenderedContent = '';
            this.updatePreview(true);
        }

        this.renderDocumentList();
        this.showMessage(`${itemType}已删除`, 'success');
    }

    // ==================== 目录生成 ====================
    
    /**
     * 生成目录
     */
    generateTOC() {
        const preview = this.getElement('markdown-preview');
        const tocContainer = this.getElement('md-toc');
        if (!preview || !tocContainer) return;

        const headings = preview.querySelectorAll('h1, h2, h3, h4, h5, h6');
        if (headings.length === 0) {
            tocContainer.innerHTML = `<p class="md-empty-state">暂无目录</p>`;
            return;
        }

        const fragment = document.createDocumentFragment();

        headings.forEach((heading, index) => {
            if (!heading.id) heading.id = 'heading-' + index;

            const level = parseInt(heading.tagName.substring(1));
            const item = document.createElement('div');
            item.className = 'md-toc-item level-' + level;
            item.textContent = heading.textContent;
            item.dataset.headingId = heading.id;
            
            fragment.appendChild(item);
        });

        tocContainer.innerHTML = '';
        tocContainer.appendChild(fragment);

        // 事件委托
        tocContainer.onclick = (e) => {
            const item = e.target.closest('.md-toc-item');
            if (!item) return;

            const heading = document.getElementById(item.dataset.headingId);
            if (heading) {
                heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        };
    }

    // ==================== 导出功能 ====================
    
    /**
     * 导出为 HTML
     */
    exportHTML() {
        const editor = this.getElement('markdown-editor');
        if (!editor) return;

        const markdown = editor.value;
        const html = this.renderMarkdown(markdown);

        const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Markdown 导出</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 20px; }
        pre { background-color: #f6f8fa; padding: 16px; border-radius: 6px; overflow-x: auto; }
        code { background-color: rgba(27, 31, 35, 0.05); padding: 0.2em 0.4em; border-radius: 3px; }
        blockquote { border-left: 0.25em solid #dfe2e5; padding-left: 1em; color: #6a737d; }
        table { border-collapse: collapse; width: 100%; }
        table th, table td { border: 1px solid #dfe2e5; padding: 6px 13px; }
        img { max-width: 100%; }
    </style>
</head>
<body>
${html}
</body>
</html>`;

        this.downloadFile(fullHtml, 'text/html', '.html');
        this.showMessage('HTML 导出成功', 'success');
    }

    /**
     * 导出为 Markdown
     */
    exportMarkdown() {
        const editor = this.getElement('markdown-editor');
        if (!editor) return;

        this.downloadFile(editor.value, 'text/markdown', '.md');
        this.showMessage('Markdown 导出成功', 'success');
    }

    /**
     * 下载文件
     */
    downloadFile(content, mimeType, extension) {
        const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'document-' + new Date().toISOString().slice(0, 10) + extension;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ==================== 内容保存 ====================
    
    /**
     * 保存内容到本地存储
     */
    saveContent() {
        this.debounce('save', () => {
            const editor = this.getElement('markdown-editor');
            if (!editor) return;

            StoreManager.saveContent(editor.value);
        }, MarkdownEditor.DEBOUNCE_DELAY.SAVE);
    }

    /**
     * 设置编辑器内容
     */
    setContent(content) {
        const editor = this.getElement('markdown-editor');
        if (!editor) return;

        editor.value = content;
        this.updatePreview(true);
    }

    // ==================== 主题管理 ====================

    /**
     * 应用主题
     */
    applyTheme(mode) {
        document.documentElement.dataset.mode = mode;
        
        // 更新 Prism 主题
        const lightTheme = document.getElementById('prism-light-theme');
        const darkTheme = document.getElementById('prism-dark-theme');
        
        if (lightTheme && darkTheme) {
            if (mode === 'dark') {
                lightTheme.disabled = true;
                darkTheme.disabled = false;
            } else {
                lightTheme.disabled = false;
                darkTheme.disabled = true;
            }
        }

        // 更新 Mermaid 主题
        if (typeof mermaid !== 'undefined') {
            mermaid.initialize({
                startOnLoad: false,
                theme: mode === 'dark' ? 'dark' : 'default',
                securityLevel: 'loose'
            });
            // 重新渲染图表
            this.renderMermaidCharts();
        }
    }

    /**
     * 切换主题
     */
    toggleTheme() {
        const currentMode = StoreManager.loadTheme('light');
        const newMode = currentMode === 'dark' ? 'light' : 'dark';
        StoreManager.saveTheme(newMode);
        this.applyTheme(newMode);
        this.updateThemeIcon(newMode);
    }

    /**
     * 更新主题图标
     */
    updateThemeIcon(mode) {
        const themeToggle = this.getElement('theme-toggle');
        const themeIcon = themeToggle?.querySelector('.theme-icon');
        if (themeIcon) {
            themeIcon.textContent = mode === 'dark' ? '☀️' : '🌙';
        }
    }

    /**
     * 初始化主题
     */
    initTheme() {
        const mode = StoreManager.loadTheme('light');
        this.applyTheme(mode);
        this.updateThemeIcon(mode);
    }

    // ==================== 事件绑定 ====================
    
    /**
     * 绑定事件
     */
    bindEvents() {
        // 侧边栏按钮
        const sidebarButtons = {
            'md-toggle-left-sidebar': () => this.toggleSidebar('left'),
            'md-toggle-right-sidebar': () => this.toggleSidebar('right'),
            'md-close-left-sidebar': () => this.toggleSidebar('left'),
            'md-close-right-sidebar': () => this.toggleSidebar('right'),
            'md-sidebar-overlay': () => this.closeAllSidebars()
        };

        Object.entries(sidebarButtons).forEach(([id, handler]) => {
            const element = this.getElement(id);
            if (element) element.onclick = handler;
        });

        // 文档操作按钮
        const docButtons = {
            'md-new-file': () => this.createItem('file'),
            'md-new-folder': () => this.createItem('folder'),
            'md-rename-item': () => this.renameCurrentItem(),
            'md-delete-item': () => this.deleteCurrentItem(),
            'md-export-html': () => this.exportHTML(),
            'md-export-md': () => this.exportMarkdown(),
            'theme-toggle': () => this.toggleTheme()
        };

        Object.entries(docButtons).forEach(([id, handler]) => {
            const element = this.getElement(id);
            if (element) element.onclick = handler;
        });

        // 侧边栏区块折叠
        document.addEventListener('click', (e) => {
            const toggle = e.target.closest('.md-sidebar-section-toggle');
            if (toggle) {
                e.stopPropagation();
                this.toggleSection(toggle.getAttribute('data-section'));
                return;
            }

            const header = e.target.closest('.md-sidebar-section-header');
            if (header) {
                const toggle = header.querySelector('.md-sidebar-section-toggle');
                if (toggle) {
                    this.toggleSection(toggle.getAttribute('data-section'));
                }
            }
        });

        // 编辑器事件
        const editor = this.getElement('markdown-editor');
        if (editor) {
            editor.addEventListener('input', () => {
                this.updatePreview();
                this.saveContent();
                this.saveCurrentDocument();
            });

            editor.addEventListener('keydown', (e) => {
                // Tab 缩进
                if (e.key === 'Tab') {
                    e.preventDefault();
                    this.handleIndent(e.shiftKey);
                    return;
                }

                // Ctrl/Cmd + S 保存
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    if (this.timers.save) {
                        clearTimeout(this.timers.save);
                    }
                    StoreManager.saveContent(editor.value);
                    this.showMessage('内容已保存', 'success');
                }
            });
        }
    }

    // ==================== 初始化 ====================
    
    /**
     * 初始化
     */
    init() {
        if (this.isInitialized) return;

        this.initMermaid();
        this.initTheme();
        this.documents = StoreManager.loadDocuments();
        this.renderDocumentList();
        this.setContent(StoreManager.loadContent(MarkdownEditor.DEFAULT_CONTENT));
        this.bindEvents();
        this.setupDivider();
        this.applySectionStates();

        this.isInitialized = true;
    }
}
