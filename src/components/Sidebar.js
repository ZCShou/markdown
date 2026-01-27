/**
 * 侧边栏组件
 * 负责侧边栏的开关、区块折叠等功能
 */
import { BaseComponent } from './BaseComponent.js';
import { dom } from '../utils/dom.js';

/**
 *
 */
export class Sidebar extends BaseComponent {
    /**
     * 构造函数
     * @param state
     * @param containerId
     * @param side
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

        this.unsubscribe = this.state.subscribeTo('interface', (newInterface, oldInterface) => {
            const hasOld = !!oldInterface;
            
            // 更新侧边栏可见性（只在状态变化时）
            if (!hasOld || newInterface[stateKey] !== oldInterface[stateKey]) {
                this.updateVisibility(newInterface[stateKey]);
            }

            // 更新区块状态（只在 sections 变化时）
            if (!hasOld || newInterface.sections !== oldInterface.sections) {
                this.applySectionStates();
            }
        });
    }

    /**
     * 绑定事件
     * @returns {void}
     */
    bindEvents() {
        this.addEventListener(this.container, 'click', e => {
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
        const interfaceState = this.state.get('interface');
        const newValue = !interfaceState[stateKey];
        
        this.state.setState({ 
            interface: { 
                ...interfaceState, 
                [stateKey]: newValue 
            } 
        });

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
        const interfaceState = this.state.get('interface');
        const sections = { ...interfaceState.sections };
        const isExpanded = !sections[sectionName];
        sections[sectionName] = isExpanded;

        this.state.setState({ 
            interface: { 
                ...interfaceState, 
                sections 
            } 
        });
        
        // 更新 UI（注意：isExpanded 是展开状态，updateSectionState 需要折叠状态）
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
        const sections = this.state.get('interface').sections;
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
        const interfaceState = this.state.get('interface');
        const isOpen = interfaceState[stateKey];
        this.updateVisibility(isOpen);

        // 延迟应用区块状态，确保所有组件都已渲染完成
        // 使用 requestAnimationFrame 确保在下一帧执行，此时所有组件的 DOM 都已准备好
        requestAnimationFrame(() => {
            this.applySectionStates();
        });
    }
}
