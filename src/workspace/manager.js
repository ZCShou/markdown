import { getWorkspaceOAuthClientId } from './defaults.js';
import { startWorkspaceOAuth } from './oauth.js';
import { isTauriRuntime } from './tauri.js';
import { fetchWorkspaceOAuthClientId, invokeWorkspaceBackend } from './runtime.js';

export function buildWorkspaceSnapshot(state) {
    return {
        currentDocId: state.get('currentDocId'),
        documents: state.get('documents', true) || []
    };
}

export class WorkspaceManager {
    constructor(state) {
        this.state = state;
        this.syncTimer = null;
        this.documentsUnsubscribe = null;
        this.currentDocUnsubscribe = null;
        this.workspaceUnsubscribe = null;
        this.isSyncing = false;
        this.pendingSync = false;
        this.lastSyncedSnapshot = '';
    }

    init() {
        this.documentsUnsubscribe = this.state.subscribeTo('documents', () => {
            const workspace = this.state.get('workspace');
            if (!workspace?.connected || !workspace.autoSync) return;
            this.scheduleSync();
        });

        this.currentDocUnsubscribe = this.state.subscribeTo('currentDocId', () => {
            const workspace = this.state.get('workspace');
            if (!workspace?.connected || !workspace.autoSync) return;
            this.scheduleSync();
        });

        this.workspaceUnsubscribe = this.state.subscribeTo('workspace', workspace => {
            if (!workspace?.connected || !workspace.autoSync) {
                this.clearSyncTimer();
            }
        });
    }

    async connect(provider) {
        let clientId = getWorkspaceOAuthClientId(provider);

        if (!clientId && !isTauriRuntime()) {
            clientId = await fetchWorkspaceOAuthClientId(provider);
        }

        if (!clientId) {
            throw new Error(`缺少 ${provider === 'github' ? 'GitHub' : 'Gitee'} Client ID 配置。`);
        }

        this.state.updateWorkspaceConfig({
            lastSyncStatus: 'authorizing',
            lastSyncError: ''
        });

        const oauthResult = await startWorkspaceOAuth(provider, clientId);
        const tokenResult = await invokeWorkspaceBackend('workspace_exchange_oauth_code', {
            provider,
            code: oauthResult.code,
            redirectUri: oauthResult.redirectUri
        });

        const workspace = this.state.get('workspace');
        const repoResult = await invokeWorkspaceBackend('workspace_ensure_repo', {
            provider,
            accessToken: tokenResult.accessToken,
            repoName: workspace.repoName,
            repoDescription: workspace.repoDescription,
            repoPrivate: workspace.repoPrivate,
            workspaceDir: workspace.workspaceDir
        });

        this.state.updateWorkspaceConfig({
            provider,
            connected: true,
            accessToken: tokenResult.accessToken,
            accountName: tokenResult.login || '',
            owner: repoResult.owner,
            repoName: repoResult.repo,
            branch: repoResult.defaultBranch || workspace.branch || 'main',
            repoUrl: repoResult.htmlUrl,
            lastSyncStatus: 'connected',
            lastSyncError: ''
        });

        await this.syncNow();
    }

    disconnect() {
        const workspace = this.state.get('workspace');

        this.clearSyncTimer();
        this.pendingSync = false;
        this.lastSyncedSnapshot = '';
        this.state.updateWorkspaceConfig({
            connected: false,
            provider: null,
            accessToken: '',
            accountName: '',
            owner: '',
            repoUrl: '',
            lastSyncStatus: 'idle',
            lastSyncError: '',
            branch: workspace?.branch || 'main'
        });
    }

    scheduleSync(delay = 1500) {
        this.clearSyncTimer();
        this.syncTimer = window.setTimeout(() => {
            this.syncNow().catch(error => {
                console.error('Workspace auto sync failed:', error);
                this.state.updateWorkspaceConfig({
                    lastSyncStatus: 'error',
                    lastSyncError: error.message || '自动同步失败'
                });
                this.state.showNotification(error.message || '自动同步失败', 'error');
            });
        }, delay);
    }

    clearSyncTimer() {
        if (this.syncTimer) {
            clearTimeout(this.syncTimer);
            this.syncTimer = null;
        }
    }

    async syncNow() {
        const workspace = this.state.get('workspace');

        if (!workspace?.connected || !workspace.provider || !workspace.accessToken) {
            throw new Error('当前没有已连接的工作空间。');
        }

        if (this.isSyncing) {
            this.pendingSync = true;
            return;
        }

        this.isSyncing = true;
        this.clearSyncTimer();

        try {
            const snapshot = JSON.stringify(buildWorkspaceSnapshot(this.state), null, 2);

            if (snapshot === this.lastSyncedSnapshot) {
                this.state.updateWorkspaceConfig({
                    lastSyncStatus: 'synced',
                    lastSyncError: ''
                });
                return;
            }

            this.state.updateWorkspaceConfig({
                lastSyncStatus: 'syncing',
                lastSyncError: ''
            });

            await invokeWorkspaceBackend('workspace_sync_snapshot', {
                provider: workspace.provider,
                accessToken: workspace.accessToken,
                owner: workspace.owner,
                repo: workspace.repoName,
                branch: workspace.branch,
                workspaceDir: workspace.workspaceDir,
                snapshotJson: snapshot
            });

            this.lastSyncedSnapshot = snapshot;
            this.state.updateWorkspaceConfig({
                lastSyncedAt: new Date().toISOString(),
                lastSyncStatus: 'synced',
                lastSyncError: ''
            });
        } catch (error) {
            this.state.updateWorkspaceConfig({
                lastSyncStatus: 'error',
                lastSyncError: error.message || '同步失败'
            });
            throw error;
        } finally {
            this.isSyncing = false;
            if (this.pendingSync) {
                this.pendingSync = false;
                this.scheduleSync(300);
            }
        }
    }

    destroy() {
        this.clearSyncTimer();

        if (this.documentsUnsubscribe) {
            this.documentsUnsubscribe();
            this.documentsUnsubscribe = null;
        }

        if (this.currentDocUnsubscribe) {
            this.currentDocUnsubscribe();
            this.currentDocUnsubscribe = null;
        }

        if (this.workspaceUnsubscribe) {
            this.workspaceUnsubscribe();
            this.workspaceUnsubscribe = null;
        }
    }
}
