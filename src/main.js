import { MarkdownEditor } from './modules/markdown.js';

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    // 初始化 Markdown 编辑器
    const editor = new MarkdownEditor();
    editor.init();
    
    // 显示页面内容
    document.body.classList.add('loaded');
});
