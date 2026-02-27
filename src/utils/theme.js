/**
 * 主题工具类 - 统一管理主题相关逻辑
 * 避免在多个组件中重复实现主题解析逻辑
 */

/**
 * 解析暗色模式设置
 * @param {Object} interfaceConfig - 界面配置
 * @param {string} [interfaceConfig.theme] - 主题模式 ('dark' | 'light' | 'auto')
 * @returns {boolean} 是否为暗色模式
 */
export function resolveDarkMode(interfaceConfig = {}) {
    const { theme } = interfaceConfig;
    if (theme === 'dark') return true;
    if (theme === 'light') return false;

    // 'auto' 或未设置时，根据 DOM 属性判断
    return document.documentElement.getAttribute('data-mode') === 'dark';
}

/**
 * 应用主题到 DOM
 * @param {string} mode - 主题模式 ('dark' | 'light' | 'auto')
 */
export function applyTheme(mode) {
    const html = document.documentElement;
    const isDark = mode === 'dark' || (mode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    html.dataset.mode = isDark ? 'dark' : 'light';

    // 更新主题颜色
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
        themeColorMeta.content = isDark ? '#1e1e1e' : '#f0f0f0';
    }
}

/**
 * 监听系统主题变化
 * @param {Function} callback - 主题变化时的回调函数
 * @returns {Function} 取消监听的函数
 */
export function watchSystemTheme(callback) {
    const matcher = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => callback(matcher.matches ? 'dark' : 'light');
    
    matcher.addEventListener('change', handler);
    
    return () => matcher.removeEventListener('change', handler);
}
