/**
 * DOM 统一管理器
 * 
 * 集中管理项目中所有的 DOM 元素引用，提供统一的访问接口
 * 
 * @example
 * ```js
 * import { dom } from './utils/dom.js';
 * 
 * // 获取元素
 * const container = dom.app.container;
 * const editor = dom.editor.element;
 * 
 * // 检查元素是否存在
 * if (dom.sidebar.left.exists()) {
 *     dom.sidebar.left.toggle();
 * }
 * 
 * // 批量操作
 * dom.buttons.all.forEach(btn => btn.classList.add('active'));
 * ```
 */

/**
 * DOM 元素包装类
 * 提供便捷的元素操作方法
 */
class DOMElement {
    /**
     * @param {string} selector - CSS 选择器
     * @param {Function} getter - 获取元素的函数
     */
    constructor(selector, getter = null) {
        this.selector = selector;
        this.getter = getter;
        this._element = null;
    }

    /**
     * 获取元素（带缓存）
     */
    get element() {
        if (!this._element) {
            this._element = this.getter ? this.getter() : document.querySelector(this.selector);
        }
        return this._element;
    }

    /**
     * 检查元素是否存在
     */
    exists() {
        return this.element !== null;
    }

    /**
     * 显示元素
     */
    show() {
        if (this.exists()) {
            this.element.classList.remove('hidden');
            this.element.classList.add('visible');
        }
    }

    /**
     * 隐藏元素
     */
    hide() {
        if (this.exists()) {
            this.element.classList.remove('visible');
            this.element.classList.add('hidden');
        }
    }

    /**
     * 切换显示状态
     */
    toggle() {
        if (this.exists()) {
            this.element.classList.toggle('visible');
            this.element.classList.toggle('hidden');
        }
    }

    /**
     * 添加类名
     */
    addClass(...classNames) {
        if (this.exists()) {
            this.element.classList.add(...classNames);
        }
    }

    /**
     * 移除类名
     */
    removeClass(...classNames) {
        if (this.exists()) {
            this.element.classList.remove(...classNames);
        }
    }

    /**
     * 切换类名
     */
    toggleClass(className) {
        if (this.exists()) {
            this.element.classList.toggle(className);
        }
    }

    /**
     * 检查是否有类名
     */
    hasClass(className) {
        return this.exists() && this.element.classList.contains(className);
    }

    /**
     * 设置属性
     */
    setAttribute(name, value) {
        if (this.exists()) {
            this.element.setAttribute(name, value);
        }
    }

    /**
     * 获取属性
     */
    getAttribute(name) {
        return this.exists() ? this.element.getAttribute(name) : null;
    }

    /**
     * 设置文本内容
     */
    setText(text) {
        if (this.exists()) {
            this.element.textContent = text;
        }
    }

    /**
     * 设置 HTML 内容
     */
    setHTML(html) {
        if (this.exists()) {
            this.element.innerHTML = html;
        }
    }

    /**
     * 添加事件监听
     */
    on(event, handler, options) {
        if (this.exists()) {
            this.element.addEventListener(event, handler, options);
        }
    }

    /**
     * 移除事件监听
     */
    off(event, handler, options) {
        if (this.exists()) {
            this.element.removeEventListener(event, handler, options);
        }
    }

    /**
     * 清除缓存
     */
    clearCache() {
        this._element = null;
    }
}

/**
 * DOM 元素集合包装类
 */
class DOMElementList {
    /**
     * @param {string} selector - CSS 选择器
     * @param {Function} getter - 获取元素的函数
     */
    constructor(selector, getter = null) {
        this.selector = selector;
        this.getter = getter;
        this._elements = null;
    }

    /**
     * 获取所有元素（带缓存）
     */
    get all() {
        if (!this._elements) {
            const elements = this.getter ? this.getter() : document.querySelectorAll(this.selector);
            this._elements = Array.from(elements);
        }
        return this._elements;
    }

    /**
     * 获取第一个元素
     */
    get first() {
        return this.all[0] || null;
    }

    /**
     * 获取最后一个元素
     */
    get last() {
        return this.all[this.all.length - 1] || null;
    }

    /**
     * 获取元素数量
     */
    get length() {
        return this.all.length;
    }

    /**
     * 检查是否有元素
     */
    get exists() {
        return this.all.length > 0;
    }

    /**
     * 遍历所有元素
     */
    forEach(callback) {
        this.all.forEach(callback);
    }

    /**
     * 为所有元素添加类名
     */
    addClass(...classNames) {
        this.forEach(element => element.classList.add(...classNames));
    }

    /**
     * 为所有元素移除类名
     */
    removeClass(...classNames) {
        this.forEach(element => element.classList.remove(...classNames));
    }

    /**
     * 为所有元素切换类名
     */
    toggleClass(className) {
        this.forEach(element => element.classList.toggle(className));
    }

    /**
     * 为所有元素添加事件监听
     */
    on(event, handler, options) {
        this.forEach(element => element.addEventListener(event, handler, options));
    }

    /**
     * 清除缓存
     */
    clearCache() {
        this._elements = null;
    }
}

/**
 * DOM 管理器
 * 集中管理所有 DOM 元素
 */
export const dom = {
    // ==================== 缓存 ====================
    
    /**
     * 全局缓存（用于静态元素）
     */
    globalCache: new Map(),

    // ==================== 应用容器 ====================
    
    /**
     * 应用主容器
     */
    app: {
        container: new DOMElement('#md-container'),
        overlay: new DOMElement('#md-sidebar-overlay')
    },

    // ==================== 编辑器区域 ====================
    
    /**
     * 编辑器相关元素
     */
    editor: {
        pane: new DOMElement('#md-editor-pane'),
        element: new DOMElement('#markdown-editor'),
        container: new DOMElement('#md-editor-container')
    },

    // ==================== 预览区域 ====================
    
    /**
     * 预览相关元素
     */
    preview: {
        pane: new DOMElement('#md-preview-pane'),
        element: new DOMElement('#markdown-preview'),
        wrapper: new DOMElement('#md-preview-wrapper'),
        container: new DOMElement('#md-preview-container')
    },

    // ==================== 分隔条 ====================
    
    /**
     * 分隔条元素
     */
    divider: {
        element: new DOMElement('#md-divider')
    },

    // ==================== 侧边栏 ====================
    
    /**
     * 侧边栏元素
     */
    sidebar: {
        left: new DOMElement('#md-sidebar-left'),
        right: new DOMElement('#md-sidebar-right'),
        
        // 左侧边栏内容
        leftContent: {
            documents: new DOMElement('#md-documents-content'),
            toc: new DOMElement('#md-toc-content')
        },
        
        // 右侧边栏内容
        rightContent: {
            settings: new DOMElement('#md-settings-content'),
            info: new DOMElement('#md-info-content')
        }
    },

    // ==================== 文档列表 ====================
    
    /**
     * 文档列表元素
     */
    documentList: {
        container: new DOMElement('#md-doc-list'),
        items: new DOMElementList('.md-doc-item')
    },

    // ==================== 目录 ====================
    
    /**
     * 目录元素
     */
    toc: {
        container: new DOMElement('#md-toc'),
        items: new DOMElementList('.toc-item')
    },

    // ==================== 按钮 ====================
    
    /**
     * 按钮元素
     */
    buttons: {
        // 侧边栏切换按钮
        toggleLeft: new DOMElement('#md-toggle-left-sidebar'),
        toggleRight: new DOMElement('#md-toggle-right-sidebar'),
        
        // 关闭按钮
        closeLeft: new DOMElement('#md-close-left-sidebar'),
        closeRight: new DOMElement('#md-close-right-sidebar'),
        
        // 文档操作按钮
        newFile: new DOMElement('#md-new-file'),
        newFolder: new DOMElement('#md-new-folder'),
        delete: new DOMElement('#md-delete-item'),
        
        // 导出按钮
        exportHTML: new DOMElement('#md-export-html'),
        exportMD: new DOMElement('#md-export-md'),
        
        // 布局和主题
        layoutToggle: new DOMElement('#md-layout-toggle'),
        themeToggle: new DOMElement('#theme-toggle'),
        
        // 所有按钮（用于批量操作）
        all: new DOMElementList('.md-btn')
    },

    // ==================== 状态显示 ====================
    
    /**
     * 状态显示元素
     */
    status: {
        overlay: new DOMElement('#status-overlay'),
        message: new DOMElement('#status-message')
    },

    // ==================== 主题相关 ====================
    
    /**
     * 主题相关元素
     */
    theme: {
        light: new DOMElement('#prism-light-theme'),
        dark: new DOMElement('#prism-dark-theme'),
        icon: new DOMElement('.theme-icon')
    },

    // ==================== 工具方法 ====================
    
    /**
     * 初始化所有 DOM 元素
     * 预加载所有元素到缓存
     */
    init() {
        // 遍历所有 DOM 元素并触发 getter
        const initElement = (obj) => {
            for (const key in obj) {
                const value = obj[key];
                if (value instanceof DOMElement) {
                    // 触发 getter，加载元素到缓存
                    const element = value.element;
                    if (!element) {
                        console.warn(`Element not found: ${value.selector}`);
                    }
                } else if (value instanceof DOMElementList) {
                    // 触发 getter，加载元素列表到缓存
                    const elements = value.all;
                    if (elements.length === 0) {
                        console.warn(`No elements found: ${value.selector}`);
                    }
                } else if (typeof value === 'object' && value !== null) {
                    // 递归处理嵌套对象
                    initElement(value);
                }
            }
        };
        
        initElement(this);
    },

    /**
     * 清除所有缓存
     */
    clearCache() {
        const clearElementCache = (obj) => {
            for (const key in obj) {
                const value = obj[key];
                if (value instanceof DOMElement || value instanceof DOMElementList) {
                    value.clearCache();
                } else if (typeof value === 'object' && value !== null) {
                    clearElementCache(value);
                }
            }
        };
        
        clearElementCache(this);
    },

    /**
     * 检查所有必需元素是否存在
     */
    checkRequired() {
        const required = [
            'app.container',
            'editor.element',
            'preview.element',
            'divider.element'
        ];
        
        const missing = [];
        
        for (const path of required) {
            const keys = path.split('.');
            let obj = this;
            
            for (const key of keys) {
                obj = obj[key];
                if (!obj) {
                    missing.push(path);
                    break;
                }
            }
            
            if (obj && !obj.exists()) {
                missing.push(path);
            }
        }
        
        if (missing.length > 0) {
            console.error('Missing required DOM elements:', missing);
            return false;
        }
        
        return true;
    },

    /**
     * 获取元素信息（调试用）
     */
    debug() {
        const info = {};
        
        const collectInfo = (obj, prefix = '') => {
            for (const key in obj) {
                const value = obj[key];
                const path = prefix ? `${prefix}.${key}` : key;
                
                if (value instanceof DOMElement) {
                    info[path] = {
                        type: 'element',
                        selector: value.selector,
                        exists: value.exists(),
                        element: value.element
                    };
                } else if (value instanceof DOMElementList) {
                    info[path] = {
                        type: 'list',
                        selector: value.selector,
                        count: value.length,
                        exists: value.exists
                    };
                } else if (typeof value === 'object' && value !== null) {
                    collectInfo(value, path);
                }
            }
        };
        
        collectInfo(this);
        return info;
    },

    /**
     * 等待元素出现
     */
    waitFor(selector, timeout = 5000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }

            const observer = new MutationObserver(() => {
                const element = document.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Element ${selector} not found within ${timeout}ms`));
            }, timeout);
        });
    },

    /**
     * 创建元素
     */
    create(tag, options = {}) {
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
    },

    // ==================== 工具方法 ====================

    /**
     * 通过 ID 获取元素（带缓存）
     * @param {string} id - 元素 ID
     * @returns {DOMElement|null}
     */
    getById(id) {
        const selector = `#${id}`;
        if (!this.globalCache.has(selector)) {
            const element = document.getElementById(id);
            this.globalCache.set(selector, new DOMElement(selector, () => element));
        }
        return this.globalCache.get(selector);
    },

    /**
     * 获取单个元素（不缓存）
     * @param {string} selector - CSS 选择器
     * @param {Element|Document} context - 查询上下文
     * @returns {Element|null}
     */
    get(selector, context = document) {
        if (typeof selector !== 'string') {
            return selector;
        }
        return context.querySelector(selector);
    },

    /**
     * 获取多个元素（不缓存）
     * @param {string} selector - CSS 选择器
     * @param {Element|Document} context - 查询上下文
     * @returns {Element[]}
     */
    getAll(selector, context = document) {
        return Array.from(context.querySelectorAll(selector));
    },

    /**
     * 在指定容器中查询单个元素
     * @param {Element} container - 容器元素
     * @param {string} selector - CSS 选择器
     * @returns {Element|null}
     */
    getIn(container, selector) {
        if (!container) return null;
        return this.get(selector, container);
    },

    /**
     * 在指定容器中查询多个元素
     * @param {Element} container - 容器元素
     * @param {string} selector - CSS 选择器
     * @returns {Element[]}
     */
    getAllIn(container, selector) {
        if (!container) return [];
        return this.getAll(selector, container);
    }
};

// ==================== 导出 ====================

/**
 * 使用示例：
 * 
 * ```js
 * import { dom } from './utils/dom.js';
 * 
 * // 初始化（可选，用于预加载和检查）
 * dom.init();
 * 
 * // 检查必需元素
 * if (!dom.checkRequired()) {
 *     console.error('Missing required elements');
 * }
 * 
 * // 获取元素
 * const editor = dom.editor.element;
 * const preview = dom.preview.element;
 * 
 * // 操作元素
 * dom.sidebar.left.show();
 * dom.sidebar.right.hide();
 * 
 * // 批量操作
 * dom.documentList.items.forEach(item => {
 *     item.classList.add('active');
 * });
 * 
 * // 调试
 * console.log(dom.debug());
 * ```
 */

export default dom;
