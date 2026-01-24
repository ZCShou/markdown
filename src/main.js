import { MarkdownEditor } from './modules/markdown.js';

/**
 * 初始化应用并启动 Markdown 编辑器
 * @returns {void}
 */
function initApp() {
    // 初始化 Markdown 编辑器
    const editor = new MarkdownEditor();
    editor.init();

    // 显示页面内容
    document.body.classList.add('loaded');
}

// 初始化应用
document.addEventListener('DOMContentLoaded', initApp);
