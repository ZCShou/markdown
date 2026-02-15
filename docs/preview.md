# Preview 组件渲染实现详解

## 📋 目录

- [概述](#概述)
- [组件结构](#组件结构)
- [渲染触发机制](#渲染触发机制)
- [增量渲染机制](#增量渲染机制)
- [渲染流程详解](#渲染流程详解)
  - [1. Markdown 渲染](#1-markdown-渲染)
  - [2. 代码高亮渲染](#2-代码高亮渲染)
  - [3. Mermaid 图表渲染](#3-mermaid-图表渲染)
  - [4. 数学公式渲染](#4-数学公式渲染)
  - [5. 复制按钮添加](#5-复制按钮添加)
  - [6. 图片处理](#6-图片处理)
  - [7. 链接处理](#7-链接处理)
- [可见性优化](#可见性优化)
- [导出功能](#导出功能)
- [性能优化策略](#性能优化策略)
- [完整渲染流程图](#完整渲染流程图)

---

## 概述

Preview 组件是 Markdown 编辑器的核心渲染引擎，负责将用户输入的 Markdown 文本转换为可视化的 HTML 内容。它集成了多个第三方库来实现完整的渲染功能。

### 核心依赖

```javascript
import { marked } from 'marked';        // Markdown 解析器
import DOMPurify from 'dompurify';       // HTML 净化器
import Prism from 'prismjs';             // 代码高亮库
import mermaid from 'mermaid';           // 图表渲染库
import katex from 'katex';               // 数学公式渲染库
import { BaseComponent } from './BaseComponent.js';
import { dom } from '../utils/dom.js';
```

### 主要职责

1. **Markdown → HTML 转换**：使用 `marked` 库将 Markdown 文本解析为 HTML
2. **HTML 安全净化**：使用 `DOMPurify` 清除潜在的 XSS 攻击
3. **代码语法高亮**：使用 `Prism` 为代码块添加语法高亮
4. **Mermaid 图表渲染**：将 Mermaid 代码块渲染为可视化图表
5. **数学公式渲染**：使用 `KaTeX` 渲染 LaTeX 数学公式
6. **交互功能**：添加代码复制按钮、图片错误处理、链接处理
7. **导出功能**：支持导出为 HTML、Markdown、PDF

---

## 组件结构

### 私有字段

```javascript
export class Preview extends BaseComponent {
    // ==================== 私有字段声明 ====================
    
    /** @private */
    #lastRenderedData;              // 增量渲染：存储上次渲染的数据
    /** @private */
    #lastRenderedContent = '';      // 上次渲染的完整内容（用于避免重复渲染）
    /** @private */
    #mermaidTimeoutIds = [];        // Mermaid 超时定时器 ID 集合
    /** @private */
    #intersectionObserver = null;   // 可见性观察器
    /** @private */
    #pendingCodeBlocks = new Set(); // 待处理的代码块
    /** @private */
    #pendingMermaidBlocks = new Set(); // 待处理的 Mermaid 块
    /** @private */
    #pendingMathBlocks = new Set(); // 待处理的数学公式块
    /** @private */
    #mermaidRenderTimer = null;     // Mermaid 渲染定时器
    /** @private */
    #codeHighlightTimer = null;     // 代码高亮定时器
    /** @private */
    #mathRenderTimer = null;        // 数学公式渲染定时器
}
```

### 公共字段

```javascript
    // ==================== 公共字段 ====================
    
    mermaidInitialized = false;  // Mermaid 初始化状态
    renderTimeout = null;        // 渲染防抖定时器
```

### 增量渲染数据结构

```javascript
this.#lastRenderedData = {
    markdown: '',              // 上次渲染的 Markdown 文本
    codeBlocks: new Map(),     // hash -> { lang, code, index }
    mermaidBlocks: new Map(),  // hash -> { code, index }
    mathBlocks: new Map(),     // hash -> { latex, displayMode, index }
    headings: []               // [{ level, text }]
};
```

---

## 渲染触发机制

### 触发源概览

Preview 组件有三种主要的渲染触发源：

```mermaid
graph LR
    A[渲染触发源] --> B[内容变化]
    A --> C[文档切换]
    A --> D[主题切换]
    
    B --> E[用户输入]
    C --> F[点击文档列表]
    D --> G[切换明暗主题]
```

### 状态订阅实现

```javascript
subscribe() {
    // 订阅内容、当前文档和主题变化
    const unsubscribeContent = this.state.subscribeTo(
        ['content', 'currentDocId', 'theme'],
        (newValue, oldValue, key) => {
            if (key === 'content') {
                this.updatePreview();           // 内容变化
            } else if (key === 'currentDocId') {
                this.forceUpdatePreview();      // 切换文档
            } else if (key === 'theme') {
                this.updateMermaidTheme();      // 主题切换
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
        }
    });

    // 合并取消订阅函数
    this.unsubscribe = () => {
        unsubscribeContent();
        unsubscribeExport();
    };
}
```

### 1. 内容变化触发

**触发流程**：

```mermaid
sequenceDiagram
    participant User as 用户
    participant Editor as Editor
    participant State as EditorState
    participant Preview as Preview

    User->>Editor: 输入字符
    Editor->>State: setState({ content })
    State->>Preview: 通知订阅者
    Preview->>Preview: updatePreview()
    Note over Preview: 100ms 防抖
    Preview->>Preview: renderContent()
    Preview->>Preview: #detectChanges()
    Preview->>Preview: renderMarkdown()
    Preview->>Preview: #updateDOMSmart()
    Preview->>Preview: processAllElements()
```

**代码实现**：

```javascript
updatePreview() {
    const content = this.state.get('content');

    // 避免重复渲染（但允许初始渲染）
    if (content === this.#lastRenderedContent && this.#lastRenderedContent !== '') return;

    this.#scheduleRender(content, 100);
}

#scheduleRender(content, delay = 100) {
    if (this.renderTimeout) {
        clearTimeout(this.renderTimeout);
    }

    this.renderTimeout = setTimeout(() => {
        this.renderContent(content);
        this.#lastRenderedContent = content;
        this.renderTimeout = null;
    }, delay);
}
```

### 2. 文档切换触发

**触发流程**：

```mermaid
sequenceDiagram
    participant User as 用户
    participant LeftSidebar as LeftSidebar
    participant State as EditorState
    participant Preview as Preview
    participant Browser as 浏览器

    User->>LeftSidebar: 点击文档
    LeftSidebar->>LeftSidebar: handleOpen(docId)
    
    LeftSidebar->>State: state.get('documents')
    State-->>LeftSidebar: 返回文档列表
    
    LeftSidebar->>LeftSidebar: 查找目标文档
    
    alt 文档存在且不是文件夹
        LeftSidebar->>State: state.setCurrentDocument(doc)
        Note over State: 1. 更新 #state.currentDocId<br/>2. 更新 #state.content<br/>3. 调用 #notify()
        
        State->>State: #notify(oldState, newState, changedKeys)
        Note over State: changedKeys = ['currentDocId', 'content']
        
        par 通知 currentDocId 监听器
            State->>LeftSidebar: listener(newValue, oldValue, 'currentDocId')
            Note over LeftSidebar: 更新选中状态
        and 通知 content 监听器
            State->>Preview: listener(newValue, oldValue, 'content')
            Note over Preview: content 键的监听器被触发
            
            Preview->>Preview: forceUpdatePreview()
            Note over Preview: 立即同步渲染，无延迟
            
            Preview->>State: state.get('currentDocId')
            State-->>Preview: 返回当前文档ID
            
            Preview->>State: state.get('documents')
            State-->>Preview: 返回文档列表
            
            Preview->>Preview: 查找当前文档
            
            alt 找到文档
                Preview->>Preview: renderContent(content)
                Note over Preview: 同步执行，无setTimeout延迟
                
                Preview->>Preview: #detectChanges()
                Note over Preview: 检测变化<br/>代码块/Mermaid/标题
                
                Preview->>Preview: #updateHeadingsSync()
                Note over Preview: 提前解析标题数据<br/>不等待DOM渲染
                
                Preview->>State: setState({ headings })
                Note over State: 立即更新标题数据<br/>TOC可立即获取
                
                Preview->>Preview: renderMarkdown()
                Preview->>Preview: marked.parse()
                Preview->>Preview: DOMPurify.sanitize()
                
                Preview->>Preview: #updateDOMSmart()
                Note over Preview: 智能更新 DOM<br/>保留未变化的部分
                
                Preview->>Browser: 更新 DOM
                
                Browser->>Preview: requestAnimationFrame
                Preview->>Preview: querySelectorAll()
                Preview->>Preview: processAllElements()
                Note over Preview: 增量处理<br/>只处理变化的部分
                
                Preview->>Browser: 渲染最终结果
                Browser-->>User: 显示新文档内容
            end
        end
    end
```

**代码实现**：

**LeftSidebar 组件**：
```javascript
// LeftSidebar.js
handleOpen(docId) {
    const documents = this.state.get('documents');
    const doc = documents.find(d => d.id === docId);
    
    if (!doc) return;
    
    if (doc.type === 'folder') {
        // 切换文件夹展开状态
        this.setFolderExpanded(docId, !this.isFolderExpanded(docId));
    } else {
        // 切换到文档
        this.state.setCurrentDocument(doc);
    }
}
```

**State 模块**：
```javascript
// state.js
setCurrentDocument(doc) {
    const updates = {
        currentDocId: doc.id,
        content: doc.content || ''
    };
    
    this.setState(updates);
}
```

**Preview 组件原型**：
```javascript
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
```

### 3. 主题切换触发

**触发流程**：

```mermaid
sequenceDiagram
    participant User as 用户
    participant Settings as Settings
    participant State as EditorState
    participant Preview as Preview
    participant Mermaid as Mermaid

    User->>Settings: 切换主题
    Settings->>State: setState({ interface: { theme } })
    State->>Preview: 通知订阅者
    Preview->>Preview: updateMermaidTheme()
    Preview->>Mermaid: initialize({ theme })
    Preview->>Mermaid: run({ nodes })
```

**代码实现**：

```javascript
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
```

---

## 增量渲染机制

### 核心思想

通过哈希比较检测内容变化，只重新渲染变化的部分，保留未变化的元素。

### 变化检测流程

```mermaid
graph TD
    A[renderContent] --> B[#detectChanges]
    B --> C[提取代码块]
    B --> D[提取 Mermaid]
    B --> E[提取数学公式]
    B --> F[提取标题]
    
    C --> G[生成复合键 hash_idx_index]
    D --> G
    E --> G
    
    G --> H[与上次数据比较]
    H --> I[返回变化结果]
    
    I --> J[renderMarkdown]
    J --> K[#updateDOM]
    K --> L[保留未变化元素]
    L --> M[更新变化元素]
```

### 代码实现

**1. 变化检测（使用复合键）**：

```javascript
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
    const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
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
            // 🔥 使用复合键（哈希 + 索引）
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
```

**2. 找出变化的键**：

```javascript
#findChangedMapEntries(oldMap, newMap) {
    const changed = new Set();

    // 检查旧 Map 中的每个键
    for (const [key, oldValue] of oldMap.entries()) {
        if (!newMap.has(key)) {
            changed.add(key);  // 键被删除了
        } else {
            const newValue = newMap.get(key);
            if (!this.#areValuesEqual(oldValue, newValue)) {
                changed.add(key);  // 值发生了变化
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
```

**3. 智能更新 DOM**：

```javascript
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
```

**4. 保留未变化的元素**：

```javascript
#preserveUnchangedElements(tempDiv, oldElements, changes) {
    // 预先查询一次所有元素，消除重复的 querySelectorAll
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
    newCodeBlocks.forEach((newEl, index) => {
        const hash = this.#generateSimpleHash(newEl.textContent);
        const compositeKey = `${hash}_idx_${index}`;
        const oldWrapper = oldElements.code.get(compositeKey);

        // 只有当旧元素存在且未发生变化时才保留
        if (oldWrapper && !changes.changedCodeBlocks.has(compositeKey)) {
            const newPre = newEl.parentElement;
            const newWrapper = newPre?.parentElement?.classList.contains('code-block-wrapper')
                ? newPre.parentElement
                : newPre;
            
            // 克隆整个 code-block-wrapper（包含复制按钮）
            const clonedWrapper = oldWrapper.cloneNode(true);
            newWrapper.replaceWith(clonedWrapper);
            
            // 为克隆的复制按钮重新添加事件监听器
            const clonedBtn = clonedWrapper.querySelector('.code-copy-btn');
            if (clonedBtn) {
                this.#attachCopyButtonHandler(clonedBtn, clonedWrapper.querySelector('pre code'));
            }
        }
    });

    // 保留未变化的 Mermaid 图表和数学公式（类似逻辑）
    // ...
}
```

---

## 渲染流程详解

### 1. Markdown 渲染

**流程图**：

```mermaid
graph TD
    A[Markdown 文本] --> B[保护数学公式]
    B --> C[保护删除线]
    C --> D[提取上标]
    D --> E[提取下标]
    E --> F[marked.parse]
    F --> G[添加标题 ID]
    G --> H[恢复数学公式]
    H --> I[恢复上标下标]
    I --> J[恢复删除线]
    J --> K[DOMPurify.sanitize]
    K --> L[添加图片状态]
    L --> M[HTML 输出]
```

**代码实现**：

```javascript
renderMarkdown(markdown) {
    try {
        const mathBlocks = [];
        const supSubBlocks = [];
        const strikeBlocks = [];

        // 按优先级处理，避免符号冲突
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
            html = marked.parse(processedMarkdown, {
                breaks: false,
                gfm: true
            });

            // 手动添加标题 ID（在解析后处理）
            let headingIndex = 0;
            html = html.replace(/<h([1-6])([^>]*)>(.*?)<\/h\1>/gi, (match, level, attrs, text) => {
                if (attrs.includes('id=')) return match;
                return `<h${level}${attrs} id="heading-${headingIndex++}">${text}</h${level}>`;
            });
        } else {
            html = this.escapeHtml(processedMarkdown);
        }

        // 替换数学公式占位符
        html = html.replace(/\x02MATH(\d+)\x02/g, (_, index) => {
            const math = mathBlocks[+index];
            const tag = math.displayMode ? 'div' : 'span';
            const cls = math.displayMode ? 'math-block' : 'math-inline';
            return `<${tag} class="${cls}" data-latex="${math.latex}"></${tag}>`;
        });

        // 替换上标和下标占位符
        html = html.replace(/\x01(SUP|SUB)(\d+)\x01/g, (_, type, index) => {
            const item = supSubBlocks[+index];
            const tag = item.type === 'sup' ? 'sup' : 'sub';
            return `<${tag}>${item.content}</${tag}>`;
        });

        // 恢复删除线占位符
        html = html.replace(/\x03STRIKE(\d+)\x03/g, (_, index) => {
            return `<s>${strikeBlocks[+index]}</s>`;
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
            if (attrs.includes('data-load-status')) return match;
            return `<img${attrs} data-load-status="pending">`;
        });

        return html;
    } catch (e) {
        console.warn('Markdown 渲染失败:', e);
        return this.escapeHtml(markdown);
    }
}
```

### 2. 代码高亮渲染

**流程图**：

```mermaid
graph TD
    A[代码块元素] --> B{有 IntersectionObserver?}
    B -->|是| C[按可见性分类]
    B -->|否| D[批量高亮]
    
    C --> E[可见元素]
    C --> F[不可见元素]
    
    E --> G[立即高亮]
    F --> H[添加到观察器]
    H --> I[延迟 1 秒]
    I --> J[批量高亮剩余]
    
    D --> K[分批处理]
    K --> L[每批 30 个]
    L --> M[使用 rAF/rIC]
    
    G --> N[标记已高亮]
    J --> N
    M --> N
```

**代码实现**：

```javascript
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

    // 延迟渲染剩余的代码块
    if (invisible.length > 0) {
        if (this.#codeHighlightTimer) {
            clearTimeout(this.#codeHighlightTimer);
        }
        this.#codeHighlightTimer = setTimeout(() => {
            const pending = Array.from(this.#pendingCodeBlocks);
            const validPending = [];

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

#highlightSingleBlock(block) {
    try {
        Prism.highlightElement(block);
        block.classList.add('prism-highlighted');
    } catch (err) {
        console.warn('代码高亮失败:', err);
        block.classList.add('prism-highlighted');
    }
}

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
```

### 3. Mermaid 图表渲染

**流程图**：

```mermaid
graph TD
    A[Mermaid 代码块] --> B[创建 mermaid div]
    B --> C{有 IntersectionObserver?}
    C -->|是| D[按可见性分类]
    C -->|否| E[批量渲染]
    
    D --> F[可见图表]
    D --> G[不可见图表]
    
    F --> H[立即渲染]
    G --> I[添加到观察器]
    I --> J[延迟 1 秒]
    J --> K[批量渲染剩余]
    
    E --> L[设置超时 5 秒]
    L --> M[mermaid.run]
    H --> M
    K --> M
    
    M --> N{成功?}
    N -->|是| O[标记 mermaid-done]
    N -->|否| P[显示错误信息]
```

**代码实现**：

```javascript
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

    // 延迟渲染剩余的 Mermaid
    if (invisible.length > 0) {
        if (this.#mermaidRenderTimer) {
            clearTimeout(this.#mermaidRenderTimer);
        }
        this.#mermaidRenderTimer = setTimeout(() => {
            const pending = Array.from(this.#pendingMermaidBlocks);
            const validPending = [];

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

#createMermaidDiv(block) {
    const code = block.textContent.trim();
    if (!code) return null;

    const preElement = block.parentElement;
    if (!preElement?.parentNode) return null;

    // 如果已经是 mermaid div，清除渲染状态
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

#renderMermaidDivs(containers) {
    if (containers.length === 0) return;

    const timeoutId = this.#setupMermaidTimeout(containers);
    this.#mermaidTimeoutIds.push(timeoutId);

    mermaid
        .run({ nodes: containers })
        .then(() => this.#handleMermaidSuccess(containers, timeoutId))
        .catch(err => this.#handleMermaidError(containers, timeoutId, err));
}

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

#handleMermaidSuccess(containers, timeoutId) {
    clearTimeout(timeoutId);
    containers.forEach(c => c.classList.add('mermaid-done'));
    this.#clearMermaidTimeout(timeoutId);
}

#handleMermaidError(containers, timeoutId, err) {
    clearTimeout(timeoutId);
    console.warn('Mermaid 渲染失败:', err);
    containers.forEach(c => {
        c.textContent = '图表渲染失败: ' + err.message;
        c.classList.add('render-error');
    });
    this.#clearMermaidTimeout(timeoutId);
}
```

### 4. 数学公式渲染

**流程图**：

```mermaid
graph TD
    A[数学公式元素] --> B{有 IntersectionObserver?}
    B -->|是| C[按可见性分类]
    B -->|否| D[批量渲染]
    
    C --> E[可见元素]
    C --> F[不可见元素]
    
    E --> G[立即渲染]
    F --> H[添加到观察器]
    H --> I[延迟 1 秒]
    I --> J[批量渲染剩余]
    
    G --> K[标记 math-rendered]
    J --> K
    D --> K
```

**代码实现**：

```javascript
#renderMath(mathElements) {
    if (typeof katex === 'undefined' || mathElements.length === 0) return;

    const elements = Array.from(mathElements);

    if (!this.#intersectionObserver) {
        this.#renderMathBatch(elements);
        return;
    }

    // 分离可见和不可见元素
    const { visible, invisible } = this.#partitionByVisibility(elements);

    // 立即渲染可见元素
    visible.forEach(el => {
        if (!el.classList.contains('math-rendered')) {
            this.#renderSingleMath(el);
        }
    });

    // 监听不可见元素
    invisible.forEach(el => {
        el.classList.add('math-pending');
        this.#pendingMathBlocks.add(el);
        this.#intersectionObserver.observe(el);
    });

    // 延迟渲染剩余的数学公式
    if (invisible.length > 0) {
        if (this.#mathRenderTimer) {
            clearTimeout(this.#mathRenderTimer);
        }
        this.#mathRenderTimer = setTimeout(() => {
            const pending = Array.from(this.#pendingMathBlocks);
            const validPending = [];

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

#renderSingleMath(el) {
    const latex = el.getAttribute('data-latex');
    if (!latex) return;

    try {
        katex.render(latex, el, {
            displayMode: el.classList.contains('math-block'),
            throwOnError: false,
            errorColor: '#cc0000'
        });
        el.classList.add('math-rendered');
        el.classList.remove('math-pending');
    } catch (err) {
        console.warn('KaTeX 渲染失败:', err);
        el.textContent = latex;
        el.classList.add('math-error');
    }
}

#renderMathBatch(elements) {
    elements.forEach(el => {
        if (!el.classList.contains('math-rendered')) {
            this.#renderSingleMath(el);
        }
    });
}
```

### 5. 复制按钮添加

**代码实现**：

```javascript
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
```

### 6. 图片处理

**错误处理**：

```javascript
handleImageError(img) {
    img.alt = `图片加载失败: ${img.src}`;
    img.classList.add('markdown-image-error');
}

#markImages(images) {
    images.forEach(img => (img.dataset.errorHandled = 'true'));
}
```

### 7. 链接处理

**内部链接跳转**：

```javascript
#handleInternalLink(href) {
    // 移除 # 号并解码
    const targetId = decodeURIComponent(href.slice(1));

    // 查找目标元素
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

        // 更新 URL hash
        history.replaceState(null, null, href);
    } else {
        console.warn(`未找到目标元素: ${targetId}`);
    }
}
```

**事件绑定**：

```javascript
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
            const link = e.target.closest('a');
            if (!link) return;

            const href = link.getAttribute('href');
            if (!href) return;

            // 处理内部锚点链接
            if (href.startsWith('#')) {
                e.preventDefault();
                this.#handleInternalLink(href);
                return;
            }

            // 处理外部链接：在新标签页中打开
            if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
                e.preventDefault();
                window.open(href, '_blank', 'noopener,noreferrer');
                return;
            }
        },
        false
    );
}
```

---

## 可见性优化

### IntersectionObserver

使用 IntersectionObserver API 实现可见性检测，优先渲染可见元素。

**初始化**：

```javascript
#initIntersectionObserver() {
    if (!('IntersectionObserver' in window)) return;

    const buffer = Preview.#VISIBILITY_BUFFER;  // 500px

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
```

**可见性检测**：

```javascript
#isElementVisible(element) {
    const rect = element.getBoundingClientRect();
    return rect.top < window.innerHeight + 200 && rect.bottom > -200;
}

#partitionByVisibility(elements) {
    const visible = [];
    const invisible = [];
    elements.forEach(el => {
        (this.#isElementVisible(el) ? visible : invisible).push(el);
    });
    return { visible, invisible };
}
```

---

## 导出功能

### 导出 HTML

```javascript
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
/* 样式内容 */
</style>
</head>
<body>
${html}
</body>
</html>`;

    this.downloadFile(fullHtml, 'text/html', '.html');
    this.showMessage('HTML 导出成功', 'success');
}
```

### 导出 Markdown

```javascript
exportMarkdown() {
    const content = this.state.get('content');
    this.downloadFile(content, 'text/markdown', '.md');
    this.showMessage('Markdown 导出成功', 'success');
}
```

### 导出 PDF

```javascript
exportPDF() {
    const content = this.state.get('content');
    if (!content) {
        this.showMessage('没有内容可导出', 'warning');
        return;
    }

    // 添加打印专用类
    document.body.classList.add('printing-pdf');

    // 触发浏览器打印对话框
    window
        .print()
        .then(() => {
            document.body.classList.remove('printing-pdf');
        })
        .catch(error => {
            console.error('打印失败:', error);
            document.body.classList.remove('printing-pdf');
            this.showMessage('打印失败: ' + error.message, 'error');
        });

    this.showMessage('请在打印对话框中选择"另存为 PDF"', 'info');
}
```

### 下载文件

```javascript
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
```

---

## 性能优化策略

### 1. 增量渲染

通过哈希比较检测变化，只重新渲染变化的部分。

### 2. 可见性优化

使用 IntersectionObserver 优先渲染可见元素，延迟渲染不可见元素。

### 3. 批量处理

使用 requestIdleCallback 或 setTimeout 分批处理大量元素。

### 4. 防抖

内容变化使用 100ms 防抖，减少渲染频率。

### 5. DOM 缓存

使用 dom.js 统一管理 DOM 元素，减少重复查询。

### 6. 智能更新

使用 replaceChildren 代替 innerHTML，减少重排。

---

## 完整渲染流程图

```mermaid
graph TD
    A[状态变化] --> B{触发类型}
    
    B -->|content| C[updatePreview]
    B -->|currentDocId| D[forceUpdatePreview]
    B -->|theme| E[updateMermaidTheme]
    B -->|export:trigger| F[导出操作]
    
    C --> G[100ms 防抖]
    D --> H[立即渲染]
    G --> I[renderContent]
    H --> I
    
    I --> J[#detectChanges]
    J --> K[单次扫描提取]
    K --> L[比较变化]
    
    L --> M[renderMarkdown]
    M --> N[marked.parse]
    N --> O[DOMPurify.sanitize]
    
    O --> P[#updateDOM]
    P --> Q[保留未变化元素]
    Q --> R[更新变化元素]
    
    R --> S[requestAnimationFrame]
    S --> T[返回待处理元素]
    
    T --> U[#highlightCode]
    T --> V[#renderMermaid]
    T --> W[#renderMath]
    T --> X[#addCopyButtons]
    
    U --> Y{可见性检测}
    Y -->|可见| Z[立即高亮]
    Y -->|不可见| AA[延迟渲染]
    
    V --> AB{可见性检测}
    AB -->|可见| AC[立即渲染]
    AB -->|不可见| AD[延迟渲染]
    
    Z --> AE[完成]
    AA --> AE
    AC --> AE
    AD --> AE
    W --> AE
    X --> AE
    
    E --> AF[重新配置主题]
    AF --> AG[重新渲染 Mermaid]
    AG --> AE
    
    F --> AH{导出类型}
    AH -->|html| AI[exportHTML]
    AH -->|md| AJ[exportMarkdown]
    AH -->|pdf| AK[exportPDF]
```

---

**文档版本**：2.1.0  
**最后更新**：2026-02-15  
**维护者**：Markdown Editor Team
