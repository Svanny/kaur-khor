import {
  DEFAULT_DESKTOP_WORKBENCH_TILE_ORDER_BY_LANE,
  DEFAULT_SENA_ENGINE_PARAMETERS,
} from '@shared/ipc';
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
  AutomationReadIntakeThreadPayload,
  AutomationSendIntakeThreadMessagePayload,
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
  SenaAnalysisRunRecord,
  SenaCatalog,
  SenaDiagnostics,
  SenaObservationInput,
  SenaOrderBatchRecord,
  SenaOrderChildRecord,
  SenaOrderFieldValues,
  SenaObservationPageRequest,
  SenaObservationRecord,
  SenaServiceDetail,
  SenaSkuDetail,
  SenaWorkspaceSummary,
} from '@shared/sena';

const MOCK_OWNER_SUB = 'browser-owner';
const MOCK_RUN_ID = 'browser-run-1';
const demoCatalogImages = import.meta.glob<string>('../assets/dev-catalog/*.webp', {
  eager: true,
  import: 'default',
  query: '?url',
});

function demoCatalogImagePath(fileName: string) {
  const entry = Object.entries(demoCatalogImages).find(([path]) => path.endsWith(`/${fileName}`));
  return entry?.[1];
}

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
      skuId: 'sku-001',
      name: 'ក្រមាភ្នំពេញ',
      description: 'ក្រមាកប្បាសទន់សម្រាប់ធ្នើលក់ប្រចាំថ្ងៃ និងការរុំអំណោយ។',
      imagePath: demoCatalogImagePath('kaur-khor-dev-sku-001-phnom-penh-krama-scarf.webp'),
      supplierName: 'Mekong Loom House',
      costPerUnit: 8.5,
      soldAsProduct: true,
      productPrice: 22,
      leadTimeMeanDaysHint: 4,
      leadTimeStdDaysHint: 1,
      archived: false,
    },
    {
      skuId: 'sku-002',
      name: 'កាបូបផ្តៅសៀមរាប',
      description: 'កាបូបផ្តៅត្បាញដៃសម្រាប់ថ្ងៃផ្សារ ការទិញឥវ៉ាន់ និងកញ្ចប់ពិកនិក។',
      imagePath: demoCatalogImagePath('kaur-khor-dev-sku-002-siem-reap-rattan-tote.webp'),
      supplierName: 'Siem Reap Rattan',
      costPerUnit: 18,
      soldAsProduct: true,
      productPrice: 48,
      leadTimeMeanDaysHint: 6,
      leadTimeStdDaysHint: 1.5,
      archived: false,
    },
    {
      skuId: 'sku-003',
      name: 'ប្រអប់ម្រេចកំពត',
      description: 'ប្រអប់ម្រេចគុណភាពខ្ពស់សម្រាប់ឈុតសាករសជាតិ និងអំណោយធ្វើដំណើរ។',
      imagePath: demoCatalogImagePath('kaur-khor-dev-sku-003-kampot-pepper-gift-tin.webp'),
      supplierName: 'Kampot Spice Co-op',
      costPerUnit: 6.75,
      soldAsProduct: true,
      productPrice: 18,
      leadTimeMeanDaysHint: 5,
      leadTimeStdDaysHint: 1.5,
      archived: false,
    },
    {
      skuId: 'sku-004',
      name: 'ខ្សែសក់សូត្រផ្កាឈូក',
      description: 'ខ្សែសក់សូត្រពណ៌ផ្កាឈូកសម្រាប់ឈុតតុបតែង និងការតាំងលក់មុខហាង។',
      imagePath: demoCatalogImagePath('kaur-khor-dev-sku-004-lotus-silk-hair-ribbon.webp'),
      supplierName: 'Phnom Silk Collective',
      costPerUnit: 5.25,
      soldAsProduct: true,
      productPrice: 16,
      leadTimeMeanDaysHint: 3,
      leadTimeStdDaysHint: 0.75,
      archived: false,
    },
    {
      skuId: 'sku-005',
      name: 'ក្រឡស្ករត្នោតទន្លេសាប',
      description: 'ស្ករត្នោតពណ៌មាសក្នុងក្រឡសម្រាប់គូជាមួយតែ និងកញ្ចប់ផ្ទះបាយ។',
      imagePath: demoCatalogImagePath('kaur-khor-dev-sku-005-tonle-sap-palm-sugar-jar.webp'),
      supplierName: 'Tonle Sap Pantry',
      costPerUnit: 4,
      soldAsProduct: true,
      productPrice: 13,
      leadTimeMeanDaysHint: 8,
      leadTimeStdDaysHint: 2,
      archived: false,
    },
    {
      skuId: 'sku-006',
      name: 'សៀវភៅកំណត់ត្រាអង្គរ',
      description: 'សៀវភៅកំណត់ត្រាធ្វើដៃសម្រាប់ឈុតត្រា និងកន្ត្រកមុខហាង។',
      imagePath: demoCatalogImagePath('kaur-khor-dev-sku-006-angkor-market-notebook.webp'),
      supplierName: 'Angkor Paper Studio',
      costPerUnit: 3.8,
      soldAsProduct: true,
      productPrice: 14,
      leadTimeMeanDaysHint: 4,
      leadTimeStdDaysHint: 1,
      archived: false,
    },
    {
      skuId: 'sku-007',
      name: 'កញ្ចប់អង្ករបាត់ដំបង',
      description: 'កញ្ចប់អង្ករតូចសម្រាប់កញ្ចប់ផ្ទះបាយដំបូង និងការតាំងធ្នើ។',
      imagePath: demoCatalogImagePath('kaur-khor-dev-sku-007-battambang-rice-pouch.webp'),
      supplierName: 'Battambang Rice Mill',
      costPerUnit: 2.4,
      soldAsProduct: true,
      productPrice: 9,
      leadTimeMeanDaysHint: 3,
      leadTimeStdDaysHint: 0.75,
      archived: false,
    },
    {
      skuId: 'sku-008',
      name: 'ពែងសេរ៉ាមិកខៀវមេគង្គ',
      description: 'ពែងសេរ៉ាមិកពណ៌ខៀវសម្រាប់ឈុតកាហ្វេ និងតុអំណោយ។',
      imagePath: demoCatalogImagePath('kaur-khor-dev-sku-008-mekong-blue-ceramic-cup.webp'),
      supplierName: 'Mekong Clay Works',
      costPerUnit: 7.25,
      soldAsProduct: true,
      productPrice: 24,
      leadTimeMeanDaysHint: 6,
      leadTimeStdDaysHint: 1.25,
      archived: false,
    },
    {
      skuId: 'sku-009',
      name: 'ដបទឹកឃ្មុំកំពង់ស្ពឺ',
      description: 'ដបទឹកឃ្មុំពណ៌មាសសម្រាប់កញ្ចប់អាហារពេលព្រឹក និងធ្នើគិតលុយ។',
      imagePath: demoCatalogImagePath('kaur-khor-dev-sku-009-kampong-speu-honey-bottle.webp'),
      supplierName: 'Kampong Speu Honey',
      costPerUnit: 5.5,
      soldAsProduct: true,
      productPrice: 18,
      leadTimeMeanDaysHint: 7,
      leadTimeStdDaysHint: 1.75,
      archived: false,
    },
    {
      skuId: 'sku-010',
      name: 'ឈុតទៀនបុណ្យអុំទូក',
      description: 'ឈុតទៀនធ្វើដៃសម្រាប់ការតាំងតុតាមរដូវបុណ្យ។',
      imagePath: demoCatalogImagePath('kaur-khor-dev-sku-010-water-festival-candle-set.webp'),
      supplierName: 'Chaktomuk Candle Studio',
      costPerUnit: 6.6,
      soldAsProduct: true,
      productPrice: 21,
      leadTimeMeanDaysHint: 5,
      leadTimeStdDaysHint: 1.2,
      archived: false,
    },
  ],
  services: [
    {
      serviceId: 'service-001',
      name: 'ឈុតរុំអំណោយក្រមា',
      description: 'លំហូររុំអំណោយដែលភ្ជាប់ក្រមាជាមួយទំនិញលក់រាយតូចៗ។',
      imagePath: demoCatalogImagePath('kaur-khor-dev-service-001-krama-gift-wrap.webp'),
      price: 9,
      bundle: false,
      archived: false,
    },
    {
      serviceId: 'service-002',
      name: 'កញ្ចប់ពិកនិកផ្តៅ',
      description: 'កញ្ចប់ចុងសប្តាហ៍ដែលផ្តើមពីកាបូបផ្តៅ និងទំនិញបន្ថែមថ្ងៃផ្សារ។',
      imagePath: demoCatalogImagePath('kaur-khor-dev-service-002-rattan-picnic-pack.webp'),
      price: 52,
      bundle: true,
      archived: false,
    },
    {
      serviceId: 'service-003',
      name: 'ឈុតសាកម្រេច',
      description: 'ឈុតតូចមុខហាងដែលផ្តោតលើគំរូម្រេចកំពត។',
      imagePath: demoCatalogImagePath('kaur-khor-dev-service-003-pepper-tasting-set.webp'),
      price: 24,
      bundle: false,
      archived: false,
    },
    {
      serviceId: 'service-004',
      name: 'ឈុតតុបតែងខ្សែសក់សូត្រ',
      description: 'ឈុតតុបតែងខ្សែសក់សម្រាប់អំណោយរហ័ស និងការតាំងគ្រឿងបន្ថែម។',
      imagePath: demoCatalogImagePath('kaur-khor-dev-service-004-silk-ribbon-styling-kit.webp'),
      price: 28,
      bundle: true,
      archived: false,
    },
    {
      serviceId: 'service-005',
      name: 'ឈុតតែជាមួយស្ករត្នោត',
      description: 'ឈុតតុតែដែលផ្អែកលើក្រឡស្ករត្នោត។',
      imagePath: demoCatalogImagePath('kaur-khor-dev-service-005-palm-sugar-tea-pairing.webp'),
      price: 22,
      bundle: true,
      archived: false,
    },
    {
      serviceId: 'service-006',
      name: 'ឈុតត្រាសៀវភៅកំណត់ត្រា',
      description: 'ឈុតសៀវភៅកំណត់ត្រា និងត្រាសម្រាប់អំណោយផ្ទាល់ខ្លួន។',
      imagePath: demoCatalogImagePath('kaur-khor-dev-service-006-notebook-custom-stamp-kit.webp'),
      price: 20,
      bundle: false,
      archived: false,
    },
    {
      serviceId: 'service-007',
      name: 'ឈុតផ្ទះបាយអង្ករ',
      description: 'កញ្ចប់ផ្ទះបាយដំបូងសម្រាប់កន្ត្រកលក់រាយគ្រួសារតូច។',
      imagePath: demoCatalogImagePath('kaur-khor-dev-service-007-rice-pantry-starter.webp'),
      price: 18,
      bundle: true,
      archived: false,
    },
    {
      serviceId: 'service-008',
      name: 'ឈុតកាហ្វេពែងសេរ៉ាមិក',
      description: 'ឈុតអំណោយកាហ្វេដែលផ្តោតលើពែងសេរ៉ាមិកពណ៌ខៀវធ្វើដៃ។',
      imagePath: demoCatalogImagePath('kaur-khor-dev-service-008-ceramic-cup-coffee-set.webp'),
      price: 32,
      bundle: true,
      archived: false,
    },
    {
      serviceId: 'service-009',
      name: 'ឈុតអាហារពេលព្រឹកទឹកឃ្មុំ',
      description: 'កញ្ចប់អាហារពេលព្រឹកដែលផ្អែកលើទឹកឃ្មុំកំពង់ស្ពឺ។',
      imagePath: demoCatalogImagePath('kaur-khor-dev-service-009-honey-breakfast-bundle.webp'),
      price: 27,
      bundle: true,
      archived: false,
    },
    {
      serviceId: 'service-010',
      name: 'ឈុតតុទៀនពិធីបុណ្យ',
      description: 'ឈុតតុទៀនតាមរដូវសម្រាប់ការតាំងលក់ពិធីបុណ្យ។',
      imagePath: demoCatalogImagePath('kaur-khor-dev-service-010-festival-candle-table-set.webp'),
      price: 34,
      bundle: true,
      archived: false,
    },
  ],
  bundles: [],
  sharingMask: [
    { serviceId: 'service-001', skuId: 'sku-001', enabled: true, usageProbability: 1 },
    { serviceId: 'service-002', skuId: 'sku-002', enabled: true, usageProbability: 1 },
    { serviceId: 'service-002', skuId: 'sku-005', enabled: true, usageProbability: 0.35 },
    { serviceId: 'service-003', skuId: 'sku-003', enabled: true, usageProbability: 1 },
    { serviceId: 'service-004', skuId: 'sku-004', enabled: true, usageProbability: 1 },
    { serviceId: 'service-004', skuId: 'sku-001', enabled: true, usageProbability: 0.35 },
    { serviceId: 'service-005', skuId: 'sku-005', enabled: true, usageProbability: 1 },
    { serviceId: 'service-005', skuId: 'sku-008', enabled: true, usageProbability: 0.45 },
    { serviceId: 'service-006', skuId: 'sku-006', enabled: true, usageProbability: 1 },
    { serviceId: 'service-007', skuId: 'sku-007', enabled: true, usageProbability: 1 },
    { serviceId: 'service-007', skuId: 'sku-005', enabled: true, usageProbability: 0.25 },
    { serviceId: 'service-008', skuId: 'sku-008', enabled: true, usageProbability: 1 },
    { serviceId: 'service-008', skuId: 'sku-003', enabled: true, usageProbability: 0.2 },
    { serviceId: 'service-009', skuId: 'sku-009', enabled: true, usageProbability: 1 },
    { serviceId: 'service-009', skuId: 'sku-005', enabled: true, usageProbability: 0.25 },
    { serviceId: 'service-010', skuId: 'sku-010', enabled: true, usageProbability: 1 },
  ],
};

const mockWorkspaceSummary: SenaWorkspaceSummary = {
  ownerSub: MOCK_OWNER_SUB,
  runId: MOCK_RUN_ID,
  latestObservedAt: '2025-03-30T15:00:00.000Z',
  skuCount: mockCatalog.skus.length,
  serviceCount: mockCatalog.services.length,
  intervalCount: 5,
  pendingReorderCount: 3,
  topRegime: 'normal',
  highRiskSkuIds: ['sku-001', 'sku-002', 'sku-005'],
  skuSummaries: mockCatalog.skus.map((sku, index) => {
    const demandPerDayMean = [4, 3.5, 2.8, 2.1, 2.6, 1.8, 1.5, 2.2, 1.9, 2.4][index] ?? 2;
    const latestPosteriorUnits = [8, 11, 16, 14, 10, 18, 22, 12, 15, 13][index] ?? 12;
    const stockoutRisk = [0.83, 0.74, 0.48, 0.34, 0.69, 0.28, 0.18, 0.42, 0.31, 0.37][index] ?? 0.3;
    const leadTimeMeanDays = sku.leadTimeMeanDaysHint ?? 5;
    const leadTimeStdDays = sku.leadTimeStdDaysHint ?? 1;
    const expectedLeadTimeDemand = Math.round(demandPerDayMean * leadTimeMeanDays);
    const safetyStock = Math.max(2, Math.round(leadTimeStdDays * demandPerDayMean));

    return {
      skuId: sku.skuId,
      latestPosteriorUnits,
      credibleIntervalLow: Math.max(0, latestPosteriorUnits - 4),
      credibleIntervalHigh: latestPosteriorUnits + 8,
      demandPerDayMean,
      stockoutRisk,
      daysOfCover: Number((latestPosteriorUnits / Math.max(1, demandPerDayMean)).toFixed(1)),
      expectedLeadTimeDemand,
      safetyStock,
      reorderPoint: expectedLeadTimeDemand + safetyStock,
      reorderTriggerProbability: Math.min(1, Number((stockoutRisk + 0.12).toFixed(2))),
      leadTimeMeanDays,
      leadTimeStdDays,
      regimeProbabilities: index % 3 === 0 ? { normal: 0.62, promo: 0.38 } : { normal: 0.78, promo: 0.22 },
    };
  }),
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
          skuId: 'sku-001',
          orderPlaced: false,
          receiptArrived: false,
          approximateOrderQuantity: null,
          approximateReceiptQuantity: null,
        },
      ],
      servicePrices: [],
      retailPrices: [
        {
          skuId: 'sku-001',
          price: 22,
        },
      ],
      leadTimeHints: [],
      notes: 'Demand rose after a recent price move on ក្រមាភ្នំពេញ.',
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
          skuId: 'sku-002',
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
          skuId: 'sku-003',
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
          skuId: 'sku-004',
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
          skuId: 'sku-005',
          unitsInStock: 19,
          costPerUnit: 4,
          productPrice: 13,
        },
      ],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [
        {
          skuId: 'sku-005',
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
          skuId: 'sku-005',
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

const mockSkuDetails: Record<string, SenaSkuDetail> = Object.fromEntries(
  mockWorkspaceSummary.skuSummaries.map((summary, index) => [
    summary.skuId,
    {
      summary,
      inventoryPosterior: [],
      demandPosterior: [],
      pipelinePosterior: index === 3 || index === 4
        ? [{
            intervalIndex: 2,
            inTransitMean: index === 3 ? 24 : 44,
            orderProbability: index === 3 ? 0.92 : 0.86,
            orderQuantityMean: index === 3 ? 24 : 44,
            receiptQuantityMean: index === 3 ? 24 : 0,
            ageDaysMean: index === 3 ? 4 : 2,
          }]
        : [],
      leadTimePosterior: [{
        intervalIndex: 2,
        logMeanDays: 0,
        logStdDays: 0,
        meanDays: summary.leadTimeMeanDays,
        stdDays: summary.leadTimeStdDays,
        observedVariabilityClass: summary.leadTimeStdDays > 1.5 ? 'wide' : 'normal',
        observedRelativeWidth: Number((summary.leadTimeStdDays / Math.max(1, summary.leadTimeMeanDays)).toFixed(2)),
      }],
    },
  ]),
) as Record<string, SenaSkuDetail>;

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
  dataDirectoryPath: '/tmp/kaur-khor-browser-mock',
  workspaceStorePath: '/tmp/kaur-khor-browser-mock/sena.sqlite',
  preferencesPath: '/tmp/kaur-khor-browser-mock/preferences.json',
  backupDirectoryPath: '/tmp/kaur-khor-browser-mock/backup-snapshots',
  assetDirectoryPath: '/tmp/kaur-khor-browser-mock/assets',
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
        supplierNote: 'Waiting on កាបូបផ្តៅសៀមរាប replenishment.',
        expectedArrivalAt: '2025-04-02T09:00:00.000Z',
        placementTimestamp: '2025-03-29T09:00:00.000Z',
        leadTimeDaysHint: 4,
        leadTimeVariability: 'tight',
      }),
      children: [
        {
          childOrderId: 'browser-child-1',
          skuId: 'sku-002',
          status: 'awaiting_receipt',
          createdAt: '2025-03-29T09:00:00.000Z',
          updatedAt: '2025-03-30T10:00:00.000Z',
          inheritedFromBatch: true,
          effective: makeOrderFieldValues({
            supplierName: 'Siem Reap Rattan',
            supplierNote: 'Waiting on កាបូបផ្តៅសៀមរាប replenishment.',
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
      supplierName: 'Tonle Sap Pantry',
      status: 'open',
      createdAt: '2025-03-30T11:00:00.000Z',
      updatedAt: '2025-03-30T11:00:00.000Z',
      shared: makeOrderFieldValues({
        supplierName: 'Tonle Sap Pantry',
        supplierNote: 'ក្រឡស្ករត្នោតទន្លេសាប replenishment not placed yet.',
        expectedArrivalAt: '2025-04-07T09:00:00.000Z',
        leadTimeDaysHint: 8,
        leadTimeVariability: 'wide',
      }),
      children: [
        {
          childOrderId: 'browser-child-2',
          skuId: 'sku-005',
          status: 'open',
          createdAt: '2025-03-30T11:00:00.000Z',
          updatedAt: '2025-03-30T11:00:00.000Z',
          inheritedFromBatch: true,
          effective: makeOrderFieldValues({
            supplierName: 'Tonle Sap Pantry',
            supplierNote: 'ក្រឡស្ករត្នោតទន្លេសាប replenishment not placed yet.',
            orderedQuantity: 24,
            receivedQuantity: 0,
            costPerUnit: 4,
            expectedArrivalAt: '2025-04-07T09:00:00.000Z',
            leadTimeDaysHint: 8,
            leadTimeVariability: 'wide',
          }),
          overrides: {
            orderedQuantity: 24,
            receivedQuantity: 0,
            costPerUnit: 4,
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
        intakeId: 'intake-demo',
        externalMessageKey: 'telegram-message-demo',
        direction: 'inbound',
        sentAt: nowIso(),
        rawText: 'ខ្ញុំចង់បានក្រមា 2',
        normalizedText: '2 x ក្រមាភ្នំពេញ',
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
        insights: true,
        work: true,
      },
      workbenchTileOrderByLane: DEFAULT_DESKTOP_WORKBENCH_TILE_ORDER_BY_LANE,
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
    showAutomationsPage: true,
    customShowAutomationsPage: true,
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
    dataDirectoryPath: 'OPFS / Kaur Khor browser workspace',
    workspaceStorePath: 'kaur_khor_browser_app_v1.sqlite3',
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
    botDisplayName: 'Kaur Khor demo bot',
    botUsername: 'kaur_khor_demo_bot',
    externalLink: 'https://t.me/kaur_khor_demo_bot',
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
      entityId: 'sku-001',
      label: 'ក្រមាភ្នំពេញ',
      imagePath: demoCatalogImagePath('kaur-khor-dev-sku-001-phnom-penh-krama-scarf.webp'),
      supplierName: 'Mekong Loom House',
      archived: false,
      exposed: true,
      price: 22,
      availabilityStatus: 'available',
      availabilityLabel: 'Available',
      alias: 'ក្រមា',
      sortOrder: 0,
    },
    {
      entityType: 'service',
      entityId: 'service-001',
      label: 'ឈុតរុំអំណោយក្រមា',
      imagePath: demoCatalogImagePath('kaur-khor-dev-service-001-krama-gift-wrap.webp'),
      supplierName: null,
      archived: false,
      exposed: true,
      price: 9,
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
    intakeId,
    externalMessageKey: 'telegram-message-demo',
    direction: 'inbound',
    sentAt: nowIso(),
    rawText: 'ខ្ញុំចង់បានក្រមា 2',
    normalizedText: '2 x ក្រមាភ្នំពេញ',
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
    quotedSubtotal: 44,
    currencyCode: 'USD',
    deliveryFee: null,
    quotedTotal: 44,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    promotedTicketId: null,
    lines: [{
      lineId: 'line-demo',
      entityType: 'sku',
      entityId: 'sku-001',
      requestedLabel: 'ក្រមា',
      resolvedLabel: 'ក្រមាភ្នំពេញ',
      quantity: 2,
      unitPrice: 22,
      lineTotal: 44,
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
  if (typeof window === 'undefined' || window.kaurKhorDesktop) {
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
      readIntakeThread: async ({ intakeId }: AutomationReadIntakeThreadPayload) => {
        const intake = browserMockState.automation.intakes.find((entry) => entry.intakeId === intakeId);
        if (!intake) {
          throw new Error('Automation intake not found.');
        }
        const conversation = browserMockState.automation.conversations.find((entry) => entry.conversationId === intake.conversationId);
        if (!conversation) {
          throw new Error('Automation conversation not found.');
        }
        return {
          conversation: clone(conversation),
          intake: clone(intake),
          messages: clone((browserMockState.automationMessages[intake.conversationId] ?? []).filter((entry) => entry.intakeId === intakeId)),
        };
      },
      sendIntakeThreadMessage: async ({ intakeId, text }: AutomationSendIntakeThreadMessagePayload) => {
        const intake = browserMockState.automation.intakes.find((entry) => entry.intakeId === intakeId);
        if (!intake) {
          throw new Error('Automation intake not found.');
        }
        const conversation = browserMockState.automation.conversations.find((entry) => entry.conversationId === intake.conversationId);
        if (!conversation) {
          throw new Error('Automation conversation not found.');
        }
        const sentAt = nowIso();
        const trimmedText = text.trim();
        if (!trimmedText) {
          throw new Error('Enter a message before sending.');
        }
        browserMockState.automationMessages[intake.conversationId] = [
          ...(browserMockState.automationMessages[intake.conversationId] ?? []),
          {
            messageId: `browser-message-${Date.now()}`,
            conversationId: intake.conversationId,
            intakeId,
            externalMessageKey: `browser-outbound-${Date.now()}`,
            direction: 'outbound',
            sentAt,
            rawText: trimmedText,
            normalizedText: null,
            parseConfidence: null,
          },
        ];
        conversation.lastMessageAt = sentAt;
        conversation.messageCount += 1;
        window.dispatchEvent(new Event('kaur-khor-browser-state-changed'));
        return {
          conversation: clone(conversation),
          intake: clone(intake),
          messages: clone((browserMockState.automationMessages[intake.conversationId] ?? []).filter((entry) => entry.intakeId === intakeId)),
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
      resolveIntake: async ({ customerMessage, intakeId, status, note }: AutomationResolveIntakePayload) => {
        const intake = browserMockState.automation.intakes.find((entry) => entry.intakeId === intakeId);
        if (!intake) {
          throw new Error('Automation intake not found.');
        }
        intake.status = status;
        intake.notes = note ?? intake.notes;
        intake.updatedAt = nowIso();
        if (customerMessage?.send && customerMessage.text?.trim()) {
          const messages = browserMockState.automationMessages[intake.conversationId] ?? [];
          messages.push({
            messageId: `browser-outbound-${Date.now()}`,
            conversationId: intake.conversationId,
            intakeId,
            externalMessageKey: `browser-outbound-${Date.now()}`,
            direction: 'outbound',
            sentAt: nowIso(),
            rawText: customerMessage.text.trim(),
            normalizedText: customerMessage.text.trim().toLowerCase(),
            parseConfidence: null,
          });
          browserMockState.automationMessages[intake.conversationId] = messages;
        }
        return clone(intake);
      },
      promoteIntake: async ({ customerMessage, intakeId, mode, ticketId }: PromoteAutomationIntakePayload) => {
        const intake = browserMockState.automation.intakes.find((entry) => entry.intakeId === intakeId);
        if (!intake) {
          throw new Error('Automation intake not found.');
        }
        intake.status = 'ticketed';
        intake.promotedTicketId = ticketId ?? `ticket:customer:browser:${automationTicketCounter++}`;
        intake.updatedAt = nowIso();
        if (customerMessage?.send && customerMessage.text?.trim()) {
          const messages = browserMockState.automationMessages[intake.conversationId] ?? [];
          messages.push({
            messageId: `browser-outbound-${Date.now()}`,
            conversationId: intake.conversationId,
            intakeId,
            externalMessageKey: `browser-outbound-${Date.now()}`,
            direction: 'outbound',
            sentAt: nowIso(),
            rawText: customerMessage.text.trim(),
            normalizedText: customerMessage.text.trim().toLowerCase(),
            parseConfidence: null,
          });
          browserMockState.automationMessages[intake.conversationId] = messages;
        }
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
      checkForUpdate: async () => ({
        availableVersions: [],
        currentVersion: browserMockState.appContext.appVersion,
        isPlatformSupported: false,
        isUpdateAvailable: false,
        latestVersion: null,
        releaseTag: null,
        releaseUrl: 'https://github.com/Svanny/kaur-khor/releases/latest',
      }),
      chooseUpdateBackupDirectory: async () => null,
      chooseUpdateDataDirectory: async () => null,
      runSourceBuildUpdate: async () => ({
        message: 'Desktop updates are unavailable in browser mode.',
        started: false,
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
        window.dispatchEvent(new Event('kaur-khor-browser-state-changed'));
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

  window.kaurKhorDesktop = bridge;
  console.info('[browser-mock] installed mock kaurKhorDesktop bridge');
}

function resetBrowserDesktopBridgeMock(nextState: BrowserMockState = createMockState()) {
  setBrowserDesktopBridgeMockState(nextState);
}

export { installBrowserDesktopBridge, resetBrowserDesktopBridgeMock };
