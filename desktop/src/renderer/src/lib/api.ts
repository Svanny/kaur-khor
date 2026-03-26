import type {
  InventorySnapshot,
  RankingEntry,
  SaveRankingPayload,
  ServiceRecord,
  SkuRecord,
  StockUpdatePayload,
  UpsertServicePayload,
  UpsertSkuPayload,
} from '@shared/inventory';

const DEVICE_ID_KEY = 'banji-desktop-device-id';
const CALLER_ID = 'desktop-owner';

function getDeviceId(): string {
  const existing = window.localStorage.getItem(DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }

  const next = `desktop-${crypto.randomUUID()}`;
  window.localStorage.setItem(DEVICE_ID_KEY, next);
  return next;
}

async function request<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      'x-banji-device-id': getDeviceId(),
      'x-caller-id': CALLER_ID,
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { error?: string; details?: string }
      | null;
    const message = body?.details ?? body?.error ?? 'request failed';
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export async function fetchInventory(baseUrl: string): Promise<InventorySnapshot> {
  return request<InventorySnapshot>(baseUrl, '/v1/desktop/inventory');
}

export async function createSku(baseUrl: string, payload: UpsertSkuPayload): Promise<SkuRecord> {
  const response = await request<{ sku: SkuRecord }>(baseUrl, '/v1/desktop/skus', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.sku;
}

export async function updateSku(
  baseUrl: string,
  skuId: string,
  payload: UpsertSkuPayload,
): Promise<SkuRecord> {
  const response = await request<{ sku: SkuRecord }>(baseUrl, `/v1/desktop/skus/${skuId}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return response.sku;
}

export async function createService(
  baseUrl: string,
  payload: UpsertServicePayload,
): Promise<ServiceRecord> {
  const response = await request<{ service: ServiceRecord }>(baseUrl, '/v1/desktop/services', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.service;
}

export async function updateService(
  baseUrl: string,
  serviceId: string,
  payload: UpsertServicePayload,
): Promise<ServiceRecord> {
  const response = await request<{ service: ServiceRecord }>(
    baseUrl,
    `/v1/desktop/services/${serviceId}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    },
  );
  return response.service;
}

export async function applyStockUpdates(
  baseUrl: string,
  payload: StockUpdatePayload,
): Promise<SkuRecord[]> {
  const response = await request<{ skus: SkuRecord[] }>(baseUrl, '/v1/desktop/stock-updates', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
  return response.skus;
}

export async function saveRanking(
  baseUrl: string,
  payload: SaveRankingPayload,
): Promise<RankingEntry[]> {
  const response = await request<{ entries: RankingEntry[] }>(baseUrl, '/v1/desktop/ranking', {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
  return response.entries;
}
