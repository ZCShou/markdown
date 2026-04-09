const OAUTH_MESSAGE_TYPE = 'markdown-workspace-oauth';

function buildRedirectUri(provider) {
    const redirectUrl = new URL(window.location.href);
    redirectUrl.searchParams.set('workspace_oauth_callback', '1');
    redirectUrl.searchParams.set('provider', provider);
    redirectUrl.searchParams.delete('code');
    redirectUrl.searchParams.delete('state');
    return redirectUrl.toString();
}

function getProviderConfig(provider) {
    if (provider === 'github') {
        return {
            authorizeUrl: 'https://github.com/login/oauth/authorize',
            scope: 'repo'
        };
    }

    if (provider === 'gitee') {
        return {
            authorizeUrl: 'https://gitee.com/oauth/authorize',
            scope: 'projects pull_requests'
        };
    }

    throw new Error(`不支持的工作空间平台: ${provider}`);
}

function createOAuthState() {
    const bytes = new Uint8Array(16);
    window.crypto.getRandomValues(bytes);
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export function handleWorkspaceOAuthCallback() {
    const url = new URL(window.location.href);

    if (url.searchParams.get('workspace_oauth_callback') !== '1') {
        return false;
    }

    const error = url.searchParams.get('error');
    const payload = {
        type: OAUTH_MESSAGE_TYPE,
        provider: url.searchParams.get('provider') || '',
        code: url.searchParams.get('code') || '',
        state: url.searchParams.get('state') || '',
        error,
        errorDescription: url.searchParams.get('error_description') || ''
    };

    if (window.opener && !window.opener.closed) {
        window.opener.postMessage(payload, window.location.origin);
        window.close();
    } else {
        document.body.replaceChildren();

        const wrapper = document.createElement('div');
        wrapper.style.cssText =
            'display:flex;min-height:100vh;align-items:center;justify-content:center;font-family:sans-serif;background:#10161f;color:#e6edf3;padding:24px;text-align:center;';

        const content = document.createElement('div');
        const title = document.createElement('h1');
        title.style.cssText = 'margin:0 0 12px;';
        title.textContent = error ? '授权失败' : '授权成功';

        const description = document.createElement('p');
        description.style.cssText = 'margin:0;';
        description.textContent = error
            ? payload.errorDescription || error
            : '可以关闭这个窗口，返回主应用继续。';

        content.append(title, description);
        wrapper.appendChild(content);
        document.body.appendChild(wrapper);
    }

    return true;
}

export function startWorkspaceOAuth(provider, clientId) {
    if (!clientId) {
        throw new Error(`请先配置 ${provider === 'github' ? 'GitHub' : 'Gitee'} Client ID。`);
    }

    const state = createOAuthState();
    const redirectUri = buildRedirectUri(provider);
    const { authorizeUrl, scope } = getProviderConfig(provider);
    const authUrl = new URL(authorizeUrl);

    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('scope', scope);
    const popup = window.open(
        authUrl.toString(),
        `workspace-oauth-${provider}`,
        'width=720,height=820,resizable=yes,scrollbars=yes'
    );

    if (!popup) {
        throw new Error('无法打开授权窗口，请确认浏览器没有拦截弹窗。');
    }

    popup.focus();

    return new Promise((resolve, reject) => {
        let finished = false;

        const cleanup = () => {
            finished = true;
            window.removeEventListener('message', handleMessage);
            clearInterval(closeWatcher);
        };

        const handleMessage = event => {
            if (event.origin !== window.location.origin) return;
            if (event.data?.type !== OAUTH_MESSAGE_TYPE) return;

            if (event.data.state !== state) {
                cleanup();
                reject(new Error('OAuth 状态校验失败，请重新连接工作空间。'));
                return;
            }

            cleanup();

            if (event.data.error) {
                reject(new Error(event.data.errorDescription || event.data.error));
                return;
            }

            resolve({
                provider,
                code: event.data.code,
                state,
                redirectUri
            });
        };

        const closeWatcher = window.setInterval(() => {
            if (!finished && popup.closed) {
                cleanup();
                reject(new Error('授权窗口已关闭，连接已取消。'));
            }
        }, 500);

        window.addEventListener('message', handleMessage);
    });
}
