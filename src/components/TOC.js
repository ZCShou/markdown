/**
 * 目录组件
 * 负责生成和显示 Markdown 目录
 */
import { BaseComponent } from './BaseComponent.js';

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

        // 监听目录生成事件（自动清理）
        this.addEventListener(window, 'md:generateTOC', () => {
            this.generateTOC();
        });
    }

    /**
     * 生成目录（使用 requestAnimationFrame 确保 DOM 更新完成）
     */
    generateTOC() {
        // 清除之前的动画帧请求
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        // 在下一帧生成目录，确保预览组件已完成 DOM 更新
        this.animationFrameId = requestAnimationFrame(() => {
            this.animationFrameId = null;
            
            const { previewComponent, container } = this;
            if (!previewComponent) return;

            const headings = previewComponent.getHeadings();
            const headingCount = headings.length;
            
            if (headingCount === 0) {
                container.innerHTML = `<p class="md-empty-state">暂无目录</p>`;
                return;
            }

            // 使用字符串拼接构建目录 HTML，提升性能（使用 for 循环避免函数调用开销）
            let html = '';
            
            for (let i = 0; i < headingCount; i++) {
                const heading = headings[i];
                
                // 为标题生成 ID（如果没有）
                if (!heading.id) {
                    heading.id = 'heading-' + i;
                }
                
                const level = parseInt(heading.tagName.substring(1));
                const text = heading.textContent || '';
                
                html += `<div class="md-toc-item level-${level}" data-heading-id="${heading.id}">${text}</div>`;
            }

            container.innerHTML = html;
        });
    }



    /**
     * 滚动到指定标题
     */
    scrollToHeading(headingId) {
        const heading = document.getElementById(headingId);
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
        this.generateTOC();
    }
}
