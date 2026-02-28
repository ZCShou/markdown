/**
 * 导出组件
 * 负责 HTML、Markdown、PDF 导出功能
 * 直接订阅 export:trigger 事件，独立于 Preview 组件
 */
export class Exporter {
    /**
     * @param {Object} state - 状态管理器
     * @param {string} previewContainerId - 预览容器元素 ID
     */
    constructor(state, previewContainerId) {
        this.state = state;
        this.previewContainerId = previewContainerId;
        this.unsubscribe = null;
    }

    /**
     * 初始化组件，订阅导出事件
     */
    init() {
        // 订阅导出事件
        this.unsubscribe = this.state.subscribeTo('export:trigger', (type) => {
            switch (type) {
                case 'html':
                    this.exportHTML();
                    break;
                case 'md':
                    this.exportMarkdown();
                    break;
                case 'pdf':
                    this.exportPDF();
                    break;
                default:
                    console.warn('Unknown export type:', type);
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

    /**
     * 获取预览容器元素
     * @returns {HTMLElement|null}
     * @private
     */
    #getPreviewContainer() {
        return document.getElementById(this.previewContainerId);
    }

    // ==================== 公共方法 ====================

    /**
     * 导出为 HTML（直接使用渲染好的内容）
     * @returns {void}
     */
    exportHTML() {
        const container = this.#getPreviewContainer();
        if (!container) {
            this.#showMessage('预览容器未找到', 'error');
            return;
        }

        // 直接获取预览容器中已经渲染好的 HTML
        let html = container.innerHTML;

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
     * 导出为 PDF（使用新窗口打印，保持渲染样式）
     * @returns {void}
     */
    exportPDF() {
        const content = this.state.get('content');
        if (!content) {
            this.#showMessage('没有内容可导出', 'warning');
            return;
        }

        // 获取导出配置
        const exportConfig = this.state.get('export') || {};
        const pdfSize = exportConfig.pdfSize || 'A4';
        const pdfMargin = exportConfig.pdfMargin || 'default';
        // 页眉配置
        const headerLeft = exportConfig.pdfHeaderLeft || '';
        const headerCenter = exportConfig.pdfHeaderCenter || '';
        const headerRight = exportConfig.pdfHeaderRight || '';
        // 页脚配置
        const footerLeft = exportConfig.pdfFooterLeft || '';
        const footerCenter = exportConfig.pdfFooterCenter || '';
        const footerRight = exportConfig.pdfFooterRight || '';

        // 页面尺寸映射（mm）
        const pageSizeMap = {
            'A4': '210mm 297mm',
            'Letter': '8.5in 11in',
            'Legal': '8.5in 14in'
        };

        // 页边距映射 - 增加额外的页眉页脚空间
        const marginMap = {
            'default': { top: '2.5cm', bottom: '2.5cm', left: '1.5cm', right: '1.5cm' },
            'narrow': { top: '2cm', bottom: '2cm', left: '1cm', right: '1cm' },
            'wide': { top: '3cm', bottom: '3cm', left: '2.5cm', right: '2.5cm' }
        };

        // 获取预览容器
        const container = this.#getPreviewContainer();
        if (!container) {
            this.#showMessage('预览容器未找到', 'error');
            return;
        }

        // 获取预览容器中已经渲染好的 HTML
        let html = this.#cleanHtml(container.innerHTML);

        // 获取当前主题
        const isDark = this.state.get('interface')?.theme === 'dark';

        // 获取文档标题（从第一个标题或默认值）
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const docTitle = titleMatch ? titleMatch[1].trim() : 'Markdown 文档';
        const currentDate = new Date().toLocaleDateString('zh-CN');

        const margins = marginMap[pdfMargin];

        // 判断是否有页眉或页脚
        const hasHeader = headerLeft || headerCenter || headerRight;
        const hasFooter = footerLeft || footerCenter || footerRight;

        // 处理模板占位符
        const processTemplate = (template) => {
            if (!template) return '';
            return template
                .replace(/{title}/g, docTitle)
                .replace(/{date}/g, currentDate)
                .replace(/{page}/g, '<span class="pdf-page-current">-</span>')
                .replace(/{pages}/g, '<span class="pdf-page-total">-</span>');
        };

        // 生成页眉 HTML
        const headerHtml = hasHeader ? `
<div class="pdf-header">
    <div class="pdf-header-left">${processTemplate(headerLeft)}</div>
    <div class="pdf-header-center">${processTemplate(headerCenter)}</div>
    <div class="pdf-header-right">${processTemplate(headerRight)}</div>
</div>` : '';

        // 生成页脚 HTML
        const footerHtml = hasFooter ? `
<div class="pdf-footer">
    <div class="pdf-footer-left">${processTemplate(footerLeft)}</div>
    <div class="pdf-footer-center">${processTemplate(footerCenter)}</div>
    <div class="pdf-footer-right">${processTemplate(footerRight)}</div>
</div>` : '';

        // 页眉页脚屏幕样式
        const headerFooterScreenStyles = `
.pdf-header, .pdf-footer {
    display: none;
}
`;

        // 页眉页脚打印样式
        const headerFooterPrintStyles = (hasHeader || hasFooter) ? `
/* 页眉 - 在页边距区域内显示 */
.pdf-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 1.5cm;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 9pt;
    color: #333;
    padding: 0 2cm;
    box-sizing: border-box;
}

.pdf-header-left {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.pdf-header-center {
    flex: 1;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.pdf-header-right {
    flex: 1;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* 页脚 - 在页边距区域内显示 */
.pdf-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1.5cm;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 9pt;
    color: #333;
    padding: 0 2cm;
    box-sizing: border-box;
}

.pdf-footer-left {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.pdf-footer-center {
    flex: 1;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.pdf-footer-right {
    flex: 1;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* 页码样式 */
.pdf-page-current, .pdf-page-total {
    display: inline-block;
    min-width: 1.5em;
    text-align: center;
}
` : '';

        // 计算实际的 @page margin，当有页眉页脚时增加边距
        const actualMarginTop = hasHeader ? '2cm' : margins.top;
        const actualMarginBottom = hasFooter ? '2cm' : margins.bottom;

        const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN"${isDark ? ' data-mode="dark"' : ''}>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${docTitle} - PDF 导出</title>
<style>
${this.#getCommonStyles()}
/* 页眉页脚屏幕样式 */
${headerFooterScreenStyles}

/* ==================== 打印样式 ==================== */
@media print {
  @page {
    size: ${pageSizeMap[pdfSize]};
    margin: ${actualMarginTop} ${margins.right} ${actualMarginBottom} ${margins.left};
  }
${headerFooterPrintStyles}
  html, body {
    background: #fff !important;
  }

  .markdown-body {
    max-width: 100%;
    box-shadow: none;
    padding: 20px;
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

  .markdown-body a {
    color: #000 !important;
  }

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

  .markdown-body code {
    background-color: #f0f0f0;
    color: #333 !important;
  }

  .markdown-body blockquote {
    border-left-color: #ccc;
    color: #555;
    page-break-inside: avoid;
  }

  .markdown-body table {
    page-break-inside: avoid;
  }

  .markdown-body th {
    background-color: #e0e0e0 !important;
  }

  .markdown-body tr {
    border-top-color: #ccc;
    background-color: #fff !important;
  }

  .markdown-body tr:nth-child(2n) {
    background-color: #f5f5f5 !important;
  }

  .markdown-body img {
    max-width: 100% !important;
    page-break-inside: avoid;
  }

  .markdown-body .mermaid {
    background-color: #fff !important;
    border-color: #ddd;
    page-break-inside: avoid;
  }

  .code-copy-btn {
    display: none !important;
  }

  /* 页码样式 - 使用 CSS 计数器 */
  .pdf-page-current::before {
    content: counter(page);
  }
  
  .pdf-page-total {
    /* 总页数通过 JavaScript 设置 */
  }

  /* 隐藏代码高亮的打印背景 */
  code[class*='language-'],
  pre[class*='language-'] {
    text-shadow: none !important;
  }
}
</style>
</head>
<body>
${headerHtml}
${footerHtml}
<div class="markdown-body">
${html}
</div>
<script>
(function() {
    // 页面边距配置（由导出设置决定）
    var marginTopCm = ${hasHeader ? 2 : parseFloat(margins.top)};
    var marginBottomCm = ${hasFooter ? 2 : parseFloat(margins.bottom)};

    // 估算总页数
    function estimatePageCount() {
        var content = document.querySelector('.markdown-body');
        if (!content) return 1;
        
        // 获取页面尺寸
        var pageHeightMm = '${pdfSize}' === 'A4' ? 297 : ('${pdfSize}' === 'Letter' ? 279 : 356);
        var marginTopMm = marginTopCm * 10;
        var marginBottomMm = marginBottomCm * 10;
        var usableHeightMm = pageHeightMm - marginTopMm - marginBottomMm - 20; // 额外减去内容 padding
        
        // 转换为像素（96dpi，1mm ≈ 3.78px）
        var usableHeightPx = usableHeightMm * 3.78;
        var contentHeightPx = content.scrollHeight;
        
        var pageCount = Math.ceil(contentHeightPx / usableHeightPx);
        return Math.max(1, pageCount);
    }

    // 更新页码显示
    function updatePageNumbers() {
        var totalPages = estimatePageCount();
        
        // 更新总页数
        var totalElements = document.querySelectorAll('.pdf-page-total');
        totalElements.forEach(function(el) {
            el.textContent = totalPages;
        });
    }

    // 监听打印前事件
    window.addEventListener('beforeprint', function() {
        updatePageNumbers();
    });

    // 页面加载完成后自动触发打印
    window.onload = function() {
        updatePageNumbers();
        setTimeout(function() {
            window.print();
        }, 500);
    };
})();
</script>
</body>
</html>`;

        // 打开新窗口
        const printWindow = window.open('', '_blank', 'width=900,height=650');
        if (!printWindow) {
            this.#showMessage('无法打开打印窗口，请检查浏览器弹窗设置', 'error');
            return;
        }

        // 写入内容
        printWindow.document.write(fullHtml);
        printWindow.document.close();

        this.#showMessage('请在打印对话框中选择"另存为 PDF"，并关闭浏览器页眉页脚选项', 'info');
    }

    // ==================== 私有方法 ====================

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
            .replace(/ data-latex="[^"]*"/g, '');
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
  --md-code-bg: #2d2d2d;
  --md-code-bg-inline: rgba(255, 255, 255, 0.1);
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

.markdown-body li:has(input[type='checkbox']) {
  list-style-type: none;
  margin-left: -1.25em;
  padding-left: 0.25em;
}

.markdown-body code {
  padding: 0.2em 0.4em;
  font-size: 85%;
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
    }
}
