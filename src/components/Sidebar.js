/**
 * 侧边栏组件
 * 负责侧边栏的开关、区块折叠等功能
 */
import { BaseComponent } from './BaseComponent.js';
import { StoreManager } from '../modules/store.js';
import { dom } from '../utils/dom.js';

export class Sidebar extends BaseComponent {
    /**
     * 构造函数
     */
    constructor(state, containerId, side) {
        super(state, containerId);
        this.side = side; // 'left' or 'right'
    }

    /**
     * 订阅状态变化
     * @returns {void}
     */
    subscribe() {
        const stateKey = this.side === 'left' ? 'leftSidebarOpen' : 'rightSidebarOpen';

        this.unsubscribe = this.state.subscribeTo(stateKey, (isOpen) => {
            this.updateVisibility(isOpen);
        });
    }

    /**
     * 绑定事件
     * @returns {void}
     */
    bindEvents() {
        this.addEventListener(this.container, 'click', (e) => {
            this.handleSectionClick(e);
        });
    }

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
            // 使用 dom.js 统一查询
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
        const stateKey = this.side === 'left' ? 'leftSidebarOpen' : 'rightSidebarOpen';
        const newValue = !this.state.get(stateKey);
        this.state.setState({ [stateKey]: newValue });

        // 保存到本地存储
        StoreManager.saveSidebarState(this.side, newValue);

        return newValue;
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

            // 如果是右侧边栏，生成目录
            if (this.side === 'right') {
                window.dispatchEvent(new CustomEvent('md:generateTOC'));
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
        const sections = { ...this.state.get('sections') };
        const isExpanded = !sections[sectionName];
        sections[sectionName] = isExpanded;

        this.state.setState({ sections });
        StoreManager.saveSectionState(sectionName, !isExpanded);
        this.updateSectionState(sectionName, !isExpanded);
    }

    /**
     * 更新区块状态
     * @param {string} sectionName - 区块名称
     * @param {boolean} isCollapsed - 是否折叠
     * @returns {void}
     */
    updateSectionState(sectionName, isCollapsed) {
        const content = dom.getById(`md-${sectionName}-content`)?.element;
        if (content) {
            content.classList.toggle('collapsed', isCollapsed);
        }
    }

    /**
     * 应用区块状态
     * @returns {void}
     */
    applySectionStates() {
        const sections = this.state.get('sections');
        const sectionNames = Object.keys(sections);

        for (let i = 0; i < sectionNames.length; i++) {
            const sectionName = sectionNames[i];
            this.updateSectionState(sectionName, !sections[sectionName]);
        }
    }

    /**
     * 渲染组件
     * @returns {void}
     */
    render() {
        // 侧边栏的初始状态由 HTML 决定，这里只需要应用状态
        const stateKey = this.side === 'left' ? 'leftSidebarOpen' : 'rightSidebarOpen';
        const isOpen = this.state.get(stateKey);
        this.updateVisibility(isOpen);

        // 应用区块状态（确保初始状态正确）
        this.applySectionStates();
    }
}
