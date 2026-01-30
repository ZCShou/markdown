/**
 * 本地存储管理器
 * 负责管理所有与 localStorage 相关的数据存储和读取
 *
 * @example
 * ```js
 * // 保存文档列表
 * StoreManager.saveDocuments(documents);
 *
 * // 加载文档列表
 * const documents = StoreManager.loadDocuments();
 *
 * // 保存当前文档 ID
 * StoreManager.saveCurrentDocId('doc-id');
 *
 * // 加载当前文档 ID
 * const docId = StoreManager.loadCurrentDocId();
 *
 * // 保存设置
 * StoreManager.saveSettings({ editor: {...}, interface: {...}, export: {...} });
 *
 * // 加载设置
 * const settings = StoreManager.loadSettings();
 * ```
 */
export class StoreManager {
    // ==================== 存储键名常量 ====================
    /** @type {Object} 存储键名映射 */
    static #STORAGE_KEYS = {
        DOCUMENTS: 'markdown_editor_documents',
        CURRENT_DOC_ID: 'markdown_editor_current_doc_id',
        SETTINGS: 'markdown-editor-settings'
    };

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

    /**
     * 保存当前文档 ID
     * @param {string} docId - 文档 ID
     * @returns {{success: boolean, error?: string}} 保存结果
     */
    static saveCurrentDocId(docId) {
        try {
            localStorage.setItem(StoreManager.#STORAGE_KEYS.CURRENT_DOC_ID, docId);
            return { success: true };
        } catch (e) {
            const errorMsg = StoreManager.#handleStorageError(e, '保存当前文档 ID 失败');
            console.warn(`${errorMsg}:`, e);
            return { success: false, error: errorMsg };
        }
    }

    /**
     * 加载当前文档 ID
     * @returns {string|null} 文档 ID，如果不存在则返回 null
     */
    static loadCurrentDocId() {
        try {
            const saved = localStorage.getItem(StoreManager.#STORAGE_KEYS.CURRENT_DOC_ID);
            return saved || null;
        } catch (e) {
            console.warn('加载当前文档 ID 失败:', e);
            return null;
        }
    }

    // ==================== 统一设置存储 ====================

    /**
     * 保存统一设置
     * @param {Object} settings - 设置对象
     * @returns {boolean} 是否成功
     */
    static saveSettings(settings) {
        try {
            localStorage.setItem(StoreManager.#STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
            return true;
        } catch (e) {
            console.warn('保存设置失败:', e);
            return false;
        }
    }

    /**
     * 加载统一设置
     * @returns {Object|null} 设置对象，失败返回 null
     */
    static loadSettings() {
        try {
            const saved = localStorage.getItem(StoreManager.#STORAGE_KEYS.SETTINGS);
            return saved ? JSON.parse(saved) : null;
        } catch (e) {
            console.warn('加载设置失败:', e);
            return null;
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
