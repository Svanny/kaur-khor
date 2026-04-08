import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ArrowUpRight, BadgeDollarSign, GitCompareArrows, Layers3, Package, PiggyBank, RefreshCw, Store, Trophy, TrendingUp, Truck, TriangleAlert } from 'lucide-react';
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
          <ArrowRight className="size-3.5 text-muted-foreground" />
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
    return <Store className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />;
  }

  return <Package className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />;
}

function CashBandColumn({
  title,
  tooltip,
  rows,
}: {
  title: string;
  tooltip: string;
  rows: PerformanceBandEntry[];
}) {
  const HeaderIcon = title === 'Winners' ? Trophy : title === 'Blocked profit' ? TriangleAlert : PiggyBank;

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
            No items are stacking up in this band right now.
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
      ? TrendingUp
      : event.id === 'timeline-stockout'
        ? TriangleAlert
        : event.id === 'timeline-receipt'
          ? Truck
          : event.id === 'timeline-price'
            ? BadgeDollarSign
            : RefreshCw;

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
            <ArrowUpRight className="size-4 rotate-45" />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MoveNowTable({ rows }: { rows: PerformanceMoveRow[] }) {
  return (
    <HeaderedTable>
      <div className={moveNowTableLayout.containerClassName} style={moveNowTableLayout.style}>
        <HeaderedTableHeader className={moveNowTableLayout.headerClassName}>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel tooltip="Banji's recommended business move for this row.">
              Move
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel tooltip="The business conditions making this move timely right now.">
              Why now
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel tooltip="The business result Banji expects if you act now.">
              Expected effect
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">
            <HeaderTooltipLabel tooltip="Where to go in Banji to follow up on this row.">
              Action
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
                <HeaderedTableMobileLabel className={moveNowTableLayout.mobileLabelClassName}>Why now</HeaderedTableMobileLabel>
                <p className="text-sm leading-6 text-muted-foreground">{row.whyNow}</p>
              </div>
              <div className="min-w-0">
                <HeaderedTableMobileLabel className={moveNowTableLayout.mobileLabelClassName}>
                  Expected effect
                </HeaderedTableMobileLabel>
                <p className="text-sm leading-6 text-muted-foreground">{row.expectedEffect}</p>
              </div>
              <div className="flex items-start lg:justify-center">
                <Button asChild className="w-full justify-center lg:w-[132px]" size="sm" variant={row.tone === 'danger' ? 'default' : 'outline'}>
                  <Link className="inline-flex w-full items-center justify-center gap-2" to={row.ctaHref}>
                    <ArrowUpRight className="size-3.5 shrink-0" />
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
  const { currency, language, showRightRailCards, usdToKhrExchangeRate } = usePreferences();
  const [timeRange, setTimeRange] = useState<PerformanceTimeRange>('30d');
  const [scope, setScope] = useState<PerformanceScope>('all');
  const [compareMode, setCompareMode] = useState(true);
  const { isHydratingDetails, serviceDetailsById, skuDetailsById } = useSenaDetailHydration('Recent');
  const demandCapacityBoardLayout = compareMode ? demandCapacityBoardCompareLayout : demandCapacityBoardNormalLayout;

  const model = useMemo(() => {
    if (!inventory.catalog || !inventory.workspaceSummary) {
      return null;
    }

    return derivePerformanceViewModel({
      catalog: inventory.catalog,
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
    inventory.catalog,
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

  if (!inventory.catalog) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title="Performance needs the catalog first"
          hint="Create the first SKU so Banji can compare demand, coverage, and price in one business view."
          action={
            <Button asChild>
              <Link to="/catalog/skus/new">Create first SKU</Link>
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
          title="Performance needs the first SENA run"
          hint="Capture a live observation so Banji can read demand, capacity, pipeline, and price together."
          action={
            <WorkspaceActionRow>
              <Button asChild>
                <Link to="/record-update">Start update</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/">Open Overview</Link>
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
        eyebrow="Performance"
        title="Business Health"
        descriptor="Demand, capacity, pipeline, and pricing in one business view."
        actions={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <ToggleGroup
              aria-label="Select performance time range"
              className="rounded-full"
              spacing={1}
              type="single"
              value={timeRange}
              onValueChange={(nextValue) => {
                if (nextValue) {
                  setTimeRange(nextValue as PerformanceTimeRange);
                }
              }}
            >
              <ToggleGroupItem value="7d">7D</ToggleGroupItem>
              <ToggleGroupItem value="30d">30D</ToggleGroupItem>
              <ToggleGroupItem value="90d">90D</ToggleGroupItem>
            </ToggleGroup>

            <ToggleGroup
              aria-label="Select performance scope"
              className="rounded-full"
              spacing={1}
              type="single"
              value={scope}
              onValueChange={(nextValue) => {
                if (nextValue) {
                  setScope(nextValue as PerformanceScope);
                }
              }}
            >
              <ToggleGroupItem value="all">
                <Layers3 data-icon="inline-start" />
                All
              </ToggleGroupItem>
              <ToggleGroupItem value="services">
                <Store data-icon="inline-start" />
                Services
              </ToggleGroupItem>
              <ToggleGroupItem value="skus">
                <Package data-icon="inline-start" />
                SKUs
              </ToggleGroupItem>
            </ToggleGroup>

            <SteeringPill active={compareMode} onClick={() => setCompareMode((current) => !current)}>
              <GitCompareArrows className="size-4" />
              {compareMode ? 'Compare View' : 'Single View'}
            </SteeringPill>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{model.lastUpdatedLabel}</span>
          <span>
            {latestUpdateAt
              ? `Real-world update ${latestUpdateAgeDays == null ? 'loaded' : `${latestUpdateAgeDays}d ago`}`
              : 'No real-world update yet'}
          </span>
          {isHydratingDetails ? <span>Refining pipeline and capacity signals…</span> : null}
          <span>{scope === 'all' ? 'Mixed portfolio view' : scope === 'services' ? 'Service posture only' : 'SKU posture only'}</span>
          <span>{compareMode ? `Showing ${model.windowLabel} posture vs ${model.previousWindowLabel}` : `Showing ${model.windowLabel} posture only`}</span>
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
            title="Move now"
            tooltip="The current queue of commercial moves Banji recommends."
            descriptor="Business moves worth making now, ranked by urgency and upside."
            contentClassName="px-0 py-0"
          >
            <MoveNowTable rows={model.moves} />
          </PerformanceSectionShell>

          <PerformanceSectionShell
            title="Demand × capacity board"
            tooltip="A mixed portfolio view of demand, support, pipeline, and margin posture."
            descriptor="Scan services and SKUs together in one pass."
            contentClassName="px-0 py-0"
          >
            <HeaderedTable>
              <div className={demandCapacityBoardLayout.containerClassName} style={demandCapacityBoardLayout.style}>
                <HeaderedTableHeader className={demandCapacityBoardLayout.headerClassName}>
                  <HeaderedTableHeaderCell>
                    <HeaderTooltipLabel tooltip="The service or SKU in this portfolio scan.">
                      Item
                    </HeaderTooltipLabel>
                  </HeaderedTableHeaderCell>
                  <HeaderedTableHeaderCell className="px-2">
                    <HeaderTooltipLabel tooltip="Recent demand direction for the selected window.">
                      Demand trend
                    </HeaderTooltipLabel>
                  </HeaderedTableHeaderCell>
                  <HeaderedTableHeaderCell>
                    <HeaderTooltipLabel tooltip="How much current demand can actually be fulfilled with current support.">
                      Sellable / support
                    </HeaderTooltipLabel>
                  </HeaderedTableHeaderCell>
                  <HeaderedTableHeaderCell>
                    <HeaderTooltipLabel tooltip="Whether inbound supply is likely to relieve pressure soon.">
                      Pipeline support
                    </HeaderTooltipLabel>
                  </HeaderedTableHeaderCell>
                  <HeaderedTableHeaderCell>
                    <HeaderTooltipLabel tooltip="Whether pricing and margin conditions are helping, neutral, or under pressure.">
                      Price / margin tone
                    </HeaderTooltipLabel>
                  </HeaderedTableHeaderCell>
                  <HeaderedTableHeaderCell align="center" className="px-2">
                    <HeaderTooltipLabel tooltip="Banji's current steering recommendation for this row.">
                      Status
                    </HeaderTooltipLabel>
                  </HeaderedTableHeaderCell>
                </HeaderedTableHeader>
                <HeaderedTableBody className={demandCapacityBoardLayout.bodyClassName}>
                  {model.boardRows.map((row) => (
                    <HeaderedTableRow key={row.id} className={`${rowHoverClassName} ${demandCapacityBoardLayout.rowClassName}`}>
                    <div className="min-w-0">
                      <HeaderedTableMobileLabel className={demandCapacityBoardLayout.mobileLabelClassName}>
                        Item
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
                        Demand trend
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
                        Sellable / support
                      </HeaderedTableMobileLabel>
                      <HeaderedTableCellStack
                        primary={row.supportStatus}
                        secondary={row.compareEnabled ? row.supportCompareText : undefined}
                        primaryClassName="text-sm"
                      />
                    </div>
                    <div className="min-w-0">
                      <HeaderedTableMobileLabel className={demandCapacityBoardLayout.mobileLabelClassName}>
                        Pipeline support
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
                        Price / margin tone
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
                            className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(
                              row.previousStatusTone,
                            )}`}
                          >
                            {row.previousStatusLabel}
                          </span>
                          <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                          <span className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(row.statusTone)}`}>
                            {row.statusLabel}
                          </span>
                        </div>
                      ) : (
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(row.statusTone)}`}>
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
            title="Cash and profit efficiency"
            tooltip="Portfolio grouping by upside capture, blocked profit, and trapped cash."
            descriptor="Where to push, recover, or clear inventory next."
          >
            <div className="grid gap-6 xl:grid-cols-3">
              <CashBandColumn
                rows={model.winners}
                title="Winners"
                tooltip="Rows with healthy demand, healthy margin, and enough support to capture upside."
              />
              <CashBandColumn
                rows={model.blockedProfit}
                title="Blocked profit"
                tooltip="Rows where demand exists but revenue is blocked by stock, capacity, or inbound timing."
              />
              <CashBandColumn
                rows={model.cashTraps}
                title="Cash traps"
                tooltip="Rows where weak demand is tying up inventory or inbound cash."
              />
            </div>
          </PerformanceSectionShell>
        </div>

        {showRightRailCards ? (
          <aside className={RIGHT_RAIL_ASIDE_CLASS_NAME}>
          <PerformanceRightRailBlock
            title="Operational drag"
            tooltip="Operational constraints currently limiting business performance."
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
            title="Recovery pipeline"
            tooltip="Inbound events already underway that could restore capacity or ease a bottleneck."
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
            title="Price and margin watch"
            tooltip="Rows where price or margin conditions may need attention."
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
            title="Confidence / coverage"
            tooltip="How much evidence supports this view and where it is weakest."
          >
            <div className="space-y-3">
              <p className="text-sm leading-6 text-muted-foreground">
                {latestUpdateAt
                  ? `Last real-world update ${latestUpdateAgeDays == null ? model.lastUpdatedLabel : `${latestUpdateAgeDays} days ago`}`
                  : 'Coverage thin · no real-world update yet'}
              </p>
              <p className="text-sm leading-6 text-muted-foreground">Signal coverage {model.confidence.coverageLabel}</p>
              <p className="text-sm leading-6 text-muted-foreground">{model.confidence.evidenceLabel}</p>
              <p className="text-sm leading-6 text-muted-foreground">Least certain {model.confidence.weakSpotLabel}</p>
              <Button asChild className="w-full" size="sm" variant="outline">
                <Link to="/record-update">
                  <ArrowUpRight className="size-4" />
                  Start update
                </Link>
              </Button>
            </div>
          </PerformanceRightRailBlock>
          </aside>
        ) : null}
      </div>

      <PerformanceSectionShell
        title="Business timeline"
        tooltip="The main shifts that shaped the current business posture."
        descriptor="What has been changing across the business posture."
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
