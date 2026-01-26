/**
 * 设置对话框组件
 * 只负责 UI 交互，不存储状态
 * 所有状态由 state.js 管理
 */
import { dom } from '../utils/dom.js';

export class Settings {
    /**
     * @param {Object} state - 编辑器状态对象
     */
    constructor(state) {
        this.state = state;
        this.overlay = null;
        this.dialog = null;
        this.currentSection = 'basic';
        
        // DOM 元素缓存
        this.cachedElements = null;
        
        // ESC 键监听器缓存（用于清理）
        this.escapeHandler = null;
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

        // 绑定事件
        this.bindEvents();

        // 应用已保存的设置
        this.applySettings();
    }

    /**
     * 缓存 DOM 元素，避免重复查询
     */
    cacheElements() {
        this.cachedElements = {
            // 编辑器设置
            fontSizeInput: dom.get('#setting-font-size'),
            lineHeightInput: dom.get('#setting-line-height'),
            autoSaveInput: dom.get('#setting-auto-save'),
            
            // 界面设置
            themeSelect: dom.get('#setting-theme'),
            layoutSelect: dom.get('#setting-layout'),
            leftRatioInput: dom.get('#setting-left-ratio'),
            ratioValue: dom.get('#setting-left-ratio-value'),
            leftSidebarInput: dom.get('#setting-left-sidebar-open'),
            rightSidebarInput: dom.get('#setting-right-sidebar-open'),
            tocSectionInput: dom.get('#setting-section-toc'),
            exportSectionInput: dom.get('#setting-section-export'),
            
            // 导出设置
            exportStyleInput: dom.get('#setting-export-include-style'),
            exportHighlightInput: dom.get('#setting-export-code-highlight'),
            pdfSizeSelect: dom.get('#setting-pdf-size'),
            pdfMarginSelect: dom.get('#setting-pdf-margin'),
            
            // 应用元素
            editorElement: dom.get('#markdown-editor'),
            container: dom.get('.markdown-container'),
            leftSidebar: dom.get('.md-sidebar-left'),
            rightSidebar: dom.get('.md-sidebar-right'),
            editorSection: dom.get('.markdown-editor-pane'),
            previewSection: dom.get('.markdown-preview-pane'),
            tocSection: dom.get('.md-sidebar-section-toc'),
            exportSection: dom.get('.md-sidebar-section-export')
        };
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
        // 打开设置按钮
        const settingsBtn = dom.get('#md-settings-btn');
        if (settingsBtn) {
            settingsBtn.addEventListener('click', () => this.open());
        }

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

        // ESC 键关闭 - 缓存处理器以便后续清理
        this.escapeHandler = (e) => {
            if (e.key === 'Escape' && this.overlay?.classList.contains('show')) {
                this.close();
            }
        };
        document.addEventListener('keydown', this.escapeHandler);

        // 导航项点击
        const navItems = dom.getAll('.md-settings-nav-item');
        navItems.forEach(item => {
            item.addEventListener('click', () => {
                const section = item.dataset.section;
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
    }

    /**
     * 清理事件监听器
     */
    cleanup() {
        // 移除 ESC 键监听器
        if (this.escapeHandler) {
            document.removeEventListener('keydown', this.escapeHandler);
            this.escapeHandler = null;
        }
        
        // 取消状态订阅
        if (this.stateUnsubscribe) {
            this.stateUnsubscribe();
            this.stateUnsubscribe = null;
        }
    }

    /**
     * 打开设置对话框
     */
    open() {
        this.overlay?.classList.add('show');
        this.loadStateToUI();
        
        // 订阅状态变化，只在对话框打开时监听
        if (!this.stateUnsubscribe) {
            this.stateUnsubscribe = this.state.subscribe(() => {
                this.loadStateToUI();
            });
        }
    }

    /**
     * 关闭设置对话框
     */
    close() {
        this.overlay?.classList.remove('show');
        
        // 取消订阅，避免不必要的更新
        if (this.stateUnsubscribe) {
            this.stateUnsubscribe();
            this.stateUnsubscribe = null;
        }
    }

    /**
     * 切换设置区域
     * @param {string} section - 区域名称
     */
    switchSection(section) {
        // 更新导航项状态 - 只更新当前和新的活动项
        const navItems = dom.getAll('.md-settings-nav-item');
        navItems.forEach(item => {
            const isActive = item.dataset.section === section;
            item.classList.toggle('active', isActive);
        });

        // 更新内容区域显示 - 只更新当前和新的活动区域
        const sections = dom.getAll('.md-settings-section');
        sections.forEach(sec => {
            const isActive = sec.id === `settings-${section}`;
            sec.classList.toggle('active', isActive);
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

        // 编辑器设置 - 使用缓存的元素
        if (this.cachedElements.fontSizeInput) {
            this.cachedElements.fontSizeInput.value = editor.fontSize ?? 14;
        }
        if (this.cachedElements.lineHeightInput) {
            this.cachedElements.lineHeightInput.value = editor.lineHeight ?? 1.6;
        }
        if (this.cachedElements.autoSaveInput) {
            this.cachedElements.autoSaveInput.checked = editor.autoSave ?? true;
        }
        if (this.cachedElements.themeSelect) {
            this.cachedElements.themeSelect.value = interfaceState.theme ?? 'auto';
        }

        // 界面配置 - 避免重复计算
        const leftRatioPercent = Math.round((interfaceState.leftRatio ?? 0.5) * 100);
        
        if (this.cachedElements.layoutSelect) {
            this.cachedElements.layoutSelect.value = interfaceState.layout ?? 'layout-both';
        }
        if (this.cachedElements.leftRatioInput) {
            this.cachedElements.leftRatioInput.value = leftRatioPercent;
        }
        if (this.cachedElements.ratioValue) {
            this.cachedElements.ratioValue.textContent = `${leftRatioPercent}%`;
        }
        if (this.cachedElements.leftSidebarInput) {
            this.cachedElements.leftSidebarInput.checked = interfaceState.leftSidebarOpen ?? false;
        }
        if (this.cachedElements.rightSidebarInput) {
            this.cachedElements.rightSidebarInput.checked = interfaceState.rightSidebarOpen ?? false;
        }
        if (this.cachedElements.tocSectionInput) {
            this.cachedElements.tocSectionInput.checked = interfaceState.sections?.toc ?? true;
        }
        if (this.cachedElements.exportSectionInput) {
            this.cachedElements.exportSectionInput.checked = interfaceState.sections?.export ?? true;
        }

        // 导出配置
        if (this.cachedElements.exportStyleInput) {
            this.cachedElements.exportStyleInput.checked = exportConfig.includeStyle ?? true;
        }
        if (this.cachedElements.exportHighlightInput) {
            this.cachedElements.exportHighlightInput.checked = exportConfig.codeHighlight ?? true;
        }
        if (this.cachedElements.pdfSizeSelect) {
            this.cachedElements.pdfSizeSelect.value = exportConfig.pdfSize ?? 'A4';
        }
        if (this.cachedElements.pdfMarginSelect) {
            this.cachedElements.pdfMarginSelect.value = exportConfig.pdfMargin ?? 'default';
        }
    }

    /**
     * 从 UI 读取设置并更新到 state
     */
    readSettingsFromUI() {
        if (!this.cachedElements) {
            // 如果缓存未初始化，回退到直接查询
            return this.readSettingsFromUIFallback();
        }

        // 读取编辑器配置 - 使用缓存的元素
        const editorConfig = {
            fontSize: parseInt(this.cachedElements.fontSizeInput?.value) || 14,
            lineHeight: parseFloat(this.cachedElements.lineHeightInput?.value) || 1.6,
            autoSave: this.cachedElements.autoSaveInput?.checked || false
        };
        
        // 读取界面配置
        const interfaceConfig = {
            theme: this.cachedElements.themeSelect?.value || 'auto',
            layout: this.cachedElements.layoutSelect?.value || 'layout-both',
            leftRatio: (parseInt(this.cachedElements.leftRatioInput?.value) || 50) / 100,
            leftSidebarOpen: this.cachedElements.leftSidebarInput?.checked || false,
            rightSidebarOpen: this.cachedElements.rightSidebarInput?.checked || false,
            sections: {
                toc: this.cachedElements.tocSectionInput?.checked ?? true,
                export: this.cachedElements.exportSectionInput?.checked ?? true
            }
        };
        
        // 读取导出配置
        const exportConfig = {
            includeStyle: this.cachedElements.exportStyleInput?.checked || false,
            codeHighlight: this.cachedElements.exportHighlightInput?.checked || false,
            pdfSize: this.cachedElements.pdfSizeSelect?.value || 'A4',
            pdfMargin: this.cachedElements.pdfMarginSelect?.value || 'default'
        };

        return { editorConfig, interfaceConfig, exportConfig };
    }

    /**
     * 从 UI 读取设置的回退方法（当缓存未初始化时）
     */
    readSettingsFromUIFallback() {
        // 读取编辑器配置
        const editorConfig = {
            fontSize: parseInt(dom.get('#setting-font-size')?.value) || 14,
            lineHeight: parseFloat(dom.get('#setting-line-height')?.value) || 1.6,
            autoSave: dom.get('#setting-auto-save')?.checked || false
        };
        
        // 读取界面配置
        const interfaceConfig = {
            theme: dom.get('#setting-theme')?.value || 'auto',
            layout: dom.get('#setting-layout')?.value || 'layout-both',
            leftRatio: (parseInt(dom.get('#setting-left-ratio')?.value) || 50) / 100,
            leftSidebarOpen: dom.get('#setting-left-sidebar-open')?.checked || false,
            rightSidebarOpen: dom.get('#setting-right-sidebar-open')?.checked || false,
            sections: {
                toc: dom.get('#setting-section-toc')?.checked ?? true,
                export: dom.get('#setting-section-export')?.checked ?? true
            }
        };
        
        // 读取导出配置
        const exportConfig = {
            includeStyle: dom.get('#setting-export-include-style')?.checked || false,
            codeHighlight: dom.get('#setting-export-code-highlight')?.checked || false,
            pdfSize: dom.get('#setting-pdf-size')?.value || 'A4',
            pdfMargin: dom.get('#setting-pdf-margin')?.value || 'default'
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

        // 应用设置
        this.applySettings();

        // 显示保存成功提示
        this.showNotification('设置已保存');
        
        // 关闭对话框
        this.close();
    }

    /**
     * 重置设置为默认值
     */
    resetSettings() {
        if (confirm('确定要重置所有设置为默认值吗？')) {
            // 重置编辑器配置
            this.state.updateEditorConfig({
                fontSize: 14,
                lineHeight: 1.6,
                autoSave: true
            });
            
            // 重置界面配置
            this.state.updateInterfaceConfig({
                theme: 'auto',
                layout: 'layout-both',
                leftRatio: 0.5,
                leftSidebarOpen: false,
                rightSidebarOpen: false,
                sections: {
                    toc: true,
                    export: true
                }
            });
            
            // 重置导出配置
            this.state.updateExportConfig({
                includeStyle: true,
                codeHighlight: true,
                pdfSize: 'A4',
                pdfMargin: 'default'
            });

            this.loadStateToUI();
            this.showNotification('设置已重置');
        }
    }

    /**
     * 应用设置到编辑器
     */
    applySettings() {
        const editor = this.state.get('editor') || {};
        const interfaceState = this.state.get('interface') || {};

        // 应用字体大小 - 使用缓存的元素
        if (this.cachedElements?.editorElement) {
            this.cachedElements.editorElement.style.fontSize = `${editor.fontSize ?? 14}px`;
            this.cachedElements.editorElement.style.lineHeight = editor.lineHeight ?? 1.6;
        }

        // 应用主题
        this.applyTheme(interfaceState.theme ?? 'auto');

        // 应用界面设置
        this.applyInterfaceSettings();
    }

    /**
     * 应用界面设置
     */
    applyInterfaceSettings() {
        if (!this.cachedElements) return;

        const interfaceState = this.state.get('interface') || {};

        // 应用布局模式 - 使用缓存的元素
        if (this.cachedElements.container) {
            const container = this.cachedElements.container;
            // 移除所有布局类
            container.classList.remove('layout-both', 'layout-editor-only', 'layout-preview-only');
            // 添加当前布局类
            container.classList.add(interfaceState.layout ?? 'layout-both');
        }

        // 应用侧边栏状态 - 使用 toggle() 简化
        if (this.cachedElements.leftSidebar) {
            this.cachedElements.leftSidebar.classList.toggle('open', interfaceState.leftSidebarOpen ?? false);
        }
        if (this.cachedElements.rightSidebar) {
            this.cachedElements.rightSidebar.classList.toggle('open', interfaceState.rightSidebarOpen ?? false);
        }

        // 应用布局比例
        if (interfaceState.layout === 'layout-both') {
            const leftRatio = interfaceState.leftRatio ?? 0.5;
            if (this.cachedElements.editorSection) {
                this.cachedElements.editorSection.style.flex = `0 0 ${leftRatio * 100}%`;
            }
            if (this.cachedElements.previewSection) {
                this.cachedElements.previewSection.style.flex = `0 0 ${(1 - leftRatio) * 100}%`;
            }
        } else {
            // 非双栏布局时，清除 flex 样式，让 CSS 自动处理
            if (this.cachedElements.editorSection) {
                this.cachedElements.editorSection.style.flex = '';
            }
            if (this.cachedElements.previewSection) {
                this.cachedElements.previewSection.style.flex = '';
            }
        }

        // 应用侧边栏区块显示状态 - 使用 toggle() 简化
        if (this.cachedElements.tocSection) {
            this.cachedElements.tocSection.classList.toggle('hidden', !(interfaceState.sections?.toc ?? true));
        }
        if (this.cachedElements.exportSection) {
            this.cachedElements.exportSection.classList.toggle('hidden', !(interfaceState.sections?.export ?? true));
        }
    }

    /**
     * 应用主题
     * @param {string} theme - 主题模式
     */
    applyTheme(theme) {
        const html = document.documentElement;
        
        if (theme === 'auto') {
            // 跟随系统主题
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            html.setAttribute('data-mode', prefersDark ? 'dark' : 'light');
        } else {
            html.setAttribute('data-mode', theme);
        }
    }

    /**
     * 显示通知
     * @param {string} message - 通知消息
     */
    showNotification(message) {
        // 触发通知事件
        document.dispatchEvent(new CustomEvent('show-notification', {
            detail: { message, type: 'success' }
        }));
    }
}
