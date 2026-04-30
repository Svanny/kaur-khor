import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { InventorySnapshot, StockReport } from '@shared/inventory';
import type { SenaEngineParameters } from '@shared/ipc';
import type {
  SenaAnalysisRunRecord,
  SenaCatalog,
  SenaCreateOrderBatchPayload,
  SenaObservationDeletePayload,
  SenaDiagnostics,
  SenaObservationFingerprint,
  SenaObservationInput,
  SenaObservationPage,
  SenaObservationPageRequest,
  SenaObservationRecord,
  SenaOrderBatchRecord,
  SenaOrderLookupPayload,
  SenaRecordUpdateContext,
  SenaSplitOrderChildPayload,
  SenaObservationUpdatePayload,
  SenaService,
  SenaServiceDetailPage,
  SenaSku,
  SenaSkuDetailPage,
  SenaStartupWorkspace,
  SenaUpdateOrderBatchPayload,
  SenaUpdateOrderChildPayload,
  SenaWorkspaceSummary,
} from '@shared/sena';
import { normalizeServiceDetailPage, normalizeSkuDetailPage } from '@/lib/sena-detail-pages';
import { projectInventorySnapshotFromSena } from '@/lib/project-inventory-snapshot-from-sena';
import { projectStockReportsFromSena } from '@/lib/project-stock-reports-from-sena';
import {
  clearPersistedSenaDetailPagesForEntity,
  deriveSenaDetailCacheFreshnessFingerprint,
  prunePersistedSenaDetailPages,
  readPersistedSenaDetailPage,
  writePersistedSenaDetailPage,
} from '@/lib/sena-detail-page-cache';
import { normalizeSenaCatalog } from '@/lib/sena-catalog';
import {
  archiveSenaService,
  archiveSenaSku,
  type SenaCatalogEntityType,
  unarchiveSenaService,
  unarchiveSenaSku,
  upsertSenaService,
  upsertSenaSku,
} from '@/lib/sena-catalog';

type ReadCacheValue =
  | InventorySnapshot
  | StockReport[]
  | SenaCatalog
  | SenaObservationRecord[]
  | SenaObservationPage
  | SenaObservationFingerprint
  | SenaRecordUpdateContext
  | SenaOrderBatchRecord[]
  | SenaWorkspaceSummary
  | SenaSkuDetailPage
  | SenaServiceDetailPage
  | SenaDiagnostics
  | SenaAnalysisRunRecord
  | SenaStartupWorkspace
  | null;

const DEFAULT_INTERVAL_PAGE_LIMIT = 20;

type SenaDetailLoadStrategy = 'cache-first' | 'network-only';
type SenaDetailLoadOptions = {
  beforeIntervalIndex?: number | null;
  limit?: number;
  strategy?: SenaDetailLoadStrategy;
};
type WorkSupportDataOptions = {
  includeObservations?: boolean;
  observationLimit?: number;
};
type WorkSupportDataResult = {
  observationPage: SenaObservationPage | null;
  orderBatches: SenaOrderBatchRecord[];
  recordUpdateContext: SenaRecordUpdateContext;
};

type SenaMetaCache = {
  catalogHash: string | null;
  lastBootstrapSkuId: string | null;
  lastCompletedRunId: string | null;
};

type RenameCatalogEntityPayload =
  | {
      entityType: 'sku';
      previousId: string;
      nextSku: SenaSku;
    }
  | {
      entityType: 'service';
      previousId: string;
      nextService: SenaService;
      skuIds: string[];
    };

export interface InventoryContextValue {
  snapshot: InventorySnapshot | null;
  reports: StockReport[];
  catalog: SenaCatalog | null;
  diagnostics: SenaDiagnostics | null;
  error: string | null;
  isLoading: boolean;
  isPreparingWorkspace: boolean;
  isSaving: boolean;
  latestRun: SenaAnalysisRunRecord | null;
  observationFingerprint: SenaObservationFingerprint | null;
  observations: SenaObservationRecord[];
  orderBatches: SenaOrderBatchRecord[];
  recordUpdateContext: SenaRecordUpdateContext | null;
  senaMeta: SenaMetaCache;
  workspaceSummary: SenaWorkspaceSummary | null;
  reload: () => Promise<void>;
  loadInventorySnapshot: () => Promise<InventorySnapshot>;
  listStockReports: () => Promise<StockReport[]>;
  upsertSenaCatalog: (payload: SenaCatalog) => Promise<SenaCatalog>;
  renameCatalogEntity: (payload: RenameCatalogEntityPayload) => Promise<SenaCatalog>;
  archiveCatalogEntity: (payload: { entityId: string; entityType: 'sku' | 'service' }) => Promise<SenaCatalog>;
  unarchiveCatalogEntity: (payload: { entityId: string; entityType: 'sku' | 'service' }) => Promise<SenaCatalog>;
  loadSenaCatalog: () => Promise<SenaCatalog | null>;
  ingestSenaObservation: (payload: SenaObservationInput) => Promise<SenaObservationRecord>;
  updateSenaObservation: (payload: SenaObservationUpdatePayload) => Promise<SenaObservationRecord>;
  deleteSenaObservation: (payload: SenaObservationDeletePayload) => Promise<void>;
  listSenaObservations: () => Promise<SenaObservationRecord[]>;
  loadSenaObservations: () => Promise<SenaObservationRecord[]>;
  listSenaObservationPage: (payload?: SenaObservationPageRequest) => Promise<SenaObservationPage>;
  loadWorkSupportData: (options?: WorkSupportDataOptions) => Promise<WorkSupportDataResult>;
  loadSenaRecordUpdateContext: () => Promise<SenaRecordUpdateContext>;
  listSenaOrderBatches: (payload?: SenaOrderLookupPayload) => Promise<SenaOrderBatchRecord[]>;
  loadSenaOrderBatches: (payload?: SenaOrderLookupPayload) => Promise<SenaOrderBatchRecord[]>;
  createSenaOrderBatch: (payload: SenaCreateOrderBatchPayload) => Promise<SenaOrderBatchRecord>;
  updateSenaOrderBatch: (payload: SenaUpdateOrderBatchPayload) => Promise<SenaOrderBatchRecord>;
  updateSenaOrderChild: (payload: SenaUpdateOrderChildPayload) => Promise<SenaOrderBatchRecord>;
  splitSenaOrderChild: (payload: SenaSplitOrderChildPayload) => Promise<SenaOrderBatchRecord>;
  triggerSenaRun: (payload?: { algorithmVersion?: string; parameters?: SenaEngineParameters }) => Promise<SenaAnalysisRunRecord>;
  retrySenaRun: (payload: { runId: string }) => Promise<SenaAnalysisRunRecord>;
  runWorkspacePreparation: <T>(task: () => Promise<T>) => Promise<T>;
  loadSenaWorkspaceSummary: () => Promise<SenaWorkspaceSummary | null>;
  loadSenaSkuDetail: (skuId: string, options?: SenaDetailLoadOptions) => Promise<SenaSkuDetailPage | null>;
  loadSenaServiceDetail: (serviceId: string, options?: SenaDetailLoadOptions) => Promise<SenaServiceDetailPage | null>;
  clearSenaSkuDetailCache: (skuId: string) => Promise<void>;
  clearSenaServiceDetailCache: (serviceId: string) => Promise<void>;
  loadSenaDiagnostics: () => Promise<SenaDiagnostics | null>;
  loadSenaRunStatus: (runId: string) => Promise<SenaAnalysisRunRecord | null>;
  updateSenaMeta: (next: Partial<SenaMetaCache>) => void;
}

type InventoryStateValue = Pick<
  InventoryContextValue,
  | 'catalog'
  | 'diagnostics'
  | 'error'
  | 'isLoading'
  | 'isPreparingWorkspace'
  | 'isSaving'
  | 'latestRun'
  | 'observationFingerprint'
  | 'observations'
  | 'orderBatches'
  | 'recordUpdateContext'
  | 'reports'
  | 'senaMeta'
  | 'snapshot'
  | 'workspaceSummary'
>;

type InventoryActionsValue = Omit<InventoryContextValue, keyof InventoryStateValue>;

const InventoryStateContext = createContext<InventoryStateValue | null>(null);
const InventoryActionsContext = createContext<InventoryActionsValue | null>(null);

function emptyState() {
  return {
    snapshot: null as InventorySnapshot | null,
    reports: [] as StockReport[],
    catalog: null as SenaCatalog | null,
    diagnostics: null as SenaDiagnostics | null,
    error: null as string | null,
    isLoading: true,
    isPreparingWorkspace: false,
    isSaving: false,
    latestRun: null as SenaAnalysisRunRecord | null,
    observationFingerprint: null as SenaObservationFingerprint | null,
    observations: [] as SenaObservationRecord[],
    orderBatches: [] as SenaOrderBatchRecord[],
    recordUpdateContext: null as SenaRecordUpdateContext | null,
    workspaceSummary: null as SenaWorkspaceSummary | null,
  };
}

function isSenaCacheKey(key: string) {
  return key.startsWith('sena:');
}

function isSenaDetailCacheKey(key: string, entityType: 'sku' | 'service', entityId: string) {
  return key.startsWith(`sena:${entityType}:${entityId}:`);
}

function replaceEntityId(values: string[], previousId: string, nextId: string) {
  return values.map((value) => (value === previousId ? nextId : value));
}

function rewriteObservationInputForRenamedEntity(
  input: SenaObservationInput,
  payload: RenameCatalogEntityPayload,
): SenaObservationInput {
  if (payload.previousId === (payload.entityType === 'sku' ? payload.nextSku.skuId : payload.nextService.serviceId)) {
    return input;
  }

  if (payload.entityType === 'sku') {
    const nextId = payload.nextSku.skuId;
    const retailSalesSnapshot = input.retailSalesSnapshot ?? [];
    const retailRankings = input.retailRankings ?? [];
    const retailStockouts = input.retailStockouts ?? [];
    const orderSignals = input.orderSignals ?? [];
    const retailPrices = input.retailPrices ?? [];
    const leadTimeHints = input.leadTimeHints ?? [];
    const adjustmentSignals = input.adjustmentSignals ?? [];
    const commercialEvents = input.commercialEvents ?? [];
    const recipeUsageHints = input.recipeUsageHints ?? [];
    const hasChange =
      input.stockSnapshot.some((snapshot) => snapshot.skuId === payload.previousId) ||
      retailSalesSnapshot.some((snapshot) => snapshot.skuId === payload.previousId) ||
      retailRankings.includes(payload.previousId) ||
      retailStockouts.includes(payload.previousId) ||
      orderSignals.some((signal) => signal.skuId === payload.previousId) ||
      retailPrices.some((price) => price.skuId === payload.previousId) ||
      leadTimeHints.some((hint) => hint.skuId === payload.previousId) ||
      adjustmentSignals.some((signal) => signal.skuId === payload.previousId) ||
      commercialEvents.some((event) => event.entityType === 'sku' && event.entityId === payload.previousId) ||
      recipeUsageHints.some((hint) => hint.skuId === payload.previousId);
    if (!hasChange) {
      return input;
    }
    return {
      ...input,
      stockSnapshot: input.stockSnapshot.map((snapshot) =>
        snapshot.skuId === payload.previousId ? { ...snapshot, skuId: nextId } : snapshot,
      ),
      retailSalesSnapshot: retailSalesSnapshot.map((snapshot) =>
        snapshot.skuId === payload.previousId ? { ...snapshot, skuId: nextId } : snapshot,
      ),
      retailRankings: replaceEntityId(retailRankings, payload.previousId, nextId),
      retailStockouts: replaceEntityId(retailStockouts, payload.previousId, nextId),
      orderSignals: orderSignals.map((signal) =>
        signal.skuId === payload.previousId ? { ...signal, skuId: nextId } : signal,
      ),
      retailPrices: retailPrices.map((price) =>
        price.skuId === payload.previousId ? { ...price, skuId: nextId } : price,
      ),
      leadTimeHints: leadTimeHints.map((hint) =>
        hint.skuId === payload.previousId ? { ...hint, skuId: nextId } : hint,
      ),
      adjustmentSignals: adjustmentSignals.map((signal) =>
        signal.skuId === payload.previousId ? { ...signal, skuId: nextId } : signal,
      ),
      commercialEvents: commercialEvents.map((event) =>
        event.entityType === 'sku' && event.entityId === payload.previousId
          ? { ...event, entityId: nextId }
          : event,
      ),
      recipeUsageHints: recipeUsageHints.map((hint) =>
        hint.skuId === payload.previousId ? { ...hint, skuId: nextId } : hint,
      ),
    };
  }

  const nextId = payload.nextService.serviceId;
  const serviceSalesSnapshot = input.serviceSalesSnapshot ?? [];
  const serviceRankings = input.serviceRankings ?? [];
  const serviceStockouts = input.serviceStockouts ?? [];
  const servicePrices = input.servicePrices ?? [];
  const commercialEvents = input.commercialEvents ?? [];
  const recipeUsageHints = input.recipeUsageHints ?? [];
  const hasChange =
    serviceSalesSnapshot.some((snapshot) => snapshot.serviceId === payload.previousId) ||
    serviceRankings.includes(payload.previousId) ||
    serviceStockouts.includes(payload.previousId) ||
    servicePrices.some((price) => price.serviceId === payload.previousId) ||
    commercialEvents.some((event) => event.entityType === 'service' && event.entityId === payload.previousId) ||
    recipeUsageHints.some((hint) => hint.serviceId === payload.previousId);
  if (!hasChange) {
    return input;
  }
  return {
    ...input,
    serviceSalesSnapshot: serviceSalesSnapshot.map((snapshot) =>
      snapshot.serviceId === payload.previousId ? { ...snapshot, serviceId: nextId } : snapshot,
    ),
    serviceRankings: replaceEntityId(serviceRankings, payload.previousId, nextId),
    serviceStockouts: replaceEntityId(serviceStockouts, payload.previousId, nextId),
    servicePrices: servicePrices.map((price) =>
      price.serviceId === payload.previousId ? { ...price, serviceId: nextId } : price,
    ),
    commercialEvents: commercialEvents.map((event) =>
      event.entityType === 'service' && event.entityId === payload.previousId
        ? { ...event, entityId: nextId }
        : event,
    ),
    recipeUsageHints: recipeUsageHints.map((hint) =>
      hint.serviceId === payload.previousId ? { ...hint, serviceId: nextId } : hint,
    ),
  };
}

function rewriteOrderBatchForRenamedEntity(
  batch: SenaOrderBatchRecord,
  payload: RenameCatalogEntityPayload,
): SenaOrderBatchRecord {
  if (payload.entityType !== 'sku') {
    return batch;
  }
  const changed = batch.children.some((child) => child.skuId === payload.previousId);
  if (!changed) {
    return batch;
  }
  return {
    ...batch,
    children: batch.children.map((child) =>
      child.skuId === payload.previousId ? { ...child, skuId: payload.nextSku.skuId } : child,
    ),
  };
}

function deriveProjectedSnapshot(
  catalog: SenaCatalog | null,
  observations: SenaObservationRecord[],
  workspaceSummary: SenaWorkspaceSummary | null,
) {
  return catalog ? projectInventorySnapshotFromSena(catalog, observations, workspaceSummary) : null;
}

function deriveProjectedReports(observations: SenaObservationRecord[]) {
  return projectStockReportsFromSena(observations);
}

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => emptyState());
  const stateRef = useRef(state);
  const readCacheRef = useRef<Map<string, ReadCacheValue>>(new Map());
  const inflightRef = useRef<Map<string, Promise<ReadCacheValue>>>(new Map());
  const activeDetailFreshnessFingerprintRef = useRef<string | null>(null);
  const workspacePreparationDepthRef = useRef(0);
  const senaMetaRef = useRef<SenaMetaCache>({
    catalogHash: null,
    lastBootstrapSkuId: null,
    lastCompletedRunId: null,
  });
  const [metaVersion, bumpMetaVersion] = useState(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const updateSenaMeta = useCallback((next: Partial<SenaMetaCache>) => {
    senaMetaRef.current = { ...senaMetaRef.current, ...next };
    bumpMetaVersion((value) => value + 1);
  }, []);

  const setStatePartial = useCallback((patch: Partial<typeof state>) => {
    setState((current) => ({ ...current, ...patch }));
  }, []);

  const invalidateSenaReads = useCallback(() => {
    for (const key of readCacheRef.current.keys()) {
      if (isSenaCacheKey(key)) {
        readCacheRef.current.delete(key);
      }
    }
    for (const key of inflightRef.current.keys()) {
      if (isSenaCacheKey(key)) {
        inflightRef.current.delete(key);
      }
    }
  }, []);

  const clearLocalSenaDetailCache = useCallback((entityType: SenaCatalogEntityType, entityId: string) => {
    for (const key of readCacheRef.current.keys()) {
      if (isSenaDetailCacheKey(key, entityType, entityId)) {
        readCacheRef.current.delete(key);
      }
    }
    for (const key of inflightRef.current.keys()) {
      if (isSenaDetailCacheKey(key, entityType, entityId)) {
        inflightRef.current.delete(key);
      }
    }
  }, []);

  const clearSenaDetailCache = useCallback(
    async (entityType: SenaCatalogEntityType, entityId: string) => {
      clearLocalSenaDetailCache(entityType, entityId);
      if (typeof window !== 'undefined') {
        clearPersistedSenaDetailPagesForEntity({ entityId, entityType, storage: window.localStorage });
      }
      await window.banjiDesktop.sena.clearDetailCache({ entityId, entityType });
    },
    [clearLocalSenaDetailCache],
  );

  const syncPersistentSenaDetailCache = useCallback((workspaceSummary: SenaWorkspaceSummary | null) => {
    if (typeof window === 'undefined') {
      return;
    }
    const nextFingerprint = deriveSenaDetailCacheFreshnessFingerprint(workspaceSummary);
    if (nextFingerprint === activeDetailFreshnessFingerprintRef.current) {
      return;
    }
    activeDetailFreshnessFingerprintRef.current = nextFingerprint;
    prunePersistedSenaDetailPages({
      activeFreshnessFingerprint: nextFingerprint,
      storage: window.localStorage,
    });
  }, []);

  const loadWithCache = useCallback(async <T extends ReadCacheValue>(key: string, loader: () => Promise<T>) => {
    if (readCacheRef.current.has(key)) {
      return readCacheRef.current.get(key) as T;
    }
    const inflight = inflightRef.current.get(key);
    if (inflight) {
      return (await inflight) as T;
    }
    const request = loader()
      .then((value) => {
        readCacheRef.current.set(key, value);
        inflightRef.current.delete(key);
        return value;
      })
      .catch((error) => {
        inflightRef.current.delete(key);
        throw error;
      });
    inflightRef.current.set(key, request);
    return (await request) as T;
  }, []);

  const loadSenaDetailPage = useCallback(async <
    TPage extends SenaServiceDetailPage | SenaSkuDetailPage,
  >({
    key,
    loadFresh,
    readPersisted,
  }: {
    key: string;
    loadFresh: () => Promise<TPage | null>;
    readPersisted: () => TPage | null;
  }) => {
    const cached = readCacheRef.current.get(key);
    if (cached !== undefined) {
      return cached as TPage | null;
    }

    const persisted = readPersisted();
    if (persisted) {
      readCacheRef.current.set(key, persisted);
      if (!inflightRef.current.has(key)) {
        const request = loadFresh()
          .then((value) => {
            readCacheRef.current.set(key, value);
            inflightRef.current.delete(key);
            return value;
          })
          .catch((error) => {
            inflightRef.current.delete(key);
            throw error;
          });
        inflightRef.current.set(key, request);
      }
      return persisted;
    }

    const inflight = inflightRef.current.get(key);
    if (inflight) {
      return (await inflight) as TPage | null;
    }

    const request = loadFresh()
      .then((value) => {
        readCacheRef.current.set(key, value);
        inflightRef.current.delete(key);
        return value;
      })
      .catch((error) => {
        inflightRef.current.delete(key);
        throw error;
      });
    inflightRef.current.set(key, request);
    return (await request) as TPage | null;
  }, []);

  const loadLatestRun = useCallback(
    async (runId: string | null) => {
      if (!runId) {
        return null;
      }
      const run = await loadWithCache(`sena:run:${runId}`, () => window.banjiDesktop.sena.getRunStatus({ runId }));
      if (run?.status === 'succeeded') {
        updateSenaMeta({ lastCompletedRunId: run.runId });
      }
      return run;
    },
    [loadWithCache, updateSenaMeta],
  );

  const refreshRecordUpdateContext = useCallback(async () => {
    const recordUpdateContext = await window.banjiDesktop.sena.getRecordUpdateContext();
    readCacheRef.current.set('sena:record-update-context', recordUpdateContext);
    readCacheRef.current.set('sena:observation-fingerprint', recordUpdateContext.observationFingerprint);
    setStatePartial({
      observationFingerprint: recordUpdateContext.observationFingerprint,
      recordUpdateContext,
    });
    return recordUpdateContext;
  }, [setStatePartial]);

  useEffect(() => {
    syncPersistentSenaDetailCache(state.workspaceSummary);
  }, [state.workspaceSummary, syncPersistentSenaDetailCache]);

  const reload = useCallback(async () => {
    setState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      readCacheRef.current.clear();
      inflightRef.current.clear();
      const startupWorkspace = await window.banjiDesktop.sena.getStartupWorkspace();
      const catalog = normalizeSenaCatalog(startupWorkspace.catalog);
      const workspaceSummary = startupWorkspace.workspaceSummary;
      const latestRun = startupWorkspace.latestRun;
      const observationFingerprint = startupWorkspace.observationFingerprint;
      const snapshot = deriveProjectedSnapshot(catalog, [], workspaceSummary);
      const reports: StockReport[] = [];
      readCacheRef.current.set('sena:catalog', catalog);
      readCacheRef.current.set('sena:summary', workspaceSummary);
      readCacheRef.current.set('sena:observation-fingerprint', observationFingerprint);
      if (latestRun) {
        readCacheRef.current.set(`sena:run:${latestRun.runId}`, latestRun);
        if (latestRun.status === 'succeeded') {
          updateSenaMeta({ lastCompletedRunId: latestRun.runId });
        }
      }
      setState({
        snapshot,
        reports,
        catalog,
        diagnostics: null,
        error: null,
        isLoading: false,
        isSaving: false,
        isPreparingWorkspace: false,
        latestRun,
        observationFingerprint,
        observations: [],
        orderBatches: [],
        recordUpdateContext: null,
        workspaceSummary,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Failed to load inventory workspace.',
        isLoading: false,
      }));
    }
  }, [updateSenaMeta]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const withSaving = useCallback(async <T,>(task: () => Promise<T>) => {
    setState((current) => ({ ...current, error: null, isSaving: true }));
    try {
      const result = await task();
      setState((current) => ({ ...current, isSaving: false }));
      return result;
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Workspace mutation failed.',
        isSaving: false,
      }));
      throw error;
    }
  }, []);

  const runWorkspacePreparation = useCallback(async <T,>(task: () => Promise<T>) => {
    workspacePreparationDepthRef.current += 1;
    setState((current) => ({
      ...current,
      error: null,
      isPreparingWorkspace: true,
    }));

    try {
      return await task();
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Workspace preparation failed.',
      }));
      throw error;
    } finally {
      workspacePreparationDepthRef.current = Math.max(0, workspacePreparationDepthRef.current - 1);
      if (workspacePreparationDepthRef.current === 0) {
        setState((current) => ({
          ...current,
          isPreparingWorkspace: false,
        }));
      }
    }
  }, []);

  const actions = useMemo<InventoryActionsValue>(
    () => ({
      reload,
      loadInventorySnapshot: async () => {
        const snapshot = deriveProjectedSnapshot(
          stateRef.current.catalog,
          stateRef.current.observations,
          stateRef.current.workspaceSummary,
        );
        if (!snapshot) {
          throw new Error('Snapshot is unavailable until the catalog is loaded.');
        }
        readCacheRef.current.set('projection:snapshot', snapshot);
        setStatePartial({ snapshot });
        return snapshot;
      },
      listStockReports: async () => {
        const reports = deriveProjectedReports(stateRef.current.observations);
        readCacheRef.current.set('projection:reports', reports);
        setStatePartial({ reports });
        return reports;
      },
      updateSenaMeta,
      upsertSenaCatalog: async (payload) =>
        withSaving(async () => {
          const catalog = normalizeSenaCatalog(await window.banjiDesktop.sena.upsertCatalog(payload));
          invalidateSenaReads();
          readCacheRef.current.set('sena:catalog', catalog);
          setState((current) => ({
            ...current,
            catalog,
            snapshot: deriveProjectedSnapshot(catalog, current.observations, current.workspaceSummary),
          }));
          return catalog;
        }),
      renameCatalogEntity: async (payload) =>
        withSaving(async () => {
          const currentCatalog = normalizeSenaCatalog(stateRef.current.catalog);
          if (!currentCatalog) {
            throw new Error('Catalog is not loaded.');
          }

          const nextId = payload.entityType === 'sku' ? payload.nextSku.skuId : payload.nextService.serviceId;
          const nextCatalog =
            payload.entityType === 'sku'
              ? upsertSenaSku(currentCatalog, payload.nextSku, payload.previousId)
              : upsertSenaService(currentCatalog, payload.nextService, payload.skuIds, payload.previousId);
          const catalog = normalizeSenaCatalog(await window.banjiDesktop.sena.upsertCatalog(nextCatalog));

          const [existingObservations, existingOrderBatches] = await Promise.all([
            window.banjiDesktop.sena.listObservations(),
            window.banjiDesktop.sena.listOrderBatches(),
          ]);
          for (const observation of existingObservations) {
            const nextInput = rewriteObservationInputForRenamedEntity(observation.input, payload);
            if (nextInput !== observation.input) {
              await window.banjiDesktop.sena.updateObservation({
                observationId: observation.observationId,
                input: nextInput,
              });
            }
          }
          for (const batch of existingOrderBatches) {
            const nextBatch = rewriteOrderBatchForRenamedEntity(batch, payload);
            if (nextBatch !== batch) {
              for (const child of nextBatch.children) {
                const original = batch.children.find((entry) => entry.childOrderId === child.childOrderId);
                if (original && original.skuId !== child.skuId) {
                  await window.banjiDesktop.sena.updateOrderChild({
                    childOrderId: child.childOrderId,
                    skuId: child.skuId,
                  });
                }
              }
            }
          }

          const [observations, orderBatches] = await Promise.all([
            window.banjiDesktop.sena.listObservations(),
            window.banjiDesktop.sena.listOrderBatches(),
          ]);
          const run =
            payload.previousId !== nextId
              ? await window.banjiDesktop.sena.triggerRun({
                  algorithmVersion: stateRef.current.latestRun?.algorithmVersion ?? 'sena-analysis-v3',
                })
              : null;
          const [workspaceSummary, diagnostics] = await Promise.all([
            window.banjiDesktop.sena.getWorkspaceSummary(),
            window.banjiDesktop.sena.getDiagnostics(),
          ]);

          invalidateSenaReads();
          await Promise.all([
            clearSenaDetailCache(payload.entityType, payload.previousId),
            ...(payload.previousId === nextId ? [] : [clearSenaDetailCache(payload.entityType, nextId)]),
          ]);
          readCacheRef.current.set('sena:catalog', catalog);
          readCacheRef.current.set('sena:observations', observations);
          readCacheRef.current.set('sena:order-batches:{}', orderBatches);
          readCacheRef.current.set('sena:summary', workspaceSummary);
          readCacheRef.current.set('sena:diagnostics', diagnostics);
          if (run) {
            readCacheRef.current.set(`sena:run:${run.runId}`, run);
            if (run.status === 'succeeded') {
              updateSenaMeta({ lastCompletedRunId: run.runId });
            }
          }
          const snapshot = deriveProjectedSnapshot(catalog, observations, workspaceSummary);
          const reports = deriveProjectedReports(observations);
          setStatePartial({
            catalog,
            diagnostics,
            latestRun: run ?? stateRef.current.latestRun,
            observations,
            orderBatches,
            reports,
            snapshot,
            workspaceSummary,
          });
          return catalog;
        }),
      archiveCatalogEntity: async ({ entityId, entityType }) =>
        withSaving(async () => {
          const currentCatalog = normalizeSenaCatalog(stateRef.current.catalog);
          if (!currentCatalog) {
            throw new Error('Catalog is not loaded.');
          }
          const nextCatalog =
            entityType === 'sku'
              ? archiveSenaSku(currentCatalog, entityId)
              : archiveSenaService(currentCatalog, entityId);
          const catalog = normalizeSenaCatalog(await window.banjiDesktop.sena.upsertCatalog(nextCatalog));
          invalidateSenaReads();
          readCacheRef.current.set('sena:catalog', catalog);
          setState((current) => ({
            ...current,
            catalog,
            snapshot: deriveProjectedSnapshot(catalog, current.observations, current.workspaceSummary),
          }));
          return catalog;
        }),
      unarchiveCatalogEntity: async ({ entityId, entityType }) =>
        withSaving(async () => {
          const currentCatalog = normalizeSenaCatalog(stateRef.current.catalog);
          if (!currentCatalog) {
            throw new Error('Catalog is not loaded.');
          }
          const nextCatalog =
            entityType === 'sku'
              ? unarchiveSenaSku(currentCatalog, entityId)
              : unarchiveSenaService(currentCatalog, entityId);
          const catalog = normalizeSenaCatalog(await window.banjiDesktop.sena.upsertCatalog(nextCatalog));
          invalidateSenaReads();
          readCacheRef.current.set('sena:catalog', catalog);
          setState((current) => ({
            ...current,
            catalog,
            snapshot: deriveProjectedSnapshot(catalog, current.observations, current.workspaceSummary),
          }));
          return catalog;
        }),
      loadSenaCatalog: async () => {
        const catalog = await loadWithCache('sena:catalog', () =>
          window.banjiDesktop.sena.getCatalog().then(normalizeSenaCatalog),
        );
        setStatePartial({ catalog });
        return catalog;
      },
      ingestSenaObservation: async (payload) =>
        withSaving(async () => {
          const observation = await window.banjiDesktop.sena.ingestObservation(payload);
          invalidateSenaReads();
          const recordUpdateContext = await refreshRecordUpdateContext();
          setState((current) => {
            const observations = [observation, ...current.observations];
            return {
              ...current,
              observationFingerprint: recordUpdateContext.observationFingerprint,
              observations,
              recordUpdateContext,
              reports: deriveProjectedReports(observations),
              snapshot: deriveProjectedSnapshot(current.catalog, observations, current.workspaceSummary),
            };
          });
          return observation;
        }),
      updateSenaObservation: async (payload) =>
        withSaving(async () => {
          const observation = await window.banjiDesktop.sena.updateObservation(payload);
          invalidateSenaReads();
          const recordUpdateContext = await refreshRecordUpdateContext();
          setState((current) => ({
            ...current,
            observations: current.observations.map((entry) =>
              entry.observationId === observation.observationId ? observation : entry,
            ),
            recordUpdateContext,
            reports: deriveProjectedReports(
              current.observations.map((entry) =>
                entry.observationId === observation.observationId ? observation : entry,
              ),
            ),
            snapshot: deriveProjectedSnapshot(
              current.catalog,
              current.observations.map((entry) =>
                entry.observationId === observation.observationId ? observation : entry,
              ),
              current.workspaceSummary,
            ),
          }));
          return observation;
        }),
      deleteSenaObservation: async (payload) =>
        withSaving(async () => {
          await window.banjiDesktop.sena.deleteObservation(payload);
          invalidateSenaReads();
          const recordUpdateContext = await refreshRecordUpdateContext();
          if (recordUpdateContext.observationFingerprint.count === 0) {
            readCacheRef.current.set('sena:summary', null);
            readCacheRef.current.set('sena:diagnostics', null);
            updateSenaMeta({ lastCompletedRunId: null });
            setStatePartial({
              diagnostics: null,
              latestRun: null,
              observations: [],
              observationFingerprint: recordUpdateContext.observationFingerprint,
              recordUpdateContext,
              reports: [],
              snapshot: deriveProjectedSnapshot(stateRef.current.catalog, [], null),
              workspaceSummary: null,
            });
            return;
          }
          setState((current) => {
            const observations = current.observations.filter((entry) => entry.observationId !== payload.observationId);
            return {
              ...current,
              observations,
              observationFingerprint: recordUpdateContext.observationFingerprint,
              recordUpdateContext,
              reports: deriveProjectedReports(observations),
              snapshot: deriveProjectedSnapshot(current.catalog, observations, current.workspaceSummary),
            };
          });
        }),
      listSenaObservationPage: async (payload) => {
        const key = `sena:observation-page:${JSON.stringify(payload ?? {})}`;
        const page = await loadWithCache(key, () => window.banjiDesktop.sena.listObservationPage(payload));
        if (!payload?.beforeObservedAt && !payload?.beforeObservationId) {
          const reports = deriveProjectedReports(page.observations);
          const snapshot = deriveProjectedSnapshot(
            stateRef.current.catalog,
            page.observations,
            stateRef.current.workspaceSummary,
          );
          setStatePartial({
            observations: page.observations,
            observationFingerprint: {
              count: page.totalCount,
              latestObservedAt: page.latestObservedAt,
              latestObservationId:
                page.observations[0]?.observationId ?? stateRef.current.observationFingerprint?.latestObservationId ?? null,
            },
            reports,
            snapshot,
          });
        }
        return page;
      },
      loadWorkSupportData: async (options) => {
        const includeObservations = options?.includeObservations ?? false;
        const observationLimit = options?.observationLimit ?? DEFAULT_INTERVAL_PAGE_LIMIT;
        const observationRequest = { limit: observationLimit } satisfies SenaObservationPageRequest;
        const [recordUpdateContext, orderBatches, observationPage] = await Promise.all([
          loadWithCache('sena:record-update-context', () => window.banjiDesktop.sena.getRecordUpdateContext()),
          loadWithCache('sena:order-batches:{}', () => window.banjiDesktop.sena.listOrderBatches()),
          includeObservations
            ? loadWithCache(`sena:observation-page:${JSON.stringify(observationRequest)}`, () =>
                window.banjiDesktop.sena.listObservationPage(observationRequest),
              )
            : Promise.resolve(null),
        ]);
        const observations = observationPage?.observations ?? stateRef.current.observations;
        setStatePartial({
          observationFingerprint: recordUpdateContext.observationFingerprint,
          observations,
          orderBatches,
          recordUpdateContext,
          reports: includeObservations ? deriveProjectedReports(observations) : stateRef.current.reports,
          snapshot: includeObservations
            ? deriveProjectedSnapshot(stateRef.current.catalog, observations, stateRef.current.workspaceSummary)
            : stateRef.current.snapshot,
        });
        readCacheRef.current.set('sena:observation-fingerprint', recordUpdateContext.observationFingerprint);
        return {
          observationPage,
          orderBatches,
          recordUpdateContext,
        };
      },
      loadSenaRecordUpdateContext: async () => {
        const recordUpdateContext = await loadWithCache('sena:record-update-context', () =>
          window.banjiDesktop.sena.getRecordUpdateContext(),
        );
        setStatePartial({
          observationFingerprint: recordUpdateContext.observationFingerprint,
          recordUpdateContext,
        });
        return recordUpdateContext;
      },
      listSenaObservations: async () => {
        const observations = await loadWithCache('sena:observations', () => window.banjiDesktop.sena.listObservations());
        setStatePartial({
          observations,
          reports: deriveProjectedReports(observations),
          snapshot: deriveProjectedSnapshot(
            stateRef.current.catalog,
            observations,
            stateRef.current.workspaceSummary,
          ),
        });
        return observations;
      },
      loadSenaObservations: async () => {
        const observations = await loadWithCache('sena:observations', () => window.banjiDesktop.sena.listObservations());
        setStatePartial({
          observations,
          reports: deriveProjectedReports(observations),
          snapshot: deriveProjectedSnapshot(
            stateRef.current.catalog,
            observations,
            stateRef.current.workspaceSummary,
          ),
        });
        return observations;
      },
      listSenaOrderBatches: async (payload) => {
        const key = `sena:order-batches:${JSON.stringify(payload ?? {})}`;
        const orderBatches = await loadWithCache(key, () => window.banjiDesktop.sena.listOrderBatches(payload));
        if (!payload || Object.keys(payload).length === 0) {
          setStatePartial({ orderBatches });
        }
        return orderBatches;
      },
      loadSenaOrderBatches: async (payload) => {
        const key = `sena:order-batches:${JSON.stringify(payload ?? {})}`;
        const orderBatches = await loadWithCache(key, () => window.banjiDesktop.sena.listOrderBatches(payload));
        if (!payload || Object.keys(payload).length === 0) {
          setStatePartial({ orderBatches });
        }
        return orderBatches;
      },
      createSenaOrderBatch: async (payload) =>
        withSaving(async () => {
          const batch = await window.banjiDesktop.sena.createOrderBatch(payload);
          invalidateSenaReads();
          const orderBatches = await window.banjiDesktop.sena.listOrderBatches();
          readCacheRef.current.set('sena:order-batches:{}', orderBatches);
          setStatePartial({ orderBatches });
          return batch;
        }),
      updateSenaOrderBatch: async (payload) =>
        withSaving(async () => {
          const batch = await window.banjiDesktop.sena.updateOrderBatch(payload);
          invalidateSenaReads();
          const orderBatches = await window.banjiDesktop.sena.listOrderBatches();
          readCacheRef.current.set('sena:order-batches:{}', orderBatches);
          setStatePartial({ orderBatches });
          return batch;
        }),
      updateSenaOrderChild: async (payload) =>
        withSaving(async () => {
          const batch = await window.banjiDesktop.sena.updateOrderChild(payload);
          invalidateSenaReads();
          const orderBatches = await window.banjiDesktop.sena.listOrderBatches();
          readCacheRef.current.set('sena:order-batches:{}', orderBatches);
          setStatePartial({ orderBatches });
          return batch;
        }),
      splitSenaOrderChild: async (payload) =>
        withSaving(async () => {
          const batch = await window.banjiDesktop.sena.splitOrderChild(payload);
          invalidateSenaReads();
          const orderBatches = await window.banjiDesktop.sena.listOrderBatches();
          readCacheRef.current.set('sena:order-batches:{}', orderBatches);
          setStatePartial({ orderBatches });
          return batch;
        }),
      triggerSenaRun: async (payload) =>
        withSaving(async () => {
          const run = await window.banjiDesktop.sena.triggerRun(payload);
          invalidateSenaReads();
          readCacheRef.current.set(`sena:run:${run.runId}`, run);
          if (run.status === 'succeeded') {
            updateSenaMeta({ lastCompletedRunId: run.runId });
          }
          const [workspaceSummary, diagnostics, recordUpdateContext] = await Promise.all([
            window.banjiDesktop.sena.getWorkspaceSummary(),
            window.banjiDesktop.sena.getDiagnostics(),
            window.banjiDesktop.sena.getRecordUpdateContext(),
          ]);
          readCacheRef.current.set('sena:summary', workspaceSummary);
          readCacheRef.current.set('sena:diagnostics', diagnostics);
          readCacheRef.current.set('sena:record-update-context', recordUpdateContext);
          readCacheRef.current.set('sena:observation-fingerprint', recordUpdateContext.observationFingerprint);
          const snapshot = deriveProjectedSnapshot(
            stateRef.current.catalog,
            stateRef.current.observations,
            workspaceSummary,
          );
          setStatePartial({
            diagnostics,
            latestRun: run,
            observationFingerprint: recordUpdateContext.observationFingerprint,
            recordUpdateContext,
            snapshot,
            workspaceSummary,
          });
          return run;
        }),
      retrySenaRun: async (payload) =>
        withSaving(async () => {
          const run = await window.banjiDesktop.sena.retryRun(payload);
          invalidateSenaReads();
          readCacheRef.current.set(`sena:run:${run.runId}`, run);
          if (run.status === 'succeeded') {
            updateSenaMeta({ lastCompletedRunId: run.runId });
          }
          const [workspaceSummary, diagnostics, recordUpdateContext] = await Promise.all([
            window.banjiDesktop.sena.getWorkspaceSummary(),
            window.banjiDesktop.sena.getDiagnostics(),
            window.banjiDesktop.sena.getRecordUpdateContext(),
          ]);
          readCacheRef.current.set('sena:summary', workspaceSummary);
          readCacheRef.current.set('sena:diagnostics', diagnostics);
          readCacheRef.current.set('sena:record-update-context', recordUpdateContext);
          readCacheRef.current.set('sena:observation-fingerprint', recordUpdateContext.observationFingerprint);
          const snapshot = deriveProjectedSnapshot(
            stateRef.current.catalog,
            stateRef.current.observations,
            workspaceSummary,
          );
          setStatePartial({
            diagnostics,
            latestRun: run,
            observationFingerprint: recordUpdateContext.observationFingerprint,
            recordUpdateContext,
            snapshot,
            workspaceSummary,
          });
          return run;
        }),
      runWorkspacePreparation,
      loadSenaWorkspaceSummary: async () => {
        const workspaceSummary = await loadWithCache('sena:summary', () => window.banjiDesktop.sena.getWorkspaceSummary());
        syncPersistentSenaDetailCache(workspaceSummary);
        const latestRun = await loadLatestRun(workspaceSummary?.runId ?? null);
        setStatePartial({
          latestRun,
          snapshot: deriveProjectedSnapshot(
            stateRef.current.catalog,
            stateRef.current.observations,
            workspaceSummary,
          ),
          workspaceSummary,
        });
        return workspaceSummary;
      },
      loadSenaSkuDetail: async (skuId, options) => {
        const beforeIntervalIndex = options?.beforeIntervalIndex ?? null;
        const limit = options?.limit ?? DEFAULT_INTERVAL_PAGE_LIMIT;
        const strategy = options?.strategy ?? 'cache-first';
        const key = `sena:sku:${skuId}:before:${beforeIntervalIndex ?? 'latest'}:limit:${limit}`;
        const freshnessFingerprint = deriveSenaDetailCacheFreshnessFingerprint(stateRef.current.workspaceSummary);
        const loadFresh = async () => {
          const page = normalizeSkuDetailPage(await window.banjiDesktop.sena.getSkuDetail({ skuId, beforeIntervalIndex, limit }), limit);
          if (typeof window !== 'undefined') {
            writePersistedSenaDetailPage({
              beforeIntervalIndex,
              entityId: skuId,
              entityType: 'sku',
              freshnessFingerprint,
              limit,
              page,
              storage: window.localStorage,
            });
          }
          return page;
        };
        if (strategy === 'network-only') {
          return loadFresh();
        }
        return loadSenaDetailPage({
          key,
          loadFresh,
          readPersisted: () =>
            typeof window === 'undefined'
              ? null
              : readPersistedSenaDetailPage({
                beforeIntervalIndex,
                entityId: skuId,
                entityType: 'sku',
                freshnessFingerprint,
                limit,
                storage: window.localStorage,
              }),
        });
      },
      loadSenaServiceDetail: async (serviceId, options) => {
        const beforeIntervalIndex = options?.beforeIntervalIndex ?? null;
        const limit = options?.limit ?? DEFAULT_INTERVAL_PAGE_LIMIT;
        const strategy = options?.strategy ?? 'cache-first';
        const key = `sena:service:${serviceId}:before:${beforeIntervalIndex ?? 'latest'}:limit:${limit}`;
        const freshnessFingerprint = deriveSenaDetailCacheFreshnessFingerprint(stateRef.current.workspaceSummary);
        const loadFresh = async () => {
          const page = normalizeServiceDetailPage(await window.banjiDesktop.sena.getServiceDetail({ serviceId, beforeIntervalIndex, limit }), limit);
          if (typeof window !== 'undefined') {
            writePersistedSenaDetailPage({
              beforeIntervalIndex,
              entityId: serviceId,
              entityType: 'service',
              freshnessFingerprint,
              limit,
              page,
              storage: window.localStorage,
            });
          }
          return page;
        };
        if (strategy === 'network-only') {
          return loadFresh();
        }
        return loadSenaDetailPage({
          key,
          loadFresh,
          readPersisted: () =>
            typeof window === 'undefined'
              ? null
              : readPersistedSenaDetailPage({
                beforeIntervalIndex,
                entityId: serviceId,
                entityType: 'service',
                freshnessFingerprint,
                limit,
                storage: window.localStorage,
              }),
        });
      },
      clearSenaSkuDetailCache: async (skuId) => clearSenaDetailCache('sku', skuId),
      clearSenaServiceDetailCache: async (serviceId) => clearSenaDetailCache('service', serviceId),
      loadSenaDiagnostics: async () => {
        const diagnostics = await loadWithCache('sena:diagnostics', () => window.banjiDesktop.sena.getDiagnostics());
        setStatePartial({ diagnostics });
        return diagnostics;
      },
      loadSenaRunStatus: async (runId) => {
        const run = await loadWithCache(`sena:run:${runId}`, () => window.banjiDesktop.sena.getRunStatus({ runId }));
        if (run?.status === 'succeeded') {
          updateSenaMeta({ lastCompletedRunId: run.runId });
        }
        if (stateRef.current.latestRun?.runId === runId || !stateRef.current.latestRun) {
          setStatePartial({ latestRun: run });
        }
        return run;
      },
    }),
    [clearSenaDetailCache, invalidateSenaReads, loadLatestRun, loadSenaDetailPage, loadWithCache, refreshRecordUpdateContext, reload, runWorkspacePreparation, setStatePartial, syncPersistentSenaDetailCache, updateSenaMeta, withSaving],
  );

  const stateValue = useMemo<InventoryStateValue>(
    () => ({
      ...state,
      senaMeta: senaMetaRef.current,
    }),
    [metaVersion, state],
  );

  return (
    <InventoryStateContext.Provider value={stateValue}>
      <InventoryActionsContext.Provider value={actions}>{children}</InventoryActionsContext.Provider>
    </InventoryStateContext.Provider>
  );
}

export function useInventoryState() {
  const context = useContext(InventoryStateContext);
  if (!context) {
    throw new Error('InventoryProvider state is missing');
  }
  return context;
}

export function useInventoryActions() {
  const context = useContext(InventoryActionsContext);
  if (!context) {
    throw new Error('InventoryProvider actions are missing');
  }
  return context;
}

export function useInventory() {
  const state = useInventoryState();
  const actions = useInventoryActions();
  return useMemo(() => ({ ...state, ...actions }), [actions, state]);
}
