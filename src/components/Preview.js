/**
 * 预览组件
 * 负责 Markdown 渲染、代码高亮、Mermaid 图表、数学公式
 */
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import Prism from 'prismjs';
import { BaseComponent } from './BaseComponent.js';
import { dom } from '../utils/dom.js';
import { isInternalImagePath, getImageUrl, decodeHtmlEntities } from '../utils/helpers.js';

let mermaidModulePromise = null;
let katexModulePromise = null;

function loadMermaidModule() {
    if (!mermaidModulePromise) {
        mermaidModulePromise = import('mermaid').then(module => module.default || module);
    }
    return mermaidModulePromise;
}

function loadKatexModule() {
    if (!katexModulePromise) {
        katexModulePromise = import('katex').then(module => module.default || module);
    }
    return katexModulePromise;
}

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

// 检测块级 HTML 元素内部是否包含 Markdown 语法（链接/图片、强调、行内代码、标题等）
const _MD_SYNTAX_RE = /!?\[|\*\*|\*[^*]|`|#{1,6} /;

/**
 * 在 marked.parse 之前预处理 Markdown：将块级 HTML 元素（div/center 等）内的 Markdown 语法
 * 提前渲染为 HTML，使 marked 将其作为原始 HTML 块直通输出。
 * 代码围栏内容通过 split 排除，不会被错误处理。
 * 每次调用内部创建新的 RegExp 实例，避免递归时 lastIndex 共享问题。
 */
function _preprocessHtmlBlocks(md) {
    const parts = md.split(/(```[\s\S]*?```)/g);
    return parts
        .map((part, i) => {
            if (i % 2 === 1) return part; // 奇数分段为代码围栏内容，保持原样
            return part.replace(
                /^(<(?:div|section|article|center|details|summary|figure|figcaption|aside|header|footer|main)\b[^>\n]*>)[ \t]*\n([\s\S]*?)\n[ \t]*(<\/(?:div|section|article|center|details|summary|figure|figcaption|aside|header|footer|main)>)[ \t]*$/gim,
                (match, open, inner, close) => {
                    if (!_MD_SYNTAX_RE.test(inner)) return match;
                    const innerHtml = marked.parse(_preprocessHtmlBlocks(inner), {
                        breaks: false,
                        gfm: true
                    });
                    return `${open}\n${innerHtml}\n${close}`;
                }
            );
        })
        .join('');
}

/**
 * 预览组件
 */
export class Preview extends BaseComponent {
    // ==================== 私有字段声明 ====================

    /** @private 上次渲染的数据 */
    #lastRenderedData = {
        markdown: null,
        codeBlocks: new Map(),
        mermaidBlocks: new Map(),
        mathBlocks: new Map(),
        headings: []
    };
    /** @private 上次渲染的原始内容 */
    #lastRenderedContent = '';

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

    /** @private Lightbox 弹层（懒初始化） */
    #lightbox = null;
    /** @private Lightbox 当前缩放比例 */
    #lightboxScale = 1;
    /** @private Lightbox 基准宽度（scale=1 时的尺寸，px） */
    #lightboxBaseWidth = 0;
    /** @private Lightbox 拖拽状态 */
    #lightboxDrag = null;
    /** @private Lightbox 平移偏移（px） */
    #lightboxOx = 0;
    #lightboxOy = 0;
    /** @private 滚轮缩放 RAF 句柄（节流用） */
    #lightboxZoomRaf = null;
    /** @private 待处理的累积滚轮 delta */
    #pendingWheelDelta = 0;
    /** @private 待处理滚轮事件的最新光标位置 */
    #pendingWheelX = 0;
    #pendingWheelY = 0;
    // 缓存 Lightbox 内部 DOM 引用（犯层消除 querySelector 开销）
    #lbInner = null;
    #lbStage = null;
    #lbScaleLabel = null;
    #lbToolbar = null;
    #lbDownloadMenu = null;
    /** @private Lightbox 当前内容元素（img 或 svg） */
    #lbContent = null;
    /** @private Lightbox 当前下载资源信息 */
    #lightboxAsset = null;

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
            markdown: null,
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
        this.#initIntersectionObserver();

        // 订阅导出准备事件：强制完整渲染后通知 Exporter
        this.state.subscribeTo('export:prepare', async type => {
            await this.#renderAllForExport();
            const html = this.container?.innerHTML ?? '';
            this.state.triggerExportReady(type, html);
        });
    }

    /**
     * 初始化 Mermaid
     */
    async initMermaid() {
        if (this.mermaidInitialized) return;
        await this.#configureMermaid();
        this.mermaidInitialized = true;
    }

    /**
     * 配置 Mermaid 主题
     * @param theme
     * @private
     */
    async #configureMermaid() {
        const mermaid = await loadMermaidModule();
        // 始终以亮色主题渲染 SVG，暗色模式由 CSS filter 处理。
        // 这样用户在图中手写的 color/fill 等字面值在明暗主题下都能保持可读性，
        // 因为 invert(1) hue-rotate(180deg) 只反转明暗，不破坏色相。
        mermaid.initialize({
            startOnLoad: false,
            theme: 'base',
            themeVariables: {
                // background 设为 transparent：避免暗色模式下 invert 后变成纯黑覆盖容器
                background: 'transparent',
                // 使用低饱和浅色做分层，亮色模式简约通透，暗色模式经 invert 后保持层次。
                fontFamily:
                    '"Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif',
                primaryColor: '#dcebf7',
                primaryTextColor: '#243042',
                primaryBorderColor: '#7e9db8',
                secondaryColor: '#e7efdf',
                secondaryTextColor: '#243042',
                secondaryBorderColor: '#8da37d',
                tertiaryColor: '#f7eadb',
                tertiaryTextColor: '#243042',
                tertiaryBorderColor: '#c49a73',
                mainBkg: '#dcebf7',
                nodeBorder: '#7e9db8',
                lineColor: '#72859a',
                textColor: '#243042',
                titleColor: '#1f2937',
                clusterBkg: '#f6f3ec',
                clusterBorder: '#d4c6b2',
                edgeLabelBackground: 'transparent',
                labelBoxBkgColor: '#f3f6fa',
                labelBoxBorderColor: '#cad6e2',
                noteBkgColor: '#f5f0cf',
                noteTextColor: '#4b5563',
                noteBorderColor: '#d2c38a',
                actorBkg: '#dcebf7',
                actorBorder: '#7e9db8',
                actorTextColor: '#243042',
                actorLineColor: '#72859a',
                signalColor: '#5f7488',
                signalTextColor: '#243042',
                labelTextColor: '#243042',
                activationBkgColor: '#e7efdf',
                activationBorderColor: '#8da37d',
                sectionBkgColor: '#f8f4ec',
                altSectionBkgColor: '#eef4fb',
                gridColor: '#d7dee7',
                cScale0: '#dcebf7',
                cScale1: '#e7efdf',
                cScale2: '#f7eadb',
                cScale3: '#f5f0cf',
                cScale4: '#eadff1',
                cScale5: '#dfeaf0',
                cScale6: '#efe6d8',
                cScale7: '#e5ecd8'
            },
            securityLevel: 'loose',
            logLevel: 'error',
            // 🔥 性能优化配置
            maxTextSize: 99999,
            maxEdges: 999,
            flowchart: { curve: 'basis' },
            sequence: { useMaxWidth: true },
            gantt: { useMaxWidth: true }
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
                        if (
                            element.classList.contains('code-pending') &&
                            !element.classList.contains('prism-highlighted')
                        ) {
                            this.#pendingCodeBlocks.delete(element);
                            this.#intersectionObserver.unobserve(element);
                            element.classList.remove('code-pending');
                            this.#highlightSingleBlock(element);
                        }

                        // 处理 Mermaid 渲染 —— 收集到批次，一次性 mermaid.run
                        if (
                            element.classList.contains('mermaid-pending') &&
                            !element.classList.contains('mermaid-done') &&
                            !element.classList.contains('mermaid-rendering')
                        ) {
                            this.#pendingMermaidBlocks.delete(element);
                            this.#intersectionObserver.unobserve(element);
                            element.classList.remove('mermaid-pending');
                            mermaidBatch.push(element);
                        }

                        // 处理数学公式渲染
                        if (
                            element.classList.contains('math-pending') &&
                            !element.classList.contains('math-rendered')
                        ) {
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
        // 订阅内容和当前文档变化（主题变化由 CSS filter 处理，无需重渲染）
        const unsubscribeContent = this.state.subscribeTo(
            ['content', 'currentDocId'],
            (newValue, oldValue, key) => {
                if (key === 'content') {
                    this.updatePreview();
                } else if (key === 'currentDocId') {
                    this.forceUpdatePreview();
                }
            }
        );

        // 订阅来自 RightSidebar / 其他组件的标题跳转请求
        const unsubscribeScroll = this.state.subscribeTo('scroll:heading', headingId =>
            this.#doScrollToHeading(headingId)
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
                if (
                    href.startsWith('http://') ||
                    href.startsWith('https://') ||
                    href.startsWith('//')
                ) {
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

        // 代码复制按钮 — 事件委托，一个监听器处理所有按钮
        this.addEventListener(
            this.container,
            'click',
            e => {
                const btn = e.target.closest('.code-copy-btn');
                if (!btn || btn.classList.contains('copied')) return;
                const code = btn.closest('.code-block-wrapper')?.querySelector('code');
                if (!code) return;
                e.stopPropagation();
                navigator.clipboard
                    .writeText(code.textContent)
                    .then(() => {
                        btn.querySelector('i').className = 'codicon codicon-check';
                        btn.classList.add('copied');
                        setTimeout(() => {
                            btn.querySelector('i').className = 'codicon codicon-copy';
                            btn.classList.remove('copied');
                        }, 2000);
                    })
                    .catch(err => console.error('复制失败:', err));
            },
            false
        );

        // 图片 / Mermaid 图表点击放大（合并为一个委托）
        this.addEventListener(
            this.container,
            'click',
            e => {
                const img = e.target.closest('img');
                if (img && img.dataset.loadStatus === 'success') {
                    // 图片被链接包裹时，优先让链接事件处理，不触发 lightbox
                    if (img.closest('a')) return;
                    this.#openLightbox('img', img);
                    return;
                }
                const mermaidEl = e.target.closest('.mermaid.mermaid-done');
                if (mermaidEl) this.#openLightbox('mermaid', mermaidEl);
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
        const isAfter = el =>
            target && !!(target.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING);

        // ── 1. 数学公式：一次查询覆盖 pending Set + rAF-batch 两条路径 ────────
        const mathFlushed = this.#flushPendingMath();
        let needsReflow = mathFlushed;

        // ── 2. Mermaid pending：按位置分流，目标前必须等待，目标后 fire-and-forget ──
        if (this.#pendingMermaidBlocks.size > 0) {
            needsReflow = true;
            const before = [],
                after = [];
            for (const el of this.#pendingMermaidBlocks) {
                if (!el.isConnected) continue;
                observer?.unobserve(el);
                el.classList.remove('mermaid-pending');
                (isAfter(el) ? after : before).push(el);
            }
            this.#pendingMermaidBlocks.clear();
            if (after.length) this.#runMermaid(after);
            if (before.length) {
                await Promise.race([
                    this.#runMermaid(before),
                    new Promise(r => setTimeout(r, 3000))
                ]);
                if (myVersion !== this.#scrollToHeadingVersion) return;
            }
        }

        // ── 3. Mermaid rendering：轮询等待目标前方已在渲染中的图表完成 ─────────
        const renderingBefore = [
            ...this.container.querySelectorAll('div.mermaid.mermaid-rendering')
        ].filter(el => !isAfter(el));
        if (renderingBefore.length) {
            needsReflow = true;
            await this.#awaitMermaidRendering(renderingBefore, 3000);
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
            const top =
                finalTarget.getBoundingClientRect().top -
                scrollEl.getBoundingClientRect().top +
                scrollEl.scrollTop -
                16;
            const clampedTop = Math.min(
                Math.max(0, top),
                scrollEl.scrollHeight - scrollEl.clientHeight
            );

            // 若目标已在正确位置，无需滚动，跳过 scrollTo 避免等待不会触发的 scrollend
            if (Math.abs(scrollEl.scrollTop - clampedTop) > 2) {
                // 顺序等待：scrollend + 1500ms fallback，无嵌套回调
                await new Promise(resolve => {
                    let settled = false;
                    const finish = () => {
                        if (!settled) {
                            settled = true;
                            clearTimeout(fb);
                            resolve();
                        }
                    };
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
        const { scrollTop } = this.#scrollWrapper;
        // Math.floor 消除亚像素浮点误差，确保 spy 阈值能准确命中缓存值
        this.#headingOffsets = Array.from(
            this.container.querySelectorAll('[id^="heading-"]'),
            h => ({
                id: h.id,
                top: Math.floor(h.getBoundingClientRect().top - wrapperTop + scrollTop)
            })
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
        let lo = 0,
            hi = this.#headingOffsets.length - 1,
            activeId = null;
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
        // 初始渲染预览内容（包括空内容时显示空状态提示）
        const content = this.state.get('content') || '';
        this.renderContent(content);
        this.#lastRenderedContent = content;
    }

    /**
     * 更新预览
     */
    updatePreview() {
        const content = this.state.get('content');

        // 避免重复渲染（但允许初始渲染）
        if (content === this.#lastRenderedContent && this.#lastRenderedContent !== '') return;

        this.#scheduleRender(content, 150);
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
        if (!doc || doc.type !== 'file') return;

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

        // 重置渲染状态（markdown 用 null 标记"未渲染"，避免空内容时跳过渲染）
        this.#lastRenderedData = {
            markdown: null,
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
     * 导出前强制完整渲染所有待处理元素（代码高亮、Mermaid、数学公式）
     * 对应 IntersectionObserver 的懒渲染，导出时需一次性渲染所有内容，不论是否可见
     * @private
     */
    async #renderAllForExport() {
        const observer = this.#intersectionObserver;

        // ── 1. 数学公式：覆盖 pending Set + rAF-batch 两条路径 ───
        this.#flushPendingMath();

        // ── 2. 代码高亮 ──────────────────────────────────────────
        if (this.#pendingCodeBlocks.size > 0) {
            const blocks = [...this.#pendingCodeBlocks];
            this.#pendingCodeBlocks.clear();
            for (const el of blocks) {
                if (!el.isConnected) continue;
                observer?.unobserve(el);
                el.classList.remove('code-pending');
                this.#highlightSingleBlock(el);
            }
        }

        // ── 3. Mermaid（全部等待完成）────────────────────────────
        if (this.#pendingMermaidBlocks.size > 0) {
            const nodes = [];
            for (const el of this.#pendingMermaidBlocks) {
                if (!el.isConnected) continue;
                observer?.unobserve(el);
                el.classList.remove('mermaid-pending');
                nodes.push(el);
            }
            this.#pendingMermaidBlocks.clear();
            if (nodes.length) {
                await Promise.race([
                    this.#runMermaid(nodes),
                    new Promise(r => setTimeout(r, 5000))
                ]);
            }
        }

        // ── 4. 等待已在渲染中的 Mermaid 图表完成 ─────────────────
        await this.#awaitMermaidRendering(undefined, 5000);

        // ── 5. 等待一帧确保 DOM 更新完毕 ─────────────────────────
        await new Promise(r => requestAnimationFrame(r));
    }

    /**
     * 强制渲染所有待处理数学公式。
     * 使用 querySelectorAll 而非仅检查 #pendingMathBlocks，
     * 确保同时覆盖 pending Set 和 rAF-batch 两条路径中的未渲染元素。
     * @returns {boolean} 是否有公式被处理
     * @private
     */
    #flushPendingMath() {
        const elements = this.container.querySelectorAll(
            '.math-block:not(.math-rendered), .math-inline:not(.math-rendered)'
        );
        if (!elements.length) return false;
        const observer = this.#intersectionObserver;
        elements.forEach(el => {
            observer?.unobserve(el);
            this.#pendingMathBlocks.delete(el);
            el.classList.remove('math-pending');
            this.#renderSingleMath(el);
        });
        return true;
    }

    /**
     * 轮询等待指定 mermaid 元素渲染完成。
     * @param {Element[]} [nodes] - 要等待的元素；省略时查询容器内所有 mermaid-rendering 元素
     * @param {number} [timeout=3000] - 最大等待毫秒数
     * @returns {Promise<void>}
     * @private
     */
    async #awaitMermaidRendering(nodes, timeout = 3000) {
        const pending = nodes ?? [
            ...(this.container?.querySelectorAll('div.mermaid.mermaid-rendering') ?? [])
        ];
        if (!pending.length) return;
        await Promise.race([
            new Promise(resolve => {
                const check = () =>
                    pending.some(el => el.isConnected && el.classList.contains('mermaid-rendering'))
                        ? requestAnimationFrame(check)
                        : resolve();
                requestAnimationFrame(check);
            }),
            new Promise(r => setTimeout(r, timeout))
        ]);
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

        // 完全没变，跳过
        if (markdown === this.#lastRenderedData.markdown) return;

        // 空内容快速路径：显示空状态提示，跳过检测和渲染
        if (!markdown) {
            this.container.innerHTML = `
                <div class="md-empty-state">
                    <i class="codicon codicon-markdown"></i>
                    <p>开始编写你的文档</p>
                </div>
            `;
            this.#lastRenderedData = {
                markdown: '',
                codeBlocks: new Map(),
                mermaidBlocks: new Map(),
                mathBlocks: new Map(),
                headings: []
            };
            this.state.updateHeadings([]);
            return;
        }

        const featureFlags = this.#getMarkdownFeatureFlags(markdown);
        const analysis = this.#analyzeMarkdown(markdown, featureFlags);

        // 检测变化
        const changes = this.#detectChanges(analysis);

        // 渲染 Markdown 为 HTML，同时提取标题数据（唯一提取点）
        const { html, headings: renderedHeadings } = this.renderMarkdown(
            markdown,
            featureFlags,
            analysis
        );

        // 标题变化检测（与缓存比较，形状相同：{id, level, textContent}）
        const oldHeadings = this.#lastRenderedData.headings;
        const headingsChanged =
            oldHeadings.length !== renderedHeadings.length ||
            renderedHeadings.some(
                (h, i) =>
                    oldHeadings[i]?.id !== h.id ||
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
        const elementsToProcess = this.#updateDOM(html, changes, featureFlags);

        // 标题有变化时直接推送，无需 DOM 查询
        if (headingsChanged) {
            this.state.updateHeadings(renderedHeadings);
        }

        // 延迟处理元素（避免阻塞主线程）
        requestAnimationFrame(() => {
            // 内部图片加载不阻塞代码高亮/图表/公式处理
            if (featureFlags.hasImages) {
                this.#processInternalImages().catch(error => {
                    console.warn('Failed to process internal images:', error);
                });
            }

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
                if (elementsToProcess.pendingMathTransitions?.length > 0) {
                    this.#renderMathTransitions(elementsToProcess.pendingMathTransitions);
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
     * 处理内部图片路径
     * 在 Web 环境下，从 data-src 读取路径，从 IndexedDB 加载后设置到 src
     * @private
     */
    async #processInternalImages() {
        const images = dom.getAllIn(this.container, 'img[data-src]');
        // 并行加载所有内部图片，避免串行等待
        await Promise.all(Array.from(images).map(async (img) => {
            const dataSrc = img.getAttribute('data-src');
            if (!dataSrc) return;
            try {
                const blobUrl = await getImageUrl(dataSrc);
                if (blobUrl) {
                    img.src = blobUrl;
                    // 保留 data-src 属性供导出使用
                }
            } catch (error) {
                console.warn('Failed to load internal image:', dataSrc, error);
            }
        }));
    }

    /**
     * 轻量语法特征检测，避免每次渲染都执行不必要的重扫描。
     * @param {string} markdown
     * @returns {{hasMermaid: boolean, hasMath: boolean, hasImages: boolean, hasSupSub: boolean, hasStrike: boolean}}
     * @private
     */
    #getMarkdownFeatureFlags(markdown) {
        return {
            hasMermaid: markdown.includes('```mermaid'),
            hasMath: markdown.includes('$'),
            hasImages: markdown.includes('![') || markdown.includes('<img'),
            hasSupSub: markdown.includes('^') || markdown.includes('~'),
            hasStrike: markdown.includes('~~')
        };
    }

    /**
     * 合并并排序范围，供代码区间排除逻辑复用
     * @param {Array<{start: number, end: number}>} ranges
     * @returns {Array<{start: number, end: number}>}
     * @private
     */
    #mergeRanges(ranges) {
        if (ranges.length <= 1) return ranges;

        const sortedRanges = [...ranges].sort((a, b) => a.start - b.start);
        const merged = [sortedRanges[0]];

        for (let i = 1; i < sortedRanges.length; i++) {
            const last = merged[merged.length - 1];
            const current = sortedRanges[i];

            if (current.start <= last.end) {
                last.end = Math.max(last.end, current.end);
            } else {
                merged.push(current);
            }
        }

        return merged;
    }

    /**
     * 根据范围创建快速命中函数
     * @param {Array<{start: number, end: number}>} ranges
     * @returns {(index: number) => boolean}
     * @private
     */
    #createRangeChecker(ranges) {
        if (!ranges.length) return () => false;

        return index => {
            let lo = 0;
            let hi = ranges.length - 1;

            while (lo <= hi) {
                const mid = (lo + hi) >>> 1;
                const range = ranges[mid];

                if (index < range.start) {
                    hi = mid - 1;
                } else if (index >= range.end) {
                    lo = mid + 1;
                } else {
                    return true;
                }
            }

            return false;
        };
    }

    /**
     * 单次扫描 Markdown，提取增量更新与公式排除所需信息
     * @param {string} markdown
     * @param {Object} featureFlags
     * @returns {Object}
     * @private
     */
    #analyzeMarkdown(markdown, featureFlags) {
        const codeBlocks = new Map();
        const mermaidBlocks = new Map();
        const mathBlocks = new Map();
        const codeRanges = [];

        let codeIndex = 0;
        let mermaidIndex = 0;
        let mathIndex = 0;
        let match;

        const codeBlockRegex = /```(\S*)[ \t]*\r?\n?([\s\S]*?)```/g;
        while ((match = codeBlockRegex.exec(markdown)) !== null) {
            const [fullMatch] = match;
            const startIndex = match.index;
            const endIndex = startIndex + fullMatch.length;

            codeRanges.push({ start: startIndex, end: endIndex });

            const [, lang, content] = match;
            if (lang === 'mermaid') {
                const trimmedCode = content.trim();
                const mermaidHash = this.#generateSimpleHash(trimmedCode);
                const compositeKey = `${mermaidHash}_idx_${mermaidIndex}`;
                mermaidBlocks.set(compositeKey, { code: trimmedCode, index: mermaidIndex++ });
            } else {
                const compositeKey = this.#codeBlockCompositeKey(lang || '', content, codeIndex);
                codeBlocks.set(compositeKey, {
                    lang: lang || 'text',
                    code: content,
                    index: codeIndex++
                });
            }
        }

        if (featureFlags.hasMath) {
            const mergedCodeBlockRanges = this.#mergeRanges(codeRanges);
            const isInCodeBlock = this.#createRangeChecker(mergedCodeBlockRanges);
            const inlineCodeRegex = /`([^`]+)`/g;

            while ((match = inlineCodeRegex.exec(markdown)) !== null) {
                const startIndex = match.index;
                if (isInCodeBlock(startIndex)) continue;
                codeRanges.push({ start: startIndex, end: startIndex + match[0].length });
            }
        }

        const mergedCodeRanges = this.#mergeRanges(codeRanges);

        if (featureFlags.hasMath) {
            const isInCode = this.#createRangeChecker(mergedCodeRanges);
            const mathRegex = /\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/g;

            while ((match = mathRegex.exec(markdown)) !== null) {
                if (isInCode(match.index)) continue;

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
        }

        return {
            markdown,
            codeBlocks,
            mermaidBlocks,
            mathBlocks,
            codeRanges: mergedCodeRanges
        };
    }

    /**
     * 是否存在可复用的未变化项
     * @param {Map} oldMap
     * @param {Map} newMap
     * @param {Set<string>} changed
     * @returns {boolean}
     * @private
     */
    #hasUnchangedEntries(oldMap, newMap, changed) {
        for (const key of oldMap.keys()) {
            if (newMap.has(key) && !changed.has(key)) return true;
        }
        return false;
    }

    /**
     * 检测内容变化（优化版：单次扫描 + 增量检测）
     * @param {Object} analysis - Markdown 分析结果
     * @returns {Object} 变化检测结果
     * @private
     */
    #detectChanges(analysis) {
        const oldData = this.#lastRenderedData;
        const { codeBlocks, mermaidBlocks, mathBlocks } = analysis;

        // 比较变化，并记录具体哪些元素发生了变化
        const changedCodeBlocks = this.#findChangedMapEntries(oldData.codeBlocks, codeBlocks);
        const changedMermaidBlocks = this.#findChangedMapEntries(
            oldData.mermaidBlocks,
            mermaidBlocks
        );
        const changedMathBlocks = this.#findChangedMapEntries(oldData.mathBlocks, mathBlocks);
        const hasReusableBlocks =
            this.#hasUnchangedEntries(oldData.codeBlocks, codeBlocks, changedCodeBlocks) ||
            this.#hasUnchangedEntries(oldData.mermaidBlocks, mermaidBlocks, changedMermaidBlocks) ||
            this.#hasUnchangedEntries(oldData.mathBlocks, mathBlocks, changedMathBlocks);

        return {
            newCodeBlocks: codeBlocks,
            newMermaidBlocks: mermaidBlocks,
            newMathBlocks: mathBlocks,
            changedCodeBlocks,
            changedMermaidBlocks,
            changedMathBlocks,
            hasReusableBlocks
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
     * @param {Object} featureFlags - Markdown 特征标记
     * @param {Object} analysis - 预先计算的 Markdown 分析结果
     * @returns {string} HTML 字符串
     */
    renderMarkdown(markdown, featureFlags, analysis = null) {
        const renderedHeadings = []; // 在此处收集，作为唯一提取点
        try {
            const mathBlocks = [];
            const supSubBlocks = [];
            const strikeBlocks = [];
            let processedMarkdown = markdown;

            if (featureFlags.hasMath || featureFlags.hasStrike || featureFlags.hasSupSub) {
                const isInCode = this.#createRangeChecker(analysis?.codeRanges ?? []);

                if (featureFlags.hasMath) {
                    processedMarkdown = processedMarkdown.replace(
                        /\$\$([\s\S]*?)\$\$|\$([^$\n]+?)\$/g,
                        (match, block, inline, offset) => {
                            if (isInCode(offset)) {
                                return match;
                            }
                            const latex = block !== undefined ? block : inline;
                            const displayMode = block !== undefined;
                            mathBlocks.push({ latex, displayMode });
                            return `\x02MATH${mathBlocks.length - 1}\x02`;
                        }
                    );
                }

                if (featureFlags.hasStrike) {
                    processedMarkdown = processedMarkdown.replace(/~~([^~\n]{1,200})~~/g, (match, content) => {
                        strikeBlocks.push(content);
                        return `\x03STRIKE${strikeBlocks.length - 1}\x03`;
                    });
                }

                if (featureFlags.hasSupSub) {
                    processedMarkdown = processedMarkdown
                        .replace(/\^([^\n^]{1,50})\^/g, (match, content) => {
                            supSubBlocks.push({ type: 'sup', content });
                            return `\x01SUP${supSubBlocks.length - 1}\x01`;
                        })
                        .replace(/~([^~\n]{1,50})~/g, (match, content) => {
                            supSubBlocks.push({ type: 'sub', content });
                            return `\x01SUB${supSubBlocks.length - 1}\x01`;
                        });
                }
            }

            // 使用 marked 解析
            let html;
            if (marked?.parse) {
                // 预处理：将块级 HTML 元素内的 Markdown 提前渲染为 HTML，使 marked 将其直通输出
                html = marked.parse(_preprocessHtmlBlocks(processedMarkdown), {
                    breaks: false,
                    gfm: true
                });

                // 添加标题 ID 并同步提取标题数据（唯一提取点，避免后续 DOM 查询）
                let headingIndex = 0;
                html = html.replace(
                    /<h([1-6])([^>]*)>(.*?)<\/h\1>/gi,
                    (match, level, attrs, inner) => {
                        if (attrs.includes('id=')) return match;
                        const id = `heading-${headingIndex++}`;
                        // 剥离行内 HTML 标签，获得纯文本用于 TOC 显示
                        const textContent = decodeHtmlEntities(inner.replace(/<[^>]+>/g, ''));
                        renderedHeadings.push({ id, level: +level, textContent });
                        return `<h${level}${attrs} id="${id}">${inner}</h${level}>`;
                    }
                );
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
                        'p',
                        'br',
                        'strong',
                        'em',
                        'code',
                        'pre',
                        'blockquote',
                        'ul',
                        'ol',
                        'li',
                        'a',
                        'h1',
                        'h2',
                        'h3',
                        'h4',
                        'h5',
                        'h6',
                        'table',
                        'thead',
                        'tbody',
                        'tr',
                        'th',
                        'td',
                        'hr',
                        'img',
                        'input',
                        'span',
                        'div',
                        'dd',
                        'dt',
                        'dl',
                        's',
                        'sup',
                        'sub'
                    ],
                    ALLOWED_ATTR: [
                        'href',
                        'src',
                        'alt',
                        'title',
                        'class',
                        'id',
                        'type',
                        'checked',
                        'width',
                        'height',
                        'loading',
                        'colspan',
                        'rowspan',
                        'start',
                        'align',
                        'style',
                        'data-load-status',
                        'data-src'
                    ],
                    ALLOW_DATA_ATTR: true
                });
            }

            // 为新生成的图片添加初始状态，并处理内部图片路径
            html = html.replace(/<img([^>]*?)>/g, (match, attrs) => {
                // 如果已经有 data-load-status 属性，跳过
                if (attrs.includes('data-load-status')) {
                    return match;
                }

                // 检查是否为内部图片路径（Web 环境下需要从 IndexedDB 加载）
                const srcMatch = attrs.match(/src="([^"]+)"/);
                if (srcMatch && isInternalImagePath(srcMatch[1])) {
                    // 将 src 移动到 data-src，使用透明占位图作为 src
                    // 注意：无论是否有 alt 属性，都要添加 data-src
                    const newAttrs = attrs
                        .replace(/src="[^"]+"/, 'src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"')
                        + ` data-src="${srcMatch[1]}"`;
                    return `<img${newAttrs} data-load-status="pending">`;
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
    #collectElementsToProcess(featureFlags = {}) {
        const selectors = ['pre code:not(.prism-highlighted)'];
        if (featureFlags.hasImages) selectors.push('img[data-load-status="pending"]');
        if (featureFlags.hasMath) {
            selectors.push('.math-block:not(.math-rendered)', '.math-inline:not(.math-rendered)');
        }

        const allElements = dom.getAllIn(this.container, selectors.join(', '));

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
            } else if (
                el.classList.contains('math-block') ||
                el.classList.contains('math-inline')
            ) {
                pendingMathElements.push(el);
            }
        });

        // 🔥 收集过渡中的 mermaid 图表（已有旧 SVG 但需要渲染新内容）
        const pendingMermaidTransitions = featureFlags.hasMermaid
            ? dom.getAllIn(this.container, 'div.mermaid.mermaid-transition[data-mermaid-new]')
            : [];

        // 🔥 收集过渡中的 block math（已有旧 KaTeX DOM 但需要重新渲染新公式）
        const pendingMathTransitions = featureFlags.hasMath
            ? dom.getAllIn(this.container, '.math-block.math-transition[data-latex-new]')
            : [];

        return {
            pendingCodeBlocks,
            pendingMermaidBlocks,
            pendingMermaidTransitions,
            pendingMathTransitions,
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
    #updateDOM(newHTML, changes, featureFlags) {
        // 首次渲染，使用 innerHTML（性能更好）
        if (!this.#lastRenderedData.markdown) {
            this.container.innerHTML = newHTML;
            // 返回需要处理的元素
            return this.#collectElementsToProcess(featureFlags);
        }

        // 没有可复用的重型节点时，直接替换，避免额外的 HTML 解析和 DOM 全量扫描
        if (!changes.hasReusableBlocks) {
            this.container.innerHTML = newHTML;
            return this.#collectElementsToProcess(featureFlags);
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
        return this.#collectElementsToProcess(featureFlags);
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
        maps.codeByIndex = new Map();
        const codeBlocks = dom.getAllIn(
            this.container,
            'pre code[class*="language-"]:not(.language-mermaid)'
        );
        codeBlocks.forEach((el, index) => {
            const lang = this.#langFromFenceCodeElement(el);
            const compositeKey = this.#codeBlockCompositeKey(lang, el.textContent, index);
            const preElement = el.parentElement;
            const wrapper = preElement?.parentElement?.classList.contains('code-block-wrapper')
                ? preElement.parentElement
                : preElement;
            maps.code.set(compositeKey, wrapper);
            maps.codeByIndex.set(index, wrapper);
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

        // 收集数学公式（存储引用），同时建立按位置索引的映射（用于 block math 过渡渲染）
        maps.mathByIndex = new Map();
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
                maps.mathByIndex.set(index, el);
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
            const lang = this.#langFromFenceCodeElement(newEl);
            const compositeKey = this.#codeBlockCompositeKey(lang, newEl.textContent, index);
            const oldWrapper = oldElements.code.get(compositeKey);

            const newPre = newEl.parentElement;
            const newWrapper = newPre?.parentElement?.classList.contains('code-block-wrapper')
                ? newPre.parentElement
                : newPre;

            if (oldWrapper && !changes.changedCodeBlocks.has(compositeKey)) {
                // 未变化：直接平移旧 wrapper
                newWrapper.replaceWith(oldWrapper);
            } else {
                // 变化或新增：按位置查找旧 wrapper，复用以保留复制按钮
                const oldWrapperByIdx = oldElements.codeByIndex?.get(index);
                if (oldWrapperByIdx) {
                    const oldCode = oldWrapperByIdx.querySelector('code');
                    if (oldCode) {
                        oldCode.className = newEl.className;
                        oldCode.textContent = newEl.textContent;
                        oldCode.classList.remove('prism-highlighted', 'code-pending');
                        newWrapper.replaceWith(oldWrapperByIdx);
                    }
                }
                // 若无旧 wrapper，保留新 <pre> 留给后续同步高亮处理
            }
        });

        // 保留未变化的 Mermaid 图表（直接移动元素，避免深克隆 SVG 树）
        const { mermaidByIndex } = oldElements;

        newMermaidBlocks.forEach((newEl, index) => {
            const text = newEl.textContent.trim();
            const hash = this.#generateSimpleHash(text);
            const compositeKey = `${hash}_idx_${index}`;
            const oldDiv = oldElements.mermaid.get(compositeKey);

            if (
                oldDiv &&
                !changes.changedMermaidBlocks.has(compositeKey) &&
                oldDiv.classList.contains('mermaid-done')
            ) {
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
            } else if (
                changes.changedMathBlocks.has(compositeKey) &&
                newEl.classList.contains('math-block')
            ) {
                // 过渡替换：block math 变化时保留旧渲染内容作占位，消除内容消失的闪烁
                const oldElByIdx = oldElements.mathByIndex?.get(index);
                if (oldElByIdx && oldElByIdx.classList.contains('math-rendered')) {
                    oldElByIdx.setAttribute('data-latex-new', latex);
                    oldElByIdx.classList.add('math-transition');
                    newEl.replaceWith(oldElByIdx);
                }
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
            const lang = this.#langFromFenceCodeElement(block);
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
            if (pre.classList.contains('has-copy-btn') || !pre.parentNode) return;
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';
            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(pre);
            pre.classList.add('has-copy-btn');
            const btn = document.createElement('button');
            btn.className = 'md-btn code-copy-btn';
            btn.title = '复制代码';
            btn.innerHTML = '<i class="codicon codicon-copy"></i>';
            wrapper.appendChild(btn);
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
        const pending = nodes.filter(
            div =>
                div.isConnected &&
                !div.classList.contains('mermaid-done') &&
                !div.classList.contains('mermaid-rendering')
        );
        if (!pending.length) return;

        await this.initMermaid();
        const mermaid = await loadMermaidModule();

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

        await this.initMermaid();
        const mermaid = await loadMermaidModule();

        const offscreen = document.createElement('div');
        offscreen.style.cssText = 'position:absolute;left:-9999px;top:-9999px;visibility:hidden;';
        document.body.appendChild(offscreen);

        const targets = transitionDivs
            .map(placeholder => {
                const code = placeholder.getAttribute('data-mermaid-new');
                if (!code) return null;
                const temp = document.createElement('div');
                temp.className = 'mermaid';
                temp.textContent = code;
                offscreen.appendChild(temp);
                return { placeholder, temp, code };
            })
            .filter(Boolean);

        if (!targets.length) {
            offscreen.remove();
            return;
        }

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
                placeholder.classList.remove(
                    'mermaid-transition',
                    'mermaid-rendering',
                    'mermaid-done'
                );
                placeholder.textContent = '图表渲染失败: ' + err.message;
                placeholder.classList.add('render-error');
            });
        } finally {
            offscreen.remove();
        }
    }

    // ==================== 公式渲染组 ====================
    /**
     * 过渡渲染：block math 内容变化时，旧 KaTeX DOM 保持可见，原地重渲染后替换内容，消除闪烁
     * @param {Element[]} transitionElements - 带 data-latex-new 的 .math-block 元素
     * @private
     */
    #renderMathTransitions(transitionElements) {
        if (!transitionElements.length) return;

        transitionElements.forEach(placeholder => {
            if (!placeholder.isConnected || !this.container.contains(placeholder)) return;
            const newLatex = placeholder.getAttribute('data-latex-new');
            if (!newLatex) return;

            // 更新 data-latex 为新值，清理过渡标记
            placeholder.setAttribute('data-latex', newLatex);
            placeholder.removeAttribute('data-latex-new');
            placeholder.classList.remove('math-transition', 'math-rendered');

            // KaTeX 同步渲染，原地替换内容，无闪烁
            this.#renderSingleMath(placeholder);
        });
    }

    /**
     * 渲染数学公式（优化版：增量渲染 + 可见性优化）
     * @param {Array<Element>} mathElements - 数学公式元素数组（已过滤未渲染的）
     * @private
     */
    async #renderMath(mathElements) {
        if (mathElements.length === 0) return;

        const katex = await loadKatexModule();

        // 过滤出需要渲染的公式（排除无效元素）
        const elementsToRender = mathElements.filter(el => {
            const latex = el.getAttribute('data-latex');
            return latex !== null;
        });

        if (elementsToRender.length === 0) return;

        // 如果没有 IntersectionObserver，直接批量渲染
        if (!this.#intersectionObserver) {
            this.#renderMathBatch(elementsToRender, katex);
            return;
        }

        // 分离可见和不可见元素
        const { visible, invisible } = this.#partitionByVisibility(elementsToRender);

        // 可见公式也走 batch 路径，通过 requestIdleCallback 分帧渲染，避免大量公式卡顿首帧
        if (visible.length > 0) {
            this.#renderMathBatch(visible, katex);
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
    async #renderSingleMath(element) {
        const katex = await loadKatexModule();
        this.#renderSingleMathWithModule(element, katex);
    }

    /**
     * 批量渲染数学公式（降级方案）
     * @param {Array<Element>} elements - 数学公式元素数组
     * @private
     */
    #renderMathBatch(elements, katex) {
        const BATCH_SIZE = 50;
        let index = 0;

        const processBatch = () => {
            const end = Math.min(index + BATCH_SIZE, elements.length);

            while (index < end) {
                const el = elements[index];
                this.#renderSingleMathWithModule(el, katex);
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

    /**
     * 使用已加载的 KaTeX 实例渲染单个数学公式，避免批量场景重复动态导入。
     * @param {Element} element
     * @param {Object} katex
     * @private
     */
    #renderSingleMathWithModule(element, katex) {
        element.classList.add('math-rendered');

        const latex = element.getAttribute('data-latex');
        if (!latex) return;

        try {
            katex.render(latex, element, {
                displayMode: element.classList.contains('math-block'),
                throwOnError: false,
                errorColor: '#cc0000'
            });
            element.classList.remove('math-error', 'math-pending');
        } catch (err) {
            console.warn('KaTeX 渲染失败:', err);
            element.textContent = latex;
            element.classList.add('math-error');
        }
    }

    // ==================== Lightbox（图片/图表放大查看） ====================

    /** * 懒初始化 Lightbox DOM，缓存内部引用
     * @private
     */
    #getLightbox() {
        if (this.#lightbox) return this.#lightbox;

        const lb = document.createElement('div');
        lb.className = 'md-lightbox';
        lb.innerHTML = `
            <div class="md-lightbox-stage">
                <div class="md-lightbox-inner"></div>
            </div>
            <div class="md-lightbox-toolbar">
                <div class="md-lightbox-download">
                    <button class="md-lightbox-btn" data-lb-action="toggle-download-menu" title="下载">
                        <i class="codicon codicon-save"></i>
                    </button>
                    <div class="md-lightbox-download-menu" data-lb-download-menu hidden>
                        <button class="md-lightbox-menu-item" data-lb-download-format="svg" type="button">SVG</button>
                        <button class="md-lightbox-menu-item" data-lb-download-format="jpeg" type="button">JPEG</button>
                        <button class="md-lightbox-menu-item" data-lb-download-format="png" type="button">PNG</button>
                    </div>
                </div>
                <button class="md-lightbox-btn" data-lb-action="zoom-out" title="缩小"><i class="codicon codicon-zoom-out"></i></button>
                <span class="md-lightbox-scale-label" data-lb-scale>100%</span>
                <button class="md-lightbox-btn" data-lb-action="zoom-in" title="放大"><i class="codicon codicon-zoom-in"></i></button>
                <button class="md-lightbox-btn" data-lb-action="fullscreen" title="全屏"><i class="codicon codicon-screen-full"></i></button>
                <button class="md-lightbox-btn" data-lb-action="close" title="关闭 (Esc)"><i class="codicon codicon-close"></i></button>
            </div>
        `;

        // 缓存高频访问的 DOM 引用，避免每次事件触发时 querySelector
        this.#lbInner = lb.querySelector('.md-lightbox-inner');
        this.#lbStage = lb.querySelector('.md-lightbox-stage');
        this.#lbScaleLabel = lb.querySelector('[data-lb-scale]');
        this.#lbToolbar = lb.querySelector('.md-lightbox-toolbar');
        this.#lbDownloadMenu = lb.querySelector('[data-lb-download-menu]');

        // 拖拽平移
        this.#lbStage.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            e.preventDefault();
            this.#lbStage.setPointerCapture(e.pointerId);
            this.#lightboxDrag = {
                pointerId: e.pointerId,
                startX: e.clientX - this.#lightboxOx,
                startY: e.clientY - this.#lightboxOy,
                downX: e.clientX,
                downY: e.clientY,
                moved: false,
                downTarget: e.target
            };
            this.#lbStage.classList.add('is-dragging');
        });

        this.#lbStage.addEventListener('pointermove', e => {
            const drag = this.#lightboxDrag;
            if (!drag || drag.pointerId !== e.pointerId) return;
            if (!drag.moved) {
                if (Math.hypot(e.clientX - drag.downX, e.clientY - drag.downY) < 4) return;
                drag.moved = true;
            }
            this.#lightboxOx = e.clientX - drag.startX;
            this.#lightboxOy = e.clientY - drag.startY;
            this.#lbInner.style.transform = `translate(${this.#lightboxOx}px,${this.#lightboxOy}px)`;
        });

        const endDrag = e => {
            const drag = this.#lightboxDrag;
            if (!drag || drag.pointerId !== e.pointerId) return;
            this.#lightboxDrag = null;
            this.#lbStage.classList.remove('is-dragging');
            try {
                if (this.#lbStage.hasPointerCapture?.(e.pointerId)) {
                    this.#lbStage.releasePointerCapture(e.pointerId);
                }
            } catch (_err) {
                /* ignore */
            }
            if (!drag.moved && e.type === 'pointerup' && drag.downTarget === this.#lbStage) {
                this.#closeLightbox();
            }
        };
        this.#lbStage.addEventListener('pointerup', endDrag);
        this.#lbStage.addEventListener('pointercancel', endDrag);

        // 工具栏按钮
        this.#lbToolbar.addEventListener('click', e => {
            const format = e.target.closest('[data-lb-download-format]')?.dataset.lbDownloadFormat;
            if (format) {
                e.stopPropagation();
                this.#downloadLightboxAsset(format);
                return;
            }
            const action = e.target.closest('[data-lb-action]')?.dataset.lbAction;
            if (action === 'close') this.#closeLightbox();
            else if (action === 'zoom-in') this.#lightboxZoom(0.25);
            else if (action === 'zoom-out') this.#lightboxZoom(-0.25);
            else if (action === 'fullscreen') this.#toggleLightboxFullscreen();
            else if (action === 'toggle-download-menu') this.#toggleLightboxDownloadMenu();
        });

        lb.addEventListener('click', e => {
            if (!e.target.closest('.md-lightbox-download')) {
                this.#toggleLightboxDownloadMenu(false);
            }
        });

        // 滚轮缩放（以光标位置为中心，RAF 节流：一帧内多次事件只触发一次 DOM 更新）
        lb.addEventListener('wheel', e => {
            e.preventDefault();
            this.#pendingWheelDelta += e.deltaY < 0 ? 0.15 : -0.15;
            this.#pendingWheelX = e.clientX;
            this.#pendingWheelY = e.clientY;
            if (!this.#lightboxZoomRaf) {
                this.#lightboxZoomRaf = requestAnimationFrame(() => {
                    this.#lightboxZoomRaf = null;
                    const d = this.#pendingWheelDelta;
                    this.#pendingWheelDelta = 0;
                    this.#lightboxZoom(d, this.#pendingWheelX, this.#pendingWheelY);
                });
            }
        }, { passive: false });

        // ESC 关闭：绑定一次，按可见性判断，避免每次 open/close 增删监听
        document.addEventListener('keydown', e => {
            if (e.key === 'Escape' && lb.style.display !== 'none' && !document.fullscreenElement) {
                this.#closeLightbox();
            }
        });

        // 全屏图标同步
        lb.addEventListener('fullscreenchange', () => {
            const icon = lb.querySelector('[data-lb-action="fullscreen"] .codicon');
            if (icon) {
                icon.className = document.fullscreenElement === lb
                    ? 'codicon codicon-screen-normal'
                    : 'codicon codicon-screen-full';
            }
        });

        document.body.appendChild(lb);
        this.#lightbox = lb;
        return lb;
    }

    /**
     * 打开 Lightbox
     * @param {'img'|'mermaid'} type
     * @param {HTMLElement} el
     * @private
     */
    #openLightbox(type, el) {
        this.#getLightbox();
        this.#lbInner.innerHTML = '';
        this.#lbInner.style.transform = '';
        this.#lightboxScale = 1;
        this.#lightboxOx = 0;
        this.#lightboxOy = 0;
        this.#lightboxDrag = null;
        this.#lbContent = null;
        this.#lightboxAsset = null;
        this.#toggleLightboxDownloadMenu(false);

        if (type === 'img') {
            const img = new Image();
            img.src = el.src;
            img.alt = el.alt || '';
            this.#lbContent = img;
            this.#lightboxAsset = {
                kind: 'img',
                sourceUrl: el.currentSrc || el.src,
                nameBase: this.#deriveLightboxFileName(el.getAttribute('data-src') || el.currentSrc || el.src),
                svgSource: this.#isSvgImageSource(el.getAttribute('data-src') || el.currentSrc || el.src),
                rasterBlocked: false
            };
            this.#lbInner.appendChild(img);
            const setWidth = () => {
                this.#lightboxBaseWidth = Math.min(
                    img.naturalWidth || img.offsetWidth,
                    window.innerWidth * 0.9 - 32
                );
                img.style.width = `${this.#lightboxBaseWidth}px`;
                img.style.height = 'auto';
                this.#lbScaleLabel.textContent = '100%';
            };
            if (img.complete) setWidth();
            else img.onload = setWidth;
        } else {
            const svg = el.querySelector('svg');
            if (!svg) return;
            const wrap = document.createElement('div');
            wrap.className = 'md-lightbox-svg-wrap';
            const clone = svg.cloneNode(true);
            clone.removeAttribute('width');
            clone.removeAttribute('height');
            clone.style.cssText = '';
            const vb = svg.getAttribute('viewBox');
            let baseW = svg.getBoundingClientRect().width || 600;
            if (vb) {
                const parts = vb.trim().split(/[\s,]+/).map(Number);
                const [, , width] = parts;
                if (parts.length >= 4 && width > 0) baseW = width;
            }
            this.#lightboxBaseWidth = Math.min(baseW, window.innerWidth * 0.85 - 40);
            clone.style.width = `${this.#lightboxBaseWidth}px`;
            clone.style.height = 'auto';
            this.#lbContent = clone;
            this.#lightboxAsset = {
                kind: 'svg',
                svg: clone,
                nameBase: 'diagram',
                mermaidCode: el.getAttribute('data-mermaid') || ''
            };
            wrap.appendChild(clone);
            this.#lbInner.appendChild(wrap);
            this.#lbScaleLabel.textContent = '100%';
        }

        this.#syncLightboxDownloadMenu();
        this.#lightbox.style.display = 'block';
    }

    /**
     * 关闭 Lightbox
     * @private
     */
    #closeLightbox() {
        if (!this.#lightbox) return;
        if (this.#lightboxDrag && this.#lbStage) {
            const pid = this.#lightboxDrag.pointerId;
            try {
                if (this.#lbStage.hasPointerCapture?.(pid)) {
                    this.#lbStage.releasePointerCapture(pid);
                }
            } catch (_err) {
                /* ignore */
            }
            this.#lightboxDrag = null;
            this.#lbStage.classList.remove('is-dragging');
        }
        this.#lightbox.style.display = 'none';
        if (this.#lightboxZoomRaf) {
            cancelAnimationFrame(this.#lightboxZoomRaf);
            this.#lightboxZoomRaf = null;
            this.#pendingWheelDelta = 0;
        }
        this.#toggleLightboxDownloadMenu(false);
        this.#lightboxAsset = null;
        if (document.fullscreenElement === this.#lightbox) {
            document.exitFullscreen().catch(() => { });
        }
    }

    /**
     * 按增量缩放 Lightbox 内容
     * 修改 lbContent 的 width 使浏览器按新尺寸重新渲染图片，保证清晰度。
     * translate 平移写入 lbInner.style.transform，不加 scale。
     * @param {number} delta
     * @param {number} [cursorX] 光标屏幕 X 坐标（传入时以光标为缩放中心）
     * @param {number} [cursorY] 光标屏幕 Y 坐标
     * @private
     */
    #lightboxZoom(delta, cursorX, cursorY) {
        if (!this.#lightboxBaseWidth || !this.#lbContent) return;
        const oldScale = this.#lightboxScale;
        const newScale = Math.min(5, Math.max(0.2, oldScale + delta));
        if (newScale === oldScale) return;
        this.#lightboxScale = newScale;

        // 以光标为缩放中心：调整平移偏移，使光标下的像素保持原位。
        // stage 是 position:fixed; inset:0，与 viewport 等大，中心即 window 中心。
        if (cursorX !== undefined && cursorY !== undefined) {
            const px = cursorX - window.innerWidth / 2;
            const py = cursorY - window.innerHeight / 2;
            const r = newScale / oldScale;
            this.#lightboxOx = px - (px - this.#lightboxOx) * r;
            this.#lightboxOy = py - (py - this.#lightboxOy) * r;
            this.#lbInner.style.transform = `translate(${this.#lightboxOx}px,${this.#lightboxOy}px)`;
        }

        // 修改 width 而非使用 CSS scale，让浏览器按实际尺寸重新渲染，保证图片清晰度。
        this.#lbContent.style.width = `${this.#lightboxBaseWidth * newScale}px`;
        this.#lbContent.style.height = 'auto';
        this.#lbScaleLabel.textContent = `${Math.round(newScale * 100)}%`;
    }

    /**
     * 切换全屏
     * @private
     */
    #toggleLightboxFullscreen() {
        if (!this.#lightbox) return;
        if (!document.fullscreenElement) {
            this.#lightbox.requestFullscreen().catch(() => { });
        } else {
            document.exitFullscreen().catch(() => { });
        }
    }

    /**
     * 切换下载菜单显示状态
     * @param {boolean} [force]
     * @private
     */
    #toggleLightboxDownloadMenu(force) {
        if (!this.#lbDownloadMenu) return;
        const nextOpen = typeof force === 'boolean' ? force : this.#lbDownloadMenu.hidden;
        this.#lbDownloadMenu.hidden = !nextOpen;
    }

    /**
     * 同步下载菜单项的可用状态
     * @private
     */
    #syncLightboxDownloadMenu() {
        if (!this.#lbDownloadMenu) return;
        const canExportSvg = this.#canLightboxExportSvg();
        const canExportRaster = this.#canLightboxExportRaster();
        const svgButton = this.#lbDownloadMenu.querySelector('[data-lb-download-format="svg"]');
        const rasterButtons = this.#lbDownloadMenu.querySelectorAll(
            '[data-lb-download-format="jpeg"], [data-lb-download-format="png"]'
        );
        if (svgButton) {
            svgButton.disabled = !canExportSvg;
            svgButton.title = canExportSvg ? '下载 SVG' : '当前图片不支持导出为 SVG';
        }
        rasterButtons.forEach(button => {
            button.disabled = !canExportRaster;
            button.title = canExportRaster
                ? `下载 ${button.dataset.lbDownloadFormat?.toUpperCase()}`
                : '当前图片受跨域限制，暂不支持导出为 PNG/JPEG';
        });
    }

    /**
     * 下载当前放大的图片/图表
     * @param {'svg'|'jpeg'|'png'} format
     * @private
     */
    async #downloadLightboxAsset(format) {
        const asset = this.#lightboxAsset;
        if (!asset) return;
        if (format === 'svg' && !this.#canLightboxExportSvg(asset)) return;
        if ((format === 'jpeg' || format === 'png') && !this.#canLightboxExportRaster(asset)) return;

        try {
            let blob = null;
            if (format === 'svg') {
                blob = await this.#createSvgExportBlob(asset);
            } else {
                blob = await this.#createRasterExportBlob(asset, format);
            }
            if (!blob) return;
            this.#triggerBlobDownload(
                blob,
                `${asset.nameBase || 'image'}.${format === 'jpeg' ? 'jpg' : format}`
            );
            this.#toggleLightboxDownloadMenu(false);
        } catch (error) {
            if (
                (format === 'jpeg' || format === 'png') &&
                error?.message?.includes('跨域限制') &&
                this.#lightboxAsset === asset
            ) {
                asset.rasterBlocked = true;
                this.#syncLightboxDownloadMenu();
                return;
            }
            console.warn(`导出 ${format.toUpperCase()} 失败: ${error.message}`);
        }
    }

    /**
     * 生成 SVG 导出 Blob
     * @param {Object} asset
     * @returns {Promise<Blob>}
     * @private
     */
    async #createSvgExportBlob(asset) {
        const svgText = await this.#getSvgExportText(asset);
        return new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' });
    }

    /**
     * 生成 PNG/JPEG 导出 Blob
     * @param {Object} asset
     * @param {'jpeg'|'png'} format
     * @returns {Promise<Blob>}
     * @private
     */
    async #createRasterExportBlob(asset, format) {
        const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
        const { src, revoke, width, height } = await this.#getRasterExportSource(asset);
        try {
            const image = await this.#loadImageForExport(src);
            const canvas = this.#drawImageToCanvas(
                image,
                width || image.naturalWidth || this.#lbContent?.naturalWidth || this.#lbContent?.width,
                height || image.naturalHeight || this.#lbContent?.naturalHeight || this.#lbContent?.height,
                format
            );
            return new Promise((resolve, reject) => {
                try {
                    canvas.toBlob(blob => {
                        if (blob) resolve(blob);
                        else reject(new Error('Canvas 导出失败'));
                    }, mimeType, format === 'jpeg' ? 0.92 : undefined);
                } catch (error) {
                    reject(
                        error?.name === 'SecurityError'
                            ? new Error('当前图片受浏览器跨域限制，暂不支持导出为 PNG/JPEG')
                            : error
                    );
                }
            });
        } finally {
            if (revoke) revoke();
        }
    }

    /**
     * 获取 SVG 导出源码
     * @param {Object} asset
     * @returns {Promise<string>}
     * @private
     */
    async #getSvgExportText(asset) {
        if (asset.mermaidCode) {
            await this.initMermaid();
            const mermaid = await loadMermaidModule();
            const { svg } = await mermaid.render(
                `mermaid-export-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
                this.#buildMermaidRasterExportCode(asset.mermaidCode)
            );
            return svg;
        }
        if (asset.kind === 'svg' && asset.svg) {
            return this.#serializeSvg(asset.svg);
        }
        const blob = await this.#fetchExportBlob(asset.sourceUrl);
        if (blob.type === 'image/svg+xml') return blob.text();
        return this.#serializeSvg(this.#lbContent);
    }

    /**
     * 构造 Mermaid 导出专用代码
     * 通过 init directive 关闭 htmlLabels，避免切换全局配置
     * @param {string} code
     * @returns {string}
     * @private
     */
    #buildMermaidRasterExportCode(code) {
        const directive = "%%{init: {'htmlLabels': false, 'flowchart': {'htmlLabels': false}} }%%";
        return code.trimStart().startsWith('%%{init:')
            ? code
            : `${directive}\n${code}`;
    }

    /**
     * 解析位图导出的安全资源
     * @param {Object} asset
     * @returns {Promise<{src: string, revoke: (() => void)|null, width?: number, height?: number}>}
     * @private
     */
    async #getRasterExportSource(asset) {
        if (asset.kind === 'svg' && asset.svg) {
            const objectUrl = URL.createObjectURL(
                new Blob([await this.#getSvgExportText(asset)], { type: 'image/svg+xml;charset=utf-8' })
            );
            return {
                src: objectUrl,
                revoke: () => URL.revokeObjectURL(objectUrl),
                ...this.#getSvgExportSize(asset.svg)
            };
        }

        const src = asset.sourceUrl;
        if (!src) throw new Error('当前图片缺少可导出的资源地址');
        if (src.startsWith('blob:') || src.startsWith('data:')) {
            return { src, revoke: null };
        }
        const blob = await this.#fetchExportBlob(src);
        const objectUrl = URL.createObjectURL(blob);
        return {
            src: objectUrl,
            revoke: () => URL.revokeObjectURL(objectUrl)
        };
    }

    /**
     * 拉取导出用 Blob
     * @param {string} src
     * @returns {Promise<Blob>}
     * @private
     */
    async #fetchExportBlob(src) {
        let response;
        try {
            response = await fetch(src, {
                mode: 'cors',
                credentials: 'same-origin'
            });
        } catch {
            throw new Error('当前图片受浏览器跨域限制，暂不支持导出为 PNG/JPEG');
        }

        if (!response.ok) {
            throw new Error(`图片下载失败 (${response.status})`);
        }
        return response.blob();
    }

    /**
     * 判断当前 lightbox 资源是否支持 SVG 导出
     * @param {Object} [asset]
     * @returns {boolean}
     * @private
     */
    #canLightboxExportSvg(asset = this.#lightboxAsset) {
        if (!asset) return false;
        return asset.kind === 'svg' || Boolean(asset.svgSource);
    }

    /**
     * 判断当前 lightbox 资源是否支持 PNG/JPEG 导出
     * @param {Object} [asset]
     * @returns {boolean}
     * @private
     */
    #canLightboxExportRaster(asset = this.#lightboxAsset) {
        if (!asset) return false;
        return !asset.rasterBlocked;
    }

    /**
     * 触发 Blob 下载
     * @param {Blob} blob
     * @param {string} fileName
     * @private
     */
    #triggerBlobDownload(blob, fileName) {
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = fileName;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    /**
     * 判断图片源是否为 SVG
     * @param {string} src
     * @returns {boolean}
     * @private
     */
    #isSvgImageSource(src) {
        if (!src) return false;
        if (src.startsWith('data:image/svg+xml')) return true;
        return /\.svg(?:[?#].*)?$/i.test(src);
    }

    /**
     * 生成导出文件名
     * @param {string} src
     * @returns {string}
     * @private
     */
    #deriveLightboxFileName(src) {
        if (!src) return 'image';
        const [beforeHash] = src.split('#');
        const [cleaned] = beforeHash.split('?');
        const segment = cleaned.split('/').filter(Boolean).pop() || 'image';
        return (segment.replace(/\.[^.]+$/, '') || 'image').replace(/[\\/:*?"<>|]+/g, '-');
    }

    /**
     * 序列化 SVG 节点
     * @param {SVGElement} svg
     * @returns {string}
     * @private
     */
    #serializeSvg(svg) {
        const clone = svg.cloneNode(true);
        clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
        clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
        return new XMLSerializer().serializeToString(clone);
    }

    /**
     * 获取 SVG 导出尺寸
     * @param {SVGElement} svg
     * @returns {{width: number, height: number}}
     * @private
     */
    #getSvgExportSize(svg) {
        const viewBox = svg.getAttribute('viewBox');
        if (viewBox) {
            const parts = viewBox.trim().split(/[\s,]+/).map(Number);
            const [, , width, height] = parts;
            if (parts.length >= 4 && width > 0 && height > 0) {
                return { width, height };
            }
        }

        const width = Number.parseFloat(svg.getAttribute('width')) || svg.getBoundingClientRect().width || 1200;
        const height =
            Number.parseFloat(svg.getAttribute('height')) || svg.getBoundingClientRect().height || 800;
        return { width, height };
    }

    /**
     * 加载导出用图片
     * @param {string} src
     * @returns {Promise<HTMLImageElement>}
     * @private
     */
    #loadImageForExport(src) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.crossOrigin = 'anonymous';
            image.onload = () => resolve(image);
            image.onerror = () => reject(new Error('图片加载失败'));
            image.src = src;
        });
    }

    /**
     * 绘制图片到 Canvas
     * @param {CanvasImageSource} image
     * @param {number} width
     * @param {number} height
     * @param {'jpeg'|'png'} format
     * @returns {HTMLCanvasElement}
     * @private
     */
    #drawImageToCanvas(image, width, height, format) {
        const safeWidth = Math.max(1, Math.round(width || 1));
        const safeHeight = Math.max(1, Math.round(height || 1));
        const pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(safeWidth * pixelRatio);
        canvas.height = Math.round(safeHeight * pixelRatio);
        const ctx = canvas.getContext('2d');
        ctx.scale(pixelRatio, pixelRatio);
        if (format === 'jpeg') {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, safeWidth, safeHeight);
        }
        ctx.drawImage(image, 0, 0, safeWidth, safeHeight);
        return canvas;
    }

    // ==================== 工具函数 ====================

    /**
     * 生成简单哈希（用于差异检测）- 优化版：只取前256字符
     * @param {string} str - 要哈希的字符串
     * @returns {number} 哈希值
     * @private
     */
    /**
     * 从围栏代码块对应的 code 元素 class 解析语言标识，与 ```lang 围栏一致（无语言则为 ''）
     */
    #langFromFenceCodeElement(el) {
        const langClass = [...el.classList].find(c => c.startsWith('language-'));
        if (!langClass) return '';
        return langClass.slice('language-'.length);
    }

    /**
     * 代码块增量 DOM 用的复合键（须与 #detectChanges 中围栏扫描一致）
     */
    #codeBlockCompositeKey(lang, code, index) {
        const h = this.#generateSimpleHash(`${lang}\0${code}`);
        return `${h}_idx_${index}`;
    }

    /**
     * 轻量字符串哈希（全量扫描，避免仅取前 256 字导致长代码块尾部修改不触发更新）
     */
    #generateSimpleHash(str) {
        let hash = 0;
        const s = typeof str === 'string' ? str : String(str);
        for (let i = 0; i < s.length; i++) {
            hash = (hash << 5) - hash + s.charCodeAt(i);
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

        // 清理 Lightbox
        if (this.#lightbox) {
            this.#lightbox.remove();
            this.#lightbox = null;
        }

        super.destroy();
    }
}
