import type { InventorySnapshot, StockReport } from '@shared/inventory';
import type {
  SenaCatalog,
  SenaDiagnostics,
  SenaObservationRecord,
  SenaServiceDetail,
  SenaServiceDetailPage,
  SenaSkuDetail,
  SenaSkuDetailPage,
  SenaWorkspaceSummary,
} from '@shared/sena';
import { RECENT_TIMEFRAME_MIN_REPORTS } from '@/components/system/chart-timeframe';
import { INTERVAL_PAGE_SIZE } from '@/components/system/interval-strip';
import type { InventoryContextValue } from '@/state/inventory';
import { normalizeServiceDetailPage, normalizeSkuDetailPage } from '@/lib/sena-detail-pages';
import { activeSenaCatalog } from '@/lib/sena-catalog';
import { hashSenaCatalog, projectInventorySnapshotFromSena } from './catalog-seed';

export type SkuDetailUiState = 'ready' | 'bootstrapping' | 'running' | 'needs_observations' | 'degraded';

export interface BootstrapSkuDetailResult {
  snapshot: InventorySnapshot;
  reports: StockReport[];
  observations: SenaObservationRecord[];
  workspaceSummary: SenaWorkspaceSummary | null;
  detailPage: SenaSkuDetailPage | null;
  detail: SenaSkuDetail | null;
  diagnostics: SenaDiagnostics | null;
  linkedServiceDetails: SenaServiceDetail[];
  uiState: SkuDetailUiState;
  error: string | null;
  catalogHash: string;
}

type BootstrapInventory = Pick<
  InventoryContextValue,
  | 'listSenaObservations'
  | 'loadSenaCatalog'
  | 'loadSenaDiagnostics'
  | 'loadSenaServiceDetail'
  | 'loadSenaSkuDetail'
  | 'loadSenaRunStatus'
  | 'loadSenaWorkspaceSummary'
  | 'senaMeta'
  | 'triggerSenaRun'
  | 'updateSenaMeta'
  | 'listStockReports'
>;

export function shouldTriggerBootstrapRun({
  detail,
  latestObservationAt,
  latestRunObservationCount,
  observationCount,
  workspaceSummary,
}: {
  detail: SenaSkuDetail | null;
  latestObservationAt: string | null;
  latestRunObservationCount: number | null;
  observationCount: number;
  workspaceSummary: SenaWorkspaceSummary | null;
}) {
  if (observationCount < 2) {
    return false;
  }
  if (!workspaceSummary) {
    return true;
  }
  if (!detail) {
    return true;
  }
  if (latestRunObservationCount != null && latestRunObservationCount < observationCount) {
    return true;
  }
  if (workspaceSummary.latestObservedAt && latestObservationAt && workspaceSummary.latestObservedAt < latestObservationAt) {
    return true;
  }
  return false;
}

async function loadLinkedServiceDetails(
  inventory: Pick<BootstrapInventory, 'loadSenaServiceDetail'>,
  snapshot: InventorySnapshot,
  skuId: string,
) {
  const linkedServices = snapshot.services.filter((service) => service.skuIds.includes(skuId));
  const results = await Promise.all(
    linkedServices.map((service) => inventory.loadSenaServiceDetail(service.serviceId, { limit: INTERVAL_PAGE_SIZE }).catch(() => null)),
  );
  return results
    .map((detail) => normalizeServiceDetailPage(detail)?.detail ?? null)
    .filter((detail): detail is SenaServiceDetail => detail != null);
}

export async function reloadSenaSkuData({
  inventory,
  skuId,
  snapshot,
}: {
  inventory: BootstrapInventory;
  skuId: string;
  snapshot: InventorySnapshot;
}) {
  const workspaceSummary = await inventory.loadSenaWorkspaceSummary();
  const detailPage = normalizeSkuDetailPage(
    await inventory.loadSenaSkuDetail(skuId, { limit: RECENT_TIMEFRAME_MIN_REPORTS }),
    RECENT_TIMEFRAME_MIN_REPORTS,
  );
  const detail = detailPage?.detail ?? null;
  const diagnostics = await inventory.loadSenaDiagnostics();
  const observations = await inventory.listSenaObservations();
  const linkedServiceDetails = await loadLinkedServiceDetails(inventory, snapshot, skuId);
  return { workspaceSummary, detailPage, detail, diagnostics, observations, linkedServiceDetails };
}

export function buildSkuDetailBootstrapPreview({
  catalog,
  detailPage,
  diagnostics,
  observations,
  reports,
  skuId,
  workspaceSummary,
}: {
  catalog: SenaCatalog | null;
  detailPage: SenaSkuDetailPage | null;
  diagnostics: SenaDiagnostics | null;
  observations: SenaObservationRecord[];
  reports: StockReport[];
  skuId: string;
  workspaceSummary: SenaWorkspaceSummary | null;
}): BootstrapSkuDetailResult | null {
  const visibleCatalog = activeSenaCatalog(catalog) ?? catalog;
  if (!visibleCatalog) {
    return null;
  }
  const snapshot = projectInventorySnapshotFromSena(visibleCatalog, observations, workspaceSummary);
  const snapshotSku = snapshot.skus.find((entry) => entry.skuId === skuId);
  if (!snapshotSku) {
    return null;
  }
  return {
    snapshot,
    reports,
    observations,
    workspaceSummary,
    detailPage,
    detail: detailPage?.detail ?? null,
    diagnostics,
    linkedServiceDetails: [],
    uiState: observations.length < 2 ? 'needs_observations' : 'bootstrapping',
    error: null,
    catalogHash: hashSenaCatalog(visibleCatalog),
  };
}

export async function bootstrapSkuDetail({
  inventory,
  shouldContinue = () => true,
  skuId,
}: {
  inventory: BootstrapInventory;
  shouldContinue?: () => boolean;
  skuId: string;
}): Promise<BootstrapSkuDetailResult> {
  const catalog = await inventory.loadSenaCatalog();
  if (!catalog) {
    throw new Error('Products are unavailable.');
  }
  const reports = await inventory.listStockReports();
  const visibleCatalog = activeSenaCatalog(catalog) ?? catalog;
  const catalogHash = hashSenaCatalog(catalog);
  inventory.updateSenaMeta({ catalogHash, lastBootstrapSkuId: skuId });
  let observations = await inventory.listSenaObservations();

  let workspaceSummary: SenaWorkspaceSummary | null = null;
  let detailPage: SenaSkuDetailPage | null = null;
  let detail: SenaSkuDetail | null = null;
  let diagnostics: SenaDiagnostics | null = null;
  let linkedServiceDetails: SenaServiceDetail[] = [];
  let latestRunObservationCount: number | null = null;
  let uiState: SkuDetailUiState = observations.length < 2 ? 'needs_observations' : 'bootstrapping';
  let error: string | null = null;
  let projectedSnapshot = projectInventorySnapshotFromSena(visibleCatalog, observations, workspaceSummary);

  try {
    workspaceSummary = await inventory.loadSenaWorkspaceSummary();
    projectedSnapshot = projectInventorySnapshotFromSena(visibleCatalog, observations, workspaceSummary);
    latestRunObservationCount =
      workspaceSummary?.runId != null
        ? (await inventory.loadSenaRunStatus(workspaceSummary.runId).catch(() => null))?.observationCount ?? null
        : null;
    detailPage = normalizeSkuDetailPage(
      await inventory.loadSenaSkuDetail(skuId, { limit: RECENT_TIMEFRAME_MIN_REPORTS }),
      RECENT_TIMEFRAME_MIN_REPORTS,
    );
    detail = detailPage?.detail ?? null;
    diagnostics = await inventory.loadSenaDiagnostics();

    if (
      shouldContinue() &&
      shouldTriggerBootstrapRun({
        detail,
        latestObservationAt: observations[observations.length - 1]?.input.observedAt ?? null,
        latestRunObservationCount,
        observationCount: observations.length,
        workspaceSummary,
      })
    ) {
      uiState = 'running';
      await inventory.triggerSenaRun({ algorithmVersion: 'sena-analysis-v3' });
      projectedSnapshot = projectInventorySnapshotFromSena(visibleCatalog, observations, workspaceSummary);
      const reloaded = await reloadSenaSkuData({ inventory, skuId, snapshot: projectedSnapshot });
      workspaceSummary = reloaded.workspaceSummary;
      detailPage = reloaded.detailPage;
      detail = reloaded.detail;
      diagnostics = reloaded.diagnostics;
      observations = reloaded.observations;
      projectedSnapshot = projectInventorySnapshotFromSena(visibleCatalog, observations, workspaceSummary);
      linkedServiceDetails = reloaded.linkedServiceDetails;
    } else if (shouldContinue() && observations.length >= 2) {
      linkedServiceDetails = await loadLinkedServiceDetails(inventory, projectedSnapshot, skuId);
    }
    uiState = observations.length < 2 ? 'needs_observations' : detail ? 'ready' : 'degraded';
  } catch (nextError) {
    error = nextError instanceof Error ? nextError.message : 'Failed to prepare the SKU detail view.';
    uiState = observations.length < 2 ? 'needs_observations' : 'degraded';
  }

  return {
    snapshot: projectedSnapshot,
    reports,
    observations,
    workspaceSummary,
    detailPage,
    detail,
    diagnostics,
    linkedServiceDetails,
    uiState,
    error,
    catalogHash,
  };
}
