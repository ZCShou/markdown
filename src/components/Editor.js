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

        // 辅助函数：统一的 DOM 更新
        const updateDOM = (newValue, newStart, newEnd = newStart) => {
            this.container.value = newValue;
            this.container.selectionStart = newStart;
            this.container.selectionEnd = newEnd;
            this.state.updateContent(newValue);
        };

        // 优化：检查是否有换行符
        const hasNewLine = start !== end && value.indexOf('\n', start) < end;
        const lineStart = getLineStart(start);

        // 处理多行或完整行的缩进
        if (start !== end && (start <= lineStart || hasNewLine)) {
            const selected = value.substring(start, end);
            const lines = selected.split('\n');
            const lineCount = lines.length;
            let hasChanges = false;
            
            if (isRemove) {
                // 移除缩进
                for (let i = 0; i < lineCount; i++) {
                    const line = lines[i];
                    if (!line) continue; // 跳过空行
                    
                    if (line[0] === '\t') {
                        lines[i] = line.slice(1);
                        hasChanges = true;
                    } else if (line[0] === ' ') {
                        let spaces = 0;
                        while (spaces < tabSize && line[spaces] === ' ') spaces++;
                        if (spaces > 0) {
                            lines[i] = line.slice(spaces);
                            hasChanges = true;
                        }
                    }
                }
                
                // 如果没有任何变化，直接返回
                if (!hasChanges) return;
            } else {
                // 添加缩进（总是会有变化）
                for (let i = 0; i < lineCount; i++) {
                    lines[i] = INDENT + lines[i];
                }
            }
            
            const newSelected = lines.join('\n');
            const newValue = [value.substring(0, start), newSelected, value.substring(end)].join('');
            updateDOM(newValue, start, start + newSelected.length);
            return;
        }

        // 处理单行缩进
        if (isRemove) {
            // 移除缩进
            const beforeCursor = value.substring(lineStart, start);
            if (!beforeCursor) return; // 光标在行首且前面没有内容
            
            let removeSize = 0;
            if (beforeCursor[0] === '\t') {
                removeSize = 1;
            } else if (beforeCursor[0] === ' ') {
                while (removeSize < tabSize && beforeCursor[removeSize] === ' ') removeSize++;
            }
            
            if (removeSize === 0) return; // 没有缩进可移除
            
            const newValue = [value.substring(0, lineStart), beforeCursor.slice(removeSize), value.substring(start)].join('');
            updateDOM(newValue, start - removeSize);
        } else {
            // 添加缩进
            const newValue = [value.substring(0, start), INDENT, value.substring(end)].join('');
            updateDOM(newValue, start + INDENT.length);
        }
    }
}
