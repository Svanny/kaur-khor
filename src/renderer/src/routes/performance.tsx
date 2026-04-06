import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
import { statusPillClassName, surfacePillClassName, tintedSurfaceClassName } from '@/lib/state-tones';
import { SectionLabel } from '@/routes/sku-detail/section-heading';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
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
  const [isHovered, setIsHovered] = useState(false);
  const [suppressHoverUntilLeave, setSuppressHoverUntilLeave] = useState(false);
  const previousActiveRef = useRef(active);

  useEffect(() => {
    if (previousActiveRef.current && !active && isHovered) {
      setSuppressHoverUntilLeave(true);
    }
    previousActiveRef.current = active;
  }, [active, isHovered]);

  const idleClassName = 'border-border/70 bg-background/70 text-muted-foreground';

  return (
    <button
      aria-pressed={active}
      className={`inline-flex h-[48px] items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-medium transition-colors ${
        active ? surfacePillClassName('selected') : suppressHoverUntilLeave ? idleClassName : surfacePillClassName('default')
      }`}
      data-hover-suppressed={suppressHoverUntilLeave ? 'true' : 'false'}
      type="button"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => {
        setIsHovered(false);
        setSuppressHoverUntilLeave(false);
      }}
      onClick={onClick}
    >
      <span className="inline-flex items-center gap-1.5">{children}</span>
    </button>
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
            <HeaderTooltipLabel tooltip="The commercial intervention Banji is recommending, distinct from the operational queue in Overview. Typical move states are push when demand and support are healthy, recover when revenue is blocked, review pricing when price or margin is weakening, and clear when slow stock is trapping cash.">
              Move
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel tooltip="The business conditions making the move timely right now. Reasons usually combine demand direction, capacity or cover state, inbound timing, and margin posture such as demand up plus capacity holding, blocked by supply with late inbound, or margin pressure after a price move.">
              Why now
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell>
            <HeaderTooltipLabel tooltip="The business outcome Banji expects if the owner takes this move now. Effects typically read as capture upside, restore sellable capacity, recover blocked revenue, protect margin, or free cash from slow inventory.">
              Expected effect
            </HeaderTooltipLabel>
          </HeaderedTableHeaderCell>
          <HeaderedTableHeaderCell align="center">
            <HeaderTooltipLabel tooltip="The next destination in the SENA workflow. Open queue sends the user to operational follow-up in Overview, Open SKU goes to inventory and pipeline control, Open service goes to sellability and bottlenecks, and See evidence would jump into scoped analysis.">
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
  const { currency, language, showRightRailCards } = usePreferences();
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
  ]);

  if (!inventory.catalog) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title="Performance needs the catalog first"
          description="Build the SENA catalog so Banji can turn inventory, services, and pricing into a business steering surface."
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
          description="Capture a live observation or trigger a fresh run so Banji can translate demand, capacity, pipeline, and pricing into business posture."
          action={
            <WorkspaceActionRow>
              <Button asChild>
                <Link to="/operations/session">New observation</Link>
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
        description="Demand, capacity, pipeline, and pricing in one business view"
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
              Compare
            </SteeringPill>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{model.lastUpdatedLabel}</span>
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
            tooltip="Commercial interventions belong here. Overview owns the operational queue; Performance owns the business move."
            description="The highest-value commercial moves across services and SKUs, ordered by where Banji sees the next steering intervention."
            contentClassName="px-0 py-0"
          >
            <MoveNowTable rows={model.moves} />
          </PerformanceSectionShell>

          <PerformanceSectionShell
            title="Demand × capacity board"
            tooltip="Demand alone is not enough. Capacity, pipeline support, and margin posture change the real business picture."
            description="A mixed scan across services and SKUs so the owner can read the portfolio in one pass rather than splitting by subsystem."
            contentClassName="px-0 py-0"
          >
            <HeaderedTable>
              <div className={demandCapacityBoardLayout.containerClassName} style={demandCapacityBoardLayout.style}>
                <HeaderedTableHeader className={demandCapacityBoardLayout.headerClassName}>
                  <HeaderedTableHeaderCell>
                    <HeaderTooltipLabel tooltip="The service or SKU Banji is evaluating in the mixed business scan. The icon shows which subsystem it comes from: storefront icon for services and package icon for SKUs.">
                      Item
                    </HeaderTooltipLabel>
                  </HeaderedTableHeaderCell>
                  <HeaderedTableHeaderCell className="px-2">
                    <HeaderTooltipLabel tooltip="A compact demand read for the selected window. In normal mode the sparkline shows the recent shape and the label resolves to Soft, Steady, or Strong. In compare mode the split sparkline shows previous plus current interval, and the label reads as a transition such as Soft to Steady or Steady to Strong.">
                      Demand trend
                    </HeaderTooltipLabel>
                  </HeaderedTableHeaderCell>
                  <HeaderedTableHeaderCell>
                    <HeaderTooltipLabel tooltip="How much of current demand is actually sellable or coverable once supply and service constraints are considered. Common states are Capacity holding when service demand is largely coverable, Partially coverable when pressure is rising but not fully blocked, Blocked by supply when the item is materially constrained, and cover up or cover down compare text when the situation improved or worsened against the prior window.">
                      Sellable / support
                    </HeaderTooltipLabel>
                  </HeaderedTableHeaderCell>
                  <HeaderedTableHeaderCell>
                    <HeaderTooltipLabel tooltip="Inbound orders, receipts, and timing signals that may relieve pressure or restore capacity. Typical states are No inbound relief, Due soon, In transit, Overdue, and Partial received. In compare mode the secondary line explains whether inbound is new, unchanged, slipped, or already closed by a receipt landing.">
                      Pipeline support
                    </HeaderTooltipLabel>
                  </HeaderedTableHeaderCell>
                  <HeaderedTableHeaderCell>
                    <HeaderTooltipLabel tooltip="A commercial read on price posture and margin quality. Primary states include Healthy margin, Stable margin, Margin pressure, and price annotations such as price up or price drag. In compare mode the secondary line explains whether margin recovered, price drag worsened, a new price move appeared, or the posture was unchanged.">
                      Price / margin tone
                    </HeaderTooltipLabel>
                  </HeaderedTableHeaderCell>
                  <HeaderedTableHeaderCell align="center" className="px-2">
                    <HeaderTooltipLabel tooltip="Banji's steering recommendation for the row. The main pill resolves to Push when upside should be pressed, Unblock when stock or capacity is suppressing revenue, Review price when pricing or margin needs intervention, Clear when slow stock is tying up cash, and Steady when no major action is needed. In compare mode the status cell shows a direct transition from the previous pill to the current pill.">
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
                        primary={row.pipelineSupport}
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
            tooltip="SKU and service truths become portfolio decisions here: where to press, where profit is blocked, and where cash is trapped."
            description="Three business bands for deciding what to push, what to recover, and what to clear before it weighs on the next period."
          >
            <div className="grid gap-6 xl:grid-cols-3">
              <CashBandColumn
                rows={model.winners}
                title="Winners"
                tooltip="High demand, healthy margin, and strong support."
              />
              <CashBandColumn
                rows={model.blockedProfit}
                title="Blocked profit"
                tooltip="Demand is present but stock, capacity, or inbound timing is holding back revenue."
              />
              <CashBandColumn
                rows={model.cashTraps}
                title="Cash traps"
                tooltip="Weak demand with inventory or inbound weight that is tying up cash."
              />
            </div>
          </PerformanceSectionShell>
        </div>

        {showRightRailCards ? (
          <aside className={RIGHT_RAIL_ASIDE_CLASS_NAME}>
          <PerformanceRightRailBlock
            title="Operational drag"
            tooltip="A short bridge back to Overview: the operational constraints that are currently holding the business back."
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
            tooltip="Inbound events already in motion that can restore sellable capacity or ease a bottleneck."
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
            tooltip="Commercial entities where margin pressure or price-response signals deserve a closer read."
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
            tooltip="Quiet trust context: signal coverage, evidence freshness, and where the page is least certain."
          >
            <div className="space-y-3">
              <p className="text-sm leading-6 text-muted-foreground">Signal coverage {model.confidence.coverageLabel}</p>
              <p className="text-sm leading-6 text-muted-foreground">{model.confidence.evidenceLabel}</p>
              <p className="text-sm leading-6 text-muted-foreground">Least certain {model.confidence.weakSpotLabel}</p>
            </div>
          </PerformanceRightRailBlock>
          </aside>
        ) : null}
      </div>

      <PerformanceSectionShell
        title="Business timeline"
        tooltip="A business memory lane, not a technical evidence ledger. Demand shifts, pricing moves, stock episodes, and recovery moments sit together here."
        description="A compact temporal read of what has been changing in the business posture."
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
