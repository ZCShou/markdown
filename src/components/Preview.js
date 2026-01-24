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

    /**
     * 构造函数
     */
    constructor(state, containerId) {
        super(state, containerId);
        this.mermaidInitialized = false;
        this.renderTimeout = null;
        
        // 增量渲染：存储上次渲染的数据
        this.#lastRenderedData = {
            markdown: '',
            codeBlocks: new Map(),      // hash -> code content
            mermaidBlocks: new Map(),   // hash -> mermaid content
            mathBlocks: new Map(),      // hash -> math content
            headings: []                // heading texts
        };
        
        // IntersectionObserver 用于可见性检测
        this.#intersectionObserver = null;
        this.#pendingCodeBlocks = new Set();
        this.#pendingMermaidBlocks = new Set();
    }

    /**
     * 生成简单哈希（用于差异检测）- 优化版：只取前256字符
     * @private
     */
    #generateSimpleHash(str) {
        let hash = 0;
        const len = Math.min(str.length, 256);
        for (let i = 0; i < len; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString(36);
    }
    
    /**
     * 检查元素是否可见
     * @private
     */
    #isElementVisible(element) {
        const rect = element.getBoundingClientRect();
        return rect.top < window.innerHeight + 200 && rect.bottom > -200;
    }

    /**
     * 单次扫描提取所有块（优化版：避免多次遍历）
     * @private
     */
    #extractAllBlocks(markdown) {
        const result = {
            codeBlocks: new Map(),
            mermaidBlocks: new Map(),
            mathBlocks: new Map(),
            headings: []
        };
        
        let codeIndex = 0;
        let mermaidIndex = 0;
        let mathIndex = 0;
        
        // 提取代码块（包括 Mermaid）
        const codeRegex = /```(\w*)\n([\s\S]*?)```/g;
        let match;
        while ((match = codeRegex.exec(markdown)) !== null) {
            const [_, lang = 'text', code] = match;
            const hash = this.#generateSimpleHash(lang + code);
            
            if (lang === 'mermaid') {
                const trimmedCode = code.trim();
                const mermaidHash = this.#generateSimpleHash(trimmedCode);
                result.mermaidBlocks.set(mermaidHash, { code: trimmedCode, index: mermaidIndex });
                mermaidIndex++;
            } else {
                result.codeBlocks.set(hash, { lang, code, index: codeIndex });
                codeIndex++;
            }
        }
        
        // 提取数学公式（块级）
        const blockMathRegex = /\$\$([\s\S]*?)\$\$/g;
        while ((match = blockMathRegex.exec(markdown)) !== null) {
            const latex = match[1].trim();
            const hash = this.#generateSimpleHash(latex);
            result.mathBlocks.set(hash, { latex, displayMode: true, index: mathIndex });
            mathIndex++;
        }
        
        // 提取数学公式（行内）
        const inlineMathRegex = /\$([^\$\n]+?)\$/g;
        while ((match = inlineMathRegex.exec(markdown)) !== null) {
            const latex = match[1].trim();
            const hash = this.#generateSimpleHash(latex);
            result.mathBlocks.set(hash, { latex, displayMode: false, index: mathIndex });
            mathIndex++;
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
                result.headings.push(headingMatch[2]);
            }
        }
        
        return result;
    }

    /**
     * 同步更新标题数据（在 DOM 渲染前）- 优化版：复用提取结果
     * @private
     */
    #updateHeadingsSync(headings) {
        const headingsData = headings.map((text, index) => {
            const level = text.match(/^(#{1,6})/) ? text.match(/^(#{1,6})/)[1].length : 2;
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
     * 检测内容变化（优化版：单次扫描）
     * @private
     */
    #detectChanges(newMarkdown) {
        const oldData = this.#lastRenderedData;
        
        // 单次扫描提取所有数据
        const extracted = this.#extractAllBlocks(newMarkdown);

        // 比较变化
        return {
            codeBlocksChanged: !this.#areMapsEqual(oldData.codeBlocks, extracted.codeBlocks),
            mermaidBlocksChanged: !this.#areMapsEqual(oldData.mermaidBlocks, extracted.mermaidBlocks),
            mathBlocksChanged: !this.#areMapsEqual(oldData.mathBlocks, extracted.mathBlocks),
            headingsChanged: !this.#areArraysEqual(oldData.headings, extracted.headings),
            newCodeBlocks: extracted.codeBlocks,
            newMermaidBlocks: extracted.mermaidBlocks,
            newMathBlocks: extracted.mathBlocks,
            newHeadings: extracted.headings
        };
    }

    /**
     * 比较两个 Map 是否相等
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
     * @private
     */
    #areArraysEqual(arr1, arr2) {
        if (arr1.length !== arr2.length) return false;
        return arr1.every((val, i) => val === arr2[i]);
    }

    /**
     * 初始化组件
     */
    init() {
        super.init();
        this.initMermaid();
        this.#initIntersectionObserver();
    }

    /**
     * 初始化可见性观察器
     * @private
     */
    #initIntersectionObserver() {
        if (!('IntersectionObserver' in window)) return;
        
        this.#intersectionObserver = new IntersectionObserver(
            (entries) => {
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
                    }
                });
            },
            {
                root: null,
                rootMargin: '200px', // 提前 200px 开始渲染
                threshold: 0.01
            }
        );
    }

    /**
     * 订阅状态变化
     */
    subscribe() {
        // 订阅内容、当前文档和主题变化
        this.unsubscribe = this.state.subscribeTo(['content', 'currentDocId', 'theme'], (newValue, oldValue, key) => {
            if (key === 'content') {
                this.updatePreview();
            } else if (key === 'currentDocId') {
                this.forceUpdatePreview();
            } else if (key === 'theme') {
                this.updateMermaidTheme();
            }
        });
    }

    /**
     * 绑定事件
     */
    bindEvents() {
        // 图片加载错误处理
        this.addEventListener(this.container, 'error', (e) => {
            if (e.target.tagName === 'IMG') {
                this.handleImageError(e.target);
            }
        }, true);
    }

    /**
     * 渲染组件
     * @returns {void}
     */
    render() {
        // 初始渲染预览内容
        const content = this.state.get('content') || '';
        if (content) {
            this._scheduleRender(content, 0);
        }
    }

    /**
     * 初始化 Mermaid
     */
    initMermaid() {
        if (this.mermaidInitialized) return;
        this.#configureMermaid(this.state.get('theme'));
        this.mermaidInitialized = true;
    }
    
    /**
     * 配置 Mermaid 主题
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
     * 更新 Mermaid 主题
     */
    updateMermaidTheme() {
        this.#configureMermaid(this.state.get('theme'));
        this.renderMermaidCharts();
    }

    /**
     * 更新预览
     */
    updatePreview() {
        const content = this.state.get('content');
        const lastRendered = this.state.get('lastRenderedContent');

        // 避免重复渲染（但允许初始渲染）
        if (content === lastRendered && lastRendered !== '') return;

        this._scheduleRender(content, 100);
    }

    /**
     * 调度渲染（内部方法）
     */
    _scheduleRender(content, delay = 100) {
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
     * 智能更新 DOM（优化版：使用 replaceChildren 减少重排）
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
        const allChanged = changes.codeBlocksChanged && 
                          changes.mermaidBlocksChanged && 
                          changes.mathBlocksChanged;
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
     * @private
     */
    #buildElementHashMaps() {
        const maps = {
            code: new Map(),
            mermaid: new Map(),
            math: new Map()
        };

        // 收集代码块（存储引用）
        this.container.querySelectorAll('pre code[class*="language-"]:not(.language-mermaid)').forEach(el => {
            const hash = this.#generateSimpleHash(el.textContent);
            maps.code.set(hash, el.parentElement);
        });

        // 收集 Mermaid 图表（存储引用）
        this.container.querySelectorAll('div.mermaid[data-mermaid]').forEach(el => {
            const text = el.getAttribute('data-mermaid');
            if (text) {
                const hash = this.#generateSimpleHash(text);
                maps.mermaid.set(hash, el);
            }
        });

        // 收集数学公式（存储引用）
        this.container.querySelectorAll('.math-block[data-latex], .math-inline[data-latex]').forEach(el => {
            const latex = el.getAttribute('data-latex');
            if (latex) {
                const hash = this.#generateSimpleHash(latex);
                maps.math.set(hash, el);
            }
        });

        return maps;
    }

    /**
     * 保留未变化的元素（优化版：只保留哈希匹配的元素）
     * @private
     */
    #preserveUnchangedElements(tempDiv, oldElements, changes) {
        // 保留未变化的代码块（只有当整体未变时）
        if (!changes.codeBlocksChanged) {
            tempDiv.querySelectorAll('pre code[class*="language-"]:not(.language-mermaid)').forEach(newEl => {
                const hash = this.#generateSimpleHash(newEl.textContent);
                const oldPre = oldElements.code.get(hash);
                if (oldPre) {
                    newEl.parentElement.replaceWith(oldPre.cloneNode(true));
                }
            });
        } else {
            // 即使有变化，也保留哈希相同的元素
            tempDiv.querySelectorAll('pre code[class*="language-"]:not(.language-mermaid)').forEach(newEl => {
                const hash = this.#generateSimpleHash(newEl.textContent);
                if (changes.newCodeBlocks.has(hash) && oldElements.code.has(hash)) {
                    const oldPre = oldElements.code.get(hash);
                    newEl.parentElement.replaceWith(oldPre.cloneNode(true));
                }
            });
        }

        // 保留未变化的 Mermaid 图表
        if (!changes.mermaidBlocksChanged) {
            tempDiv.querySelectorAll('pre code.language-mermaid').forEach(newEl => {
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
            tempDiv.querySelectorAll('pre code.language-mermaid').forEach(newEl => {
                const text = newEl.textContent.trim();
                const hash = this.#generateSimpleHash(text);
                const oldDiv = oldElements.mermaid.get(hash);
                if (changes.newMermaidBlocks.has(hash) && oldDiv && oldDiv.classList.contains('mermaid-done')) {
                    newEl.parentElement.replaceWith(oldDiv.cloneNode(true));
                }
            });
        }

        // 保留未变化的数学公式
        if (!changes.mathBlocksChanged) {
            tempDiv.querySelectorAll('.math-block[data-latex], .math-inline[data-latex]').forEach(newEl => {
                const latex = newEl.getAttribute('data-latex');
                if (latex) {
                    const hash = this.#generateSimpleHash(latex);
                    const oldEl = oldElements.math.get(hash);
                    if (oldEl) {
                        newEl.replaceWith(oldEl.cloneNode(true));
                    }
                }
            });
        } else {
            // 即使有变化，也保留哈希相同的元素
            tempDiv.querySelectorAll('.math-block[data-latex], .math-inline[data-latex]').forEach(newEl => {
                const latex = newEl.getAttribute('data-latex');
                if (latex) {
                    const hash = this.#generateSimpleHash(latex);
                    if (changes.newMathBlocks.has(hash) && oldElements.math.has(hash)) {
                        const oldEl = oldElements.math.get(hash);
                        newEl.replaceWith(oldEl.cloneNode(true));
                    }
                }
            });
        }
    }

    /**
     * 更新标题 ID（优化版：批量设置减少重排）
     * @private
     */
    #updateHeadingIds() {
        const headings = this.container.querySelectorAll('h1, h2, h3, h4, h5, h6');
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
     * 渲染内容（优化版：简化流程）
     */
    renderContent(markdown) {
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
            // 合并查询减少 DOM 遍历
            const allElements = this.container.querySelectorAll(
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
     * 批量处理所有 DOM 元素（优化版：简化逻辑）
     */
    processAllElements(codeBlocks, mermaidBlocks, preElements, images, changes = null) {
        // 没有变化信息，处理所有元素
        if (!changes) {
            this.#highlightCode(codeBlocks);
            this.#renderMermaid(mermaidBlocks);
            this.#renderMath();
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
        if (changes.mathBlocksChanged) {
            this.#renderMath();
        }

        // 总是处理（因为 innerHTML 替换后会丢失）
        this.#addCopyButtons(preElements);
        this.#markImages(images);
    }

    /**
     * 代码高亮（优化版：优先渲染可见元素）
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
    }
    
    /**
     * 按可见性分类元素
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
     * 渲染 Mermaid 图表（优化版：优先渲染可见图表）
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
    }
    
    /**
     * 创建 Mermaid div
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
     * @private
     */
    #renderSingleMermaid(mermaidDiv) {
        mermaidDiv.classList.remove('mermaid-pending');
        this.#renderMermaidDivs([mermaidDiv]);
    }
    
    /**
     * 渲染 Mermaid div 列表
     * @private
     */
    #renderMermaidDivs(containers) {
        if (containers.length === 0) return;
        
        const timeoutId = this.#setupMermaidTimeout(containers);
        this.#mermaidTimeoutIds.push(timeoutId);

        mermaid.run({ nodes: containers })
            .then(() => this.#handleMermaidSuccess(containers, timeoutId))
            .catch(err => this.#handleMermaidError(containers, timeoutId, err));
    }
    
    /**
     * 设置 Mermaid 超时
     * @private
     */
    #setupMermaidTimeout(containers) {
        return setTimeout(() => {
            containers.forEach(c => {
                if (!c.classList.contains('mermaid-done')) {
                    c.textContent = '图表渲染超时';
                    c.classList.add('render-error');
                }
            });
            this.#clearMermaidTimeout(timeoutId);
        }, 5000);
    }
    
    /**
     * 处理 Mermaid 成功
     * @private
     */
    #handleMermaidSuccess(containers, timeoutId) {
        clearTimeout(timeoutId);
        containers.forEach(c => c.classList.add('mermaid-done'));
        this.#clearMermaidTimeout(timeoutId);
    }
    
    /**
     * 处理 Mermaid 错误
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
     * @private
     */
    #renderMermaidBatch(blocks) {
        if (this.state.get('isRenderingMermaid')) return;
        
        this.state.setRenderingState(true);
        
        const containers = blocks.map(block => this.#createMermaidDiv(block)).filter(Boolean);

        if (containers.length === 0) {
            this.state.setRenderingState(false);
            return;
        }

        const timeoutId = this.#setupMermaidTimeout(containers);
        this.#mermaidTimeoutIds.push(timeoutId);

        mermaid.run({ nodes: containers })
            .then(() => {
                this.#handleMermaidSuccess(containers, timeoutId);
                this.state.setRenderingState(false);
            })
            .catch(err => {
                this.#handleMermaidError(containers, timeoutId, err);
                this.state.setRenderingState(false);
            });
    }

    /**
     * 清理 Mermaid 超时定时器
     * @private
     */
    #clearMermaidTimeout(timeoutId) {
        const index = this.#mermaidTimeoutIds.indexOf(timeoutId);
        if (index > -1) {
            this.#mermaidTimeoutIds.splice(index, 1);
        }
    }

    /**
     * 重新渲染所有 Mermaid 图表（用于主题切换）
     */
    renderMermaidCharts() {
        if (typeof mermaid === 'undefined') return;
        if (this.container.offsetParent === null) return;

        const mermaidDivs = this.container.querySelectorAll('div.mermaid[data-mermaid]');
        if (mermaidDivs.length === 0) return;

        // 创建新的容器并替换旧的
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

        if (containers.length === 0) return;

        // 重新渲染
        mermaid.run({ nodes: containers })
            .then(() => {
                containers.forEach(c => c.classList.add('mermaid-done'));
            })
            .catch(err => {
                console.warn('Mermaid 重新渲染失败:', err);
                containers.forEach(c => {
                    c.textContent = '图表渲染失败: ' + err.message;
                    c.classList.add('render-error');
                });
            });
    }

    /**
     * 渲染数学公式（优化版：简化逻辑）
     * @private
     */
    #renderMath() {
        if (typeof katex === 'undefined') return;

        this.container.querySelectorAll('.math-block:not(.math-rendered), .math-inline:not(.math-rendered)').forEach(el => {
            const latex = el.getAttribute('data-latex');
            if (!latex) return;

            try {
                katex.render(latex, el, {
                    displayMode: el.classList.contains('math-block'),
                    throwOnError: false,
                    errorColor: '#cc0000'
                });
                el.classList.add('math-rendered');
            } catch (err) {
                console.warn('KaTeX 渲染失败:', err);
                el.textContent = latex;
                el.classList.add('math-error');
            }
        });
    }

    /**
     * 添加复制按钮（优化版：简化逻辑）
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

            this.addEventListener(btn, 'click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                const code = pre.querySelector('code');
                if (!code || btn.classList.contains('copied')) return;

                navigator.clipboard.writeText(code.textContent)
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

    /**
     * 标记图片已处理
     * @private
     */
    #markImages(images) {
        images.forEach(img => img.dataset.errorHandled = 'true');
    }

    /**
     * 渲染 Markdown 为 HTML
     */
    /**
     * 渲染 Markdown 为 HTML（优化版：简化逻辑）
     */
    renderMarkdown(markdown) {
        try {
            // 预处理数学公式
            const mathBlocks = [];
            let processedMarkdown = markdown
                // 替换块级公式
                .replace(/\$\$([\s\S]*?)\$\$/g, (match, latex) => {
                    const index = mathBlocks.length;
                    mathBlocks.push({ latex, displayMode: true });
                    return `<x-math-block data-index="${index}"></x-math-block>`;
                })
                // 替换行内公式
                .replace(/\$([^\$\n]+?)\$/g, (match, latex) => {
                    const index = mathBlocks.length;
                    mathBlocks.push({ latex, displayMode: false });
                    return `<x-math-inline data-index="${index}"></x-math-inline>`;
                });

            // 使用 marked 解析
            let html;
            if (marked?.parse) {
                const renderer = new marked.Renderer();
                let headingIndex = 0;

                renderer.heading = (text, level) => {
                    return `<h${level} id="heading-${headingIndex++}">${text}</h${level}>`;
                };

                html = marked.parse(processedMarkdown, { renderer, breaks: false, gfm: true });
            } else {
                html = this.escapeHtml(processedMarkdown);
            }

            // 替换数学公式占位符
            html = html
                .replace(/<x-math-block data-index="(\d+)"><\/x-math-block>/g, (_, index) => {
                    return `<div class="math-block" data-latex="${mathBlocks[index].latex}"></div>`;
                })
                .replace(/<x-math-inline data-index="(\d+)"><\/x-math-inline>/g, (_, index) => {
                    return `<span class="math-inline" data-latex="${mathBlocks[index].latex}"></span>`;
                });

            // 净化 HTML
            if (DOMPurify?.sanitize) {
                html = DOMPurify.sanitize(html, {
                    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote',
                                   'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                                   'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'img',
                                   'input', 'span', 'div', 'dd', 'dt', 'dl', 's'],
                    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'type', 'checked',
                                   'width', 'height', 'loading', 'colspan', 'rowspan', 'start', 'align', 'style'],
                    ALLOW_DATA_ATTR: true
                });
            }

            return html;
        } catch (e) {
            console.warn('Markdown 渲染失败:', e);
            return this.escapeHtml(markdown);
        }
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
        window.print().then(() => {
            // 打印完成后移除打印类
            document.body.classList.remove('printing-pdf');
        }).catch((error) => {
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
        
        // 清理 IntersectionObserver
        if (this.#intersectionObserver) {
            this.#intersectionObserver.disconnect();
            this.#intersectionObserver = null;
        }
        
        // 清理待处理集合
        this.#pendingCodeBlocks.clear();
        this.#pendingMermaidBlocks.clear();
        
        super.destroy();
    }
}
