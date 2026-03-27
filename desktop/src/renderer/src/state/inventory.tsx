import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { BackendStatus } from '@shared/ipc';
import type {
  InventorySnapshot,
  InventoryState,
  RankingEntry,
  SistSettings,
  SistSkuDetail,
  StockReportSubmission,
  UpsertServicePayload,
  UpsertSkuPayload,
} from '@shared/inventory';
import {
  applyStockUpdates,
  createService,
  createSku,
  fetchInventory,
  fetchSistSkuDetail,
  saveRanking,
  submitStockReport,
  updateSistSettings,
  updateService,
  updateSku,
} from '../lib/api';

interface InventoryContextValue extends InventoryState {
  reload: () => Promise<void>;
  saveSku: (payload: UpsertSkuPayload, isNew: boolean) => Promise<void>;
  saveService: (payload: UpsertServicePayload, isNew: boolean) => Promise<void>;
  saveStock: (
    updates: Array<{ skuId: string; unitsInStock: number; costPerUnit: number }>,
  ) => Promise<void>;
  submitReport: (payload: StockReportSubmission) => Promise<void>;
  persistRanking: (entries: RankingEntry[]) => Promise<void>;
  saveSistSettings: (payload: SistSettings) => Promise<void>;
  loadSistSkuDetail: (skuId: string) => Promise<SistSkuDetail>;
}

const InventoryContext = createContext<InventoryContextValue | null>(null);

function emptyState(backendStatus: BackendStatus): InventoryState {
  return {
    snapshot: null,
    isLoading: backendStatus === 'starting',
    isSaving: false,
    error: null,
    backendStatus,
  };
}

export function InventoryProvider({
  apiBaseUrl,
  backendStatus,
  children,
}: {
  apiBaseUrl: string;
  backendStatus: BackendStatus;
  children: ReactNode;
}) {
  const [state, setState] = useState<InventoryState>(() => emptyState(backendStatus));

  const reload = useCallback(async () => {
    if (!apiBaseUrl) {
      setState((current) => ({ ...current, isLoading: false }));
      return;
    }

    setState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const snapshot = await fetchInventory(apiBaseUrl);
      setState({
        snapshot,
        isLoading: false,
        isSaving: false,
        error: null,
        backendStatus,
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        isLoading: false,
        error: error instanceof Error ? error.message : 'failed to load inventory',
      }));
    }
  }, [apiBaseUrl, backendStatus]);

  useEffect(() => {
    setState((current) => ({ ...current, backendStatus }));
    if (backendStatus === 'ready' && apiBaseUrl) {
      void reload();
    }
  }, [apiBaseUrl, backendStatus, reload]);

  const mutate = useCallback(
    async (task: () => Promise<unknown>) => {
      setState((current) => ({ ...current, isSaving: true, error: null }));
      try {
        await task();
        await reload();
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
      saveSku: async (payload, isNew) => {
        await mutate(async () => {
          if (isNew) {
            await createSku(apiBaseUrl, payload);
            return;
          }
          await updateSku(apiBaseUrl, payload.skuId, payload);
        });
      },
      saveService: async (payload, isNew) => {
        await mutate(async () => {
          if (isNew) {
            await createService(apiBaseUrl, payload);
            return;
          }
          await updateService(apiBaseUrl, payload.serviceId, payload);
        });
      },
      saveStock: async (updates) => {
        await mutate(async () => {
          await applyStockUpdates(apiBaseUrl, { updates });
        });
      },
      submitReport: async (payload) => {
        await mutate(async () => {
          await submitStockReport(apiBaseUrl, payload);
        });
      },
      persistRanking: async (entries) => {
        await mutate(async () => {
          await saveRanking(apiBaseUrl, { entries });
        });
      },
      saveSistSettings: async (payload) => {
        await mutate(async () => {
          await updateSistSettings(apiBaseUrl, payload);
        });
      },
      loadSistSkuDetail: async (skuId) => fetchSistSkuDetail(apiBaseUrl, skuId),
    }),
    [apiBaseUrl, mutate, reload, state],
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
