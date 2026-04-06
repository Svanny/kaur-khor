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
import type {
  SenaAnalysisRunRecord,
  SenaCatalog,
  SenaDiagnostics,
  SenaObservationInput,
  SenaObservationRecord,
  SenaServiceDetailPage,
  SenaSkuDetailPage,
  SenaWorkspaceSummary,
} from '@shared/sena';

type ReadCacheValue =
  | InventorySnapshot
  | StockReport[]
  | SenaCatalog
  | SenaObservationRecord[]
  | SenaWorkspaceSummary
  | SenaSkuDetailPage
  | SenaServiceDetailPage
  | SenaDiagnostics
  | SenaAnalysisRunRecord
  | null;

const DEFAULT_INTERVAL_PAGE_LIMIT = 20;

type SenaMetaCache = {
  catalogHash: string | null;
  lastBootstrapSkuId: string | null;
  lastCompletedRunId: string | null;
};

export interface InventoryContextValue {
  snapshot: InventorySnapshot | null;
  reports: StockReport[];
  catalog: SenaCatalog | null;
  diagnostics: SenaDiagnostics | null;
  error: string | null;
  isLoading: boolean;
  isSaving: boolean;
  latestRun: SenaAnalysisRunRecord | null;
  observations: SenaObservationRecord[];
  senaMeta: SenaMetaCache;
  workspaceSummary: SenaWorkspaceSummary | null;
  reload: () => Promise<void>;
  loadInventorySnapshot: () => Promise<InventorySnapshot>;
  listStockReports: () => Promise<StockReport[]>;
  submitLegacyReport: (payload: StockReportSubmission) => Promise<StockReport>;
  upsertSenaCatalog: (payload: SenaCatalog) => Promise<SenaCatalog>;
  loadSenaCatalog: () => Promise<SenaCatalog | null>;
  ingestSenaObservation: (payload: SenaObservationInput) => Promise<SenaObservationRecord>;
  listSenaObservations: () => Promise<SenaObservationRecord[]>;
  loadSenaObservations: () => Promise<SenaObservationRecord[]>;
  triggerSenaRun: (payload?: { algorithmVersion?: string }) => Promise<SenaAnalysisRunRecord>;
  retrySenaRun: (payload: { runId: string }) => Promise<SenaAnalysisRunRecord>;
  loadSenaWorkspaceSummary: () => Promise<SenaWorkspaceSummary | null>;
  loadSenaSkuDetail: (skuId: string, options?: { beforeIntervalIndex?: number | null; limit?: number }) => Promise<SenaSkuDetailPage | null>;
  loadSenaServiceDetail: (serviceId: string, options?: { beforeIntervalIndex?: number | null; limit?: number }) => Promise<SenaServiceDetailPage | null>;
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
    isSaving: false,
    latestRun: null as SenaAnalysisRunRecord | null,
    observations: [] as SenaObservationRecord[],
    workspaceSummary: null as SenaWorkspaceSummary | null,
  };
}

function isSenaCacheKey(key: string) {
  return key.startsWith('sena:');
}

export function InventoryProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(() => emptyState());
  const readCacheRef = useRef<Map<string, ReadCacheValue>>(new Map());
  const inflightRef = useRef<Map<string, Promise<ReadCacheValue>>>(new Map());
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

  const reload = useCallback(async () => {
    setState((current) => ({ ...current, error: null, isLoading: true }));
    try {
      readCacheRef.current.clear();
      inflightRef.current.clear();
      const [catalog, workspaceSummary, diagnostics, observations] = await Promise.all([
        window.banjiDesktop.sena.getCatalog(),
        window.banjiDesktop.sena.getWorkspaceSummary(),
        window.banjiDesktop.sena.getDiagnostics(),
        window.banjiDesktop.sena.listObservations(),
      ]);
      readCacheRef.current.set('sena:catalog', catalog);
      readCacheRef.current.set('sena:summary', workspaceSummary);
      readCacheRef.current.set('sena:diagnostics', diagnostics);
      readCacheRef.current.set('sena:observations', observations);
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
          const catalog = await window.banjiDesktop.sena.upsertCatalog(payload);
          invalidateSenaReads();
          readCacheRef.current.set('sena:catalog', catalog);
          setStatePartial({ catalog });
          return catalog;
        }),
      loadSenaCatalog: async () => {
        const catalog = await loadWithCache('sena:catalog', () => window.banjiDesktop.sena.getCatalog());
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
      loadSenaWorkspaceSummary: async () => {
        const workspaceSummary = await loadWithCache('sena:summary', () => window.banjiDesktop.sena.getWorkspaceSummary());
        const latestRun = await loadLatestRun(workspaceSummary?.runId ?? null);
        setStatePartial({ latestRun, workspaceSummary });
        return workspaceSummary;
      },
      loadSenaSkuDetail: async (skuId, options) => {
        const beforeIntervalIndex = options?.beforeIntervalIndex ?? null;
        const limit = options?.limit ?? DEFAULT_INTERVAL_PAGE_LIMIT;
        return loadWithCache(
          `sena:sku:${skuId}:before:${beforeIntervalIndex ?? 'latest'}:limit:${limit}`,
          () => window.banjiDesktop.sena.getSkuDetail({ skuId, beforeIntervalIndex, limit }),
        );
      },
      loadSenaServiceDetail: async (serviceId, options) => {
        const beforeIntervalIndex = options?.beforeIntervalIndex ?? null;
        const limit = options?.limit ?? DEFAULT_INTERVAL_PAGE_LIMIT;
        return loadWithCache(
          `sena:service:${serviceId}:before:${beforeIntervalIndex ?? 'latest'}:limit:${limit}`,
          () => window.banjiDesktop.sena.getServiceDetail({ serviceId, beforeIntervalIndex, limit }),
        );
      },
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
    [invalidateSenaReads, loadLatestRun, loadWithCache, reload, setStatePartial, state, updateSenaMeta, withSaving],
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
