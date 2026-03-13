/**
 * 导出组件
 * 负责 HTML、Markdown、PDF 导出功能
 * 直接订阅 export:trigger 事件，独立于 Preview 组件
 */
import { isInternalImagePath, getImageAsBase64 } from '../utils/helpers.js';

export class Exporter {
    /** @type {Function|null} */
    #unsubscribeReady = null;

    /**
     * @param {Object} state - 状态管理器
     * @param {string} previewContainerId - 预览容器元素 ID
     */
    constructor(state, previewContainerId) {
        this.state = state;
        this.previewContainerId = previewContainerId;
        this.unsubscribe = null;
        this.#unsubscribeReady = null;
    }

    /**
     * 初始化组件，订阅导出事件
     *
     * 通信流程（通过 EditorState 解耦）：
     *   1. export:trigger  → Exporter 收到请求
     *      - Markdown 直接导出（不依赖渲染 DOM）
     *      - HTML / PDF 先触发 export:prepare，等待 Preview 完整渲染
     *   2. export:prepare  → Preview 收到，强制渲染全部待处理元素
     *      渲染完成后触发 export:ready 并附带 HTML 快照
     *   3. export:ready    → Exporter 收到，执行实际的导出逻辑
     */
    init() {
        // 阶段 1：收到导出请求
        this.unsubscribe = this.state.subscribeTo('export:trigger', type => {
            if (type === 'md') {
                // Markdown 导出不依赖渲染结果，直接执行
                this.exportMarkdown();
            } else if (type === 'html' || type === 'pdf') {
                // 需要完整渲染的 HTML：先请求 Preview 完整渲染
                this.#showMessage('正在准备导出...', 'info');
                this.state.triggerExportPrepare(type);
            } else {
                console.warn('Unknown export type:', type);
            }
        });

        // 阶段 3：Preview 完整渲染后，执行实际导出
        this.#unsubscribeReady = this.state.subscribeTo('export:ready', async (type, html) => {
            try {
                if (type === 'html') {
                    await this.exportHTML(html);
                } else if (type === 'pdf') {
                    await this.exportPDF(html);
                }
            } catch (err) {
                console.error('Export failed:', err);
                this.#showMessage('导出失败', 'error');
            }
        });
    }

    /**
     * 显示消息（使用状态驱动的通知系统）
     * @param {string} message - 消息内容
     * @param {string} type - 消息类型
     * @private
     */
    #showMessage(message, type = 'info') {
        this.state.showNotification(message, type);
    }

    // ==================== 公共方法 ====================

    /**
     * 导出为 HTML
     * @param {string} rawHtml - Preview 完整渲染后的容器 innerHTML
     * @returns {Promise<void>}
     */
    async exportHTML(rawHtml) {
        if (!rawHtml) {
            this.#showMessage('预览内容为空', 'error');
            return;
        }

        // 使用传入的已渲染 HTML
        let html = rawHtml;

        // 将内部图片转换为 base64（必须在 cleanHtml 之前，因为需要 src 属性）
        html = await this.#convertInternalImagesToBase64(html);

        // 清理不需要的属性和类
        html = this.#cleanHtml(html);

        // 获取当前主题
        const isDark = this.state.get('interface')?.theme === 'dark';

        const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN"${isDark ? ' data-mode="dark"' : ''}>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Markdown 导出</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.28/dist/katex.min.css">
<style>
${this.#getCommonStyles()}
/* ==================== 响应式 ==================== */
@media (max-width: 768px) {
  body {
    padding: 12px;
  }
  
  .markdown-body {
    padding: 16px;
  }
}

/* ==================== 打印优化 ==================== */
@media print {
  body {
    background: #fff !important;
    padding: 0 !important;
  }
  
  .markdown-body {
    max-width: 100%;
    box-shadow: none;
    padding: 0;
  }
  
  .code-copy-btn {
    display: none !important;
  }
}
</style>
</head>
<body>
<div class="markdown-body">
${html}
</div>
</body>
</html>`;

        this.#downloadFile(fullHtml, 'text/html', '.html');
        this.#showMessage('HTML 导出成功', 'success');
    }

    /**
     * 导出为 Markdown
     * @returns {void}
     */
    exportMarkdown() {
        const content = this.state.get('content');
        this.#downloadFile(content, 'text/markdown', '.md');
        this.#showMessage('Markdown 导出成功', 'success');
    }

    /**
     * 导出为 PDF（在当前页面内通过隐藏 iframe 触发打印，无需弹窗权限）
     * @param {string} rawHtml - Preview 完整渲染后的容器 innerHTML
     * @returns {Promise<void>}
     */
    async exportPDF(rawHtml) {
        if (!rawHtml) {
            this.#showMessage('预览内容为空', 'warning');
            return;
        }
        const content = this.state.get('content');
        if (!content) {
            this.#showMessage('没有内容可导出', 'warning');
            return;
        }

        // 固定默认值
        const pageSize = '210mm 297mm';

        // 将内部图片转换为 base64（必须在 cleanHtml 之前）
        let html = await this.#convertInternalImagesToBase64(rawHtml);

        // 清理不需要的属性和类
        html = this.#cleanHtml(html);

        // 获取当前主题
        const isDark = this.state.get('interface')?.theme === 'dark';

        // 获取文档标题
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const docTitle = titleMatch ? titleMatch[1].trim() : 'Markdown 文档';

        const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN"${isDark ? ' data-mode="dark"' : ''}>
<head>
<meta charset="UTF-8">
<title>${docTitle} - PDF 导出</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.28/dist/katex.min.css">
<style>
${this.#getCommonStyles()}

/* ==================== PDF 页面布局 ==================== */
html, body {
  margin: 0;
  padding: 0;
  background: #fff;
}

body {
  padding: 24px;
  box-sizing: border-box;
}

.markdown-body {
  max-width: 900px;
  margin: 0 auto;
  background: #fff;
  color: #000;
}

/* ==================== 打印样式 ==================== */
@media print {
  @page {
    size: ${pageSize};
    margin: 25mm 15mm 25mm 15mm;
  }

  html, body { background: #fff !important; margin: 0 !important; padding: 0 !important; }

  .markdown-body {
    max-width: 100%;
    box-shadow: none;
    padding: 0;
    border-radius: 0;
    background-color: #fff !important;
    color: #000 !important;
  }

  .markdown-body h1, .markdown-body h2, .markdown-body h3,
  .markdown-body h4, .markdown-body h5, .markdown-body h6 {
    color: #000 !important;
    page-break-after: avoid;
  }
  .markdown-body h1 { border-bottom-color: #ccc; }
  .markdown-body h2 { border-bottom-color: #ccc; }

  .markdown-body a { color: #000 !important; }
  .markdown-body a[href^='http']::after {
    content: ' (' attr(href) ')';
    font-size: 0.8em;
    color: #666;
  }

  .markdown-body pre {
    background-color: #f5f5f5 !important;
    border: 1px solid #ddd;
    white-space: pre-wrap;
    word-wrap: break-word;
    page-break-inside: avoid;
  }
  .markdown-body code { background-color: #f0f0f0; color: #333 !important; }
  .markdown-body blockquote { border-left-color: #ccc; color: #555; page-break-inside: avoid; }
  .markdown-body table { page-break-inside: avoid; }
  .markdown-body th { background-color: #e0e0e0 !important; }
  .markdown-body tr { border-top-color: #ccc; background-color: #fff !important; }
  .markdown-body tr:nth-child(2n) { background-color: #f5f5f5 !important; }
  .markdown-body img { max-width: 100% !important; page-break-inside: avoid; }
  .markdown-body .mermaid { background-color: #fff !important; border-color: #ddd; page-break-inside: avoid; }

  .code-copy-btn { display: none !important; }

  code[class*='language-'], pre[class*='language-'] { text-shadow: none !important; }
}
</style>
</head>
<body>
<div class="markdown-body">
${html}
</div>
</body>
</html>`;

        // ── 使用隐藏 iframe + Blob URL 触发打印（doc.write 不能可靠触发 load 事件）──
        const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
        const blobUrl = URL.createObjectURL(blob);

        const iframe = document.createElement('iframe');
        iframe.setAttribute('aria-hidden', 'true');
        iframe.style.cssText =
            'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;border:none;';
        document.body.appendChild(iframe);

        // 打印后移除 iframe 并释放 Blob URL
        const cleanup = () => {
            URL.revokeObjectURL(blobUrl);
            if (document.body.contains(iframe)) document.body.removeChild(iframe);
        };

        iframe.addEventListener(
            'load',
            () => {
                const iframeWin = iframe.contentWindow;
                // afterprint：打印对话框关闭后清理
                iframeWin.addEventListener('afterprint', cleanup, { once: true });
                // 60 秒兜底清理（防止 afterprint 不触发）
                const fallback = setTimeout(cleanup, 60_000);
                iframeWin.addEventListener('afterprint', () => clearTimeout(fallback), {
                    once: true
                });

                const doPrint = () => iframeWin.print();
                // 等待字体加载，最多 3 秒超时避免 CDN 慢/被屏蔽时永久挂起
                const fontsReady = iframeWin.document.fonts?.ready ?? Promise.resolve();
                Promise.race([fontsReady, new Promise(r => setTimeout(r, 3000))]).then(doPrint);
            },
            { once: true }
        );

        iframe.src = blobUrl;

        this.#showMessage('请在打印对话框中选择"另存为 PDF"', 'info');
    }

    // ==================== 私有方法 ====================

    /**
     * 将 HTML 中的内部图片转换为 Base64 Data URL
     * @param {string} html - 原始 HTML
     * @returns {Promise<string>} - 转换后的 HTML
     * @private
     */
    async #convertInternalImagesToBase64(html) {
        // 匹配所有 img 标签，同时捕获 src 和 data-src
        const imgRegex = /<img([^>]*)>/g;
        const replacements = [];

        let match;
        while ((match = imgRegex.exec(html)) !== null) {
            const fullMatch = match[0];
            const attrs = match[1];

            // 提取 src 和 data-src 属性
            const srcMatch = attrs.match(/src="([^"]+)"/);
            const dataSrcMatch = attrs.match(/data-src="([^"]+)"/);

            // 优先使用 data-src（内部图片的原始路径），其次检查 src
            const imagePath = dataSrcMatch?.[1] || (srcMatch?.[1] && isInternalImagePath(srcMatch[1]) ? srcMatch[1] : null);

            if (imagePath) {
                replacements.push(this.#loadImageAsBase64(imagePath).then(base64 => {
                    if (base64) {
                        return { fullMatch, dataSrc: dataSrcMatch?.[1], base64 };
                    }
                    return null;
                }).catch(err => {
                    console.warn('Failed to convert image to base64:', imagePath, err);
                    return null;
                }));
            }
        }

        // 并行加载所有图片
        const results = await Promise.all(replacements);

        // 替换 src 为 base64，并移除 data-src 属性
        results
            .filter(r => r !== null)
            .sort((a, b) => b.fullMatch.length - a.fullMatch.length)
            .forEach(({ fullMatch, dataSrc, base64 }) => {
                // 构建新的 img 标签：替换 src，移除 data-src
                let newTag = fullMatch.replace(/src="[^"]+"/, `src="${base64}"`);
                if (dataSrc) {
                    newTag = newTag.replace(/\s*data-src="[^"]*"/, '');
                }
                html = html.replace(fullMatch, newTag);
            });

        return html;
    }

    /**
     * 加载单个图片并转换为 Base64
     * @param {string} src - 图片路径
     * @returns {Promise<string|null>} Base64 Data URL 或 null
     * @private
     */
    async #loadImageAsBase64(src) {
        // Tauri 环境：从文件系统读取
        if (window.__TAURI__) {
            const { readFile } = window.__TAURI__.fs;
            const { join, resourceDir } = window.__TAURI__.path;

            const resourceDirPath = await resourceDir();
            const fullPath = await join(resourceDirPath, src.replace(/^\/?/, ''));

            try {
                const uint8Array = await readFile(fullPath);
                // 根据扩展名推断 MIME 类型
                const ext = src.split('.').pop()?.toLowerCase() || 'png';
                const mimeTypes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
                const mime = mimeTypes[ext] || 'image/png';
                // 使用高效的方式转换 Uint8Array 到 Base64（避免 call stack overflow 和性能问题）
                const base64 = this.#uint8ArrayToBase64(uint8Array);
                return `data:${mime};base64,${base64}`;
            } catch (err) {
                console.warn('Failed to read image file:', fullPath, err);
                return null;
            }
        }

        // Web 环境：从 IndexedDB 读取
        return getImageAsBase64(src);
    }

    /**
     * 高效地将 Uint8Array 转换为 Base64 字符串
     * 分块处理以避免大文件的 call stack overflow
     * @param {Uint8Array} bytes - 字节数组
     * @returns {string} Base64 编码字符串
     * @private
     */
    #uint8ArrayToBase64(bytes) {
        const CHUNK_SIZE = 8192; // 每次处理 8KB
        let result = '';
        for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
            const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
            result += String.fromCharCode.apply(null, Array.from(chunk));
        }
        return btoa(result);
    }

    /**
     * 清理 HTML 中不需要的属性和类
     * @param {string} html - 原始 HTML
     * @returns {string} - 清理后的 HTML
     * @private
     */
    #cleanHtml(html) {
        return html
            .replace(/ class="prism-highlighted"/g, '')
            .replace(/ class="mermaid-done"/g, '')
            .replace(/ class="mermaid-pending"/g, '')
            .replace(/ class="mermaid-rendering"/g, '')
            .replace(/ data-load-status="[^"]*"/g, '')
            .replace(/ class="math-rendered"/g, '')
            .replace(/ class="math-pending"/g, '')
            .replace(/ data-mermaid="[^"]*"/g, '')
            .replace(/ data-latex="[^"]*"/g, '')
            .replace(/\s*data-src="[^"]*"/g, ''); // 清理内部图片的原始路径属性
    }

    /**
     * 获取导出通用的 CSS 样式
     * @returns {string} - CSS 样式字符串
     * @private
     */
    #getCommonStyles() {
        return `/* ==================== CSS 变量 ==================== */
:root {
  --md-bg-primary: #f5f5f5;
  --md-bg-secondary: #fff;
  --md-bg-tertiary: #f8f9fa;
  --md-text-primary: #333;
  --md-text-secondary: #666;
  --md-text-tertiary: #999;
  --md-border: #e0e0e0;
  --md-border-light: #dfe2e5;
  --md-color-primary: #2196f3;
  --md-color-success: #4caf50;
  --md-color-danger: #f44336;
  --md-code-bg: #f3f4f6;
  --md-code-bg-inline: rgba(0, 0, 0, 0.06);
  --md-code-text: #24292e;
  --md-markdown-bg: #fff;
  --md-markdown-text: #24292e;
  --md-markdown-link: #0366d6;
  --md-markdown-quote: #6a737d;
  --md-checkbox-border: #dfe2e5;
  --md-checkbox-checked-bg: #0366d6;
  --prism-bg: #f5f5f5;
  --prism-text-shadow: 0 1px #fff;
  --prism-comment: #708090;
  --prism-punctuation: #999;
  --prism-property: #905;
  --prism-selector: #690;
  --prism-operator: #9a6e3a;
  --prism-keyword: #07a;
  --prism-function: #dd4a68;
  --prism-regex: #e90;
}

[data-mode='dark'] {
  --md-bg-primary: #0f1420;
  --md-bg-secondary: #1e1e1e;
  --md-bg-tertiary: #2d2d2d;
  --md-text-primary: #e0e0e0;
  --md-text-secondary: #b0b0b0;
  --md-text-tertiary: #7f8c8d;
  --md-border: #3e3e3e;
  --md-border-light: #3e3e3e;
  --md-color-primary: #42a5f5;
  --md-code-bg: #1a1a1a;
  --md-code-bg-inline: rgba(255, 255, 255, 0.12);
  --md-code-text: #e0e0e0;
  --md-markdown-bg: #1e1e1e;
  --md-markdown-text: #e0e0e0;
  --md-markdown-link: #42a5f5;
  --md-markdown-quote: #b0b0b0;
  --md-checkbox-border: #3e3e3e;
  --md-checkbox-checked-bg: #0d47a1;
  --prism-bg: #2d2d2d;
  --prism-text-shadow: 0 1px rgba(0, 0, 0, 0.3);
  --prism-comment: #8e929a;
  --prism-punctuation: #d4d4d4;
  --prism-property: #b5cea8;
  --prism-selector: #ce9178;
  --prism-operator: #d4d4d4;
  --prism-keyword: #c586c0;
  --prism-function: #dcdcaa;
  --prism-regex: #d16969;
}

/* ==================== 基础样式 ==================== */
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  background-color: var(--md-bg-primary);
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  font-size: 15px;
  line-height: 1.6;
  color: var(--md-markdown-text);
  word-wrap: break-word;
  overflow-wrap: break-word;
  padding: 24px;
  box-sizing: border-box;
}

/* ==================== Markdown 内容样式 ==================== */
.markdown-body {
  max-width: 900px;
  margin: 0 auto;
  background-color: var(--md-markdown-bg);
  padding: 32px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.markdown-body > *:first-child { margin-top: 0 !important; }
.markdown-body > *:last-child { margin-bottom: 0 !important; }

.markdown-body a {
  color: var(--md-markdown-link);
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.markdown-body h1, .markdown-body h2, .markdown-body h3,
.markdown-body h4, .markdown-body h5, .markdown-body h6 {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
  color: var(--md-text-primary);
}

.markdown-body h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid var(--md-border); }
.markdown-body h2 { font-size: 1.75em; padding-bottom: 0.3em; border-bottom: 1px solid var(--md-border); }
.markdown-body h3 { font-size: 1.5em; }
.markdown-body h4 { font-size: 1.25em; }
.markdown-body h5 { font-size: 1.1em; }
.markdown-body h6 { font-size: 1em; color: var(--md-text-tertiary); }

.markdown-body p { margin-top: 0; margin-bottom: 16px; }

.markdown-body ul, .markdown-body ol {
  margin-top: 0;
  margin-bottom: 16px;
  padding-left: 1.75em;
  list-style-position: outside;
}

.markdown-body ul li, .markdown-body ol li {
  padding-left: 0.25em;
  margin-top: 0.25em;
}

.markdown-body ul li:has(input[type='checkbox']) {
  list-style-type: none;
  margin-left: -1.25em;
  padding-left: 0.25em;
}

/* 有序列表中的任务列表项：保留序号，调整 checkbox 位置 */
.markdown-body ol li:has(input[type='checkbox']) {
  padding-left: 0.25em;
}

.markdown-body code {
  padding: 0.2em 0.4em;
  font-size: 100%;
  background-color: var(--md-code-bg-inline);
  border-radius: 3px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  color: var(--md-code-text);
}

.markdown-body pre {
  max-width: 100%;
  overflow-x: auto;
  padding: 16px;
  margin: 16px 0;
  background-color: var(--md-code-bg) !important;
  border-radius: 6px;
  min-height: 3em;
  box-sizing: border-box;
}

.markdown-body pre code {
  padding: 0;
  margin: 0;
  background-color: transparent;
  font-size: inherit;
  display: inline-block;
  min-width: 100%;
  line-height: 1.5;
}

.markdown-body blockquote {
  padding: 0 1em;
  color: var(--md-markdown-quote);
  border-left: 0.25em solid var(--md-border-light);
  margin: 0 0 16px 0;
}

.markdown-body blockquote > :first-child { margin-top: 0; }
.markdown-body blockquote > :last-child { margin-bottom: 0; }

.markdown-body table {
  border-spacing: 0;
  border-collapse: collapse;
  margin-top: 0;
  margin-bottom: 16px;
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  display: block;
}

.markdown-body th { font-weight: 600; background-color: var(--md-code-bg); }
.markdown-body th, .markdown-body td {
  padding: 6px 13px;
  border: 1px solid var(--md-border-light);
}

.markdown-body tr { border-top: 1px solid var(--md-border); background-color: var(--md-bg-secondary); }
.markdown-body tr:nth-child(2n) { background-color: var(--md-code-bg); }

.markdown-body img {
  max-width: 100%;
  height: auto;
  box-sizing: border-box;
}

.markdown-body hr {
  height: 0.25em;
  padding: 0;
  margin: 24px 0;
  background-color: var(--md-border);
  border: 0;
}

/* ==================== 复选框样式 ==================== */
.markdown-body input[type='checkbox'] {
  appearance: none;
  -webkit-appearance: none;
  width: 1em;
  height: 1em;
  border: 1px solid var(--md-checkbox-border);
  background-color: var(--md-bg-secondary);
  vertical-align: -0.1em;
  margin: 0 0.25em 0 0;
  border-radius: 2px;
  cursor: default;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.markdown-body input[type='checkbox']:checked {
  background-color: var(--md-checkbox-checked-bg);
  border-color: var(--md-checkbox-checked-bg);
}

.markdown-body input[type='checkbox']:checked::after {
  content: '';
  position: absolute;
  left: 0.25em;
  top: 0.05em;
  width: 0.25em;
  height: 0.5em;
  border: solid white;
  border-width: 0 0.15em 0.15em 0;
  transform: rotate(45deg);
}

/* ==================== 代码块包装器 ==================== */
.code-block-wrapper {
  position: relative;
  margin: 16px 0;
}

.code-copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 8px;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 10;
  cursor: pointer;
  border: 1px solid var(--md-border-light);
  background: var(--md-bg-secondary);
  color: var(--md-text-primary);
  border-radius: 3px;
  font-family: inherit;
}

.code-block-wrapper:hover .code-copy-btn,
.code-copy-btn:hover {
  opacity: 1;
}

.code-copy-btn.copied {
  background: var(--md-color-success);
  color: #fff;
  border-color: var(--md-color-success);
}

/* ==================== Mermaid 图表 ==================== */
.markdown-body .mermaid {
  text-align: center;
  margin: 16px 0;
  background-color: var(--md-bg-secondary);
  padding: 16px;
  border-radius: 6px;
  border: 1px solid var(--md-border-light);
}

.markdown-body .mermaid svg {
  display: inline-block;
  max-width: 100%;
  height: auto;
}

/* 暗色模式：invert 反转明暗，hue-rotate 把色相转回原位 */
[data-mode='dark'] .markdown-body .mermaid svg {
  filter: invert(1) hue-rotate(180deg);
}

[data-mode='dark'] .markdown-body .mermaid svg > rect:first-child {
  fill: transparent !important;
}

.markdown-body .mermaid .edgeLabel foreignObject > div {
  background: transparent !important;
}

.markdown-body .mermaid svg text,
.markdown-body .mermaid svg tspan {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.markdown-body .mermaid.render-error {
  color: var(--md-color-danger);
  background: rgba(244, 67, 54, 0.04);
  border-color: rgba(244, 67, 54, 0.3);
  padding: 12px 16px;
  text-align: left;
  font-size: 0.875em;
  font-family: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, monospace;
}

/* ==================== 数学公式 ==================== */
.markdown-body .math-block {
  display: block;
  overflow-x: auto;
  text-align: center;
  margin: 1em 0;
  padding: 0.5em 0;
}

.markdown-body .math-inline {
  display: inline;
  padding: 0 2px;
}

/* ==================== Prism 代码高亮 ==================== */
code[class*='language-'],
pre[class*='language-'] {
  text-shadow: var(--prism-text-shadow);
  background: var(--prism-bg);
}

.token.comment,
.token.prolog,
.token.doctype,
.token.cdata {
  color: var(--prism-comment);
}

.token.punctuation {
  color: var(--prism-punctuation);
}

.token.property,
.token.tag,
.token.boolean,
.token.number,
.token.constant,
.token.symbol,
.token.deleted {
  color: var(--prism-property);
}

.token.selector,
.token.attr-name,
.token.string,
.token.char,
.token.builtin,
.token.inserted {
  color: var(--prism-selector);
}

.token.operator,
.token.entity,
.token.url,
.language-css .token.string,
.style .token.string {
  color: var(--prism-operator);
}

.token.atrule,
.token.attr-value,
.token.keyword {
  color: var(--prism-keyword);
}

.token.function,
.token.class-name {
  color: var(--prism-function);
}

.token.regex,
.token.important,
.token.variable {
  color: var(--prism-regex);
}

/* ==================== KaTeX 数学公式样式 ==================== */
.katex-display { margin: 1em 0; overflow-x: auto; }
.katex { font-size: 1.1em; }
.katex-display > .katex { white-space: nowrap; }
.katex-display { overflow-x: auto; overflow-y: hidden; padding: 0.5em 0; }`;
    }

    /**
     * 下载文件
     * @param {string} content - 文件内容
     * @param {string} mimeType - MIME 类型
     * @param {string} extension - 文件扩展名
     * @private
     */
    #downloadFile(content, mimeType, extension) {
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
     * 销毁组件，取消订阅
     */
    destroy() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        if (this.#unsubscribeReady) {
            this.#unsubscribeReady();
            this.#unsubscribeReady = null;
        }
    }
}
