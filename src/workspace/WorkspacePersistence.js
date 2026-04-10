import { sanitizeWorkspaceSettingsForPersistence } from './defaults.js';
import { WorkspaceStorage } from './WorkspaceStorage.js';

export class WorkspacePersistence {
    static DEFAULT_CONFIG = {
        documents: { debounce: 300 },
        currentDocId: { immediate: true },
        editor: { debounce: 300 },
        interface: { debounce: 300 },
        export: { debounce: 300 },
        workspace: { debounce: 300 },
        workspaceTombstones: { debounce: 300 }
    };

    static PERSIST_HANDLERS = {
        documents: state => WorkspaceStorage.saveDocuments(state.documents),
        currentDocId: state => WorkspaceStorage.saveCurrentDocId(state.currentDocId),
        workspaceTombstones: state =>
            WorkspaceStorage.saveWorkspaceTombstones(state.workspaceTombstones),
        settings: state =>
            WorkspaceStorage.saveSettings({
                editor: state.editor,
                interface: state.interface,
                export: state.export,
                workspace: sanitizeWorkspaceSettingsForPersistence(state.workspace)
            })
    };

    #stateRef = null;
    #config = {};
    #debounceTimer = null;
    #pendingKeys = new Set();
    #isActive = false;

    constructor(getStateFn) {
        this.#stateRef = getStateFn;
        this.configure();
    }

    configure(config = {}) {
        this.#config = { ...WorkspacePersistence.DEFAULT_CONFIG, ...config };
        return this;
    }

    start() {
        this.#isActive = true;
    }

    stop() {
        this.#isActive = false;
        this.#clearTimer();
    }

    schedule(changedKeys) {
        if (!this.#isActive || changedKeys.length === 0) return;

        const immediateKeys = [];
        const debouncedKeys = [];

        for (const key of changedKeys) {
            const config = this.#config[key];
            if (!config) continue;

            if (config.immediate) {
                immediateKeys.push(key);
            } else {
                debouncedKeys.push(key);
            }
        }

        if (immediateKeys.length > 0) {
            this.#persistKeys(immediateKeys);
        }

        if (debouncedKeys.length > 0) {
            this.#scheduleDebounced(debouncedKeys);
        }
    }

    #scheduleDebounced(keys) {
        keys.forEach(key => this.#pendingKeys.add(key));
        this.#clearTimer();

        const maxDelay = Math.max(...keys.map(key => this.#config[key]?.debounce || 300));

        this.#debounceTimer = setTimeout(() => {
            this.#persistKeys(Array.from(this.#pendingKeys));
            this.#pendingKeys.clear();
            this.#debounceTimer = null;
        }, maxDelay);
    }

    async #persistKeys(keys) {
        const state = this.#stateRef();
        if (!state) return;

        const handlerGroups = new Map();

        for (const key of keys) {
            let handlerKey = key;

            if (['editor', 'interface', 'export', 'workspace'].includes(key)) {
                handlerKey = 'settings';
            }

            if (!handlerGroups.has(handlerKey)) {
                handlerGroups.set(handlerKey, []);
            }
            handlerGroups.get(handlerKey).push(key);
        }

        for (const [handlerKey] of handlerGroups) {
            try {
                const handler = WorkspacePersistence.PERSIST_HANDLERS[handlerKey];
                if (handler) {
                    // eslint-disable-next-line no-await-in-loop
                    await handler(state);
                }
            } catch (error) {
                console.warn(`[WorkspacePersistence] 持久化失败 (${handlerKey}):`, error);
            }
        }
    }

    #clearTimer() {
        if (this.#debounceTimer) {
            clearTimeout(this.#debounceTimer);
            this.#debounceTimer = null;
        }
    }

    destroy() {
        this.stop();
        this.#pendingKeys.clear();
        this.#stateRef = null;
    }
}
