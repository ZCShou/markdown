/**
 * 编辑器组件
 * 负责编辑器的输入、缩进、快捷键等功能
 */
import { BaseComponent } from './BaseComponent.js';
import { StoreManager } from '../modules/store.js';
import { dom } from '../utils/dom.js';

export class Editor extends BaseComponent {
    /**
     * 枢造函数
     */
    constructor(state, containerId) {
        super(state, containerId);
        this.editorElement = null;
    }

    /**
     * 初始化组件
     */
    init() {
        super.init();
        // 使用 dom.js 获取编辑器元素
        this.editorElement = dom.editor.element || this.container;
    }

    /**
     * 订阅状态变化
     */
    subscribe() {
        // 订阅内容和当前文档变化，更新编辑器内容
        this.unsubscribe = this.state.subscribeTo(['content', 'currentDocId'], (newValue, oldValue, key) => {
            if (key === 'content') {
                this.loadContent();
            } else if (key === 'currentDocId') {
                this.loadContent();
            }
        });
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 输入事件
        this.addEventListener(this.container, 'input', () => {
            this.handleInput();
        });

        // 键盘事件
        this.addEventListener(this.container, 'keydown', (e) => {
            this.handleKeydown(e);
        });
    }

    /**
     * 加载内容
     */
    loadContent() {
        const content = this.state.get('content');
        this.container.value = content;
    }

    /**
     * 处理输入
     */
    handleInput() {
        const content = this.container.value;
        this.state.updateContent(content);
        this.saveContent();
    }

    /**
     * 保存内容到本地存储
     */
    saveContent() {
        this.debounce('save', () => {
            const content = this.container.value;
            StoreManager.saveContent(content);
            // 同时保存文档列表（确保所有文档内容都被保存）
            const documents = this.state.get('documents');
            StoreManager.saveDocuments(documents);
        }, 1000);
    }

    /**
     * 立即保存
     */
    saveNow() {
        const content = this.container.value;
        StoreManager.saveContent(content);
        // 同时保存文档列表
        const documents = this.state.get('documents');
        StoreManager.saveDocuments(documents);
        this.showMessage('内容已保存', 'success');
    }

    /**
     * 处理键盘事件
     */
    handleKeydown(e) {
        // Tab 缩进
        if (e.key === 'Tab') {
            e.preventDefault();
            this.handleIndent(e.shiftKey);
            return;
        }

        // Ctrl/Cmd + S 保存
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            this.saveNow();
        }
    }

    /**
     * 处理缩进
     */
    handleIndent(isRemove = false) {
        const start = this.container.selectionStart;
        const end = this.container.selectionEnd;
        const value = this.container.value;

        // 获取选中文本
        const selectedText = value.substring(start, end);

        // 如果没有选中文本，在光标位置插入/移除缩进
        if (selectedText.length === 0) {
            if (isRemove) {
                // 移除缩进
                const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                const lineText = value.substring(lineStart, start);
                const indentMatch = lineText.match(/^(\s*)/);
                const indent = indentMatch ? indentMatch[1] : '';

                if (indent.length > 0) {
                    const indentSize = indent.startsWith('\t') ? 1 : Math.min(2, indent.length);
                    const newValue = value.substring(0, lineStart) +
                                   indent.substring(indentSize) +
                                   value.substring(lineStart + indentSize);
                    this.container.value = newValue;
                    this.container.selectionStart = this.container.selectionEnd = start - indentSize;
                }
            } else {
                // 插入缩进
                const indent = '  ';
                this.container.value = value.substring(0, start) + indent + value.substring(end);
                this.container.selectionStart = this.container.selectionEnd = start + indent.length;
            }
        } else {
            // 有选中文本，处理多行缩进
            const lines = selectedText.split('\n');
            const indent = '  ';

            // 检查是否选中了整行
            const lineStart = value.lastIndexOf('\n', start - 1) + 1;
            const lineEnd = value.indexOf('\n', end);
            const fullLineText = value.substring(lineStart, lineEnd === -1 ? value.length : lineEnd);

            // 如果选中了整行或多行，处理所有行
            if (start <= lineStart || selectedText.includes('\n')) {
                let newSelectedText;

                if (isRemove) {
                    // 移除缩进
                    newSelectedText = lines.map((line) => {
                        if (line.startsWith('\t')) {
                            return line.substring(1);
                        } else if (line.startsWith('  ')) {
                            return line.substring(2);
                        } else if (line.startsWith(' ')) {
                            return line.substring(1);
                        }
                        return line;
                    }).join('\n');
                } else {
                    // 添加缩进
                    newSelectedText = lines.map(line => indent + line).join('\n');
                }

                this.container.value = value.substring(0, start) + newSelectedText + value.substring(end);

                // 恢复选区
                this.container.selectionStart = start;
                this.container.selectionEnd = start + newSelectedText.length;
            } else {
                // 只选中了行的一部分，只在光标位置插入/移除缩进
                if (isRemove) {
                    const lineStart = value.lastIndexOf('\n', start - 1) + 1;
                    const lineText = value.substring(lineStart, start);
                    const indentMatch = lineText.match(/^(\s*)/);
                    const indent = indentMatch ? indentMatch[1] : '';

                    if (indent.length > 0) {
                        const indentSize = indent.startsWith('\t') ? 1 : Math.min(2, indent.length);
                        this.container.value = value.substring(0, lineStart) +
                                       value.substring(lineStart, start).substring(indentSize) +
                                       value.substring(start);
                        this.container.selectionStart = this.container.selectionEnd = end - indentSize;
                    }
                } else {
                    this.container.value = value.substring(0, start) + indent + value.substring(end);
                    this.container.selectionStart = this.container.selectionEnd = start + indent.length;
                }
            }
        }

        // 触发 input 事件以更新预览
        this.container.dispatchEvent(new Event('input', { bubbles: true }));
    }

    /**
     * 设置内容
     */
    setContent(content) {
        this.container.value = content;
        this.state.updateContent(content);
    }

    /**
     * 获取内容
     */
    getContent() {
        return this.container.value;
    }

    /**
     * 聚焦编辑器
     */
    focus() {
        this.container.focus();
    }
}
