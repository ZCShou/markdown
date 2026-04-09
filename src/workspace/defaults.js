export function readWorkspaceEnv(name) {
    try {
        return import.meta?.env?.[name] || '';
    } catch {
        return '';
    }
}

export function createDefaultWorkspaceSettings() {
    return {
        provider: null,
        connected: false,
        autoSync: true,
        repoName: 'markdown-workspace',
        repoDescription: 'Markdown workspace data',
        repoPrivate: true,
        workspaceDir: 'stackedit-workspace',
        branch: 'main',
        owner: '',
        repoUrl: '',
        accessToken: '',
        accountName: '',
        lastSyncedAt: null,
        lastSyncStatus: 'idle',
        lastSyncError: ''
    };
}

export function sanitizeWorkspaceSettingsForPersistence(workspace = {}) {
    const defaults = createDefaultWorkspaceSettings();

    return {
        provider: workspace.provider ?? defaults.provider,
        autoSync: workspace.autoSync ?? defaults.autoSync,
        repoName: workspace.repoName ?? defaults.repoName,
        repoDescription: workspace.repoDescription ?? defaults.repoDescription,
        repoPrivate: workspace.repoPrivate ?? defaults.repoPrivate,
        workspaceDir: workspace.workspaceDir ?? defaults.workspaceDir,
        branch: workspace.branch ?? defaults.branch
    };
}

export function mergeWorkspaceSettings(defaultWorkspace, savedWorkspace = {}) {
    return {
        ...defaultWorkspace,
        ...sanitizeWorkspaceSettingsForPersistence(savedWorkspace)
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
