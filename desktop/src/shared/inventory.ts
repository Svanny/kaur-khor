import type { BackendStatus } from './ipc';

export type AppLanguage = 'en' | 'km';
export type AppCurrency = 'USD' | 'KHR';
export type InventoryFilter = 'all' | 'sku' | 'service';
export type RankingEntryType = 'sku' | 'service';

export interface SkuRecord {
  skuId: string;
  name: string;
  description: string;
  unitsInStock: number;
  costPerUnit: number;
  soldAsProduct: boolean;
  productPrice: number | null;
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

export interface InventorySnapshot {
  skus: SkuRecord[];
  services: ServiceRecord[];
  ranking: RankingEntry[];
}

export interface InventoryState {
  snapshot: InventorySnapshot | null;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  backendStatus: BackendStatus;
}

export interface UpsertSkuPayload {
  skuId: string;
  name: string;
  description: string;
  unitsInStock: number;
  costPerUnit: number;
  soldAsProduct: boolean;
  productPrice: number | null;
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
