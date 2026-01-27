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
import { EditorState } from './state.js';
import { DocumentList } from '../components/DocumentList.js';
import { Preview } from '../components/Preview.js';
import { Editor } from '../components/Editor.js';
import { Sidebar } from '../components/Sidebar.js';
import { TOC } from '../components/TOC.js';
import { Dialog } from '../components/Dialog.js';
import { SearchReplace } from '../components/SearchReplace.js';
import { Settings } from '../components/Settings.js';
import { StoreManager } from './store.js';
import { dom } from '../utils/dom.js';

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

        /** @type {boolean} 是否取消导入操作 */
        this.importCancelled = false;

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

        // 文档列表组件
        this.components.documentList = new DocumentList(this.state, 'md-doc-list');

        // 左侧边栏组件
        this.components.leftSidebar = new Sidebar(this.state, 'md-sidebar-left', 'left');

        // 右侧边栏组件
        this.components.rightSidebar = new Sidebar(this.state, 'md-sidebar-right', 'right');

        // 目录组件
        this.components.toc = new TOC(this.state, 'md-toc');

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
        const syncScrollButton = dom.getById('md-sync-scroll')?.element;
        // 使用 dom.js 统一查询
        const syncScrollIcon = syncScrollButton ? dom.getIn(syncScrollButton, '.codicon') : null;

        if (!editor || !previewWrapper || !syncScrollButton || !syncScrollIcon) return;

        // 更新同步滚动图标
        const updateSyncScrollIcon = enabled => {
            if (enabled) {
                syncScrollIcon.classList.remove('codicon-sync-ignored');
                syncScrollIcon.classList.add('codicon-sync');
            } else {
                syncScrollIcon.classList.remove('codicon-sync');
                syncScrollIcon.classList.add('codicon-sync-ignored');
            }
        };

        // 从状态管理器获取同步滚动状态
        const interfaceState = this.state.get('interface');
        this.syncScrollEnabled = interfaceState?.syncScrollEnabled ?? true;
        updateSyncScrollIcon(this.syncScrollEnabled);

        // 缓存可滚动高度，避免频繁查询 DOM
        let editorScrollableHeight = 0;
        let previewScrollableHeight = 0;
        let scrollSyncRafId = null;
        let heightUpdateRafId = null;
        let lastSyncTime = 0;

        // 更新缓存的滚动高度
        const updateScrollHeights = () => {
            editorScrollableHeight = Math.max(0, editor.scrollHeight - editor.clientHeight);
            previewScrollableHeight = Math.max(
                0,
                previewWrapper.scrollHeight - previewWrapper.clientHeight
            );
        };

        // 在下一帧更新滚动高度，保证渲染完成后获取到最新尺寸
        const scheduleHeightUpdate = () => {
            if (heightUpdateRafId) {
                cancelAnimationFrame(heightUpdateRafId);
            }
            heightUpdateRafId = requestAnimationFrame(() => {
                updateScrollHeights();
                heightUpdateRafId = null;
            });
        };

        // 初始化缓存
        updateScrollHeights();

        // 监听内容变化，更新缓存
        const resizeObserver = new ResizeObserver(() => {
            updateScrollHeights();
        });
        resizeObserver.observe(editor);
        resizeObserver.observe(previewWrapper);

        // 内容或文档切换后刷新滚动高度，避免初次文档无滚动条导致缓存为 0
        this._syncScrollStateUnsubscribe = this.state.subscribeTo(
            ['content', 'currentDocId'],
            () => {
                scheduleHeightUpdate();
                // 再补一轮延迟刷新，确保预览渲染完成
                setTimeout(updateScrollHeights, 120);
            }
        );

        // 监听按钮点击
        syncScrollButton.addEventListener('click', () => {
            const newEnabled = !this.syncScrollEnabled;
            this.syncScrollEnabled = newEnabled;
            // 通过状态管理器更新（会自动持久化）
            this.state.updateInterfaceConfig({ syncScrollEnabled: newEnabled });
            updateSyncScrollIcon(newEnabled);
        });

        // 优化的同步函数：使用更激进的节流
        const syncScroll = (source, target, sourceHeight, targetHeight) => {
            const now = performance.now();
            const SYNC_DELAY = 50; // 增加到 50ms，减少滚轮抖动

            // 距离上次同步太近，跳过
            if (now - lastSyncTime < SYNC_DELAY) {
                return false;
            }

            // 取消之前的待处理同步
            if (scrollSyncRafId) {
                cancelAnimationFrame(scrollSyncRafId);
                scrollSyncRafId = null;
            }

            // 立即同步，不等待 rAF
            const scrollRatio = source.scrollTop / sourceHeight;
            target.scrollTop = scrollRatio * targetHeight;
            lastSyncTime = now;

            return true;
        };

        // 编辑器滚动时同步预览
        editor.addEventListener(
            'scroll',
            () => {
                if (!this.syncScrollEnabled || this.isSyncing) return;
                updateScrollHeights();
                if (editorScrollableHeight <= 0 || previewScrollableHeight <= 0) return;

                this.isSyncing = true;
                const synced = syncScroll(
                    editor,
                    previewWrapper,
                    editorScrollableHeight,
                    previewScrollableHeight
                );

                if (synced) {
                    // 使用 requestAnimationFrame 确保在下一帧重置
                    requestAnimationFrame(() => {
                        this.isSyncing = false;
                    });
                } else {
                    this.isSyncing = false;
                }
            },
            { passive: true }
        );

        // 预览滚动时同步编辑器
        previewWrapper.addEventListener(
            'scroll',
            () => {
                if (!this.syncScrollEnabled || this.isSyncing) return;
                updateScrollHeights();
                if (editorScrollableHeight <= 0 || previewScrollableHeight <= 0) return;

                this.isSyncing = true;
                const synced = syncScroll(
                    previewWrapper,
                    editor,
                    previewScrollableHeight,
                    editorScrollableHeight
                );

                if (synced) {
                    // 使用 requestAnimationFrame 确保在下一帧重置
                    requestAnimationFrame(() => {
                        this.isSyncing = false;
                    });
                } else {
                    this.isSyncing = false;
                }
            },
            { passive: true }
        );

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

        // Cache frequently used elements to minimize DOM queries in hot path
        const editorPane = container.querySelector('.markdown-editor-pane');
        const previewPane = container.querySelector('.markdown-preview-pane');

        const updateSplitRatio = ratio => {
            const clamped = Math.max(0, Math.min(1, Number(ratio)));
            // Avoid unnecessary updates when ratio hasn't changed much
            if (Math.abs(clamped - this.lastLeftRatio) < 1e-6) return;

            container.style.setProperty('--split-ratio', String(clamped));
            container.classList.add('has-split-ratio');
            this.lastLeftRatio = clamped;

            if (editorPane && previewPane) {
                const leftPct = (clamped * 100).toFixed(4) + '%';
                const rightPct = ((1 - clamped) * 100).toFixed(4) + '%';
                editorPane.style.flex = `0 0 ${leftPct}`;
                previewPane.style.flex = `0 0 ${rightPct}`;
                editorPane.style.maxWidth = `calc(${leftPct} - 4px)`;
                previewPane.style.maxWidth = `calc(${rightPct})`;
            }
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
            } catch (err) {}

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
            } catch (err) {}

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
        // 通过设置 data-mode 属性，CSS 会自动应用对应的主题样式
        document.documentElement.dataset.mode = mode;
    }

    /**
     * 切换主题
     */
    toggleTheme() {
        const newMode = this.state.toggleTheme();
        this.applyTheme(newMode);
    }

    /**
     * 初始化主题
     */
    initTheme() {
        const mode = this.state.get('interface').theme;
        this.applyTheme(mode);
    }

    // ==================== 布局管理 ====================

    /**
     * 切换布局模式
     */
    toggleLayout() {
        const newLayout = this.state.toggleLayout();
        this.applyLayout(newLayout);
    }

    /**
     * 应用布局
     * @param layout
     */
    applyLayout(layout) {
        const container = dom.get('.markdown-container');
        if (!container) return;

        const layouts = ['layout-editor-only', 'layout-preview-only', 'layout-both'];

        // 移除所有布局类
        layouts.forEach(l => container.classList.remove(l));
        // 添加新布局类
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

    /**
     * 初始化布局
     */
    initLayout() {
        const interfaceState = this.state.get('interface');
        const layout = interfaceState?.layout ?? 'layout-both';
        this.applyLayout(layout);
    }

    // ==================== 事件绑定 ====================

    /**
     * 绑定事件
     */
    bindEvents() {
        // 侧边栏按钮
        const sidebarButtons = {
            'md-toggle-left-sidebar': () => this.components.leftSidebar.toggle(),
            'md-toggle-right-sidebar': () => this.components.rightSidebar.toggle(),
            'md-close-left-sidebar': () => this.components.leftSidebar.toggle(),
            'md-close-right-sidebar': () => this.components.rightSidebar.toggle(),
            'md-sidebar-overlay': () => this.state.closeAllSidebars()
        };

        Object.entries(sidebarButtons).forEach(([id, handler]) => {
            const element = dom.getById(id)?.element;
            if (element) element.onclick = handler;
        });

        // 文档操作按钮
        const docButtons = {
            'md-new-file': () => {
                const selectedDocIds = this.state.get('selectedDocIds') || [];
                const documents = this.state.get('documents');
                // 如果有选中的文件夹，在第一个选中的文件夹中创建；否则在根目录创建
                const selectedFolder = selectedDocIds.length > 0
                    ? documents.find(d => d.id === selectedDocIds[0] && d.type === 'folder')
                    : null;
                const parentId = selectedFolder ? selectedFolder.id : null;
                this.components.documentList.createItem('file', parentId);
            },
            'md-new-folder': () => {
                const selectedDocIds = this.state.get('selectedDocIds') || [];
                const documents = this.state.get('documents');
                // 如果有选中的文件夹，在第一个选中的文件夹中创建；否则在根目录创建
                const selectedFolder = selectedDocIds.length > 0
                    ? documents.find(d => d.id === selectedDocIds[0] && d.type === 'folder')
                    : null;
                const parentId = selectedFolder ? selectedFolder.id : null;
                this.components.documentList.createItem('folder', parentId);
            },
            'md-import-docs': () => this.importDocuments(),
            'md-export-docs': () => this.exportDocuments(),
            'md-delete-item': () => this.components.documentList.deleteCurrentItem(),
            'md-export-html': () => this.components.preview.exportHTML(),
            'md-export-md': () => this.components.preview.exportMarkdown(),
            'md-search-toggle-btn': () => this.components.searchReplace.show(false),
            'md-export-pdf': () => this.components.preview.exportPDF(),
            'md-layout-toggle': () => this.toggleLayout(),
            'theme-toggle': () => this.toggleTheme()
        };

        Object.entries(docButtons).forEach(([id, handler]) => {
            const element = dom.getById(id)?.element;
            if (element) element.onclick = handler;
        });

        // 全局快捷键
        this.setupGlobalShortcuts();
    }

    /**
     * 设置全局快捷键
     */
    setupGlobalShortcuts() {
        document.addEventListener('keydown', (e) => {
            // Ctrl/Cmd + F - 搜索
            if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
                e.preventDefault();
                this.components.searchReplace.show(false);
                return;
            }

            // Ctrl/Cmd + H - 替换
            if ((e.ctrlKey || e.metaKey) && e.key === 'h') {
                e.preventDefault();
                this.components.searchReplace.show(true);
                return;
            }

            // Escape - 关闭搜索面板
            if (e.key === 'Escape' && this.components.searchReplace.isVisible()) {
                this.components.searchReplace.hide();
                return;
            }
        });
    }

    // ==================== 文档导入导出 ====================

    /**
     * 导出所有文档（性能优化版）
     */
    exportDocuments() {
        const documents = this.state.get('documents');
        if (!documents?.length) {
            this.showMessage('没有可导出的文档', 'warning');
            return;
        }

        try {
            // 直接序列化和下载，减少不必要的进度提示
            const blob = new Blob(
                [JSON.stringify({
                    version: '1.0',
                    exportDate: new Date().toISOString(),
                    documents
                }, null, 2)],
                { type: 'application/json' }
            );

            // 使用一次性下载链接
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `markdown-docs-${new Date().toLocaleDateString()}.json`;
            a.click();

            // 延迟清理，确保下载开始
            setTimeout(() => URL.revokeObjectURL(a.href), 100);

            this.showMessage(`成功导出 ${documents.length} 个文档`, 'success');
        } catch (error) {
            this.showMessage('导出文档失败', 'error');
        }
    }

    /**
     * 导入文档（性能优化版）
     */
    importDocuments() {
        // 重置取消标志
        this.importCancelled = false;

        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';

        input.onchange = (e) => {
            const file = e.target.files?.[0];
            if (!file) return;

            // 检查文件大小（限制 50MB）
            const MAX_FILE_SIZE = 50 * 1024 * 1024;
            if (file.size > MAX_FILE_SIZE) {
                this.showMessage('文件过大（超过 50MB），无法导入', 'error');
                input.remove();
                return;
            }

            // 使用 FileReader 异步读取
            const reader = new FileReader();

            reader.onload = async (e) => {
                if (this.importCancelled) {
                    input.remove();
                    return;
                }

                try {
                    const text = e.target?.result;
                    if (!text || typeof text !== 'string') {
                        throw new Error('文件读取失败');
                    }

                    // 验证文件
                    const importData = this.#validateImportFile(text);
                    if (!importData) {
                        this.showMessage('导入已取消', 'info');
                        return;
                    }

                    // 询问导入方式
                    const importMode = await this.#askImportMode(importData.documents.length);
                    if (!importMode || this.importCancelled) {
                        this.showMessage('导入已取消', 'info');
                        return;
                    }

                    // 执行导入
                    await this.#executeImport(importData.documents, importMode);
                } catch (error) {
                    this.showMessage(`导入失败：${error.message}`, 'error');
                } finally {
                    input.remove();
                }
            };

            reader.onerror = () => {
                this.showMessage('文件读取失败', 'error');
                input.remove();
            };

            // 开始读取文件
            reader.readAsText(file);
        };

        input.click();
    }

    /**
     * 验证导入文件（性能优化版）
     * @private
     * @param {string} text - 文件内容
     * @returns {Object|null} 验证通过返回数据，否则返回 null
     */
    #validateImportFile(text) {
        try {
            const data = JSON.parse(text);

            // 快速验证：检查必要字段
            if (!Array.isArray(data?.documents)) {
                throw new Error('文件格式无效：缺少文档列表');
            }

            // 检查文档数量限制
            const MAX_DOCS = 10000;
            if (data.documents.length > MAX_DOCS) {
                throw new Error(`文档数量过多（超过 ${MAX_DOCS} 个），无法导入`);
            }

            // 抽样验证以提高性能
            const sampleSize = Math.min(100, data.documents.length);
            for (let i = 0; i < sampleSize; i++) {
                const doc = data.documents[i];
                if (!doc.id || !doc.name || !doc.type) {
                    throw new Error('文件格式无效：文档数据不完整');
                }
            }

            return data;
        } catch (error) {
            if (error instanceof SyntaxError) {
                this.showMessage('文件解析失败：不是有效的 JSON 文件', 'error');
            } else {
                this.showMessage(error.message, 'error');
            }
            return null;
        }
    }

    /**
     * 执行导入操作（性能优化版）
     * @private
     * @param {Array} importDocs - 要导入的文档
     * @param {string} mode - 导入模式：'replace' | 'merge'
     */
    async #executeImport(importDocs, mode) {
        const BATCH_SIZE = 100;
        const totalDocs = importDocs.length;

        // 检查是否取消
        if (this.#checkCancelled()) return;

        // 如果文档数量较少，直接处理
        if (totalDocs <= BATCH_SIZE) {
            this.#processImportBatch(importDocs, mode, true);
            const modeText = mode === 'replace' ? '替换' : '合并';
            this.showMessage(`成功${modeText}导入 ${totalDocs} 个文档`, 'success');
            return;
        }

        // 分批处理大量文档
        for (let i = 0; i < totalDocs; i += BATCH_SIZE) {
            if (this.#checkCancelled()) {
                this.showMessage('导入已取消', 'info');
                return;
            }

            const batch = importDocs.slice(i, Math.min(i + BATCH_SIZE, totalDocs));
            
            // 处理当前批次
            if (i === 0) {
                this.#processImportBatch(batch, mode, true);
            } else {
                this.#processImportBatch(batch, 'merge', false);
            }

            // 每 5 批显示一次进度，减少 UI 更新
            if ((i / BATCH_SIZE) % 5 === 0) {
                const processed = Math.min(i + BATCH_SIZE, totalDocs);
                this.showMessage(`正在导入 ${processed}/${totalDocs}...`, 'info', 0);
                // 让出主线程，避免阻塞 UI
                await new Promise(resolve => queueMicrotask(resolve));
            }
        }

        const modeText = mode === 'replace' ? '替换' : '合并';
        this.showMessage(`成功${modeText}导入 ${totalDocs} 个文档`, 'success');
    }

    /**
     * 检查是否取消（优化版）
     * @private
     * @returns {boolean} 是否已取消
     */
    #checkCancelled() {
        return this.importCancelled;
    }

    /**
     * 处理导入批次
     * @private
     * @param {Array} docs - 要处理的文档
     * @param {string} mode - 导入模式
     * @param {boolean} notify - 是否通知监听器
     */
    #processImportBatch(docs, mode, notify) {
        const currentDocs = this.state.get('documents');
        const newDocuments = mode === 'replace'
            ? docs
            : this.#mergeDocuments(currentDocs, docs);

        // 更新状态（会自动持久化）
        this.state.setState({ documents: newDocuments }, { silent: !notify });
    }

    /**
     * 合并文档列表（优化版：使用 Map 提升性能）
     * @private
     * @param {Array} currentDocs - 当前文档
     * @param {Array} importDocs - 导入文档
     * @returns {Array} 合并后的文档
     */
    #mergeDocuments(currentDocs, importDocs) {
        // 使用 Map 快速查找，时间复杂度从 O(n²) 降到 O(n)
        const docMap = new Map(currentDocs.map(doc => [doc.id, doc]));
        let addedCount = 0;

        for (const doc of importDocs) {
            if (!docMap.has(doc.id)) {
                docMap.set(doc.id, doc);
                addedCount++;
            }
        }

        // 如果没有新文档，提示用户
        if (addedCount === 0) {
            this.showMessage('所有文档已存在，无需导入', 'info');
        }

        return Array.from(docMap.values());
    }

    /**
     * 询问用户导入模式（使用 Dialog 组件）
     * @private
     * @param {number} docCount - 文档数量
     * @returns {Promise<string|null>} 导入模式：'replace' | 'merge' | null
     */
    async #askImportMode(docCount) {
        const result = await Dialog.show({
            title: '导入文档',
            message: `检测到 <strong>${docCount}</strong> 个文档，请选择导入方式：`,
            type: 'info',
            buttons: [
                { text: '合并', value: 'merge', type: 'primary' },
                { text: '替换', value: 'replace', type: 'danger' }
            ],
            closeOnOverlay: true,
            closeOnEscape: true
        });

        return result;
    }

    // ==================== 初始化 ====================

    /**
     * 获取初始文档和内容
     * @param documents
     * @param savedDocId
     * @returns {{currentDocId: string|null, content: string}}
     */
    #getInitialDocument(documents, savedDocId) {
        // 尝试使用保存的文档 ID
        if (savedDocId) {
            const doc = documents.find(d => d.id === savedDocId && d.type !== 'folder');
            if (doc) {
                return { currentDocId: doc.id, content: doc.content || '' };
            }
        }

        // 选择第一个非文件夹文档
        const firstDoc = documents.find(d => d.type !== 'folder');
        if (firstDoc) {
            return { currentDocId: firstDoc.id, content: firstDoc.content || '' };
        }

        // 没有文档，使用默认内容
        return {
            currentDocId: null,
            content: EditorState.DEFAULT_CONTENT
        };
    }

    /**
     * 初始化
     */
    init() {
        if (this.isInitialized) return;

        // 从 EditorState 加载初始数据（已包含 localStorage 数据）
        const { documents, savedDocId, settings } = this.state.loadInitialState();
        const { currentDocId, content } = this.#getInitialDocument(documents, savedDocId);

        // 设置初始状态（skipPersist: true 避免重复保存）
        this.state.setState({
            documents,
            content,
            currentDocId,
            selectedDocIds: currentDocId ? [currentDocId] : [],
            lastClickedDocId: currentDocId,
            editor: settings.editor,
            interface: settings.interface,
            export: settings.export
        }, { skipPersist: true });

        // 初始化组件
        this.initComponents();
        this.initTheme();
        this.initLayout();
        this.bindEvents();
        this.setupDivider();
        this.setupSyncScroll();

        // 应用侧边栏区块状态
        this.components.leftSidebar.applySectionStates();
        this.components.rightSidebar.applySectionStates();

        // 启动自动持久化
        this.state.startPersistence();

        // 监听 state 变化，应用到 UI
        this.#setupUIUpdates();

        this.isInitialized = true;
    }

    /**
     * 设置 UI 更新（状态变化时应用到界面）
     * @private
     */
    #setupUIUpdates() {
        // 缓存 DOM 元素，避免重复查询
        let cachedElements = null;
        
        const getElements = () => {
            if (!cachedElements) {
                cachedElements = {
                    editor: dom.getById('markdown-editor')?.element,
                    container: dom.get('.markdown-container'),
                    leftSidebar: dom.get('.md-sidebar-left'),
                    rightSidebar: dom.get('.md-sidebar-right'),
                    editorSection: dom.get('.markdown-editor-pane'),
                    previewSection: dom.get('.markdown-preview-pane'),
                    tocSection: dom.get('.md-sidebar-section-toc'),
                    exportSection: dom.get('.md-sidebar-section-export')
                };
            }
            return cachedElements;
        };

        // 监听编辑器配置变化，应用到编辑器
        this.state.subscribeTo('editor', (newEditor) => {
            const editor = getElements().editor;
            if (editor) {
                editor.style.fontSize = `${newEditor.fontSize ?? 14}px`;
                editor.style.lineHeight = String(newEditor.lineHeight ?? 1.6);
            }
        });

        // 监听界面配置变化，应用到界面
        this.state.subscribeTo('interface', (newInterface, oldInterface) => {
            const els = getElements();
            
            // 应用主题（只在主题变化时）
            if (!oldInterface || newInterface.theme !== oldInterface.theme) {
                this.applyTheme(newInterface.theme ?? 'light');
            }

            // 应用布局（只在布局变化时）
            if (!oldInterface || newInterface.layout !== oldInterface.layout) {
                if (els.container) {
                    els.container.classList.remove('layout-both', 'layout-editor-only', 'layout-preview-only');
                    els.container.classList.add(newInterface.layout ?? 'layout-both');
                }
            }

            // 应用侧边栏状态（只在状态变化时）
            if (!oldInterface || newInterface.leftSidebarOpen !== oldInterface.leftSidebarOpen) {
                if (els.leftSidebar) {
                    els.leftSidebar.classList.toggle('open', newInterface.leftSidebarOpen);
                }
            }

            if (!oldInterface || newInterface.rightSidebarOpen !== oldInterface.rightSidebarOpen) {
                if (els.rightSidebar) {
                    els.rightSidebar.classList.toggle('open', newInterface.rightSidebarOpen);
                }
            }

            // 应用布局比例（只在双栏布局或比例变化时）
            if (newInterface.layout === 'layout-both') {
                if (els.editorSection && els.previewSection) {
                    const leftRatio = newInterface.leftRatio ?? 0.5;
                    els.editorSection.style.flex = `0 0 ${leftRatio * 100}%`;
                    els.previewSection.style.flex = `0 0 ${(1 - leftRatio) * 100}%`;
                }
            } else {
                // 非双栏布局时，清除 flex 样式
                if (els.editorSection) {
                    els.editorSection.style.flex = '';
                }
                if (els.previewSection) {
                    els.previewSection.style.flex = '';
                }
            }

            // 应用侧边栏区块状态（只在 sections 变化时）
            if (!oldInterface || newInterface.sections !== oldInterface.sections) {
                if (els.tocSection) {
                    els.tocSection.classList.toggle('hidden', !newInterface.sections?.toc);
                }
                if (els.exportSection) {
                    els.exportSection.classList.toggle('hidden', !newInterface.sections?.export);
                }
            }

            // 更新 Mermaid 主题（只在主题变化时）
            if (!oldInterface || newInterface.theme !== oldInterface.theme) {
                this.components.preview?.updateMermaidTheme();
            }
        });

        // 监听通知状态变化，显示消息
        this.state.subscribeTo('notification', (notification) => {
            if (notification) {
                const { message, type } = notification;
                this.showMessage(message, type);
                // 自动清除通知（避免重复显示）
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
            } catch (err) {}
            this._dividerCleanup = null;
        }
    }
}
