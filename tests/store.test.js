/**
 * WorkspaceStorage 单元测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WorkspaceStorage } from '../src/workspace/storage.js';

describe('WorkspaceStorage - 存储管理器测试', () => {
    beforeEach(async () => {
        // 初始化 IndexedDB
        await WorkspaceStorage.init();
        // 清空数据
        await WorkspaceStorage.clearLocalWorkspace();
    });

    afterEach(async () => {
        await WorkspaceStorage.clearLocalWorkspace();
    });

    describe('文档管理', () => {
        const mockDocuments = [
            {
                id: '1',
                title: 'Doc 1',
                content: 'Content 1',
                type: 'file',
                createdAt: '2026-01-25T10:00:00Z'
            },
            {
                id: '2',
                title: 'Doc 2',
                content: 'Content 2',
                type: 'file',
                createdAt: '2026-01-25T11:00:00Z'
            }
        ];

        it('应该成功保存文档列表', async () => {
            const result = await WorkspaceStorage.saveDocuments(mockDocuments);

            expect(result.success).toBe(true);
            const saved = await WorkspaceStorage.loadDocuments();
            expect(saved).toEqual(mockDocuments);
        });

        it('应该成功加载文档列表', async () => {
            await WorkspaceStorage.saveDocuments(mockDocuments);

            const documents = await WorkspaceStorage.loadDocuments();

            expect(documents).toEqual(mockDocuments);
        });

        it('应该在没有文档时返回空数组', async () => {
            const documents = await WorkspaceStorage.loadDocuments();

            expect(documents).toEqual([]);
        });
    });

    describe('当前文档ID', () => {
        it('应该成功保存当前文档ID', async () => {
            const result = await WorkspaceStorage.saveCurrentDocId('doc-123');

            expect(result.success).toBe(true);
            const docId = await WorkspaceStorage.loadCurrentDocId();
            expect(docId).toBe('doc-123');
        });

        it('应该成功加载当前文档ID', async () => {
            await WorkspaceStorage.saveCurrentDocId('doc-456');

            const docId = await WorkspaceStorage.loadCurrentDocId();

            expect(docId).toBe('doc-456');
        });

        it('应该在没有保存文档ID时返回null', async () => {
            const docId = await WorkspaceStorage.loadCurrentDocId();

            expect(docId).toBeNull();
        });
    });

    describe('设置管理', () => {
        const mockSettings = {
            editor: {
                fontSize: 16,
                lineHeight: 1.6,
                tabSize: 4
            },
            interface: {
                theme: 'dark',
                layout: 'layout-both'
            },
            export: {
                includeStyle: true,
                codeHighlight: true
            }
        };

        it('应该成功保存设置', async () => {
            const result = await WorkspaceStorage.saveSettings(mockSettings);

            expect(result.success).toBe(true);
            const saved = await WorkspaceStorage.loadSettings();
            expect(saved).toEqual(mockSettings);
        });

        it('应该成功加载设置', async () => {
            await WorkspaceStorage.saveSettings(mockSettings);

            const settings = await WorkspaceStorage.loadSettings();

            expect(settings).toEqual(mockSettings);
        });

        it('应该在没有保存设置时返回null', async () => {
            const settings = await WorkspaceStorage.loadSettings();

            expect(settings).toBeNull();
        });
    });
});
