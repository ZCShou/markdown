/**
 * PersistenceManager 测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PersistenceManager } from '../src/PersistenceManager.js';
import { StoreManager } from '../src/StoreManager.js';

describe('PersistenceManager - 持久化管理器测试', () => {
    let mockState;
    let persistence;

    beforeEach(async () => {
        // 初始化 IndexedDB
        await StoreManager.init();
        await StoreManager.clearAll();

        // 创建模拟状态
        mockState = {
            documents: [
                { id: '1', name: 'Test Doc', type: 'file', content: 'Hello' }
            ],
            currentDocId: '1',
            content: 'Hello',
            editor: { fontSize: 16 },
            interface: { theme: 'dark' },
            export: { includeStyle: true },
            syncScrollEnabled: false
        };

        // 创建持久化管理器
        persistence = new PersistenceManager(() => mockState);
    });

    afterEach(async () => {
        persistence?.destroy();
        await StoreManager.clearAll();
    });

    describe('配置和初始化', () => {
        it('应该在构造函数中自动应用默认配置', async () => {
            // 启动持久化
            persistence.start();

            // 触发持久化
            persistence.schedule(['documents']);

            // 等待防抖完成
            await new Promise(resolve => setTimeout(resolve, 400));

            // 验证数据已保存
            const saved = await StoreManager.loadDocuments();
            expect(saved).toEqual(mockState.documents);
        });

        it('应该支持自定义配置', async () => {
            persistence.configure({
                documents: { debounce: 100 }
            });

            persistence.start();
            persistence.schedule(['documents']);

            // 等待防抖完成
            await new Promise(resolve => setTimeout(resolve, 200));

            const saved = await StoreManager.loadDocuments();
            expect(saved).toEqual(mockState.documents);
        });
    });

    describe('持久化调度', () => {
        it('应该在未启动时不执行持久化', async () => {
            // 不启动持久化
            persistence.schedule(['documents']);

            const saved = await StoreManager.loadDocuments();
            expect(saved).toEqual([]);
        });

        it('应该在启动后执行持久化', async () => {
            persistence.start();
            persistence.schedule(['documents']);

            // 等待防抖完成
            await new Promise(resolve => setTimeout(resolve, 400));

            const saved = await StoreManager.loadDocuments();
            expect(saved).toEqual(mockState.documents);
        });

        it('应该立即持久化标记为 immediate 的键', async () => {
            persistence.start();
            persistence.schedule(['currentDocId']);

            // 等待异步操作完成
            await new Promise(resolve => setTimeout(resolve, 50));

            const saved = await StoreManager.loadCurrentDocId();
            expect(saved).toBe('1');
        });

        it('应该防抖延迟持久化', async () => {
            persistence.start();
            persistence.schedule(['documents']);

            // 等待防抖完成（默认 300ms）
            await new Promise(resolve => setTimeout(resolve, 400));

            const saved = await StoreManager.loadDocuments();
            expect(saved).toEqual(mockState.documents);
        });
    });

    describe('分组持久化', () => {
        it('应该合并 editor、interface、export 为一次 settings 存储', async () => {
            persistence.start();
            persistence.schedule(['editor', 'interface', 'export']);

            // 等待防抖
            await new Promise(resolve => setTimeout(resolve, 400));

            const saved = await StoreManager.loadSettings();
            expect(saved).toEqual({
                editor: mockState.editor,
                interface: mockState.interface,
                export: mockState.export
            });
        });
    });

    describe('停止和清理', () => {
        it('应该在停止后不再执行持久化', async () => {
            persistence.start();
            persistence.stop();

            persistence.schedule(['documents']);

            const saved = await StoreManager.loadDocuments();
            expect(saved).toEqual([]);
        });

        it('应该清理定时器', async () => {
            persistence.start();
            persistence.schedule(['documents']);
            persistence.stop();

            // 等待一段时间，确保没有定时器在运行
            await new Promise(resolve => setTimeout(resolve, 500));
            
            const saved = await StoreManager.loadDocuments();
            expect(saved).toEqual([]);
        });
    });

    describe('销毁', () => {
        it('应该清理所有定时器', async () => {
            persistence.start();
            persistence.schedule(['documents']);

            // 销毁持久化管理器
            persistence.destroy();

            // 等待一段时间，确保没有定时器在运行
            await new Promise(resolve => setTimeout(resolve, 500));

            // 验证没有保存数据（因为定时器被清理了）
            const saved = await StoreManager.loadDocuments();
            expect(saved).toEqual([]);
        });

        it('应该停止所有持久化', async () => {
            persistence.start();
            persistence.destroy();

            // 销毁后调度应该不执行
            persistence.schedule(['documents']);

            const saved = await StoreManager.loadDocuments();
            expect(saved).toEqual([]);
        });

        it('应该可以多次调用destroy', () => {
            persistence.start();

            expect(() => {
                persistence.destroy();
                persistence.destroy();
                persistence.destroy();
            }).not.toThrow();
        });
    });

    describe('边界情况', () => {
        it('应该处理空状态', async () => {
            const emptyPersistence = new PersistenceManager(() => ({
                documents: [],
                currentDocId: null,
                content: '',
                editor: {},
                interface: {},
                export: {}
            }));

            emptyPersistence.start();
            emptyPersistence.schedule(['documents']);

            // 等待防抖
            await new Promise(resolve => setTimeout(resolve, 400));

            // 应该成功保存空数组
            const saved = await StoreManager.loadDocuments();
            expect(saved).toEqual([]);

            emptyPersistence.destroy();
        });

        it('应该处理快速连续的schedule调用', async () => {
            persistence.start();

            // 快速连续调用
            persistence.schedule(['documents']);
            persistence.schedule(['documents']);
            persistence.schedule(['documents']);

            // 等待防抖
            await new Promise(resolve => setTimeout(resolve, 400));

            // 应该只保存一次
            const saved = await StoreManager.loadDocuments();
            expect(saved).toEqual(mockState.documents);
        });

        it('应该处理配置变更', async () => {
            persistence.configure({ documents: { debounce: 100 } });
            persistence.start();
            persistence.schedule(['documents']);

            // 等待新的防抖时间
            await new Promise(resolve => setTimeout(resolve, 200));

            const saved = await StoreManager.loadDocuments();
            expect(saved).toEqual(mockState.documents);
        });
    });
});
