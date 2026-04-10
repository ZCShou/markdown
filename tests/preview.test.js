import { Preview } from '../src/components/Preview.js';

function createPreview() {
    return new Preview(
        {
            showNotification: vi.fn()
        },
        'markdown-preview'
    );
}

describe('Preview - 上下标预处理', () => {
    it('不应该让表格中的未闭合 ~ 内容跨列被识别为下标', () => {
        const preview = createPreview();
        const markdown = `| 左列 | 右列 |
| --- | --- |
| 左 ~foo | 右 ~foo |
| 左 bar | 右 bar |`;

        const { html } = preview.renderMarkdown(markdown, {
            hasMath: false,
            hasStrike: false,
            hasSupSub: true
        });

        const container = document.createElement('div');
        container.innerHTML = html;

        const rows = container.querySelectorAll('tbody tr');
        expect(rows).toHaveLength(2);
        expect(rows[0].querySelectorAll('sub, sup')).toHaveLength(0);
        expect(rows[0].children[0].textContent).toBe('左 ~foo');
        expect(rows[0].children[1].textContent).toBe('右 ~foo');
    });

    it('应该保留有效的上下标语法', () => {
        const preview = createPreview();
        const { html } = preview.renderMarkdown('H~2~O 和 x^2^', {
            hasMath: false,
            hasStrike: false,
            hasSupSub: true
        });

        const container = document.createElement('div');
        container.innerHTML = html;

        expect(container.querySelector('sub')?.textContent).toBe('2');
        expect(container.querySelector('sup')?.textContent).toBe('2');
        expect(container.textContent).toContain('H2O');
        expect(container.textContent).toContain('x2');
    });

    it('应该跳过代码范围内的上下标语法', () => {
        const preview = createPreview();
        const markdown = '`x^2^` 和 `H~2~O`';
        const { html } = preview.renderMarkdown(
            markdown,
            {
                hasMath: false,
                hasStrike: false,
                hasSupSub: true
            },
            {
                codeRanges: [{ start: 0, end: markdown.length }]
            }
        );

        const container = document.createElement('div');
        container.innerHTML = html;

        expect(container.querySelectorAll('sub, sup')).toHaveLength(0);
        expect(container.querySelector('code')?.textContent).toBe('x^2^');
    });
});
