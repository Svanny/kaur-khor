import type {
  AppCurrency,
  AppLanguage,
} from './inventory';
import type { InterfaceViewMode } from './interface-view';
import type {
  SenaAnalysisRunRecord,
  SenaCatalog,
  SenaCreateOrderBatchPayload,
  SenaObservationDeletePayload,
  SenaDetailWindowRequest,
  SenaDiagnostics,
  SenaObservationInput,
  SenaObservationPage,
  SenaObservationPageRequest,
  SenaOrderBatchRecord,
  SenaOrderLookupPayload,
  SenaObservationRecord,
  SenaObservationFingerprint,
  SenaRecordUpdateContext,
  SenaSplitOrderChildPayload,
  SenaObservationUpdatePayload,
  SenaServiceDetailPage,
  SenaSkuDetailPage,
  SenaStartupWorkspace,
  SenaUpdateOrderBatchPayload,
  SenaUpdateOrderChildPayload,
  SenaWorkspaceSummary,
} from './sena';
import type {
  KaurKhorBenchmarkEvent,
  KaurKhorBenchmarkMetadata,
  KaurKhorBenchmarkRunnerBridge,
} from './benchmark';
import type {
  AutomationChannelConnection,
  AutomationConversationSummary,
  AutomationExposureRow,
  AutomationMessageRecord,
  AutomationOrderIntake,
  AutomationIntakeStatus,
  AutomationWorkspace,
  PromoteAutomationIntakePayload,
  PromoteAutomationIntakeResult,
} from './automation';

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

export type DesktopSeenUnlockedNavItemId =
  | 'catalog'
  | 'insights'
  | 'work';

export type DesktopSeenUnlockedNavItems = Partial<Record<DesktopSeenUnlockedNavItemId, boolean>>;

export const DESKTOP_WORKBENCH_TILE_ORDER_LANE_IDS = [
  'stock-count',
  'supplier-order-pending',
  'customer-order-pending',
  'customer-order-completed',
] as const;

export type DesktopWorkbenchTileOrderLaneId =
  typeof DESKTOP_WORKBENCH_TILE_ORDER_LANE_IDS[number];

export type DesktopWorkbenchTileOrderByLane = Partial<Record<DesktopWorkbenchTileOrderLaneId, string[]>>;

export interface DesktopPreferences {
  language: AppLanguage;
  currency: AppCurrency;
  usdToKhrExchangeRate: number;
  displayViewMode: InterfaceViewMode;
  itemImageMode: DesktopItemImageMode;
  dimChartsWhileLoading: boolean;
  showExplanatoryTooltips: boolean;
  showFloatingTitleActions: boolean;
  showRightRailCards: boolean;
  showOverviewTaskTabs: boolean;
  showAutomationsPage: boolean;
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
  customShowAutomationsPage: boolean;
  customShowAnalysisPage: boolean;
  customShowPerformanceCompareToggle: boolean;
  customShowPerformanceTimelineCard: boolean;
  customShowLogsViewToggle: boolean;
  customShowHeartbeatRibbons: boolean;
  senaEngineParameters: SenaEngineParameters;
  overviewStaleUpdateReminderSnoozeUntil: string | null;
  onboardingCompletedAt: string | null;
  seenUnlockedNavItems: DesktopSeenUnlockedNavItems;
  workbenchTileOrderByLane: DesktopWorkbenchTileOrderByLane;
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
  getObservationFingerprint: () => Promise<SenaObservationFingerprint>;
  getStartupWorkspace: () => Promise<SenaStartupWorkspace>;
  getRecordUpdateContext: () => Promise<SenaRecordUpdateContext>;
  listObservationPage: (payload?: SenaObservationPageRequest) => Promise<SenaObservationPage>;
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

export interface DesktopPreferencesBridge {
  get: () => Promise<DesktopPreferences>;
  save: (payload: Partial<DesktopPreferences>) => Promise<DesktopPreferences>;
}

export interface DesktopStoreDroppedImagePayload {
  name: string;
  type?: string;
  data: ArrayBuffer;
}

export interface DesktopSystemBridge {
  getAppContext: () => Promise<DesktopAppContext>;
  getLocalDataInfo: () => Promise<DesktopLocalDataInfo>;
  createBackupSnapshot: () => Promise<DesktopBackupSnapshotResult>;
  restoreBackupSnapshot: () => Promise<DesktopBackupRestoreResult | null>;
  clearCurrentData: () => Promise<DesktopClearCurrentDataResult>;
  revealPath: (path: string) => Promise<void>;
  openExternalUrl: (url: string) => Promise<void>;
  pickAndStoreImage: () => Promise<string | null>;
  storeDroppedImage: (payload: DesktopStoreDroppedImagePayload) => Promise<string | null>;
}

export interface DesktopBenchmarkBridge extends KaurKhorBenchmarkMetadata {
  recordEvent: (event: KaurKhorBenchmarkEvent) => void;
  getEventCount?: (name: string) => Promise<number>;
  waitForEventCount?: (payload: {
    name: string;
    minimumCount: number;
    timeoutMs?: number;
  }) => Promise<{ count: number; ts: number | null }>;
}

export interface AutomationExposurePatch {
  entityType: 'sku' | 'service';
  entityId: string;
  exposed?: boolean;
  alias?: string | null;
  sortOrder?: number | null;
}

export interface AutomationConnectionPatch {
  channel: 'telegram';
  status?: 'connected' | 'paused' | 'disconnected' | 'error';
  botToken?: string | null;
  botUsername?: string | null;
  botDisplayName?: string | null;
  externalLink?: string | null;
}

export interface AutomationListIntakesPayload {
  status?: AutomationIntakeStatus;
  q?: string | null;
  conversationId?: string | null;
  ticketId?: string | null;
}

export interface AutomationReadConversationPayload {
  conversationId: string;
}

export interface AutomationReadIntakePayload {
  intakeId: string;
}

export interface AutomationResolveIntakePayload {
  intakeId: string;
  status: 'needs_review' | 'quoted' | 'canceled';
  note?: string | null;
}

export interface AutomationBenchmarkSeedPayload {
  minimumExposedRows?: number;
  minimumIntakes?: number;
}

export interface AutomationBenchmarkSeedResult {
  exposedRows: number;
  intakeRows: number;
  needsReviewRows: number;
  targetSupplierFilterLabel: string;
}

export interface DesktopAutomationBridge {
  getWorkspace: () => Promise<AutomationWorkspace>;
  seedBenchmarkWorkspace?: (payload?: AutomationBenchmarkSeedPayload) => Promise<AutomationBenchmarkSeedResult>;
  getConnection: () => Promise<AutomationChannelConnection>;
  saveConnection: (payload: AutomationConnectionPatch) => Promise<AutomationChannelConnection>;
  listExposureRows: () => Promise<AutomationExposureRow[]>;
  patchExposureRow: (payload: AutomationExposurePatch) => Promise<AutomationExposureRow>;
  listConversations: () => Promise<AutomationConversationSummary[]>;
  readConversation: (payload: AutomationReadConversationPayload) => Promise<{
    conversation: AutomationConversationSummary;
    messages: AutomationMessageRecord[];
    intakes: AutomationOrderIntake[];
  }>;
  listIntakes: (payload?: AutomationListIntakesPayload) => Promise<AutomationOrderIntake[]>;
  readIntake: (payload: AutomationReadIntakePayload) => Promise<AutomationOrderIntake | null>;
  resolveIntake: (payload: AutomationResolveIntakePayload) => Promise<AutomationOrderIntake>;
  promoteIntake: (payload: PromoteAutomationIntakePayload) => Promise<PromoteAutomationIntakeResult>;
  testTelegramConnection: () => Promise<AutomationChannelConnection>;
}

export interface DesktopBridge {
  automation?: DesktopAutomationBridge;
  benchmark?: DesktopBenchmarkBridge;
  benchmarkRunner?: KaurKhorBenchmarkRunnerBridge;
  preferences: DesktopPreferencesBridge;
  sena: DesktopSenaBridge;
  system: DesktopSystemBridge;
}

export const IPC_CHANNELS = {
  automationGetWorkspace: 'kaur-khor:automation:get-workspace',
  automationSeedBenchmarkWorkspace: 'kaur-khor:automation:seed-benchmark-workspace',
  automationGetConnection: 'kaur-khor:automation:get-connection',
  automationSaveConnection: 'kaur-khor:automation:save-connection',
  automationListExposureRows: 'kaur-khor:automation:list-exposure-rows',
  automationPatchExposureRow: 'kaur-khor:automation:patch-exposure-row',
  automationListConversations: 'kaur-khor:automation:list-conversations',
  automationReadConversation: 'kaur-khor:automation:read-conversation',
  automationListIntakes: 'kaur-khor:automation:list-intakes',
  automationReadIntake: 'kaur-khor:automation:read-intake',
  automationResolveIntake: 'kaur-khor:automation:resolve-intake',
  automationPromoteIntake: 'kaur-khor:automation:promote-intake',
  automationTestTelegramConnection: 'kaur-khor:automation:test-telegram-connection',
  systemGetAppContext: 'kaur-khor:system:get-app-context',
  systemGetLocalDataInfo: 'kaur-khor:system:get-local-data-info',
  systemCreateBackupSnapshot: 'kaur-khor:system:create-backup-snapshot',
  systemRestoreBackupSnapshot: 'kaur-khor:system:restore-backup-snapshot',
  systemClearCurrentData: 'kaur-khor:system:clear-current-data',
  systemRevealPath: 'kaur-khor:system:reveal-path',
  systemOpenExternalUrl: 'kaur-khor:system:open-external-url',
  systemPickAndStoreImage: 'kaur-khor:system:pick-and-store-image',
  systemStoreDroppedImage: 'kaur-khor:system:store-dropped-image',
  senaGetCatalog: 'kaur-khor:sena:get-catalog',
  senaGetObservationFingerprint: 'kaur-khor:sena:get-observation-fingerprint',
  senaGetStartupWorkspace: 'kaur-khor:sena:get-startup-workspace',
  senaGetRecordUpdateContext: 'kaur-khor:sena:get-record-update-context',
  senaListObservationPage: 'kaur-khor:sena:list-observation-page',
  senaListObservations: 'kaur-khor:sena:list-observations',
  senaListOrderBatches: 'kaur-khor:sena:list-order-batches',
  senaUpsertCatalog: 'kaur-khor:sena:upsert-catalog',
  senaIngestObservation: 'kaur-khor:sena:ingest-observation',
  senaUpdateObservation: 'kaur-khor:sena:update-observation',
  senaDeleteObservation: 'kaur-khor:sena:delete-observation',
  senaCreateOrderBatch: 'kaur-khor:sena:create-order-batch',
  senaUpdateOrderBatch: 'kaur-khor:sena:update-order-batch',
  senaUpdateOrderChild: 'kaur-khor:sena:update-order-child',
  senaSplitOrderChild: 'kaur-khor:sena:split-order-child',
  senaTriggerRun: 'kaur-khor:sena:trigger-run',
  senaRetryRun: 'kaur-khor:sena:retry-run',
  senaGetWorkspaceSummary: 'kaur-khor:sena:get-workspace-summary',
  senaGetSkuDetail: 'kaur-khor:sena:get-sku-detail',
  senaGetDiagnostics: 'kaur-khor:sena:get-diagnostics',
  senaGetServiceDetail: 'kaur-khor:sena:get-service-detail',
  senaClearDetailCache: 'kaur-khor:sena:clear-detail-cache',
  senaGetRunStatus: 'kaur-khor:sena:get-run-status',
  preferencesGet: 'kaur-khor:preferences:get',
  preferencesSave: 'kaur-khor:preferences:save',
  benchmarkRecordEvent: 'kaur-khor:benchmark:record-event',
  benchmarkGetEventCount: 'kaur-khor:benchmark:get-event-count',
  benchmarkWaitForEventCount: 'kaur-khor:benchmark:wait-for-event-count',
  benchmarkRunnerGetAvailability: 'kaur-khor:benchmark-runner:get-availability',
  benchmarkRunnerListRuns: 'kaur-khor:benchmark-runner:list-runs',
  benchmarkRunnerReadRun: 'kaur-khor:benchmark-runner:read-run',
  benchmarkRunnerStartRun: 'kaur-khor:benchmark-runner:start-run',
  benchmarkRunnerCancelRun: 'kaur-khor:benchmark-runner:cancel-run',
  benchmarkRunnerCompareRuns: 'kaur-khor:benchmark-runner:compare-runs',
  benchmarkRunnerGenerateFlamegraph: 'kaur-khor:benchmark-runner:generate-flamegraph',
  benchmarkRunnerRevealRun: 'kaur-khor:benchmark-runner:reveal-run',
  benchmarkRunnerEvent: 'kaur-khor:benchmark-runner:event',
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
  insights: false,
  work: false,
};

export const DEFAULT_DESKTOP_WORKBENCH_TILE_ORDER_BY_LANE: DesktopWorkbenchTileOrderByLane = {};

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
  const legacyValue = value as (DesktopSeenUnlockedNavItems & {
    automations?: boolean;
    financials?: boolean;
    operations?: boolean;
    performance?: boolean;
  }) | null | undefined;
  return {
    catalog: value?.catalog ?? fallbackValue,
    insights: value?.insights ?? legacyValue?.performance ?? legacyValue?.financials ?? fallbackValue,
    work: value?.work ?? legacyValue?.operations ?? legacyValue?.automations ?? fallbackValue,
  };
}

export function normalizeDesktopWorkbenchTileOrderByLane(
  value: DesktopWorkbenchTileOrderByLane | null | undefined,
): DesktopWorkbenchTileOrderByLane {
  if (!value || typeof value !== 'object') {
    return {};
  }

  const normalized: DesktopWorkbenchTileOrderByLane = {};

  for (const laneId of DESKTOP_WORKBENCH_TILE_ORDER_LANE_IDS) {
    const rawValue = value[laneId];
    if (!Array.isArray(rawValue)) {
      continue;
    }

    const seenTileIds = new Set<string>();
    const sanitized = rawValue.filter((entry): entry is string => {
      if (typeof entry !== 'string' || entry.length === 0 || seenTileIds.has(entry)) {
        return false;
      }
      seenTileIds.add(entry);
      return true;
    });

    if (sanitized.length > 0) {
      normalized[laneId] = sanitized;
    }
  }

  return normalized;
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
