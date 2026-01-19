/**
 * 目录组件
 * 负责生成和显示 Markdown 目录
 */
import { BaseComponent } from './BaseComponent.js';
import { dom } from '../utils/dom.js';

export class TOC extends BaseComponent {
    /**
     * 构造函数
     */
    constructor(state, containerId, previewComponent) {
        super(state, containerId);
        this.previewComponent = previewComponent;
    }

    /**
     * 订阅状态变化
     */
    subscribe() {
        // 订阅内容变化，重新生成目录
        this.unsubscribe = this.state.subscribeTo('content', () => {
            this.generateTOC();
        });
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 使用事件委托处理目录项点击
        this.addEventListener(this.container, 'click', (e) => {
            const item = e.target.closest('.md-toc-item');
            if (!item) return;

            const headingId = item.dataset.headingId;
            if (headingId) {
                this.scrollToHeading(headingId);
            }
        });

        // 监听目录生成事件
        window.addEventListener('md:generateTOC', () => {
            this.generateTOC();
        });
    }

    /**
     * 生成目录
     */
    generateTOC() {
        if (!this.previewComponent) return;

        const headings = this.previewComponent.getHeadings();
        
        if (headings.length === 0) {
            this.container.innerHTML = `<p class="md-empty-state">暂无目录</p>`;
            return;
        }

        const fragment = this.createFragment();

        headings.forEach((heading, index) => {
            // 为标题生成 ID（如果没有）
            if (!heading.id) {
                heading.id = 'heading-' + index;
            }

            const item = this.renderTOCItem(heading);
            fragment.appendChild(item);
        });

        this.container.innerHTML = '';
        this.container.appendChild(fragment);
    }

    /**
     * 渲染目录项
     */
    renderTOCItem(heading) {
        const level = parseInt(heading.tagName.substring(1));

        const item = this.createElement('div', {
            className: 'md-toc-item level-' + level,
            textContent: heading.textContent,
            dataset: {
                headingId: heading.id
            }
        });

        return item;
    }

    /**
     * 滚动到指定标题
     */
    scrollToHeading(headingId) {
        const heading = dom.getById(headingId)?.element;
        if (heading) {
            heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    /**
     * 渲染组件
     */
    render() {
        this.generateTOC();
    }
}
