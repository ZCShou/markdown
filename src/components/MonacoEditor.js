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
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import { resolveDarkMode } from '../utils/theme.js';

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

    /**
     * 创建编辑器实例
     * @param {HTMLElement} container - 编辑器容器元素
     * @param {Object} options - 配置选项
     * @param {string} [options.initialValue=''] - 初始内容
     * @param {string} [options.placeholder=''] - 占位符文本
     * @param {string} [options.ariaLabel='Markdown editor input'] - ARIA 标签
     * @param {Function} [options.onChange] - 内容变化回调
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
        const monacoConfig = editorConfig.monaco || {};
        const interfaceConfig = this.options.interfaceConfig || {};
        const isDark = this.resolveDarkMode(interfaceConfig);

        // 配置 Monaco Editor Workers
        this.setupMonacoWorkers();

        // 注册 Markdown 语言
        this.registerMarkdownLanguage();

        // 创建编辑器（精简配置，适合 Markdown 编辑）
        this.editor = monaco.editor.create(this.container, {
            value: this.options.initialValue || '',
            language: 'markdown',
            theme: isDark ? 'vs-dark' : 'vs',
            automaticLayout: true,
            // 基础编辑（通用设置）
            fontSize: editorConfig.fontSize || 14,
            lineHeight: editorConfig.lineHeight || 1.6,
            fontFamily: editorConfig.fontFamily || "'Fira Code', 'Consolas', 'Monaco', monospace",
            fontLigatures: editorConfig.fontLigatures || false,
            fontWeight: editorConfig.fontWeight || 'normal',
            letterSpacing: editorConfig.letterSpacing || 0,
            // Monaco 特有设置
            wordWrap: editorConfig.wordWrap !== false ? 'on' : 'off',
            minimap: { enabled: monacoConfig.minimap !== false },
            scrollBeyondLastLine: false,
            smoothScrolling: monacoConfig.smoothScrolling !== false,
            // 光标
            cursorBlinking: monacoConfig.cursorBlinking || 'smooth',
            cursorStyle: 'line',
            cursorWidth: 2,
            // 缩进（通用设置）
            tabSize: editorConfig.tabSize || 4,
            insertSpaces: editorConfig.insertSpaces !== false,
            detectIndentation: false,
            // 禁用智能提示（Markdown 不需要）
            suggestOnTriggerCharacters: false,
            quickSuggestions: false,
            wordBasedSuggestions: 'off',
            parameterHints: { enabled: false },
            // 禁用自动配对（Markdown 中较少使用）
            autoClosingBrackets: 'never',
            autoClosingQuotes: 'never',
            autoSurround: 'never',
            // 简化括号相关
            matchBrackets: 'never',
            bracketPairColorization: { enabled: monacoConfig.bracketPairColorization !== false },
            guides: {
                bracketPairs: false,
                indentation: false
            },
            // 禁用格式化
            formatOnPaste: false,
            formatOnType: false,
            trimAutoWhitespace: false,
            // 渲染选项
            renderWhitespace: monacoConfig.renderWhitespace || 'selection',
            renderControlCharacters: false,
            renderLineHighlight: editorConfig.highlightActiveLine !== false ? 'all' : 'gutter',
            // 禁用 Unicode 高亮警告（中文项目不需要）
            unicodeHighlight: {
                ambiguousCharacters: false,
                invisibleCharacters: false,
                nonBasicASCII: false
            },
            // 代码折叠（保留，Markdown 标题折叠有用）
            folding: true,
            foldingStrategy: 'auto',
            showFoldingControls: 'mouseover',
            // 滚动条
            scrollbar: {
                useShadows: false,
                verticalScrollbarSize: 12,
                horizontalScrollbarSize: 12,
                vertical: 'auto',
                horizontal: 'auto'
            },
            padding: { top: 8, bottom: 8 },
            // 其他
            contextmenu: true, // 启用右键菜单（使用浏览器默认）
            fixedOverflowWidgets: true,
            accessibilitySupport: 'auto',
            ariaLabel: this.options.ariaLabel || 'Markdown editor input'
        });

        // 监听内容变化
        const changeListener = this.editor.onDidChangeModelContent(() => {
            this.options.onChange?.(this.getValue());
        });
        this.disposables.push(changeListener);
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

        // 注册 Markdown 标题折叠范围提供程序
        this.registerMarkdownFoldingProvider();
    }

    /**
     * 注册 Markdown 标题折叠范围提供程序
     * 支持 # 到 ###### 的标题折叠，以及围栏代码块折叠
     * @private
     */
    registerMarkdownFoldingProvider() {
        const { FoldingRangeKind } = monaco.languages;

        monaco.languages.registerFoldingRangeProvider('markdown', {
            provideFoldingRanges: model => {
                const ranges = [];
                const lines = model.getLinesContent();
                const lineCount = lines.length;
                const stack = []; // [line1, level1, line2, level2, ...]
                let stackLen = 0;

                let fenceStart = null; // 围栏代码块起始行号（1-based），null 表示不在代码块内
                let fenceChar = null; // 围栏字符 (` 或 ~)

                for (let i = 0; i < lineCount; i++) {
                    const line = lines[i];
                    const { length: len } = line;

                    // 检查围栏代码块
                    if (len >= 3 && (line[0] === '`' || line[0] === '~')) {
                        const [c0] = line;

                        if (fenceChar === null) {
                            // 不在代码块内，检查是否是围栏开始
                            if (line[1] === c0 && line[2] === c0) {
                                fenceStart = i + 1; // 1-based
                                fenceChar = c0;
                                continue;
                            }
                        } else if (c0 === fenceChar) {
                            // 在代码块内，检查是否是匹配的围栏结束
                            if (line[1] === c0 && line[2] === c0) {
                                // 添加代码块折叠范围
                                ranges.push({
                                    start: fenceStart,
                                    end: i + 1,
                                    kind: FoldingRangeKind.Region
                                });
                                fenceStart = null;
                                fenceChar = null;
                                continue;
                            }
                        }
                    }

                    if (fenceChar !== null) continue;

                    // 检查标题 (1-6个# 后跟空格)
                    if (len >= 2 && line[0] === '#') {
                        let level = 1;
                        while (level < 6 && level < len && line[level] === '#') level++;

                        if (level < len && line[level] === ' ') {
                            // 弹出所有 >= 当前级别的标题
                            while (stackLen > 0 && stack[stackLen - 1] >= level) {
                                const startLine = stack[stackLen - 2];
                                stackLen -= 2;
                                if (i + 1 > startLine) {
                                    ranges.push({
                                        start: startLine,
                                        end: i,
                                        kind: FoldingRangeKind.Region
                                    });
                                }
                            }
                            stack[stackLen++] = i + 1; // 行号从1开始
                            stack[stackLen++] = level;
                        }
                    }
                }

                // 处理剩余标题
                for (let j = 0; j < stackLen; j += 2) {
                    if (lineCount > stack[j]) {
                        ranges.push({
                            start: stack[j],
                            end: lineCount,
                            kind: FoldingRangeKind.Region
                        });
                    }
                }

                return ranges;
            }
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
     * @param {Object} [editorConfig.monaco] - Monaco 特有设置
     * @param {Object} [interfaceConfig={}] - 界面配置
     * @param {string} [interfaceConfig.theme] - 主题模式 ('dark' | 'light' | 'auto')
     *
     * @example
     * ```javascript
     * editor.updateConfig({
     *   fontSize: 18,
     *   lineHeight: 1.8,
     *   monaco: {
     *     minimap: true,
     *     renderWhitespace: 'all'
     *   }
     * }, {
     *   theme: 'dark'
     * });
     * ```
     */
    /**
     * 仅更新编辑器主题，供外部主题切换时调用（轻量，无需传入完整配置）
     * @param {string} mode - 主题模式 ('dark' | 'light' | 'auto')
     */
    applyTheme(mode) {
        if (!this.editor) return;
        const isDark = resolveDarkMode({ theme: mode });
        monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs');
    }

    updateConfig(editorConfig = {}, interfaceConfig = {}) {
        if (!this.editor) return;

        const monacoConfig = editorConfig.monaco || {};
        const isDark = this.resolveDarkMode(interfaceConfig);

        // 更新主题
        monaco.editor.setTheme(isDark ? 'vs-dark' : 'vs');

        // 更新编辑器选项（只更新支持的选项）
        const options = {};

        // 通用设置
        if (editorConfig.fontSize !== undefined) {
            options.fontSize = editorConfig.fontSize;
        }
        if (editorConfig.lineHeight !== undefined) {
            options.lineHeight = editorConfig.lineHeight;
        }
        if (editorConfig.tabSize !== undefined) {
            options.tabSize = editorConfig.tabSize;
        }
        if (editorConfig.insertSpaces !== undefined) {
            options.insertSpaces = editorConfig.insertSpaces;
        }

        // Monaco 特有设置
        if (monacoConfig.minimap !== undefined) {
            options.minimap = { enabled: monacoConfig.minimap };
        }
        if (editorConfig.wordWrap !== undefined) {
            options.wordWrap = editorConfig.wordWrap ? 'on' : 'off';
        }
        if (editorConfig.highlightActiveLine !== undefined) {
            options.renderLineHighlight = editorConfig.highlightActiveLine ? 'all' : 'gutter';
        }
        if (monacoConfig.bracketPairColorization !== undefined) {
            options.bracketPairColorization = { enabled: monacoConfig.bracketPairColorization };
        }
        if (monacoConfig.cursorBlinking !== undefined) {
            options.cursorBlinking = monacoConfig.cursorBlinking;
        }
        if (monacoConfig.smoothScrolling !== undefined) {
            options.smoothScrolling = monacoConfig.smoothScrolling;
        }
        if (monacoConfig.renderWhitespace !== undefined) {
            options.renderWhitespace = monacoConfig.renderWhitespace;
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
        return resolveDarkMode(interfaceConfig);
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
     * 获取滚动元素（代理对象，用于同步滚动）
     * 仅提供滚动属性，事件通过 onScroll 回调处理
     *
     * @returns {Object|null} 滚动代理对象
     */
    getScrollElement() {
        const { editor } = this;
        if (!editor) return null;

        return {
            get scrollTop() {
                return editor.getScrollTop();
            },
            set scrollTop(v) {
                editor.setScrollTop(Math.max(0, v));
            },
            get scrollHeight() {
                return editor.getScrollHeight();
            },
            get clientHeight() {
                return editor.getLayoutInfo().height;
            }
        };
    }

    /**
     * 获取用于 ResizeObserver 的 DOM 元素
     */
    getResizeObserverElement() {
        return this.editor?.getDomNode() || null;
    }

    /**
     * 注册滚动回调（同步滚动使用）
     * @param {Function} callback - 滚动回调函数
     * @returns {Function} 取消订阅函数
     */
    onScroll(callback) {
        if (!this.editor || typeof callback !== 'function') return () => {};

        const disposable = this.editor.onDidScrollChange(callback);
        return () => disposable.dispose();
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
    triggerSearch(_replace = false) {
        if (!this.editor) return;
        this.editor.trigger('keyboard', 'actions.find');
    }

    /**
     * 配置 Monaco Editor Workers
     *
     * Monaco Editor 需要 Web Workers 来处理语言服务功能（语法高亮、代码补全等）。
     * 此方法配置全局的 MonacoEnvironment 来告诉 Monaco 如何加载 worker 文件。
     *
     * @private
     * @see {@link https://code.visualstudio.com/api/extension-guides/vscode-web-extensions#web-workers}
     */
    setupMonacoWorkers() {
        // 如果已经配置过，则跳过
        if (self.MonacoEnvironment?.getWorker) return;

        /**
         * 获取 Worker 实例
         * @param {string} _workerId - Worker ID（未使用）
         * @param {string} _label - Worker 标签（语言标识）
         * @returns {Worker} Worker 实例
         */
        self.MonacoEnvironment = {
            getWorker(_workerId, _label) {
                return new EditorWorker();
            }
        };
    }
}
