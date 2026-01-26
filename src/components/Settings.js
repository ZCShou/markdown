/**
 * 设置对话框组件
 * 管理编辑器的各种配置选项
 */
import { dom } from '../utils/dom.js';

export class Settings {
    constructor() {
        this.overlay = null;
        this.dialog = null;
        this.currentSection = 'basic';
        this.settings = this.loadSettings();
    }

    /**
     * 初始化设置组件
     */
    init() {
        // 获取 DOM 元素
        this.overlay = dom.get('#md-settings-overlay');
        this.dialog = dom.get('.md-settings-dialog');

        // 绑定事件
        this.bindEvents();

        // 应用已保存的设置
        this.applySettings();
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

        // ESC 键关闭
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlay?.classList.contains('show')) {
                this.close();
            }
        });

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
    }

    /**
     * 打开设置对话框
     */
    open() {
        this.overlay?.classList.add('show');
        this.loadSettingsToUI();
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
        // 更新导航项状态
        const navItems = dom.getAll('.md-settings-nav-item');
        navItems.forEach(item => {
            if (item.dataset.section === section) {
                item.classList.add('active');
            } else {
                item.classList.remove('active');
            }
        });

        // 更新内容区域显示
        const sections = dom.getAll('.md-settings-section');
        sections.forEach(sec => {
            if (sec.id === `settings-${section}`) {
                sec.classList.add('active');
            } else {
                sec.classList.remove('active');
            }
        });

        this.currentSection = section;
    }

    /**
     * 从 localStorage 加载设置
     * @returns {Object} 设置对象
     */
    loadSettings() {
        const defaultSettings = {
            fontSize: 14,
            lineHeight: 1.6,
            autoSave: true,
            theme: 'auto',
            exportIncludeStyle: true,
            exportCodeHighlight: true,
            pdfSize: 'A4',
            pdfMargin: 'default'
        };

        const saved = localStorage.getItem('markdown-editor-settings');
        if (saved) {
            try {
                return { ...defaultSettings, ...JSON.parse(saved) };
            } catch (e) {
                console.error('Failed to load settings:', e);
                return defaultSettings;
            }
        }

        return defaultSettings;
    }

    /**
     * 将设置加载到 UI
     */
    loadSettingsToUI() {
        // 基本配置
        const fontSizeInput = dom.get('#setting-font-size');
        if (fontSizeInput) fontSizeInput.value = this.settings.fontSize;

        const lineHeightInput = dom.get('#setting-line-height');
        if (lineHeightInput) lineHeightInput.value = this.settings.lineHeight;

        const autoSaveInput = dom.get('#setting-auto-save');
        if (autoSaveInput) autoSaveInput.checked = this.settings.autoSave;

        const themeSelect = dom.get('#setting-theme');
        if (themeSelect) themeSelect.value = this.settings.theme;

        // 导出配置
        const exportStyleInput = dom.get('#setting-export-include-style');
        if (exportStyleInput) exportStyleInput.checked = this.settings.exportIncludeStyle;

        const exportHighlightInput = dom.get('#setting-export-code-highlight');
        if (exportHighlightInput) exportHighlightInput.checked = this.settings.exportCodeHighlight;

        const pdfSizeSelect = dom.get('#setting-pdf-size');
        if (pdfSizeSelect) pdfSizeSelect.value = this.settings.pdfSize;

        const pdfMarginSelect = dom.get('#setting-pdf-margin');
        if (pdfMarginSelect) pdfMarginSelect.value = this.settings.pdfMargin;
    }

    /**
     * 从 UI 读取设置
     * @returns {Object} 设置对象
     */
    readSettingsFromUI() {
        return {
            fontSize: parseInt(dom.get('#setting-font-size')?.value) || 14,
            lineHeight: parseFloat(dom.get('#setting-line-height')?.value) || 1.6,
            autoSave: dom.get('#setting-auto-save')?.checked || false,
            theme: dom.get('#setting-theme')?.value || 'auto',
            exportIncludeStyle: dom.get('#setting-export-include-style')?.checked || false,
            exportCodeHighlight: dom.get('#setting-export-code-highlight')?.checked || false,
            pdfSize: dom.get('#setting-pdf-size')?.value || 'A4',
            pdfMargin: dom.get('#setting-pdf-margin')?.value || 'default'
        };
    }

    /**
     * 保存设置
     */
    saveSettings() {
        this.settings = this.readSettingsFromUI();
        
        // 保存到 localStorage
        try {
            localStorage.setItem('markdown-editor-settings', JSON.stringify(this.settings));
        } catch (e) {
            console.error('Failed to save settings:', e);
        }

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
            this.settings = {
                fontSize: 14,
                lineHeight: 1.6,
                autoSave: true,
                theme: 'auto',
                exportIncludeStyle: true,
                exportCodeHighlight: true,
                pdfSize: 'A4',
                pdfMargin: 'default'
            };

            this.loadSettingsToUI();
            this.showNotification('设置已重置');
        }
    }

    /**
     * 应用设置到编辑器
     */
    applySettings() {
        // 应用字体大小
        const editor = dom.get('#markdown-editor');
        if (editor) {
            editor.style.fontSize = `${this.settings.fontSize}px`;
            editor.style.lineHeight = this.settings.lineHeight;
        }

        // 应用主题
        this.applyTheme(this.settings.theme);

        // 触发自定义事件，通知其他组件设置已更改
        document.dispatchEvent(new CustomEvent('settings-changed', {
            detail: this.settings
        }));
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

    /**
     * 获取当前设置
     * @returns {Object} 设置对象
     */
    getSettings() {
        return { ...this.settings };
    }
}
