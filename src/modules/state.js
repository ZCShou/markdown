/**
 * 编辑器状态管理器
 * 采用观察者模式，实现状态驱动的UI更新
 */
export class EditorState {
    constructor() {
        // ==================== 核心状态 ====================
        this.state = {
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
            lastRenderedContent: ''
        };

        // ==================== 观察者管理 ====================
        this.listeners = new Map(); // 使用 Map 存储不同类型的监听器
        this.globalListeners = new Set(); // 全局监听器
    }

    /**
     * 获取状态快照（只读）
     */
    getState() {
        return { ...this.state };
    }

    /**
     * 获取单个状态值
     */
    get(key) {
        return this.state[key];
    }

    /**
     * 批量更新状态
     * @param {Object} updates - 要更新的状态对象
     * @param {Object} options - 选项 { silent: boolean } 是否静默更新（不触发通知）
     */
    setState(updates, options = {}) {
        const oldState = { ...this.state };
        
        // 更新状态
        Object.assign(this.state, updates);
        
        // 如果不是静默更新，通知监听器
        if (!options.silent) {
            this.notify(oldState, this.state);
        }
    }

    /**
     * 订阅状态变化
     * @param {Function} listener - 监听器函数 (newState, oldState) => void
     * @returns {Function} 取消订阅函数
     */
    subscribe(listener) {
        this.globalListeners.add(listener);
        
        // 返回取消订阅函数
        return () => {
            this.globalListeners.delete(listener);
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
            if (!this.listeners.has(key)) {
                this.listeners.set(key, new Set());
            }
            this.listeners.get(key).add(listener);
        });
        
        // 返回取消订阅函数
        return () => {
            keyArray.forEach(key => {
                const listeners = this.listeners.get(key);
                if (listeners) {
                    listeners.delete(listener);
                }
            });
        };
    }

    /**
     * 通知所有监听器
     */
    notify(oldState, newState) {
        // 通知全局监听器
        this.globalListeners.forEach(listener => {
            try {
                listener(newState, oldState);
            } catch (error) {
                console.error('State listener error:', error);
            }
        });

        // 通知特定键的监听器
        Object.keys(newState).forEach(key => {
            if (newState[key] !== oldState[key]) {
                const listeners = this.listeners.get(key);
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
     */
    addDocument(doc) {
        const documents = [...this.state.documents, doc];
        this.setState({ documents });
    }

    /**
     * 更新文档
     */
    updateDocument(docId, updates) {
        const documents = this.state.documents.map(doc =>
            doc.id === docId ? { ...doc, ...updates } : doc
        );
        this.setState({ documents });
    }

    /**
     * 删除文档
     */
    deleteDocument(docId) {
        const documents = this.state.documents.filter(doc => doc.id !== docId);
        const currentDocId = this.state.currentDocId === docId ? null : this.state.currentDocId;
        this.setState({ documents, currentDocId });
    }

    /**
     * 设置当前文档
     */
    setCurrentDocument(docId) {
        const doc = this.state.documents.find(d => d.id === docId);
        if (doc && doc.type !== 'folder') {
            this.setState({
                currentDocId: docId,
                content: doc.content || ''
            });
        }
    }

    /**
     * 更新当前文档内容
     */
    updateContent(content) {
        this.setState({ content });
        
        // 同时更新当前文档
        if (this.state.currentDocId) {
            this.updateDocument(this.state.currentDocId, {
                content,
                updatedAt: new Date().toISOString()
            });
        }
    }

    // ==================== UI 操作 ====================

    /**
     * 切换主题
     */
    toggleTheme() {
        const newTheme = this.state.theme === 'dark' ? 'light' : 'dark';
        this.setState({ theme: newTheme });
        return newTheme;
    }

    /**
     * 切换布局
     */
    toggleLayout() {
        const layouts = ['layout-editor-only', 'layout-preview-only', 'layout-both'];
        const currentIndex = layouts.indexOf(this.state.layout);
        const nextLayout = layouts[(currentIndex + 1) % layouts.length];
        this.setState({ layout: nextLayout });
        return nextLayout;
    }

    /**
     * 切换侧边栏
     */
    toggleSidebar(side) {
        const key = side === 'left' ? 'leftSidebarOpen' : 'rightSidebarOpen';
        const newValue = !this.state[key];
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
     */
    toggleSection(sectionName) {
        const sections = {
            ...this.state.sections,
            [sectionName]: !this.state.sections[sectionName]
        };
        this.setState({ sections });
    }

    /**
     * 更新布局比例
     */
    updateLeftRatio(ratio) {
        this.setState({ leftRatio: ratio });
    }

    // ==================== 渲染状态 ====================

    /**
     * 设置渲染状态
     */
    setRenderingState(isRendering) {
        this.setState({ isRenderingMermaid: isRendering });
    }

    /**
     * 更新最后渲染的内容
     */
    updateLastRenderedContent(content) {
        this.setState({ lastRenderedContent: content });
    }
}

/**
 * 创建全局状态实例
 */
export const editorState = new EditorState();
