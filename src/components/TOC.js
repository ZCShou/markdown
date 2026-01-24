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
        this.debounceTimer = null;
        this.debounceDelay = 150; // 防抖延迟 150ms
    }

    /**
     * 订阅状态变化
     * @returns {void}
     */
    subscribe() {
        // 订阅标题数据变化，生成目录（使用防抖）
        this.unsubscribe = this.state.subscribeTo('headings', () => {
            this.debouncedGenerateTOC();
        });
    }

    /**
     * 绑定事件
     * @returns {void}
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
            this.debouncedGenerateTOC();
        });
    }

    /**
     * 防抖版本的生成目录
     * @returns {void}
     */
    debouncedGenerateTOC() {
        if (this.debounceTimer) {
            clearTimeout(this.debounceTimer);
        }
        
        this.debounceTimer = setTimeout(() => {
            this.debounceTimer = null;
            this.generateTOC();
        }, this.debounceDelay);
    }

    /**
     * 生成目录（增量更新优化）
     * @returns {void}
     */
    generateTOC() {
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
            // 完全重建时使用RAF避免阻塞
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
            }
            
            this.animationFrameId = requestAnimationFrame(() => {
                this.animationFrameId = null;
                this._rebuildTOC(headings);
            });
        } else {
            // 增量更新直接同步执行，不使用RAF，减少延迟
            this._updateTOC(headings, currentItems);
        }
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
            
            // 直接使用已有的数据，无需解析
            const headingId = heading.id || `heading-${i}`;
            const level = heading.level || +heading.tagName.substring(1);
            const text = heading.textContent || '';
            
            // 一次性读取当前值，避免重复查询 DOM
            const dataset = currentItem.dataset;
            const currentId = dataset.headingId;
            const currentLevel = +dataset.level; // 直接从 data-level 读取，避免正则匹配
            const currentText = currentItem.textContent;
            
            // 检查是否需要更新
            if (currentId !== headingId || currentText !== text || currentLevel !== level) {
                itemsToUpdate.push({
                    element: currentItem,
                    headingId,
                    text,
                    level
                });
            }
        }
        
        // 只在有变化时批量更新 DOM
        if (itemsToUpdate.length > 0) {
            for (let i = 0; i < itemsToUpdate.length; i++) {
                const item = itemsToUpdate[i];
                const dataset = item.element.dataset;
                dataset.headingId = item.headingId;
                dataset.level = item.level;
                item.element.textContent = item.text;
                item.element.className = `md-toc-item level-${item.level}`;
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

    /**
     * 渲染组件
     */
    render() {
        this.generateTOC();
    }
}
