/**
 * 本地存储管理器
 * 负责管理所有与 localStorage 相关的数据存储和读取
 */
class StoreManager {
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

    // ==================== 文档列表管理 ====================
    
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

    /**
     * 保存文档列表
     * @param {Array} documents - 文档列表
     * @returns {boolean} 是否保存成功
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
     * 清除文档列表
     * @returns {boolean} 是否清除成功
     */
    static clearDocuments() {
        try {
            localStorage.removeItem(StoreManager.STORAGE_KEYS.DOCUMENTS);
            return true;
        } catch (e) {
            console.warn('清除文档列表失败:', e);
            return false;
        }
    }

    // ==================== 主题管理 ====================
    
    /**
     * 获取当前主题模式
     * @param {string} defaultMode - 默认主题模式
     * @returns {string} 主题模式 ('light' 或 'dark')
     */
    static getThemeMode(defaultMode = 'light') {
        try {
            return localStorage.getItem(StoreManager.STORAGE_KEYS.THEME) || defaultMode;
        } catch (e) {
            return defaultMode;
        }
    }

    /**
     * 设置主题模式
     * @param {string} mode - 主题模式 ('light' 或 'dark')
     * @returns {boolean} 是否设置成功
     */
    static setThemeMode(mode) {
        try {
            localStorage.setItem(StoreManager.STORAGE_KEYS.THEME, mode);
            return true;
        } catch (e) {
            console.warn('保存主题失败:', e);
            return false;
        }
    }

    // ==================== 区块状态管理 ====================
    
    /**
     * 保存区块状态
     * @param {string} sectionName - 区块名称
     * @param {boolean} isExpanded - 是否展开
     * @returns {boolean} 是否保存成功
     */
    static saveSectionState(sectionName, isExpanded) {
        try {
            const key = StoreManager.STORAGE_KEYS.SECTION_PREFIX + sectionName;
            localStorage.setItem(key, isExpanded ? 'expanded' : 'collapsed');
            return true;
        } catch (e) {
            console.warn('保存区块状态失败:', e);
            return false;
        }
    }

    /**
     * 加载区块状态
     * @param {string} sectionName - 区块名称
     * @param {boolean} defaultValue - 默认值（是否折叠）
     * @returns {boolean} 是否折叠
     */
    static loadSectionState(sectionName, defaultValue = false) {
        try {
            const key = StoreManager.STORAGE_KEYS.SECTION_PREFIX + sectionName;
            return localStorage.getItem(key) === 'collapsed';
        } catch (e) {
            return defaultValue;
        }
    }

    /**
     * 批量加载区块状态
     * @param {Array<string>} sectionNames - 区块名称数组
     * @returns {Object} 区块状态映射对象
     */
    static loadAllSectionStates(sectionNames) {
        const states = {};
        sectionNames.forEach(name => {
            states[name] = StoreManager.loadSectionState(name);
        });
        return states;
    }

    /**
     * 清除区块状态
     * @param {string} sectionName - 区块名称
     * @returns {boolean} 是否清除成功
     */
    static clearSectionState(sectionName) {
        try {
            const key = StoreManager.STORAGE_KEYS.SECTION_PREFIX + sectionName;
            localStorage.removeItem(key);
            return true;
        } catch (e) {
            console.warn('清除区块状态失败:', e);
            return false;
        }
    }

    // ==================== 通用工具方法 ====================
    
    /**
     * 清除所有存储数据
     * @returns {boolean} 是否清除成功
     */
    static clearAll() {
        try {
            Object.values(StoreManager.STORAGE_KEYS).forEach(key => {
                if (key.endsWith('_')) {
                    // 处理前缀类型的键（如区块状态）
                    // 需要遍历所有 localStorage 键来匹配
                    const prefix = key;
                    Object.keys(localStorage).forEach(localStorageKey => {
                        if (localStorageKey.startsWith(prefix)) {
                            localStorage.removeItem(localStorageKey);
                        }
                    });
                } else {
                    localStorage.removeItem(key);
                }
            });
            return true;
        } catch (e) {
            console.warn('清除所有数据失败:', e);
            return false;
        }
    }

    /**
     * 获取存储使用情况
     * @returns {Object} 存储信息对象
     */
    static getStorageInfo() {
        try {
            let totalSize = 0;
            const items = {};

            for (let i = 0; i < localStorage.length; i++) {
                const key = localStorage.key(i);
                if (key.startsWith('markdown_editor_')) {
                    const value = localStorage.getItem(key);
                    const size = (key.length + value.length) * 2; // UTF-16 编码，每个字符 2 字节
                    totalSize += size;
                    items[key] = {
                        size: size,
                        sizeFormatted: StoreManager._formatBytes(size)
                    };
                }
            }

            return {
                totalSize: totalSize,
                totalSizeFormatted: StoreManager._formatBytes(totalSize),
                items: items,
                itemCount: Object.keys(items).length
            };
        } catch (e) {
            console.warn('获取存储信息失败:', e);
            return null;
        }
    }

    /**
     * 格式化字节大小
     * @private
     * @param {number} bytes - 字节数
     * @returns {string} 格式化后的字符串
     */
    static _formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
    }

    /**
     * 检查存储是否可用
     * @returns {boolean} 存储是否可用
     */
    static isAvailable() {
        try {
            const testKey = '__storage_test__';
            localStorage.setItem(testKey, 'test');
            localStorage.removeItem(testKey);
            return true;
        } catch (e) {
            return false;
        }
    }
}

// 导出为全局对象
window.StoreManager = StoreManager;
