/**
 * 目录组件
 * 负责生成和显示 Markdown 目录
 */
import { BaseComponent } from './BaseComponent.js';
import { dom } from '../utils/dom.js';

/**
 *
 */
export class TOC extends BaseComponent {
    // 防抖延迟（毫秒）
    static #DEBOUNCE_DELAY = 150;

    /**
     * 构造函数
     * @param state
     * @param containerId
     */
    constructor(state, containerId) {
        super(state, containerId);
        this.animationFrameId = null;
        this.debounceTimer = null;
    }

    /**
     * 订阅状态变化
     * @returns {void}
     */
    subscribe() {
        // 订阅标题数据变化，生成目录（使用防抖）
        this.unsubscribe = this.state.subscribeTo('headings', () => {
            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }

            this.debounceTimer = setTimeout(() => {
                this.debounceTimer = null;
                this.generateTOC();
            }, TOC.#DEBOUNCE_DELAY);
        });
    }

    /**
     * 绑定事件
     * @returns {void}
     */
    bindEvents() {
        // 使用事件委托处理目录项点击
        this.addEventListener(this.container, 'click', e => {
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

    /**
     * 生成目录（增量更新优化）
     * @returns {void}
     */
    generateTOC() {
        const headings = this.state.get('headings');
        const headingCount = headings ? headings.length : 0;

        if (headingCount === 0) {
            this.container.innerHTML = '<p class="md-empty-state">暂无目录</p>';
            return;
        }

        // 使用 dom.js 统一查询，检查是否需要完全重建
        const currentItems = dom.getAllIn(this.container, '.md-toc-item');
        const itemCount = currentItems.length;

        // 数量不同，直接重建
        if (itemCount !== headingCount) {
            // 使用 RAF 避免阻塞
            if (this.animationFrameId) {
                cancelAnimationFrame(this.animationFrameId);
            }

            this.animationFrameId = requestAnimationFrame(() => {
                this.animationFrameId = null;
                this.#rebuildTOC(headings);
            });
            return;
        }

        // 数量相同，增量更新
        this.#updateTOC(headings, currentItems);
    }

    /**
     * 完全重建目录
     * @param headings
     * @private
     */
    #rebuildTOC(headings) {
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
     * @param headings
     * @param currentItems
     * @private
     */
    #updateTOC(headings, currentItems) {
        for (let i = 0; i < headings.length; i++) {
            const heading = headings[i];
            const currentItem = currentItems[i];

            // 直接使用已有的数据，无需解析
            const headingId = heading.id || `heading-${i}`;
            const level = heading.level || +heading.tagName.substring(1);
            const text = heading.textContent || '';

            // 一次性读取当前值，避免重复查询 DOM
            const { dataset } = currentItem;
            const currentId = dataset.headingId;
            const currentLevel = +dataset.level; // 直接从 data-level 读取，避免正则匹配
            const currentText = currentItem.textContent;

            // 检查是否需要更新，直接更新 DOM
            if (currentId !== headingId || currentText !== text || currentLevel !== level) {
                dataset.headingId = headingId;
                dataset.level = level;
                currentItem.textContent = text;
                currentItem.className = `md-toc-item level-${level}`;
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
}
