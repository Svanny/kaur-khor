import type { AppCurrency, AppLanguage } from '@shared/inventory';
import { DEFAULT_USD_TO_KHR_EXCHANGE_RATE } from '@shared/ipc';
import type {
  SenaCatalog,
  SenaDiagnostics,
  SenaObservationRecord,
  SenaOrderBatchRecord,
  SenaService,
  SenaServiceDetail,
  SenaSku,
  SenaSkuDetail,
  SenaWorkspaceSummary,
} from '@shared/sena';
import { buildServiceCommercialSnapshots, buildSkuCommercialSnapshots } from '@/lib/commercial-flow';
import { formatCurrency, formatWholeNumber } from '@/lib/format';
import { buildBatchUpdateHref, RECORD_UPDATE_SUPPLIER_PENDING_PATH } from '@/lib/record-update-routes';
import { translateUiLiteral } from '@/lib/translations';
import type { StatusPillTone } from '@/lib/state-tones';
import { formatSenaDate } from '@/routes/sku-detail/format';
import { daysBetween } from '@/lib/date-input-utils';

export type FinancialsRange = '1d' | '7d' | '30d' | '90d' | 'custom';
export type FinancialsScope = 'all' | 'services' | 'skus';

export interface FinancialsRibbonMetric {
  key: 'netSales' | 'grossProfit' | 'inventoryCapital' | 'openCommitments' | 'marginErosion';
  label: string;
  value: string;
  detail: string;
  compareLabel?: string;
  compareTone?: StatusPillTone;
  tone: StatusPillTone;
}

export interface FinancialStatementRow {
  key: string;
  label: string;
  value: string;
  detail?: string;
  compareLabel?: string;
  compareTone?: StatusPillTone;
  tone: StatusPillTone;
}

export interface FinancialStatementBlock {
  id: 'money-in' | 'money-tied-up' | 'money-leaking';
  title: string;
  descriptor: string;
  summaryValue: string;
  summaryDetail: string;
  tone: StatusPillTone;
  rows: FinancialStatementRow[];
}

export interface EconomicContributorRow {
  id: string;
  entityType: 'sku' | 'service';
  label: string;
  imagePath?: string | null;
  supplierName?: string | null;
  href: string;
  netSalesLabel: string;
  grossProfitLabel: string;
  capitalTiedLabel: string;
  turnQualityLabel: string;
  statusLabel: string;
  statusTone: StatusPillTone;
  summary: string;
}

export interface FinancialBandEntry {
  id: string;
  entityType: 'sku' | 'service';
  label: string;
  href: string;
  imagePath?: string | null;
  summary: string;
  tone: StatusPillTone;
}

export interface FinancialRailRow {
  id: string;
  label: string;
  detail: string;
  valueLabel?: string;
  valueTone?: StatusPillTone;
  href: string;
}

export interface FinancialsCoverageModel {
  freshnessLabel: string;
  costCoverageLabel: string;
  priceCoverageLabel: string;
  weakSpotLabel: string;
}

export interface FinancialsViewModel {
  titleMeta: string[];
  ribbon: FinancialsRibbonMetric[];
  statement: FinancialStatementBlock[];
  contributors: EconomicContributorRow[];
  earners: FinancialBandEntry[];
  capitalTraps: FinancialBandEntry[];
  marginLeaks: FinancialBandEntry[];
  commitmentsDue: FinancialRailRow[];
  largestCapitalPositions: FinancialRailRow[];
  recentMarginShifts: FinancialRailRow[];
  coverage: FinancialsCoverageModel;
  windowLabel: string;
  previousWindowLabel: string;
}

interface FinancialTotals {
  blockedMargin: number;
  costConsumed: number;
  costIncreases: number;
  grossProfit: number;
  inventoryCapital: number;
  inTransitCapital: number;
  marginErosion: number;
  markdownPressure: number;
  negativeCorrections: number;
  netSales: number;
  onHandStockValue: number;
  openCommitments: number;
  slowStockValue: number;
}

interface SkuFinancialRow {
  blockedDemandValue: number;
  capitalTied: number;
  costConsumed: number;
  refundValue: number;
  grossProfit: number;
  href: string;
  id: string;
  imagePath: string | null;
  linkedServiceCount: number;
  marginRatio: number | null;
  name: string;
  netSales: number;
  salesUnits: number;
  slowCapital: number;
  supplierName: string | null;
  type: 'sku';
  unitsOnHand: number;
}

interface ServiceFinancialRow {
  blockedDemandValue: number;
  capitalTied: number;
  coverageRatio: number;
  refundValue: number;
  grossProfit: number;
  href: string;
  id: string;
  imagePath: string | null;
  linkedSkuCount: number;
  marginRatio: number;
  name: string;
  netSales: number;
  serviceUnits: number;
  type: 'service';
}

type FinancialEntityRow = SkuFinancialRow | ServiceFinancialRow;

function literal(language: AppLanguage, englishTemplate: string, variables?: Record<string, string | number | null | undefined>) {
  return translateUiLiteral(language, englishTemplate, variables);
}

function daysForRange(range: FinancialsRange) {
  if (range === '1d') {
    return 1;
  }
  if (range === '7d') {
    return 7;
  }
  if (range === '90d') {
    return 90;
  }
  return 30;
}

function windowLabel(range: FinancialsRange, language: AppLanguage, customRange: { startAt: string; endAt: string } | null) {
  if (range === 'custom' && customRange) {
    return literal(language, 'custom range');
  }
  return literal(language, 'last {days}d', { days: daysForRange(range) });
}

function lastUpdatedAt(workspaceSummary: SenaWorkspaceSummary | null, observations: SenaObservationRecord[]) {
  return workspaceSummary?.latestObservedAt ?? observations[0]?.input.observedAt ?? null;
}

function filterObservationsForWindow({
  endAt,
  observations,
  offsetDays = 0,
  windowDays,
}: {
  endAt: string | null;
  observations: SenaObservationRecord[];
  offsetDays?: number;
  windowDays: number;
}) {
  if (!endAt) {
    return observations.slice(0, Math.min(observations.length, windowDays));
  }

  const endTime = new Date(endAt).getTime() - offsetDays * 24 * 60 * 60 * 1000;
  const startTime = endTime - windowDays * 24 * 60 * 60 * 1000;

  return observations.filter((observation) => {
    const observedAt = new Date(observation.input.observedAt).getTime();
    return Number.isFinite(observedAt) && observedAt <= endTime && observedAt > startTime;
  });
}

function latestObservationWithStockBefore(observations: SenaObservationRecord[], endAt: string | null) {
  const endTime = endAt ? new Date(endAt).getTime() : Number.POSITIVE_INFINITY;
  return observations
    .filter((observation) => {
      const observedAt = new Date(observation.input.observedAt).getTime();
      return Number.isFinite(observedAt) && observedAt <= endTime && observation.input.stockSnapshot.length > 0;
    })
    .sort((left, right) => new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime())[0] ?? null;
}

function formatMoney(value: number, currency: AppCurrency, language: AppLanguage, usdToKhrExchangeRate: number) {
  return formatCurrency(value, currency, language, usdToKhrExchangeRate);
}

function signedMoneyDelta(
  value: number,
  currency: AppCurrency,
  language: AppLanguage,
  usdToKhrExchangeRate: number,
  polarity: 'higher-good' | 'lower-good' | 'neutral' = 'higher-good',
) {
  if (Math.abs(value) < 0.005) {
    return {
      label: literal(language, 'flat vs prior window'),
      tone: 'neutral' as const,
    };
  }

  const prefix = value > 0 ? '+' : '-';
  const favorable =
    polarity === 'neutral'
      ? null
      : polarity === 'higher-good'
        ? value > 0
        : value < 0;

  return {
    label: literal(language, '{value} vs prior window', {
      value: `${prefix}${formatMoney(Math.abs(value), currency, language, usdToKhrExchangeRate)}`,
    }),
    tone: favorable == null ? ('info' as const) : favorable ? ('success' as const) : ('warning' as const),
  };
}

function moneyTone(value: number, polarity: 'higher-good' | 'lower-good' | 'neutral' = 'higher-good'): StatusPillTone {
  if (Math.abs(value) < 0.005) {
    return 'neutral';
  }
  if (polarity === 'neutral') {
    return 'info';
  }
  return (polarity === 'higher-good' ? value > 0 : value < 0) ? 'success' : 'warning';
}

function safeRatio(numerator: number, denominator: number) {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

function sortByValueThenLabel<T extends { label?: string; name?: string }>(
  rows: T[],
  valueForRow: (row: T) => number,
) {
  return [...rows].sort((left, right) => {
    const delta = valueForRow(right) - valueForRow(left);
    if (Math.abs(delta) > 0.005) {
      return delta;
    }
    return (left.label ?? left.name ?? '').localeCompare(right.label ?? right.name ?? '');
  });
}

function scopeEntitySets(catalog: SenaCatalog, scope: FinancialsScope) {
  const skuById = new Map(catalog.skus.map((sku) => [sku.skuId, sku] as const));
  const serviceById = new Map(catalog.services.map((service) => [service.serviceId, service] as const));
  const linkedSkusByServiceId = new Map<string, SenaSku[]>();
  const linkedServicesBySkuId = new Map<string, SenaService[]>();

  for (const sku of catalog.skus) {
    linkedServicesBySkuId.set(sku.skuId, []);
  }
  for (const service of catalog.services) {
    linkedSkusByServiceId.set(service.serviceId, []);
  }

  for (const link of catalog.sharingMask) {
    if (!link.enabled) {
      continue;
    }
    const sku = skuById.get(link.skuId);
    const service = serviceById.get(link.serviceId);
    if (!sku || !service) {
      continue;
    }
    linkedSkusByServiceId.get(service.serviceId)?.push(sku);
    linkedServicesBySkuId.get(sku.skuId)?.push(service);
  }

  const scopedServices = scope === 'skus' ? [] : catalog.services;
  const scopedSkus =
    scope === 'services'
      ? catalog.skus.filter((sku) => (linkedServicesBySkuId.get(sku.skuId)?.length ?? 0) > 0)
      : scope === 'skus'
        ? catalog.skus.filter((sku) => sku.soldAsProduct)
        : catalog.skus;

  return {
    linkedServicesBySkuId,
    linkedSkusByServiceId,
    scopedServices,
    scopedSkuIds: new Set(scopedSkus.map((sku) => sku.skuId)),
    scopedServiceIds: new Set(scopedServices.map((service) => service.serviceId)),
    scopedSkus,
    serviceById,
    skuById,
  };
}

function retailPriceForObservation(sku: SenaSku, observation: SenaObservationRecord) {
  return observation.input.retailPrices.find((entry) => entry.skuId === sku.skuId)?.price ?? sku.productPrice ?? 0;
}

function servicePriceForObservation(service: SenaService, observation: SenaObservationRecord) {
  return observation.input.servicePrices.find((entry) => entry.serviceId === service.serviceId)?.price ?? service.price;
}

function costPerServiceUnit(serviceId: string, catalog: SenaCatalog, linkedSkusByServiceId: Map<string, SenaSku[]>) {
  const linkedSkus = linkedSkusByServiceId.get(serviceId) ?? [];
  return linkedSkus.reduce((sum, sku) => {
    const mask = catalog.sharingMask.find((entry) => entry.enabled && entry.serviceId === serviceId && entry.skuId === sku.skuId);
    return sum + sku.costPerUnit * (mask?.usageProbability ?? 1);
  }, 0);
}

function currentInTransitUnits(detail: SenaSkuDetail | null | undefined) {
  const latest = detail?.pipelinePosterior.slice().sort((left, right) => right.intervalIndex - left.intervalIndex)[0];
  return Math.max(0, latest?.inTransitMean ?? 0);
}

function openCommitmentRows(orderBatches: SenaOrderBatchRecord[], skuById: Map<string, SenaSku>, scopedSkuIds: Set<string>) {
  return orderBatches.flatMap((batch) =>
    batch.children
      .filter((child) => scopedSkuIds.has(child.skuId))
      .map((child) => {
        const orderedQuantity = child.effective.orderedQuantity ?? 0;
        const receivedQuantity = child.effective.receivedQuantity ?? 0;
        const remainingQuantity = Math.max(0, orderedQuantity - receivedQuantity);
        const sku = skuById.get(child.skuId);
        const costPerUnit = child.effective.costPerUnit ?? sku?.costPerUnit ?? 0;
        return {
          batchOrderId: batch.batchOrderId,
          childOrderId: child.childOrderId,
          expectedArrivalAt: child.effective.expectedArrivalAt,
          href: buildBatchUpdateHref({
            batchOrderId: batch.batchOrderId,
            childOrderId: child.childOrderId,
            laneId: 'supplier-receipt',
            skuIds: [child.skuId],
          }),
          id: child.childOrderId,
          remainingQuantity,
          sku,
          status: child.status,
          value: remainingQuantity * costPerUnit,
        };
      }),
  ).filter((row) => row.remainingQuantity > 0 && row.status !== 'received' && row.status !== 'reviewed');
}

function latestPriceShiftRows({
  observations,
  scopedServiceIds,
  scopedSkuIds,
  serviceById,
  skuById,
  currency,
  language,
  usdToKhrExchangeRate,
}: {
  observations: SenaObservationRecord[];
  scopedServiceIds: Set<string>;
  scopedSkuIds: Set<string>;
  serviceById: Map<string, SenaService>;
  skuById: Map<string, SenaSku>;
  currency: AppCurrency;
  language: AppLanguage;
  usdToKhrExchangeRate: number;
}) {
  return observations.flatMap((observation) => {
    const observedAt = observation.input.observedAt;
    const retailRows = observation.input.retailPrices
      .filter((price) => scopedSkuIds.has(price.skuId))
      .map((price) => {
        const sku = skuById.get(price.skuId);
        const baseline = sku?.productPrice ?? price.price;
        const delta = price.price - baseline;
        return {
          at: observedAt,
          href: `/catalog/skus/${price.skuId}`,
          id: `retail-price-${price.skuId}-${observedAt}`,
          impact: Math.abs(delta),
          label: sku?.name ?? price.skuId,
          detail: delta === 0
            ? literal(language, 'Retail price held at {value}', {
                value: formatMoney(price.price, currency, language, usdToKhrExchangeRate),
              })
            : literal(language, 'Retail price {direction} {value}', {
                direction: delta > 0 ? literal(language, 'up') : literal(language, 'down'),
                value: formatMoney(Math.abs(delta), currency, language, usdToKhrExchangeRate),
              }),
        };
      });
    const serviceRows = observation.input.servicePrices
      .filter((price) => scopedServiceIds.has(price.serviceId))
      .map((price) => {
        const service = serviceById.get(price.serviceId);
        const baseline = service?.price ?? price.price;
        const delta = price.price - baseline;
        return {
          at: observedAt,
          href: `/catalog/services/${price.serviceId}`,
          id: `service-price-${price.serviceId}-${observedAt}`,
          impact: Math.abs(delta),
          label: service?.name ?? price.serviceId,
          detail: delta === 0
            ? literal(language, 'Service price held at {value}', {
                value: formatMoney(price.price, currency, language, usdToKhrExchangeRate),
              })
            : literal(language, 'Service price {direction} {value}', {
                direction: delta > 0 ? literal(language, 'up') : literal(language, 'down'),
                value: formatMoney(Math.abs(delta), currency, language, usdToKhrExchangeRate),
              }),
        };
      });
    const costRows = observation.input.stockSnapshot
      .filter((snapshot) => scopedSkuIds.has(snapshot.skuId) && snapshot.costPerUnit != null)
      .map((snapshot) => {
        const sku = skuById.get(snapshot.skuId);
        const baseline = sku?.costPerUnit ?? snapshot.costPerUnit ?? 0;
        const delta = (snapshot.costPerUnit ?? baseline) - baseline;
        return {
          at: observedAt,
          href: `/catalog/skus/${snapshot.skuId}`,
          id: `cost-${snapshot.skuId}-${observedAt}`,
          impact: Math.abs(delta) * Math.max(1, snapshot.unitsInStock),
          label: sku?.name ?? snapshot.skuId,
          detail: delta === 0
            ? literal(language, 'Known cost held steady')
            : literal(language, 'Known cost {direction} {value}/unit', {
                direction: delta > 0 ? literal(language, 'up') : literal(language, 'down'),
                value: formatMoney(Math.abs(delta), currency, language, usdToKhrExchangeRate),
              }),
        };
      });

    return [...retailRows, ...serviceRows, ...costRows];
  });
}

function deriveWindowSales({
  catalog,
  observations,
  scope,
}: {
  catalog: SenaCatalog;
  observations: SenaObservationRecord[];
  scope: FinancialsScope;
}) {
  const { linkedSkusByServiceId, scopedServiceIds, scopedSkuIds, serviceById, skuById } = scopeEntitySets(catalog, scope);
  let netSales = 0;
  let costConsumed = 0;
  const skuSales = new Map<string, { costConsumed: number; netSales: number; units: number }>();
  const serviceSales = new Map<string, { costConsumed: number; netSales: number; units: number }>();

  for (const observation of observations) {
    if (scope !== 'services') {
      for (const sale of observation.input.retailSalesSnapshot ?? []) {
        if (!scopedSkuIds.has(sale.skuId)) {
          continue;
        }
        const sku = skuById.get(sale.skuId);
        if (!sku || !sku.soldAsProduct) {
          continue;
        }
        const saleValue = sale.unitsSold * retailPriceForObservation(sku, observation);
        const saleCost = sale.unitsSold * sku.costPerUnit;
        const current = skuSales.get(sale.skuId) ?? { costConsumed: 0, netSales: 0, units: 0 };
        current.costConsumed += saleCost;
        current.netSales += saleValue;
        current.units += sale.unitsSold;
        skuSales.set(sale.skuId, current);
        netSales += saleValue;
        costConsumed += saleCost;
      }
    }

    if (scope !== 'skus') {
      for (const sale of observation.input.serviceSalesSnapshot ?? []) {
        if (!scopedServiceIds.has(sale.serviceId)) {
          continue;
        }
        const service = serviceById.get(sale.serviceId);
        if (!service) {
          continue;
        }
        const saleValue = sale.unitsSold * servicePriceForObservation(service, observation);
        const saleCost = sale.unitsSold * costPerServiceUnit(sale.serviceId, catalog, linkedSkusByServiceId);
        const current = serviceSales.get(sale.serviceId) ?? { costConsumed: 0, netSales: 0, units: 0 };
        current.costConsumed += saleCost;
        current.netSales += saleValue;
        current.units += sale.unitsSold;
        serviceSales.set(sale.serviceId, current);
        netSales += saleValue;
        costConsumed += saleCost;
      }
    }
  }

  return {
    costConsumed,
    grossProfit: netSales - costConsumed,
    netSales,
    serviceSales,
    skuSales,
  };
}

function deriveWindowTotals({
  catalog,
  observations,
  orderBatches,
  scope,
  serviceDetailsById,
  skuDetailsById,
  workspaceSummary,
}: {
  catalog: SenaCatalog;
  observations: SenaObservationRecord[];
  orderBatches: SenaOrderBatchRecord[];
  scope: FinancialsScope;
  serviceDetailsById: Record<string, SenaServiceDetail | null>;
  skuDetailsById: Record<string, SenaSkuDetail | null>;
  workspaceSummary: SenaWorkspaceSummary | null;
}): FinancialTotals {
  const { linkedSkusByServiceId, scopedServiceIds, scopedSkuIds, scopedSkus, serviceById, skuById } = scopeEntitySets(catalog, scope);
  const sales = deriveWindowSales({ catalog, observations, scope });
  const customerSkuSnapshots = buildSkuCommercialSnapshots({ observations, rangeDays: 3650 });
  const customerServiceSnapshots = buildServiceCommercialSnapshots({ catalog, observations, rangeDays: 3650 });
  const skuSummaryById = new Map(workspaceSummary?.skuSummaries.map((summary) => [summary.skuId, summary]) ?? []);
  const orderCommitments = openCommitmentRows(orderBatches, skuById, scopedSkuIds);

  let onHandStockValue = 0;
  let inTransitCapital = 0;
  let slowStockValue = 0;
  for (const sku of scopedSkus) {
    const summary = skuSummaryById.get(sku.skuId);
    const unitsOnHand = Math.max(0, summary?.latestPosteriorUnits ?? 0);
    const stockValue = unitsOnHand * sku.costPerUnit;
    onHandStockValue += stockValue;
    inTransitCapital += currentInTransitUnits(skuDetailsById[sku.skuId]) * sku.costPerUnit;
    if ((summary?.demandPerDayMean ?? 0) <= 0.2 || (summary?.daysOfCover ?? 0) >= 45) {
      slowStockValue += stockValue;
    }
  }

  let costIncreases = 0;
  let markdownPressure = 0;
  let negativeCorrections = 0;

  for (const observation of observations) {
    for (const snapshot of observation.input.stockSnapshot) {
      if (!scopedSkuIds.has(snapshot.skuId) || snapshot.costPerUnit == null) {
        continue;
      }
      const sku = skuById.get(snapshot.skuId);
      if (!sku) {
        continue;
      }
      costIncreases += Math.max(0, snapshot.costPerUnit - sku.costPerUnit) * Math.max(0, snapshot.unitsInStock);
    }

    for (const price of observation.input.retailPrices) {
      if (!scopedSkuIds.has(price.skuId)) {
        continue;
      }
      const sku = skuById.get(price.skuId);
      const baseline = sku?.productPrice ?? price.price;
      const units = sales.skuSales.get(price.skuId)?.units ?? 1;
      markdownPressure += Math.max(0, baseline - price.price) * Math.max(1, units);
    }

    for (const price of observation.input.servicePrices) {
      if (!scopedServiceIds.has(price.serviceId)) {
        continue;
      }
      const service = serviceById.get(price.serviceId);
      const baseline = service?.price ?? price.price;
      const units = sales.serviceSales.get(price.serviceId)?.units ?? 1;
      markdownPressure += Math.max(0, baseline - price.price) * Math.max(1, units);
    }

    for (const adjustment of observation.input.adjustmentSignals ?? []) {
      if (!scopedSkuIds.has(adjustment.skuId) || adjustment.quantityDelta >= 0) {
        continue;
      }
      const sku = skuById.get(adjustment.skuId);
      negativeCorrections += Math.abs(adjustment.quantityDelta) * (sku?.costPerUnit ?? 0);
    }
  }

  let blockedMargin = 0;
  let refundValue = 0;
  for (const sku of scopedSkus) {
    const commercial = customerSkuSnapshots.get(sku.skuId);
    if (!commercial) {
      continue;
    }
    blockedMargin += commercial.blockedPendingQuantity * Math.max(0, sku.productPrice ?? 0);
    refundValue += commercial.reversalWindowQuantity * Math.max(0, sku.productPrice ?? 0);
  }
  if (scope !== 'skus') {
    for (const service of catalog.services) {
      if (!scopedServiceIds.has(service.serviceId)) {
        continue;
      }
      const linkedSkus = linkedSkusByServiceId.get(service.serviceId) ?? [];
      const sellableUnits = linkedSkus.reduce<number | null>((minimum, sku) => {
        const units = skuSummaryById.get(sku.skuId)?.latestPosteriorUnits ?? 0;
        return minimum == null ? units : Math.min(minimum, units);
      }, null) ?? 0;
      const activityMean = serviceDetailsById[service.serviceId]?.activityMean ?? sales.serviceSales.get(service.serviceId)?.units ?? 0;
      const serviceGrossProfit = Math.max(0, service.price - costPerServiceUnit(service.serviceId, catalog, linkedSkusByServiceId));
      blockedMargin += Math.max(0, activityMean - sellableUnits) * serviceGrossProfit;
      const commercial = customerServiceSnapshots.get(service.serviceId);
      if (commercial) {
        blockedMargin += commercial.blockedPendingQuantity * serviceGrossProfit;
        refundValue += commercial.reversalWindowQuantity * Math.max(0, service.price);
      }
    }
  }

  const openCommitments = orderCommitments.reduce((sum, row) => sum + row.value, 0);
  const marginErosion = costIncreases + markdownPressure + negativeCorrections + blockedMargin + refundValue;

  return {
    blockedMargin,
    costConsumed: sales.costConsumed,
    costIncreases,
    grossProfit: sales.grossProfit - refundValue,
    inventoryCapital: onHandStockValue,
    inTransitCapital,
    marginErosion,
    markdownPressure,
    negativeCorrections,
    netSales: sales.netSales - refundValue,
    onHandStockValue,
    openCommitments,
    slowStockValue,
  };
}

function deriveEntityRows({
  catalog,
  observations,
  scope,
  serviceDetailsById,
  skuDetailsById,
  workspaceSummary,
}: {
  catalog: SenaCatalog;
  observations: SenaObservationRecord[];
  scope: FinancialsScope;
  serviceDetailsById: Record<string, SenaServiceDetail | null>;
  skuDetailsById: Record<string, SenaSkuDetail | null>;
  workspaceSummary: SenaWorkspaceSummary | null;
}) {
  const entitySets = scopeEntitySets(catalog, scope);
  const { linkedSkusByServiceId, linkedServicesBySkuId, scopedServiceIds, scopedSkuIds, scopedSkus } = entitySets;
  const sales = deriveWindowSales({ catalog, observations, scope });
  const customerSkuSnapshots = buildSkuCommercialSnapshots({ observations, rangeDays: 3650 });
  const customerServiceSnapshots = buildServiceCommercialSnapshots({ catalog, observations, rangeDays: 3650 });
  const skuSummaryById = new Map(workspaceSummary?.skuSummaries.map((summary) => [summary.skuId, summary]) ?? []);

  const skuRows: SkuFinancialRow[] = scopedSkus
    .filter((sku) => scope !== 'services' || (linkedServicesBySkuId.get(sku.skuId)?.length ?? 0) > 0)
    .map((sku) => {
      const summary = skuSummaryById.get(sku.skuId);
      const skuSale = sales.skuSales.get(sku.skuId) ?? { costConsumed: 0, netSales: 0, units: 0 };
      const commercial = customerSkuSnapshots.get(sku.skuId);
      const unitsOnHand = Math.max(0, summary?.latestPosteriorUnits ?? 0);
      const capitalTied = (unitsOnHand + currentInTransitUnits(skuDetailsById[sku.skuId])) * sku.costPerUnit;
      const marginRatio = skuSale.netSales > 0 ? (skuSale.netSales - skuSale.costConsumed) / skuSale.netSales : sku.productPrice ? (sku.productPrice - sku.costPerUnit) / sku.productPrice : null;
      return {
        blockedDemandValue: (commercial?.blockedPendingQuantity ?? 0) * Math.max(0, sku.productPrice ?? 0),
        capitalTied,
        costConsumed: skuSale.costConsumed,
        refundValue: (commercial?.reversalWindowQuantity ?? 0) * Math.max(0, sku.productPrice ?? 0),
        grossProfit: skuSale.netSales - skuSale.costConsumed,
        href: `/catalog/skus/${sku.skuId}`,
        id: sku.skuId,
        imagePath: sku.imagePath?.trim() || null,
        linkedServiceCount: linkedServicesBySkuId.get(sku.skuId)?.length ?? 0,
        marginRatio,
        name: sku.name,
        netSales: skuSale.netSales,
        salesUnits: skuSale.units,
        slowCapital: ((summary?.demandPerDayMean ?? 0) <= 0.2 || (summary?.daysOfCover ?? 0) >= 45) ? capitalTied : 0,
        supplierName: sku.supplierName?.trim() || null,
        type: 'sku',
        unitsOnHand,
      };
    });

  const serviceRows: ServiceFinancialRow[] = scope === 'skus'
    ? []
    : catalog.services
        .filter((service) => scopedServiceIds.has(service.serviceId))
        .map((service) => {
          const linkedSkus = linkedSkusByServiceId.get(service.serviceId) ?? [];
          const serviceSale = sales.serviceSales.get(service.serviceId) ?? { costConsumed: 0, netSales: 0, units: 0 };
          const commercial = customerServiceSnapshots.get(service.serviceId);
          const supportCapital = linkedSkus.reduce((sum, sku) => {
            const summary = skuSummaryById.get(sku.skuId);
            return sum + (summary?.latestPosteriorUnits ?? 0) * sku.costPerUnit;
          }, 0);
          const sellableUnits = linkedSkus.reduce<number | null>((minimum, sku) => {
            const units = skuSummaryById.get(sku.skuId)?.latestPosteriorUnits ?? 0;
            return minimum == null ? units : Math.min(minimum, units);
          }, null) ?? 0;
          const activityMean = serviceDetailsById[service.serviceId]?.activityMean ?? serviceSale.units;
          const coverageRatio = activityMean > 0 ? Math.min(1, sellableUnits / activityMean) : 1;
          const fallbackGrossProfit = Math.max(0, service.price - costPerServiceUnit(service.serviceId, catalog, linkedSkusByServiceId));
          const grossProfit = serviceSale.netSales > 0 ? serviceSale.netSales - serviceSale.costConsumed : fallbackGrossProfit * Math.max(1, activityMean);
          const marginRatio = serviceSale.netSales > 0 ? grossProfit / serviceSale.netSales : service.price > 0 ? fallbackGrossProfit / service.price : 0;
          return {
            blockedDemandValue: (commercial?.blockedPendingQuantity ?? 0) * Math.max(0, service.price - costPerServiceUnit(service.serviceId, catalog, linkedSkusByServiceId)),
            capitalTied: supportCapital,
            coverageRatio,
            refundValue: (commercial?.reversalWindowQuantity ?? 0) * Math.max(0, service.price),
            grossProfit,
            href: `/catalog/services/${service.serviceId}`,
            id: service.serviceId,
            imagePath: service.imagePath?.trim() || null,
            linkedSkuCount: linkedSkus.length,
            marginRatio,
            name: service.name,
            netSales: serviceSale.netSales,
            serviceUnits: serviceSale.units,
            type: 'service',
          };
        });

  return [...serviceRows, ...skuRows] satisfies FinancialEntityRow[];
}

function turnQuality(row: FinancialEntityRow, language: AppLanguage) {
  const turnRatio = safeRatio(Math.max(0, row.grossProfit), Math.max(0, row.capitalTied));
  if (row.type === 'service' && row.coverageRatio < 0.45) {
    return literal(language, 'Heavy');
  }
  if (row.netSales <= 0 && row.capitalTied > 0) {
    return literal(language, 'Dormant');
  }
  if (turnRatio >= 0.45) {
    return literal(language, 'Efficient');
  }
  if (turnRatio >= 0.22) {
    return literal(language, 'Healthy');
  }
  if (turnRatio >= 0.08) {
    return literal(language, 'Heavy');
  }
  return literal(language, 'Slow');
}

function statusForFinancialRow(row: FinancialEntityRow, language: AppLanguage): { label: string; tone: StatusPillTone } {
  const marginRatio = row.marginRatio ?? 0;
  const turnRatio = safeRatio(Math.max(0, row.grossProfit), Math.max(0, row.capitalTied));
  if (row.netSales <= 0 && row.capitalTied > 0) {
    return { label: literal(language, 'Dormant stock'), tone: 'neutral' };
  }
  if (row.blockedDemandValue > 0 || (row.type === 'service' && row.coverageRatio < 0.75 && row.grossProfit > 0)) {
    return { label: literal(language, 'Blocked earner'), tone: 'danger' };
  }
  if (marginRatio > 0 && marginRatio < 0.28) {
    return { label: literal(language, 'Margin thin'), tone: 'warning' };
  }
  if (row.capitalTied > 0 && turnRatio < 0.08) {
    return { label: literal(language, 'Capital heavy'), tone: 'warning' };
  }
  return { label: literal(language, 'Efficient earner'), tone: 'success' };
}

function contributorSummary(row: FinancialEntityRow, language: AppLanguage) {
  if (row.blockedDemandValue > 0) {
    return literal(language, '{value} blocked by open customer orders', {
      value: formatWholeNumber(Math.round(row.blockedDemandValue), language),
    });
  }
  if (row.refundValue > 0) {
    return literal(language, '{value} reversed by refunds or corrections', {
      value: formatWholeNumber(Math.round(row.refundValue), language),
    });
  }
  if (row.type === 'service') {
    return literal(language, '{count} linked SKUs · {units} service sales in window', {
      count: row.linkedSkuCount,
      units: formatWholeNumber(row.serviceUnits, language),
    });
  }

  return literal(language, '{units} sold · {count} linked services', {
    count: row.linkedServiceCount,
    units: formatWholeNumber(row.salesUnits, language),
  });
}

function deriveCoverage({
  catalog,
  diagnostics,
  language,
  observations,
  workspaceSummary,
}: {
  catalog: SenaCatalog;
  diagnostics: SenaDiagnostics | null;
  language: AppLanguage;
  observations: SenaObservationRecord[];
  workspaceSummary: SenaWorkspaceSummary | null;
}): FinancialsCoverageModel {
  const observedAt = lastUpdatedAt(workspaceSummary, observations);
  const costCoverageRatio = safeRatio(catalog.skus.filter((sku) => sku.costPerUnit > 0).length, catalog.skus.length);
  const priceCoverageRatio = safeRatio(
    catalog.skus.filter((sku) => sku.soldAsProduct && (sku.productPrice ?? 0) > 0).length + catalog.services.filter((service) => service.price > 0).length,
    catalog.skus.filter((sku) => sku.soldAsProduct).length + catalog.services.length,
  );
  const labelForRatio = (ratio: number) =>
    ratio >= 0.85 ? literal(language, 'strong') : ratio >= 0.65 ? literal(language, 'mixed') : literal(language, 'thin');
  const weakSpotLabel =
    costCoverageRatio < priceCoverageRatio
      ? literal(language, 'cost support needs attention')
      : priceCoverageRatio < 0.85
        ? literal(language, 'price support needs attention')
        : (diagnostics?.coverageEstimate ?? 0) < 0.7
          ? literal(language, 'observation coverage is still sparse')
          : literal(language, 'coverage is usable for a money view');

  return {
    costCoverageLabel: literal(language, 'cost coverage {value}', { value: labelForRatio(costCoverageRatio) }),
    freshnessLabel: observedAt
      ? literal(language, 'last update {date}', { date: formatSenaDate(observedAt, language) })
      : literal(language, 'no live update yet'),
    priceCoverageLabel: literal(language, 'price coverage {value}', { value: labelForRatio(priceCoverageRatio) }),
    weakSpotLabel,
  };
}

export function deriveFinancialsViewModel({
  catalog,
  compareMode,
  currency,
  usdToKhrExchangeRate = DEFAULT_USD_TO_KHR_EXCHANGE_RATE,
  diagnostics,
  language,
  observations,
  orderBatches,
  scope,
  serviceDetailsById,
  skuDetailsById,
  range,
  workspaceSummary,
  customRange,
}: {
  catalog: SenaCatalog;
  compareMode: boolean;
  currency: AppCurrency;
  usdToKhrExchangeRate?: number;
  diagnostics: SenaDiagnostics | null;
  language: AppLanguage;
  observations: SenaObservationRecord[];
  orderBatches: SenaOrderBatchRecord[];
  scope: FinancialsScope;
  serviceDetailsById: Record<string, SenaServiceDetail | null>;
  skuDetailsById: Record<string, SenaSkuDetail | null>;
  range: FinancialsRange;
  workspaceSummary: SenaWorkspaceSummary | null;
  customRange: { startAt: string; endAt: string } | null;
}): FinancialsViewModel {
  const observedAt = lastUpdatedAt(workspaceSummary, observations);
  let rangeDays: number;
  let activeWindowEndAt: string;

  if (range === 'custom' && customRange) {
    rangeDays = daysBetween(customRange.startAt, customRange.endAt);
    activeWindowEndAt = customRange.endAt;
  } else {
    rangeDays = daysForRange(range);
    activeWindowEndAt = observedAt ?? new Date().toISOString();
  }

  const activeWindowLabel = windowLabel(range, language, customRange);
  const priorWindowLabel = range === 'custom' && customRange
    ? literal(language, 'prior custom period')
    : literal(language, 'prior {days}d', { days: rangeDays });
  const recentObservations = filterObservationsForWindow({ observations, endAt: activeWindowEndAt, windowDays: rangeDays });
  const previousObservations = filterObservationsForWindow({
    observations,
    endAt: activeWindowEndAt,
    offsetDays: rangeDays,
    windowDays: rangeDays,
  });
  const previousSnapshotAt = observedAt
    ? new Date(new Date(observedAt).getTime() - rangeDays * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const previousStockSnapshot = latestObservationWithStockBefore(observations, previousSnapshotAt);
  const currentTotals = deriveWindowTotals({
    catalog,
    observations: recentObservations,
    orderBatches,
    scope,
    serviceDetailsById,
    skuDetailsById,
    workspaceSummary,
  });
  const previousWindowTotals = deriveWindowTotals({
    catalog,
    observations: previousObservations,
    orderBatches: [],
    scope,
    serviceDetailsById: {},
    skuDetailsById: {},
    workspaceSummary: null,
  });
  const entitySets = scopeEntitySets(catalog, scope);
  const previousInventoryCapital =
    previousStockSnapshot?.input.stockSnapshot.reduce((sum, snapshot) => {
      if (!entitySets.scopedSkuIds.has(snapshot.skuId)) {
        return sum;
      }
      const sku = entitySets.skuById.get(snapshot.skuId);
      return sum + Math.max(0, snapshot.unitsInStock) * (snapshot.costPerUnit ?? sku?.costPerUnit ?? 0);
    }, 0) ?? 0;
  const previousOrderCommitmentValue = previousObservations.reduce((sum, observation) => {
    return sum + observation.input.orderSignals.reduce((signalSum, signal) => {
      if (!signal.orderPlaced || !entitySets.scopedSkuIds.has(signal.skuId)) {
        return signalSum;
      }
      const sku = entitySets.skuById.get(signal.skuId);
      return signalSum + (signal.approximateOrderQuantity ?? 0) * (sku?.costPerUnit ?? 0);
    }, 0);
  }, 0);
  const contributorRows = deriveEntityRows({
    catalog,
    observations: recentObservations,
    scope,
    serviceDetailsById,
    skuDetailsById,
    workspaceSummary,
  });
  const economicContributors = sortByValueThenLabel(contributorRows, (row) => Math.max(row.grossProfit, row.netSales * 0.4)).slice(0, 8);
  const contributors: EconomicContributorRow[] = economicContributors.map((row) => {
    const status = statusForFinancialRow(row, language);
    return {
      capitalTiedLabel: formatMoney(row.capitalTied, currency, language, usdToKhrExchangeRate),
      entityType: row.type,
      grossProfitLabel: formatMoney(row.grossProfit, currency, language, usdToKhrExchangeRate),
      href: row.href,
      id: row.id,
      imagePath: row.imagePath,
      label: row.name,
      netSalesLabel: formatMoney(row.netSales, currency, language, usdToKhrExchangeRate),
      statusLabel: status.label,
      statusTone: status.tone,
      summary: contributorSummary(row, language),
      supplierName: row.type === 'sku' ? row.supplierName : null,
      turnQualityLabel: turnQuality(row, language),
    };
  });

  const bandEntries = contributorRows.map((row) => {
    const status = statusForFinancialRow(row, language);
    return {
      id: row.id,
      entityType: row.type,
      label: row.name,
      imagePath: row.imagePath,
      href: row.href,
      summary:
        status.label === literal(language, 'Dormant stock')
          ? literal(language, '{value} tied up without window sales', {
              value: formatMoney(row.capitalTied, currency, language, usdToKhrExchangeRate),
            })
          : literal(language, '{profit} gross profit · {capital} capital tied', {
              capital: formatMoney(row.capitalTied, currency, language, usdToKhrExchangeRate),
              profit: formatMoney(row.grossProfit, currency, language, usdToKhrExchangeRate),
            }),
      tone: status.tone,
      statusLabel: status.label,
    };
  });

  const earners = sortByValueThenLabel(
    bandEntries.filter((row) => row.statusLabel === literal(language, 'Efficient earner')),
    (row) => contributorRows.find((contributor) => contributor.id === row.id)?.grossProfit ?? 0,
  ).slice(0, 3);
  const capitalTraps = sortByValueThenLabel(
    bandEntries.filter((row) => row.statusLabel === literal(language, 'Capital heavy') || row.statusLabel === literal(language, 'Dormant stock')),
    (row) => contributorRows.find((contributor) => contributor.id === row.id)?.capitalTied ?? 0,
  ).slice(0, 3);
  const marginLeaks = sortByValueThenLabel(
    bandEntries.filter((row) => row.statusLabel === literal(language, 'Margin thin') || row.statusLabel === literal(language, 'Blocked earner')),
    (row) => contributorRows.find((contributor) => contributor.id === row.id)?.grossProfit ?? 0,
  ).slice(0, 3);

  const commitmentRows = openCommitmentRows(orderBatches, entitySets.skuById, entitySets.scopedSkuIds);
  const commitmentsDue = sortByValueThenLabel(commitmentRows, (row) => row.value).slice(0, 4).map((row) => ({
    detail: row.expectedArrivalAt
      ? literal(language, 'expected {date} · {count} units open', {
          count: formatWholeNumber(row.remainingQuantity, language),
          date: formatSenaDate(row.expectedArrivalAt, language),
        })
      : literal(language, '{count} units open · receipt timing pending', {
          count: formatWholeNumber(row.remainingQuantity, language),
        }),
    href: row.href,
    id: row.id,
    label: row.sku?.name ?? row.id,
    valueLabel: formatMoney(row.value, currency, language, usdToKhrExchangeRate),
    valueTone: 'warning',
  }));

  if (commitmentsDue.length === 0) {
    const pipelineFallback = sortByValueThenLabel(entitySets.scopedSkus.map((sku) => ({
      href: `${RECORD_UPDATE_SUPPLIER_PENDING_PATH}?skus=${encodeURIComponent(sku.skuId)}`,
      id: `pipeline-${sku.skuId}`,
      label: sku.name,
      units: currentInTransitUnits(skuDetailsById[sku.skuId]),
      value: currentInTransitUnits(skuDetailsById[sku.skuId]) * sku.costPerUnit,
    })).filter((row) => row.units > 0), (row) => row.value).slice(0, 3);
    commitmentsDue.push(...pipelineFallback.map((row) => ({
      detail: literal(language, '{count} units inferred in transit', { count: formatWholeNumber(row.units, language) }),
      href: row.href,
      id: row.id,
      label: row.label,
      valueLabel: formatMoney(row.value, currency, language, usdToKhrExchangeRate),
      valueTone: 'info',
    })));
  }

  const largestCapitalPositions = sortByValueThenLabel(entitySets.scopedSkus.map((sku) => {
    const summary = workspaceSummary?.skuSummaries.find((entry) => entry.skuId === sku.skuId) ?? null;
    const value = (summary?.latestPosteriorUnits ?? 0) * sku.costPerUnit;
    const linkedCount = entitySets.linkedServicesBySkuId.get(sku.skuId)?.length ?? 0;
    return {
      detail: linkedCount > 0
        ? literal(language, 'supports {count} services', { count: linkedCount })
        : literal(language, 'retail-only capital'),
      href: `/catalog/skus/${sku.skuId}`,
      id: sku.skuId,
      label: sku.name,
      value,
      valueLabel: formatMoney(value, currency, language, usdToKhrExchangeRate),
      valueTone: linkedCount > 0 ? 'info' : 'neutral',
    };
  }).filter((row) => row.value > 0), (row) => row.value).slice(0, 4);

  const recentMarginShifts = sortByValueThenLabel(latestPriceShiftRows({
    observations: recentObservations,
    scopedServiceIds: entitySets.scopedServiceIds,
    scopedSkuIds: entitySets.scopedSkuIds,
    serviceById: entitySets.serviceById,
    skuById: entitySets.skuById,
    currency,
    language,
    usdToKhrExchangeRate,
  }), (row) => row.impact).slice(0, 4).map((row) => ({
    detail: `${row.detail} · ${formatSenaDate(row.at, language)}`,
    href: row.href,
    id: row.id,
    label: row.label,
  }));

  const coverage = deriveCoverage({ catalog, diagnostics, language, observations, workspaceSummary });
  const scopeLabel =
    scope === 'services'
      ? literal(language, 'service-linked economics')
      : scope === 'skus'
        ? literal(language, 'retail SKU economics')
        : literal(language, 'mixed stock-linked economics');

  const compare = (
    current: number,
    previous: number,
    polarity: 'higher-good' | 'lower-good' | 'neutral' = 'higher-good',
  ) => compareMode ? signedMoneyDelta(current - previous, currency, language, usdToKhrExchangeRate, polarity) : undefined;
  const netSalesCompare = compare(currentTotals.netSales, previousWindowTotals.netSales, 'higher-good');
  const grossProfitCompare = compare(currentTotals.grossProfit, previousWindowTotals.grossProfit, 'higher-good');
  const inventoryCapitalCompare = compareMode && previousInventoryCapital > 0
    ? signedMoneyDelta(currentTotals.inventoryCapital - previousInventoryCapital, currency, language, usdToKhrExchangeRate, 'lower-good')
    : undefined;
  const openCommitmentsCompare = compareMode && previousOrderCommitmentValue > 0
    ? signedMoneyDelta(currentTotals.openCommitments - previousOrderCommitmentValue, currency, language, usdToKhrExchangeRate, 'lower-good')
    : undefined;
  const marginErosionCompare = compare(currentTotals.marginErosion, previousWindowTotals.marginErosion, 'lower-good');
  const costConsumedCompare = compare(currentTotals.costConsumed, previousWindowTotals.costConsumed, 'lower-good');

  const ribbon: FinancialsRibbonMetric[] = [
    {
      key: 'netSales',
      label: literal(language, 'Net sales'),
      value: formatMoney(currentTotals.netSales, currency, language, usdToKhrExchangeRate),
      detail: literal(language, 'realized stock-linked sales in window'),
      compareLabel: netSalesCompare?.label,
      compareTone: netSalesCompare?.tone,
      tone: moneyTone(currentTotals.netSales, 'higher-good'),
    },
    {
      key: 'grossProfit',
      label: literal(language, 'Gross profit'),
      value: formatMoney(currentTotals.grossProfit, currency, language, usdToKhrExchangeRate),
      detail: literal(language, 'after known or inferred stock-linked cost'),
      compareLabel: grossProfitCompare?.label,
      compareTone: grossProfitCompare?.tone,
      tone: moneyTone(currentTotals.grossProfit, 'higher-good'),
    },
    {
      key: 'inventoryCapital',
      label: literal(language, 'Inventory capital'),
      value: formatMoney(currentTotals.inventoryCapital, currency, language, usdToKhrExchangeRate),
      detail: literal(language, 'value currently sitting in stock'),
      compareLabel: inventoryCapitalCompare?.label,
      compareTone: inventoryCapitalCompare?.tone,
      tone: currentTotals.slowStockValue > currentTotals.inventoryCapital * 0.35 ? 'warning' : 'info',
    },
    {
      key: 'openCommitments',
      label: literal(language, 'Open commitments'),
      value: formatMoney(currentTotals.openCommitments, currency, language, usdToKhrExchangeRate),
      detail: literal(language, 'ordered value not yet received'),
      compareLabel: openCommitmentsCompare?.label,
      compareTone: openCommitmentsCompare?.tone,
      tone: currentTotals.openCommitments > 0 ? 'warning' : 'neutral',
    },
    {
      key: 'marginErosion',
      label: literal(language, 'Margin erosion'),
      value: formatMoney(currentTotals.marginErosion, currency, language, usdToKhrExchangeRate),
      detail: literal(language, 'cost creep, markdowns, and negative adjustments'),
      compareLabel: marginErosionCompare?.label,
      compareTone: marginErosionCompare?.tone,
      tone: currentTotals.marginErosion > 0 ? 'danger' : 'success',
    },
  ];

  return {
    capitalTraps,
    commitmentsDue,
    contributors,
    coverage,
    earners,
    largestCapitalPositions,
    marginLeaks,
    previousWindowLabel: priorWindowLabel,
    recentMarginShifts,
    ribbon,
    statement: [
      {
        id: 'money-in',
        title: literal(language, 'Money in'),
        descriptor: literal(language, 'Sales minus the stock-linked cost consumed in the selected window.'),
        rows: [
          {
            key: 'net-sales',
            label: literal(language, 'Net sales'),
            value: formatMoney(currentTotals.netSales, currency, language, usdToKhrExchangeRate),
            compareLabel: netSalesCompare?.label,
            compareTone: netSalesCompare?.tone,
            tone: moneyTone(currentTotals.netSales, 'higher-good'),
          },
          {
            key: 'cost-consumed',
            label: literal(language, 'Cost consumed'),
            value: formatMoney(currentTotals.costConsumed, currency, language, usdToKhrExchangeRate),
            detail: literal(language, 'known or inferred stock cost attached to sales'),
            compareLabel: costConsumedCompare?.label,
            compareTone: costConsumedCompare?.tone,
            tone: currentTotals.costConsumed > 0 ? 'warning' : 'neutral',
          },
          {
            key: 'gross-profit',
            label: literal(language, 'Gross profit'),
            value: formatMoney(currentTotals.grossProfit, currency, language, usdToKhrExchangeRate),
            compareLabel: grossProfitCompare?.label,
            compareTone: grossProfitCompare?.tone,
            tone: moneyTone(currentTotals.grossProfit, 'higher-good'),
          },
        ],
        summaryDetail: compareMode
          ? literal(language, 'compared with {window}', { window: priorWindowLabel })
          : literal(language, 'current window only'),
        summaryValue: formatMoney(currentTotals.grossProfit, currency, language, usdToKhrExchangeRate),
        tone: moneyTone(currentTotals.grossProfit, 'higher-good'),
      },
      {
        id: 'money-tied-up',
        title: literal(language, 'Money tied up'),
        descriptor: literal(language, 'Capital currently sitting in stock, in transit, or supplier commitments.'),
        rows: [
          {
            key: 'on-hand',
            label: literal(language, 'On-hand stock value'),
            value: formatMoney(currentTotals.onHandStockValue, currency, language, usdToKhrExchangeRate),
            compareLabel: inventoryCapitalCompare?.label,
            compareTone: inventoryCapitalCompare?.tone,
            tone: currentTotals.slowStockValue > currentTotals.inventoryCapital * 0.35 ? 'warning' : 'info',
          },
          {
            key: 'in-transit',
            label: literal(language, 'In-transit stock value'),
            value: formatMoney(currentTotals.inTransitCapital, currency, language, usdToKhrExchangeRate),
            tone: currentTotals.inTransitCapital > 0 ? 'info' : 'neutral',
          },
          {
            key: 'open-orders',
            label: literal(language, 'Open order commitments'),
            value: formatMoney(currentTotals.openCommitments, currency, language, usdToKhrExchangeRate),
            compareLabel: openCommitmentsCompare?.label,
            compareTone: openCommitmentsCompare?.tone,
            tone: currentTotals.openCommitments > 0 ? 'warning' : 'neutral',
          },
          {
            key: 'slow-stock',
            label: literal(language, 'Slow-stock value'),
            value: formatMoney(currentTotals.slowStockValue, currency, language, usdToKhrExchangeRate),
            detail: literal(language, 'stock with weak or dormant turn signals'),
            tone: currentTotals.slowStockValue > 0 ? 'warning' : 'success',
          },
        ],
        summaryDetail: literal(language, 'on hand, incoming, and committed stock value'),
        summaryValue: formatMoney(
          currentTotals.onHandStockValue + currentTotals.inTransitCapital + currentTotals.openCommitments,
          currency,
          language,
          usdToKhrExchangeRate,
        ),
        tone: currentTotals.slowStockValue > currentTotals.inventoryCapital * 0.35 || currentTotals.openCommitments > currentTotals.inventoryCapital
          ? 'warning'
          : 'info',
      },
      {
        id: 'money-leaking',
        title: literal(language, 'Money leaking'),
        descriptor: literal(language, 'Erosion from cost moves, markdown pressure, corrections, and blocked margin.'),
        rows: [
          {
            key: 'cost-increases',
            label: literal(language, 'Cost increases'),
            value: formatMoney(currentTotals.costIncreases, currency, language, usdToKhrExchangeRate),
            tone: currentTotals.costIncreases > 0 ? 'warning' : 'success',
          },
          {
            key: 'markdown-pressure',
            label: literal(language, 'Markdown pressure'),
            value: formatMoney(currentTotals.markdownPressure, currency, language, usdToKhrExchangeRate),
            tone: currentTotals.markdownPressure > 0 ? 'warning' : 'success',
          },
          {
            key: 'negative-corrections',
            label: literal(language, 'Negative corrections / shrinkage'),
            value: formatMoney(currentTotals.negativeCorrections, currency, language, usdToKhrExchangeRate),
            tone: currentTotals.negativeCorrections > 0 ? 'danger' : 'success',
          },
          {
            key: 'blocked-margin',
            label: literal(language, 'Blocked margin'),
            value: formatMoney(currentTotals.blockedMargin, currency, language, usdToKhrExchangeRate),
            tone: currentTotals.blockedMargin > 0 ? 'danger' : 'success',
          },
        ],
        summaryDetail: literal(language, 'cost creep, markdowns, corrections, and blocked margin'),
        summaryValue: formatMoney(currentTotals.marginErosion, currency, language, usdToKhrExchangeRate),
        tone: currentTotals.marginErosion > 0 ? 'danger' : 'success',
      },
    ],
    titleMeta: [
      coverage.freshnessLabel,
      coverage.costCoverageLabel,
      coverage.priceCoverageLabel,
      scopeLabel,
      compareMode
        ? literal(language, 'showing {current} vs {previous}', {
            current: activeWindowLabel,
            previous: priorWindowLabel,
          })
        : literal(language, 'showing {current} only', { current: activeWindowLabel }),
    ],
    windowLabel: activeWindowLabel,
  };
}
