import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
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
  type BanjiBenchmarkComparison,
  type BanjiBenchmarkFlamegraphArtifact,
  type BanjiBenchmarkFlamegraphRequest,
  type BanjiBenchmarkRunEvent,
  type BanjiBenchmarkRunOptions,
  type BanjiBenchmarkRunRecord,
  type BanjiBenchmarkRunnerAvailability,
} from '@shared/benchmark';
import type { InventorySnapshot, StockReport, StockReportSubmission } from '@shared/inventory';
import type {
  SenaAnalysisRunRecord,
  SenaCatalog,
  SenaCreateOrderBatchPayload,
  SenaObservationDeletePayload,
  SenaDiagnostics,
  SenaObservationInput,
  SenaObservationFingerprint,
  SenaObservationPage,
  SenaObservationPageRequest,
  SenaObservationRecord,
  SenaOrderBatchRecord,
  SenaOrderLookupPayload,
  SenaRecordUpdateContext,
  SenaSplitOrderChildPayload,
  SenaObservationUpdatePayload,
  SenaServiceDetailPage,
  SenaSkuDetailPage,
  SenaStartupWorkspace,
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
  benchmarkRunner: {
    getAvailability: (): Promise<BanjiBenchmarkRunnerAvailability> =>
      invokeWithBenchmark(IPC_CHANNELS.benchmarkRunnerGetAvailability),
    listRuns: (): Promise<BanjiBenchmarkRunRecord[]> =>
      invokeWithBenchmark(IPC_CHANNELS.benchmarkRunnerListRuns),
    readRun: (runId: string): Promise<BanjiBenchmarkRunRecord | null> =>
      invokeWithBenchmark(IPC_CHANNELS.benchmarkRunnerReadRun, runId),
    startRun: (payload: BanjiBenchmarkRunOptions): Promise<BanjiBenchmarkRunRecord> =>
      invokeWithBenchmark(IPC_CHANNELS.benchmarkRunnerStartRun, payload),
    cancelRun: (runId: string): Promise<BanjiBenchmarkRunRecord> =>
      invokeWithBenchmark(IPC_CHANNELS.benchmarkRunnerCancelRun, runId),
    compareRuns: (payload: { baselineRunId: string; candidateRunId: string }): Promise<BanjiBenchmarkComparison> =>
      invokeWithBenchmark(IPC_CHANNELS.benchmarkRunnerCompareRuns, payload),
    generateFlamegraph: (payload: BanjiBenchmarkFlamegraphRequest): Promise<BanjiBenchmarkFlamegraphArtifact> =>
      invokeWithBenchmark(IPC_CHANNELS.benchmarkRunnerGenerateFlamegraph, payload),
    revealRun: (runId: string): Promise<void> =>
      invokeWithBenchmark(IPC_CHANNELS.benchmarkRunnerRevealRun, runId),
    onRunEvent: (listener: (event: BanjiBenchmarkRunEvent) => void) => {
      const handler = (_event: IpcRendererEvent, payload: BanjiBenchmarkRunEvent) => {
        listener(payload);
      };
      ipcRenderer.on(IPC_CHANNELS.benchmarkRunnerEvent, handler);
      return () => {
        ipcRenderer.removeListener(IPC_CHANNELS.benchmarkRunnerEvent, handler);
      };
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
    getObservationFingerprint: (): Promise<SenaObservationFingerprint> =>
      invokeWithBenchmark(IPC_CHANNELS.senaGetObservationFingerprint),
    getStartupWorkspace: (): Promise<SenaStartupWorkspace> =>
      invokeWithBenchmark(IPC_CHANNELS.senaGetStartupWorkspace),
    getRecordUpdateContext: (): Promise<SenaRecordUpdateContext> =>
      invokeWithBenchmark(IPC_CHANNELS.senaGetRecordUpdateContext),
    listObservationPage: (payload?: SenaObservationPageRequest): Promise<SenaObservationPage> =>
      invokeWithBenchmark(IPC_CHANNELS.senaListObservationPage, payload),
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
