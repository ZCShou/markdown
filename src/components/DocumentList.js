/**
 * 文档列表组件 - 树型结构
 * 负责文档列表的渲染和交互，支持文件夹嵌套
 */
import { BaseComponent } from './BaseComponent.js';
import { StoreManager } from '../modules/store.js';
import { dom } from '../utils/dom.js';

export class DocumentList extends BaseComponent {
    /** @private */
    #lastDocCount = 0; // 用于增量更新
    
    /** @private */
    #domCache = new Map(); // DOM 元素缓存
    
    /** @private */
    #pendingUpdates = new Map(); // 待处理的更新（用于 RAF 批量更新）

    /**
     * 构造函数
     */
    constructor(state, containerId) {
        super(state, containerId);
        this.editingDocId = null;
        this.draggedItem = null;
        this.clickTimeout = null;
        this.expandedFolders = new Set(); // 本地文件夹展开状态
    }

    /**
     * 订阅状态变化
     */
    subscribe() {
        this.unsubscribe = this.state.subscribeTo(['documents', 'currentDocId'], (newValue, oldValue, key) => {
            if (key === 'currentDocId') {
                this.updateActiveState(newValue, oldValue);
            } else if (key === 'documents') {
                // 优化：使用 Map 代替 find，时间复杂度从 O(n²) 降到 O(n)
                const needsFullRender = this.#hasStructuralChanges(newValue, oldValue);
                
                if (needsFullRender) {
                    this.render();
                }
            }
        });
    }

    /**
     * 检查文档结构是否发生变化（优化版）
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

        // 使用 Map 优化查找性能
        const oldMap = new Map(oldValue.map(d => [d.id, d]));
        
        // 检查是否有新增、删除或结构性变化
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
        }
        
        // 检查是否有删除
        const newMap = new Map(newValue.map(d => [d.id]));
        for (const oldDoc of oldValue) {
            if (!newMap.has(oldDoc.id)) {
                return true;
            }
        }

        return false;
    }

    /**
     * 获取缓存的文档项元素
     * @private
     * @param {string} docId - 文档 ID
     * @returns {Element|null} 文档项元素
     */
    #getCachedDocItem(docId) {
        if (!this.#domCache.has(docId)) {
            const item = this.container?.querySelector(`[data-doc-id="${docId}"]`);
            this.#domCache.set(docId, item);
        }
        return this.#domCache.get(docId);
    }

    /**
     * 清空 DOM 缓存
     * @private
     */
    #clearDomCache() {
        this.#domCache.clear();
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

        // 一次性获取所有需要的子元素
        const toggle = item.querySelector('.md-tree-toggle');
        const icon = item.querySelector('.md-doc-item-icon i');
        const nodeContainer = item.closest('.md-tree-node');
        const childrenContainer = nodeContainer?.querySelector('.md-tree-children');

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
                    this.toggleFolder(docId);
                } else {
                    this.handleOpen(docId);
                }
                this.clickTimeout = null;
            }, 200);
        }
    }

    /**
     * 处理双击事件（重命名）
     */
    handleDoubleClick(e) {
        if (this.clickTimeout) {
            clearTimeout(this.clickTimeout);
            this.clickTimeout = null;
        }

        const item = e.target.closest('.md-doc-item');
        if (item && !this.editingDocId) {
            this.editItemName(item.dataset.docId);
        }
    }

    /**
     * 处理拖拽开始
     */
    handleDragStart(e) {
        const item = e.target.closest('.md-doc-item');
        if (!item) return;

        // 如果正在编辑，不允许拖拽
        if (this.editingDocId) {
            e.preventDefault();
            return;
        }

        this.draggedItem = item.dataset.docId;
        item.classList.add('md-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.draggedItem);
    }

    /**
     * 处理拖拽经过
     */
    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const item = e.target.closest('.md-doc-item');
        if (!item) return;

        this.container.querySelectorAll('.md-drop-target').forEach(el => {
            el.classList.remove('md-drop-target');
        });

        if (item.dataset.docType === 'folder') {
            item.classList.add('md-drop-target');
        }
    }

    /**
     * 处理放置
     */
    handleDrop(e) {
        e.preventDefault();
        const item = e.target.closest('.md-doc-item');
        if (!item || !this.draggedItem || item.dataset.docType !== 'folder') return;

        const targetId = item.dataset.docId;
        if (targetId === this.draggedItem) return;

        const moved = this.state.moveDocument(this.draggedItem, targetId);
        if (moved) {
            StoreManager.saveDocuments(this.state.get('documents'));
            this.expandFolder(targetId);
        }
    }

    /**
     * 处理拖拽结束
     */
    handleDragEnd(e) {
        this.draggedItem = null;
        this.container.querySelectorAll('.md-dragging, .md-drop-target').forEach(el => {
            el.classList.remove('md-dragging', 'md-drop-target');
        });
    }

    /**
     * 打开文档
     */
    handleOpen(docId) {
        this.state.setCurrentDocument(docId);
    }

    /**
     * 删除文档
     */
    handleDelete(docId) {
        const doc = this.state.get('documents').find(d => d.id === docId);
        if (!doc) return;

        // 内联获取所有子项
        const documents = this.state.get('documents');
        const children = [];
        const childrenMap = new Map();
        
        documents.forEach(d => {
            if (d.parentId) {
                if (!childrenMap.has(d.parentId)) childrenMap.set(d.parentId, []);
                childrenMap.get(d.parentId).push(d);
            }
        });
        
        const stack = [docId];
        while (stack.length > 0) {
            const currentId = stack.pop();
            const currentChildren = childrenMap.get(currentId);
            if (currentChildren) {
                for (const child of currentChildren) {
                    children.push(child);
                    if (child.type === 'folder') stack.push(child.id);
                }
            }
        }

        const itemType = doc.type === 'folder' ? '文件夹' : '文档';
        const message = children.length > 0 && doc.type === 'folder'
            ? `确定要删除这个${itemType}及其 ${children.length} 个子项吗？`
            : `确定要删除这个${itemType}吗？`;

        if (!confirm(message)) return;

        this.state.deleteDocument(docId);
        StoreManager.saveDocuments(this.state.get('documents'));
    }

    /**
     * 创建新项目
     */
    createItem(type = 'file', parentId = null) {
        const doc = {
            id: Date.now().toString(),
            name: type === 'folder' ? '新建文件夹' : '新建文档',
            type: type,
            content: type === 'file' ? StoreManager.DEFAULT_CONTENT : undefined,
            parentId: parentId,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.state.addDocument(doc, parentId);
        StoreManager.saveDocuments(this.state.get('documents'));
        
        if (parentId) this.expandFolder(parentId);
        this.editItemName(doc.id);
        if (type === 'file') this.state.setCurrentDocument(doc.id);
    }

    /**
     * 编辑项目名称
     */
    editItemName(docId) {
        this.editingDocId = docId;

        const item = dom.getIn(this.container, `[data-doc-id="${docId}"]`);
        const nameSpan = dom.getIn(item, '.md-doc-item-name');
        if (!item || !nameSpan) return;

        const currentName = nameSpan.textContent;
        item.classList.add('editing');

        // 禁用拖拽，防止在编辑时触发拖拽事件
        const originalDraggable = item.draggable;
        item.draggable = false;

        const input = this.createElement('input', {
            type: 'text',
            className: 'md-doc-item-input',
            attributes: { value: currentName }
        });

        nameSpan.replaceWith(input);
        input.focus();
        input.select();

        let shouldSave = false;

        const restoreDraggable = () => {
            item.draggable = originalDraggable;
        };

        const save = () => {
            const newName = input.value.trim();
            if (!newName) {
                this.showMessage('名称不能为空', 'error');
                input.focus();
                return;
            }

            this.state.updateDocument(docId, {
                name: newName,
                updatedAt: new Date().toISOString()
            }, { silent: true });
            StoreManager.saveDocuments(this.state.get('documents'));

            // 内联退出编辑模式
            this.editingDocId = null;
            const item = dom.getIn(this.container, `[data-doc-id="${docId}"]`);
            if (item && input) {
                const nameSpan = this.createElement('span', {
                    className: 'md-doc-item-name',
                    textContent: newName
                });
                input.replaceWith(nameSpan);
                item.classList.remove('editing');
                restoreDraggable();
            }
        };

        const cancel = () => {
            this.editingDocId = null;
            const item = dom.getIn(this.container, `[data-doc-id="${docId}"]`);
            if (item && input) {
                const nameSpan = this.createElement('span', {
                    className: 'md-doc-item-name',
                    textContent: currentName
                });
                input.replaceWith(nameSpan);
                item.classList.remove('editing');
                restoreDraggable();
            }
        };

        const handleBlur = () => {
            if (shouldSave) save();
            else cancel();
        };

        input.addEventListener('blur', handleBlur, { once: true });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                shouldSave = true;
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                shouldSave = false;
                input.removeEventListener('blur', handleBlur);
                cancel();
            }
        });

        input.addEventListener('input', () => {
            shouldSave = true;
        });
    }

    /**
     * 重命名当前项目
     */
    renameCurrentItem() {
        const currentDocId = this.state.get('currentDocId');
        if (!currentDocId) {
            this.showMessage('请先选择一个项目', 'warning');
        } else {
            this.editItemName(currentDocId);
        }
    }

    /**
     * 清空所有文件
     */
    deleteCurrentItem() {
        const documents = this.state.get('documents');
        if (documents.length === 0) {
            this.showMessage('当前没有文件', 'info');
            return;
        }

        // 显示确认对话框
        const confirmed = confirm(`确定要清空所有文件吗？\n\n这将删除 ${documents.length} 个文件/文件夹，此操作不可恢复！`);
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
     */
    render() {
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
            this.container.querySelector('[data-action="create-file"]')?.addEventListener('click', () => this.createItem('file'));
            this.container.querySelector('[data-action="create-folder"]')?.addEventListener('click', () => this.createItem('folder'));
            
            // 清空缓存
            this.#clearDomCache();
            return;
        }

        // 优化的增量更新：检查是否只需要更新激活状态
        if (this.#shouldUpdateActiveOnly(documents)) {
            this.#updateActiveState(currentDocId);
            return;
        }

        // 完全重建
        this.#lastDocCount = documents.length;
        
        // 使用 requestAnimationFrame 避免阻塞主线程
        requestAnimationFrame(() => {
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
            
            // 清空缓存
            this.#clearDomCache();
        });
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
     * 增量更新激活状态（性能优化）
     * @private
     */
    #updateActiveState(currentDocId) {
        // 移除旧的激活状态
        const oldActive = this.container.querySelector('.md-doc-item.active');
        if (oldActive) oldActive.classList.remove('active');

        // 添加新的激活状态
        if (currentDocId) {
            const newActive = this.container.querySelector(`[data-doc-id="${currentDocId}"]`);
            if (newActive) newActive.classList.add('active');
        }
    }

    /**
     * 递归渲染树节点
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

        const item = this.createElement('div', {
            className: `md-doc-item${isActive ? ' active' : ''}${isEditing ? ' editing' : ''}`,
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
            const toggle = this.createElement('span', {
                className: `md-tree-toggle${isExpanded ? ' expanded' : ''}${hasChildren ? '' : ' leaf'}`,
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
            const childrenContainer = this.createElement('div', {
                className: `md-tree-children${isExpanded ? '' : ' collapsed'}`
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
     */
    destroy() {
        if (this.clickTimeout) {
            clearTimeout(this.clickTimeout);
            this.clickTimeout = null;
        }
        
        // 清空缓存
        this.#clearDomCache();
        this.#pendingUpdates.clear();
        
        super.destroy?.();
    }
}
