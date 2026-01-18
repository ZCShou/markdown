/**
 * 本地存储管理器
 * 负责管理所有与 localStorage 相关的数据存储和读取
 * 
 * @example
 * ```js
 * // 保存内容
 * const result = StoreManager.saveContent('Hello World');
 * if (!result.success) {
 *   console.error(result.error);
 * }
 * 
 * // 加载内容
 * const content = StoreManager.loadContent('default content');
 * ```
 */
export class StoreManager {
    // ==================== 存储键名常量 ====================
    
    /** @type {Object} 存储键名映射 */
    static #STORAGE_KEYS = {
        CONTENT: 'markdown_editor_content',
        DOCUMENTS: 'markdown_editor_documents',
        THEME: 'markdown_editor_theme',
        LAYOUT: 'markdown_editor_layout',
        SECTION_PREFIX: 'markdown_editor_section_',
        SIDEBAR_LEFT: 'markdown_editor_sidebar_left',
        SIDEBAR_RIGHT: 'markdown_editor_sidebar_right'
    };

    /** @type {number} 最大存储大小（字节）- 约 5MB */
    static #MAX_STORAGE_SIZE = 5 * 1024 * 1024;

    // ==================== 内容存储 ====================
    
    /**
     * 保存编辑器内容到本地存储
     * @param {string} content - 编辑器内容
     * @returns {{success: boolean, error?: string}} 保存结果
     */
    static saveContent(content) {
        try {
            localStorage.setItem(StoreManager.#STORAGE_KEYS.CONTENT, content);
            return { success: true };
        } catch (e) {
            const errorMsg = StoreManager.#handleStorageError(e, '保存内容失败');
            console.warn(`${errorMsg}:`, e);
            return { success: false, error: errorMsg };
        }
    }

    /**
     * 从本地存储加载编辑器内容
     * @param {string} defaultContent - 默认内容
     * @returns {string} 保存的内容或默认内容
     */
    static loadContent(defaultContent = '') {
        try {
            const saved = localStorage.getItem(StoreManager.#STORAGE_KEYS.CONTENT);
            return saved !== null ? saved : defaultContent;
        } catch (e) {
            console.warn('加载内容失败:', e);
            StoreManager.#clearCorruptedData(StoreManager.#STORAGE_KEYS.CONTENT);
            return defaultContent;
        }
    }

    /**
     * 清除编辑器内容
     * @returns {boolean} 是否成功
     */
    static clearContent() {
        try {
            localStorage.removeItem(StoreManager.#STORAGE_KEYS.CONTENT);
            return true;
        } catch (e) {
            console.warn('清除内容失败:', e);
            return false;
        }
    }

    // ==================== 文档管理 ====================

    /**
     * 保存文档列表
     * @param {Array} documents - 文档列表
     * @returns {{success: boolean, error?: string}} 保存结果
     */
    static saveDocuments(documents) {
        try {
            const serialized = JSON.stringify(documents);
            localStorage.setItem(StoreManager.#STORAGE_KEYS.DOCUMENTS, serialized);
            return { success: true };
        } catch (e) {
            const errorMsg = StoreManager.#handleStorageError(e, '保存文档列表失败');
            console.warn(`${errorMsg}:`, e);
            return { success: false, error: errorMsg };
        }
    }

    /**
     * 加载文档列表
     * @returns {Array} 文档列表
     */
    static loadDocuments() {
        try {
            const saved = localStorage.getItem(StoreManager.#STORAGE_KEYS.DOCUMENTS);
            if (!saved) return [];
            
            const documents = JSON.parse(saved);
            // 验证数据格式
            if (!Array.isArray(documents)) {
                console.warn('文档列表格式错误，已重置');
                return [];
            }
            return documents;
        } catch (e) {
            console.warn('加载文档列表失败:', e);
            StoreManager.#clearCorruptedData(StoreManager.#STORAGE_KEYS.DOCUMENTS);
            return [];
        }
    }

    // ==================== 主题设置 ====================

    /**
     * 保存主题设置
     * @param {string} theme - 主题名称
     * @returns {boolean} 是否成功
     */
    static saveTheme(theme) {
        try {
            localStorage.setItem(StoreManager.#STORAGE_KEYS.THEME, theme);
            return true;
        } catch (e) {
            console.warn('保存主题失败:', e);
            return false;
        }
    }

    /**
     * 加载主题设置
     * @param {string} defaultTheme - 默认主题
     * @returns {string} 主题名称
     */
    static loadTheme(defaultTheme = 'light') {
        try {
            const saved = localStorage.getItem(StoreManager.STORAGE_KEYS.THEME);
            return saved || defaultTheme;
        } catch (e) {
            console.warn('加载主题失败:', e);
            return defaultTheme;
        }
    }

    // ==================== 布局设置 ====================

    /**
     * 保存布局设置
     * @param {string} layout - 布局模式
     * @returns {boolean} 是否成功
     */
    static saveLayout(layout) {
        try {
            localStorage.setItem(StoreManager.#STORAGE_KEYS.LAYOUT, layout);
            return true;
        } catch (e) {
            console.warn('保存布局失败:', e);
            return false;
        }
    }

    /**
     * 加载布局设置
     * @param {string} defaultLayout - 默认布局
     * @returns {string} 布局模式
     */
    static loadLayout(defaultLayout = 'layout-both') {
        try {
            const saved = localStorage.getItem(StoreManager.#STORAGE_KEYS.LAYOUT);
            return saved || defaultLayout;
        } catch (e) {
            console.warn('加载布局失败:', e);
            return defaultLayout;
        }
    }

    // ==================== 侧边栏状态 ====================

    /**
     * 保存侧边栏状态
     * @param {string} side - 'left' 或 'right'
     * @param {boolean} isOpen - 是否打开
     * @returns {boolean} 是否成功
     */
    static saveSidebarState(side, isOpen) {
        try {
            const key = side === 'left' 
                ? StoreManager.#STORAGE_KEYS.SIDEBAR_LEFT 
                : StoreManager.#STORAGE_KEYS.SIDEBAR_RIGHT;
            localStorage.setItem(key, JSON.stringify(isOpen));
            return true;
        } catch (e) {
            console.warn('保存侧边栏状态失败:', e);
            return false;
        }
    }

    /**
     * 加载侧边栏状态
     * @param {string} side - 'left' 或 'right'
     * @param {boolean} defaultState - 默认状态
     * @returns {boolean} 是否打开
     */
    static loadSidebarState(side, defaultState = false) {
        try {
            const key = side === 'left' 
                ? StoreManager.#STORAGE_KEYS.SIDEBAR_LEFT 
                : StoreManager.#STORAGE_KEYS.SIDEBAR_RIGHT;
            const saved = localStorage.getItem(key);
            return saved !== null ? JSON.parse(saved) : defaultState;
        } catch (e) {
            console.warn('加载侧边栏状态失败:', e);
            return defaultState;
        }
    }

    // ==================== 侧边栏折叠状态 ====================

    /**
     * 保存侧边栏折叠状态
     * @param {string} section - 区块名称
     * @param {boolean} collapsed - 是否折叠
     * @returns {boolean} 是否成功
     */
    static saveSectionState(section, collapsed) {
        try {
            const key = StoreManager.#STORAGE_KEYS.SECTION_PREFIX + section;
            localStorage.setItem(key, JSON.stringify(collapsed));
            return true;
        } catch (e) {
            console.warn('保存折叠状态失败:', e);
            return false;
        }
    }

    /**
     * 加载侧边栏折叠状态
     * @param {string} section - 区块名称
     * @param {boolean} defaultState - 默认状态
     * @returns {boolean} 是否折叠
     */
    static loadSectionState(section, defaultState = false) {
        try {
            const key = StoreManager.#STORAGE_KEYS.SECTION_PREFIX + section;
            const saved = localStorage.getItem(key);
            return saved !== null ? JSON.parse(saved) : defaultState;
        } catch (e) {
            console.warn('加载折叠状态失败:', e);
            return defaultState;
        }
    }

    /**
     * 清除所有数据
     * @returns {boolean} 是否成功
     */
    static clearAll() {
        try {
            Object.values(StoreManager.#STORAGE_KEYS).forEach(key => {
                localStorage.removeItem(key);
            });
            // 清除所有折叠状态
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith(StoreManager.#STORAGE_KEYS.SECTION_PREFIX)) {
                    localStorage.removeItem(key);
                }
            });
            return true;
        } catch (e) {
            console.warn('清除所有数据失败:', e);
            return false;
        }
    }

    // ==================== 私有辅助方法 ====================

    /**
     * 处理存储错误
     * @private
     * @param {Error} error - 错误对象
     * @param {string} defaultMessage - 默认错误消息
     * @returns {string} 错误消息
     */
    static #handleStorageError(error, defaultMessage) {
        if (error.name === 'QuotaExceededError') {
            return '存储空间不足，请清理浏览器缓存或删除部分文档';
        } else if (error.name === 'SecurityError') {
            return '浏览器安全设置阻止了存储操作';
        } else if (error.name === 'NS_ERROR_FILE_CORRUPTED') {
            return '存储数据已损坏，请清除浏览器缓存';
        } else if (error instanceof TypeError) {
            return '数据格式错误，无法序列化';
        }
        return defaultMessage;
    }

    /**
     * 清除损坏的数据
     * @private
     * @param {string} key - 存储键
     */
    static #clearCorruptedData(key) {
        try {
            localStorage.removeItem(key);
        } catch (cleanupError) {
            console.error('清理损坏数据失败:', cleanupError);
        }
    }
}
