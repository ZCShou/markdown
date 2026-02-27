// Import third-party CSS dependencies
import '@vscode/codicons/dist/codicon.css';
import 'katex/dist/katex.min.css';

import { MarkdownEditor } from './MarkdownEditor.js';

/**
 * 显示错误降级 UI
 * @param {Error} error - 错误对象
 */
function showErrorFallback(error) {
    console.error('App initialization failed:', error);
    document.body.innerHTML = `
        <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1e1e1e;
            color: #cccccc;
            text-align: center;
            padding: 20px;
        ">
            <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
            <h2 style="margin: 0 0 8px 0; font-size: 24px;">加载失败</h2>
            <p style="margin: 0 0 24px 0; color: #888;">应用程序初始化时发生错误，请刷新页面重试</p>
            <button onclick="location.reload()" style="
                padding: 10px 24px;
                font-size: 14px;
                cursor: pointer;
                background: #0e639c;
                color: white;
                border: none;
                border-radius: 4px;
            ">刷新页面</button>
            <details style="margin-top: 24px; text-align: left; max-width: 600px;">
                <summary style="cursor: pointer; color: #888;">错误详情</summary>
                <pre style="
                    margin-top: 12px;
                    padding: 12px;
                    background: #2d2d2d;
                    border-radius: 4px;
                    font-size: 12px;
                    overflow: auto;
                    max-height: 200px;
                ">${error.message}\n\n${error.stack || ''}</pre>
            </details>
        </div>
    `;
}

/**
 * 初始化应用并启动 Markdown 编辑器
 * @returns {Promise<void>}
 */
async function initApp() {
    try {
        // 初始化 Markdown 编辑器
        const editor = new MarkdownEditor();
        await editor.init();

        // 显示页面内容
        document.body.classList.add('loaded');
    } catch (error) {
        showErrorFallback(error);
    }
}

// 初始化应用
document.addEventListener('DOMContentLoaded', initApp);
