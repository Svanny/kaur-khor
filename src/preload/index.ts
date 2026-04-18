import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type DesktopBridge,
  type DesktopPreferences,
  type SenaDetailCacheClearPayload,
  type SenaRunLookupPayload,
  type SenaServiceLookupPayload,
  type SenaSkuLookupPayload,
  type SenaTriggerRunPayload,
} from '@shared/ipc';
import {
  isTruthyBenchmarkEnvValue,
  summarizeBenchmarkPayload,
  type BanjiBenchmarkEvent,
} from '@shared/benchmark';
import type { InventorySnapshot, StockReport, StockReportSubmission } from '@shared/inventory';
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
  SenaServiceDetailPage,
  SenaSkuDetailPage,
  SenaUpdateOrderBatchPayload,
  SenaUpdateOrderChildPayload,
  SenaWorkspaceSummary,
} from '@shared/sena';

const benchmarkEnabled = isTruthyBenchmarkEnvValue(process.env.BANJI_BENCHMARK);
const benchmarkRunId = process.env.BANJI_BENCHMARK_RUN_ID?.trim() || `preload-${Date.now()}`;

function recordPreloadBenchmarkEvent(
  event: Omit<BanjiBenchmarkEvent, 'runId' | 'ts' | 'layer'>,
) {
  if (!benchmarkEnabled) {
    return;
  }
  ipcRenderer.send(IPC_CHANNELS.benchmarkRecordEvent, {
    ...event,
    runId: benchmarkRunId,
    ts: Date.now(),
    layer: 'preload',
  } satisfies BanjiBenchmarkEvent);
}

async function invokeWithBenchmark<T>(channel: string, payload?: unknown): Promise<T> {
  if (!benchmarkEnabled) {
    return ipcRenderer.invoke(channel, payload) as Promise<T>;
  }

  const startedAt = Date.now();
  recordPreloadBenchmarkEvent({
    category: 'ipc',
    name: `preload.invoke.${channel}`,
    phase: 'start',
    command: channel,
    detail: {
      payload: summarizeBenchmarkPayload(payload),
    },
  });
  try {
    const result = await ipcRenderer.invoke(channel, payload) as T;
    recordPreloadBenchmarkEvent({
      category: 'ipc',
      name: `preload.invoke.${channel}`,
      phase: 'end',
      command: channel,
      durationMs: Date.now() - startedAt,
      detail: {
        ok: true,
        result: summarizeBenchmarkPayload(result),
      },
    });
    return result;
  } catch (error) {
    recordPreloadBenchmarkEvent({
      category: 'ipc',
      name: `preload.invoke.${channel}`,
      phase: 'end',
      command: channel,
      durationMs: Date.now() - startedAt,
      detail: {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  }
}

const desktopBridge: DesktopBridge = {
  benchmark: {
    enabled: benchmarkEnabled,
    runId: benchmarkRunId,
    recordEvent: (event: BanjiBenchmarkEvent) => {
      if (benchmarkEnabled) {
        ipcRenderer.send(IPC_CHANNELS.benchmarkRecordEvent, event);
      }
    },
  },
  system: {
    getAppContext: () => invokeWithBenchmark(IPC_CHANNELS.systemGetAppContext),
    getLocalDataInfo: () => invokeWithBenchmark(IPC_CHANNELS.systemGetLocalDataInfo),
    createBackupSnapshot: () => invokeWithBenchmark(IPC_CHANNELS.systemCreateBackupSnapshot),
    restoreBackupSnapshot: () => invokeWithBenchmark(IPC_CHANNELS.systemRestoreBackupSnapshot),
    clearCurrentData: () => invokeWithBenchmark(IPC_CHANNELS.systemClearCurrentData),
    revealPath: (path: string) => invokeWithBenchmark(IPC_CHANNELS.systemRevealPath, path),
    pickAndStoreImage: (): Promise<string | null> => invokeWithBenchmark(IPC_CHANNELS.systemPickAndStoreImage),
  },
  inventory: {
    loadSnapshot: (): Promise<InventorySnapshot> => invokeWithBenchmark(IPC_CHANNELS.inventoryLoadSnapshot),
    listReports: (): Promise<StockReport[]> => invokeWithBenchmark(IPC_CHANNELS.inventoryListReports),
    submitReport: (payload: StockReportSubmission): Promise<StockReport> =>
      invokeWithBenchmark(IPC_CHANNELS.inventorySubmitReport, payload),
  },
  sena: {
    getCatalog: (): Promise<SenaCatalog | null> => invokeWithBenchmark(IPC_CHANNELS.senaGetCatalog),
    listObservations: (): Promise<SenaObservationRecord[]> =>
      invokeWithBenchmark(IPC_CHANNELS.senaListObservations),
    listOrderBatches: (payload?: SenaOrderLookupPayload): Promise<SenaOrderBatchRecord[]> =>
      invokeWithBenchmark(IPC_CHANNELS.senaListOrderBatches, payload),
    upsertCatalog: (payload: SenaCatalog): Promise<SenaCatalog> =>
      invokeWithBenchmark(IPC_CHANNELS.senaUpsertCatalog, payload),
    ingestObservation: (payload: SenaObservationInput): Promise<SenaObservationRecord> =>
      invokeWithBenchmark(IPC_CHANNELS.senaIngestObservation, payload),
    updateObservation: (payload: SenaObservationUpdatePayload): Promise<SenaObservationRecord> =>
      invokeWithBenchmark(IPC_CHANNELS.senaUpdateObservation, payload),
    deleteObservation: (payload: SenaObservationDeletePayload): Promise<void> =>
      invokeWithBenchmark(IPC_CHANNELS.senaDeleteObservation, payload),
    createOrderBatch: (payload: SenaCreateOrderBatchPayload): Promise<SenaOrderBatchRecord> =>
      invokeWithBenchmark(IPC_CHANNELS.senaCreateOrderBatch, payload),
    updateOrderBatch: (payload: SenaUpdateOrderBatchPayload): Promise<SenaOrderBatchRecord> =>
      invokeWithBenchmark(IPC_CHANNELS.senaUpdateOrderBatch, payload),
    updateOrderChild: (payload: SenaUpdateOrderChildPayload): Promise<SenaOrderBatchRecord> =>
      invokeWithBenchmark(IPC_CHANNELS.senaUpdateOrderChild, payload),
    splitOrderChild: (payload: SenaSplitOrderChildPayload): Promise<SenaOrderBatchRecord> =>
      invokeWithBenchmark(IPC_CHANNELS.senaSplitOrderChild, payload),
    triggerRun: (payload?: SenaTriggerRunPayload): Promise<SenaAnalysisRunRecord> =>
      invokeWithBenchmark(IPC_CHANNELS.senaTriggerRun, payload),
    retryRun: (payload: SenaRunLookupPayload): Promise<SenaAnalysisRunRecord> =>
      invokeWithBenchmark(IPC_CHANNELS.senaRetryRun, payload),
    getWorkspaceSummary: (): Promise<SenaWorkspaceSummary | null> =>
      invokeWithBenchmark(IPC_CHANNELS.senaGetWorkspaceSummary),
    getSkuDetail: (payload: SenaSkuLookupPayload): Promise<SenaSkuDetailPage | null> =>
      invokeWithBenchmark(IPC_CHANNELS.senaGetSkuDetail, payload),
    getDiagnostics: (): Promise<SenaDiagnostics | null> =>
      invokeWithBenchmark(IPC_CHANNELS.senaGetDiagnostics),
    getServiceDetail: (payload: SenaServiceLookupPayload): Promise<SenaServiceDetailPage | null> =>
      invokeWithBenchmark(IPC_CHANNELS.senaGetServiceDetail, payload),
    clearDetailCache: (payload: SenaDetailCacheClearPayload): Promise<void> =>
      invokeWithBenchmark(IPC_CHANNELS.senaClearDetailCache, payload),
    getRunStatus: (payload: SenaRunLookupPayload): Promise<SenaAnalysisRunRecord | null> =>
      invokeWithBenchmark(IPC_CHANNELS.senaGetRunStatus, payload),
  },
  preferences: {
    get: (): Promise<DesktopPreferences> => invokeWithBenchmark(IPC_CHANNELS.preferencesGet),
    save: (payload: Partial<DesktopPreferences>): Promise<DesktopPreferences> =>
      invokeWithBenchmark(IPC_CHANNELS.preferencesSave, payload),
  },
};

contextBridge.exposeInMainWorld('banjiDesktop', desktopBridge);

recordPreloadBenchmarkEvent({
  category: 'startup',
  name: 'preload.bridge.exposed',
  phase: 'instant',
});
