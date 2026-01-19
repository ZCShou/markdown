/**
 * UI 组件基类
 * 提供组件通用功能：状态订阅、事件管理、工具方法
 * 
 * DOM 访问说明：
 * - 全局元素：使用 dom.js（如 dom.editor.element）
 * - 组件内查询：使用 dom.getIn() 或 dom.getAllIn()
 * 
 * @example
 * ```js
 * class MyComponent extends BaseComponent {
 *   constructor(state, containerId) {
 *     super(state, containerId);
 *   }
 *   
 *   render() {
 *     // 使用 dom.js 访问全局元素
 *     const editor = dom.editor.element;
 *     
 *     // 在组件内查询元素
 *     const items = dom.getAllIn(this.container, '.item');
 *     
 *     // 创建元素
 *     const btn = this.createElement('button', {
 *       textContent: 'Click me'
 *     });
 *     
 *     this.container.appendChild(btn);
 *   }
 * }
 * ```
 */
import { debounce, escapeHtml } from '../utils/helpers.js';
import { dom } from '../utils/dom.js';

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
        this.unsubscribe = null;
        this.eventHandlers = new Map();
    }

    /**
     * 初始化组件
     */
    init() {
        // 使用 dom.js 获取容器
        this.container = dom.getById(this.containerId)?.element;
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
     * 添加事件监听（自动管理清理）
     */
    addEventListener(element, event, handler, options) {
        if (!element) return;

        // 使用 dom.js 的 on 方法
        element.addEventListener(event, handler, options);

        // 记录事件处理器以便后续清理
        if (!this.eventHandlers.has(element)) {
            this.eventHandlers.set(element, []);
        }
        this.eventHandlers.get(element).push({ event, handler, options });
    }

    /**
     * 创建元素（使用 dom.js）
     */
    createElement(tag, options = {}) {
        return dom.create(tag, options);
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
     * 防抖函数（使用 helpers.js 中的 debounce 实现）
     */
    debounce(key, fn, delay) {
        if (!this.debouncedFunctions) {
            this.debouncedFunctions = new Map();
        }

        if (!this.debouncedFunctions.has(key)) {
            this.debouncedFunctions.set(key, debounce(fn, delay));
        }

        this.debouncedFunctions.get(key)();
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
     * 转义 HTML（使用 helpers.js）
     */
    escapeHtml(text) {
        return escapeHtml(text);
    }
}
