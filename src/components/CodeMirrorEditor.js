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
import { bracketMatching, indentUnit, syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';


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
                lineNumbers(),
                highlightActiveLineGutter(),
                history(),
                drawSelection(),
                rectangularSelection(),
                highlightActiveLine(),
                bracketMatching(),
                syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
                markdown({
                    codeLanguages: languages
                }),
                EditorView.lineWrapping,
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
                    indentWithTab,
                    
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

    createThemeExtension(editorConfig, isDark) {
        const fontSize = editorConfig.fontSize ?? 14;
        const lineHeight = editorConfig.lineHeight ?? 1.6;

        return EditorView.theme(
            {
                '&': {
                    height: '100%',
                    backgroundColor: 'var(--md-bg-secondary)',
                    color: 'var(--md-text-primary)',
                    fontSize: `${fontSize}px`
                },
                '.cm-scroller': {
                    fontFamily:
                        "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
                    lineHeight: String(lineHeight)
                },
                '.cm-content': {
                    padding: '16px'
                },
                '.cm-gutters': {
                    backgroundColor: 'var(--md-bg-tertiary)',
                    color: 'var(--md-text-secondary)',
                    borderRight: '1px solid var(--md-border-secondary)'
                },
                '.cm-activeLineGutter': {
                    backgroundColor: 'var(--md-bg-active)'
                },
                '.cm-selectionBackground': {
                    backgroundColor: 'var(--md-selection-bg)'
                },
                '.cm-cursor': {
                    borderLeftColor: 'var(--md-text-primary)'
                },
                '.cm-placeholder': {
                    color: 'var(--md-placeholder-color)'
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
                this.themeCompartment.reconfigure(this.createThemeExtension(editorConfig, isDark))
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
