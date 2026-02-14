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
    constructor(state, containerId) {
        super(state, containerId);
        this.side = 'right';
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
            }, 150);
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
        this.container.classList.toggle('open', isOpen);
        
        if (window.innerWidth <= 768) {
            dom.app.overlay?.[isOpen ? 'addClass' : 'removeClass']('show');
        }
    }

    /**
     * 切换区块状态
     * @param {string} sectionName - 区块名称
     * @returns {void}
     */
    toggleSection(sectionName) {
        const isExpanded = this.state.toggleSection(sectionName);
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
        const { sections } = this.state.get('interface');
        for (const sectionName in sections) {
            const content = dom.getById(`md-${sectionName}-content`)?.element;
            if (content) {
                content.classList.toggle('collapsed', !sections[sectionName]);
            }
        }
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

        const fragment = document.createDocumentFragment();

        for (let i = 0; i < headings.length; i++) {
            const heading = headings[i];
            const headingId = heading.id || `heading-${i}`;
            const level = heading.level || +heading.tagName.substring(1);
            const text = heading.textContent || '';

            const item = document.createElement('div');
            item.className = `md-toc-item level-${level}`;
            item.dataset.headingId = headingId;
            item.textContent = text;

            fragment.appendChild(item);
        }

        tocContainer.innerHTML = '';
        tocContainer.appendChild(fragment);
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
     * 销毁组件
     * @returns {void}
     */
    destroy() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
            this.debounceTimer = null;
        }
        super.destroy();
    }
}
