import type {
  AppCurrency,
  AppLanguage,
  InventorySnapshot,
  SaveRankingPayload,
  SistSettings,
  SistSkuDetail,
  StockReport,
  StockReportSubmission,
  StockUpdatePayload,
  UpsertServicePayload,
  UpsertSkuPayload,
} from './inventory';

export interface DesktopAppContext {
  appVersion: string;
  platform: string;
}

export interface DesktopPreferences {
  language: AppLanguage;
  currency: AppCurrency;
}

export interface SaveSkuPayload {
  sku: UpsertSkuPayload;
}

export interface SaveServicePayload {
  service: UpsertServicePayload;
}

export interface GetSistSkuDetailPayload {
  skuId: string;
}

export interface DesktopInventoryBridge {
  getSnapshot: () => Promise<InventorySnapshot>;
  listStockReports: () => Promise<StockReport[]>;
  saveSku: (payload: SaveSkuPayload) => Promise<InventorySnapshot>;
  saveService: (payload: SaveServicePayload) => Promise<InventorySnapshot>;
  applyStockUpdates: (payload: StockUpdatePayload) => Promise<InventorySnapshot>;
  submitStockReport: (payload: StockReportSubmission) => Promise<InventorySnapshot>;
  saveRanking: (payload: SaveRankingPayload) => Promise<InventorySnapshot>;
  getSistSkuDetail: (payload: GetSistSkuDetailPayload) => Promise<SistSkuDetail>;
  updateSistSettings: (payload: SistSettings) => Promise<InventorySnapshot>;
}

export interface DesktopPreferencesBridge {
  get: () => Promise<DesktopPreferences>;
  save: (payload: Partial<DesktopPreferences>) => Promise<DesktopPreferences>;
}

export interface DesktopSystemBridge {
  getAppContext: () => Promise<DesktopAppContext>;
}

export interface DesktopBridge {
  inventory: DesktopInventoryBridge;
  preferences: DesktopPreferencesBridge;
  system: DesktopSystemBridge;
}

export const IPC_CHANNELS = {
  systemGetAppContext: 'banji:system:get-app-context',
  inventoryGetSnapshot: 'banji:inventory:get-snapshot',
  inventoryListStockReports: 'banji:inventory:list-stock-reports',
  inventorySaveSku: 'banji:inventory:save-sku',
  inventorySaveService: 'banji:inventory:save-service',
  inventoryApplyStockUpdates: 'banji:inventory:apply-stock-updates',
  inventorySubmitStockReport: 'banji:inventory:submit-stock-report',
  inventorySaveRanking: 'banji:inventory:save-ranking',
  inventoryGetSistSkuDetail: 'banji:inventory:get-sist-sku-detail',
  inventoryUpdateSistSettings: 'banji:inventory:update-sist-settings',
  preferencesGet: 'banji:preferences:get',
  preferencesSave: 'banji:preferences:save',
} as const;
