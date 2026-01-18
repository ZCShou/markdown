/**
 * UI 组件基类
 * 提供组件通用功能：状态订阅、DOM 缓存、事件管理
 */
export class BaseComponent {
    /**
     * 构造函数
     * @param {EditorState} state - 状态管理器实例
     * @param {string} containerId - 容器元素 ID
     */
    constructor(state, containerId) {
        this.state = state;
        this.containerId = containerId;
        this.container = null;
        this.domCache = new Map();
        this.unsubscribe = null;
        this.eventHandlers = new Map();
    }

    /**
     * 初始化组件
     */
    init() {
        this.container = document.getElementById(this.containerId);
        if (!this.container) {
            console.warn(`Container not found: ${this.containerId}`);
            return;
        }

        this.subscribe();
        this.bindEvents();
        this.render();
    }

    /**
     * 销毁组件
     */
    destroy() {
        // 取消状态订阅
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }

        // 移除事件监听
        this.eventHandlers.forEach((handlers, element) => {
            handlers.forEach(({ event, handler, options }) => {
                element.removeEventListener(event, handler, options);
            });
        });
        this.eventHandlers.clear();

        // 清空容器
        if (this.container) {
            this.container.innerHTML = '';
        }

        // 清空 DOM 缓存
        this.domCache.clear();
    }

    /**
     * 订阅状态变化（子类实现）
     */
    subscribe() {
        // 子类实现具体的订阅逻辑
    }

    /**
     * 绑定事件（子类实现）
     */
    bindEvents() {
        // 子类实现具体的事件绑定逻辑
    }

    /**
     * 渲染组件（子类实现）
     */
    render() {
        // 子类实现具体的渲染逻辑
    }

    /**
     * 获取 DOM 元素（带缓存）
     */
    getElement(id, container = this.container) {
        if (!container) return null;

        const cacheKey = container.id + '-' + id;
        if (!this.domCache.has(cacheKey)) {
            this.domCache.set(cacheKey, container.querySelector(`#${id}`) || 
                                           document.getElementById(id));
        }
        return this.domCache.get(cacheKey);
    }

    /**
     * 查询元素（带缓存）
     */
    querySelector(selector, container = this.container) {
        if (!container) return null;
        return container.querySelector(selector);
    }

    /**
     * 查询所有元素
     */
    querySelectorAll(selector, container = this.container) {
        if (!container) return [];
        return Array.from(container.querySelectorAll(selector));
    }

    /**
     * 添加事件监听（自动管理清理）
     */
    addEventListener(element, event, handler, options) {
        if (!element) return;

        element.addEventListener(event, handler, options);

        // 记录事件处理器以便后续清理
        if (!this.eventHandlers.has(element)) {
            this.eventHandlers.set(element, []);
        }
        this.eventHandlers.get(element).push({ event, handler, options });
    }

    /**
     * 创建元素
     */
    createElement(tag, options = {}) {
        const element = document.createElement(tag);

        if (options.className) {
            element.className = options.className;
        }

        if (options.id) {
            element.id = options.id;
        }

        if (options.textContent) {
            element.textContent = options.textContent;
        }

        if (options.innerHTML) {
            element.innerHTML = options.innerHTML;
        }

        if (options.dataset) {
            Object.entries(options.dataset).forEach(([key, value]) => {
                element.dataset[key] = value;
            });
        }

        if (options.attributes) {
            Object.entries(options.attributes).forEach(([key, value]) => {
                element.setAttribute(key, value);
            });
        }

        if (options.style) {
            Object.assign(element.style, options.style);
        }

        if (options.parent) {
            options.parent.appendChild(element);
        }

        return element;
    }

    /**
     * 创建文档片段
     */
    createFragment() {
        return document.createDocumentFragment();
    }

    /**
     * 显示消息（委托给主编辑器）
     */
    showMessage(message, type = 'info', duration = 2000) {
        // 触发自定义事件，由主编辑器处理
        window.dispatchEvent(new CustomEvent('md:showMessage', {
            detail: { message, type, duration }
        }));
    }

    /**
     * 防抖函数
     */
    debounce(key, fn, delay) {
        if (!this.timers) {
            this.timers = new Map();
        }

        if (this.timers.has(key)) {
            clearTimeout(this.timers.get(key));
        }

        const timerId = setTimeout(fn, delay);
        this.timers.set(key, timerId);
    }

    /**
     * 格式化日期
     */
    formatDate(isoString) {
        const date = new Date(isoString);
        const now = new Date();
        const diff = now - date;

        // 小于1分钟
        if (diff < 60000) {
            return '刚刚';
        }

        // 小于1小时
        if (diff < 3600000) {
            return `${Math.floor(diff / 60000)}分钟前`;
        }

        // 小于1天
        if (diff < 86400000) {
            return `${Math.floor(diff / 3600000)}小时前`;
        }

        // 小于1周
        if (diff < 604800000) {
            return `${Math.floor(diff / 86400000)}天前`;
        }

        // 显示具体日期
        return date.toLocaleDateString('zh-CN');
    }

    /**
     * 转义 HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
