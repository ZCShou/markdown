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
 * 转义用于插入到 HTML 文本节点的字符（不转义 '>'）
 * @param {string} text - 要转义的文本
 * @returns {string} 转义后的文本
 */
export function escapeHtmlText(text) {
    const map = {
        '&': '&amp;',
        '<': '&lt;',
        '"': '&quot;',
        "'": '&#039;'
    };
    return text.replace(/[&<"']/g, m => map[m]);
}

/**
 * 解码 HTML 实体（用于从 HTML 片段提取纯文本）
 * @param {string} text
 * @returns {string}
 */
export function decodeHtmlEntities(text) {
    if (text === null || text === undefined) return '';
    const str = String(text);
    const map = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#039;': "'",
        '&#39;': "'"
    };
    // 只解码常见实体：足够用于 headings 文本提取，避免引入 DOM 与额外开销
    return str.replace(/&(amp|lt|gt|quot);|&#0?39;/g, m => map[m] || m);
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

/** 粘贴图片的最大尺寸限制（10MB） */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/** @type {Promise<IDBDatabase>|null} 共享的 DB 初始化 Promise，防止并发竞态 */
let dbPromise = null;

/**
 * Blob URL 缓存，值为 Promise<string|null>，防止并发请求对同一路径重复创建 Blob URL
 * @type {Map<string, Promise<string|null>>}
 */
const blobUrlCache = new Map();

/** MIME 类型到扩展名的映射 */
const MIME_TO_EXT = {
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/svg+xml': 'svg',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff'
};

/** 预计算的有效扩展名集合，避免每次调用时重建数组 */
const VALID_EXTS = new Set(Object.values(MIME_TO_EXT));

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
 * 格式: /imgs/<目录>/images/随机字符串.扩展名
 * @param {string} ext - 文件扩展名（不含点）
 * @param {string[]} directorySegments - 目录片段
 * @returns {string} 图片保存路径
 */
function sanitizePathSegment(segment) {
    return String(segment || '')
        .trim()
        .replace(/[\\/:*?"<>|]+/g, '-')
        .replace(/\s+/g, '-')
        .replace(/^\.+|\.+$/g, '')
        .slice(0, 64);
}

export function generateImagePath(ext = 'png', directorySegments = ['images']) {
    const safeSegments = directorySegments
        .map(sanitizePathSegment)
        .filter(Boolean);
    const pathSegments = safeSegments.length > 0 ? safeSegments : ['images'];
    return `/imgs/${pathSegments.join('/')}/${randomString(16)}.${ext}`;
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
 * 从 Markdown 内容中提取内部图片路径
 * @param {string} content - Markdown 内容
 * @returns {string[]} 内部图片路径数组
 */
export function extractImagePaths(content) {
    if (!content) return [];
    const regex = /!\[.*?\]\((\/imgs\/[^)]+)\)/g;
    const paths = [];
    let match;
    while ((match = regex.exec(content)) !== null) {
        paths.push(match[1]);
    }
    return paths;
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
export function getImageUrl(path) {
    // 将 Promise 本身存入缓存：并发调用会复用同一个 Promise，
    // 不会重复读 IDB 或创建多个 Blob URL
    if (blobUrlCache.has(path)) return blobUrlCache.get(path);

    const promise = initImageDB().then(
        database => new Promise((resolve, reject) => {
            const store = database.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME);
            const request = store.get(path);
            request.onsuccess = () => {
                const { result } = request;
                resolve(result ? URL.createObjectURL(result.blob) : null);
            };
            request.onerror = () => reject(new Error('Failed to get image'));
        })
    ).catch(err => {
        // 失败时移除缓存，允许下次重试
        blobUrlCache.delete(path);
        throw err;
    });

    blobUrlCache.set(path, promise);
    return promise;
}

/**
 * 获取图片的 Base64 Data URL（用于 HTML 导出）
 * @param {string} path - 图片路径
 * @returns {Promise<string|null>} Base64 Data URL 或 null
 */
export async function getImageAsBase64(path) {
    if (window.__TAURI__) {
        const { readFile } = window.__TAURI__.fs;
        const { join, resourceDir } = window.__TAURI__.path;
        const resourceDirPath = await resourceDir();
        const fullPath = await join(resourceDirPath, path.replace(/^\/?/, ''));
        const bytes = await readFile(fullPath);
        const ext = path.split('.').pop()?.toLowerCase() || 'png';
        const mimeTypes = {
            png: 'image/png',
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            gif: 'image/gif',
            webp: 'image/webp',
            svg: 'image/svg+xml',
            bmp: 'image/bmp',
            tiff: 'image/tiff'
        };
        const mime = mimeTypes[ext] || 'image/png';
        const base64 = btoa(String.fromCharCode(...bytes));
        return `data:${mime};base64,${base64}`;
    }

    const database = await initImageDB();
    return new Promise((resolve, reject) => {
        const store = database.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME);
        const request = store.get(path);
        request.onsuccess = async () => {
            const { result } = request;
            if (!result) {
                resolve(null);
                return;
            }
            try {
                const dataUrl = await blobToBase64(result.blob);
                resolve(dataUrl);
            } catch (e) {
                reject(e);
            }
        };
        request.onerror = () => reject(new Error('Failed to get image'));
    });
}

/**
 * 将 Blob 转换为 Base64 Data URL
 * @param {Blob} blob - Blob 对象
 * @returns {Promise<string>} Base64 Data URL
 */
function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Failed to read blob'));
        reader.readAsDataURL(blob);
    });
}

async function dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    return response.blob();
}

/**
 * 清理单个 Blob URL 缓存
 * @param {string} path - 图片路径
 */
export async function revokeBlobUrl(path) {
    const promise = blobUrlCache.get(path);
    if (promise) {
        blobUrlCache.delete(path);
        try {
            const url = await promise;
            if (url) URL.revokeObjectURL(url);
        } catch {
            // Promise 失败时无需撤销
        }
    }
}

/**
 * 清理所有 Blob URL 缓存（用于内存管理或应用卸载）
 */
export async function clearBlobUrlCache() {
    const promises = Array.from(blobUrlCache.values());
    blobUrlCache.clear();
    const urls = await Promise.allSettled(promises);
    for (const result of urls) {
        if (result.status === 'fulfilled' && result.value) {
            URL.revokeObjectURL(result.value);
        }
    }
}

/**
 * 从文件对象提取扩展名
 * 优先使用 MIME 类型，其次从文件名提取
 * @param {File} file - 文件对象
 * @returns {string} 扩展名（不含点）
 */
function extractExtension(file) {
    // 优先从 MIME 类型获取
    if (file.type && MIME_TO_EXT[file.type]) {
        return MIME_TO_EXT[file.type];
    }
    // 从文件名提取
    const name = file.name || '';
    const dotIndex = name.lastIndexOf('.');
    if (dotIndex > 0 && dotIndex < name.length - 1) {
        const ext = name.slice(dotIndex + 1).toLowerCase();
        if (VALID_EXTS.has(ext)) {
            return ext;
        }
    }
    // 默认 png
    return 'png';
}

/**
 * 处理粘贴的图片文件
 * @param {File} file - 图片文件
 * @returns {Promise<string>} 图片路径
 * @throws {Error} 图片过大时抛出错误
 */
export async function handlePastedImage(file, options = {}) {
    // 校验文件大小
    if (file.size > MAX_IMAGE_SIZE) {
        throw new Error(`图片大小超过限制（最大 ${MAX_IMAGE_SIZE / 1024 / 1024}MB）`);
    }

    const ext = extractExtension(file);
    const imagePath = generateImagePath(ext, options.directorySegments);

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

export async function saveImageFromDataUrl(path, dataUrl) {
    const blob = await dataUrlToBlob(dataUrl);

    if (window.__TAURI__) {
        const { writeFile, mkdir } = window.__TAURI__.fs;
        const { join, dirname, resourceDir } = window.__TAURI__.path;
        const resourceDirPath = await resourceDir();
        const fullPath = await join(resourceDirPath, path.slice(1));
        const dirPath = await dirname(fullPath);
        const arrayBuffer = await blob.arrayBuffer();

        try { await mkdir(dirPath, { recursive: true }); } catch { /* ignore */ }
        await writeFile(fullPath, new Uint8Array(arrayBuffer));
        return;
    }

    await saveImage(path, blob);
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

/**
 * 删除图片
 * @param {string} path - 图片路径
 * @returns {Promise<void>}
 */
export async function deleteImage(path) {
    // 清理 Blob URL 缓存
    await revokeBlobUrl(path);

    // Tauri 环境：从文件系统删除
    if (window.__TAURI__) {
        try {
            const { remove } = window.__TAURI__.fs;
            const { join, resourceDir } = window.__TAURI__.path;
            const resourceDirPath = await resourceDir();
            const fullPath = await join(resourceDirPath, path.replace(/^\/?/, ''));
            await remove(fullPath);
        } catch {
            // 文件可能不存在，忽略错误
        }
        return;
    }

    // Web 环境：从 IndexedDB 删除
    const database = await initImageDB();
    return new Promise((resolve, reject) => {
        const store = database.transaction([STORE_NAME], 'readwrite').objectStore(STORE_NAME);
        const request = store.delete(path);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(new Error('Failed to delete image'));
    });
}
