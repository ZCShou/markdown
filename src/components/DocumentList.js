/**
 * 文档列表组件 - 树型结构
 * 负责文档列表的渲染和交互，支持文件夹嵌套
 */
import { BaseComponent } from './BaseComponent.js';
import { StoreManager } from '../modules/store.js';
import { dom } from '../utils/dom.js';
import { Dialog } from './Dialog.js';

export class DocumentList extends BaseComponent {
    /** @private */
    #lastDocCount = 0; // 用于增量更新
    
    /** @private */
    #domCache = new Map(); // DOM 元素缓存
    
    /** @private */
    #pendingUpdates = new Map(); // 待处理的更新（用于 RAF 批量更新）
    
    /** @private */
    #pendingEdit = null; // 待处理的编辑操作 { docId, isNewItem, shouldSetCurrent }

    /**
     * 构造函数
     */
    constructor(state, containerId) {
        super(state, containerId);
        this.editingDocId = null;
        this.draggedItem = null;
        this.dragTarget = null; // 缓存当前拖拽目标
        this.dragTargetType = null; // 缓存当前拖拽目标类型
        this.clickTimeout = null;
        this.dragOverThrottle = null; // dragover 节流定时器
        this.lastDragOverTime = 0; // 上次 dragover 处理时间
        this.expandedFolders = new Set(); // 本地文件夹展开状态
        this.treeContainer = null; // 缓存树容器
        this.domCacheVersion = 0; // DOM 缓存版本号，用于失效检测
    }

    /**
     * 订阅状态变化
     * @returns {void}
     */
    subscribe() {
        this.unsubscribe = this.state.subscribeTo(['documents', 'currentDocId'], (newValue, oldValue, key) => {
            if (key === 'currentDocId') {
                this.updateActiveState(newValue, oldValue);
            } else if (key === 'documents') {
                // 优化：使用 Map 代替 find，时间复杂度从 O(n²) 降到 O(n)
                const needsFullRender = this.#hasStructuralChanges(newValue, oldValue);
                
                if (needsFullRender) {
                    // 强制完全重新渲染
                    this.render(true);
                }
            }
        });
    }

    /**
     * 检查文档结构是否发生变化（优化版：单次遍历）
     * @private
     * @param {Array} newValue - 新文档列表
     * @param {Array} oldValue - 旧文档列表
     * @returns {boolean} 是否有结构性变化
     */
    #hasStructuralChanges(newValue, oldValue) {
        // 快速检查：数量不同
        if (newValue.length !== oldValue.length) {
            return true;
        }

        // 优化：单次遍历构建 Map 并检查
        const oldMap = new Map();
        for (const doc of oldValue) {
            oldMap.set(doc.id, doc);
        }
        
        // 检查新文档列表
        for (const doc of newValue) {
            const old = oldMap.get(doc.id);
            if (!old) {
                // 新增文档
                return true;
            }
            if (old.parentId !== doc.parentId || old.name !== doc.name) {
                // 结构性变化
                return true;
            }
            // 从 Map 中删除，最后检查是否有剩余（被删除的文档）
            oldMap.delete(doc.id);
        }
        
        // 如果 Map 中还有剩余，说明有文档被删除
        return oldMap.size > 0;
    }

    /**
     * 获取缓存的文档项元素
     * @private
     * @param {string} docId - 文档 ID
     * @returns {Element|null} 文档项元素
     */
    #getCachedDocItem(docId) {
        const cached = this.#domCache.get(docId);
        // 检查缓存是否有效（元素仍在 DOM 中）
        if (cached && cached.element && this.container?.contains(cached.element)) {
            return cached.element;
        }
        // 使用 dom.js 统一查询，缓存失效或不存在，重新查询
        const item = dom.getIn(this.container, `[data-doc-id="${docId}"]`);
        if (item) {
            this.#domCache.set(docId, { element: item, version: this.domCacheVersion });
        }
        return item;
    }

    /**
     * 清空 DOM 缓存并增加版本号
     * @private
     */
    #clearDomCache() {
        this.#domCache.clear();
        this.domCacheVersion++;
    }

    /**
     * 更新激活状态（局部更新，避免闪烁）
     */
    updateActiveState(newDocId, oldDocId) {
        if (!this.container) return;

        // 使用缓存获取元素，减少 DOM 查询
        if (oldDocId) {
            const oldItem = this.#getCachedDocItem(oldDocId);
            if (oldItem) {
                oldItem.classList.remove('active');
            }
        }

        // 添加新的激活状态
        if (newDocId && newDocId !== oldDocId) {
            const newItem = this.#getCachedDocItem(newDocId);
            if (newItem) {
                newItem.classList.add('active');
            }
        }
    }



    /**
     * 设置文件夹展开状态（优化版：减少 DOM 查询）
     */
    setFolderExpanded(folderId, expanded) {
        const currentlyExpanded = this.expandedFolders.has(folderId);
        if (expanded && !currentlyExpanded) {
            this.expandedFolders.add(folderId);
        } else if (!expanded && currentlyExpanded) {
            this.expandedFolders.delete(folderId);
        } else {
            return; // 状态未改变
        }

        // 使用 requestAnimationFrame 批量更新，避免阻塞主线程
        if (!this.#pendingUpdates.has(folderId)) {
            this.#pendingUpdates.set(folderId, expanded);
            requestAnimationFrame(() => {
                this.#updateFolderUI(folderId, this.#pendingUpdates.get(folderId));
                this.#pendingUpdates.delete(folderId);
            });
        }
    }

    /**
     * 更新文件夹 UI（内部方法，一次性完成所有 DOM 操作）
     * @private
     */
    #updateFolderUI(folderId, expanded) {
        if (!this.container) return;

        // 使用缓存获取元素
        const item = this.#getCachedDocItem(folderId);
        if (!item) return;

        // 使用 dom.js 统一查询，一次性获取所有需要的子元素
        const toggle = dom.getIn(item, '.md-tree-toggle');
        const icon = dom.getIn(item, '.md-doc-item-icon i');
        const nodeContainer = item.closest('.md-tree-node');
        const childrenContainer = nodeContainer ? dom.getIn(nodeContainer, '.md-tree-children') : null;

        // 批量更新类名
        if (toggle) {
            toggle.classList.toggle('expanded', expanded);
        }

        if (icon) {
            if (expanded) {
                icon.classList.remove('codicon-folder');
                icon.classList.add('codicon-folder-opened');
            } else {
                icon.classList.remove('codicon-folder-opened');
                icon.classList.add('codicon-folder');
            }
        }

        if (childrenContainer) {
            childrenContainer.classList.toggle('collapsed', !expanded);
        }
    }

    /**
     * 切换文件夹展开状态
     */
    toggleFolder(folderId) {
        this.setFolderExpanded(folderId, !this.expandedFolders.has(folderId));
    }

    /**
     * 展开文件夹
     */
    expandFolder(folderId) {
        this.setFolderExpanded(folderId, true);
    }

    /**
     * 折叠文件夹
     */
    collapseFolder(folderId) {
        this.setFolderExpanded(folderId, false);
    }

    /**
     * 绑定事件
     * @returns {void}
     */
    bindEvents() {
        // 使用事件委托处理列表项点击
        this.addEventListener(this.container, 'click', (e) => this.handleClick(e));
        this.addEventListener(this.container, 'dblclick', (e) => this.handleDoubleClick(e));
        this.addEventListener(this.container, 'dragstart', (e) => this.handleDragStart(e));
        this.addEventListener(this.container, 'dragover', (e) => this.handleDragOver(e));
        this.addEventListener(this.container, 'drop', (e) => this.handleDrop(e));
        this.addEventListener(this.container, 'dragend', (e) => this.handleDragEnd(e));
    }

    /**
     * 处理点击事件
     * @param {MouseEvent} e - 点击事件
     * @returns {void}
     */
    handleClick(e) {
        const toggle = e.target.closest('.md-tree-toggle');
        if (toggle) {
            e.stopPropagation();
            this.toggleFolder(toggle.dataset.folderId);
            return;
        }

        const deleteBtn = e.target.closest('.md-doc-item-delete');
        if (deleteBtn) {
            e.stopPropagation();
            this.handleDelete(deleteBtn.dataset.docId);
            return;
        }

        const newFileBtn = e.target.closest('.md-new-file-btn');
        if (newFileBtn) {
            e.stopPropagation();
            this.createItem('file', newFileBtn.dataset.folderId || null);
            return;
        }

        const newFolderBtn = e.target.closest('.md-new-folder-btn');
        if (newFolderBtn) {
            e.stopPropagation();
            this.createItem('folder', newFolderBtn.dataset.folderId || null);
            return;
        }

        const item = e.target.closest('.md-doc-item');
        if (item && !this.editingDocId) {
            const { docId, docType } = item.dataset;

            if (this.clickTimeout) {
                clearTimeout(this.clickTimeout);
                this.clickTimeout = null;
            }

            this.clickTimeout = setTimeout(() => {
                if (docType === 'folder') {
                    // 设置当前文档为文件夹（选中效果）
                    this.state.setCurrentDocument(docId);
                    // 同时展开/折叠文件夹
                    this.toggleFolder(docId);
                } else {
                    this.handleOpen(docId);
                }
                this.clickTimeout = null;
            }, 120);
        }
    }

    /**
     * 处理双击事件（重命名）
     * @param {MouseEvent} e - 双击事件
     * @returns {void}
     */
    handleDoubleClick(e) {
        if (this.clickTimeout) {
            clearTimeout(this.clickTimeout);
            this.clickTimeout = null;
        }

        const item = e.target.closest('.md-doc-item');
        if (item && !this.editingDocId) {
            this.editItemName(item.dataset.docId, false, false);
        }
    }

    /**
     * 处理拖拽开始
     * @param {DragEvent} e - 拖拽事件
     * @returns {void}
     */
    handleDragStart(e) {
        const item = e.target.closest('.md-doc-item');
        if (!item || this.editingDocId) {
            e.preventDefault();
            return;
        }

        this.draggedItem = item.dataset.docId;
        item.classList.add('md-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.draggedItem);
        document.body.classList.add('is-dragging-tree');

        // 使用 dom.js 统一查询，缓存树容器，避免重复查询
        this.treeContainer = dom.getIn(this.container, '.md-tree-container');
    }

    /**
     * 处理拖拽经过（节流优化：50ms）
     * @param {DragEvent} e - 拖拽经过事件
     * @returns {void}
     */
    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        // 节流：50ms 内只处理一次
        const now = performance.now();
        if (now - this.lastDragOverTime < 50) {
            return;
        }
        this.lastDragOverTime = now;

        // 快速检查：是否在有效的拖拽区域
        if (e.target.closest('.md-doc-toolbar') || e.target.closest('.md-empty-state')) {
            this.#clearDropTarget();
            return;
        }

        const targetItem = e.target.closest('.md-doc-item');

        // 没有文档项 → 根目录区域
        if (!targetItem) {
            this.#setDropTarget(this.treeContainer, 'root');
            return;
        }

        // 有文档项，检查是否在展开的文件夹内
        const targetNode = targetItem.closest('.md-tree-node');
        if (!targetNode) {
            this.#clearDropTarget();
            return;
        }

        // 优先检查：目标项本身是否是展开的文件夹
        if (targetItem.dataset.docType === 'folder' && this.expandedFolders.has(targetItem.dataset.docId)) {
            // 展开的文件夹 → 高亮整个展开区域
            this.#setDropTarget(targetNode, 'expanded');
            return;
        }

        // 检查是否在展开的文件夹内
        const expandedFolder = this.#findExpandedFolder(targetNode);
        if (expandedFolder) {
            this.#setDropTarget(expandedFolder, 'expanded');
            return;
        }

        // 折叠的文件夹项 → 高亮文件夹
        if (targetItem.dataset.docType === 'folder') {
            this.#setDropTarget(targetItem, 'item');
            return;
        }

        // 文件项 → 检查是否在根目录层级
        const isRootLevel = targetNode.parentElement === this.treeContainer;
        this.#setDropTarget(isRootLevel ? this.treeContainer : null, 'root');
    }

    /**
     * 查找包含指定节点的展开文件夹
     * @private
     * @param {Element} node - 节点元素
     * @returns {Element|null} 展开的文件夹节点
     */
    #findExpandedFolder(node) {
        let current = node.parentElement;

        while (current && !current.classList.contains('md-tree-container')) {
            // 检查是否在未折叠的子容器内
            if (current.classList.contains('md-tree-children') &&
                !current.classList.contains('collapsed')) {
                // 获取父节点（文件夹节点）
                const folderNode = current.parentElement;
                // 使用 dom.js 统一查询，验证是有效的文件夹节点
                if (folderNode?.classList.contains('md-tree-node') &&
                    folderNode !== node &&
                    dom.getIn(folderNode, '.md-doc-item')?.dataset.docType === 'folder') {
                    return folderNode;
                }
            }
            current = current.parentElement;
        }
        return null;
    }

    /**
     * 设置拖拽目标高亮
     * @private
     */
    #setDropTarget(element, type) {
        // 如果目标未改变，不做任何操作
        if (this.dragTarget === element) return;
        
        // 清除旧的高亮
        this.#clearDropTarget();
        
        // 无效元素，直接返回
        if (!element) return;
        
        // 设置新的高亮
        this.dragTarget = element;
        this.dragTargetType = type;
        
        // 使用映射简化类名添加
        const classNameMap = {
            'expanded': 'md-drop-target-expanded',
            'root': 'md-drop-target-root',
            'item': 'md-drop-target'
        };
        
        element.classList.add(classNameMap[type]);
    }

    /**
     * 清除拖拽目标高亮
     * @private
     */
    #clearDropTarget() {
        if (!this.dragTarget) return;
        
        // 移除所有可能的拖拽目标类名
        this.dragTarget.classList.remove('md-drop-target', 'md-drop-target-expanded', 'md-drop-target-root');
        this.dragTarget = null;
        this.dragTargetType = null;
    }

    /**
     * 处理放置
     * @param {DragEvent} e - 放置事件
     * @returns {void}
     */
    handleDrop(e) {
        e.preventDefault();

        if (!this.draggedItem || !this.dragTarget) return;

        // 根据拖拽目标类型获取目标 ID
        let targetId = null;

        if (this.dragTargetType === 'root') {
            targetId = null; // 根目录
        } else if (this.dragTargetType === 'expanded') {
            // 使用 dom.js 统一查询
            targetId = dom.getIn(this.dragTarget, '.md-doc-item')?.dataset.docId;
        } else {
            targetId = this.dragTarget.dataset.docId;
        }

        // 无效目标或拖到自己
        if (!targetId && this.dragTargetType !== 'root' || targetId === this.draggedItem) {
            this.#clearDropTarget();
            return;
        }

        // 移动文档
        const moved = this.state.moveDocument(this.draggedItem, targetId);
        if (moved) {
            StoreManager.saveDocuments(this.state.get('documents'));
            if (targetId) this.expandFolder(targetId);
        }

        this.#clearDropTarget();
    }

    /**
     * 处理拖拽结束
     * @param {DragEvent} e - 拖拽结束事件
     * @returns {void}
     */
    handleDragEnd(e) {
        // 使用 dom.js 统一查询，清除拖拽项样式
        const draggingItem = dom.getIn(this.container, '.md-dragging');
        draggingItem?.classList.remove('md-dragging');
        
        // 清除目标高亮和状态
        this.#clearDropTarget();
        
        // 清理缓存
        this.treeContainer = null;
        
        // 移除拖拽状态类，恢复过渡效果
        document.body.classList.remove('is-dragging-tree');
        
        // 重置拖拽状态
        this.draggedItem = null;
    }

    /**
     * 打开文档（乐观更新优化）
     * @param {string} docId - 文档 ID
     * @returns {void}
     */
    handleOpen(docId) {
        const documents = this.state.get('documents');
        const doc = documents.find(d => d.id === docId);
        
        if (!doc) return;
        
        // 乐观更新：立即更新 UI 状态，不等待渲染
        const currentDocId = this.state.get('currentDocId');
        
        // 立即移除旧的激活状态
        if (currentDocId) {
            const oldItem = this.#getCachedDocItem(currentDocId);
            if (oldItem) {
                oldItem.classList.remove('active');
            }
        }
        
        // 立即添加新的激活状态
        const newItem = this.#getCachedDocItem(docId);
        if (newItem) {
            newItem.classList.add('active');
        }
        
        // 异步更新状态和渲染（不阻塞 UI）
        requestAnimationFrame(() => {
            this.state.setCurrentDocument(docId);
            
            // 如果是文件夹，同时切换展开状态
            if (doc.type === 'folder') {
                this.toggleFolder(docId);
            }
        });
    }

    /**
     * 删除文档
     * @param {string} docId - 文档 ID
     * @returns {Promise<void>}
     */
    async handleDelete(docId) {
        const doc = this.state.get('documents').find(d => d.id === docId);
        if (!doc) return;

        // 使用递归函数快速计算子项数量
        const countChildren = (parentId) => {
            const children = this.state.getChildren(parentId);
            let count = children.length;
            for (const child of children) {
                if (child.type === 'folder') {
                    count += countChildren(child.id);
                }
            }
            return count;
        };

        const childrenCount = doc.type === 'folder' ? countChildren(docId) : 0;
        const itemType = doc.type === 'folder' ? '文件夹' : '文档';
        const message = childrenCount > 0
            ? `确定要删除这个${itemType}及其 ${childrenCount} 个子项吗？`
            : `确定要删除这个${itemType}吗？`;

        const confirmed = await Dialog.confirm(message, {
            title: '删除确认',
            type: 'danger',
            confirmText: '删除',
            cancelText: '取消'
        });
        if (!confirmed) return;

        this.state.deleteDocument(docId);
        StoreManager.saveDocuments(this.state.get('documents'));
    }

    /**
     * 创建新项目
     * @param {string} [type='file'] - 项目类型 'file' | 'folder'
     * @param {string|null} [parentId=null] - 父级 ID
     * @returns {void}
     */
    createItem(type = 'file', parentId = null) {
        // 如果已经有待处理的编辑，先完成它（避免多个文件同时进入重命名）
        if (this.#pendingEdit && this.editingDocId) {
            // 取消之前的编辑，不保存
            const editingItem = dom.getIn(this.container, `[data-doc-id="${this.editingDocId}"]`);
            if (editingItem?.classList.contains('editing')) {
                // 触发 blur 来完成编辑（会取消）
                const input = dom.getIn(editingItem, '.md-doc-item-input');
                if (input) input.blur();
            }
            // 清空待编辑状态
            this.#pendingEdit = null;
        }

        const doc = {
            id: Date.now().toString(),
            name: type === 'folder' ? '新建文件夹' : '新建文档',
            type: type,
            content: type === 'file' ? StoreManager.DEFAULT_CONTENT : undefined,
            parentId: parentId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // 先标记需要进入编辑模式
        this.#pendingEdit = { docId: doc.id, isNewItem: true, shouldSetCurrent: type === 'file' };
        
        // 使用 silent 选项添加文档，避免触发订阅回调的完全重渲染
        const documents = this.state.get('documents');
        documents.push(doc);
        this.state.setState({ documents }, { silent: true });
        StoreManager.saveDocuments(documents);
        
        // 展开所有祖先文件夹，确保新文件可见（优化版：批量更新）
        this.#expandAncestorFolders(parentId);
        
        // 手动触发增量渲染（只渲染新增的节点）
        this.#renderNewItem(doc);
    }

    /**
     * 展开所有祖先文件夹（优化版：批量更新，减少 RAF 调用）
     * @private
     * @param {string|null} folderId - 文件夹 ID
     */
    #expandAncestorFolders(folderId) {
        if (!folderId) return;
        
        const documents = this.state.get('documents');
        const ancestors = [];
        let currentId = folderId;
        
        // 收集所有祖先文件夹（优化：使用 Map 避免重复 find）
        const docMap = new Map(documents.map(d => [d.id, d]));
        
        while (currentId) {
            const doc = docMap.get(currentId);
            if (!doc || !doc.parentId) break;
            ancestors.push(doc.parentId);
            currentId = doc.parentId;
        }
        
        // 如果没有需要展开的祖先，直接返回
        if (ancestors.length === 0) return;
        
        // 批量添加到展开状态（避免多次 RAF）
        const foldersToExpand = [folderId, ...ancestors.reverse()];
        let hasChanges = false;
        
        for (const folderId of foldersToExpand) {
            if (!this.expandedFolders.has(folderId)) {
                this.expandedFolders.add(folderId);
                hasChanges = true;
            }
        }
        
        // 如果有变化，使用单次 RAF 批量更新 UI
        if (hasChanges) {
            requestAnimationFrame(() => {
                for (const folderId of foldersToExpand) {
                    this.#updateFolderUI(folderId, true);
                }
            });
        }
    }

    /**
     * 编辑项目名称
     * @param {string} docId - 文档 ID
     * @param {boolean} isNewItem - 是否为新建的项目（新建时默认保存，重命名时默认取消）
     * @param {boolean} shouldSetCurrent - 是否设置为当前文档（仅对文件有效）
     */
    editItemName(docId, isNewItem = false, shouldSetCurrent = false) {
        this.editingDocId = docId;

        const item = dom.getIn(this.container, `[data-doc-id="${docId}"]`);
        const nameSpan = dom.getIn(item, '.md-doc-item-name');
        if (!item || !nameSpan) {
            // DOM 未就绪，退出编辑模式
            this.editingDocId = null;
            return;
        }

        const currentName = nameSpan.textContent;
        item.classList.add('editing');
        item.draggable = false;

        const input = this.createElement('input', {
            type: 'text',
            className: 'md-doc-item-input',
            attributes: { value: currentName }
        });

        nameSpan.replaceWith(input);
        input.focus();
        input.select();

        let hasChanged = false;

        const finishEdit = (saveChanges) => {
            input.removeEventListener('blur', handleBlur);
            
            if (saveChanges) {
                const newName = input.value.trim();
                if (!newName) {
                    this.showMessage('名称不能为空', 'error');
                    input.focus();
                    input.addEventListener('blur', handleBlur, { once: true });
                    return;
                }

                this.state.updateDocument(docId, {
                    name: newName,
                    updatedAt: new Date().toISOString()
                }, { silent: true });
                StoreManager.saveDocuments(this.state.get('documents'));

                const nameSpan = this.createElement('span', {
                    className: 'md-doc-item-name',
                    textContent: newName
                });
                input.replaceWith(nameSpan);
            } else {
                const nameSpan = this.createElement('span', {
                    className: 'md-doc-item-name',
                    textContent: currentName
                });
                input.replaceWith(nameSpan);
            }

            this.editingDocId = null;
            item.classList.remove('editing');
            item.draggable = true;

            // 如果需要，设置为当前文档
            if (shouldSetCurrent && isNewItem) {
                this.state.setCurrentDocument(docId);
            }
        };

        const handleBlur = () => {
            finishEdit(isNewItem || hasChanged);
        };

        input.addEventListener('blur', handleBlur, { once: true });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                hasChanged = true;
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                input.removeEventListener('blur', handleBlur);
                finishEdit(false);
            }
        });

        input.addEventListener('input', () => {
            hasChanged = true;
        });
    }

    /**
     * 重命名当前项目
     * @returns {void}
     */
    renameCurrentItem() {
        const currentDocId = this.state.get('currentDocId');
        if (!currentDocId) {
            this.showMessage('请先选择一个项目', 'warning');
        } else {
            this.editItemName(currentDocId, false, false);
        }
    }

    /**
     * 清空所有文件
     * @returns {Promise<void>}
     */
    async deleteCurrentItem() {
        const documents = this.state.get('documents');
        if (documents.length === 0) {
            this.showMessage('当前没有文件', 'info');
            return;
        }

        // 显示确认对话框
        const confirmed = await Dialog.confirm(
            `确定要清空所有文件吗？\n\n这将删除 ${documents.length} 个文件/文件夹，此操作不可恢复！`,
            {
                title: '清空确认',
                type: 'danger',
                confirmText: '清空',
                cancelText: '取消'
            }
        );
        if (!confirmed) {
            return;
        }

        // 清空所有文档和内容
        this.state.setState({
            documents: [],
            currentDocId: null,
            content: ''
        });
        StoreManager.saveDocuments([]);
        StoreManager.saveContent('');

        // 清空展开状态
        this.expandedFolders.clear();

        // 重新渲染
        this.render();

        this.showMessage('已清空所有文件', 'success');
    }

    /**
     * 渲染组件（优化版：改进增量更新策略）
     * @param {boolean} forceFullRender - 是否强制完全重新渲染
     */
    render(forceFullRender = false) {
        const documents = this.state.get('documents');
        const currentDocId = this.state.get('currentDocId');

        if (documents.length === 0) {
            this.container.innerHTML = `
                <div class="md-empty-state">
                    <p>暂无文档</p>
                    <button class="md-btn md-btn-primary" data-action="create-file">新建文档</button>
                    <button class="md-btn md-btn-secondary" data-action="create-folder">新建文件夹</button>
                </div>
            `;
            // 使用 dom.js 统一查询
            dom.getIn(this.container, '[data-action="create-file"]')?.addEventListener('click', () => this.createItem('file'));
            dom.getIn(this.container, '[data-action="create-folder"]')?.addEventListener('click', () => this.createItem('folder'));
            
            // 清空缓存
            this.#clearDomCache();
            return;
        }

        // 优化的增量更新：检查是否只需要更新激活状态
        if (!forceFullRender && this.#shouldUpdateActiveOnly(documents)) {
            this.#updateActiveState(currentDocId);
            return;
        }

        // 完全重建
        this.#lastDocCount = documents.length;
        
        const tree = this.state.buildTree();
        const fragment = this.createFragment();
        const treeContainer = this.createElement('div', {
            className: 'md-tree-container'
        });

        tree.forEach((node) => {
            treeContainer.appendChild(this.renderTreeNode(node, currentDocId, 0));
        });

        fragment.appendChild(treeContainer);
        this.container.innerHTML = '';
        this.container.appendChild(fragment);
        
        // 清空缓存并增加版本号
        this.#clearDomCache();

        // 使用 dom.js 统一查询，立即重建 DOM 缓存（避免后续查询）
        documents.forEach(doc => {
            const item = dom.getIn(this.container, `[data-doc-id="${doc.id}"]`);
            if (item) {
                this.#domCache.set(doc.id, { element: item, version: this.domCacheVersion });
            }
        });
        
        // 如果有待处理的编辑操作，延迟执行确保 DOM 就绪
        if (this.#pendingEdit) {
            const pendingEdit = this.#pendingEdit;
            this.#pendingEdit = null;
            
            requestAnimationFrame(() => {
                this.editItemName(pendingEdit.docId, pendingEdit.isNewItem, pendingEdit.shouldSetCurrent);
            });
        }
    }

    /**
     * 检查是否只需要更新激活状态
     * @private
     * @param {Array} documents - 文档列表
     * @returns {boolean} 是否只需要更新激活状态
     */
    #shouldUpdateActiveOnly(documents) {
        // 如果文档数量没变，且没有结构性变化，只需要更新激活状态
        return this.#lastDocCount === documents.length && this.#lastDocCount > 0;
    }

    /**
     * 增量渲染新项目（性能优化：避免完全重渲染）
     * @private
     * @param {Object} doc - 新文档对象
     */
    #renderNewItem(doc) {
        this.#lastDocCount = this.state.get('documents').length;
        
        // 第一个文档需要完全渲染（移除空状态）
        if (this.#lastDocCount === 1) {
            this.render(true);
            return;
        }
        
        // 获取或创建目标容器
        const targetContainer = doc.parentId 
            ? this.#getOrCreateChildrenContainer(doc.parentId)
            : dom.getIn(this.container, '.md-tree-container');
        
        if (!targetContainer) {
            this.render(true);
            return;
        }
        
        // 构造节点数据（不需要从树中查找，直接用 doc）
        const node = { ...doc, children: [] };
        const level = this.#calculateLevel(doc.parentId);
        
        // 渲染并插入新节点
        const newNodeElement = this.renderTreeNode(node, this.state.get('currentDocId'), level);
        targetContainer.appendChild(newNodeElement);
        
        // 更新缓存
        const item = dom.getIn(newNodeElement, '.md-doc-item');
        if (item) {
            this.#domCache.set(doc.id, { element: item, version: this.domCacheVersion });
        }
        
        // 处理待编辑状态
        if (this.#pendingEdit?.docId === doc.id) {
            const pendingEdit = this.#pendingEdit;
            this.#pendingEdit = null;
            requestAnimationFrame(() => {
                this.editItemName(pendingEdit.docId, pendingEdit.isNewItem, pendingEdit.shouldSetCurrent);
            });
        }
    }
    
    /**
     * 获取或创建父节点的子容器
     * @private
     */
    #getOrCreateChildrenContainer(parentId) {
        const parentNode = dom.getIn(this.container, `[data-doc-id="${parentId}"]`)?.closest('.md-tree-node');
        if (!parentNode) return null;
        
        let container = dom.getIn(parentNode, '.md-tree-children');
        if (!container) {
            container = this.createElement('div', { className: 'md-tree-children' });
            parentNode.appendChild(container);
        }
        return container;
    }
    
    /**
     * 计算节点层级（递归向上）
     * @private
     */
    #calculateLevel(parentId) {
        if (!parentId) return 0;
        const parent = this.state.get('documents').find(d => d.id === parentId);
        return parent ? 1 + this.#calculateLevel(parent.parentId) : 0;
    }

    /**
     * 增量更新激活状态（性能优化）
     * @private
     */
    #updateActiveState(currentDocId) {
        // 使用 dom.js 统一查询，移除旧的激活状态
        const oldActive = dom.getIn(this.container, '.md-doc-item.active');
        if (oldActive) oldActive.classList.remove('active');

        // 添加新的激活状态
        if (currentDocId) {
            const newActive = dom.getIn(this.container, `[data-doc-id="${currentDocId}"]`);
            if (newActive) newActive.classList.add('active');
        }
    }

    /**
     * 递归渲染树节点
     * @param {Object} node - 节点数据
     * @param {string|null} currentDocId - 当前文档 ID
     * @param {number} level - 深度层级
     * @returns {Element} 渲染的节点容器
     */
    renderTreeNode(node, currentDocId, level) {
        const isEditing = node.id === this.editingDocId;
        const isActive = node.id === currentDocId;
        const isFolder = node.type === 'folder';
        const isExpanded = isFolder && this.expandedFolders.has(node.id);
        const hasChildren = isFolder && node.children?.length > 0;

        const nodeContainer = this.createElement('div', {
            className: 'md-tree-node',
            dataset: { level }
        });

        // 优化：使用数组构建类名，避免字符串拼接
        const itemClasses = ['md-doc-item'];
        if (isActive) itemClasses.push('active');
        if (isEditing) itemClasses.push('editing');

        const item = this.createElement('div', {
            className: itemClasses.join(' '),
            dataset: {
                docId: node.id,
                docType: node.type || 'file'
            },
            attributes: { draggable: 'true' }
        });

        this.createElement('span', {
            className: 'md-tree-indent',
            style: { width: `${level * 16}px` },
            parent: item
        });

        if (isFolder) {
            const toggleClasses = ['md-tree-toggle'];
            if (isExpanded) toggleClasses.push('expanded');
            
            const toggle = this.createElement('span', {
                className: toggleClasses.join(' '),
                dataset: { folderId: node.id },
                parent: item
            });
            this.createElement('i', {
                className: 'codicon codicon-chevron-right',
                parent: toggle
            });
        } else {
            this.createElement('span', {
                className: 'md-tree-spacer',
                parent: item
            });
        }

        const iconSpan = this.createElement('span', {
            className: 'md-doc-item-icon',
            parent: item
        });

        const iconClass = isFolder
            ? (isExpanded ? 'codicon-folder-opened' : 'codicon-folder')
            : 'codicon-file';
        this.createElement('i', {
            className: `codicon ${iconClass}`,
            parent: iconSpan
        });

        if (isEditing) {
            this.createElement('input', {
                type: 'text',
                className: 'md-doc-item-input',
                attributes: { value: node.name },
                parent: item
            });
        } else {
            this.createElement('span', {
                className: 'md-doc-item-name',
                textContent: node.name,
                parent: item
            });
        }

        const actions = this.createElement('span', {
            className: 'md-doc-item-actions',
            parent: item
        });

        if (isFolder) {
            const newFileBtn = this.createElement('button', {
                className: 'md-btn md-btn-icon md-btn-xs md-new-file-btn',
                attributes: {
                    title: '在此新建文档',
                    'data-folder-id': node.id
                },
                parent: actions
            });
            this.createElement('i', {
                className: 'codicon codicon-new-file',
                parent: newFileBtn
            });

            const newFolderBtn = this.createElement('button', {
                className: 'md-btn md-btn-icon md-btn-xs md-new-folder-btn',
                attributes: {
                    title: '在此新建文件夹',
                    'data-folder-id': node.id
                },
                parent: actions
            });
            this.createElement('i', {
                className: 'codicon codicon-new-folder',
                parent: newFolderBtn
            });
        }

        const deleteBtn = this.createElement('button', {
            className: 'md-btn md-btn-icon md-btn-xs md-doc-item-delete',
            attributes: {
                title: '删除',
                'data-doc-id': node.id
            },
            parent: actions
        });
        this.createElement('i', {
            className: 'codicon codicon-trash',
            parent: deleteBtn
        });

        nodeContainer.appendChild(item);

        if (isFolder && hasChildren) {
            const childrenClasses = ['md-tree-children'];
            if (!isExpanded) childrenClasses.push('collapsed');
            
            const childrenContainer = this.createElement('div', {
                className: childrenClasses.join(' ')
            });

            node.children.forEach((child) => {
                childrenContainer.appendChild(this.renderTreeNode(child, currentDocId, level + 1));
            });

            nodeContainer.appendChild(childrenContainer);
        }

        return nodeContainer;
    }

    /**
     * 清理组件资源
     * @returns {void}
     */
    destroy() {
        if (this.clickTimeout) {
            clearTimeout(this.clickTimeout);
            this.clickTimeout = null;
        }
        
        if (this.dragOverThrottle) {
            clearTimeout(this.dragOverThrottle);
            this.dragOverThrottle = null;
        }
        
        // 清空缓存和状态
        this.#clearDomCache();
        this.#pendingUpdates.clear();
        this.dragTarget = null;
        this.dragTargetType = null;
        this.draggedItem = null;
        this.treeContainer = null;
        
        // 移除拖拽状态类
        document.body.classList.remove('is-dragging-tree');
        
        super.destroy?.();
    }
}
