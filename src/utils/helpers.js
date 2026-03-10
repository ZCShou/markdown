/**
 * 通用工具函数
 *
 * @example
 * ```js
 * import { debounce, formatDate } from '../utils/helpers.js';
 *
 * const debouncedFn = debounce(() => console.log('Hello'), 300);
 * const dateStr = formatDate(new Date());
 * ```
 */

/**
 * 防抖函数
 * @template {Function} T
 * @param {T} func - 要防抖的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {T} 防抖后的函数
 */
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * 节流函数
 * @template {Function} T
 * @param {T} func - 要节流的函数
 * @param {number} limit - 时间限制（毫秒）
 * @returns {T} 节流后的函数
 */
export function throttle(func, limit) {
    let inThrottle;
    return function executedFunction(...args) {
        if (!inThrottle) {
            func(...args);
            inThrottle = true;
            setTimeout(() => (inThrottle = false), limit);
        }
    };
}

/**
 * 格式化日期
 * @param {Date|string} date - 日期对象或字符串
 * @param {string} format - 格式化模板
 * @returns {string} 格式化后的日期字符串
 */
export function formatDate(date, format = 'YYYY-MM-DD HH:mm:ss') {
    const d = date instanceof Date ? date : new Date(date);

    if (isNaN(d.getTime())) {
        return '';
    }

    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');

    return format
        .replace('YYYY', year)
        .replace('MM', month)
        .replace('DD', day)
        .replace('HH', hours)
        .replace('mm', minutes)
        .replace('ss', seconds);
}

/**
 * 生成唯一 ID
 * @param {string} prefix - ID 前缀
 * @returns {string} 唯一 ID
 */
export function generateId(prefix = 'id') {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 深拷贝对象
 * @template T
 * @param {T} obj - 要拷贝的对象
 * @returns {T} 拷贝后的对象
 */
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }

    if (obj instanceof Date) {
        return new Date(obj.getTime());
    }

    if (obj instanceof Array) {
        return obj.map(item => deepClone(item));
    }

    if (obj instanceof Object) {
        const clonedObj = {};
        for (const key in obj) {
            if (Object.hasOwn(obj, key)) {
                clonedObj[key] = deepClone(obj[key]);
            }
        }
        return clonedObj;
    }
}

/**
 * 检查是否为空值
 * @param {any} value - 要检查的值
 * @returns {boolean} 是否为空
 */
export function isEmpty(value) {
    if (value === null || value === undefined) {
        return true;
    }

    if (typeof value === 'string') {
        return value.trim().length === 0;
    }

    if (Array.isArray(value)) {
        return value.length === 0;
    }

    if (typeof value === 'object') {
        return Object.keys(value).length === 0;
    }

    return false;
}

/**
 * 安全地解析 JSON
 * @param {string} jsonStr - JSON 字符串
 * @param {any} defaultValue - 默认值
 * @returns {any} 解析后的对象或默认值
 */
export function safeParseJSON(jsonStr, defaultValue = null) {
    try {
        return JSON.parse(jsonStr);
    } catch (e) {
        console.warn('JSON 解析失败:', e);
        return defaultValue;
    }
}

/**
 * 截断文本
 * @param {string} text - 要截断的文本
 * @param {number} maxLength - 最大长度
 * @param {string} suffix - 后缀（默认为 '...'）
 * @returns {string} 截断后的文本
 */
export function truncateText(text, maxLength, suffix = '...') {
    if (text.length <= maxLength) {
        return text;
    }
    return text.substring(0, maxLength - suffix.length) + suffix;
}

/**
 * 转义 HTML 特殊字符
 * @param {string} text - 要转义的文本
 * @returns {string} 转义后的文本
 */
export function escapeHtml(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
}

/**
 * 检测浏览器是否支持某个特性
 * @param {string} feature - 特性名称
 * @returns {boolean} 是否支持
 */
export function supportsFeature(feature) {
    switch (feature) {
        case 'indexedDB':
            try {
                return 'indexedDB' in window;
            } catch {
                return false;
            }
        default:
            return false;
    }
}

// ==================== 图片存储管理 ====================

const DB_NAME = 'markdown-editor-images';
const STORE_NAME = 'images';
const DB_VERSION = 1;

/** @type {Promise<IDBDatabase>|null} 共享的 DB 初始化 Promise，防止并发竞态 */
let dbPromise = null;

/** @type {Map<string, string>} Blob URL 缓存，避免重复创建和泄漏 */
const blobUrlCache = new Map();

/**
 * 生成随机字符串
 * @param {number} length - 字符串长度
 * @returns {string}
 */
function randomString(length = 16) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return Array.from(bytes, b => chars[b % chars.length]).join('');
}

/**
 * 生成图片保存路径
 * 格式: /imgs/YYYY-MM-DD/随机字符串.扩展名
 * @param {string} ext - 文件扩展名（不含点）
 * @returns {string} 图片保存路径
 */
export function generateImagePath(ext = 'png') {
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    return `/imgs/${dateStr}/${randomString(16)}.${ext}`;
}

/**
 * 检查是否为内部图片路径
 * @param {string} path - 路径
 * @returns {boolean}
 */
export function isInternalImagePath(path) {
    return path.startsWith('/imgs/') || path.startsWith('imgs/');
}

/**
 * 初始化 IndexedDB
 * @returns {Promise<IDBDatabase>}
 */
function initImageDB() {
    if (!dbPromise) {
        dbPromise = new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = () => {
                dbPromise = null; // 失败时重置，允许下次重试
                reject(new Error('Failed to open IndexedDB'));
            };
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
                const database = event.target.result;
                if (!database.objectStoreNames.contains(STORE_NAME)) {
                    database.createObjectStore(STORE_NAME, { keyPath: 'path' });
                }
            };
        });
    }
    return dbPromise;
}

/**
 * 保存图片到 IndexedDB
 * @param {string} path - 图片路径
 * @param {Blob} blob - 图片数据
 * @returns {Promise<void>}
 */
export async function saveImage(path, blob) {
    const database = await initImageDB();
    return new Promise((resolve, reject) => {
        const store = database.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME);
        const request = store.put({ path, blob, timestamp: Date.now() });
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('Failed to save image'));
    });
}

/**
 * 获取图片的 Blob URL
 * @param {string} path - 图片路径
 * @returns {Promise<string|null>}
 */
export async function getImageUrl(path) {
    // 命中缓存直接返回，避免重复读 IDB 和创建 Blob URL
    if (blobUrlCache.has(path)) return blobUrlCache.get(path);

    const database = await initImageDB();
    return new Promise((resolve, reject) => {
        const store = database.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME);
        const request = store.get(path);
        request.onsuccess = () => {
            const result = request.result;
            if (result) {
                const url = URL.createObjectURL(result.blob);
                blobUrlCache.set(path, url);
                resolve(url);
            } else {
                resolve(null);
            }
        };
        request.onerror = () => reject(new Error('Failed to get image'));
    });
}

/**
 * 处理粘贴的图片文件
 * @param {File} file - 图片文件
 * @returns {Promise<string>} 图片路径
 */
export async function handlePastedImage(file) {
    const ext = file.name.split('.').pop() || 'png';
    const imagePath = generateImagePath(ext);

    // Tauri 环境：保存到文件系统
    if (window.__TAURI__) {
        const { writeFile, mkdir } = window.__TAURI__.fs;
        const { join, dirname, resourceDir } = window.__TAURI__.path;

        const arrayBuffer = await file.arrayBuffer();
        const resourceDirPath = await resourceDir();
        const fullPath = await join(resourceDirPath, imagePath.slice(1));
        // 使用 Tauri 的 dirname API，兼容 Windows 反斜杠路径
        const dirPath = await dirname(fullPath);

        try { await mkdir(dirPath, { recursive: true }); } catch { /* ignore */ }
        await writeFile(fullPath, new Uint8Array(arrayBuffer));
        return imagePath;
    }

    // Web 环境：保存到 IndexedDB
    await saveImage(imagePath, file);
    return imagePath;
}

/**
 * 从剪贴板数据中提取图片文件
 * @param {DataTransfer} clipboardData - 剪贴板数据
 * @returns {File|null} 图片文件或 null
 */
export function extractImageFromClipboard(clipboardData) {
    if (!clipboardData) return null;
    for (const item of clipboardData.items) {
        if (item.type.startsWith('image/')) {
            return item.getAsFile();
        }
    }
    return null;
}
