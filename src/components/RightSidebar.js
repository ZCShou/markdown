/**
 * 右侧边栏组件
 * 负责目录的生成、显示和侧边栏控制
 */
import { BaseComponent } from './BaseComponent.js';
import { dom } from '../utils/dom.js';

/**
 *
 */
export class RightSidebar extends BaseComponent {
    /**
     * 构造函数
     * @param state
     * @param containerId
     */
    /** @private 已折叠的标题 ID 集合 */
    #collapsedHeadings = new Set();

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
        const unsubscribeSidebar = this.state.subscribeTo('interface', (newInterface, oldInterface) => {
            // 更新侧边栏可见性（只在状态变化时）
            if (!oldInterface || newInterface.rightSidebarOpen !== oldInterface.rightSidebarOpen) {
                this.updateVisibility(newInterface.rightSidebarOpen);
            }
        });

        // 订阅标题数据变化，生成目录
        const unsubscribeTOC = this.state.subscribeTo('headings', () => {
            this.generateTOC();
        });

        // 订阅滚动高亮标题变化
        const unsubscribeActiveHeading = this.state.subscribeTo(
            'activeHeadingId',
            headingId => this.#updateActiveTocItem(headingId)
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
        // 侧边栏工具按钮点击
        this.addEventListener(this.container, 'click', e => {
            this.handleToolClick(e);
        });

        // 目录项点击
        const tocContainer = dom.getById('md-toc')?.element;
        if (tocContainer) {
            tocContainer.addEventListener('click', e => {
                // 点击折叠按钮 — 切换折叠，不触发跳转
                const toggle = e.target.closest('.md-toc-toggle');
                if (toggle) {
                    const item = toggle.closest('.md-toc-item');
                    if (item?.dataset.headingId && item.classList.contains('has-children')) {
                        this.#toggleHeadingCollapse(item.dataset.headingId);
                    }
                    return;
                }

                // 点击目录文本 — 立即高亮并跳转到对应标题
                const item = e.target.closest('.md-toc-item');
                if (!item) return;
                const { dataset: { headingId } } = item;
                if (headingId) {
                    // 立即高亮，无需等待滚动完成
                    this.state.updateActiveHeading(headingId);
                    this.scrollToHeading(headingId);
                }
            });
        }

        // 关闭按钮
        const closeBtn = dom.getById('md-close-right-sidebar')?.element;
        if (closeBtn) {
            closeBtn.onclick = () => this.toggle();
        }

        // 导出按钮
        ['html', 'md', 'pdf'].forEach(type => {
            const btn = dom.getById(`md-export-${type}`)?.element;
            if (btn) {
                btn.onclick = () => this.state.triggerExport(type);
            }
        });

        this.setActiveSection(this.activeSection);
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
        
        if (window.innerWidth <= 768) {
            dom.app.overlay?.[isOpen ? 'addClass' : 'removeClass']('show');
        }
    }

    /**
     * 设置当前激活区块
     * @param {string} sectionName - 区块名称
     */
    setActiveSection(sectionName) {
        this.activeSection = sectionName;

        // 一次遍历更新所有工具按钮和区块
        const tools = this.container.querySelectorAll('.md-sidebar-tool');
        const sectionElements = this.container.querySelectorAll('.md-sidebar-section');
        const sectionMap = new Map();

        sectionElements.forEach(el => {
            sectionMap.set(el.getAttribute('data-section'), el);
        });

        tools.forEach(button => {
            const btnSection = button.getAttribute('data-section');
            const isActive = btnSection === sectionName;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');

            const section = sectionMap.get(btnSection);
            if (section) {
                section.classList.toggle('is-active', isActive);
            }
        });
    }

    // ==================== 目录功能 ====================

    /**
     * 生成目录
     * @returns {void}
     */
    generateTOC() {
        const tocContainer = dom.getById('md-toc')?.element;
        if (!tocContainer) return;

        const headings = this.state.get('headings');

        if (!headings || headings.length === 0) {
            tocContainer.innerHTML = '<p class="md-empty-state">暂无目录</p>';
            return;
        }

        // 单次遍历：计算 hasChildren + 折叠可见性，拼接 HTML 字符串
        // 用 innerHTML 一次性写入，避免逐行 createElement 的开销
        const collapseStack = [];
        const parts = [];

        for (let i = 0; i < headings.length; i++) {
            const h = headings[i];
            const id = h.id || `heading-${i}`;
            const level = h.level || +h.tagName.substring(1);
            const nextLevel = i + 1 < headings.length
                ? (headings[i + 1].level || +headings[i + 1].tagName.substring(1))
                : 0;
            const hasChildren = nextLevel > level;

            // 折叠可见性（栈算法）
            while (collapseStack.length && collapseStack[collapseStack.length - 1] >= level) {
                collapseStack.pop();
            }
            const hidden = collapseStack.length > 0;
            const isCollapsed = hasChildren && this.#collapsedHeadings.has(id);
            if (isCollapsed) collapseStack.push(level);

            // 安全转义文本
            const text = (h.textContent || '')
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

            const cls = [
                'md-toc-item', `level-${level}`,
                hasChildren ? 'has-children' : '',
                isCollapsed  ? 'collapsed'    : '',
                hidden       ? 'toc-hidden'   : '',
            ].filter(Boolean).join(' ');

            const chevron = hasChildren
                ? '<i class="codicon codicon-chevron-right"></i>'
                : '';

            parts.push(
                `<div class="${cls}" data-heading-id="${id}" data-level="${level}">` +
                `<span class="md-toc-toggle">${chevron}</span>` +
                `<span class="md-toc-text">${text}</span></div>`
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
     * 对 items 数组应用折叠可见性（栈算法，支持多级嵌套折叠）。
     * 每次 generateTOC 或切换折叠后调用。
     * @param {HTMLElement[]} items
     * @private
     */
    #applyCollapsedState(items) {
        // collapseStack 存放当前「正在折叠」的祖先级别
        const collapseStack = [];
        for (const item of items) {
            const level = +item.dataset.level;
            const id = item.dataset.headingId;

            // 弹出已结束的折叠区间（当前 level <= 栈顶 level，说明已跳出该折叠区间）
            while (collapseStack.length && collapseStack[collapseStack.length - 1] >= level) {
                collapseStack.pop();
            }

            // 位于折叠区间内 → 隐藏
            item.classList.toggle('toc-hidden', collapseStack.length > 0);

            // 本节点也是折叠状态且有子项 → 入栈
            const isCollapsed = this.#collapsedHeadings.has(id) && item.classList.contains('has-children');
            item.classList.toggle('collapsed', isCollapsed);
            if (isCollapsed) collapseStack.push(level);
        }
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
        const toc = document.getElementById('md-toc');
        if (toc) {
            this.#applyCollapsedState([...toc.querySelectorAll('.md-toc-item')]);
        }
    }

    /**
     * 更新 TOC 中当前激活的标题项
     * @param {string|null} headingId
     * @private
     */
    #updateActiveTocItem(headingId) {
        const toc = document.getElementById('md-toc');
        if (!toc) return;

        // 移除旧的高亮
        toc.querySelector('.md-toc-item.active')?.classList.remove('active');

        if (!headingId) return;

        // 添加新的高亮，并确保该项在 TOC 侧边栏内可见
        const item = toc.querySelector(`.md-toc-item[data-heading-id="${headingId}"]`);
        if (item) {
            item.classList.add('active');
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
        super.destroy();
    }
}
