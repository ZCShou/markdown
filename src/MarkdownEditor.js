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
import { Editor } from './components/Editor.js';
import { LeftSidebar } from './components/LeftSidebar.js';
import { RightSidebar } from './components/RightSidebar.js';
import { SearchReplace } from './components/SearchReplace.js';
import { Settings } from './components/Settings.js';
import { dom } from './utils/dom.js';

// 导入 Prism 语言包
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-scala';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-toml';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-makefile';
import 'prismjs/components/prism-nginx';
import 'prismjs/components/prism-perl';
import 'prismjs/components/prism-lua';
import 'prismjs/components/prism-r';
import 'prismjs/components/prism-matlab';
import 'prismjs/components/prism-groovy';

/**
 *
 */
export class MarkdownEditor {
    // ==================== 配置常量 ====================

    /**
     * 防抖延迟配置（毫秒）
     * @type {Object}
     */
    static DEBOUNCE_DELAY = {
        UPDATE: 300, // 内容更新防抖延迟
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

        /** @type {number|null} resize 定时器 ID */
        this._resizeTimeout = null;

        /** @type {number|null} 拖拽 rAF ID */
        this._dragRafId = null;

        /** @type {Element|null} 同步滚动图标元素 */
        this._syncScrollIcon = null;
    }

    // ==================== 工具函数 ====================

    /**
     * 显示消息提示
     * @param message
     * @param type
     * @param duration
     */
    showMessage(message, type = 'info', duration = MarkdownEditor.UI_CONFIG.MESSAGE_DURATION) {
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

    // ==================== 组件初始化 ====================

    /**
     * 初始化所有组件
     */
    initComponents() {
        // 编辑器组件
        this.components.editor = new Editor(this.state, 'markdown-editor');

        // 预览组件
        this.components.preview = new Preview(this.state, 'markdown-preview');

        // 左侧边栏组件（包含文档树功能）
        this.components.leftSidebar = new LeftSidebar(this.state, 'md-sidebar-left');

        // 右侧边栏组件（包含目录功能）
        this.components.rightSidebar = new RightSidebar(this.state, 'md-sidebar-right');

        // 搜索替换组件
        this.components.searchReplace = new SearchReplace(this.state, 'md-search-replace-panel');

        // 设置组件（传入 state 以实现状态同步）
        this.components.settings = new Settings(this.state);

        // 初始化所有组件
        Object.values(this.components).forEach(component => {
            component.init();
        });
    }

    // ==================== 同步滚动 ====================

    /**
     * 设置同步滚动（性能优化版 - 修复滚轮抖动）
     */
    setupSyncScroll() {
        const editor = dom.editor.element?.element;
        const previewWrapper = dom.preview.wrapper?.element;

        if (!editor || !previewWrapper) return;

        // 从状态管理器获取同步滚动状态
        const interfaceState = this.state.get('interface');
        this.syncScrollEnabled = interfaceState?.syncScrollEnabled ?? true;
        this.updateSyncScrollIcon(this.syncScrollEnabled);

        // 缓存可滚动高度，避免频繁查询 DOM
        let editorScrollableHeight = 0;
        let previewScrollableHeight = 0;
        let lastSyncTime = 0;
        const SYNC_DELAY = 50;

        // 更新缓存的滚动高度
        const updateScrollHeights = () => {
            editorScrollableHeight = Math.max(0, editor.scrollHeight - editor.clientHeight);
            previewScrollableHeight = Math.max(
                0,
                previewWrapper.scrollHeight - previewWrapper.clientHeight
            );
        };

        // 初始化缓存
        updateScrollHeights();

        // 监听内容变化，更新缓存
        const resizeObserver = new ResizeObserver(updateScrollHeights);
        resizeObserver.observe(editor);
        resizeObserver.observe(previewWrapper);

        // 内容或文档切换后刷新滚动高度
        this._syncScrollStateUnsubscribe = this.state.subscribeTo(
            ['content', 'currentDocId'],
            () => {
                requestAnimationFrame(updateScrollHeights);
                setTimeout(updateScrollHeights, 120);
            }
        );

        // 统一的滚动处理函数（消除重复代码）
        const handleScroll = (source, target, sourceHeight, targetHeight) => {
            if (!this.syncScrollEnabled || this.isSyncing) return;
            
            updateScrollHeights();
            if (sourceHeight <= 0 || targetHeight <= 0) return;

            const now = performance.now();
            if (now - lastSyncTime < SYNC_DELAY) return;

            this.isSyncing = true;
            const scrollRatio = source.scrollTop / sourceHeight;
            target.scrollTop = scrollRatio * targetHeight;
            lastSyncTime = now;

            requestAnimationFrame(() => {
                this.isSyncing = false;
            });
        };

        // 编辑器滚动时同步预览
        editor.addEventListener('scroll', () => {
            handleScroll(editor, previewWrapper, editorScrollableHeight, previewScrollableHeight);
        }, { passive: true });

        // 预览滚动时同步编辑器
        previewWrapper.addEventListener('scroll', () => {
            handleScroll(previewWrapper, editor, previewScrollableHeight, editorScrollableHeight);
        }, { passive: true });

        // 保存 observer 引用，用于清理
        this._syncScrollResizeObserver = resizeObserver;
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

            container.style.setProperty('--split-ratio', String(clamped));
            container.classList.add('has-split-ratio');
            this.lastLeftRatio = clamped;

            // 不再设置内联样式，让 CSS 通过 --split-ratio 变量自动处理
            // 这样可以避免滚动条出现时的布局问题
        };

        const clearSplitRatio = () => {
            container.classList.remove('has-split-ratio');
        };

        const recalculateSplitRatio = () => {
            const currentLayout = this.state.get('interface').layout;
            if (currentLayout !== 'layout-both') {
                clearSplitRatio();
                return;
            }
            // Defer to next frame
            requestAnimationFrame(() => {
                updateSplitRatio(this.lastLeftRatio);
            });
        };

        // 初始化（依赖 CSS 处理布局）
        const currentLayout = this.state.get('interface').layout;
        if (currentLayout === 'layout-both') {
            updateSplitRatio(this.lastLeftRatio);
        }

        // 监听 layout/sidebars 变化
        this.state.subscribeTo('interface', () => recalculateSplitRatio());

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
        this._dragRafId = null;

        // Cache container rect/width on pointerdown and on resize to avoid repeated layout reads
        let cachedContainerRect = null;
        let cachedDividerWidth = divider.offsetWidth;

        const onPointerMove = (e) => {
            if (!this.isDragging) return;
            if (this._dragRafId) return;
            this._dragRafId = requestAnimationFrame(() => {
                const rect = cachedContainerRect || container.getBoundingClientRect();
                const containerWidth = rect.width;
                const dividerWidth = cachedDividerWidth || divider.offsetWidth;
                const availableWidth = Math.max(0, containerWidth - dividerWidth);
                if (availableWidth <= 0) {
                    this._dragRafId = null;
                    return;
                }

                const min = MIN_WIDTH;
                const max = availableWidth - min;

                const rawLeft = e.clientX - rect.left;
                let left = Math.round(rawLeft);
                left = Math.max(min, Math.min(left, max));

                const ratio = left / availableWidth;
                updateSplitRatio(ratio);

                this._dragRafId = null;
            });
        };

        const endDrag = (e) => {
            if (!this.isDragging) return;
            this.isDragging = false;
            divider.classList.remove('dragging', 'hover');
            document.body.classList.remove('is-dragging');
            container.classList.remove('is-resizing');

            if (this._dragRafId) {
                cancelAnimationFrame(this._dragRafId);
                this._dragRafId = null;
            }

            updateSplitRatio(this.lastLeftRatio);

            try {
                if (e?.pointerId && divider.releasePointerCapture) divider.releasePointerCapture(e.pointerId);
            } catch (_err) {}

            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', endDrag);
            window.removeEventListener('pointercancel', endDrag);
        };

        const onPointerDown = (e) => {
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
            } catch (_err) {}

            window.addEventListener('pointermove', onPointerMove, { passive: true });
            window.addEventListener('pointerup', endDrag, { passive: true });
            window.addEventListener('pointercancel', endDrag, { passive: true });

            e.preventDefault();
        };

        divider.addEventListener('pointerdown', onPointerDown);

        const onResize = () => {
            if (this._resizeTimeout) clearTimeout(this._resizeTimeout);
            this._resizeTimeout = setTimeout(() => {
                // Clear cached rect so next pointermove recalculates
                cachedContainerRect = null;
                cachedDividerWidth = divider.offsetWidth;
                recalculateSplitRatio();
            }, 100);
        };

        window.addEventListener('resize', onResize);

        // Save cleanup handles so destroy() can remove listeners
        this._dividerCleanup = () => {
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
        const html = document.documentElement;
        html.dataset.mode = mode;

        // 更新主题颜色
        const themeColorMeta = document.querySelector('meta[name="theme-color"]');
        if (themeColorMeta) {
            themeColorMeta.content = mode === 'dark' ? '#1e1e1e' : '#f0f0f0';
        }
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
     * @param layout
     */
    applyLayout(layout) {
        const container = dom.get('.markdown-container');
        if (!container) return;

        // 移除所有布局类并添加新布局类
        container.classList.remove('layout-editor-only', 'layout-preview-only', 'layout-both');
        container.classList.add(layout);

        // 清除分割比例类，让布局自适应
        container.classList.remove('has-split-ratio');

        // 如果切换到双面板模式，延迟一帧后重新应用保存的比例
        if (layout === 'layout-both') {
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
        bindButton('md-search-toggle-btn', () => this.state.showSearchReplace(false));

        // 设置按钮
        bindButton('md-settings-btn', () => this.components.settings.open());

        // 布局和主题按钮
        bindButton('md-layout-toggle', () => this.toggleLayout());
        bindButton('theme-toggle', () => this.toggleTheme());

        // 同步滚动按钮
        const syncScrollButton = dom.getById('md-sync-scroll')?.element;
        if (syncScrollButton) {
            // 保存同步滚动图标引用
            this._syncScrollIcon = dom.getIn(syncScrollButton, '.codicon');
            
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
        if (this._syncScrollIcon) {
            this._syncScrollIcon.classList.toggle('codicon-sync', enabled);
            this._syncScrollIcon.classList.toggle('codicon-sync-ignored', !enabled);
        }
    }

    // ==================== 初始化 ====================

    /**
     * 初始化
     */
    init() {
        if (this.isInitialized) return;

        this.state.init();

        this.initComponents();
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
        // 监听界面配置变化，应用到界面
        this.state.subscribeTo('interface', (newInterface, oldInterface) => {
            const hasOld = !!oldInterface;
            
            // 应用主题（只在主题变化时）
            if (!hasOld || newInterface.theme !== oldInterface.theme) {
                this.applyTheme(newInterface.theme ?? 'light');
                this.components.preview?.updateMermaidTheme();
            }

            // 应用布局（只在布局变化时）
            if (!hasOld || newInterface.layout !== oldInterface.layout) {
                const container = dom.get('.markdown-container');
                if (container) {
                    container.classList.remove('layout-both', 'layout-editor-only', 'layout-preview-only');
                    container.classList.add(newInterface.layout ?? 'layout-both');
                }
            }
        });

        // 监听通知状态变化，显示消息
        this.state.subscribeTo('notification', (notification) => {
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
        // 清理同步滚动的 ResizeObserver
        if (this._syncScrollResizeObserver) {
            this._syncScrollResizeObserver.disconnect();
            this._syncScrollResizeObserver = null;
        }

        if (this._syncScrollStateUnsubscribe) {
            this._syncScrollStateUnsubscribe();
            this._syncScrollStateUnsubscribe = null;
        }

        // 清理 resize 定时器
        if (this._resizeTimeout) {
            clearTimeout(this._resizeTimeout);
            this._resizeTimeout = null;
        }

        // 清理拖拽 rAF
        if (this._dragRafId) {
            cancelAnimationFrame(this._dragRafId);
            this._dragRafId = null;
        }

        // 移除分隔条相关事件监听
        if (this._dividerCleanup) {
            try {
                this._dividerCleanup();
            } catch (_err) {}
            this._dividerCleanup = null;
        }
    }
}
