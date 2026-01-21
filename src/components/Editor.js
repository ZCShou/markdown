/**
 * 编辑器组件
 * 负责编辑器的输入、缩进、快捷键等功能
 */
import { BaseComponent } from './BaseComponent.js';
import { StoreManager } from '../modules/store.js';
import { dom } from '../utils/dom.js';

export class Editor extends BaseComponent {
    /**
     * 构造函数
     */
    constructor(state, containerId) {
        super(state, containerId);
    }

    /**
     * 初始化组件
     */
    init() {
        super.init();
        
        if (!this.container) {
            console.error('Editor container not found:', this.containerId);
        }
    }

    /**
     * 订阅状态变化
     */
    subscribe() {
        // 只订阅当前文档变化，不需要订阅 content（Editor 是输入源）
        this.unsubscribe = this.state.subscribeTo('currentDocId', () => {
            this.loadContent();
        });
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 输入事件
        this.addEventListener(this.container, 'input', () => this.handleInput());
        // 键盘事件
        this.addEventListener(this.container, 'keydown', (e) => this.handleKeydown(e));
    }

    /**
     * 加载内容
     */
    loadContent() {
        if (!this.container) return;
        const content = this.state.get('content') || '';
        this.container.value = content;
    }

    /**
     * 渲染组件
     */
    render() {
        // 初始加载内容
        this.loadContent();
    }

    /**
     * 处理输入（性能优化 - 添加防抖减少状态更新频率）
     */
    handleInput() {
        if (!this.container) return;
        
        // 使用防抖减少状态更新频率（50ms）
        // 在回调中重新获取最新内容，避免闭包陷阱
        this.debounce('editor-input', () => {
            const content = this.container.value || '';
            this.state.updateContent(content);
        }, 50);
        
        // 后台静默保存（防抖，1秒延迟，使用异步保存）
        this.debounce('editor-auto-save', () => {
            this.saveAsync();
        }, 1000);
    }



    /**
     * 保存内容到本地存储（同步）
     * @param {boolean} showMessage - 是否显示保存消息
     * @returns {boolean} 是否保存成功
     */
    save(showMessage = false) {
        if (!this.container) return false;
        
        try {
            const content = this.container.value || '';
            const documents = this.state.get('documents') || [];
            
            StoreManager.saveContent(content);
            StoreManager.saveDocuments(documents);
            
            if (showMessage) this.showMessage('内容已保存', 'success');
            return true;
        } catch (error) {
            console.error('Failed to save data:', error);
            if (showMessage) this.showMessage('保存失败: ' + error.message, 'error');
            return false;
        }
    }

    /**
     * 异步保存内容到本地存储
     * @param {boolean} showMessage - 是否显示保存消息
     * @returns {Promise<boolean>} 是否保存成功
     */
    async saveAsync(showMessage = false) {
        if (!this.container) return false;
        
        try {
            const content = this.container.value || '';
            const documents = this.state.get('documents') || [];
            
            await StoreManager.saveContentAsync(content);
            await StoreManager.saveDocumentsAsync(documents);
            
            if (showMessage) this.showMessage('内容已保存', 'success');
            return true;
        } catch (error) {
            console.error('Failed to save data:', error);
            if (showMessage) this.showMessage('保存失败: ' + error.message, 'error');
            return false;
        }
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
            this.save(true);
        }
    }

    /**
     * 处理缩进
     */
    handleIndent(isRemove = false) {
        if (!this.container) return;
        
        const { selectionStart: start, selectionEnd: end, value } = this.container;
        const selectedText = value.substring(start, end);
        const INDENT = '  ';
        
        // 获取行边界
        const getLineBoundaries = (pos) => {
            const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
            const lineEnd = value.indexOf('\n', pos);
            return {
                start: lineStart,
                end: lineEnd === -1 ? value.length : lineEnd
            };
        };
        
        // 获取缩进大小
        const getIndentSize = (indentStr) => {
            if (indentStr.startsWith('\t')) return 1;
            return Math.min(2, indentStr.length);
        };
        
        // 移除行缩进
        const removeLineIndent = (line) => {
            if (line.startsWith('\t')) return line.substring(1);
            if (line.startsWith('  ')) return line.substring(2);
            if (line.startsWith(' ')) return line.substring(1);
            return line;
        };
        
        // 没有选中文本
        if (selectedText.length === 0) {
            if (isRemove) {
                // 移除缩进
                const { start: lineStart } = getLineBoundaries(start);
                const lineText = value.substring(lineStart, start);
                const indentMatch = lineText.match(/^(\s*)/);
                const indent = indentMatch ? indentMatch[1] : '';
                
                if (indent.length > 0) {
                    const indentSize = getIndentSize(indent);
                    this.container.value = value.substring(0, lineStart) + 
                                         indent.substring(indentSize) + 
                                         value.substring(lineStart + indentSize);
                    this.container.selectionStart = this.container.selectionEnd = start - indentSize;
                }
            } else {
                // 插入缩进
                this.container.value = value.substring(0, start) + INDENT + value.substring(end);
                this.container.selectionStart = this.container.selectionEnd = start + INDENT.length;
            }
        } else {
            // 有选中文本
            const lines = selectedText.split('\n');
            const { start: lineStart } = getLineBoundaries(start);
            const shouldProcessMultipleLines = start <= lineStart || selectedText.includes('\n');
            
            if (shouldProcessMultipleLines) {
                // 处理多行缩进
                const newSelectedText = isRemove 
                    ? lines.map(removeLineIndent).join('\n')
                    : lines.map(line => INDENT + line).join('\n');
                
                this.container.value = value.substring(0, start) + newSelectedText + value.substring(end);
                this.container.selectionStart = start;
                this.container.selectionEnd = start + newSelectedText.length;
            } else {
                // 只选中了行的一部分
                if (isRemove) {
                    const { start: lineStart } = getLineBoundaries(start);
                    const lineText = value.substring(lineStart, start);
                    const indentMatch = lineText.match(/^(\s*)/);
                    const indent = indentMatch ? indentMatch[1] : '';
                    
                    if (indent.length > 0) {
                        const indentSize = getIndentSize(indent);
                        this.container.value = value.substring(0, lineStart) + 
                                             value.substring(lineStart, start).substring(indentSize) + 
                                             value.substring(start);
                        this.container.selectionStart = this.container.selectionEnd = end - indentSize;
                    }
                } else {
                    this.container.value = value.substring(0, start) + INDENT + value.substring(end);
                    this.container.selectionStart = this.container.selectionEnd = start + INDENT.length;
                }
            }
        }
        
        // 触发 input 事件以更新预览
        this.container.dispatchEvent(new Event('input', { bubbles: true }));
    }
}
