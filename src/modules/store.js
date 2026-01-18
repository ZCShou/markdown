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
     * @returns {{success: boolean, error?: string}} 保存结果
     */
    static saveContent(content) {
        try {
            localStorage.setItem(StoreManager.STORAGE_KEYS.CONTENT, content);
            return { success: true };
        } catch (e) {
            let errorMsg = '保存内容失败';
            
            // 详细错误类型判断
            if (e.name === 'QuotaExceededError') {
                errorMsg = '存储空间不足，请清理浏览器缓存或删除部分文档';
            } else if (e.name === 'SecurityError') {
                errorMsg = '浏览器安全设置阻止了存储操作';
            } else if (e.name === 'NS_ERROR_FILE_CORRUPTED') {
                errorMsg = '存储数据已损坏，请清除浏览器缓存';
            }
            
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
            const saved = localStorage.getItem(StoreManager.STORAGE_KEYS.CONTENT);
            return saved !== null ? saved : defaultContent;
        } catch (e) {
            console.warn('加载内容失败:', e);
            // 尝试清除损坏的数据
            try {
                localStorage.removeItem(StoreManager.STORAGE_KEYS.CONTENT);
            } catch (cleanupError) {
                console.error('清理损坏数据失败:', cleanupError);
            }
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
     * @returns {{success: boolean, error?: string}} 保存结果
     */
    static saveDocuments(documents) {
        try {
            const serialized = JSON.stringify(documents);
            localStorage.setItem(StoreManager.STORAGE_KEYS.DOCUMENTS, serialized);
            return { success: true };
        } catch (e) {
            let errorMsg = '保存文档列表失败';
            
            if (e.name === 'QuotaExceededError') {
                errorMsg = '存储空间不足，请删除部分文档后重试';
            } else if (e instanceof TypeError) {
                errorMsg = '文档数据格式错误，无法序列化';
            }
            
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
            const saved = localStorage.getItem(StoreManager.STORAGE_KEYS.DOCUMENTS);
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
            // 尝试清除损坏的数据
            try {
                localStorage.removeItem(StoreManager.STORAGE_KEYS.DOCUMENTS);
            } catch (cleanupError) {
                console.error('清理损坏数据失败:', cleanupError);
            }
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
