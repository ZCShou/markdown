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
        // 侧边栏工具按钮点击
        this.addEventListener(this.container, 'click', e => {
            this.handleToolClick(e);
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

        this.setActiveSection(this.activeSection);
        this.applySectionStates();
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
     * 应用区块状态
     * @returns {void}
     */
    applySectionStates() {
        const { sections } = this.state.get('interface');
        let hasActive = false;

        for (const sectionName in sections) {
            const isEnabled = !!sections[sectionName];
            const section = dom.getById(`md-${sectionName}-section`)?.element;
            const tool = this.container.querySelector(`.md-sidebar-tool[data-section="${sectionName}"]`);

            if (section) {
                section.classList.toggle('hidden', !isEnabled);
                if (section.classList.contains('is-active') && isEnabled) {
                    hasActive = true;
                }
            }
            if (tool) {
                tool.classList.toggle('hidden', !isEnabled);
            }
        }

        if (!hasActive) {
            const nextSection = this.getFirstEnabledSection(sections);
            if (nextSection) {
                this.setActiveSection(nextSection);
            }
        }
    }

    /**
     * 设置当前激活区块
     * @param {string} sectionName - 区块名称
     */
    setActiveSection(sectionName) {
        const { sections } = this.state.get('interface');
        if (sections && sections[sectionName] === false) return;

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

    /**
     * 获取第一个可用区块
     * @param {Object} sections - 区块状态
     * @returns {string|null}
     */
    getFirstEnabledSection(sections) {
        const order = ['toc', 'export'];
        for (const key of order) {
            if (sections?.[key]) return key;
        }
        for (const key in sections) {
            if (sections[key]) return key;
        }
        return null;
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
        const interfaceState = this.state.get('interface');
        this.updateVisibility(interfaceState.rightSidebarOpen);
        this.applySectionStates();
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
