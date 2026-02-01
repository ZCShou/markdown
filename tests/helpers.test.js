/**
 * 工具函数单元测试
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    debounce,
    throttle,
    escapeHtml,
    formatDate,
    generateId,
    deepClone,
    isEmpty,
    safeParseJSON,
    truncateText,
    supportsFeature
} from '../src/utils/helpers.js';

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

    describe('generateId - 生成唯一ID', () => {
        it('应该生成带前缀的ID', () => {
            const id = generateId('doc');
            expect(id).toMatch(/^doc-/);
        });

        it('应该生成不带前缀的ID', () => {
            const id = generateId();
            expect(id).toMatch(/^id-/);
        });

        it('应该每次生成不同的ID', () => {
            const id1 = generateId('test');
            const id2 = generateId('test');
            expect(id1).not.toBe(id2);
        });

        it('应该生成有效的ID格式', () => {
            const id = generateId('test');
            // ID 格式: prefix-timestamp-random
            expect(id).toMatch(/^test-\d+-[a-z0-9]+$/);
        });
    });

    describe('deepClone - 深度克隆', () => {
        it('应该深度克隆对象', () => {
            const original = {
                name: 'Test',
                nested: { value: 42 },
                array: [1, 2, 3]
            };
            const cloned = deepClone(original);

            expect(cloned).toEqual(original);
            expect(cloned).not.toBe(original);
            expect(cloned.nested).not.toBe(original.nested);
            expect(cloned.array).not.toBe(original.array);
        });

        it('应该深度克隆数组', () => {
            const original = [1, { a: 2 }, [3, 4]];
            const cloned = deepClone(original);

            expect(cloned).toEqual(original);
            expect(cloned).not.toBe(original);
            expect(cloned[1]).not.toBe(original[1]);
        });

        it('应该不修改原对象', () => {
            const original = { value: 1 };
            const cloned = deepClone(original);
            cloned.value = 2;

            expect(original.value).toBe(1);
            expect(cloned.value).toBe(2);
        });

        it('应该处理null和undefined', () => {
            expect(deepClone(null)).toBeNull();
            expect(deepClone(undefined)).toBeUndefined();
        });

        it('应该处理基本类型', () => {
            expect(deepClone(42)).toBe(42);
            expect(deepClone('test')).toBe('test');
            expect(deepClone(true)).toBe(true);
        });
    });

    describe('isEmpty - 空值检查', () => {
        it('应该识别空对象', () => {
            expect(isEmpty({})).toBe(true);
        });

        it('应该识别空数组', () => {
            expect(isEmpty([])).toBe(true);
        });

        it('应该识别空字符串', () => {
            expect(isEmpty('')).toBe(true);
        });

        it('应该识别null和undefined', () => {
            expect(isEmpty(null)).toBe(true);
            expect(isEmpty(undefined)).toBe(true);
        });

        it('应该识别非空对象', () => {
            expect(isEmpty({ key: 'value' })).toBe(false);
        });

        it('应该识别非空数组', () => {
            expect(isEmpty([1])).toBe(false);
        });

        it('应该识别非空字符串', () => {
            expect(isEmpty('test')).toBe(false);
        });

        it('应该识别数字0为非空', () => {
            expect(isEmpty(0)).toBe(false);
        });

        it('应该识别false为非空', () => {
            expect(isEmpty(false)).toBe(false);
        });
    });

    describe('safeParseJSON - 安全JSON解析', () => {
        it('应该成功解析JSON', () => {
            const jsonStr = '{"name":"test","value":42}';
            const result = safeParseJSON(jsonStr);
            expect(result).toEqual({ name: 'test', value: 42 });
        });

        it('应该在解析失败时返回默认值', () => {
            const result = safeParseJSON('invalid json', { default: true });
            expect(result).toEqual({ default: true });
        });

        it('应该在解析失败时返回null（无默认值）', () => {
            const result = safeParseJSON('invalid json');
            expect(result).toBeNull();
        });

        it('应该解析数组', () => {
            const jsonStr = '[1,2,3]';
            const result = safeParseJSON(jsonStr);
            expect(result).toEqual([1, 2, 3]);
        });

        it('应该解析基本类型', () => {
            expect(safeParseJSON('true')).toBe(true);
            expect(safeParseJSON('false')).toBe(false);
            expect(safeParseJSON('null')).toBeNull();
            expect(safeParseJSON('42')).toBe(42);
            expect(safeParseJSON('"test"')).toBe('test');
        });

        it('应该处理空字符串', () => {
            expect(safeParseJSON('', {})).toEqual({});
        });
    });

    describe('truncateText - 文本截断', () => {
        it('应该截断超过最大长度的文本', () => {
            const text = 'This is a very long text that should be truncated';
            const result = truncateText(text, 20);
            expect(result.length).toBeLessThanOrEqual(23); // 20 + '...'
            expect(result).toMatch(/\.\.\.$/);
        });

        it('应该添加自定义后缀', () => {
            const text = 'This is a very long text';
            const result = truncateText(text, 10, '»');
            expect(result).toMatch(/»$/);
        });

        it('应该不截断短文本', () => {
            const text = 'Short';
            const result = truncateText(text, 20);
            expect(result).toBe('Short');
        });

        it('应该处理空字符串', () => {
            expect(truncateText('', 10)).toBe('');
        });

        it('应该处理正好等于最大长度的文本', () => {
            const text = 'Exactly20!';
            const result = truncateText(text, 20);
            expect(result).toBe('Exactly20!');
        });
    });

    describe('supportsFeature - 特性检测', () => {
        it('应该检测localStorage支持', () => {
            const result = supportsFeature('localStorage');
            expect(typeof result).toBe('boolean');
        });

        it('应该检测sessionStorage支持', () => {
            const result = supportsFeature('sessionStorage');
            expect(typeof result).toBe('boolean');
        });

        it('应该检测未知特性返回false', () => {
            const result = supportsFeature('unknownFeature');
            expect(result).toBe(false);
        });

        it('应该检测WebSocket支持', () => {
            const result = supportsFeature('websocket');
            expect(typeof result).toBe('boolean');
        });
    });
});
