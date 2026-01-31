/**
 * 文档列表组件 - 树型结构
 * 负责文档列表的渲染和交互，支持文件夹嵌套
 */
import { BaseComponent } from './BaseComponent.js';
import { EditorState } from '../EditorState.js';
import { dom } from '../utils/dom.js';
import { Dialog } from './Dialog.js';

/**
 *
 */
export class DocumentList extends BaseComponent {
    /** @private */
    #domCache = new Map(); // DOM 元素缓存

    /** @private */
    #pendingUpdates = new Map(); // 待处理的更新（用于 RAF 批量更新）

    /** @private */
    #pendingEdit = null; // 待处理的编辑操作 { docId, isNewItem, shouldSetCurrent }

    /**
     * 构造函数
     * @param state
     * @param containerId
     */
    constructor(state, containerId) {
        super(state, containerId);
        this.editingDocId = null;
        this.draggedItems = null; // 被拖动的所有项目ID数组（支持多选拖放）
        this.dragTarget = null; // 缓存当前拖拽目标
        this.dragTargetType = null; // 缓存当前拖拽目标类型
        this.clickTimeout = null;
        this.dragOverThrottle = null; // dragover 节流定时器
        this.lastDragOverTime = 0; // 上次 dragover 处理时间
        this.expandedFolders = new Set(); // 本地文件夹展开状态
        this.treeContainer = null; // 缓存树容器
        this.domCacheVersion = 0; // DOM 缓存版本号，用于失效检测
    }

    // ==================== 生命周期管理 ====================

    /**
     * 订阅状态变化
     * @returns {void}
     */
    subscribe() {
        this.unsubscribe = this.state.subscribeTo(
            ['documents', 'selectedDocIds'],
            (newValue, oldValue, key) => {
                if (key === 'selectedDocIds') {
                    this.updateSelectionState(newValue, oldValue);
                } else if (key === 'documents') {
                    // 优化：使用 Map 代替 find，时间复杂度从 O(n²) 降到 O(n)
                    const needsFullRender = this.#hasStructuralChanges(newValue, oldValue);

                    if (needsFullRender) {
                        // 强制完全重新渲染
                        this.render();
                    }
                }
            }
        );
    }

    // ==================== 状态检测 ====================

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

    // ==================== DOM 缓存管理 ====================

    /**
     * 获取缓存的文档项元素
     * @private
     * @param {string} docId - 文档 ID
     * @returns {Element|null} 文档项元素
     */
    #getCachedDocItem(docId) {
        const cached = this.#domCache.get(docId);
        // 检查缓存是否有效
        if (cached?.element?.isConnected) {
            return cached.element;
        }
        // 重新查询并缓存
        const item = this.container?.querySelector(`[data-doc-id="${docId}"]`);
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

    // ==================== 选择状态管理 ====================

    /**
     * 更新多选状态（局部更新）
     * @param {Array} newSelectedIds - 新选中的文档ID列表
     * @param {Array} oldSelectedIds - 旧选中的文档ID列表
     */
    updateSelectionState(newSelectedIds = [], oldSelectedIds = []) {
        if (!this.container) return;

        const newSet = new Set(newSelectedIds);
        const oldSet = new Set(oldSelectedIds);

        // 使用requestAnimationFrame批量更新DOM
        requestAnimationFrame(() => {
            // 移除旧选中
            oldSet.forEach(docId => {
                if (!newSet.has(docId)) {
                    this.#getCachedDocItem(docId)?.classList.remove('active');
                }
            });
            // 添加新选中
            newSet.forEach(docId => {
                if (!oldSet.has(docId)) {
                    this.#getCachedDocItem(docId)?.classList.add('active');
                }
            });
        });
    }

    // ==================== 文件夹展开/折叠 ====================

    /**
     * 设置文件夹展开状态（优化版：减少 DOM 查询）
     * @param folderId
     * @param expanded
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
     * @param folderId
     * @param expanded
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
        const childrenContainer = nodeContainer
            ? dom.getIn(nodeContainer, '.md-tree-children')
            : null;

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
     * 管理文件夹展开状态
     * @param {string} folderId - 文件夹 ID
     * @param {boolean|string} [expanded='toggle'] - 展开状态：true=展开, false=折叠, 'toggle'=切换
     */
    manageFolderState(folderId, expanded = 'toggle') {
        if (expanded === 'toggle') {
            expanded = !this.expandedFolders.has(folderId);
        }
        this.setFolderExpanded(folderId, expanded);
    }

    /**
     * 查找包含指定节点的展开文件夹
     * @private
     * @param {Element} node - 节点元素
     * @returns {Element|null} 展开的文件夹节点
     */
    #findExpandedFolder(node) {
        let current = node.parentElement;

        while (current && current !== this.container) {
            // 检查是否在未折叠的子容器内
            if (
                current.classList.contains('md-tree-children') &&
                !current.classList.contains('collapsed')
            ) {
                // 获取父节点（文件夹节点）
                const folderNode = current.parentElement;
                // 使用 dom.js 统一查询，验证是有效的文件夹节点
                if (
                    folderNode?.classList.contains('md-tree-node') &&
                    folderNode !== node &&
                    dom.getIn(folderNode, '.md-doc-item')?.dataset.docType === 'folder'
                ) {
                    return folderNode;
                }
            }
            current = current.parentElement;
        }
        return null;
    }

    /**
     * 展开所有祖先文件夹（优化版：批量更新，减少 RAF 调用）
     * @private
     * @param {string|null} folderId - 文件夹 ID
     */
    #expandAncestorFolders(folderId) {
        // 根目录创建：不需要展开任何文件夹
        if (!folderId) return;

        const documents = this.state.get('documents');
        const folderSet = new Set();
        const docMap = new Map(documents.map(d => [d.id, d]));

        // 收集目标文件夹及其所有祖先
        folderSet.add(folderId);
        let currentId = folderId;

        while (currentId) {
            const doc = docMap.get(currentId);
            if (!doc || !doc.parentId) break;
            folderSet.add(doc.parentId);
            currentId = doc.parentId;
        }

        if (folderSet.size === 0) return;

        // 批量添加到展开状态（避免多次 RAF）
        const foldersToExpand = Array.from(folderSet);
        let hasChanges = false;

        for (const fid of foldersToExpand) {
            if (!this.expandedFolders.has(fid)) {
                this.expandedFolders.add(fid);
                hasChanges = true;
            }
        }

        // 如果有变化，使用单次 RAF 批量更新 UI
        if (hasChanges) {
            requestAnimationFrame(() => {
                for (const fid of foldersToExpand) {
                    this.#updateFolderUI(fid, true);
                }
            });
        }
    }

    // ==================== 事件处理 ====================

    /**
     * 绑定事件
     * @returns {void}
     */
    bindEvents() {
        // 使用事件委托处理列表项点击
        this.addEventListener(this.container, 'click', e => this.handleClick(e));
        this.addEventListener(this.container, 'dblclick', e => this.handleDoubleClick(e));
        this.addEventListener(this.container, 'dragstart', e => this.handleDragStart(e));
        this.addEventListener(this.container, 'dragover', e => this.handleDragOver(e));
        this.addEventListener(this.container, 'drop', e => this.handleDrop(e));
        this.addEventListener(this.container, 'dragend', e => this.handleDragEnd(e));
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
            this.manageFolderState(toggle.dataset.folderId, 'toggle');
            return;
        }

        const deleteBtn = e.target.closest('.md-doc-item-delete');
        if (deleteBtn) {
            e.stopPropagation();
            this.deleteDocument(deleteBtn.dataset.docId);
            return;
        }

        const newFileBtn = e.target.closest('.md-new-file-btn');
        if (newFileBtn) {
            e.stopPropagation();
            this.createDocument('file', newFileBtn.dataset.folderId || null);
            return;
        }

        const newFolderBtn = e.target.closest('.md-new-folder-btn');
        if (newFolderBtn) {
            e.stopPropagation();
            this.createDocument('folder', newFolderBtn.dataset.folderId || null);
            return;
        }

        const item = e.target.closest('.md-doc-item');
        if (item && !this.editingDocId) {
            const { docId, docType } = item.dataset;

            // 清除之前的延迟
            clearTimeout(this.clickTimeout);

            // 检查是否按下Ctrl或Cmd键（多选）
            if (e.ctrlKey || e.metaKey) {
                e.preventDefault();
                this.state.selectDocuments(docId, { mode: 'toggle' });
                return;
            }

            // 检查是否按下Shift键（范围选择）
            if (e.shiftKey) {
                e.preventDefault();
                this.state.selectDocuments(docId, { mode: 'range' });
                return;
            }

            // 普通点击：延迟处理以避免与双击冲突
            this.clickTimeout = setTimeout(() => {
                this.openDocument(docId);
            }, 120);
        } else if (!item && !this.editingDocId) {
            // 点击空闲位置：清空选中状态（性能优化：避免不必要的状态更新）
            const selectedDocIds = this.state.get('selectedDocIds');
            if (selectedDocIds && selectedDocIds.length > 0) {
                this.state.clearDocuments({ selection: true });
            }
        }
    }

    /**
     * 处理双击事件（重命名）
     * @param {MouseEvent} e - 双击事件
     * @returns {void}
     */
    handleDoubleClick(e) {
        clearTimeout(this.clickTimeout);

        const item = e.target.closest('.md-doc-item');
        if (item && !this.editingDocId) {
            this.editDocumentName(item.dataset.docId, false, false);
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

        const docId = item.dataset.docId;
        const selectedDocIds = this.state.get('selectedDocIds') || [];
        
        // 如果拖动的项在选中列表中，拖动所有选中项；否则只拖动当前项
        this.draggedItems = selectedDocIds.includes(docId) ? [...selectedDocIds] : [docId];
        
        // 为所有被拖动的项添加拖动样式
        this.draggedItems.forEach(id => {
            const dragItem = this.#getCachedDocItem(id);
            if (dragItem) {
                dragItem.classList.add('md-dragging');
            }
        });
        
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.draggedItems.join(','));
        document.body.classList.add('is-dragging-tree');

        // 缓存文档列表容器，避免重复查询
        this.treeContainer = this.container;
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
            this.#manageDropTarget(null, null);
            return;
        }

        const targetItem = e.target.closest('.md-doc-item');

        // 没有文档项 → 根目录区域
        if (!targetItem) {
            this.#manageDropTarget(this.treeContainer, 'root');
            return;
        }

        // 检查是否拖到被选中的项上（禁止）
        if (this.draggedItems && this.draggedItems.includes(targetItem.dataset.docId)) {
            this.#manageDropTarget(null, null);
            return;
        }

        // 有文档项，检查是否在展开的文件夹内
        const targetNode = targetItem.closest('.md-tree-node');
        if (!targetNode) {
            this.#manageDropTarget(null, null);
            return;
        }

        // 优先检查：目标项本身是否是展开的文件夹
        if (
            targetItem.dataset.docType === 'folder' &&
            this.expandedFolders.has(targetItem.dataset.docId)
        ) {
            // 展开的文件夹 → 高亮整个展开区域
            this.#manageDropTarget(targetNode, 'expanded');
            return;
        }

        // 检查目标项是否是折叠的文件夹（必须在检查展开的父文件夹之前）
        if (targetItem.dataset.docType === 'folder') {
            // 折叠的文件夹 → 高亮文件夹本身
            this.#manageDropTarget(targetItem, 'item');
            return;
        }

        // 检查是否在展开的文件夹内（只对文件项检查）
        const expandedFolder = this.#findExpandedFolder(targetNode);
        if (expandedFolder) {
            this.#manageDropTarget(expandedFolder, 'expanded');
            return;
        }

        // 文件项 → 检查是否在根目录层级
        const isRootLevel = targetNode.parentElement === this.treeContainer;
        this.#manageDropTarget(isRootLevel ? this.treeContainer : null, 'root');
    }

    // ==================== 拖拽 ====================

    /**
     * 管理拖拽目标高亮
     * @param {Element|null} element - 目标元素，null 表示清除高亮
     * @param {string|null} type - 目标类型：'expanded' | 'root' | 'item'
     * @private
     */
    #manageDropTarget(element, type) {
        // 如果目标未改变，不做任何操作
        if (this.dragTarget === element && element !== null) return;

        // 清除旧的高亮
        if (this.dragTarget) {
            this.dragTarget.classList.remove(
                'md-drop-target',
                'md-drop-target-expanded',
                'md-drop-target-root'
            );
        }

        // 无效元素，直接返回
        if (!element) {
            this.dragTarget = null;
            this.dragTargetType = null;
            return;
        }

        // 设置新的高亮
        this.dragTarget = element;
        this.dragTargetType = type;

        // 使用映射简化类名添加
        const classNameMap = {
            expanded: 'md-drop-target-expanded',
            root: 'md-drop-target-root',
            item: 'md-drop-target'
        };

        element.classList.add(classNameMap[type]);
    }

    /**
     * 处理放置
     * @param {DragEvent} e - 放置事件
     * @returns {void}
     */
    handleDrop(e) {
        e.preventDefault();

        if (!this.draggedItems || this.draggedItems.length === 0 || !this.dragTarget) return;

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

        // 验证目标有效性
        if (this.dragTargetType !== 'root' && !targetId) {
            this.#manageDropTarget(null, null);
            return;
        }

        // 批量移动所有选中的文档
        let anyMoved = false;
        for (const draggedId of this.draggedItems) {
            // 检查是否拖到自己
            if (draggedId === targetId) {
                continue;
            }

            // 防止将文件夹拖到自己的子文件夹中
            if (targetId && this.#isDescendant(draggedId, targetId)) {
                continue;
            }

            const moved = this.state.moveDocument(draggedId, targetId);
            if (moved) {
                anyMoved = true;
            }
        }
        
        if (anyMoved) {
            // 状态已通过 moveDocument 自动更新和持久化
            if (targetId) this.manageFolderState(targetId, true);
        }

        this.#manageDropTarget(null, null);
    }

    /**
     * 检查一个节点是否是另一个节点的后代
     * @param {string|null} ancestorId - 祖先节点ID
     * @param {string} descendantId - 后代节点ID
     * @returns {boolean}
     * @private
     */
    #isDescendant(ancestorId, descendantId) {
        if (!ancestorId || ancestorId === descendantId) return false;
        
        const documents = this.state.get('documents');
        const docMap = new Map(documents.map(d => [d.id, d]));
        let current = docMap.get(descendantId);  // 从 descendantId 开始向上遍历
        
        while (current?.parentId) {
            if (current.parentId === ancestorId) return true;  // 检查是否遇到 ancestorId
            current = docMap.get(current.parentId);
        }
        
        return false;
    }

    /**
     * 处理拖拽结束
     * @returns {void}
     */
    handleDragEnd() {
        // 清除所有拖拽项的样式
        if (this.draggedItems) {
            this.draggedItems.forEach(id => {
                const item = this.#getCachedDocItem(id);
                item?.classList.remove('md-dragging');
            });
        }

        // 清除状态
        this.#manageDropTarget(null, null);
        document.body.classList.remove('is-dragging-tree');
        
        // 重置变量
        this.draggedItems = null;
        this.treeContainer = null;
    }

    // ==================== 文档操作 ====================

    /**
     * 打开文档
     * @param {string} docId - 文档 ID
     * @returns {void}
     */
    openDocument(docId) {
        const documents = this.state.get('documents');
        const doc = documents.find(d => d.id === docId);

        if (!doc) return;

        // 更新状态，由updateSelectionState统一处理UI更新
        this.state.setCurrentDocument(docId);

        // 如果是文件夹，同时切换展开状态
        if (doc.type === 'folder') {
            this.manageFolderState(docId, 'toggle');
        }
    }

    /**
     * 删除单个文档
     * @param {string} docId - 文档 ID
     * @returns {Promise<void>}
     */
    async deleteDocument(docId) {
        const doc = this.state.get('documents').find(d => d.id === docId);
        if (!doc) return;

        // 使用递归函数快速计算子项数量
        const countChildren = parentId => {
            const children = this.state.getDocumentTree(parentId);
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
        const message =
            childrenCount > 0
                ? `确定要删除这个${itemType}及其 ${childrenCount} 个子项吗？`
                : `确定要删除这个${itemType}吗？`;

        const confirmed = await Dialog.confirm(message, {
            title: '删除确认',
            type: 'danger',
            confirmText: '删除',
            cancelText: '取消'
        });
        if (!confirmed) return;

        // deleteDocuments 会自动触发状态更新和持久化
        this.state.deleteDocuments(docId);
    }

    /**
     * 创建新文档或文件夹
     * @param {string} [type='file'] - 项目类型 'file' | 'folder'
     * @param {string|null} [parentId=null] - 父级 ID
     * @returns {void}
     */
    createDocument(type = 'file', parentId = null) {
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
            type,
            parentId,
            content: type === 'file' ? EditorState.DEFAULT_CONTENT : undefined,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        // 清空选中状态，避免创建新文件时多个文件同时被选中
        this.state.clearDocuments({ selection: true });

        // 先标记需要进入编辑模式
        this.#pendingEdit = { docId: doc.id, isNewItem: true, shouldSetCurrent: type === 'file' };

        // 使用 state.addDocument 方法添加文档（支持 silent 选项）
        this.state.addDocument(doc, parentId, { silent: true });

        // 展开所有祖先文件夹，确保新文件可见（优化版：批量更新）
        this.#expandAncestorFolders(parentId);

        // 手动触发增量渲染（只渲染新增的节点）
        this.#renderNewItem(doc);
    }

    /**
     * 编辑文档名称
     * @param {string} docId - 文档 ID
     * @param {boolean} isNewItem - 是否为新建的项目（新建时默认保存，重命名时默认取消）
     * @param {boolean} shouldSetCurrent - 是否设置为当前文档（仅对文件有效）
     */
    editDocumentName(docId, isNewItem = false, shouldSetCurrent = false) {
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

        // 处理失焦事件
        const handleBlur = () => {
            finishEdit(isNewItem || hasChanged);
        };

        // 完成编辑
        const finishEdit = saveChanges => {
            input.removeEventListener('blur', handleBlur);

            if (saveChanges) {
                const newName = input.value.trim();
                if (!newName) {
                    this.showMessage('名称不能为空', 'error');
                    input.focus();
                    input.addEventListener('blur', handleBlur, { once: true });
                    return;
                }

                this.state.updateDocument(
                    docId,
                    {
                        name: newName,
                        updatedAt: new Date().toISOString()
                    },
                    { silent: true }
                );
                // 状态已自动持久化（即使使用 silent 选项）

                const newNameSpan = this.createElement('span', {
                    className: 'md-doc-item-name',
                    textContent: newName
                });
                input.replaceWith(newNameSpan);
            } else {
                const oldNameSpan = this.createElement('span', {
                    className: 'md-doc-item-name',
                    textContent: currentName
                });
                input.replaceWith(oldNameSpan);
            }

            this.editingDocId = null;
            item.classList.remove('editing');
            item.draggable = true;

            // 如果需要，设置为当前文档
            if (shouldSetCurrent && isNewItem) {
                this.state.setCurrentDocument(docId);
            }
        };

        input.addEventListener('blur', handleBlur, { once: true });
        input.addEventListener('keydown', e => {
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
     * 重命名选中的项目
     * @returns {void}
     */
    renameSelectedItem() {
        const selectedDocIds = this.state.get('selectedDocIds') || [];
        const docId = selectedDocIds.length === 1 ? selectedDocIds[0] : this.state.get('currentDocId');
        
        if (!docId) {
            this.showMessage('请先选择一个项目', 'warning');
        } else {
            this.editDocumentName(docId, false, false);
        }
    }

    /**
     * 删除选中的文件或清空所有文件
     * 如果有选中的文件，则删除选中的文件；否则清空所有文件
     * @returns {Promise<void>}
     */
    async deleteSelectedItems() {
        const documents = this.state.get('documents');
        const selectedDocIds = this.state.get('selectedDocIds') || [];

        if (documents.length === 0) {
            this.showMessage('当前没有文件', 'info');
            return;
        }

        let docIdsToDelete = [];
        let message = '';
        let title = '';

        if (selectedDocIds.length > 0) {
            // 有选中项：删除选中的文件
            docIdsToDelete = [...selectedDocIds];
            message = `确定要删除选中的 ${docIdsToDelete.length} 个文件/文件夹吗？\n\n此操作不可恢复！`;
            title = '删除确认';
        } else {
            // 无选中项：清空所有文件
            docIdsToDelete = documents.map(doc => doc.id);
            message = `确定要清空所有文件吗？\n\n这将删除 ${documents.length} 个文件/文件夹，此操作不可恢复！`;
            title = '清空确认';
        }

        // 显示确认对话框
        const confirmed = await Dialog.confirm(message, {
            title,
            type: 'danger',
            confirmText: selectedDocIds.length > 0 ? '删除' : '清空',
            cancelText: '取消'
        });
        if (!confirmed) {
            return;
        }

        // 使用批量删除方法（性能优化：一次性处理所有删除）
        this.state.deleteDocuments(docIdsToDelete, { silent: true });
        // 状态已自动持久化（即使使用 silent 选项）

        // 如果删除了当前文档，清空内容
        const currentDocId = this.state.get('currentDocId');
        if (currentDocId && !this.state.get('documents').find(d => d.id === currentDocId)) {
            this.state.clearDocuments({ current: true });
            // content 状态会自动持久化
        }

        // 清空选中状态
        this.state.clearDocuments({ selection: true });

        // 清空展开状态（如果是清空所有文件）
        if (selectedDocIds.length === 0) {
            this.expandedFolders.clear();
        }

        // 重新渲染
        this.render();

        this.showMessage(
            selectedDocIds.length > 0
                ? `已删除 ${docIdsToDelete.length} 个文件`
                : '已清空所有文件',
            'success'
        );
    }

    // ==================== 渲染相关 ====================

    /**
     * 渲染组件
     * @returns {void}
     */
    render() {
        const documents = this.state.get('documents');
        const currentDocId = this.state.get('currentDocId');
        const selectedDocIds = this.state.get('selectedDocIds') || [];

        if (documents.length === 0) {
            this.container.innerHTML = `
                <div class="md-empty-state">
                    <p>暂无文档</p>
                    <button class="md-btn md-btn-primary" data-action="create-file">新建文档</button>
                    <button class="md-btn md-btn-secondary" data-action="create-folder">新建文件夹</button>
                </div>
            `;
            
            // 使用事件委托而不是单独绑定
            const emptyState = this.container.querySelector('.md-empty-state');
            emptyState?.addEventListener('click', e => {
                const action = e.target.dataset.action;
                if (action === 'create-file') this.createDocument('file');
                else if (action === 'create-folder') this.createDocument('folder');
            });

            this.#clearDomCache();
            return;
        }

        // 完全重建
        const tree = this.state.getDocumentTree();
        const fragment = this.createFragment();

        tree.forEach(node => {
            fragment.appendChild(this.renderTreeNode(node, currentDocId, 0, selectedDocIds));
        });

        this.container.innerHTML = '';
        this.container.appendChild(fragment);

        // 清空缓存并增加版本号
        this.#clearDomCache();

        // 立即重建DOM缓存（批量查询，避免后续多次查询）
        const items = this.container.querySelectorAll('.md-doc-item[data-doc-id]');
        items.forEach(item => {
            const docId = item.dataset.docId;
            this.#domCache.set(docId, { element: item, version: this.domCacheVersion });
        });

        // 展开当前文档和选中文档的祖先文件夹
        if (currentDocId) {
            this.#expandAncestorFolders(currentDocId);
        }
        for (const docId of selectedDocIds) {
            this.#expandAncestorFolders(docId);
        }

        // 如果有待处理的编辑操作，延迟执行确保 DOM 就绪
        if (this.#pendingEdit) {
            const pendingEdit = this.#pendingEdit;
            this.#pendingEdit = null;

            requestAnimationFrame(() => {
                this.editDocumentName(
                    pendingEdit.docId,
                    pendingEdit.isNewItem,
                    pendingEdit.shouldSetCurrent
                );
            });
        }
    }

    /**
     * 增量渲染新项目（性能优化：避免完全重渲染）
     * @private
     * @param {Object} doc - 新文档对象
     */
    #renderNewItem(doc) {
        const docCount = this.state.get('documents').length;

        // 第一个文档需要完全渲染（移除空状态）
        if (docCount === 1) {
            this.render();
            return;
        }

        // 获取或创建目标容器
        const targetContainer = doc.parentId
            ? this.#getOrCreateChildrenContainer(doc.parentId)
            : this.container;

        if (!targetContainer) {
            this.render();
            return;
        }

        // 构造节点数据（不需要从树中查找，直接用 doc）
        const node = { ...doc, children: [] };
        const level = this.#calculateLevel(doc.parentId);
        const selectedDocIds = this.state.get('selectedDocIds') || [];

        // 渲染并插入新节点
        const newNodeElement = this.renderTreeNode(node, this.state.get('currentDocId'), level, selectedDocIds);
        targetContainer.appendChild(newNodeElement);

        // 更新缓存（直接从新节点获取）
        const item = newNodeElement.querySelector('.md-doc-item');
        if (item) {
            this.#domCache.set(doc.id, { element: item, version: this.domCacheVersion });
        }

        // 处理待编辑状态
        if (this.#pendingEdit?.docId === doc.id) {
            const pendingEdit = this.#pendingEdit;
            this.#pendingEdit = null;
            requestAnimationFrame(() => {
                this.editDocumentName(
                    pendingEdit.docId,
                    pendingEdit.isNewItem,
                    pendingEdit.shouldSetCurrent
                );
            });
        }
    }

    /**
     * 获取或创建父节点的子容器
     * @param {string} parentId - 父节点 ID
     * @returns {Element|null} 子容器元素或 null
     * @private
     */
    #getOrCreateChildrenContainer(parentId) {
        const parentNode = dom
            .getIn(this.container, `[data-doc-id="${parentId}"]`)
            ?.closest('.md-tree-node');
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
     * @param {string} parentId - 父节点 ID
     * @returns {number} 节点层级
     * @private
     */
    #calculateLevel(parentId) {
        if (!parentId) return 0;
        const parent = this.state.get('documents').find(d => d.id === parentId);
        return parent ? 1 + this.#calculateLevel(parent.parentId) : 0;
    }

    /**
     * 递归渲染树节点
     * @param {Object} node - 节点数据
     * @param {string|null} currentDocId - 当前文档 ID
     * @param {number} level - 深度层级
     * @param {Array} selectedDocIds - 选中的文档ID列表
     * @returns {Element} 渲染的节点容器
     */
    renderTreeNode(node, currentDocId, level, selectedDocIds = []) {
        const isEditing = node.id === this.editingDocId;
        const isActive = node.id === currentDocId;
        const isSelected = selectedDocIds.includes(node.id);
        const isFolder = node.type === 'folder';
        const isExpanded = isFolder && this.expandedFolders.has(node.id);
        const hasChildren = isFolder && node.children?.length > 0;

        const nodeContainer = this.createElement('div', {
            className: 'md-tree-node',
            dataset: { level }
        });

        // 优化：使用数组构建类名，避免字符串拼接
        const itemClasses = ['md-doc-item'];
        // 选中的文件都使用active类显示
        if (isActive || isSelected) itemClasses.push('active');
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
            ? isExpanded
                ? 'codicon-folder-opened'
                : 'codicon-folder'
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

            node.children.forEach(child => {
                childrenContainer.appendChild(this.renderTreeNode(child, currentDocId, level + 1, selectedDocIds));
            });

            nodeContainer.appendChild(childrenContainer);
        }

        return nodeContainer;
    }

    // ==================== 资源清理 ====================

    /**
     * 清理组件资源
     * @returns {void}
     */
    destroy() {
        // 清理定时器
        clearTimeout(this.clickTimeout);
        clearTimeout(this.dragOverThrottle);

        // 清空缓存和状态
        this.#clearDomCache();
        this.#pendingUpdates.clear();
        
        // 重置拖拽相关状态
        this.dragTarget = null;
        this.dragTargetType = null;
        this.draggedItems = null;
        this.treeContainer = null;

        // 移除拖拽状态类
        document.body.classList.remove('is-dragging-tree');

        super.destroy?.();
    }
}
