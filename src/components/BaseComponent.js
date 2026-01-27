/**
 * UI 组件基类
 * 
 * @abstract
 * @description 提供持久化组件的通用功能：状态订阅、事件管理、生命周期管理
 * 
 * 适用范围：
 * - ✅ 持久化组件：Editor, Preview, DocumentList, Sidebar, TOC, SearchReplace
 * - ❌ 对话框组件：Settings（独立类，不需要状态订阅）
 * - ❌ 工具类：Dialog（纯静态方法，不需要实例）
 * 
 * 核心功能：
 * - 状态订阅：subscribe() / unsubscribe()
 * - 事件管理：addEventListener() / 自动清理
 * - 生命周期：init() → subscribe() → bindEvents() → render() → destroy()
 * - 错误处理：handleError() / wrapWithErrorHandler()
 * - 工具方法：showMessage() / debounce() / formatDate()
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
 *   subscribe() {
 *     // 订阅状态变化
 *     this.unsubscribe = this.state.subscribeTo('content', () => {
 *       this.render();
 *     });
 *   }
 * 
 *   bindEvents() {
 *     // 绑定事件（自动管理清理）
 *     this.addEventListener(this.container, 'click', (e) => {
 *       this.handleClick(e);
 *     });
 *   }
 * 
 *   render() {
 *     // 渲染组件
 *     this.container.innerHTML = '<p>Hello</p>';
 *   }
 * }
 * ```
 * 
 * @architecture
 * - 使用模板方法模式：init() 定义初始化流程
 * - 子类实现：subscribe() / bindEvents() / render()
 * - 自动清理：destroy() 时取消订阅和移除事件监听
 * - 错误处理：所有方法都包装在 try-catch 中
 * 
 * @see Settings 对话框组件示例（不继承 BaseComponent）
 * @see Dialog 工具类示例（纯静态方法）
 */
import { debounce, escapeHtml } from '../utils/helpers.js';
import { dom } from '../utils/dom.js';

/**
 *
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
        this.unsubscribe = null;
        this.eventHandlers = new Map();
        this.errorHandlers = new Map();
    }

    /**
     * 全局错误处理器
     * @param {Error} error - 错误对象
     * @param {string} context - 错误上下文
     * @param {Object} metadata - 附加元数据
     * @returns {Object} 错误信息对象
     */
    handleError(error, context = 'unknown', metadata = {}) {
        const errorInfo = {
            component: this.constructor.name,
            context,
            message: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString(),
            ...metadata
        };

        // 控制台输出
        console.error(`[${errorInfo.component}] Error in ${context}:`, error, metadata);

        // 触发错误事件供外部监听
        window.dispatchEvent(
            new CustomEvent('md:componentError', {
                detail: errorInfo
            })
        );

        // 显示用户友好的错误消息
        this.showMessage(`操作失败: ${error.message}`, 'error');

        // 可扩展：上报到错误监控系统
        // this.reportToMonitoring(errorInfo);

        return errorInfo;
    }

    /**
     * 包装函数以捕获错误
     * @param {Function} fn - 要执行的函数
     * @param {string} context - 执行上下文
     * @returns {Function} 包装后的函数
     */
    wrapWithErrorHandler(fn, context) {
        return async (...args) => {
            try {
                return await fn(...args);
            } catch (error) {
                this.handleError(error, context, { args });
                throw error; // 可选：重新抛出以便调用者处理
            }
        };
    }

    /**
     * 初始化组件
     * @returns {void}
     */
    init() {
        try {
            // 使用 dom.js 获取容器
            this.container = dom.getById(this.containerId)?.element;
            if (!this.container) {
                console.warn(`Container not found: ${this.containerId}`);
                return;
            }

            this.subscribe();
            this.bindEvents();
            this.render();
        } catch (error) {
            this.handleError(error, 'init', { containerId: this.containerId });
        }
    }

    /**
     * 销毁组件
     * @returns {void}
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
     * @returns {void}
     */
    subscribe() {
        // 子类实现具体的订阅逻辑
    }

    /**
     * 绑定事件（子类实现）
     * @returns {void}
     */
    bindEvents() {
        // 子类实现具体的事件绑定逻辑
    }

    /**
     * 渲染组件（子类实现）
     * @returns {void}
     */
    render() {
        // 子类实现具体的渲染逻辑
    }

    /**
     * 添加事件监听（自动管理清理）
     * @param {Element} element - DOM 元素
     * @param {string} event - 事件类型
     * @param {Function} handler - 事件处理函数
     * @param {Object|boolean} [options] - 监听选项
     * @returns {void}
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
     * @param {string} tag - 标签名
     * @param {Object} [options] - 创建选项
     * @returns {Element}
     */
    createElement(tag, options = {}) {
        return dom.create(tag, options);
    }

    /**
     * 创建文档片段
     * @returns {DocumentFragment}
     */
    createFragment() {
        return document.createDocumentFragment();
    }

    /**
     * 显示消息（使用状态驱动）
     * @param {string} message - 消息内容
     * @param {string} [type='info'] - 消息类型
     * @param {number} [duration=2000] - 持续时间（毫秒）
     * @returns {void}
     */
    showMessage(message, type = 'info', duration = 2000) {
        // 使用状态驱动的通知系统
        this.state.showNotification(message, type);
    }

    /**
     * 防抖函数（使用 helpers.js 中的 debounce 实现）
     * @param {string} key - 防抖键
     * @param {Function} fn - 要执行的函数
     * @param {number} delay - 延迟（毫秒）
     * @returns {void}
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
     * @param {string} isoString - ISO 格式日期字符串
     * @returns {string}
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
     * @param {string} text - 要转义的文本
     * @returns {string}
     */
    escapeHtml(text) {
        return escapeHtml(text);
    }
}
