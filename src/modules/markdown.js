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
            messageEl.className = 'status-message ' + type;
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
        const syncScrollCheckbox = dom.getById('md-sync-scroll')?.element;

        if (!editor || !previewWrapper || !syncScrollCheckbox) return;

        // 从本地存储加载同步滚动状态
        const savedSyncScroll = localStorage.getItem('md-sync-scroll');
        if (savedSyncScroll !== null) {
            this.syncScrollEnabled = savedSyncScroll === 'true';
            syncScrollCheckbox.checked = this.syncScrollEnabled;
        }

        // 缓存可滚动高度，避免频繁查询 DOM
        let editorScrollableHeight = 0;
        let previewScrollableHeight = 0;
        let rafId = null;
        let lastSyncTime = 0;

        // 更新缓存的滚动高度
        const updateScrollHeights = () => {
            editorScrollableHeight = editor.scrollHeight - editor.clientHeight;
            previewScrollableHeight = previewWrapper.scrollHeight - previewWrapper.clientHeight;
        };

        // 初始化缓存
        updateScrollHeights();

        // 监听内容变化，更新缓存
        const resizeObserver = new ResizeObserver(() => {
            updateScrollHeights();
        });
        resizeObserver.observe(editor);
        resizeObserver.observe(previewWrapper);

        // 监听复选框变化
        syncScrollCheckbox.addEventListener('change', (e) => {
            this.syncScrollEnabled = e.target.checked;
            localStorage.setItem('md-sync-scroll', this.syncScrollEnabled);
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
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
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
            if (editorScrollableHeight <= 0 || previewScrollableHeight <= 0) return;

            this.isSyncing = true;
            const synced = syncScroll(editor, previewWrapper, editorScrollableHeight, previewScrollableHeight);
            
            if (synced) {
                // 使用 setTimeout 而不是 rAF，避免延迟
                setTimeout(() => {
                    this.isSyncing = false;
                }, 50);
            } else {
                this.isSyncing = false;
            }
        }, { passive: true });

        // 预览滚动时同步编辑器
        previewWrapper.addEventListener('scroll', () => {
            if (!this.syncScrollEnabled || this.isSyncing) return;
            if (editorScrollableHeight <= 0 || previewScrollableHeight <= 0) return;

            this.isSyncing = true;
            const synced = syncScroll(previewWrapper, editor, previewScrollableHeight, editorScrollableHeight);
            
            if (synced) {
                setTimeout(() => {
                    this.isSyncing = false;
                }, 50);
            } else {
                this.isSyncing = false;
            }
        }, { passive: true });

        // 保存 observer 引用，用于清理
        this._syncScrollResizeObserver = resizeObserver;
    }

    // ==================== 分隔条拖拽 ====================
    
    /**
     * 设置拖拽分隔条（简化版）
     */
    setupDivider() {
        const divider = dom.divider.element?.element;
        const editorPane = dom.editor.pane?.element;
        const previewPane = dom.preview.pane?.element;
        const container = dom.app.container?.element;

        if (!divider || !editorPane || !previewPane || !container) return;

        const MIN_WIDTH = 100; // 最小面板宽度

        // 设置面板宽度
        const setPaneWidths = (ratio) => {
            const containerWidth = container.offsetWidth;
            const dividerWidth = divider.offsetWidth;
            const availableWidth = containerWidth - dividerWidth;
            
            const leftWidth = availableWidth * ratio;
            const rightWidth = availableWidth - leftWidth;

            editorPane.style.flex = '1 1 ' + leftWidth + 'px';
            editorPane.style.maxWidth = leftWidth + 'px';
            editorPane.classList.add('fixed-width');
            
            previewPane.style.flex = '1 1 ' + rightWidth + 'px';
            previewPane.style.maxWidth = rightWidth + 'px';
            previewPane.classList.add('fixed-width');
        };

        // 初始化宽度（只在双面板模式下设置固定宽度）
        const currentLayout = this.state.get('layout');
        if (currentLayout === 'layout-both') {
            setPaneWidths(this.lastLeftRatio);
        }

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
            e.preventDefault();
        });

        // 双击重置为50%
        divider.addEventListener('dblclick', () => {
            setPaneWidths(0.5);
            this.lastLeftRatio = 0.5;
        });

        // 拖拽过程（使用 rAF 节流）
        let dragRafId = null;
        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;
            
            if (dragRafId) return;
            
            dragRafId = requestAnimationFrame(() => {
                const containerRect = container.getBoundingClientRect();
                const containerWidth = container.offsetWidth;
                const dividerWidth = divider.offsetWidth;
                const availableWidth = containerWidth - dividerWidth;

                const minWidth = MIN_WIDTH;
                const maxWidth = availableWidth - minWidth;
                const leftWidth = Math.max(minWidth, Math.min(e.clientX - containerRect.left, maxWidth));
                const rightWidth = availableWidth - leftWidth;

                editorPane.style.flex = '1 1 ' + leftWidth + 'px';
                editorPane.style.maxWidth = leftWidth + 'px';
                previewPane.style.flex = '1 1 ' + rightWidth + 'px';
                previewPane.style.maxWidth = rightWidth + 'px';

                this.lastLeftRatio = leftWidth / availableWidth;
                dragRafId = null;
            });
        });

        // 结束拖拽
        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                divider.classList.remove('dragging', 'hover');
                document.body.classList.remove('is-dragging');
            }
        });

        // 窗口大小变化时重新计算
        let resizeTimeout;
        window.addEventListener('resize', () => {
            if (resizeTimeout) clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                const currentLayout = this.state.get('layout');
                if (currentLayout === 'layout-both') {
                    setPaneWidths(this.lastLeftRatio);
                }
            }, 100);
        });
    }

    // ==================== 主题管理 ====================

    /**
     * 应用主题
     */
    applyTheme(mode) {
        document.documentElement.dataset.mode = mode;
        
        // 更新 Prism 主题
        const lightTheme = dom.theme.light?.element;
        const darkTheme = dom.theme.dark?.element;
        
        if (lightTheme && darkTheme) {
            if (mode === 'dark') {
                lightTheme.disabled = true;
                darkTheme.disabled = false;
            } else {
                lightTheme.disabled = false;
                darkTheme.disabled = true;
            }
        }
    }

    /**
     * 切换主题
     */
    toggleTheme() {
        const newMode = this.state.toggleTheme();
        StoreManager.saveTheme(newMode);
        this.applyTheme(newMode);
        this.updateThemeIcon(newMode);
    }

    /**
     * 更新主题图标
     */
    updateThemeIcon(mode) {
        const themeIcon = dom.theme.icon?.element;
        if (themeIcon) {
            themeIcon.textContent = mode === 'dark' ? '☀️' : '🌙';
        }
    }

    /**
     * 初始化主题
     */
    initTheme() {
        const mode = this.state.get('theme');
        this.applyTheme(mode);
        this.updateThemeIcon(mode);
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

        // 清除固定宽度类，让布局自适应
        const editorPane = dom.editor.pane?.element;
        const previewPane = dom.preview.pane?.element;
        if (editorPane) editorPane.classList.remove('fixed-width');
        if (previewPane) previewPane.classList.remove('fixed-width');

        // 清除内联样式（包括 flex 和 maxWidth）
        if (editorPane) {
            editorPane.style.flex = '';
            editorPane.style.maxWidth = '';
            editorPane.style.width = '';
        }
        if (previewPane) {
            previewPane.style.flex = '';
            previewPane.style.maxWidth = '';
            previewPane.style.width = '';
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
            'md-new-file': () => this.components.documentList.createItem('file'),
            'md-new-folder': () => this.components.documentList.createItem('folder'),
            'md-toggle-all-folders': () => this.components.documentList.toggleAllFolders(),
            'md-delete-item': () => this.components.documentList.deleteCurrentItem(),
            'md-export-html': () => this.components.preview.exportHTML(),
            'md-export-md': () => this.components.preview.exportMarkdown(),
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
        const { currentDocId, content } = this.#getInitialDocument(documents);

        // 设置初始状态
        this.state.setState({ documents, content, theme, layout, currentDocId });
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
    }
}
