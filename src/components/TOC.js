/**
 * 目录组件
 * 负责生成和显示 Markdown 目录
 */
import { BaseComponent } from './BaseComponent.js';

export class TOC extends BaseComponent {
    /**
     * 构造函数
     */
    constructor(state, containerId) {
        super(state, containerId);
        this.animationFrameId = null;
    }

    /**
     * 订阅状态变化
     */
    subscribe() {
        // 订阅标题数据变化，生成目录
        this.unsubscribe = this.state.subscribeTo('headings', () => {
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
     * 生成目录（增量更新优化）
     */
    generateTOC() {
        // 清除之前的动画帧请求
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
        }
        
        // 在下一帧生成目录
        this.animationFrameId = requestAnimationFrame(() => {
            this.animationFrameId = null;
            
            const headings = this.state.get('headings');
            const headingCount = headings ? headings.length : 0;
            
            if (headingCount === 0) {
                this.container.innerHTML = `<p class="md-empty-state">暂无目录</p>`;
                return;
            }

            // 检查是否需要完全重建
            const currentItems = this.container.querySelectorAll('.md-toc-item');
            const needsFullRebuild = currentItems.length !== headingCount;

            if (needsFullRebuild) {
                // 完全重建
                this._rebuildTOC(headings);
            } else {
                // 增量更新
                this._updateTOC(headings, currentItems);
            }
        });
    }

    /**
     * 完全重建目录
     * @private
     */
    _rebuildTOC(headings) {
        const headingCount = headings.length;

        // 使用 DocumentFragment 提升性能
        const fragment = document.createDocumentFragment();
        
        for (let i = 0; i < headingCount; i++) {
            const heading = headings[i];
            
            // 使用 Preview 组件生成的 ID，不再修改 DOM
            const headingId = heading.id || 'heading-' + i;
            
            const level = parseInt(heading.tagName.substring(1));
            const text = heading.textContent || '';
            
            const item = document.createElement('div');
            item.className = 'md-toc-item level-' + level;
            item.dataset.headingId = headingId;
            item.textContent = text;
            
            fragment.appendChild(item);
        }

        this.container.innerHTML = '';
        this.container.appendChild(fragment);
    }

    /**
     * 增量更新目录（性能优化 - 减少不必要的 DOM 操作）
     * @private
     */
    _updateTOC(headings, currentItems) {
        const itemsToUpdate = [];
        
        for (let i = 0; i < headings.length; i++) {
            const heading = headings[i];
            const currentItem = currentItems[i];
            
            // 使用 Preview 组件生成的 ID，不再修改 DOM
            const headingId = heading.id || 'heading-' + i;
            
            const level = parseInt(heading.tagName.substring(1));
            const text = heading.textContent || '';
            
            // 缓存当前值，避免重复查询 DOM
            const currentId = currentItem.dataset.headingId;
            const currentText = currentItem.textContent;
            const currentLevelMatch = currentItem.className.match(/level-(\d)/);
            const currentLevel = currentLevelMatch ? parseInt(currentLevelMatch[1]) : -1;
            
            // 检查是否需要更新
            if (currentId !== headingId || currentText !== text || currentLevel !== level) {
                itemsToUpdate.push({
                    index: i,
                    element: currentItem,
                    headingId: headingId,
                    text: text,
                    level: level
                });
            }
        }
        
        // 只在有变化时批量更新 DOM（移除嵌套的 rAF）
        if (itemsToUpdate.length > 0) {
            for (let i = 0; i < itemsToUpdate.length; i++) {
                const item = itemsToUpdate[i];
                item.element.dataset.headingId = item.headingId;
                item.element.textContent = item.text;
                item.element.className = 'md-toc-item level-' + item.level;
            }
        }
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
