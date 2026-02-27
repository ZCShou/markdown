/**
 * IndexedDB 存储管理器
 * 负责管理所有与 IndexedDB 相关的数据存储和读取
 *
 * @example
 * ```js
 * // 初始化数据库
 * await StoreManager.init();
 *
 * // 保存文档列表
 * await StoreManager.saveDocuments(documents);
 *
 * // 加载文档列表
 * const documents = await StoreManager.loadDocuments();
 *
 * // 保存当前文档 ID
 * await StoreManager.saveCurrentDocId('doc-id');
 *
 * // 加载当前文档 ID
 * const docId = await StoreManager.loadCurrentDocId();
 *
 * // 保存设置
 * await StoreManager.saveSettings({ editor: {...}, interface: {...}, export: {...} });
 *
 * // 加载设置
 * const settings = await StoreManager.loadSettings();
 * ```
 */

/** @type {IDBDatabase|null} */
let db = null;

/** @type {Promise<IDBDatabase>|null} */
let dbPromise = null;

const DB_NAME = 'markdown-editor-db';
const DB_VERSION = 1;

const STORES = {
    DATA: 'data'
};

const KEYS = {
    DOCUMENTS: 'documents',
    CURRENT_DOC_ID: 'currentDocId',
    SETTINGS: 'settings'
};

/**
 * 初始化 IndexedDB 数据库
 * @returns {Promise<IDBDatabase>}
 */
function openDatabase() {
    if (db) return Promise.resolve(db);
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('IndexedDB 打开失败:', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            resolve(db);
        };

        request.onupgradeneeded = (event) => {
            const database = event.target.result;

            // 创建对象存储（使用单个存储，通过键区分不同数据）
            if (!database.objectStoreNames.contains(STORES.DATA)) {
                database.createObjectStore(STORES.DATA, { keyPath: 'key' });
            }
        };
    });

    return dbPromise;
}

/**
 * 保存数据存储项
 * @param {string} key - 键名
 * @param {*} value - 值
 * @returns {Promise<{success: boolean, error?: string}>}
 */
async function setData(key, value) {
    try {
        const database = await openDatabase();

        return new Promise((resolve) => {
            const transaction = database.transaction([STORES.DATA], 'readwrite');
            const store = transaction.objectStore(STORES.DATA);

            const request = store.put({ key, value });

            request.onsuccess = () => {
                resolve({ success: true });
            };

            request.onerror = () => {
                console.error(`保存 ${key} 失败:`, request.error);
                resolve({ success: false, error: request.error?.message || '保存失败' });
            };
        });
    } catch (e) {
        console.error(`保存 ${key} 失败:`, e);
        return { success: false, error: e.message || '保存失败' };
    }
}

/**
 * 获取数据存储项
 * @param {string} key - 键名
 * @returns {Promise<*>}
 */
async function getData(key) {
    try {
        const database = await openDatabase();

        return new Promise((resolve, reject) => {
            const transaction = database.transaction([STORES.DATA], 'readonly');
            const store = transaction.objectStore(STORES.DATA);

            const request = store.get(key);

            request.onsuccess = () => {
                const result = request.result;
                resolve(result ? result.value : null);
            };

            request.onerror = () => {
                console.error(`加载 ${key} 失败:`, request.error);
                reject(request.error);
            };
        });
    } catch (e) {
        console.error(`加载 ${key} 失败:`, e);
        return null;
    }
}

export class StoreManager {
    // ==================== 初始化 ====================

    /**
     * 初始化存储管理器
     * @returns {Promise<void>}
     */
    static async init() {
        await openDatabase();
    }

    // ==================== 文档管理 ====================

    /**
     * 保存文档列表
     * @param {Array} documents - 文档列表
     * @returns {Promise<{success: boolean, error?: string}>} 保存结果
     */
    static saveDocuments(documents) {
        return setData(KEYS.DOCUMENTS, documents);
    }

    /**
     * 加载文档列表
     * @returns {Promise<Array>} 文档列表
     */
    static async loadDocuments() {
        const documents = await getData(KEYS.DOCUMENTS);
        if (!documents) return [];
        if (!Array.isArray(documents)) {
            console.warn('文档列表格式错误，已重置');
            return [];
        }
        return documents;
    }

    /**
     * 保存当前文档 ID
     * @param {string} docId - 文档 ID
     * @returns {Promise<{success: boolean, error?: string}>} 保存结果
     */
    static saveCurrentDocId(docId) {
        return setData(KEYS.CURRENT_DOC_ID, docId);
    }

    /**
     * 加载当前文档 ID
     * @returns {Promise<string|null>} 文档 ID，如果不存在则返回 null
     */
    static async loadCurrentDocId() {
        const saved = await getData(KEYS.CURRENT_DOC_ID);
        return saved || null;
    }

    // ==================== 统一设置存储 ====================

    /**
     * 保存统一设置
     * @param {Object} settings - 设置对象
     * @returns {Promise<{success: boolean, error?: string}>} 保存结果
     */
    static saveSettings(settings) {
        return setData(KEYS.SETTINGS, settings);
    }

    /**
     * 加载统一设置
     * @returns {Promise<Object|null>} 设置对象，失败返回 null
     */
    static loadSettings() {
        return getData(KEYS.SETTINGS);
    }

    // ==================== 数据迁移 ====================

    /**
     * 从 localStorage 迁移数据到 IndexedDB
     * @returns {Promise<{migrated: boolean, counts: Object}>}
     */
    static async migrateFromLocalStorage() {
        const oldKeys = {
            DOCUMENTS: 'markdown_editor_documents',
            CURRENT_DOC_ID: 'markdown_editor_current_doc_id',
            SETTINGS: 'markdown-editor-settings'
        };

        const counts = {
            documents: 0,
            currentDocId: 0,
            settings: 0
        };

        try {
            // 检查是否需要迁移
            const hasOldData = Object.values(oldKeys).some(key => {
                try {
                    return localStorage.getItem(key) !== null;
                } catch {
                    return false;
                }
            });

            if (!hasOldData) {
                return { migrated: false, counts };
            }

            // 迁移文档列表
            try {
                const oldDocs = localStorage.getItem(oldKeys.DOCUMENTS);
                if (oldDocs) {
                    const documents = JSON.parse(oldDocs);
                    if (Array.isArray(documents) && documents.length > 0) {
                        await StoreManager.saveDocuments(documents);
                        counts.documents = documents.length;
                        localStorage.removeItem(oldKeys.DOCUMENTS);
                    }
                }
            } catch (e) {
                console.warn('迁移文档列表失败:', e);
            }

            // 迁移当前文档 ID
            try {
                const oldDocId = localStorage.getItem(oldKeys.CURRENT_DOC_ID);
                if (oldDocId) {
                    await StoreManager.saveCurrentDocId(oldDocId);
                    counts.currentDocId = 1;
                    localStorage.removeItem(oldKeys.CURRENT_DOC_ID);
                }
            } catch (e) {
                console.warn('迁移当前文档 ID 失败:', e);
            }

            // 迁移设置
            try {
                const oldSettings = localStorage.getItem(oldKeys.SETTINGS);
                if (oldSettings) {
                    const settings = JSON.parse(oldSettings);
                    if (settings) {
                        await StoreManager.saveSettings(settings);
                        counts.settings = 1;
                        localStorage.removeItem(oldKeys.SETTINGS);
                    }
                }
            } catch (e) {
                console.warn('迁移设置失败:', e);
            }

            console.log('[StoreManager] 数据迁移完成:', counts);
            return { migrated: true, counts };
        } catch (e) {
            console.error('数据迁移失败:', e);
            return { migrated: false, counts, error: e.message };
        }
    }

    // ==================== 调试方法 ====================

    /**
     * 清除所有数据
     * @returns {Promise<void>}
     */
    static async clearAll() {
        try {
            const database = await openDatabase();

            return new Promise((resolve, reject) => {
                const transaction = database.transaction([STORES.DATA], 'readwrite');
                const store = transaction.objectStore(STORES.DATA);
                const request = store.clear();

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (e) {
            console.error('清除数据失败:', e);
        }
    }
}
