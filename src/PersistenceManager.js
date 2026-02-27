/**
 * 持久化管理器
 * 负责状态的自动持久化，支持防抖和配置化
 *
 * @example
 * ```js
 * const persistence = new PersistenceManager(state);
 * persistence.configure({
 *   documents: { debounce: 300 },
 *   currentDocId: { immediate: true }
 * });
 * persistence.start();
 * ```
 */
import { StoreManager } from './StoreManager.js';

export class PersistenceManager {
    /**
     * 默认持久化配置
     * @static
     * @type {Object}
     */
    static DEFAULT_CONFIG = {
        documents: { debounce: 300 },
        currentDocId: { immediate: true },
        // editor/interface/export 统一合并为 settings 存储
        editor: { debounce: 300 },
        interface: { debounce: 300 },
        export: { debounce: 300 }
    };

    /**
     * 持久化处理器映射
     * @static
     * @type {Object}
     */
    static PERSIST_HANDLERS = {
        documents: async (state) => StoreManager.saveDocuments(state.documents),
        currentDocId: async (state) => StoreManager.saveCurrentDocId(state.currentDocId),
        settings: async (state) => StoreManager.saveSettings({
            editor: state.editor,
            interface: state.interface,
            export: state.export
        })
    };

    /**
     * @private
     * @type {Object} 状态对象引用
     */
    #stateRef = null;

    /**
     * @private
     * @type {Object} 持久化配置
     */
    #config = {};

    /**
     * @private
     * @type {number|null} 防抖定时器
     */
    #debounceTimer = null;

    /**
     * @private
     * @type {Set<string>} 待持久化的键
     */
    #pendingKeys = new Set();

    /**
     * @private
     * @type {boolean} 是否已启动
     */
    #isActive = false;

    /**
     * 构造函数
     * @param {Function} getStateFn - 获取当前状态的函数
     */
    constructor(getStateFn) {
        this.#stateRef = getStateFn;
        // 自动应用默认配置
        this.configure();
    }

    /**
     * 配置持久化行为
     * @param {Object} config - 持久化配置
     * @returns {PersistenceManager} this
     */
    configure(config = {}) {
        this.#config = { ...PersistenceManager.DEFAULT_CONFIG, ...config };
        return this;
    }

    /**
     * 启动自动持久化
     */
    start() {
        this.#isActive = true;
    }

    /**
     * 停止自动持久化
     */
    stop() {
        this.#isActive = false;
        this.#clearTimer();
    }

    /**
     * 调度持久化操作
     * @param {Array<string>} changedKeys - 变化的状态键
     */
    schedule(changedKeys) {
        if (!this.#isActive || changedKeys.length === 0) return;

        // 分离立即持久化和延迟持久化的键
        const immediateKeys = [];
        const debouncedKeys = [];

        for (const key of changedKeys) {
            const config = this.#config[key];
            if (!config) continue;

            if (config.immediate) {
                immediateKeys.push(key);
            } else {
                debouncedKeys.push(key);
            }
        }

        // 立即持久化
        if (immediateKeys.length > 0) {
            this.#persistKeys(immediateKeys);
        }

        // 延迟持久化
        if (debouncedKeys.length > 0) {
            this.#scheduleDebounced(debouncedKeys);
        }
    }

    /**
     * 调度防抖持久化
     * @private
     * @param {Array<string>} keys - 要持久化的键
     */
    #scheduleDebounced(keys) {
        // 添加到待处理集合
        keys.forEach(key => this.#pendingKeys.add(key));

        // 清除之前的定时器
        this.#clearTimer();

        // 计算最大延迟时间
        const maxDelay = Math.max(
            ...keys.map(key => this.#config[key]?.debounce || 300)
        );

        // 设置新的定时器
        this.#debounceTimer = setTimeout(() => {
            this.#persistKeys(Array.from(this.#pendingKeys));
            this.#pendingKeys.clear();
            this.#debounceTimer = null;
        }, maxDelay);
    }

    /**
     * 持久化指定的键
     * @private
     * @param {Array<string>} keys - 要持久化的键
     */
    async #persistKeys(keys) {
        const state = this.#stateRef();
        if (!state) return;

        // 按处理器分组
        const handlerGroups = new Map();

        for (const key of keys) {
            let handlerKey = key;

            // editor、interface、export 合并为 settings
            if (['editor', 'interface', 'export'].includes(key)) {
                handlerKey = 'settings';
            }

            if (!handlerGroups.has(handlerKey)) {
                handlerGroups.set(handlerKey, []);
            }
            handlerGroups.get(handlerKey).push(key);
        }

        // 执行持久化
        for (const [handlerKey, _keys] of handlerGroups) {
            try {
                const handler = PersistenceManager.PERSIST_HANDLERS[handlerKey];
                if (handler) {
                    await handler(state);
                }
            } catch (error) {
                console.warn(`[PersistenceManager] 持久化失败 (${handlerKey}):`, error);
            }
        }
    }

    /**
     * 清除定时器
     * @private
     */
    #clearTimer() {
        if (this.#debounceTimer) {
            clearTimeout(this.#debounceTimer);
            this.#debounceTimer = null;
        }
    }

    /**
     * 清理资源
     */
    destroy() {
        this.stop();
        this.#pendingKeys.clear();
        this.#stateRef = null;
    }
}
