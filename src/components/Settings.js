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

        // 应用已保存的设置
        this.applySettings();
    }

    /**
     * 缓存 DOM 元素，避免重复查询
     */
    cacheElements() {
        this.cachedElements = {
            // 编辑器设置
            editorTypeSelect: dom.get('#setting-editor-type'),
            fontSizeInput: dom.get('#setting-font-size'),
            lineHeightInput: dom.get('#setting-line-height'),
            autoSaveInput: dom.get('#setting-auto-save'),
            insertSpacesInput: dom.get('#setting-insert-spaces'),
            tabSizeInput: dom.get('#setting-tab-size'),
            lineNumbersInput: dom.get('#setting-line-numbers'),
            lineWrappingInput: dom.get('#setting-line-wrapping'),
            highlightActiveLineInput: dom.get('#setting-highlight-active-line'),
            bracketMatchingInput: dom.get('#setting-bracket-matching'),
            highlightGutterInput: dom.get('#setting-highlight-gutter'),

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
            pdfSizeSelect: dom.get('#setting-pdf-size'),
            pdfMarginSelect: dom.get('#setting-pdf-margin'),
            pdfHeaderLeftInput: dom.get('#setting-pdf-header-left'),
            pdfHeaderCenterInput: dom.get('#setting-pdf-header-center'),
            pdfHeaderRightInput: dom.get('#setting-pdf-header-right'),
            pdfFooterLeftInput: dom.get('#setting-pdf-footer-left'),
            pdfFooterCenterInput: dom.get('#setting-pdf-footer-center'),
            pdfFooterRightInput: dom.get('#setting-pdf-footer-right'),

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
            this.overlay.addEventListener('click', (e) => {
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
            this.cachedElements.leftRatioInput.addEventListener('input', (e) => {
                if (this.cachedElements?.ratioValue) {
                    this.cachedElements.ratioValue.textContent = `${e.target.value}%`;
                }
            });
        }

        // 主题选择器实时预览
        if (this.cachedElements?.themeSelect) {
            this.cachedElements.themeSelect.addEventListener('change', (e) => {
                this.applyTheme(e.target.value);
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
        const interfaceState = this.state.get('interface') || {};
        const exportConfig = this.state.get('export') || {};

        // 编辑器设置
        this.#setInputValue(this.cachedElements.editorTypeSelect, editor.type, 'codemirror');
        this.#setInputValue(this.cachedElements.fontSizeInput, editor.fontSize, null);
        this.#setInputValue(this.cachedElements.lineHeightInput, editor.lineHeight, 1.6);
        this.#setInputChecked(this.cachedElements.autoSaveInput, editor.autoSave, true);
        this.#setInputChecked(this.cachedElements.insertSpacesInput, editor.insertSpaces, true);
        this.#setInputValue(this.cachedElements.tabSizeInput, editor.tabSize, 4);
        this.#setInputChecked(this.cachedElements.lineNumbersInput, editor.lineNumbers, true);
        this.#setInputChecked(this.cachedElements.lineWrappingInput, editor.lineWrapping, true);
        this.#setInputChecked(this.cachedElements.highlightActiveLineInput, editor.highlightActiveLine, true);
        this.#setInputChecked(this.cachedElements.bracketMatchingInput, editor.bracketMatching, true);
        this.#setInputChecked(this.cachedElements.highlightGutterInput, editor.highlightGutter, true);

        // 界面配置
        this.#setInputValue(this.cachedElements.themeSelect, interfaceState.theme, 'auto');

        const leftRatioPercent = Math.round((interfaceState.leftRatio ?? 0.5) * 100);
        this.#setInputValue(this.cachedElements.layoutSelect, interfaceState.layout, 'layout-both');
        this.#setInputValue(this.cachedElements.leftRatioInput, leftRatioPercent);
        if (this.cachedElements.ratioValue) {
            this.cachedElements.ratioValue.textContent = `${leftRatioPercent}%`;
        }
        this.#setInputChecked(this.cachedElements.leftSidebarInput, interfaceState.leftSidebarOpen, false);
        this.#setInputChecked(this.cachedElements.rightSidebarInput, interfaceState.rightSidebarOpen, false);
        this.#setInputChecked(this.cachedElements.syncScrollEnabledInput, interfaceState.syncScrollEnabled, true);

        // 导出配置
        this.#setInputChecked(this.cachedElements.exportStyleInput, exportConfig.includeStyle, true);
        this.#setInputChecked(this.cachedElements.exportHighlightInput, exportConfig.codeHighlight, true);
        this.#setInputValue(this.cachedElements.pdfSizeSelect, exportConfig.pdfSize, 'A4');
        this.#setInputValue(this.cachedElements.pdfMarginSelect, exportConfig.pdfMargin, 'default');
        // 页眉配置
        this.#setInputValue(this.cachedElements.pdfHeaderLeftInput, exportConfig.pdfHeaderLeft, '');
        this.#setInputValue(this.cachedElements.pdfHeaderCenterInput, exportConfig.pdfHeaderCenter, '{title}');
        this.#setInputValue(this.cachedElements.pdfHeaderRightInput, exportConfig.pdfHeaderRight, '');
        // 页脚配置
        this.#setInputValue(this.cachedElements.pdfFooterLeftInput, exportConfig.pdfFooterLeft, '');
        this.#setInputValue(this.cachedElements.pdfFooterCenterInput, exportConfig.pdfFooterCenter, '');
        this.#setInputValue(this.cachedElements.pdfFooterRightInput, exportConfig.pdfFooterRight, '{page} / {pages}');
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
        // 读取编辑器配置 - 使用缓存的元素
        const fontSizeValue = this.cachedElements.fontSizeInput?.value;
        const fontSize = fontSizeValue ? parseInt(fontSizeValue) : null;

        const editorConfig = {
            type: this.cachedElements.editorTypeSelect?.value || 'codemirror',
            fontSize,
            lineHeight: parseFloat(this.cachedElements.lineHeightInput?.value) || 1.6,
            autoSave: this.cachedElements.autoSaveInput?.checked || false,
            insertSpaces: this.cachedElements.insertSpacesInput?.checked ?? true,
            tabSize: parseInt(this.cachedElements.tabSizeInput?.value) || 4,
            lineNumbers: this.cachedElements.lineNumbersInput?.checked ?? true,
            lineWrapping: this.cachedElements.lineWrappingInput?.checked ?? true,
            highlightActiveLine: this.cachedElements.highlightActiveLineInput?.checked ?? true,
            bracketMatching: this.cachedElements.bracketMatchingInput?.checked ?? true,
            highlightGutter: this.cachedElements.highlightGutterInput?.checked ?? true
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
            codeHighlight: this.cachedElements.exportHighlightInput?.checked || false,
            pdfSize: this.cachedElements.pdfSizeSelect?.value || 'A4',
            pdfMargin: this.cachedElements.pdfMarginSelect?.value || 'default',
            // 页眉配置
            pdfHeaderLeft: this.cachedElements.pdfHeaderLeftInput?.value || '',
            pdfHeaderCenter: this.cachedElements.pdfHeaderCenterInput?.value || '',
            pdfHeaderRight: this.cachedElements.pdfHeaderRightInput?.value || '',
            // 页脚配置
            pdfFooterLeft: this.cachedElements.pdfFooterLeftInput?.value || '',
            pdfFooterCenter: this.cachedElements.pdfFooterCenterInput?.value || '',
            pdfFooterRight: this.cachedElements.pdfFooterRightInput?.value || ''
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
        const isDark = theme === 'dark' ||
            (theme === 'auto' && this.colorSchemeMatcher?.matches);

        // 应用主题到 HTML
        html.setAttribute('data-mode', isDark ? 'dark' : 'light');

        // 更新主题颜色
        const themeColorMeta = document.querySelector('meta[name="theme-color"]');
        if (themeColorMeta) {
            themeColorMeta.content = isDark ? '#1e1e1e' : '#f0f0f0';
        }
    }
}
