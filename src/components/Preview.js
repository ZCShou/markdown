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
    // ==================== 私有字段声明 ====================
    
    /** @private */
    #renderCache;
    
    /** @private */
    #cleanupInterval;

    /**
     * 构造函数
     */
    constructor(state, containerId) {
        super(state, containerId);
        this.mermaidInitialized = false;
        this.renderTimeout = null;
        
        // 渲染缓存（私有字段）
        this.#renderCache = {
            cache: new Map(),
            memoryUsage: 0,
            hitCount: 0,
            missCount: 0,
            maxSize: 50,
            maxMemory: 10 * 1024 * 1024 // 10MB
        };
        
        // 定期清理过期缓存
        this.#cleanupInterval = setInterval(() => {
            this.#cleanupRenderCache();
        }, 60 * 1000);
    }

    // ==================== 渲染缓存私有方法 ====================
    
    /**
     * 生成缓存键
     * @private
     */
    #generateCacheKey(content) {
        let hash = 2166136261;
        for (let i = 0; i < content.length; i++) {
            hash ^= content.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash.toString(36);
    }

    /**
     * 估算字符串内存占用
     * @private
     */
    #estimateSize(str) {
        return str.length * 2;
    }

    /**
     * 检查缓存是否过期
     * @private
     */
    #isCacheExpired(entry) {
        const ttl = 5 * 60 * 1000; // 5 分钟
        return Date.now() - entry.timestamp > ttl;
    }

    /**
     * 驱逐最旧的缓存条目
     * @private
     */
    #evictCache() {
        const firstKey = this.#renderCache.cache.keys().next().value;
        if (firstKey) {
            const entry = this.#renderCache.cache.get(firstKey);
            this.#renderCache.memoryUsage -= this.#estimateSize(entry.html);
            this.#renderCache.cache.delete(firstKey);
        }
    }

    /**
     * 从缓存获取渲染结果
     * @private
     */
    #getFromCache(content) {
        const key = this.#generateCacheKey(content);
        const entry = this.#renderCache.cache.get(key);

        if (!entry) {
            this.#renderCache.missCount++;
            return null;
        }

        if (this.#isCacheExpired(entry)) {
            this.#renderCache.cache.delete(key);
            this.#renderCache.missCount++;
            return null;
        }

        entry.timestamp = Date.now();
        this.#renderCache.hitCount++;
        return entry.html;
    }

    /**
     * 存入缓存
     * @private
     */
    #setToCache(content, html) {
        const key = this.#generateCacheKey(content);
        const size = this.#estimateSize(html);

        if (this.#renderCache.cache.has(key)) {
            const oldEntry = this.#renderCache.cache.get(key);
            this.#renderCache.memoryUsage -= this.#estimateSize(oldEntry.html);
        }

        // 检查内存限制
        while (this.#renderCache.memoryUsage + size > this.#renderCache.maxMemory && this.#renderCache.cache.size > 0) {
            this.#evictCache();
        }

        // 检查条目数限制
        while (this.#renderCache.cache.size >= this.#renderCache.maxSize && this.#renderCache.cache.size > 0) {
            this.#evictCache();
        }

        this.#renderCache.cache.set(key, { html, timestamp: Date.now() });
        this.#renderCache.memoryUsage += size;
    }

    /**
     * 清理过期缓存
     * @private
     */
    #cleanupRenderCache() {
        const now = Date.now();
        const ttl = 5 * 60 * 1000;

        for (const [key, entry] of this.#renderCache.cache.entries()) {
            if (now - entry.timestamp > ttl) {
                this.#renderCache.memoryUsage -= this.#estimateSize(entry.html);
                this.#renderCache.cache.delete(key);
            }
        }
    }

    /**
     * 清空缓存
     * @private
     */
    #clearRenderCache() {
        this.#renderCache.cache.clear();
        this.#renderCache.memoryUsage = 0;
        this.#renderCache.hitCount = 0;
        this.#renderCache.missCount = 0;
    }

    /**
     * 初始化组件
     */
    init() {
        super.init();
        this.initMermaid();
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
     * 渲染组件
     */
    render() {
        // 初始渲染预览内容
        const content = this.state.get('content') || '';
        if (content) {
            this._scheduleRender(content, 0);
        }
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

        this._scheduleRender(content, 100);
    }

    /**
     * 调度渲染（内部方法）
     */
    _scheduleRender(content, delay = 100) {
        // 取消之前的渲染任务
        if (this.renderTimeout) {
            clearTimeout(this.renderTimeout);
        }
        
        this.renderTimeout = setTimeout(() => {
            this.renderContent(content);
            this.state.updateLastRenderedContent(content);
            this.renderTimeout = null;
        }, delay);
    }

    /**
     * 强制更新预览（用于切换文档时）
     */
    forceUpdatePreview() {
        const currentDocId = this.state.get('currentDocId');
        if (!currentDocId) return;
        
        const documents = this.state.get('documents');
        const doc = documents.find(d => d.id === currentDocId);
        if (!doc || doc.type === 'folder') return;
        
        this._scheduleRender(doc.content || '', 0);
    }

    /**
     * 渲染内容
     */
    renderContent(markdown) {
        // 直接渲染内容
        const html = this.renderMarkdown(markdown);
        this.container.innerHTML = html;

        // 异步处理高亮和图表
        requestAnimationFrame(() => {
            this.highlightCode();
            this.renderMermaidCharts();
            this.addCopyButtons();
            this.checkImageLoad();
            
            // 更新标题数据到状态（用于目录生成）
            this.state.setState({ headings: this.getHeadings() });
        });
    }

    /**
     * 渲染 Markdown 为 HTML（带缓存）
     */
    renderMarkdown(markdown) {
        // 尝试从缓存获取
        let html = this.#getFromCache(markdown);
        
        if (html) return html;
        
        // 缓存未命中，执行渲染
        try {
            if (marked?.parse) {
                html = marked.parse(markdown, { breaks: true, gfm: true });
            } else {
                html = this.escapeHtml(markdown);
            }

            // 净化 HTML
            if (DOMPurify?.sanitize) {
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

            // 存入缓存
            this.#setToCache(markdown, html);
            return html;
        } catch (e) {
            console.warn('Markdown 渲染失败:', e);
            return this.escapeHtml(markdown);
        }
    }

    /**
     * 应用代码高亮（异步分批处理）
     */
    highlightCode() {
        if (typeof Prism === 'undefined') return;

        const codeBlocks = dom.getAllIn(this.container, 'pre code:not(.prism-highlighted)');
        if (codeBlocks.length === 0) return;

        const BATCH_SIZE = 5;
        let index = 0;

        // 处理一批代码块
        const processBatch = () => {
            const batch = codeBlocks.slice(index, index + BATCH_SIZE);
            
            for (let i = 0; i < batch.length; i++) {
                Prism.highlightElement(batch[i]);
                batch[i].classList.add('prism-highlighted');
            }

            index += BATCH_SIZE;

            // 如果还有剩余代码块，继续处理
            if (index < codeBlocks.length) {
                if (typeof requestIdleCallback !== 'undefined') {
                    requestIdleCallback(processBatch, { timeout: 50 });
                } else {
                    setTimeout(processBatch, 0);
                }
            }
        };

        // 开始处理
        requestAnimationFrame(processBatch);
    }

    /**
     * 渲染 Mermaid 图表（带超时机制）
     */
    renderMermaidCharts() {
        if (typeof mermaid === 'undefined') return;

        const isRendering = this.state.get('isRenderingMermaid');
        if (isRendering) return;

        const mermaidBlocks = dom.getAllIn(this.container, 'pre code.language-mermaid');
        if (mermaidBlocks.length === 0) return;

        this.state.setRenderingState(true);

        const containers = [];

        for (let i = 0; i < mermaidBlocks.length; i++) {
            const block = mermaidBlocks[i];
            const code = block.textContent.trim();
            if (!code) continue;

            const preElement = block.parentElement;
            const mermaidContainer = document.createElement('div');
            mermaidContainer.className = 'mermaid';
            mermaidContainer.textContent = code;

            if (preElement?.parentNode) {
                preElement.parentNode.replaceChild(mermaidContainer, preElement);
                containers.push(mermaidContainer);
            }
        }

        if (containers.length === 0) {
            this.state.setRenderingState(false);
            return;
        }

        // 添加超时机制（5秒）
        const timeoutId = setTimeout(() => {
            console.warn('Mermaid 渲染超时');
            containers.forEach(c => {
                if (!c.classList.contains('mermaid-done')) {
                    c.textContent = '图表渲染超时';
                    c.classList.add('render-error');
                }
            });
            this.state.setRenderingState(false);
        }, 5000);

        mermaid.run({ nodes: containers })
            .then(() => {
                clearTimeout(timeoutId);
                containers.forEach(c => c.classList.add('mermaid-done'));
                this.state.setRenderingState(false);
            })
            .catch((err) => {
                clearTimeout(timeoutId);
                console.warn('Mermaid 渲染失败:', err);
                containers.forEach(c => {
                    c.textContent = '图表渲染失败: ' + err.message;
                    c.classList.add('render-error');
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

        for (let i = 0; i < preElements.length; i++) {
            const pre = preElements[i];
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
            });
        }
    }

    /**
     * 检查图片加载状态
     */
    checkImageLoad() {
        const images = dom.getAllIn(this.container, 'img:not([data-error-handled])');
        images.forEach(img => img.dataset.errorHandled = 'true');
    }

    /**
     * 处理图片加载错误
     */
    handleImageError(img) {
        img.alt = `图片加载失败: ${img.src}`;
        img.style.cssText = 'border: 2px dashed #f44336; padding: 10px;';
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

    /**
     * 销毁组件，清理资源
     */
    destroy() {
        // 清理缓存清理定时器
        if (this.#cleanupInterval) {
            clearInterval(this.#cleanupInterval);
            this.#cleanupInterval = null;
        }
        
        // 清理渲染缓存
        this.#clearRenderCache();
        
        // 调用父类销毁逻辑
        super.destroy();
    }
}
