import {
    deleteImage,
    getImageAsBase64,
    saveImageFromDataUrl
} from '../utils/helpers.js';
import {
    getConnectedWorkspaceProviders,
    getWorkspaceOAuthClientId,
    getWorkspaceRemote
} from './defaults.js';
import {
    buildWorkspaceSnapshot as createWorkspaceSnapshot,
    collectWorkspaceAssetPaths,
    parseWorkspaceSnapshot
} from './snapshot.js';
import { startWorkspaceOAuth } from './oauth.js';
import { WorkspaceStorage } from './WorkspaceStorage.js';
import { isTauriRuntime } from './tauri.js';
import { fetchWorkspaceOAuthClientId, invokeWorkspaceBackend } from './runtime.js';

export class WorkspaceManager {
    static AUTO_SYNC_INTERVAL = 30000;

    constructor(state) {
        this.state = state;
        this.syncInterval = null;
        this.documentsUnsubscribe = null;
        this.currentDocUnsubscribe = null;
        this.workspaceUnsubscribe = null;
        this.beforeSyncHook = null;
        this.isSyncing = false;
        this.pendingSync = false;
        this.hasPendingAutoSync = false;
        this.isApplyingRemoteSnapshot = false;
    }

    init() {
        this.documentsUnsubscribe = this.state.subscribeTo('documents', () => {
            const workspace = this.state.get('workspace');
            if (
                !workspace?.autoSync ||
                this.isApplyingRemoteSnapshot ||
                this.getConnectedProviders(workspace).length === 0
            ) {
                return;
            }
            this.markPendingAutoSync();
        });

        this.currentDocUnsubscribe = this.state.subscribeTo('currentDocId', () => {
            const workspace = this.state.get('workspace');
            if (
                !workspace?.autoSync ||
                this.isApplyingRemoteSnapshot ||
                this.getConnectedProviders(workspace).length === 0
            ) {
                return;
            }
            this.markPendingAutoSync();
        });

        this.workspaceUnsubscribe = this.state.subscribeTo('workspace', workspace => {
            if (!workspace?.autoSync || this.getConnectedProviders(workspace).length === 0) {
                this.stopAutoSyncPolling();
                return;
            }

            this.startAutoSyncPolling();
        });

        const workspace = this.state.get('workspace');
        if (workspace?.autoSync && this.getConnectedProviders(workspace).length > 0) {
            this.startAutoSyncPolling();
        }
    }

    getConnectedProviders(workspace = this.state.get('workspace')) {
        return getConnectedWorkspaceProviders(workspace || {});
    }

    async persistWorkspaceAuths() {
        const workspace = this.state.get('workspace') || {};
        const auths = Object.fromEntries(
            this.getConnectedProviders(workspace).map(provider => {
                const remote = getWorkspaceRemote(workspace, provider);
                return [
                    provider,
                    {
                        provider,
                        connected: true,
                        accessToken: remote.accessToken,
                        accountName: remote.accountName,
                        owner: remote.owner,
                        repoUrl: remote.repoUrl
                    }
                ];
            })
        );

        await WorkspaceStorage.saveWorkspaceAuths(auths);
    }

    async connect(provider) {
        let clientId = getWorkspaceOAuthClientId(provider);

        if (!clientId && !isTauriRuntime()) {
            clientId = await fetchWorkspaceOAuthClientId(provider);
        }

        if (!clientId) {
            throw new Error(`缺少 ${provider === 'github' ? 'GitHub' : 'Gitee'} Client ID 配置。`);
        }

        this.state.updateWorkspaceRemoteConfig(provider, {
            lastSyncStatus: 'authorizing',
            lastSyncError: ''
        });

        try {
            const oauthResult = await startWorkspaceOAuth(provider, clientId);
            const tokenResult = await invokeWorkspaceBackend('workspace_exchange_oauth_code', {
                provider,
                code: oauthResult.code,
                redirectUri: oauthResult.redirectUri
            });

            const workspace = this.state.get('workspace');
            const remote = getWorkspaceRemote(workspace, provider);
            const repoResult = await invokeWorkspaceBackend('workspace_ensure_repo', {
                provider,
                accessToken: tokenResult.accessToken,
                repoName: remote.repoName,
                repoDescription: remote.repoDescription,
                repoPrivate: remote.repoPrivate,
                workspaceDir: remote.workspaceDir
            });

            this.state.updateWorkspaceRemoteConfig(provider, {
                connected: true,
                accessToken: tokenResult.accessToken,
                accountName: tokenResult.login || '',
                owner: repoResult.owner,
                repoName: repoResult.repo,
                branch: repoResult.defaultBranch || remote.branch || 'main',
                repoUrl: repoResult.htmlUrl,
                lastSyncStatus: 'connected',
                lastSyncError: ''
            });

            await this.persistWorkspaceAuths();

            this.hasPendingAutoSync = false;
            await this.syncNow();
        } catch (error) {
            this.state.updateWorkspaceRemoteConfig(provider, {
                lastSyncStatus: 'error',
                lastSyncError: error.message || '连接失败'
            });
            throw error;
        }
    }

    async disconnect(provider) {
        if (!provider) {
            return;
        }

        this.state.updateWorkspaceRemoteConfig(provider, {
            connected: false,
            accessToken: '',
            accountName: '',
            owner: '',
            repoUrl: '',
            lastSyncedAt: null,
            lastSyncStatus: 'idle',
            lastSyncError: ''
        });

        await this.persistWorkspaceAuths();

        if (this.getConnectedProviders(this.state.get('workspace')).length === 0) {
            this.stopAutoSyncPolling();
            this.pendingSync = false;
            this.hasPendingAutoSync = false;
        }
    }

    markPendingAutoSync() {
        this.hasPendingAutoSync = true;
    }

    startAutoSyncPolling() {
        if (this.syncInterval) {
            return;
        }

        this.syncInterval = window.setInterval(() => {
            if (!this.hasPendingAutoSync || this.isSyncing) {
                return;
            }

            this.syncNow().catch(error => {
                console.error('Workspace auto sync failed:', error);
                this.state.showNotification(error.message || '自动同步失败', 'error');
            });
        }, WorkspaceManager.AUTO_SYNC_INTERVAL);
    }

    stopAutoSyncPolling() {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
        }
    }

    setBeforeSyncHook(hook) {
        this.beforeSyncHook = typeof hook === 'function' ? hook : null;
    }

    async buildSnapshotPayload() {
        const documents = this.state.get('documents', true) || [];
        const currentDocId = this.state.get('currentDocId');
        const tombstones = this.state.get('workspaceTombstones', true) || [];
        const imagePaths = collectWorkspaceAssetPaths(documents);

        const assetResults = await Promise.allSettled(
            Array.from(imagePaths).map(async imagePath => ({
                path: imagePath,
                dataUrl: await getImageAsBase64(imagePath)
            }))
        );

        const assets = assetResults.flatMap(result => {
            if (result.status === 'fulfilled' && result.value.dataUrl) {
                return [result.value];
            }

            if (result.status === 'rejected') {
                console.warn('Failed to read workspace image asset:', result.reason);
            }

            return [];
        });

        return createWorkspaceSnapshot(documents, currentDocId, tombstones, assets);
    }

    async applyMergedSnapshot(snapshotJson) {
        if (!snapshotJson) return;

        const currentImagePaths = collectWorkspaceAssetPaths(this.state.get('documents', true) || []);

        const snapshot = parseWorkspaceSnapshot(snapshotJson);
        const nextImagePaths = collectWorkspaceAssetPaths(snapshot.documents || []);

        const restoreResults = await Promise.allSettled(
            (snapshot.assets || []).map(asset => saveImageFromDataUrl(asset.path, asset.dataUrl))
        );

        restoreResults.forEach((result, index) => {
            if (result.status === 'rejected') {
                const asset = snapshot.assets?.[index];
                console.warn('Failed to restore workspace image asset:', asset?.path, result.reason);
            }
        });

        const removedImagePaths = Array.from(currentImagePaths).filter(
            imagePath => !nextImagePaths.has(imagePath)
        );
        await Promise.allSettled(removedImagePaths.map(imagePath => deleteImage(imagePath)));

        this.isApplyingRemoteSnapshot = true;
        try {
            this.state.applyWorkspaceSnapshot(snapshot, { preserveCurrentDocument: true });
        } finally {
            this.isApplyingRemoteSnapshot = false;
        }
    }

    async syncProvider(provider, snapshotJson) {
        const workspace = this.state.get('workspace');
        const remote = getWorkspaceRemote(workspace, provider);

        if (!remote?.connected || !remote.accessToken) {
            throw new Error(`${provider === 'github' ? 'GitHub' : 'Gitee'} 尚未连接。`);
        }

        this.state.updateWorkspaceRemoteConfig(provider, {
            lastSyncStatus: 'syncing',
            lastSyncError: ''
        });

        const syncResult = await invokeWorkspaceBackend('workspace_sync_snapshot', {
            provider,
            accessToken: remote.accessToken,
            owner: remote.owner,
            repo: remote.repoName,
            branch: remote.branch,
            workspaceDir: remote.workspaceDir,
            snapshotJson
        });

        const mergedSnapshotJson = syncResult?.snapshotJson || snapshotJson;
        if (mergedSnapshotJson !== snapshotJson) {
            await this.applyMergedSnapshot(mergedSnapshotJson);
        }

        this.state.updateWorkspaceRemoteConfig(provider, {
            lastSyncedAt: new Date().toISOString(),
            lastSyncStatus: 'synced',
            lastSyncError: ''
        });

        return mergedSnapshotJson;
    }

    async syncNow(provider = null) {
        const workspace = this.state.get('workspace');
        const connectedProviders = provider
            ? [provider]
            : this.getConnectedProviders(workspace);

        if (connectedProviders.length === 0) {
            throw new Error('当前没有已连接的远程备份工作空间。');
        }

        if (this.isSyncing) {
            this.pendingSync = true;
            return;
        }

        this.isSyncing = true;
        let currentProvider = null;

        try {
            if (this.beforeSyncHook) {
                await this.beforeSyncHook();
            }

            let snapshotJson = JSON.stringify(await this.buildSnapshotPayload(), null, 2);

            for (const remoteProvider of connectedProviders) {
                currentProvider = remoteProvider;
                // eslint-disable-next-line no-await-in-loop
                snapshotJson = await this.syncProvider(remoteProvider, snapshotJson);
            }

            this.hasPendingAutoSync = false;
        } catch (error) {
            if (currentProvider) {
                this.state.updateWorkspaceRemoteConfig(currentProvider, {
                    lastSyncStatus: 'error',
                    lastSyncError: error.message || '同步失败'
                });
            }
            throw error;
        } finally {
            this.isSyncing = false;
            if (this.pendingSync) {
                this.pendingSync = false;
                this.hasPendingAutoSync = true;
            }
        }
    }

    destroy() {
        this.stopAutoSyncPolling();

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
