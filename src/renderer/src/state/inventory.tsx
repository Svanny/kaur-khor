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
import type { InventorySnapshot, StockReport, StockReportSubmission } from '@shared/inventory';
import type { SenaEngineParameters } from '@shared/ipc';
import type {
  SenaAnalysisRunRecord,
  SenaCatalog,
  SenaCreateOrderBatchPayload,
  SenaObservationDeletePayload,
  SenaDiagnostics,
  SenaObservationInput,
  SenaObservationRecord,
  SenaOrderBatchRecord,
  SenaOrderLookupPayload,
  SenaSplitOrderChildPayload,
  SenaObservationUpdatePayload,
  SenaService,
  SenaServiceDetailPage,
  SenaSku,
  SenaSkuDetailPage,
  SenaUpdateOrderBatchPayload,
  SenaUpdateOrderChildPayload,
  SenaWorkspaceSummary,
} from '@shared/sena';
import { normalizeServiceDetailPage, normalizeSkuDetailPage } from '@/lib/sena-detail-pages';
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
  | SenaOrderBatchRecord[]
  | SenaWorkspaceSummary
  | SenaSkuDetailPage
  | SenaServiceDetailPage
  | SenaDiagnostics
  | SenaAnalysisRunRecord
  | null;

const DEFAULT_INTERVAL_PAGE_LIMIT = 20;

type SenaDetailLoadStrategy = 'cache-first' | 'network-only';
type SenaDetailLoadOptions = {
  beforeIntervalIndex?: number | null;
  limit?: number;
  strategy?: SenaDetailLoadStrategy;
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
  observations: SenaObservationRecord[];
  orderBatches: SenaOrderBatchRecord[];
  senaMeta: SenaMetaCache;
  workspaceSummary: SenaWorkspaceSummary | null;
  reload: () => Promise<void>;
  loadInventorySnapshot: () => Promise<InventorySnapshot>;
  listStockReports: () => Promise<StockReport[]>;
  submitLegacyReport: (payload: StockReportSubmission) => Promise<StockReport>;
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

const InventoryContext = createContext<InventoryContextValue | null>(null);

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
    observations: [] as SenaObservationRecord[],
    orderBatches: [] as SenaOrderBatchRecord[],
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
  const recipeUsageHints = input.recipeUsageHints ?? [];
  const hasChange =
    serviceSalesSnapshot.some((snapshot) => snapshot.serviceId === payload.previousId) ||
    serviceRankings.includes(payload.previousId) ||
    serviceStockouts.includes(payload.previousId) ||
    servicePrices.some((price) => price.serviceId === payload.previousId) ||
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

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => emptyState());
  const readCacheRef = useRef<Map<string, ReadCacheValue>>(new Map());
  const inflightRef = useRef<Map<string, Promise<ReadCacheValue>>>(new Map());
  const activeDetailFreshnessFingerprintRef = useRef<string | null>(null);
  const workspacePreparationDepthRef = useRef(0);
  const senaMetaRef = useRef<SenaMetaCache>({
    catalogHash: null,
    lastBootstrapSkuId: null,
    lastCompletedRunId: null,
  });
  const [, bumpMetaVersion] = useState(0);

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

  useEffect(() => {
    syncPersistentSenaDetailCache(state.workspaceSummary);
  }, [state.workspaceSummary, syncPersistentSenaDetailCache]);

  const reload = useCallback(async () => {
    setState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      readCacheRef.current.clear();
      inflightRef.current.clear();
      const [catalog, workspaceSummary, diagnostics, observations, orderBatches] = await Promise.all([
        window.banjiDesktop.sena.getCatalog().then(normalizeSenaCatalog),
        window.banjiDesktop.sena.getWorkspaceSummary(),
        window.banjiDesktop.sena.getDiagnostics(),
        window.banjiDesktop.sena.listObservations(),
        window.banjiDesktop.sena.listOrderBatches(),
      ]);
      readCacheRef.current.set('sena:catalog', catalog);
      readCacheRef.current.set('sena:summary', workspaceSummary);
      readCacheRef.current.set('sena:diagnostics', diagnostics);
      readCacheRef.current.set('sena:observations', observations);
      readCacheRef.current.set('sena:order-batches:{}', orderBatches);
      const latestRun = await loadLatestRun(workspaceSummary?.runId ?? null);
      setState({
        snapshot: null,
        reports: [],
        catalog,
        diagnostics,
        error: null,
        isLoading: false,
        isSaving: false,
        latestRun,
        observations,
        orderBatches,
        workspaceSummary,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        error: error instanceof Error ? error.message : 'Failed to load inventory workspace.',
        isLoading: false,
      }));
    }
  }, [loadLatestRun]);

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

  const value = useMemo<InventoryContextValue>(
    () => ({
      ...state,
      senaMeta: senaMetaRef.current,
      reload,
      updateSenaMeta,
      loadInventorySnapshot: async () => {
        const snapshot = await loadWithCache('legacy:snapshot', () => window.banjiDesktop.inventory.loadSnapshot());
        setStatePartial({ snapshot });
        return snapshot;
      },
      listStockReports: async () => {
        const reports = await loadWithCache('legacy:reports', () => window.banjiDesktop.inventory.listReports());
        setStatePartial({ reports });
        return reports;
      },
      submitLegacyReport: async (payload) =>
        withSaving(async () => {
          const report = await window.banjiDesktop.inventory.submitReport(payload);
          readCacheRef.current.delete('legacy:snapshot');
          readCacheRef.current.delete('legacy:reports');
          const [snapshot, reports] = await Promise.all([
            window.banjiDesktop.inventory.loadSnapshot(),
            window.banjiDesktop.inventory.listReports(),
          ]);
          readCacheRef.current.set('legacy:snapshot', snapshot);
          readCacheRef.current.set('legacy:reports', reports);
          setStatePartial({ reports, snapshot });
          return report;
        }),
      upsertSenaCatalog: async (payload) =>
        withSaving(async () => {
          const catalog = normalizeSenaCatalog(await window.banjiDesktop.sena.upsertCatalog(payload));
          invalidateSenaReads();
          readCacheRef.current.set('sena:catalog', catalog);
          setStatePartial({ catalog });
          return catalog;
        }),
      renameCatalogEntity: async (payload) =>
        withSaving(async () => {
          const currentCatalog = normalizeSenaCatalog(state.catalog);
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
                  algorithmVersion: state.latestRun?.algorithmVersion ?? 'sena-analysis-v3',
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
          setStatePartial({
            catalog,
            diagnostics,
            latestRun: run ?? state.latestRun,
            observations,
            orderBatches,
            workspaceSummary,
          });
          return catalog;
        }),
      archiveCatalogEntity: async ({ entityId, entityType }) =>
        withSaving(async () => {
          const currentCatalog = normalizeSenaCatalog(state.catalog);
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
          setStatePartial({ catalog });
          return catalog;
        }),
      unarchiveCatalogEntity: async ({ entityId, entityType }) =>
        withSaving(async () => {
          const currentCatalog = normalizeSenaCatalog(state.catalog);
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
          setStatePartial({ catalog });
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
          const observations = await window.banjiDesktop.sena.listObservations();
          readCacheRef.current.set('sena:observations', observations);
          setStatePartial({ observations });
          return observation;
        }),
      updateSenaObservation: async (payload) =>
        withSaving(async () => {
          const observation = await window.banjiDesktop.sena.updateObservation(payload);
          invalidateSenaReads();
          const observations = await window.banjiDesktop.sena.listObservations();
          readCacheRef.current.set('sena:observations', observations);
          setStatePartial({ observations });
          return observation;
        }),
      deleteSenaObservation: async (payload) =>
        withSaving(async () => {
          await window.banjiDesktop.sena.deleteObservation(payload);
          invalidateSenaReads();
          const observations = await window.banjiDesktop.sena.listObservations();
          readCacheRef.current.set('sena:observations', observations);
          if (observations.length === 0) {
            readCacheRef.current.set('sena:summary', null);
            readCacheRef.current.set('sena:diagnostics', null);
            updateSenaMeta({ lastCompletedRunId: null });
            setStatePartial({
              diagnostics: null,
              latestRun: null,
              observations,
              workspaceSummary: null,
            });
            return;
          }
          setStatePartial({ observations });
        }),
      listSenaObservations: async () => {
        const observations = await loadWithCache('sena:observations', () => window.banjiDesktop.sena.listObservations());
        setStatePartial({ observations });
        return observations;
      },
      loadSenaObservations: async () => {
        const observations = await loadWithCache('sena:observations', () => window.banjiDesktop.sena.listObservations());
        setStatePartial({ observations });
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
          const [workspaceSummary, diagnostics, observations] = await Promise.all([
            window.banjiDesktop.sena.getWorkspaceSummary(),
            window.banjiDesktop.sena.getDiagnostics(),
            window.banjiDesktop.sena.listObservations(),
          ]);
          readCacheRef.current.set('sena:summary', workspaceSummary);
          readCacheRef.current.set('sena:diagnostics', diagnostics);
          readCacheRef.current.set('sena:observations', observations);
          setStatePartial({
            diagnostics,
            latestRun: run,
            observations,
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
          const [workspaceSummary, diagnostics, observations] = await Promise.all([
            window.banjiDesktop.sena.getWorkspaceSummary(),
            window.banjiDesktop.sena.getDiagnostics(),
            window.banjiDesktop.sena.listObservations(),
          ]);
          readCacheRef.current.set('sena:summary', workspaceSummary);
          readCacheRef.current.set('sena:diagnostics', diagnostics);
          readCacheRef.current.set('sena:observations', observations);
          setStatePartial({
            diagnostics,
            latestRun: run,
            observations,
            workspaceSummary,
          });
          return run;
        }),
      runWorkspacePreparation,
      loadSenaWorkspaceSummary: async () => {
        const workspaceSummary = await loadWithCache('sena:summary', () => window.banjiDesktop.sena.getWorkspaceSummary());
        syncPersistentSenaDetailCache(workspaceSummary);
        const latestRun = await loadLatestRun(workspaceSummary?.runId ?? null);
        setStatePartial({ latestRun, workspaceSummary });
        return workspaceSummary;
      },
      loadSenaSkuDetail: async (skuId, options) => {
        const beforeIntervalIndex = options?.beforeIntervalIndex ?? null;
        const limit = options?.limit ?? DEFAULT_INTERVAL_PAGE_LIMIT;
        const strategy = options?.strategy ?? 'cache-first';
        const key = `sena:sku:${skuId}:before:${beforeIntervalIndex ?? 'latest'}:limit:${limit}`;
        const freshnessFingerprint = deriveSenaDetailCacheFreshnessFingerprint(state.workspaceSummary);
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
        const freshnessFingerprint = deriveSenaDetailCacheFreshnessFingerprint(state.workspaceSummary);
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
        if (state.latestRun?.runId === runId || !state.latestRun) {
          setStatePartial({ latestRun: run });
        }
        return run;
      },
    }),
    [clearSenaDetailCache, invalidateSenaReads, loadLatestRun, loadSenaDetailPage, loadWithCache, reload, runWorkspacePreparation, setStatePartial, state, syncPersistentSenaDetailCache, updateSenaMeta, withSaving],
  );

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const context = useContext(InventoryContext);
  if (!context) {
    throw new Error('InventoryProvider is missing');
  }
  return context;
}
