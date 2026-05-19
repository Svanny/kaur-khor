import { SENA_SCHEMA_VERSION, type SenaServiceDetailPage, type SenaSkuDetailPage, type SenaWorkspaceSummary } from '@shared/sena';

export type SenaDetailCacheEntityType = 'service' | 'sku';
export type PersistedSenaDetailPage = SenaServiceDetailPage | SenaSkuDetailPage;

type PersistedSenaDetailPageEnvelope<TPage extends PersistedSenaDetailPage = PersistedSenaDetailPage> = {
  beforeIntervalIndex: number | null;
  entityId: string;
  entityType: SenaDetailCacheEntityType;
  freshnessFingerprint: string;
  limit: number;
  page: TPage;
  schemaVersion: number;
  writtenAt: string;
};

type PersistedSenaDetailPageStore = {
  entries: Record<string, PersistedSenaDetailPageEnvelope>;
  entityIndex: Record<string, string[]>;
  fingerprintIndex: Record<string, string[]>;
};

const STORAGE_KEY = 'kaur-khor:sena:detail-pages:v1';
const MAX_WINDOWS_PER_ENTITY = 4;
const MAX_ENTRIES_PER_TYPE = 80;

function subjectKey(entityType: SenaDetailCacheEntityType, entityId: string) {
  return `${entityType}:${entityId}`;
}

function entryKey(entityType: SenaDetailCacheEntityType, entityId: string, beforeIntervalIndex: number | null, limit: number) {
  return `${subjectKey(entityType, entityId)}:before:${beforeIntervalIndex ?? 'latest'}:limit:${limit}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readEntryRecord(value: unknown): Record<string, PersistedSenaDetailPageEnvelope> {
  return isRecord(value) ? value as Record<string, PersistedSenaDetailPageEnvelope> : {};
}

function readIndexRecord(value: unknown): Record<string, string[]> {
  if (!isRecord(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string[]] =>
      Array.isArray(entry[1]) && entry[1].every((item) => typeof item === 'string'),
    ),
  );
}

function readStore(storage: Storage): PersistedSenaDetailPageStore {
  if (!storage || typeof storage.getItem !== 'function') {
    return { entries: {}, entityIndex: {}, fingerprintIndex: {} };
  }
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { entries: {}, entityIndex: {}, fingerprintIndex: {} };
  }
  if (!raw) {
    return { entries: {}, entityIndex: {}, fingerprintIndex: {} };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<PersistedSenaDetailPageStore>;
    return {
      entries: readEntryRecord(parsed.entries),
      entityIndex: readIndexRecord(parsed.entityIndex),
      fingerprintIndex: readIndexRecord(parsed.fingerprintIndex),
    };
  } catch {
    return { entries: {}, entityIndex: {}, fingerprintIndex: {} };
  }
}

function writeStore(storage: Storage, store: PersistedSenaDetailPageStore) {
  if (!storage || typeof storage.setItem !== 'function') {
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(store));
  } catch {
    // Best-effort cache only.
  }
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function removeEntry(store: PersistedSenaDetailPageStore, key: string) {
  const entry = store.entries[key];
  if (!entry) {
    return;
  }
  delete store.entries[key];
  const subject = subjectKey(entry.entityType, entry.entityId);
  const subjectEntries = (store.entityIndex[subject] ?? []).filter((value) => value !== key);
  if (subjectEntries.length > 0) {
    store.entityIndex[subject] = subjectEntries;
  } else {
    delete store.entityIndex[subject];
  }
  const fingerprintEntries = (store.fingerprintIndex[entry.freshnessFingerprint] ?? []).filter((value) => value !== key);
  if (fingerprintEntries.length > 0) {
    store.fingerprintIndex[entry.freshnessFingerprint] = fingerprintEntries;
  } else {
    delete store.fingerprintIndex[entry.freshnessFingerprint];
  }
}

function sortKeysByWrittenAt(store: PersistedSenaDetailPageStore, keys: string[]) {
  return [...keys].sort((left, right) => {
    const leftWrittenAt = Date.parse(store.entries[left]?.writtenAt ?? '');
    const rightWrittenAt = Date.parse(store.entries[right]?.writtenAt ?? '');
    return leftWrittenAt - rightWrittenAt;
  });
}

function pruneSubjectEntries(store: PersistedSenaDetailPageStore, subject: string) {
  const keys = unique(store.entityIndex[subject] ?? []).filter((key) => store.entries[key]);
  store.entityIndex[subject] = keys;
  if (keys.length <= MAX_WINDOWS_PER_ENTITY) {
    return;
  }
  const removableKeys = sortKeysByWrittenAt(
    store,
    keys.filter((key) => store.entries[key]?.beforeIntervalIndex != null),
  );
  while ((store.entityIndex[subject]?.length ?? 0) > MAX_WINDOWS_PER_ENTITY && removableKeys.length > 0) {
    removeEntry(store, removableKeys.shift() ?? '');
  }
  const overflowKeys = sortKeysByWrittenAt(store, store.entityIndex[subject] ?? []);
  while ((store.entityIndex[subject]?.length ?? 0) > MAX_WINDOWS_PER_ENTITY && overflowKeys.length > 0) {
    removeEntry(store, overflowKeys.shift() ?? '');
  }
}

function pruneTypeEntries(store: PersistedSenaDetailPageStore, entityType: SenaDetailCacheEntityType) {
  const keys = sortKeysByWrittenAt(
    store,
    Object.keys(store.entries).filter((key) => store.entries[key]?.entityType === entityType),
  );
  while (keys.length > MAX_ENTRIES_PER_TYPE) {
    const next = keys.shift();
    if (!next) {
      break;
    }
    removeEntry(store, next);
  }
}

function pruneStore(store: PersistedSenaDetailPageStore, activeFreshnessFingerprint: string | null) {
  if (activeFreshnessFingerprint) {
    for (const fingerprint of Object.keys(store.fingerprintIndex)) {
      if (fingerprint === activeFreshnessFingerprint) {
        continue;
      }
      for (const key of store.fingerprintIndex[fingerprint] ?? []) {
        removeEntry(store, key);
      }
    }
  }
  for (const subject of Object.keys(store.entityIndex)) {
    pruneSubjectEntries(store, subject);
  }
  pruneTypeEntries(store, 'sku');
  pruneTypeEntries(store, 'service');
}

export function deriveSenaDetailCacheFreshnessFingerprint(
  workspaceSummary: Pick<SenaWorkspaceSummary, 'latestObservedAt' | 'runId'> | null | undefined,
) {
  if (!workspaceSummary?.runId || !workspaceSummary.latestObservedAt) {
    return null;
  }
  return `${SENA_SCHEMA_VERSION}:${workspaceSummary.runId}:${workspaceSummary.latestObservedAt}`;
}

export function readPersistedSenaDetailPage<TPage extends PersistedSenaDetailPage>({
  beforeIntervalIndex,
  entityId,
  entityType,
  freshnessFingerprint,
  limit,
  storage,
}: {
  beforeIntervalIndex: number | null;
  entityId: string;
  entityType: SenaDetailCacheEntityType;
  freshnessFingerprint: string | null;
  limit: number;
  storage?: Storage;
}) {
  if (!storage || !freshnessFingerprint) {
    return null;
  }
  const key = entryKey(entityType, entityId, beforeIntervalIndex, limit);
  const entry = readStore(storage).entries[key];
  if (!entry) {
    return null;
  }
  if (entry.schemaVersion !== SENA_SCHEMA_VERSION || entry.freshnessFingerprint !== freshnessFingerprint) {
    return null;
  }
  return entry.page as TPage;
}

export function writePersistedSenaDetailPage<TPage extends PersistedSenaDetailPage>({
  beforeIntervalIndex,
  entityId,
  entityType,
  freshnessFingerprint,
  limit,
  page,
  storage,
}: {
  beforeIntervalIndex: number | null;
  entityId: string;
  entityType: SenaDetailCacheEntityType;
  freshnessFingerprint: string | null;
  limit: number;
  page: TPage | null;
  storage?: Storage;
}) {
  if (!storage || !page || !freshnessFingerprint) {
    return;
  }
  const key = entryKey(entityType, entityId, beforeIntervalIndex, limit);
  const subject = subjectKey(entityType, entityId);
  const store = readStore(storage);
  store.entries[key] = {
    beforeIntervalIndex,
    entityId,
    entityType,
    freshnessFingerprint,
    limit,
    page,
    schemaVersion: SENA_SCHEMA_VERSION,
    writtenAt: new Date().toISOString(),
  };
  store.entityIndex[subject] = unique([...(store.entityIndex[subject] ?? []), key]);
  store.fingerprintIndex[freshnessFingerprint] = unique([...(store.fingerprintIndex[freshnessFingerprint] ?? []), key]);
  pruneStore(store, freshnessFingerprint);
  writeStore(storage, store);
}

export function clearPersistedSenaDetailPagesForEntity({
  entityId,
  entityType,
  storage,
}: {
  entityId: string;
  entityType: SenaDetailCacheEntityType;
  storage?: Storage;
}) {
  if (!storage) {
    return;
  }
  const store = readStore(storage);
  for (const key of store.entityIndex[subjectKey(entityType, entityId)] ?? []) {
    removeEntry(store, key);
  }
  writeStore(storage, store);
}

export function prunePersistedSenaDetailPages({
  activeFreshnessFingerprint,
  storage,
}: {
  activeFreshnessFingerprint: string | null;
  storage?: Storage;
}) {
  if (!storage) {
    return;
  }
  const store = readStore(storage);
  pruneStore(store, activeFreshnessFingerprint);
  writeStore(storage, store);
}
