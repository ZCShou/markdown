/**
 * Vitest 测试环境设置文件
 * 在所有测试运行前执行
 */

// 模拟 localStorage
/**
 *
 */
class LocalStorageMock {
    /**
     *
     */
    constructor() {
        this.store = {};
    }

    /**
     * 清空存储
     * @returns {void}
     */
    clear() {
        this.store = {};
    }

    /**
     * 获取项
     * @param {string} key - 键名
     * @returns {string|null} 值或 null
     */
    getItem(key) {
        return this.store[key] || null;
    }

    /**
     * 设置项
     * @param {string} key - 键名
     * @param {string} value - 值
     * @returns {void}
     */
    setItem(key, value) {
        this.store[key] = String(value);
    }

    /**
     *
     * @param key
     */
    removeItem(key) {
        delete this.store[key];
    }

    /**
     * 获取存储长度
     * @returns {number} 存储项数量
     */
    get length() {
        return Object.keys(this.store).length;
    }

    /**
     * 通过索引获取键名
     * @param {number} index - 索引
     * @returns {string|null} 键名或 null
     */
    key(index) {
        return Object.keys(this.store)[index] || null;
    }
}

// 在全局设置 localStorage mock
global.localStorage = new LocalStorageMock();

// 模拟 matchMedia（用于响应式测试）
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => {}
    })
});

// 模拟 ResizeObserver
global.ResizeObserver = class ResizeObserver {
    /**
     *
     */
    disconnect() {}
    /**
     *
     */
    observe() {}
    /**
     *
     */
    unobserve() {}
};

// 清理函数（每个测试后执行）
afterEach(() => {
    // 清理 localStorage
    global.localStorage.clear();

    // 清理所有 mock
    vi.clearAllMocks();
});
