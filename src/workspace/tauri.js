let tauriInvoke = null;

export function isTauriRuntime() {
    return Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__);
}

export async function invokeTauri(command, args = {}) {
    if (!isTauriRuntime()) {
        throw new Error('当前运行环境不支持工作空间同步，请在 Tauri 桌面端中使用。');
    }

    if (!tauriInvoke) {
        const module = await import('@tauri-apps/api/core');
        tauriInvoke = module.invoke;
    }

    return tauriInvoke(command, args);
}
