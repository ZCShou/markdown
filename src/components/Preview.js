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

// Prism 语言懒加载映射
const LANG_MAP = {
    javascript: () => import('prismjs/components/prism-javascript'),
    js: () => import('prismjs/components/prism-javascript'),
    typescript: () => import('prismjs/components/prism-typescript'),
    ts: () => import('prismjs/components/prism-typescript'),
    python: () => import('prismjs/components/prism-python'),
    java: () => import('prismjs/components/prism-java'),
    c: () => import('prismjs/components/prism-c'),
    cpp: () => import('prismjs/components/prism-cpp'),
    csharp: () => import('prismjs/components/prism-csharp'),
    go: () => import('prismjs/components/prism-go'),
    rust: () => import('prismjs/components/prism-rust'),
    ruby: () => import('prismjs/components/prism-ruby'),
    swift: () => import('prismjs/components/prism-swift'),
    kotlin: () => import('prismjs/components/prism-kotlin'),
    scala: () => import('prismjs/components/prism-scala'),
    sql: () => import('prismjs/components/prism-sql'),
    bash: () => import('prismjs/components/prism-bash'),
    shell: () => import('prismjs/components/prism-bash'),
    json: () => import('prismjs/components/prism-json'),
    yaml: () => import('prismjs/components/prism-yaml'),
    toml: () => import('prismjs/components/prism-toml'),
    html: () => import('prismjs/components/prism-markup'),
    xml: () => import('prismjs/components/prism-markup'),
    markup: () => import('prismjs/components/prism-markup'),
    markdown: () => import('prismjs/components/prism-markdown'),
    jsx: () => import('prismjs/components/prism-jsx'),
    tsx: () => import('prismjs/components/prism-tsx'),
    docker: () => import('prismjs/components/prism-docker'),
    makefile: () => import('prismjs/components/prism-makefile'),
    nginx: () => import('prismjs/components/prism-nginx'),
    perl: () => import('prismjs/components/prism-perl'),
    lua: () => import('prismjs/components/prism-lua'),
    r: () => import('prismjs/components/prism-r'),
    matlab: () => import('prismjs/components/prism-matlab'),
    groovy: () => import('prismjs/components/prism-groovy')
};

const loadedLangs = new Set(['css', 'clike']); // Prism 内置

async function loadLanguage(lang) {
    const key = lang?.toLowerCase();
    if (!key || loadedLangs.has(key) || !LANG_MAP[key]) return true;
    try {
        await LANG_MAP[key]();
        loadedLangs.add(key);
        return true;
    } catch {
        return false;
    }
}

/**
 *
 */
export class Preview extends BaseComponent {
    // ==================== 私有字段声明 ====================

    /** @private */
    #lastRenderedData;
    /** @private */
    #lastRenderedContent = '';
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

        // 上次渲染的完整内容（用于避免重复渲染）
        this.#lastRenderedContent = '';

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
            logLevel: 'error',
            // 🔥 性能优化配置
            maxTextSize: 99999, // 限制文本大小，避免超大文本导致性能问题
            maxEdges: 999, // 限制边数量，避免复杂图导致渲染缓慢
            flowchart: {
                curve: 'basis' // 使用更平滑的曲线，提升渲染性能
            },
            sequence: {
                useMaxWidth: true // 启用最大宽度限制，避免图表过宽
            },
            gantt: {
                useMaxWidth: true // 启用最大宽度限制
            }
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
                        // 🔥 优化：先检查是否已在处理中，避免重复
                        if (element.tagName === 'CODE' &&
                            this.#pendingCodeBlocks.has(element) &&
                            !element.classList.contains('prism-highlighted')) {
                            this.#pendingCodeBlocks.delete(element);
                            this.#intersectionObserver.unobserve(element);
                            this.#highlightSingleBlock(element);
                        }

                        // 处理 Mermaid 渲染
                        // 🔥 优化：先检查是否已在处理中，避免重复
                        if (element.classList.contains('mermaid-pending') &&
                            !element.classList.contains('mermaid-done') &&
                            !element.classList.contains('mermaid-rendering')) {
                            this.#pendingMermaidBlocks.delete(element);
                            this.#intersectionObserver.unobserve(element);
                            this.#renderSingleMermaidDiv(element);
                        }

                        // 处理数学公式渲染
                        // 🔥 优化：先检查是否已在处理中，避免重复
                        if (element.classList.contains('math-pending') &&
                            !element.classList.contains('math-rendered')) {
                            this.#pendingMathBlocks.delete(element);
                            this.#intersectionObserver.unobserve(element);
                            this.#renderSingleMath(element);
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
        const unsubscribeContent = this.state.subscribeTo(
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

        // 订阅导出事件
        const unsubscribeExport = this.state.subscribeTo('export:trigger', (type) => {
            switch (type) {
                case 'html':
                    this.exportHTML();
                    break;
                case 'md':
                    this.exportMarkdown();
                    break;
                case 'pdf':
                    this.exportPDF();
                    break;
                default:
                    console.warn('Unknown export type:', type);
            }
        });

        // 合并取消订阅函数
        this.unsubscribe = () => {
            unsubscribeContent();
            unsubscribeExport();
        };
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 图片加载成功处理
        this.addEventListener(
            this.container,
            'load',
            e => {
                if (e.target.tagName === 'IMG') {
                    e.target.dataset.loadStatus = 'success';
                }
            },
            true
        );

        // 图片加载错误处理
        this.addEventListener(
            this.container,
            'error',
            e => {
                if (e.target.tagName === 'IMG') {
                    const img = e.target;
                    img.alt = `图片加载失败: ${img.src}`;
                    img.dataset.loadStatus = 'error';
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

        // 避免重复渲染（但允许初始渲染）
        if (content === this.#lastRenderedContent && this.#lastRenderedContent !== '') return;

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
            this.#lastRenderedContent = content;
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
        this.#lastRenderedContent = content;
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

        // 渲染 Markdown 为 HTML
        const html = this.renderMarkdown(markdown);

        // 如果标题有变化，更新 state（让 TOC 能获取到最新数据）
        if (changes.changedHeadingsData) {
            this.#updateHeadingsSync(changes.newHeadings, changes.changedHeadingsData);
        }

        // 智能更新 DOM，同时收集需要处理的元素
        const elementsToProcess = this.#updateDOM(html, changes);

        // 延迟处理元素（避免阻塞主线程）
        requestAnimationFrame(() => {
            // 直接使用已收集的元素，避免重复 DOM 查询
            if (elementsToProcess) {
                if (elementsToProcess.pendingCodeBlocks.length > 0) {
                    this.#highlightCode(elementsToProcess.pendingCodeBlocks);
                }
                if (elementsToProcess.pendingMermaidBlocks.length > 0) {
                    this.#renderMermaid(elementsToProcess.pendingMermaidBlocks);
                }
                if (elementsToProcess.pendingMathElements.length > 0) {
                    this.#renderMath(elementsToProcess.pendingMathElements);
                }
                if (elementsToProcess.pendingCopyBtn.length > 0) {
                    this.#addCopyButtons(elementsToProcess.pendingCopyBtn);
                }
            }

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
        const codeBlocks = new Map();
        const mermaidBlocks = new Map();
        const mathBlocks = new Map();
        const headings = [];

        let codeIndex = 0, mermaidIndex = 0, mathIndex = 0;
        const codeBlockRanges = [];

        // 第一步：提取代码块（包括 mermaid），并记录位置
        // 修复：支持更多语言标识符（如 c++、c#），允许可选的空白字符
        const codeBlockRegex = /```(\S*)[ \t]*\n([\s\S]*?)```/g;
        let match;
        while ((match = codeBlockRegex.exec(newMarkdown)) !== null) {
            const [fullMatch] = match;
            const startIndex = match.index;
            const endIndex = startIndex + fullMatch.length;

            // 记录代码块位置范围（用于排除标题提取）
            codeBlockRanges.push({ start: startIndex, end: endIndex });

            const [, lang, content] = match;
            if (lang === 'mermaid') {
                const trimmedCode = content.trim();
                const mermaidHash = this.#generateSimpleHash(trimmedCode);
                const compositeKey = `${mermaidHash}_idx_${mermaidIndex}`;
                mermaidBlocks.set(compositeKey, { code: trimmedCode, index: mermaidIndex++ });
            } else {
                const hash = this.#generateSimpleHash(lang + content);
                const compositeKey = `${hash}_idx_${codeIndex}`;
                codeBlocks.set(compositeKey, { lang: lang || 'text', code: content, index: codeIndex++ });
            }
        }

        // 第二步：提取数学公式（块级和行内）
        const mathRegex = /\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/g;
        while ((match = mathRegex.exec(newMarkdown)) !== null) {
            const [, blockMath, inlineMath] = match;
            if (blockMath !== undefined) {
                const hash = this.#generateSimpleHash(blockMath.trim());
                const compositeKey = `${hash}_idx_${mathIndex}`;
                mathBlocks.set(compositeKey, {
                    latex: blockMath.trim(),
                    displayMode: true,
                    index: mathIndex++
                });
            } else if (inlineMath !== undefined) {
                const hash = this.#generateSimpleHash(inlineMath.trim());
                const compositeKey = `${hash}_idx_${mathIndex}`;
                mathBlocks.set(compositeKey, {
                    latex: inlineMath.trim(),
                    displayMode: false,
                    index: mathIndex++
                });
            }
        }

        // 第三步：提取标题（排除代码块内的）
        const headingRegex = /^(#{1,6})\s+(.+)$/gm;
        while ((match = headingRegex.exec(newMarkdown)) !== null) {
            const matchIndex = match.index;
            const [, hashes, headingText] = match;

            // 检查标题是否在代码块内
            const isInCodeBlock = codeBlockRanges.some(
                range => matchIndex >= range.start && matchIndex < range.end
            );

            // 只提取代码块外的标题
            if (!isInCodeBlock) {
                headings.push({
                    level: hashes.length,
                    text: headingText
                });
            }
        }

        // 比较变化，并记录具体哪些元素发生了变化
        const changedCodeBlocks = this.#findChangedMapEntries(oldData.codeBlocks, codeBlocks);
        const changedMermaidBlocks = this.#findChangedMapEntries(oldData.mermaidBlocks, mermaidBlocks);
        const changedMathBlocks = this.#findChangedMapEntries(oldData.mathBlocks, mathBlocks);
        const changedHeadingsData = this.#getChangedHeadingsData(oldData.headings, headings);

        return {
            newCodeBlocks: codeBlocks,
            newMermaidBlocks: mermaidBlocks,
            newMathBlocks: mathBlocks,
            newHeadings: headings,
            changedCodeBlocks,
            changedMermaidBlocks,
            changedMathBlocks,
            changedHeadingsData
        };
    }

    /**
     * 找出两个 Map 之间发生变化的键
     * @param {Map} oldMap - 旧的 Map
     * @param {Map} newMap - 新的 Map
     * @returns {Set<string>} 发生变化的键集合
     * @private
     */
    #findChangedMapEntries(oldMap, newMap) {
        const changed = new Set();

        // 检查旧 Map 中的每个键
        for (const [key, oldValue] of oldMap.entries()) {
            if (!newMap.has(key)) {
                // 键不存在于新 Map 中，说明被删除了
                changed.add(key);
            } else {
                const newValue = newMap.get(key);
                // 深度比较值
                if (!this.#areValuesEqual(oldValue, newValue)) {
                    changed.add(key);
                }
            }
        }

        // 检查新 Map 中新增的键
        for (const key of newMap.keys()) {
            if (!oldMap.has(key)) {
                changed.add(key);
            }
        }

        return changed;
    }

    /**
     * 深度比较两个值是否相等
     * @param {*} value1 - 第一个值
     * @param {*} value2 - 第二个值
     * @returns {boolean} 是否相等
     * @private
     */
    #areValuesEqual(value1, value2) {
        // 如果都是对象，深度比较
        if (value1 && value2 && typeof value1 === 'object' && typeof value2 === 'object') {
            const keys1 = Object.keys(value1);
            const keys2 = Object.keys(value2);
            if (keys1.length !== keys2.length) return false;
            for (const k of keys1) {
                if (value1[k] !== value2[k]) {
                    return false;
                }
            }
            return true;
        }
        // 否则直接比较
        return value1 === value2;
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
            const strikeBlocks = [];

            // 性能优化：按优先级处理，避免符号冲突
            const processedMarkdown = markdown
                // 第一步：保护数学公式（公式中可能包含 ^ 和 ~）
                .replace(/\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/g, (match, block, inline) => {
                    const latex = block !== undefined ? block : inline;
                    const displayMode = block !== undefined;
                    mathBlocks.push({ latex, displayMode });
                    return `\x02MATH${mathBlocks.length - 1}\x02`;
                })
                // 第二步：保护删除线 ~~text~~（避免被下标误匹配）
                .replace(/~~([^~\n]{1,200})~~/g, (match, content) => {
                    strikeBlocks.push(content);
                    return `\x03STRIKE${strikeBlocks.length - 1}\x03`;
                })
                // 第三步：提取上标 ^text^（限制长度，避免跨行）
                .replace(/\^([^\n^]{1,50})\^/g, (match, content) => {
                    supSubBlocks.push({ type: 'sup', content });
                    return `\x01SUP${supSubBlocks.length - 1}\x01`;
                })
                // 第四步：提取下标 ~text~（限制长度，避免跨行）
                // 此时删除线和数学公式已被保护，不会误匹配
                .replace(/~([^~\n]{1,50})~/g, (match, content) => {
                    supSubBlocks.push({ type: 'sub', content });
                    return `\x01SUB${supSubBlocks.length - 1}\x01`;
                });

            // 使用 marked 解析
            let html;
            if (marked?.parse) {
                // 先使用默认渲染器解析
                html = marked.parse(processedMarkdown, {
                    breaks: false,
                    gfm: true
                });

                // 手动添加标题 ID（在解析后处理）
                // 匹配包含任意内容的标题标签（包括 HTML 标签）
                let headingIndex = 0;
                html = html.replace(/<h([1-6])([^>]*)>(.*?)<\/h\1>/gi, (match, level, attrs, text) => {
                    // 如果已经有 id 属性，不重复添加
                    if (attrs.includes('id=')) {
                        return match;
                    }
                    return `<h${level}${attrs} id="heading-${headingIndex++}">${text}</h${level}>`;
                });
            } else {
                html = this.escapeHtml(processedMarkdown);
            }

            // 替换数学公式占位符
            // eslint-disable-next-line no-control-regex
            html = html.replace(/\x02MATH(\d+)\x02/g, (_, index) => {
                const math = mathBlocks[+index]; // 使用 + 运算符代替 parseInt
                const tag = math.displayMode ? 'div' : 'span';
                const cls = math.displayMode ? 'math-block' : 'math-inline';
                return `<${tag} class="${cls}" data-latex="${math.latex}"></${tag}>`;
            });

            // 替换上标和下标占位符
            // eslint-disable-next-line no-control-regex
            html = html.replace(/\x01(SUP|SUB)(\d+)\x01/g, (_, type, index) => {
                const item = supSubBlocks[+index]; // 使用 + 运算符代替 parseInt
                const tag = item.type === 'sup' ? 'sup' : 'sub';
                return `<${tag}>${item.content}</${tag}>`;
            });

            // 恢复删除线占位符
            // eslint-disable-next-line no-control-regex
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
                        'rowspan', 'start', 'align', 'style', 'data-load-status'
                    ],
                    ALLOW_DATA_ATTR: true
                });
            }

            // 为新生成的图片添加初始状态
            html = html.replace(/<img([^>]*?)>/g, (match, attrs) => {
                // 如果已经有 data-load-status 属性，跳过
                if (attrs.includes('data-load-status')) {
                    return match;
                }
                // 在标签中添加 data-load-status="pending"
                return `<img${attrs} data-load-status="pending">`;
            });

            return html;
        } catch (e) {
            console.warn('Markdown 渲染失败:', e);
            return this.escapeHtml(markdown);
        }
    }

    // ==================== DOM 更新 ====================
    /**
     * 收集需要处理的元素（在 DOM 更新后调用）
     * @returns {Object} 包含各类待处理元素的对象
     * @private
     */
    #collectElementsToProcess() {
        const allElements = dom.getAllIn(
            this.container,
            'pre code:not(.prism-highlighted), img[data-load-status="pending"], .math-block:not(.math-rendered), .math-inline:not(.math-rendered)'
        );

        // 分类元素
        const pendingCodeBlocks = [];
        const pendingMermaidBlocks = [];
        const pendingMathElements = [];
        const pendingCopyBtn = [];

        allElements.forEach(el => {
            if (el.tagName === 'CODE') {
                const preElement = el.parentElement;
                if (preElement?.tagName === 'PRE') {
                    if (el.classList.contains('language-mermaid')) {
                        pendingMermaidBlocks.push(el);
                    } else {
                        pendingCodeBlocks.push(el);
                        if (!preElement.classList.contains('has-copy-btn')) {
                            pendingCopyBtn.push(preElement);
                        }
                    }
                }
            } else if (el.tagName === 'IMG') {
                // 设置图片为加载中状态（通过事件监听器异步处理）
                el.dataset.loadStatus = 'loading';
            } else if (el.classList.contains('math-block') || el.classList.contains('math-inline')) {
                pendingMathElements.push(el);
            }
        });

        return {
            pendingCodeBlocks,
            pendingMermaidBlocks,
            pendingMathElements,
            pendingCopyBtn
        };
    }

    /**
     * 智能更新 DOM（优化版：使用 replaceChildren 减少重排 + 一次性收集元素）
     * @param newHTML
     * @param changes
     * @returns {Object|null} 需要处理的元素集合，如果无需处理则返回 null
     * @private
     */
    #updateDOM(newHTML, changes) {
        // 首次渲染，使用 innerHTML（性能更好）
        if (!this.#lastRenderedData.markdown) {
            this.container.innerHTML = newHTML;
            this.#updateHeadingIds();
            // 返回需要处理的元素
            return this.#collectElementsToProcess();
        }

        // 如果所有内容都变了，直接替换
        const allChanged =
            changes.changedCodeBlocks.size &&
            changes.changedMermaidBlocks.size &&
            changes.changedMathBlocks.size;
        if (allChanged) {
            this.container.innerHTML = newHTML;
            this.#updateHeadingIds();
            // 返回需要处理的元素
            return this.#collectElementsToProcess();
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
        if (changes.changedHeadingsData) {
            this.#updateHeadingIds();
        }

        // 返回需要处理的元素
        return this.#collectElementsToProcess();
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
        // 🔥 修复：存储 code-block-wrapper 而不是 pre，以保留复制按钮
        const codeBlocks = dom.getAllIn(
            this.container,
            'pre code[class*="language-"]:not(.language-mermaid)'
        );
        codeBlocks.forEach((el, index) => {
            const hash = this.#generateSimpleHash(el.textContent);
            // 🔥 修复：使用复合键（哈希 + 索引）
            const compositeKey = `${hash}_idx_${index}`;
            // 🔥 修复：存储 code-block-wrapper（pre 的父元素），以保留复制按钮
            const preElement = el.parentElement;
            const wrapper = preElement?.parentElement?.classList.contains('code-block-wrapper')
                ? preElement.parentElement
                : preElement;
            maps.code.set(compositeKey, wrapper);
        });

        // 收集 Mermaid 图表（存储引用）
        const mermaidBlocks = dom.getAllIn(this.container, 'div.mermaid[data-mermaid]');
        mermaidBlocks.forEach((el, index) => {
            const text = el.getAttribute('data-mermaid');
            if (text) {
                const hash = this.#generateSimpleHash(text);
                // 🔥 修复：使用复合键（哈希 + 索引）
                const compositeKey = `${hash}_idx_${index}`;
                maps.mermaid.set(compositeKey, el);
            }
        });

        // 收集数学公式（存储引用）
        const mathBlocks = dom.getAllIn(
            this.container,
            '.math-block[data-latex], .math-inline[data-latex]'
        );
        mathBlocks.forEach((el, index) => {
            const latex = el.getAttribute('data-latex');
            if (latex) {
                const hash = this.#generateSimpleHash(latex);
                // 🔥 修复：使用复合键（哈希 + 索引）
                const compositeKey = `${hash}_idx_${index}`;
                maps.math.set(compositeKey, el);
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

        // 保留未变化的代码块
        // 🔥 优化：使用 changedCodeBlocks 集合精确判断哪些代码块发生了变化
        newCodeBlocks.forEach((newEl, index) => {
            const hash = this.#generateSimpleHash(newEl.textContent);
            const compositeKey = `${hash}_idx_${index}`;
            const oldWrapper = oldElements.code.get(compositeKey);

            // 只有当旧元素存在且未发生变化时才保留
            if (oldWrapper && !changes.changedCodeBlocks.has(compositeKey)) {
                // 🔥 修复：确定要替换的元素（可能是 code-block-wrapper 或 pre）
                const newPre = newEl.parentElement;
                const newWrapper = newPre?.parentElement?.classList.contains('code-block-wrapper')
                    ? newPre.parentElement
                    : newPre;
                
                // 克隆整个 code-block-wrapper（包含复制按钮）
                const clonedWrapper = oldWrapper.cloneNode(true);
                newWrapper.replaceWith(clonedWrapper);
                
                // 🔥 重要：为克隆的复制按钮重新添加事件监听器
                const clonedBtn = clonedWrapper.querySelector('.code-copy-btn');
                if (clonedBtn) {
                    this.#attachCopyButtonHandler(clonedBtn, clonedWrapper.querySelector('pre code'));
                }
            }
        });

        // 保留未变化的 Mermaid 图表
        // 🔥 优化：使用 changedMermaidBlocks 集合精确判断哪些图表发生了变化
        newMermaidBlocks.forEach((newEl, index) => {
            const text = newEl.textContent.trim();
            const hash = this.#generateSimpleHash(text);
            const compositeKey = `${hash}_idx_${index}`;
            const oldDiv = oldElements.mermaid.get(compositeKey);

            // 只有当旧元素存在、未发生变化且已完成渲染时才保留
            if (oldDiv &&
                !changes.changedMermaidBlocks.has(compositeKey) &&
                oldDiv.classList.contains('mermaid-done')) {
                newEl.parentElement.replaceWith(oldDiv.cloneNode(true));
            }
        });

        // 保留未变化的数学公式
        // 🔥 优化：使用 changedMathBlocks 集合精确判断哪些公式发生了变化
        newMathBlocks.forEach((newEl, index) => {
            const latex = newEl.getAttribute('data-latex');
            if (!latex) return;

            const hash = this.#generateSimpleHash(latex);
            const compositeKey = `${hash}_idx_${index}`;
            const oldEl = oldElements.math.get(compositeKey);

            // 只有当旧元素存在且未发生变化时才保留
            if (oldEl && !changes.changedMathBlocks.has(compositeKey)) {
                newEl.replaceWith(oldEl.cloneNode(true));
            }
        });
    }

    // ==================== 标题渲染组 ====================
    /**
     * 获取发生变化的标题数据（用于增量更新）
     * @param {Array} oldHeadings - 旧的标题数组
     * @param {Array} newHeadings - 新的标题数组
     * @returns {Map<number, Object>} 发生变化的标题数据映射（索引 -> 标题数据）
     * @private
     */
    #getChangedHeadingsData(oldHeadings, newHeadings) {
        const changed = new Map();

        // 如果长度不同，所有标题都算变化
        if (oldHeadings.length !== newHeadings.length) {
            for (let i = 0; i < newHeadings.length; i++) {
                const { level, text } = newHeadings[i];
                changed.set(i, {
                    tagName: 'H' + level,
                    textContent: text,
                    id: 'heading-' + i,
                    level
                });
            }
            return changed;
        }

        // 逐个比较标题
        for (let i = 0; i < newHeadings.length; i++) {
            const oldHeading = oldHeadings[i];
            const newHeading = newHeadings[i];

            // 如果旧标题不存在，或者 level/text 发生变化
            if (!oldHeading ||
                oldHeading.level !== newHeading.level ||
                oldHeading.text !== newHeading.text) {
                const { level, text } = newHeading;
                changed.set(i, {
                    tagName: 'H' + level,
                    textContent: text,
                    id: 'heading-' + i,
                    level
                });
            }
        }

        return changed;
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

    /**
     * 同步更新标题数据（在 DOM 渲染前）
     * @param {Array} headings - 新的标题数组
     * @param {Map<number, Object>} changedHeadingsData - 发生变化的标题数据映射
     * @private
     */
    #updateHeadingsSync(headings, changedHeadingsData) {
        // 全量更新：所有标题都变了
        if (changedHeadingsData.size === headings.length) {
            const headingsArray = Array.from({ length: headings.length }, (_, i) =>
                changedHeadingsData.get(i)
            );
            this.state.updateHeadings(headingsArray);
            return;
        }

        // 增量更新：只更新发生变化的标题
        const currentHeadings = this.state.get('headings') || [];
        const updatedHeadings = [...currentHeadings];

        changedHeadingsData.forEach((headingData, index) => {
            updatedHeadings[index] = headingData;
        });

        this.state.updateHeadings(updatedHeadings);
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
    async #highlightSingleBlock(block) {
        if (block.classList.contains('prism-highlighted')) {
            return;
        }
        block.classList.add('prism-highlighted');

        try {
            // 从 class 中提取语言（如 language-javascript）
            const langClass = [...block.classList].find(c => c.startsWith('language-'));
            const lang = langClass?.replace('language-', '');
            await loadLanguage(lang);
            Prism.highlightElement(block);
        } catch (err) {
            console.warn('代码高亮失败:', err);
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
     * @param {Array<HTMLPreElement>} preElements - 需要添加复制按钮的 PRE 元素数组
     * @private
     */
    #addCopyButtons(preElements) {
        if (preElements.length === 0) return;

        preElements.forEach(pre => {
            // 🔥 优化：跳过已处理的（通过 .has-copy-btn 类判断）
            if (pre.classList.contains('has-copy-btn')) {
                return;
            }

            // 🔥 修复：检查元素是否仍在 DOM 中
            if (!pre.isConnected || !pre.parentNode) {
                return;
            }

            // 创建包装器
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';
            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(pre);

            // 🔥 重要：标记为已添加复制按钮，避免重复添加
            pre.classList.add('has-copy-btn');

            // 添加复制按钮
            const btn = this.createElement('button', {
                className: 'md-btn md-btn-sm code-copy-btn',
                textContent: '📋',
                attributes: { title: '复制代码' },
                parent: wrapper
            });

            // 获取 code 元素
            const code = dom.getIn(pre, 'code');
            
            // 🔥 优化：提取事件处理逻辑，以便在克隆后重新绑定
            this.#attachCopyButtonHandler(btn, code);
        });
    }

    /**
     * 为复制按钮添加事件处理（用于克隆后重新绑定）
     * @param {HTMLButtonElement} btn - 复制按钮元素
     * @param {HTMLElement} code - 代码元素
     * @private
     */
    #attachCopyButtonHandler(btn, code) {
        if (!btn || !code) return;

        this.addEventListener(btn, 'click', e => {
            e.preventDefault();
            e.stopPropagation();

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
    }

    // ==================== Mermaid 渲染组 ====================
    /**
     * 渲染 Mermaid 图表
     * @param {Array<Element>} mermaidBlocks - Mermaid 代码块数组 (<code> 元素)
     * @private
     */
    #renderMermaid(mermaidBlocks) {
        if (typeof mermaid === 'undefined' || mermaidBlocks.length === 0) return;
        if (this.container.offsetParent === null) return;

        const blocks = Array.from(mermaidBlocks);

        // 先将 code 块转换为 mermaid div
        const mermaidDivs = [];
        blocks.forEach(block => {
            const div = this.#prepareMermaidDiv(block);
            if (div) mermaidDivs.push(div);
        });

        if (mermaidDivs.length === 0) return;

        // 分离可见和不可见元素
        const { visible, invisible } = this.#partitionByVisibility(mermaidDivs);

        // 🔥 优化：批量渲染可见图表，而不是逐个渲染
        const visibleToRender = visible.filter(div => !div.classList.contains('mermaid-done'));
        if (visibleToRender.length > 0) {
            this.#renderMermaidBatch(visibleToRender);
        }

        // 监听不可见图表
        invisible.forEach(div => {
            div.classList.add('mermaid-pending');
            this.#pendingMermaidBlocks.add(div);
            this.#intersectionObserver.observe(div);
        });

        // 延迟渲染剩余的 Mermaid
        if (invisible.length > 0) {
            if (this.#mermaidRenderTimer) {
                clearTimeout(this.#mermaidRenderTimer);
            }
            this.#mermaidRenderTimer = setTimeout(() => {
                const pending = Array.from(this.#pendingMermaidBlocks);
                const validPending = [];

                // 过滤有效元素并清理无效元素
                pending.forEach(div => {
                    // 🔥 优化：同时过滤已完成和正在渲染的
                    if (div.isConnected &&
                        !div.classList.contains('mermaid-done') &&
                        !div.classList.contains('mermaid-rendering')) {
                        validPending.push(div);
                    } else {
                        this.#pendingMermaidBlocks.delete(div);
                    }
                });

                if (validPending.length > 0) {
                    this.#renderMermaidBatch(validPending);
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
     * 准备 Mermaid div（将 code 块转换为 div）
     * @param {Element} codeBlock - <code class="language-mermaid"> 元素
     * @returns {Element|null} mermaid div 元素
     * @private
     */
    #prepareMermaidDiv(codeBlock) {
        const code = codeBlock.textContent.trim();
        if (!code) return null;

        const preElement = codeBlock.parentElement;
        if (!preElement?.parentNode) return null;

        // 如果已经是 mermaid div，跳过
        if (preElement.classList.contains('mermaid')) {
            return preElement;
        }

        // 创建 mermaid div 并替换 pre
        const mermaidDiv = document.createElement('div');
        mermaidDiv.className = 'mermaid';
        mermaidDiv.textContent = code;
        mermaidDiv.setAttribute('data-mermaid', code);

        preElement.parentNode.replaceChild(mermaidDiv, preElement);
        return mermaidDiv;
    }

    /**
     * 渲染单个 Mermaid 图表
     * @param {Element} mermaidDiv - mermaid div 元素
     * @private
     */
    #renderSingleMermaidDiv(mermaidDiv) {
        // 检查是否已渲染
        if (mermaidDiv.classList.contains('mermaid-done')) {
            return;
        }

        // 🔥 优化：只标记为渲染中，不标记为已完成
        mermaidDiv.classList.add('mermaid-rendering');

        mermaid.run({ nodes: [mermaidDiv] })
            .then(() => {
                // 🔥 成功后才标记为完成
                mermaidDiv.classList.remove('mermaid-rendering');
                mermaidDiv.classList.add('mermaid-done');
            })
            .catch(err => {
                console.warn('Mermaid 渲染失败:', err);
                mermaidDiv.textContent = '图表渲染失败: ' + err.message;
                mermaidDiv.classList.remove('mermaid-rendering');
                mermaidDiv.classList.add('render-error');
            });
    }

    /**
     * 批量渲染 Mermaid 图表
     * @param {Array<Element>} mermaidDivs - mermaid div 元素数组
     * @returns {Promise<void>}
     * @private
     */
    async #renderMermaidBatch(mermaidDivs) {
        // 🔥 修复：过滤掉已渲染、正在渲染或已断开连接的元素
        const containers = mermaidDivs.filter(div => {
            // 检查元素是否连接到 DOM
            if (!div.isConnected) return false;
            // 检查元素是否在我们的容器内
            if (!this.container.contains(div)) return false;
            // 检查是否已渲染或正在渲染
            if (div.classList.contains('mermaid-done') ||
                div.classList.contains('mermaid-rendering')) return false;
            return true;
        });

        if (containers.length === 0) return;

        // 清除旧状态
        containers.forEach(div => {
            div.classList.remove('mermaid-pending', 'render-error');
            div.classList.add('mermaid-rendering');
        });

        try {
            // 🔥 优化：单次批量调用，而不是逐个调用
            await mermaid.run({ nodes: containers });

            // 🔥 修复：再次检查元素是否还在 DOM 中且在我们的容器内
            containers.forEach(div => {
                if (div.isConnected && this.container.contains(div)) {
                    div.classList.remove('mermaid-rendering');
                    div.classList.add('mermaid-done');
                } else {
                    // 元素已被移除，清理状态
                    div.classList.remove('mermaid-rendering');
                }
            });
        } catch (err) {
            console.warn('Mermaid 批量渲染失败:', err);
            containers.forEach(div => {
                // 只为仍然存在的元素显示错误
                if (div.isConnected && this.container.contains(div)) {
                    div.classList.remove('mermaid-rendering');
                    if (!div.classList.contains('mermaid-done')) {
                        div.textContent = '图表渲染失败: ' + err.message;
                        div.classList.add('render-error');
                    }
                }
            });
        }
    }

    /**
     * 更新 Mermaid 主题
     */
    async updateMermaidTheme() {
        const theme = this.state.get('interface')?.theme;
        this.#configureMermaid(theme);

        // 查询并过滤有效元素
        const mermaidDivs = Array.from(
            this.container.querySelectorAll('div.mermaid[data-mermaid]')
        ).filter(div => div?.isConnected);

        if (mermaidDivs.length === 0) return;

        // 批量准备重新渲染
        mermaidDivs.forEach(div => {
            const code = div.getAttribute('data-mermaid');
            if (!code) return;

            div.textContent = code;
            div.removeAttribute('data-processed');
            div.className = 'mermaid mermaid-rendering';
        });

        try {
            await mermaid.run({ nodes: mermaidDivs });
            // 标记成功
            mermaidDivs.forEach(div => {
                if (div?.isConnected) {
                    div.classList.replace('mermaid-rendering', 'mermaid-done');
                }
            });
        } catch (err) {
            console.warn('Mermaid 主题切换失败:', err);
            mermaidDivs.forEach(div => {
                if (div?.isConnected) {
                    div.classList.remove('mermaid-rendering');
                    div.textContent = '主题切换失败: ' + err.message;
                    div.classList.add('render-error');
                }
            });
        }
    }

    // ==================== 公式渲染组 ====================
    /**
     * 渲染数学公式（优化版：增量渲染 + 可见性优化）
     * @param {Array<Element>} mathElements - 数学公式元素数组（已过滤未渲染的）
     * @private
     */
    #renderMath(mathElements) {
        if (typeof katex === 'undefined' || mathElements.length === 0) return;

        // 过滤出需要渲染的公式（排除无效元素）
        const elementsToRender = mathElements.filter(el => {
            const latex = el.getAttribute('data-latex');
            return latex !== null;
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
        // 🔥 优化：提前标记为已渲染，防止并发重复渲染
        element.classList.add('math-rendered');

        const latex = element.getAttribute('data-latex');
        if (!latex) return;

        try {
            katex.render(latex, element, {
                displayMode: element.classList.contains('math-block'),
                throwOnError: false,
                errorColor: '#cc0000'
            });
            element.classList.remove('math-error', 'math-pending'); // 清除可能的错误状态
        } catch (err) {
            console.warn('KaTeX 渲染失败:', err);
            element.textContent = latex;
            element.classList.add('math-error');
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
                this.#renderSingleMath(el);
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
            .replace(/ class="mermaid-pending"/g, '')
            .replace(/ class="mermaid-rendering"/g, '')
            .replace(/ data-load-status="[^"]*"/g, '')
            .replace(/ class="math-rendered"/g, '')
            .replace(/ class="math-pending"/g, '')
            .replace(/ data-mermaid="[^"]*"/g, '')
            .replace(/ data-latex="[^"]*"/g, '');

        // 获取当前主题
        const isDark = this.state.get('interface')?.theme === 'dark';

        const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN"${isDark ? ' data-mode="dark"' : ''}>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Markdown 导出</title>
<style>
/* ==================== CSS 变量 ==================== */
:root {
  --md-bg-primary: #f5f5f5;
  --md-bg-secondary: #fff;
  --md-bg-tertiary: #f8f9fa;
  --md-text-primary: #333;
  --md-text-secondary: #666;
  --md-text-tertiary: #999;
  --md-border: #e0e0e0;
  --md-border-light: #dfe2e5;
  --md-color-primary: #2196f3;
  --md-color-success: #4caf50;
  --md-code-bg: #f3f4f6;
  --md-code-bg-inline: rgba(0, 0, 0, 0.06);
  --md-code-text: #24292e;
  --md-markdown-bg: #fff;
  --md-markdown-text: #24292e;
  --md-markdown-link: #0366d6;
  --md-markdown-quote: #6a737d;
  --md-checkbox-border: #dfe2e5;
  --md-checkbox-checked-bg: #0366d6;
  --prism-bg: #f5f5f5;
  --prism-text-shadow: 0 1px #fff;
  --prism-comment: #708090;
  --prism-punctuation: #999;
  --prism-property: #905;
  --prism-selector: #690;
  --prism-operator: #9a6e3a;
  --prism-keyword: #07a;
  --prism-function: #dd4a68;
  --prism-regex: #e90;
}

[data-mode='dark'] {
  --md-bg-primary: #0f1420;
  --md-bg-secondary: #1e1e1e;
  --md-bg-tertiary: #2d2d2d;
  --md-text-primary: #e0e0e0;
  --md-text-secondary: #b0b0b0;
  --md-text-tertiary: #7f8c8d;
  --md-border: #3e3e3e;
  --md-border-light: #3e3e3e;
  --md-color-primary: #42a5f5;
  --md-code-bg: #2d2d2d;
  --md-code-bg-inline: rgba(255, 255, 255, 0.1);
  --md-code-text: #e0e0e0;
  --md-markdown-bg: #1e1e1e;
  --md-markdown-text: #e0e0e0;
  --md-markdown-link: #42a5f5;
  --md-markdown-quote: #b0b0b0;
  --md-checkbox-border: #3e3e3e;
  --md-checkbox-checked-bg: #0d47a1;
  --prism-bg: #2d2d2d;
  --prism-text-shadow: 0 1px rgba(0, 0, 0, 0.3);
  --prism-comment: #8e929a;
  --prism-punctuation: #d4d4d4;
  --prism-property: #b5cea8;
  --prism-selector: #ce9178;
  --prism-operator: #d4d4d4;
  --prism-keyword: #c586c0;
  --prism-function: #dcdcaa;
  --prism-regex: #d16969;
}

/* ==================== 基础样式 ==================== */
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  background-color: var(--md-bg-primary);
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  font-size: 15px;
  line-height: 1.6;
  color: var(--md-markdown-text);
  word-wrap: break-word;
  overflow-wrap: break-word;
  padding: 24px;
  box-sizing: border-box;
}

/* ==================== Markdown 内容样式 ==================== */
.markdown-body {
  max-width: 900px;
  margin: 0 auto;
  background-color: var(--md-markdown-bg);
  padding: 32px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.markdown-body > *:first-child { margin-top: 0 !important; }
.markdown-body > *:last-child { margin-bottom: 0 !important; }

.markdown-body a {
  color: var(--md-markdown-link);
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.markdown-body h1, .markdown-body h2, .markdown-body h3,
.markdown-body h4, .markdown-body h5, .markdown-body h6 {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
  color: var(--md-text-primary);
}

.markdown-body h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid var(--md-border); }
.markdown-body h2 { font-size: 1.75em; padding-bottom: 0.3em; border-bottom: 1px solid var(--md-border); }
.markdown-body h3 { font-size: 1.5em; }
.markdown-body h4 { font-size: 1.25em; }
.markdown-body h5 { font-size: 1.1em; }
.markdown-body h6 { font-size: 1em; color: var(--md-text-tertiary); }

.markdown-body p { margin-top: 0; margin-bottom: 16px; }

.markdown-body ul, .markdown-body ol {
  margin-top: 0;
  margin-bottom: 16px;
  padding-left: 1.75em;
  list-style-position: outside;
}

.markdown-body ul li, .markdown-body ol li {
  padding-left: 0.25em;
  margin-top: 0.25em;
}

.markdown-body li:has(input[type='checkbox']) {
  list-style-type: none;
  margin-left: -1.25em;
  padding-left: 0.25em;
}

.markdown-body code {
  padding: 0.2em 0.4em;
  font-size: 85%;
  background-color: var(--md-code-bg-inline);
  border-radius: 3px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  color: var(--md-code-text);
}

.markdown-body pre {
  max-width: 100%;
  overflow-x: auto;
  padding: 16px;
  margin: 16px 0;
  background-color: var(--md-code-bg) !important;
  border-radius: 6px;
  min-height: 3em;
  box-sizing: border-box;
}

.markdown-body pre code {
  padding: 0;
  margin: 0;
  background-color: transparent;
  font-size: inherit;
  display: inline-block;
  min-width: 100%;
  line-height: 1.5;
}

.markdown-body blockquote {
  padding: 0 1em;
  color: var(--md-markdown-quote);
  border-left: 0.25em solid var(--md-border-light);
  margin: 0 0 16px 0;
}

.markdown-body blockquote > :first-child { margin-top: 0; }
.markdown-body blockquote > :last-child { margin-bottom: 0; }

.markdown-body table {
  border-spacing: 0;
  border-collapse: collapse;
  margin-top: 0;
  margin-bottom: 16px;
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  display: block;
}

.markdown-body th { font-weight: 600; background-color: var(--md-code-bg); }
.markdown-body th, .markdown-body td {
  padding: 6px 13px;
  border: 1px solid var(--md-border-light);
}

.markdown-body tr { border-top: 1px solid var(--md-border); background-color: var(--md-bg-secondary); }
.markdown-body tr:nth-child(2n) { background-color: var(--md-code-bg); }

.markdown-body img {
  max-width: 100%;
  height: auto;
  box-sizing: border-box;
}

.markdown-body hr {
  height: 0.25em;
  padding: 0;
  margin: 24px 0;
  background-color: var(--md-border);
  border: 0;
}

/* ==================== 复选框样式 ==================== */
.markdown-body input[type='checkbox'] {
  appearance: none;
  -webkit-appearance: none;
  width: 1em;
  height: 1em;
  border: 1px solid var(--md-checkbox-border);
  background-color: var(--md-bg-secondary);
  vertical-align: -0.1em;
  margin: 0 0.25em 0 0;
  border-radius: 2px;
  cursor: default;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.markdown-body input[type='checkbox']:checked {
  background-color: var(--md-checkbox-checked-bg);
  border-color: var(--md-checkbox-checked-bg);
}

.markdown-body input[type='checkbox']:checked::after {
  content: '';
  position: absolute;
  left: 0.25em;
  top: 0.05em;
  width: 0.25em;
  height: 0.5em;
  border: solid white;
  border-width: 0 0.15em 0.15em 0;
  transform: rotate(45deg);
}

/* ==================== 代码块包装器 ==================== */
.code-block-wrapper {
  position: relative;
  margin: 16px 0;
}

.code-copy-btn {
  position: absolute;
  top: 8px;
  right: 8px;
  padding: 4px 8px;
  font-size: 12px;
  opacity: 0;
  transition: opacity 0.2s;
  z-index: 10;
  cursor: pointer;
  border: 1px solid var(--md-border-light);
  background: var(--md-bg-secondary);
  color: var(--md-text-primary);
  border-radius: 3px;
  font-family: inherit;
}

.code-block-wrapper:hover .code-copy-btn,
.code-copy-btn:hover {
  opacity: 1;
}

.code-copy-btn.copied {
  background: var(--md-color-success);
  color: #fff;
  border-color: var(--md-color-success);
}

/* ==================== Mermaid 图表 ==================== */
.markdown-body .mermaid {
  text-align: center;
  margin: 16px 0;
  background-color: var(--md-bg-secondary);
  padding: 16px;
  border-radius: 6px;
  border: 1px solid var(--md-border-light);
}

.markdown-body .mermaid svg {
  display: inline-block;
  max-width: 100%;
  height: auto;
}

/* ==================== 数学公式 ==================== */
.markdown-body .math-block {
  display: block;
  overflow-x: auto;
  text-align: center;
  margin: 1em 0;
  padding: 0.5em 0;
}

.markdown-body .math-inline {
  display: inline;
  padding: 0 2px;
}

/* ==================== Prism 代码高亮 ==================== */
code[class*='language-'],
pre[class*='language-'] {
  text-shadow: var(--prism-text-shadow);
  background: var(--prism-bg);
}

.token.comment,
.token.prolog,
.token.doctype,
.token.cdata {
  color: var(--prism-comment);
}

.token.punctuation {
  color: var(--prism-punctuation);
}

.token.property,
.token.tag,
.token.boolean,
.token.number,
.token.constant,
.token.symbol,
.token.deleted {
  color: var(--prism-property);
}

.token.selector,
.token.attr-name,
.token.string,
.token.char,
.token.builtin,
.token.inserted {
  color: var(--prism-selector);
}

.token.operator,
.token.entity,
.token.url,
.language-css .token.string,
.style .token.string {
  color: var(--prism-operator);
}

.token.atrule,
.token.attr-value,
.token.keyword {
  color: var(--prism-keyword);
}

.token.function,
.token.class-name {
  color: var(--prism-function);
}

.token.regex,
.token.important,
.token.variable {
  color: var(--prism-regex);
}

/* ==================== KaTeX 数学公式样式 ==================== */
.katex-display { margin: 1em 0; overflow-x: auto; }
.katex { font-size: 1.1em; }
.katex-display > .katex { white-space: nowrap; }
.katex-display { overflow-x: auto; overflow-y: hidden; padding: 0.5em 0; }

/* ==================== 响应式 ==================== */
@media (max-width: 768px) {
  body {
    padding: 12px;
  }
  
  .markdown-body {
    padding: 16px;
  }
}

/* ==================== 打印优化 ==================== */
@media print {
  body {
    background: #fff !important;
    padding: 0 !important;
  }
  
  .markdown-body {
    max-width: 100%;
    box-shadow: none;
    padding: 0;
  }
  
  .code-copy-btn {
    display: none !important;
  }
}
</style>
</head>
<body>
<div class="markdown-body">
${html}
</div>
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
     * 导出为 PDF（使用新窗口打印，保持渲染样式）
     * @returns {void}
     */
    exportPDF() {
        const content = this.state.get('content');
        if (!content) {
            this.showMessage('没有内容可导出', 'warning');
            return;
        }

        // 获取导出配置
        const exportConfig = this.state.get('export') || {};
        const pdfSize = exportConfig.pdfSize || 'A4';
        const pdfMargin = exportConfig.pdfMargin || 'default';
        // 页眉配置
        const headerLeft = exportConfig.pdfHeaderLeft || '';
        const headerCenter = exportConfig.pdfHeaderCenter || '';
        const headerRight = exportConfig.pdfHeaderRight || '';
        // 页脚配置
        const footerLeft = exportConfig.pdfFooterLeft || '';
        const footerCenter = exportConfig.pdfFooterCenter || '';
        const footerRight = exportConfig.pdfFooterRight || '';

        // 页面尺寸映射（mm）
        const pageSizeMap = {
            'A4': '210mm 297mm',
            'Letter': '8.5in 11in',
            'Legal': '8.5in 14in'
        };

        // 页边距映射 - 增加额外的页眉页脚空间
        const marginMap = {
            'default': { top: '2.5cm', bottom: '2.5cm', left: '1.5cm', right: '1.5cm' },
            'narrow': { top: '2cm', bottom: '2cm', left: '1cm', right: '1cm' },
            'wide': { top: '3cm', bottom: '3cm', left: '2.5cm', right: '2.5cm' }
        };

        // 获取预览容器中已经渲染好的 HTML
        let html = this.container.innerHTML;

        // 清理不需要的属性和类
        html = html
            .replace(/ class="prism-highlighted"/g, '')
            .replace(/ class="mermaid-done"/g, '')
            .replace(/ class="mermaid-pending"/g, '')
            .replace(/ class="mermaid-rendering"/g, '')
            .replace(/ data-load-status="[^"]*"/g, '')
            .replace(/ class="math-rendered"/g, '')
            .replace(/ class="math-pending"/g, '')
            .replace(/ data-mermaid="[^"]*"/g, '')
            .replace(/ data-latex="[^"]*"/g, '');

        // 获取当前主题
        const isDark = this.state.get('interface')?.theme === 'dark';

        // 获取文档标题（从第一个标题或默认值）
        const titleMatch = content.match(/^#\s+(.+)$/m);
        const docTitle = titleMatch ? titleMatch[1].trim() : 'Markdown 文档';
        const currentDate = new Date().toLocaleDateString('zh-CN');

        const margins = marginMap[pdfMargin];

        // 判断是否有页眉或页脚
        const hasHeader = headerLeft || headerCenter || headerRight;
        const hasFooter = footerLeft || footerCenter || footerRight;

        // 处理模板占位符
        const processTemplate = (template) => {
            if (!template) return '';
            return template
                .replace(/{title}/g, docTitle)
                .replace(/{date}/g, currentDate)
                .replace(/{page}/g, '<span class="pdf-page-current">-</span>')
                .replace(/{pages}/g, '<span class="pdf-page-total">-</span>');
        };

        // 生成页眉 HTML
        const headerHtml = hasHeader ? `
<div class="pdf-header">
    <div class="pdf-header-left">${processTemplate(headerLeft)}</div>
    <div class="pdf-header-center">${processTemplate(headerCenter)}</div>
    <div class="pdf-header-right">${processTemplate(headerRight)}</div>
</div>` : '';

        // 生成页脚 HTML
        const footerHtml = hasFooter ? `
<div class="pdf-footer">
    <div class="pdf-footer-left">${processTemplate(footerLeft)}</div>
    <div class="pdf-footer-center">${processTemplate(footerCenter)}</div>
    <div class="pdf-footer-right">${processTemplate(footerRight)}</div>
</div>` : '';

        // 页眉页脚样式
        const headerFooterScreenStyles = `
.pdf-header, .pdf-footer {
    display: none;
}
`;

        // 页眉页脚打印样式
        const headerFooterPrintStyles = (hasHeader || hasFooter) ? `
/* 页眉 - 在页边距区域内显示 */
.pdf-header {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    height: 1.5cm;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 9pt;
    color: #333;
    padding: 0 2cm;
    box-sizing: border-box;
}

.pdf-header-left {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.pdf-header-center {
    flex: 1;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.pdf-header-right {
    flex: 1;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* 页脚 - 在页边距区域内显示 */
.pdf-footer {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 1.5cm;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 9pt;
    color: #333;
    padding: 0 2cm;
    box-sizing: border-box;
}

.pdf-footer-left {
    flex: 1;
    text-align: left;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.pdf-footer-center {
    flex: 1;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.pdf-footer-right {
    flex: 1;
    text-align: right;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

/* 页码样式 */
.pdf-page-current, .pdf-page-total {
    display: inline-block;
    min-width: 1.5em;
    text-align: center;
}
` : '';

        // 计算实际的 @page margin，当有页眉页脚时增加边距
        const actualMarginTop = hasHeader ? '2cm' : margins.top;
        const actualMarginBottom = hasFooter ? '2cm' : margins.bottom;

        const fullHtml = `<!DOCTYPE html>
<html lang="zh-CN"${isDark ? ' data-mode="dark"' : ''}>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${docTitle} - PDF 导出</title>
<style>
/* ==================== CSS 变量 ==================== */
:root {
  --md-bg-primary: #f5f5f5;
  --md-bg-secondary: #fff;
  --md-bg-tertiary: #f8f9fa;
  --md-text-primary: #333;
  --md-text-secondary: #666;
  --md-text-tertiary: #999;
  --md-border: #e0e0e0;
  --md-border-light: #dfe2e5;
  --md-color-primary: #2196f3;
  --md-color-success: #4caf50;
  --md-code-bg: #f3f4f6;
  --md-code-bg-inline: rgba(0, 0, 0, 0.06);
  --md-code-text: #24292e;
  --md-markdown-bg: #fff;
  --md-markdown-text: #24292e;
  --md-markdown-link: #0366d6;
  --md-markdown-quote: #6a737d;
  --md-checkbox-border: #dfe2e5;
  --md-checkbox-checked-bg: #0366d6;
  --prism-bg: #f5f5f5;
  --prism-text-shadow: 0 1px #fff;
  --prism-comment: #708090;
  --prism-punctuation: #999;
  --prism-property: #905;
  --prism-selector: #690;
  --prism-operator: #9a6e3a;
  --prism-keyword: #07a;
  --prism-function: #dd4a68;
  --prism-regex: #e90;
}

[data-mode='dark'] {
  --md-bg-primary: #0f1420;
  --md-bg-secondary: #1e1e1e;
  --md-bg-tertiary: #2d2d2d;
  --md-text-primary: #e0e0e0;
  --md-text-secondary: #b0b0b0;
  --md-text-tertiary: #7f8c8d;
  --md-border: #3e3e3e;
  --md-border-light: #3e3e3e;
  --md-color-primary: #42a5f5;
  --md-code-bg: #2d2d2d;
  --md-code-bg-inline: rgba(255, 255, 255, 0.1);
  --md-code-text: #e0e0e0;
  --md-markdown-bg: #1e1e1e;
  --md-markdown-text: #e0e0e0;
  --md-markdown-link: #42a5f5;
  --md-markdown-quote: #b0b0b0;
  --md-checkbox-border: #3e3e3e;
  --md-checkbox-checked-bg: #0d47a1;
  --prism-bg: #2d2d2d;
  --prism-text-shadow: 0 1px rgba(0, 0, 0, 0.3);
  --prism-comment: #8e929a;
  --prism-punctuation: #d4d4d4;
  --prism-property: #b5cea8;
  --prism-selector: #ce9178;
  --prism-operator: #d4d4d4;
  --prism-keyword: #c586c0;
  --prism-function: #dcdcaa;
  --prism-regex: #d16969;
}

/* ==================== 基础样式 ==================== */
html, body {
  margin: 0;
  padding: 0;
  width: 100%;
  background-color: var(--md-bg-primary);
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif;
  font-size: 15px;
  line-height: 1.6;
  color: var(--md-markdown-text);
  word-wrap: break-word;
  overflow-wrap: break-word;
  padding: 24px;
  box-sizing: border-box;
}

/* ==================== Markdown 内容样式 ==================== */
.markdown-body {
  max-width: 900px;
  margin: 0 auto;
  background-color: var(--md-markdown-bg);
  padding: 32px;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
}

.markdown-body > *:first-child { margin-top: 0 !important; }
.markdown-body > *:last-child { margin-bottom: 0 !important; }

.markdown-body a {
  color: var(--md-markdown-link);
  text-decoration: none;
}

.markdown-body a:hover {
  text-decoration: underline;
}

.markdown-body h1, .markdown-body h2, .markdown-body h3,
.markdown-body h4, .markdown-body h5, .markdown-body h6 {
  margin-top: 24px;
  margin-bottom: 16px;
  font-weight: 600;
  line-height: 1.25;
  color: var(--md-text-primary);
}

.markdown-body h1 { font-size: 2em; padding-bottom: 0.3em; border-bottom: 1px solid var(--md-border); }
.markdown-body h2 { font-size: 1.75em; padding-bottom: 0.3em; border-bottom: 1px solid var(--md-border); }
.markdown-body h3 { font-size: 1.5em; }
.markdown-body h4 { font-size: 1.25em; }
.markdown-body h5 { font-size: 1.1em; }
.markdown-body h6 { font-size: 1em; color: var(--md-text-tertiary); }

.markdown-body p { margin-top: 0; margin-bottom: 16px; }

.markdown-body ul, .markdown-body ol {
  margin-top: 0;
  margin-bottom: 16px;
  padding-left: 1.75em;
  list-style-position: outside;
}

.markdown-body ul li, .markdown-body ol li {
  padding-left: 0.25em;
  margin-top: 0.25em;
}

.markdown-body li:has(input[type='checkbox']) {
  list-style-type: none;
  margin-left: -1.25em;
  padding-left: 0.25em;
}

.markdown-body code {
  padding: 0.2em 0.4em;
  font-size: 85%;
  background-color: var(--md-code-bg-inline);
  border-radius: 3px;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
  color: var(--md-code-text);
}

.markdown-body pre {
  max-width: 100%;
  overflow-x: auto;
  padding: 16px;
  margin: 16px 0;
  background-color: var(--md-code-bg) !important;
  border-radius: 6px;
  min-height: 3em;
  box-sizing: border-box;
}

.markdown-body pre code {
  padding: 0;
  margin: 0;
  background-color: transparent;
  font-size: inherit;
  display: inline-block;
  min-width: 100%;
  line-height: 1.5;
}

.markdown-body blockquote {
  padding: 0 1em;
  color: var(--md-markdown-quote);
  border-left: 0.25em solid var(--md-border-light);
  margin: 0 0 16px 0;
}

.markdown-body blockquote > :first-child { margin-top: 0; }
.markdown-body blockquote > :last-child { margin-bottom: 0; }

.markdown-body table {
  border-spacing: 0;
  border-collapse: collapse;
  margin-top: 0;
  margin-bottom: 16px;
  width: 100%;
  max-width: 100%;
  overflow-x: auto;
  display: block;
}

.markdown-body th { font-weight: 600; background-color: var(--md-code-bg); }
.markdown-body th, .markdown-body td {
  padding: 6px 13px;
  border: 1px solid var(--md-border-light);
}

.markdown-body tr { border-top: 1px solid var(--md-border); background-color: var(--md-bg-secondary); }
.markdown-body tr:nth-child(2n) { background-color: var(--md-code-bg); }

.markdown-body img {
  max-width: 100%;
  height: auto;
  box-sizing: border-box;
}

.markdown-body hr {
  height: 0.25em;
  padding: 0;
  margin: 24px 0;
  background-color: var(--md-border);
  border: 0;
}

/* ==================== 复选框样式 ==================== */
.markdown-body input[type='checkbox'] {
  appearance: none;
  -webkit-appearance: none;
  width: 1em;
  height: 1em;
  border: 1px solid var(--md-checkbox-border);
  background-color: var(--md-bg-secondary);
  vertical-align: -0.1em;
  margin: 0 0.25em 0 0;
  border-radius: 2px;
  cursor: default;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  position: relative;
}

.markdown-body input[type='checkbox']:checked {
  background-color: var(--md-checkbox-checked-bg);
  border-color: var(--md-checkbox-checked-bg);
}

.markdown-body input[type='checkbox']:checked::after {
  content: '';
  position: absolute;
  left: 0.25em;
  top: 0.05em;
  width: 0.25em;
  height: 0.5em;
  border: solid white;
  border-width: 0 0.15em 0.15em 0;
  transform: rotate(45deg);
}

/* ==================== 代码块包装器 ==================== */
.code-block-wrapper {
  position: relative;
  margin: 16px 0;
}

.code-copy-btn {
  display: none !important;
}

/* ==================== Mermaid 图表 ==================== */
.markdown-body .mermaid {
  text-align: center;
  margin: 16px 0;
  background-color: var(--md-bg-secondary);
  padding: 16px;
  border-radius: 6px;
  border: 1px solid var(--md-border-light);
}

.markdown-body .mermaid svg {
  display: inline-block;
  max-width: 100%;
  height: auto;
}

/* ==================== 数学公式 ==================== */
.markdown-body .math-block {
  display: block;
  overflow-x: auto;
  text-align: center;
  margin: 1em 0;
  padding: 0.5em 0;
}

.markdown-body .math-inline {
  display: inline;
  padding: 0 2px;
}

/* ==================== Prism 代码高亮 ==================== */
code[class*='language-'],
pre[class*='language-'] {
  text-shadow: var(--prism-text-shadow);
  background: var(--prism-bg);
}

.token.comment,
.token.prolog,
.token.doctype,
.token.cdata {
  color: var(--prism-comment);
}

.token.punctuation {
  color: var(--prism-punctuation);
}

.token.property,
.token.tag,
.token.boolean,
.token.number,
.token.constant,
.token.symbol,
.token.deleted {
  color: var(--prism-property);
}

.token.selector,
.token.attr-name,
.token.string,
.token.char,
.token.builtin,
.token.inserted {
  color: var(--prism-selector);
}

.token.operator,
.token.entity,
.token.url,
.language-css .token.string,
.style .token.string {
  color: var(--prism-operator);
}

.token.atrule,
.token.attr-value,
.token.keyword {
  color: var(--prism-keyword);
}

.token.function,
.token.class-name {
  color: var(--prism-function);
}

.token.regex,
.token.important,
.token.variable {
  color: var(--prism-regex);
}

/* ==================== KaTeX 数学公式样式 ==================== */
.katex-display { margin: 1em 0; overflow-x: auto; }
.katex { font-size: 1.1em; }
.katex-display > .katex { white-space: nowrap; }
.katex-display { overflow-x: auto; overflow-y: hidden; padding: 0.5em 0; }

/* 页眉页脚屏幕样式 */
${headerFooterScreenStyles}

/* ==================== 打印样式 ==================== */
@media print {
  @page {
    size: ${pageSizeMap[pdfSize]};
    margin: ${actualMarginTop} ${margins.right} ${actualMarginBottom} ${margins.left};
  }
${headerFooterPrintStyles}
  html, body {
    background: #fff !important;
  }

  .markdown-body {
    max-width: 100%;
    box-shadow: none;
    padding: 20px;
    border-radius: 0;
    background-color: #fff !important;
    color: #000 !important;
  }

  .markdown-body h1, .markdown-body h2, .markdown-body h3,
  .markdown-body h4, .markdown-body h5, .markdown-body h6 {
    color: #000 !important;
    page-break-after: avoid;
  }

  .markdown-body h1 { border-bottom-color: #ccc; }
  .markdown-body h2 { border-bottom-color: #ccc; }

  .markdown-body a {
    color: #000 !important;
  }

  .markdown-body a[href^='http']::after {
    content: ' (' attr(href) ')';
    font-size: 0.8em;
    color: #666;
  }

  .markdown-body pre {
    background-color: #f5f5f5 !important;
    border: 1px solid #ddd;
    white-space: pre-wrap;
    word-wrap: break-word;
    page-break-inside: avoid;
  }

  .markdown-body code {
    background-color: #f0f0f0;
    color: #333 !important;
  }

  .markdown-body blockquote {
    border-left-color: #ccc;
    color: #555;
    page-break-inside: avoid;
  }

  .markdown-body table {
    page-break-inside: avoid;
  }

  .markdown-body th {
    background-color: #e0e0e0 !important;
  }

  .markdown-body tr {
    border-top-color: #ccc;
    background-color: #fff !important;
  }

  .markdown-body tr:nth-child(2n) {
    background-color: #f5f5f5 !important;
  }

  .markdown-body img {
    max-width: 100% !important;
    page-break-inside: avoid;
  }

  .markdown-body .mermaid {
    background-color: #fff !important;
    border-color: #ddd;
    page-break-inside: avoid;
  }

  .code-copy-btn {
    display: none !important;
  }

  /* 页码样式 - 使用 CSS 计数器 */
  .pdf-page-current::before {
    content: counter(page);
  }
  
  .pdf-page-total {
    /* 总页数通过 JavaScript 设置 */
  }

  /* 隐藏代码高亮的打印背景 */
  code[class*='language-'],
  pre[class*='language-'] {
    text-shadow: none !important;
  }
}
</style>
</head>
<body>
${headerHtml}
${footerHtml}
<div class="markdown-body">
${html}
</div>
<script>
(function() {
    // 页面边距配置（由导出设置决定）
    var marginTopCm = ${hasHeader ? 2 : parseFloat(margins.top)};
    var marginBottomCm = ${hasFooter ? 2 : parseFloat(margins.bottom)};

    // 估算总页数
    function estimatePageCount() {
        var content = document.querySelector('.markdown-body');
        if (!content) return 1;
        
        // 获取页面尺寸
        var pageHeightMm = '${pdfSize}' === 'A4' ? 297 : ('${pdfSize}' === 'Letter' ? 279 : 356);
        var marginTopMm = marginTopCm * 10;
        var marginBottomMm = marginBottomCm * 10;
        var usableHeightMm = pageHeightMm - marginTopMm - marginBottomMm - 20; // 额外减去内容 padding
        
        // 转换为像素（96dpi，1mm ≈ 3.78px）
        var usableHeightPx = usableHeightMm * 3.78;
        var contentHeightPx = content.scrollHeight;
        
        var pageCount = Math.ceil(contentHeightPx / usableHeightPx);
        return Math.max(1, pageCount);
    }

    // 更新页码显示
    function updatePageNumbers() {
        var totalPages = estimatePageCount();
        
        // 更新总页数
        var totalElements = document.querySelectorAll('.pdf-page-total');
        totalElements.forEach(function(el) {
            el.textContent = totalPages;
        });
    }

    // 监听打印前事件
    window.addEventListener('beforeprint', function() {
        updatePageNumbers();
    });

    // 页面加载完成后自动触发打印
    window.onload = function() {
        updatePageNumbers();
        setTimeout(function() {
            window.print();
        }, 500);
    };
})();
</script>
</body>
</html>`;

        // 打开新窗口
        const printWindow = window.open('', '_blank', 'width=900,height=650');
        if (!printWindow) {
            this.showMessage('无法打开打印窗口，请检查浏览器弹窗设置', 'error');
            return;
        }

        // 写入内容
        printWindow.document.write(fullHtml);
        printWindow.document.close();

        this.showMessage('请在打印对话框中选择"另存为 PDF"，并关闭浏览器页眉页脚选项', 'info');
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
