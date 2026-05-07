import { contextBridge, ipcRenderer } from 'electron';
import type { IpcRendererEvent } from 'electron';
import {
  IPC_CHANNELS,
  type AutomationBenchmarkSeedPayload,
  type AutomationBenchmarkSeedResult,
  type AutomationConnectionPatch,
  type AutomationExposurePatch,
  type AutomationListIntakesPayload,
  type AutomationReadConversationPayload,
  type AutomationReadIntakePayload,
  type AutomationReadIntakeThreadPayload,
  type AutomationSendIntakeThreadMessagePayload,
  type AutomationResolveIntakePayload,
  type DesktopBridge,
  type DesktopPreferences,
  type DesktopStoreDroppedImagePayload,
  type PromoteAutomationIntakePayload,
  type SenaDetailCacheClearPayload,
  type SenaRunLookupPayload,
  type SenaServiceLookupPayload,
  type SenaSkuLookupPayload,
  type SenaTriggerRunPayload,
} from '@shared/ipc';
import {
  isTruthyBenchmarkEnvValue,
  summarizeBenchmarkPayload,
  type KaurKhorBenchmarkEvent,
  type KaurKhorBenchmarkComparison,
  type KaurKhorBenchmarkFlamegraphArtifact,
  type KaurKhorBenchmarkFlamegraphRequest,
  type KaurKhorBenchmarkRunEvent,
  type KaurKhorBenchmarkRunOptions,
  type KaurKhorBenchmarkRunRecord,
  type KaurKhorBenchmarkRunnerAvailability,
} from '@shared/benchmark';
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

const benchmarkEnabled = isTruthyBenchmarkEnvValue(process.env.KAUR_KHOR_BENCHMARK);
const benchmarkRunId = process.env.KAUR_KHOR_BENCHMARK_RUN_ID?.trim() || `preload-${Date.now()}`;

function recordPreloadBenchmarkEvent(
  event: Omit<KaurKhorBenchmarkEvent, 'runId' | 'ts' | 'layer'>,
) {
  if (!benchmarkEnabled) {
    return;
  }
  ipcRenderer.send(IPC_CHANNELS.benchmarkRecordEvent, {
    ...event,
    runId: benchmarkRunId,
    ts: Date.now(),
    layer: 'preload',
  } satisfies KaurKhorBenchmarkEvent);
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

const benchmarkRunnerBridge: DesktopBridge['benchmarkRunner'] | undefined = process.env.NODE_ENV === 'development'
  ? {
      getAvailability: (): Promise<KaurKhorBenchmarkRunnerAvailability> =>
        invokeWithBenchmark(IPC_CHANNELS.benchmarkRunnerGetAvailability),
      listRuns: (): Promise<KaurKhorBenchmarkRunRecord[]> =>
        invokeWithBenchmark(IPC_CHANNELS.benchmarkRunnerListRuns),
      readRun: (runId: string): Promise<KaurKhorBenchmarkRunRecord | null> =>
        invokeWithBenchmark(IPC_CHANNELS.benchmarkRunnerReadRun, runId),
      startRun: (payload: KaurKhorBenchmarkRunOptions): Promise<KaurKhorBenchmarkRunRecord> =>
        invokeWithBenchmark(IPC_CHANNELS.benchmarkRunnerStartRun, payload),
      cancelRun: (runId: string): Promise<KaurKhorBenchmarkRunRecord> =>
        invokeWithBenchmark(IPC_CHANNELS.benchmarkRunnerCancelRun, runId),
      compareRuns: (payload: { baselineRunId: string; candidateRunId: string }): Promise<KaurKhorBenchmarkComparison> =>
        invokeWithBenchmark(IPC_CHANNELS.benchmarkRunnerCompareRuns, payload),
      generateFlamegraph: (payload: KaurKhorBenchmarkFlamegraphRequest): Promise<KaurKhorBenchmarkFlamegraphArtifact> =>
        invokeWithBenchmark(IPC_CHANNELS.benchmarkRunnerGenerateFlamegraph, payload),
      revealRun: (runId: string): Promise<void> =>
        invokeWithBenchmark(IPC_CHANNELS.benchmarkRunnerRevealRun, runId),
      onRunEvent: (listener: (event: KaurKhorBenchmarkRunEvent) => void) => {
        const handler = (_event: IpcRendererEvent, payload: KaurKhorBenchmarkRunEvent) => {
          listener(payload);
        };
        ipcRenderer.on(IPC_CHANNELS.benchmarkRunnerEvent, handler);
        return () => {
          ipcRenderer.removeListener(IPC_CHANNELS.benchmarkRunnerEvent, handler);
        };
      },
    }
  : undefined;

const desktopBridge: DesktopBridge = {
  automation: {
    getWorkspace: () => invokeWithBenchmark(IPC_CHANNELS.automationGetWorkspace),
    seedBenchmarkWorkspace: (payload?: AutomationBenchmarkSeedPayload): Promise<AutomationBenchmarkSeedResult> =>
      invokeWithBenchmark(IPC_CHANNELS.automationSeedBenchmarkWorkspace, payload),
    getConnection: () => invokeWithBenchmark(IPC_CHANNELS.automationGetConnection),
    saveConnection: (payload: AutomationConnectionPatch) =>
      invokeWithBenchmark(IPC_CHANNELS.automationSaveConnection, payload),
    listExposureRows: () => invokeWithBenchmark(IPC_CHANNELS.automationListExposureRows),
    patchExposureRow: (payload: AutomationExposurePatch) =>
      invokeWithBenchmark(IPC_CHANNELS.automationPatchExposureRow, payload),
    listConversations: () => invokeWithBenchmark(IPC_CHANNELS.automationListConversations),
    readConversation: (payload: AutomationReadConversationPayload) =>
      invokeWithBenchmark(IPC_CHANNELS.automationReadConversation, payload),
    readIntakeThread: (payload: AutomationReadIntakeThreadPayload) =>
      invokeWithBenchmark(IPC_CHANNELS.automationReadIntakeThread, payload),
    sendIntakeThreadMessage: (payload: AutomationSendIntakeThreadMessagePayload) =>
      invokeWithBenchmark(IPC_CHANNELS.automationSendIntakeThreadMessage, payload),
    listIntakes: (payload?: AutomationListIntakesPayload) =>
      invokeWithBenchmark(IPC_CHANNELS.automationListIntakes, payload),
    readIntake: (payload: AutomationReadIntakePayload) =>
      invokeWithBenchmark(IPC_CHANNELS.automationReadIntake, payload),
    resolveIntake: (payload: AutomationResolveIntakePayload) =>
      invokeWithBenchmark(IPC_CHANNELS.automationResolveIntake, payload),
    promoteIntake: (payload: PromoteAutomationIntakePayload) =>
      invokeWithBenchmark(IPC_CHANNELS.automationPromoteIntake, payload),
    testTelegramConnection: () => invokeWithBenchmark(IPC_CHANNELS.automationTestTelegramConnection),
  },
  benchmark: {
    enabled: benchmarkEnabled,
    runId: benchmarkRunId,
    recordEvent: (event: KaurKhorBenchmarkEvent) => {
      if (benchmarkEnabled) {
        ipcRenderer.send(IPC_CHANNELS.benchmarkRecordEvent, event);
      }
    },
    getEventCount: (name: string): Promise<number> =>
      invokeWithBenchmark(IPC_CHANNELS.benchmarkGetEventCount, name),
    waitForEventCount: (payload: {
      name: string;
      minimumCount: number;
      timeoutMs?: number;
    }): Promise<{ count: number; ts: number | null }> =>
      invokeWithBenchmark(IPC_CHANNELS.benchmarkWaitForEventCount, payload),
  },
  ...(benchmarkRunnerBridge ? { benchmarkRunner: benchmarkRunnerBridge } : {}),
  system: {
    getAppContext: () => invokeWithBenchmark(IPC_CHANNELS.systemGetAppContext),
    getLocalDataInfo: () => invokeWithBenchmark(IPC_CHANNELS.systemGetLocalDataInfo),
    createBackupSnapshot: () => invokeWithBenchmark(IPC_CHANNELS.systemCreateBackupSnapshot),
    restoreBackupSnapshot: () => invokeWithBenchmark(IPC_CHANNELS.systemRestoreBackupSnapshot),
    clearCurrentData: () => invokeWithBenchmark(IPC_CHANNELS.systemClearCurrentData),
    revealPath: (path: string) => invokeWithBenchmark(IPC_CHANNELS.systemRevealPath, path),
    openExternalUrl: (url: string) => invokeWithBenchmark(IPC_CHANNELS.systemOpenExternalUrl, url),
    pickAndStoreImage: (): Promise<string | null> => invokeWithBenchmark(IPC_CHANNELS.systemPickAndStoreImage),
    storeDroppedImage: (payload: DesktopStoreDroppedImagePayload): Promise<string | null> =>
      invokeWithBenchmark(IPC_CHANNELS.systemStoreDroppedImage, payload),
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

contextBridge.exposeInMainWorld('kaurKhorDesktop', desktopBridge);

recordPreloadBenchmarkEvent({
  category: 'startup',
  name: 'preload.bridge.exposed',
  phase: 'instant',
});
