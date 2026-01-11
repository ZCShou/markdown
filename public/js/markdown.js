/**
 * Markdown 编辑器管理器 - 独立版
 * 去除了对 itexp 项目的依赖，可作为独立项目使用
 */
class MarkdownEditor {
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

    // ==================== Markdown 渲染 ====================
    
    /**
     * 初始化 Mermaid
     */
    initMermaid() {
        if (typeof mermaid !== 'undefined') {
            mermaid.initialize({
                startOnLoad: false,
                theme: 'default',
                securityLevel: 'loose'
            });
        }
    }

    /**
     * 渲染 Markdown 为 HTML
     */
    renderMarkdown(markdown) {
        try {
            let html = '';
            if (typeof marked !== 'undefined' && marked.parse) {
                html = marked.parse(markdown, { breaks: true, gfm: true });
            } else {
                html = this.escapeHtml(markdown);
            }

            if (typeof DOMPurify !== 'undefined' && DOMPurify.sanitize) {
                html = DOMPurify.sanitize(html);
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
                    container.style.color = 'red';
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
            pre.style.position = 'relative';

            const btn = document.createElement('button');
            btn.className = 'code-copy-btn';
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
            editorPane.style.flex = 'none';
            previewPane.style.width = (availableWidth - leftWidth) + 'px';
            previewPane.style.flex = 'none';
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
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
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
            editorPane.style.flex = 'none';
            previewPane.style.width = (totalWidth - leftWidth - dividerWidth) + 'px';
            previewPane.style.flex = 'none';

            this.lastLeftRatio = leftWidth / (totalWidth - dividerWidth);
        });

        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                divider.classList.remove('dragging', 'hover');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
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

        this.saveSectionState(sectionName, !isCollapsed);
    }

    /**
     * 保存区块状态
     */
    saveSectionState(sectionName, isExpanded) {
        try {
            localStorage.setItem(`markdown_editor_section_${sectionName}`, isExpanded ? 'expanded' : 'collapsed');
        } catch (e) {
            console.warn('保存区块状态失败:', e);
        }
    }

    /**
     * 加载区块状态
     */
    loadSectionState(sectionName) {
        try {
            return localStorage.getItem(`markdown_editor_section_${sectionName}`) === 'collapsed';
        } catch (e) {
            return false;
        }
    }

    /**
     * 应用区块状态
     */
    applySectionStates() {
        ['toc', 'export'].forEach((sectionName) => {
            const isCollapsed = this.loadSectionState(sectionName);
            const content = document.getElementById(`md-${sectionName}-content`);

            if (content) content.classList.toggle('collapsed', isCollapsed);
        });
    }

    // ==================== 文档管理 ====================
    
    /**
     * 加载文档列表
     */
    loadDocuments() {
        try {
            const saved = localStorage.getItem('markdown_editor_documents');
            this.documents = saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.warn('加载文档列表失败:', e);
            this.documents = [];
        }
    }

    /**
     * 保存文档列表
     */
    saveDocuments() {
        try {
            localStorage.setItem('markdown_editor_documents', JSON.stringify(this.documents));
        } catch (e) {
            console.warn('保存文档列表失败:', e);
        }
    }

    /**
     * 渲染文档列表
     */
    renderDocumentList() {
        const docList = this.getElement('md-doc-list');
        if (!docList) return;

        if (this.documents.length === 0) {
            docList.innerHTML = `<p style="color: #999; text-align: center; padding: 20px;">暂无文档</p>`;
            return;
        }

        const fragment = document.createDocumentFragment();

        this.documents.forEach((doc) => {
            const item = document.createElement('div');
            item.className = 'md-doc-item' + (doc.id === this.currentDocId ? ' active' : '');
            
            const nameSpan = document.createElement('span');
            nameSpan.className = 'md-doc-item-name';
            nameSpan.textContent = doc.name;
            
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'md-doc-item-delete';
            deleteBtn.textContent = '🗑️';
            deleteBtn.title = '删除';
            deleteBtn.dataset.docId = doc.id;
            
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
            if (item) {
                const docId = item.querySelector('.md-doc-item-delete')?.dataset.docId;
                if (docId) this.openDocument(docId);
            }
        };
    }

    /**
     * 新建文档
     */
    newDocument() {
        const defaultName = '未命名文档 ' + new Date().toLocaleString();
        const docName = prompt('请输入文档名称:', defaultName);
        if (!docName) return;

        const doc = {
            id: Date.now().toString(),
            name: docName,
            content: '',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.documents.push(doc);
        this.saveDocuments();
        this.renderDocumentList();
        this.openDocument(doc.id);
        this.showMessage('文档已创建', 'success');
    }

    /**
     * 打开文档
     */
    openDocument(docId) {
        const doc = this.documents.find((d) => d.id === docId);
        if (!doc) return;

        this.currentDocId = docId;
        const editor = this.getElement('markdown-editor');
        if (editor) {
            editor.value = doc.content;
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
            if (!doc) return;

            doc.content = editor.value;
            doc.updatedAt = new Date().toISOString();
            this.saveDocuments();
        }, MarkdownEditor.DEBOUNCE_DELAY.SAVE);
    }

    /**
     * 删除文档
     */
    deleteDocument(docId) {
        if (!confirm('确定要删除这个文档吗？')) return;

        const index = this.documents.findIndex((d) => d.id === docId);
        if (index === -1) return;

        this.documents.splice(index, 1);
        this.saveDocuments();

        if (docId === this.currentDocId) {
            this.currentDocId = null;
            const editor = this.getElement('markdown-editor');
            if (editor) editor.value = '';
            this.lastRenderedContent = '';
            this.updatePreview(true);
        }

        this.renderDocumentList();
        this.showMessage('文档已删除', 'success');
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
            tocContainer.innerHTML = `<p style="color: #999; text-align: center; padding: 20px;">暂无目录</p>`;
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

            try {
                localStorage.setItem('markdown_editor_content', editor.value);
            } catch (e) {
                console.warn('保存内容失败:', e);
            }
        }, MarkdownEditor.DEBOUNCE_DELAY.SAVE);
    }

    /**
     * 从本地存储加载内容
     */
    loadContent() {
        try {
            const saved = localStorage.getItem('markdown_editor_content');
            if (saved) return saved;
        } catch (e) {
            console.warn('加载内容失败:', e);
        }
        return MarkdownEditor.DEFAULT_CONTENT;
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
     * 获取当前主题模式
     */
    getThemeMode() {
        try {
            return localStorage.getItem('markdown_editor_theme') || 'light';
        } catch (e) {
            return 'light';
        }
    }

    /**
     * 设置主题模式
     */
    setThemeMode(mode) {
        try {
            localStorage.setItem('markdown_editor_theme', mode);
        } catch (e) {
            console.warn('保存主题失败:', e);
        }
    }

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
        const currentMode = this.getThemeMode();
        const newMode = currentMode === 'dark' ? 'light' : 'dark';
        this.setThemeMode(newMode);
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
        const mode = this.getThemeMode();
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
            'md-new-doc': () => this.newDocument(),
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
                if ((e.ctrlKey || e.metaKey) && e.key === 's') {
                    e.preventDefault();
                    if (this.timers.save) {
                        clearTimeout(this.timers.save);
                    }
                    localStorage.setItem('markdown_editor_content', editor.value);
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
        this.loadDocuments();
        this.renderDocumentList();
        this.setContent(this.loadContent());
        this.bindEvents();
        this.setupDivider();
        this.applySectionStates();

        this.isInitialized = true;
    }
}

// ==================== 全局初始化 ====================

// 创建全局编辑器实例
window.MarkdownEditor = new MarkdownEditor();

// 等待DOM加载完成后初始化
document.addEventListener('DOMContentLoaded', () => {
    window.MarkdownEditor.init();
});
