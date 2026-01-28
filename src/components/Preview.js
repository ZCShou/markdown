/**
 * 预览组件
 * 负责 Markdown 渲染、代码高亮、Mermaid 图表、数学公式
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import Prism from 'prismjs';
import mermaid from 'mermaid';
import katex from 'katex';
import { BaseComponent } from './BaseComponent.js';
import { dom } from '../utils/dom.js';

/**
 *
 */
export class Preview extends BaseComponent {
    // ==================== 私有字段声明 ====================

    /** @private */
    #lastRenderedData;
    /** @private */
    #mermaidTimeoutIds = [];
    /** @private */
    #intersectionObserver = null;
    /** @private */
    #pendingCodeBlocks = new Set();
    /** @private */
    #pendingMermaidBlocks = new Set();
    /** @private */
    #pendingMathBlocks = new Set();
    /** @private */
    #mermaidRenderTimer = null;
    /** @private */
    #codeHighlightTimer = null;
    /** @private */
    #mathRenderTimer = null;

    // 可见区域缓冲区大小（像素）
    static #VISIBILITY_BUFFER = 500;

    /**
     * 构造函数
     * @param state
     * @param containerId
     */
    constructor(state, containerId) {
        super(state, containerId);
        this.mermaidInitialized = false;
        this.renderTimeout = null;

        // 增量渲染：存储上次渲染的数据
        this.#lastRenderedData = {
            markdown: '',
            codeBlocks: new Map(), // hash -> code content
            mermaidBlocks: new Map(), // hash -> mermaid content
            mathBlocks: new Map(), // hash -> math content
            headings: [] // heading texts
        };

        // IntersectionObserver 用于可见性检测
        this.#intersectionObserver = null;
        this.#pendingCodeBlocks = new Set();
        this.#pendingMermaidBlocks = new Set();
        this.#pendingMathBlocks = new Set();
    }

    // ==================== 初始化方法 ====================
    /**
     * 初始化组件
     */
    init() {
        super.init();
        this.initMermaid();
        this.#initIntersectionObserver();
    }

    /**
     * 初始化 Mermaid
     */
    initMermaid() {
        if (this.mermaidInitialized) return;
        this.#configureMermaid(this.state.get('interface').theme);
        this.mermaidInitialized = true;
    }

    /**
     * 配置 Mermaid 主题
     * @param theme
     * @private
     */
    #configureMermaid(theme) {
        mermaid.initialize({
            startOnLoad: false,
            theme: theme === 'dark' ? 'dark' : 'default',
            securityLevel: 'loose',
            logLevel: 'error'
        });
    }

    /**
     * 初始化可见性观察器
     * @private
     */
    #initIntersectionObserver() {
        if (!('IntersectionObserver' in window)) return;

        const buffer = Preview.#VISIBILITY_BUFFER;

        this.#intersectionObserver = new IntersectionObserver(
            entries => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const element = entry.target;

                        // 处理代码高亮
                        if (element.tagName === 'CODE' && this.#pendingCodeBlocks.has(element)) {
                            this.#highlightSingleBlock(element);
                            this.#pendingCodeBlocks.delete(element);
                            this.#intersectionObserver.unobserve(element);
                        }

                        // 处理 Mermaid 渲染
                        if (element.classList.contains('mermaid-pending')) {
                            this.#renderSingleMermaid(element);
                            this.#pendingMermaidBlocks.delete(element);
                            this.#intersectionObserver.unobserve(element);
                        }

                        // 处理数学公式渲染
                        if (element.classList.contains('math-pending')) {
                            this.#renderSingleMath(element);
                            this.#pendingMathBlocks.delete(element);
                            this.#intersectionObserver.unobserve(element);
                        }
                    }
                });
            },
            {
                root: null,
                rootMargin: `${buffer}px`, // 使用统一的缓冲区大小
                threshold: 0.01
            }
        );
    }

    // ==================== 状态订阅和事件绑定 ====================
    /**
     * 订阅状态变化
     */
    subscribe() {
        // 订阅内容、当前文档和主题变化
        this.unsubscribe = this.state.subscribeTo(
            ['content', 'currentDocId', 'theme'],
            (newValue, oldValue, key) => {
                if (key === 'content') {
                    this.updatePreview();
                } else if (key === 'currentDocId') {
                    this.forceUpdatePreview();
                } else if (key === 'theme') {
                    this.updateMermaidTheme();
                }
            }
        );
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 图片加载错误处理
        this.addEventListener(
            this.container,
            'error',
            e => {
                if (e.target.tagName === 'IMG') {
                    this.handleImageError(e.target);
                }
            },
            true
        );

        // 链接点击处理
        this.addEventListener(
            this.container,
            'click',
            e => {
                // 检查点击的是否是链接
                const link = e.target.closest('a');
                if (!link) return;

                const href = link.getAttribute('href');
                if (!href) return;

                // 处理内部锚点链接（以 # 开头）
                if (href.startsWith('#')) {
                    e.preventDefault();
                    this.#handleInternalLink(href);
                    return;
                }

                // 处理外部链接：在新标签页中打开
                // 检查是否是外部链接（http://, https://, // 等）
                if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
                    e.preventDefault();
                    window.open(href, '_blank', 'noopener,noreferrer');
                    return;
                }

                // 处理相对路径链接（如 ./file.md, ../other.md）
                // 这些链接也保持默认行为，但在当前页面打开
                // 如果需要在新标签页打开，可以取消下面的注释
                /*
                if (href.startsWith('./') || href.startsWith('../') || href.match(/^[^/]+\.md$/)) {
                    e.preventDefault();
                    window.open(href, '_blank', 'noopener,noreferrer');
                    return;
                }
                */
            },
            false
        );
    }

    /**
     * 处理内部链接跳转
     * @param {string} href - 链接的 href 属性值（如 #heading-1）
     * @private
     */
    #handleInternalLink(href) {
        // 移除 # 号并解码（处理中文等特殊字符）
        const targetId = decodeURIComponent(href.slice(1));

        // 使用 getElementById 查找目标元素（更安全，支持特殊字符）
        // 先在容器内查找，如果找不到再在整个文档中查找
        let targetElement = this.container.querySelector(`[id="${CSS.escape(targetId)}"]`);

        // 如果在容器内找不到，尝试在整个文档中查找
        if (!targetElement) {
            targetElement = document.getElementById(targetId);
        }

        if (targetElement) {
            // 平滑滚动到目标元素
            targetElement.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });

            // 更新 URL hash（不触发页面跳转）
            history.replaceState(null, null, href);
        } else {
            console.warn(`未找到目标元素: ${targetId}`);
        }
    }

    // ==================== 渲染入口 ====================
    /**
     * 渲染组件
     * @returns {void}
     */
    render() {
        // 初始渲染预览内容
        const content = this.state.get('content') || '';
        if (content) {
            this.#scheduleRender(content, 0);
        }
    }

    /**
     * 更新预览
     */
    updatePreview() {
        const content = this.state.get('content');
        const lastRendered = this.state.get('lastRenderedContent');

        // 避免重复渲染（但允许初始渲染）
        if (content === lastRendered && lastRendered !== '') return;

        this.#scheduleRender(content, 100);
    }

    /**
     * 调度渲染（内部方法）
     * @param content
     * @param delay
     * @private
     */
    #scheduleRender(content, delay = 100) {
        // 取消之前的渲染任务
        if (this.renderTimeout) {
            clearTimeout(this.renderTimeout);
        }

        this.renderTimeout = setTimeout(() => {
            this.renderContent(content);
            this.state.updateLastRenderedContent(content);
            this.renderTimeout = null;
        }, delay);
    }

    /**
     * 强制更新预览（用于切换文档时）
     */
    forceUpdatePreview() {
        const currentDocId = this.state.get('currentDocId');
        if (!currentDocId) return;

        const documents = this.state.get('documents');
        const doc = documents.find(d => d.id === currentDocId);
        if (!doc || doc.type === 'folder') return;

        // 切换文档时立即同步渲染，无延迟
        const content = doc.content || '';

        // 取消之前的渲染任务
        if (this.renderTimeout) {
            clearTimeout(this.renderTimeout);
            this.renderTimeout = null;
        }

        // 立即渲染
        this.renderContent(content);
        this.state.updateLastRenderedContent(content);
    }

    /**
     * 渲染内容（优化版：简化流程）
     * @param markdown
     */
    renderContent(markdown) {
        // 清空待处理集合，避免旧元素干扰
        this.#pendingMermaidBlocks.clear();
        this.#pendingCodeBlocks.clear();
        this.#pendingMathBlocks.clear();

        // 取消旧定时器，避免重复执行
        if (this.#mermaidRenderTimer) {
            clearTimeout(this.#mermaidRenderTimer);
            this.#mermaidRenderTimer = null;
        }

        // 取消代码高亮定时器
        if (this.#codeHighlightTimer) {
            clearTimeout(this.#codeHighlightTimer);
            this.#codeHighlightTimer = null;
        }

        // 取消数学公式渲染定时器
        if (this.#mathRenderTimer) {
            clearTimeout(this.#mathRenderTimer);
            this.#mathRenderTimer = null;
        }

        // 检测变化
        const changes = this.#detectChanges(markdown);

        // 完全没变，跳过
        if (markdown === this.#lastRenderedData.markdown) return;

        // 提前更新标题数据（让 TOC 能立即获取）
        if (changes.headingsChanged) {
            this.#updateHeadingsSync(changes.newHeadings);
        }

        // 渲染 Markdown 为 HTML
        const html = this.renderMarkdown(markdown);

        // 智能更新 DOM
        this.#updateDOMSmart(html, changes);

        // 延迟处理元素（避免阻塞主线程）- 优化版：合并查询
        requestAnimationFrame(() => {
            // 使用 dom.js 统一查询，合并查询减少 DOM 遍历
            const allElements = dom.getAllIn(
                this.container,
                'pre code, pre:not(.has-copy-btn), img:not([data-error-handled])'
            );

            // 分类元素
            const codeBlocks = [];
            const mermaidBlocks = [];
            const preElements = [];
            const images = [];

            allElements.forEach(el => {
                if (el.tagName === 'CODE' && el.parentElement?.tagName === 'PRE') {
                    if (!el.classList.contains('prism-highlighted')) {
                        if (el.classList.contains('language-mermaid')) {
                            mermaidBlocks.push(el);
                        } else {
                            codeBlocks.push(el);
                        }
                    }
                } else if (el.tagName === 'PRE' && !el.classList.contains('has-copy-btn')) {
                    preElements.push(el);
                } else if (el.tagName === 'IMG') {
                    images.push(el);
                }
            });

            this.processAllElements(codeBlocks, mermaidBlocks, preElements, images, changes);

            // 更新缓存
            this.#lastRenderedData = {
                markdown,
                codeBlocks: changes.newCodeBlocks,
                mermaidBlocks: changes.newMermaidBlocks,
                mathBlocks: changes.newMathBlocks,
                headings: changes.newHeadings
            };
        });
    }

    /**
     * 检测内容变化（优化版：单次扫描 + 增量检测）
     * @param {string} newMarkdown - 新的 Markdown 文本
     * @returns {Object} 变化检测结果
     * @private
     */
    #detectChanges(newMarkdown) {
        const oldData = this.#lastRenderedData;

        // 单次扫描提取所有数据
        const extracted = this.#extractAllBlocks(newMarkdown);

        // 比较变化
        return {
            codeBlocksChanged: !this.#areMapsEqual(oldData.codeBlocks, extracted.codeBlocks),
            mermaidBlocksChanged: !this.#areMapsEqual(
                oldData.mermaidBlocks,
                extracted.mermaidBlocks
            ),
            mathBlocksChanged: !this.#areMapsEqual(oldData.mathBlocks, extracted.mathBlocks),
            headingsChanged: !this.#areArraysEqual(oldData.headings, extracted.headings),
            newCodeBlocks: extracted.codeBlocks,
            newMermaidBlocks: extracted.mermaidBlocks,
            newMathBlocks: extracted.mathBlocks,
            newHeadings: extracted.headings,
            // 新增：检测具体哪些数学公式发生了变化
            changedMathBlocks: this.#getChangedMathBlocks(oldData.mathBlocks, extracted.mathBlocks)
        };
    }

    /**
     * 单次扫描提取所有块（优化版：避免多次遍历）
     * @param {string} markdown - Markdown 文本
     * @returns {Object} 包含 codeBlocks, mermaidBlocks, mathBlocks, preElements, images, changes 的对象
     * @private
     */
    #extractAllBlocks(markdown) {
        const result = {
            codeBlocks: new Map(),
            mermaidBlocks: new Map(),
            mathBlocks: new Map(),
            headings: []
        };

        let codeIndex = 0,
            mermaidIndex = 0,
            mathIndex = 0;

        // 收集所有代码区域的范围（代码块 + 行内代码）
        const codeRanges = [];

        // 提取代码块
        const codeRegex = /```(\w*)\n([\s\S]*?)```/g;
        let match;
        while ((match = codeRegex.exec(markdown)) !== null) {
            const [fullMatch, lang = 'text', code] = match;
            codeRanges.push([match.index, match.index + fullMatch.length]);

            const hash = this.#generateSimpleHash(lang + code);
            if (lang === 'mermaid') {
                const trimmedCode = code.trim();
                const mermaidHash = this.#generateSimpleHash(trimmedCode);
                result.mermaidBlocks.set(mermaidHash, { code: trimmedCode, index: mermaidIndex++ });
            } else {
                result.codeBlocks.set(hash, { lang, code, index: codeIndex++ });
            }
        }

        // 提取行内代码
        const inlineCodeRegex = /`[^`\n]+?`/g;
        while ((match = inlineCodeRegex.exec(markdown)) !== null) {
            const pos = match.index;
            // 如果不在代码块内，则记录
            if (!codeRanges.some(([start, end]) => pos >= start && pos < end)) {
                codeRanges.push([pos, pos + match[0].length]);
            }
        }

        // 排序范围数组以便二分查找（性能优化）
        codeRanges.sort((a, b) => a[0] - b[0]);

        // 辅助函数：使用二分查找检查位置是否在代码区域（O(log n)）
        const isInCode = pos => {
            let left = 0,
                right = codeRanges.length - 1;
            while (left <= right) {
                const mid = (left + right) >> 1;
                const [start, end] = codeRanges[mid];
                if (pos >= start && pos < end) return true;
                if (pos < start) right = mid - 1;
                else left = mid + 1;
            }
            return false;
        };

        // 提取数学公式（块级和行内）
        const blockMathRegex = /\$\$([\s\S]*?)\$\$/g;
        while ((match = blockMathRegex.exec(markdown)) !== null) {
            if (!isInCode(match.index)) {
                const hash = this.#generateSimpleHash(match[1].trim());
                result.mathBlocks.set(hash, {
                    latex: match[1].trim(),
                    displayMode: true,
                    index: mathIndex++
                });
            }
        }

        const inlineMathRegex = /\$([^$\n]+?)\$/g;
        while ((match = inlineMathRegex.exec(markdown)) !== null) {
            if (!isInCode(match.index)) {
                const hash = this.#generateSimpleHash(match[1].trim());
                result.mathBlocks.set(hash, {
                    latex: match[1].trim(),
                    displayMode: false,
                    index: mathIndex++
                });
            }
        }

        // 提取标题（使用正则避免 split）
        const lines = markdown.split('\n');
        let inCodeBlock = false;
        for (const line of lines) {
            if (line.trim().startsWith('```')) {
                inCodeBlock = !inCodeBlock;
                continue;
            }
            if (inCodeBlock) continue;

            const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
            if (headingMatch) {
                // 保存级别和文本
                result.headings.push({
                    level: headingMatch[1].length,
                    text: headingMatch[2]
                });
            }
        }

        return result;
    }

    /**
     * 同步更新标题数据（在 DOM 渲染前）- 优化版：复用提取结果
     * @param headings
     * @private
     */
    #updateHeadingsSync(headings) {
        const headingsData = headings.map((heading, index) => {
            // heading 是 { level, text } 对象
            const { level, text } = heading;
            return {
                tagName: 'H' + level,
                textContent: text,
                id: 'heading-' + index,
                level
            };
        });

        // 立即同步更新 state
        this.state.setState({ headings: headingsData });
    }

    /**
     * 获取发生变化的数学公式（用于增量渲染）
     * @param {Map} oldMathBlocks - 旧的数学公式 Map
     * @param {Map} newMathBlocks - 新的数学公式 Map
     * @returns {Set} 发生变化的公式的哈希集合
     * @private
     */
    #getChangedMathBlocks(oldMathBlocks, newMathBlocks) {
        const changed = new Set();

        // 检测新增和修改的公式
        for (const [hash, data] of newMathBlocks) {
            const oldData = oldMathBlocks.get(hash);
            if (!oldData || oldData.latex !== data.latex || oldData.displayMode !== data.displayMode) {
                changed.add(hash);
            }
        }

        return changed;
    }

    /**
     * 比较两个 Map 是否相等
     * @param {Map} map1 - 第一个 Map
     * @param {Map} map2 - 第二个 Map
     * @returns {boolean} 是否相等
     * @private
     */
    #areMapsEqual(map1, map2) {
        if (map1.size !== map2.size) return false;
        for (const key of map1.keys()) {
            if (!map2.has(key)) return false;
        }
        return true;
    }

    /**
     * 比较两个数组是否相等
     * @param {Array} arr1 - 第一个数组
     * @param {Array} arr2 - 第二个数组
     * @returns {boolean} 是否相等
     * @private
     */
    #areArraysEqual(arr1, arr2) {
        if (arr1.length !== arr2.length) return false;

        // 标题数组元素是对象，需要深度比较
        for (let i = 0; i < arr1.length; i++) {
            const item1 = arr1[i];
            const item2 = arr2[i];

            // 如果都是对象（标题），比较 level 和 text
            if (item1 && item2 && typeof item1 === 'object' && typeof item2 === 'object') {
                if (item1.level !== item2.level || item1.text !== item2.text) {
                    return false;
                }
            } else {
                // 否则直接比较（简单类型或一个为 null）
                if (item1 !== item2) return false;
            }
        }

        return true;
    }

    /**
     * 批量处理所有 DOM 元素（优化版：简化逻辑 + 增量公式渲染）
     * @param codeBlocks
     * @param mermaidBlocks
     * @param preElements
     * @param images
     * @param changes
     */
    processAllElements(codeBlocks, mermaidBlocks, preElements, images, changes = null) {
        // 没有变化信息，处理所有元素
        if (!changes) {
            this.#highlightCode(codeBlocks);
            this.#renderMermaid(mermaidBlocks);
            this.#renderMath(null); // null 表示渲染所有
            this.#addCopyButtons(preElements);
            this.#markImages(images);
            return;
        }

        // 增量渲染：总是处理未高亮的代码块和未渲染的 Mermaid
        // 这样可以确保新内容被正确处理
        if (codeBlocks.length > 0) {
            this.#highlightCode(codeBlocks);
        }
        if (mermaidBlocks.length > 0) {
            this.#renderMermaid(mermaidBlocks);
        }
        // 优化：只渲染变化的数学公式
        if (changes.mathBlocksChanged) {
            this.#renderMath(changes.changedMathBlocks);
        }

        // 总是处理（因为 innerHTML 替换后会丢失）
        this.#addCopyButtons(preElements);
        this.#markImages(images);
    }

    // ==================== Markdown 渲染 ====================
    /**
     * 渲染 Markdown 为 HTML（性能优化版）
     * @param {string} markdown - Markdown 文本
     * @returns {string} HTML 字符串
     */
    renderMarkdown(markdown) {
        try {
            const mathBlocks = [];
            const supSubBlocks = [];
            const codeBlocks = [];
            const strikeBlocks = [];

            // 性能优化：按优先级处理，避免符号冲突
            let processedMarkdown = markdown
                // 第一步：保护代码块（避免内部符号被处理）
                .replace(/```[\s\S]*?```|`[^`\n]+?`/g, match => {
                    codeBlocks.push(match);
                    return `\x00CODE${codeBlocks.length - 1}\x00`;
                })
                // 第二步：保护数学公式（公式中可能包含 ^ 和 ~）
                .replace(/\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/g, (match, block, inline) => {
                    const latex = block !== undefined ? block : inline;
                    const displayMode = block !== undefined;
                    mathBlocks.push({ latex, displayMode });
                    return `\x02MATH${mathBlocks.length - 1}\x02`;
                })
                // 第三步：保护删除线 ~~text~~（避免被下标误匹配）
                .replace(/~~([^~\n]{1,200})~~/g, (match, content) => {
                    strikeBlocks.push(content);
                    return `\x03STRIKE${strikeBlocks.length - 1}\x03`;
                })
                // 第四步：提取上标 ^text^（限制长度，避免跨行）
                .replace(/\^([^\n^]{1,50})\^/g, (match, content) => {
                    supSubBlocks.push({ type: 'sup', content });
                    return `\x01SUP${supSubBlocks.length - 1}\x01`;
                })
                // 第五步：提取下标 ~text~（限制长度，避免跨行）
                // 此时删除线和数学公式已被保护，不会误匹配
                .replace(/~([^~\n]{1,50})~/g, (match, content) => {
                    supSubBlocks.push({ type: 'sub', content });
                    return `\x01SUB${supSubBlocks.length - 1}\x01`;
                });

            // 恢复代码块（在 marked 解析前）
            processedMarkdown = processedMarkdown.replace(
                /\x00CODE(\d+)\x00/g,
                (_, i) => codeBlocks[+i] // 使用 + 运算符代替 parseInt
            );

            // 使用 marked 解析
            let html;
            if (marked?.parse) {
                const renderer = new marked.Renderer();
                let headingIndex = 0;

                renderer.heading = (text, level) =>
                    `<h${level} id="heading-${headingIndex++}">${text}</h${level}>`;

                html = marked.parse(processedMarkdown, { renderer, breaks: false, gfm: true });
            } else {
                html = this.escapeHtml(processedMarkdown);
            }

            // 替换数学公式占位符
            html = html.replace(/\x02MATH(\d+)\x02/g, (_, index) => {
                const math = mathBlocks[+index]; // 使用 + 运算符代替 parseInt
                const tag = math.displayMode ? 'div' : 'span';
                const cls = math.displayMode ? 'math-block' : 'math-inline';
                return `<${tag} class="${cls}" data-latex="${math.latex}"></${tag}>`;
            });

            // 替换上标和下标占位符
            html = html.replace(/\x01(SUP|SUB)(\d+)\x01/g, (_, type, index) => {
                const item = supSubBlocks[+index]; // 使用 + 运算符代替 parseInt
                const tag = item.type === 'sup' ? 'sup' : 'sub';
                return `<${tag}>${item.content}</${tag}>`;
            });

            // 恢复删除线占位符
            html = html.replace(/\x03STRIKE(\d+)\x03/g, (_, index) => {
                return `<s>${strikeBlocks[+index]}</s>`; // 使用 + 运算符代替 parseInt
            });

            // 净化 HTML
            if (DOMPurify?.sanitize) {
                html = DOMPurify.sanitize(html, {
                    ALLOWED_TAGS: [
                        'p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote',
                        'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                        'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'img',
                        'input', 'span', 'div', 'dd', 'dt', 'dl', 's', 'sup', 'sub'
                    ],
                    ALLOWED_ATTR: [
                        'href', 'src', 'alt', 'title', 'class', 'id', 'type',
                        'checked', 'width', 'height', 'loading', 'colspan',
                        'rowspan', 'start', 'align', 'style'
                    ],
                    ALLOW_DATA_ATTR: true
                });
            }

            return html;
        } catch (e) {
            console.warn('Markdown 渲染失败:', e);
            return this.escapeHtml(markdown);
        }
    }

    // ==================== DOM 更新 ====================
    /**
     * 智能更新 DOM（优化版：使用 replaceChildren 减少重排）
     * @param newHTML
     * @param changes
     * @private
     */
    #updateDOMSmart(newHTML, changes) {
        // 首次渲染，使用 innerHTML（性能更好）
        if (!this.#lastRenderedData.markdown) {
            this.container.innerHTML = newHTML;
            this.#updateHeadingIds();
            return;
        }

        // 如果所有内容都变了，直接替换
        const allChanged =
            changes.codeBlocksChanged && changes.mermaidBlocksChanged && changes.mathBlocksChanged;
        if (allChanged) {
            this.container.innerHTML = newHTML;
            this.#updateHeadingIds();
            return;
        }

        // 部分内容未变，使用增量更新
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newHTML;

        // 构建旧元素的哈希映射
        const oldElements = this.#buildElementHashMaps();

        // 在新 HTML 中保留未变化的元素
        this.#preserveUnchangedElements(tempDiv, oldElements, changes);

        // 更新 DOM - 使用 replaceChildren 减少重排
        if (this.container.replaceChildren) {
            this.container.replaceChildren(...tempDiv.childNodes);
        } else {
            // 降级方案
            const fragment = document.createDocumentFragment();
            while (tempDiv.firstChild) {
                fragment.appendChild(tempDiv.firstChild);
            }
            this.container.innerHTML = '';
            this.container.appendChild(fragment);
        }

        // 更新标题 ID
        if (changes.headingsChanged) {
            this.#updateHeadingIds();
        }
    }

    /**
     * 构建旧元素的哈希映射（优化版：存储引用，延迟克隆）
     * @returns {Object} 包含 code, mermaid, math 映射的对象
     * @private
     */
    #buildElementHashMaps() {
        const maps = {
            code: new Map(),
            mermaid: new Map(),
            math: new Map()
        };

        // 使用 dom.js 统一查询，收集代码块（存储引用）
        const codeBlocks = dom.getAllIn(
            this.container,
            'pre code[class*="language-"]:not(.language-mermaid)'
        );
        codeBlocks.forEach(el => {
            const hash = this.#generateSimpleHash(el.textContent);
            maps.code.set(hash, el.parentElement);
        });

        // 收集 Mermaid 图表（存储引用）
        const mermaidBlocks = dom.getAllIn(this.container, 'div.mermaid[data-mermaid]');
        mermaidBlocks.forEach(el => {
            const text = el.getAttribute('data-mermaid');
            if (text) {
                const hash = this.#generateSimpleHash(text);
                maps.mermaid.set(hash, el);
            }
        });

        // 收集数学公式（存储引用）
        const mathBlocks = dom.getAllIn(
            this.container,
            '.math-block[data-latex], .math-inline[data-latex]'
        );
        mathBlocks.forEach(el => {
            const latex = el.getAttribute('data-latex');
            if (latex) {
                const hash = this.#generateSimpleHash(latex);
                maps.math.set(hash, el);
            }
        });

        return maps;
    }

    /**
     * 保留未变化的元素（优化版：只保留哈希匹配的元素，消除重复查询）
     * @param tempDiv
     * @param oldElements
     * @param changes
     * @private
     */
    #preserveUnchangedElements(tempDiv, oldElements, changes) {
        // 优化：预先查询一次所有元素，消除重复的 querySelectorAll
        const newCodeBlocks = dom.getAllIn(
            tempDiv,
            'pre code[class*="language-"]:not(.language-mermaid)'
        );
        const newMermaidBlocks = dom.getAllIn(tempDiv, 'pre code.language-mermaid');
        const newMathBlocks = dom.getAllIn(
            tempDiv,
            '.math-block[data-latex], .math-inline[data-latex]'
        );

        // 保留未变化的代码块（只有当整体未变时）
        if (!changes.codeBlocksChanged) {
            newCodeBlocks.forEach(newEl => {
                const hash = this.#generateSimpleHash(newEl.textContent);
                const oldPre = oldElements.code.get(hash);
                if (oldPre) {
                    newEl.parentElement.replaceWith(oldPre.cloneNode(true));
                }
            });
        } else {
            // 即使有变化，也保留哈希相同的元素
            newCodeBlocks.forEach(newEl => {
                const hash = this.#generateSimpleHash(newEl.textContent);
                if (changes.newCodeBlocks.has(hash) && oldElements.code.has(hash)) {
                    const oldPre = oldElements.code.get(hash);
                    newEl.parentElement.replaceWith(oldPre.cloneNode(true));
                }
            });
        }

        // 保留未变化的 Mermaid 图表
        if (!changes.mermaidBlocksChanged) {
            newMermaidBlocks.forEach(newEl => {
                const text = newEl.textContent.trim();
                const hash = this.#generateSimpleHash(text);
                const oldDiv = oldElements.mermaid.get(hash);
                // 只保留已完成渲染的图表
                if (oldDiv && oldDiv.classList.contains('mermaid-done')) {
                    newEl.parentElement.replaceWith(oldDiv.cloneNode(true));
                }
            });
        } else {
            // 即使有变化，也保留哈希相同且已渲染的元素
            newMermaidBlocks.forEach(newEl => {
                const text = newEl.textContent.trim();
                const hash = this.#generateSimpleHash(text);
                const oldDiv = oldElements.mermaid.get(hash);
                if (
                    changes.newMermaidBlocks.has(hash) &&
                    oldDiv &&
                    oldDiv.classList.contains('mermaid-done')
                ) {
                    newEl.parentElement.replaceWith(oldDiv.cloneNode(true));
                }
            });
        }

        // 保留未变化的数学公式（优化版：只保留真正未变化的公式）
        newMathBlocks.forEach(newEl => {
            const latex = newEl.getAttribute('data-latex');
            if (!latex) return;

            const hash = this.#generateSimpleHash(latex);
            const oldEl = oldElements.math.get(hash);

            // 只有当旧元素存在且未发生变化时才保留
            if (oldEl) {
                let shouldPreserve = false;

                if (!changes.mathBlocksChanged) {
                    // 没有任何公式变化，保留所有
                    shouldPreserve = true;
                } else if (changes.changedMathBlocks && !changes.changedMathBlocks.has(hash)) {
                    // 有变化但这个公式未变化，保留它
                    shouldPreserve = true;
                }

                if (shouldPreserve) {
                    newEl.replaceWith(oldEl.cloneNode(true));
                }
            }
        });
    }

    /**
     * 更新标题 ID（优化版：批量设置减少重排）
     * @private
     */
    #updateHeadingIds() {
        // 使用 dom.js 统一查询
        const headings = dom.getAllIn(this.container, 'h1, h2, h3, h4, h5, h6');
        const stateHeadings = this.state.get('headings');

        // 批量收集需要更新的元素
        const updates = [];
        headings.forEach((heading, index) => {
            if (stateHeadings[index]?.id && heading.id !== stateHeadings[index].id) {
                updates.push({ element: heading, id: stateHeadings[index].id });
            }
        });

        // 批量应用更新
        if (updates.length > 0) {
            requestAnimationFrame(() => {
                updates.forEach(({ element, id }) => {
                    element.id = id;
                });
            });
        }
    }

    // ==================== 代码块渲染组 ====================
    /**
     * 代码高亮（优化版：优先渲染可见元素）
     * @param codeBlocks
     * @private
     */
    #highlightCode(codeBlocks) {
        if (typeof Prism === 'undefined' || codeBlocks.length === 0) return;

        const blocks = Array.from(codeBlocks);

        if (!this.#intersectionObserver) {
            this.#highlightCodeBatch(blocks);
            return;
        }

        // 分离可见和不可见元素
        const { visible, invisible } = this.#partitionByVisibility(blocks);

        // 立即高亮可见元素
        visible.forEach(block => {
            if (!block.classList.contains('prism-highlighted')) {
                this.#highlightSingleBlock(block);
            }
        });

        // 监听不可见元素
        invisible.forEach(block => {
            this.#pendingCodeBlocks.add(block);
            this.#intersectionObserver.observe(block);
        });

        // 延迟渲染剩余的代码块（类似 Mermaid 的 1 秒延迟）
        if (invisible.length > 0) {
            if (this.#codeHighlightTimer) {
                clearTimeout(this.#codeHighlightTimer);
            }
            this.#codeHighlightTimer = setTimeout(() => {
                const pending = Array.from(this.#pendingCodeBlocks);
                const validPending = [];

                // 过滤有效元素并清理无效元素
                pending.forEach(block => {
                    if (block.isConnected && !block.classList.contains('prism-highlighted')) {
                        validPending.push(block);
                    } else {
                        this.#pendingCodeBlocks.delete(block);
                    }
                });

                if (validPending.length > 0) {
                    this.#highlightCodeBatch(validPending);
                    validPending.forEach(block => {
                        this.#pendingCodeBlocks.delete(block);
                        if (this.#intersectionObserver) {
                            this.#intersectionObserver.unobserve(block);
                        }
                    });
                }

                this.#codeHighlightTimer = null;
            }, 1000);
        }
    }

    /**
     * 按可见性分类元素
     * @param {Array<Element>} elements - 元素数组
     * @returns {Object} 包含 visible 和 invisible 数组的对象
     * @private
     */
    #partitionByVisibility(elements) {
        const visible = [];
        const invisible = [];
        elements.forEach(el => {
            (this.#isElementVisible(el) ? visible : invisible).push(el);
        });
        return { visible, invisible };
    }

    /**
     * 高亮单个代码块
     * @param block
     * @private
     */
    #highlightSingleBlock(block) {
        try {
            Prism.highlightElement(block);
            block.classList.add('prism-highlighted');
        } catch (err) {
            console.warn('代码高亮失败:', err);
            block.classList.add('prism-highlighted'); // 标记为已处理
        }
    }

    /**
     * 批量高亮代码（降级方案）
     * @param blocks
     * @private
     */
    #highlightCodeBatch(blocks) {
        const BATCH_SIZE = 30;
        let index = 0;

        const processBatch = () => {
            const end = Math.min(index + BATCH_SIZE, blocks.length);

            while (index < end) {
                const block = blocks[index];
                if (!block.classList.contains('prism-highlighted')) {
                    this.#highlightSingleBlock(block);
                }
                index++;
            }

            if (index < blocks.length) {
                if (typeof requestIdleCallback !== 'undefined') {
                    requestIdleCallback(processBatch, { timeout: 100 });
                } else {
                    setTimeout(processBatch, 16);
                }
            }
        };

        requestAnimationFrame(processBatch);
    }

    /**
     * 添加复制按钮（优化版：简化逻辑）
     * @param preElements
     * @private
     */
    #addCopyButtons(preElements) {
        if (preElements.length === 0) return;

        preElements.forEach(pre => {
            // 跳过已处理的
            if (!pre.parentNode || pre.parentElement?.classList.contains('code-block-wrapper')) {
                return;
            }

            // 创建包装器
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';
            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(pre);

            // 添加复制按钮
            const btn = this.createElement('button', {
                className: 'md-btn md-btn-sm code-copy-btn',
                textContent: '📋',
                attributes: { title: '复制代码' },
                parent: wrapper
            });

            this.addEventListener(btn, 'click', e => {
                e.preventDefault();
                e.stopPropagation();

                // 使用 dom.js 统一查询
                const code = dom.getIn(pre, 'code');
                if (!code || btn.classList.contains('copied')) return;

                navigator.clipboard
                    .writeText(code.textContent)
                    .then(() => {
                        btn.innerHTML = '✓';
                        btn.classList.add('copied');
                        setTimeout(() => {
                            btn.innerHTML = '📋';
                            btn.classList.remove('copied');
                        }, 2000);
                    })
                    .catch(err => console.error('复制失败:', err));
            });
        });
    }

    // ==================== Mermaid 渲染组 ====================
    /**
     * 渲染 Mermaid 图表（优化版：优先渲染可见图表）
     * @param mermaidBlocks
     * @private
     */
    #renderMermaid(mermaidBlocks) {
        if (typeof mermaid === 'undefined' || mermaidBlocks.length === 0) return;
        if (this.container.offsetParent === null) return;

        const blocks = Array.from(mermaidBlocks);

        if (!this.#intersectionObserver) {
            this.#renderMermaidBatch(blocks);
            return;
        }

        // 转换为 mermaid div 并分类
        const divs = blocks.map(block => this.#createMermaidDiv(block)).filter(Boolean);
        const { visible, invisible } = this.#partitionByVisibility(divs);

        // 立即渲染可见图表
        if (visible.length > 0) {
            this.#renderMermaidDivs(visible);
        }

        // 监听不可见图表
        invisible.forEach(div => {
            div.classList.add('mermaid-pending');
            this.#pendingMermaidBlocks.add(div);
            this.#intersectionObserver.observe(div);
        });

        // 延迟渲染剩余的 Mermaid（取消旧定时器避免重复）
        if (invisible.length > 0) {
            if (this.#mermaidRenderTimer) {
                clearTimeout(this.#mermaidRenderTimer);
            }
            this.#mermaidRenderTimer = setTimeout(() => {
                const pending = Array.from(this.#pendingMermaidBlocks);
                const validPending = [];

                // 一次遍历：过滤有效元素并清理无效元素
                pending.forEach(div => {
                    if (div.isConnected) {
                        validPending.push(div);
                    } else {
                        this.#pendingMermaidBlocks.delete(div);
                    }
                });

                if (validPending.length > 0) {
                    this.#renderMermaidDivs(validPending);
                    validPending.forEach(div => {
                        div.classList.remove('mermaid-pending');
                        this.#pendingMermaidBlocks.delete(div);
                        if (this.#intersectionObserver) {
                            this.#intersectionObserver.unobserve(div);
                        }
                    });
                }

                this.#mermaidRenderTimer = null;
            }, 1000);
        }
    }

    /**
     * 创建 Mermaid div
     * @param {Object} block - Mermaid 块对象
     * @returns {Element} 创建的 div 元素
     * @private
     */
    #createMermaidDiv(block) {
        const code = block.textContent.trim();
        if (!code) return null;

        const preElement = block.parentElement;
        if (!preElement?.parentNode) return null;

        // 如果已经是 mermaid div（从旧内容保留的），清除渲染状态强制重新渲染
        if (preElement.classList && preElement.classList.contains('mermaid')) {
            preElement.classList.remove('mermaid-done', 'mermaid-pending', 'render-error');
            preElement.textContent = code;
            preElement.setAttribute('data-mermaid', code);
            return preElement;
        }

        const mermaidDiv = document.createElement('div');
        mermaidDiv.className = 'mermaid';
        mermaidDiv.textContent = code;
        mermaidDiv.setAttribute('data-mermaid', code);

        preElement.parentNode.replaceChild(mermaidDiv, preElement);
        return mermaidDiv;
    }

    /**
     * 渲染单个 Mermaid 图表
     * @param mermaidDiv
     * @private
     */
    #renderSingleMermaid(mermaidDiv) {
        mermaidDiv.classList.remove('mermaid-pending');
        this.#renderMermaidDivs([mermaidDiv]);
    }

    /**
     * 渲染 Mermaid div 列表
     * @param {Array<Element>} containers - 容器元素数组
     * @returns {void}
     * @private
     */
    /**
     * 渲染 Mermaid div 列表
     * @param {Array<Element>} containers - 容器元素数组
     * @returns {Promise<void>}
     * @private
     */
    async #renderMermaidDivs(containers) {
        if (containers.length === 0) return;

        const timeoutId = this.#setupMermaidTimeout(containers);
        this.#mermaidTimeoutIds.push(timeoutId);

        // 使用 Promise.allSettled 批量渲染，确保单个失败不影响其他
        const results = await Promise.allSettled(
            containers.map(container =>
                mermaid.run({ nodes: [container] })
                    .then(() => ({ container, success: true }))
                    .catch(err => ({ container, success: false, error: err }))
            )
        );

        results.forEach(result => {
            if (result.status === 'fulfilled') {
                const { container, success, error } = result.value;
                if (success) {
                    this.#handleMermaidSuccess([container], timeoutId);
                } else {
                    this.#handleMermaidError([container], timeoutId, error);
                }
            }
        });

        this.#clearMermaidTimeout(timeoutId);
    }

    /**
     * 设置 Mermaid 超时
     * @param {Array<Element>} containers - 容器元素数组
     * @returns {number} 超时 ID
     * @private
     */
    #setupMermaidTimeout(containers) {
        const timeoutId = setTimeout(() => {
            containers.forEach(c => {
                if (!c.classList.contains('mermaid-done')) {
                    c.textContent = '图表渲染超时';
                    c.classList.add('render-error');
                }
            });
            this.#clearMermaidTimeout(timeoutId);
        }, 5000);
        return timeoutId;
    }

    /**
     * 处理 Mermaid 成功
     * @param containers
     * @param timeoutId
     * @private
     */
    #handleMermaidSuccess(containers, timeoutId) {
        clearTimeout(timeoutId);
        containers.forEach(c => c.classList.add('mermaid-done'));
        this.#clearMermaidTimeout(timeoutId);
    }

    /**
     * 处理 Mermaid 错误
     * @param containers
     * @param timeoutId
     * @param err
     * @private
     */
    #handleMermaidError(containers, timeoutId, err) {
        clearTimeout(timeoutId);
        console.warn('Mermaid 渲染失败:', err);
        containers.forEach(c => {
            c.textContent = '图表渲染失败: ' + err.message;
            c.classList.add('render-error');
        });
        this.#clearMermaidTimeout(timeoutId);
    }

    /**
     * 批量渲染 Mermaid（降级方案）
     * @param {Array} blocks - Mermaid 块数组
     * @returns {Promise<void>}
     * @private
     */
    async #renderMermaidBatch(blocks) {
        if (this.state.get('isRenderingMermaid')) return;

        this.state.setRenderingState(true);

        const containers = blocks.map(block => this.#createMermaidDiv(block)).filter(Boolean);

        if (containers.length === 0) {
            this.state.setRenderingState(false);
            return;
        }

        // 复用 #renderMermaidDivs 的逻辑
        await this.#renderMermaidDivs(containers);
        this.state.setRenderingState(false);
    }

    /**
     * 清理 Mermaid 超时定时器
     * @param timeoutId
     * @private
     */
    #clearMermaidTimeout(timeoutId) {
        const index = this.#mermaidTimeoutIds.indexOf(timeoutId);
        if (index > -1) {
            this.#mermaidTimeoutIds.splice(index, 1);
        }
    }

    /**
     * 更新 Mermaid 主题
     */
    updateMermaidTheme() {
        this.#configureMermaid(this.state.get('interface').theme);

        // 使用 dom.js 统一查询，重新渲染已有的 Mermaid 图表
        const mermaidDivs = dom.getAllIn(this.container, 'div.mermaid[data-mermaid]');
        if (mermaidDivs.length === 0) return;

        const containers = [];
        mermaidDivs.forEach(oldDiv => {
            const code = oldDiv.getAttribute('data-mermaid');
            if (!code) return;

            const newDiv = document.createElement('div');
            newDiv.className = 'mermaid';
            newDiv.textContent = code;
            newDiv.setAttribute('data-mermaid', code);

            oldDiv.replaceWith(newDiv);
            containers.push(newDiv);
        });

        if (containers.length > 0) {
            mermaid.run({ nodes: containers }).catch(err => {
                console.warn('Mermaid 主题切换失败:', err);
            });
        }
    }

    // ==================== 公式渲染组 ====================
    /**
     * 渲染数学公式（优化版：增量渲染 + 可见性优化）
     * @param {Set|null} changedHashes - 发生变化的公式哈希集合，null 表示渲染所有
     * @private
     */
    #renderMath(changedHashes = null) {
        if (typeof katex === 'undefined') return;

        // 使用 dom.js 统一查询所有数学公式元素
        const mathElements = dom.getAllIn(
            this.container,
            '.math-block:not(.math-rendered), .math-inline:not(.math-rendered)'
        );

        // 过滤出需要渲染的公式
        const elementsToRender = [];
        mathElements.forEach(el => {
            // 如果已经渲染过，且不在变化集合中，则跳过
            if (el.classList.contains('math-rendered')) {
                if (changedHashes) {
                    const latex = el.getAttribute('data-latex');
                    if (latex) {
                        const hash = this.#generateSimpleHash(latex);
                        if (!changedHashes.has(hash)) {
                            return; // 跳过未变化的公式
                        }
                    }
                } else {
                    return; // 没有变化信息，跳过已渲染的
                }
            }

            const latex = el.getAttribute('data-latex');
            if (!latex) return;

            elementsToRender.push(el);
        });

        if (elementsToRender.length === 0) return;

        // 如果没有 IntersectionObserver，直接批量渲染
        if (!this.#intersectionObserver) {
            this.#renderMathBatch(elementsToRender);
            return;
        }

        // 分离可见和不可见元素
        const { visible, invisible } = this.#partitionByVisibility(elementsToRender);

        // 立即渲染可见公式
        visible.forEach(el => {
            this.#renderSingleMath(el);
        });

        // 监听不可见公式
        invisible.forEach(el => {
            el.classList.add('math-pending');
            this.#pendingMathBlocks.add(el);
            this.#intersectionObserver.observe(el);
        });

        // 延迟渲染剩余的公式（类似代码块和 Mermaid 的 1 秒延迟）
        if (invisible.length > 0) {
            if (this.#mathRenderTimer) {
                clearTimeout(this.#mathRenderTimer);
            }
            this.#mathRenderTimer = setTimeout(() => {
                const pending = Array.from(this.#pendingMathBlocks);
                const validPending = [];

                // 过滤有效元素并清理无效元素
                pending.forEach(el => {
                    if (el.isConnected && !el.classList.contains('math-rendered')) {
                        validPending.push(el);
                    } else {
                        this.#pendingMathBlocks.delete(el);
                    }
                });

                if (validPending.length > 0) {
                    this.#renderMathBatch(validPending);
                    validPending.forEach(el => {
                        el.classList.remove('math-pending');
                        this.#pendingMathBlocks.delete(el);
                        if (this.#intersectionObserver) {
                            this.#intersectionObserver.unobserve(el);
                        }
                    });
                }

                this.#mathRenderTimer = null;
            }, 1000);
        }
    }

    /**
     * 渲染单个数学公式
     * @param {Element} element - 数学公式元素
     * @private
     */
    #renderSingleMath(element) {
        const latex = element.getAttribute('data-latex');
        if (!latex) return;

        try {
            katex.render(latex, element, {
                displayMode: element.classList.contains('math-block'),
                throwOnError: false,
                errorColor: '#cc0000'
            });
            element.classList.add('math-rendered');
            element.classList.remove('math-error', 'math-pending'); // 清除可能的错误状态
        } catch (err) {
            console.warn('KaTeX 渲染失败:', err);
            element.textContent = latex;
            element.classList.add('math-error');
            element.classList.add('math-rendered'); // 标记为已处理，避免重复尝试
        }
    }

    /**
     * 批量渲染数学公式（降级方案）
     * @param {Array<Element>} elements - 数学公式元素数组
     * @private
     */
    #renderMathBatch(elements) {
        const BATCH_SIZE = 50;
        let index = 0;

        const processBatch = () => {
            const end = Math.min(index + BATCH_SIZE, elements.length);

            while (index < end) {
                const el = elements[index];
                if (!el.classList.contains('math-rendered')) {
                    this.#renderSingleMath(el);
                }
                index++;
            }

            if (index < elements.length) {
                if (typeof requestIdleCallback !== 'undefined') {
                    requestIdleCallback(processBatch, { timeout: 100 });
                } else {
                    setTimeout(processBatch, 16);
                }
            }
        };

        requestAnimationFrame(processBatch);
    }

    // ==================== 图片处理 ====================

    /**
     * 标记图片已处理
     * @param {Array<HTMLImageElement>} images - 图片元素数组
     * @returns {void}
     * @private
     */
    #markImages(images) {
        images.forEach(img => (img.dataset.errorHandled = 'true'));
    }

    /**
     * 处理图片加载错误
     * @param {HTMLImageElement} img - 图片元素
     * @returns {void}
     */
    handleImageError(img) {
        img.alt = `图片加载失败: ${img.src}`;
        img.classList.add('markdown-image-error');
    }

    // ==================== 工具函数 ====================

    /**
     * 生成简单哈希（用于差异检测）- 优化版：只取前256字符
     * @param {string} str - 要哈希的字符串
     * @returns {number} 哈希值
     * @private
     */
    #generateSimpleHash(str) {
        let hash = 0;
        const len = Math.min(str.length, 256);
        for (let i = 0; i < len; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString(36);
    }

    /**
     * 检查元素是否可见
     * @param {Element} element - 要检查的元素
     * @returns {boolean} 是否可见
     * @private
     */
    #isElementVisible(element) {
        const rect = element.getBoundingClientRect();
        const buffer = Preview.#VISIBILITY_BUFFER;
        return rect.top < window.innerHeight + buffer && rect.bottom > -buffer;
    }

    // ==================== 导出功能 ====================
    /**
     * 导出为 HTML（直接使用渲染好的内容）
     * @returns {void}
     */
    exportHTML() {
        // 直接获取预览容器中已经渲染好的 HTML
        let html = this.container.innerHTML;

        // 清理不需要的属性和类
        html = html
            .replace(/ class="prism-highlighted"/g, '')
            .replace(/ class="mermaid-done"/g, '')
            .replace(/ data-error-handled="true"/g, '')
            .replace(/ class="math-rendered"/g, '');

        const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Markdown 导出</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Helvetica,Arial,sans-serif;line-height:1.6;max-width:900px;margin:0 auto;padding:20px;color:#24292e;word-wrap:break-word}
pre{background:#f3f4f6;padding:16px;margin:0;border-radius:6px;overflow-x:auto;min-height:3em;box-sizing:border-box}
code{padding:.2em .4em;margin:0;font-size:85%;background:rgba(0,0,0,.06);border-radius:3px;font-family:"SFMono-Regular",Consolas,"Liberation Mono",Menlo,monospace;color:#24292e}
pre code{padding:0;margin:0;background:transparent;border-radius:0;font-size:inherit;display:inline-block;min-width:100%;line-height:1.5;box-sizing:border-box}
blockquote{padding:0 1em;color:#6a737d;border-left:.25em solid #dfe2e5;margin:0 0 16px}
blockquote>:first-child{margin-top:0}
blockquote>:last-child{margin-bottom:0}
table{border-spacing:0;border-collapse:collapse;margin-top:0;margin-bottom:16px;width:100%;max-width:100%;overflow-x:auto;display:block}
table th{font-weight:600;background:#f3f4f6}
table th,table td{padding:6px 13px;border:1px solid #dfe2e5}
table tr{background:#fff;border-top:1px solid #c6cbd1}
table tr:nth-child(2n){background:#f3f4f6}
img{max-width:100%;height:auto}
a{color:#0366d6;text-decoration:none}
a:hover{text-decoration:underline}
h1,h2,h3,h4,h5,h6{margin-top:24px;margin-bottom:16px;font-weight:600;line-height:1.25}
h1{font-size:2em;padding-bottom:.3em;border-bottom:1px solid #e0e0e0}
h2{font-size:1.75em;padding-bottom:.3em;border-bottom:1px solid #e0e0e0}
h3{font-size:1.5em}
h4{font-size:1.25em}
h5{font-size:1.1em}
h6{font-size:1em;color:#6a737d}
p{margin-top:0;margin-bottom:16px}
ul,ol{margin-top:0;margin-bottom:16px;padding-left:2em}
li{margin-top:.25em}
hr{height:.25em;padding:0;margin:24px 0;background:#e1e4e8;border:0}
.mermaid{text-align:center;margin:1.5em 0;background:#fff;padding:10px;border-radius:6px}
/* Prism 代码高亮样式*/
.token.comment,.token.prolog,.token.doctype,.token.cdata{color:#6a737d}.token.punctuation{color:#24292e}.token.property,.token.tag,.token.boolean,.token.number,.token.constant,.token.symbol,.token.deleted{color:#0366d6}.token.selector,.token.attr-name,.token.string,.token.char,.token.builtin,.token.inserted{color:#22863a}.token.operator,.token.entity,.token.url,.language-css .token.string,.style .token.string{color:#d73a49}.token.atrule,.token.attr-value,.token.keyword{color:#6f42c1}.token.function,.token.class-name{color:#6f42c1}.token.regex,.token.important,.token.variable{color:#e90fc9}
/* 代码块包装器和复制按钮*/
.code-block-wrapper{position:relative;margin:16px 0}
.code-copy-btn{position:absolute;top:8px;right:8px;padding:4px 8px;font-size:12px;opacity:0;transition:opacity .2s;z-index:10;cursor:pointer;border:1px solid #dfe2e5;background:#fff;border-radius:3px}
.code-block-wrapper:hover .code-copy-btn,.code-copy-btn:hover{opacity:1}
.code-copy-btn.copied{background:#4caf50;color:#fff;border-color:#4caf50}
/* KaTeX 数学公式样式*/
.katex-display{margin:1em 0;overflow-x:auto}.katex{font-size:1.1em}.katex-display>.katex{white-space:nowrap}.katex-display{overflow-x:auto;overflow-y:hidden;padding:.5em 0}
</style>
</head>
<body>
${html}
</body>
</html>`;

        this.downloadFile(fullHtml, 'text/html', '.html');
        this.showMessage('HTML 导出成功', 'success');
    }

    /**
     * 导出为 Markdown
     * @returns {void}
     */
    exportMarkdown() {
        const content = this.state.get('content');
        this.downloadFile(content, 'text/markdown', '.md');
        this.showMessage('Markdown 导出成功', 'success');
    }

    /**
     * 导出为 PDF（使用浏览器打印功能）
     * @returns {void}
     */
    exportPDF() {
        const content = this.state.get('content');
        if (!content) {
            this.showMessage('没有内容可导出', 'warning');
            return;
        }

        // 添加打印专用类，用于优化打印样式
        document.body.classList.add('printing-pdf');

        // 触发浏览器打印对话框
        window
            .print()
            .then(() => {
                // 打印完成后移除打印类
                document.body.classList.remove('printing-pdf');
            })
            .catch(error => {
                console.error('打印失败:', error);
                document.body.classList.remove('printing-pdf');
                this.showMessage('打印失败: ' + error.message, 'error');
            });

        this.showMessage('请在打印对话框中选择"另存为 PDF"', 'info');
    }

    /**
     * 下载文件
     * @param {string} content - 文件内容
     * @param {string} mimeType - MIME 类型
     * @param {string} extension - 文件扩展名
     * @returns {void}
     */
    downloadFile(content, mimeType, extension) {
        const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'document-' + new Date().toISOString().slice(0, 10) + extension;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    // ==================== 清理 ====================
    /**
     * 销毁组件，清理资源
     */
    destroy() {
        // 清理渲染定时器
        if (this.renderTimeout) {
            clearTimeout(this.renderTimeout);
            this.renderTimeout = null;
        }

        // 清理所有 Mermaid 超时定时器
        this.#mermaidTimeoutIds.forEach(timeoutId => {
            clearTimeout(timeoutId);
        });
        this.#mermaidTimeoutIds = [];

        // 清理 Mermaid 渲染定时器
        if (this.#mermaidRenderTimer) {
            clearTimeout(this.#mermaidRenderTimer);
            this.#mermaidRenderTimer = null;
        }

        // 清理代码高亮定时器
        if (this.#codeHighlightTimer) {
            clearTimeout(this.#codeHighlightTimer);
            this.#codeHighlightTimer = null;
        }

        // 清理数学公式渲染定时器
        if (this.#mathRenderTimer) {
            clearTimeout(this.#mathRenderTimer);
            this.#mathRenderTimer = null;
        }

        // 清理 IntersectionObserver
        if (this.#intersectionObserver) {
            this.#intersectionObserver.disconnect();
            this.#intersectionObserver = null;
        }

        // 清理待处理集合
        this.#pendingCodeBlocks.clear();
        this.#pendingMermaidBlocks.clear();
        this.#pendingMathBlocks.clear();

        super.destroy();
    }
}
