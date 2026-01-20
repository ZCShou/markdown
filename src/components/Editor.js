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
        this.editorElement = null;
    }

    /**
     * 初始化组件
     */
    init() {
        super.init();
        
        // 检查容器元素是否存在
        if (!this.container) {
            console.error('Editor container not found:', this.containerId);
            return;
        }
        
        // 使用 dom.js 获取编辑器元素
        this.editorElement = dom.editor.element || this.container;
        
        // 验证编辑器元素
        if (!this.editorElement) {
            console.warn('Editor element not found, using container as fallback');
            this.editorElement = this.container;
        }
    }

    /**
     * 订阅状态变化
     */
    subscribe() {
        // 订阅内容和当前文档变化，更新编辑器内容
        this.unsubscribe = this.state.subscribeTo(['content', 'currentDocId'], (newValue, oldValue, key) => {
            this.loadContent();
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
        try {
            if (!this.container) return;
            
            const content = this.state.get('content') || '';
            this.container.value = content;
        } catch (error) {
            console.error('Failed to load content:', error);
        }
    }

    /**
     * 处理输入
     */
    handleInput() {
        try {
            if (!this.container) return;
            
            const content = this.container.value || '';
            this.state.updateContent(content);
            // 后台静默保存（防抖，1秒延迟）
            this.debounce('editor-auto-save', () => {
                this.save(); // 静默保存，不显示消息
            }, 1000);
        } catch (error) {
            console.error('Failed to handle input:', error);
        }
    }



    /**
     * 保存内容到本地存储（统一接口）
     * @param {boolean} showMessage - 是否显示保存消息，默认为 false（静默保存）
     * @returns {boolean} 是否保存成功
     */
    save(showMessage = false) {
        try {
            if (!this.container) return false;
            
            const content = this.container.value || '';
            StoreManager.saveContent(content);
            
            const documents = this.state.get('documents') || [];
            StoreManager.saveDocuments(documents);
            
            if (showMessage) {
                this.showMessage('内容已保存', 'success');
            }
            
            return true;
        } catch (error) {
            console.error('Failed to save data:', error);
            if (showMessage) {
                this.showMessage('保存失败: ' + error.message, 'error');
            }
            return false;
        }
    }

    /**
     * 处理键盘事件
     */
    handleKeydown(e) {
        try {
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
        } catch (error) {
            console.error('Failed to handle keyboard event:', error);
        }
    }

    /**
     * 处理缩进
     */
    handleIndent(isRemove = false) {
        if (!this.container) return;
        
        try {
            const { selectionStart: start, selectionEnd: end, value } = this.container;
        const selectedText = value.substring(start, end);
        
        // 缩进常量
        const INDENT = '  ';
        
        // 辅助函数：获取行边界
        const getLineBoundaries = (pos) => {
            const lineStart = value.lastIndexOf('\n', pos - 1) + 1;
            const lineEnd = value.indexOf('\n', pos);
            return {
                start: lineStart,
                end: lineEnd === -1 ? value.length : lineEnd
            };
        };
        
        // 辅助函数：获取缩进大小
        const getIndentSize = (indentStr) => {
            if (indentStr.startsWith('\t')) return 1;
            return Math.min(2, indentStr.length);
        };
        
        // 辅助函数：移除行缩进
        const removeLineIndent = (line) => {
            if (line.startsWith('\t')) return line.substring(1);
            if (line.startsWith('  ')) return line.substring(2);
            if (line.startsWith(' ')) return line.substring(1);
            return line;
        };
        
        // 辅助函数：更新编辑器内容和选区
        const updateEditor = (newValue, newStart, newEnd = newStart) => {
            this.container.value = newValue;
            this.container.selectionStart = newStart;
            this.container.selectionEnd = newEnd;
        };
        
        // 辅助函数：触发输入事件
        const triggerInputEvent = () => {
            this.container.dispatchEvent(new Event('input', { bubbles: true }));
        };
        
        // 没有选中文本的情况
        if (selectedText.length === 0) {
            if (isRemove) {
                // 移除缩进
                const { start: lineStart } = getLineBoundaries(start);
                const lineText = value.substring(lineStart, start);
                const indentMatch = lineText.match(/^(\s*)/);
                const indent = indentMatch ? indentMatch[1] : '';
                
                if (indent.length > 0) {
                    const indentSize = getIndentSize(indent);
                    const newValue = value.substring(0, lineStart) + 
                                   indent.substring(indentSize) + 
                                   value.substring(lineStart + indentSize);
                    updateEditor(newValue, start - indentSize);
                }
            } else {
                // 插入缩进
                const newValue = value.substring(0, start) + INDENT + value.substring(end);
                updateEditor(newValue, start + INDENT.length);
            }
        } else {
            // 有选中文本
            const lines = selectedText.split('\n');
            const { start: lineStart } = getLineBoundaries(start);
            
            // 检查是否选中了整行或多行
            const shouldProcessMultipleLines = start <= lineStart || selectedText.includes('\n');
            
            if (shouldProcessMultipleLines) {
                // 处理多行缩进
                const newSelectedText = isRemove 
                    ? lines.map(removeLineIndent).join('\n')
                    : lines.map(line => INDENT + line).join('\n');
                
                const newValue = value.substring(0, start) + newSelectedText + value.substring(end);
                updateEditor(newValue, start, start + newSelectedText.length);
            } else {
                // 只选中了行的一部分，在光标位置插入/移除缩进
                if (isRemove) {
                    const { start: lineStart } = getLineBoundaries(start);
                    const lineText = value.substring(lineStart, start);
                    const indentMatch = lineText.match(/^(\s*)/);
                    const indent = indentMatch ? indentMatch[1] : '';
                    
                    if (indent.length > 0) {
                        const indentSize = getIndentSize(indent);
                        const newValue = value.substring(0, lineStart) + 
                                       value.substring(lineStart, start).substring(indentSize) + 
                                       value.substring(start);
                        updateEditor(newValue, end - indentSize);
                    }
                } else {
                    const newValue = value.substring(0, start) + INDENT + value.substring(end);
                    updateEditor(newValue, start + INDENT.length);
                }
            }
        }
        
        // 触发 input 事件以更新预览
        triggerInputEvent();
        } catch (error) {
            console.error('Failed to handle indent:', error);
        }
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
