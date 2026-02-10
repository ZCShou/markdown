/**
 * CodeMirror Editor 组件
 *
 * 基于 CodeMirror 6 的 Markdown 编辑器封装，提供以下功能：
 * - Markdown 语法高亮
 * - 行号显示（支持点击和拖动选择）
 * - 代码折叠
 * - 括号匹配
 * - 自动换行
 * - 搜索替换集成
 * - 主题切换支持
 * - 可配置的编辑器选项
 *
 * @module CodeMirrorEditor
 * @author Markdown Editor Team
 * @since 1.0.0
 */

import { EditorState, Compartment, Annotation } from '@codemirror/state';
import {
    EditorView,
    keymap,
    lineNumbers,
    highlightActiveLineGutter,
    drawSelection,
    highlightActiveLine,
    rectangularSelection,
    placeholder
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import {
    bracketMatching,
    indentUnit,
    syntaxHighlighting,
    HighlightStyle,
    foldGutter,
    foldKeymap
} from '@codemirror/language';
import { tags } from '@lezer/highlight';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';

/**
 * 自定义语法高亮样式，使用 CSS 变量
 * 为 Markdown 语法元素定义样式类名
 * @type {import('@codemirror/language').HighlightStyle}
 */
const customHighlightStyle = HighlightStyle.define([
    { tag: tags.link, class: 'md-link' },
    { tag: tags.url, class: 'md-url' },
    { tag: tags.heading, class: 'md-heading' },
    { tag: tags.heading1, class: 'md-heading1' },
    { tag: tags.heading2, class: 'md-heading2' },
    { tag: tags.heading3, class: 'md-heading3' },
    { tag: tags.heading4, class: 'md-heading4' },
    { tag: tags.heading5, class: 'md-heading5' },
    { tag: tags.heading6, class: 'md-heading6' },
    { tag: tags.emphasis, class: 'md-emphasis' },
    { tag: tags.strong, class: 'md-strong' },
    { tag: tags.strikethrough, class: 'md-strikethrough' },
    { tag: tags.quote, class: 'md-quote' },
    { tag: tags.list, class: 'md-list' },
    { tag: tags.monospace, class: 'md-monospace' },
    { tag: tags.contentSeparator, class: 'md-separator' }
]);

/**
 * 外部更新注解
 * 用于标记由外部 API 触发的编辑器更新，避免触发 onChange 回调
 */
const externalUpdate = Annotation.define();

/**
 * CodeMirror 编辑器包装类
 * 提供基于 CodeMirror 6 的 Markdown 编辑器功能
 *
 * @class CodeMirrorEditor
 * @example
 * ```javascript
 * const editor = new CodeMirrorEditor(container, {
 *   initialValue: '# Hello World',
 *   onChange: (content) => console.log(content),
 *   editorConfig: {
 *     lineNumbers: true,
 *     lineWrapping: true,
 *     fontSize: 16
 *   }
 * });
 * editor.init();
 * ```
 */
export class CodeMirrorEditor {
    /**
     * 当前活动的编辑器实例
     * @type {CodeMirrorEditor|null}
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
        this.view = null;
        this.themeCompartment = new Compartment();
        this.indentCompartment = new Compartment();
        this.tabSizeCompartment = new Compartment();
        this.lineNumbersCompartment = new Compartment();
        this.lineWrappingCompartment = new Compartment();
        this.highlightActiveLineCompartment = new Compartment();
        this.bracketMatchingCompartment = new Compartment();
        this.highlightGutterCompartment = new Compartment();
    }

    /**
     * 获取当前活动的编辑器实例
     * @returns {CodeMirrorEditor|null} 活动的编辑器实例
     * @static
     */
    static getActive() {
        return CodeMirrorEditor.active;
    }

    /**
     * 初始化编辑器
     * 创建 CodeMirror 视图并配置所有扩展，包括：
     * - 行号和折叠功能
     * - 历史记录和撤销/重做
     * - 选中高亮（仅文字内容，不延伸到行尾）
     * - 矩形选择
     * - 括号匹配
     * - Markdown 语法高亮
     * - 自动换行
     * - 自定义快捷键（Cmd/Ctrl+F 搜索、Cmd/Ctrl+H 替换、Escape）
     *
     * @throws {Error} 如果容器元素不存在
     * @example
     * ```javascript
     * const editor = new CodeMirrorEditor(container, options);
     * editor.init();
     * ```
     */
    init() {
        if (!this.container || this.view) return;

        const editorConfig = this.options.editorConfig || {};
        const interfaceConfig = this.options.interfaceConfig || {};
        const isDark = this.resolveDarkMode(interfaceConfig);

        const state = EditorState.create({
            doc: this.options.initialValue || '',
            extensions: [
                this.lineNumbersCompartment.of(this.createLineNumbersExtension(editorConfig)),
                this.highlightGutterCompartment.of(this.createHighlightGutterExtension(editorConfig)),
                foldGutter({
                    markerDOM: open => {
                        const icon = document.createElement('span');
                        icon.className = `codicon ${open ? 'codicon-chevron-down' : 'codicon-chevron-right'}`;
                        return icon;
                    }
                }),
                history(),
                drawSelection({ drawRangeCursor: true }),
                rectangularSelection(),
                this.highlightActiveLineCompartment.of(this.createHighlightActiveLineExtension(editorConfig)),
                this.bracketMatchingCompartment.of(this.createBracketMatchingExtension(editorConfig)),
                syntaxHighlighting(customHighlightStyle, { fallback: true }),
                markdown({
                    codeLanguages: languages
                }),
                this.lineWrappingCompartment.of(this.createLineWrappingExtension(editorConfig)),
                placeholder(this.options.placeholder || ''),
                EditorView.contentAttributes.of({
                    'aria-label': this.options.ariaLabel || 'Markdown editor input',
                    'aria-multiline': 'true',
                    role: 'textbox'
                }),
                this.tabSizeCompartment.of(EditorState.tabSize.of(editorConfig.tabSize ?? 4)),
                this.indentCompartment.of(this.createIndentExtension(editorConfig)),
                this.themeCompartment.of(this.createThemeExtension(editorConfig, isDark)),
                keymap.of(this.createCustomKeymap()),
                EditorView.updateListener.of(update => {
                    if (!update.docChanged) return;

                    const isExternal = update.transactions.some(tr => tr.annotation(externalUpdate));
                    if (isExternal) return;

                    this.options.onChange?.(update.state.doc.toString());
                })
            ]
        });

        this.view = new EditorView({
            state,
            parent: this.container
        });

        CodeMirrorEditor.active = this;
    }

    /**
     * 销毁编辑器
     * 清理视图、全局事件监听器并重置活动实例
     *
     * @example
     * ```javascript
     * editor.destroy();
     * ```
     */
    destroy() {
        // 清理拖动状态和全局监听器
        this._endLineDrag();

        if (this.view) {
            this.view.destroy();
            this.view = null;
        }

        if (CodeMirrorEditor.active === this) {
            CodeMirrorEditor.active = null;
        }
    }

    /**
     * 创建缩进扩展
     * @param {Object} editorConfig - 编辑器配置
     * @param {boolean} [editorConfig.insertSpaces=true] - 是否使用空格缩进
     * @param {number} [editorConfig.tabSize=4] - Tab 大小
     * @returns {import('@codemirror/state').Extension} 缩进扩展
     * @private
     */
    createIndentExtension(editorConfig) {
        const { insertSpaces = true, tabSize = 4 } = editorConfig || {};
        const unit = insertSpaces ? ' '.repeat(tabSize) : '\t';
        return indentUnit.of(unit);
    }

    /**
     * 创建自定义快捷键配置
     * @returns {Array} 快捷键配置数组
     * @private
     */
    createCustomKeymap() {
        return [
            {
                key: 'Mod-f',
                run: () => {
                    this.options.onSearch?.(false);
                    return true;
                }
            },
            {
                key: 'Mod-h',
                run: () => {
                    this.options.onSearch?.(true);
                    return true;
                }
            },
            {
                key: 'Escape',
                run: () => {
                    return this.options.onEscape?.() ?? false;
                }
            },
            ...defaultKeymap,
            ...historyKeymap,
            ...foldKeymap,
            indentWithTab
        ];
    }

    /**
     * 创建行号扩展
     * 支持点击行号选中整行，拖动行号选中多行
     * 拖动时即使鼠标离开行号区域，只要不释放鼠标左键，选择仍然有效
     * @param {Object} editorConfig - 编辑器配置
     * @param {boolean} [editorConfig.lineNumbers=true] - 是否显示行号
     * @returns {import('@codemirror/state').Extension} 行号扩展
     * @private
     */
    createLineNumbersExtension(editorConfig) {
        if (editorConfig?.lineNumbers === false) return [];

        return lineNumbers({
            domEventHandlers: {
                mousedown: (view, line, event) => {
                    event.preventDefault();

                    // 缓存起始行信息到实例属性
                    this._lineDragState = {
                        isDragging: true,
                        startLineNum: view.state.doc.lineAt(line.from).number,
                        view: view
                    };

                    // 选中整行
                    view.dispatch({
                        selection: { anchor: line.from, head: line.to }
                    });

                    view.focus();

                    // 添加全局事件监听器，以便在整个文档范围内跟踪鼠标移动
                    this._setupGlobalDragListeners();

                    return true;
                },

                mousemove: (view, line, event) => {
                    const dragState = this._lineDragState;
                    if (!dragState?.isDragging) return false;

                    event.preventDefault();
                    this._updateLineSelection(view, line.from);
                    return true;
                }
            }
        });
    }

    /**
     * 设置全局拖动事件监听器
     * 在文档级别监听鼠标移动和释放事件
     * @private
     */
    _setupGlobalDragListeners() {
        // 全局鼠标移动处理
        this._globalMouseMoveHandler = (event) => {
            const dragState = this._lineDragState;
            if (!dragState?.isDragging || !dragState.view) return;

            event.preventDefault();

            // 使用 requestAnimationFrame 节流
            if (dragState.rafId) return;

            dragState.rafId = requestAnimationFrame(() => {
                const view = dragState.view;
                // 根据鼠标坐标获取对应的文档位置
                const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });

                if (pos !== null) {
                    this._updateLineSelection(view, pos);
                }

                dragState.rafId = null;
            });
        };

        // 全局鼠标释放处理
        this._globalMouseUpHandler = () => {
            this._endLineDrag();
        };

        document.addEventListener('mousemove', this._globalMouseMoveHandler);
        document.addEventListener('mouseup', this._globalMouseUpHandler);
    }

    /**
     * 更新行选择
     * @param {EditorView} view - 编辑器视图
     * @param {number} pos - 当前位置
     * @private
     */
    _updateLineSelection(view, pos) {
        const dragState = this._lineDragState;
        if (!dragState?.isDragging) return;

        const currentLineNum = view.state.doc.lineAt(pos).number;
        const fromLineNum = Math.min(dragState.startLineNum, currentLineNum);
        const toLineNum = Math.max(dragState.startLineNum, currentLineNum);

        const fromLine = view.state.doc.line(fromLineNum);
        const toLine = view.state.doc.line(toLineNum);

        view.dispatch({
            selection: {
                anchor: fromLine.from,
                head: toLine.to
            }
        });
    }

    /**
     * 结束行号拖动状态
     * 清理全局事件监听器和拖动状态
     * @private
     */
    _endLineDrag() {
        if (this._lineDragState?.rafId) {
            cancelAnimationFrame(this._lineDragState.rafId);
        }

        // 移除全局事件监听器
        if (this._globalMouseMoveHandler) {
            document.removeEventListener('mousemove', this._globalMouseMoveHandler);
            this._globalMouseMoveHandler = null;
        }
        if (this._globalMouseUpHandler) {
            document.removeEventListener('mouseup', this._globalMouseUpHandler);
            this._globalMouseUpHandler = null;
        }

        this._lineDragState = null;
    }

    /**
     * 创建自动换行扩展
     * @param {Object} editorConfig - 编辑器配置
     * @param {boolean} [editorConfig.lineWrapping=true] - 是否自动换行
     * @returns {import('@codemirror/state').Extension} 换行扩展
     * @private
     */
    createLineWrappingExtension(editorConfig) {
        return this._createExtensionIfEnabled(editorConfig?.lineWrapping, EditorView.lineWrapping);
    }

    /**
     * 创建高亮当前行扩展
     * @param {Object} editorConfig - 编辑器配置
     * @param {boolean} [editorConfig.highlightActiveLine=true] - 是否高亮当前行
     * @returns {import('@codemirror/state').Extension} 高亮扩展
     * @private
     */
    createHighlightActiveLineExtension(editorConfig) {
        return this._createExtensionIfEnabled(editorConfig?.highlightActiveLine, highlightActiveLine);
    }

    /**
     * 创建括号匹配扩展
     * @param {Object} editorConfig - 编辑器配置
     * @param {boolean} [editorConfig.bracketMatching=true] - 是否匹配括号
     * @returns {import('@codemirror/state').Extension} 括号匹配扩展
     * @private
     */
    createBracketMatchingExtension(editorConfig) {
        return this._createExtensionIfEnabled(editorConfig?.bracketMatching, bracketMatching);
    }

    /**
     * 创建高亮行号栏扩展
     * @param {Object} editorConfig - 编辑器配置
     * @param {boolean} [editorConfig.highlightGutter=true] - 是否高亮当前行号
     * @returns {import('@codemirror/state').Extension} 行号高亮扩展
     * @private
     */
    createHighlightGutterExtension(editorConfig) {
        return this._createExtensionIfEnabled(editorConfig?.highlightGutter, highlightActiveLineGutter);
    }

    /**
     * 通用的扩展创建方法 - 如果配置启用则返回扩展，否则返回空数组
     * @param {boolean|undefined} enabled - 是否启用
     * @param {Function|import('@codemirror/state').Extension} extensionOrFactory - 扩展或工厂函数
     * @returns {import('@codemirror/state').Extension} 扩展或空数组
     * @private
     */
    _createExtensionIfEnabled(enabled, extensionOrFactory) {
        if (enabled === false) return [];
        // 如果是函数，调用它；否则直接返回扩展
        return typeof extensionOrFactory === 'function' ? extensionOrFactory() : extensionOrFactory;
    }

    /**
     * 创建主题扩展
     * 动态配置字号和行高，其他样式通过 CSS 实现
     * @param {Object} editorConfig - 编辑器配置
     * @param {number} [editorConfig.fontSize] - 字号（像素），默认使用浏览器默认值
     * @param {number} [editorConfig.lineHeight=1.6] - 行高
     * @param {boolean} isDark - 是否为暗色主题
     * @returns {import('@codemirror/state').Extension} 主题扩展
     * @private
     */
    createThemeExtension(editorConfig, isDark) {
        const fontSize = editorConfig.fontSize ?? null;
        const lineHeight = editorConfig.lineHeight ?? 1.6;

        // 只保留需要动态配置的样式（字号、行高）
        // 其他样式通过 CSS 实现，保持与 markdown.css 一致
        const themeConfig = {
            '.cm-scroller': {
                lineHeight: String(lineHeight)
            }
        };

        // 只有明确设置了 fontSize 时才覆盖
        if (fontSize !== null) {
            themeConfig['&'] = {
                fontSize: `${fontSize}px`
            };
        }

        return EditorView.theme(themeConfig, { dark: isDark });
    }

    /**
     * 更新编辑器配置
     * 动态更新编辑器的各种配置选项，无需重新初始化
     *
     * @param {Object} [editorConfig={}] - 编辑器配置
     * @param {number} [editorConfig.tabSize=4] - Tab 大小
     * @param {boolean} [editorConfig.insertSpaces=true] - 是否使用空格缩进
     * @param {number} [editorConfig.fontSize=16] - 字号（像素）
     * @param {number} [editorConfig.lineHeight=1.6] - 行高
     * @param {boolean} [editorConfig.lineNumbers=true] - 是否显示行号
     * @param {boolean} [editorConfig.lineWrapping=true] - 是否自动换行
     * @param {boolean} [editorConfig.highlightActiveLine=true] - 是否高亮当前行
     * @param {boolean} [editorConfig.bracketMatching=true] - 是否匹配括号
     * @param {boolean} [editorConfig.highlightGutter=true] - 是否高亮当前行号
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
        if (!this.view) return;

        const isDark = this.resolveDarkMode(interfaceConfig);
        this.view.dispatch({
            effects: [
                this.tabSizeCompartment.reconfigure(
                    EditorState.tabSize.of(editorConfig.tabSize ?? 4)
                ),
                this.indentCompartment.reconfigure(this.createIndentExtension(editorConfig)),
                this.themeCompartment.reconfigure(this.createThemeExtension(editorConfig, isDark)),
                this.lineNumbersCompartment.reconfigure(this.createLineNumbersExtension(editorConfig)),
                this.lineWrappingCompartment.reconfigure(this.createLineWrappingExtension(editorConfig)),
                this.highlightActiveLineCompartment.reconfigure(this.createHighlightActiveLineExtension(editorConfig)),
                this.bracketMatchingCompartment.reconfigure(this.createBracketMatchingExtension(editorConfig)),
                this.highlightGutterCompartment.reconfigure(this.createHighlightGutterExtension(editorConfig))
            ]
        });
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
        if (!this.view) return;
        if (this.getValue() === value) return;

        const annotations = options.emitUpdate !== true
            ? [externalUpdate.of(true)]
            : [];

        this.view.dispatch({
            changes: { from: 0, to: this.view.state.doc.length, insert: value },
            annotations
        });
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
        return this.view ? this.view.state.doc.toString() : '';
    }

    /**
     * 聚焦编辑器
     * @example
     * ```javascript
     * editor.focus();
     * ```
     */
    focus() {
        this.view?.focus();
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
        if (!this.view) return { start: 0, end: 0 };
        const selection = this.view.state.selection.main;
        return { start: selection.from, end: selection.to };
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
        if (!this.view) return;

        const effects = options.scroll
            ? [EditorView.scrollIntoView(start, { y: 'center' })]
            : [];

        this.view.dispatch({
            selection: { anchor: start, head: end },
            effects
        });

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
        if (!this.view) return;

        const selectionEnd = from + text.length;
        this.view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: selectionEnd, head: selectionEnd }
        });
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
        return this.view?.scrollDOM || null;
    }
}
