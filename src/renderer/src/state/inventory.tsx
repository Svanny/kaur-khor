import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
  type ReactNode,
} from 'react';
import type {
  InventorySnapshot,
  InventoryState,
  RankingEntry,
  SistSettings,
  SistServiceDetail,
  SistSkuDetail,
  SistSystemDetail,
  StockReport,
  StockReportDeletePayload,
  StockReportSubmission,
  StockReportUpdatePayload,
  UpsertServicePayload,
  UpsertSkuPayload,
} from '@shared/inventory';
import type {
  SenaAnalysisRunRecord,
  SenaCatalog,
  SenaDiagnostics,
  SenaObservationRecord,
  SenaServiceDetail,
  SenaSkuDetail,
  SenaWorkspaceSummary,
} from '@shared/sena';
import { traceRenderer } from '@/lib/trace';

type LegacyReadCacheKey = `sku:${string}` | `service:${string}` | 'reports' | 'snapshot' | 'system';
type SenaReadCacheKey =
  | 'catalog'
  | 'workspace-summary'
  | 'diagnostics'
  | 'observations'
  | `sku-detail:${string}`
  | `service-detail:${string}`;

type LegacyReadResultMap = {
  reports: StockReport[];
  snapshot: InventorySnapshot;
  system: SistSystemDetail;
  [key: `sku:${string}`]: SistSkuDetail;
  [key: `service:${string}`]: SistServiceDetail;
};

type SenaReadResultMap = {
  catalog: SenaCatalog | null;
  'workspace-summary': SenaWorkspaceSummary | null;
  diagnostics: SenaDiagnostics | null;
  observations: SenaObservationRecord[];
  [key: `sku-detail:${string}`]: SenaSkuDetail | null;
  [key: `service-detail:${string}`]: SenaServiceDetail | null;
};

interface InventoryContextValue extends InventoryState {
  reload: () => Promise<void>;
  saveSku: (payload: UpsertSkuPayload) => Promise<void>;
  saveService: (payload: UpsertServicePayload) => Promise<void>;
  saveStock: (
    updates: Array<{ skuId: string; unitsInStock: number; costPerUnit: number }>,
  ) => Promise<void>;
  submitReport: (payload: StockReportSubmission) => Promise<void>;
  updateReport: (payload: StockReportUpdatePayload) => Promise<void>;
  deleteReport: (payload: StockReportDeletePayload) => Promise<void>;
  persistRanking: (entries: RankingEntry[]) => Promise<void>;
  saveSistSettings: (payload: SistSettings) => Promise<void>;
  loadSistSystemDetail: () => Promise<SistSystemDetail>;
  loadSistServiceDetail: (serviceId: string) => Promise<SistServiceDetail>;
  loadSistSkuDetail: (skuId: string) => Promise<SistSkuDetail>;
  listStockReports: () => Promise<StockReport[]>;
  loadSenaCatalog: () => Promise<SenaCatalog | null>;
  loadSenaObservations: () => Promise<SenaObservationRecord[]>;
  upsertSenaCatalog: (payload: SenaCatalog) => Promise<SenaCatalog>;
  triggerSenaRun: (payload?: { algorithmVersion?: string }) => Promise<SenaAnalysisRunRecord>;
  loadSenaWorkspaceSummary: () => Promise<SenaWorkspaceSummary | null>;
  loadSenaSkuDetail: (skuId: string) => Promise<SenaSkuDetail | null>;
  loadSenaDiagnostics: () => Promise<SenaDiagnostics | null>;
  loadSenaServiceDetail: (serviceId: string) => Promise<SenaServiceDetail | null>;
}

const InventoryContext = createContext<InventoryContextValue | null>(null);

function emptyState(): InventoryState {
  return {
    snapshot: null,
    isLoading: true,
    isSaving: false,
    error: null,
  };
}

function primeCache<K extends string, M extends Record<K, unknown>>(
  cacheRef: MutableRefObject<Partial<M>>,
  key: K,
  value: M[K],
  scope: 'inventory' | 'inventory-sena',
) {
  cacheRef.current[key] = value;
  traceRenderer(scope, 'cache-store', { key });
}

function invalidateCaches<M extends Record<string, unknown>>(
  cacheRef: MutableRefObject<Partial<M>>,
  inflightRef: MutableRefObject<Partial<Record<keyof M & string, Promise<unknown>>>>,
  reason: string,
  scope: 'inventory' | 'inventory-sena',
) {
  cacheRef.current = {};
  inflightRef.current = {};
  traceRenderer(scope, 'cache-invalidate', { reason });
}

async function readThroughCache<K extends string, M extends Record<K, unknown>>({
  key,
  command,
  scope,
  cacheRef,
  inflightRef,
  traceRequest,
  run,
}: {
  key: K;
  command: string;
  scope: 'inventory' | 'inventory-sena';
  cacheRef: MutableRefObject<Partial<M>>;
  inflightRef: MutableRefObject<Partial<Record<K, Promise<unknown>>>>;
  traceRequest: <T>(commandName: string, task: () => Promise<T>) => Promise<T>;
  run: () => Promise<M[K]>;
}) {
  const cached = cacheRef.current[key];
  if (cached !== undefined) {
    traceRenderer(scope, 'cache-hit', { key, command });
    return cached as M[K];
  }

  const inflight = inflightRef.current[key];
  if (inflight) {
    traceRenderer(scope, 'cache-await-inflight', { key, command });
    return (await inflight) as M[K];
  }

  traceRenderer(scope, 'cache-miss', { key, command });
  const request = traceRequest(command, run)
    .then((result) => {
      primeCache(cacheRef, key, result, scope);
      delete inflightRef.current[key];
      return result;
    })
    .catch((error) => {
      delete inflightRef.current[key];
      throw error;
    });
  inflightRef.current[key] = request;
  return request;
}

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<InventoryState>(() => emptyState());
  const requestCounterRef = useRef(0);
  const stateRef = useRef(state);
  const legacyReadCacheRef = useRef<Partial<LegacyReadResultMap>>({});
  const legacyInflightReadsRef = useRef<Partial<Record<LegacyReadCacheKey, Promise<unknown>>>>({});
  const senaReadCacheRef = useRef<Partial<SenaReadResultMap>>({});
  const senaInflightReadsRef = useRef<Partial<Record<SenaReadCacheKey, Promise<unknown>>>>({});

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  function nextRequestId() {
    requestCounterRef.current += 1;
    return requestCounterRef.current;
  }

  async function traceRequest<T>(
    command: string,
    run: () => Promise<T>,
  ): Promise<T> {
    const requestId = nextRequestId();
    const startedAt = performance.now();
    const currentState = stateRef.current;
    traceRenderer('inventory', 'request-start', {
      command,
      requestId,
      snapshotLoaded: currentState.snapshot !== null,
      isLoading: currentState.isLoading,
      isSaving: currentState.isSaving,
    });
    try {
      const result = await run();
      traceRenderer('inventory', 'request-success', {
        command,
        requestId,
        elapsedMs: Math.round(performance.now() - startedAt),
      });
      return result;
    } catch (error) {
      traceRenderer('inventory', 'request-error', {
        command,
        requestId,
        elapsedMs: Math.round(performance.now() - startedAt),
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  const invalidateLegacyReadCaches = useCallback((reason: string) => {
    invalidateCaches(legacyReadCacheRef, legacyInflightReadsRef, reason, 'inventory');
  }, []);

  const invalidateSenaReadCaches = useCallback((reason: string) => {
    invalidateCaches(senaReadCacheRef, senaInflightReadsRef, reason, 'inventory-sena');
  }, []);

  const reload = useCallback(async () => {
    invalidateLegacyReadCaches('reload');
    setState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const snapshot = await readThroughCache({
        key: 'snapshot',
        command: 'inventory.getSnapshot',
        scope: 'inventory',
        cacheRef: legacyReadCacheRef,
        inflightRef: legacyInflightReadsRef,
        traceRequest,
        run: () => window.banjiDesktop.inventory.getSnapshot(),
      });
      setState({
        snapshot,
        isLoading: false,
        isSaving: false,
        error: null,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        isLoading: false,
        error: error instanceof Error ? error.message : 'failed to load inventory',
      }));
    }
  }, [invalidateLegacyReadCaches]);

  useEffect(() => {
    traceRenderer('inventory', 'provider-mount', { source: 'InventoryProvider.useEffect' });
    void reload();
  }, [reload]);

  const mutateInventory = useCallback(async (task: () => Promise<InventorySnapshot>) => {
    invalidateLegacyReadCaches('mutation-start');
    invalidateSenaReadCaches('inventory-mutation-start');
    setState((current) => ({ ...current, isSaving: true, error: null }));
    try {
      const snapshot = await task();
      primeCache(legacyReadCacheRef, 'snapshot', snapshot, 'inventory');
      setState({
        snapshot,
        isLoading: false,
        isSaving: false,
        error: null,
      });
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error('save failed');
      setState((current) => ({
        ...current,
        isSaving: false,
        error: normalizedError.message,
      }));
      throw normalizedError;
    }
  }, [invalidateLegacyReadCaches, invalidateSenaReadCaches]);

  const mutateSena = useCallback(async <T,>({
    command,
    task,
    reason,
    prime,
  }: {
    command: string;
    task: () => Promise<T>;
    reason: string;
    prime?: (result: T) => void;
  }) => {
    invalidateSenaReadCaches(reason);
    setState((current) => ({ ...current, isSaving: true, error: null }));
    try {
      const result = await traceRequest(command, task);
      prime?.(result);
      setState((current) => ({ ...current, isSaving: false, error: null }));
      return result;
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error('SENA mutation failed');
      setState((current) => ({
        ...current,
        isSaving: false,
        error: normalizedError.message,
      }));
      throw normalizedError;
    }
  }, [invalidateSenaReadCaches]);

  const value = useMemo<InventoryContextValue>(
    () => ({
      ...state,
      reload,
      saveSku: async (payload) => {
        await mutateInventory(() =>
          window.banjiDesktop.inventory.saveSku({
            sku: payload,
          }),
        );
      },
      saveService: async (payload) => {
        await mutateInventory(() =>
          window.banjiDesktop.inventory.saveService({
            service: payload,
          }),
        );
      },
      saveStock: async (updates) => {
        await mutateInventory(() =>
          window.banjiDesktop.inventory.applyStockUpdates({ updates }),
        );
      },
      submitReport: async (payload) => {
        await mutateInventory(() => window.banjiDesktop.inventory.submitStockReport(payload));
      },
      updateReport: async (payload) => {
        await mutateInventory(() => window.banjiDesktop.inventory.updateStockReport(payload));
      },
      deleteReport: async (payload) => {
        await mutateInventory(() => window.banjiDesktop.inventory.deleteStockReport(payload));
      },
      persistRanking: async (entries) => {
        await mutateInventory(() => window.banjiDesktop.inventory.saveRanking({ entries }));
      },
      saveSistSettings: async (payload) => {
        await mutateInventory(() => window.banjiDesktop.inventory.updateSistSettings(payload));
      },
      loadSistSystemDetail: async () =>
        readThroughCache({
          key: 'system',
          command: 'inventory.getSistSystemDetail',
          scope: 'inventory',
          cacheRef: legacyReadCacheRef,
          inflightRef: legacyInflightReadsRef,
          traceRequest,
          run: () => window.banjiDesktop.inventory.getSistSystemDetail(),
        }),
      loadSistServiceDetail: async (serviceId) =>
        readThroughCache({
          key: `service:${serviceId}`,
          command: 'inventory.getSistServiceDetail',
          scope: 'inventory',
          cacheRef: legacyReadCacheRef,
          inflightRef: legacyInflightReadsRef,
          traceRequest,
          run: () => window.banjiDesktop.inventory.getSistServiceDetail({ serviceId }),
        }),
      loadSistSkuDetail: async (skuId) =>
        readThroughCache({
          key: `sku:${skuId}`,
          command: 'inventory.getSistSkuDetail',
          scope: 'inventory',
          cacheRef: legacyReadCacheRef,
          inflightRef: legacyInflightReadsRef,
          traceRequest,
          run: () => window.banjiDesktop.inventory.getSistSkuDetail({ skuId }),
        }),
      listStockReports: async () =>
        readThroughCache({
          key: 'reports',
          command: 'inventory.listStockReports',
          scope: 'inventory',
          cacheRef: legacyReadCacheRef,
          inflightRef: legacyInflightReadsRef,
          traceRequest,
          run: () => window.banjiDesktop.inventory.listStockReports(),
        }),
      loadSenaCatalog: async () =>
        readThroughCache({
          key: 'catalog',
          command: 'sena.getCatalog',
          scope: 'inventory-sena',
          cacheRef: senaReadCacheRef,
          inflightRef: senaInflightReadsRef,
          traceRequest,
          run: () => window.banjiDesktop.inventory.getSenaCatalog(),
        }),
      loadSenaObservations: async () =>
        readThroughCache({
          key: 'observations',
          command: 'sena.listObservations',
          scope: 'inventory-sena',
          cacheRef: senaReadCacheRef,
          inflightRef: senaInflightReadsRef,
          traceRequest,
          run: () => window.banjiDesktop.inventory.listSenaObservations(),
        }),
      upsertSenaCatalog: async (payload) =>
        mutateSena({
          command: 'sena.upsertCatalog',
          reason: 'sena-upsert-catalog',
          task: () => window.banjiDesktop.inventory.upsertSenaCatalog(payload),
          prime: (catalog) => {
            primeCache(senaReadCacheRef, 'catalog', catalog, 'inventory-sena');
          },
        }),
      triggerSenaRun: async (payload) =>
        mutateSena({
          command: 'sena.triggerRun',
          reason: 'sena-trigger-run',
          task: () => window.banjiDesktop.inventory.triggerSenaRun(payload),
        }),
      loadSenaWorkspaceSummary: async () =>
        readThroughCache({
          key: 'workspace-summary',
          command: 'sena.getWorkspaceSummary',
          scope: 'inventory-sena',
          cacheRef: senaReadCacheRef,
          inflightRef: senaInflightReadsRef,
          traceRequest,
          run: () => window.banjiDesktop.inventory.getSenaWorkspaceSummary(),
        }),
      loadSenaSkuDetail: async (skuId) =>
        readThroughCache({
          key: `sku-detail:${skuId}`,
          command: 'sena.getSkuDetail',
          scope: 'inventory-sena',
          cacheRef: senaReadCacheRef,
          inflightRef: senaInflightReadsRef,
          traceRequest,
          run: () => window.banjiDesktop.inventory.getSenaSkuDetail({ skuId }),
        }),
      loadSenaDiagnostics: async () =>
        readThroughCache({
          key: 'diagnostics',
          command: 'sena.getDiagnostics',
          scope: 'inventory-sena',
          cacheRef: senaReadCacheRef,
          inflightRef: senaInflightReadsRef,
          traceRequest,
          run: () => window.banjiDesktop.inventory.getSenaDiagnostics(),
        }),
      loadSenaServiceDetail: async (serviceId) =>
        readThroughCache({
          key: `service-detail:${serviceId}`,
          command: 'sena.getServiceDetail',
          scope: 'inventory-sena',
          cacheRef: senaReadCacheRef,
          inflightRef: senaInflightReadsRef,
          traceRequest,
          run: () => window.banjiDesktop.inventory.getSenaServiceDetail({ serviceId }),
        }),
    }),
    [mutateInventory, mutateSena, reload, state],
  );

  return <InventoryContext.Provider value={value}>{children}</InventoryContext.Provider>;
}

export function useInventory() {
  const value = useContext(InventoryContext);
  if (!value) {
    throw new Error('InventoryProvider is missing');
  }
  return value;
}

export function requireSnapshot(snapshot: InventorySnapshot | null): InventorySnapshot {
  if (!snapshot) {
    throw new Error('inventory snapshot is not loaded');
  }
  return snapshot;
}
