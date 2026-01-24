/**
 * 自定义通用对话框组件
 * 支持确认对话框、警告对话框、自定义对话框
 * 
 * @example
 * ```js
 * // 确认对话框
 * const confirmed = await Dialog.confirm('确定要删除吗？');
 * 
 * // 警告对话框
 * await Dialog.alert('操作成功！');
 * 
 * // 自定义对话框
 * const result = await Dialog.show({
 *     title: '自定义标题',
 *     message: '自定义内容',
 *     buttons: [
 *         { text: '取消', value: 'cancel', type: 'secondary' },
 *         { text: '确定', value: 'confirm', type: 'primary' }
 *     ]
 * });
 * ```
 */

export class Dialog {
    /**
     * 确认对话框
     * @param {string} message - 消息内容
     * @param {Object} options - 配置选项
     * @param {string} options.title - 对话框标题
     * @param {string} options.confirmText - 确认按钮文本
     * @param {string} options.cancelText - 取消按钮文本
     * @param {string} options.type - 对话框类型 'warning' | 'danger' | 'info'
     * @returns {Promise<boolean>} 是否确认
     */
    static async confirm(message, options = {}) {
        const {
            title = '确认',
            confirmText = '确定',
            cancelText = '取消',
            type = 'info'
        } = options;

        const result = await this.show({
            title,
            message,
            type,
            buttons: [
                { text: confirmText, value: true, type: type === 'danger' ? 'danger' : 'primary' },
                { text: cancelText, value: false, type: 'secondary' }
            ]
        });

        return result === true;
    }

    /**
     * 警告对话框
     * @param {string} message - 消息内容
     * @param {Object} options - 配置选项
     * @param {string} options.title - 对话框标题
     * @param {string} options.buttonText - 按钮文本
     * @param {string} options.type - 对话框类型 'success' | 'warning' | 'error' | 'info'
     * @returns {Promise<void>}
     */
    static async alert(message, options = {}) {
        const {
            title = '提示',
            buttonText = '确定',
            type = 'info'
        } = options;

        await this.show({
            title,
            message,
            type,
            buttons: [
                { text: buttonText, value: true, type: 'primary' }
            ]
        });
    }

    /**
     * 显示自定义对话框
     * @param {Object} options - 配置选项
     * @param {string} options.title - 对话框标题
     * @param {string} options.message - 消息内容（支持 HTML）
     * @param {string} options.type - 对话框类型 'info' | 'success' | 'warning' | 'error' | 'danger'
     * @param {Array} options.buttons - 按钮配置
     * @param {string} options.width - 对话框宽度
     * @param {boolean} options.closeOnOverlay - 点击遮罩是否关闭
     * @param {boolean} options.closeOnEscape - 按 ESC 是否关闭
     * @returns {Promise<any>} 点击按钮的值
     */
    static async show(options = {}) {
        const {
            title = '对话框',
            message = '',
            type = 'info',
            buttons = [{ text: '确定', value: true, type: 'primary' }],
            width = '400px',
            closeOnOverlay = false,
            closeOnEscape = true
        } = options;

        return new Promise((resolve) => {
            // 创建遮罩层
            const overlay = document.createElement('div');
            overlay.classList.add('md-dialog-overlay');
            
            // 创建对话框
            const dialog = document.createElement('div');
            dialog.classList.add('md-dialog', `md-dialog-${type}`);
            // 使用 CSS 类替代直接设置宽度
            if (width !== '400px') {
                dialog.style.setProperty('--dialog-width', width);
            }
            
            // 图标映射
            const iconMap = {
                'info': 'info',
                'success': 'check',
                'warning': 'warning',
                'error': 'error',
                'danger': 'error'
            };
            
            const iconName = iconMap[type] || 'info';
            
            // 构建对话框 HTML
            dialog.innerHTML = `
                <div class="md-dialog-header">
                    <div class="md-dialog-header-left">
                        <i class="codicon codicon-${iconName} md-dialog-icon"></i>
                        <h3 class="md-dialog-title">${this.escapeHtml(title)}</h3>
                    </div>
                </div>
                <div class="md-dialog-body">
                    <div class="md-dialog-message">${message}</div>
                </div>
                <div class="md-dialog-footer">
                    ${buttons.map((btn, index) => `
                        <button class="md-btn md-btn-${btn.type || 'secondary'}${index === buttons.length - 1 ? ' md-btn-primary' : ''}" data-value="${this.escapeHtml(String(btn.value))}">
                            ${this.escapeHtml(btn.text)}
                        </button>
                    `).join('')}
                </div>
            `;
            
            // 添加到 DOM
            overlay.appendChild(dialog);
            document.body.appendChild(overlay);
            
            // 触发重排以启动动画
            overlay.offsetHeight;
            overlay.classList.add('md-dialog-overlay-show');
            
            // 聚焦第一个按钮
            const firstButton = dialog.querySelector('button');
            if (firstButton) {
                setTimeout(() => firstButton.focus(), 100);
            }
            
            // 处理按钮点击
            const handleButtonClick = (e) => {
                const button = e.target.closest('.md-dialog-footer button');
                if (button) {
                    const value = button.dataset.value;
                    closeDialog(value === 'true' ? true : value === 'false' ? false : value);
                }
            };
            
            // 处理遮罩点击
            const handleOverlayClick = (e) => {
                if (e.target === overlay && closeOnOverlay) {
                    closeDialog(null);
                }
            };
            
            // 处理 ESC 键
            const handleKeyDown = (e) => {
                if (e.key === 'Escape' && closeOnEscape) {
                    closeDialog(null);
                }
            };
            
            // 关闭对话框
            const closeDialog = (result) => {
                overlay.classList.remove('md-dialog-overlay-show');
                
                // 等待动画结束
                setTimeout(() => {
                    overlay.removeEventListener('click', handleOverlayClick);
                    dialog.removeEventListener('click', handleButtonClick);
                    document.removeEventListener('keydown', handleKeyDown);
                    document.body.removeChild(overlay);
                    resolve(result);
                }, 200);
            };
            
            // 绑定事件
            overlay.addEventListener('click', handleOverlayClick);
            dialog.addEventListener('click', handleButtonClick);
            document.addEventListener('keydown', handleKeyDown);
        });
    }
    
    /**
     * 转义 HTML
     * @param {string} text - 要转义的文本
     * @returns {string} 转义后的 HTML 字符串
     */
    static escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}
