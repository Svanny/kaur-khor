import type { InventorySnapshot, StockReport } from '@shared/inventory';
import type {
  SenaDiagnostics,
  SenaObservationInput,
  SenaObservationRecord,
  SenaServiceDetail,
  SenaServiceDetailPage,
  SenaSkuDetail,
  SenaSkuDetailPage,
  SenaWorkspaceSummary,
} from '@shared/sena';
import type { AppLanguage } from '@shared/inventory';
import type { InventoryContextValue } from '@/state/inventory';
import { normalizeServiceDetailPage, normalizeSkuDetailPage } from '@/lib/sena-detail-pages';
import { hashSenaCatalog, projectInventorySnapshotFromSena, seedSenaCatalogFromSnapshot } from './catalog-seed';

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
  | 'ingestSenaObservation'
  | 'listSenaObservations'
  | 'loadSenaCatalog'
  | 'loadInventorySnapshot'
  | 'listStockReports'
  | 'loadSenaDiagnostics'
  | 'loadSenaServiceDetail'
  | 'loadSenaSkuDetail'
  | 'loadSenaWorkspaceSummary'
  | 'senaMeta'
  | 'triggerSenaRun'
  | 'updateSenaMeta'
  | 'upsertSenaCatalog'
>;

export function mapLegacyReportToSenaObservation(report: StockReport): SenaObservationInput {
  return {
    observedAt: report.reportedAt,
    stockSnapshot: report.skuObservations.map((observation) => ({
      skuId: observation.skuId,
      unitsInStock: observation.unitsInStock,
      costPerUnit: observation.costPerUnit,
      productPrice: observation.productPrice ?? null,
    })),
    serviceRankings: report.topServiceRanking,
    retailRankings: report.topRetailRanking,
    serviceStockouts: report.serviceSignals.filter((signal) => signal.stockout).map((signal) => signal.serviceId),
    retailStockouts: report.skuObservations.filter((observation) => observation.retailStockout).map((observation) => observation.skuId),
    orderSignals: report.skuObservations
      .filter((observation) => observation.restockIncluded)
      .map((observation) => ({
        skuId: observation.skuId,
        orderPlaced: false,
        receiptArrived: true,
        approximateOrderQuantity: null,
        approximateReceiptQuantity: null,
      })),
    servicePrices: report.servicePriceAdjustments.map((adjustment) => ({
      serviceId: adjustment.serviceId,
      price: adjustment.price,
    })),
    retailPrices: report.skuObservations
      .filter((observation) => observation.productPrice !== undefined)
      .map((observation) => ({
        skuId: observation.skuId,
        price: observation.productPrice ?? 0,
      })),
    leadTimeHints: [],
    notes: report.notes,
  };
}

export async function backfillLegacyReportsIntoSenaIfEmpty({
  reports,
  ingestSenaObservation,
  listSenaObservations,
}: Pick<BootstrapInventory, 'ingestSenaObservation' | 'listSenaObservations'> & {
  reports: StockReport[];
}) {
  const observations = await listSenaObservations();
  if (observations.length > 0) {
    return observations;
  }
  for (const report of [...reports].sort((left, right) => left.reportedAt.localeCompare(right.reportedAt))) {
    await ingestSenaObservation(mapLegacyReportToSenaObservation(report));
  }
  return listSenaObservations();
}

export function shouldTriggerBootstrapRun({
  catalogHash,
  cachedCatalogHash,
  detail,
  latestObservationAt,
  observationCount,
  workspaceSummary,
}: {
  catalogHash: string;
  cachedCatalogHash: string | null;
  detail: SenaSkuDetail | null;
  latestObservationAt: string | null;
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
  if (workspaceSummary.latestObservedAt && latestObservationAt && workspaceSummary.latestObservedAt < latestObservationAt) {
    return true;
  }
  return cachedCatalogHash !== catalogHash;
}

async function loadLinkedServiceDetails(
  inventory: Pick<BootstrapInventory, 'loadSenaServiceDetail'>,
  snapshot: InventorySnapshot,
  skuId: string,
) {
  const linkedServices = snapshot.services.filter((service) => service.skuIds.includes(skuId));
  const results = await Promise.all(
    linkedServices.map((service) => inventory.loadSenaServiceDetail(service.serviceId).catch(() => null)),
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
  const detailPage = normalizeSkuDetailPage(await inventory.loadSenaSkuDetail(skuId));
  const detail = detailPage?.detail ?? null;
  const diagnostics = await inventory.loadSenaDiagnostics();
  const observations = await inventory.listSenaObservations();
  const linkedServiceDetails = await loadLinkedServiceDetails(inventory, snapshot, skuId);
  return { workspaceSummary, detailPage, detail, diagnostics, observations, linkedServiceDetails };
}

export async function bootstrapSkuDetail({
  inventory,
  skuId,
}: {
  inventory: BootstrapInventory;
  skuId: string;
  language?: AppLanguage;
}): Promise<BootstrapSkuDetailResult> {
  const existingCatalog = await inventory.loadSenaCatalog();
  const legacySnapshot = existingCatalog ? null : await inventory.loadInventorySnapshot();
  const reports = existingCatalog ? [] : await inventory.listStockReports();
  const catalog = existingCatalog ?? seedSenaCatalogFromSnapshot(legacySnapshot);
  const catalogHash = hashSenaCatalog(catalog);
  const cachedCatalogHash = inventory.senaMeta.catalogHash;
  if (!existingCatalog) {
    await inventory.upsertSenaCatalog(catalog);
  }
  inventory.updateSenaMeta({ catalogHash, lastBootstrapSkuId: skuId });

  let observations = await backfillLegacyReportsIntoSenaIfEmpty({
    reports,
    ingestSenaObservation: inventory.ingestSenaObservation,
    listSenaObservations: inventory.listSenaObservations,
  });

  let workspaceSummary: SenaWorkspaceSummary | null = null;
  let detailPage: SenaSkuDetailPage | null = null;
  let detail: SenaSkuDetail | null = null;
  let diagnostics: SenaDiagnostics | null = null;
  let linkedServiceDetails: SenaServiceDetail[] = [];
  let uiState: SkuDetailUiState = observations.length < 2 ? 'needs_observations' : 'bootstrapping';
  let error: string | null = null;
  let projectedSnapshot = projectInventorySnapshotFromSena(catalog, observations);

  try {
    workspaceSummary = await inventory.loadSenaWorkspaceSummary();
    detailPage = normalizeSkuDetailPage(await inventory.loadSenaSkuDetail(skuId));
    detail = detailPage?.detail ?? null;
    diagnostics = await inventory.loadSenaDiagnostics();

    if (
      shouldTriggerBootstrapRun({
        catalogHash,
        cachedCatalogHash,
        detail,
        latestObservationAt: observations[observations.length - 1]?.input.observedAt ?? null,
        observationCount: observations.length,
        workspaceSummary,
      })
    ) {
      uiState = 'running';
      await inventory.triggerSenaRun({ algorithmVersion: 'sena-analysis-v2' });
      projectedSnapshot = projectInventorySnapshotFromSena(catalog, observations);
      const reloaded = await reloadSenaSkuData({ inventory, skuId, snapshot: projectedSnapshot });
      workspaceSummary = reloaded.workspaceSummary;
      detailPage = reloaded.detailPage;
      detail = reloaded.detail;
      diagnostics = reloaded.diagnostics;
      observations = reloaded.observations;
      projectedSnapshot = projectInventorySnapshotFromSena(catalog, observations);
      linkedServiceDetails = reloaded.linkedServiceDetails;
    } else if (observations.length >= 2) {
      linkedServiceDetails = await loadLinkedServiceDetails(inventory, projectedSnapshot, skuId);
    }
    uiState = observations.length < 2 ? 'needs_observations' : detail ? 'ready' : 'degraded';
  } catch (nextError) {
    error = nextError instanceof Error ? nextError.message : 'Failed to prepare SENA SKU detail.';
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
