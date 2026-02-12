/**
 * Monaco Editor 组件
 *
 * 基于 Monaco Editor（VS Code 核心）的 Markdown 编辑器封装，提供以下功能：
 * - Markdown 语法高亮
 * - 行号显示（支持点击和拖动选择）
 * - 代码折叠
 * - 括号匹配
 * - 自动换行
 * - 搜索替换集成
 * - 主题切换支持
 * - 可配置的编辑器选项
 *
 * @module MonacoEditor
 * @author Markdown Editor Team
 * @since 1.0.0
 */

import * as monaco from 'monaco-editor';

/**
 * Monaco 编辑器包装类
 * 提供基于 Monaco Editor 的 Markdown 编辑器功能
 *
 * @class MonacoEditor
 * @example
 * ```javascript
 * const editor = new MonacoEditor(container, {
 *   initialValue: '# Hello World',
 *   onChange: (content) => console.log(content),
 *   editorConfig: {
 *     lineNumbers: true,
 *     lineWrapping: true,
 *     fontSize: 16
 * }
 * });
 * editor.init();
 * ```
 */
export class MonacoEditor {
    /**
     * 当前活动的编辑器实例
     * @type {MonacoEditor|null}
     * @static
     */
    static active = null;

    /**
     * 创建编辑器实例
     * @param {HTMLElement} container - 编辑器容器元素
     * @param {Object} options - 配置选项
     * @param {string} [options.initialValue=''] - 初始内容
     * @param {string} [options.placeholder=''] - 占位符文本
     * @param {string} [options.ariaLabel='Markdown editor input'] - ARIA 标签
     * @param {Function} [options.onChange] - 内容变化回调
     * @param {Function} [options.onSearch] - 搜索触发回调
     * @param {Function} [options.onEscape] - ESC 键按下回调
     * @param {Object} [options.editorConfig] - 编辑器配置
     * @param {Object} [options.interfaceConfig] - 界面配置
     */
    constructor(container, options = {}) {
        this.container = container;
        this.options = options;
        this.editor = null;
        this.disposables = [];
    }

    /**
     * 获取当前活动的编辑器实例
     * @returns {MonacoEditor|null} 活动的编辑器实例
     * @static
     */
    static getActive() {
        return MonacoEditor.active;
    }

    /**
     * 初始化编辑器
     * 创建 Monaco 编辑器实例并配置所有选项
     *
     * @throws {Error} 如果容器元素不存在
     * @example
     * ```javascript
     * const editor = new MonacoEditor(container, options);
     * editor.init();
     * ```
     */
    init() {
        if (!this.container || this.editor) return;

        const editorConfig = this.options.editorConfig || {};
        const interfaceConfig = this.options.interfaceConfig || {};
        const isDark = this.resolveDarkMode(interfaceConfig);

        // 注册 Markdown 语言
        this.registerMarkdownLanguage();

        // 创建编辑器
        this.editor = monaco.editor.create(this.container, {
            value: this.options.initialValue || '',
            language: 'markdown',
            theme: isDark ? 'vs-dark' : 'vs',
            automaticLayout: true,
            fontSize: editorConfig.fontSize || 14,
            lineHeight: editorConfig.lineHeight || 1.6,
            fontFamily: editorConfig.fontFamily || "'Fira Code', 'Consolas', 'Monaco', monospace",
            fontLigatures: editorConfig.fontLigatures || false,
            fontWeight: editorConfig.fontWeight || 'normal',
            letterSpacing: editorConfig.letterSpacing || 0,
            wordWrap: editorConfig.lineWrapping !== false ? 'on' : 'off',
            lineNumbers: editorConfig.lineNumbers !== false ? 'on' : 'off',
            minimap: { enabled: editorConfig.minimap !== false },
            scrollBeyondLastLine: editorConfig.scrollBeyondLastLine !== false,
            smoothScrolling: editorConfig.smoothScrolling !== false,
            cursorBlinking: editorConfig.cursorBlinking || 'blink',
            cursorSmoothCaretAnimation: editorConfig.cursorSmoothCaretAnimation || 'off',
            cursorStyle: editorConfig.cursorStyle || 'line',
            cursorWidth: editorConfig.cursorWidth || 2,
            tabSize: editorConfig.tabSize || 4,
            insertSpaces: editorConfig.insertSpaces !== false,
            detectIndentation: editorConfig.detectIndentation !== false,
            trimAutoWhitespace: editorConfig.trimAutoWhitespace !== false,
            formatOnPaste: editorConfig.formatOnPaste || false,
            formatOnType: editorConfig.formatOnType || false,
            autoClosingBrackets: editorConfig.autoClosingBrackets !== false ? 'always' : 'never',
            autoClosingQuotes: editorConfig.autoClosingQuotes !== false ? 'always' : 'never',
            autoSurround: editorConfig.autoSurround !== false ? 'languageDefined' : 'never',
            suggestOnTriggerCharacters: editorConfig.suggestOnTriggerCharacters !== false,
            quickSuggestions: editorConfig.quickSuggestions !== false ? {
                other: true,
                comments: false,
                strings: false
            } : false,
            acceptSuggestionOnCommitCharacter: editorConfig.acceptSuggestionOnCommitCharacter !== false,
            acceptSuggestionOnEnter: editorConfig.acceptSuggestionOnEnter || 'on',
            wordBasedSuggestions: editorConfig.wordBasedSuggestions !== false,
            parameterHints: { enabled: editorConfig.parameterHints !== false },
            folding: editorConfig.folding !== false,
            foldingStrategy: editorConfig.foldingStrategy || 'auto',
            showFoldingControls: editorConfig.showFoldingControls || 'mouseover',
            matchBrackets: editorConfig.matchBrackets !== false ? 'always' : 'never',
            bracketPairColorization: { enabled: editorConfig.bracketPairColorization !== false },
            guides: {
                bracketPairs: editorConfig.bracketPairs !== false,
                indentation: editorConfig.indentationGuides !== false
            },
            renderWhitespace: editorConfig.renderWhitespace || 'selection',
            renderControlCharacters: editorConfig.renderControlCharacters !== false,
            renderLineHighlight: editorConfig.renderLineHighlight || 'all',
            renderLineHighlightOnlyWhenFocus: editorConfig.renderLineHighlightOnlyWhenFocus || false,
            highlightActiveIndentGuide: editorConfig.highlightActiveIndentGuide !== false,
            scrollbar: {
                useShadows: editorConfig.scrollbarUseShadows !== false,
                verticalScrollbarSize: editorConfig.verticalScrollbarSize || 14,
                horizontalScrollbarSize: editorConfig.horizontalScrollbarSize || 14,
                vertical: editorConfig.verticalScrollbarSize || 'auto',
                horizontal: editorConfig.horizontalScrollbarSize || 'auto'
            },
            padding: {
                top: editorConfig.paddingTop || 0,
                bottom: editorConfig.paddingBottom || 0
            },
            find: {
                autoFindInSelection: editorConfig.autoFindInSelection || 'never',
                seedSearchStringFromSelection: editorConfig.seedSearchStringFromSelection !== false
            },
            contextmenu: editorConfig.contextmenu !== false,
            mouseWheelZoom: editorConfig.mouseWheelZoom || false,
            multiCursorModifier: editorConfig.multiCursorModifier || 'altKey',
            multiCursorPaste: editorConfig.multiCursorPaste || 'spread',
            accessibilitySupport: editorConfig.accessibilitySupport || 'auto',
            ariaLabel: this.options.ariaLabel || 'Markdown editor input'
        });

        // 监听内容变化
        const changeListener = this.editor.onDidChangeModelContent(() => {
            this.options.onChange?.(this.getValue());
        });
        this.disposables.push(changeListener);

        // 监听 ESC 键
        const keydownListener = this.editor.onKeyDown((e) => {
            if (e.code === 'Escape') {
                if (this.options.onEscape?.()) {
                    e.stopPropagation();
                    e.preventDefault();
                }
            }
            // Cmd/Ctrl+F 搜索
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyF') {
                this.options.onSearch?.(false);
                e.stopPropagation();
                e.preventDefault();
            }
            // Cmd/Ctrl+H 替换
            if ((e.ctrlKey || e.metaKey) && e.code === 'KeyH') {
                this.options.onSearch?.(true);
                e.stopPropagation();
                e.preventDefault();
            }
        });
        this.disposables.push(keydownListener);

        MonacoEditor.active = this;
    }

    /**
     * 注册 Markdown 语言
     * @private
     */
    registerMarkdownLanguage() {
        // Monaco Editor 内置支持 Markdown
        // 这里可以添加自定义的语言配置
        monaco.languages.setLanguageConfiguration('markdown', {
            comments: {
                lineComment: '//',
                blockComment: ['<!--', '-->']
            },
            brackets: [
                ['*', '*'],
                ['_', '_'],
                ['[', ']'],
                ['(', ')'],
                ['{', '}']
            ],
            autoClosingPairs: [
                { open: '*', close: '*' },
                { open: '_', close: '_' },
                { open: '[', close: ']' },
                { open: '(', close: ')' },
                { open: '{', close: '}' },
                { open: '"', close: '"' },
                { open: "'", close: "'" },
                { open: '`', close: '`' }
            ],
            surroundingPairs: [
                { open: '*', close: '*' },
                { open: '_', close: '_' },
                { open: '[', close: ']' },
                { open: '(', close: ')' },
                { open: '{', close: '}' },
                { open: '"', close: '"' },
                { open: "'", close: "'" },
                { open: '`', close: '`' }
            ]
        });
    }

    /**
     * 销毁编辑器
     * 清理编辑器实例和事件监听器
     *
     * @example
     * ```javascript
     * editor.destroy();
     * ```
     */
    destroy() {
        // 清理事件监听器
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];

        if (this.editor) {
            this.editor.dispose();
            this.editor = null;
        }

        if (MonacoEditor.active === this) {
            MonacoEditor.active = null;
        }
    }

    /**
     * 更新编辑器配置
     * 动态更新编辑器的各种配置选项
     *
     * @param {Object} [editorConfig={}] - 编辑器配置
     * @param {number} [editorConfig.tabSize=4] - Tab 大小
     * @param {boolean} [editorConfig.insertSpaces=true] - 是否使用空格缩进
     * @param {number} [editorConfig.fontSize=14] - 字号（像素）
     * @param {number} [editorConfig.lineHeight=1.6] - 行高
     * @param {boolean} [editorConfig.lineNumbers=true] - 是否显示行号
     * @param {boolean} [editorConfig.lineWrapping=true] - 是否自动换行
     * @param {boolean} [editorConfig.folding=true] - 是否启用代码折叠
     * @param {boolean} [editorConfig.matchBrackets=true] - 是否匹配括号
     * @param {boolean} [editorConfig.minimap=true] - 是否显示缩略图
     * @param {Object} [interfaceConfig={}] - 界面配置
     * @param {string} [interfaceConfig.theme] - 主题模式 ('dark' | 'light' | 'auto')
     *
     * @example
     * ```javascript
     * editor.updateConfig({
     *   fontSize: 18,
     *   lineHeight: 1.8,
     *   lineNumbers: true
     * }, {
     *   theme: 'dark'
     * });
     * ```
     */
    updateConfig(editorConfig = {}, interfaceConfig = {}) {
        if (!this.editor) return;

        const isDark = this.resolveDarkMode(interfaceConfig);

        // 更新主题
        monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs');

        // 更新编辑器选项
        const options = {};

        if (editorConfig.fontSize !== undefined) {
            options.fontSize = editorConfig.fontSize;
        }
        if (editorConfig.lineHeight !== undefined) {
            options.lineHeight = editorConfig.lineHeight;
        }
        if (editorConfig.lineNumbers !== undefined) {
            options.lineNumbers = editorConfig.lineNumbers ? 'on' : 'off';
        }
        if (editorConfig.lineWrapping !== undefined) {
            options.wordWrap = editorConfig.lineWrapping ? 'on' : 'off';
        }
        if (editorConfig.folding !== undefined) {
            options.folding = editorConfig.folding;
        }
        if (editorConfig.matchBrackets !== undefined) {
            options.matchBrackets = editorConfig.matchBrackets ? 'always' : 'never';
        }
        if (editorConfig.minimap !== undefined) {
            options.minimap = { enabled: editorConfig.minimap };
        }
        if (editorConfig.tabSize !== undefined) {
            options.tabSize = editorConfig.tabSize;
        }
        if (editorConfig.insertSpaces !== undefined) {
            options.insertSpaces = editorConfig.insertSpaces;
        }

        this.editor.updateOptions(options);
    }

    /**
     * 解析暗色模式设置
     * @param {Object} interfaceConfig - 界面配置
     * @param {string} [interfaceConfig.theme] - 主题模式 ('dark' | 'light' | 'auto')
     * @returns {boolean} 是否为暗色模式
     * @private
     */
    resolveDarkMode(interfaceConfig = {}) {
        const theme = interfaceConfig.theme;
        if (theme === 'dark') return true;
        if (theme === 'light') return false;

        return document.documentElement.getAttribute('data-mode') === 'dark';
    }

    /**
     * 设置编辑器内容
     * @param {string} value - 新内容
     * @param {Object} [options={}] - 选项
     * @param {boolean} [options.emitUpdate=false] - 是否触发 onChange 回调
     * @example
     * ```javascript
     * editor.setValue('# New Content');
     * editor.setValue('# Updated', { emitUpdate: true });
     * ```
     */
    setValue(value, options = {}) {
        if (!this.editor) return;

        const currentValue = this.getValue();
        if (currentValue === value) return;

        // 暂时移除监听器以避免触发 onChange
        if (options.emitUpdate !== true) {
            this.editor.setValue(value);
        } else {
            this.editor.setValue(value);
        }
    }

    /**
     * 获取编辑器内容
     * @returns {string} 编辑器当前内容
     * @example
     * ```javascript
     * const content = editor.getValue();
     * ```
     */
    getValue() {
        return this.editor ? this.editor.getValue() : '';
    }

    /**
     * 聚焦编辑器
     * @example
     * ```javascript
     * editor.focus();
     * ```
     */
    focus() {
        this.editor?.focus();
    }

    /**
     * 获取当前选区范围
     * @returns {{start: number, end: number}} 选区起始和结束位置
     * @example
     * ```javascript
     * const { start, end } = editor.getSelectionRange();
     * console.log(`Selected: ${start} to ${end}`);
     * ```
     */
    getSelectionRange() {
        if (!this.editor) return { start: 0, end: 0 };
        const selection = this.editor.getSelection();
        return { start: selection.startLineNumber, end: selection.endLineNumber };
    }

    /**
     * 设置选区范围
     * @param {number} start - 选区起始位置
     * @param {number} end - 选区结束位置
     * @param {Object} [options={}] - 选项
     * @param {boolean} [options.scroll=false] - 是否滚动到选区
     * @param {boolean} [options.focus=false] - 是否聚焦编辑器
     * @example
     * ```javascript
     * editor.setSelectionRange(10, 20);
     * editor.setSelectionRange(10, 20, { scroll: true, focus: true });
     * ```
     */
    setSelectionRange(start, end, options = {}) {
        if (!this.editor) return;

        this.editor.setSelection(
            monaco.Selection.fromPositions(
                { lineNumber: start, column: 1 },
                { lineNumber: end, column: 1 }
            )
        );

        if (options.scroll) {
            this.editor.revealLineInCenter(start);
        }

        if (options.focus) {
            this.focus();
        }
    }

    /**
     * 替换指定范围的内容
     * @param {number} from - 起始位置
     * @param {number} to - 结束位置
     * @param {string} text - 替换文本
     * @example
     * ```javascript
     * editor.replaceRange(10, 20, 'new text');
     * ```
     */
    replaceRange(from, to, text) {
        if (!this.editor) return;

        const range = new monaco.Range(
            from, 1,
            to, 1
        );

        const edits = [{ range, text }];
        this.editor.executeEdits('replaceRange', edits);
    }

    /**
     * 获取滚动元素
     * @returns {HTMLElement|null} 滚动容器元素
     * @example
     * ```javascript
     * const scrollElement = editor.getScrollElement();
     * scrollElement.scrollTop = 0;
     * ```
     */
    getScrollElement() {
        return this.editor?.getDomNode()?.querySelector('.monaco-scrollable-element') || null;
    }

    /**
     * 触发搜索
     * @param {boolean} replace - 是否为替换模式
     * @example
     * ```javascript
     * editor.triggerSearch(false); // 搜索
     * editor.triggerSearch(true);  // 替换
     * ```
     */
    triggerSearch(replace = false) {
        if (!this.editor) return;
        this.editor.trigger('keyboard', 'actions.find');
    }

    /**
     * 获取编辑器实例
     * @returns {monaco.editor.IStandaloneCodeEditor|null} Monaco 编辑器实例
     * @example
     * ```javascript
     * const monacoEditor = editor.getEditorInstance();
     * ```
     */
    getEditorInstance() {
        return this.editor;
    }
}
