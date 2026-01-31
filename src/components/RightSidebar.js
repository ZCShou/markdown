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
    // 防抖延迟（毫秒）
    static #DEBOUNCE_DELAY = 150;

    /**
     * 构造函数
     * @param state
     * @param containerId
     */
    constructor(state, containerId) {
        super(state, containerId);
        this.side = 'right';
        this.animationFrameId = null;
        this.debounceTimer = null;
    }

    // ==================== 生命周期管理 ====================

    /**
     * 订阅状态变化
     * @returns {void}
     */
    subscribe() {
        // 订阅侧边栏状态
        const unsubscribeSidebar = this.state.subscribeTo('interface', (newInterface, oldInterface) => {
            const hasOld = !!oldInterface;
            
            // 更新侧边栏可见性（只在状态变化时）
            if (!hasOld || newInterface.rightSidebarOpen !== oldInterface.rightSidebarOpen) {
                this.updateVisibility(newInterface.rightSidebarOpen);
            }

            // 更新区块状态（只在 sections 变化时）
            if (!hasOld || newInterface.sections !== oldInterface.sections) {
                this.applySectionStates();
            }
        });

        // 订阅标题数据变化，生成目录（使用防抖）
        const unsubscribeTOC = this.state.subscribeTo('headings', () => {
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }

            this.debounceTimer = setTimeout(() => {
                this.debounceTimer = null;
                this.generateTOC();
            }, RightSidebar.#DEBOUNCE_DELAY);
        });

        // 合并取消订阅函数
        this.unsubscribe = () => {
            unsubscribeSidebar();
            unsubscribeTOC();
        };
    }

    /**
     * 绑定事件
     * @returns {void}
     */
    bindEvents() {
        // 侧边栏区块点击
        this.addEventListener(this.container, 'click', e => {
            this.handleSectionClick(e);
        });

        // 目录项点击
        const tocContainer = dom.getById('md-toc')?.element;
        if (tocContainer) {
            tocContainer.addEventListener('click', e => {
                const item = e.target.closest('.md-toc-item');
                if (!item) return;

                const {
                    dataset: { headingId }
                } = item;
                if (headingId) {
                    this.scrollToHeading(headingId);
                }
            });
        }
    }

    // ==================== 侧边栏控制 ====================

    /**
     * 处理区块点击
     * @param {MouseEvent} e - 点击事件
     * @returns {void}
     */
    handleSectionClick(e) {
        const toggle = e.target.closest('.md-sidebar-section-toggle');
        const header = e.target.closest('.md-sidebar-section-header');

        if (toggle || header) {
            e.stopPropagation();
            const sectionToggle = toggle || dom.getIn(header, '.md-sidebar-section-toggle');
            if (sectionToggle) {
                this.toggleSection(sectionToggle.getAttribute('data-section'));
            }
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
        const isMobile = window.innerWidth <= 768;

        if (isOpen) {
            this.container.classList.add('open');

            if (isMobile) {
                dom.app.overlay?.addClass('show');
            }
        } else {
            this.container.classList.remove('open');

            if (isMobile) {
                dom.app.overlay?.removeClass('show');
            }
        }
    }

    /**
     * 切换区块状态
     * @param {string} sectionName - 区块名称
     * @returns {void}
     */
    toggleSection(sectionName) {
        const isExpanded = this.state.toggleSection(sectionName);
        // 内联更新 UI
        const content = dom.getById(`md-${sectionName}-content`)?.element;
        if (content) {
            content.classList.toggle('collapsed', !isExpanded);
        }
    }

    /**
     * 应用区块状态
     * @returns {void}
     */
    applySectionStates() {
        const sections = this.state.get('interface').sections;
        const sectionNames = Object.keys(sections);

        for (let i = 0; i < sectionNames.length; i++) {
            const sectionName = sectionNames[i];
            const content = dom.getById(`md-${sectionName}-content`)?.element;
            if (content) {
                content.classList.toggle('collapsed', !sections[sectionName]);
            }
        }
    }

    // ==================== 目录功能 ====================

    /**
     * 生成目录（增量更新优化）
     * @returns {void}
     */
    generateTOC() {
        const tocContainer = dom.getById('md-toc')?.element;
        if (!tocContainer) return;

        const headings = this.state.get('headings');
        const headingCount = headings ? headings.length : 0;

        if (headingCount === 0) {
            tocContainer.innerHTML = '<p class="md-empty-state">暂无目录</p>';
            return;
        }

        // 使用 dom.js 统一查询，检查是否需要完全重建
        const currentItems = dom.getAllIn(tocContainer, '.md-toc-item');
        const itemCount = currentItems.length;

        // 数量不同，直接重建
        if (itemCount !== headingCount) {
            // 使用 RAF 避免阻塞
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
            }

            this.animationFrameId = requestAnimationFrame(() => {
                this.animationFrameId = null;
                this.#rebuildTOC(headings, tocContainer);
            });
            return;
        }

        // 数量相同，增量更新
        this.#updateTOC(headings, currentItems);
    }

    /**
     * 完全重建目录
     * @param headings
     * @param tocContainer
     * @private
     */
    #rebuildTOC(headings, tocContainer) {
        const headingCount = headings.length;

        // 使用 DocumentFragment 提升性能
        const fragment = document.createDocumentFragment();

        for (let i = 0; i < headingCount; i++) {
            const heading = headings[i];

            // 直接使用已有的数据，无需解析
            const headingId = heading.id || `heading-${i}`;
            const level = heading.level || +heading.tagName.substring(1);
            const text = heading.textContent || '';

            const item = document.createElement('div');
            item.className = `md-toc-item level-${level}`;
            item.dataset.headingId = headingId;
            item.dataset.level = level; // 存储 level 避免后续正则匹配
            item.textContent = text;

            fragment.appendChild(item);
        }

        tocContainer.innerHTML = '';
        tocContainer.appendChild(fragment);
    }

    /**
     * 增量更新目录（性能优化 - 减少不必要的 DOM 操作）
     * @param headings
     * @param currentItems
     * @private
     */
    #updateTOC(headings, currentItems) {
        for (let i = 0; i < headings.length; i++) {
            const heading = headings[i];
            const currentItem = currentItems[i];

            // 直接使用已有的数据，无需解析
            const headingId = heading.id || `heading-${i}`;
            const level = heading.level || +heading.tagName.substring(1);
            const text = heading.textContent || '';

            // 一次性读取当前值，避免重复查询 DOM
            const { dataset } = currentItem;
            const currentId = dataset.headingId;
            const currentLevel = +dataset.level; // 直接从 data-level 读取，避免正则匹配
            const currentText = currentItem.textContent;

            // 检查是否需要更新，直接更新 DOM
            if (currentId !== headingId || currentText !== text || currentLevel !== level) {
                dataset.headingId = headingId;
                dataset.level = level;
                currentItem.textContent = text;
                currentItem.className = `md-toc-item level-${level}`;
            }
        }
    }

    /**
     * 滚动到指定标题
     * @param {string} headingId - 标题 ID
     * @returns {void}
     */
    scrollToHeading(headingId) {
        const heading = document.getElementById(headingId);
        if (heading) {
            heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    // ==================== 渲染相关 ====================

    /**
     * 渲染组件
     * @returns {void}
     */
    render() {
        // 渲染侧边栏状态
        const interfaceState = this.state.get('interface');
        const isOpen = interfaceState.rightSidebarOpen;
        this.updateVisibility(isOpen);

        // 延迟应用区块状态，确保所有组件都已渲染完成
        requestAnimationFrame(() => {
            this.applySectionStates();
        });

        // 渲染目录
        this.generateTOC();
    }

    // ==================== 资源清理 ====================

    /**
     * 销毁组件，清理动画帧请求
     * @returns {void}
     */
    destroy() {
        // 清理防抖定时器
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        // 清理动画帧请求
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        // 调用父类销毁逻辑
        super.destroy();
    }
}
