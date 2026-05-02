import { DEFAULT_SENA_ENGINE_PARAMETERS } from '@shared/ipc';
import { SENA_SCHEMA_VERSION } from '@shared/sena';
import {
  browserSenaObservationFingerprint,
  browserSenaObservationPage,
  browserSenaRecordUpdateContext,
  pageBrowserSenaServiceDetail,
  pageBrowserSenaSkuDetail,
  runBrowserSenaAnalysisJson,
  type BrowserSenaAnalysisOutput,
} from '@/runtime/web/sena-analysis';
import type {
  AutomationChannelConnection,
  AutomationConversationSummary,
  AutomationExposureRow,
  AutomationMessageRecord,
  AutomationOrderIntake,
  AutomationWorkspace,
  PromoteAutomationIntakeResult,
} from '@shared/automation';
import { normalizePhoneLookupKey } from '@shared/phone';
import type {
  AutomationConnectionPatch,
  AutomationExposurePatch,
  AutomationListIntakesPayload,
  AutomationReadConversationPayload,
  AutomationReadIntakePayload,
  AutomationResolveIntakePayload,
  DesktopAppContext,
  DesktopBridge,
  DesktopLocalDataInfo,
  DesktopPreferences,
  PromoteAutomationIntakePayload,
  SenaRunLookupPayload,
  SenaTriggerRunPayload,
} from '@shared/ipc';
import type {
  type SenaAnalysisRunRecord,
  type SenaCatalog,
  type SenaDiagnostics,
  type SenaObservationInput,
  type SenaOrderBatchRecord,
  type SenaOrderChildRecord,
  type SenaOrderFieldValues,
  type SenaObservationPageRequest,
  type SenaObservationRecord,
  type SenaServiceDetail,
  type SenaSkuDetail,
  type SenaWorkspaceSummary,
} from '@shared/sena';

const MOCK_OWNER_SUB = 'browser-owner';
const MOCK_RUN_ID = 'browser-run-1';

function clone<T>(value: T): T {
  return structuredClone(value);
}

function nowIso() {
  return new Date().toISOString();
}

function makeOrderFieldValues(overrides: Partial<SenaOrderFieldValues> = {}): SenaOrderFieldValues {
  return {
    supplierName: null,
    supplierNote: null,
    orderedQuantity: null,
    receivedQuantity: null,
    costPerUnit: null,
    expectedArrivalAt: null,
    placementTimestamp: null,
    receiptTimestamp: null,
    leadTimeDaysHint: null,
    leadTimeVariability: null,
    deliveryFee: null,
    ...overrides,
  };
}

function mergeOrderFieldValues(
  base: SenaOrderFieldValues,
  patch?: Partial<SenaOrderFieldValues>,
): SenaOrderFieldValues {
  return makeOrderFieldValues({
    ...base,
    ...patch,
  });
}

function deriveOrderChildEffective(
  shared: SenaOrderFieldValues,
  overrides?: Partial<SenaOrderFieldValues>,
): SenaOrderFieldValues {
  return makeOrderFieldValues({
    ...shared,
    ...overrides,
  });
}

function orderBatchMatchesLookup(
  batch: SenaOrderBatchRecord,
  payload?: { batchOrderId?: string; childOrderId?: string; skuId?: string; supplierName?: string; status?: string },
) {
  if (!payload) {
    return true;
  }
  if (payload.batchOrderId && batch.batchOrderId !== payload.batchOrderId) {
    return false;
  }
  if (payload.supplierName && batch.supplierName !== payload.supplierName) {
    return false;
  }
  if (payload.status && batch.status !== payload.status) {
    return false;
  }
  if (payload.childOrderId && !batch.children.some((child) => child.childOrderId === payload.childOrderId)) {
    return false;
  }
  if (payload.skuId && !batch.children.some((child) => child.skuId === payload.skuId)) {
    return false;
  }
  return true;
}

function syncMockWorkspaceSummary(state: BrowserMockState) {
  const latestObservedAt = [...state.observations]
    .map((observation) => observation.input.observedAt)
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0] ?? null;
  state.workspaceSummary.latestObservedAt = latestObservedAt;
  state.workspaceSummary.intervalCount = state.observations.length;
  state.latestRun = {
    ...state.latestRun,
    observationCount: state.observations.length,
    summary: clone(state.workspaceSummary),
  };
}

function applyBrowserSenaAnalysis(output: BrowserSenaAnalysisOutput) {
  browserMockState.workspaceSummary = clone(output.workspaceSummary);
  browserMockState.diagnostics = clone(output.diagnostics);
  browserMockState.skuDetails = clone(output.skuDetails);
  browserMockState.serviceDetails = clone(output.serviceDetails);
  browserMockState.latestRun = clone(output.run);
}

function runBrowserSenaStateAnalysis(runId: string, payload?: SenaTriggerRunPayload) {
  const createdAt = nowIso();
  const output = JSON.parse(runBrowserSenaAnalysisJson(JSON.stringify({
    ownerSub: MOCK_OWNER_SUB,
    runId,
    createdAt,
    catalog: browserMockState.catalog,
    observations: browserMockState.observations,
    payload,
  }))) as BrowserSenaAnalysisOutput;
  applyBrowserSenaAnalysis(output);
  return output.run;
}

const mockCatalog: SenaCatalog = {
  schemaVersion: SENA_SCHEMA_VERSION,
  skus: [
    {
      skuId: 'sku-1',
      name: 'Rattan Market Tote',
      description: 'Woven tote for market edits and family promos.',
      supplierName: 'Siem Reap Rattan',
      costPerUnit: 18,
      soldAsProduct: true,
      productPrice: 42,
      leadTimeMeanDaysHint: 5,
      leadTimeStdDaysHint: 1,
      archived: false,
    },
    {
      skuId: 'sku-2',
      name: "Children's Krama Set",
      description: 'Giftable woven set for tourist pairings.',
      supplierName: 'Mekong Looms',
      costPerUnit: 12,
      soldAsProduct: true,
      productPrice: 28,
      leadTimeMeanDaysHint: 6,
      leadTimeStdDaysHint: 2,
      archived: false,
    },
    {
      skuId: 'sku-3',
      name: 'Krama Cotton Scarf',
      description: 'Soft scarf used across Khmer New Year edits.',
      supplierName: 'Mekong Looms',
      costPerUnit: 10,
      soldAsProduct: true,
      productPrice: 24,
      leadTimeMeanDaysHint: 4,
      leadTimeStdDaysHint: 1,
      archived: false,
    },
    {
      skuId: 'sku-4',
      name: 'Handwoven Belt',
      description: 'Fast-turn belt tied to blouse styling offers.',
      supplierName: null,
      costPerUnit: 9,
      soldAsProduct: true,
      productPrice: 22,
      leadTimeMeanDaysHint: 3,
      leadTimeStdDaysHint: 1,
      archived: false,
    },
    {
      skuId: 'sku-5',
      name: 'Premium Wedding Sampot',
      description: 'Ceremony fabric with a tight supply window.',
      supplierName: 'Phnom Silk Collective',
      costPerUnit: 26,
      soldAsProduct: true,
      productPrice: 58,
      leadTimeMeanDaysHint: 8,
      leadTimeStdDaysHint: 3,
      archived: false,
    },
  ],
  services: [
    {
      serviceId: 'service-1',
      name: 'Market Tote Add-On',
      description: 'Upsell set for woven accessories.',
      price: 18,
      bundle: false,
      archived: false,
    },
    {
      serviceId: 'service-2',
      name: 'Back-to-School Family Promo',
      description: 'Multi-item family capsule.',
      price: 35,
      bundle: false,
      archived: false,
    },
    {
      serviceId: 'service-3',
      name: 'Tourist Gift Pairing',
      description: 'Giftable souvenir pairing.',
      price: 16,
      bundle: false,
      archived: false,
    },
    {
      serviceId: 'service-4',
      name: 'Khmer New Year Capsule',
      description: 'Seasonal editorial assortment.',
      price: 40,
      bundle: false,
      archived: false,
    },
    {
      serviceId: 'service-5',
      name: 'Office Blouse Styling',
      description: 'Styling service dependent on matching accessories.',
      price: 14,
      bundle: false,
      archived: false,
    },
    {
      serviceId: 'service-6',
      name: 'Wedding Premium Bundle',
      description: 'High-value ceremony package.',
      price: 72,
      bundle: false,
      archived: false,
    },
    {
      serviceId: 'service-7',
      name: 'Pchum Ben Ceremony Set',
      description: 'Ceremonial packaged set.',
      price: 61,
      bundle: false,
      archived: false,
    },
  ],
  bundles: [],
  sharingMask: [
    { serviceId: 'service-1', skuId: 'sku-1', enabled: true, usageProbability: 1 },
    { serviceId: 'service-2', skuId: 'sku-1', enabled: true, usageProbability: 1 },
    { serviceId: 'service-3', skuId: 'sku-2', enabled: true, usageProbability: 1 },
    { serviceId: 'service-2', skuId: 'sku-2', enabled: true, usageProbability: 1 },
    { serviceId: 'service-3', skuId: 'sku-3', enabled: true, usageProbability: 1 },
    { serviceId: 'service-4', skuId: 'sku-3', enabled: true, usageProbability: 1 },
    { serviceId: 'service-5', skuId: 'sku-4', enabled: true, usageProbability: 1 },
    { serviceId: 'service-1', skuId: 'sku-4', enabled: true, usageProbability: 1 },
    { serviceId: 'service-6', skuId: 'sku-5', enabled: true, usageProbability: 1 },
    { serviceId: 'service-7', skuId: 'sku-5', enabled: true, usageProbability: 1 },
  ],
};

const mockWorkspaceSummary: SenaWorkspaceSummary = {
  ownerSub: MOCK_OWNER_SUB,
  runId: MOCK_RUN_ID,
  latestObservedAt: '2025-03-30T15:00:00.000Z',
  skuCount: 5,
  serviceCount: 7,
  intervalCount: 4,
  pendingReorderCount: 1,
  topRegime: 'normal',
  highRiskSkuIds: ['sku-1', 'sku-2', 'sku-3'],
  skuSummaries: [
    {
      skuId: 'sku-1',
      latestPosteriorUnits: 8,
      credibleIntervalLow: 0,
      credibleIntervalHigh: 41,
      demandPerDayMean: 4,
      stockoutRisk: 0.83,
      daysOfCover: 2,
      expectedLeadTimeDemand: 14,
      safetyStock: 6,
      reorderPoint: 18,
      reorderTriggerProbability: 1,
      leadTimeMeanDays: 5,
      leadTimeStdDays: 1,
      regimeProbabilities: { normal: 0.6, promo: 0.4 },
    },
    {
      skuId: 'sku-2',
      latestPosteriorUnits: 11,
      credibleIntervalLow: 8,
      credibleIntervalHigh: 14,
      demandPerDayMean: 3,
      stockoutRisk: 0.74,
      daysOfCover: 3,
      expectedLeadTimeDemand: 12,
      safetyStock: 4,
      reorderPoint: 15,
      reorderTriggerProbability: 0.66,
      leadTimeMeanDays: 6,
      leadTimeStdDays: 2,
      regimeProbabilities: { normal: 0.55, spike: 0.45 },
    },
    {
      skuId: 'sku-3',
      latestPosteriorUnits: 12,
      credibleIntervalLow: 9,
      credibleIntervalHigh: 16,
      demandPerDayMean: 3,
      stockoutRisk: 0.69,
      daysOfCover: 2.8,
      expectedLeadTimeDemand: 9,
      safetyStock: 3,
      reorderPoint: 13,
      reorderTriggerProbability: 0.61,
      leadTimeMeanDays: 4,
      leadTimeStdDays: 1,
      regimeProbabilities: { normal: 0.7, promo: 0.3 },
    },
    {
      skuId: 'sku-4',
      latestPosteriorUnits: 15,
      credibleIntervalLow: 12,
      credibleIntervalHigh: 18,
      demandPerDayMean: 1,
      stockoutRisk: 0.22,
      daysOfCover: 7,
      expectedLeadTimeDemand: 5,
      safetyStock: 2,
      reorderPoint: 10,
      reorderTriggerProbability: 0.2,
      leadTimeMeanDays: 3,
      leadTimeStdDays: 1,
      regimeProbabilities: { normal: 1 },
    },
    {
      skuId: 'sku-5',
      latestPosteriorUnits: 19,
      credibleIntervalLow: 16,
      credibleIntervalHigh: 23,
      demandPerDayMean: 2,
      stockoutRisk: 0.31,
      daysOfCover: 6,
      expectedLeadTimeDemand: 10,
      safetyStock: 4,
      reorderPoint: 14,
      reorderTriggerProbability: 0.28,
      leadTimeMeanDays: 8,
      leadTimeStdDays: 3,
      regimeProbabilities: { normal: 0.65, correction: 0.35 },
    },
  ],
};

const mockObservations: SenaObservationRecord[] = [
  {
    observationId: 'obs-order-rattan',
    ownerSub: MOCK_OWNER_SUB,
    input: {
      observedAt: '2025-03-28T08:00:00.000Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [
        {
          skuId: 'sku-1',
          orderPlaced: false,
          receiptArrived: false,
          approximateOrderQuantity: null,
          approximateReceiptQuantity: null,
        },
      ],
      servicePrices: [],
      retailPrices: [
        {
          skuId: 'sku-1',
          price: 38,
        },
      ],
      leadTimeHints: [],
      notes: 'Demand rose after a recent price move on Rattan Market Tote.',
    },
  },
  {
    observationId: 'obs-order-children',
    ownerSub: MOCK_OWNER_SUB,
    input: {
      observedAt: '2025-03-29T08:00:00.000Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [
        {
          skuId: 'sku-2',
          orderPlaced: false,
          receiptArrived: false,
          approximateOrderQuantity: null,
          approximateReceiptQuantity: null,
        },
      ],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes: 'Expected window passed without a confirmed receipt.',
    },
  },
  {
    observationId: 'obs-order-scarf',
    ownerSub: MOCK_OWNER_SUB,
    input: {
      observedAt: '2025-03-30T08:00:00.000Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [
        {
          skuId: 'sku-3',
          orderPlaced: false,
          receiptArrived: false,
          approximateOrderQuantity: null,
          approximateReceiptQuantity: null,
        },
      ],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes: 'Expected window passed without a confirmed receipt.',
    },
  },
  {
    observationId: 'obs-receive-belt',
    ownerSub: MOCK_OWNER_SUB,
    input: {
      observedAt: '2025-03-30T12:00:00.000Z',
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [
        {
          skuId: 'sku-4',
          orderPlaced: true,
          receiptArrived: false,
          approximateOrderQuantity: 24,
          approximateReceiptQuantity: null,
        },
      ],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes: 'Receipt window is open right now.',
    },
  },
  {
    observationId: 'obs-receipt-sampot',
    ownerSub: MOCK_OWNER_SUB,
    input: {
      observedAt: '2025-03-30T15:00:00.000Z',
      stockSnapshot: [
        {
          skuId: 'sku-5',
          unitsInStock: 19,
          costPerUnit: 26,
          productPrice: 58,
        },
      ],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [
        {
          skuId: 'sku-5',
          orderPlaced: true,
          receiptArrived: false,
          approximateOrderQuantity: 44,
          approximateReceiptQuantity: null,
        },
      ],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [
        {
          skuId: 'sku-5',
          typicalDays: 18,
          lowDays: 15,
          highDays: 21,
          variabilityClass: 'wide',
        },
      ],
      notes: 'Recent price signal Mar 30.',
    },
  },
];

const mockSkuDetails: Record<string, SenaSkuDetail> = {
  'sku-1': {
    summary: mockWorkspaceSummary.skuSummaries[0],
    inventoryPosterior: [],
    demandPosterior: [],
    pipelinePosterior: [],
    leadTimePosterior: [],
  },
  'sku-2': {
    summary: mockWorkspaceSummary.skuSummaries[1],
    inventoryPosterior: [],
    demandPosterior: [],
    pipelinePosterior: [],
    leadTimePosterior: [
      {
        intervalIndex: 2,
        logMeanDays: 0,
        logStdDays: 0,
        meanDays: 6,
        stdDays: 2,
        observedVariabilityClass: 'wide',
        observedRelativeWidth: 0.6,
      },
    ],
  },
  'sku-3': {
    summary: mockWorkspaceSummary.skuSummaries[2],
    inventoryPosterior: [],
    demandPosterior: [],
    pipelinePosterior: [],
    leadTimePosterior: [
      {
        intervalIndex: 2,
        logMeanDays: 0,
        logStdDays: 0,
        meanDays: 4,
        stdDays: 1,
        observedVariabilityClass: 'normal',
        observedRelativeWidth: 0.35,
      },
    ],
  },
  'sku-4': {
    summary: mockWorkspaceSummary.skuSummaries[3],
    inventoryPosterior: [],
    demandPosterior: [],
    pipelinePosterior: [
      {
        intervalIndex: 2,
        inTransitMean: 24,
        orderProbability: 0.92,
        orderQuantityMean: 24,
        receiptQuantityMean: 24,
        ageDaysMean: 4,
      },
    ],
    leadTimePosterior: [
      {
        intervalIndex: 2,
        logMeanDays: 0,
        logStdDays: 0,
        meanDays: 3,
        stdDays: 1,
        observedVariabilityClass: 'tight',
        observedRelativeWidth: 0.25,
      },
    ],
  },
  'sku-5': {
    summary: mockWorkspaceSummary.skuSummaries[4],
    inventoryPosterior: [],
    demandPosterior: [],
    pipelinePosterior: [
      {
        intervalIndex: 2,
        inTransitMean: 44,
        orderProbability: 0.86,
        orderQuantityMean: 44,
        receiptQuantityMean: 0,
        ageDaysMean: 2,
      },
    ],
    leadTimePosterior: [
      {
        intervalIndex: 2,
        logMeanDays: 0,
        logStdDays: 0,
        meanDays: 8,
        stdDays: 3,
        observedVariabilityClass: 'wide',
        observedRelativeWidth: 0.55,
      },
    ],
  },
};

const mockDiagnostics: SenaDiagnostics = {
  effectiveSampleSizeMean: 84,
  resamplingCount: 12,
  smoothingEnabled: true,
  changePointProbability: 0.22,
  seasonalityActive: false,
  posteriorPredictiveErrorMean: 0.18,
  coverageEstimate: 0.91,
  regimeHistory: [],
};

const mockLocalDataInfo: DesktopLocalDataInfo = {
  dataDirectoryPath: '/tmp/banji-browser-mock',
  workspaceStorePath: '/tmp/banji-browser-mock/sena.sqlite',
  preferencesPath: '/tmp/banji-browser-mock/preferences.json',
  backupDirectoryPath: '/tmp/banji-browser-mock/backup-snapshots',
  assetDirectoryPath: '/tmp/banji-browser-mock/assets',
  storageFormat: 'sqlite',
};

export type BrowserMockState = {
  appContext: DesktopAppContext;
  automation: AutomationWorkspace;
  automationMessages: Record<string, AutomationMessageRecord[]>;
  browserTelegramToken: string | null;
  browserTelegramUpdateOffset: number | null;
  catalog: SenaCatalog;
  diagnostics: SenaDiagnostics;
  latestRun: SenaAnalysisRunRecord;
  localDataInfo: DesktopLocalDataInfo;
  observations: SenaObservationRecord[];
  orderBatches: SenaOrderBatchRecord[];
  preferences: DesktopPreferences;
  serviceDetails: Record<string, SenaServiceDetail>;
  skuDetails: Record<string, SenaSkuDetail>;
  workspaceSummary: SenaWorkspaceSummary;
};

export function createMockState(): BrowserMockState {
  const automation = createMockAutomationWorkspace();
  const serviceDetails = Object.fromEntries(
    mockCatalog.services.map((service) => [
      service.serviceId,
      {
        serviceId: service.serviceId,
        activityMean: 10,
        activityIntervalLow: 6,
        activityIntervalHigh: 14,
        bottleneckProbability: 0.2,
        contributors: mockCatalog.sharingMask
          .filter((entry) => entry.enabled && entry.serviceId === service.serviceId)
          .map((entry) => ({
            skuId: entry.skuId,
            usageProbability: entry.usageProbability ?? 1,
            bottleneckProbability: 0.25,
          })),
        regimeTimeline: [],
      },
    ]),
  ) as Record<string, SenaServiceDetail>;

  const latestRun: SenaAnalysisRunRecord = {
    runId: MOCK_RUN_ID,
    ownerSub: MOCK_OWNER_SUB,
    algorithmVersion: 'sena-analysis-v3',
    status: 'succeeded',
    observationCount: mockObservations.length,
    createdAt: '2025-03-30T15:05:00.000Z',
    completedAt: '2025-03-30T15:05:03.000Z',
    summary: clone(mockWorkspaceSummary),
    diagnostics: clone(mockDiagnostics),
    primaryArtifactKey: null,
    error: null,
  };
  const orderBatches: SenaOrderBatchRecord[] = [
    {
      batchOrderId: 'browser-batch-1',
      ownerSub: MOCK_OWNER_SUB,
      supplierName: 'Siem Reap Rattan',
      status: 'awaiting_receipt',
      createdAt: '2025-03-29T09:00:00.000Z',
      updatedAt: '2025-03-30T10:00:00.000Z',
      shared: makeOrderFieldValues({
        supplierName: 'Siem Reap Rattan',
        supplierNote: 'Waiting on woven tote replenishment.',
        expectedArrivalAt: '2025-04-02T09:00:00.000Z',
        placementTimestamp: '2025-03-29T09:00:00.000Z',
        leadTimeDaysHint: 4,
        leadTimeVariability: 'tight',
      }),
      children: [
        {
          childOrderId: 'browser-child-1',
          skuId: 'sku-1',
          status: 'awaiting_receipt',
          createdAt: '2025-03-29T09:00:00.000Z',
          updatedAt: '2025-03-30T10:00:00.000Z',
          inheritedFromBatch: true,
          effective: makeOrderFieldValues({
            supplierName: 'Siem Reap Rattan',
            supplierNote: 'Waiting on woven tote replenishment.',
            orderedQuantity: 18,
            receivedQuantity: 0,
            costPerUnit: 18,
            expectedArrivalAt: '2025-04-02T09:00:00.000Z',
            placementTimestamp: '2025-03-29T09:00:00.000Z',
            leadTimeDaysHint: 4,
            leadTimeVariability: 'tight',
          }),
          overrides: {
            orderedQuantity: 18,
            receivedQuantity: 0,
            costPerUnit: 18,
          },
        },
      ],
    },
    {
      batchOrderId: 'browser-batch-2',
      ownerSub: MOCK_OWNER_SUB,
      supplierName: 'Phnom Silk Collective',
      status: 'open',
      createdAt: '2025-03-30T11:00:00.000Z',
      updatedAt: '2025-03-30T11:00:00.000Z',
      shared: makeOrderFieldValues({
        supplierName: 'Phnom Silk Collective',
        supplierNote: 'Premium wedding replenishment not placed yet.',
        expectedArrivalAt: '2025-04-07T09:00:00.000Z',
        leadTimeDaysHint: 8,
        leadTimeVariability: 'wide',
      }),
      children: [
        {
          childOrderId: 'browser-child-2',
          skuId: 'sku-5',
          status: 'open',
          createdAt: '2025-03-30T11:00:00.000Z',
          updatedAt: '2025-03-30T11:00:00.000Z',
          inheritedFromBatch: true,
          effective: makeOrderFieldValues({
            supplierName: 'Phnom Silk Collective',
            supplierNote: 'Premium wedding replenishment not placed yet.',
            orderedQuantity: 24,
            receivedQuantity: 0,
            costPerUnit: 26,
            expectedArrivalAt: '2025-04-07T09:00:00.000Z',
            leadTimeDaysHint: 8,
            leadTimeVariability: 'wide',
          }),
          overrides: {
            orderedQuantity: 24,
            receivedQuantity: 0,
            costPerUnit: 26,
          },
        },
      ],
    },
  ];

  return {
    appContext: {
      appVersion: 'browser-mock',
      platform: 'browser',
    },
    automation,
    automationMessages: {
      'conv-demo': [{
        messageId: 'msg-demo',
        conversationId: 'conv-demo',
        externalMessageKey: 'telegram-message-demo',
        direction: 'inbound',
        sentAt: nowIso(),
        rawText: 'I want 2 scarves',
        normalizedText: '2 x Cotton Scarf',
        parseConfidence: 'high',
      }],
    },
    browserTelegramToken: null,
    browserTelegramUpdateOffset: null,
    catalog: clone(mockCatalog),
    diagnostics: clone(mockDiagnostics),
    latestRun,
    localDataInfo: clone(mockLocalDataInfo),
    observations: clone(mockObservations),
    orderBatches,
    preferences: {
      language: 'en',
      currency: 'USD',
      usdToKhrExchangeRate: 4000,
      displayViewMode: 'custom',
      itemImageMode: 'small',
      dimChartsWhileLoading: false,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showOverviewTaskTabs: true,
      showAutomationsPage: true,
      showAnalysisPage: true,
      showPerformanceCompareToggle: true,
      showPerformanceTimelineCard: true,
      showLogsViewToggle: true,
      showHeartbeatRibbons: true,
      taskBatchUpdatePreferences: {
        logOrder: 'ask',
        updateEta: 'ask',
        followUp: 'ask',
        receive: 'ask',
        review: 'ask',
      },
      customShowExplanatoryTooltips: true,
      customShowFloatingTitleActions: true,
      customShowRightRailCards: true,
      customShowOverviewTaskTabs: true,
      customShowAutomationsPage: true,
      customShowAnalysisPage: true,
      customShowPerformanceCompareToggle: true,
      customShowPerformanceTimelineCard: true,
      customShowLogsViewToggle: true,
      customShowHeartbeatRibbons: true,
      senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
      overviewStaleUpdateReminderSnoozeUntil: null,
      onboardingCompletedAt: null,
      seenUnlockedNavItems: {
        catalog: true,
        operations: true,
        performance: true,
        financials: true,
        automations: true,
      },
    },
    serviceDetails,
    skuDetails: clone(mockSkuDetails),
    workspaceSummary: clone(mockWorkspaceSummary),
  };
}

let browserMockState = createMockState();
let observationCounter = browserMockState.observations.length + 1;
let runCounter = 2;
let automationTicketCounter = 1;
let orderBatchCounter = browserMockState.orderBatches.length + 1;
let orderChildCounter = browserMockState.orderBatches.reduce((count, batch) => count + batch.children.length, 0) + 1;

function resetBrowserMockCounters() {
  observationCounter = browserMockState.observations.length + 1;
  runCounter = 2;
  automationTicketCounter = 1;
  orderBatchCounter = browserMockState.orderBatches.length + 1;
  orderChildCounter = browserMockState.orderBatches.reduce((count, batch) => count + batch.children.length, 0) + 1;
}

type BrowserTelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    date?: number;
    text?: string;
    chat: {
      id: number | string;
      username?: string;
      first_name?: string;
      last_name?: string;
      title?: string;
    };
    from?: {
      username?: string;
      first_name?: string;
      last_name?: string;
    };
  };
};

type BrowserTelegramResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

function browserTelegramBlockedError() {
  return 'Telegram browser fetch was blocked or unavailable. Use the desktop app for persistent Telegram automation, or keep this browser tab open and awake in a browser that allows direct Telegram API requests.';
}

function browserTelegramConversationId(chatId: string | number) {
  return `conv_browser_telegram_${String(chatId).replace(/[^\w-]/g, '_')}`;
}

function browserTelegramDisplayName(update: BrowserTelegramUpdate) {
  const actor = update.message?.from ?? update.message?.chat;
  const fullName = [actor?.first_name, actor?.last_name].filter(Boolean).join(' ').trim();
  return fullName || update.message?.chat.title || actor?.username || 'Telegram customer';
}

function browserTelegramHandle(update: BrowserTelegramUpdate) {
  const username = update.message?.from?.username ?? update.message?.chat.username;
  return username ? `@${username.replace(/^@/, '')}` : null;
}

function markBrowserTelegramError(message: string) {
  browserMockState.automation.connection = {
    ...browserMockState.automation.connection,
    status: 'error',
    lastErrorAt: nowIso(),
    lastErrorMessage: message,
  };
}

async function browserTelegramRequest<T>(method: string, body: Record<string, unknown> = {}): Promise<T> {
  const token = browserMockState.browserTelegramToken;
  if (!token) {
    throw new Error('Save a Telegram bot token before polling from the browser tab.');
  }

  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error(browserTelegramBlockedError());
  }

  let payload: BrowserTelegramResponse<T>;
  try {
    payload = await response.json() as BrowserTelegramResponse<T>;
  } catch {
    throw new Error('Telegram returned a non-JSON response to the browser tab.');
  }

  if (!response.ok || !payload.ok || payload.result == null) {
    throw new Error(payload.description || `Telegram ${method} failed in the browser tab.`);
  }

  return payload.result;
}

function ingestBrowserTelegramUpdates(updates: BrowserTelegramUpdate[]) {
  for (const update of updates) {
    browserMockState.browserTelegramUpdateOffset = Math.max(
      browserMockState.browserTelegramUpdateOffset ?? 0,
      update.update_id + 1,
    );
    if (!update.message?.text) {
      continue;
    }

    const chatId = update.message.chat.id;
    const conversationId = browserTelegramConversationId(chatId);
    const existingConversation = browserMockState.automation.conversations.find((entry) => entry.conversationId === conversationId);
    const sentAt = update.message.date
      ? new Date(update.message.date * 1000).toISOString()
      : nowIso();
    const messageId = `browser-telegram-message-${update.message.message_id}`;
    const rawText = update.message.text;

    if (!existingConversation) {
      browserMockState.automation.conversations.push({
        conversationId,
        channel: 'telegram',
        externalConversationKey: `telegram-chat-${chatId}`,
        customerDisplayName: browserTelegramDisplayName(update),
        customerHandle: browserTelegramHandle(update),
        phone: null,
        lastMessageAt: sentAt,
        messageCount: 1,
        latestIntakeStatus: 'new',
        latestTicketId: null,
      });
    } else {
      existingConversation.lastMessageAt = sentAt;
      existingConversation.messageCount += 1;
      existingConversation.latestIntakeStatus = 'new';
    }

    const messages = browserMockState.automationMessages[conversationId] ?? [];
    if (!messages.some((entry) => entry.externalMessageKey === messageId)) {
      messages.push({
        messageId,
        conversationId,
        externalMessageKey: messageId,
        direction: 'inbound',
        sentAt,
        rawText,
        normalizedText: rawText.trim().toLowerCase(),
        parseConfidence: 'low',
      });
      browserMockState.automationMessages[conversationId] = messages;
    }

    const intakeId = `browser-telegram-intake-${update.update_id}`;
    if (!browserMockState.automation.intakes.some((entry) => entry.intakeId === intakeId)) {
      browserMockState.automation.intakes.push({
        intakeId,
        conversationId,
        channel: 'telegram',
        status: 'needs_review',
        parseConfidence: 'low',
        customerDisplayName: browserTelegramDisplayName(update),
        customerHandle: browserTelegramHandle(update),
        phone: null,
        notes: 'Browser tab Telegram polling intake. Review and resolve before promoting.',
        quotedSubtotal: null,
        currencyCode: 'USD',
        deliveryFee: null,
        quotedTotal: null,
        createdAt: sentAt,
        updatedAt: sentAt,
        promotedTicketId: null,
        lines: [{
          lineId: `${intakeId}:line:1`,
          requestedLabel: rawText,
          resolvedLabel: null,
          entityType: 'sku',
          entityId: null,
          quantity: null,
          unitPrice: null,
          lineTotal: null,
          availabilityStatus: 'unknown',
          ambiguityReason: 'parser_failed',
        }],
      });
    }
  }

  browserMockState.automation.metrics.ordersToday = browserMockState.automation.intakes.length;
  browserMockState.automation.metrics.needsReview = browserMockState.automation.intakes.filter((entry) => entry.status === 'needs_review').length;
}

async function pollBrowserTelegramOnce() {
  const updates = await browserTelegramRequest<BrowserTelegramUpdate[]>('getUpdates', {
    allowed_updates: ['message'],
    limit: 20,
    offset: browserMockState.browserTelegramUpdateOffset ?? undefined,
    timeout: 0,
  });
  ingestBrowserTelegramUpdates(updates);
  browserMockState.automation.connection = {
    ...browserMockState.automation.connection,
    status: 'connected',
    connectedAt: browserMockState.automation.connection.connectedAt ?? nowIso(),
    lastWebhookAt: updates.length > 0 ? nowIso() : browserMockState.automation.connection.lastWebhookAt,
    lastErrorAt: null,
    lastErrorMessage: null,
  };
}

export function createEmptyBrowserMockState(createdAt = nowIso()): BrowserMockState {
  const state = createMockState();
  state.appContext = {
    appVersion: 'browser-opfs',
    platform: 'web',
  };
  state.catalog = {
    schemaVersion: SENA_SCHEMA_VERSION,
    skus: [],
    services: [],
    bundles: [],
    sharingMask: [],
  };
  state.diagnostics = {
    effectiveSampleSizeMean: 0,
    resamplingCount: 0,
    smoothingEnabled: false,
    changePointProbability: 0,
    seasonalityActive: false,
    posteriorPredictiveErrorMean: 0,
    coverageEstimate: 0,
    regimeHistory: [],
  };
  state.observations = [];
  state.orderBatches = [];
  state.serviceDetails = {};
  state.skuDetails = {};
  state.workspaceSummary = {
    ownerSub: MOCK_OWNER_SUB,
    runId: 'browser-empty-run',
    latestObservedAt: null,
    skuCount: 0,
    serviceCount: 0,
    intervalCount: 0,
    pendingReorderCount: 0,
    topRegime: 'not_enough_data',
    highRiskSkuIds: [],
    skuSummaries: [],
  };
  state.latestRun = {
    runId: 'browser-empty-run',
    ownerSub: MOCK_OWNER_SUB,
    algorithmVersion: 'sena-analysis-v3',
    status: 'succeeded',
    observationCount: 0,
    createdAt,
    completedAt: createdAt,
    summary: clone(state.workspaceSummary),
    diagnostics: clone(state.diagnostics),
    primaryArtifactKey: null,
    error: null,
  };
  state.preferences = {
    ...state.preferences,
    onboardingCompletedAt: null,
    showAutomationsPage: false,
    customShowAutomationsPage: false,
  };
  state.automation = createMockAutomationWorkspace();
  state.automation.connection = {
    ...state.automation.connection,
    status: 'disconnected',
    hasBotToken: false,
    connectedAt: null,
    lastWebhookAt: null,
    lastErrorAt: createdAt,
    lastErrorMessage: 'Browser mode cannot run a persistent Telegram bot. Use the desktop app for automation.',
  };
  state.automation.intakes = [];
  state.automation.conversations = [];
  state.automation.metrics = {
    ordersToday: 0,
    needsReview: 0,
    quotedToday: 0,
    ticketedToday: 0,
    completedToday: 0,
    exposedSellables: 0,
  };
  state.automationMessages = {};
  state.browserTelegramToken = null;
  state.browserTelegramUpdateOffset = null;
  state.localDataInfo = {
    dataDirectoryPath: 'OPFS / banji browser workspace',
    workspaceStorePath: 'banji_browser_app_v1.sqlite3',
    preferencesPath: 'SQLite preferences table',
    backupDirectoryPath: 'downloaded backups',
    assetDirectoryPath: 'Browser image storage unavailable in this release',
    storageFormat: 'sqlite',
  };
  return state;
}

export function getBrowserDesktopBridgeMockState(): BrowserMockState {
  return clone(browserMockState);
}

export function setBrowserDesktopBridgeMockState(nextState: BrowserMockState): void {
  browserMockState = clone(nextState);
  resetBrowserMockCounters();
}

export function createMockAutomationWorkspace(): AutomationWorkspace {
  const connection: AutomationChannelConnection = {
    channel: 'telegram',
    status: 'connected',
    hasBotToken: true,
    botDisplayName: 'banji demo bot',
    botUsername: 'banji_demo_bot',
    externalLink: 'https://t.me/banji_demo_bot',
    connectedAt: nowIso(),
    pausedAt: null,
    lastWebhookAt: nowIso(),
    lastErrorAt: null,
    lastErrorMessage: null,
  };
  const conversationId = 'conv-demo';
  const intakeId = 'intake-demo';
  const exposures: AutomationExposureRow[] = [
    {
      entityType: 'sku',
      entityId: 'sku-1',
      label: 'Cotton Scarf',
      imagePath: null,
      supplierName: 'Mekong Looms',
      archived: false,
      exposed: true,
      price: 12,
      availabilityStatus: 'available',
      availabilityLabel: 'Available',
      alias: 'Scarf',
      sortOrder: 0,
    },
    {
      entityType: 'service',
      entityId: 'service-1',
      label: 'Wedding Styling',
      imagePath: null,
      supplierName: null,
      archived: false,
      exposed: true,
      price: 35,
      availabilityStatus: 'limited',
      availabilityLabel: 'Limited',
      alias: null,
      sortOrder: 1,
    },
  ];
  const conversations: AutomationConversationSummary[] = [{
    conversationId,
    channel: 'telegram',
    externalConversationKey: 'telegram-chat-demo',
    customerDisplayName: 'Sokha',
    customerHandle: '@sokha',
    phone: '+855 12000000',
    lastMessageAt: nowIso(),
    messageCount: 1,
    latestIntakeStatus: 'new',
    latestTicketId: null,
  }];
  const messages: AutomationMessageRecord[] = [{
    messageId: 'msg-demo',
    conversationId,
    externalMessageKey: 'telegram-message-demo',
    direction: 'inbound',
    sentAt: nowIso(),
    rawText: 'I want 2 scarves',
    normalizedText: '2 x Cotton Scarf',
    parseConfidence: 'high',
  }];
  const intakes: AutomationOrderIntake[] = [{
    intakeId,
    conversationId,
    channel: 'telegram',
    status: 'new',
    parseConfidence: 'high',
    customerDisplayName: 'Sokha',
    customerHandle: '@sokha',
    phone: '+855 12000000',
    notes: 'Browser mock intake.',
    quotedSubtotal: 24,
    currencyCode: 'USD',
    deliveryFee: null,
    quotedTotal: 24,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    promotedTicketId: null,
    lines: [{
      lineId: 'line-demo',
      entityType: 'sku',
      entityId: 'sku-1',
      requestedLabel: 'Scarf',
      resolvedLabel: 'Cotton Scarf',
      quantity: 2,
      unitPrice: 12,
      lineTotal: 24,
      availabilityStatus: 'available',
      ambiguityReason: null,
    }],
  }];
  return {
    connection,
    metrics: {
      ordersToday: 1,
      needsReview: 0,
      quotedToday: 0,
      ticketedToday: 0,
      completedToday: 0,
      exposedSellables: exposures.filter((row) => row.exposed).length,
    },
    exposures,
    conversations,
    intakes,
  };
}

function installBrowserDesktopBridge() {
  if (typeof window === 'undefined' || window.banjiDesktop) {
    return;
  }

  const bridge: DesktopBridge = {
    automation: {
      getWorkspace: async () => clone(browserMockState.automation),
      getConnection: async () => clone(browserMockState.automation.connection),
      saveConnection: async (payload: AutomationConnectionPatch) => {
        if (payload.botToken !== undefined) {
          browserMockState.browserTelegramToken = payload.botToken?.trim() || null;
        }
        browserMockState.automation.connection = {
          ...browserMockState.automation.connection,
          status: payload.status ?? browserMockState.automation.connection.status,
          hasBotToken: payload.botToken === undefined ? browserMockState.automation.connection.hasBotToken : Boolean(payload.botToken?.trim()),
          connectedAt: payload.status === 'connected' ? browserMockState.automation.connection.connectedAt ?? new Date().toISOString() : payload.status === 'disconnected' ? null : browserMockState.automation.connection.connectedAt,
          pausedAt: payload.status === 'paused' ? new Date().toISOString() : payload.status === 'connected' || payload.status === 'disconnected' ? null : browserMockState.automation.connection.pausedAt,
          lastErrorAt: payload.status === 'connected' || payload.status === 'disconnected' ? null : browserMockState.automation.connection.lastErrorAt,
          lastErrorMessage: payload.status === 'connected' || payload.status === 'disconnected' ? null : browserMockState.automation.connection.lastErrorMessage,
          botUsername: payload.botUsername ?? browserMockState.automation.connection.botUsername,
          botDisplayName: payload.botDisplayName ?? browserMockState.automation.connection.botDisplayName,
          externalLink: payload.externalLink ?? browserMockState.automation.connection.externalLink,
        };
        return clone(browserMockState.automation.connection);
      },
      listExposureRows: async () => clone(browserMockState.automation.exposures),
      patchExposureRow: async (payload: AutomationExposurePatch) => {
        const row = browserMockState.automation.exposures.find((entry) => entry.entityType === payload.entityType && entry.entityId === payload.entityId);
        if (!row) {
          throw new Error('Automation exposure row not found.');
        }
        row.exposed = payload.exposed ?? row.exposed;
        row.alias = payload.alias === undefined ? row.alias : payload.alias;
        row.sortOrder = payload.sortOrder ?? row.sortOrder;
        browserMockState.automation.metrics.exposedSellables = browserMockState.automation.exposures.filter((entry) => entry.exposed).length;
        return clone(row);
      },
      listConversations: async () => clone(browserMockState.automation.conversations),
      readConversation: async ({ conversationId }: AutomationReadConversationPayload) => {
        const conversation = browserMockState.automation.conversations.find((entry) => entry.conversationId === conversationId);
        if (!conversation) {
          throw new Error('Automation conversation not found.');
        }
        return {
          conversation: clone(conversation),
          messages: clone(browserMockState.automationMessages[conversationId] ?? []),
          intakes: clone(browserMockState.automation.intakes.filter((entry) => entry.conversationId === conversationId)),
        };
      },
      listIntakes: async (payload?: AutomationListIntakesPayload) => clone(
        browserMockState.automation.intakes.filter((entry) =>
          (!payload?.status || entry.status === payload.status)
          && (!payload?.conversationId || entry.conversationId === payload.conversationId)
          && (!payload?.ticketId || entry.promotedTicketId === payload.ticketId),
        ),
      ),
      readIntake: async ({ intakeId }: AutomationReadIntakePayload) =>
        clone(browserMockState.automation.intakes.find((entry) => entry.intakeId === intakeId) ?? null),
      resolveIntake: async ({ intakeId, status, note }: AutomationResolveIntakePayload) => {
        const intake = browserMockState.automation.intakes.find((entry) => entry.intakeId === intakeId);
        if (!intake) {
          throw new Error('Automation intake not found.');
        }
        intake.status = status;
        intake.notes = note ?? intake.notes;
        intake.updatedAt = nowIso();
        return clone(intake);
      },
      promoteIntake: async ({ intakeId, mode, ticketId }: PromoteAutomationIntakePayload) => {
        const intake = browserMockState.automation.intakes.find((entry) => entry.intakeId === intakeId);
        if (!intake) {
          throw new Error('Automation intake not found.');
        }
        intake.status = 'ticketed';
        intake.promotedTicketId = ticketId ?? `ticket:customer:browser:${automationTicketCounter++}`;
        intake.updatedAt = nowIso();
        const result: PromoteAutomationIntakeResult = {
          intake: clone(intake),
          ticketEvent: {
            ticketId: intake.promotedTicketId,
            ticketFamily: 'customer',
            lifecycle: 'open',
            stage: 'pending',
            revision: mode === 'append_ticket' ? 2 : 1,
            eventType: mode === 'append_ticket' ? 'revised' : 'created',
            occurredAt: nowIso(),
            nextTouchAt: null,
            party: {
              role: 'customer',
              channelKey: 'telegram',
              channelLabel: 'Telegram',
              customerName: intake.customerDisplayName,
              customerNameKey: intake.customerDisplayName?.toLowerCase() ?? null,
              phone: intake.phone,
              phoneKey: normalizePhoneLookupKey(intake.phone),
              supplierName: null,
            },
            lines: intake.lines.filter((line) => line.entityId != null).map((line) => ({
              entityType: line.entityType,
              entityId: line.entityId!,
              quantityDelta: line.quantity,
              note: line.requestedLabel,
            })),
            note: intake.notes,
          },
          commercialEvents: intake.lines.filter((line) => line.entityId != null).map((line) => ({
            party: 'customer',
            entityType: line.entityType,
            entityId: line.entityId!,
            stage: 'pending',
            quantityDelta: line.quantity ?? 0,
            flow: 'scheduled',
            reason: 'browser_mock',
            note: intake.notes,
          })),
        };
        return result;
      },
      testTelegramConnection: async () => {
        try {
          await browserTelegramRequest('getMe');
          await pollBrowserTelegramOnce();
        } catch (error) {
          markBrowserTelegramError(error instanceof Error ? error.message : browserTelegramBlockedError());
          throw error;
        }
        return clone(browserMockState.automation.connection);
      },
    },
    system: {
      getAppContext: async () => clone(browserMockState.appContext),
      getLocalDataInfo: async () => clone(browserMockState.localDataInfo),
      createBackupSnapshot: async () => ({
        createdAt: nowIso(),
        fileCount: 3,
        snapshotPath: `${browserMockState.localDataInfo.backupDirectoryPath}/browser-manual-snapshot`,
        trigger: 'manual',
      }),
      restoreBackupSnapshot: async () => ({
        restoredSnapshotPath: `${browserMockState.localDataInfo.backupDirectoryPath}/browser-manual-snapshot`,
        safetySnapshot: {
          createdAt: nowIso(),
          fileCount: 3,
          snapshotPath: `${browserMockState.localDataInfo.backupDirectoryPath}/browser-before-restore`,
          trigger: 'manual',
        },
      }),
      clearCurrentData: async () => ({
        clearedFileCount: 3,
        safetySnapshot: {
          createdAt: nowIso(),
          fileCount: 3,
          snapshotPath: `${browserMockState.localDataInfo.backupDirectoryPath}/browser-before-clear`,
          trigger: 'manual',
        },
      }),
      revealPath: async () => {},
      openExternalUrl: async () => {},
      pickAndStoreImage: async () => null,
      storeDroppedImage: async () => null,
    },
    preferences: {
      get: async () => clone(browserMockState.preferences),
      save: async (payload) => {
        browserMockState.preferences = {
          ...browserMockState.preferences,
          ...payload,
        };
        return clone(browserMockState.preferences);
      },
    },
    sena: {
      getCatalog: async () => clone(browserMockState.catalog),
      getObservationFingerprint: async () => browserSenaObservationFingerprint(browserMockState.observations),
      getRecordUpdateContext: async () => browserSenaRecordUpdateContext(browserMockState.observations),
      getStartupWorkspace: async () => ({
        catalog: clone(browserMockState.catalog),
        workspaceSummary: clone(browserMockState.workspaceSummary),
        latestRun: clone(browserMockState.latestRun),
        observationFingerprint: browserSenaObservationFingerprint(browserMockState.observations),
      }),
      listObservationPage: async (payload?: SenaObservationPageRequest) =>
        browserSenaObservationPage(browserMockState.observations, payload),
      listObservations: async () => clone(browserMockState.observations),
      listOrderBatches: async (payload) =>
        clone(browserMockState.orderBatches.filter((batch) => orderBatchMatchesLookup(batch, payload))),
      upsertCatalog: async (payload) => {
        browserMockState.catalog = clone(payload);
        return clone(browserMockState.catalog);
      },
      ingestObservation: async (payload: SenaObservationInput) => {
        const observation: SenaObservationRecord = {
          observationId: `mock-observation-${observationCounter++}`,
          ownerSub: MOCK_OWNER_SUB,
          input: payload,
        };
        browserMockState.observations = [observation, ...browserMockState.observations];
        syncMockWorkspaceSummary(browserMockState);
        return clone(observation);
      },
      updateObservation: async ({ observationId, input }) => {
        const index = browserMockState.observations.findIndex((observation) => observation.observationId === observationId);
        if (index < 0) {
          throw new Error('Observation not found');
        }
        const updated: SenaObservationRecord = {
          observationId,
          ownerSub: browserMockState.observations[index]!.ownerSub,
          input,
        };
        browserMockState.observations[index] = updated;
        syncMockWorkspaceSummary(browserMockState);
        return clone(updated);
      },
      deleteObservation: async ({ observationId }) => {
        browserMockState.observations = browserMockState.observations.filter((observation) => observation.observationId !== observationId);
        syncMockWorkspaceSummary(browserMockState);
      },
      createOrderBatch: async (payload) => {
        const timestamp = nowIso();
        const shared = makeOrderFieldValues({
          ...payload.shared,
          supplierName: payload.supplierName ?? payload.shared.supplierName ?? null,
        });
        const batch: SenaOrderBatchRecord = {
          batchOrderId: `browser-batch-${orderBatchCounter++}`,
          ownerSub: MOCK_OWNER_SUB,
          supplierName: payload.supplierName ?? shared.supplierName ?? null,
          status: 'open',
          createdAt: timestamp,
          updatedAt: timestamp,
          shared,
          children: payload.children.map((child) => {
            const overrides = child.overrides ? clone(child.overrides) : {};
            return {
              childOrderId: `browser-child-${orderChildCounter++}`,
              skuId: child.skuId,
              status: 'open',
              createdAt: timestamp,
              updatedAt: timestamp,
              inheritedFromBatch: Object.keys(overrides).length === 0,
              effective: deriveOrderChildEffective(shared, overrides),
              overrides,
            };
          }),
        };
        browserMockState.orderBatches = [batch, ...browserMockState.orderBatches];
        return clone(batch);
      },
      updateOrderBatch: async (payload) => {
        const index = browserMockState.orderBatches.findIndex((batch) => batch.batchOrderId === payload.batchOrderId);
        if (index < 0) {
          throw new Error('Order batch not found');
        }
        const current = browserMockState.orderBatches[index]!;
        const shared = payload.shared ? mergeOrderFieldValues(current.shared, payload.shared) : current.shared;
        const updatedAt = nowIso();
        const updated: SenaOrderBatchRecord = {
          ...current,
          supplierName: payload.supplierName ?? current.supplierName,
          status: payload.status ?? current.status,
          updatedAt,
          shared,
          children: current.children.map((child) => ({
            ...child,
            updatedAt,
            effective: deriveOrderChildEffective(shared, child.overrides),
          })),
        };
        browserMockState.orderBatches[index] = updated;
        return clone(updated);
      },
      updateOrderChild: async (payload) => {
        const batchIndex = browserMockState.orderBatches.findIndex((batch) =>
          batch.children.some((child) => child.childOrderId === payload.childOrderId),
        );
        if (batchIndex < 0) {
          throw new Error('Order child not found');
        }
        const batch = browserMockState.orderBatches[batchIndex]!;
        const childIndex = batch.children.findIndex((child) => child.childOrderId === payload.childOrderId);
        const currentChild = batch.children[childIndex]!;
        const nextOverrides = {
          ...currentChild.overrides,
          ...(payload.overrides ?? {}),
        };
        if (payload.appendSupplierNote) {
          nextOverrides.supplierNote = [currentChild.effective.supplierNote, payload.appendSupplierNote]
            .filter(Boolean)
            .join('\n');
        }
        const updatedAt = nowIso();
        const updatedChild: SenaOrderChildRecord = {
          ...currentChild,
          skuId: payload.skuId ?? currentChild.skuId,
          status: payload.status ?? currentChild.status,
          updatedAt,
          inheritedFromBatch: Object.keys(nextOverrides).length === 0,
          overrides: nextOverrides,
          effective: deriveOrderChildEffective(batch.shared, nextOverrides),
        };
        const updatedBatch: SenaOrderBatchRecord = {
          ...batch,
          updatedAt,
          children: batch.children.map((child, index) => (index === childIndex ? updatedChild : child)),
        };
        browserMockState.orderBatches[batchIndex] = updatedBatch;
        return clone(updatedBatch);
      },
      splitOrderChild: async (payload) => {
        const batchIndex = browserMockState.orderBatches.findIndex((batch) =>
          batch.children.some((child) => child.childOrderId === payload.childOrderId),
        );
        if (batchIndex < 0) {
          throw new Error('Order child not found');
        }
        const batch = browserMockState.orderBatches[batchIndex]!;
        const sourceChild = batch.children.find((child) => child.childOrderId === payload.childOrderId)!;
        const updatedAt = nowIso();
        const splitChild: SenaOrderChildRecord = {
          childOrderId: `browser-child-${orderChildCounter++}`,
          skuId: sourceChild.skuId,
          status: sourceChild.status,
          createdAt: updatedAt,
          updatedAt,
          inheritedFromBatch: false,
          effective: clone(sourceChild.effective),
          overrides: clone(sourceChild.effective),
        };
        const updatedBatch: SenaOrderBatchRecord = {
          ...batch,
          updatedAt,
          children: [...batch.children, splitChild],
        };
        browserMockState.orderBatches[batchIndex] = updatedBatch;
        return clone(updatedBatch);
      },
      triggerRun: async (payload?: SenaTriggerRunPayload) => {
        const runId = `browser-run-${runCounter++}`;
        return clone(runBrowserSenaStateAnalysis(runId, payload));
      },
      retryRun: async ({ runId }: SenaRunLookupPayload) => {
        return clone(runBrowserSenaStateAnalysis(runId, {
          algorithmVersion: browserMockState.latestRun.algorithmVersion,
          parameters: browserMockState.preferences.senaEngineParameters,
        }));
      },
      getWorkspaceSummary: async () => clone(browserMockState.workspaceSummary),
      getSkuDetail: async ({ skuId, beforeIntervalIndex, limit }) => {
        const detail = browserMockState.skuDetails[skuId];
        return clone(detail ? pageBrowserSenaSkuDetail(detail, beforeIntervalIndex, limit) : null);
      },
      getServiceDetail: async ({ serviceId, beforeIntervalIndex, limit }) =>
        clone(
          browserMockState.serviceDetails[serviceId]
            ? pageBrowserSenaServiceDetail(browserMockState.serviceDetails[serviceId], beforeIntervalIndex, limit)
            : null,
        ),
      getDiagnostics: async () => clone(browserMockState.diagnostics),
      getRunStatus: async ({ runId }: SenaRunLookupPayload) =>
        clone(browserMockState.latestRun.runId === runId ? browserMockState.latestRun : null),
      clearDetailCache: async () => undefined,
    },
  };

  window.banjiDesktop = bridge;
  console.info('[browser-mock] installed mock banjiDesktop bridge');
}

function resetBrowserDesktopBridgeMock(nextState: BrowserMockState = createMockState()) {
  setBrowserDesktopBridgeMockState(nextState);
}

export { installBrowserDesktopBridge, resetBrowserDesktopBridgeMock };
