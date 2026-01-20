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
        this.animationFrameId = null;
    }

    /**
     * 订阅状态变化
     */
    subscribe() {
        // 订阅最后渲染内容和当前文档ID变化，确保预览渲染完成后生成目录
        this.unsubscribe = this.state.subscribeTo(['lastRenderedContent', 'currentDocId'], () => {
            this.scheduleTOCGeneration();
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

        // 监听目录生成事件（自动清理）
        this.addEventListener(window, 'md:generateTOC', () => {
            this.scheduleTOCGeneration();
        });
    }

    /**
     * 调度目录生成（使用 requestAnimationFrame 确保 DOM 更新完成）
     */
    scheduleTOCGeneration() {
        // 清除之前的动画帧请求
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        // 在下一帧生成目录，确保预览组件已完成 DOM 更新
        this.animationFrameId = requestAnimationFrame(() => {
            this.generateTOC();
            this.animationFrameId = null;
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
     * 销毁组件，清理动画帧请求
     */
    destroy() {
        // 清理动画帧请求
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
        // 调用父类销毁逻辑
        super.destroy();
    }

    /**
     * 渲染组件
     */
    render() {
        this.scheduleTOCGeneration();
    }
}
