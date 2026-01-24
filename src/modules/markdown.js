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

export class MarkdownEditor {
    // ==================== 配置常量 ====================
    
    /**
     * 防抖延迟配置（毫秒）
     * @type {Object}
     */
    static DEBOUNCE_DELAY = {
        UPDATE: 300,   // 内容更新防抖延迟
        SAVE: 1000     // 自动保存防抖延迟
    };
    
    /**
     * 拖拽配置
     * @type {Object}
     */
    static DRAG_CONFIG = {
        MIN_WIDTH: 100,    // 最小面板宽度（像素）
        BATCH_SIZE: 10     // 批量处理大小
    };
    
    /**
     * UI 常量配置
     * @type {Object}
     */
    static UI_CONFIG = {
        MESSAGE_DURATION: 2000,      // 消息显示时长（毫秒）
        MERMAID_RENDER_DELAY: 100,   // Mermaid 渲染延迟（毫秒）
        MAX_CONTENT_LENGTH: 1000000  // 最大内容长度限制
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
    }

    // ==================== 工具函数 ====================
    
    /**
     * 显示消息提示
     */
    showMessage(message, type = 'info', duration = MarkdownEditor.UI_CONFIG.MESSAGE_DURATION) {
        console.log(`[${type.toUpperCase()}] ${message}`);
        
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
        const syncScrollIcon = syncScrollButton?.querySelector('.codicon');

        if (!editor || !previewWrapper || !syncScrollButton || !syncScrollIcon) return;

        // 更新同步滚动图标
        const updateSyncScrollIcon = (enabled) => {
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
            previewScrollableHeight = Math.max(0, previewWrapper.scrollHeight - previewWrapper.clientHeight);
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
        this._syncScrollStateUnsubscribe = this.state.subscribeTo(['content', 'currentDocId'], () => {
            scheduleHeightUpdate();
            // 再补一轮延迟刷新，确保预览渲染完成
            setTimeout(updateScrollHeights, 120);
        });

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
        editor.addEventListener('scroll', () => {
            if (!this.syncScrollEnabled || this.isSyncing) return;
            updateScrollHeights();
            if (editorScrollableHeight <= 0 || previewScrollableHeight <= 0) return;

            this.isSyncing = true;
            const synced = syncScroll(editor, previewWrapper, editorScrollableHeight, previewScrollableHeight);
            
            if (synced) {
                // 使用 requestAnimationFrame 确保在下一帧重置
                requestAnimationFrame(() => {
                    this.isSyncing = false;
                });
            } else {
                this.isSyncing = false;
            }
        }, { passive: true });

        // 预览滚动时同步编辑器
        previewWrapper.addEventListener('scroll', () => {
            if (!this.syncScrollEnabled || this.isSyncing) return;
            updateScrollHeights();
            if (editorScrollableHeight <= 0 || previewScrollableHeight <= 0) return;

            this.isSyncing = true;
            const synced = syncScroll(previewWrapper, editor, previewScrollableHeight, editorScrollableHeight);
            
            if (synced) {
                // 使用 requestAnimationFrame 确保在下一帧重置
                requestAnimationFrame(() => {
                    this.isSyncing = false;
                });
            } else {
                this.isSyncing = false;
            }
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

        const MIN_WIDTH = 100; // 最小面板宽度
        let frameCount = 0; // 帧计数器，用于降低更新频率
        let lastUpdateTime = 0; // 上次更新时间

        // 更新分割比例（只更新 CSS 变量，让 CSS 自动处理布局）
        const updateSplitRatio = (ratio) => {
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
        divider.addEventListener('mousedown', (e) => {
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
        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            
            if (this._dragRafId) return;
            
            this._dragRafId = requestAnimationFrame(() => {
                const now = performance.now();
                frameCount++;
                
                // 性能优化：每 3 帧更新一次，或者距离上次更新超过 16ms
                const shouldUpdate = frameCount % 3 === 0 || (now - lastUpdateTime) > 16;
                
                if (shouldUpdate) {
                    const containerRect = container.getBoundingClientRect();
                    const containerWidth = container.offsetWidth;
                    const dividerWidth = divider.offsetWidth;
                    const availableWidth = containerWidth - dividerWidth;

                    const minWidth = MIN_WIDTH;
                    const maxWidth = availableWidth - minWidth;
                    const leftWidth = Math.max(minWidth, Math.min(e.clientX - containerRect.left, maxWidth));

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
                const parentId = (currentDoc?.type === 'folder') ? currentDocId : null;
                this.components.documentList.createItem('file', parentId);
            },
            'md-new-folder': () => {
                const currentDocId = this.state.get('currentDocId');
                const documents = this.state.get('documents');
                const currentDoc = documents.find(d => d.id === currentDocId);
                const parentId = (currentDoc?.type === 'folder') ? currentDocId : null;
                this.components.documentList.createItem('folder', parentId);
            },
            'md-delete-item': () => this.components.documentList.deleteCurrentItem(),
            'md-export-html': () => this.components.preview.exportHTML(),
            'md-export-md': () => this.components.preview.exportMarkdown(),
            'md-export-pdf': () => this.components.preview.exportPDF(),
            'md-layout-toggle': () => this.toggleLayout(),
            'theme-toggle': () => this.toggleTheme()
        };

        Object.entries(docButtons).forEach(([id, handler]) => {
            const element = dom.getById(id)?.element;
            if (element) element.onclick = handler;
        });

        // 监听消息显示事件
        window.addEventListener('md:showMessage', (e) => {
            const { message, type, duration } = e.detail;
            this.showMessage(message, type, duration);
        });
    }

    // ==================== 初始化 ====================
    
    /**
     * 获取初始文档和内容
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
