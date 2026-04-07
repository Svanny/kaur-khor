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
  costPerUnit: number;
  soldAsProduct: boolean;
  productPrice: number | null;
  leadTimeMeanDaysHint: number | null;
  leadTimeStdDaysHint: number | null;
}

export interface SenaService {
  serviceId: string;
  name: string;
  description: string;
  price: number;
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
  serviceRankings: string[];
  retailRankings: string[];
  serviceStockouts: string[];
  retailStockouts: string[];
  orderSignals: SenaOrderSignal[];
  servicePrices: SenaServicePriceObservation[];
  retailPrices: SenaRetailPriceObservation[];
  leadTimeHints: SenaLeadTimeHint[];
  notes: string | null;
}

export interface SenaStockSnapshot {
  skuId: string;
  unitsInStock: number;
  costPerUnit: number | null;
  productPrice: number | null;
}

export interface SenaOrderSignal {
  skuId: string;
  orderPlaced: boolean;
  receiptArrived: boolean;
  approximateOrderQuantity: number | null;
  approximateReceiptQuantity: number | null;
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
  leadTimeMeanDays: number;
  leadTimeStdDays: number;
  regimeProbabilities: Record<string, number>;
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
}
