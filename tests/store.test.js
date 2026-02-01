/**
 * StoreManager 单元测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StoreManager } from '../src/StoreManager.js';

describe('StoreManager - 存储管理器测试', () => {
    beforeEach(() => {
        // 每个测试前清空 localStorage
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
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

        it('应该成功保存文档列表', () => {
            const result = StoreManager.saveDocuments(mockDocuments);

            expect(result.success).toBe(true);
            const saved = JSON.parse(localStorage.getItem('markdown_editor_documents'));
            expect(saved).toEqual(mockDocuments);
        });

        it('应该成功加载文档列表', () => {
            localStorage.setItem('markdown_editor_documents', JSON.stringify(mockDocuments));

            const documents = StoreManager.loadDocuments();

            expect(documents).toEqual(mockDocuments);
        });

        it('应该在没有文档时返回空数组', () => {
            const documents = StoreManager.loadDocuments();

            expect(documents).toEqual([]);
        });

        it('应该处理保存文档时的错误', () => {
            // 模拟 localStorage.setItem 抛出错误
            const originalSetItem = localStorage.setItem;
            localStorage.setItem = () => {
                throw new Error('Storage quota exceeded');
            };

            const result = StoreManager.saveDocuments(mockDocuments);

            expect(result.success).toBe(false);
            expect(result.error).toBeTruthy();

            // 恢复原始方法
            localStorage.setItem = originalSetItem;
        });
    });

    describe('当前文档ID', () => {
        it('应该成功保存当前文档ID', () => {
            const result = StoreManager.saveCurrentDocId('doc-123');

            expect(result.success).toBe(true);
            expect(localStorage.getItem('markdown_editor_current_doc_id')).toBe('doc-123');
        });

        it('应该成功加载当前文档ID', () => {
            localStorage.setItem('markdown_editor_current_doc_id', 'doc-456');

            const docId = StoreManager.loadCurrentDocId();

            expect(docId).toBe('doc-456');
        });

        it('应该在没有保存文档ID时返回null', () => {
            const docId = StoreManager.loadCurrentDocId();

            expect(docId).toBeNull();
        });

        it('应该处理保存文档ID时的错误', () => {
            const originalSetItem = localStorage.setItem;
            localStorage.setItem = () => {
                throw new Error('Storage quota exceeded');
            };

            const result = StoreManager.saveCurrentDocId('doc-123');

            expect(result.success).toBe(false);

            localStorage.setItem = originalSetItem;
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

        it('应该成功保存设置', () => {
            const result = StoreManager.saveSettings(mockSettings);

            expect(result).toBe(true);
            const saved = JSON.parse(localStorage.getItem('markdown-editor-settings'));
            expect(saved).toEqual(mockSettings);
        });

        it('应该成功加载设置', () => {
            localStorage.setItem('markdown-editor-settings', JSON.stringify(mockSettings));

            const settings = StoreManager.loadSettings();

            expect(settings).toEqual(mockSettings);
        });

        it('应该在没有保存设置时返回null', () => {
            const settings = StoreManager.loadSettings();

            expect(settings).toBeNull();
        });

        it('应该处理保存设置时的错误', () => {
            const originalSetItem = localStorage.setItem;
            localStorage.setItem = () => {
                throw new Error('Storage quota exceeded');
            };

            const result = StoreManager.saveSettings(mockSettings);

            expect(result).toBe(false);

            localStorage.setItem = originalSetItem;
        });
    });
});
