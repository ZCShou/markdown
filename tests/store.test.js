/**
 * StoreManager 单元测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StoreManager } from '../src/StoreManager.js';

describe('StoreManager - 存储管理器测试', () => {
    beforeEach(async () => {
        // 初始化 IndexedDB
        await StoreManager.init();
        // 清空数据
        await StoreManager.clearAll();
    });

    afterEach(async () => {
        await StoreManager.clearAll();
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
            const result = await StoreManager.saveDocuments(mockDocuments);

            expect(result.success).toBe(true);
            const saved = await StoreManager.loadDocuments();
            expect(saved).toEqual(mockDocuments);
        });

        it('应该成功加载文档列表', async () => {
            await StoreManager.saveDocuments(mockDocuments);

            const documents = await StoreManager.loadDocuments();

            expect(documents).toEqual(mockDocuments);
        });

        it('应该在没有文档时返回空数组', async () => {
            const documents = await StoreManager.loadDocuments();

            expect(documents).toEqual([]);
        });
    });

    describe('当前文档ID', () => {
        it('应该成功保存当前文档ID', async () => {
            const result = await StoreManager.saveCurrentDocId('doc-123');

            expect(result.success).toBe(true);
            const docId = await StoreManager.loadCurrentDocId();
            expect(docId).toBe('doc-123');
        });

        it('应该成功加载当前文档ID', async () => {
            await StoreManager.saveCurrentDocId('doc-456');

            const docId = await StoreManager.loadCurrentDocId();

            expect(docId).toBe('doc-456');
        });

        it('应该在没有保存文档ID时返回null', async () => {
            const docId = await StoreManager.loadCurrentDocId();

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
            const result = await StoreManager.saveSettings(mockSettings);

            expect(result).toBe(true);
            const saved = await StoreManager.loadSettings();
            expect(saved).toEqual(mockSettings);
        });

        it('应该成功加载设置', async () => {
            await StoreManager.saveSettings(mockSettings);

            const settings = await StoreManager.loadSettings();

            expect(settings).toEqual(mockSettings);
        });

        it('应该在没有保存设置时返回null', async () => {
            const settings = await StoreManager.loadSettings();

            expect(settings).toBeNull();
        });
    });
});
