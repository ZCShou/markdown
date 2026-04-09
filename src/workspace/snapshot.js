function getDocUpdatedAt(doc) {
    return typeof doc?.updatedAt === 'string' ? doc.updatedAt : '';
}

function getDeletedAt(tombstone) {
    return typeof tombstone?.deletedAt === 'string' ? tombstone.deletedAt : '';
}

function getAssetUpdatedAt(asset) {
    return typeof asset?.updatedAt === 'string' ? asset.updatedAt : '';
}

export function normalizeWorkspaceDocuments(documents) {
    if (!Array.isArray(documents)) {
        return [];
    }

    return documents.filter(doc => doc && typeof doc === 'object' && typeof doc.id === 'string');
}

export function normalizeWorkspaceTombstones(tombstones) {
    if (!Array.isArray(tombstones)) {
        return [];
    }

    return tombstones.filter(
        tombstone =>
            tombstone &&
            typeof tombstone === 'object' &&
            typeof tombstone.id === 'string' &&
            typeof tombstone.deletedAt === 'string'
    );
}

export function normalizeWorkspaceAssets(assets) {
    if (!Array.isArray(assets)) {
        return [];
    }

    return assets.filter(
        asset =>
            asset &&
            typeof asset === 'object' &&
            typeof asset.path === 'string' &&
            typeof asset.dataUrl === 'string'
    );
}

export function collectWorkspaceAssetPaths(documents = []) {
    const assetPaths = new Set();

    for (const doc of normalizeWorkspaceDocuments(documents)) {
        if (doc.type === 'image' && typeof doc.imagePath === 'string') {
            assetPaths.add(doc.imagePath);
        }
    }

    return assetPaths;
}

export function applyWorkspaceTombstones(documents = [], tombstones = []) {
    const normalizedDocuments = normalizeWorkspaceDocuments(documents);
    const tombstoneMap = new Map(
        normalizeWorkspaceTombstones(tombstones).map(tombstone => [tombstone.id, tombstone])
    );

    return normalizedDocuments.filter(doc => {
        const tombstone = tombstoneMap.get(doc.id);
        if (!tombstone) {
            return true;
        }

        return getDocUpdatedAt(doc) > getDeletedAt(tombstone);
    });
}

export function buildWorkspaceSnapshot(
    documents = [],
    currentDocId = null,
    tombstones = [],
    assets = []
) {
    const normalizedDocuments = normalizeWorkspaceDocuments(documents);
    const normalizedTombstones = normalizeWorkspaceTombstones(tombstones);
    const visibleDocuments = applyWorkspaceTombstones(normalizedDocuments, normalizedTombstones);
    const referencedImagePaths = collectWorkspaceAssetPaths(visibleDocuments);
    const normalizedAssets = normalizeWorkspaceAssets(assets).filter(asset =>
        referencedImagePaths.has(asset.path)
    );
    const validCurrentDocId = visibleDocuments.some(doc => doc.id === currentDocId)
        ? currentDocId
        : visibleDocuments.find(doc => doc.type !== 'folder')?.id || null;

    return {
        currentDocId: validCurrentDocId,
        documents: visibleDocuments,
        tombstones: normalizedTombstones,
        assets: normalizedAssets
    };
}

export function parseWorkspaceSnapshot(snapshot) {
    if (typeof snapshot === 'string') {
        try {
            return parseWorkspaceSnapshot(JSON.parse(snapshot));
        } catch {
            return buildWorkspaceSnapshot();
        }
    }

    if (!snapshot || typeof snapshot !== 'object') {
        return buildWorkspaceSnapshot();
    }

    return buildWorkspaceSnapshot(
        snapshot.documents,
        snapshot.currentDocId || null,
        snapshot.tombstones || snapshot.deletedDocs || null,
        snapshot.assets || null
    );
}

export function mergeWorkspaceDocuments(baseDocs = [], incomingDocs = []) {
    const mergedDocuments = [...normalizeWorkspaceDocuments(baseDocs)];
    const indexById = new Map(mergedDocuments.map((doc, index) => [doc.id, index]));
    let addedCount = 0;
    let updatedCount = 0;

    for (const doc of normalizeWorkspaceDocuments(incomingDocs)) {
        const existingIndex = indexById.get(doc.id);

        if (existingIndex === undefined) {
            indexById.set(doc.id, mergedDocuments.length);
            mergedDocuments.push(doc);
            addedCount += 1;
            continue;
        }

        const existingDoc = mergedDocuments[existingIndex];
        if (getDocUpdatedAt(doc) >= getDocUpdatedAt(existingDoc)) {
            if (JSON.stringify(existingDoc) !== JSON.stringify(doc)) {
                mergedDocuments[existingIndex] = doc;
                updatedCount += 1;
            }
        }
    }

    return {
        documents: mergedDocuments,
        addedCount,
        updatedCount
    };
}

export function mergeWorkspaceTombstones(baseTombstones = [], incomingTombstones = []) {
    const mergedTombstones = [...normalizeWorkspaceTombstones(baseTombstones)];
    const indexById = new Map(mergedTombstones.map((tombstone, index) => [tombstone.id, index]));

    for (const tombstone of normalizeWorkspaceTombstones(incomingTombstones)) {
        const existingIndex = indexById.get(tombstone.id);

        if (existingIndex === undefined) {
            indexById.set(tombstone.id, mergedTombstones.length);
            mergedTombstones.push(tombstone);
            continue;
        }

        if (getDeletedAt(tombstone) >= getDeletedAt(mergedTombstones[existingIndex])) {
            mergedTombstones[existingIndex] = tombstone;
        }
    }

    return mergedTombstones;
}

export function mergeWorkspaceAssets(baseAssets = [], incomingAssets = []) {
    const mergedAssets = [...normalizeWorkspaceAssets(baseAssets)];
    const indexByPath = new Map(mergedAssets.map((asset, index) => [asset.path, index]));

    for (const asset of normalizeWorkspaceAssets(incomingAssets)) {
        const existingIndex = indexByPath.get(asset.path);

        if (existingIndex === undefined) {
            indexByPath.set(asset.path, mergedAssets.length);
            mergedAssets.push(asset);
            continue;
        }

        if (getAssetUpdatedAt(asset) >= getAssetUpdatedAt(mergedAssets[existingIndex])) {
            mergedAssets[existingIndex] = asset;
        }
    }

    return mergedAssets;
}

export function mergeWorkspaceSnapshots(baseSnapshot, incomingSnapshot) {
    const parsedBase = parseWorkspaceSnapshot(baseSnapshot);
    const parsedIncoming = parseWorkspaceSnapshot(incomingSnapshot);
    const merged = mergeWorkspaceDocuments(parsedBase.documents, parsedIncoming.documents);
    const tombstones = mergeWorkspaceTombstones(
        parsedBase.tombstones,
        parsedIncoming.tombstones
    );
    const referencedImagePaths = collectWorkspaceAssetPaths(merged.documents);
    const assets = mergeWorkspaceAssets(parsedBase.assets, parsedIncoming.assets).filter(asset =>
        referencedImagePaths.has(asset.path)
    );

    return buildWorkspaceSnapshot(
        merged.documents,
        parsedIncoming.currentDocId || parsedBase.currentDocId,
        tombstones,
        assets
    );
}
