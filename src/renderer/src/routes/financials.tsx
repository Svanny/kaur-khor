import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { CustomTimeframeDialog } from '@/components/system/custom-timeframe-dialog';
import { dateInputValueFromIsoString, isoStringFromDateInput, daysBetween, shiftDateByDays } from '@/lib/date-input-utils';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { ActionEyeIcon, ActionOpenExternalIcon } from '@icons/actions';
import {
  EntityComparisonIcon,
  EntityLayersIcon,
  EntityReceiptDocumentIcon,
  EntityRevenueIcon,
  EntityServiceIcon,
  EntitySkuIcon,
  EntityTransitIcon,
} from '@icons/entities';
import { NavigationDashboardIcon, NavigationTaskListIcon } from '@icons/navigation';
import {
  StatusAchievementIcon,
  StatusAwaitingReceiptIcon,
  StatusCorrectionIcon,
  StatusDeltaTriangleIcon,
  StatusPromoIcon,
  StatusSavingsIcon,
  StatusScheduleIcon,
  StatusTimingIcon,
  StatusWarningIcon,
} from '@icons/status';
import { CreateFirstSkuButton } from '@/components/system/create-first-sku-button';
import { compactActionButtonClassName, compactFilterControlClassName } from '@/components/system/compact-controls';
import {
  createHeaderedTableLayout,
  HeaderedTable,
  HeaderedTableBody,
  HeaderedTableCellStack,
  HeaderedTableHeader,
  HeaderedTableHeaderCell,
  HeaderedTableMobileLabel,
  HeaderedTableRow,
} from '@/components/system/headered-table';
import { ItemIdentityBlock } from '@/components/system/item-identity';
import { RIGHT_RAIL_ASIDE_CLASS_NAME, rightRailLayoutClassName } from '@/components/system/right-rail-layout';
import { SupplierBadge, SupplierFilter, supplierFilterQueryValue, supplierFilterValueForQuery } from '@/components/system/supplier';
import { RouteBackButton } from '@/components/system/page-navigation';
import { WorkspaceActionRow, WorkspaceEmpty, WorkspacePage, WorkspaceTitleCard } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { formatCurrency } from '@/lib/format';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { buildFinancialsSearchParams, readFinancialsRouteState } from '@/lib/navigation-state';
import { useBenchmarkRouteReady } from '@/lib/benchmark-route-ready';
import { activeSenaCatalog, filterCatalogBySupplier, type SupplierFilterValue } from '@/lib/sena-catalog';
import { statusPillClassName, tintedSurfaceClassName, type StatusPillTone } from '@/lib/state-tones';
import { cn } from '@/lib/utils';
import { translateUiLiteral } from '@/lib/translations';
import { SectionLabel } from '@/routes/sku-detail/section-heading';
import { MetricRibbon } from '@/components/system/metric-ribbon';
import { useOptionalAutomation } from '@/state/automation';
import { useInventory } from '@/state/inventory';
import { buildBanjiNavigationState } from '@/state/navigation-history';
import { usePreferences } from '@/state/preferences';
import { WireframeRailCards, WireframeRows, WorkspaceTitleCardWireframe } from './loading-wireframes';
import { PerformanceRightRailBlock, PerformanceSectionShell, PERFORMANCE_HEADER_SURFACE_CLASS_NAME } from './performance/chrome';
import { useSenaDetailHydration } from './performance/use-sena-detail-hydration';
import {
  deriveFinancialsViewModel,
  type EconomicContributorRow,
  type FinancialBandEntry,
  type FinancialRailRow,
  type FinancialsRange,
  type FinancialsScope,
  type FinancialStatementBlock,
} from './financials/view-model';

const contributorsTableLayout = createHeaderedTableLayout({
  breakpoint: 'xl',
  columns: 'minmax(14rem,1.1fr) minmax(9rem,0.7fr) minmax(9rem,0.7fr) minmax(10rem,0.8fr) minmax(9rem,0.68fr) minmax(10rem,0.78fr)',
  gap: 4,
});

const financialsStatusPillClassName =
  'inline-flex min-h-8 shrink-0 items-center rounded-full border px-2.5 py-1 text-[0.72rem] leading-[1.35] font-medium whitespace-nowrap';

const financialsCompactPillClassName =
  'inline-flex min-h-6 shrink-0 items-center rounded-full border px-2 py-0.5 text-[0.7rem] leading-tight font-medium whitespace-nowrap';

const statementIconClassName =
  'inline-flex size-5 shrink-0 items-center justify-center text-foreground/80 [&>svg]:size-5';

const statementRowIconClassName =
  'inline-flex size-4.5 shrink-0 items-center justify-center text-foreground/75 [&>svg]:size-4.5';

function HeaderTooltipLabel({
  children,
  tooltip,
}: {
  children: ReactNode;
  tooltip: string;
}) {
  return <SectionLabel tooltip={tooltip}>{children}</SectionLabel>;
}

function statementBlockIcon(blockId: FinancialStatementBlock['id']) {
  if (blockId === 'money-in') {
    return <EntityRevenueIcon aria-hidden="true" />;
  }
  if (blockId === 'money-tied-up') {
    return <StatusSavingsIcon aria-hidden="true" />;
  }
  return <StatusWarningIcon aria-hidden="true" />;
}

function statementRowIcon(rowKey: string) {
  switch (rowKey) {
    case 'net-sales':
      return <EntityRevenueIcon aria-hidden="true" />;
    case 'cost-consumed':
      return <EntityReceiptDocumentIcon aria-hidden="true" />;
    case 'gross-profit':
      return <StatusAchievementIcon aria-hidden="true" />;
    case 'on-hand':
      return <EntitySkuIcon aria-hidden="true" />;
    case 'in-transit':
      return <EntityTransitIcon aria-hidden="true" />;
    case 'open-orders':
      return <StatusAwaitingReceiptIcon aria-hidden="true" />;
    case 'slow-stock':
      return <StatusTimingIcon aria-hidden="true" />;
    case 'cost-increases':
      return <StatusDeltaTriangleIcon aria-hidden="true" />;
    case 'markdown-pressure':
      return <StatusPromoIcon aria-hidden="true" />;
    case 'negative-corrections':
      return <StatusCorrectionIcon aria-hidden="true" />;
    case 'blocked-margin':
      return <StatusWarningIcon aria-hidden="true" />;
    default:
      return <StatusWarningIcon aria-hidden="true" />;
  }
}

function financialsStatementRowId(rowKey: string) {
  return `financials-statement-${rowKey}`;
}

function rangeDaysForFinancials(range: FinancialsRange) {
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

function StatementBlock({ block }: { block: FinancialStatementBlock }) {
  return (
    <div
      id={`financials-statement-${block.id}`}
      className="grid scroll-mt-6 gap-5 border-t border-border/60 px-6 py-5 first:border-t-0 md:grid-cols-[minmax(0,1fr)_minmax(14rem,0.32fr)]"
    >
      <div className="min-w-0">
        <div className="mb-4">
          <h3 className="flex items-center gap-2 text-base font-semibold tracking-[-0.02em] text-foreground">
            <span className={statementIconClassName}>
              {statementBlockIcon(block.id)}
            </span>
            <span>{block.title}</span>
          </h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{block.descriptor}</p>
        </div>
        <div className="divide-y divide-border/60 rounded-[1.1rem] border border-border/60 bg-background/70">
          {block.rows.map((row) => (
            <div
              key={row.key}
              id={financialsStatementRowId(row.key)}
              className="grid scroll-mt-6 gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className={statementRowIconClassName}>
                  {statementRowIcon(row.key)}
                </span>
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{row.label}</p>
                  {row.detail || row.compareLabel ? (
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-sm leading-6 text-muted-foreground">
                      {row.detail ? <span>{row.detail}</span> : null}
                      {row.compareLabel ? (
                        <span className={`${financialsCompactPillClassName} ${statusPillClassName(row.compareTone ?? 'neutral')}`}>
                          {row.compareLabel}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>
              <div className="sm:text-right">
                <span className={`${financialsCompactPillClassName} ${statusPillClassName(row.tone)} tabular-nums`}>
                  {row.value}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className={`rounded-[1.2rem] border px-4 py-4 shadow-[0_10px_24px_rgba(48,31,20,0.05)] ${tintedSurfaceClassName(block.tone)}`}>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {translateUiLiteral(usePreferences().language, 'Statement value')}
        </p>
        <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-foreground">{block.summaryValue}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{block.summaryDetail}</p>
      </div>
    </div>
  );
}

function EconomicContributorsTable({ rows }: { rows: EconomicContributorRow[] }) {
  const { language } = usePreferences();
  const emptyText = translateUiLiteral(language, 'No contributors match the current filters. Broaden scope, clear supplier, or record more live data.');

  return (
    <HeaderedTable>
      <div className={contributorsTableLayout.containerClassName} style={contributorsTableLayout.style}>
        <HeaderedTableHeader className={contributorsTableLayout.headerClassName}>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel tooltip={translateUiLiteral(language, 'The SKU or service explaining part of the current money view.')}>
              {translateUiLiteral(language, 'Entity')}
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">
            <HeaderTooltipLabel tooltip={translateUiLiteral(language, 'Realized stock-linked sales in the selected window.')}>
              {translateUiLiteral(language, 'Net sales')}
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">
            <HeaderTooltipLabel tooltip={translateUiLiteral(language, 'Sales after known or inferred stock-linked cost.')}>
              {translateUiLiteral(language, 'Gross profit')}
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">
            <HeaderTooltipLabel tooltip={translateUiLiteral(language, 'Current stock-linked capital attached to this entity.')}>
              {translateUiLiteral(language, 'Capital tied up')}
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel tooltip={translateUiLiteral(language, 'Whether inventory is converting into money cleanly.')}>
              {translateUiLiteral(language, 'Turn quality')}
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">
            <HeaderTooltipLabel tooltip={translateUiLiteral(language, 'Financial classification for this row.')}>
              {translateUiLiteral(language, 'Status')}
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
        </HeaderedTableHeader>
        <HeaderedTableBody className={contributorsTableLayout.bodyClassName}>
          {rows.length > 0 ? rows.map((row) => (
            <HeaderedTableRow key={`${row.entityType}-${row.id}`} className={`${rowHoverClassName} ${contributorsTableLayout.rowClassName}`}>
              <div className="min-w-0">
                <HeaderedTableMobileLabel className={contributorsTableLayout.mobileLabelClassName}>
                  {translateUiLiteral(language, 'Entity')}
                </HeaderedTableMobileLabel>
                <HeaderedTableCellStack
                  primary={
                    <ItemIdentityBlock
                      align="center"
                      description={row.summary}
                      imagePath={row.imagePath}
                      metadata={row.entityType === 'sku' ? <SupplierBadge supplierName={row.supplierName} /> : null}
                      name={
                        <Link
                          className="font-semibold text-foreground hover:text-primary"
                          state={buildBanjiNavigationState(location, '/catalog')}
                          to={row.href}
                        >
                          {row.label}
                        </Link>
                      }
                      size="compact"
                      type={row.entityType}
                    />
                  }
                  primaryClassName="font-normal"
                />
              </div>
              <div className="min-w-0 xl:text-center">
                <HeaderedTableMobileLabel className={contributorsTableLayout.mobileLabelClassName}>
                  {translateUiLiteral(language, 'Net sales')}
                </HeaderedTableMobileLabel>
                <HeaderedTableCellStack primary={row.netSalesLabel} primaryClassName="text-sm tabular-nums xl:text-center" />
              </div>
              <div className="min-w-0 xl:text-center">
                <HeaderedTableMobileLabel className={contributorsTableLayout.mobileLabelClassName}>
                  {translateUiLiteral(language, 'Gross profit')}
                </HeaderedTableMobileLabel>
                <HeaderedTableCellStack primary={row.grossProfitLabel} primaryClassName="text-sm tabular-nums xl:text-center" />
              </div>
              <div className="min-w-0 xl:text-center">
                <HeaderedTableMobileLabel className={contributorsTableLayout.mobileLabelClassName}>
                  {translateUiLiteral(language, 'Capital tied up')}
                </HeaderedTableMobileLabel>
                <HeaderedTableCellStack primary={row.capitalTiedLabel} primaryClassName="text-sm tabular-nums xl:text-center" />
              </div>
              <div className="min-w-0">
                <HeaderedTableMobileLabel className={contributorsTableLayout.mobileLabelClassName}>
                  {translateUiLiteral(language, 'Turn quality')}
                </HeaderedTableMobileLabel>
                <HeaderedTableCellStack primary={row.turnQualityLabel} primaryClassName="text-sm" />
              </div>
              <div className="flex items-start xl:justify-center">
                <span className={`${financialsStatusPillClassName} ${statusPillClassName(row.statusTone)}`}>
                  {row.statusLabel}
                </span>
              </div>
            </HeaderedTableRow>
          )) : (
            <div className="px-6 py-6 text-sm leading-6 text-muted-foreground">{emptyText}</div>
          )}
        </HeaderedTableBody>
      </div>
    </HeaderedTable>
  );
}

function MoneyBandColumn({
  emptyMessage,
  icon,
  rows,
  tone,
  title,
  tooltip,
}: {
  emptyMessage: string;
  icon: ReactNode;
  rows: FinancialBandEntry[];
  tone: StatusPillTone;
  title: string;
  tooltip: string;
}) {
  return (
    <div className="min-w-0">
      <div className={`rounded-[0.9rem] border px-3 py-2.5 ${tintedSurfaceClassName(tone)}`}>
        <h3 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em] text-foreground">
          {icon}
          <SectionLabel tooltip={tooltip}>{title}</SectionLabel>
        </h3>
      </div>
      <div className="mt-4 space-y-3">
        {rows.length > 0 ? rows.map((row) => (
          <Link
            key={`${row.entityType}-${row.id}`}
            className={`block rounded-[0.9rem] border px-4 py-2.5 transition-colors ${tintedSurfaceClassName(tone)} ${rowHoverClassName}`}
            state={buildBanjiNavigationState(location, '/catalog')}
            to={row.href}
          >
            <ItemIdentityBlock
              align="center"
              description={row.summary}
              imagePath={row.imagePath}
              name={<span className="font-medium text-foreground">{row.label}</span>}
              size="compact"
              type={row.entityType}
            />
          </Link>
        )) : (
          <p className={`rounded-[1.2rem] border border-dashed px-4 py-4 text-sm text-muted-foreground ${tintedSurfaceClassName(tone)}`}>
            {emptyMessage}
          </p>
        )}
      </div>
    </div>
  );
}

function RailRows({ emptyLabel, rows }: { emptyLabel: string; rows: FinancialRailRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm leading-6 text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="divide-y divide-border/60">
      {rows.map((row) => (
        <Link
          key={row.id}
          className="block py-3 first:pt-0 last:pb-0"
          state={buildBanjiNavigationState(location, '/catalog')}
          to={row.href}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-medium text-foreground">{row.label}</p>
            {row.valueLabel ? (
              <span className={`${financialsCompactPillClassName} ${statusPillClassName(row.valueTone ?? 'neutral')} tabular-nums`}>
                {row.valueLabel}
              </span>
            ) : null}
          </div>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{row.detail}</p>
        </Link>
      ))}
    </div>
  );
}

function FinancialsLoadingState() {
  const { language } = usePreferences();

  return (
    <WorkspacePage className="gap-5">
      <WorkspaceTitleCardWireframe
        descriptor={translateUiLiteral(language, 'Loading the stock-linked money view.')}
        title={
          <span className="flex min-w-0 items-center gap-3">
            <RouteBackButton className="shrink-0" />
            <span className="truncate">{translateUiLiteral(language, 'Money')}</span>
          </span>
        }
        actions={
          <div className="flex flex-wrap justify-end gap-2">
            <Skeleton className="h-12 w-40 rounded-full" />
            <Skeleton className="h-12 w-56 rounded-full" />
            <Skeleton className="h-12 w-44 rounded-full" />
          </div>
        }
      >
        <Skeleton className="h-5 w-full max-w-2xl rounded-full" />
      </WorkspaceTitleCardWireframe>
      <section className={`${PERFORMANCE_HEADER_SURFACE_CLASS_NAME} overflow-hidden`}>
        <div className="grid divide-y divide-border/60 bg-border/40 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-5">
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="bg-white px-5 py-4 sm:px-6">
              <Skeleton className="h-4 w-24 rounded-full" />
              <Skeleton className="mt-3 h-7 w-28 rounded-full" />
              <Skeleton className="mt-3 h-4 w-full rounded-full" />
            </div>
          ))}
        </div>
      </section>
      <div className={rightRailLayoutClassName(true)}>
        <div className="grid min-w-0 gap-6">
          <section className={`${PERFORMANCE_HEADER_SURFACE_CLASS_NAME} px-6 py-5`}>
            <WireframeRows chartHeightClassName="h-24" rowCount={3} />
          </section>
          <section className={`${PERFORMANCE_HEADER_SURFACE_CLASS_NAME} px-6 py-5`}>
            <WireframeRows chartHeightClassName="h-16" rowCount={4} />
          </section>
        </div>
        <aside className={RIGHT_RAIL_ASIDE_CLASS_NAME}>
          <WireframeRailCards count={4} />
        </aside>
      </div>
    </WorkspacePage>
  );
}

export function FinancialsRoute() {
  const automation = useOptionalAutomation();
  const inventory = useInventory();
  const location = useLocation();
  const {
    currency,
    language,
    showHeartbeatRibbons = true,
    showPerformanceCompareToggle,
    showRightRailCards,
    t,
    usdToKhrExchangeRate,
  } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const routeState = readFinancialsRouteState(searchParams);
  const range = routeState.range as FinancialsRange;
  const scope = routeState.scope as FinancialsScope;
  const compareMode = showPerformanceCompareToggle ? routeState.compare : false;
  const supplierFilter = supplierFilterValueForQuery(routeState.supplier);
  const requestedOrderBatchesRef = useRef(false);
  const [customDialogOpen, setCustomDialogOpen] = useState(false);

  const currentCustomRange = routeState.range === 'custom' && routeState.customRangeStart && routeState.customRangeEnd
    ? { startAt: routeState.customRangeStart, endAt: routeState.customRangeEnd }
    : null;

  const previousCustomRange = useMemo(() => {
    if (!currentCustomRange) return null;
    const days = daysBetween(currentCustomRange.startAt, currentCustomRange.endAt);
    return {
      startAt: shiftDateByDays(currentCustomRange.startAt, -days),
      endAt: shiftDateByDays(currentCustomRange.endAt, -days),
    };
  }, [currentCustomRange]);
  const baseCatalog = useMemo(() => activeSenaCatalog(inventory.catalog), [inventory.catalog]);
  const visibleCatalog = useMemo(
    () => filterCatalogBySupplier(baseCatalog, supplierFilter),
    [baseCatalog, supplierFilter],
  );
  const targetSkuIds = useMemo(
    () => (scope === 'services' ? [] : visibleCatalog?.skus.map((sku) => sku.skuId) ?? []),
    [scope, visibleCatalog?.skus],
  );
  const targetServiceIds = useMemo(
    () => (scope === 'skus' ? [] : visibleCatalog?.services.map((service) => service.serviceId) ?? []),
    [scope, visibleCatalog?.services],
  );
  const priorityServiceIds = useMemo(
    () => targetServiceIds.slice(0, 8),
    [targetServiceIds],
  );
  const prioritySkuIds = useMemo(
    () => targetSkuIds
      .filter((skuId) => inventory.workspaceSummary?.highRiskSkuIds.includes(skuId))
      .slice(0, 8),
    [inventory.workspaceSummary?.highRiskSkuIds, targetSkuIds],
  );
  const { isHydratingDetails, serviceDetailsById, skuDetailsById } = useSenaDetailHydration('Recent', {
    priorityServiceIds,
    prioritySkuIds,
    serviceIds: targetServiceIds,
    skuIds: targetSkuIds,
  });

  function updateRouteState(nextState: Parameters<typeof buildFinancialsSearchParams>[1], replace = false) {
    setSearchParams(buildFinancialsSearchParams(searchParams, nextState), { replace });
  }

  useEffect(() => {
    if (
      typeof inventory.loadSenaOrderBatches !== 'function'
      || requestedOrderBatchesRef.current
      || (inventory.orderBatches?.length ?? 0) > 0
    ) {
      return;
    }
    requestedOrderBatchesRef.current = true;
    const id = window.setTimeout(() => {
      void inventory.loadSenaOrderBatches().catch((error) => {
        requestedOrderBatchesRef.current = false;
        console.warn('[financials] order batches load failed', error);
      });
    }, 0);
    return () => window.clearTimeout(id);
  }, [inventory, inventory.orderBatches?.length]);

  useEffect(() => {
    if (inventory.diagnostics != null) {
      return;
    }
    const timeoutId = window.setTimeout(() => {
      void inventory.loadSenaDiagnostics().catch((error) => {
        console.warn('[financials] diagnostics load failed', error);
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [inventory.diagnostics, inventory.loadSenaDiagnostics]);

  const model = useMemo(() => {
    if (!visibleCatalog || !inventory.workspaceSummary) {
      return null;
    }

    return deriveFinancialsViewModel({
      catalog: visibleCatalog,
      compareMode,
      currency,
      usdToKhrExchangeRate,
      diagnostics: inventory.diagnostics,
      language,
      observations: inventory.observations,
      orderBatches: inventory.orderBatches ?? [],
      range,
      scope,
      serviceDetailsById,
      skuDetailsById,
      workspaceSummary: inventory.workspaceSummary,
      customRange: currentCustomRange,
    });
  }, [
    compareMode,
    currency,
    inventory.diagnostics,
    inventory.observations,
    inventory.orderBatches,
    inventory.workspaceSummary,
    language,
    range,
    scope,
    serviceDetailsById,
    skuDetailsById,
    usdToKhrExchangeRate,
    visibleCatalog,
  ]);
  const telegramWindowSummary = useMemo(() => {
    const windowDays = rangeDaysForFinancials(range);
    const cutoff = Date.now() - windowDays * 24 * 60 * 60 * 1000;
    const intakesInRange = automation.intakes.filter((intake) => new Date(intake.updatedAt).getTime() >= cutoff);
    const openQuotedValue = intakesInRange
      .filter((intake) => intake.status === 'new' || intake.status === 'needs_review' || intake.status === 'quoted' || intake.status === 'ticketed')
      .reduce((sum, intake) => sum + (intake.quotedTotal ?? 0), 0);
    const realizedValue = intakesInRange
      .filter((intake) => intake.status === 'completed')
      .reduce((sum, intake) => sum + (intake.quotedTotal ?? 0), 0);
    const canceledValue = intakesInRange
      .filter((intake) => intake.status === 'canceled')
      .reduce((sum, intake) => sum + (intake.quotedTotal ?? 0), 0);

    return {
      canceledCount: intakesInRange.filter((intake) => intake.status === 'canceled').length,
      canceledValueLabel: formatCurrency(canceledValue, currency, language, usdToKhrExchangeRate),
      openQuotedValueLabel: formatCurrency(openQuotedValue, currency, language, usdToKhrExchangeRate),
      realizedValueLabel: formatCurrency(realizedValue, currency, language, usdToKhrExchangeRate),
      ticketedCount: intakesInRange.filter((intake) => intake.status === 'ticketed' || intake.status === 'completed').length,
    };
  }, [automation.intakes, currency, language, range, usdToKhrExchangeRate]);

  useBenchmarkRouteReady('insights.money', !inventory.isLoading && (!visibleCatalog || model != null), {
    compareMode,
    hasWorkspaceSummary: Boolean(inventory.workspaceSummary),
    range,
    scope,
  });

  if (inventory.isLoading && !visibleCatalog) {
    return <FinancialsLoadingState />;
  }

  if (!visibleCatalog || (visibleCatalog.skus.length === 0 && visibleCatalog.services.length === 0)) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title={t('financialsRouteEmptyCatalogTitle')}
          hint={t('financialsRouteEmptyCatalogHint')}
          action={<CreateFirstSkuButton />}
        />
      </WorkspacePage>
    );
  }

  if (!inventory.workspaceSummary || !model) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title={t('financialsRouteEmptyWorkspaceTitle')}
          hint={t('financialsRouteEmptyWorkspaceHint')}
          action={
            <WorkspaceActionRow>
              <Button asChild>
                <Link to="/work/capture">
                  <NavigationTaskListIcon data-icon="inline-start" />
                  {translateUiLiteral(language, 'Start update')}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/">
                  <NavigationDashboardIcon data-icon="inline-start" />
                  {translateUiLiteral(language, 'Open Work')}
                </Link>
              </Button>
            </WorkspaceActionRow>
          }
        />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage className="gap-5">
      <WorkspaceTitleCard
        title={
          <span className="flex min-w-0 items-center gap-3">
            <RouteBackButton className="shrink-0" />
            <span className="truncate">{t('financialsRouteTitle')}</span>
          </span>
        }
        descriptor={t('financialsRouteDescriptor')}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ToggleGroup
              aria-label={translateUiLiteral(language, 'Select financials scope')}
              className="rounded-full"
              spacing={1}
              type="single"
              value={scope}
              onValueChange={(nextValue) => {
                if (nextValue) {
                  updateRouteState({ scope: nextValue as FinancialsScope });
                }
              }}
            >
              <ToggleGroupItem value="all">
                <EntityLayersIcon data-icon="inline-start" />
                {t('financialsRouteScopeAll')}
              </ToggleGroupItem>
              <ToggleGroupItem value="services">
                <EntityServiceIcon data-icon="inline-start" />
                {t('financialsRouteScopeServices')}
              </ToggleGroupItem>
              <ToggleGroupItem value="skus">
                <EntitySkuIcon data-icon="inline-start" />
                {t('financialsRouteScopeSkus')}
              </ToggleGroupItem>
            </ToggleGroup>

            <SupplierFilter
              catalog={baseCatalog}
              className={compactFilterControlClassName}
              value={supplierFilter}
              onChange={(nextSupplier: SupplierFilterValue) =>
                updateRouteState({ supplier: supplierFilterQueryValue(nextSupplier) })
              }
            />

            <Select
              value={range}
              onValueChange={(nextValue) => {
                if (nextValue === 'custom') {
                  setCustomDialogOpen(true);
                  return;
                }
                updateRouteState({ range: nextValue as FinancialsRange, customRangeStart: null, customRangeEnd: null });
              }}
            >
              <SelectTrigger
                aria-label={translateUiLiteral(language, 'Select financials time range')}
                className={cn(
                  'min-w-[12rem] justify-between border border-border/70 bg-card text-sm font-medium text-foreground shadow-xs [&_svg]:opacity-100',
                  compactFilterControlClassName,
                )}
              >
                <span className="inline-flex items-center gap-2">
                  <StatusScheduleIcon className="size-4" />
                  <span>
                    {translateUiLiteral(
                      language,
                      'Timeframe: {value}',
                      { value: range === 'custom' ? translateUiLiteral(language, 'Custom') : translateUiLiteral(language, range.replace('d', 'D')) }
                    )}
                  </span>
                </span>
              </SelectTrigger>
              <SelectContent position="popper">
                {(['1d', '7d', '30d', '90d', 'custom'] as FinancialsRange[]).map((option) =>
                  option === 'custom' ? (
                    <div className="relative" key={option}>
                      <SelectItem value={option} className="pr-14">
                        <span>{translateUiLiteral(language, 'Custom')}</span>
                      </SelectItem>
                      <button
                        type="button"
                        className="absolute right-8 top-1/2 -translate-y-1/2 z-10 cursor-pointer p-1 rounded-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        aria-label={translateUiLiteral(language, 'Open custom date range dialog')}
                        onClick={(e) => {
                          e.stopPropagation();
                          setCustomDialogOpen(true);
                        }}
                      >
                        <ActionEyeIcon className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <SelectItem key={option} value={option}>
                      {translateUiLiteral(language, option.replace('d', 'D'))}
                    </SelectItem>
                  )
                )}
              </SelectContent>
            </Select>

            {showPerformanceCompareToggle ? (
              <Button
                aria-pressed={compareMode}
                className={cn(compactActionButtonClassName, !compareMode && 'bg-card')}
                data-hover-suppressed="false"
                type="button"
                variant={compareMode ? 'default' : 'outline'}
                onClick={() => updateRouteState({ compare: !compareMode })}
              >
                <EntityComparisonIcon className="size-4" />
                {compareMode ? translateUiLiteral(language, 'Compare view') : translateUiLiteral(language, 'Single view')}
              </Button>
            ) : null}

            <CustomTimeframeDialog
              language={language}
              open={customDialogOpen}
              onOpenChange={setCustomDialogOpen}
              currentStart={currentCustomRange?.startAt ?? null}
              currentEnd={currentCustomRange?.endAt ?? null}
              previousStart={previousCustomRange?.startAt ?? null}
              previousEnd={previousCustomRange?.endAt ?? null}
              compareMode={compareMode}
              onApply={(currentStart, currentEnd, previousStart, previousEnd) => {
                updateRouteState({
                  range: 'custom',
                  customRangeStart: currentStart,
                  customRangeEnd: currentEnd,
                });
              }}
              onClear={() => {
                setCustomDialogOpen(false);
                updateRouteState({ range: '30d', customRangeStart: null, customRangeEnd: null });
              }}
            />
          </div>
        }
      >
        {showHeartbeatRibbons ? (
          <MetricRibbon
            columns={5}
            items={model.ribbon.map((metric) => ({
              key: metric.key,
              label: metric.label,
              value: metric.value,
              detail: (
                <>
                  <span>{metric.detail}</span>
                  {metric.compareLabel ? (
                    <span className={`${financialsCompactPillClassName} ${statusPillClassName(metric.compareTone ?? 'neutral')}`}>
                      {metric.compareLabel}
                    </span>
                  ) : null}
                </>
              ),
              className: `border-t-2 px-5 py-4 sm:px-6 ${tintedSurfaceClassName(metric.tone)}`,
            }))}
          />
        ) : null}
      </WorkspaceTitleCard>

      <div className={rightRailLayoutClassName(showRightRailCards)}>
        <div className="grid min-w-0 gap-6">
          <PerformanceSectionShell
            title={translateUiLiteral(language, 'Financial statement')}
            tooltip={translateUiLiteral(language, 'The money shape of the business in money in, money tied up, and money leaking layers.')}
            descriptor={translateUiLiteral(language, 'Read the stock-linked money view as a statement, not an action queue.')}
            contentClassName="px-0 py-0"
          >
            {model.statement.map((block) => (
              <StatementBlock key={block.id} block={block} />
            ))}
          </PerformanceSectionShell>

          <PerformanceSectionShell
            title={translateUiLiteral(language, 'Economic contributors')}
            tooltip={translateUiLiteral(language, 'The SKUs and services explaining most of the current economic picture.')}
            descriptor={translateUiLiteral(language, 'Ranked by gross profit contribution, then sales contribution.')}
            contentClassName="px-0 py-0"
          >
            <EconomicContributorsTable rows={model.contributors} />
          </PerformanceSectionShell>

          <PerformanceSectionShell
            title={translateUiLiteral(language, 'Money quality bands')}
            tooltip={translateUiLiteral(language, 'Financial groupings by earning quality, trapped capital, and margin leakage.')}
            descriptor={translateUiLiteral(language, 'Scan where money is working, sitting, or leaking.')}
          >
            <div className="grid gap-6 xl:grid-cols-3">
              <MoneyBandColumn
                emptyMessage={translateUiLiteral(language, 'No efficient earners are standing out in this window.')}
                icon={<StatusAchievementIcon className="size-4.5 text-muted-foreground" aria-hidden="true" />}
                rows={model.earners}
                tone="success"
                title={translateUiLiteral(language, 'Earners')}
                tooltip={translateUiLiteral(language, 'Strong sales, healthy profit, and acceptable capital footprint.')}
              />
              <MoneyBandColumn
                emptyMessage={translateUiLiteral(language, 'No capital traps are stacking up in this window.')}
                icon={<StatusSavingsIcon className="size-4.5 text-muted-foreground" aria-hidden="true" />}
                rows={model.capitalTraps}
                tone="warning"
                title={translateUiLiteral(language, 'Capital traps')}
                tooltip={translateUiLiteral(language, 'Too much stock value relative to realized return.')}
              />
              <MoneyBandColumn
                emptyMessage={translateUiLiteral(language, 'No margin leaks are standing out in this window.')}
                icon={<StatusWarningIcon className="size-4.5 text-muted-foreground" aria-hidden="true" />}
                rows={model.marginLeaks}
                tone="danger"
                title={translateUiLiteral(language, 'Margin leaks')}
                tooltip={translateUiLiteral(language, 'Sales activity exists, but spread is weak or deteriorating.')}
              />
            </div>
          </PerformanceSectionShell>
        </div>

        {showRightRailCards ? (
          <aside className={RIGHT_RAIL_ASIDE_CLASS_NAME}>
            <PerformanceRightRailBlock
              title={translateUiLiteral(language, 'Commitments due')}
              tooltip={translateUiLiteral(language, 'Supplier-side value likely to leave the business soon.')}
            >
              <RailRows
                emptyLabel={translateUiLiteral(language, 'No open supplier commitments are visible right now.')}
                rows={model.commitmentsDue}
              />
            </PerformanceRightRailBlock>

            <PerformanceRightRailBlock
              title={translateUiLiteral(language, 'Largest capital positions')}
              tooltip={translateUiLiteral(language, 'The biggest current stock-value concentrations.')}
            >
              <RailRows
                emptyLabel={translateUiLiteral(language, 'No material stock-value concentration is visible yet.')}
                rows={model.largestCapitalPositions}
              />
            </PerformanceRightRailBlock>

            <PerformanceRightRailBlock
              title={translateUiLiteral(language, 'Recent margin shifts')}
              tooltip={translateUiLiteral(language, 'Recent price, cost, receipt, or correction changes with financial impact.')}
            >
              <RailRows
                emptyLabel={translateUiLiteral(language, 'No recent price or cost shifts are visible in this window.')}
                rows={model.recentMarginShifts}
              />
            </PerformanceRightRailBlock>

            <PerformanceRightRailBlock
              title={translateUiLiteral(language, 'Coverage')}
              tooltip={translateUiLiteral(language, 'Price, cost, and freshness coverage behind this money view.')}
            >
              <div className="space-y-3">
                {[model.coverage.freshnessLabel, model.coverage.costCoverageLabel, model.coverage.priceCoverageLabel, model.coverage.weakSpotLabel].map((line) => (
                  <p key={line} className="text-sm leading-6 text-muted-foreground">
                    {line}
                  </p>
                ))}
                <Button asChild className="w-full" size="sm" variant="outline">
                  <Link to="/work/capture">
                    <ActionOpenExternalIcon className="size-4" />
                    {translateUiLiteral(language, 'Start update')}
                  </Link>
                </Button>
              </div>
            </PerformanceRightRailBlock>

            <PerformanceRightRailBlock
              title={translateUiLiteral(language, 'Telegram attribution')}
              tooltip={translateUiLiteral(language, 'Quoted, realized, and canceled value attributed to Telegram-origin customer intake.')}
            >
              <div className="space-y-3">
                <p className="text-sm leading-6 text-muted-foreground">
                  {translateUiLiteral(language, 'Open quoted Telegram value')} · {telegramWindowSummary.openQuotedValueLabel}
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  {translateUiLiteral(language, 'Realized Telegram value')} · {telegramWindowSummary.realizedValueLabel}
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  {translateUiLiteral(language, 'Telegram-origin reversals / cancellations')} · {telegramWindowSummary.canceledCount} · {telegramWindowSummary.canceledValueLabel}
                </p>
                <p className="text-sm leading-6 text-muted-foreground">
                  {translateUiLiteral(language, 'Ticketed Telegram intake')} · {telegramWindowSummary.ticketedCount}
                </p>
                <Button asChild className="w-full" size="sm" variant="outline">
                  <Link to="/work/intake">
                    <ActionOpenExternalIcon className="size-4" />
                    {translateUiLiteral(language, 'Open Automations')}
                  </Link>
                </Button>
              </div>
            </PerformanceRightRailBlock>
          </aside>
        ) : null}
      </div>
    </WorkspacePage>
  );
}
