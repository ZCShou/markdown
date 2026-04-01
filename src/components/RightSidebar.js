/**
 * 右侧边栏组件
 * 负责目录的生成、显示和侧边栏控制
 */
import { BaseComponent } from './BaseComponent.js';
import { dom } from '../utils/dom.js';
import { debounce, escapeHtml } from '../utils/helpers.js';

/**
 *
 */
export class RightSidebar extends BaseComponent {
    /** @private 已折叠的标题 ID 集合 */
    #collapsedHeadings = new Set();
    /** @private 工具按钮映射缓存 */
    #toolButtons = null;
    /** @private 区块元素映射缓存 */
    #sectionElements = null;
    /** @private TOC 容器缓存 */
    #tocContainer = null;
    /** @private 当前激活的 TOC 项缓存 */
    #activeTocItem = null;
    /** @private 导出按钮清理函数数组 */
    #exportCleanups = [];
    /** @private 关闭按钮清理函数 */
    #closeBtnCleanup = null;
    /** @private 防抖后的高亮更新函数 */
    #debouncedUpdateActiveTocItem = null;

    constructor(state, containerId) {
        super(state, containerId);
        this.side = 'right';
        this.activeSection = 'toc';
    }

    // ==================== 生命周期管理 ====================

    /**
     * 订阅状态变化
     * @returns {void}
     */
    subscribe() {
        // 订阅侧边栏状态
        const unsubscribeSidebar = this.state.subscribeTo(
            'interface',
            (newInterface, oldInterface) => {
                // 更新侧边栏可见性（只在状态变化时）
                if (
                    !oldInterface ||
                    newInterface.rightSidebarOpen !== oldInterface.rightSidebarOpen
                ) {
                    this.updateVisibility(newInterface.rightSidebarOpen);
                }
            }
        );

        // 订阅标题数据变化，生成目录
        const unsubscribeTOC = this.state.subscribeTo('headings', () => {
            this.generateTOC();
        });

        // 订阅滚动高亮标题变化（防抖处理：快速滚动时减少DOM操作）
        this.#debouncedUpdateActiveTocItem = debounce(
            headingId => this.#updateActiveTocItem(headingId),
            50
        );
        const unsubscribeActiveHeading = this.state.subscribeTo(
            'activeHeadingId',
            this.#debouncedUpdateActiveTocItem
        );

        // 合并取消订阅函数
        this.unsubscribe = () => {
            unsubscribeSidebar();
            unsubscribeTOC();
            unsubscribeActiveHeading();
        };
    }

    /**
     * 绑定事件
     * @returns {void}
     */
    bindEvents() {
        // 侧边栏工具按钮点击（事件委托）
        this.addEventListener(this.container, 'click', e => {
            this.handleToolClick(e);
        });

        // 目录项点击（事件委托）
        const tocContainer = this.#getTocContainer();
        if (tocContainer) {
            this.addEventListener(tocContainer, 'click', e => {
                // 点击折叠按钮 — 切换折叠，不触发跳转
                const toggle = e.target.closest('.md-toc-toggle');
                if (toggle) {
                    const item = toggle.closest('.md-toc-item');
                    if (item?.dataset.headingId && item.classList.contains('has-children')) {
                        this.#toggleHeadingCollapse(item.dataset.headingId);
                    }
                    return;
                }

                // 点击 "..." 展开提示按钮 — 展开折叠，不触发跳转
                const expandHint = e.target.closest('.md-toc-expand-hint');
                if (expandHint) {
                    const item = expandHint.closest('.md-toc-item');
                    if (item?.dataset.headingId) {
                        this.#toggleHeadingCollapse(item.dataset.headingId);
                    }
                    return;
                }
                // 点击目录文本 — 立即高亮并跳转到对应标题
                const item = e.target.closest('.md-toc-item');
                if (!item) return;
                const {
                    dataset: { headingId }
                } = item;
                if (headingId) {
                    // 立即高亮，无需等待滚动完成
                    this.state.updateActiveHeading(headingId);
                    this.scrollToHeading(headingId);
                }
            });
        }

        // 关闭按钮 - 使用 addEventListener 以便正确清理
        const closeBtn = dom.getById('md-close-right-sidebar')?.element;
        if (closeBtn) {
            const closeHandler = () => this.toggle();
            closeBtn.addEventListener('click', closeHandler);
            this.#closeBtnCleanup = () => closeBtn.removeEventListener('click', closeHandler);
        }

        // 导出按钮 - 使用 addEventListener 以便正确清理
        ['html', 'md', 'pdf'].forEach(type => {
            const btn = dom.getById(`md-export-${type}`)?.element;
            if (btn) {
                const handler = () => this.state.triggerExport(type);
                btn.addEventListener('click', handler);
                this.#exportCleanups.push(() => btn.removeEventListener('click', handler));
            }
        });

        // 缓存工具按钮和区块元素，避免重复查询
        this.#cacheToolAndSectionElements();
        this.setActiveSection(this.activeSection);
    }

    /**
     * 缓存工具按钮和区块元素，避免重复查询
     * @private
     */
    #cacheToolAndSectionElements() {
        const tools = this.container.querySelectorAll('.md-sidebar-tool');
        const sectionElements = this.container.querySelectorAll('.md-sidebar-section');

        this.#toolButtons = new Map();
        this.#sectionElements = new Map();

        tools.forEach(button => {
            const sectionName = button.getAttribute('data-section');
            if (sectionName) {
                this.#toolButtons.set(sectionName, button);
            }
        });

        sectionElements.forEach(el => {
            const sectionName = el.getAttribute('data-section');
            if (sectionName) {
                this.#sectionElements.set(sectionName, el);
            }
        });
    }

    // ==================== 侧边栏控制 ====================

    /**
     * 处理工具按钮点击
     * @param {MouseEvent} e - 点击事件
     * @returns {void}
     */
    handleToolClick(e) {
        const toolButton = e.target.closest('.md-sidebar-tool');
        if (!toolButton) return;

        e.preventDefault();
        const sectionName = toolButton.getAttribute('data-section');
        if (sectionName) {
            this.setActiveSection(sectionName);
        }
    }

    /**
     * 切换侧边栏
     * @returns {boolean} 切换后的状态
     */
    toggle() {
        return this.state.toggleSidebar(this.side);
    }

    /**
     * 更新可见性
     * @param {boolean} isOpen - 是否打开
     * @returns {void}
     */
    updateVisibility(isOpen) {
        this.container.classList.toggle('open', isOpen);
        const isMobile = window.innerWidth <= 768;
        if (isMobile && isOpen) {
            dom.app.overlay?.addClass('show');
        } else if (!isOpen) {
            // 关键：无论当前是否 mobile，都清掉残留的 `.show`
            dom.app.overlay?.removeClass('show');
        }
    }

    /**
     * 设置当前激活区块
     * @param {string} sectionName - 区块名称
     */
    setActiveSection(sectionName) {
        this.activeSection = sectionName;

        // 使用缓存的映射，避免重复 DOM 查询
        if (!this.#toolButtons || !this.#sectionElements) {
            this.#cacheToolAndSectionElements();
        }

        this.#toolButtons.forEach((button, btnSection) => {
            const isActive = btnSection === sectionName;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');

            const section = this.#sectionElements.get(btnSection);
            if (section) {
                section.classList.toggle('is-active', isActive);
            }
        });
    }

    // ==================== 目录功能 ====================

    /**
     * 获取 TOC 容器（带缓存）
     * @returns {HTMLElement|null}
     * @private
     */
    #getTocContainer() {
        if (!this.#tocContainer) {
            this.#tocContainer = dom.getById('md-toc')?.element;
        }
        return this.#tocContainer;
    }

    /**
     * 生成目录
     * @returns {void}
     */
    generateTOC() {
        const tocContainer = this.#getTocContainer();
        if (!tocContainer) return;

        const headings = this.state.get('headings');

        if (!headings || headings.length === 0) {
            tocContainer.innerHTML = `
                <div class="md-empty-state">
                    <i class="codicon codicon-list-tree"></i>
                    <p>暂无目录</p>
                </div>
            `;
            // 重置激活项缓存
            this.#activeTocItem = null;
            return;
        }

        // 单次遍历：计算 hasChildren + 折叠可见性，拼接 HTML 字符串
        // 用 innerHTML 一次性写入，避免逐行 createElement 的开销
        const collapseStack = [];
        const parts = [];

        for (let i = 0; i < headings.length; i++) {
            const h = headings[i];
            const id = h.id || `heading-${i}`;
            const level = h.level ?? +h.tagName.substring(1);
            const nextH = headings[i + 1];
            const nextLevel = nextH ? (nextH.level ?? +nextH.tagName.substring(1)) : 0;
            const hasChildren = nextLevel > level;

            // 折叠可见性（栈算法）
            while (collapseStack.length && collapseStack[collapseStack.length - 1] >= level) {
                collapseStack.pop();
            }
            const hidden = collapseStack.length > 0;
            const isCollapsed = hasChildren && this.#collapsedHeadings.has(id);
            if (isCollapsed) collapseStack.push(level);

            // 安全转义文本
            const text = escapeHtml(h.textContent || '');

            const cls = [
                'md-toc-item',
                `level-${level}`,
                hasChildren ? 'has-children' : '',
                isCollapsed ? 'collapsed' : '',
                hidden ? 'toc-hidden' : ''
            ]
                .filter(Boolean)
                .join(' ');

            const chevron = hasChildren ? '<i class="codicon codicon-chevron-right"></i>' : '';

            // 折叠时在标题右侧显示 "..." 提示按钮
            const expandHint = isCollapsed
                ? '<span class="md-toc-expand-hint" title="展开">⋯</span>'
                : '';
            parts.push(
                `<div class="${cls}" data-heading-id="${id}" data-level="${level}">` +
                    `<span class="md-toc-toggle">${chevron}</span>` +
                    `<span class="md-toc-text">${text}</span>${expandHint}</div>`
            );
        }

        tocContainer.innerHTML = parts.join('');

        // 重建后重新应用激活项
        this.#updateActiveTocItem(this.state.get('activeHeadingId'));
    }

    /**

     * 滚动到指定标题（委托给 Preview 处理，确保懒加载元素先渲染）
     * @param {string} headingId - 标题 ID
     * @returns {void}
     */
    scrollToHeading(headingId) {
        this.state.triggerScrollToHeading(headingId);
    }

    /**
     * 切换标题折叠/展开状态，并立即更新 TOC 可见性。
     * @param {string} headingId
     * @private
     */
    #toggleHeadingCollapse(headingId) {
        if (this.#collapsedHeadings.has(headingId)) {
            this.#collapsedHeadings.delete(headingId);
        } else {
            this.#collapsedHeadings.add(headingId);
        }
        // 重新生成 TOC（已优化，使用 innerHTML 一次性写入）
        this.generateTOC();
    }

    /**
     * 更新 TOC 中当前激活的标题项（使用缓存优化）
     * @param {string|null} headingId
     * @private
     */
    #updateActiveTocItem(headingId) {
        const toc = this.#getTocContainer();
        if (!toc) return;

        // 使用缓存移除旧的高亮
        if (this.#activeTocItem) {
            this.#activeTocItem.classList.remove('active');
            this.#activeTocItem = null;
        }

        if (!headingId) return;

        // 添加新的高亮，并确保该项在 TOC 侧边栏内可见
        const item = toc.querySelector(`.md-toc-item[data-heading-id="${CSS.escape(headingId)}"]`);
        if (item) {
            item.classList.add('active');
            this.#activeTocItem = item;
            // 使用 instant 避免滚动时触发多个竞争的 smooth 动画
            item.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        }
    }

    // ==================== 渲染相关 ====================

    /**
     * 渲染组件
     * @returns {void}
     */
    render() {
        const interfaceState = this.state.get('interface');
        this.updateVisibility(interfaceState.rightSidebarOpen);
        this.generateTOC();
    }

    // ==================== 资源清理 ====================

    /**
     * 销毁组件
     * @returns {void}
     */
    destroy() {
        // 清理导出按钮事件
        this.#exportCleanups.forEach(cleanup => cleanup());
        this.#exportCleanups = [];

        // 清理关闭按钮事件
        if (this.#closeBtnCleanup) {
            this.#closeBtnCleanup();
            this.#closeBtnCleanup = null;
        }

        // 清理缓存
        this.#toolButtons = null;
        this.#sectionElements = null;
        this.#tocContainer = null;
        this.#activeTocItem = null;
        this.#debouncedUpdateActiveTocItem = null;
        this.#collapsedHeadings.clear();

        // 调用父类销毁
        super.destroy();
    }
}
