/**
 * 左侧边栏组件
 * 负责文档树的渲染、交互和侧边栏控制
 */
import { BaseComponent } from './BaseComponent.js';
import { EditorState } from '../EditorState.js';
import { dom } from '../utils/dom.js';
import { Dialog } from './Dialog.js';
import {
    buildWorkspaceSnapshot,
    getConnectedWorkspaceProviders,
    getWorkspaceRemote,
    parseWorkspaceSnapshot
} from '../workspace/index.js';
import { getImageAsBase64, saveImageFromDataUrl } from '../utils/helpers.js';

/**
 *
 */
export class LeftSidebar extends BaseComponent {
    /** @private */
    #pendingEdit = null;
    /** @private */
    #domCache = new Map(); // DOM 元素缓存
    /** @private */
    #syncSuccessTimer = null;

    constructor(state, containerId) {
        super(state, containerId);
        this.side = 'left';
        this.workspaceManager = null;
        this.editingDocId = null;
        this.draggedItems = null;
        this.dragTarget = null;
        this.dragTargetType = null;
        this.clickTimeout = null;
        this.lastDragOverTime = 0;
        this.expandedFolders = new Set();
        this.isWorkspaceMenuOpen = false;
        this.workspaceSyncVisualState = 'idle';
    }

    setWorkspaceManager(workspaceManager) {
        this.workspaceManager = workspaceManager;
    }

    // ==================== 生命周期管理 ====================

    /**
     * 订阅状态变化
     * @returns {void}
     */
    subscribe() {
        // 订阅侧边栏状态
        const unsubscribeSidebar = this.state.subscribeTo(
            'interface',
            (newInterface, oldInterface) => {
                const hasOld = !!oldInterface;

                // 更新侧边栏可见性（只在状态变化时）
                if (!hasOld || newInterface.leftSidebarOpen !== oldInterface.leftSidebarOpen) {
                    this.updateVisibility(newInterface.leftSidebarOpen);
                }
            }
        );

        // 订阅文档树状态
        const unsubscribeTree = this.state.subscribeTo(
            ['documents', 'selectedDocIds', 'currentDocId'],
            (newValue, oldValue, key) => {
                if (key === 'selectedDocIds') {
                    this.updateSelectionState(newValue, oldValue);
                } else if (key === 'documents' || key === 'currentDocId') {
                    this.renderTree();
                }
            }
        );

        const unsubscribeWorkspace = this.state.subscribeTo('workspace', (workspace, oldWorkspace) => {
            this.updateWorkspaceSyncUI(workspace, oldWorkspace);
        });

        // 合并取消订阅函数
        this.unsubscribe = () => {
            unsubscribeSidebar();
            unsubscribeTree();
            unsubscribeWorkspace();
        };
    }

    /**
     * 绑定事件
     * @returns {void}
     */
    bindEvents() {
        // 文档树事件
        const treeContainer = dom.getById('md-doc-tree')?.element;
        if (treeContainer) {
            treeContainer.addEventListener('click', e => this.handleClick(e));
            treeContainer.addEventListener('dblclick', e => this.handleDoubleClick(e));
            treeContainer.addEventListener('dragstart', e => this.handleDragStart(e));
            treeContainer.addEventListener('dragover', e => this.handleDragOver(e));
            treeContainer.addEventListener('drop', e => this.handleDrop(e));
            treeContainer.addEventListener('dragend', e => this.handleDragEnd(e));
        }

        // 工具栏按钮事件
        const newFileBtn = dom.getById('md-new-file')?.element;
        if (newFileBtn) {
            newFileBtn.addEventListener('click', () => {
                this.createDocument('file', this.#getSelectedFolder()?.id ?? null);
            });
        }

        const newFolderBtn = dom.getById('md-new-folder')?.element;
        if (newFolderBtn) {
            newFolderBtn.addEventListener('click', () => {
                this.createDocument('folder', this.#getSelectedFolder()?.id ?? null);
            });
        }

        const deleteBtn = dom.getById('md-delete-item')?.element;
        if (deleteBtn) {
            deleteBtn.addEventListener('click', () => this.deleteSelectedItems());
        }

        const closeBtn = dom.getById('md-close-left-sidebar')?.element;
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.toggle());
        }

        // 文档导入导出按钮
        const importBtn = dom.getById('md-import-docs')?.element;
        if (importBtn) {
            importBtn.addEventListener('click', () => this.importDocuments());
        }

        const exportBtn = dom.getById('md-export-docs')?.element;
        if (exportBtn) {
            exportBtn.addEventListener('click', () => this.exportDocuments());
        }

        const workspaceSyncBtn = dom.getById('md-workspace-sync-btn')?.element;
        if (workspaceSyncBtn) {
            workspaceSyncBtn.addEventListener('click', e => {
                e.stopPropagation();
                this.toggleWorkspaceMenu();
            });
        }

        const workspaceSyncMenu = dom.getById('md-workspace-sync-menu')?.element;
        if (workspaceSyncMenu) {
            workspaceSyncMenu.addEventListener('click', e => {
                const action = e.target.closest('[data-action]');
                if (action) {
                    const { action: actionType, provider } = action.dataset;
                    if (actionType === 'settings') {
                        this.handleWorkspaceSettingsAction(provider);
                    } else if (actionType === 'sync') {
                        this.handleWorkspaceSyncAction(provider);
                    }
                    return;
                }

                const item = e.target.closest('.md-workspace-sync-menu-item');
                if (!item) return;
                this.openWorkspaceSettings(item.dataset.provider);
            });
        }

        this.addEventListener(document, 'click', e => {
            const syncRoot = dom.getById('md-workspace-sync')?.element;
            if (this.isWorkspaceMenuOpen && syncRoot && !syncRoot.contains(e.target)) {
                this.closeWorkspaceMenu();
            }
        });
    }

    // ==================== 侧边栏控制 ====================

    /**
     * 切换侧边栏
     * @returns {boolean} 切换后的状态
     */
    toggle() {
        return this.state.toggleSidebar(this.side);
    }

    /**
     * 更新可见性
     * @param {boolean} isOpen - 是否打开
     * @returns {void}
     */
    updateVisibility(isOpen) {
        const isMobile = window.innerWidth <= 768;

        if (isOpen) {
            this.container.classList.add('open');
            if (isMobile) dom.app.overlay?.addClass('show');
        } else {
            this.container.classList.remove('open');
            // 关键：无论当前是否 mobile，都清掉残留的 `.show`
            dom.app.overlay?.removeClass('show');
        }
    }

    // ==================== DOM 缓存 ====================

    /**
     * 获取当前第一个选中的文件夹文档
     * @private
     * @returns {Object|null}
     */
    #getSelectedFolder() {
        const selectedDocIds = this.state.get('selectedDocIds') || [];
        if (selectedDocIds.length === 0) return null;
        const documents = this.state.get('documents');
        return documents.find(d => d.id === selectedDocIds[0] && d.type === 'folder') ?? null;
    }

    /** @private */
    #getDocEl(docId) {
        const el = this.#domCache.get(docId);
        return el?.isConnected ? el : null;
    }

    /** @private */
    #rebuildDomCache() {
        this.#domCache.clear();
        const container = document.getElementById('md-doc-tree');
        container?.querySelectorAll('.md-doc-item').forEach(el => {
            const id = el.dataset.docId;
            if (id) this.#domCache.set(id, el);
        });
    }

    // ==================== 选择状态管理 ====================

    /**
     * 更新多选状态（局部更新 + DOM 缓存优化）
     * @param {Array} newSelectedIds - 新选中的文档ID列表
     * @param {Array} oldSelectedIds - 旧选中的文档ID列表
     */
    updateSelectionState(newSelectedIds = [], oldSelectedIds = []) {
        if (newSelectedIds.length === 0 && oldSelectedIds.length === 0) return;

        const newSet = new Set(newSelectedIds);
        const oldSet = new Set(oldSelectedIds);

        // 批量更新DOM（使用缓存）
        requestAnimationFrame(() => {
            for (const docId of oldSet) {
                if (!newSet.has(docId)) {
                    this.#getDocEl(docId)?.classList.remove('active');
                }
            }
            for (const docId of newSet) {
                if (!oldSet.has(docId)) {
                    this.#getDocEl(docId)?.classList.add('active');
                }
            }
        });
    }

    // ==================== 文件夹展开/折叠 ====================

    /**
     * 管理文件夹展开状态
     * @param {string} folderId - 文件夹 ID
     * @param {boolean|string} [expanded='toggle'] - 展开状态：true=展开, false=折叠, 'toggle'=切换
     */
    manageFolderState(folderId, expanded = 'toggle') {
        const finalExpanded =
            expanded === 'toggle' ? !this.expandedFolders.has(folderId) : expanded;
        const currentlyExpanded = this.expandedFolders.has(folderId);

        if (finalExpanded === currentlyExpanded) return;

        if (finalExpanded) {
            this.expandedFolders.add(folderId);
        } else {
            this.expandedFolders.delete(folderId);
        }

        const item = this.#getDocEl(folderId);
        if (!item) return;

        const toggle = dom.getIn(item, '.md-tree-toggle');
        const icon = dom.getIn(item, '.md-doc-item-icon i');
        const nodeContainer = item.closest('.md-tree-node');
        const childrenContainer = nodeContainer
            ? dom.getIn(nodeContainer, '.md-tree-children')
            : null;

        if (toggle) toggle.classList.toggle('expanded', finalExpanded);
        if (icon) {
            icon.classList.toggle('codicon-folder', !finalExpanded);
            icon.classList.toggle('codicon-folder-opened', finalExpanded);
        }
        if (childrenContainer) childrenContainer.classList.toggle('collapsed', !finalExpanded);
    }

    // ==================== 文档树事件处理 ====================

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
            const { imagePath } = deleteBtn.dataset;
            if (imagePath) {
                this.deleteImageNode(imagePath);
                return;
            }
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
            const { docId, docType: _docType } = item.dataset;

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
            this.editDocumentName(item.dataset.docId, false);
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

        const { docId } = item.dataset;
        const selectedDocIds = this.state.get('selectedDocIds') || [];

        this.draggedItems = selectedDocIds.includes(docId) ? [...selectedDocIds] : [docId];
        this.draggedSet = new Set(this.draggedItems);

        this.draggedItems.forEach(id => {
            this.#getDocEl(id)?.classList.add('md-dragging');
        });

        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.draggedItems.join(','));
        document.body.classList.add('is-dragging-tree');
    }

    /**
     * 处理拖拽经过（节流优化：50ms）
     * @param {DragEvent} e - 拖拽经过事件
     * @returns {void}
     */
    handleDragOver(e) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        const now = performance.now();
        if (now - this.lastDragOverTime < 50) return;
        this.lastDragOverTime = now;

        const treeContainer = dom.getById('md-doc-tree')?.element;
        if (
            !treeContainer ||
            e.target.closest('.md-doc-toolbar') ||
            e.target.closest('.md-empty-state')
        ) {
            this.#clearDropTarget();
            return;
        }

        const targetItem = e.target.closest('.md-doc-item');

        if (!targetItem) {
            this.#setDropTarget(treeContainer, 'root');
            return;
        }

        if (this.draggedSet?.has(targetItem.dataset.docId)) {
            this.#clearDropTarget();
            return;
        }

        const targetNode = targetItem.closest('.md-tree-node');
        if (!targetNode) {
            this.#clearDropTarget();
            return;
        }

        if (targetItem.dataset.docType === 'folder') {
            if (this.expandedFolders.has(targetItem.dataset.docId)) {
                this.#setDropTarget(targetNode, 'expanded');
            } else {
                this.#setDropTarget(targetItem, 'item');
            }
            return;
        }

        // 检查是否在展开的文件夹内，同时排除正在被拖拽的文件夹
        let current = targetNode.parentElement;
        while (current && current !== treeContainer) {
            if (
                current.classList.contains('md-tree-children') &&
                !current.classList.contains('collapsed')
            ) {
                const folderNode = current.parentElement;
                if (folderNode?.classList.contains('md-tree-node')) {
                    const folderItem = dom.getIn(folderNode, '.md-doc-item');
                    if (folderItem?.dataset.docType === 'folder') {
                        // 若该文件夹本身正在被拖拽，不作为有效落点
                        if (this.draggedSet?.has(folderItem.dataset.docId)) {
                            this.#clearDropTarget();
                            return;
                        }
                        this.#setDropTarget(folderNode, 'expanded');
                        return;
                    }
                }
            }
            current = current.parentElement;
        }

        const isRootLevel = targetNode.parentElement === treeContainer;
        this.#setDropTarget(isRootLevel ? treeContainer : null, 'root');
    }

    /**
     * 设置拖拽目标高亮
     * @private
     */
    #setDropTarget(element, type) {
        if (this.dragTarget === element && element !== null) return;

        this.#clearDropTarget();

        if (!element) return;

        this.dragTarget = element;
        this.dragTargetType = type;

        const classMap = {
            expanded: 'md-drop-target-expanded',
            root: 'md-drop-target-root',
            item: 'md-drop-target'
        };
        element.classList.add(classMap[type]);
    }

    /**
     * 清除拖拽目标高亮
     * @private
     */
    #clearDropTarget() {
        if (this.dragTarget) {
            this.dragTarget.classList.remove(
                'md-drop-target',
                'md-drop-target-expanded',
                'md-drop-target-root'
            );
            this.dragTarget = null;
            this.dragTargetType = null;
        }
    }

    /**
     * 处理放置
     * @param {DragEvent} e - 放置事件
     * @returns {void}
     */
    handleDrop(e) {
        e.preventDefault();

        if (!this.draggedItems?.length || !this.dragTarget) return;

        let targetId;
        if (this.dragTargetType === 'root') {
            targetId = null;
        } else if (this.dragTargetType === 'expanded') {
            targetId = dom.getIn(this.dragTarget, '.md-doc-item')?.dataset.docId;
        } else {
            targetId = this.dragTarget.dataset.docId;
        }

        if (this.dragTargetType !== 'root' && !targetId) {
            this.#clearDropTarget();
            return;
        }

        const documents = this.state.get('documents');
        const docMap = new Map(documents.map(d => [d.id, d]));
        // 复用 handleDragStart 已建好的 Set，无需重复构建
        const draggedSet = this.draggedSet ?? new Set(this.draggedItems);

        // 只移动顶层条目：跳过祖先链中已包含在拖拽集合内的项，
        // 以便子项随父项自动迁移，保留原有目录层次结构。
        const isAncestorDragged = docId => {
            let current = docMap.get(docMap.get(docId)?.parentId);
            while (current) {
                if (draggedSet.has(current.id)) return true;
                current = docMap.get(current.parentId);
            }
            return false;
        };

        let anyMoved = false;
        for (const draggedId of this.draggedItems) {
            if (draggedId === targetId) continue;

            // 跳过其祖先已在拖拽集合中的项（它们会随父节点一起迁移）
            if (isAncestorDragged(draggedId)) continue;

            // 防止将文件夹拖到自己的子文件夹中
            if (targetId) {
                let current = docMap.get(targetId);
                let isDescendant = false;
                while (current?.parentId) {
                    if (current.parentId === draggedId) {
                        isDescendant = true;
                        break;
                    }
                    current = docMap.get(current.parentId);
                }
                if (isDescendant) continue;
            }

            if (this.state.moveDocument(draggedId, targetId)) {
                anyMoved = true;
            }
        }

        if (anyMoved && targetId) {
            this.manageFolderState(targetId, true);
        }

        this.#clearDropTarget();
    }

    /**
     * 处理拖拽结束
     * @returns {void}
     */
    handleDragEnd() {
        if (this.draggedItems) {
            this.draggedItems.forEach(id => {
                this.#getDocEl(id)?.classList.remove('md-dragging');
            });
        }

        this.#clearDropTarget();
        document.body.classList.remove('is-dragging-tree');
        this.draggedItems = null;
        this.draggedSet = null;
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

        if (doc.type === EditorState.RESOURCE_TYPES.IMAGE) {
            this.state.selectResource(docId);
            return;
        }

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

        // 使用迭代方式计算子项数量（一次性构建 parentId→children Map，避免重复扫描）
        const countChildren = rootId => {
            const allDocs = this.state.get('documents');
            const childrenMap = new Map();
            for (const d of allDocs) {
                const pid = d.parentId ?? null;
                if (!childrenMap.has(pid)) childrenMap.set(pid, []);
                childrenMap.get(pid).push(d);
            }

            let count = 0;
            const stack = [rootId];
            while (stack.length > 0) {
                const currentId = stack.pop();
                const children = childrenMap.get(currentId) ?? [];
                count += children.length;
                for (const child of children) {
                    if (child.type === 'folder') stack.push(child.id);
                }
            }
            return count;
        };

        const childrenCount = doc.type === 'folder' ? countChildren(docId) : 0;
        const itemType =
            doc.type === EditorState.RESOURCE_TYPES.FOLDER
                ? '文件夹'
                : doc.type === EditorState.RESOURCE_TYPES.IMAGE
                    ? '图片'
                    : '文档';
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
        if (this.#pendingEdit && this.editingDocId) {
            const treeContainer = dom.getById('md-doc-tree')?.element;
            if (treeContainer) {
                const editingItem = dom.getIn(
                    treeContainer,
                    `[data-doc-id="${this.editingDocId}"]`
                );
                if (editingItem?.classList.contains('editing')) {
                    const input = dom.getIn(editingItem, '.md-doc-item-input');
                    input?.blur();
                }
            }
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

        this.state.clearDocuments({ selection: true });
        this.#pendingEdit = { docId: doc.id, isNewItem: true };
        this.state.addDocument(doc, parentId, { silent: true });

        // 对于文件类型，立即切换到新文档（编辑器立刻显示新内容）
        if (type === 'file') {
            this.state.setCurrentDocument(doc.id);
        }

        // 完全重渲染（renderTree 内部会自动展开祖先文件夹）
        this.renderTree();
    }

    /**
     * 编辑文档名称
     * @param {string} docId - 文档 ID
     * @param {boolean} isNewItem - 是否为新建的项目（新建时默认保存，重命名时默认取消）
     */
    editDocumentName(docId, isNewItem = false) {
        this.editingDocId = docId;

        const treeContainer = dom.getById('md-doc-tree')?.element;
        if (!treeContainer) {
            this.editingDocId = null;
            return;
        }

        const item = dom.getIn(treeContainer, `[data-doc-id="${docId}"]`);
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

        let docIdsToDelete;
        let message;
        let title;

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
        // deleteDocuments 内部负责清理 currentDocId，无需在此重复检查
        this.state.deleteDocuments(docIdsToDelete, { silent: true });

        // 清空选中状态
        this.state.clearDocuments({ selection: true });

        // 清空展开状态（如果是清空所有文件）
        if (selectedDocIds.length === 0) {
            this.expandedFolders.clear();
        }

        // 重新渲染
        this.renderTree();

        this.showMessage(
            selectedDocIds.length > 0 ? `已删除 ${docIdsToDelete.length} 个文件` : '已清空所有文件',
            'success'
        );
    }

    async deleteImageNode(imagePath) {
        const confirmed = await Dialog.confirm('确定要删除这张图片吗？\n\n它会从所有引用它的文档中移除。', {
            title: '删除图片',
            type: 'danger',
            confirmText: '删除',
            cancelText: '取消'
        });
        if (!confirmed) return;

        this.state.deleteImageAsset(imagePath);
        this.renderTree();
        this.showMessage('图片已删除', 'success');
    }

    // ==================== 渲染相关 ====================

    /**
     * 渲染组件
     * @returns {void}
     */
    render() {
        // 渲染侧边栏状态
        const interfaceState = this.state.get('interface');
        const isOpen = interfaceState.leftSidebarOpen;
        this.updateVisibility(isOpen);

        // 渲染文档树
        this.renderTree();
        this.updateWorkspaceSyncUI(this.state.get('workspace') || {});
    }

    toggleWorkspaceMenu() {
        if (this.isWorkspaceMenuOpen) {
            this.closeWorkspaceMenu();
            return;
        }

        const menu = dom.getById('md-workspace-sync-menu')?.element;
        const button = dom.getById('md-workspace-sync-btn')?.element;
        if (!menu || !button) return;

        this.isWorkspaceMenuOpen = true;
        menu.hidden = false;
        button.setAttribute('aria-expanded', 'true');
    }

    closeWorkspaceMenu() {
        const menu = dom.getById('md-workspace-sync-menu')?.element;
        const button = dom.getById('md-workspace-sync-btn')?.element;
        if (!menu || !button) return;

        this.isWorkspaceMenuOpen = false;
        menu.hidden = true;
        button.setAttribute('aria-expanded', 'false');
    }

    getWorkspaceProviderLabel(provider) {
        if (provider === 'github') return 'GitHub';
        if (provider === 'gitee') return 'Gitee';
        return '本地浏览器';
    }

    getWorkspaceSyncStatusLabel(provider, workspace = this.state.get('workspace') || {}) {
        const remote = getWorkspaceRemote(workspace, provider);
        if (!remote?.connected) {
            return '未连接';
        }

        const statusMap = {
            idle: '已连接，等待同步',
            authorizing: '正在授权',
            connected: '已连接，等待同步',
            syncing: '同步中',
            synced: remote.lastSyncedAt ? '已同步到最新备份' : '已连接，等待同步',
            error: remote.lastSyncError || '同步失败'
        };

        return statusMap[remote.lastSyncStatus] || '已连接';
    }

    getWorkspaceProviderIconMarkup(provider) {
        if (provider === 'github') {
            return `
                <svg class="md-platform-logo md-platform-logo-github" viewBox="0 0 16 16" aria-hidden="true">
                    <path
                        fill="currentColor"
                        d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.5-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8Z"
                    />
                </svg>
            `;
        }

        if (provider === 'gitee') {
            return `
                <svg class="md-platform-logo md-platform-logo-gitee" viewBox="120 13 72 72" aria-hidden="true">
                    <path
                        fill="#c71d23"
                        d="m156 85c-19.882251 0-36-16.117749-36-36s16.117749-36 36-36 36 16.117749 36 36-16.117749 36-36 36zm18.222232-39.9993426-20.444332.0004656c-.981652 0-1.777511.7956502-1.777768 1.7773025l-.002109 4.4442415c-.000258.9818341.795468 1.7779763 1.777302 1.7782335h.00048l12.446471-.0005988c.981834-.0000082 1.777775.795919 1.777783 1.7777532v.0000148l-.000015.4443924v.4444466c0 2.9455024-2.387801 5.3333039-5.333304 5.3333039l-16.890119-.000049c-.981693 0-1.77752-.7958052-1.777547-1.7774984l-.000662-16.8884814c-.000081-2.9455025 2.387655-5.3333698 5.333157-5.333451h.000147l24.885554-.0009559c.981404 0 1.777159-.795262 1.777768-1.7766654l.004962-4.4442409c.000609-.981834-.794831-1.7782613-1.776665-1.7788703-.000368-.0000002-.000735-.0000003-.001103-.0000003l-24.888752.0011758c-7.363727 0-13.333219 5.9694589-13.333259 13.3331863l-.000221 24.8878699c-.000005.9818342.795924 1.7777724 1.777758 1.7777778l26.222571-.0000098c6.627235 0 11.999671-5.3724358 11.999671-11.9996713v-10.2219033c0-.9818341-.795934-1.777768-1.777768-1.777768z"
                    />
                </svg>
            `;
        }

        return '<i class="codicon codicon-cloud" aria-hidden="true"></i>';
    }

    getWorkspaceSettingsTargetProvider() {
        const workspace = this.state.get('workspace') || {};
        const connectedProviders = getConnectedWorkspaceProviders(workspace);
        return connectedProviders[0] || 'github';
    }

    handleWorkspaceSettingsAction(provider) {
        this.closeWorkspaceMenu();
        this.openWorkspaceSettings(provider || this.getWorkspaceSettingsTargetProvider());
    }

    async handleWorkspaceSyncAction(provider) {
        this.closeWorkspaceMenu();

        if (!this.workspaceManager) {
            this.showMessage('工作空间管理器未初始化', 'error');
            return;
        }

        try {
            await this.workspaceManager.syncNow(provider || null);
            this.showMessage(
                provider
                    ? `${this.getWorkspaceProviderLabel(provider)} 已完成同步`
                    : '已完成远端备份同步',
                'success'
            );
        } catch (error) {
            this.showMessage(error.message || '同步失败', 'error');
        }
    }

    openWorkspaceSettings(provider) {
        const settingsButton = dom.getById('md-settings-btn')?.element;
        if (!settingsButton) return;

        settingsButton.click();

        requestAnimationFrame(() => {
            const workspaceNav = document.querySelector('.md-settings-nav-item[data-section="workspace"]');
            workspaceNav?.click();

            const providerGroup = provider
                ? document.getElementById(`settings-workspace-platform-${provider}`)
                : null;
            if (providerGroup) {
                providerGroup.scrollIntoView({ block: 'start', behavior: 'smooth' });
                providerGroup.querySelector('button, input')?.focus({ preventScroll: true });
            }
        });
    }

    updateWorkspaceSyncUI(workspace = {}, oldWorkspace = null) {
        const button = dom.getById('md-workspace-sync-btn')?.element;
        const menu = dom.getById('md-workspace-sync-menu')?.element;
        const menuList = dom.getById('md-workspace-sync-menu-list')?.element;
        const syncNowBtn = dom.getById('md-workspace-sync-now')?.element;
        const settingsBtn = dom.getById('md-workspace-sync-settings')?.element;
        if (!button || !menu || !menuList) return;
        const connectedProviders = getConnectedWorkspaceProviders(workspace);
        const resolveVisualStatus = targetWorkspace => {
            const remoteStatuses = getConnectedWorkspaceProviders(targetWorkspace || {})
                .map(provider => getWorkspaceRemote(targetWorkspace, provider)?.lastSyncStatus)
                .filter(Boolean);

            if (remoteStatuses.includes('syncing') || remoteStatuses.includes('authorizing')) {
                return 'syncing';
            }
            if (remoteStatuses.includes('error')) {
                return 'error';
            }
            if (remoteStatuses.includes('synced')) {
                return 'synced';
            }
            if (remoteStatuses.includes('connected')) {
                return 'connected';
            }

            return 'idle';
        };
        const selectedStatus = resolveVisualStatus(workspace);

        if (
            oldWorkspace &&
            selectedStatus === 'synced' &&
            resolveVisualStatus(oldWorkspace) !== 'synced'
        ) {
            this.workspaceSyncVisualState = 'success';
            clearTimeout(this.#syncSuccessTimer);
            this.#syncSuccessTimer = setTimeout(() => {
                this.workspaceSyncVisualState = 'idle';
                this.updateWorkspaceSyncUI(this.state.get('workspace') || {});
            }, 1600);
        } else if (selectedStatus === 'syncing') {
            clearTimeout(this.#syncSuccessTimer);
            this.workspaceSyncVisualState = 'syncing';
        } else if (selectedStatus === 'error') {
            clearTimeout(this.#syncSuccessTimer);
            this.workspaceSyncVisualState = 'error';
            this.#syncSuccessTimer = setTimeout(() => {
                this.workspaceSyncVisualState = 'idle';
                this.updateWorkspaceSyncUI(this.state.get('workspace') || {});
            }, 1800);
        } else if (this.workspaceSyncVisualState !== 'success') {
            this.workspaceSyncVisualState = 'idle';
        }

        button.classList.toggle('is-syncing', this.workspaceSyncVisualState === 'syncing');
        button.classList.toggle('is-synced', this.workspaceSyncVisualState === 'success');
        button.classList.toggle('is-sync-error', this.workspaceSyncVisualState === 'error');

        const icon = button.querySelector('.codicon');
        if (icon) {
            const iconClassMap = {
                syncing: 'codicon codicon-sync',
                success: 'codicon codicon-check',
                error: 'codicon codicon-error',
                idle: 'codicon codicon-cloud'
            };
            icon.className = iconClassMap[this.workspaceSyncVisualState] || iconClassMap.idle;
        }

        if (settingsBtn) {
            settingsBtn.dataset.action = 'settings';
            settingsBtn.dataset.provider = this.getWorkspaceSettingsTargetProvider();
        }

        if (syncNowBtn) {
            syncNowBtn.dataset.action = 'sync';
            delete syncNowBtn.dataset.provider;
            syncNowBtn.disabled = connectedProviders.length === 0;
        }

        if (connectedProviders.length === 0) {
            menuList.innerHTML = `
                <div class="md-workspace-sync-menu-empty">
                    暂无已连接的远端备份，点击右上角设置可登录 GitHub 或 Gitee。
                </div>
            `;
            return;
        }

        menuList.innerHTML = connectedProviders
            .map(provider => {
                const remote = getWorkspaceRemote(workspace, provider);
                const providerLabel = this.getWorkspaceProviderLabel(provider);
                const statusText = this.getWorkspaceSyncStatusLabel(provider, workspace);
                const accountText = remote?.accountName ? `账号：${remote.accountName}` : '已连接';

                return `
                    <div class="md-workspace-sync-menu-item" data-provider="${provider}" role="menuitem" tabindex="0">
                        <span class="md-workspace-sync-menu-leading">
                            ${this.getWorkspaceProviderIconMarkup(provider)}
                        </span>
                        <span class="md-workspace-sync-menu-copy">
                            <span class="md-workspace-sync-menu-title">${providerLabel}</span>
                            <span class="md-workspace-sync-menu-meta">${statusText}</span>
                            <span class="md-workspace-sync-menu-meta">${accountText}</span>
                        </span>
                        <span class="md-workspace-sync-menu-actions">
                            <button
                                class="md-btn md-btn-icon md-btn-ghost md-workspace-sync-menu-action"
                                type="button"
                                data-action="settings"
                                data-provider="${provider}"
                                title="打开 ${providerLabel} 设置"
                                aria-label="打开 ${providerLabel} 设置"
                            >
                                <i class="codicon codicon-settings-gear" aria-hidden="true"></i>
                            </button>
                            <button
                                class="md-btn md-btn-icon md-btn-ghost md-workspace-sync-menu-action"
                                type="button"
                                data-action="sync"
                                data-provider="${provider}"
                                title="立即同步 ${providerLabel}"
                                aria-label="立即同步 ${providerLabel}"
                            >
                                <i class="codicon codicon-sync" aria-hidden="true"></i>
                            </button>
                        </span>
                    </div>
                `;
            })
            .join('');
    }

    /**
     * 渲染文档树
     * @returns {void}
     */
    renderTree() {
        const treeContainer = dom.getById('md-doc-tree')?.element;
        if (!treeContainer) return;

        const documents = this.state.get('documents');
        const currentDocId = this.state.get('currentDocId');
        const selectedDocIds = this.state.get('selectedDocIds') || [];

        if (documents.length === 0) {
            this.#domCache.clear();
            treeContainer.innerHTML = `
                <div class="md-empty-state">
                    <i class="codicon codicon-folder"></i>
                    <p>暂无文档</p>
                </div>
            `;

            const emptyState = treeContainer.querySelector('.md-empty-state');
            emptyState?.addEventListener('click', e => {
                const { action } = e.target.dataset;
                if (action === 'create-file') this.createDocument('file');
                else if (action === 'create-folder') this.createDocument('folder');
            });
            return;
        }

        // 在构建 DOM 之前，将当前文档和选中文档的祖先文件夹合并到 expandedFolders，
        // 避免先渲染折叠状态、再展开时产生闪烁。
        const docMap = new Map(documents.map(d => [d.id, d]));
        const addAncestors = docId => {
            if (!docId) return;
            let currentId = docId;
            while (currentId) {
                const d = docMap.get(currentId);
                if (!d) break;
                if (d.type === 'folder') this.expandedFolders.add(currentId);
                currentId = d.parentId;
            }
        };
        if (currentDocId) addAncestors(currentDocId);
        selectedDocIds.forEach(addAncestors);
        // 若有待命的重命名项（新建文件/文件夹），也提前展开其父文件夹
        if (this.#pendingEdit) addAncestors(this.#pendingEdit.docId);

        const tree = this.state.getDocumentTree();
        const fragment = this.createFragment();
        // 提前构建 Set，避免 renderTreeNode 内部 O(n) 的 includes() 扫描
        const selectedDocIdSet = new Set(selectedDocIds);

        tree.forEach(node => {
            fragment.appendChild(this.renderTreeNode(node, currentDocId, 0, selectedDocIdSet));
        });

        treeContainer.innerHTML = '';
        treeContainer.appendChild(fragment);

        // 重建 DOM 缓存
        this.#rebuildDomCache();

        if (this.#pendingEdit) {
            const pendingEdit = this.#pendingEdit;
            this.#pendingEdit = null;
            requestAnimationFrame(() => {
                this.editDocumentName(pendingEdit.docId, pendingEdit.isNewItem);
            });
        }
    }

    /**
     * 递归渲染树节点
     * @param {Object} node - 节点数据
     * @param {string|null} currentDocId - 当前文档 ID
     * @param {number} level - 深度层级
     * @param {Set<string>} selectedDocIds - 选中的文档ID集合
     * @returns {Element} 渲染的节点容器
     */
    renderTreeNode(node, currentDocId, level, selectedDocIds = new Set()) {
        const isEditing = node.id === this.editingDocId;
        const isActive = node.id === currentDocId || selectedDocIds.has(node.id);
        const isFolder = node.type === EditorState.RESOURCE_TYPES.FOLDER;
        const isExpanded = isFolder && this.expandedFolders.has(node.id);
        const hasChildren = isFolder && node.children?.length > 0;

        const nodeContainer = this.createElement('div', {
            className: 'md-tree-node',
            dataset: { level }
        });

        const itemClasses = ['md-doc-item'];
        if (isActive) itemClasses.push('active');
        if (isEditing) itemClasses.push('editing');

        const item = this.createElement('div', {
            className: itemClasses.join(' '),
            dataset: { docId: node.id, docType: node.type || 'file' },
            attributes: { draggable: 'true' }
        });

        this.createElement('span', {
            className: 'md-tree-indent',
            style: { width: `${level * 16}px` },
            parent: item
        });

        if (isFolder) {
            const toggle = this.createElement('span', {
                className: isExpanded ? 'md-tree-toggle expanded' : 'md-tree-toggle',
                dataset: { folderId: node.id },
                parent: item
            });
            this.createElement('i', { className: 'codicon codicon-chevron-right', parent: toggle });
        } else {
            this.createElement('span', { className: 'md-tree-spacer', parent: item });
        }

        const iconSpan = this.createElement('span', {
            className: 'md-doc-item-icon',
            parent: item
        });
        const iconClass = isFolder
            ? isExpanded
                ? 'codicon-folder-opened'
                : 'codicon-folder'
            : node.type === EditorState.RESOURCE_TYPES.IMAGE
                ? 'codicon-file-media'
                : 'codicon-file';
        this.createElement('i', { className: `codicon ${iconClass}`, parent: iconSpan });

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

        if (node.type === EditorState.RESOURCE_TYPES.FOLDER && node.folderKind !== 'images') {
            ['new-file', 'new-folder'].forEach(type => {
                const btn = this.createElement('button', {
                    className: `md-btn md-btn-icon md-btn-xs md-${type}-btn`,
                    attributes: {
                        title: type === 'new-file' ? '在此新建文档' : '在此新建文件夹',
                        'data-folder-id': node.id
                    },
                    parent: actions
                });
                this.createElement('i', { className: `codicon codicon-${type}`, parent: btn });
            });
        }

        const deleteBtn = this.createElement('button', {
            className: 'md-btn md-btn-icon md-btn-xs md-doc-item-delete',
            attributes: {
                title: node.type === EditorState.RESOURCE_TYPES.IMAGE ? '删除图片' : '删除',
                'data-doc-id': node.id,
                ...(node.type === EditorState.RESOURCE_TYPES.IMAGE ? { 'data-image-path': node.imagePath } : {})
            },
            parent: actions
        });
        this.createElement('i', { className: 'codicon codicon-trash', parent: deleteBtn });

        nodeContainer.appendChild(item);

        if (isFolder && hasChildren) {
            const childrenContainer = this.createElement('div', {
                className: isExpanded ? 'md-tree-children' : 'md-tree-children collapsed'
            });

            node.children.forEach(child => {
                childrenContainer.appendChild(
                    this.renderTreeNode(child, currentDocId, level + 1, selectedDocIds)
                ); // Set 直接向下传递
            });

            nodeContainer.appendChild(childrenContainer);
        }

        return nodeContainer;
    }


    // ==================== 文档导入导出 ====================

    /**
     * 导出所有文档
     */
    exportDocuments() {
        const documents = this.state.get('documents');
        if (!documents?.length) {
            this.showMessage('没有可导出的文档', 'warning');
            return;
        }

        (async () => {
            const imageAssets = await Promise.all(
                documents
                    .filter(doc => doc.type === EditorState.RESOURCE_TYPES.IMAGE && doc.imagePath)
                    .map(async doc => ({
                        path: doc.imagePath,
                        dataUrl: await getImageAsBase64(doc.imagePath),
                        updatedAt: doc.updatedAt
                    }))
            );

            const snapshot = buildWorkspaceSnapshot(
                documents,
                this.state.get('currentDocId'),
                this.state.get('workspaceTombstones', true) || [],
                imageAssets.filter(asset => asset.dataUrl)
            );
            const blob = new Blob(
                [
                    JSON.stringify(
                        {
                            version: '1.0',
                            exportDate: new Date().toISOString(),
                            ...snapshot
                        },
                        null,
                        2
                    )
                ],
                { type: 'application/json' }
            );

            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `markdown-docs-${new Date().toLocaleDateString()}.json`;
            a.style.display = 'none';
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            setTimeout(() => URL.revokeObjectURL(a.href), 100);

            this.showMessage(`成功导出 ${documents.length} 个文档`, 'success');
        })().catch(() => {
            this.showMessage('导出文档失败', 'error');
        });
    }

    /**
     * 导入文档
     */
    importDocuments() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';

        input.onchange = async e => {
            const file = e.target.files?.[0];
            if (!file) return;

            if (file.size > 50 * 1024 * 1024) {
                this.showMessage('文件过大（超过 50MB），无法导入', 'error');
                input.remove();
                return;
            }

            try {
                const text = await file.text();
                const snapshot = parseWorkspaceSnapshot(text);
                if (snapshot.documents.length === 0) throw new Error('文件格式无效');
                if (snapshot.documents.length > 10000) throw new Error('文档数量过多');

                const importMode = await Dialog.show({
                    title: '导入文档',
                    message: `检测到 <strong>${snapshot.documents.length}</strong> 个文档，请选择导入方式：`,
                    type: 'info',
                    buttons: [
                        { text: '合并', value: 'merge', type: 'primary' },
                        { text: '替换', value: 'replace', type: 'danger' }
                    ],
                    closeOnOverlay: true,
                    closeOnEscape: true
                });

                if (!importMode) {
                    this.showMessage('导入已取消', 'info');
                    input.remove();
                    return;
                }

                await Promise.allSettled(
                    (snapshot.assets || []).map(asset => saveImageFromDataUrl(asset.path, asset.dataUrl))
                );

                if (importMode === 'replace') {
                    this.state.applyWorkspaceSnapshot(snapshot);
                } else {
                    this.state.importDocuments(snapshot.documents, 'merge', true);
                }
                this.showMessage(
                    `成功${importMode === 'replace' ? '替换' : '合并'}导入 ${snapshot.documents.length} 个文档`,
                    'success'
                );
            } catch (error) {
                this.showMessage(`导入失败：${error.message}`, 'error');
            } finally {
                input.remove();
            }
        };

        input.click();
    }

    // ==================== 资源清理 ====================

    destroy() {
        clearTimeout(this.clickTimeout);
        clearTimeout(this.#syncSuccessTimer);
        this.#clearDropTarget();
        this.draggedItems = null;
        this.draggedSet = null;
        this.closeWorkspaceMenu();
        this.#domCache.clear();
        document.body.classList.remove('is-dragging-tree');
        super.destroy?.();
    }
}
