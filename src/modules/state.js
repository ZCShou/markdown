/**
 * 编辑器状态管理器
 * 采用观察者模式，实现状态驱动的UI更新
 *
 * @example
 * ```js
 * const state = new EditorState();
 * state.subscribe((newState, oldState) => {
 *   console.log('State changed:', newState);
 * });
 * state.setState({ content: 'Hello' });
 * ```
 */
import { StoreManager } from './store.js';

/**
 *
 */
export class EditorState {
    // ==================== 私有字段 ====================

    /** @private */
    #updateTimestampTimeout = null;

    /** @type {Object} 核心状态对象 */
    #state = {
        // 文档相关
        documents: [],
        currentDocId: null,

        // 编辑器内容
        content: '',

        // UI 状态
        theme: 'light',
        layout: 'layout-both',
        leftSidebarOpen: false,
        rightSidebarOpen: false,

        // 侧边栏区块状态
        sections: {
            toc: true,
            export: true
        },

        // 布局状态
        leftRatio: 0.5,

        // 渲染状态
        isRenderingMermaid: false,
        lastRenderedContent: '',
        headings: [] // 标题数据，用于目录生成
    };

    /** @type {Map<string, Set<Function>>} 特定键的监听器 */
    #listeners = new Map();

    /** @type {Set<Function>} 全局监听器 */
    #globalListeners = new Set();

    /**
     * 获取状态快照（只读）
     * @returns {Object} 状态的浅拷贝
     */
    getState() {
        // 返回冻结的浅拷贝，防止外部修改
        return Object.freeze({ ...this.#state });
    }

    /**
     * 获取单个状态值
     * @template T
     * @param {string} key - 状态键
     * @returns {T} 状态值
     */
    get(key) {
        return this.#state[key];
    }

    /**
     * 批量更新状态
     * @param {Object} updates - 要更新的状态对象
     * @param {Object} options - 选项
     * @param {boolean} [options.silent=false] - 是否静默更新（不触发通知）
     * @param {boolean} [options.force=false] - 是否强制更新（即使值相同也触发通知）
     */
    setState(updates, options = {}) {
        let hasChanges = false;
        const changedKeys = [];

        // 检查是否有实际变化（除非强制更新）
        if (!options.force) {
            for (const key in updates) {
                if (!Object.is(this.#state[key], updates[key])) {
                    hasChanges = true;
                    changedKeys.push(key);
                }
            }

            // 如果没有变化且不是静默更新，可以跳过
            if (!hasChanges && !options.silent) {
                return;
            }
        }

        // 只在需要通知时创建旧状态副本
        const oldState = !options.silent && hasChanges ? { ...this.#state } : null;

        // 更新状态
        Object.assign(this.#state, updates);

        // 如果不是静默更新，通知监听器（传递 force 选项）
        if (!options.silent && oldState) {
            this.#notify(oldState, this.#state, options.force, changedKeys);
        }
    }

    /**
     * 订阅状态变化
     * @param {Function} listener - 监听器函数 (newState, oldState) => void
     * @returns {Function} 取消订阅函数
     */
    subscribe(listener) {
        this.#globalListeners.add(listener);

        // 返回取消订阅函数
        return () => {
            this.#globalListeners.delete(listener);
        };
    }

    /**
     * 订阅特定状态键的变化
     * @param {string|string[]} keys - 状态键或键数组
     * @param {Function} listener - 监听器函数 (newValue, oldValue, key) => void
     * @returns {Function} 取消订阅函数
     */
    subscribeTo(keys, listener) {
        const keyArray = Array.isArray(keys) ? keys : [keys];

        keyArray.forEach(key => {
            if (!this.#listeners.has(key)) {
                this.#listeners.set(key, new Set());
            }
            this.#listeners.get(key).add(listener);
        });

        // 返回取消订阅函数
        return () => {
            keyArray.forEach(key => {
                const listeners = this.#listeners.get(key);
                if (listeners) {
                    listeners.delete(listener);
                }
            });
        };
    }

    /**
     * 通知所有监听器
     * @private
     * @param {Object} oldState - 旧状态
     * @param {Object} newState - 新状态
     * @param {boolean} force - 是否强制更新
     * @param {Array<string>} changedKeys - 变化的键列表
     */
    #notify(oldState, newState, force = false, changedKeys = []) {
        // 通知全局监听器
        this.#globalListeners.forEach(listener => {
            try {
                listener(newState, oldState);
            } catch (error) {
                console.error('State listener error:', error);
            }
        });

        // 通知特定键的监听器（只通知变化的键）
        const keysToNotify = force ? Object.keys(newState) : changedKeys;

        keysToNotify.forEach(key => {
            const listeners = this.#listeners.get(key);
            if (listeners) {
                listeners.forEach(listener => {
                    try {
                        listener(newState[key], oldState[key], key);
                    } catch (error) {
                        console.error(`State listener error for key "${key}":`, error);
                    }
                });
            }
        });
    }

    // ==================== 文档操作 ====================

    /**
     * 添加文档
     * @param {Object} doc - 文档对象
     * @param {string} [parentId] - 父文件夹ID
     */
    addDocument(doc, parentId = null) {
        const newDoc = { ...doc, parentId };
        const documents = [...this.#state.documents, newDoc];
        this.setState({ documents });
    }

    /**
     * 更新文档
     * @param {string} docId - 文档ID
     * @param {Object} updates - 更新内容
     * @param {Object} options - 选项
     * @param {boolean} [options.silent=false] - 是否静默更新（不触发通知）
     */
    updateDocument(docId, updates, options = {}) {
        const documents = this.#state.documents.map(doc =>
            doc.id === docId ? { ...doc, ...updates } : doc
        );
        this.setState({ documents }, options);
    }

    /**
     * 删除文档（及其所有子项）
     * @param {string} docId - 文档ID
     */
    deleteDocument(docId) {
        // 递归删除所有子项
        const toDelete = new Set([docId]);
        let changed = true;

        const checkChildren = doc => {
            if (doc.parentId && toDelete.has(doc.parentId) && !toDelete.has(doc.id)) {
                toDelete.add(doc.id);
                changed = true;
            }
        };

        while (changed) {
            changed = false;
            this.#state.documents.forEach(checkChildren);
        }

        const documents = this.#state.documents.filter(doc => !toDelete.has(doc.id));
        const currentDocId = this.#state.currentDocId === docId ? null : this.#state.currentDocId;
        this.setState({ documents, currentDocId });
    }

    /**
     * 设置当前文档（优化版：异步保存）
     * @param {string} docId - 文档ID
     */
    setCurrentDocument(docId) {
        // 如果文档 ID 没有变化，直接返回
        if (this.#state.currentDocId === docId) {
            return;
        }

        const doc = this.#state.documents.find(d => d.id === docId);
        if (doc) {
            const updates = { currentDocId: docId };

            // 只有当文档不是文件夹时，才更新内容
            if (doc.type !== 'folder') {
                updates.content = doc.content || '';
            }

            // 更新状态
            this.setState(updates);

            // 异步保存当前文档 ID 到本地存储，避免阻塞主线程
            // 使用 requestIdleCallback 在浏览器空闲时执行
            if (typeof requestIdleCallback !== 'undefined') {
                requestIdleCallback(
                    () => {
                        StoreManager.saveCurrentDocId(docId);
                    },
                    { timeout: 2000 }
                );
            } else {
                // 降级方案：使用 setTimeout
                setTimeout(() => {
                    StoreManager.saveCurrentDocId(docId);
                }, 0);
            }
        }
    }

    /**
     * 更新当前文档内容
     * @param {string} content - 文档内容
     */
    updateContent(content) {
        // 只更新 content 状态，不触发 documents 更新
        // documents 的更新通过防抖保存机制处理，避免每次输入都重新渲染文档列表
        this.setState({ content });

        // 静默更新 documents 数组（不触发订阅者通知）
        if (this.#state.currentDocId) {
            const docIndex = this.#state.documents.findIndex(
                d => d.id === this.#state.currentDocId
            );
            if (docIndex !== -1) {
                this.#state.documents[docIndex].content = content;

                // 延迟更新 updatedAt（2秒），避免每次输入都创建新的 Date 对象
                if (this.#updateTimestampTimeout) {
                    clearTimeout(this.#updateTimestampTimeout);
                }
                this.#updateTimestampTimeout = setTimeout(() => {
                    this.#state.documents[docIndex].updatedAt = new Date().toISOString();
                    this.#updateTimestampTimeout = null;
                }, 2000);
            }
        }
    }

    // ==================== 树型结构操作 ====================

    /**
     * 构建树型结构
     * @returns {Array} 树型结构的文档数组
     */
    buildTree() {
        const docs = this.#state.documents;
        const docMap = new Map();

        // 创建所有节点的映射
        docs.forEach(doc => {
            docMap.set(doc.id, { ...doc, children: [] });
        });

        // 构建树型结构
        const roots = [];
        docMap.forEach(doc => {
            if (doc.parentId && docMap.has(doc.parentId)) {
                docMap.get(doc.parentId).children.push(doc);
            } else {
                roots.push(doc);
            }
        });

        return roots;
    }

    /**
     * 获取文档的所有子项
     * @param {string} folderId - 文件夹ID
     * @returns {Array} 子项数组
     */
    getChildren(folderId) {
        return this.#state.documents.filter(doc => doc.parentId === folderId);
    }

    /**
     * 移动文档到另一个文件夹
     * @param {string} docId - 文档ID
     * @param {string} targetFolderId - 目标文件夹ID（null表示移到根目录）
     * @returns {boolean} 是否移动成功
     */
    moveDocument(docId, targetFolderId) {
        // 防止将文件夹移动到其子文件夹中
        if (targetFolderId) {
            const findDoc = id => this.#state.documents.find(d => d.id === id);
            let current = findDoc(targetFolderId);
            while (current && current.parentId) {
                if (current.parentId === docId) {
                    // 无效移动，不执行操作
                    return false;
                }
                current = findDoc(current.parentId);
            }
        }

        this.updateDocument(docId, {
            parentId: targetFolderId,
            updatedAt: new Date().toISOString()
        });

        return true;
    }

    /**
     * 复制文档
     * @param {string} docId - 文档ID
     * @param {string} [targetFolderId] - 目标文件夹ID
     * @returns {string} 新文档ID
     */
    duplicateDocument(docId, targetFolderId = null) {
        const original = this.#state.documents.find(d => d.id === docId);
        if (!original) return null;

        const newDoc = {
            ...original,
            id: Date.now().toString(),
            name: `${original.name} (副本)`,
            parentId: targetFolderId !== null ? targetFolderId : original.parentId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.addDocument(newDoc, targetFolderId);
        return newDoc.id;
    }

    // ==================== UI 操作 ====================

    /**
     * 切换主题
     * @returns {string} 新主题名称
     */
    toggleTheme() {
        const newTheme = this.#state.theme === 'dark' ? 'light' : 'dark';
        this.setState({ theme: newTheme });
        return newTheme;
    }

    /**
     * 切换布局
     * @returns {string} 新布局名称
     */
    toggleLayout() {
        const layouts = ['layout-editor-only', 'layout-preview-only', 'layout-both'];
        const currentIndex = layouts.indexOf(this.#state.layout);
        const nextLayout = layouts[(currentIndex + 1) % layouts.length];
        this.setState({ layout: nextLayout });
        return nextLayout;
    }

    /**
     * 切换侧边栏
     * @param {string} side - 'left' 或 'right'
     * @returns {boolean} 新的开关状态
     */
    toggleSidebar(side) {
        const key = side === 'left' ? 'leftSidebarOpen' : 'rightSidebarOpen';
        const newValue = !this.#state[key];
        this.setState({ [key]: newValue });
        return newValue;
    }

    /**
     * 关闭所有侧边栏
     */
    closeAllSidebars() {
        this.setState({
            leftSidebarOpen: false,
            rightSidebarOpen: false
        });
    }

    /**
     * 切换区块状态
     * @param {string} sectionName - 区块名称
     */
    toggleSection(sectionName) {
        const sections = {
            ...this.#state.sections,
            [sectionName]: !this.#state.sections[sectionName]
        };
        this.setState({ sections });
    }

    /**
     * 更新布局比例
     * @param {number} ratio - 比例值 (0-1)
     */
    updateLeftRatio(ratio) {
        this.setState({ leftRatio: ratio });
    }

    // ==================== 渲染状态 ====================

    /**
     * 设置渲染状态
     * @param {boolean} isRendering - 是否正在渲染
     */
    setRenderingState(isRendering) {
        this.setState({ isRenderingMermaid: isRendering });
    }

    /**
     * 更新最后渲染的内容
     * @param {string} content - 渲染的内容
     */
    updateLastRenderedContent(content) {
        this.setState({ lastRenderedContent: content });
    }

    /**
     * 清理资源（通常不需要调用，因为这是全局单例）
     */
    destroy() {
        // 清理 updatedAt 更新定时器
        if (this.#updateTimestampTimeout) {
            clearTimeout(this.#updateTimestampTimeout);
            this.#updateTimestampTimeout = null;
        }

        // 清理所有监听器
        this.#listeners.clear();
        this.#globalListeners.clear();
    }
}

/**
 * 创建全局状态实例
 */
export const editorState = new EditorState();
