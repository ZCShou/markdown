/**
 * 搜索替换组件
 * 类似 VSCode 的搜索替换界面
 * 支持搜索和替换模式切换
 */
import { BaseComponent } from './BaseComponent.js';
import { dom } from '../utils/dom.js';

export class SearchReplace extends BaseComponent {
    constructor(state, containerId) {
        super(state, containerId);
        this.isReplaceMode = false;
        this.currentMatchIndex = -1;
        this.matches = [];
        this.searchTerm = '';
        this.replaceTerm = '';
        this.caseSensitive = false;
        this.regexMode = false;
        this.wholeWord = false;

        // 缓存最后一次搜索的配置，用于判断是否需要重新搜索
        this.lastSearchConfig = null;
        // 防抖定时器
        this.debounceTimers = new Map();
    }

    init() {
        super.init();
        // 初始隐藏
        this.hide();
    }

    /**
     * 获取搜索替换面板的元素
     * dom.getById() 已内置缓存机制，无需额外缓存
     */
    getElements() {
        return {
            searchInput: dom.getIn(this.container, '#md-search-input'),
            replaceInput: dom.getIn(this.container, '#md-replace-input'),
            searchPrevBtn: dom.getById('md-search-prev')?.element,
            searchNextBtn: dom.getById('md-search-next')?.element,
            replaceBtn: dom.getById('md-replace-one')?.element,
            replaceAllBtn: dom.getById('md-replace-all')?.element,
            closeBtn: dom.getById('md-search-close')?.element,
            toggleBtn: dom.getById('md-search-toggle')?.element,
            caseSensitiveBtn: dom.getById('md-search-case')?.element,
            regexBtn: dom.getById('md-search-regex')?.element,
            wholeWordBtn: dom.getById('md-search-whole-word')?.element,
            matchCount: dom.getById('md-search-match-count')?.element,
            container: dom.getById('md-search-replace-panel')?.element
        };
    }

    bindEvents() {
        const { searchInput, replaceInput, searchPrevBtn, searchNextBtn,
                replaceBtn, replaceAllBtn, closeBtn, toggleBtn,
                caseSensitiveBtn, regexBtn, wholeWordBtn } = this.getElements();

        if (searchInput) {
            this.addEventListener(searchInput, 'input', () => this.handleSearchInput());
            this.addEventListener(searchInput, 'keydown', (e) => this.handleSearchKeydown(e));
        }

        if (replaceInput) {
            this.addEventListener(replaceInput, 'input', () => this.handleReplaceInput());
            this.addEventListener(replaceInput, 'keydown', (e) => this.handleReplaceKeydown(e));
        }

        if (searchPrevBtn) this.addEventListener(searchPrevBtn, 'click', () => this.findPrevious());
        if (searchNextBtn) this.addEventListener(searchNextBtn, 'click', () => this.findNext());
        if (replaceBtn) this.addEventListener(replaceBtn, 'click', () => this.replaceOne());
        if (replaceAllBtn) this.addEventListener(replaceAllBtn, 'click', () => this.replaceAll());
        if (closeBtn) this.addEventListener(closeBtn, 'click', () => this.hide());
        if (toggleBtn) this.addEventListener(toggleBtn, 'click', () => this.toggleMode());
        if (caseSensitiveBtn) this.addEventListener(caseSensitiveBtn, 'click', () => this.toggleOption('caseSensitive'));
        if (regexBtn) this.addEventListener(regexBtn, 'click', () => this.toggleOption('regexMode'));
        if (wholeWordBtn) this.addEventListener(wholeWordBtn, 'click', () => this.toggleOption('wholeWord'));

        // 监听内容变化，使用防抖避免频繁搜索
        this.unsubscribe = this.state.subscribeTo('content', () => {
            if (this.isVisible()) {
                // 内容变化必须强制重新搜索，以保证匹配位置与文档一致
                this.debounce('content-search', () => this.performSearch(true), 300);
            }
        });
    }

    handleSearchInput() {
        const { searchInput } = this.getElements();
        if (searchInput) {
            this.searchTerm = searchInput.value || '';
            // 防抖搜索，避免实时搜索导致性能问题
            this.debounce('search-input', () => this.performSearch(), 300);
        }
    }

    handleReplaceInput() {
        const { replaceInput } = this.getElements();
        if (replaceInput) {
            this.replaceTerm = replaceInput.value || '';
        }
    }

    handleSearchKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            // 确保搜索是最新的（防抖可能尚未执行）
            if (this.searchTerm) {
                this.performSearch();
            }
            if (e.shiftKey) {
                this.findPrevious();
            } else {
                this.findNext();
            }
        } else if (e.key === 'Escape') {
            this.hide();
        }
    }

    handleReplaceKeydown(e) {
        if (e.key === 'Enter') {
            e.preventDefault();
            this.replaceOne();
        } else if (e.key === 'Escape') {
            this.hide();
        }
    }

    /**
     * 构建搜索正则表达式（提取为独立方法，避免重复代码）
     */
    buildSearchRegex() {
        if (this.regexMode) {
            const flags = this.caseSensitive ? 'g' : 'gi';
            return new RegExp(this.searchTerm, flags);
        } else {
            // 普通搜索模式 - 转义特殊字符
            let pattern = this.searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            if (this.wholeWord) {
                pattern = `\\b${pattern}\\b`;
            }
            
            const flags = this.caseSensitive ? 'g' : 'gi';
            return new RegExp(pattern, flags);
        }
    }

    /**
     * 检查搜索配置是否变化
     */
    hasSearchConfigChanged() {
        const currentConfig = JSON.stringify({
            term: this.searchTerm,
            caseSensitive: this.caseSensitive,
            regexMode: this.regexMode,
            wholeWord: this.wholeWord
        });

        const changed = currentConfig !== this.lastSearchConfig;
        if (changed) {
            this.lastSearchConfig = currentConfig;
        }
        return changed;
    }

    performSearch(force = false) {
        const editor = dom.editor.element?.element;
        if (!editor) return;

        const content = editor.value;

        // 如果搜索词为空，清空结果
        if (!this.searchTerm) {
            this.matches = [];
            this.currentMatchIndex = -1;
            this.updateMatchDisplay();
            this.clearHighlights();
            return;
        }

        // 检查配置是否变化，如果没变化且已有结果且未被强制刷新，则跳过搜索
        if (!force && !this.hasSearchConfigChanged() && this.matches.length > 0) {
            // 只更新当前匹配索引（光标位置可能变化）
            const cursorPos = editor.selectionStart;
            this.currentMatchIndex = this.matches.findIndex(m => m.index >= cursorPos);
            if (this.currentMatchIndex === -1) {
                this.currentMatchIndex = 0;
            }
            this.updateMatchDisplay();
            return;
        }

        this.matches = [];
        this.currentMatchIndex = -1;

        try {
            const searchRegex = this.buildSearchRegex();
            let match;

            // 优化：限制最大匹配数量，避免内存问题
            const MAX_MATCHES = 10000;
            let matchCount = 0;

            while ((match = searchRegex.exec(content)) !== null && matchCount < MAX_MATCHES) {
                this.matches.push({
                    index: match.index,
                    text: match[0],
                    length: match[0].length
                });

                matchCount++;

                // 防止零宽度匹配导致的无限循环
                if (match.index === searchRegex.lastIndex) {
                    searchRegex.lastIndex++;
                }
            }

            // 如果有匹配，找到当前光标位置后的第一个匹配
            if (this.matches.length > 0) {
                const cursorPos = editor.selectionStart;
                this.currentMatchIndex = this.matches.findIndex(
                    m => m.index >= cursorPos
                );

                if (this.currentMatchIndex === -1) {
                    this.currentMatchIndex = 0; // 从头开始
                }
            }

            this.updateMatchDisplay();
        } catch (error) {
            // 正则表达式错误
            console.error('Search error:', error);
            this.matches = [];
            this.updateMatchDisplay();
        }
    }

    findNext() {
        if (this.matches.length === 0) return;

        this.currentMatchIndex = (this.currentMatchIndex + 1) % this.matches.length;
        this.highlightCurrentMatch(true); // 用户主动导航，需要聚焦编辑器以显示高亮
        this.updateMatchDisplay();
    }

    findPrevious() {
        if (this.matches.length === 0) return;

        this.currentMatchIndex = (this.currentMatchIndex - 1 + this.matches.length) % this.matches.length;
        this.highlightCurrentMatch(true); // 用户主动导航，需要聚焦编辑器以显示高亮
        this.updateMatchDisplay();
    }

    /**
     * 高亮当前匹配项
     * @param {boolean} [shouldFocus=false] - 是否聚焦编辑器（用户主动导航时为 true）
     */
    highlightCurrentMatch(shouldFocus = false) {
        const editor = dom.editor.element?.element;
        if (!editor || this.matches.length === 0) return;

        const match = this.matches[this.currentMatchIndex];
        if (!match) return;

        // 只在用户主动导航时聚焦编辑器，以显示高亮
        // 输入时的自动搜索不聚焦，避免中断用户输入
        if (shouldFocus) {
            editor.focus();
        }
        editor.setSelectionRange(match.index, match.index + match.length);

        // 滚动到可见区域
        const linesBefore = editor.value.substring(0, match.index).split('\n').length;
        const lineHeight = parseFloat(getComputedStyle(editor).lineHeight) || 24;
        const scrollTop = (linesBefore - 5) * lineHeight;
        editor.scrollTop = Math.max(0, scrollTop);
    }

    /**
     * 防抖方法
     * @param {string} key - 防抖键
     * @param {Function} fn - 要执行的函数
     * @param {number} delay - 延迟时间（毫秒）
     */
    debounce(key, fn, delay) {
        if (this.debounceTimers.has(key)) {
            clearTimeout(this.debounceTimers.get(key));
        }
        this.debounceTimers.set(key, setTimeout(() => {
            fn();
            this.debounceTimers.delete(key);
        }, delay));
    }

    /**
     * 清理资源
     */
    destroy() {
        // 清除所有防抖定时器
        this.debounceTimers.forEach(timer => clearTimeout(timer));
        this.debounceTimers.clear();

        // 取消订阅
        if (this.unsubscribe) {
            this.unsubscribe();
        }

        // 清空数据
        this.matches = [];
        this.lastSearchConfig = null;
    }

    replaceOne() {
        const editor = dom.editor.element?.element;
        if (!editor || this.matches.length === 0) return;

        const match = this.matches[this.currentMatchIndex];
        if (!match) return;

        const { replaceInput } = this.getElements();
        const replacement = replaceInput ? (replaceInput.value || '') : '';

        const content = editor.value;
        const before = content.substring(0, match.index);
        const after = content.substring(match.index + match.length);

        let finalReplacement = replacement;

        // 正则模式：支持替换组引用（$1, $2 等）
        if (this.regexMode) {
            try {
                const searchRegex = this.buildSearchRegex();
                finalReplacement = match.text.replace(searchRegex, replacement);
            } catch (e) {
                // 正则替换失败，使用普通替换
            }
        }

        editor.value = before + finalReplacement + after;

        // 更新光标位置
        const newCursorPos = match.index + finalReplacement.length;
        editor.setSelectionRange(newCursorPos, newCursorPos);

        // 触发 input 事件以更新状态
        editor.dispatchEvent(new Event('input', { bubbles: true }));

        // 增量更新匹配位置，避免重新搜索整个文档
        const lengthDiff = finalReplacement.length - match.length;
        this.updateMatchesAfterReplace(lengthDiff);

        // 移动到下一个匹配
        if (this.matches.length > 0) {
            if (this.currentMatchIndex >= this.matches.length) {
                this.currentMatchIndex = 0;
            }
            this.highlightCurrentMatch(true);
        }

        this.updateMatchDisplay();
    }

    /**
     * 增量更新匹配位置，避免重新搜索整个文档
     * @param {number} lengthDiff - 替换后的长度差
     */
    updateMatchesAfterReplace(lengthDiff) {
        // 移除被替换的匹配项（使用当前索引）
        this.matches.splice(this.currentMatchIndex, 1);

        // 更新后续所有匹配项的位置
        for (let i = this.currentMatchIndex; i < this.matches.length; i++) {
            this.matches[i].index += lengthDiff;
        }

        // 如果没有匹配了，重置索引
        if (this.matches.length === 0) {
            this.currentMatchIndex = -1;
        }
    }

    replaceAll() {
        const editor = dom.editor.element?.element;
        if (!editor || this.matches.length === 0) return;

        // 获取当前替换文本
        const { replaceInput } = this.getElements();
        const replacement = replaceInput ? (replaceInput.value || '') : '';

        let content = editor.value;
        let replaceCount = 0;

        try {
            const searchRegex = this.buildSearchRegex();

            content = content.replace(searchRegex, () => {
                replaceCount++;
                return replacement;
            });

            editor.value = content;

            // 触发 input 事件以更新状态
            editor.dispatchEvent(new Event('input', { bubbles: true }));

            this.showMessage(`已替换 ${replaceCount} 处`, 'success');

            // 清空搜索结果
            this.matches = [];
            this.currentMatchIndex = -1;
            this.updateMatchDisplay();
        } catch (error) {
            this.showMessage('替换失败: ' + error.message, 'error');
        }
    }

    toggleOption(option) {
        this[option] = !this[option];
        this.updateOptionButtons();
        this.performSearch();
    }

    updateModeDisplay() {
        const { container } = this.getElements();

        if (this.isReplaceMode) {
            container?.classList.add('replace-mode');
        } else {
            container?.classList.remove('replace-mode');
        }
    }

    toggleMode() {
        this.isReplaceMode = !this.isReplaceMode;
        this.updateModeDisplay();

        // 如果切换到替换模式，聚焦替换输入框
        if (this.isReplaceMode) {
            const { replaceInput } = this.getElements();
            if (replaceInput) {
                replaceInput.focus();
            }
        } else {
            // 如果切换到搜索模式，聚焦搜索输入框
            const { searchInput } = this.getElements();
            if (searchInput) {
                searchInput.focus();
            }
        }
    }

    updateOptionButtons() {
        const { caseSensitiveBtn, regexBtn, wholeWordBtn } = this.getElements();

        if (caseSensitiveBtn) {
            caseSensitiveBtn.classList.toggle('active', this.caseSensitive);
            caseSensitiveBtn.setAttribute('aria-pressed', this.caseSensitive);
        }

        if (regexBtn) {
            regexBtn.classList.toggle('active', this.regexMode);
            regexBtn.setAttribute('aria-pressed', this.regexMode);
        }

        if (wholeWordBtn) {
            wholeWordBtn.classList.toggle('active', this.wholeWord);
            wholeWordBtn.setAttribute('aria-pressed', this.wholeWord);
        }
    }

    updateMatchDisplay() {
        const { matchCount, searchPrevBtn, searchNextBtn, replaceBtn, replaceAllBtn } = this.getElements();

        if (matchCount) {
            if (this.matches.length === 0) {
                matchCount.textContent = this.searchTerm ? '无结果' : '';
            } else {
                matchCount.textContent = `${this.currentMatchIndex + 1} / ${this.matches.length}`;
            }
        }

        // 更新按钮状态
        const hasMatches = this.matches.length > 0;

        if (searchPrevBtn) searchPrevBtn.disabled = !hasMatches;
        if (searchNextBtn) searchNextBtn.disabled = !hasMatches;
        if (replaceBtn) replaceBtn.disabled = !hasMatches;
        if (replaceAllBtn) replaceAllBtn.disabled = !hasMatches;
    }

    show(isReplaceMode = false) {
        const { container, searchInput } = this.getElements();

        if (container) {
            container.classList.add('show');
        }

        this.isReplaceMode = isReplaceMode;
        this.updateModeDisplay();

        // 聚焦搜索框
        if (searchInput) {
            searchInput.focus();

            // 如果有选中文本，自动填充到搜索框并高亮第一个匹配
            const editor = dom.editor.element?.element;
            if (editor && editor.selectionStart !== editor.selectionEnd) {
                const selectedText = editor.value.substring(editor.selectionStart, editor.selectionEnd);
                searchInput.value = selectedText;
                this.searchTerm = selectedText;
                this.performSearch();

                // 高亮第一个匹配项（用户主动打开搜索框，需要显示高亮）
                if (this.matches.length > 0) {
                    this.highlightCurrentMatch(true);
                }
            }
        }
    }

    hide() {
        const { container, searchInput } = this.getElements();

        if (container) {
            container.classList.remove('show');
        }

        // 清空搜索
        this.searchTerm = '';
        this.matches = [];
        this.currentMatchIndex = -1;
        this.lastSearchConfig = null; // 重置搜索配置缓存

        if (searchInput) {
            searchInput.value = '';
        }

        this.updateMatchDisplay();

        // 不返回焦点到编辑器，避免滚动
    }

    isVisible() {
        const { container } = this.getElements();
        return container?.classList.contains('show') || false;
    }

    toggle() {
        if (this.isVisible()) {
            this.hide();
        } else {
            this.show(false);
        }
    }
}
