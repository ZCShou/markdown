/**
 * Vitest 测试环境设置文件
 * 在所有测试运行前执行
 */

// 模拟 IndexedDB
class IDBRequestMock {
    constructor() {
        this.result = null;
        this.error = null;
        this.onsuccess = null;
        this.onerror = null;
    }
}

class IDBObjectStoreMock {
    constructor(store) {
        this.store = store;
    }

    put(data) {
        const request = new IDBRequestMock();
        this.store[data.key] = data.value;
        setTimeout(() => {
            request.result = data.key;
            if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
    }

    get(key) {
        const request = new IDBRequestMock();
        setTimeout(() => {
            request.result =
                this.store[key] !== undefined ? { key, value: this.store[key] } : undefined;
            if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
    }

    clear() {
        const request = new IDBRequestMock();
        Object.keys(this.store).forEach(key => delete this.store[key]);
        setTimeout(() => {
            if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);
        return request;
    }
}

class IDBTransactionMock {
    constructor(stores, mode, db) {
        this.db = db;
    }

    objectStore(name) {
        return new IDBObjectStoreMock(this.db._store);
    }
}

class IDBDatabaseMock {
    constructor() {
        this._store = {};
        this.objectStoreNames = {
            contains: name => true
        };
    }

    transaction(stores, mode) {
        return new IDBTransactionMock(stores, mode, this);
    }
}

class IDBOpenDBRequestMock extends IDBRequestMock {
    constructor() {
        super();
        this.onupgradeneeded = null;
    }
}

const indexedDBMock = {
    _databases: {},

    open(name, version) {
        const request = new IDBOpenDBRequestMock();

        setTimeout(() => {
            if (!this._databases[name]) {
                this._databases[name] = new IDBDatabaseMock();
                if (request.onupgradeneeded) {
                    request.result = this._databases[name];
                    request.onupgradeneeded({ target: request, result: this._databases[name] });
                }
            }
            request.result = this._databases[name];
            if (request.onsuccess) request.onsuccess({ target: request });
        }, 0);

        return request;
    }
};
global.indexedDB = indexedDBMock;
// 模拟 matchMedia（用于响应式测试）
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: () => false
});
// 模拟 ResizeObserver
global.ResizeObserver = class ResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
};
// 清理函数（每个测试后执行）
afterEach(() => {
    vi.clearAllMocks();
});
