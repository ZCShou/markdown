function getDocUpdatedAt(doc) {
    return typeof doc?.updatedAt === 'string' ? doc.updatedAt : '';
}

function getDeletedAt(tombstone) {
    return typeof tombstone?.deletedAt === 'string' ? tombstone.deletedAt : '';
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

export function buildWorkspaceSnapshot(documents = [], currentDocId = null, tombstones = []) {
    const normalizedDocuments = normalizeWorkspaceDocuments(documents);
    const normalizedTombstones = normalizeWorkspaceTombstones(tombstones);
    const visibleDocuments = applyWorkspaceTombstones(normalizedDocuments, normalizedTombstones);
    const validCurrentDocId = visibleDocuments.some(doc => doc.id === currentDocId)
        ? currentDocId
        : visibleDocuments.find(doc => doc.type !== 'folder')?.id || null;

    return {
        currentDocId: validCurrentDocId,
        documents: visibleDocuments,
        tombstones: normalizedTombstones
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
        snapshot.tombstones || snapshot.deletedDocs || null
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

export function mergeWorkspaceSnapshots(baseSnapshot, incomingSnapshot) {
    const parsedBase = parseWorkspaceSnapshot(baseSnapshot);
    const parsedIncoming = parseWorkspaceSnapshot(incomingSnapshot);
    const merged = mergeWorkspaceDocuments(parsedBase.documents, parsedIncoming.documents);
    const tombstones = mergeWorkspaceTombstones(
        parsedBase.tombstones,
        parsedIncoming.tombstones
    );

    return buildWorkspaceSnapshot(
        merged.documents,
        parsedIncoming.currentDocId || parsedBase.currentDocId,
        tombstones
    );
}
