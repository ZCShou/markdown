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
 * 预览组件
 */
export class Preview extends BaseComponent {
    // ==================== 私有字段声明 ====================

    /** @private 上次渲染的数据 */
    #lastRenderedData = {
        markdown: '',
        codeBlocks: new Map(),
        mermaidBlocks: new Map(),
        mathBlocks: new Map(),
        headings: []
    };
    /** @private 上次渲染的原始内容 */
    #lastRenderedContent = '';

    /** @private 渲染版本号，用于取消旧渲染 */
    #renderVersion = 0;

    /** @private IntersectionObserver 实例 */
    #intersectionObserver = null;

    /** @private 待处理的代码块 */
    #pendingCodeBlocks = new Set();
    /** @private 待处理的 Mermaid 块 */
    #pendingMermaidBlocks = new Set();
    /** @private 待处理的数学公式块 */
    #pendingMathBlocks = new Set();

    /** @private 当前高亮的标题 ID */
    #activeHeadingId = null;
    /** @private scroll spy 的 rAF 句柄 */
    #scrollSpyRaf = null;
    /** @private scroll 事件处理器引用（用于 removeEventListener） */
    #scrollHandler = null;
    /** @private 缓存的标题偏移量数组，避免滚动时重复 getBoundingClientRect */
    #headingOffsets = [];
    /** @private 预览区滚动容器引用（避免滚动时重复 getElementById） */
    #scrollWrapper = null;
    /** @private 程序化滚动期间暂停 scroll spy，避免覆盖点击高亮 */
    #suppressScrollSpy = false;
    /** @private 滚动调用版本号，用于取消旧的 async 调用 */
    #scrollToHeadingVersion = 0;

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
                // 收集本批次中所有需要渲染的 mermaid 元素，一次性批量提交
                const mermaidBatch = [];

                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const element = entry.target;

                        // 处理代码高亮
                        if (element.classList.contains('code-pending') &&
                            !element.classList.contains('prism-highlighted')) {
                            this.#pendingCodeBlocks.delete(element);
                            this.#intersectionObserver.unobserve(element);
                            element.classList.remove('code-pending');
                            this.#highlightSingleBlock(element);
                        }

                        // 处理 Mermaid 渲染 —— 收集到批次，一次性 mermaid.run
                        if (element.classList.contains('mermaid-pending') &&
                            !element.classList.contains('mermaid-done') &&
                            !element.classList.contains('mermaid-rendering')) {
                            this.#pendingMermaidBlocks.delete(element);
                            this.#intersectionObserver.unobserve(element);
                            element.classList.remove('mermaid-pending');
                            mermaidBatch.push(element);
                        }

                        // 处理数学公式渲染
                        if (element.classList.contains('math-pending') &&
                            !element.classList.contains('math-rendered')) {
                            this.#pendingMathBlocks.delete(element);
                            this.#intersectionObserver.unobserve(element);
                            element.classList.remove('math-pending');
                            this.#renderSingleMath(element);
                        }
                    }
                });

                // 单次 mermaid.run 批量渲染所有本轮变为可见的图表
                if (mermaidBatch.length) this.#runMermaid(mermaidBatch);
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

        // 订阅来自 RightSidebar / 其他组件的标题跳转请求
        const unsubscribeScroll = this.state.subscribeTo(
            'scroll:heading',
            headingId => this.#doScrollToHeading(headingId)
        );

        // 保存取消订阅函数
        this.unsubscribe = () => {
            unsubscribeContent();
            unsubscribeScroll();
        };
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 滚动监听：驱动 TOC 高亮（rAF 节流，passive 不阻塞滚动）
        this.#scrollWrapper = document.getElementById('md-preview-wrapper');
        if (this.#scrollWrapper) {
            this.#scrollHandler = () => {
                if (this.#scrollSpyRaf) return;
                this.#scrollSpyRaf = requestAnimationFrame(() => {
                    this.#scrollSpyRaf = null;
                    this.#runScrollSpy();
                });
            };
            this.#scrollWrapper.addEventListener('scroll', this.#scrollHandler, { passive: true });
        }

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
                    this.#doScrollToHeading(decodeURIComponent(href.slice(1)));
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
     * 跳转到指定标题，跳转前先稳定布局。
     * - 数学公式：一次 querySelectorAll 覆盖所有渲染路径（pending Set + rAF batch）
     * - Mermaid：目标前方的必须等待完成，目标后方的 fire-and-forget
     * - 代码高亮：不改变元素高度，无需处理
     * @param {string} headingId
     * @private
     */
    async #doScrollToHeading(headingId) {
        // 每次调用递增版本号，旧的调用在清理阶段检测到版本不符后自动放弃
        const myVersion = ++this.#scrollToHeadingVersion;
        // 取消上一次可能残留的 spy rAF
        if (this.#scrollSpyRaf) {
            cancelAnimationFrame(this.#scrollSpyRaf);
            this.#scrollSpyRaf = null;
        }
        // 全程暂停 scroll spy，避免 async 等待期间产生错误高亮
        this.#suppressScrollSpy = true;

        const observer = this.#intersectionObserver;
        const target = this.container.querySelector(`[id="${CSS.escape(headingId)}"]`);
        const isAfter = el => target && !!(target.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);

        // ── 1. 数学公式：一次查询覆盖 pending Set + rAF-batch 两条路径 ────────
        let needsReflow = false;
        if (this.#pendingMathBlocks.size > 0) {
            needsReflow = true;
            this.container
                .querySelectorAll('.math-block:not(.math-rendered), .math-inline:not(.math-rendered)')
                .forEach(el => {
                    observer?.unobserve(el);
                    this.#pendingMathBlocks.delete(el);
                    el.classList.remove('math-pending');
                    this.#renderSingleMath(el);
                });
        }

        // ── 2. Mermaid pending：按位置分流，目标前必须等待，目标后 fire-and-forget ──
        if (this.#pendingMermaidBlocks.size > 0) {
            needsReflow = true;
            const before = [], after = [];
            for (const el of this.#pendingMermaidBlocks) {
                if (!el.isConnected) continue;
                observer?.unobserve(el);
                el.classList.remove('mermaid-pending');
                (isAfter(el) ? after : before).push(el);
            }
            this.#pendingMermaidBlocks.clear();
            if (after.length) this.#runMermaid(after);
            if (before.length) {
                await Promise.race([this.#runMermaid(before), new Promise(r => setTimeout(r, 3000))]);
                if (myVersion !== this.#scrollToHeadingVersion) return;
            }
        }

        // ── 3. Mermaid rendering：轮询等待目标前方已在渲染中的图表完成 ─────────
        const renderingBefore = [...this.container.querySelectorAll('div.mermaid.mermaid-rendering')]
            .filter(el => !isAfter(el));
        if (renderingBefore.length) {
            needsReflow = true;
            await Promise.race([
                new Promise(resolve => {
                    const check = () =>
                        renderingBefore.some(el => el.isConnected && el.classList.contains('mermaid-rendering'))
                            ? requestAnimationFrame(check) : resolve();
                    requestAnimationFrame(check);
                }),
                new Promise(r => setTimeout(r, 3000))
            ]);
            if (myVersion !== this.#scrollToHeadingVersion) return;
        }

        // ── 4. 仅在有挂起元素渲染时等两帧确保 reflow 完成，刷新标题偏移缓存 ──
        if (needsReflow) {
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
        }
        this.#cacheHeadingOffsets();

        // ── 5. 计算目标位置并执行滚动，await scrollend 后继续 ────────────────
        // 复用步骤开头已查询到的 target，避免重复 querySelector
        const finalTarget = target ?? document.getElementById(headingId);
        if (!finalTarget) {
            console.warn(`未找到标题元素: ${headingId}`);
            this.#suppressScrollSpy = false;
            return;
        }

        // finalTarget 始终位于 this.#scrollWrapper 内部，无需遍历祖先
        const scrollEl = this.#scrollWrapper;
        if (scrollEl) {
            const top = finalTarget.getBoundingClientRect().top
                - scrollEl.getBoundingClientRect().top
                + scrollEl.scrollTop - 16;
            const clampedTop = Math.min(Math.max(0, top), scrollEl.scrollHeight - scrollEl.clientHeight);

            // 若目标已在正确位置，无需滚动，跳过 scrollTo 避免等待不会触发的 scrollend
            if (Math.abs(scrollEl.scrollTop - clampedTop) > 2) {
                // 顺序等待：scrollend + 1500ms fallback，无嵌套回调
                await new Promise(resolve => {
                    let settled = false;
                    const finish = () => { if (!settled) { settled = true; clearTimeout(fb); resolve(); } };
                    const fb = setTimeout(finish, 1500);
                    scrollEl.addEventListener('scrollend', finish, { once: true });
                    scrollEl.scrollTo({ top: clampedTop, behavior: 'smooth' });
                });
            }
        } else {
            finalTarget.scrollIntoView({ behavior: 'smooth', block: 'start' });
            await new Promise(r => setTimeout(r, 800));
        }

        // ── 6. 滚动结束：消除残留 rAF、刷新缓存、重申高亮、解除抑制 ──────────
        // 若已被新的调用取代，放弃本次清理（避免覆盖新调用的 suppress 和高亮状态）
        if (myVersion !== this.#scrollToHeadingVersion) return;

        if (this.#scrollSpyRaf) {
            cancelAnimationFrame(this.#scrollSpyRaf);
            this.#scrollSpyRaf = null;
        }
        this.#cacheHeadingOffsets(); // 滚动稳定后重新采样
        this.#activeHeadingId = headingId;
        this.state.updateActiveHeading(headingId);

        // 再等一个 rAF，吸收 scrollend 前最后一帧可能排队的 scroll 事件，然后解除抑制
        requestAnimationFrame(() => {
            if (myVersion !== this.#scrollToHeadingVersion) return;
            if (this.#scrollSpyRaf) {
                cancelAnimationFrame(this.#scrollSpyRaf);
                this.#scrollSpyRaf = null;
            }
            this.#suppressScrollSpy = false;
        });
    }

    /**
     * 在 DOM 更新后缓存所有标题相对于滚动容器的偏移量。
     * 一次性 getBoundingClientRect，之后滚动时只读 scrollTop（无布局触发）。
     * @private
     */
    #cacheHeadingOffsets() {
        if (!this.#scrollWrapper) return;
        const wrapperTop = this.#scrollWrapper.getBoundingClientRect().top;
        const scrollTop  = this.#scrollWrapper.scrollTop;
        // Math.floor 消除亚像素浮点误差，确保 spy 阈值能准确命中缓存值
        this.#headingOffsets = Array.from(
            this.container.querySelectorAll('[id^="heading-"]'),
            h => ({ id: h.id, top: Math.floor(h.getBoundingClientRect().top - wrapperTop + scrollTop) })
        );
    }

    /**
     * 滚动侦测：对缓存的偏移量做二分查找，零 DOM 读取，O(log n)。
     * @private
     */
    #runScrollSpy() {
        if (!this.#headingOffsets.length || !this.#scrollWrapper) return;
        if (this.#suppressScrollSpy) return; // 程序化滚动期间暂停

        // 激活线 = 容器已滚动距离 + 16px（与 #doScrollToHeading 的滚动偏移保持一致）
        const threshold = this.#scrollWrapper.scrollTop + 16;

        // 二分查找最后一个 top <= threshold 的标题
        let lo = 0, hi = this.#headingOffsets.length - 1, activeId = null;
        while (lo <= hi) {
            const mid = (lo + hi) >>> 1;
            if (this.#headingOffsets[mid].top <= threshold) {
                activeId = this.#headingOffsets[mid].id;
                lo = mid + 1;
            } else {
                hi = mid - 1;
            }
        }

        if (activeId !== this.#activeHeadingId) {
            this.#activeHeadingId = activeId;
            this.state.updateActiveHeading(activeId);
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
     * 使用版本号机制取消旧的异步渲染
     */
    forceUpdatePreview() {
        const currentDocId = this.state.get('currentDocId');
        if (!currentDocId) return;

        const documents = this.state.get('documents');
        const doc = documents.find(d => d.id === currentDocId);
        if (!doc || doc.type === 'folder') return;

        // 🔥 关键：增加版本号，使旧的异步渲染失效
        this.#renderVersion++;

        // 切换文档时重置滚动高亮状态
        this.#scrollToHeadingVersion++; // 使上一个文档任何飞行中的 scroll-to-heading 失效
        this.#activeHeadingId = null;
        this.#headingOffsets = [];
        this.#suppressScrollSpy = false;
        if (this.#scrollSpyRaf) {
            cancelAnimationFrame(this.#scrollSpyRaf);
            this.#scrollSpyRaf = null;
        }
        this.state.updateActiveHeading(null);

        // 清理所有待处理集合和定时器
        this.#clearAllPendingTasks();

        // 重置渲染状态
        this.#lastRenderedData = {
            markdown: '',
            codeBlocks: new Map(),
            mermaidBlocks: new Map(),
            mathBlocks: new Map(),
            headings: []
        };

        // 切换文档时立即清空标题，避免新文档无标题时旧目录残留
        this.state.updateHeadings([]);

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
     * 清理所有待处理任务
     * @private
     */
    #clearAllPendingTasks() {
        // 清理待处理集合
        this.#pendingCodeBlocks.clear();
        this.#pendingMermaidBlocks.clear();
        this.#pendingMathBlocks.clear();
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

        // 检测变化
        const changes = this.#detectChanges(markdown);

        // 完全没变，跳过
        if (markdown === this.#lastRenderedData.markdown) return;

        // 渲染 Markdown 为 HTML，同时提取标题数据（唯一提取点）
        const { html, headings: renderedHeadings } = this.renderMarkdown(markdown);

        // 标题变化检测（与缓存比较，形状相同：{id, level, textContent}）
        const oldHeadings = this.#lastRenderedData.headings;
        const headingsChanged =
            oldHeadings.length !== renderedHeadings.length ||
            renderedHeadings.some(
                (h, i) => oldHeadings[i]?.id !== h.id ||
                           oldHeadings[i]?.level !== h.level ||
                           oldHeadings[i]?.textContent !== h.textContent
            );

        // 同步更新缓存（在 DOM 更新前，避免 rAF 窗口期内的脏读）
        this.#lastRenderedData = {
            markdown,
            codeBlocks: changes.newCodeBlocks,
            mermaidBlocks: changes.newMermaidBlocks,
            mathBlocks: changes.newMathBlocks,
            headings: renderedHeadings
        };

        // 智能更新 DOM，同时收集需要处理的元素
        const elementsToProcess = this.#updateDOM(html, changes);

        // 标题有变化时直接推送，无需 DOM 查询
        if (headingsChanged) {
            this.state.updateHeadings(renderedHeadings);
        }

        // 延迟处理元素（避免阻塞主线程）
        requestAnimationFrame(() => {
            // 缓存标题偏移量，并初始化滚动高亮（渲染后 DOM 已稳定，一次性读取 getBoundingClientRect）
            this.#cacheHeadingOffsets();
            this.#runScrollSpy();
            if (elementsToProcess) {
                if (elementsToProcess.pendingCodeBlocks.length > 0) {
                    this.#highlightCode(elementsToProcess.pendingCodeBlocks);
                }
                if (elementsToProcess.pendingMermaidBlocks.length > 0) {
                    this.#renderMermaid(elementsToProcess.pendingMermaidBlocks);
                }
                if (elementsToProcess.pendingMermaidTransitions?.length > 0) {
                    this.#renderMermaidTransitions(elementsToProcess.pendingMermaidTransitions);
                }
                if (elementsToProcess.pendingMathElements.length > 0) {
                    this.#renderMath(elementsToProcess.pendingMathElements);
                }
                if (elementsToProcess.pendingCopyBtn.length > 0) {
                    this.#addCopyButtons(elementsToProcess.pendingCopyBtn);
                }
            }
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

        let codeIndex = 0, mermaidIndex = 0, mathIndex = 0;
        const codeBlockRanges = [];

        // 第一步：提取代码块（包括 mermaid），并记录位置
        // 修复：支持更多语言标识符（如 c++、c#），允许可选的空白字符和换行
        const codeBlockRegex = /```(\S*)[ \t]*\r?\n?([\s\S]*?)```/g;
        let match;
        while ((match = codeBlockRegex.exec(newMarkdown)) !== null) {
            const [fullMatch] = match;
            const startIndex = match.index;
            const endIndex = startIndex + fullMatch.length;

            // 记录代码块位置范围（用于排除标题提取和数学公式）
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

        // 第一步半：提取行内代码块位置（用于排除数学公式解析）
        // 注意：必须排除已被代码块覆盖的区域，避免匹配到代码块标记中的反引号
        const inlineCodeRegex = /`([^`]+)`/g;
        while ((match = inlineCodeRegex.exec(newMarkdown)) !== null) {
            const startIndex = match.index;
            const endIndex = startIndex + match[0].length;
            
            // 检查这个行内代码是否在代码块内，如果是就跳过
            const alreadyInCodeBlock = codeBlockRanges.some(
                range => startIndex >= range.start && startIndex < range.end
            );
            
            if (!alreadyInCodeBlock) {
                codeBlockRanges.push({ start: startIndex, end: endIndex });
            }
        }

        // 辅助函数：检查位置是否在任何代码块内
        const isInAnyCodeBlock = (index) => codeBlockRanges.some(
            range => index >= range.start && index < range.end
        );

        // 第二步：提取数学公式（块级和行内），排除代码块内的
        const mathRegex = /\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/g;
        while ((match = mathRegex.exec(newMarkdown)) !== null) {
            const matchIndex = match.index;

            // 跳过代码块内的数学公式标记
            if (isInAnyCodeBlock(matchIndex)) {
                continue;
            }

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

        // 比较变化，并记录具体哪些元素发生了变化
        const changedCodeBlocks = this.#findChangedMapEntries(oldData.codeBlocks, codeBlocks);
        const changedMermaidBlocks = this.#findChangedMapEntries(oldData.mermaidBlocks, mermaidBlocks);
        const changedMathBlocks = this.#findChangedMapEntries(oldData.mathBlocks, mathBlocks);

        return {
            newCodeBlocks: codeBlocks,
            newMermaidBlocks: mermaidBlocks,
            newMathBlocks: mathBlocks,
            changedCodeBlocks,
            changedMermaidBlocks,
            changedMathBlocks
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
        const renderedHeadings = []; // 在此处收集，作为唯一提取点
        try {
            const mathBlocks = [];
            const supSubBlocks = [];
            const strikeBlocks = [];

            // 预处理：找出所有代码块和行内代码的位置，用于排除数学公式匹配
            // 使用单次扫描收集所有代码块位置，然后排序并合并重叠范围
            const codeRanges = [];
            const codeRegex = /```[\s\S]*?```|`[^`]+`/g;
            let codeMatch;
            while ((codeMatch = codeRegex.exec(markdown)) !== null) {
                codeRanges.push({ start: codeMatch.index, end: codeMatch.index + codeMatch[0].length });
            }

            // 性能优化：排序并合并重叠/相邻的范围，减少检查次数
            if (codeRanges.length > 1) {
                codeRanges.sort((a, b) => a.start - b.start);
                const merged = [codeRanges[0]];
                for (let i = 1; i < codeRanges.length; i++) {
                    const last = merged[merged.length - 1];
                    const curr = codeRanges[i];
                    // 如果当前范围与上一个重叠或相邻，合并
                    if (curr.start <= last.end) {
                        last.end = Math.max(last.end, curr.end);
                    } else {
                        merged.push(curr);
                    }
                }
                codeRanges.length = 0;
                codeRanges.push(...merged);
            }

            // 性能优化：使用二分查找检查位置是否在代码块内
            const isInCode = (index) => {
                let left = 0, right = codeRanges.length - 1;
                while (left <= right) {
                    const mid = (left + right) >>> 1;
                    const range = codeRanges[mid];
                    if (index < range.start) {
                        right = mid - 1;
                    } else if (index >= range.end) {
                        left = mid + 1;
                    } else {
                        return true; // 在范围内
                    }
                }
                return false;
            };

            // 性能优化：按优先级处理，避免符号冲突
            const processedMarkdown = markdown
                // 第一步：保护数学公式（公式中可能包含 ^ 和 ~），排除代码块内的
                .replace(/\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/g, (match, block, inline, offset) => {
                    // 如果匹配在代码块内，不处理
                    if (isInCode(offset)) {
                        return match;
                    }
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

                // 添加标题 ID 并同步提取标题数据（唯一提取点，避免后续 DOM 查询）
                let headingIndex = 0;
                html = html.replace(/<h([1-6])([^>]*)>(.*?)<\/h\1>/gi, (match, level, attrs, inner) => {
                    if (attrs.includes('id=')) return match;
                    const id = `heading-${headingIndex++}`;
                    // 剥离行内 HTML 标签，获得纯文本用于 TOC 显示
                    const textContent = inner.replace(/<[^>]+>/g, '');
                    renderedHeadings.push({ id, level: +level, textContent });
                    return `<h${level}${attrs} id="${id}">${inner}</h${level}>`;
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

            return { html, headings: renderedHeadings };
        } catch (e) {
            console.warn('Markdown 渲染失败:', e);
            return { html: this.escapeHtml(markdown), headings: [] };
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

        // 🔥 收集过渡中的 mermaid 图表（已有旧 SVG 但需要渲染新内容）
        const pendingMermaidTransitions = dom.getAllIn(
            this.container,
            'div.mermaid.mermaid-transition[data-mermaid-new]'
        );

        return {
            pendingCodeBlocks,
            pendingMermaidBlocks,
            pendingMermaidTransitions,
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

        // 收集 Mermaid 图表（存储引用），同时建立按位置索引的映射（避免后续 regex）
        maps.mermaidByIndex = new Map();
        const mermaidBlocks = dom.getAllIn(this.container, 'div.mermaid[data-mermaid]');
        mermaidBlocks.forEach((el, index) => {
            const text = el.getAttribute('data-mermaid');
            if (text) {
                const hash = this.#generateSimpleHash(text);
                const compositeKey = `${hash}_idx_${index}`;
                maps.mermaid.set(compositeKey, el);
                maps.mermaidByIndex.set(index, el);
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
                // 直接移动旧元素（保留所有事件监听器，无需克隆和重新绑定）
                const newPre = newEl.parentElement;
                const newWrapper = newPre?.parentElement?.classList.contains('code-block-wrapper')
                    ? newPre.parentElement
                    : newPre;
                newWrapper.replaceWith(oldWrapper);
            }
        });

        // 保留未变化的 Mermaid 图表（直接移动元素，避免深克隆 SVG 树）
        const mermaidByIndex = oldElements.mermaidByIndex;

        newMermaidBlocks.forEach((newEl, index) => {
            const text = newEl.textContent.trim();
            const hash = this.#generateSimpleHash(text);
            const compositeKey = `${hash}_idx_${index}`;
            const oldDiv = oldElements.mermaid.get(compositeKey);

            if (oldDiv &&
                !changes.changedMermaidBlocks.has(compositeKey) &&
                oldDiv.classList.contains('mermaid-done')) {
                // 直接移动（transplant）旧元素，避免 cloneNode(true) 深克隆 SVG
                newEl.parentElement.replaceWith(oldDiv);
            } else if (changes.changedMermaidBlocks.has(compositeKey)) {
                // 过渡替换：旧 SVG 保持可见直到新图渲染完成
                const oldDivByIdx = mermaidByIndex?.get(index);
                if (oldDivByIdx && oldDivByIdx.classList.contains('mermaid-done')) {
                    // 直接移动旧元素作为占位符（无需克隆）
                    oldDivByIdx.setAttribute('data-mermaid-new', text);
                    oldDivByIdx.setAttribute('data-mermaid', text);
                    oldDivByIdx.classList.add('mermaid-transition');
                    newEl.parentElement.replaceWith(oldDivByIdx);
                }
                // 若无旧 div，则保留 <pre>，走正常渲染路径
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
                newEl.replaceWith(oldEl); // 直接移动，保留已渲染的 KaTeX DOM
            }
        });
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

        // 可见块也走 batch 路径，通过 requestIdleCallback 分帧渲染，避免大量块卡顿首帧
        if (visible.length > 0) {
            this.#highlightCodeBatch(visible);
        }

        // 监听不可见元素，IntersectionObserver 按需延迟渲染
        invisible.forEach(block => {
            block.classList.add('code-pending');
            this.#pendingCodeBlocks.add(block);
            this.#intersectionObserver.observe(block);
        });
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
     * 将 <code class="language-mermaid"> 转换为 <div class="mermaid"> 并插入 DOM
     * @param {Element} codeBlock
     * @returns {Element|null}
     * @private
     */
    #prepareMermaidDiv(codeBlock) {
        const code = codeBlock.textContent.trim();
        if (!code) return null;
        const pre = codeBlock.parentElement;
        if (!pre?.parentNode) return null;
        if (pre.classList.contains('mermaid')) return pre;
        const div = document.createElement('div');
        div.className = 'mermaid';
        div.textContent = code;
        div.setAttribute('data-mermaid', code);
        pre.parentNode.replaceChild(div, pre);
        return div;
    }

    /**
     * 核心渲染方法：批量执行 mermaid.run 并管理状态
     * @param {Element[]} nodes - 待渲染的 div.mermaid 元素（可含屏幕外元素）
     * @returns {Promise<void>}
     * @private
     */
    async #runMermaid(nodes) {
        const pending = nodes.filter(div =>
            div.isConnected &&
            !div.classList.contains('mermaid-done') &&
            !div.classList.contains('mermaid-rendering')
        );
        if (!pending.length) return;

        pending.forEach(div => {
            div.classList.remove('mermaid-pending', 'render-error');
            div.classList.add('mermaid-rendering');
        });

        try {
            await mermaid.run({ nodes: pending });
            pending.forEach(div => {
                div.classList.remove('mermaid-rendering');
                if (div.isConnected) div.classList.add('mermaid-done');
            });
        } catch (err) {
            console.warn('Mermaid 渲染失败:', err);
            pending.forEach(div => {
                div.classList.remove('mermaid-rendering');
                if (div.isConnected && !div.classList.contains('mermaid-done')) {
                    div.textContent = '图表渲染失败: ' + err.message;
                    div.classList.add('render-error');
                }
            });
        }
    }

    /**
     * 渲染新出现的 Mermaid 代码块（<code> 元素）
     * 可见块立即渲染，不可见块交给 IntersectionObserver 延迟处理
     * @param {Element[]} codeBlocks - language-mermaid 的 <code> 元素数组
     * @private
     */
    #renderMermaid(codeBlocks) {
        if (!codeBlocks.length) return;

        const divs = codeBlocks.map(c => this.#prepareMermaidDiv(c)).filter(Boolean);
        if (!divs.length) return;

        if (!this.#intersectionObserver) {
            this.#runMermaid(divs);
            return;
        }

        const { visible, invisible } = this.#partitionByVisibility(divs);

        const toRender = visible.filter(d => !d.classList.contains('mermaid-done'));
        if (toRender.length) this.#runMermaid(toRender);

        invisible.forEach(div => {
            div.classList.add('mermaid-pending');
            this.#pendingMermaidBlocks.add(div);
            if (this.#intersectionObserver) this.#intersectionObserver.observe(div);
        });
    }

    /**
     * 过渡渲染：旧 SVG 保持可见，离屏渲染新图后原地替换内容，消除闪烁
     * @param {Element[]} transitionDivs - 带 data-mermaid-new 的 div.mermaid 元素
     * @private
     */
    async #renderMermaidTransitions(transitionDivs) {
        if (!transitionDivs.length) return;

        const offscreen = document.createElement('div');
        offscreen.style.cssText = 'position:absolute;left:-9999px;top:-9999px;visibility:hidden;';
        document.body.appendChild(offscreen);

        const targets = transitionDivs.map(placeholder => {
            const code = placeholder.getAttribute('data-mermaid-new');
            if (!code) return null;
            const temp = document.createElement('div');
            temp.className = 'mermaid';
            temp.textContent = code;
            offscreen.appendChild(temp);
            return { placeholder, temp, code };
        }).filter(Boolean);

        if (!targets.length) { offscreen.remove(); return; }

        try {
            await mermaid.run({ nodes: targets.map(t => t.temp) });
            targets.forEach(({ placeholder, temp, code }) => {
                if (!placeholder.isConnected || !this.container.contains(placeholder)) return;
                placeholder.innerHTML = temp.innerHTML;
                placeholder.setAttribute('data-mermaid', code);
                placeholder.removeAttribute('data-mermaid-new');
                placeholder.removeAttribute('data-processed');
                placeholder.classList.remove('mermaid-transition', 'mermaid-rendering');
                placeholder.classList.add('mermaid-done');
            });
        } catch (err) {
            console.warn('Mermaid 过渡渲染失败:', err);
            targets.forEach(({ placeholder }) => {
                if (!placeholder.isConnected) return;
                placeholder.removeAttribute('data-mermaid-new');
                placeholder.classList.remove('mermaid-transition', 'mermaid-rendering', 'mermaid-done');
                placeholder.textContent = '图表渲染失败: ' + err.message;
                placeholder.classList.add('render-error');
            });
        } finally {
            offscreen.remove();
        }
    }

    /**
     * 切换主题时重新渲染所有 Mermaid 图表
     */
    async updateMermaidTheme() {
        this.#configureMermaid(this.state.get('interface')?.theme);

        const divs = Array.from(this.container.querySelectorAll('div.mermaid[data-mermaid]'))
            .filter(div => div.isConnected);
        if (!divs.length) return;

        // 离屏渲染新主题，渲染完成后原地替换，避免闪烁
        const offscreen = document.createElement('div');
        offscreen.style.cssText = 'position:absolute;left:-9999px;top:-9999px;visibility:hidden;';
        document.body.appendChild(offscreen);

        const targets = divs.map(div => {
            const code = div.getAttribute('data-mermaid');
            if (!code) return null;
            const temp = document.createElement('div');
            temp.className = 'mermaid';
            temp.textContent = code;
            offscreen.appendChild(temp);
            return { div, temp, code };
        }).filter(Boolean);

        try {
            await mermaid.run({ nodes: targets.map(t => t.temp) });
            targets.forEach(({ div, temp }) => {
                if (!div.isConnected) return;
                div.innerHTML = temp.innerHTML;
                div.removeAttribute('data-processed');
                div.classList.remove('mermaid-rendering', 'mermaid-pending', 'render-error');
                div.classList.add('mermaid-done');
            });
        } catch (err) {
            console.warn('Mermaid 主题切换失败:', err);
            targets.forEach(({ div, code }) => {
                if (!div.isConnected) return;
                div.textContent = '图表渲染失败: ' + err.message;
                div.classList.remove('mermaid-done', 'mermaid-rendering');
                div.classList.add('render-error');
            });
        } finally {
            offscreen.remove();
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

        // 可见公式也走 batch 路径，通过 requestIdleCallback 分帧渲染，避免大量公式卡顿首帧
        if (visible.length > 0) {
            this.#renderMathBatch(visible);
        }

        // 监听不可见公式，IntersectionObserver 按需延迟渲染
        invisible.forEach(el => {
            el.classList.add('math-pending');
            this.#pendingMathBlocks.add(el);
            this.#intersectionObserver.observe(el);
        });
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
        // 元素未参与布局（容器隐藏，如仅显示编辑器时 preview 面板被隐藏），
        // getBoundingClientRect 返回全零矩形，此时应视为不可见，
        // 等待 IntersectionObserver 在面板重新显示时触发渲染。
        if (rect.width === 0 && rect.height === 0) return false;
        const buffer = Preview.#VISIBILITY_BUFFER;
        return rect.top < window.innerHeight + buffer && rect.bottom > -buffer;
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

        // 清理 scroll spy 残留 rAF
        if (this.#scrollSpyRaf) {
            cancelAnimationFrame(this.#scrollSpyRaf);
            this.#scrollSpyRaf = null;
        }

        // 清理 IntersectionObserver
        if (this.#intersectionObserver) {
            this.#intersectionObserver.disconnect();
            this.#intersectionObserver = null;
        }

        // 清理滚动侦测
        if (this.#scrollWrapper && this.#scrollHandler) {
            this.#scrollWrapper.removeEventListener('scroll', this.#scrollHandler);
            this.#scrollWrapper = null;
            this.#scrollHandler = null;
        }
        if (this.#scrollSpyRaf) {
            cancelAnimationFrame(this.#scrollSpyRaf);
            this.#scrollSpyRaf = null;
        }

        // 清理待处理集合
        this.#pendingCodeBlocks.clear();
        this.#pendingMermaidBlocks.clear();
        this.#pendingMathBlocks.clear();

        super.destroy();
    }
}
