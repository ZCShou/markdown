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

        // 从本地存储加载同步滚动状态
        const savedSyncScroll = localStorage.getItem('md-sync-scroll');
        if (savedSyncScroll !== null) {
            this.syncScrollEnabled = savedSyncScroll === 'true';
        }
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
            this.syncScrollEnabled = !this.syncScrollEnabled;
            localStorage.setItem('md-sync-scroll', this.syncScrollEnabled);
            updateSyncScrollIcon(this.syncScrollEnabled);
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

        const MIN_WIDTH = 100; // 最小面板宽度
        let frameCount = 0; // 帧计数器，用于降低更新频率
        let lastUpdateTime = 0; // 上次更新时间

        // 更新分割比例（只更新 CSS 变量，让 CSS 自动处理布局）
        const updateSplitRatio = ratio => {
            container.style.setProperty('--split-ratio', ratio);
            container.classList.add('has-split-ratio');
            this.lastLeftRatio = ratio;
        };

        // 清除分割比例（恢复自适应布局）
        const clearSplitRatio = () => {
            container.classList.remove('has-split-ratio');
        };

        // 重新计算分割比例（响应侧边栏变化）
        const recalculateSplitRatio = () => {
            const currentLayout = this.state.get('layout');
            if (currentLayout !== 'layout-both') {
                clearSplitRatio();
                return;
            }

            // 延迟一帧，确保侧边栏动画完成后再应用比例
            requestAnimationFrame(() => {
                updateSplitRatio(this.lastLeftRatio);
            });
        };

        // 初始化宽度（只在双面板模式下设置固定比例）
        const currentLayout = this.state.get('layout');
        if (currentLayout === 'layout-both') {
            updateSplitRatio(this.lastLeftRatio);
        }

        // 监听侧边栏状态变化，重新计算分割比例
        this.state.subscribeTo(['leftSidebarOpen', 'rightSidebarOpen'], () => {
            recalculateSplitRatio();
        });

        // 鼠标悬停效果
        divider.addEventListener('mouseenter', () => {
            if (!this.isDragging) divider.classList.add('hover');
        });

        divider.addEventListener('mouseleave', () => {
            if (!this.isDragging) divider.classList.remove('hover');
        });

        // 开始拖拽
        divider.addEventListener('mousedown', e => {
            this.isDragging = true;
            divider.classList.add('dragging');
            divider.classList.remove('hover');
            document.body.classList.add('is-dragging');

            // 添加拖拽优化类，启用 CSS 优化
            container.classList.add('is-resizing');

            // 重置计数器
            frameCount = 0;
            lastUpdateTime = performance.now();

            e.preventDefault();
        });

        // 双击重置为50%
        divider.addEventListener('dblclick', () => {
            updateSplitRatio(0.5);
        });

        // 拖拽过程（性能优化版：降低更新频率）
        document.addEventListener('mousemove', e => {
            if (!this.isDragging) return;

            if (this._dragRafId) return;

            this._dragRafId = requestAnimationFrame(() => {
                const now = performance.now();
                frameCount++;

                // 性能优化：每 3 帧更新一次，或者距离上次更新超过 16ms
                const shouldUpdate = frameCount % 3 === 0 || now - lastUpdateTime > 16;

                if (shouldUpdate) {
                    const containerRect = container.getBoundingClientRect();
                    const containerWidth = container.offsetWidth;
                    const dividerWidth = divider.offsetWidth;
                    const availableWidth = containerWidth - dividerWidth;

                    const minWidth = MIN_WIDTH;
                    const maxWidth = availableWidth - minWidth;
                    const leftWidth = Math.max(
                        minWidth,
                        Math.min(e.clientX - containerRect.left, maxWidth)
                    );

                    // 只更新 CSS 变量，CSS 自动处理布局
                    const ratio = leftWidth / availableWidth;
                    container.style.setProperty('--split-ratio', ratio);
                    this.lastLeftRatio = ratio;
                    lastUpdateTime = now;
                }

                this._dragRafId = null;
            });
        });

        // 结束拖拽
        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                divider.classList.remove('dragging', 'hover');
                document.body.classList.remove('is-dragging');

                // 移除拖拽优化类
                container.classList.remove('is-resizing');

                // 拖拽结束后，确保最终比例正确应用
                requestAnimationFrame(() => {
                    updateSplitRatio(this.lastLeftRatio);
                });
            }
        });

        // 窗口大小变化时重新计算
        window.addEventListener('resize', () => {
            if (this._resizeTimeout) clearTimeout(this._resizeTimeout);
            this._resizeTimeout = setTimeout(() => {
                recalculateSplitRatio();
            }, 100);
        });
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
        StoreManager.saveTheme(newMode);
        this.applyTheme(newMode);
    }

    /**
     * 初始化主题
     */
    initTheme() {
        const mode = this.state.get('theme');
        this.applyTheme(mode);
    }

    // ==================== 布局管理 ====================

    /**
     * 切换布局模式
     */
    toggleLayout() {
        const newLayout = this.state.toggleLayout();
        StoreManager.saveLayout(newLayout);
        this.applyLayout(newLayout);
    }

    /**
     * 应用布局
     * @param layout
     */
    applyLayout(layout) {
        const container = dom.app.container?.element;
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
        const layout = this.state.get('layout');
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
                const currentDocId = this.state.get('currentDocId');
                const documents = this.state.get('documents');
                const currentDoc = documents.find(d => d.id === currentDocId);
                const parentId = currentDoc?.type === 'folder' ? currentDocId : null;
                this.components.documentList.createItem('file', parentId);
            },
            'md-new-folder': () => {
                const currentDocId = this.state.get('currentDocId');
                const documents = this.state.get('documents');
                const currentDoc = documents.find(d => d.id === currentDocId);
                const parentId = currentDoc?.type === 'folder' ? currentDocId : null;
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

        // 监听消息显示事件
        window.addEventListener('md:showMessage', e => {
            const { message, type, duration } = e.detail;
            this.showMessage(message, type, duration);
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
     * @param {boolean} save - 是否保存到 localStorage
     */
    #processImportBatch(docs, mode, save) {
        const currentDocs = this.state.get('documents');
        const newDocuments = mode === 'replace'
            ? docs
            : this.#mergeDocuments(currentDocs, docs);

        // 更新状态
        this.state.setState({ documents: newDocuments }, { silent: !save });

        // 保存到 localStorage
        if (save) {
            StoreManager.saveDocuments(newDocuments);
        }
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
     * @returns {{currentDocId: string|null, content: string}}
     */
    #getInitialDocument(documents) {
        const savedDocId = StoreManager.loadCurrentDocId();

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

        // 没有文档，使用保存的内容
        return {
            currentDocId: null,
            content: StoreManager.loadContent(StoreManager.DEFAULT_CONTENT)
        };
    }

    /**
     * 初始化
     */
    init() {
        if (this.isInitialized) return;

        // 加载保存的数据
        const documents = StoreManager.loadDocuments();
        const theme = StoreManager.loadTheme('light');
        const layout = StoreManager.loadLayout() || 'layout-both';
        const leftSidebarOpen = StoreManager.loadSidebarState('left', false);
        const rightSidebarOpen = StoreManager.loadSidebarState('right', false);

        // 加载区块状态
        const sections = {
            toc: !StoreManager.loadSectionState('toc', false),
            export: !StoreManager.loadSectionState('export', false)
        };

        const { currentDocId, content } = this.#getInitialDocument(documents);

        // 设置初始状态
        this.state.setState({
            documents,
            content,
            theme,
            layout,
            currentDocId,
            selectedDocIds: currentDocId ? [currentDocId] : [],
            lastClickedDocId: currentDocId,
            leftSidebarOpen,
            rightSidebarOpen,
            sections
        });
        StoreManager.saveDocuments(documents);

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

        this.isInitialized = true;
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
    }
}
