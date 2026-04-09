/**
 * Markdown 编辑器管理器 - 重构版
 * 采用状态驱动 UI 的架构模式
 * 组件化设计，职责分离
 *
 * @example
 * ```js
 * const editor = new MarkdownEditor();
 * editor.init();
 * ```
 */
import { EditorState } from './EditorState.js';
import { Preview } from './components/Preview.js';
import { LeftSidebar } from './components/LeftSidebar.js';
import { RightSidebar } from './components/RightSidebar.js';
import { Settings } from './components/Settings.js';
import { Exporter } from './components/Exporter.js';
import { dom } from './utils/dom.js';
import { applyTheme } from './utils/theme.js';
import { handlePastedImage } from './utils/helpers.js';
import { WorkspaceManager } from './workspace/manager.js';

/**
 *
 */
export class MarkdownEditor {
    // ==================== 私有字段 ====================

    /** @type {number|null} resize 定时器 ID */
    #resizeTimeout = null;

    /** @type {number|null} 拖拽 rAF ID */
    #dragRafId = null;

    /** @type {Element|null} 同步滚动图标元素 */
    #syncScrollIcon = null;

    /** @type {number|null} 编辑器输入防抖定时器 */
    #editorInputTimer = null;

    /** @type {Function|null} 编辑器状态订阅取消函数 */
    #editorStateUnsubscribe = null;

    /** @type {Function|null} 编辑器配置订阅取消函数 */
    #editorConfigUnsubscribe = null;

    /** @type {Function|null} 同步滚动内容订阅取消函数 */
    #syncScrollContentUnsubscribe = null;

    /** @type {Function|null} 同步滚动编辑器滚动订阅取消函数 */
    #syncScrollEditorScrollUnsubscribe = null;

    /** @type {Function|null} 分隔条界面配置订阅取消函数 */
    #dividerInterfaceUnsubscribe = null;

    /** @type {ResizeObserver|null} 同步滚动 ResizeObserver */
    #syncScrollResizeObserver = null;

    /** @type {Element|null} 同步滚动预览元素 */
    #syncScrollPreview = null;

    /** @type {Function|null} 同步滚动预览处理器 */
    #syncScrollPreviewHandler = null;

    /** @type {Function|null} 分隔条清理函数 */
    #dividerCleanup = null;

    // ==================== 配置常量 ====================

    /**
     * 编辑器类型常量
     * @type {Object}
     */
    static EDITOR_TYPES = {
        CODEMIRROR: 'codemirror',
        MONACO: 'monaco'
    };

    /**
     * 布局模式常量
     * @type {Object}
     */
    static LAYOUT_MODES = {
        BOTH: 'layout-both',
        EDITOR_ONLY: 'layout-editor-only',
        PREVIEW_ONLY: 'layout-preview-only'
    };

    /**
     * 消息类型常量
     * @type {Object}
     */
    static MESSAGE_TYPES = {
        INFO: 'info',
        SUCCESS: 'success',
        WARNING: 'warning',
        ERROR: 'error'
    };

    /**
     * 防抖延迟配置（毫秒）
     * @type {Object}
     */
    static DEBOUNCE_DELAY = {
        UPDATE: 150, // 内容更新防抖延迟
        SAVE: 1000 // 自动保存防抖延迟
    };

    /**
     * 拖拽配置
     * @type {Object}
     */
    static DRAG_CONFIG = {
        MIN_WIDTH: 100, // 最小面板宽度（像素）
        BATCH_SIZE: 10 // 批量处理大小
    };

    /**
     * UI 常量配置
     * @type {Object}
     */
    static UI_CONFIG = {
        MESSAGE_DURATION: 2000, // 消息显示时长（毫秒）
        MERMAID_RENDER_DELAY: 100, // Mermaid 渲染延迟（毫秒）
        MAX_CONTENT_LENGTH: 1000000 // 最大内容长度限制
    };

    /**
     * 构造函数 - 初始化编辑器实例
     */
    constructor() {
        /** @type {boolean} 是否已初始化 */
        this.isInitialized = false;

        /** @type {boolean} 是否正在拖拽 */
        this.isDragging = false;

        /** @type {number} 上次左侧比例 */
        this.lastLeftRatio = 0.5;

        /** @type {boolean} 是否启用同步滚动 */
        this.syncScrollEnabled = true;

        /** @type {boolean} 是否正在同步滚动（防止循环触发） */
        this.isSyncing = false;

        /** @type {EditorState} 状态管理器 */
        this.state = new EditorState();

        /** @type {Object} 组件实例 */
        this.components = {};

        /** @type {WorkspaceManager} 工作空间同步管理器 */
        this.workspaceManager = new WorkspaceManager(this.state);

        /** @type {CodeMirrorEditor|null} CodeMirror 实例 */
        this.codeMirrorEditor = null;

        /** @type {MonacoEditor|null} Monaco 实例 */
        this.monacoEditor = null;

        /** @type {string} 当前编辑器类型 */
        this.currentEditorType = 'codemirror';
    }

    // ==================== 工具函数 ====================

    /**
     * 显示消息提示
     * @param {string} message - 消息内容
     * @param {string} type - 消息类型
     * @param {number} duration - 显示时长（毫秒）
     */
    showMessage(
        message,
        type = MarkdownEditor.MESSAGE_TYPES.INFO,
        duration = MarkdownEditor.UI_CONFIG.MESSAGE_DURATION
    ) {
        const overlay = dom.status.overlay?.element;
        const messageEl = dom.status.message?.element;

        if (overlay && messageEl) {
            messageEl.textContent = message;
            // 使用 classList 替代 className 拼接
            messageEl.classList.remove('info', 'success', 'warning', 'error');
            messageEl.classList.add(type);
            overlay.classList.add('show');
            messageEl.classList.add('show');

            setTimeout(() => {
                overlay.classList.remove('show');
                messageEl.classList.remove('show');
            }, duration);
        }
    }

    /**
     * 获取当前活动的编辑器实例
     * @returns {CodeMirrorEditor|MonacoEditor|null} 当前活动的编辑器实例
     * @private
     */
    #getActiveEditor() {
        if (this.currentEditorType === MarkdownEditor.EDITOR_TYPES.MONACO) {
            return this.monacoEditor;
        }
        return this.codeMirrorEditor;
    }

    /**
     * 构建编辑器配置对象
     * @param {string} initialValue - 初始内容
     * @returns {Object} 编辑器配置
     * @private
     */
    #buildEditorConfig(initialValue = '') {
        const editorConfig = this.state.get('editor') || {};
        const interfaceConfig = this.state.get('interface') || {};

        return {
            initialValue,
            editorConfig,
            interfaceConfig,
            placeholder: '在此输入 Markdown 内容...',
            ariaLabel: 'Markdown 编辑器输入区域',
            onChange: this.#handleEditorChange.bind(this),
            onEscape: this.#handleEditorEscape.bind(this),
            onImagePaste: this.#handleImagePaste.bind(this)
        };
    }

    /**
     * 处理粘贴图片
     * @param {File} file - 图片文件
     * @returns {Promise<string>} 图片路径
     * @private
     */
    async #handleImagePaste(file) {
        try {
            const { folderId, directorySegments } = this.state.ensureImageFolderForCurrentDoc();
            const imagePath = await handlePastedImage(file, {
                directorySegments
            });
            this.state.registerImageResource(imagePath, folderId);
            return imagePath;
        } catch (error) {
            console.error('Failed to save pasted image:', error);
            this.showMessage(error.message || '保存图片失败', MarkdownEditor.MESSAGE_TYPES.ERROR);
            throw error;
        }
    }

    /**
     * 处理编辑器内容变化
     * @param {string} content - 新内容
     * @private
     */
    #handleEditorChange(content) {
        if (this.#editorInputTimer) {
            clearTimeout(this.#editorInputTimer);
        }
        this.#editorInputTimer = setTimeout(() => {
            this.state.updateContent(content);
        }, MarkdownEditor.DEBOUNCE_DELAY.UPDATE);
    }

    /**
     * 处理编辑器 ESC 键
     * @returns {boolean} 是否阻止默认行为
     * @private
     */
    #handleEditorEscape() {
        // 原生搜索面板有自己的 ESC 处理
        return false;
    }

    /**
     * 创建编辑器实例
     * @param {string} editorType - 编辑器类型
     * @param {string} initialValue - 初始内容
     * @param {HTMLElement} editorHost - 编辑器容器
     * @returns {Promise<CodeMirrorEditor|MonacoEditor>} 编辑器实例
     * @private
     */
    async #createEditorInstance(editorType, initialValue, editorHost) {
        const config = this.#buildEditorConfig(initialValue);
        let EditorClass;

        if (editorType === MarkdownEditor.EDITOR_TYPES.MONACO) {
            const { MonacoEditor } = await import('./components/MonacoEditor.js');
            EditorClass = MonacoEditor;
        } else {
            const { CodeMirrorEditor } = await import('./components/CodeMirrorEditor.js');
            EditorClass = CodeMirrorEditor;
        }

        const editor = new EditorClass(editorHost, config);
        editor.init();

        return editor;
    }

    /**
     * 销毁当前活动的编辑器
     * @private
     */
    #destroyCurrentEditor() {
        if (this.codeMirrorEditor) {
            this.codeMirrorEditor.destroy();
            this.codeMirrorEditor = null;
        }
        if (this.monacoEditor) {
            this.monacoEditor.destroy();
            this.monacoEditor = null;
        }

        const editorHost = dom.getById('markdown-editor')?.element;
        if (editorHost) {
            editorHost.innerHTML = '';
        }
    }

    /**
     * 切换编辑器类型
     * @param {string} editorType - 编辑器类型 ('codemirror' | 'monaco')
     * @example
     * ```javascript
     * editor.switchEditorType('monaco');
     * editor.switchEditorType('codemirror');
     * ```
     */
    async switchEditorType(editorType) {
        if (editorType === this.currentEditorType) return;

        const editorHost = dom.getById('markdown-editor')?.element;
        if (!editorHost) {
            console.error('Editor host not found: markdown-editor');
            this.showMessage('编辑器容器未找到', MarkdownEditor.MESSAGE_TYPES.ERROR);
            return;
        }

        // 保存当前内容
        const currentContent = this.#getActiveEditor()?.getValue() || '';

        // 更新类型标记（先更新，防止并发调用）
        this.currentEditorType = editorType;

        // 销毁旧编辑器
        this.#destroyCurrentEditor();

        // 按需加载并创建新编辑器
        const editor = await this.#createEditorInstance(editorType, currentContent, editorHost);

        if (editorType === MarkdownEditor.EDITOR_TYPES.MONACO) {
            this.monacoEditor = editor;
        } else {
            this.codeMirrorEditor = editor;
        }

        // 更新状态
        this.state.updateEditorConfig({ type: editorType });

        // 重新设置同步滚动（切换编辑器后需要重新绑定事件）
        this.setupSyncScroll();

        this.showMessage(
            `已切换到 ${editorType === MarkdownEditor.EDITOR_TYPES.MONACO ? 'Monaco' : 'CodeMirror'} 编辑器`,
            MarkdownEditor.MESSAGE_TYPES.SUCCESS
        );
    }

    // ==================== 组件初始化 ====================

    /**
     * 初始化所有组件
     */
    async initComponents() {
        // 编辑器
        const editorHost = dom.getById('markdown-editor')?.element;
        if (editorHost) {
            const editorConfig = this.state.get('editor') || {};
            const editorType = editorConfig.type || MarkdownEditor.EDITOR_TYPES.CODEMIRROR;
            const initialValue = this.state.get('content') || '';

            this.currentEditorType = editorType;

            // 按需加载并创建编辑器
            const editor = await this.#createEditorInstance(editorType, initialValue, editorHost);

            if (editorType === MarkdownEditor.EDITOR_TYPES.MONACO) {
                this.monacoEditor = editor;
            } else {
                this.codeMirrorEditor = editor;
            }
        } else {
            console.error('Editor host not found: markdown-editor');
            this.showMessage('编辑器初始化失败', MarkdownEditor.MESSAGE_TYPES.ERROR);
        }

        // 预览组件
        this.components.preview = new Preview(this.state, 'markdown-preview');

        // 左侧边栏组件（包含文档树功能）
        this.components.leftSidebar = new LeftSidebar(this.state, 'md-sidebar-left');

        // 右侧边栏组件（包含目录功能）
        this.components.rightSidebar = new RightSidebar(this.state, 'md-sidebar-right');

        // 导出组件（独立于 Preview，直接订阅导出事件）
        this.components.exporter = new Exporter(this.state, 'markdown-preview');

        // 设置组件（传入 state 以实现状态同步）
        this.components.settings = new Settings(this.state);
        this.components.settings.setWorkspaceManager(this.workspaceManager);

        // 初始化所有组件
        Object.values(this.components).forEach(component => {
            component.init();
        });

        this.workspaceManager.init();

        // 空闲时预加载另一个编辑器模块，加速首次切换
        if (this.currentEditorType !== MarkdownEditor.EDITOR_TYPES.MONACO) {
            const scheduleIdle = window.requestIdleCallback || (cb => setTimeout(cb, 2000));
            scheduleIdle(
                () => import('./components/MonacoEditor.js'),
                { timeout: 5000 }
            );
        } else {
            const scheduleIdle = window.requestIdleCallback || (cb => setTimeout(cb, 2000));
            scheduleIdle(
                () => import('./components/CodeMirrorEditor.js'),
                { timeout: 5000 }
            );
        }
    }

    // ==================== 同步滚动 ====================

    /**
     * 设置同步滚动
     */
    setupSyncScroll() {
        this.#cleanupSyncScroll();

        const editorInstance = this.#getActiveEditor();
        const editor = editorInstance?.getScrollElement();
        const previewWrapper = dom.preview.wrapper?.element;

        if (!editor || !previewWrapper) return;

        const editorResizeElement = editorInstance?.getResizeObserverElement?.();

        const interfaceState = this.state.get('interface');
        this.syncScrollEnabled = interfaceState?.syncScrollEnabled ?? true;
        this.updateSyncScrollIcon(this.syncScrollEnabled);

        let lastSyncTime = 0;
        const SYNC_DELAY = 50;

        const updateScrollHeights = () => ({
            editor: Math.max(0, editor.scrollHeight - editor.clientHeight),
            preview: Math.max(0, previewWrapper.scrollHeight - previewWrapper.clientHeight)
        });

        let heights = updateScrollHeights();

        // ResizeObserver 监听尺寸变化
        const resizeObserver = new ResizeObserver(() => {
            heights = updateScrollHeights();
        });
        if (editorResizeElement) resizeObserver.observe(editorResizeElement);
        resizeObserver.observe(previewWrapper);

        // 内容变化时更新高度（使用新的订阅名称避免冲突）
        this.#syncScrollContentUnsubscribe = this.state.subscribeTo(
            ['content', 'currentDocId'],
            () => requestAnimationFrame(() => (heights = updateScrollHeights()))
        );

        // 滚动处理
        const handleScroll = (source, target, sourceH, targetH) => {
            if (!this.syncScrollEnabled || this.isSyncing) return;
            if (sourceH <= 0 || targetH <= 0) return;

            const now = performance.now();
            if (now - lastSyncTime < SYNC_DELAY) return;

            this.isSyncing = true;
            target.scrollTop = (source.scrollTop / sourceH) * targetH;
            lastSyncTime = now;

            requestAnimationFrame(() => (this.isSyncing = false));
        };

        // 编辑器滚动 -> 预览（使用新的订阅名称避免冲突）
        this.#syncScrollEditorScrollUnsubscribe = editorInstance.onScroll(() => {
            handleScroll(editor, previewWrapper, heights.editor, heights.preview);
        });

        // 预览滚动 -> 编辑器
        const previewScrollHandler = () => {
            handleScroll(previewWrapper, editor, heights.preview, heights.editor);
        };
        previewWrapper.addEventListener('scroll', previewScrollHandler, { passive: true });

        // 保存引用
        this.#syncScrollResizeObserver = resizeObserver;
        this.#syncScrollPreview = previewWrapper;
        this.#syncScrollPreviewHandler = previewScrollHandler;
    }

    /**
     * 清理同步滚动相关的监听器
     * @private
     */
    #cleanupSyncScroll() {
        if (this.#syncScrollResizeObserver) {
            this.#syncScrollResizeObserver.disconnect();
            this.#syncScrollResizeObserver = null;
        }
        if (this.#syncScrollContentUnsubscribe) {
            this.#syncScrollContentUnsubscribe();
            this.#syncScrollContentUnsubscribe = null;
        }
        if (this.#syncScrollEditorScrollUnsubscribe) {
            this.#syncScrollEditorScrollUnsubscribe();
            this.#syncScrollEditorScrollUnsubscribe = null;
        }
        if (this.#syncScrollPreview && this.#syncScrollPreviewHandler) {
            this.#syncScrollPreview.removeEventListener('scroll', this.#syncScrollPreviewHandler);
            this.#syncScrollPreview = null;
            this.#syncScrollPreviewHandler = null;
        }
    }

    // ==================== 分隔条拖拽 ====================

    /**
     * 设置拖拽分隔条（性能优化版）
     */
    setupDivider() {
        const divider = dom.divider.element?.element;
        const container = dom.app.container?.element;

        if (!divider || !container) return;

        const MIN_WIDTH = MarkdownEditor.DRAG_CONFIG.MIN_WIDTH ?? 100;

        const updateSplitRatio = ratio => {
            const clamped = Math.max(0, Math.min(1, Number(ratio)));
            // Avoid unnecessary updates when ratio hasn't changed much
            if (Math.abs(clamped - this.lastLeftRatio) < 1e-6) return;

            // 批量更新 DOM，减少回流/重绘
            requestAnimationFrame(() => {
                // 只在需要时添加类
                if (!container.classList.contains('has-split-ratio')) {
                    container.classList.add('has-split-ratio');
                }
                container.style.setProperty('--split-ratio', String(clamped));
            });

            this.lastLeftRatio = clamped;
            this.state.updateInterfaceConfig({ leftRatio: clamped });
            // 不再设置内联样式，让 CSS 通过 --split-ratio 变量自动处理
            // 这样可以避免滚动条出现时的布局问题
        };

        const clearSplitRatio = () => {
            container.classList.remove('has-split-ratio');
        };

        const recalculateSplitRatio = () => {
            const currentLayout = this.state.get('interface').layout;
            if (currentLayout !== MarkdownEditor.LAYOUT_MODES.BOTH) {
                clearSplitRatio();
                return;
            }
            // Defer to next frame
            requestAnimationFrame(() => {
                const ratio = this.state.get('interface')?.leftRatio ?? this.lastLeftRatio;
                this.lastLeftRatio = ratio;
                updateSplitRatio(ratio);
            });
        };

        // 初始化（依赖 CSS 处理布局）
        const currentLayout = this.state.get('interface').layout;
        if (currentLayout === MarkdownEditor.LAYOUT_MODES.BOTH) {
            updateSplitRatio(this.lastLeftRatio);
        }

        // 监听 layout/sidebars 变化
        this.#dividerInterfaceUnsubscribe = this.state.subscribeTo('interface', () =>
            recalculateSplitRatio()
        );

        // 悬停样式（仅视觉）
        divider.addEventListener('mouseenter', () => {
            if (!this.isDragging) divider.classList.add('hover');
        });
        divider.addEventListener('mouseleave', () => {
            if (!this.isDragging) divider.classList.remove('hover');
        });

        // 双击重置比例
        divider.addEventListener('dblclick', () => updateSplitRatio(0.5));

        // Pointer Events + rAF throttling. Use instance property for RAF id so it can be cancelled.
        this.#dragRafId = null;

        // Cache container rect/width on pointerdown and on resize to avoid repeated layout reads
        let cachedContainerRect = null;
        let cachedDividerWidth = divider.offsetWidth;

        const onPointerMove = e => {
            if (!this.isDragging) return;
            if (this.#dragRafId) return;
            this.#dragRafId = requestAnimationFrame(() => {
                const rect = cachedContainerRect || container.getBoundingClientRect();
                const containerWidth = rect.width;
                const dividerWidth = cachedDividerWidth || divider.offsetWidth;
                const availableWidth = Math.max(0, containerWidth - dividerWidth);
                if (availableWidth <= 0) {
                    this.#dragRafId = null;
                    return;
                }

                const min = MIN_WIDTH;
                const max = availableWidth - min;

                const rawLeft = e.clientX - rect.left;
                let left = Math.round(rawLeft);
                left = Math.max(min, Math.min(left, max));

                const ratio = left / availableWidth;
                updateSplitRatio(ratio);

                this.#dragRafId = null;
            });
        };

        const endDrag = e => {
            if (!this.isDragging) return;
            this.isDragging = false;
            divider.classList.remove('dragging', 'hover');
            document.body.classList.remove('is-dragging');
            container.classList.remove('is-resizing');

            if (this.#dragRafId) {
                cancelAnimationFrame(this.#dragRafId);
                this.#dragRafId = null;
            }

            updateSplitRatio(this.lastLeftRatio);

            try {
                if (e?.pointerId && divider.releasePointerCapture)
                    divider.releasePointerCapture(e.pointerId);
            } catch (_err) { }

            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', endDrag);
            window.removeEventListener('pointercancel', endDrag);
        };

        const onPointerDown = e => {
            this.isDragging = true;
            divider.classList.add('dragging');
            divider.classList.remove('hover');
            document.body.classList.add('is-dragging');
            container.classList.add('is-resizing');
            // Ensure CSS split mode is active when starting drag
            if (!container.classList.contains('has-split-ratio')) {
                container.classList.add('has-split-ratio');
                container.style.setProperty('--split-ratio', this.lastLeftRatio);
            }

            // Cache measurements for the drag session
            cachedContainerRect = container.getBoundingClientRect();
            cachedDividerWidth = divider.offsetWidth;

            try {
                if (divider.setPointerCapture) divider.setPointerCapture(e.pointerId);
            } catch (_err) { }

            window.addEventListener('pointermove', onPointerMove, { passive: true });
            window.addEventListener('pointerup', endDrag, { passive: true });
            window.addEventListener('pointercancel', endDrag, { passive: true });

            e.preventDefault();
        };

        divider.addEventListener('pointerdown', onPointerDown);

        const onResize = () => {
            if (this.#resizeTimeout) clearTimeout(this.#resizeTimeout);
            this.#resizeTimeout = setTimeout(() => {
                // Clear cached rect so next pointermove recalculates
                cachedContainerRect = null;
                cachedDividerWidth = divider.offsetWidth;
                recalculateSplitRatio();
            }, 100);
        };

        window.addEventListener('resize', onResize);

        // Save cleanup handles so destroy() can remove listeners
        this.#dividerCleanup = () => {
            divider.removeEventListener('pointerdown', onPointerDown);
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', endDrag);
            window.removeEventListener('pointercancel', endDrag);
            window.removeEventListener('resize', onResize);
        };
    }

    // ==================== 主题管理 ====================

    /**
     * 应用主题
     * @param mode
     */
    applyTheme(mode) {
        applyTheme(mode);
        // 同步更新 Monaco 编辑器主题（CSS 变量由 applyTheme 更新，Monaco 需单独通知）
        this.monacoEditor?.applyTheme(mode);
    }

    /**
     * 切换主题
     */
    toggleTheme() {
        this.applyTheme(this.state.toggleTheme());
    }

    // ==================== 布局管理 ====================

    /**
     * 切换布局模式
     */
    toggleLayout() {
        this.applyLayout(this.state.toggleLayout());
    }

    /**
     * 应用布局
     * @param {string} layout - 布局模式
     */
    applyLayout(layout) {
        const container = dom.get('.md-container');
        if (!container) return;

        const stateRatio = this.state.get('interface')?.leftRatio;
        if (typeof stateRatio === 'number') {
            this.lastLeftRatio = stateRatio;
        }

        // 移除所有布局类并添加新布局类
        container.classList.remove(
            MarkdownEditor.LAYOUT_MODES.EDITOR_ONLY,
            MarkdownEditor.LAYOUT_MODES.PREVIEW_ONLY,
            MarkdownEditor.LAYOUT_MODES.BOTH
        );
        container.classList.add(layout);

        // 清除分割比例类，让布局自适应
        container.classList.remove('has-split-ratio');

        // 如果切换到双面板模式，延迟一帧后重新应用保存的比例
        if (layout === MarkdownEditor.LAYOUT_MODES.BOTH) {
            requestAnimationFrame(() => {
                container.style.setProperty('--split-ratio', this.lastLeftRatio);
                container.classList.add('has-split-ratio');
            });
        }
    }

    // ==================== 事件绑定 ====================

    /**
     * 绑定事件
     */
    bindEvents() {
        // 统一的事件绑定辅助函数
        const bindButton = (id, handler) => {
            const element = dom.getById(id)?.element;
            if (element) element.onclick = handler;
        };

        // 侧边栏切换按钮
        bindButton('md-toggle-left-sidebar', () => this.state.toggleSidebar('left'));
        bindButton('md-toggle-right-sidebar', () => this.state.toggleSidebar('right'));

        // 搜索按钮
        bindButton('md-search-toggle-btn', () => this.openSearch());

        // 设置按钮
        bindButton('md-settings-btn', () => this.components.settings.open());

        // 布局和主题按钮
        bindButton('md-layout-toggle', () => this.toggleLayout());
        bindButton('theme-toggle', () => this.toggleTheme());

        // 同步滚动按钮
        const syncScrollButton = dom.getById('md-sync-scroll')?.element;
        if (syncScrollButton) {
            // 保存同步滚动图标引用
            this.#syncScrollIcon = dom.getIn(syncScrollButton, '.codicon');

            syncScrollButton.onclick = () => {
                this.syncScrollEnabled = !this.syncScrollEnabled;
                this.state.updateInterfaceConfig({ syncScrollEnabled: this.syncScrollEnabled });
                this.updateSyncScrollIcon(this.syncScrollEnabled);
            };
        }

        // 侧边栏遮罩
        bindButton('md-sidebar-overlay', () => this.state.closeAllSidebars());
    }

    /**
     * 更新同步滚动图标
     * @param {boolean} enabled - 是否启用同步滚动
     */
    updateSyncScrollIcon(enabled) {
        if (this.#syncScrollIcon) {
            this.#syncScrollIcon.classList.toggle('codicon-sync', enabled);
            this.#syncScrollIcon.classList.toggle('codicon-sync-ignored', !enabled);
        }
    }

    /**
     * 打开搜索面板
     */
    openSearch() {
        const editor = this.#getActiveEditor();
        if (editor && typeof editor.triggerSearch === 'function') {
            editor.triggerSearch();
        }
    }

    // ==================== 初始化 ====================

    /**
     * 初始化
     * @returns {Promise<void>}
     */
    async init() {
        if (this.isInitialized) return;

        await this.state.init();

        const iface = this.state.get('interface') || {};
        if (typeof iface.leftRatio === 'number') {
            this.lastLeftRatio = iface.leftRatio;
        }

        await this.initComponents();
        this.applyTheme(this.state.get('interface').theme);
        this.applyLayout(this.state.get('interface').layout ?? 'layout-both');
        this.bindEvents();
        this.setupDivider();
        this.setupSyncScroll();

        this.state.startPersistence();
        this.#subscribe();

        this.isInitialized = true;
    }

    /**
     * 订阅状态变化（应用到界面）
     * @private
     */
    #subscribe() {
        // 同步内容到编辑器
        this.#editorStateUnsubscribe = this.state.subscribeTo(['content', 'currentDocId'], () => {
            this.#getActiveEditor()?.setValue(this.state.get('content') || '', {
                emitUpdate: false
            });
        });

        // 同步编辑器配置到编辑器
        this.#editorConfigUnsubscribe = this.state.subscribeTo('editor', newEditor => {
            this.#getActiveEditor()?.updateConfig(newEditor, this.state.get('interface'));

            // 如果编辑器类型变化，切换编辑器
            if (newEditor.type && newEditor.type !== this.currentEditorType) {
                this.switchEditorType(newEditor.type);
            }
        });

        // 监听界面配置变化，应用到界面
        this.state.subscribeTo('interface', (newInterface, oldInterface) => {
            const hasOld = !!oldInterface;

            // 应用主题（只在主题变化时）
            if (!hasOld || newInterface.theme !== oldInterface.theme) {
                this.applyTheme(newInterface.theme ?? 'light');
            }

            this.#getActiveEditor()?.updateConfig(this.state.get('editor'), newInterface);

            // 应用布局（只在布局变化时）
            if (!hasOld || newInterface.layout !== oldInterface.layout) {
                const container = dom.get('.md-container');
                if (container) {
                    container.classList.remove(
                        MarkdownEditor.LAYOUT_MODES.BOTH,
                        MarkdownEditor.LAYOUT_MODES.EDITOR_ONLY,
                        MarkdownEditor.LAYOUT_MODES.PREVIEW_ONLY
                    );
                    container.classList.add(
                        newInterface.layout ?? MarkdownEditor.LAYOUT_MODES.BOTH
                    );
                }
            }
        });

        // 监听通知状态变化，显示消息
        this.state.subscribeTo('notification', notification => {
            if (notification) {
                this.showMessage(notification.message, notification.type);
                this.state.clearNotification();
            }
        });
    }

    /**
     * 清理资源
     */
    destroy() {
        // 清理定时器
        if (this.#editorInputTimer) {
            clearTimeout(this.#editorInputTimer);
            this.#editorInputTimer = null;
        }

        if (this.#resizeTimeout) {
            clearTimeout(this.#resizeTimeout);
            this.#resizeTimeout = null;
        }

        // 清理状态订阅
        if (this.#editorStateUnsubscribe) {
            this.#editorStateUnsubscribe();
            this.#editorStateUnsubscribe = null;
        }

        if (this.#editorConfigUnsubscribe) {
            this.#editorConfigUnsubscribe();
            this.#editorConfigUnsubscribe = null;
        }

        if (this.#dividerInterfaceUnsubscribe) {
            this.#dividerInterfaceUnsubscribe();
            this.#dividerInterfaceUnsubscribe = null;
        }

        // 清理编辑器
        this.#destroyCurrentEditor();

        // 清理同步滚动
        this.#cleanupSyncScroll();

        // 清理 DOM 引用
        this.#syncScrollIcon = null;

        // 清理拖拽 rAF
        if (this.#dragRafId) {
            cancelAnimationFrame(this.#dragRafId);
            this.#dragRafId = null;
        }

        // 移除分隔条相关事件监听
        if (this.#dividerCleanup) {
            try {
                this.#dividerCleanup();
            } catch (err) {
                console.error('Error cleaning up divider:', err);
            }
            this.#dividerCleanup = null;
        }

        // 清理组件
        Object.values(this.components).forEach(component => {
            if (typeof component.destroy === 'function') {
                try {
                    component.destroy();
                } catch (err) {
                    console.error('Error destroying component:', err);
                }
            }
        });
        this.components = {};
        this.workspaceManager.destroy();

        // 标记为未初始化
        this.isInitialized = false;
    }
}
