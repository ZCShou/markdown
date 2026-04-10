export function readWorkspaceEnv(name) {
    try {
        return import.meta?.env?.[name] || '';
    } catch {
        return '';
    }
}

export const WORKSPACE_REMOTE_PROVIDERS = ['github', 'gitee'];
const DEFAULT_WORKSPACE_REMOTE_CONFIG = {
    connected: false,
    repoName: 'markdown-workspace',
    repoDescription: 'Markdown workspace data',
    repoPrivate: true,
    workspaceDir: 'markdown-workspace',
    branch: 'main',
    owner: '',
    repoUrl: '',
    accessToken: '',
    accountName: '',
    lastSyncedAt: null,
    lastSyncStatus: 'idle',
    lastSyncError: ''
};

export function isRemoteWorkspaceProvider(provider) {
    return WORKSPACE_REMOTE_PROVIDERS.includes(provider);
}

export function createDefaultWorkspaceRemote(provider) {
    return {
        provider,
        ...DEFAULT_WORKSPACE_REMOTE_CONFIG
    };
}

export function createDefaultWorkspaceSettings() {
    return {
        provider: 'local',
        autoSync: true,
        remotes: Object.fromEntries(
            WORKSPACE_REMOTE_PROVIDERS.map(provider => [
                provider,
                createDefaultWorkspaceRemote(provider)
            ])
        )
    };
}

export function getWorkspaceRemote(workspace = {}, provider) {
    if (!isRemoteWorkspaceProvider(provider)) {
        return null;
    }

    return {
        ...createDefaultWorkspaceRemote(provider),
        ...(workspace?.remotes?.[provider] || {})
    };
}

export function getConnectedWorkspaceProviders(workspace = {}) {
    return WORKSPACE_REMOTE_PROVIDERS.filter(
        provider => getWorkspaceRemote(workspace, provider)?.connected
    );
}

function sanitizeRemoteWorkspaceForPersistence(provider, remote = {}) {
    const defaults = createDefaultWorkspaceRemote(provider);

    return {
        repoName: remote.repoName ?? defaults.repoName,
        repoDescription: remote.repoDescription ?? defaults.repoDescription,
        repoPrivate: remote.repoPrivate ?? defaults.repoPrivate,
        workspaceDir: remote.workspaceDir ?? defaults.workspaceDir,
        branch: remote.branch ?? defaults.branch
    };
}

export function sanitizeWorkspaceSettingsForPersistence(workspace = {}) {
    const defaults = createDefaultWorkspaceSettings();
    const provider =
        workspace.provider === 'local' || isRemoteWorkspaceProvider(workspace.provider)
            ? workspace.provider
            : defaults.provider;
    const remotes = Object.fromEntries(
        WORKSPACE_REMOTE_PROVIDERS.map(remoteProvider => [
            remoteProvider,
            sanitizeRemoteWorkspaceForPersistence(
                remoteProvider,
                workspace?.remotes?.[remoteProvider]
            )
        ])
    );

    return {
        provider,
        autoSync: workspace.autoSync ?? defaults.autoSync,
        remotes
    };
}

export function mergeWorkspaceSettings(defaultWorkspace, savedWorkspace = {}) {
    const sanitized = sanitizeWorkspaceSettingsForPersistence(savedWorkspace);
    const remotes = Object.fromEntries(
        WORKSPACE_REMOTE_PROVIDERS.map(provider => [
            provider,
            {
                ...defaultWorkspace.remotes[provider],
                ...(sanitized.remotes?.[provider] || {})
            }
        ])
    );

    return {
        ...defaultWorkspace,
        provider: sanitized.provider ?? defaultWorkspace.provider,
        autoSync: sanitized.autoSync ?? defaultWorkspace.autoSync,
        remotes
    };
}

export function getWorkspaceOAuthClientId(provider) {
    if (provider === 'github') {
        return readWorkspaceEnv('VITE_GITHUB_CLIENT_ID');
    }

    if (provider === 'gitee') {
        return readWorkspaceEnv('VITE_GITEE_CLIENT_ID');
    }

    return '';
}
