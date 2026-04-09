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
import {
    checkWorkspaceBridgeAvailability,
    getWorkspaceBridgeBaseUrl,
    isTauriRuntime
} from '../workspace/index.js';
import { Dialog } from './Dialog.js';
import { version } from '../../package.json';

export class Settings {
    /**
     * @param {Object} state - 编辑器状态对象
     */
    constructor(state) {
        this.state = state;
        this.workspaceManager = null;
        this.overlay = null;
        this.dialog = null;
        this.currentSection = 'interface';

        // DOM 元素缓存
        this.cachedElements = null;
        // 导航项缓存
        this.navItems = null;
        // 设置区域缓存
        this.sectionElements = null;
        this.workspaceBridgeAvailable = isTauriRuntime();
        this.workspaceBridgeChecking = false;

        // 系统主题变化监听器（用于清理）
        this.colorSchemeMatcher = null;
        this.themeChangeHandler = null;
    }

    /**
     * 注入工作空间管理器
     * @param {Object} workspaceManager - 工作空间管理器
     */
    setWorkspaceManager(workspaceManager) {
        this.workspaceManager = workspaceManager;
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

        if (!isTauriRuntime()) {
            this.refreshWorkspaceRuntimeState();
        }
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
            monacoStickyScrollInput: dom.get('#setting-monaco-sticky-scroll'),

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

            // 工作空间设置
            workspaceProviderSelect: dom.get('#setting-workspace-provider-select'),
            workspaceConnectCurrentBtn: dom.get('#workspace-connect-current'),
            workspaceDisconnectBtn: dom.get('#workspace-disconnect'),
            workspaceRuntimeNote: dom.get('#workspace-runtime-note'),
            workspaceStatusText: dom.get('#workspace-status-text'),
            workspacePlatformGroup: dom.get('#settings-workspace-platform-group'),
            workspacePlatformStatusText: dom.get('#workspace-platform-status-text'),
            workspaceRepoNameInput: dom.get('#setting-workspace-repo-name'),
            workspaceRepoDescriptionInput: dom.get('#setting-workspace-repo-description'),
            workspaceRepoPrivateInput: dom.get('#setting-workspace-repo-private'),
            workspaceAutoSyncInput: dom.get('#setting-workspace-auto-sync'),

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

        const connectCurrentBtn = dom.get('#workspace-connect-current');
        if (connectCurrentBtn) {
            connectCurrentBtn.addEventListener('click', () => this.handleWorkspaceConnect());
        }

        const syncBtn = dom.get('#workspace-sync-now');
        if (syncBtn) {
            syncBtn.addEventListener('click', () => this.handleWorkspaceSync());
        }

        const disconnectBtn = dom.get('#workspace-disconnect');
        if (disconnectBtn) {
            disconnectBtn.addEventListener('click', () => this.handleWorkspaceDisconnect());
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

        if (this.cachedElements?.workspaceProviderSelect) {
            this.cachedElements.workspaceProviderSelect.addEventListener('change', e => {
                this.updateWorkspaceProviderSettings(e.target.value);
                this.renderWorkspaceSummary(this.state.get('workspace') || {});
                if (!isTauriRuntime()) {
                    this.refreshWorkspaceRuntimeState();
                }
            });
        }
    }

    async refreshWorkspaceRuntimeState(force = false) {
        if (isTauriRuntime()) {
            this.workspaceBridgeAvailable = true;
            this.workspaceBridgeChecking = false;
            this.updateWorkspaceProviderSettings(
                this.cachedElements?.workspaceProviderSelect?.value || 'local'
            );
            return;
        }

        this.workspaceBridgeChecking = true;
        this.updateWorkspaceProviderSettings(
            this.cachedElements?.workspaceProviderSelect?.value || 'local'
        );

        this.workspaceBridgeAvailable = await checkWorkspaceBridgeAvailability(force);
        this.workspaceBridgeChecking = false;
        this.updateWorkspaceProviderSettings(
            this.cachedElements?.workspaceProviderSelect?.value || 'local'
        );
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
        if (!isTauriRuntime()) {
            this.refreshWorkspaceRuntimeState(true);
        }
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
        const workspace = this.state.get('workspace') || {};
        const selectedWorkspaceProvider = this.getSelectedWorkspaceProvider(workspace);

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
        this.#setInputChecked(this.cachedElements.monacoStickyScrollInput, monaco.stickyScroll, true);

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

        // 工作空间配置
        this.#setInputValue(
            this.cachedElements.workspaceRepoNameInput,
            workspace.repoName,
            'markdown-workspace'
        );
        this.#setInputValue(
            this.cachedElements.workspaceRepoDescriptionInput,
            workspace.repoDescription,
            'Markdown workspace data'
        );
        this.#setInputChecked(
            this.cachedElements.workspaceRepoPrivateInput,
            workspace.repoPrivate,
            true
        );
        this.#setInputChecked(
            this.cachedElements.workspaceAutoSyncInput,
            workspace.autoSync,
            true
        );
        this.#setInputValue(
            this.cachedElements.workspaceProviderSelect,
            selectedWorkspaceProvider,
            'local'
        );

        this.updateWorkspaceProviderSettings(selectedWorkspaceProvider);
        this.renderWorkspaceSummary(workspace);
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

    getSelectedWorkspaceProvider(workspace = this.state.get('workspace') || {}) {
        if (workspace.provider === 'local' || workspace.provider === 'github' || workspace.provider === 'gitee') {
            return workspace.provider;
        }
        return 'local';
    }

    getCurrentWorkspaceProvider(workspace = this.state.get('workspace') || {}) {
        return (
            this.cachedElements?.workspaceProviderSelect?.value ||
            this.getSelectedWorkspaceProvider(workspace)
        );
    }

    getWorkspaceProviderActionLabel(provider) {
        if (provider === 'github') {
            return '退出 GitHub';
        }
        if (provider === 'gitee') {
            return '退出 Gitee';
        }
        return '退出当前平台';
    }

    updateWorkspaceProviderSettings(provider) {
        const remoteSupported = isTauriRuntime() || this.workspaceBridgeAvailable;
        const remoteProvider = provider === 'github' || provider === 'gitee';

        if (this.cachedElements?.workspaceConnectCurrentBtn) {
            this.cachedElements.workspaceConnectCurrentBtn.innerHTML =
                provider === 'local'
                    ? '<i class="codicon codicon-device-desktop" aria-hidden="true"></i><span>切换到本地浏览器</span>'
                    : `<i class="codicon codicon-sign-in" aria-hidden="true"></i><span>登录 ${provider === 'gitee' ? 'Gitee' : 'GitHub'}</span>`;
            this.cachedElements.workspaceConnectCurrentBtn.disabled =
                remoteProvider && (!remoteSupported || this.workspaceBridgeChecking);
        }

        if (this.cachedElements?.workspaceRuntimeNote) {
            this.cachedElements.workspaceRuntimeNote.textContent =
                remoteProvider && this.workspaceBridgeChecking
                    ? '正在检查远程工作空间服务可用性...'
                    :
                remoteProvider && !isTauriRuntime() && getWorkspaceBridgeBaseUrl()
                    ? '当前浏览器环境将通过配置的 OAuth bridge 完成授权和同步。'
                    : remoteProvider && !isTauriRuntime()
                        ? remoteSupported
                            ? '当前浏览器环境会通过内置 OAuth bridge 完成授权和同步；本地开发直接运行 `npm run dev` 即可。'
                            : '当前浏览器环境未检测到可用的 OAuth bridge；本地开发请确认使用 `npm run dev` 启动。'
                        : provider === 'local'
                            ? '本地浏览器模式会将工作空间保存到当前设备的浏览器存储中。'
                        : '';
        }

        if (this.cachedElements?.workspacePlatformGroup) {
            this.cachedElements.workspacePlatformGroup.style.display = remoteProvider ? '' : 'none';
        }

        if (this.cachedElements?.workspaceDisconnectBtn) {
            this.cachedElements.workspaceDisconnectBtn.disabled = !remoteProvider;
            this.cachedElements.workspaceDisconnectBtn.setAttribute(
                'aria-label',
                this.getWorkspaceProviderActionLabel(provider)
            );
            this.cachedElements.workspaceDisconnectBtn.setAttribute(
                'title',
                this.getWorkspaceProviderActionLabel(provider)
            );
        }

        const syncButton = dom.get('#workspace-sync-now');
        if (syncButton) {
            syncButton.disabled =
                provider === 'local' ||
                (remoteProvider && (!remoteSupported || this.workspaceBridgeChecking));
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
                    this.cachedElements.monacoRenderWhitespaceSelect?.value || 'selection',
                stickyScroll: this.cachedElements.monacoStickyScrollInput?.checked ?? true
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

        const currentWorkspace = this.state.get('workspace') || {};
        const selectedProvider =
            this.cachedElements.workspaceProviderSelect?.value ||
            this.getSelectedWorkspaceProvider(currentWorkspace);
        const workspaceConfig = {
            provider: selectedProvider,
            repoName: this.cachedElements.workspaceRepoNameInput?.value?.trim() || 'markdown-workspace',
            repoDescription:
                this.cachedElements.workspaceRepoDescriptionInput?.value?.trim() ||
                'Markdown workspace data',
            repoPrivate: this.cachedElements.workspaceRepoPrivateInput?.checked ?? true,
            autoSync: this.cachedElements.workspaceAutoSyncInput?.checked ?? true,
        };

        return { editorConfig, interfaceConfig, exportConfig, workspaceConfig };
    }

    /**
     * 保存设置
     */
    saveSettings() {
        const { editorConfig, interfaceConfig, exportConfig, workspaceConfig } = this.readSettingsFromUI();

        // 更新到 state（唯一数据源）
        this.state.updateEditorConfig(editorConfig);
        this.state.updateInterfaceConfig(interfaceConfig);
        this.state.updateExportConfig(exportConfig);
        this.state.updateWorkspaceConfig(workspaceConfig);

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
            const defaults = EditorState.createDefaultSettings();

            // 重置编辑器配置
            this.state.updateEditorConfig(defaults.editor);

            // 重置界面配置
            this.state.updateInterfaceConfig(defaults.interface);

            // 重置导出配置
            this.state.updateExportConfig(defaults.export);
            this.state.updateWorkspaceConfig(defaults.workspace);

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
        const workspace = this.state.get('workspace') || {};

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
        this.renderWorkspaceSummary(workspace);
    }

    renderWorkspaceSummary(workspace = this.state.get('workspace') || {}) {
        if (this.cachedElements?.workspaceProviderSelect && !this.cachedElements.workspaceProviderSelect.matches(':focus')) {
            this.cachedElements.workspaceProviderSelect.value = this.getSelectedWorkspaceProvider(workspace);
        }

        const selectedProvider = this.getCurrentWorkspaceProvider(workspace);
        const connectedForSelectedProvider =
            workspace.connected && workspace.provider === selectedProvider;
        const selectedRemoteProvider =
            selectedProvider === 'github' || selectedProvider === 'gitee';

        this.updateWorkspaceProviderSettings(selectedProvider);

        if (this.cachedElements?.workspaceStatusText) {
            const statusMap = {
                idle: workspace.provider === 'local' ? '本地存储' : '未连接',
                authorizing: '正在授权',
                connected: '已连接，等待同步',
                syncing: '同步中',
                synced: '同步成功',
                error: workspace.lastSyncError || '同步失败'
            };
            this.cachedElements.workspaceStatusText.textContent =
                statusMap[workspace.lastSyncStatus] || '未连接';
        }

        if (this.cachedElements?.workspacePlatformStatusText) {
            const providerLabel =
                selectedProvider === 'gitee'
                    ? 'Gitee'
                    : selectedProvider === 'github'
                        ? 'GitHub'
                        : '';
            this.cachedElements.workspacePlatformStatusText.textContent =
                connectedForSelectedProvider && providerLabel
                    ? `已登录 ${providerLabel}${workspace.accountName ? `（${workspace.accountName}）` : ''}`
                    : providerLabel
                        ? `未登录 ${providerLabel}`
                        : '未登录';
            this.cachedElements.workspacePlatformStatusText.style.display =
                connectedForSelectedProvider ? '' : 'none';
        }

        if (this.cachedElements?.workspaceConnectCurrentBtn) {
            this.cachedElements.workspaceConnectCurrentBtn.style.display =
                selectedRemoteProvider && !connectedForSelectedProvider ? '' : 'none';
        }

        if (this.cachedElements?.workspaceDisconnectBtn) {
            this.cachedElements.workspaceDisconnectBtn.disabled = !connectedForSelectedProvider;
            this.cachedElements.workspaceDisconnectBtn.style.display =
                selectedRemoteProvider && connectedForSelectedProvider ? '' : 'none';
        }
    }

    async handleWorkspaceConnect(provider) {
        if (!this.workspaceManager) {
            this.state.showNotification('工作空间管理器未初始化', 'error');
            return;
        }

        try {
            const { workspaceConfig } = this.readSettingsFromUI();
            this.state.updateWorkspaceConfig(workspaceConfig);
            const targetProvider = provider || workspaceConfig.provider || 'github';

            if (
                (targetProvider === 'github' || targetProvider === 'gitee') &&
                !isTauriRuntime() &&
                !(await checkWorkspaceBridgeAvailability())
            ) {
                this.state.showNotification(
                    '当前环境未检测到可用的远程工作空间服务，请确认 bridge 已启动，或配置 `VITE_WORKSPACE_BRIDGE_BASE_URL`。',
                    'warning'
                );
                return;
            }

            if (targetProvider === 'local') {
                this.workspaceManager.disconnect();
                this.state.updateWorkspaceConfig({
                    provider: 'local',
                    connected: false,
                    lastSyncStatus: 'idle',
                    lastSyncError: '',
                    repoUrl: '',
                    owner: '',
                    accessToken: '',
                    accountName: ''
                });
                this.renderWorkspaceSummary();
                this.state.showNotification('已切换到本地浏览器模式', 'success');
                return;
            }

            this.renderWorkspaceSummary({
                ...this.state.get('workspace'),
                ...workspaceConfig
            });
            await this.workspaceManager.connect(targetProvider);
            this.renderWorkspaceSummary();
            this.state.showNotification(
                `${targetProvider === 'github' ? 'GitHub' : 'Gitee'} 工作空间已连接并完成首次同步`,
                'success'
            );
        } catch (error) {
            console.error('Workspace connect failed:', error);
            this.renderWorkspaceSummary();
            this.state.showNotification(error.message || '连接工作空间失败', 'error');
        }
    }

    async handleWorkspaceSync() {
        if (!this.workspaceManager) {
            this.state.showNotification('工作空间管理器未初始化', 'error');
            return;
        }

        try {
            const workspace = this.state.get('workspace') || {};
            if ((workspace.provider || this.cachedElements?.workspaceProviderSelect?.value) === 'local') {
                this.state.showNotification('本地浏览器模式不需要远程同步', 'info');
                return;
            }
            if (!isTauriRuntime() && !(await checkWorkspaceBridgeAvailability())) {
                this.state.showNotification(
                    '当前环境未检测到可用的远程工作空间服务，请确认 bridge 已启动，或配置 `VITE_WORKSPACE_BRIDGE_BASE_URL`。',
                    'warning'
                );
                return;
            }
            await this.workspaceManager.syncNow();
            this.renderWorkspaceSummary();
            this.state.showNotification('工作空间已同步到远程仓库', 'success');
        } catch (error) {
            console.error('Workspace sync failed:', error);
            this.renderWorkspaceSummary();
            this.state.showNotification(error.message || '工作空间同步失败', 'error');
        }
    }

    handleWorkspaceDisconnect() {
        if (!this.workspaceManager) {
            this.state.showNotification('工作空间管理器未初始化', 'error');
            return;
        }

        this.workspaceManager.disconnect();
        this.renderWorkspaceSummary();
        this.state.showNotification('工作空间连接已断开', 'success');
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
