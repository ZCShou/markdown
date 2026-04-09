import { isTauriRuntime, invokeTauri } from './tauri.js';

let bridgeAvailability = null;
let bridgeAvailabilityPromise = null;

function readEnv(name) {
    try {
        return import.meta?.env?.[name] || '';
    } catch {
        return '';
    }
}

export function getWorkspaceBridgeBaseUrl() {
    const configured = readEnv('VITE_WORKSPACE_BRIDGE_BASE_URL').trim();
    if (configured) {
        return configured.replace(/\/+$/, '');
    }
    return '';
}

export async function checkWorkspaceBridgeAvailability(force = false) {
    if (isTauriRuntime()) {
        bridgeAvailability = true;
        return true;
    }

    if (!force && bridgeAvailability !== null) {
        return bridgeAvailability;
    }

    if (!force && bridgeAvailabilityPromise) {
        return bridgeAvailabilityPromise;
    }

    const baseUrl = getWorkspaceBridgeBaseUrl();
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 1500);

    bridgeAvailabilityPromise = fetch(`${baseUrl}/api/workspace/health`, {
        signal: controller.signal
    })
        .then(response => response.ok)
        .catch(() => false)
        .finally(() => {
            clearTimeout(timer);
        });

    bridgeAvailability = await bridgeAvailabilityPromise;
    bridgeAvailabilityPromise = null;
    return bridgeAvailability;
}

export async function fetchWorkspaceOAuthClientId(provider) {
    const baseUrl = getWorkspaceBridgeBaseUrl();
    const response = await fetch(
        `${baseUrl}/api/workspace/oauth/config?provider=${encodeURIComponent(provider)}`
    );

    const contentType = response.headers.get('content-type') || '';
    const result = contentType.includes('application/json')
        ? await response.json()
        : { message: await response.text() };

    if (!response.ok) {
        throw new Error(result?.message || '读取 OAuth 配置失败');
    }

    return result?.clientId || '';
}

async function invokeBrowserBridge(path, payload) {
    const baseUrl = getWorkspaceBridgeBaseUrl();

    if (!baseUrl) {
        // 默认走同源 /api/workspace，由 Vite proxy 或部署时的后端路由承接
    }

    let response;
    try {
        response = await fetch(`${baseUrl}${path}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });
    } catch {
        throw new Error(
            '浏览器端 OAuth bridge 服务不可用，请直接运行 `npm run dev`，或配置可访问的 `VITE_WORKSPACE_BRIDGE_BASE_URL`。'
        );
    }

    const contentType = response.headers.get('content-type') || '';
    const result = contentType.includes('application/json')
        ? await response.json()
        : { message: await response.text() };

    if (!response.ok) {
        throw new Error(result?.message || result?.error || '工作空间桥接服务调用失败');
    }

    return result;
}

export function invokeWorkspaceBackend(command, payload = {}) {
    if (isTauriRuntime()) {
        return invokeTauri(command, payload);
    }

    const routeMap = {
        workspace_exchange_oauth_code: '/api/workspace/oauth/exchange',
        workspace_ensure_repo: '/api/workspace/repo/ensure',
        workspace_sync_snapshot: '/api/workspace/snapshot/sync'
    };

    const route = routeMap[command];
    if (!route) {
        throw new Error(`未知的工作空间后端命令: ${command}`);
    }

    return invokeBrowserBridge(route, payload);
}
