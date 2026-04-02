import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type DesktopBridge,
  type DesktopPreferences,
  type GetSenaServiceDetailPayload,
  type GetSenaSkuDetailPayload,
  type GetSistServiceDetailPayload,
  type GetSistSkuDetailPayload,
  type SaveRankingPayload,
  type SaveServicePayload,
  type SaveSkuPayload,
} from '@shared/ipc';
import type {
  InventorySnapshot,
  SistSettings,
  SistServiceDetail,
  SistSkuDetail,
  SistSystemDetail,
  StockReport,
  StockReportDeletePayload,
  StockReportSubmission,
  StockReportUpdatePayload,
  StockUpdatePayload,
} from '@shared/inventory';
import type {
  SenaAnalysisRunRecord,
  SenaCatalog,
  SenaDiagnostics,
  SenaObservationRecord,
  SenaServiceDetail as SharedSenaServiceDetail,
  SenaSkuDetail as SharedSenaSkuDetail,
  SenaWorkspaceSummary,
} from '@shared/sena';

const desktopBridge: DesktopBridge = {
  system: {
    getAppContext: () => ipcRenderer.invoke(IPC_CHANNELS.systemGetAppContext),
    getLocalDataInfo: () => ipcRenderer.invoke(IPC_CHANNELS.systemGetLocalDataInfo),
    openLocalDataFolder: () => ipcRenderer.invoke(IPC_CHANNELS.systemOpenLocalDataFolder),
    exportSkusCsv: () => ipcRenderer.invoke(IPC_CHANNELS.systemExportSkusCsv),
    exportServicesCsv: () => ipcRenderer.invoke(IPC_CHANNELS.systemExportServicesCsv),
    exportStockReportsCsv: () => ipcRenderer.invoke(IPC_CHANNELS.systemExportStockReportsCsv),
  },
  inventory: {
    getSnapshot: (): Promise<InventorySnapshot> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventoryGetSnapshot),
    listStockReports: (): Promise<StockReport[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventoryListStockReports),
    saveSku: (payload: SaveSkuPayload): Promise<InventorySnapshot> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventorySaveSku, payload),
    saveService: (payload: SaveServicePayload): Promise<InventorySnapshot> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventorySaveService, payload),
    applyStockUpdates: (payload: StockUpdatePayload): Promise<InventorySnapshot> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventoryApplyStockUpdates, payload),
    submitStockReport: (payload: StockReportSubmission): Promise<InventorySnapshot> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventorySubmitStockReport, payload),
    updateStockReport: (payload: StockReportUpdatePayload): Promise<InventorySnapshot> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventoryUpdateStockReport, payload),
    deleteStockReport: (payload: StockReportDeletePayload): Promise<InventorySnapshot> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventoryDeleteStockReport, payload),
    saveRanking: (payload: SaveRankingPayload): Promise<InventorySnapshot> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventorySaveRanking, payload),
    getSistSkuDetail: (payload: GetSistSkuDetailPayload): Promise<SistSkuDetail> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventoryGetSistSkuDetail, payload),
    getSistServiceDetail: (
      payload: GetSistServiceDetailPayload,
    ): Promise<SistServiceDetail> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventoryGetSistServiceDetail, payload),
    getSistSystemDetail: (): Promise<SistSystemDetail> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventoryGetSistSystemDetail),
    updateSistSettings: (payload: SistSettings): Promise<InventorySnapshot> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventoryUpdateSistSettings, payload),
    getSenaCatalog: (): Promise<SenaCatalog | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventoryGetSenaCatalog),
    listSenaObservations: (): Promise<SenaObservationRecord[]> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventoryListSenaObservations),
    upsertSenaCatalog: (payload: SenaCatalog): Promise<SenaCatalog> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventoryUpsertSenaCatalog, payload),
    triggerSenaRun: (payload?: { algorithmVersion?: string }): Promise<SenaAnalysisRunRecord> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventoryTriggerSenaRun, payload),
    getSenaWorkspaceSummary: (): Promise<SenaWorkspaceSummary | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventoryGetSenaWorkspaceSummary),
    getSenaSkuDetail: (payload: GetSenaSkuDetailPayload): Promise<SharedSenaSkuDetail | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventoryGetSenaSkuDetail, payload),
    getSenaDiagnostics: (): Promise<SenaDiagnostics | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventoryGetSenaDiagnostics),
    getSenaServiceDetail: (
      payload: GetSenaServiceDetailPayload,
    ): Promise<SharedSenaServiceDetail | null> =>
      ipcRenderer.invoke(IPC_CHANNELS.inventoryGetSenaServiceDetail, payload),
  },
  preferences: {
    get: (): Promise<DesktopPreferences> => ipcRenderer.invoke(IPC_CHANNELS.preferencesGet),
    save: (payload: Partial<DesktopPreferences>): Promise<DesktopPreferences> =>
      ipcRenderer.invoke(IPC_CHANNELS.preferencesSave, payload),
  },
};

contextBridge.exposeInMainWorld('banjiDesktop', desktopBridge);
