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
  restockIncluded?: boolean;
  retailStockout?: boolean;
  notes?: string | null;
}

export interface StockReportServiceSignal {
  serviceId: string;
  stockout?: boolean;
}

export interface StockReportServicePriceAdjustment {
  serviceId: string;
  price: number;
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

export interface SistOverview {
  status: SistAnalysisStatus;
  settings: SistSettings;
  asOf: string | null;
  topRegime: SistRegime | null;
  pendingReorderCount: number;
  highRiskSkuIds: string[];
  skuInsights: SistSkuInsight[];
}

export interface SistSkuDetail {
  insight: SistSkuInsight;
  reports: StockReport[];
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
