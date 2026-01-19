/**
 * 预览组件
 * 负责 Markdown 渲染、代码高亮、Mermaid 图表
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import Prism from 'prismjs';
import mermaid from 'mermaid';
import { BaseComponent } from './BaseComponent.js';
import { dom } from '../utils/dom.js';

export class Preview extends BaseComponent {
    /**
     * 构造函数
     */
    constructor(state, containerId) {
        super(state, containerId);
        this.mermaidInitialized = false;
        this.renderTimeout = null;
    }

    /**
     * 初始化组件
     */
    init() {
        super.init();
        this.initMermaid();
        this.initPrism();
    }

    /**
     * 订阅状态变化
     */
    subscribe() {
        // 订阅内容、当前文档和主题变化
        this.unsubscribe = this.state.subscribeTo(['content', 'currentDocId', 'theme'], (newValue, oldValue, key) => {
            if (key === 'content') {
                this.updatePreview();
            } else if (key === 'currentDocId') {
                // 切换文档时强制更新预览
                this.forceUpdatePreview();
            } else if (key === 'theme') {
                this.updateMermaidTheme();
            }
        });
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 图片加载错误处理
        this.addEventListener(this.container, 'error', (e) => {
            if (e.target.tagName === 'IMG') {
                this.handleImageError(e.target);
            }
        }, true);
    }

    /**
     * 初始化 Mermaid
     */
    initMermaid() {
        if (this.mermaidInitialized) return;

        mermaid.initialize({
            startOnLoad: false,
            theme: 'default',
            securityLevel: 'loose'
        });

        this.mermaidInitialized = true;
    }

    /**
     * 初始化 Prism
     */
    initPrism() {
        // Prism 已经通过 import 加载了所有需要的语言包
        // 这里不需要额外初始化
    }

    /**
     * 更新 Mermaid 主题
     */
    updateMermaidTheme() {
        const theme = this.state.get('theme');
        mermaid.initialize({
            startOnLoad: false,
            theme: theme === 'dark' ? 'dark' : 'default',
            securityLevel: 'loose'
        });
        this.renderMermaidCharts();
    }

    /**
     * 更新预览
     */
    updatePreview() {
        const content = this.state.get('content');
        const lastRendered = this.state.get('lastRenderedContent');

        // 避免重复渲染（但允许初始渲染）
        if (content === lastRendered && lastRendered !== '') return;

        // 取消之前的渲染任务
        if (this.renderTimeout) {
            clearTimeout(this.renderTimeout);
        }

        // 使用较短的延迟，确保输入时能及时更新
        this.renderTimeout = setTimeout(() => {
            this.renderContent(content);
            this.state.updateLastRenderedContent(content);
            this.renderTimeout = null;
        }, 100);
    }

    /**
     * 强制更新预览（用于切换文档时）
     */
    forceUpdatePreview() {
        const currentDocId = this.state.get('currentDocId');
        
        // 快速检查：如果没有 currentDocId，直接返回
        if (!currentDocId) return;
        
        // 直接从 documents 中获取文档内容，确保是最新的
        const documents = this.state.get('documents');
        const doc = documents.find(d => d.id === currentDocId);
        
        // 如果是文件夹或文档不存在，不渲染（保持之前的预览内容）
        if (!doc || doc.type === 'folder') {
            return;
        }
        
        const content = doc.content || '';
        
        // 取消之前的渲染任务
        if (this.renderTimeout) {
            clearTimeout(this.renderTimeout);
        }
        
        // 使用 setTimeout 将渲染推迟到下一个事件循环，避免阻塞 UI
        this.renderTimeout = setTimeout(() => {
            this.renderContent(content);
            this.state.updateLastRenderedContent(content);
            this.renderTimeout = null;
        }, 0);
    }

    /**
     * 渲染内容
     */
    renderContent(markdown) {
        // 直接渲染内容，不显示加载状态
        const html = this.renderMarkdown(markdown);
        this.container.innerHTML = html;

        // 异步处理高亮和图表
        requestAnimationFrame(() => {
            this.highlightCode();
            this.renderMermaidCharts();
            this.addCopyButtons();
            this.checkImageLoad();
        });
    }

    /**
     * 渲染 Markdown 为 HTML
     */
    renderMarkdown(markdown) {
        try {
            let html = '';
            if (marked && marked.parse) {
                const options = {
                    breaks: true,
                    gfm: true
                };
                html = marked.parse(markdown, options);
            } else {
                html = this.escapeHtml(markdown);
            }

            if (DOMPurify && DOMPurify.sanitize) {
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
     * 应用代码高亮（分批处理）
     */
    highlightCode() {
        if (typeof Prism === 'undefined') return;

        const codeBlocks = dom.getAllIn(this.container, 'pre code:not(.prism-highlighted)');
        if (codeBlocks.length === 0) return;

        const batchSize = 10;
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
        if (typeof mermaid === 'undefined') return;

        const isRendering = this.state.get('isRenderingMermaid');
        if (isRendering) return;

        const mermaidBlocks = dom.getAllIn(this.container, 'pre code.language-mermaid');
        if (mermaidBlocks.length === 0) return;

        this.state.setRenderingState(true);

        const containers = [];

        mermaidBlocks.forEach((block) => {
            const code = block.textContent.trim();
            if (!code) return;

            const preElement = block.parentElement;
            const container = dom.create('div', {
                className: 'mermaid',
                textContent: code
            });

            if (preElement && preElement.parentNode) {
                preElement.parentNode.replaceChild(container, preElement);
                containers.push(container);
            }
        });

        if (containers.length === 0) {
            this.state.setRenderingState(false);
            return;
        }

        mermaid.run({ nodes: containers })
            .then(() => {
                this.state.setRenderingState(false);
            })
            .catch((err) => {
                console.warn('Mermaid 渲染失败:', err);
                containers.forEach((container) => {
                    container.textContent = '图表渲染失败: ' + err.message;
                    container.classList.add('render-error');
                });
                this.state.setRenderingState(false);
            });
    }

    /**
     * 添加代码块复制按钮
     */
    addCopyButtons() {
        const preElements = dom.getAllIn(this.container, 'pre:not(.has-copy-btn)');
        if (preElements.length === 0) return;

        preElements.forEach((pre) => {
            pre.classList.add('has-copy-btn');

            const btn = this.createElement('button', {
                className: 'md-btn md-btn-sm code-copy-btn',
                textContent: '📋',
                attributes: { title: '复制代码' },
                parent: pre
            });

            this.addEventListener(btn, 'click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const code = dom.getIn(pre, 'code');
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
            });
        });
    }

    /**
     * 检查图片加载状态
     */
    checkImageLoad() {
        const images = dom.getAllIn(this.container, 'img:not([data-error-handled])');
        images.forEach((img) => {
            img.dataset.errorHandled = 'true';
        });
    }

    /**
     * 处理图片加载错误
     */
    handleImageError(img) {
        img.alt = `图片加载失败: ${img.src}`;
        img.style.border = '2px dashed #f44336';
        img.style.padding = '10px';
    }

    /**
     * 导出为 HTML
     */
    exportHTML() {
        const content = this.state.get('content');
        const html = this.renderMarkdown(content);

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
        const content = this.state.get('content');
        this.downloadFile(content, 'text/markdown', '.md');
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

    /**
     * 获取所有标题（用于生成目录）
     */
    getHeadings() {
        return dom.getAllIn(this.container, 'h1, h2, h3, h4, h5, h6');
    }
}
