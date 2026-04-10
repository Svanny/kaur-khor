import { useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ActionCreatePackageIcon, ActionOpenExternalIcon, ActionRefreshIcon } from '@icons/actions';
import {
  EntityComparisonIcon,
  EntityLayersIcon,
  EntityRevenueIcon,
  EntityServiceIcon,
  EntitySkuIcon,
  EntityTransitIcon,
} from '@icons/entities';
import { NavigationDashboardIcon, NavigationForwardIcon, NavigationPerformanceIcon, NavigationTaskListIcon } from '@icons/navigation';
import { StatusAchievementIcon, StatusSavingsIcon, StatusWarningIcon } from '@icons/status';
import { WorkspaceActionRow, WorkspaceEmpty, WorkspacePage, WorkspaceTitleCard } from '@/components/system/workspace';
import { RIGHT_RAIL_ASIDE_CLASS_NAME, rightRailLayoutClassName } from '@/components/system/right-rail-layout';
import {
  createHeaderedTableLayout,
  HeaderedTableCellStack,
  HeaderedTable,
  HeaderedTableBody,
  HeaderedTableHeader,
  HeaderedTableHeaderCell,
  HeaderedTableMobileLabel,
  HeaderedTableRow,
} from '@/components/system/headered-table';
import { Button } from '@/components/ui/button';
import { CompactSparkline } from '@/components/ui/compact-sparkline';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { activeSenaCatalog } from '@/lib/sena-catalog';
import {
  buildPerformanceSearchParams,
  readPerformanceRouteState,
} from '@/lib/navigation-state';
import { translateUiLiteral } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { statusPillClassName, tintedSurfaceClassName } from '@/lib/state-tones';
import { SectionLabel } from '@/routes/sku-detail/section-heading';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import { intervalDaysBetween, latestObservationAt } from './observation-payload';
import { PerformanceRightRailBlock, PerformanceSectionShell, PERFORMANCE_HEADER_SURFACE_CLASS_NAME } from './performance/chrome';
import { useSenaDetailHydration } from './performance/use-sena-detail-hydration';
import {
  derivePerformanceViewModel,
  type PerformanceBandEntry,
  type PerformanceMoveRow,
  type PerformanceScope,
  type PerformanceTimeRange,
  type PerformanceTimelineEvent,
} from './performance/view-model';

const moveNowTableLayout = createHeaderedTableLayout({
  breakpoint: 'lg',
  columns: 'minmax(18rem,1.1fr) minmax(16rem,1fr) minmax(16rem,1fr) minmax(10rem,0.7fr)',
  gap: 5,
});
const demandCapacityBoardCompareLayout = createHeaderedTableLayout({
  breakpoint: 'xl',
  columns: 'minmax(13rem,0.95fr) minmax(12rem,0.95fr) minmax(11rem,0.9fr) minmax(11rem,0.9fr) minmax(11rem,0.9fr) minmax(10rem,0.82fr)',
  gap: 4,
});
const demandCapacityBoardNormalLayout = createHeaderedTableLayout({
  breakpoint: 'xl',
  columns: 'minmax(12rem,0.95fr) minmax(12rem,0.95fr) minmax(11rem,0.9fr) minmax(11rem,0.9fr) minmax(11rem,0.9fr) minmax(10rem,0.82fr)',
  gap: 4,
});
const performanceStatusPillClassName =
  'inline-flex min-h-8 shrink-0 items-center rounded-full border px-2.5 py-1 text-[0.72rem] leading-[1.35] font-medium whitespace-nowrap';

function SteeringPill({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) {
  return (
    <Button
      aria-pressed={active}
      className="h-12 rounded-full px-4"
      data-hover-suppressed="false"
      type="button"
      variant={active ? 'default' : 'outline'}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1.5">{children}</span>
    </Button>
  );
}

function HeaderTooltipLabel({
  children,
  tooltip,
}: {
  children: ReactNode;
  tooltip: string;
}) {
  return <SectionLabel tooltip={tooltip}>{children}</SectionLabel>;
}

function TrendSignalInline({
  label,
  labelBelow = false,
  points,
  splitIndex,
  tone,
  size = 'default',
}: {
  label: string;
  labelBelow?: boolean;
  points: number[];
  splitIndex?: number;
  tone: 'up' | 'flat' | 'down';
  size?: 'default' | 'compact';
}) {
  const labelClassName =
    size === 'compact' ? 'text-sm text-foreground' : 'text-[1.45rem] font-semibold tracking-[-0.04em] text-foreground';
  const [leftLabel, rightLabel] = labelBelow ? label.split(' -> ') : [label];
  const sparklineWidth = size === 'compact' ? 160 : 300;
  const sparklineClassName =
    size === 'compact'
      ? 'h-6 w-full max-w-[12.5rem] shrink-0 overflow-hidden'
      : 'h-8 w-full max-w-full shrink-0 overflow-hidden';
  const containerClassName = labelBelow
    ? size === 'compact'
      ? 'flex w-full min-w-0 flex-col items-start gap-1.5'
      : 'flex w-full min-w-0 flex-col items-center gap-1.5'
    : 'inline-flex min-w-0 items-center gap-3';
  const compareLabelClassName =
    size === 'compact'
      ? `inline-flex w-full max-w-[12.5rem] items-center justify-center gap-1.5 text-center ${labelClassName}`
      : `inline-flex items-center justify-center gap-1.5 text-center ${labelClassName}`;
  const singleLabelClassName =
    size === 'compact'
      ? `inline-flex w-full max-w-[12.5rem] items-center justify-center text-center ${labelClassName}`
      : `text-center ${labelClassName}`;

  return (
    <div className={containerClassName}>
      <CompactSparkline
        className={sparklineClassName}
        height={size === 'compact' ? 24 : 32}
        points={points}
        preserveAspectRatio="none"
        splitIndex={splitIndex}
        tone={tone}
        width={sparklineWidth}
      />
      {labelBelow && leftLabel && rightLabel ? (
        <span className={compareLabelClassName}>
          <span>{leftLabel}</span>
          <NavigationForwardIcon className="size-3.5 text-muted-foreground" />
          <span>{rightLabel}</span>
        </span>
      ) : (
        <span className={singleLabelClassName}>{label}</span>
      )}
    </div>
  );
}

function ItemTypeIcon({ type }: { type: string }) {
  if (type === 'Service') {
    return <EntityServiceIcon className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />;
  }

  return <EntitySkuIcon className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />;
}

function CashBandColumn({
  band,
  title,
  tooltip,
  emptyMessage,
  rows,
}: {
  band: 'winners' | 'blockedProfit' | 'cashTraps';
  title: string;
  tooltip: string;
  emptyMessage: string;
  rows: PerformanceBandEntry[];
}) {
  const HeaderIcon =
    band === 'winners' ? StatusAchievementIcon : band === 'blockedProfit' ? StatusWarningIcon : StatusSavingsIcon;

  return (
    <div className="min-w-0">
      <div className="border-b border-border/60 pb-3">
        <h3 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.02em] text-foreground">
          <HeaderIcon className="size-4.5 text-muted-foreground" aria-hidden="true" />
          <SectionLabel tooltip={tooltip}>{title}</SectionLabel>
        </h3>
      </div>
      <div className="mt-4 space-y-3">
        {rows.length > 0 ? (
          rows.map((row) => (
            <Link
              key={row.id}
              className={`block rounded-[0.9rem] border px-4 py-2.5 transition-colors ${tintedSurfaceClassName(row.tone)} ${rowHoverClassName}`}
              to={row.href}
            >
              <div className="flex items-center gap-2.5">
                <ItemTypeIcon type={row.entityType === 'service' ? 'Service' : 'SKU'} />
                <p className="font-medium text-foreground">{row.label}</p>
              </div>
              <p className="mt-1.5 pl-[1.65rem] text-sm leading-6 text-muted-foreground">{row.summary}</p>
            </Link>
          ))
        ) : (
          <p className="rounded-[1.2rem] border border-dashed border-border/60 px-4 py-4 text-sm text-muted-foreground">
            {emptyMessage}
          </p>
        )}
      </div>
    </div>
  );
}

function TimelineStep({
  event,
  showConnector = true,
}: {
  event: PerformanceTimelineEvent;
  showConnector?: boolean;
}) {
  const Icon =
    event.id === 'timeline-demand'
      ? NavigationPerformanceIcon
      : event.id === 'timeline-stockout'
        ? StatusWarningIcon
        : event.id === 'timeline-receipt'
          ? EntityTransitIcon
          : event.id === 'timeline-price'
            ? EntityRevenueIcon
            : ActionRefreshIcon;

  return (
    <div className="group flex min-w-[220px] flex-1 items-stretch">
      <div className="flex min-w-0 flex-1 flex-col items-center gap-4">
        <div className="pointer-events-none flex h-10 items-center justify-center text-muted-foreground">
          <Icon className="size-8" />
        </div>
        <div className="flex min-h-[9rem] w-full flex-1 items-start rounded-[1.3rem] border border-border/60 bg-background/85 px-4 py-4 shadow-[0_10px_24px_rgba(48,31,20,0.05)] transition-transform group-hover:-translate-y-0.5 motion-reduce:transform-none">
          <div className="min-w-0">
            <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{event.title}</p>
            <p className="mt-2 font-semibold text-foreground">{event.subtitle}</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{event.detail}</p>
          </div>
        </div>
      </div>
      {showConnector ? (
        <div className="hidden w-10 shrink-0 self-stretch pt-14 lg:flex">
          <div className="flex flex-1 items-center justify-center text-muted-foreground">
            <ActionOpenExternalIcon className="size-4 rotate-45" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MoveNowTable({
  headers,
  rows,
}: {
  headers: {
    action: string;
    actionTooltip: string;
    expectedEffect: string;
    expectedEffectTooltip: string;
    move: string;
    moveTooltip: string;
    whyNow: string;
    whyNowTooltip: string;
  };
  rows: PerformanceMoveRow[];
}) {
  return (
    <HeaderedTable>
      <div className={moveNowTableLayout.containerClassName} style={moveNowTableLayout.style}>
        <HeaderedTableHeader className={moveNowTableLayout.headerClassName}>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel tooltip={headers.moveTooltip}>
              {headers.move}
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel tooltip={headers.whyNowTooltip}>
              {headers.whyNow}
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel tooltip={headers.expectedEffectTooltip}>
              {headers.expectedEffect}
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">
            <HeaderTooltipLabel tooltip={headers.actionTooltip}>
              {headers.action}
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
        </HeaderedTableHeader>
        <HeaderedTableBody className={moveNowTableLayout.bodyClassName}>
          {rows.map((row) => (
            <HeaderedTableRow key={row.id} className={`${rowHoverClassName} ${moveNowTableLayout.rowClassName}`}>
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2.5 font-semibold text-foreground">
                  <span>{row.moveVerb}</span>
                  <ItemTypeIcon type={row.moveEntityType === 'service' ? 'Service' : 'SKU'} />
                  <span className="truncate">{row.moveEntityName}</span>
                </div>
              </div>
              <div className="min-w-0">
                <HeaderedTableMobileLabel className={moveNowTableLayout.mobileLabelClassName}>
                  {headers.whyNow}
                </HeaderedTableMobileLabel>
                <p className="text-sm leading-6 text-muted-foreground">{row.whyNow}</p>
              </div>
              <div className="min-w-0">
                <HeaderedTableMobileLabel className={moveNowTableLayout.mobileLabelClassName}>
                  {headers.expectedEffect}
                </HeaderedTableMobileLabel>
                <p className="text-sm leading-6 text-muted-foreground">{row.expectedEffect}</p>
              </div>
              <div className="flex items-start lg:justify-center">
                <Button asChild className="w-full justify-center lg:w-[132px]" size="sm" variant={row.tone === 'danger' ? 'default' : 'outline'}>
                  <Link className="inline-flex w-full items-center justify-center gap-2" to={row.ctaHref}>
                    <ActionOpenExternalIcon className="size-3.5 shrink-0" />
                    <span className="truncate">{row.ctaLabel}</span>
                  </Link>
                </Button>
              </div>
            </HeaderedTableRow>
          ))}
        </HeaderedTableBody>
      </div>
    </HeaderedTable>
  );
}

export function PerformanceRoute() {
  const inventory = useInventory();
  const { currency, language, showRightRailCards, t, usdToKhrExchangeRate } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const routeState = readPerformanceRouteState(searchParams);
  const timeRange = routeState.range as PerformanceTimeRange;
  const scope = routeState.scope as PerformanceScope;
  const compareMode = routeState.compare;
  const { isHydratingDetails, serviceDetailsById, skuDetailsById } = useSenaDetailHydration('Recent');
  const demandCapacityBoardLayout = compareMode ? demandCapacityBoardCompareLayout : demandCapacityBoardNormalLayout;
  const visibleCatalog = useMemo(() => activeSenaCatalog(inventory.catalog), [inventory.catalog]);

  function updateRouteState(nextState: Parameters<typeof buildPerformanceSearchParams>[1], replace = false) {
    setSearchParams(buildPerformanceSearchParams(searchParams, nextState), { replace });
  }

  const model = useMemo(() => {
    if (!visibleCatalog || !inventory.workspaceSummary) {
      return null;
    }

    return derivePerformanceViewModel({
      catalog: visibleCatalog,
      compareMode,
      currency,
      usdToKhrExchangeRate,
      diagnostics: inventory.diagnostics,
      language,
      observations: inventory.observations,
      scope,
      serviceDetailsById,
      skuDetailsById,
      timeRange,
      workspaceSummary: inventory.workspaceSummary,
    });
  }, [
    currency,
    compareMode,
    visibleCatalog,
    inventory.diagnostics,
    inventory.observations,
    inventory.workspaceSummary,
    language,
    scope,
    serviceDetailsById,
    skuDetailsById,
    timeRange,
    usdToKhrExchangeRate,
  ]);
  const latestUpdateAt = latestObservationAt(inventory.observations);
  const latestUpdateAgeDays = intervalDaysBetween(latestUpdateAt, new Date().toISOString());

  if (!visibleCatalog || (visibleCatalog.skus.length === 0 && visibleCatalog.services.length === 0)) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title={t('performanceRouteEmptyCatalogTitle')}
          hint={t('performanceRouteEmptyCatalogHint')}
          action={
              <Button asChild>
                <Link to="/catalog/skus/new">
                  <ActionCreatePackageIcon data-icon="inline-start" />
                  {translateUiLiteral(language, 'Create first SKU')}
                </Link>
              </Button>
          }
        />
      </WorkspacePage>
    );
  }

  if (!inventory.workspaceSummary || !model) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title={t('performanceRouteEmptyWorkspaceTitle')}
          hint={t('performanceRouteEmptyWorkspaceHint')}
          action={
            <WorkspaceActionRow>
              <Button asChild>
                <Link to="/record-update">
                  <NavigationTaskListIcon data-icon="inline-start" />
                  {translateUiLiteral(language, 'Start update')}
                </Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/">
                  <NavigationDashboardIcon data-icon="inline-start" />
                  {translateUiLiteral(language, 'Open Overview')}
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
        eyebrow={translateUiLiteral(language, 'Performance')}
        title={t('performanceRouteTitle')}
        descriptor={t('performanceRouteDescriptor')}
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ToggleGroup
              aria-label={translateUiLiteral(language, 'Select performance time range')}
              className="rounded-full"
              spacing={1}
              type="single"
              value={timeRange}
              onValueChange={(nextValue) => {
                if (nextValue) {
                  updateRouteState({ range: nextValue as PerformanceTimeRange });
                }
              }}
            >
              <ToggleGroupItem value="7d">{translateUiLiteral(language, '7D')}</ToggleGroupItem>
              <ToggleGroupItem value="30d">{translateUiLiteral(language, '30D')}</ToggleGroupItem>
              <ToggleGroupItem value="90d">{translateUiLiteral(language, '90D')}</ToggleGroupItem>
            </ToggleGroup>

            <ToggleGroup
              aria-label={translateUiLiteral(language, 'Select performance scope')}
              className="rounded-full"
              spacing={1}
              type="single"
              value={scope}
              onValueChange={(nextValue) => {
                if (nextValue) {
                  updateRouteState({ scope: nextValue as PerformanceScope });
                }
              }}
            >
              <ToggleGroupItem value="all">
                <EntityLayersIcon data-icon="inline-start" />
                {t('performanceRouteScopeAll')}
              </ToggleGroupItem>
              <ToggleGroupItem value="services">
                <EntityServiceIcon data-icon="inline-start" />
                {t('performanceRouteScopeServices')}
              </ToggleGroupItem>
              <ToggleGroupItem value="skus">
                <EntitySkuIcon data-icon="inline-start" />
                {t('performanceRouteScopeSkus')}
              </ToggleGroupItem>
            </ToggleGroup>

            <SteeringPill active={compareMode} onClick={() => updateRouteState({ compare: !compareMode })}>
              <EntityComparisonIcon className="size-4" />
              {compareMode ? t('performanceRouteCompareView') : t('performanceRouteSingleView')}
            </SteeringPill>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{model.lastUpdatedLabel}</span>
          <span>
            {latestUpdateAt
              ? latestUpdateAgeDays == null
                ? t('performanceRouteRealWorldUpdateLoaded')
                : t('performanceRouteRealWorldUpdateAgo', { days: latestUpdateAgeDays })
              : t('performanceRouteNoRealWorldUpdate')}
          </span>
          {isHydratingDetails ? <span>{t('performanceRouteRefiningSignals')}</span> : null}
          <span>
            {scope === 'all'
              ? t('performanceRouteScopeMixed')
              : scope === 'services'
                ? t('performanceRouteScopeServicesOnly')
                : t('performanceRouteScopeSkusOnly')}
          </span>
          <span>
            {compareMode
              ? t('performanceRouteShowingCompare', {
                  current: model.windowLabel,
                  previous: model.previousWindowLabel,
                })
              : t('performanceRouteShowingSingle', { current: model.windowLabel })}
          </span>
        </div>
      </WorkspaceTitleCard>
      <section className={`${PERFORMANCE_HEADER_SURFACE_CLASS_NAME} overflow-hidden`}>
        <div className="grid divide-y divide-border/60 bg-border/40 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-5">
          {model.ribbon.map((metric) => (
            <div key={metric.key} className="bg-white px-5 py-4 sm:px-6">
              <p className="text-[0.72rem] font-medium tracking-[0.08em] text-muted-foreground/80">{metric.label}</p>
              <div className="mt-2">
                {metric.trendSignal ? (
                  <TrendSignalInline
                    label={metric.trendSignal.label}
                    labelBelow
                    points={metric.trendSignal.points}
                    splitIndex={metric.trendSignal.splitIndex}
                    tone={metric.trendSignal.tone}
                  />
                ) : (
                  <p className="text-[1.45rem] font-semibold tracking-[-0.04em] text-foreground">{metric.value}</p>
                )}
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{metric.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <div className={rightRailLayoutClassName(showRightRailCards)}>
        <div className="grid min-w-0 gap-6">
          <PerformanceSectionShell
            title={t('performanceRouteMoveNowTitle')}
            tooltip={t('performanceRouteMoveNowTooltip')}
            descriptor={t('performanceRouteMoveNowDescriptor')}
            contentClassName="px-0 py-0"
          >
            <MoveNowTable
              headers={{
                action: t('performanceRouteActionHeader'),
                actionTooltip: t('performanceRouteActionHeaderTooltip'),
                expectedEffect: t('performanceRouteExpectedEffectHeader'),
                expectedEffectTooltip: t('performanceRouteExpectedEffectHeaderTooltip'),
                move: t('performanceRouteMoveHeader'),
                moveTooltip: t('performanceRouteMoveHeaderTooltip'),
                whyNow: t('performanceRouteWhyNowHeader'),
                whyNowTooltip: t('performanceRouteWhyNowHeaderTooltip'),
              }}
              rows={model.moves}
            />
          </PerformanceSectionShell>

          <PerformanceSectionShell
            title={t('performanceRouteBoardTitle')}
            tooltip={t('performanceRouteBoardTooltip')}
            descriptor={t('performanceRouteBoardDescriptor')}
            contentClassName="px-0 py-0"
          >
            <HeaderedTable>
              <div className={demandCapacityBoardLayout.containerClassName} style={demandCapacityBoardLayout.style}>
                <HeaderedTableHeader className={demandCapacityBoardLayout.headerClassName}>
                  <HeaderedTableHeaderCell>
                    <HeaderTooltipLabel tooltip={t('performanceRouteItemHeaderTooltip')}>
                      {t('performanceRouteItemHeader')}
                    </HeaderTooltipLabel>
                  </HeaderedTableHeaderCell>
                  <HeaderedTableHeaderCell className="px-2">
                    <HeaderTooltipLabel tooltip={t('performanceRouteDemandTrendHeaderTooltip')}>
                      {t('performanceRouteDemandTrendHeader')}
                    </HeaderTooltipLabel>
                  </HeaderedTableHeaderCell>
                  <HeaderedTableHeaderCell>
                    <HeaderTooltipLabel tooltip={t('performanceRouteSupportHeaderTooltip')}>
                      {t('performanceRouteSupportHeader')}
                    </HeaderTooltipLabel>
                  </HeaderedTableHeaderCell>
                  <HeaderedTableHeaderCell>
                    <HeaderTooltipLabel tooltip={t('performanceRoutePipelineSupportHeaderTooltip')}>
                      {t('performanceRoutePipelineSupportHeader')}
                    </HeaderTooltipLabel>
                  </HeaderedTableHeaderCell>
                  <HeaderedTableHeaderCell>
                    <HeaderTooltipLabel tooltip={t('performanceRoutePriceMarginHeaderTooltip')}>
                      {t('performanceRoutePriceMarginHeader')}
                    </HeaderTooltipLabel>
                  </HeaderedTableHeaderCell>
                  <HeaderedTableHeaderCell align="center" className="px-2">
                    <HeaderTooltipLabel tooltip={t('performanceRouteStatusHeaderTooltip')}>
                      {t('performanceRouteStatusHeader')}
                    </HeaderTooltipLabel>
                  </HeaderedTableHeaderCell>
                </HeaderedTableHeader>
                <HeaderedTableBody className={demandCapacityBoardLayout.bodyClassName}>
                  {model.boardRows.map((row) => (
                    <HeaderedTableRow key={row.id} className={`${rowHoverClassName} ${demandCapacityBoardLayout.rowClassName}`}>
                    <div className="min-w-0">
                      <HeaderedTableMobileLabel className={demandCapacityBoardLayout.mobileLabelClassName}>
                        {t('performanceRouteItemHeader')}
                      </HeaderedTableMobileLabel>
                      <HeaderedTableCellStack
                        primary={
                          <div className="flex items-start gap-2.5">
                            <ItemTypeIcon type={row.type} />
                            <Link className="font-semibold text-foreground hover:text-primary" to={row.entityHref}>
                              {row.entity}
                            </Link>
                          </div>
                        }
                        secondary={row.compareEnabled && row.rowCompareSummary ? `${row.rowCompareSummary}.` : undefined}
                        primaryClassName="font-semibold"
                      />
                    </div>
                    <div className="min-w-0 px-2">
                      <HeaderedTableMobileLabel className={demandCapacityBoardLayout.mobileLabelClassName}>
                        {t('performanceRouteDemandTrendHeader')}
                      </HeaderedTableMobileLabel>
                      <HeaderedTableCellStack
                        primary={
                          row.demandTrendSignal ? (
                            <TrendSignalInline
                              label={row.demandTrendSignal.label}
                              labelBelow
                              points={row.demandTrendSignal.points}
                              size="compact"
                              splitIndex={row.demandTrendSignal.splitIndex}
                              tone={row.demandTrendSignal.tone}
                            />
                          ) : (
                            row.demandTrend
                          )
                        }
                        primaryClassName="text-sm"
                      />
                    </div>
                    <div className="min-w-0">
                      <HeaderedTableMobileLabel className={demandCapacityBoardLayout.mobileLabelClassName}>
                        {t('performanceRouteSupportHeader')}
                      </HeaderedTableMobileLabel>
                      <HeaderedTableCellStack
                        primary={row.supportStatus}
                        secondary={row.compareEnabled ? row.supportCompareText : undefined}
                        primaryClassName="text-sm"
                      />
                    </div>
                    <div className="min-w-0">
                      <HeaderedTableMobileLabel className={demandCapacityBoardLayout.mobileLabelClassName}>
                        {t('performanceRoutePipelineSupportHeader')}
                      </HeaderedTableMobileLabel>
                      <HeaderedTableCellStack
                        primary={
                          <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
                            <span>{row.pipelineSupport}</span>
                            {row.restockGuidance ? (
                              <span className="rounded-full border border-primary/25 bg-primary/10 px-2 py-0.5 text-[0.7rem] font-medium text-primary">
                                {row.restockGuidance}
                              </span>
                            ) : null}
                          </span>
                        }
                        secondary={row.compareEnabled ? row.pipelineCompareText : undefined}
                        primaryClassName="text-sm"
                      />
                    </div>
                    <div className="min-w-0">
                      <HeaderedTableMobileLabel className={demandCapacityBoardLayout.mobileLabelClassName}>
                        {t('performanceRoutePriceMarginHeader')}
                      </HeaderedTableMobileLabel>
                      <HeaderedTableCellStack
                        primary={row.priceMarginTone}
                        secondary={row.compareEnabled ? row.priceMarginCompareText : undefined}
                        primaryClassName="text-sm"
                      />
                    </div>
                    <div className="flex items-start px-2 xl:justify-center">
                      {row.compareEnabled && row.previousStatusLabel && row.previousStatusTone ? (
                        <div className="inline-flex items-center gap-2 whitespace-nowrap xl:justify-center">
                          <span
                            className={`${performanceStatusPillClassName} ${statusPillClassName(
                              row.previousStatusTone,
                            )}`}
                          >
                            {row.previousStatusLabel}
                          </span>
                          <NavigationForwardIcon className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className={`${performanceStatusPillClassName} ${statusPillClassName(row.statusTone)}`}>
                            {row.statusLabel}
                          </span>
                        </div>
                      ) : (
                        <span className={`${performanceStatusPillClassName} ${statusPillClassName(row.statusTone)}`}>
                          {row.statusLabel}
                        </span>
                      )}
                    </div>
                    </HeaderedTableRow>
                  ))}
                </HeaderedTableBody>
              </div>
            </HeaderedTable>
          </PerformanceSectionShell>

          <PerformanceSectionShell
            title={t('performanceRouteCashTitle')}
            tooltip={t('performanceRouteCashTooltip')}
            descriptor={t('performanceRouteCashDescriptor')}
          >
            <div className="grid gap-6 xl:grid-cols-3">
              <CashBandColumn
                band="winners"
                emptyMessage={t('performanceRouteBandEmpty')}
                rows={model.winners}
                title={t('performanceRouteBandWinners')}
                tooltip={t('performanceRouteBandWinnersTooltip')}
              />
              <CashBandColumn
                band="blockedProfit"
                emptyMessage={t('performanceRouteBandEmpty')}
                rows={model.blockedProfit}
                title={t('performanceRouteBandBlockedProfit')}
                tooltip={t('performanceRouteBandBlockedProfitTooltip')}
              />
              <CashBandColumn
                band="cashTraps"
                emptyMessage={t('performanceRouteBandEmpty')}
                rows={model.cashTraps}
                title={t('performanceRouteBandCashTraps')}
                tooltip={t('performanceRouteBandCashTrapsTooltip')}
              />
            </div>
          </PerformanceSectionShell>
        </div>

        {showRightRailCards ? (
          <aside className={RIGHT_RAIL_ASIDE_CLASS_NAME}>
          <PerformanceRightRailBlock
            title={t('performanceRouteOperationalDragTitle')}
            tooltip={t('performanceRouteOperationalDragTooltip')}
          >
            <div className="space-y-3">
              {model.operationalDrag.map((line) => (
                <p key={line} className="text-sm leading-6 text-muted-foreground">
                  {line}
                </p>
              ))}
            </div>
          </PerformanceRightRailBlock>

          <PerformanceRightRailBlock
            title={t('performanceRouteRecoveryPipelineTitle')}
            tooltip={t('performanceRouteRecoveryPipelineTooltip')}
          >
            <div className="divide-y divide-border/60">
              {model.recoveryPipeline.map((row) => (
                <Link key={row.id} className="block py-3 first:pt-0 last:pb-0" to={row.href}>
                  <p className="font-medium text-foreground">{row.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{row.detail}</p>
                </Link>
              ))}
            </div>
          </PerformanceRightRailBlock>

          <PerformanceRightRailBlock
            title={t('performanceRoutePriceWatchTitle')}
            tooltip={t('performanceRoutePriceWatchTooltip')}
          >
            <div className="divide-y divide-border/60">
              {model.priceWatch.map((row) => (
                <Link key={row.id} className="block py-3 first:pt-0 last:pb-0" to={row.href}>
                  <p className="font-medium text-foreground">{row.label}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{row.detail}</p>
                </Link>
              ))}
            </div>
          </PerformanceRightRailBlock>

          <PerformanceRightRailBlock
            title={t('performanceRouteConfidenceTitle')}
            tooltip={t('performanceRouteConfidenceTooltip')}
          >
            <div className="space-y-3">
              <p className="text-sm leading-6 text-muted-foreground">
                {latestUpdateAt
                  ? t('performanceRouteConfidenceLastUpdate', {
                      value:
                        latestUpdateAgeDays == null
                          ? model.lastUpdatedLabel
                          : translateUiLiteral(language, '{days} days ago', { days: latestUpdateAgeDays }),
                    })
                  : t('performanceRouteConfidenceThin')}
              </p>
              <p className="text-sm leading-6 text-muted-foreground">
                {t('performanceRouteConfidenceSignalCoverage', { value: model.confidence.coverageLabel })}
              </p>
              <p className="text-sm leading-6 text-muted-foreground">{model.confidence.evidenceLabel}</p>
              <p className="text-sm leading-6 text-muted-foreground">
                {t('performanceRouteConfidenceLeastCertain', { value: model.confidence.weakSpotLabel })}
              </p>
              <Button asChild className="w-full" size="sm" variant="outline">
                <Link to="/record-update">
                  <ActionOpenExternalIcon className="size-4" />
                  {translateUiLiteral(language, 'Start update')}
                </Link>
              </Button>
            </div>
          </PerformanceRightRailBlock>
          </aside>
        ) : null}
      </div>

      <PerformanceSectionShell
        title={t('performanceRouteTimelineTitle')}
        tooltip={t('performanceRouteTimelineTooltip')}
        descriptor={t('performanceRouteTimelineDescriptor')}
      >
        <div className="flex flex-wrap gap-y-3 pt-2">
          {model.timeline.map((event, index) => (
            <TimelineStep key={event.id} event={event} showConnector={index < model.timeline.length - 1} />
          ))}
        </div>
      </PerformanceSectionShell>
    </WorkspacePage>
  );
}
