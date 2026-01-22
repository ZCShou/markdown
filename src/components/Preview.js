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
    }

    /**
     * 生成简单哈希（用于差异检测）
     * @private
     */
    #generateSimpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0; // 转换为32位整数
        }
        return hash.toString(36);
    }

    /**
     * 提取所有代码块内容
     * @private
     */
    #extractCodeBlocks(markdown) {
        const codeBlocks = new Map();
        const regex = /```(\w*)\n([\s\S]*?)```/g;
        let match;
        let index = 0;

        while ((match = regex.exec(markdown)) !== null) {
            const lang = match[1] || 'text';
            const code = match[2];
            const hash = this.#generateSimpleHash(lang + code);
            codeBlocks.set(hash, { lang, code, index });
            index++;
        }

        return codeBlocks;
    }

    /**
     * 提取所有 Mermaid 图表内容
     * @private
     */
    #extractMermaidBlocks(markdown) {
        const mermaidBlocks = new Map();
        const regex = /```mermaid\n([\s\S]*?)```/g;
        let match;
        let index = 0;

        while ((match = regex.exec(markdown)) !== null) {
            const code = match[1].trim();
            const hash = this.#generateSimpleHash(code);
            mermaidBlocks.set(hash, { code, index });
            index++;
        }

        return mermaidBlocks;
    }

    /**
     * 提取所有标题
     * @private
     */
    #extractHeadings(markdown) {
        const headings = [];
        const regex = /^(#{1,6})\s+(.+)$/gm;
        let match;

        while ((match = regex.exec(markdown)) !== null) {
            headings.push(match[2]); // 只存储标题文本
        }

        return headings;
    }

    /**
     * 提取所有数学公式内容
     * @private
     */
    #extractMathBlocks(markdown) {
        const mathBlocks = new Map();
        let index = 0;

        // 提取块级数学公式 $$...$$
        const blockRegex = /\$\$([\s\S]*?)\$\$/g;
        let match;

        while ((match = blockRegex.exec(markdown)) !== null) {
            const latex = match[1].trim();
            const hash = this.#generateSimpleHash(latex);
            mathBlocks.set(hash, { latex, displayMode: true, index });
            index++;
        }

        // 提取行内数学公式 $...$
        const inlineRegex = /\$([^\$\n]+?)\$/g;

        while ((match = inlineRegex.exec(markdown)) !== null) {
            const latex = match[1].trim();
            const hash = this.#generateSimpleHash(latex);
            mathBlocks.set(hash, { latex, displayMode: false, index });
            index++;
        }

        return mathBlocks;
    }

    /**
     * 检测内容变化
     * @private
     */
    #detectChanges(newMarkdown) {
        const oldData = this.#lastRenderedData;
        
        // 提取新内容的数据
        const newCodeBlocks = this.#extractCodeBlocks(newMarkdown);
        const newMermaidBlocks = this.#extractMermaidBlocks(newMarkdown);
        const newMathBlocks = this.#extractMathBlocks(newMarkdown);
        const newHeadings = this.#extractHeadings(newMarkdown);

        // 比较代码块变化
        const codeBlocksChanged = !this.#areMapsEqual(oldData.codeBlocks, newCodeBlocks);
        
        // 比较 Mermaid 图表变化
        const mermaidBlocksChanged = !this.#areMapsEqual(oldData.mermaidBlocks, newMermaidBlocks);
        
        // 比较数学公式变化
        const mathBlocksChanged = !this.#areMapsEqual(oldData.mathBlocks, newMathBlocks);
        
        // 比较标题变化
        const headingsChanged = !this.#areArraysEqual(oldData.headings, newHeadings);

        return {
            codeBlocksChanged,
            mermaidBlocksChanged,
            mathBlocksChanged,
            headingsChanged,
            newCodeBlocks,
            newMermaidBlocks,
            newMathBlocks,
            newHeadings
        };
    }

    /**
     * 比较两个 Map 是否相等
     * @private
     */
    #areMapsEqual(map1, map2) {
        if (map1.size !== map2.size) return false;
        
        for (const [key, value] of map1) {
            if (!map2.has(key)) return false;
            // 简单比较，只比较哈希键
        }
        
        return true;
    }

    /**
     * 比较两个数组是否相等
     * @private
     */
    #areArraysEqual(arr1, arr2) {
        if (arr1.length !== arr2.length) return false;
        
        for (let i = 0; i < arr1.length; i++) {
            if (arr1[i] !== arr2[i]) return false;
        }
        
        return true;
    }

    /**
     * 初始化组件
     */
    init() {
        super.init();
        this.initMermaid();
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

        // 根据当前主题初始化 Mermaid
        const currentTheme = this.state.get('theme') || 'light';
        const themeConfig = currentTheme === 'dark' ? 'dark' : 'default';

        mermaid.initialize({
            startOnLoad: false,
            theme: themeConfig,
            securityLevel: 'loose',
            logLevel: 'error'
        });

        this.mermaidInitialized = true;
    }

    /**
     * 更新 Mermaid 主题
     */
    updateMermaidTheme() {
        const theme = this.state.get('theme');
        
        // 使用明确的主题配置
        const themeConfig = theme === 'dark' ? 'dark' : 'default';
        
        // 重新初始化 Mermaid
        mermaid.initialize({
            startOnLoad: false,
            theme: themeConfig,
            securityLevel: 'loose',
            logLevel: 'error'  // 减少日志输出
        });
        
        // 重新渲染所有图表
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
        
        this._scheduleRender(doc.content || '', 0);
    }

    /**
     * 智能更新 DOM（保留未变化的渲染结果）
     * @private
     */
    #updateDOMSmart(newHTML, changes) {
        // 创建临时容器解析新 HTML
        const tempContainer = document.createElement('div');
        tempContainer.innerHTML = newHTML;
        
        // 如果是首次渲染或所有内容都变了，直接替换
        if (!this.#lastRenderedData.markdown) {
            this.container.innerHTML = newHTML;
            // 首次渲染时也要更新 headings，否则 TOC 组件无法生成目录
            const headings = this.container.querySelectorAll('h1, h2, h3, h4, h5, h6');
            this.state.setState({ headings: Array.from(headings) });
            return;
        }
        
        // 获取当前 DOM 中的所有代码块、Mermaid 图表和数学公式（合并查询）
        const oldCodeBlocks = new Map();
        const oldMermaidBlocks = new Map();
        const oldMathBlocks = new Map();
        
        // 一次性查询所有需要处理的元素
        const allCodeElements = this.container.querySelectorAll('pre code[class*="language-"]');
        const allMermaidDivs = this.container.querySelectorAll('div.mermaid');
        const allMathElements = this.container.querySelectorAll('.math-block, .math-inline');
        
        // 1. 收集已高亮的代码块
        for (let i = 0; i < allCodeElements.length; i++) {
            const el = allCodeElements[i];
            // 跳过 Mermaid 代码块
            if (el.classList.contains('language-mermaid')) {
                continue;
            }
            const hash = this.#generateSimpleHash(el.textContent);
            oldCodeBlocks.set(hash, el);
        }
        
        // 2. 收集已渲染的 Mermaid 图表
        for (let i = 0; i < allMermaidDivs.length; i++) {
            const el = allMermaidDivs[i];
            // 从 data-mermaid 属性获取原始文本
            let originalText = el.getAttribute('data-mermaid');
            
            // 如果没有 data-mermaid 属性，尝试从 DOM 中提取
            if (!originalText) {
                // Mermaid 渲染后，原始文本可能在第一个文本节点中
                const textNodes = [];
                for (let child of el.childNodes) {
                    if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
                        textNodes.push(child.textContent.trim());
                    }
                }
                originalText = textNodes.join('').trim();
            }
            
            if (originalText) {
                const hash = this.#generateSimpleHash(originalText);
                oldMermaidBlocks.set(hash, el);
            }
        }
        
        // 3. 收集已渲染的数学公式
        for (let i = 0; i < allMathElements.length; i++) {
            const el = allMathElements[i];
            const latex = el.getAttribute('data-latex');
            if (latex) {
                const hash = this.#generateSimpleHash(latex);
                oldMathBlocks.set(hash, el);
            }
        }
        
        // 4. 遍历新 HTML 中的代码块（跳过 Mermaid）
        tempContainer.querySelectorAll('pre code[class*="language-"]:not(.language-mermaid)').forEach((newEl) => {
            const hash = this.#generateSimpleHash(newEl.textContent);
            
            // 如果这个代码块没有变化，保留旧的 DOM（保留高亮效果）
            if (!changes.codeBlocksChanged || oldCodeBlocks.has(hash)) {
                const oldEl = oldCodeBlocks.get(hash);
                if (oldEl && oldEl.parentElement) {
                    // 用旧的 DOM 替换新的（保留 Prism 高亮类）
                    const oldPre = oldEl.parentElement.cloneNode(true);
                    const newPre = newEl.parentElement;
                    newPre.replaceWith(oldPre);
                }
            }
        });
        
        // 5. 处理 Mermaid 图表 - 标记未变化的 Mermaid
        const mermaidPreserveMap = new Map(); // hash -> { oldDiv, newPre }
        const newMermaidBlocks = tempContainer.querySelectorAll('pre code.language-mermaid');
        
        newMermaidBlocks.forEach((newEl) => {
            const text = newEl.textContent.trim();
            const hash = this.#generateSimpleHash(text);
            
            // 如果这个 Mermaid 图表没有变化，记录需要保留的旧 DOM
            // 注意：即使 mermaidBlocksChanged 为 true，单个图表也可能没变
            if (oldMermaidBlocks.has(hash)) {
                const oldEl = oldMermaidBlocks.get(hash);
                if (oldEl && oldEl.tagName === 'DIV') {
                    // 记录旧的 div 和新的 pre 元素（在 tempContainer 中）
                    const newPre = newEl.parentElement;
                    mermaidPreserveMap.set(hash, { oldDiv: oldEl, newPre: newPre });
                }
            }
        });
        
        // 6. 在 tempContainer 中直接替换需要保留的 Mermaid（在添加到容器之前）
        mermaidPreserveMap.forEach(({ oldDiv, newPre }) => {
            if (newPre && newPre.parentNode) {
                // 用旧的已渲染的 div.mermaid 替换新的 pre
                newPre.parentNode.replaceChild(oldDiv.cloneNode(true), newPre);
            }
        });
        
        // 7. 处理数学公式 - 保留未变化的数学公式
        const newMathBlocks = tempContainer.querySelectorAll('.math-block, .math-inline');
        
        newMathBlocks.forEach((newEl) => {
            const latex = newEl.getAttribute('data-latex');
            if (latex) {
                const hash = this.#generateSimpleHash(latex);
                
                // 如果这个数学公式没有变化，用旧的已渲染的公式替换
                if (oldMathBlocks.has(hash)) {
                    const oldEl = oldMathBlocks.get(hash);
                    if (oldEl) {
                        newEl.replaceWith(oldEl.cloneNode(true));
                    }
                }
            }
        });
        
        // 8. 使用 DocumentFragment 更新 DOM（避免 innerHTML 序列化问题）
        const fragment = document.createDocumentFragment();
        while (tempContainer.firstChild) {
            fragment.appendChild(tempContainer.firstChild);
        }
        
        // 9. 清空容器并添加新内容
        this.container.innerHTML = '';
        this.container.appendChild(fragment);

        // 10. 只在标题变化时更新 headings（性能优化）
        // 避免不必要的 state 更新和 TOC 重新生成
        if (changes.headingsChanged) {
            const headings = this.container.querySelectorAll('h1, h2, h3, h4, h5, h6');
            this.state.setState({ headings: Array.from(headings) });
        }
    }

    /**
     * 渲染内容（增量渲染优化版）
     */
    renderContent(markdown) {
        // 检测变化
        const changes = this.#detectChanges(markdown);
        
        // 如果 Markdown 完全没变，跳过渲染
        if (markdown === this.#lastRenderedData.markdown) {
            return;
        }

        // 渲染 Markdown 为 HTML
        const html = this.renderMarkdown(markdown);
        
        // 智能更新 DOM：保留未变化的代码块和 Mermaid 图表
        this.#updateDOMSmart(html, changes);

        // 合并所有 DOM 查询为一次，减少重排
        requestAnimationFrame(() => {
            // 一次性查询所有需要的元素（移除不必要的 headings 查询）
            const codeBlocks = this.container.querySelectorAll('pre code:not(.prism-highlighted)');
            const mermaidBlocks = this.container.querySelectorAll('pre code.language-mermaid');
            const preElements = this.container.querySelectorAll('pre:not(.has-copy-btn)');
            const images = this.container.querySelectorAll('img:not([data-error-handled])');

            // 增量处理：只处理变化的部分
            this.processAllElements(
                codeBlocks, 
                mermaidBlocks, 
                preElements, 
                images, 
                changes  // 传递变化信息
            );

            // 更新上次渲染的数据
            this.#lastRenderedData = {
                markdown: markdown,
                codeBlocks: changes.newCodeBlocks,
                mermaidBlocks: changes.newMermaidBlocks,
                mathBlocks: changes.newMathBlocks,
                headings: changes.newHeadings
            };
        });
    }

    /**
     * 批量处理所有 DOM 元素（增量渲染优化版）
     */
    processAllElements(codeBlocks, mermaidBlocks, preElements, images, changes = null) {
        // 如果没有变化信息，处理所有元素（兼容旧逻辑）
        if (!changes) {
            this.highlightCodeBlocks(codeBlocks);
            this.renderMermaidChartsBlocks(mermaidBlocks);
            this.addCopyButtonsToElements(preElements);
            this.markImagesHandled(images);
            return;
        }

        // 增量渲染：只处理变化的部分
        
        // 1. 代码高亮：只在代码块变化时处理
        if (changes.codeBlocksChanged) {
            this.highlightCodeBlocks(codeBlocks);
        }

        // 2. Mermaid 图表：只在图表变化时处理
        if (changes.mermaidBlocksChanged) {
            this.renderMermaidChartsBlocks(mermaidBlocks);
        }

        // 3. 数学公式：只在公式变化时处理
        if (changes.mathBlocksChanged) {
            this.renderMathBlocks();
        }

        // 4. 复制按钮：总是处理（因为 innerHTML 替换后按钮会丢失）
        this.addCopyButtonsToElements(preElements);

        // 5. 图片处理：总是处理（因为 innerHTML 替换后标记会丢失）
        this.markImagesHandled(images);
    }

    /**
     * 处理代码高亮（分离逻辑）
     */
    highlightCodeBlocks(codeBlocks) {
        if (typeof Prism === 'undefined' || codeBlocks.length === 0) return;

        const BATCH_SIZE = 10;
        let index = 0;

        const processBatch = () => {
            const batch = Array.from(codeBlocks).slice(index, index + BATCH_SIZE);
            
            for (let i = 0; i < batch.length; i++) {
                Prism.highlightElement(batch[i]);
                batch[i].classList.add('prism-highlighted');
            }

            index += BATCH_SIZE;

            if (index < codeBlocks.length) {
                if (typeof requestIdleCallback !== 'undefined') {
                    requestIdleCallback(processBatch, { timeout: 50 });
                } else {
                    setTimeout(processBatch, 0);
                }
            }
        };

        requestAnimationFrame(processBatch);
    }

    /**
     * 处理 Mermaid 图表（分离逻辑）
     */
    renderMermaidChartsBlocks(mermaidBlocks) {
        if (typeof mermaid === 'undefined' || mermaidBlocks.length === 0) return;

        // 检查预览容器是否可见（放在开头，避免执行不必要的代码）
        // 如果容器不可见（display: none），Mermaid 无法正确计算位置，会报错
        if (this.container.offsetParent === null) return;

        const isRendering = this.state.get('isRenderingMermaid');
        if (isRendering) return;

        this.state.setRenderingState(true);

        const containers = [];

        for (let i = 0; i < mermaidBlocks.length; i++) {
            const block = mermaidBlocks[i];
            const code = block.textContent.trim();
            if (!code) continue;

            const preElement = block.parentElement;
            const mermaidContainer = document.createElement('div');
            mermaidContainer.className = 'mermaid';
            mermaidContainer.textContent = code;
            // 保存原始文本，用于增量渲染时识别
            mermaidContainer.setAttribute('data-mermaid', code);

            if (preElement?.parentNode) {
                preElement.parentNode.replaceChild(mermaidContainer, preElement);
                containers.push(mermaidContainer);
            }
        }

        if (containers.length === 0) {
            this.state.setRenderingState(false);
            return;
        }

        const timeoutId = setTimeout(() => {
            console.warn('Mermaid 渲染超时');
            containers.forEach(c => {
                if (!c.classList.contains('mermaid-done')) {
                    c.textContent = '图表渲染超时';
                    c.classList.add('render-error');
                }
            });
            this.state.setRenderingState(false);
        }, 5000);

        mermaid.run({ nodes: containers })
            .then(() => {
                clearTimeout(timeoutId);
                containers.forEach(c => c.classList.add('mermaid-done'));
                this.state.setRenderingState(false);
            })
            .catch((err) => {
                clearTimeout(timeoutId);
                console.warn('Mermaid 渲染失败:', err);
                containers.forEach(c => {
                    c.textContent = '图表渲染失败: ' + err.message;
                    c.classList.add('render-error');
                });
                this.state.setRenderingState(false);
            });
    }

    /**
     * 重新渲染所有 Mermaid 图表（用于主题切换）
     */
    renderMermaidCharts() {
        if (typeof mermaid === 'undefined') return;

        // 检查预览容器是否可见（放在开头，避免执行不必要的代码）
        if (this.container.offsetParent === null) return;

        // 查找所有已渲染的 Mermaid 图表
        const mermaidDivs = this.container.querySelectorAll('div.mermaid');
        
        if (mermaidDivs.length === 0) return;

        // 直接替换为新的 Mermaid 容器
        const containers = [];
        mermaidDivs.forEach(oldDiv => {
            const code = oldDiv.getAttribute('data-mermaid');
            if (!code) return;

            // 创建新元素并直接替换旧元素
            const newDiv = document.createElement('div');
            newDiv.className = 'mermaid';
            newDiv.textContent = code;
            newDiv.setAttribute('data-mermaid', code);
            
            oldDiv.replaceWith(newDiv);
            containers.push(newDiv);
        });

        if (containers.length === 0) return;

        // 使用新的主题配置重新渲染
        mermaid.run({ nodes: containers })
            .then(() => {
                containers.forEach(c => c.classList.add('mermaid-done'));
            })
            .catch((err) => {
                console.warn('Mermaid 重新渲染失败:', err);
                containers.forEach(c => {
                    c.textContent = '图表渲染失败: ' + err.message;
                    c.classList.add('render-error');
                });
            });
    }

    /**
     * 处理数学公式渲染（分离逻辑）
     */
    renderMathBlocks() {
        if (typeof katex === 'undefined') return;

        // 渲染块级数学公式 $$...$$
        const blockMathElements = this.container.querySelectorAll('.math-block');
        blockMathElements.forEach(el => {
            const latex = el.getAttribute('data-latex');
            if (!latex || el.classList.contains('math-rendered')) return;

            try {
                katex.render(latex, el, {
                    displayMode: true,
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

        // 渲染行内数学公式 $...$
        const inlineMathElements = this.container.querySelectorAll('.math-inline');
        inlineMathElements.forEach(el => {
            const latex = el.getAttribute('data-latex');
            if (!latex || el.classList.contains('math-rendered')) return;

            try {
                katex.render(latex, el, {
                    displayMode: false,
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
     * 添加复制按钮（分离逻辑）
     */
    addCopyButtonsToElements(preElements) {
        if (preElements.length === 0) return;

        for (let i = 0; i < preElements.length; i++) {
            const pre = preElements[i];
            
            // 安全检查：确保元素仍在 DOM 中
            if (!pre.parentNode) {
                continue;
            }
            
            // 检查是否已经有包装器，避免重复处理
            if (pre.parentElement && pre.parentElement.classList.contains('code-block-wrapper')) {
                continue;
            }
            
            // 创建包装器，将复制按钮放在 pre 外部
            const wrapper = document.createElement('div');
            wrapper.className = 'code-block-wrapper';
            
            // 将 pre 插入到包装器中
            pre.parentNode.insertBefore(wrapper, pre);
            wrapper.appendChild(pre);
            
            // 添加复制按钮到包装器
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

                navigator.clipboard.writeText(code.textContent).then(() => {
                    btn.innerHTML = '✓';
                    btn.classList.add('copied');
                    setTimeout(() => {
                        btn.innerHTML = '📋';
                        btn.classList.remove('copied');
                    }, 2000);
                }).catch((err) => {
                    console.error('复制失败:', err);
                });
            });
        }
    }

    /**
     * 标记图片已处理（分离逻辑）
     */
    markImagesHandled(images) {
        images.forEach(img => img.dataset.errorHandled = 'true');
    }

    /**
     * 渲染 Markdown 为 HTML
     */
    renderMarkdown(markdown) {
        try {
            // 预处理数学公式：先提取并替换为占位符
            const mathBlocks = [];
            let processedMarkdown = markdown;

            // 替换块级数学公式 $$...$$
            processedMarkdown = processedMarkdown.replace(/\$\$([\s\S]*?)\$\$/g, (match, latex) => {
                const index = mathBlocks.length;
                mathBlocks.push({ latex, displayMode: true });
                return `<x-math-block data-index="${index}"></x-math-block>`;
            });

            // 替换行内数学公式 $...$
            processedMarkdown = processedMarkdown.replace(/\$([^\$\n]+?)\$/g, (match, latex) => {
                const index = mathBlocks.length;
                mathBlocks.push({ latex, displayMode: false });
                return `<x-math-inline data-index="${index}"></x-math-inline>`;
            });

            // 使用 marked 解析 Markdown
            let html;
            if (marked?.parse) {
                // 配置 marked renderer，为标题生成 id
                const renderer = new marked.Renderer();
                const headingIds = new Map();
                let headingIndex = 0;

                // 重写 heading 方法，为每个标题生成唯一 id
                renderer.heading = function(text, level, raw) {
                    // 生成唯一的 id
                    const id = 'heading-' + headingIndex++;
                    
                    // 返回带 id 的标题 HTML
                    return `<h${level} id="${id}">${text}</h${level}>`;
                };

                html = marked.parse(processedMarkdown, { 
                    renderer,
                    breaks: false, 
                    gfm: true 
                });
            } else {
                html = this.escapeHtml(processedMarkdown);
            }

            // 将占位符替换为数学公式的 HTML 标签
            html = html.replace(/<x-math-block data-index="(\d+)"><\/x-math-block>/g, (match, index) => {
                const block = mathBlocks[parseInt(index)];
                return `<div class="math-block" data-latex="${block.latex}"></div>`;
            });

            html = html.replace(/<x-math-inline data-index="(\d+)"><\/x-math-inline>/g, (match, index) => {
                const block = mathBlocks[parseInt(index)];
                return `<span class="math-inline" data-latex="${block.latex}"></span>`;
            });

            // 净化 HTML（防止 XSS）
            if (DOMPurify?.sanitize) {
                html = DOMPurify.sanitize(html, {
                    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote',
                                   'ul', 'ol', 'li', 'a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
                                   'table', 'thead', 'tbody', 'tr', 'th', 'td', 'hr', 'img',
                                   'input', 'span', 'div', 'dd', 'dt', 'dl', 's'],
                    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'id', 'type', 'checked',
                                   'width', 'height', 'loading', 'colspan', 'rowspan', 'start', 'align', 'style'],
                    ALLOW_DATA_ATTR: true,
                    ADD_ATTR: ['data-*']
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
     */
    handleImageError(img) {
        img.alt = `图片加载失败: ${img.src}`;
        img.style.cssText = 'border: 2px dashed #f44336; padding: 10px;';
    }

    /**
     * 导出为 HTML（直接使用渲染好的内容）
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
     */
    exportMarkdown() {
        const content = this.state.get('content');
        this.downloadFile(content, 'text/markdown', '.md');
        this.showMessage('Markdown 导出成功', 'success');
    }

    /**
     * 下载文件
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
        super.destroy();
    }
}
