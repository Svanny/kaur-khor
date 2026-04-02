import type {
  AppCurrency,
  AppLanguage,
  InventorySnapshot,
  SaveRankingPayload,
  SistSettings,
  SistServiceDetail,
  SistSkuDetail,
  SistSystemDetail,
  StockReport,
  StockReportDeletePayload,
  StockReportSubmission,
  StockReportUpdatePayload,
  StockUpdatePayload,
  UpsertServicePayload,
  UpsertSkuPayload,
} from './inventory';
import type {
  SenaAnalysisRunRecord,
  SenaCatalog,
  SenaDiagnostics,
  SenaObservationRecord,
  SenaServiceDetail,
  SenaSkuDetail,
  SenaWorkspaceSummary,
} from './sena';

export interface DesktopAppContext {
  appVersion: string;
  platform: string;
}

export interface DesktopLocalDataInfo {
  dataDirectoryPath: string;
  inventoryStorePath: string;
  preferencesPath: string;
  storageFormat: 'json';
}

export interface DesktopExportResult {
  path: string;
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

export interface GetSistServiceDetailPayload {
  serviceId: string;
}

export interface GetSenaSkuDetailPayload {
  skuId: string;
}

export interface GetSenaServiceDetailPayload {
  serviceId: string;
}

export interface DesktopInventoryBridge {
  getSnapshot: () => Promise<InventorySnapshot>;
  listStockReports: () => Promise<StockReport[]>;
  saveSku: (payload: SaveSkuPayload) => Promise<InventorySnapshot>;
  saveService: (payload: SaveServicePayload) => Promise<InventorySnapshot>;
  applyStockUpdates: (payload: StockUpdatePayload) => Promise<InventorySnapshot>;
  submitStockReport: (payload: StockReportSubmission) => Promise<InventorySnapshot>;
  updateStockReport: (payload: StockReportUpdatePayload) => Promise<InventorySnapshot>;
  deleteStockReport: (payload: StockReportDeletePayload) => Promise<InventorySnapshot>;
  saveRanking: (payload: SaveRankingPayload) => Promise<InventorySnapshot>;
  getSistSkuDetail: (payload: GetSistSkuDetailPayload) => Promise<SistSkuDetail>;
  getSistServiceDetail: (payload: GetSistServiceDetailPayload) => Promise<SistServiceDetail>;
  getSistSystemDetail: () => Promise<SistSystemDetail>;
  updateSistSettings: (payload: SistSettings) => Promise<InventorySnapshot>;
  getSenaCatalog: () => Promise<SenaCatalog | null>;
  listSenaObservations: () => Promise<SenaObservationRecord[]>;
  upsertSenaCatalog: (payload: SenaCatalog) => Promise<SenaCatalog>;
  triggerSenaRun: (payload?: { algorithmVersion?: string }) => Promise<SenaAnalysisRunRecord>;
  getSenaWorkspaceSummary: () => Promise<SenaWorkspaceSummary | null>;
  getSenaSkuDetail: (payload: GetSenaSkuDetailPayload) => Promise<SenaSkuDetail | null>;
  getSenaDiagnostics: () => Promise<SenaDiagnostics | null>;
  getSenaServiceDetail: (payload: GetSenaServiceDetailPayload) => Promise<SenaServiceDetail | null>;
}

export interface DesktopPreferencesBridge {
  get: () => Promise<DesktopPreferences>;
  save: (payload: Partial<DesktopPreferences>) => Promise<DesktopPreferences>;
}

export interface DesktopSystemBridge {
  getAppContext: () => Promise<DesktopAppContext>;
  getLocalDataInfo: () => Promise<DesktopLocalDataInfo>;
  openLocalDataFolder: () => Promise<void>;
  exportSkusCsv: () => Promise<DesktopExportResult | null>;
  exportServicesCsv: () => Promise<DesktopExportResult | null>;
  exportStockReportsCsv: () => Promise<DesktopExportResult | null>;
}

export interface DesktopBridge {
  inventory: DesktopInventoryBridge;
  preferences: DesktopPreferencesBridge;
  system: DesktopSystemBridge;
}

export const IPC_CHANNELS = {
  systemGetAppContext: 'banji:system:get-app-context',
  systemGetLocalDataInfo: 'banji:system:get-local-data-info',
  systemOpenLocalDataFolder: 'banji:system:open-local-data-folder',
  systemExportSkusCsv: 'banji:system:export-skus-csv',
  systemExportServicesCsv: 'banji:system:export-services-csv',
  systemExportStockReportsCsv: 'banji:system:export-stock-reports-csv',
  inventoryGetSnapshot: 'banji:inventory:get-snapshot',
  inventoryListStockReports: 'banji:inventory:list-stock-reports',
  inventorySaveSku: 'banji:inventory:save-sku',
  inventorySaveService: 'banji:inventory:save-service',
  inventoryApplyStockUpdates: 'banji:inventory:apply-stock-updates',
  inventorySubmitStockReport: 'banji:inventory:submit-stock-report',
  inventoryUpdateStockReport: 'banji:inventory:update-stock-report',
  inventoryDeleteStockReport: 'banji:inventory:delete-stock-report',
  inventorySaveRanking: 'banji:inventory:save-ranking',
  inventoryGetSistSkuDetail: 'banji:inventory:get-sist-sku-detail',
  inventoryGetSistServiceDetail: 'banji:inventory:get-sist-service-detail',
  inventoryGetSistSystemDetail: 'banji:inventory:get-sist-system-detail',
  inventoryUpdateSistSettings: 'banji:inventory:update-sist-settings',
  inventoryGetSenaCatalog: 'banji:inventory:get-sena-catalog',
  inventoryListSenaObservations: 'banji:inventory:list-sena-observations',
  inventoryUpsertSenaCatalog: 'banji:inventory:upsert-sena-catalog',
  inventoryTriggerSenaRun: 'banji:inventory:trigger-sena-run',
  inventoryGetSenaWorkspaceSummary: 'banji:inventory:get-sena-workspace-summary',
  inventoryGetSenaSkuDetail: 'banji:inventory:get-sena-sku-detail',
  inventoryGetSenaDiagnostics: 'banji:inventory:get-sena-diagnostics',
  inventoryGetSenaServiceDetail: 'banji:inventory:get-sena-service-detail',
  preferencesGet: 'banji:preferences:get',
  preferencesSave: 'banji:preferences:save',
} as const;
