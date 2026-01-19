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
     */
    subscribe() {
        const stateKey = this.side === 'left' ? 'leftSidebarOpen' : 'rightSidebarOpen';
        
        this.unsubscribe = this.state.subscribeTo(stateKey, (isOpen) => {
            this.updateVisibility(isOpen);
        });
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 侧边栏区块折叠
        this.addEventListener(this.container, 'click', (e) => {
            this.handleSectionClick(e);
        });
    }

    /**
     * 处理区块点击
     */
    handleSectionClick(e) {
        const toggle = e.target.closest('.md-sidebar-section-toggle');
        if (toggle) {
            e.stopPropagation();
            const sectionName = toggle.getAttribute('data-section');
            this.toggleSection(sectionName);
            return;
        }

        const header = e.target.closest('.md-sidebar-section-header');
        if (header) {
            const toggle = header.querySelector('.md-sidebar-section-toggle');
            if (toggle) {
                const sectionName = toggle.getAttribute('data-section');
                this.toggleSection(sectionName);
            }
        }
    }

    /**
     * 切换侧边栏
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
     */
    updateVisibility(isOpen) {
        if (isOpen) {
            this.container.classList.add('open');
            
            // 在移动端显示遮罩层
            if (window.innerWidth <= 768) {
                dom.app.overlay?.addClass('show');
            }

            // 强制重排并触发尺寸重算
            requestAnimationFrame(() => {
                dom.app.container?.element?.getBoundingClientRect();
                dom.preview.pane?.element?.getBoundingClientRect();
                dom.editor.pane?.element?.getBoundingClientRect();
                window.dispatchEvent(new Event('resize'));
            });

            // 如果是右侧边栏，生成目录
            if (this.side === 'right') {
                // 触发目录生成事件
                window.dispatchEvent(new CustomEvent('md:generateTOC'));
            }
        } else {
            this.container.classList.remove('open');
            
            // 在移动端隐藏遮罩层
            if (window.innerWidth <= 768) {
                dom.app.overlay?.removeClass('show');
            }

            // 强制重排并触发尺寸重算（关闭时也需要）
            requestAnimationFrame(() => {
                dom.app.container?.element?.getBoundingClientRect();
                dom.preview.pane?.element?.getBoundingClientRect();
                dom.editor.pane?.element?.getBoundingClientRect();
                window.dispatchEvent(new Event('resize'));
            });
        }
    }

    /**
     * 切换区块状态
     */
    toggleSection(sectionName) {
        const sections = { ...this.state.get('sections') };
        // sections 中存储的是"是否展开"，切换后取反
        sections[sectionName] = !sections[sectionName];
        this.state.setState({ sections });
        
        // 保存到本地存储（saveSectionState 期望的是"是否折叠"，所以需要取反）
        StoreManager.saveSectionState(sectionName, !sections[sectionName]);
        
        // 更新 UI（updateSectionState 期望的是"是否折叠"，所以需要取反）
        this.updateSectionState(sectionName, !sections[sectionName]);
    }

    /**
     * 更新区块状态
     */
    updateSectionState(sectionName, isCollapsed) {
        const content = dom.getById(`md-${sectionName}-content`)?.element;
        if (content) {
            content.classList.toggle('collapsed', isCollapsed);
        }
    }

    /**
     * 应用区块状态
     */
    applySectionStates() {
        const sections = this.state.get('sections');
        Object.entries(sections).forEach(([sectionName, isExpanded]) => {
            // updateSectionState 期望的是"是否折叠"，所以需要取反
            this.updateSectionState(sectionName, !isExpanded);
        });
    }

    /**
     * 渲染组件
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
