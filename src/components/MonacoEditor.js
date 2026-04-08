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
import { extractImageFromClipboard } from '../utils/helpers.js';

// ---------------------------------------------------------------------------
// 模块级 Markdown 解析缓存（单条目，适合单编辑器场景）
// DocumentSymbolProvider 和 FoldingRangeProvider 共享同一次解析结果，
// 每次文档编辑后 getLinesContent() 只调用一次。
// ---------------------------------------------------------------------------
let _mdCacheKey = '';
let _mdCacheVal = null;

/**
 * 解析 Markdown 模型，一次性提取所有标题和围栏代码块的位置。
 * 按 model URI + versionId 缓存，同一版本多次调用只解析一次。
 * @param {import('monaco-editor').editor.ITextModel} model
 */
function _parseMarkdownModel(model) {
    const key = `${model.uri}:${model.getVersionId()}`;
    if (key === _mdCacheKey) return _mdCacheVal;

    const lines = model.getLinesContent();
    const n = lines.length;
    const headings = [];   // { lineIdx, level, text }
    const fenceRanges = []; // { start, end }  1-based

    let inFence = false;
    let fenceChar = '';
    let fenceStart = 0;

    for (let i = 0; i < n; i++) {
        const line = lines[i];
        const len = line.length;

        if (len >= 3 && (line[0] === '`' || line[0] === '~')) {
            const [c] = line;
            if (!inFence) {
                if (line[1] === c && line[2] === c) {
                    inFence = true; fenceChar = c; fenceStart = i + 1;
                    continue;
                }
            } else if (c === fenceChar && line[1] === c && line[2] === c) {
                inFence = false;
                fenceRanges.push({ start: fenceStart, end: i + 1 });
                continue;
            }
        }
        if (inFence) continue;

        let level = 0;
        while (level < 6 && level < len && line[level] === '#') level++;
        if (level > 0 && level < len && line[level] === ' ') {
            headings.push({ lineIdx: i, level, text: line.slice(level + 1).trim() });
        }
    }

    _mdCacheKey = key;
    _mdCacheVal = { headings, fenceRanges, lines, n };
    return _mdCacheVal;
}

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

    /** 标记 Markdown 语言扩展是否已全局注册（仅需注册一次） */
    static #markdownRegistered = false;

    /**
     * 创建编辑器实例
     * @param {HTMLElement} container - 编辑器容器元素
     * @param {Object} options - 配置选项
     * @param {string} [options.initialValue=''] - 初始内容
     * @param {string} [options.placeholder=''] - 占位符文本
     * @param {string} [options.ariaLabel='Markdown editor input'] - ARIA 标签
     * @param {Function} [options.onChange] - 内容变化回调
     * @param {Function} [options.onImagePaste] - 粘贴图片回调，接收 File 对象，返回 Promise<string> 图片路径
     * @param {Object} [options.editorConfig] - 编辑器配置
     * @param {Object} [options.interfaceConfig] - 界面配置
     */
    constructor(container, options = {}) {
        this.container = container;
        this.options = options;
        this.editor = null;
        this.disposables = [];
        this._suppressOnChange = false;
        /** @type {Function|null} 粘贴事件处理函数 */
        this.pasteHandler = null;
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

        // 创建编辑器
        this.editor = monaco.editor.create(this.container, {
            value: this.options.initialValue || '',
            language: 'markdown',
            theme: isDark ? 'vs-dark' : 'vs',
            automaticLayout: true,
            // 基础编辑
            fontSize: editorConfig.fontSize || 14,
            lineHeight: editorConfig.lineHeight || 1.6,
            wordWrap: editorConfig.wordWrap !== false ? 'on' : 'off',
            scrollBeyondLastLine: false,
            // 禁用 Markdown 不需要的智能提示
            quickSuggestions: false,
            suggestOnTriggerCharacters: false,
            wordBasedSuggestions: 'off',
            parameterHints: { enabled: false },
            // 折叠（供右侧折叠图标及 stickyScroll 使用）
            folding: true,
            // 粘性滚动：outlineModel 配合下方注册的 DocumentSymbolProvider 驱动
            stickyScroll: { enabled: monacoConfig.stickyScroll !== false },
            ariaLabel: this.options.ariaLabel || 'Markdown editor input'
        });

        // 监听内容变化
        const changeListener = this.editor.onDidChangeModelContent(() => {
            if (this._suppressOnChange) return;
            this.options.onChange?.(this.getValue());
        });
        this.disposables.push(changeListener);

        // 在行号区域拖动选择时支持鼠标滚轮滚动
        this.#setupGutterWheelScroll();

        // 设置粘贴事件监听器
        this.#setupPasteHandler();
    }

    /**
     * 设置粘贴事件处理器
     * 支持从剪贴板粘贴图片
     * @private
     */
    #setupPasteHandler() {
        if (!this.editor || !this.options.onImagePaste) return;

        this.pasteHandler = async (event) => {
            if (!this.editor?.hasTextFocus()) return;

            const imageFile = extractImageFromClipboard(event.clipboardData);
            if (!imageFile) return;

            event.preventDefault();
            event.stopPropagation();

            try {
                const imagePath = await this.options.onImagePaste(imageFile);
                if (imagePath) this.#insertImage(imagePath);
            } catch (error) {
                console.error('Failed to handle pasted image:', error);
            }
        };

        document.addEventListener('paste', this.pasteHandler, true);
    }

    /**
     * 在当前光标位置插入图片
     * @param {string} imagePath - 图片路径
     * @private
     */
    #insertImage(imagePath) {
        if (!this.editor) return;

        const imageMarkdown = `![输入图片说明](${imagePath})`;
        const position = this.editor.getPosition();
        if (!position) return;

        this.editor.executeEdits('', [{
            range: new monaco.Range(
                position.lineNumber,
                position.column,
                position.lineNumber,
                position.column
            ),
            text: imageMarkdown
        }]);

        // 将光标移动到插入文本的末尾
        const newPosition = new monaco.Position(
            position.lineNumber,
            position.column + imageMarkdown.length
        );
        this.editor.setPosition(newPosition);
        this.editor.focus();
    }

    /**
     * 在行号（gutter）区域按住鼠标拖动选择时，允许鼠标滚轮滚动编辑器
     * @private
     */
    #setupGutterWheelScroll() {
        const domNode = this.editor.getDomNode();
        if (!domNode) return;

        const handler = (e) => {
            if (!e.target?.closest('.margin')) return;

            // 根据 deltaMode 将 delta 换算为像素
            // DOM_DELTA_PIXEL=0 已是像素；DOM_DELTA_LINE=1 乘行高；DOM_DELTA_PAGE=2 乘视口高
            let multiplier = 1;
            if (e.deltaMode === 1) {
                multiplier = this.editor.getOption(monaco.editor.EditorOption.lineHeight);
            } else if (e.deltaMode === 2) {
                multiplier = this.editor.getLayoutInfo().height;
            }

            if (e.deltaY) this.editor.setScrollTop(this.editor.getScrollTop() + e.deltaY * multiplier);
            if (e.deltaX) this.editor.setScrollLeft(this.editor.getScrollLeft() + e.deltaX * multiplier);
        };

        domNode.addEventListener('wheel', handler, { passive: true });
        this.disposables.push({ dispose: () => domNode.removeEventListener('wheel', handler) });
    }

    /**
     * 注册 Markdown 语言
     * @private
     */
    registerMarkdownLanguage() {
        if (MonacoEditor.#markdownRegistered) return;
        MonacoEditor.#markdownRegistered = true;

        // Monaco Editor 内置支持 Markdown
        // 这里可以添加自定义的语言配置
        //
        // 修复：覆盖内置 Monarch tokenizer 中的 codeblockgh 状态。
        // 原始规则的 fallback 为 /[^`]+/，只消耗到第一个反引号，导致
        // tokenizer 推进到行内 ``` 位置（如 rustdoc 的 `/// ```）后
        // 误将其识别为围栏结束，使后续语法高亮失效。
        // 修复方法：将 fallback 改为 /.*$/ 以一次性消耗整行，
        // 使闭合围栏检测规则永远只在行首被尝试。
        monaco.languages.setMonarchTokensProvider('markdown', {
            defaultToken: '',
            tokenPostfix: '.md',
            control: /[\\`*_[\]{}()#+.!-]/,
            noncontrol: /[^\\`*_[\]{}()#+.!-]/,
            escapes: /\\(?:@control)/,
            jsescapes: /\\(?:[btnfr\\"']|[0-7][0-7]?|[0-3][0-7]{2})/,
            empty: ['area', 'base', 'basefont', 'br', 'col', 'frame', 'hr', 'img', 'input',
                'isindex', 'link', 'meta', 'param'],
            tokenizer: {
                root: [
                    [/^\s*\|/, '@rematch', '@table_header'],
                    [/^(\s{0,3})(#+)((?:[^\\#]|@escapes)+)((?:#+)?)/, ['white', 'keyword', 'keyword', 'keyword']],
                    [/^\s*(=+|-+)\s*$/, 'keyword'],
                    [/^\s*([*][ ]?)+\s*$/, 'meta.separator'],
                    [/^\s*>+/, 'comment'],
                    [/^\s*([*\-+:]|\d+\.)\s/, 'keyword'],
                    [/^(\t|[ ]{4})[^ ].*$/, 'string'],
                    [/^\s*~~~\s*((?:\w|[/#-])+)?\s*$/, { token: 'string', next: '@codeblock' }],
                    [/^\s*```\s*((?:\w|[/#-])+).*$/, { token: 'string', next: '@codeblockgh', nextEmbedded: '$1' }],
                    [/^\s*```\s*$/, { token: 'string', next: '@codeblock' }],
                    { include: '@linecontent' }
                ],
                table_header: [
                    { include: '@table_common' },
                    [/[^|]+/, 'keyword.table.header']
                ],
                table_body: [{ include: '@table_common' }, { include: '@linecontent' }],
                table_common: [
                    [/\s*[-:]+\s*/, { token: 'keyword', switchTo: 'table_body' }],
                    [/^\s*\|/, 'keyword.table.left'],
                    [/^\s*[^|]/, '@rematch', '@pop'],
                    [/^\s*$/, '@rematch', '@pop'],
                    [/\|/, { cases: { '@eos': 'keyword.table.right', '@default': 'keyword.table.middle' } }]
                ],
                codeblock: [
                    [/^\s*~~~\s*$/, { token: 'string', next: '@pop' }],
                    [/^\s*```\s*$/, { token: 'string', next: '@pop' }],
                    [/.*$/, 'variable.source']
                ],
                // 修复：原始 codeblockgh 使用 /[^`]+/ 作为 fallback，会在遇到
                // 行内 ``` 时停下（如 `/// ``` `），让闭合围栏规则在行中间匹配。
                // 改为 /.*$/ 一次性消耗整行，确保闭合围栏规则只在行首生效。
                codeblockgh: [
                    [/^\s*```\s*$/, { token: 'string', next: '@pop', nextEmbedded: '@pop' }],
                    [/.*$/, 'variable.source']
                ],
                linecontent: [
                    [/&\w+;/, 'string.escape'],
                    [/@escapes/, 'escape'],
                    [/\b__([^\\_]|@escapes|_(?!_))+__\b/, 'strong'],
                    [/\*\*([^\\*]|@escapes|\*(?!\*))+\*\*/, 'strong'],
                    [/\b_[^_]+_\b/, 'emphasis'],
                    [/\*([^\\*]|@escapes)+\*/, 'emphasis'],
                    [/`([^\\`]|@escapes)+`/, 'variable'],
                    [/\{+[^}]+\}+/, 'string.target'],
                    [/(!?\[)((?:[^\]\\]|@escapes)*)(]\([^)]+\))/, ['string.link', '', 'string.link']],
                    [/(!?\[)((?:[^\]\\]|@escapes)*)(])/, 'string.link'],
                    { include: 'html' }
                ],
                html: [
                    [/<(\w+)\/>/, 'tag'],
                    [/<(\w+)(-|\w)*/, {
                        cases: {
                            '@empty': { token: 'tag', next: '@tag.$1' },
                            '@default': { token: 'tag', next: '@tag.$1' }
                        }
                    }],
                    [/<\/(\w+)(-|\w)*\s*>/, { token: 'tag' }],
                    [/<!--/, 'comment', '@comment']
                ],
                comment: [
                    [/[^<-]+/, 'comment.content'],
                    [/-->/, 'comment', '@pop'],
                    [/<!--/, 'comment.content.invalid'],
                    [/[<-]/, 'comment.content']
                ],
                tag: [
                    [/[ \t\r\n]+/, 'white'],
                    [/(type)(\s*=\s*)(")([^"]+)(")/, ['attribute.name.html', 'delimiter.html', 'string.html',
                        { token: 'string.html', switchTo: '@tag.$S2.$4' }, 'string.html']],
                    [/(type)(\s*=\s*)(')([^']+)(')/, ['attribute.name.html', 'delimiter.html', 'string.html',
                        { token: 'string.html', switchTo: '@tag.$S2.$4' }, 'string.html']],
                    [/(\w+)(\s*=\s*)("[^"]*"|'[^']*')/, ['attribute.name.html', 'delimiter.html', 'string.html']],
                    [/\w+/, 'attribute.name.html'],
                    [/\/>/, 'tag', '@pop'],
                    [/>/, {
                        cases: {
                            '$S2==style': { token: 'tag', switchTo: 'embeddedStyle', nextEmbedded: 'text/css' },
                            '$S2==script': {
                                cases: {
                                    $S3: { token: 'tag', switchTo: 'embeddedScript', nextEmbedded: '$S3' },
                                    '@default': { token: 'tag', switchTo: 'embeddedScript', nextEmbedded: 'text/javascript' }
                                }
                            },
                            '@default': { token: 'tag', next: '@pop' }
                        }
                    }]
                ],
                embeddedStyle: [
                    [/[^<]+/, ''],
                    [/<\/style\s*>/, { token: '@rematch', next: '@pop', nextEmbedded: '@pop' }],
                    [/</, '']
                ],
                embeddedScript: [
                    [/[^<]+/, ''],
                    [/<\/script\s*>/, { token: '@rematch', next: '@pop', nextEmbedded: '@pop' }],
                    [/</, '']
                ]
            }
        });

        monaco.languages.setLanguageConfiguration('markdown', {
            comments: {
                lineComment: '//',
                blockComment: ['<!--', '-->']
            },
            brackets: [
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

        // 注册 DocumentSymbolProvider，为 stickyScroll 的 outlineModel 提供标题符号
        this.registerMarkdownSymbolProvider();
    }

    /**
     * 注册 Markdown DocumentSymbolProvider
     * stickyScroll 的 outlineModel 依赖此 provider 获取各级标题符号。
     * Monaco standalone 对 Markdown 没有内置的符号提供者，故手动注册。
     * @private
     */
    registerMarkdownSymbolProvider() {
        monaco.languages.registerDocumentSymbolProvider('markdown', {
            provideDocumentSymbols(model) {
                const { headings, lines, n } = _parseMarkdownModel(model);
                if (headings.length === 0) return [];

                const roots = [];
                // 单遍栈算法 O(n)：每个标题入栈一次、出栈一次
                // 出栈时才确定 range.end（即下一个同级/更高级标题前一行）
                const stack = []; // { sym, level }[]

                for (const h of headings) {
                    // 关闭所有同级或更深的标题
                    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
                        const { sym } = stack.pop();
                        const endLine = h.lineIdx; // 1-based：当前标题行的前一行
                        sym.range.endLineNumber = endLine;
                        sym.range.endColumn = lines[endLine - 1].length + 1;
                    }

                    const sym = {
                        name: h.text,
                        detail: '',
                        kind: monaco.languages.SymbolKind.String,
                        tags: [],
                        range: {
                            startLineNumber: h.lineIdx + 1,
                            startColumn: 1,
                            endLineNumber: n,               // 暂定文档末尾，出栈时覆盖
                            endColumn: lines[n - 1].length + 1
                        },
                        selectionRange: {
                            startLineNumber: h.lineIdx + 1,
                            startColumn: 1,
                            endLineNumber: h.lineIdx + 1,
                            endColumn: lines[h.lineIdx].length + 1
                        },
                        children: []
                    };

                    const parent = stack.length > 0 ? stack[stack.length - 1].sym.children : roots;
                    parent.push(sym);
                    stack.push({ sym, level: h.level });
                }
                // 剩余条目自然延伸到文档末尾，endLineNumber 已在初始化时设为 n

                return roots;
            }
        });
    }

    /**
     * 注册 Markdown 标题折叠范围提供程序
     * 支持 # 到 ###### 的标题折叠，以及围栏代码块折叠
     * @private
     */
    registerMarkdownFoldingProvider() {
        const { FoldingRangeKind } = monaco.languages;

        monaco.languages.registerFoldingRangeProvider('markdown', {
            provideFoldingRanges(model) {
                const { headings, fenceRanges, n } = _parseMarkdownModel(model);

                // 围栏代码块直接映射
                const ranges = fenceRanges.map(f => ({
                    start: f.start, end: f.end, kind: FoldingRangeKind.Region
                }));

                // 标题折叠：单遍栈算法，stack = [startLine1, level1, ...]
                const stack = [];
                let stackLen = 0;

                for (const { lineIdx, level } of headings) {
                    const lineNo = lineIdx + 1; // 1-based
                    while (stackLen > 0 && stack[stackLen - 1] >= level) {
                        const startLine = stack[stackLen - 2];
                        stackLen -= 2;
                        if (lineNo - 1 >= startLine) {
                            ranges.push({ start: startLine, end: lineNo - 1, kind: FoldingRangeKind.Region });
                        }
                    }
                    stack[stackLen++] = lineNo;
                    stack[stackLen++] = level;
                }

                for (let j = 0; j < stackLen; j += 2) {
                    if (n >= stack[j]) {
                        ranges.push({ start: stack[j], end: n, kind: FoldingRangeKind.Region });
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
        // 清理粘贴事件监听器
        if (this.pasteHandler) {
            document.removeEventListener('paste', this.pasteHandler, true);
            this.pasteHandler = null;
        }

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
        if (monacoConfig.stickyScroll !== undefined) {
            options.stickyScroll = { enabled: monacoConfig.stickyScroll };
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

        if (options.emitUpdate !== true) {
            this._suppressOnChange = true;
            try {
                this.editor.setValue(value);
            } finally {
                this._suppressOnChange = false;
            }
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
        if (!this.editor || typeof callback !== 'function') return () => { };

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
