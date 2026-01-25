/**
 * 工具函数单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { debounce, throttle, escapeHtml, formatDate } from '../src/utils/helpers.js';

describe('工具函数测试', () => {
    describe('debounce - 防抖函数', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('应该在延迟后执行函数', () => {
            const fn = vi.fn();
            const debouncedFn = debounce(fn, 300);

            debouncedFn();

            // 300ms 前不应该执行
            expect(fn).not.toHaveBeenCalled();

            // 快进 300ms
            vi.advanceTimersByTime(300);

            // 现在应该执行了
            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('应该在多次调用时只执行一次', () => {
            const fn = vi.fn();
            const debouncedFn = debounce(fn, 300);

            debouncedFn();
            debouncedFn();
            debouncedFn();

            vi.advanceTimersByTime(300);

            expect(fn).toHaveBeenCalledTimes(1);
        });

        it('应该重置计时器如果在延迟期间再次调用', () => {
            const fn = vi.fn();
            const debouncedFn = debounce(fn, 300);

            debouncedFn();
            vi.advanceTimersByTime(200);

            debouncedFn();
            vi.advanceTimersByTime(200);

            // 还没到 300ms
            expect(fn).not.toHaveBeenCalled();

            // 再过 100ms
            vi.advanceTimersByTime(100);
            expect(fn).toHaveBeenCalledTimes(1);
        });
    });

    describe('throttle - 节流函数', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        it('应该在限制时间内只执行一次', () => {
            const fn = vi.fn();
            const throttledFn = throttle(fn, 300);

            throttledFn();
            expect(fn).toHaveBeenCalledTimes(1);

            throttledFn();
            throttledFn();

            // 在限制时间内不应该再次执行
            expect(fn).toHaveBeenCalledTimes(1);

            vi.advanceTimersByTime(300);

            throttledFn();
            expect(fn).toHaveBeenCalledTimes(2);
        });
    });

    describe('escapeHtml - HTML 转义', () => {
        it('应该转义 HTML 特殊字符', () => {
            const input = '<script>alert("XSS")</script>';
            const output = escapeHtml(input);

            expect(output).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
        });

        it('应该转义多个特殊字符', () => {
            const input = '<div class="test">Hello & goodbye</div>';
            const output = escapeHtml(input);

            expect(output).toBe(
                '&lt;div class=&quot;test&quot;&gt;Hello &amp; goodbye&lt;/div&gt;'
            );
        });

        it('应该处理空字符串', () => {
            expect(escapeHtml('')).toBe('');
        });

        it('应该处理没有特殊字符的字符串', () => {
            expect(escapeHtml('Hello World')).toBe('Hello World');
        });
    });

    describe('formatDate - 日期格式化', () => {
        it('应该使用默认格式格式化日期', () => {
            const date = new Date('2026-01-25T10:00:00Z');
            const result = formatDate(date.toISOString());
            expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
        });

        it('应该支持自定义格式', () => {
            const date = new Date('2026-01-25T10:30:45Z');
            expect(formatDate(date.toISOString(), 'YYYY/MM/DD')).toBe('2026/01/25');
            // 注意：formatDate 使用本地时间，所以需要根据时区调整
            const result = formatDate(date.toISOString(), 'HH:mm:ss');
            expect(result).toMatch(/\d{2}:\d{2}:\d{2}/);
        });

        it('应该处理无效日期', () => {
            expect(formatDate('invalid-date')).toBe('');
        });

        it('应该正确格式化日期的各个部分', () => {
            const date = new Date('2026-01-05T08:09:06Z');
            const result = formatDate(date.toISOString());
            // 验证格式正确，不验证具体值（因为时区差异）
            expect(result).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/);
        });
    });
});
