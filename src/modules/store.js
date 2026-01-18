/**
 * 本地存储管理器
 * 负责管理所有与 localStorage 相关的数据存储和读取
 */
export class StoreManager {
    // ==================== 存储键名常量 ====================
    
    static STORAGE_KEYS = {
        CONTENT: 'markdown_editor_content',
        DOCUMENTS: 'markdown_editor_documents',
        THEME: 'markdown_editor_theme',
        SECTION_PREFIX: 'markdown_editor_section_'
    };

    // ==================== 内容存储 ====================
    
    /**
     * 保存编辑器内容到本地存储
     * @param {string} content - 编辑器内容
     */
    static saveContent(content) {
        try {
            localStorage.setItem(StoreManager.STORAGE_KEYS.CONTENT, content);
            return true;
        } catch (e) {
            console.warn('保存内容失败:', e);
            return false;
        }
    }

    /**
     * 从本地存储加载编辑器内容
     * @param {string} defaultContent - 默认内容
     * @returns {string} 保存的内容或默认内容
     */
    static loadContent(defaultContent = '') {
        try {
            const saved = localStorage.getItem(StoreManager.STORAGE_KEYS.CONTENT);
            return saved !== null ? saved : defaultContent;
        } catch (e) {
            console.warn('加载内容失败:', e);
            return defaultContent;
        }
    }

    /**
     * 清除编辑器内容
     */
    static clearContent() {
        try {
            localStorage.removeItem(StoreManager.STORAGE_KEYS.CONTENT);
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
     */
    static saveDocuments(documents) {
        try {
            localStorage.setItem(StoreManager.STORAGE_KEYS.DOCUMENTS, JSON.stringify(documents));
            return true;
        } catch (e) {
            console.warn('保存文档列表失败:', e);
            return false;
        }
    }

    /**
     * 加载文档列表
     * @returns {Array} 文档列表
     */
    static loadDocuments() {
        try {
            const saved = localStorage.getItem(StoreManager.STORAGE_KEYS.DOCUMENTS);
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.warn('加载文档列表失败:', e);
            return [];
        }
    }

    // ==================== 主题设置 ====================

    /**
     * 保存主题设置
     * @param {string} theme - 主题名称
     */
    static saveTheme(theme) {
        try {
            localStorage.setItem(StoreManager.STORAGE_KEYS.THEME, theme);
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

    // ==================== 侧边栏折叠状态 ====================

    /**
     * 保存侧边栏折叠状态
     * @param {string} section - 区块名称
     * @param {boolean} collapsed - 是否折叠
     */
    static saveSectionState(section, collapsed) {
        try {
            const key = StoreManager.STORAGE_KEYS.SECTION_PREFIX + section;
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
            const key = StoreManager.STORAGE_KEYS.SECTION_PREFIX + section;
            const saved = localStorage.getItem(key);
            return saved !== null ? JSON.parse(saved) : defaultState;
        } catch (e) {
            console.warn('加载折叠状态失败:', e);
            return defaultState;
        }
    }

    /**
     * 清除所有数据
     */
    static clearAll() {
        try {
            Object.values(StoreManager.STORAGE_KEYS).forEach(key => {
                localStorage.removeItem(key);
            });
            // 清除所有折叠状态
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith(StoreManager.STORAGE_KEYS.SECTION_PREFIX)) {
                    localStorage.removeItem(key);
                }
            });
            return true;
        } catch (e) {
            console.warn('清除所有数据失败:', e);
            return false;
        }
    }
}
