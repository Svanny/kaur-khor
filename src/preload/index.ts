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
import type { InventorySnapshot, StockReport, StockReportSubmission } from '@shared/inventory';
import type {
  SenaAnalysisRunRecord,
  SenaCatalog,
  SenaObservationDeletePayload,
  SenaDiagnostics,
  SenaObservationInput,
  SenaObservationRecord,
  SenaObservationUpdatePayload,
  SenaServiceDetailPage,
  SenaSkuDetailPage,
  SenaWorkspaceSummary,
} from '@shared/sena';

const desktopBridge: DesktopBridge = {
  system: {
    getAppContext: () => ipcRenderer.invoke(IPC_CHANNELS.systemGetAppContext),
    getLocalDataInfo: () => ipcRenderer.invoke(IPC_CHANNELS.systemGetLocalDataInfo),
    revealPath: (path: string) => ipcRenderer.invoke(IPC_CHANNELS.systemRevealPath, path),
  },
  inventory: {
    loadSnapshot: (): Promise<InventorySnapshot> => ipcRenderer.invoke(IPC_CHANNELS.inventoryLoadSnapshot),
    listReports: (): Promise<StockReport[]> => ipcRenderer.invoke(IPC_CHANNELS.inventoryListReports),
    submitReport: (payload: StockReportSubmission): Promise<StockReport> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventorySubmitReport, payload),
  },
  sena: {
    getCatalog: (): Promise<SenaCatalog | null> => ipcRenderer.invoke(IPC_CHANNELS.senaGetCatalog),
    listObservations: (): Promise<SenaObservationRecord[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.senaListObservations),
    upsertCatalog: (payload: SenaCatalog): Promise<SenaCatalog> =>
      ipcRenderer.invoke(IPC_CHANNELS.senaUpsertCatalog, payload),
    ingestObservation: (payload: SenaObservationInput): Promise<SenaObservationRecord> =>
      ipcRenderer.invoke(IPC_CHANNELS.senaIngestObservation, payload),
    updateObservation: (payload: SenaObservationUpdatePayload): Promise<SenaObservationRecord> =>
      ipcRenderer.invoke(IPC_CHANNELS.senaUpdateObservation, payload),
    deleteObservation: (payload: SenaObservationDeletePayload): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.senaDeleteObservation, payload),
    triggerRun: (payload?: SenaTriggerRunPayload): Promise<SenaAnalysisRunRecord> =>
      ipcRenderer.invoke(IPC_CHANNELS.senaTriggerRun, payload),
    retryRun: (payload: SenaRunLookupPayload): Promise<SenaAnalysisRunRecord> =>
      ipcRenderer.invoke(IPC_CHANNELS.senaRetryRun, payload),
    getWorkspaceSummary: (): Promise<SenaWorkspaceSummary | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.senaGetWorkspaceSummary),
    getSkuDetail: (payload: SenaSkuLookupPayload): Promise<SenaSkuDetailPage | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.senaGetSkuDetail, payload),
    getDiagnostics: (): Promise<SenaDiagnostics | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.senaGetDiagnostics),
    getServiceDetail: (payload: SenaServiceLookupPayload): Promise<SenaServiceDetailPage | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.senaGetServiceDetail, payload),
    clearDetailCache: (payload: SenaDetailCacheClearPayload): Promise<void> =>
      ipcRenderer.invoke(IPC_CHANNELS.senaClearDetailCache, payload),
    getRunStatus: (payload: SenaRunLookupPayload): Promise<SenaAnalysisRunRecord | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.senaGetRunStatus, payload),
  },
  preferences: {
    get: (): Promise<DesktopPreferences> => ipcRenderer.invoke(IPC_CHANNELS.preferencesGet),
    save: (payload: Partial<DesktopPreferences>): Promise<DesktopPreferences> =>
      ipcRenderer.invoke(IPC_CHANNELS.preferencesSave, payload),
  },
};

contextBridge.exposeInMainWorld('banjiDesktop', desktopBridge);
