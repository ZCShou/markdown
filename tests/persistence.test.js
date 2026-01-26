/**
 * PersistenceManager 测试
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PersistenceManager } from '../src/modules/persistence.js';
import { StoreManager } from '../src/modules/store.js';

describe('PersistenceManager - 持久化管理器测试', () => {
    let mockState;
    let persistence;

    beforeEach(() => {
        // 清空 localStorage
        localStorage.clear();

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

    afterEach(() => {
        persistence?.destroy();
        localStorage.clear();
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
            const saved = StoreManager.loadDocuments();
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

            const saved = StoreManager.loadDocuments();
            expect(saved).toEqual(mockState.documents);
        });
    });

    describe('持久化调度', () => {
        it('应该在未启动时不执行持久化', () => {
            // 不启动持久化
            persistence.schedule(['documents']);

            const saved = StoreManager.loadDocuments();
            expect(saved).toEqual([]);
        });

        it('应该在启动后执行持久化', async () => {
            persistence.start();
            persistence.schedule(['documents']);

            // 等待防抖完成
            await new Promise(resolve => setTimeout(resolve, 400));

            const saved = StoreManager.loadDocuments();
            expect(saved).toEqual(mockState.documents);
        });

        it('应该立即持久化标记为 immediate 的键', () => {
            persistence.start();
            persistence.schedule(['currentDocId']);

            const saved = StoreManager.loadCurrentDocId();
            expect(saved).toBe('1');
        });

        it('应该防抖延迟持久化', async () => {
            persistence.start();
            persistence.schedule(['documents']);

            // 等待防抖完成（默认 300ms）
            await new Promise(resolve => setTimeout(resolve, 400));

            const saved = StoreManager.loadDocuments();
            expect(saved).toEqual(mockState.documents);
        });
    });

    describe('分组持久化', () => {
        it('应该合并 editor、interface、export 为一次 settings 存储', async () => {
            persistence.start();
            persistence.schedule(['editor', 'interface', 'export']);

            // 等待防抖
            await new Promise(resolve => setTimeout(resolve, 400));

            const saved = StoreManager.loadSettings();
            expect(saved).toEqual({
                editor: mockState.editor,
                interface: mockState.interface,
                export: mockState.export
            });
        });
    });

    describe('停止和清理', () => {
        it('应该在停止后不再执行持久化', () => {
            persistence.start();
            persistence.stop();

            persistence.schedule(['documents']);

            const saved = StoreManager.loadDocuments();
            expect(saved).toEqual([]);
        });

        it('应该清理定时器', () => {
            persistence.start();
            persistence.schedule(['documents']);
            persistence.stop();

            // 等待一段时间，确保没有定时器在运行
            return new Promise(resolve => {
                setTimeout(() => {
                    const saved = StoreManager.loadDocuments();
                    expect(saved).toEqual([]);
                    resolve();
                }, 500);
            });
        });
    });

    describe('错误处理', () => {
        it('应该处理持久化失败的情况', () => {
            // 模拟存储失败
            const originalSetItem = localStorage.setItem;
            localStorage.setItem = () => {
                throw new Error('Storage quota exceeded');
            };

            persistence.start();
            persistence.schedule(['documents']);

            // 不应该抛出错误
            expect(() => persistence.schedule(['documents'])).not.toThrow();

            // 恢复原始方法
            localStorage.setItem = originalSetItem;
        });
    });
});
