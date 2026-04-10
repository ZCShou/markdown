/**
 * 工作空间存储
 * 统一管理本地浏览器工作空间的持久化数据。
 *
 * 当前支持的数据：
 * - documents
 * - currentDocId
 * - settings
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
    SETTINGS: 'settings',
    WORKSPACE_AUTHS: 'workspaceAuths',
    WORKSPACE_TOMBSTONES: 'workspaceTombstones'
};

function openDatabase() {
    if (db) return Promise.resolve(db);
    if (dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => {
            console.error('IndexedDB 打开失败:', request.error);
            dbPromise = null;
            reject(request.error);
        };

        request.onsuccess = () => {
            db = request.result;
            db.onclose = () => {
                db = null;
                dbPromise = null;
            };
            db.onversionchange = () => {
                db?.close();
                db = null;
                dbPromise = null;
            };
            resolve(db);
        };

        request.onupgradeneeded = event => {
            const database = event.target.result;

            if (!database.objectStoreNames.contains(STORES.DATA)) {
                database.createObjectStore(STORES.DATA, { keyPath: 'key' });
            }
        };
    });

    return dbPromise;
}

async function setData(key, value) {
    try {
        const database = await openDatabase();

        return new Promise(resolve => {
            const transaction = database.transaction([STORES.DATA], 'readwrite');
            const store = transaction.objectStore(STORES.DATA);
            transaction.oncomplete = () => resolve({ success: true });
            transaction.onerror = () => {
                console.error(`保存 ${key} 失败:`, transaction.error);
                resolve({
                    success: false,
                    error: transaction.error?.message || '保存失败'
                });
            };
            transaction.onabort = () => {
                console.error(`保存 ${key} 失败:`, transaction.error);
                resolve({
                    success: false,
                    error: transaction.error?.message || '保存失败'
                });
            };

            const request = store.put({ key, value });
            request.onerror = () => {
                console.error(`保存 ${key} 失败:`, request.error);
                transaction.abort();
            };
        });
    } catch (error) {
        console.error(`保存 ${key} 失败:`, error);
        return { success: false, error: error.message || '保存失败' };
    }
}

async function getData(key) {
    try {
        const database = await openDatabase();

        return new Promise((resolve, reject) => {
            const transaction = database.transaction([STORES.DATA], 'readonly');
            const store = transaction.objectStore(STORES.DATA);
            const request = store.get(key);

            request.onsuccess = () => {
                const { result } = request;
                resolve(result ? result.value : null);
            };

            request.onerror = () => {
                console.error(`加载 ${key} 失败:`, request.error);
                reject(request.error);
            };
        });
    } catch (error) {
        console.error(`加载 ${key} 失败:`, error);
        return null;
    }
}

export class WorkspaceStorage {
    static async init() {
        await openDatabase();
    }

    static saveDocuments(documents) {
        return setData(KEYS.DOCUMENTS, documents);
    }

    static async loadDocuments() {
        const documents = await getData(KEYS.DOCUMENTS);
        if (!documents) return [];
        if (!Array.isArray(documents)) {
            console.warn('文档列表格式错误，已重置');
            return [];
        }
        return documents;
    }

    static saveCurrentDocId(docId) {
        return setData(KEYS.CURRENT_DOC_ID, docId);
    }

    static async loadCurrentDocId() {
        const saved = await getData(KEYS.CURRENT_DOC_ID);
        return saved || null;
    }

    static saveSettings(settings) {
        return setData(KEYS.SETTINGS, settings);
    }

    static loadSettings() {
        return getData(KEYS.SETTINGS);
    }

    static saveWorkspaceAuths(auths) {
        return setData(KEYS.WORKSPACE_AUTHS, auths);
    }

    static async loadWorkspaceAuths() {
        const auths = await getData(KEYS.WORKSPACE_AUTHS);
        return auths && typeof auths === 'object' && !Array.isArray(auths) ? auths : {};
    }

    static clearWorkspaceAuths() {
        return setData(KEYS.WORKSPACE_AUTHS, {});
    }

    static saveWorkspaceTombstones(tombstones) {
        return setData(KEYS.WORKSPACE_TOMBSTONES, tombstones);
    }

    static async loadWorkspaceTombstones() {
        const tombstones = await getData(KEYS.WORKSPACE_TOMBSTONES);
        return Array.isArray(tombstones) ? tombstones : [];
    }

    static async loadLocalWorkspaceSnapshot() {
        const [documents, currentDocId, settings, workspaceTombstones] = await Promise.all([
            WorkspaceStorage.loadDocuments(),
            WorkspaceStorage.loadCurrentDocId(),
            WorkspaceStorage.loadSettings(),
            WorkspaceStorage.loadWorkspaceTombstones()
        ]);

        return {
            documents,
            currentDocId,
            settings,
            workspaceTombstones
        };
    }

    static async clearLocalWorkspace() {
        try {
            const database = await openDatabase();

            return new Promise((resolve, reject) => {
                const transaction = database.transaction([STORES.DATA], 'readwrite');
                const store = transaction.objectStore(STORES.DATA);
                const request = store.clear();

                request.onsuccess = () => resolve();
                request.onerror = () => reject(request.error);
            });
        } catch (error) {
            console.error('清除工作空间数据失败:', error);
        }
    }
}
