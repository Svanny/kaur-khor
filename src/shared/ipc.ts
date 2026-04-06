import type {
  AppCurrency,
  AppLanguage,
  InventorySnapshot,
  StockReport,
  StockReportSubmission,
} from './inventory';
import type {
  SenaAnalysisRunRecord,
  SenaCatalog,
  SenaDetailWindowRequest,
  SenaDiagnostics,
  SenaObservationInput,
  SenaObservationRecord,
  SenaServiceDetailPage,
  SenaSkuDetailPage,
  SenaWorkspaceSummary,
} from './sena';

export interface DesktopAppContext {
  appVersion: string;
  platform: string;
}

export interface DesktopLocalDataInfo {
  dataDirectoryPath: string;
  workspaceStorePath: string;
  preferencesPath: string;
  storageFormat: 'sqlite';
}

export interface DesktopPreferences {
  language: AppLanguage;
  currency: AppCurrency;
  showExplanatoryTooltips: boolean;
  showFloatingTitleActions: boolean;
  showRightRailCards: boolean;
}

export interface SenaSkuLookupPayload {
  skuId: string;
  beforeIntervalIndex?: number | null;
  limit?: number;
}

export interface SenaServiceLookupPayload {
  serviceId: string;
  beforeIntervalIndex?: number | null;
  limit?: number;
}

export interface SenaRunLookupPayload {
  runId: string;
}

export interface SenaTriggerRunPayload {
  algorithmVersion?: string;
}

export interface DesktopSenaBridge {
  getCatalog: () => Promise<SenaCatalog | null>;
  listObservations: () => Promise<SenaObservationRecord[]>;
  upsertCatalog: (payload: SenaCatalog) => Promise<SenaCatalog>;
  ingestObservation: (payload: SenaObservationInput) => Promise<SenaObservationRecord>;
  triggerRun: (payload?: SenaTriggerRunPayload) => Promise<SenaAnalysisRunRecord>;
  retryRun: (payload: SenaRunLookupPayload) => Promise<SenaAnalysisRunRecord>;
  getWorkspaceSummary: () => Promise<SenaWorkspaceSummary | null>;
  getSkuDetail: (payload: SenaSkuLookupPayload & Partial<SenaDetailWindowRequest>) => Promise<SenaSkuDetailPage | null>;
  getServiceDetail: (payload: SenaServiceLookupPayload & Partial<SenaDetailWindowRequest>) => Promise<SenaServiceDetailPage | null>;
  getDiagnostics: () => Promise<SenaDiagnostics | null>;
  getRunStatus: (payload: SenaRunLookupPayload) => Promise<SenaAnalysisRunRecord | null>;
}

export interface DesktopInventoryBridge {
  loadSnapshot: () => Promise<InventorySnapshot>;
  listReports: () => Promise<StockReport[]>;
  submitReport: (payload: StockReportSubmission) => Promise<StockReport>;
}

export interface DesktopPreferencesBridge {
  get: () => Promise<DesktopPreferences>;
  save: (payload: Partial<DesktopPreferences>) => Promise<DesktopPreferences>;
}

export interface DesktopSystemBridge {
  getAppContext: () => Promise<DesktopAppContext>;
  getLocalDataInfo: () => Promise<DesktopLocalDataInfo>;
  openLocalDataFolder: () => Promise<void>;
}

export interface DesktopBridge {
  inventory: DesktopInventoryBridge;
  preferences: DesktopPreferencesBridge;
  sena: DesktopSenaBridge;
  system: DesktopSystemBridge;
}

export const IPC_CHANNELS = {
  systemGetAppContext: 'banji:system:get-app-context',
  systemGetLocalDataInfo: 'banji:system:get-local-data-info',
  systemOpenLocalDataFolder: 'banji:system:open-local-data-folder',
  inventoryLoadSnapshot: 'banji:inventory:load-snapshot',
  inventoryListReports: 'banji:inventory:list-reports',
  inventorySubmitReport: 'banji:inventory:submit-report',
  senaGetCatalog: 'banji:sena:get-catalog',
  senaListObservations: 'banji:sena:list-observations',
  senaUpsertCatalog: 'banji:sena:upsert-catalog',
  senaIngestObservation: 'banji:sena:ingest-observation',
  senaTriggerRun: 'banji:sena:trigger-run',
  senaRetryRun: 'banji:sena:retry-run',
  senaGetWorkspaceSummary: 'banji:sena:get-workspace-summary',
  senaGetSkuDetail: 'banji:sena:get-sku-detail',
  senaGetDiagnostics: 'banji:sena:get-diagnostics',
  senaGetServiceDetail: 'banji:sena:get-service-detail',
  senaGetRunStatus: 'banji:sena:get-run-status',
  preferencesGet: 'banji:preferences:get',
  preferencesSave: 'banji:preferences:save',
} as const;
