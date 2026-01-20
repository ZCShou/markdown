/**
 * 文档列表组件 - 树型结构
 * 负责文档列表的渲染和交互，支持文件夹嵌套
 */
import { BaseComponent } from './BaseComponent.js';
import { StoreManager } from '../modules/store.js';
import { dom } from '../utils/dom.js';

export class DocumentList extends BaseComponent {
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
        // 订阅文档列表变化
        this.unsubscribe = this.state.subscribeTo(['documents', 'currentDocId'], (newValue, oldValue, key) => {
            // 如果只是 currentDocId 变化，使用局部更新而不是完全重新渲染
            if (key === 'currentDocId') {
                this.updateActiveState(newValue, oldValue);
            } else {
                // documents 变化时，完全重新渲染
                this.render();
            }
        });
    }

    /**
     * 更新激活状态（局部更新，避免闪烁）
     */
    updateActiveState(newDocId, oldDocId) {
        if (!this.container) return;

        // 移除旧的激活状态
        if (oldDocId) {
            const oldItem = this.container.querySelector(`[data-doc-id="${oldDocId}"]`);
            if (oldItem) {
                oldItem.classList.remove('active');
            }
        }

        // 添加新的激活状态
        if (newDocId) {
            const newItem = this.container.querySelector(`[data-doc-id="${newDocId}"]`);
            if (newItem) {
                newItem.classList.add('active');
            }
        }
    }



    /**
     * 检查文件夹是否展开
     * @param {string} folderId - 文件夹ID
     * @returns {boolean} 是否展开
     */
    isFolderExpanded(folderId) {
        return this.expandedFolders.has(folderId);
    }

    /**
     * 设置文件夹展开状态
     * @param {string} folderId - 文件夹ID
     * @param {boolean} expanded - 是否展开
     */
    setFolderExpanded(folderId, expanded) {
        const currentlyExpanded = this.expandedFolders.has(folderId);
        if (expanded && !currentlyExpanded) {
            this.expandedFolders.add(folderId);
            this.updateFolderUI(folderId, true);
        } else if (!expanded && currentlyExpanded) {
            this.expandedFolders.delete(folderId);
            this.updateFolderUI(folderId, false);
        }
        // 如果状态未改变，不做任何操作
    }

    /**
     * 切换文件夹展开状态（兼容旧调用）
     * @param {string} folderId - 文件夹ID
     */
    toggleFolder(folderId) {
        const expanded = !this.expandedFolders.has(folderId);
        this.setFolderExpanded(folderId, expanded);
    }

    /**
     * 展开文件夹（兼容旧调用）
     * @param {string} folderId - 文件夹ID
     */
    expandFolder(folderId) {
        this.setFolderExpanded(folderId, true);
    }

    /**
     * 折叠文件夹（兼容旧调用）
     * @param {string} folderId - 文件夹ID
     */
    collapseFolder(folderId) {
        this.setFolderExpanded(folderId, false);
    }

    /**
     * 展开所有文件夹
     */
    expandAllFolders() {
        const folderIds = this.state.get('documents')
            .filter(doc => doc.type === 'folder')
            .map(doc => doc.id);
        this.expandedFolders = new Set(folderIds);
        this.render(); // 需要完全重新渲染
    }

    /**
     * 折叠所有文件夹
     */
    collapseAllFolders() {
        this.expandedFolders.clear();
        this.render(); // 需要完全重新渲染
    }

    /**
     * 更新文件夹UI状态
     * @param {string} folderId - 文件夹ID
     * @param {boolean} expanded - 是否展开
     */
    updateFolderUI(folderId, expanded) {
        if (!this.container) return;
        
        const item = this.container.querySelector(`[data-doc-id="${folderId}"]`);
        if (!item) return;

        // 更新箭头状态
        const toggle = item.querySelector('.md-tree-toggle');
        if (toggle) {
            toggle.classList.toggle('expanded', expanded);
        }

        // 更新图标
        const icon = item.querySelector('.md-doc-item-icon');
        if (icon) {
            icon.textContent = expanded ? '📂' : '📁';
        }

        // 显示/隐藏子节点
        const nodeContainer = item.closest('.md-tree-node');
        if (nodeContainer) {
            const childrenContainer = nodeContainer.querySelector('.md-tree-children');
            if (childrenContainer) {
                childrenContainer.style.display = expanded ? 'flex' : 'none';
            }
        }
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
        // 展开/折叠箭头
        const toggle = e.target.closest('.md-tree-toggle');
        if (toggle) {
            e.stopPropagation();
            const folderId = toggle.dataset.folderId;
            this.toggleFolder(folderId);
            return;
        }

        // 删除按钮
        const deleteBtn = e.target.closest('.md-doc-item-delete');
        if (deleteBtn) {
            e.stopPropagation();
            this.handleDelete(deleteBtn.dataset.docId);
            return;
        }

        // 新建按钮
        const newFileBtn = e.target.closest('.md-new-file-btn');
        if (newFileBtn) {
            e.stopPropagation();
            const folderId = newFileBtn.dataset.folderId || null;
            this.createItem('file', folderId);
            return;
        }

        const newFolderBtn = e.target.closest('.md-new-folder-btn');
        if (newFolderBtn) {
            e.stopPropagation();
            const folderId = newFolderBtn.dataset.folderId || null;
            this.createItem('folder', folderId);
            return;
        }

        // 文档项
        const item = e.target.closest('.md-doc-item');
        if (item && !this.editingDocId) {
            const docId = item.dataset.docId;
            const docType = item.dataset.docType;

            // 清除之前的延迟
            if (this.clickTimeout) {
                clearTimeout(this.clickTimeout);
                this.clickTimeout = null;
            }

            // 延迟执行单击操作，等待双击
            this.clickTimeout = setTimeout(() => {
                if (docType === 'folder') {
                    // 点击文件夹：只展开/折叠，不选中
                    this.toggleFolder(docId);
                } else {
                    // 点击文件：打开
                    this.handleOpen(docId);
                }
                this.clickTimeout = null;
            }, 200); // 200ms 延迟，足够检测双击
        }
    }

    /**
     * 处理双击事件（重命名）
     */
    handleDoubleClick(e) {
        // 取消单击的延迟执行
        if (this.clickTimeout) {
            clearTimeout(this.clickTimeout);
            this.clickTimeout = null;
        }

        const item = e.target.closest('.md-doc-item');
        if (item && !this.editingDocId) {
            const docId = item.dataset.docId;
            this.editItemName(docId);
        }
    }

    /**
     * 处理拖拽开始
     */
    handleDragStart(e) {
        const item = e.target.closest('.md-doc-item');
        if (!item) return;

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

        // 移除所有高亮
        this.container.querySelectorAll('.md-drop-target').forEach(el => {
            el.classList.remove('md-drop-target');
        });

        // 添加高亮
        const docType = item.dataset.docType;
        if (docType === 'folder') {
            item.classList.add('md-drop-target');
        }
    }

    /**
     * 处理放置
     */
    handleDrop(e) {
        e.preventDefault();
        const item = e.target.closest('.md-doc-item');
        if (!item || !this.draggedItem) return;

        const targetId = item.dataset.docId;
        const targetType = item.dataset.docType;

        // 只能拖拽到文件夹
        if (targetType !== 'folder') return;

        // 不能拖拽到自己或自己的子文件夹中
        if (targetId === this.draggedItem) return;

        const moved = this.state.moveDocument(this.draggedItem, targetId);
        if (moved) {
            StoreManager.saveDocuments(this.state.get('documents'));
            // 如果移动到文件夹内，自动展开目标文件夹
            this.expandFolder(targetId);
        }
    }

    /**
     * 处理拖拽结束
     */
    handleDragEnd(e) {
        this.draggedItem = null;
        this.container.querySelectorAll('.md-dragging').forEach(el => {
            el.classList.remove('md-dragging');
        });
        this.container.querySelectorAll('.md-drop-target').forEach(el => {
            el.classList.remove('md-drop-target');
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

        // 计算子项数量
        const children = this.getAllChildren(docId);
        const itemCount = children.length + 1;

        const itemType = doc.type === 'folder' ? '文件夹' : '文档';
        const message = itemCount > 1 && doc.type === 'folder'
            ? `确定要删除这个${itemType}及其 ${children.length} 个子项吗？`
            : `确定要删除这个${itemType}吗？`;

        if (!confirm(message)) return;

        this.state.deleteDocument(docId);
        StoreManager.saveDocuments(this.state.get('documents'));
    }

    /**
     * 获取所有子项（迭代优化版）
     */
    getAllChildren(folderId) {
        const documents = this.state.get('documents');
        const children = [];
        
        // 构建父节点到子项的映射
        const childrenMap = new Map();
        documents.forEach(doc => {
            if (doc.parentId) {
                if (!childrenMap.has(doc.parentId)) {
                    childrenMap.set(doc.parentId, []);
                }
                childrenMap.get(doc.parentId).push(doc);
            }
        });
        
        // 使用栈进行迭代遍历
        const stack = [folderId];
        while (stack.length > 0) {
            const currentId = stack.pop();
            const currentChildren = childrenMap.get(currentId);
            if (currentChildren) {
                for (const child of currentChildren) {
                    children.push(child);
                    if (child.type === 'folder') {
                        stack.push(child.id);
                    }
                }
            }
        }
        
        return children;
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
        
        // 如果添加到文件夹内，自动展开该文件夹
        if (parentId) {
            this.expandFolder(parentId);
        }

        // 立即进入编辑模式
        this.editItemName(doc.id);

        if (type === 'file') {
            this.state.setCurrentDocument(doc.id);
        }
    }

    /**
     * 编辑项目名称
     */
    editItemName(docId) {
        this.editingDocId = docId;

        const item = dom.getIn(this.container, `[data-doc-id="${docId}"]`);
        if (!item) return;

        const nameSpan = dom.getIn(item, '.md-doc-item-name');
        if (!nameSpan) return;

        const currentName = nameSpan.textContent;

        // 标记为编辑状态
        item.classList.add('editing');

        // 创建输入框
        const input = this.createElement('input', {
            type: 'text',
            className: 'md-doc-item-input',
            attributes: { value: currentName }
        });

        // 替换名称元素为输入框
        nameSpan.replaceWith(input);

        // 选中文本
        input.focus();
        input.select();

        // 标记是否应该保存
        let shouldSave = false;

        // 绑定输入框事件
        const save = () => {
            const newName = input.value.trim();
            if (!newName) {
                this.showMessage('名称不能为空', 'error');
                input.focus();
                return;
            }

            // 使用 silent 选项避免触发重新渲染
            this.state.updateDocument(docId, {
                name: newName,
                updatedAt: new Date().toISOString()
            }, { silent: true });
            StoreManager.saveDocuments(this.state.get('documents'));

            // 恢复为普通模式
            this.exitEditMode(docId, newName);
        };

        const cancel = () => {
            // 恢复原始名称
            this.exitEditMode(docId, currentName);
        };

        const handleBlur = () => {
            if (shouldSave) {
                save();
            } else {
                cancel();
            }
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

        // 输入内容时标记为需要保存
        input.addEventListener('input', () => {
            shouldSave = true;
        });
    }

    /**
     * 退出编辑模式（局部更新，避免闪烁）
     */
    exitEditMode(docId, name) {
        this.editingDocId = null;

        const item = dom.getIn(this.container, `[data-doc-id="${docId}"]`);
        if (!item) return;

        const input = dom.getIn(item, '.md-doc-item-input');
        if (!input) return;

        // 创建新的名称元素
        const nameSpan = this.createElement('span', {
            className: 'md-doc-item-name',
            textContent: name
        });

        // 替换输入框为名称元素
        input.replaceWith(nameSpan);

        // 移除编辑状态
        item.classList.remove('editing');
    }

    /**
     * 重命名当前项目
     */
    renameCurrentItem() {
        const currentDocId = this.state.get('currentDocId');
        if (!currentDocId) {
            this.showMessage('请先选择一个项目', 'warning');
            return;
        }
        this.editItemName(currentDocId);
    }

    /**
     * 删除当前项目
     */
    deleteCurrentItem() {
        const currentDocId = this.state.get('currentDocId');
        if (!currentDocId) {
            this.showMessage('请先选择一个项目', 'warning');
            return;
        }
        this.handleDelete(currentDocId);
    }

    /**
     * 全部展开/折叠
     */
    toggleAllFolders() {
        const allFolders = this.state.get('documents').filter(d => d.type === 'folder');
        if (this.expandedFolders.size === allFolders.length) {
            this.collapseAllFolders();
        } else {
            this.expandAllFolders();
        }
    }

    /**
     * 渲染组件
     */
    render() {
        const documents = this.state.get('documents');
        const currentDocId = this.state.get('currentDocId');

        // 空状态
        if (documents.length === 0) {
            this.container.innerHTML = `
                <div class="md-empty-state">
                    <p>暂无文档</p>
                    <button class="md-btn md-btn-primary" data-action="create-file">新建文档</button>
                    <button class="md-btn md-btn-secondary" data-action="create-folder">新建文件夹</button>
                </div>
            `;
            // 绑定空状态按钮事件
            const createFileBtn = this.container.querySelector('[data-action="create-file"]');
            const createFolderBtn = this.container.querySelector('[data-action="create-folder"]');
            if (createFileBtn) {
                createFileBtn.addEventListener('click', () => this.createItem('file'));
            }
            if (createFolderBtn) {
                createFolderBtn.addEventListener('click', () => this.createItem('folder'));
            }
            return;
        }

        // 构建树型结构
        const tree = this.state.buildTree();

        const fragment = this.createFragment();

        // 渲染树型结构
        const treeContainer = this.createElement('div', {
            className: 'md-tree-container'
        });

        tree.forEach((node) => {
            const treeNode = this.renderTreeNode(node, currentDocId, 0);
            treeContainer.appendChild(treeNode);
        });

        fragment.appendChild(treeContainer);

        this.container.innerHTML = '';
        this.container.appendChild(fragment);
    }

    /**
     * 递归渲染树节点
     */
    renderTreeNode(node, currentDocId, level) {
        const isEditing = node.id === this.editingDocId;
        const isActive = node.id === currentDocId;
        const isFolder = node.type === 'folder';
        const isExpanded = isFolder && this.isFolderExpanded(node.id);
        const hasChildren = isFolder && node.children && node.children.length > 0;

        // 创建节点容器
        const nodeContainer = this.createElement('div', {
            className: 'md-tree-node',
            dataset: { level }
        });

        // 创建项目行
        const item = this.createElement('div', {
            className: `md-doc-item${isActive ? ' active' : ''}${isEditing ? ' editing' : ''}`,
            dataset: {
                docId: node.id,
                docType: node.type || 'file'
            },
            attributes: {
                draggable: 'true'
            }
        });

        // 缩进
        const indent = this.createElement('span', {
            className: 'md-tree-indent',
            style: { width: `${level * 16}px` },
            parent: item
        });

        // 展开/折叠箭头
        if (isFolder) {
            const toggle = this.createElement('span', {
                className: `md-tree-toggle${isExpanded ? ' expanded' : ''}${hasChildren ? '' : ' leaf'}`,
                dataset: { folderId: node.id },
                parent: item
            });
        } else {
            const spacer = this.createElement('span', {
                className: 'md-tree-spacer',
                parent: item
            });
        }

        // 图标
        const icon = this.createElement('span', {
            className: 'md-doc-item-icon',
            textContent: isFolder
                ? (isExpanded ? '📂' : '📁')
                : '📄',
            parent: item
        });

        if (isEditing) {
            // 编辑模式：显示输入框
            const input = this.createElement('input', {
                type: 'text',
                className: 'md-doc-item-input',
                attributes: { value: node.name },
                parent: item
            });
        } else {
            // 普通模式：显示名称
            const nameSpan = this.createElement('span', {
                className: 'md-doc-item-name',
                textContent: node.name,
                parent: item
            });
        }

        // 操作按钮组
        const actions = this.createElement('span', {
            className: 'md-doc-item-actions',
            parent: item
        });

        // 新建按钮（仅文件夹）
        if (isFolder) {
            const newFileBtn = this.createElement('button', {
                className: 'md-btn md-btn-icon md-btn-xs md-new-file-btn',
                textContent: '➕',
                attributes: {
                    title: '在此新建文档',
                    'data-folder-id': node.id
                },
                parent: actions
            });
        }

        // 删除按钮
        const deleteBtn = this.createElement('button', {
            className: 'md-btn md-btn-icon md-btn-xs md-doc-item-delete',
            textContent: '🗑️',
            attributes: {
                title: '删除',
                'data-doc-id': node.id
            },
            parent: actions
        });

        nodeContainer.appendChild(item);

        // 递归渲染子节点（始终渲染，通过 display 控制显示/隐藏）
        if (isFolder && hasChildren) {
            const childrenContainer = this.createElement('div', {
                className: 'md-tree-children',
                style: isExpanded ? {} : { display: 'none' }
            });

            node.children.forEach((child) => {
                const childNode = this.renderTreeNode(child, currentDocId, level + 1);
                childrenContainer.appendChild(childNode);
            });

            nodeContainer.appendChild(childrenContainer);
        }

        return nodeContainer;
    }

    /**
     * 清理组件资源
     */
    destroy() {
        // 清除点击超时
        if (this.clickTimeout) {
            clearTimeout(this.clickTimeout);
            this.clickTimeout = null;
        }
        // 调用父类清理（如果存在）
        if (super.destroy) {
            super.destroy();
        }
    }
}
