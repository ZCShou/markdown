import {
    deleteImage,
    extractImagePaths,
    getImageAsBase64,
    saveImageFromDataUrl
} from '../utils/helpers.js';
import { getWorkspaceOAuthClientId } from './defaults.js';
import {
    buildWorkspaceSnapshot as createWorkspaceSnapshot,
    collectWorkspaceAssetPaths,
    parseWorkspaceSnapshot
} from './snapshot.js';
import { startWorkspaceOAuth } from './oauth.js';
import { WorkspaceStorage } from './storage.js';
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
        this.isSyncing = false;
        this.pendingSync = false;
        this.hasPendingAutoSync = false;
        this.isApplyingRemoteSnapshot = false;
        this.lastSyncedSnapshot = '';
    }

    init() {
        this.documentsUnsubscribe = this.state.subscribeTo('documents', () => {
            const workspace = this.state.get('workspace');
            if (!workspace?.connected || !workspace.autoSync || this.isApplyingRemoteSnapshot) return;
            this.markPendingAutoSync();
        });

        this.currentDocUnsubscribe = this.state.subscribeTo('currentDocId', () => {
            const workspace = this.state.get('workspace');
            if (!workspace?.connected || !workspace.autoSync || this.isApplyingRemoteSnapshot) return;
            this.markPendingAutoSync();
        });

        this.workspaceUnsubscribe = this.state.subscribeTo('workspace', workspace => {
            if (!workspace?.connected || !workspace.autoSync) {
                this.stopAutoSyncPolling();
                return;
            }

            this.startAutoSyncPolling();
        });

        const workspace = this.state.get('workspace');
        if (workspace?.connected && workspace.autoSync) {
            this.startAutoSyncPolling();
        }
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

        WorkspaceStorage.saveWorkspaceAuth({
            provider,
            connected: true,
            accessToken: tokenResult.accessToken,
            accountName: tokenResult.login || '',
            owner: repoResult.owner,
            repoUrl: repoResult.htmlUrl
        });

        this.hasPendingAutoSync = false;
        await this.syncNow();
    }

    disconnect() {
        const workspace = this.state.get('workspace');

        this.stopAutoSyncPolling();
        this.pendingSync = false;
        this.hasPendingAutoSync = false;
        this.lastSyncedSnapshot = '';
        WorkspaceStorage.clearWorkspaceAuth();
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
                this.state.updateWorkspaceConfig({
                    lastSyncStatus: 'error',
                    lastSyncError: error.message || '自动同步失败'
                });
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
            this.state.applyWorkspaceSnapshot(snapshot);
        } finally {
            this.isApplyingRemoteSnapshot = false;
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

        try {
            const snapshot = JSON.stringify(await this.buildSnapshotPayload(), null, 2);

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

            const syncResult = await invokeWorkspaceBackend('workspace_sync_snapshot', {
                provider: workspace.provider,
                accessToken: workspace.accessToken,
                owner: workspace.owner,
                repo: workspace.repoName,
                branch: workspace.branch,
                workspaceDir: workspace.workspaceDir,
                snapshotJson: snapshot
            });

            this.lastSyncedSnapshot = syncResult?.snapshotJson || snapshot;
            this.hasPendingAutoSync = false;
            if (syncResult?.snapshotJson) {
                await this.applyMergedSnapshot(syncResult.snapshotJson);
            }
            WorkspaceStorage.saveWorkspaceAuth({
                provider: workspace.provider,
                connected: true,
                accessToken: workspace.accessToken,
                accountName: workspace.accountName,
                owner: workspace.owner,
                repoUrl: workspace.repoUrl
            });
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
