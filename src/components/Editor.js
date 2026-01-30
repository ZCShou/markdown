/**
 * 编辑器组件
 * 负责编辑器的输入、缩进、快捷键等功能
 */
import { BaseComponent } from './BaseComponent.js';

/**
 *
 */
export class Editor extends BaseComponent {
    /**
     * 初始化组件
     * @returns {void}
     */
    init() {
        super.init();

        if (!this.container) {
            console.error('Editor container not found:', this.containerId);
        }
    }

    /**
     * 订阅状态变化
     * @returns {void}
     */
    subscribe() {
        // 只订阅当前文档变化，不需要订阅 content（Editor 是输入源）
        this.unsubscribe = this.state.subscribeTo('currentDocId', () => {
            this.loadContent();
        });
    }

    /**
     * 绑定事件
     * @returns {void}
     */
    bindEvents() {
        // 输入事件
        this.addEventListener(this.container, 'input', () => this.handleInput());
        // 键盘事件
        this.addEventListener(this.container, 'keydown', e => this.handleKeydown(e));
    }

    /**
     * 加载内容
     * @returns {void}
     */
    loadContent() {
        if (!this.container) return;
        const content = this.state.get('content') || '';
        this.container.value = content;
    }

    /**
     * 渲染组件
     * @returns {void}
     */
    render() {
        // 初始加载内容
        this.loadContent();
    }

    /**
     * 处理输入（性能优化 - 添加防抖减少状态更新频率）
     * @returns {void}
     */
    handleInput() {
        if (!this.container) return;

        // 使用防抖减少状态更新频率（150ms）
        // 在回调中重新获取最新内容，避免闭包陷阱
        // 注意：updateContent 会自动触发持久化（1000ms 防抖）
        this.debounce(
            'editor-input',
            () => {
                const content = this.container.value || '';
                this.state.updateContent(content);
            },
            150
        );
    }

    /**
     * 处理键盘事件
     * @param {KeyboardEvent} e - 键盘事件
     * @returns {void}
     */
    handleKeydown(e) {
        // Tab 缩进
        if (e.key === 'Tab') {
            e.preventDefault();
            this.handleIndent(e.shiftKey);
        }
    }

    /**
     * 处理缩进
     * @param {boolean} [isRemove=false] - 是否移除缩进
     * @returns {void}
     */
    handleIndent(isRemove = false) {
        if (!this.container) return;

        const { selectionStart: start, selectionEnd: end, value } = this.container;
        const { insertSpaces = true, tabSize = 4 } = this.state.get('editor') || {};
        const INDENT = insertSpaces ? ' '.repeat(tabSize) : '\t';

        // 辅助函数：获取行开始位置
        const getLineStart = pos => value.lastIndexOf('\n', pos - 1) + 1;

        // 辅助函数：更新编辑器（使用数组拼接优化性能）
        const updateEditor = (parts, newStart, newEnd = newStart) => {
            this.container.value = parts.join('');
            this.container.selectionStart = newStart;
            this.container.selectionEnd = newEnd;
            this.container.dispatchEvent(new Event('input', { bubbles: true }));
        };

        // 优化：检查是否有换行符，避免 substring + includes
        const hasNewLine = start !== end && value.indexOf('\n', start) < end;
        const lineStart = getLineStart(start);

        // 处理多行或完整行的缩进
        if (start !== end && (start <= lineStart || hasNewLine)) {
            const selected = value.substring(start, end);
            const lines = selected.split('\n');
            const lineCount = lines.length;
            
            if (isRemove) {
                // 移除缩进：优化正则匹配
                for (let i = 0; i < lineCount; i++) {
                    const line = lines[i];
                    if (line[0] === '\t') {
                        lines[i] = line.slice(1);
                    } else if (line[0] === ' ') {
                        let spaces = 0;
                        while (spaces < tabSize && line[spaces] === ' ') spaces++;
                        if (spaces > 0) lines[i] = line.slice(spaces);
                    }
                }
            } else {
                // 添加缩进
                for (let i = 0; i < lineCount; i++) {
                    lines[i] = INDENT + lines[i];
                }
            }
            
            const processed = lines.join('\n');
            updateEditor(
                [value.substring(0, start), processed, value.substring(end)],
                start,
                start + processed.length
            );
            return;
        }

        // 处理单行缩进
        if (isRemove) {
            // 移除缩进：优化字符检查
            const beforeCursor = value.substring(lineStart, start);
            let removeSize = 0;
            
            if (beforeCursor[0] === '\t') {
                removeSize = 1;
            } else if (beforeCursor[0] === ' ') {
                while (removeSize < tabSize && beforeCursor[removeSize] === ' ') removeSize++;
            }
            
            if (removeSize > 0) {
                updateEditor(
                    [value.substring(0, lineStart), beforeCursor.slice(removeSize), value.substring(start)],
                    start - removeSize
                );
            }
        } else {
            // 添加缩进
            updateEditor(
                [value.substring(0, start), INDENT, value.substring(end)],
                start + INDENT.length
            );
        }
    }
}
