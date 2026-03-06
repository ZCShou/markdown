/**
 * 设置对话框组件
 *
 * @component Dialog
 * @description 临时性对话框组件，用于编辑器设置
 *
 * 与持久化组件的区别：
 * - 持久化组件（Editor, Preview 等）：继承 BaseComponent，长期存在，订阅状态变化
 * - 对话框组件（Settings）：独立类，临时显示，按需打开/关闭，不订阅状态变化
 *
 * @example
 * ```js
 * const settings = new Settings(state);
 * settings.init();
 * settings.open();  // 打开对话框
 * settings.close(); // 关闭对话框
 * ```
 *
 * @architecture
 * - 不继承 BaseComponent（对话框不需要状态订阅和生命周期管理）
 * - 直接使用 state 对象进行状态读写
 * - 使用 DOM 缓存优化性能
 *
 * @see BaseComponent 持久化组件基类
 */
import { dom } from '../utils/dom.js';
import { EditorState } from '../EditorState.js';
import { Dialog } from './Dialog.js';
import { version } from '../../package.json';

export class Settings {
    /**
     * @param {Object} state - 编辑器状态对象
     */
    constructor(state) {
        this.state = state;
        this.overlay = null;
        this.dialog = null;
        this.currentSection = 'interface';

        // DOM 元素缓存
        this.cachedElements = null;
        // 导航项缓存
        this.navItems = null;
        // 设置区域缓存
        this.sectionElements = null;

        // 系统主题变化监听器（用于清理）
        this.colorSchemeMatcher = null;
        this.themeChangeHandler = null;
    }

    /**
     * 初始化设置组件
     */
    init() {
        // 获取 DOM 元素
        this.overlay = dom.get('#md-settings-overlay');
        this.dialog = dom.get('.md-settings-dialog');

        // 缓存 DOM 元素
        this.cacheElements();

        // 缓存导航项和设置区域
        this.navItems = dom.getAll('.md-settings-nav-item');
        this.sectionElements = dom.getAll('.md-settings-section');

        // 绑定事件
        this.bindEvents();

        // 监听系统主题变化
        this.watchSystemTheme();

        // 设置版本号
        const versionEl = dom.get('#md-settings-about-version');
        if (versionEl) versionEl.textContent = `版本 ${version}`;

        // 应用已保存的设置
        this.applySettings();
    }

    /**
     * 缓存 DOM 元素，避免重复查询
     */
    cacheElements() {
        this.cachedElements = {
            // 通用编辑器设置
            editorTypeSelect: dom.get('#setting-editor-type'),
            fontSizeInput: dom.get('#setting-font-size'),
            lineHeightInput: dom.get('#setting-line-height'),
            autoSaveInput: dom.get('#setting-auto-save'),
            insertSpacesInput: dom.get('#setting-insert-spaces'),
            tabSizeInput: dom.get('#setting-tab-size'),
            wordWrapInput: dom.get('#setting-word-wrap'),
            highlightActiveLineInput: dom.get('#setting-highlight-active-line'),

            // CodeMirror 设置
            cmLineNumbersInput: dom.get('#setting-cm-line-numbers'),
            cmBracketMatchingInput: dom.get('#setting-cm-bracket-matching'),
            cmRenderWhitespaceInput: dom.get('#setting-cm-render-whitespace'),

            // Monaco 设置
            monacoMinimapInput: dom.get('#setting-monaco-minimap'),
            monacoBracketPairColorizationInput: dom.get(
                '#setting-monaco-bracket-pair-colorization'
            ),
            monacoCursorBlinkingSelect: dom.get('#setting-monaco-cursor-blinking'),
            monacoSmoothScrollingInput: dom.get('#setting-monaco-smooth-scrolling'),
            monacoRenderWhitespaceSelect: dom.get('#setting-monaco-render-whitespace'),

            // 设置组（用于动态显示/隐藏）
            codemirrorGroup: dom.get('#settings-codemirror-group'),
            monacoGroup: dom.get('#settings-monaco-group'),

            // 界面设置
            themeSelect: dom.get('#setting-theme'),
            layoutSelect: dom.get('#setting-layout'),
            leftRatioInput: dom.get('#setting-left-ratio'),
            ratioValue: dom.get('#setting-left-ratio-value'),
            leftSidebarInput: dom.get('#setting-left-sidebar-open'),
            rightSidebarInput: dom.get('#setting-right-sidebar-open'),
            syncScrollEnabledInput: dom.get('#setting-sync-scroll-enabled'),

            // 导出设置
            exportStyleInput: dom.get('#setting-export-include-style'),
            exportHighlightInput: dom.get('#setting-export-code-highlight'),

            // 编辑器元素（用于字体设置）
            editorElement: dom.get('#markdown-editor')
        };
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 关闭按钮
        const closeBtn = dom.get('#md-settings-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }

        // 点击遮罩层关闭
        if (this.overlay) {
            this.overlay.addEventListener('click', e => {
                if (e.target === this.overlay) {
                    this.close();
                }
            });
        }

        // 导航项点击 - 使用缓存的元素
        this.navItems?.forEach(item => {
            item.addEventListener('click', () => {
                const { section } = item.dataset;
                this.switchSection(section);
            });
        });

        // 保存按钮
        const saveBtn = dom.get('#md-settings-save');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => this.saveSettings());
        }

        // 重置按钮
        const resetBtn = dom.get('#md-settings-reset');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetSettings());
        }

        // 布局比例滑块实时显示 - 使用缓存的元素
        if (this.cachedElements?.leftRatioInput) {
            this.cachedElements.leftRatioInput.addEventListener('input', e => {
                if (this.cachedElements?.ratioValue) {
                    this.cachedElements.ratioValue.textContent = `${e.target.value}%`;
                }
            });
        }

        // 主题选择器实时预览
        if (this.cachedElements?.themeSelect) {
            this.cachedElements.themeSelect.addEventListener('change', e => {
                this.applyTheme(e.target.value);
            });
        }

        // 编辑器类型切换 - 动态显示/隐藏对应的设置组
        if (this.cachedElements?.editorTypeSelect) {
            this.cachedElements.editorTypeSelect.addEventListener('change', e => {
                this.updateEditorSpecificSettings(e.target.value);
            });
        }
    }

    /**
     * 清理事件监听器
     */
    cleanup() {
        // 移除系统主题监听器
        if (this.colorSchemeMatcher && this.themeChangeHandler) {
            this.colorSchemeMatcher.removeEventListener('change', this.themeChangeHandler);
            this.colorSchemeMatcher = null;
            this.themeChangeHandler = null;
        }
    }

    /**
     * 打开设置对话框
     */
    open() {
        this.overlay?.classList.add('show');
        this.loadStateToUI();
    }

    /**
     * 关闭设置对话框
     */
    close() {
        this.overlay?.classList.remove('show');
    }

    /**
     * 切换设置区域
     * @param {string} section - 区域名称
     */
    switchSection(section) {
        // 更新导航项状态 - 使用缓存的元素
        this.navItems?.forEach(item => {
            item.classList.toggle('active', item.dataset.section === section);
        });

        // 更新内容区域显示 - 使用缓存的元素
        this.sectionElements?.forEach(sec => {
            sec.classList.toggle('active', sec.id === `settings-${section}`);
        });

        this.currentSection = section;
    }

    /**
     * 从 state 加载配置到 UI
     */
    loadStateToUI() {
        if (!this.cachedElements) return;

        const editor = this.state.get('editor') || {};
        const codemirror = editor.codemirror || {};
        const monaco = editor.monaco || {};
        const interfaceState = this.state.get('interface') || {};
        const exportConfig = this.state.get('export') || {};

        // 通用编辑器设置
        this.#setInputValue(this.cachedElements.editorTypeSelect, editor.type, 'monaco');
        this.#setInputValue(this.cachedElements.fontSizeInput, editor.fontSize, null);
        this.#setInputValue(this.cachedElements.lineHeightInput, editor.lineHeight, 1.6);
        this.#setInputChecked(this.cachedElements.autoSaveInput, editor.autoSave, true);
        this.#setInputChecked(this.cachedElements.insertSpacesInput, editor.insertSpaces, true);
        this.#setInputValue(this.cachedElements.tabSizeInput, editor.tabSize, 4);
        this.#setInputChecked(this.cachedElements.wordWrapInput, editor.wordWrap, true);
        this.#setInputChecked(
            this.cachedElements.highlightActiveLineInput,
            editor.highlightActiveLine,
            true
        );

        // CodeMirror 设置
        this.#setInputChecked(this.cachedElements.cmLineNumbersInput, codemirror.lineNumbers, true);
        this.#setInputChecked(
            this.cachedElements.cmBracketMatchingInput,
            codemirror.bracketMatching,
            true
        );
        this.#setInputChecked(
            this.cachedElements.cmRenderWhitespaceInput,
            codemirror.renderWhitespace,
            false
        );

        // Monaco 设置
        this.#setInputChecked(this.cachedElements.monacoMinimapInput, monaco.minimap, true);
        this.#setInputChecked(
            this.cachedElements.monacoBracketPairColorizationInput,
            monaco.bracketPairColorization,
            true
        );
        this.#setInputValue(
            this.cachedElements.monacoCursorBlinkingSelect,
            monaco.cursorBlinking,
            'smooth'
        );
        this.#setInputChecked(
            this.cachedElements.monacoSmoothScrollingInput,
            monaco.smoothScrolling,
            true
        );
        this.#setInputValue(
            this.cachedElements.monacoRenderWhitespaceSelect,
            monaco.renderWhitespace,
            'selection'
        );

        // 根据编辑器类型显示/隐藏对应的设置组
        this.updateEditorSpecificSettings(editor.type || 'monaco');

        // 界面配置
        this.#setInputValue(this.cachedElements.themeSelect, interfaceState.theme, 'auto');

        const leftRatioPercent = Math.round((interfaceState.leftRatio ?? 0.5) * 100);
        this.#setInputValue(this.cachedElements.layoutSelect, interfaceState.layout, 'layout-both');
        this.#setInputValue(this.cachedElements.leftRatioInput, leftRatioPercent);
        if (this.cachedElements.ratioValue) {
            this.cachedElements.ratioValue.textContent = `${leftRatioPercent}%`;
        }
        this.#setInputChecked(
            this.cachedElements.leftSidebarInput,
            interfaceState.leftSidebarOpen,
            false
        );
        this.#setInputChecked(
            this.cachedElements.rightSidebarInput,
            interfaceState.rightSidebarOpen,
            false
        );
        this.#setInputChecked(
            this.cachedElements.syncScrollEnabledInput,
            interfaceState.syncScrollEnabled,
            true
        );

        // 导出配置
        this.#setInputChecked(
            this.cachedElements.exportStyleInput,
            exportConfig.includeStyle,
            true
        );
        this.#setInputChecked(
            this.cachedElements.exportHighlightInput,
            exportConfig.codeHighlight,
            true
        );
    }

    /**
     * 根据编辑器类型更新特定设置的显示状态
     * @param {string} editorType - 编辑器类型
     */
    updateEditorSpecificSettings(editorType) {
        if (this.cachedElements?.codemirrorGroup) {
            this.cachedElements.codemirrorGroup.style.display =
                editorType === 'codemirror' ? '' : 'none';
        }
        if (this.cachedElements?.monacoGroup) {
            this.cachedElements.monacoGroup.style.display = editorType === 'monaco' ? '' : 'none';
        }
    }

    /**
     * 设置输入框的值（辅助方法）
     * @private
     */
    #setInputValue(element, value, defaultValue) {
        if (element) {
            element.value = value ?? defaultValue;
        }
    }

    /**
     * 设置复选框的状态（辅助方法）
     * @private
     */
    #setInputChecked(element, value, defaultValue) {
        if (element) {
            element.checked = value ?? defaultValue;
        }
    }

    /**
     * 从 UI 读取设置并更新到 state
     */
    readSettingsFromUI() {
        // 读取通用编辑器配置 - 使用缓存的元素
        const fontSizeValue = this.cachedElements.fontSizeInput?.value;
        const fontSize = fontSizeValue ? parseInt(fontSizeValue) : null;

        const editorConfig = {
            type: this.cachedElements.editorTypeSelect?.value || 'monaco',
            fontSize,
            lineHeight: parseFloat(this.cachedElements.lineHeightInput?.value) || 1.6,
            autoSave: this.cachedElements.autoSaveInput?.checked || false,
            insertSpaces: this.cachedElements.insertSpacesInput?.checked ?? true,
            tabSize: parseInt(this.cachedElements.tabSizeInput?.value) || 4,
            wordWrap: this.cachedElements.wordWrapInput?.checked ?? true,
            highlightActiveLine: this.cachedElements.highlightActiveLineInput?.checked ?? true,

            // CodeMirror 特有设置
            codemirror: {
                lineNumbers: this.cachedElements.cmLineNumbersInput?.checked ?? true,
                bracketMatching: this.cachedElements.cmBracketMatchingInput?.checked ?? true,
                renderWhitespace: this.cachedElements.cmRenderWhitespaceInput?.checked ?? false
            },

            // Monaco 特有设置
            monaco: {
                minimap: this.cachedElements.monacoMinimapInput?.checked ?? true,
                bracketPairColorization:
                    this.cachedElements.monacoBracketPairColorizationInput?.checked ?? true,
                cursorBlinking: this.cachedElements.monacoCursorBlinkingSelect?.value || 'smooth',
                smoothScrolling: this.cachedElements.monacoSmoothScrollingInput?.checked ?? true,
                renderWhitespace:
                    this.cachedElements.monacoRenderWhitespaceSelect?.value || 'selection'
            }
        };

        // 读取界面配置
        const interfaceConfig = {
            theme: this.cachedElements.themeSelect?.value || 'auto',
            layout: this.cachedElements.layoutSelect?.value || 'layout-both',
            leftRatio: (parseInt(this.cachedElements.leftRatioInput?.value) || 50) / 100,
            leftSidebarOpen: this.cachedElements.leftSidebarInput?.checked || false,
            rightSidebarOpen: this.cachedElements.rightSidebarInput?.checked || false,
            syncScrollEnabled: this.cachedElements.syncScrollEnabledInput?.checked ?? true
        };

        // 读取导出配置
        const exportConfig = {
            includeStyle: this.cachedElements.exportStyleInput?.checked || false,
            codeHighlight: this.cachedElements.exportHighlightInput?.checked || false
        };

        return { editorConfig, interfaceConfig, exportConfig };
    }

    /**
     * 保存设置
     */
    saveSettings() {
        const { editorConfig, interfaceConfig, exportConfig } = this.readSettingsFromUI();

        // 更新到 state（唯一数据源）
        this.state.updateEditorConfig(editorConfig);
        this.state.updateInterfaceConfig(interfaceConfig);
        this.state.updateExportConfig(exportConfig);

        // 应用主题（其他设置由 state 订阅者自动处理）
        this.applyTheme(interfaceConfig.theme);

        // 显示保存成功提示
        this.state.showNotification('设置已保存', 'success');

        // 关闭对话框
        this.close();
    }

    /**
     * 重置设置为默认值
     */
    async resetSettings() {
        const confirmed = await Dialog.confirm('确定要重置所有设置为默认值吗？', {
            title: '重置设置',
            type: 'warning'
        });

        if (confirmed) {
            // 使用 state.js 中定义的默认设置
            const defaults = EditorState.DEFAULT_SETTINGS;

            // 重置编辑器配置
            this.state.updateEditorConfig(defaults.editor);

            // 重置界面配置
            this.state.updateInterfaceConfig(defaults.interface);

            // 重置导出配置
            this.state.updateExportConfig(defaults.export);

            this.loadStateToUI();
            this.state.showNotification('设置已重置', 'success');
        }
    }

    /**
     * 应用设置到编辑器（仅初始化时调用）
     */
    applySettings() {
        const editor = this.state.get('editor') || {};
        const interfaceState = this.state.get('interface') || {};

        // 应用字体大小
        if (this.cachedElements?.editorElement) {
            if (editor.fontSize !== null && editor.fontSize !== undefined) {
                this.cachedElements.editorElement.style.fontSize = `${editor.fontSize}px`;
            } else {
                this.cachedElements.editorElement.style.fontSize = '';
            }
            this.cachedElements.editorElement.style.lineHeight = editor.lineHeight ?? 1.6;
        }

        // 应用主题
        this.applyTheme(interfaceState.theme ?? 'auto');
    }

    /**
     * 监听系统主题变化
     */
    watchSystemTheme() {
        this.colorSchemeMatcher = window.matchMedia('(prefers-color-scheme: dark)');
        this.themeChangeHandler = () => {
            const interfaceState = this.state.get('interface');
            if (interfaceState?.theme === 'auto') {
                this.applyTheme('auto');
            }
        };
        this.colorSchemeMatcher.addEventListener('change', this.themeChangeHandler);
    }

    /**
     * 应用主题设置
     * @param {string} theme - 主题模式
     */
    applyTheme(theme) {
        const html = document.documentElement;

        // 确定实际主题模式
        const isDark = theme === 'dark' || (theme === 'auto' && this.colorSchemeMatcher?.matches);

        // 应用主题到 HTML
        html.setAttribute('data-mode', isDark ? 'dark' : 'light');

        // 更新主题颜色
        const themeColorMeta = document.querySelector('meta[name="theme-color"]');
        if (themeColorMeta) {
            themeColorMeta.content = isDark ? '#1e1e1e' : '#f0f0f0';
        }
    }
}
