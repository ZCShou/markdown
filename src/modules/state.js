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
export class EditorState {
    // ==================== 私有字段 ====================
    
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

        // 树型展开状态 (folderId -> boolean)
        expandedFolders: new Set()
    };

    /** @type {Map<string, Set<Function>>} 特定键的监听器 */
    #listeners = new Map();
    
    /** @type {Set<Function>} 全局监听器 */
    #globalListeners = new Set();

    constructor() {
        // 构造函数留空，初始化通过字段默认值完成
    }

    /**
     * 获取状态快照（只读）
     * @returns {Object} 状态的浅拷贝
     */
    getState() {
        return { ...this.#state };
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
     */
    setState(updates, options = {}) {
        const oldState = { ...this.#state };
        
        // 更新状态
        Object.assign(this.#state, updates);
        
        // 如果不是静默更新，通知监听器
        if (!options.silent) {
            this.#notify(oldState, this.#state);
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
     */
    #notify(oldState, newState) {
        // 通知全局监听器
        this.#globalListeners.forEach(listener => {
            try {
                listener(newState, oldState);
            } catch (error) {
                console.error('State listener error:', error);
            }
        });

        // 通知特定键的监听器
        Object.keys(newState).forEach(key => {
            if (newState[key] !== oldState[key]) {
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

        // 如果添加到文件夹内，自动展开该文件夹
        if (parentId) {
            this.expandFolder(parentId);
        }
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

        while (changed) {
            changed = false;
            this.#state.documents.forEach(doc => {
                if (doc.parentId && toDelete.has(doc.parentId) && !toDelete.has(doc.id)) {
                    toDelete.add(doc.id);
                    changed = true;
                }
            });
        }

        const documents = this.#state.documents.filter(doc => !toDelete.has(doc.id));
        const currentDocId = this.#state.currentDocId === docId ? null : this.#state.currentDocId;
        this.setState({ documents, currentDocId });
    }

    /**
     * 设置当前文档
     * @param {string} docId - 文档ID
     */
    setCurrentDocument(docId) {
        const doc = this.#state.documents.find(d => d.id === docId);
        if (doc && doc.type !== 'folder') {
            const oldContent = this.#state.content;
            const oldDocId = this.#state.currentDocId;
            const newContent = doc.content || '';
            
            // 更新状态
            this.#state.currentDocId = docId;
            this.#state.content = newContent;
            
            // 触发 content 监听器（即使内容相同也要触发，确保切换文件时编辑器更新）
            const contentListeners = this.#listeners.get('content');
            if (contentListeners) {
                contentListeners.forEach(listener => {
                    try {
                        listener(newContent, oldContent, 'content');
                    } catch (error) {
                        console.error(`State listener error for key "content":`, error);
                    }
                });
            }
            
            // 触发 currentDocId 监听器
            const currentDocListeners = this.#listeners.get('currentDocId');
            if (currentDocListeners) {
                currentDocListeners.forEach(listener => {
                    try {
                        listener(docId, oldDocId, 'currentDocId');
                    } catch (error) {
                        console.error(`State listener error for key "currentDocId":`, error);
                    }
                });
            }
        }
    }

    /**
     * 更新当前文档内容
     * @param {string} content - 文档内容
     */
    updateContent(content) {
        this.setState({ content });

        // 同时更新当前文档（使用 silent 选项避免触发 documents 监听器）
        if (this.#state.currentDocId) {
            this.updateDocument(this.#state.currentDocId, {
                content,
                updatedAt: new Date().toISOString()
            }, { silent: true });
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
     * 检查文件夹是否展开
     * @param {string} folderId - 文件夹ID
     * @returns {boolean} 是否展开
     */
    isFolderExpanded(folderId) {
        return this.#state.expandedFolders.has(folderId);
    }

    /**
     * 切换文件夹展开状态
     * @param {string} folderId - 文件夹ID
     */
    toggleFolder(folderId) {
        const expanded = new Set(this.#state.expandedFolders);
        if (expanded.has(folderId)) {
            expanded.delete(folderId);
        } else {
            expanded.add(folderId);
        }
        this.setState({ expandedFolders: expanded });
    }

    /**
     * 展开文件夹
     * @param {string} folderId - 文件夹ID
     */
    expandFolder(folderId) {
        const expanded = new Set(this.#state.expandedFolders);
        expanded.add(folderId);
        this.setState({ expandedFolders: expanded });
    }

    /**
     * 折叠文件夹
     * @param {string} folderId - 文件夹ID
     */
    collapseFolder(folderId) {
        const expanded = new Set(this.#state.expandedFolders);
        expanded.delete(folderId);
        this.setState({ expandedFolders: expanded });
    }

    /**
     * 展开所有文件夹
     */
    expandAllFolders() {
        const folderIds = this.#state.documents
            .filter(doc => doc.type === 'folder')
            .map(doc => doc.id);
        this.setState({ expandedFolders: new Set(folderIds) });
    }

    /**
     * 折叠所有文件夹
     */
    collapseAllFolders() {
        this.setState({ expandedFolders: new Set() });
    }

    /**
     * 移动文档到另一个文件夹
     * @param {string} docId - 文档ID
     * @param {string} targetFolderId - 目标文件夹ID（null表示移到根目录）
     */
    moveDocument(docId, targetFolderId) {
        // 防止将文件夹移动到其子文件夹中
        if (targetFolderId) {
            let current = this.#state.documents.find(d => d.id === targetFolderId);
            while (current && current.parentId) {
                if (current.parentId === docId) {
                    this.showMessage('不能将文件夹移动到其子文件夹中', 'error');
                    return;
                }
                current = this.#state.documents.find(d => d.id === current.parentId);
            }
        }

        this.updateDocument(docId, {
            parentId: targetFolderId,
            updatedAt: new Date().toISOString()
        });

        // 如果移动到文件夹内，自动展开目标文件夹
        if (targetFolderId) {
            this.expandFolder(targetFolderId);
        }
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
}

/**
 * 创建全局状态实例
 */
export const editorState = new EditorState();
