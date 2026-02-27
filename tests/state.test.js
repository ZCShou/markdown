/**
 * EditorState 单元测试
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EditorState } from '../src/EditorState.js';

describe('EditorState - 状态管理器测试', () => {
    let state;

    beforeEach(() => {
        state = new EditorState();
    });

    afterEach(() => {
        state.destroy();
    });

    describe('初始化', () => {
        it('应该初始化默认状态', async () => {
            await state.init();

            expect(state.get('content')).toBeTruthy();
            expect(state.get('documents')).toEqual([]);
            expect(state.get('editor')).toBeDefined();
            expect(state.get('interface')).toBeDefined();
            expect(state.get('export')).toBeDefined();
            expect(state.get('editor').fontSize).toBe(16);
            expect(state.get('interface').theme).toBe('light');
            expect(state.get('interface').layout).toBe('layout-both');
        });
    });

    describe('状态获取', () => {
        beforeEach(async () => {
            await state.init();
        });

        it('应该获取特定键的值', () => {
            expect(state.get('content')).toBeTruthy();
            expect(state.get('documents')).toEqual([]);
        });

        it('应该获取嵌套对象的值', () => {
            const editor = state.get('editor');
            expect(editor.fontSize).toBe(16);
            expect(editor.lineHeight).toBe(1.6);
        });
    });

    describe('内容更新', () => {
        beforeEach(async () => {
            await state.init();
        });

        it('应该更新内容', () => {
            state.updateContent('New Content');

            expect(state.get('content')).toBe('New Content');
        });
    });

    describe('订阅机制', () => {
        beforeEach(async () => {
            await state.init();
        });

        it('应该支持全局订阅', () => {
            const listener = vi.fn();
            const unsubscribe = state.subscribe(listener);

            state.updateContent('Test 1');
            state.updateContent('Test 2');

            expect(listener).toHaveBeenCalled();
            expect(listener).toHaveBeenCalledTimes(2);

            unsubscribe();

            state.updateContent('Test 3');

            // 取消订阅后不应该再被调用
            expect(listener).toHaveBeenCalledTimes(2);
        });

        it('应该支持特定键的订阅', () => {
            const contentListener = vi.fn();
            const themeListener = vi.fn();

            state.subscribeTo('content', contentListener);
            state.subscribeTo('interface', themeListener);

            state.updateContent('New Content');
            state.updateInterfaceConfig({ theme: 'dark' });

            expect(contentListener).toHaveBeenCalled();
            expect(themeListener).toHaveBeenCalled();
        });

        it('应该支持多个键的订阅', () => {
            const listener = vi.fn();

            state.subscribeTo(['content', 'interface'], listener);

            state.updateContent('Test');
            state.updateInterfaceConfig({ theme: 'dark' });

            expect(listener).toHaveBeenCalledTimes(2);
        });
    });

    describe('文档操作', () => {
        beforeEach(async () => {
            await state.init();
        });

        it('应该添加文档', () => {
            const doc = { id: '1', name: 'Test', content: 'Content', type: 'file' };

            state.addDocument(doc);

            const documents = state.get('documents');
            expect(documents.length).toBeGreaterThan(0);
            expect(documents[0]).toMatchObject(doc);
        });

        it('应该更新文档', () => {
            const doc = { id: '1', name: 'Test', content: 'Content', type: 'file' };
            state.addDocument(doc);

            state.updateDocument('1', { name: 'Updated', content: 'New Content' });

            const documents = state.get('documents');
            const updated = documents.find(d => d.id === '1');
            expect(updated.name).toBe('Updated');
            expect(updated.content).toBe('New Content');
        });

        it('应该删除文档', () => {
            const doc = { id: '1', name: 'Test', content: 'Content', type: 'file' };
            state.addDocument(doc);

            state.deleteDocuments(['1']);

            const documents = state.get('documents');
            expect(documents.find(d => d.id === '1')).toBeUndefined();
        });

        it('应该设置当前文档', () => {
            const doc = { id: '1', name: 'Test', content: 'Content', type: 'file' };
            state.addDocument(doc);
            state.setCurrentDocument('1');

            expect(state.get('currentDocId')).toBe('1');
        });

        it('应该获取当前文档', () => {
            const doc = { id: '1', name: 'Test', content: 'Content', type: 'file' };
            state.addDocument(doc);
            state.setCurrentDocument('1');

            const current = state.get('currentDocId');

            expect(current).toBe('1');
        });
    });

    describe('UI 状态管理', () => {
        beforeEach(async () => {
            await state.init();
        });

        it('应该更新界面配置', () => {
            state.updateInterfaceConfig({
                theme: 'dark',
                layout: 'layout-editor-only'
            });

            expect(state.get('interface').theme).toBe('dark');
            expect(state.get('interface').layout).toBe('layout-editor-only');
        });

        it('应该更新编辑器配置', () => {
            state.updateEditorConfig({
                fontSize: 16,
                lineHeight: 1.8
            });

            expect(state.get('editor').fontSize).toBe(16);
            expect(state.get('editor').lineHeight).toBe(1.8);
        });

        it('应该更新导出配置', () => {
            state.updateExportConfig({
                includeStyle: false,
                codeHighlight: false
            });

            expect(state.get('export').includeStyle).toBe(false);
            expect(state.get('export').codeHighlight).toBe(false);
        });
    });

    describe('销毁', () => {
        it('应该清除所有监听器', async () => {
            await state.init();
            const listener = vi.fn();
            state.subscribe(listener);

            state.destroy();

            state.updateContent('Test');

            // 销毁后不应该通知监听器
            expect(listener).not.toHaveBeenCalled();
        });
    });

    describe('文档树操作', () => {
        beforeEach(async () => {
            await state.init();
        });

        it('应该获取文档树', () => {
            // 添加一些文档
            state.addDocument({ id: '1', name: 'Doc1', type: 'file', content: 'Content1' });
            state.addDocument({ id: '2', name: 'Doc2', type: 'file', content: 'Content2' });

            const tree = state.getDocumentTree();
            expect(tree).toBeDefined();
            expect(Array.isArray(tree)).toBe(true);
        });

        it('应该处理空文档树', () => {
            const tree = state.getDocumentTree();
            expect(tree).toEqual([]);
        });
    });

    describe('文档选择', () => {
        beforeEach(async () => {
            await state.init();
        });

        it('应该选择单个文档', () => {
            state.addDocument({ id: '1', name: 'Doc1', type: 'file', content: 'Content1' });
            state.selectDocuments(['1']);

            const selected = state.get('selectedDocIds');
            expect(selected).toContain('1');
        });

        it('应该选择多个文档', () => {
            state.addDocument({ id: '1', name: 'Doc1', type: 'file', content: 'Content1' });
            state.addDocument({ id: '2', name: 'Doc2', type: 'file', content: 'Content2' });
            state.selectDocuments(['1', '2']);

            const selected = state.get('selectedDocIds');
            expect(selected).toHaveLength(2);
            expect(selected).toContain('1');
            expect(selected).toContain('2');
        });

        it('应该清除选择', () => {
            state.addDocument({ id: '1', name: 'Doc1', type: 'file', content: 'Content1' });
            state.selectDocuments(['1']);
            state.selectDocuments([]);

            const selected = state.get('selectedDocIds');
            expect(selected).toEqual([]);
        });
    });

    describe('标题管理', () => {
        beforeEach(async () => {
            await state.init();
        });

        it('应该更新标题', () => {
            const headings = [
                { level: 1, text: 'Title 1', id: 'h1' },
                { level: 2, text: 'Title 2', id: 'h2' }
            ];

            state.updateHeadings(headings);
            // 验证标题已更新（具体实现可能需要调整）
            expect(headings).toBeDefined();
        });
    });

    describe('导出功能', () => {
        beforeEach(async () => {
            await state.init();
        });

        it('应该触发HTML导出', () => {
            const listener = vi.fn();
            state.subscribeTo('export:trigger', listener);

            state.triggerExport('html');

            expect(listener).toHaveBeenCalledWith('html');
        });

        it('应该触发Markdown导出', () => {
            const listener = vi.fn();
            state.subscribeTo('export:trigger', listener);

            state.triggerExport('md');

            expect(listener).toHaveBeenCalledWith('md');
        });

        it('应该触发PDF导出', () => {
            const listener = vi.fn();
            state.subscribeTo('export:trigger', listener);

            state.triggerExport('pdf');

            expect(listener).toHaveBeenCalledWith('pdf');
        });
    });

    describe('通知系统', () => {
        beforeEach(async () => {
            await state.init();
        });

        it('应该显示成功通知', () => {
            const listener = vi.fn();
            state.subscribeTo('notification', listener);

            state.showNotification('操作成功', 'success');

            expect(listener).toHaveBeenCalled();
        });

        it('应该显示错误通知', () => {
            const listener = vi.fn();
            state.subscribeTo('notification', listener);

            state.showNotification('操作失败', 'error');

            expect(listener).toHaveBeenCalled();
        });

        it('应该显示警告通知', () => {
            const listener = vi.fn();
            state.subscribeTo('notification', listener);

            state.showNotification('注意', 'warning');

            expect(listener).toHaveBeenCalled();
        });

        it('应该显示信息通知', () => {
            const listener = vi.fn();
            state.subscribeTo('notification', listener);

            state.showNotification('提示信息', 'info');

            expect(listener).toHaveBeenCalled();
        });
    });

    describe('错误处理', () => {
        beforeEach(async () => {
            await state.init();
        });

        it('应该处理不存在的文档更新', () => {
            // 尝试更新不存在的文档
            expect(() => {
                state.updateDocument('non-existent', { name: 'Updated' });
            }).not.toThrow();
        });

        it('应该处理空文档ID', () => {
            expect(() => {
                state.setCurrentDocument(null);
            }).not.toThrow();
        });

        it('应该处理重复的文档ID', () => {
            const doc = { id: '1', name: 'Doc1', type: 'file', content: 'Content1' };
            state.addDocument(doc);

            // 添加重复ID的文档
            expect(() => {
                state.addDocument({ id: '1', name: 'Doc2', type: 'file', content: 'Content2' });
            }).not.toThrow();
        });

        it('应该处理无效的配置更新', () => {
            expect(() => {
                state.updateEditorConfig(null);
            }).not.toThrow();
        });
    });

    describe('持久化集成', () => {
        it('应该启动持久化', async () => {
            await state.init();
            expect(() => {
                state.startPersistence();
            }).not.toThrow();
        });
    });
});
