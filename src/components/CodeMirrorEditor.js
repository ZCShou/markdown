import { EditorState, Compartment, Annotation } from '@codemirror/state';
import {
    EditorView,
    keymap,
    lineNumbers,
    highlightActiveLineGutter,
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

// 自定义语法高亮样式，使用 CSS 变量
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


const externalUpdate = Annotation.define();

export class CodeMirrorEditor {
    static active = null;

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

    static getActive() {
        return CodeMirrorEditor.active;
    }

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
                keymap.of([
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
                ]),
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

    destroy() {
        if (this.view) {
            this.view.destroy();
            this.view = null;
        }

        if (CodeMirrorEditor.active === this) {
            CodeMirrorEditor.active = null;
        }
    }

    createIndentExtension(editorConfig) {
        const { insertSpaces = true, tabSize = 4 } = editorConfig || {};
        const unit = insertSpaces ? ' '.repeat(tabSize) : '\t';
        return indentUnit.of(unit);
    }

    createLineNumbersExtension(editorConfig) {
        if (editorConfig?.lineNumbers === false) return [];
        
        return lineNumbers({
            domEventHandlers: {
                mousedown: (view, line, event) => {
                    event.preventDefault();
                    
                    // 选中整行（不包含换行符，仅内容）
                    view.dispatch({
                        selection: { anchor: line.from, head: line.to }
                    });
                    
                    view.focus();
                    return true;
                }
            }
        });
    }

    createLineWrappingExtension(editorConfig) {
        return editorConfig?.lineWrapping !== false ? EditorView.lineWrapping : [];
    }

    createHighlightActiveLineExtension(editorConfig) {
        return editorConfig?.highlightActiveLine !== false ? highlightActiveLine() : [];
    }

    createBracketMatchingExtension(editorConfig) {
        return editorConfig?.bracketMatching !== false ? bracketMatching() : [];
    }

    createHighlightGutterExtension(editorConfig) {
        return editorConfig?.highlightGutter !== false ? highlightActiveLineGutter() : [];
    }

    createThemeExtension(editorConfig, isDark) {
        const fontSize = editorConfig.fontSize ?? 16;
        const lineHeight = editorConfig.lineHeight ?? 1.6;

        // 只保留需要动态配置的样式（字号、行高）
        // 其他样式通过 CSS 实现，保持与 markdown.css 一致
        return EditorView.theme(
            {
                '&': {
                    fontSize: `${fontSize}px`
                },
                '.cm-scroller': {
                    lineHeight: String(lineHeight)
                }
            },
            { dark: isDark }
        );
    }

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

    resolveDarkMode(interfaceConfig = {}) {
        if (interfaceConfig.theme === 'dark') return true;
        if (interfaceConfig.theme === 'light') return false;

        const currentMode = document.documentElement.getAttribute('data-mode');
        return currentMode === 'dark';
    }

    setValue(value, options = {}) {
        if (!this.view) return;
        const current = this.getValue();
        if (current === value) return;

        const annotations = [];
        const emitUpdate = options.emitUpdate === true;
        if (!emitUpdate) {
            annotations.push(externalUpdate.of(true));
        }

        this.view.dispatch({
            changes: { from: 0, to: this.view.state.doc.length, insert: value },
            annotations
        });
    }

    getValue() {
        return this.view ? this.view.state.doc.toString() : '';
    }

    focus() {
        this.view?.focus();
    }

    getSelectionRange() {
        if (!this.view) return { start: 0, end: 0 };
        const selection = this.view.state.selection.main;
        return { start: selection.from, end: selection.to };
    }

    setSelectionRange(start, end, options = {}) {
        if (!this.view) return;

        const effects = [];
        if (options.scroll) {
            effects.push(EditorView.scrollIntoView(start, { y: 'center' }));
        }

        this.view.dispatch({
            selection: { anchor: start, head: end },
            effects
        });

        if (options.focus) {
            this.focus();
        }
    }

    replaceRange(from, to, text) {
        if (!this.view) return;

        const selectionEnd = from + text.length;
        this.view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: selectionEnd, head: selectionEnd }
        });
    }

    getScrollElement() {
        return this.view?.scrollDOM || null;
    }
}
