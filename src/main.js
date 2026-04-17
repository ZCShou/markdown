// Load the full VS Code codicon rules globally so app UI and CodeMirror views
// can render icon glyph mappings outside Monaco.
import '@vscode/codicons/dist/codicon.css';
import 'katex/dist/katex.min.css';

import { MarkdownEditor } from './MarkdownEditor.js';
import { handleWorkspaceOAuthCallback } from './workspace/oauth.js';

function renderInitError(error) {
    console.error('App initialization failed:', error);

    const container = document.createElement('main');
    container.style.cssText = [
        'min-height: 100vh',
        'display: grid',
        'place-items: center',
        'padding: 24px',
        'background: #1e1e1e',
        'color: #cccccc',
        "font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    ].join(';');

    const panel = document.createElement('section');
    panel.style.cssText = [
        'max-width: 680px',
        'width: 100%',
        'padding: 24px',
        'border-radius: 12px',
        'background: #252526',
        'box-sizing: border-box'
    ].join(';');

    const title = document.createElement('h1');
    title.textContent = '加载失败';
    title.style.cssText = 'margin: 0 0 12px; font-size: 24px;';

    const description = document.createElement('p');
    description.textContent = '应用初始化时发生错误，请刷新页面后重试。';
    description.style.cssText = 'margin: 0 0 16px; color: #a6a6a6;';

    const reloadButton = document.createElement('button');
    reloadButton.type = 'button';
    reloadButton.textContent = '刷新页面';
    reloadButton.style.cssText =
        'padding: 10px 18px; border: 0; border-radius: 6px; background: #0e639c; color: #fff; cursor: pointer;';
    reloadButton.addEventListener('click', () => window.location.reload());

    const details = document.createElement('details');
    details.style.cssText = 'margin-top: 16px;';

    const summary = document.createElement('summary');
    summary.textContent = '错误详情';
    summary.style.cssText = 'cursor: pointer; color: #9cdcfe;';

    const pre = document.createElement('pre');
    pre.textContent = `${error.message}\n\n${error.stack || ''}`.trim();
    pre.style.cssText = [
        'margin: 12px 0 0',
        'padding: 12px',
        'max-height: 240px',
        'overflow: auto',
        'border-radius: 8px',
        'background: #1a1a1a',
        'font-size: 12px',
        'white-space: pre-wrap'
    ].join(';');

    details.append(summary, pre);
    panel.append(title, description, reloadButton, details);
    container.append(panel);

    document.body.replaceChildren(container);
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
        renderInitError(error);
    }
}

// 初始化应用
if (!handleWorkspaceOAuthCallback()) {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initApp, { once: true });
    } else {
        initApp();
    }
}
