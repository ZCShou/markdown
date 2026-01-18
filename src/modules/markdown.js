/**
 * Markdown 编辑器管理器 - 重构版
 * 采用状态驱动 UI 的架构模式
 * 组件化设计，职责分离
 */
import { editorState } from './state.js';
import { DocumentList } from './components/DocumentList.js';
import { Preview } from './components/Preview.js';
import { Editor } from './components/Editor.js';
import { Sidebar } from './components/Sidebar.js';
import { TOC } from './components/TOC.js';
import { StoreManager } from '@/modules/store.js';

// 导入 Prism 语言包
import 'prismjs/components/prism-java';
import 'prismjs/components/prism-c';
import 'prismjs/components/prism-cpp';
import 'prismjs/components/prism-csharp';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-ruby';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-swift';
import 'prismjs/components/prism-kotlin';
import 'prismjs/components/prism-scala';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markup';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-docker';
import 'prismjs/components/prism-makefile';
import 'prismjs/components/prism-nginx';
import 'prismjs/components/prism-perl';
import 'prismjs/components/prism-lua';
import 'prismjs/components/prism-r';
import 'prismjs/components/prism-matlab';
import 'prismjs/components/prism-groovy';

export class MarkdownEditor {
    // ==================== 配置常量 ====================
    
    /**
     * 防抖延迟配置（毫秒）
     */
    static DEBOUNCE_DELAY = {
        UPDATE: 300,   // 内容更新防抖延迟
        SAVE: 1000     // 自动保存防抖延迟
    };
    
    /**
     * 拖拽配置
     */
    static DRAG_CONFIG = {
        MIN_WIDTH: 100,    // 最小面板宽度（像素）
        BATCH_SIZE: 10     // 批量处理大小
    };
    
    /**
     * UI 常量配置
     */
    static UI_CONFIG = {
        MESSAGE_DURATION: 2000,      // 消息显示时长（毫秒）
        MERMAID_RENDER_DELAY: 100,   // Mermaid 渲染延迟（毫秒）
        MAX_CONTENT_LENGTH: 1000000  // 最大内容长度限制
    };
    
    // 默认 Markdown 内容
    static DEFAULT_CONTENT = `# Markdown 语法指南

## 标题

# 这是一级标题
## 这是二级标题
###### 这是六级标题

## 强调

*这段文本会是斜体*
_这段文本也会是斜体_

**这段文本会是粗体**
__这段文本也会是粗体_

_你可以**组合**使用它们_

## 列表

### 无序列表

* 项目 1
* 项目 2
  * 项目 2a
  * 项目 2b

### 有序列表

1. 项目 1
2. 项目 2
3. 项目 3
  1. 项目 3a
  2. 项目 3b

## 代码

### 行内代码

这是一个 \`行内代码\` 示例。

### 代码块

#### JavaScript
\`\`\`javascript
function hello() {
    console.log("Hello, World!");
}
\`\`\`

#### Python
\`\`\`python
def hello():
    print("Hello, World!")
\`\`\`

#### Java
\`\`\`java
public class Hello {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
\`\`\`

#### C
\`\`\`c
#include <stdio.h>
int main() {
    printf("Hello, World!\\n");
    return 0;
}
\`\`\`

#### C++
\`\`\`cpp
#include <iostream>
int main() {
    std::cout << "Hello, World!" << std::endl;
    return 0;
}
\`\`\`

#### C#
\`\`\`csharp
using System;
class Program {
    static void Main() {
        Console.WriteLine("Hello, World!");
    }
}
\`\`\`

#### Ruby
\`\`\`ruby
puts "Hello, World!"
\`\`\`

#### Go
\`\`\`go
package main
import "fmt"
func main() {
    fmt.Println("Hello, World!")
}
\`\`\`

#### Rust
\`\`\`rust
fn main() {
    println!("Hello, World!");
}
\`\`\`

#### Swift
\`\`\`swift
print("Hello, World!")
\`\`\`

#### Kotlin
\`\`\`kotlin
fun main() {
    println("Hello, World!")
}
\`\`\`

#### TypeScript
\`\`\`typescript
function hello(): void {
    console.log("Hello, World!");
}
\`\`\`

#### SQL
\`\`\`sql
SELECT * FROM users WHERE name = 'Alice';
\`\`\`

#### Bash
\`\`\`bash
echo "Hello, World!"
\`\`\`

#### JSON
\`\`\`json
{
    "message": "Hello, World!"
}
\`\`\`

#### YAML
\`\`\`yaml
message: Hello, World!
\`\`\`

## 引用

> 这是一段引用文字。
>> 这是嵌套引用。

## 表格

| 左列 | 右列 |
| --- | --- |
| 左 foo | 右 foo |
| 左 bar | 右 bar |

## 链接

[访问 GitHub](https://github.com)

## Mermaid 图表

\`\`\`mermaid
graph TD
    A[开始] --> B{判断}
    B -->|是| C[执行]
    B -->|否| D[跳过]
    C --> E[结束]
    D --> E
\`\`\`

\`\`\`mermaid
sequenceDiagram
    participant A as 用户
    participant B as 系统
    A->>B: 发送请求
    B-->>A: 返回响应
\`\`\`
`;

    /**
     * 构造函数 - 初始化编辑器实例
     */
    constructor() {
        this.isInitialized = false;
        this.isDragging = false;
        this.lastLeftRatio = 0.5;
        
        // 组件实例
        this.components = {};
        
        // DOM 缓存
        this.domCache = {};
        
        // 定时器
        this.timers = {};
    }

    // ==================== 工具函数 ====================
    
    /**
     * 获取 DOM 元素（带缓存）
     */
    getElement(id) {
        if (!this.domCache[id]) {
            this.domCache[id] = document.getElementById(id);
        }
        return this.domCache[id];
    }

    /**
     * 防抖函数
     */
    debounce(key, fn, delay) {
        if (this.timers[key]) {
            clearTimeout(this.timers[key]);
        }
        this.timers[key] = setTimeout(fn, delay);
    }

    /**
     * 显示消息提示
     */
    showMessage(message, type = 'info', duration = MarkdownEditor.UI_CONFIG.MESSAGE_DURATION) {
        console.log(`[${type.toUpperCase()}] ${message}`);
        
        const overlay = this.getElement('status-overlay');
        const messageEl = this.getElement('status-message');

        if (overlay && messageEl) {
            messageEl.textContent = message;
            messageEl.className = 'status-message ' + type;
            overlay.classList.add('show');
            messageEl.classList.add('show');

            setTimeout(() => {
                overlay.classList.remove('show');
                messageEl.classList.remove('show');
            }, duration);
        }
    }

    // ==================== 组件初始化 ====================
    
    /**
     * 初始化所有组件
     */
    initComponents() {
        // 编辑器组件
        this.components.editor = new Editor(editorState, 'markdown-editor');
        
        // 预览组件
        this.components.preview = new Preview(editorState, 'markdown-preview');
        
        // 文档列表组件
        this.components.documentList = new DocumentList(editorState, 'md-doc-list');
        
        // 左侧边栏组件
        this.components.leftSidebar = new Sidebar(editorState, 'md-sidebar-left', 'left');
        
        // 右侧边栏组件
        this.components.rightSidebar = new Sidebar(editorState, 'md-sidebar-right', 'right');
        
        // 目录组件
        this.components.toc = new TOC(editorState, 'md-toc', this.components.preview);
        
        // 初始化所有组件
        Object.values(this.components).forEach(component => {
            component.init();
        });
    }

    // ==================== 分隔条拖拽 ====================
    
    /**
     * 设置拖拽分隔条
     */
    setupDivider() {
        const divider = this.getElement('md-divider');
        const editorPane = this.getElement('md-editor-pane');
        const previewPane = this.getElement('md-preview-pane');
        const container = this.getElement('md-container');

        if (!divider || !editorPane || !previewPane || !container) return;

        // 设置面板宽度的辅助函数
        const setPaneWidths = (ratio) => {
            const containerRect = container.getBoundingClientRect();
            const totalWidth = containerRect.width;
            const dividerWidth = divider.offsetWidth;
            const availableWidth = totalWidth - dividerWidth;
            const leftWidth = availableWidth * ratio;

            editorPane.style.width = leftWidth + 'px';
            editorPane.classList.add('fixed-width');
            previewPane.style.width = (availableWidth - leftWidth) + 'px';
            previewPane.classList.add('fixed-width');
        };

        // 初始化宽度
        setPaneWidths(this.lastLeftRatio);
        setTimeout(() => setPaneWidths(this.lastLeftRatio), 100);

        // 鼠标事件
        divider.addEventListener('mouseenter', () => {
            if (!this.isDragging) divider.classList.add('hover');
        });

        divider.addEventListener('mouseleave', () => {
            if (!this.isDragging) divider.classList.remove('hover');
        });

        divider.addEventListener('mousedown', (e) => {
            this.isDragging = true;
            divider.classList.add('dragging');
            divider.classList.remove('hover');
            document.body.classList.add('is-dragging');
            e.preventDefault();
        });

        divider.addEventListener('dblclick', () => {
            setPaneWidths(0.5);
            this.lastLeftRatio = 0.5;
        });

        document.addEventListener('mousemove', (e) => {
            if (!this.isDragging) return;

            const containerRect = container.getBoundingClientRect();
            const totalWidth = containerRect.width;
            const dividerWidth = divider.offsetWidth;
            const minWidth = MarkdownEditor.DRAG_CONFIG.MIN_WIDTH;
            const maxWidth = totalWidth - minWidth - dividerWidth;
            const leftWidth = Math.max(minWidth, Math.min(e.clientX - containerRect.left, maxWidth));

            editorPane.style.width = leftWidth + 'px';
            editorPane.classList.add('fixed-width');
            previewPane.style.width = (totalWidth - leftWidth - dividerWidth) + 'px';
            previewPane.classList.add('fixed-width');

            this.lastLeftRatio = leftWidth / (totalWidth - dividerWidth);
        });

        document.addEventListener('mouseup', () => {
            if (this.isDragging) {
                this.isDragging = false;
                divider.classList.remove('dragging', 'hover');
                document.body.classList.remove('is-dragging');
            }
        });

        window.addEventListener('resize', () => {
            setPaneWidths(this.lastLeftRatio);
        });
    }

    // ==================== 主题管理 ====================

    /**
     * 应用主题
     */
    applyTheme(mode) {
        document.documentElement.dataset.mode = mode;
        
        // 更新 Prism 主题
        const lightTheme = document.getElementById('prism-light-theme');
        const darkTheme = document.getElementById('prism-dark-theme');
        
        if (lightTheme && darkTheme) {
            if (mode === 'dark') {
                lightTheme.disabled = true;
                darkTheme.disabled = false;
            } else {
                lightTheme.disabled = false;
                darkTheme.disabled = true;
            }
        }
    }

    /**
     * 切换主题
     */
    toggleTheme() {
        const newMode = editorState.toggleTheme();
        StoreManager.saveTheme(newMode);
        this.applyTheme(newMode);
        this.updateThemeIcon(newMode);
    }

    /**
     * 更新主题图标
     */
    updateThemeIcon(mode) {
        const themeToggle = this.getElement('theme-toggle');
        const themeIcon = themeToggle?.querySelector('.theme-icon');
        if (themeIcon) {
            themeIcon.textContent = mode === 'dark' ? '☀️' : '🌙';
        }
    }

    /**
     * 初始化主题
     */
    initTheme() {
        const mode = StoreManager.loadTheme('light');
        editorState.setState({ theme: mode }, { silent: true });
        this.applyTheme(mode);
        this.updateThemeIcon(mode);
    }

    // ==================== 布局管理 ====================

    /**
     * 切换布局模式
     */
    toggleLayout() {
        const newLayout = editorState.toggleLayout();
        StoreManager.saveLayout(newLayout);
        this.applyLayout(newLayout);
    }

    /**
     * 应用布局
     */
    applyLayout(layout) {
        const container = this.getElement('md-container');
        if (!container) return;

        const layouts = ['layout-editor-only', 'layout-preview-only', 'layout-both'];
        
        // 移除所有布局类
        layouts.forEach(l => container.classList.remove(l));
        // 添加新布局类
        container.classList.add(layout);

        // 清除固定宽度类，让布局自适应
        const editorPane = this.getElement('md-editor-pane');
        const previewPane = this.getElement('md-preview-pane');
        if (editorPane) editorPane.classList.remove('fixed-width');
        if (previewPane) previewPane.classList.remove('fixed-width');

        // 清除内联样式
        if (editorPane) editorPane.style.width = '';
        if (previewPane) previewPane.style.width = '';

        // 显示提示
        const layoutNames = {
            'layout-editor-only': '仅编辑器',
            'layout-preview-only': '仅预览',
            'layout-both': '编辑器 + 预览'
        };
        this.showMessage(`已切换到：${layoutNames[layout]}`, 'info', 1500);
    }

    /**
     * 初始化布局
     */
    initLayout() {
        const savedLayout = StoreManager.loadLayout() || 'layout-both';
        editorState.setState({ layout: savedLayout }, { silent: true });
        this.applyLayout(savedLayout);
    }

    // ==================== 事件绑定 ====================
    
    /**
     * 绑定事件
     */
    bindEvents() {
        // 侧边栏按钮
        const sidebarButtons = {
            'md-toggle-left-sidebar': () => this.components.leftSidebar.toggle(),
            'md-toggle-right-sidebar': () => this.components.rightSidebar.toggle(),
            'md-close-left-sidebar': () => this.components.leftSidebar.toggle(),
            'md-close-right-sidebar': () => this.components.rightSidebar.toggle(),
            'md-sidebar-overlay': () => editorState.closeAllSidebars()
        };

        Object.entries(sidebarButtons).forEach(([id, handler]) => {
            const element = this.getElement(id);
            if (element) element.onclick = handler;
        });

        // 文档操作按钮
        const docButtons = {
            'md-new-file': () => this.components.documentList.createItem('file'),
            'md-new-folder': () => this.components.documentList.createItem('folder'),
            'md-rename-item': () => this.components.documentList.renameCurrentItem(),
            'md-delete-item': () => this.components.documentList.deleteCurrentItem(),
            'md-export-html': () => this.components.preview.exportHTML(),
            'md-export-md': () => this.components.preview.exportMarkdown(),
            'md-layout-toggle': () => this.toggleLayout(),
            'theme-toggle': () => this.toggleTheme()
        };

        Object.entries(docButtons).forEach(([id, handler]) => {
            const element = this.getElement(id);
            if (element) element.onclick = handler;
        });

        // 监听消息显示事件
        window.addEventListener('md:showMessage', (e) => {
            const { message, type, duration } = e.detail;
            this.showMessage(message, type, duration);
        });
    }

    // ==================== 初始化 ====================
    
    /**
     * 初始化
     */
    init() {
        if (this.isInitialized) return;

        // 加载保存的数据
        const documents = StoreManager.loadDocuments();
        const content = StoreManager.loadContent(MarkdownEditor.DEFAULT_CONTENT);
        const theme = StoreManager.loadTheme('light');
        const layout = StoreManager.loadLayout() || 'layout-both';

        // 先初始化组件（组件会订阅状态）
        this.initComponents();

        // 然后设置状态（组件会收到通知并渲染）
        editorState.setState({
            documents,
            content,
            theme,
            layout
        });

        // 保存文档到 StoreManager
        StoreManager.saveDocuments(documents);

        // 初始化主题和布局
        this.initTheme();
        this.initLayout();

        // 绑定事件
        this.bindEvents();

        // 设置分隔条
        this.setupDivider();

        // 应用侧边栏区块状态
        this.components.leftSidebar.applySectionStates();
        this.components.rightSidebar.applySectionStates();

        this.isInitialized = true;
    }
}
