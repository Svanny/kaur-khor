import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type {
  InventorySnapshot,
  InventoryState,
  RankingEntry,
  SistSettings,
  SistSkuDetail,
  StockReport,
  StockReportSubmission,
  UpsertServicePayload,
  UpsertSkuPayload,
} from '@shared/inventory';

interface InventoryContextValue extends InventoryState {
  reload: () => Promise<void>;
  saveSku: (payload: UpsertSkuPayload) => Promise<void>;
  saveService: (payload: UpsertServicePayload) => Promise<void>;
  saveStock: (
    updates: Array<{ skuId: string; unitsInStock: number; costPerUnit: number }>,
  ) => Promise<void>;
  submitReport: (payload: StockReportSubmission) => Promise<void>;
  persistRanking: (entries: RankingEntry[]) => Promise<void>;
  saveSistSettings: (payload: SistSettings) => Promise<void>;
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

  const reload = useCallback(async () => {
    setState((current) => ({ ...current, isLoading: true, error: null }));
    try {
      const snapshot = await window.banjiDesktop.inventory.getSnapshot();
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
    void reload();
  }, [reload]);

  const mutate = useCallback(
    async (task: () => Promise<InventorySnapshot>) => {
      setState((current) => ({ ...current, isSaving: true, error: null }));
      try {
        const snapshot = await task();
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
      persistRanking: async (entries) => {
        await mutate(() => window.banjiDesktop.inventory.saveRanking({ entries }));
      },
      saveSistSettings: async (payload) => {
        await mutate(() => window.banjiDesktop.inventory.updateSistSettings(payload));
      },
      loadSistSkuDetail: async (skuId) =>
        window.banjiDesktop.inventory.getSistSkuDetail({ skuId }),
      listStockReports: async () => window.banjiDesktop.inventory.listStockReports(),
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
