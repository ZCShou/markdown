/**
 * StoreManager 单元测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StoreManager } from '../src/modules/store.js';

describe('StoreManager - 存储管理器测试', () => {
    beforeEach(() => {
        // 每个测试前清空 localStorage
        localStorage.clear();
    });

    afterEach(() => {
        localStorage.clear();
    });

    describe('内容存储和加载', () => {
        it('应该成功保存内容', () => {
            const result = StoreManager.saveContent('Hello World');

            expect(result.success).toBe(true);
            expect(localStorage.getItem('markdown_editor_content')).toBe('Hello World');
        });

        it('应该成功加载内容', () => {
            localStorage.setItem('markdown_editor_content', 'Test Content');

            const content = StoreManager.loadContent('default');

            expect(content).toBe('Test Content');
        });

        it('应该在没有保存内容时返回默认值', () => {
            const content = StoreManager.loadContent('default content');

            expect(content).toBe('default content');
        });

        it('应该处理保存时的错误', () => {
            // 模拟 localStorage.setItem 抛出错误
            const originalSetItem = localStorage.setItem;
            localStorage.setItem = () => {
                throw new Error('Storage quota exceeded');
            };

            const result = StoreManager.saveContent('test');

            expect(result.success).toBe(false);
            expect(result.error).toBeTruthy();

            // 恢复原始方法
            localStorage.setItem = originalSetItem;
        });
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
    });

    describe('主题和布局设置', () => {
        it('应该成功保存主题设置', () => {
            StoreManager.saveTheme('dark');

            expect(localStorage.getItem('markdown_editor_theme')).toBe('dark');
        });

        it('应该成功加载主题设置', () => {
            localStorage.setItem('markdown_editor_theme', 'light');

            const theme = StoreManager.loadTheme();

            expect(theme).toBe('light');
        });

        it('应该在没有主题设置时返回默认值', () => {
            const theme = StoreManager.loadTheme();

            expect(theme).toBe('light');
        });

        it('应该成功保存布局设置', () => {
            StoreManager.saveLayout('layout-editor');

            expect(localStorage.getItem('markdown_editor_layout')).toBe('layout-editor');
        });

        it('应该成功加载布局设置', () => {
            localStorage.setItem('markdown_editor_layout', 'layout-preview');

            const layout = StoreManager.loadLayout();

            expect(layout).toBe('layout-preview');
        });
    });

    describe('侧边栏状态', () => {
        it('应该成功保存左侧侧边栏状态', () => {
            StoreManager.saveSidebarState('left', true);

            expect(localStorage.getItem('markdown_editor_sidebar_left')).toBe('true');
        });

        it('应该成功加载左侧侧边栏状态', () => {
            localStorage.setItem('markdown_editor_sidebar_left', 'false');

            const isOpen = StoreManager.loadSidebarState('left');

            expect(isOpen).toBe(false);
        });

        it('应该成功保存右侧侧边栏状态', () => {
            StoreManager.saveSidebarState('right', true);

            expect(localStorage.getItem('markdown_editor_sidebar_right')).toBe('true');
        });

        it('应该成功加载右侧侧边栏状态', () => {
            localStorage.setItem('markdown_editor_sidebar_right', 'true');

            const isOpen = StoreManager.loadSidebarState('right');

            expect(isOpen).toBe(true);
        });
    });

    describe('区块状态', () => {
        it('应该成功保存区块状态', () => {
            StoreManager.saveSectionState('toc', false);

            const saved = localStorage.getItem('markdown_editor_section_toc');
            expect(saved).toBe('false');
        });

        it('应该成功加载区块状态', () => {
            localStorage.setItem('markdown_editor_section_toc', 'false');
            localStorage.setItem('markdown_editor_section_export', 'true');

            const tocState = StoreManager.loadSectionState('toc');
            const exportState = StoreManager.loadSectionState('export');

            expect(tocState).toBe(false);
            expect(exportState).toBe(true);
        });

        it('应该在没有区块状态时返回默认值', () => {
            const tocState = StoreManager.loadSectionState('toc');

            expect(tocState).toBe(false);
        });
    });

    describe('清除数据', () => {
        it('应该成功清除所有数据', () => {
            // 设置一些数据
            localStorage.setItem('markdown_editor_content', 'test');
            localStorage.setItem('markdown_editor_theme', 'dark');

            StoreManager.clearAll();

            expect(localStorage.getItem('markdown_editor_content')).toBeNull();
            expect(localStorage.getItem('markdown_editor_theme')).toBeNull();
        });
    });
});
