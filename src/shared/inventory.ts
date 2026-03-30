export type AppLanguage = 'en' | 'km';
export type AppCurrency = 'USD' | 'KHR';
export type InventoryFilter = 'all' | 'sku' | 'service';
export type RankingEntryType = 'sku' | 'service';
export type SistAnalysisState = 'empty' | 'running' | 'ready' | 'stale' | 'failed';
export type SistConfidence = 'low' | 'medium' | 'high';
export type SistRegime =
  | 'normal'
  | 'spike'
  | 'lull'
  | 'stockout_constrained'
  | 'promo'
  | 'correction';

export interface SkuRecord {
  skuId: string;
  name: string;
  description: string;
  unitsInStock: number;
  costPerUnit: number;
  soldAsProduct: boolean;
  productPrice: number | null;
  leadTimeMeanDays: number | null;
  leadTimeStdDays: number | null;
}

export interface ServiceRecord {
  serviceId: string;
  name: string;
  description: string;
  price: number;
  skuIds: string[];
}

export interface RankingEntry {
  entryType: RankingEntryType;
  entryId: string;
  position: number;
}

export interface StockReportSkuObservation {
  skuId: string;
  unitsInStock: number;
  costPerUnit: number;
  productPrice?: number | null;
  restockIncluded?: boolean;
  retailStockout?: boolean;
  notes?: string | null;
}

export interface StockReportServiceSignal {
  serviceId: string;
  stockout?: boolean;
  notes?: string | null;
}

export interface StockReportServicePriceAdjustment {
  serviceId: string;
  price: number;
  notes?: string | null;
}

export interface StockReport {
  reportId: string;
  reportSource: 'manual' | 'compat-stock-update' | 'legacy-baseline';
  reportedAt: string;
  skuObservations: StockReportSkuObservation[];
  serviceSignals: StockReportServiceSignal[];
  servicePriceAdjustments: StockReportServicePriceAdjustment[];
  topServiceRanking: string[];
  topRetailRanking: string[];
  notes: string | null;
}

export interface StockReportSubmission {
  reportedAt: string;
  skuObservations: StockReportSkuObservation[];
  serviceSignals?: StockReportServiceSignal[];
  servicePriceAdjustments?: StockReportServicePriceAdjustment[];
  topServiceRanking?: string[];
  topRetailRanking?: string[];
  notes?: string | null;
}

export interface LeadTimeSummary {
  meanDays: number;
  stdDays: number;
  source: 'manual' | 'inferred' | 'fallback';
}

export interface SistAnalysisStatus {
  state: SistAnalysisState;
  updatedAt: string | null;
  reportCount: number;
  confidence: SistConfidence;
  reason: string | null;
}

export interface SistSkuInsight {
  skuId: string;
  latestPosteriorUnits: number;
  credibleIntervalLow: number;
  credibleIntervalHigh: number;
  daysOfCover: number | null;
  stockoutRisk: number;
  reorderPoint: number;
  safetyStock: number;
  reorderTriggerProbability: number;
  expectedDemandPerDay: number;
  demandIntervalLow: number;
  demandIntervalHigh: number;
  leadTime: LeadTimeSummary;
  regimeProbabilities: Record<SistRegime, number>;
  confidence: SistConfidence;
}

export interface SistAnalysisMetadata {
  reportCountUsed: number;
  effectiveSmoothingWindowUsed: number;
  analysisTimestamp: string;
  seasonalityActive: boolean;
  changePointActive: boolean;
}

export interface SistTrajectoryPoint {
  at: string;
  mean: number;
  low: number;
  high: number;
}

export interface SistForecastSeries {
  label: string;
  points: SistTrajectoryPoint[];
}

export interface SistIntervalDemandBreakdown {
  intervalIndex: number;
  startAt: string;
  endAt: string;
  durationDays: number;
  serviceDemandMean: number;
  retailDemandMean: number;
  totalDemandMean: number;
  restockMean: number;
  correctionMean: number;
  observedUnits: number | null;
  posteriorUnitsMean: number;
}

export interface SistRegimePosteriorPoint {
  intervalIndex: number;
  startAt: string;
  endAt: string;
  dominantRegime: SistRegime;
  changePointProbability: number;
  regimeProbabilities: Record<SistRegime, number>;
}

export interface SistReportEvidenceSummary {
  reportId: string;
  reportedAt: string;
  rankingEvidence: number;
  restockEvidence: number;
  stockoutEvidence: number;
  priceAdjustmentEvidence: number;
  correctionEvidence: number;
  notesPresent: boolean;
}

export interface SistRankSignalDetail {
  reportId: string;
  reportedAt: string;
  topServiceRanking: string[];
  topRetailRanking: string[];
  signalStrength: 'light' | 'medium' | 'high';
  completeness: 'sparse' | 'partial' | 'dense';
  affectedEntityCount: number;
}

export interface SistEvidenceLedgerEntry {
  reportId: string;
  reportedAt: string;
  hasRankingSignal: boolean;
  hasRestockFlag: boolean;
  hasServiceStockoutFlag: boolean;
  affectedEntityIds: string[];
  dominantRegime: SistRegime | null;
  notesPresent: boolean;
}

export interface SistReorderPolicyBreakdown {
  targetServiceLevel: number;
  leadTimeDaysMean: number;
  leadTimeDaysStd: number;
  expectedLeadTimeDemand: number;
  reorderPoint: number;
  safetyStock: number;
  reorderTriggerProbability: number;
}

export interface SistOverview {
  status: SistAnalysisStatus;
  settings: SistSettings;
  asOf: string | null;
  topRegime: SistRegime | null;
  pendingReorderCount: number;
  highRiskSkuIds: string[];
  skuInsights: SistSkuInsight[];
  metadata?: SistAnalysisMetadata | null;
}

export interface SistSkuDetail {
  insight: SistSkuInsight;
  reports: StockReport[];
  posteriorInventoryTrajectory?: SistTrajectoryPoint[];
  forecastTrajectory?: SistTrajectoryPoint[];
  intervalDemand?: SistIntervalDemandBreakdown[];
  regimeTimeline?: SistRegimePosteriorPoint[];
  evidenceSummary?: SistReportEvidenceSummary[];
  reorderPolicy?: SistReorderPolicyBreakdown | null;
  metadata?: SistAnalysisMetadata | null;
}

export interface SistServiceContributor {
  skuId: string;
  pressureProbability: number;
  expectedDaysOfCover: number | null;
}

export interface SistDisruptionWindow {
  startAt: string | null;
  endAt: string | null;
  probability: number;
}

export interface SistServiceDetail {
  serviceId: string;
  serviceName: string;
  estimatedActivityPerInterval: number;
  bottleneckProbability: number;
  viabilityForecast: SistTrajectoryPoint[];
  contributors: SistServiceContributor[];
  disruptionWindow: SistDisruptionWindow;
  evidenceTimeline: SistReportEvidenceSummary[];
  regimeTimeline: SistRegimePosteriorPoint[];
  metadata?: SistAnalysisMetadata | null;
}

export interface SistSignalIntakeSummary {
  rankingObservations: number;
  restockFlags: number;
  stockoutFlags: number;
  priceAdjustments: number;
  correctionSignals: number;
}

export interface SistModelHealthSummary {
  particleCountUsed: number;
  intervalCount: number;
  effectiveSampleSizeMean: number;
  confidence: SistConfidence;
}

export interface SistRiskEntity {
  entityType: string;
  entityId: string;
  riskScore: number;
}

export interface SistDriftDiagnostics {
  seasonalityActive: boolean;
  changePointActive: boolean;
  recentChangePointProbability: number;
  serviceDriftScale: number;
  retailDriftScale: number;
}

export interface SistSystemDetail {
  intervalTimeline: SistIntervalDemandBreakdown[];
  regimePosteriorHistory: SistRegimePosteriorPoint[];
  signalIntake: SistSignalIntakeSummary;
  modelHealth: SistModelHealthSummary;
  topRiskyEntities: SistRiskEntity[];
  driftDiagnostics: SistDriftDiagnostics;
  metadata?: SistAnalysisMetadata | null;
}

export interface SistSettings {
  targetServiceLevel: number;
  forecastHorizonDays: number;
  particleCount: number;
  smoothingWindowReports: number;
}

export interface InventorySnapshot {
  skus: SkuRecord[];
  services: ServiceRecord[];
  ranking: RankingEntry[];
  sist: SistOverview;
}

export interface InventoryState {
  snapshot: InventorySnapshot | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
}

export interface UpsertSkuPayload {
  skuId: string;
  name: string;
  description: string;
  unitsInStock: number;
  costPerUnit: number;
  soldAsProduct: boolean;
  productPrice: number | null;
  leadTimeMeanDays: number | null;
  leadTimeStdDays: number | null;
}

export interface UpsertServicePayload {
  serviceId: string;
  name: string;
  description: string;
  price: number;
  skuIds: string[];
}

export interface StockUpdatePayload {
  updates: Array<{
    skuId: string;
    unitsInStock: number;
    costPerUnit: number;
  }>;
}

export interface SaveRankingPayload {
  entries: RankingEntry[];
}
