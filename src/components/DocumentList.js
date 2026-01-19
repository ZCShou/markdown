/**
 * 文档列表组件
 * 负责文档列表的渲染和交互
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
    }

    /**
     * 订阅状态变化
     */
    subscribe() {
        // 订阅文档列表变化
        this.unsubscribe = this.state.subscribeTo(['documents', 'currentDocId'], () => {
            this.render();
        });
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 使用事件委托处理列表项点击
        this.addEventListener(this.container, 'click', (e) => this.handleClick(e));
    }

    /**
     * 处理点击事件
     */
    handleClick(e) {
        // 删除按钮
        const deleteBtn = e.target.closest('.md-doc-item-delete');
        if (deleteBtn) {
            e.stopPropagation();
            this.handleDelete(deleteBtn.dataset.docId);
            return;
        }

        // 文档项
        const item = e.target.closest('.md-doc-item');
        if (item && item.dataset.docType !== 'folder') {
            const docId = item.dataset.docId;
            if (docId && !this.editingDocId) {
                this.handleOpen(docId);
            }
        }
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

        const itemType = doc.type === 'folder' ? '文件夹' : '文档';
        if (!confirm(`确定要删除这个${itemType}吗？`)) return;

        this.state.deleteDocument(docId);
        StoreManager.saveDocuments(this.state.get('documents'));
    }

    /**
     * 创建新项目
     */
    createItem(type = 'file') {
        const doc = {
            id: Date.now().toString(),
            name: type === 'folder' ? '新建文件夹' : '新建文档',
            type: type,
            content: type === 'file' ? '' : undefined,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        this.state.addDocument(doc);
        StoreManager.saveDocuments(this.state.get('documents'));

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
        this.render(); // 重新渲染以显示输入框

        const item = dom.getIn(this.container, `[data-doc-id="${docId}"]`);
        if (!item) return;

        const input = dom.getIn(item, '.md-doc-item-input');
        if (!input) return;

        // 选中文本
        input.focus();
        input.select();

        // 绑定输入框事件
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
            });
            StoreManager.saveDocuments(this.state.get('documents'));

            this.editingDocId = null;
            this.render();
        };

        const cancel = () => {
            this.editingDocId = null;
            this.render();
        };

        input.addEventListener('blur', save, { once: true });
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                input.blur();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                input.removeEventListener('blur', save);
                cancel();
            }
        });
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
     * 渲染组件
     */
    render() {
        const documents = this.state.get('documents');
        const currentDocId = this.state.get('currentDocId');

        // 空状态
        if (documents.length === 0) {
            this.container.innerHTML = `<p class="md-empty-state">暂无文档</p>`;
            return;
        }

        const fragment = this.createFragment();

        documents.forEach((doc) => {
            const item = this.renderDocItem(doc, currentDocId);
            fragment.appendChild(item);
        });

        this.container.innerHTML = '';
        this.container.appendChild(fragment);
    }

    /**
     * 渲染单个文档项
     */
    renderDocItem(doc, currentDocId) {
        const isEditing = doc.id === this.editingDocId;
        const isActive = doc.id === currentDocId;

        const item = this.createElement('div', {
            className: `md-doc-item${isActive ? ' active' : ''}${isEditing ? ' editing' : ''}`,
            dataset: {
                docId: doc.id,
                docType: doc.type || 'file'
            }
        });

        // 图标
        const icon = this.createElement('span', {
            className: 'md-doc-item-icon',
            textContent: doc.type === 'folder' ? '📁' : '📄',
            parent: item
        });

        if (isEditing) {
            // 编辑模式：显示输入框
            const input = this.createElement('input', {
                type: 'text',
                className: 'md-doc-item-input',
                attributes: {
                    value: doc.name
                },
                parent: item
            });
        } else {
            // 普通模式：显示名称
            const nameSpan = this.createElement('span', {
                className: 'md-doc-item-name',
                textContent: doc.name,
                parent: item
            });
        }

        // 删除按钮
        const deleteBtn = this.createElement('button', {
            className: 'md-btn md-btn-icon md-btn-sm md-btn-danger md-doc-item-delete',
            textContent: '🗑️',
            attributes: {
                title: '删除',
                'data-doc-id': doc.id
            },
            parent: item
        });

        return item;
    }
}
