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
import { traceRenderer } from '@/lib/trace';

type ReadCacheKey = `sku:${string}` | `service:${string}` | 'reports' | 'snapshot' | 'system';

type ReadResultMap = {
  reports: StockReport[];
  snapshot: InventorySnapshot;
  system: SistSystemDetail;
  [key: `sku:${string}`]: SistSkuDetail;
  [key: `service:${string}`]: SistServiceDetail;
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

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<InventoryState>(() => emptyState());
  const requestCounterRef = useRef(0);
  const stateRef = useRef(state);
  const readCacheRef = useRef<Partial<ReadResultMap>>({});
  const inflightReadsRef = useRef<Partial<Record<ReadCacheKey, Promise<unknown>>>>({});

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

  function primeReadCache<K extends ReadCacheKey>(key: K, value: ReadResultMap[K]) {
    readCacheRef.current[key] = value;
    traceRenderer('inventory', 'cache-store', { key });
  }

  function invalidateReadCaches(reason: string) {
    readCacheRef.current = {};
    inflightReadsRef.current = {};
    traceRenderer('inventory', 'cache-invalidate', { reason });
  }

  async function readThroughCache<K extends ReadCacheKey>(
    key: K,
    command: string,
    run: () => Promise<ReadResultMap[K]>,
  ): Promise<ReadResultMap[K]> {
    const cached = readCacheRef.current[key];
    if (cached !== undefined) {
      traceRenderer('inventory', 'cache-hit', { key, command });
      return cached as ReadResultMap[K];
    }

    const inflight = inflightReadsRef.current[key];
    if (inflight) {
      traceRenderer('inventory', 'cache-await-inflight', { key, command });
      return (await inflight) as ReadResultMap[K];
    }

    traceRenderer('inventory', 'cache-miss', { key, command });
    const request = traceRequest(command, run)
      .then((result) => {
        primeReadCache(key, result);
        delete inflightReadsRef.current[key];
        return result;
      })
      .catch((error) => {
        delete inflightReadsRef.current[key];
        throw error;
      });
    inflightReadsRef.current[key] = request;
    return request;
  }

  const reload = useCallback(async () => {
    invalidateReadCaches('reload');
    setState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const snapshot = await readThroughCache('snapshot', 'inventory.getSnapshot', () =>
        window.banjiDesktop.inventory.getSnapshot(),
      );
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
  }, []);

  useEffect(() => {
    traceRenderer('inventory', 'provider-mount', { source: 'InventoryProvider.useEffect' });
    void reload();
  }, [reload]);

  const mutate = useCallback(
    async (task: () => Promise<InventorySnapshot>) => {
      invalidateReadCaches('mutation-start');
      setState((current) => ({ ...current, isSaving: true, error: null }));
      try {
        const snapshot = await task();
        primeReadCache('snapshot', snapshot);
        setState({
          snapshot,
          isLoading: false,
          isSaving: false,
          error: null,
        });
      } catch (error) {
        const normalizedError =
          error instanceof Error ? error : new Error('save failed');
        setState((current) => ({
          ...current,
          isSaving: false,
          error: normalizedError.message,
        }));
        throw normalizedError;
      }
    },
    [reload],
  );

  const value = useMemo<InventoryContextValue>(
    () => ({
      ...state,
      reload,
      saveSku: async (payload) => {
        await mutate(() =>
          window.banjiDesktop.inventory.saveSku({
            sku: payload,
          }),
        );
      },
      saveService: async (payload) => {
        await mutate(() =>
          window.banjiDesktop.inventory.saveService({
            service: payload,
          }),
        );
      },
      saveStock: async (updates) => {
        await mutate(() =>
          window.banjiDesktop.inventory.applyStockUpdates({ updates }),
        );
      },
      submitReport: async (payload) => {
        await mutate(() => window.banjiDesktop.inventory.submitStockReport(payload));
      },
      updateReport: async (payload) => {
        await mutate(() => window.banjiDesktop.inventory.updateStockReport(payload));
      },
      deleteReport: async (payload) => {
        await mutate(() => window.banjiDesktop.inventory.deleteStockReport(payload));
      },
      persistRanking: async (entries) => {
        await mutate(() => window.banjiDesktop.inventory.saveRanking({ entries }));
      },
      saveSistSettings: async (payload) => {
        await mutate(() => window.banjiDesktop.inventory.updateSistSettings(payload));
      },
      loadSistSystemDetail: async () =>
        readThroughCache('system', 'inventory.getSistSystemDetail', () =>
          window.banjiDesktop.inventory.getSistSystemDetail(),
        ),
      loadSistServiceDetail: async (serviceId) =>
        readThroughCache(`service:${serviceId}`, 'inventory.getSistServiceDetail', () =>
          window.banjiDesktop.inventory.getSistServiceDetail({ serviceId }),
        ),
      loadSistSkuDetail: async (skuId) =>
        readThroughCache(`sku:${skuId}`, 'inventory.getSistSkuDetail', () =>
          window.banjiDesktop.inventory.getSistSkuDetail({ skuId }),
        ),
      listStockReports: async () =>
        readThroughCache('reports', 'inventory.listStockReports', () =>
          window.banjiDesktop.inventory.listStockReports(),
        ),
    }),
    [mutate, reload, state],
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
