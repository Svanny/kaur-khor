export const SENA_SCHEMA_VERSION = 1;

export interface SenaCatalog {
  schemaVersion: number;
  skus: SenaSku[];
  services: SenaService[];
  bundles: SenaBundle[];
  sharingMask: SenaServiceSkuMaskEntry[];
}

export interface SenaSku {
  skuId: string;
  name: string;
  description: string;
  imagePath?: string | null;
  supplierName?: string | null;
  costPerUnit: number;
  archived: boolean;
  soldAsProduct: boolean;
  productPrice: number | null;
  leadTimeMeanDaysHint: number | null;
  leadTimeStdDaysHint: number | null;
}

export interface SenaService {
  serviceId: string;
  name: string;
  description: string;
  imagePath?: string | null;
  price: number;
  archived: boolean;
  bundle: boolean;
}

export interface SenaBundle {
  bundleId: string;
  serviceId: string;
  name: string;
}

export interface SenaServiceSkuMaskEntry {
  serviceId: string;
  skuId: string;
  enabled: boolean;
  usageProbability: number | null;
}

export interface SenaObservationInput {
  observedAt: string;
  stockSnapshot: SenaStockSnapshot[];
  retailSalesSnapshot?: SenaRetailSalesSnapshot[];
  serviceSalesSnapshot?: SenaServiceSalesSnapshot[];
  serviceRankings: string[];
  retailRankings: string[];
  serviceStockouts: string[];
  retailStockouts: string[];
  orderSignals: SenaOrderSignal[];
  servicePrices: SenaServicePriceObservation[];
  retailPrices: SenaRetailPriceObservation[];
  leadTimeHints: SenaLeadTimeHint[];
  regimeHint?: SenaObservationRegimeHint | null;
  adjustmentSignals?: SenaAdjustmentSignal[];
  recipeUsageHints?: SenaRecipeUsageHint[];
  notes: string | null;
}

export interface SenaStockSnapshot {
  skuId: string;
  unitsInStock: number;
  costPerUnit: number | null;
  productPrice: number | null;
}

export interface SenaRetailSalesSnapshot {
  skuId: string;
  unitsSold: number;
}

export interface SenaServiceSalesSnapshot {
  serviceId: string;
  unitsSold: number;
}

export interface SenaOrderSignal {
  skuId: string;
  orderPlaced: boolean;
  receiptArrived: boolean;
  approximateOrderQuantity: number | null;
  approximateReceiptQuantity: number | null;
  placementTimestamp?: string | null;
  receiptTimestamp?: string | null;
  leadTimeDaysHint?: number | null;
}

export type SenaOrderBatchStatus =
  | 'open'
  | 'awaiting_receipt'
  | 'follow_up'
  | 'partial_receipt'
  | 'received'
  | 'reviewed';

export type SenaOrderChildStatus =
  | 'open'
  | 'awaiting_receipt'
  | 'follow_up'
  | 'received'
  | 'reviewed';

export interface SenaOrderFieldValues {
  supplierName: string | null;
  supplierNote: string | null;
  orderedQuantity: number | null;
  receivedQuantity: number | null;
  costPerUnit: number | null;
  expectedArrivalAt: string | null;
  placementTimestamp: string | null;
  receiptTimestamp: string | null;
  leadTimeDaysHint: number | null;
  leadTimeVariability: SenaLeadTimeVariabilityClass | null;
}

export interface SenaOrderChildRecord {
  childOrderId: string;
  skuId: string;
  status: SenaOrderChildStatus;
  createdAt: string;
  updatedAt: string;
  inheritedFromBatch: boolean;
  effective: SenaOrderFieldValues;
  overrides: Partial<SenaOrderFieldValues>;
}

export interface SenaOrderBatchRecord {
  batchOrderId: string;
  ownerSub: string;
  supplierName: string | null;
  status: SenaOrderBatchStatus;
  createdAt: string;
  updatedAt: string;
  shared: SenaOrderFieldValues;
  children: SenaOrderChildRecord[];
}

export interface SenaOrderBatchCreateChildInput {
  skuId: string;
  overrides?: Partial<SenaOrderFieldValues>;
}

export interface SenaCreateOrderBatchPayload {
  supplierName?: string | null;
  shared: Partial<SenaOrderFieldValues>;
  children: SenaOrderBatchCreateChildInput[];
}

export interface SenaUpdateOrderBatchPayload {
  batchOrderId: string;
  shared?: Partial<SenaOrderFieldValues>;
  supplierName?: string | null;
  status?: SenaOrderBatchStatus;
}

export interface SenaUpdateOrderChildPayload {
  childOrderId: string;
  skuId?: string;
  overrides?: Partial<SenaOrderFieldValues>;
  status?: SenaOrderChildStatus;
  appendSupplierNote?: string | null;
}

export interface SenaSplitOrderChildPayload {
  childOrderId: string;
}

export interface SenaOrderLookupPayload {
  batchOrderId?: string;
  childOrderId?: string;
  skuId?: string;
  supplierName?: string;
  status?: SenaOrderBatchStatus;
}

export interface SenaServicePriceObservation {
  serviceId: string;
  price: number;
}

export interface SenaRetailPriceObservation {
  skuId: string;
  price: number;
}

export interface SenaLeadTimeHint {
  skuId: string;
  typicalDays: number | null;
  lowDays: number | null;
  highDays: number | null;
  variabilityClass: SenaLeadTimeVariabilityClass | null;
}

export type SenaObservationRegimeHint =
  | 'normal'
  | 'spike'
  | 'lull'
  | 'stockout_constrained'
  | 'promo'
  | 'correction';

export interface SenaAdjustmentSignal {
  skuId: string;
  quantityDelta: number;
  reason: string;
}

export interface SenaRecipeUsageHint {
  serviceId: string;
  skuId: string;
  usageProbability: number;
  typicalUnitsPerInstance: number;
  variability: number;
}

export type SenaLeadTimeVariabilityClass =
  | 'very_tight'
  | 'tight'
  | 'normal'
  | 'wide'
  | 'very_wide';

export interface SenaObservationRecord {
  observationId: string;
  ownerSub: string;
  input: SenaObservationInput;
}

export interface SenaObservationUpdatePayload {
  observationId: string;
  input: SenaObservationInput;
}

export interface SenaObservationDeletePayload {
  observationId: string;
}

export type SenaRunStatus = 'queued' | 'running' | 'succeeded' | 'failed';

export interface SenaAnalysisRunRecord {
  runId: string;
  ownerSub: string;
  algorithmVersion: string;
  status: SenaRunStatus;
  observationCount: number;
  createdAt: string;
  completedAt: string | null;
  summary: SenaWorkspaceSummary | null;
  diagnostics: SenaDiagnostics | null;
  primaryArtifactKey: string | null;
  error: string | null;
}

export interface SenaWorkspaceSummary {
  ownerSub: string;
  runId: string;
  latestObservedAt: string | null;
  skuCount: number;
  serviceCount: number;
  intervalCount: number;
  pendingReorderCount: number;
  topRegime: string;
  highRiskSkuIds: string[];
  skuSummaries: SenaSkuSummary[];
}

export interface SenaSkuSummary {
  skuId: string;
  latestPosteriorUnits: number;
  credibleIntervalLow: number;
  credibleIntervalHigh: number;
  demandPerDayMean: number;
  stockoutRisk: number;
  daysOfCover: number | null;
  expectedLeadTimeDemand: number;
  safetyStock: number;
  reorderPoint: number;
  reorderTriggerProbability: number;
  reorderQuantity?: SenaReorderQuantityRecommendation;
  leadTimeMeanDays: number;
  leadTimeStdDays: number;
  regimeProbabilities: Record<string, number>;
}

export interface SenaReorderQuantityRecommendation {
  recommendedUnits: number;
  ungatedRecommendedUnits: number;
  likelyRangeLow: number;
  likelyRangeHigh: number;
  needProbability: number;
  recommendationIssued: boolean;
  recommendationQuantile: number;
  intervalLowQuantile: number;
  intervalHighQuantile: number;
  needProbabilityGate: number;
  reviewDelayDays: number;
}

export interface SenaSkuDetail {
  summary: SenaSkuSummary;
  inventoryPosterior: SenaTrajectoryPoint[];
  demandPosterior: SenaIntervalPosterior[];
  pipelinePosterior: SenaPipelinePosteriorPoint[];
  leadTimePosterior: SenaLeadTimePosteriorPoint[];
}

export interface SenaDetailWindowRequest {
  beforeIntervalIndex?: number | null;
  limit: number;
}

export interface SenaSkuDetailPage {
  detail: SenaSkuDetail;
  pageLimit: number;
  hasOlder: boolean;
  nextBeforeIntervalIndex: number | null;
  latestIntervalIndex: number | null;
}

export interface SenaTrajectoryPoint {
  at: string;
  mean: number;
  low: number;
  high: number;
}

export interface SenaIntervalPosterior {
  intervalIndex: number;
  startAt: string;
  endAt: string;
  deltaDays: number;
  serviceDemandMean: number;
  retailDemandMean: number;
  unconstrainedDemandMean: number;
  realizedConsumptionMean: number;
  lostDemandMean?: number;
  adjustmentsMean: number;
  receiptsMean: number;
  preClampInventoryMean?: number;
  inventoryPositionMean?: number;
}

export interface SenaPipelinePosteriorPoint {
  intervalIndex: number;
  inTransitMean: number;
  orderProbability: number;
  orderQuantityMean: number;
  receiptQuantityMean: number;
  ageDaysMean: number;
}

export interface SenaLeadTimePosteriorPoint {
  intervalIndex: number;
  logMeanDays: number;
  logStdDays: number;
  logVarianceDaysSquared?: number;
  meanDays: number;
  stdDays: number;
  varianceDaysSquared?: number;
  shapeSigma?: number;
  observedVariabilityClass: SenaLeadTimeVariabilityClass | null;
  observedRelativeWidth: number | null;
}

export interface SenaDiagnostics {
  effectiveSampleSizeMean: number;
  resamplingCount: number;
  smoothingEnabled: boolean;
  changePointProbability: number;
  latestChangePointProbability?: number;
  seasonalityActive: boolean;
  posteriorPredictiveErrorMean: number;
  coverageEstimate: number;
  regimeHistory: SenaRegimePosteriorPoint[];
}

export interface SenaRegimePosteriorPoint {
  intervalIndex: number;
  startAt: string;
  endAt: string;
  dominantRegime: string;
  regimeProbabilities: Record<string, number>;
}

export interface SenaServiceDetail {
  serviceId: string;
  activityMean: number;
  activityIntervalLow: number;
  activityIntervalHigh: number;
  bottleneckProbability: number;
  contributors: SenaServiceContributor[];
  regimeTimeline: SenaRegimePosteriorPoint[];
}

export interface SenaServiceDetailPage {
  detail: SenaServiceDetail;
  pageLimit: number;
  hasOlder: boolean;
  nextBeforeIntervalIndex: number | null;
  latestIntervalIndex: number | null;
}

export interface SenaServiceContributor {
  skuId: string;
  usageProbability: number;
  bottleneckProbability: number;
  reorderQuantity?: SenaReorderQuantityRecommendation | null;
}
