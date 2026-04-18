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
  SenaCreateOrderBatchPayload,
  SenaObservationDeletePayload,
  SenaDetailWindowRequest,
  SenaDiagnostics,
  SenaObservationInput,
  SenaOrderBatchRecord,
  SenaOrderLookupPayload,
  SenaObservationRecord,
  SenaSplitOrderChildPayload,
  SenaObservationUpdatePayload,
  SenaServiceDetailPage,
  SenaSkuDetailPage,
  SenaUpdateOrderBatchPayload,
  SenaUpdateOrderChildPayload,
  SenaWorkspaceSummary,
} from './sena';
import type { BanjiBenchmarkEvent, BanjiBenchmarkMetadata } from './benchmark';

export interface DesktopAppContext {
  appVersion: string;
  platform: string;
}

export interface DesktopLocalDataInfo {
  dataDirectoryPath: string;
  workspaceStorePath: string;
  preferencesPath: string;
  backupDirectoryPath: string;
  assetDirectoryPath: string;
  storageFormat: 'sqlite';
}

export type DesktopItemImageMode = 'off' | 'thumbnail' | 'small' | 'medium';

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

export type DesktopTaskBatchUpdatePreference = 'always_batch' | 'always_alone' | 'ask';

export interface DesktopTaskBatchUpdatePreferences {
  logOrder: DesktopTaskBatchUpdatePreference;
  updateEta: DesktopTaskBatchUpdatePreference;
  followUp: DesktopTaskBatchUpdatePreference;
  receive: DesktopTaskBatchUpdatePreference;
  review: DesktopTaskBatchUpdatePreference;
}

export type DesktopSeenUnlockedNavItemId = 'catalog' | 'operations' | 'performance' | 'financials';

export type DesktopSeenUnlockedNavItems = Partial<Record<DesktopSeenUnlockedNavItemId, boolean>>;

export interface DesktopPreferences {
  language: AppLanguage;
  currency: AppCurrency;
  usdToKhrExchangeRate: number;
  displayViewMode: 'compact' | 'custom';
  itemImageMode: DesktopItemImageMode;
  dimChartsWhileLoading: boolean;
  showExplanatoryTooltips: boolean;
  showFloatingTitleActions: boolean;
  showRightRailCards: boolean;
  showOverviewTaskTabs: boolean;
  showAnalysisPage: boolean;
  showPerformanceCompareToggle: boolean;
  showPerformanceTimelineCard: boolean;
  showLogsViewToggle: boolean;
  showHeartbeatRibbons: boolean;
  taskBatchUpdatePreferences: DesktopTaskBatchUpdatePreferences;
  customShowExplanatoryTooltips: boolean;
  customShowFloatingTitleActions: boolean;
  customShowRightRailCards: boolean;
  customShowOverviewTaskTabs: boolean;
  customShowAnalysisPage: boolean;
  customShowPerformanceCompareToggle: boolean;
  customShowPerformanceTimelineCard: boolean;
  customShowLogsViewToggle: boolean;
  customShowHeartbeatRibbons: boolean;
  senaEngineParameters: SenaEngineParameters;
  overviewStaleUpdateReminderSnoozeUntil: string | null;
  onboardingCompletedAt: string | null;
  seenUnlockedNavItems: DesktopSeenUnlockedNavItems;
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
  listOrderBatches: (payload?: SenaOrderLookupPayload) => Promise<SenaOrderBatchRecord[]>;
  upsertCatalog: (payload: SenaCatalog) => Promise<SenaCatalog>;
  ingestObservation: (payload: SenaObservationInput) => Promise<SenaObservationRecord>;
  updateObservation: (payload: SenaObservationUpdatePayload) => Promise<SenaObservationRecord>;
  deleteObservation: (payload: SenaObservationDeletePayload) => Promise<void>;
  createOrderBatch: (payload: SenaCreateOrderBatchPayload) => Promise<SenaOrderBatchRecord>;
  updateOrderBatch: (payload: SenaUpdateOrderBatchPayload) => Promise<SenaOrderBatchRecord>;
  updateOrderChild: (payload: SenaUpdateOrderChildPayload) => Promise<SenaOrderBatchRecord>;
  splitOrderChild: (payload: SenaSplitOrderChildPayload) => Promise<SenaOrderBatchRecord>;
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
  pickAndStoreImage: () => Promise<string | null>;
}

export interface DesktopBenchmarkBridge extends BanjiBenchmarkMetadata {
  recordEvent: (event: BanjiBenchmarkEvent) => void;
}

export interface DesktopBridge {
  benchmark?: DesktopBenchmarkBridge;
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
  systemPickAndStoreImage: 'banji:system:pick-and-store-image',
  inventoryLoadSnapshot: 'banji:inventory:load-snapshot',
  inventoryListReports: 'banji:inventory:list-reports',
  inventorySubmitReport: 'banji:inventory:submit-report',
  senaGetCatalog: 'banji:sena:get-catalog',
  senaListObservations: 'banji:sena:list-observations',
  senaListOrderBatches: 'banji:sena:list-order-batches',
  senaUpsertCatalog: 'banji:sena:upsert-catalog',
  senaIngestObservation: 'banji:sena:ingest-observation',
  senaUpdateObservation: 'banji:sena:update-observation',
  senaDeleteObservation: 'banji:sena:delete-observation',
  senaCreateOrderBatch: 'banji:sena:create-order-batch',
  senaUpdateOrderBatch: 'banji:sena:update-order-batch',
  senaUpdateOrderChild: 'banji:sena:update-order-child',
  senaSplitOrderChild: 'banji:sena:split-order-child',
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
  benchmarkRecordEvent: 'banji:benchmark:record-event',
} as const;

export const DEFAULT_USD_TO_KHR_EXCHANGE_RATE = 4000;
export const DEFAULT_DESKTOP_ITEM_IMAGE_MODE: DesktopItemImageMode = 'small';

export const DEFAULT_TASK_BATCH_UPDATE_PREFERENCES: DesktopTaskBatchUpdatePreferences = {
  logOrder: 'ask',
  updateEta: 'ask',
  followUp: 'ask',
  receive: 'ask',
  review: 'ask',
};

export const DEFAULT_DESKTOP_SEEN_UNLOCKED_NAV_ITEMS: DesktopSeenUnlockedNavItems = {
  catalog: false,
  operations: false,
  performance: false,
  financials: false,
};

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

export function normalizeDesktopTaskBatchUpdatePreferences(
  value:
    | Partial<DesktopTaskBatchUpdatePreferences>
    | null
    | undefined,
  legacyValue?: DesktopTaskBatchUpdatePreference | null,
): DesktopTaskBatchUpdatePreferences {
  const fallbackValue =
    legacyValue === 'always_batch' || legacyValue === 'always_alone' || legacyValue === 'ask'
      ? legacyValue
      : 'ask';

  return {
    logOrder:
      value?.logOrder === 'always_batch' || value?.logOrder === 'always_alone' || value?.logOrder === 'ask'
        ? value.logOrder
        : fallbackValue,
    updateEta:
      value?.updateEta === 'always_batch' || value?.updateEta === 'always_alone' || value?.updateEta === 'ask'
        ? value.updateEta
        : fallbackValue,
    followUp:
      value?.followUp === 'always_batch' || value?.followUp === 'always_alone' || value?.followUp === 'ask'
        ? value.followUp
        : fallbackValue,
    receive:
      value?.receive === 'always_batch' || value?.receive === 'always_alone' || value?.receive === 'ask'
        ? value.receive
        : fallbackValue,
    review:
      value?.review === 'always_batch' || value?.review === 'always_alone' || value?.review === 'ask'
        ? value.review
        : fallbackValue,
  };
}

export function normalizeDesktopSeenUnlockedNavItems(
  value: DesktopSeenUnlockedNavItems | null | undefined,
  fallbackValue: boolean = false,
): DesktopSeenUnlockedNavItems {
  return {
    catalog: value?.catalog ?? fallbackValue,
    operations: value?.operations ?? fallbackValue,
    performance: value?.performance ?? fallbackValue,
    financials: value?.financials ?? fallbackValue,
  };
}

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
