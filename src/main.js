import { MarkdownEditor } from './modules/markdown.js';

// 初始化应用
document.addEventListener('DOMContentLoaded', () => {
    // 初始化 Markdown 编辑器
    const editor = new MarkdownEditor();
    editor.init();
    
    // 隐藏加载遮罩并显示内容
    const loading = document.getElementById('md-loading');
    if (loading) {
        loading.classList.add('hidden');
        setTimeout(() => loading.remove(), 300);
    }
    document.body.classList.add('loaded');
});
