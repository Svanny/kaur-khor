import { contextBridge, ipcRenderer } from 'electron';
import {
  IPC_CHANNELS,
  type DesktopBridge,
  type DesktopPreferences,
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
  StockReportSubmission,
  StockUpdatePayload,
} from '@shared/inventory';

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
  },
  preferences: {
    get: (): Promise<DesktopPreferences> => ipcRenderer.invoke(IPC_CHANNELS.preferencesGet),
    save: (payload: Partial<DesktopPreferences>): Promise<DesktopPreferences> =>
      ipcRenderer.invoke(IPC_CHANNELS.preferencesSave, payload),
  },
};

contextBridge.exposeInMainWorld('banjiDesktop', desktopBridge);
