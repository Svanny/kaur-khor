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
  SenaObservationDeletePayload,
  SenaDetailWindowRequest,
  SenaDiagnostics,
  SenaObservationInput,
  SenaObservationRecord,
  SenaObservationUpdatePayload,
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
  backupDirectoryPath: string;
  storageFormat: 'sqlite';
}

export interface DesktopBackupSnapshotResult {
  createdAt: string;
  fileCount: number;
  snapshotPath: string;
  trigger: 'manual' | 'automatic';
}

export interface DesktopBackupRestoreResult {
  restoredSnapshotPath: string;
  safetySnapshot: DesktopBackupSnapshotResult;
}

export interface DesktopClearCurrentDataResult {
  clearedFileCount: number;
  safetySnapshot: DesktopBackupSnapshotResult;
}

export interface DesktopPreferences {
  language: AppLanguage;
  currency: AppCurrency;
  usdToKhrExchangeRate: number;
  showExplanatoryTooltips: boolean;
  showFloatingTitleActions: boolean;
  showRightRailCards: boolean;
  senaEngineParameters: SenaEngineParameters;
  overviewStaleUpdateReminderSnoozeUntil: string | null;
}

export interface SenaEngineParameters {
  algorithmVersion: string;
  particleCount: number;
  targetServiceLevel: number;
  recommendationQuantile: number;
  intervalLowQuantile: number;
  intervalHighQuantile: number;
  needProbabilityGate: number;
  reviewDelayDays: number;
  smoothingEnabled: boolean;
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
  parameters?: SenaEngineParameters;
}

export interface SenaDetailCacheClearPayload {
  entityType: 'sku' | 'service';
  entityId: string;
}

export interface DesktopSenaBridge {
  getCatalog: () => Promise<SenaCatalog | null>;
  listObservations: () => Promise<SenaObservationRecord[]>;
  upsertCatalog: (payload: SenaCatalog) => Promise<SenaCatalog>;
  ingestObservation: (payload: SenaObservationInput) => Promise<SenaObservationRecord>;
  updateObservation: (payload: SenaObservationUpdatePayload) => Promise<SenaObservationRecord>;
  deleteObservation: (payload: SenaObservationDeletePayload) => Promise<void>;
  triggerRun: (payload?: SenaTriggerRunPayload) => Promise<SenaAnalysisRunRecord>;
  retryRun: (payload: SenaRunLookupPayload) => Promise<SenaAnalysisRunRecord>;
  getWorkspaceSummary: () => Promise<SenaWorkspaceSummary | null>;
  getSkuDetail: (payload: SenaSkuLookupPayload & Partial<SenaDetailWindowRequest>) => Promise<SenaSkuDetailPage | null>;
  getServiceDetail: (payload: SenaServiceLookupPayload & Partial<SenaDetailWindowRequest>) => Promise<SenaServiceDetailPage | null>;
  clearDetailCache: (payload: SenaDetailCacheClearPayload) => Promise<void>;
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
  createBackupSnapshot: () => Promise<DesktopBackupSnapshotResult>;
  restoreBackupSnapshot: () => Promise<DesktopBackupRestoreResult | null>;
  clearCurrentData: () => Promise<DesktopClearCurrentDataResult>;
  revealPath: (path: string) => Promise<void>;
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
  systemCreateBackupSnapshot: 'banji:system:create-backup-snapshot',
  systemRestoreBackupSnapshot: 'banji:system:restore-backup-snapshot',
  systemClearCurrentData: 'banji:system:clear-current-data',
  systemRevealPath: 'banji:system:reveal-path',
  inventoryLoadSnapshot: 'banji:inventory:load-snapshot',
  inventoryListReports: 'banji:inventory:list-reports',
  inventorySubmitReport: 'banji:inventory:submit-report',
  senaGetCatalog: 'banji:sena:get-catalog',
  senaListObservations: 'banji:sena:list-observations',
  senaUpsertCatalog: 'banji:sena:upsert-catalog',
  senaIngestObservation: 'banji:sena:ingest-observation',
  senaUpdateObservation: 'banji:sena:update-observation',
  senaDeleteObservation: 'banji:sena:delete-observation',
  senaTriggerRun: 'banji:sena:trigger-run',
  senaRetryRun: 'banji:sena:retry-run',
  senaGetWorkspaceSummary: 'banji:sena:get-workspace-summary',
  senaGetSkuDetail: 'banji:sena:get-sku-detail',
  senaGetDiagnostics: 'banji:sena:get-diagnostics',
  senaGetServiceDetail: 'banji:sena:get-service-detail',
  senaClearDetailCache: 'banji:sena:clear-detail-cache',
  senaGetRunStatus: 'banji:sena:get-run-status',
  preferencesGet: 'banji:preferences:get',
  preferencesSave: 'banji:preferences:save',
} as const;

export const DEFAULT_USD_TO_KHR_EXCHANGE_RATE = 4000;

export const DEFAULT_SENA_ENGINE_PARAMETERS: SenaEngineParameters = {
  algorithmVersion: 'sena-analysis-v3',
  particleCount: 256,
  targetServiceLevel: 0.95,
  recommendationQuantile: 0.7,
  intervalLowQuantile: 0.1,
  intervalHighQuantile: 0.9,
  needProbabilityGate: 0.5,
  reviewDelayDays: 0,
  smoothingEnabled: false,
};

export function normalizeDesktopPreferenceTimestamp(value: string | null | undefined) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return null;
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) {
    return null;
  }
  return parsed.toISOString();
}

export function normalizeSenaEngineParameters(
  value: Partial<SenaEngineParameters> | null | undefined,
): SenaEngineParameters {
  const defaultParameters = DEFAULT_SENA_ENGINE_PARAMETERS;
  const intervalLowQuantile = clampNumber(value?.intervalLowQuantile, 0, 1, defaultParameters.intervalLowQuantile);
  const intervalHighQuantile = clampNumber(value?.intervalHighQuantile, intervalLowQuantile, 1, defaultParameters.intervalHighQuantile);

  return {
    algorithmVersion:
      typeof value?.algorithmVersion === 'string' && value.algorithmVersion.trim().length > 0
        ? value.algorithmVersion.trim()
        : defaultParameters.algorithmVersion,
    particleCount: Math.round(clampNumber(value?.particleCount, 32, 2048, defaultParameters.particleCount)),
    targetServiceLevel: clampNumber(value?.targetServiceLevel, 0.5, 0.999, defaultParameters.targetServiceLevel),
    recommendationQuantile: clampNumber(value?.recommendationQuantile, 0, 1, defaultParameters.recommendationQuantile),
    intervalLowQuantile,
    intervalHighQuantile,
    needProbabilityGate: clampNumber(value?.needProbabilityGate, 0, 1, defaultParameters.needProbabilityGate),
    reviewDelayDays: clampNumber(value?.reviewDelayDays, 0, 365, defaultParameters.reviewDelayDays),
    smoothingEnabled: value?.smoothingEnabled ?? defaultParameters.smoothingEnabled,
  };
}

export function senaEngineParametersEqual(left: SenaEngineParameters, right: SenaEngineParameters) {
  return (
    left.algorithmVersion === right.algorithmVersion &&
    left.particleCount === right.particleCount &&
    left.targetServiceLevel === right.targetServiceLevel &&
    left.recommendationQuantile === right.recommendationQuantile &&
    left.intervalLowQuantile === right.intervalLowQuantile &&
    left.intervalHighQuantile === right.intervalHighQuantile &&
    left.needProbabilityGate === right.needProbabilityGate &&
    left.reviewDelayDays === right.reviewDelayDays &&
    left.smoothingEnabled === right.smoothingEnabled
  );
}

function clampNumber(
  value: number | null | undefined,
  minimum: number,
  maximum: number,
  fallback: number,
) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(value, minimum), maximum);
}
