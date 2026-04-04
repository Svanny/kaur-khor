import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, Layers3, Package, Store } from 'lucide-react';
import { WorkspaceActionRow, WorkspaceEmpty, WorkspacePage, WorkspaceTitleCard } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { statusPillClassName } from '@/lib/status-pill';
import { SectionLabel, SectionTitle } from '@/routes/sku-detail/section-heading';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import {
  derivePerformanceViewModel,
  type PerformanceBandEntry,
  type PerformanceMoveRow,
  type PerformanceScope,
  type PerformanceTimeRange,
  type PerformanceTimelineEvent,
} from './performance/view-model';

const HEADER_SURFACE_CLASS_NAME = `${cardFrameClassName} ${cardSurfaceClassName} rounded-[2rem]`;
const RAIL_BLOCK_CLASS_NAME = `${cardFrameClassName} ${cardSurfaceClassName} rounded-[1.4rem]`;

function SectionShell({
  title,
  tooltip,
  description,
  children,
}: {
  title: string;
  tooltip: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className={HEADER_SURFACE_CLASS_NAME}>
      <div className="border-b border-border/60 px-6 py-4">
        <div className="flex flex-col gap-2">
          <SectionTitle title={title} tooltip={tooltip} />
          {description ? <p className="max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      <div className="px-6 py-5">{children}</div>
    </section>
  );
}

function RightRailBlock({
  title,
  tooltip,
  children,
}: {
  title: string;
  tooltip: string;
  children: ReactNode;
}) {
  return (
    <section className={RAIL_BLOCK_CLASS_NAME}>
      <div className="border-b border-border/60 px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <SectionLabel tooltip={tooltip}>{title}</SectionLabel>
        </h3>
      </div>
      <div className="px-4 py-4">{children}</div>
    </section>
  );
}

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
    <button
      aria-pressed={active}
      className={`inline-flex h-9 items-center justify-center rounded-full border px-4 text-sm font-medium transition-colors ${
        active
          ? 'border-border/80 bg-card text-foreground shadow-[0_1px_2px_rgba(27,15,7,0.08)]'
          : 'border-border/70 bg-background/70 text-muted-foreground hover:bg-card hover:text-foreground'
      }`}
      type="button"
      onClick={onClick}
    >
      {children}
    </button>
  );
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
  return (
    <div className="min-w-0">
      <div className="border-b border-border/60 pb-3">
        <h3 className="text-lg font-semibold tracking-[-0.02em] text-foreground">
          <SectionLabel tooltip={tooltip}>{title}</SectionLabel>
        </h3>
      </div>
      <div className="mt-4 space-y-3">
        {rows.length > 0 ? (
          rows.map((row) => (
            <Link
              key={row.id}
              className={`block rounded-[1.2rem] border border-border/60 bg-background/80 px-4 py-3 transition-colors ${rowHoverClassName}`}
              to={row.href}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="font-medium text-foreground">{row.label}</p>
                <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(row.tone)}`}>
                  {title}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{row.summary}</p>
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

function TimelineStep({ event }: { event: PerformanceTimelineEvent }) {
  return (
    <div className="group flex min-w-[220px] flex-1 items-stretch">
      <div className="flex min-w-0 flex-1 items-center rounded-[1.3rem] border border-border/60 bg-background/85 px-4 py-4 shadow-[0_10px_24px_rgba(48,31,20,0.05)] transition-transform group-hover:-translate-y-0.5 motion-reduce:transform-none">
        <div className="min-w-0">
          <p className="text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">{event.title}</p>
          <p className="mt-2 font-semibold text-foreground">{event.subtitle}</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">{event.detail}</p>
        </div>
      </div>
      <div className="hidden w-6 items-center justify-center text-border lg:flex">
        <ArrowUpRight className="size-4 rotate-45" />
      </div>
    </div>
  );
}

function MoveNowTable({ rows }: { rows: PerformanceMoveRow[] }) {
  return (
    <div className="overflow-hidden rounded-[1.4rem] border border-border/60 bg-background/70">
      <div className="hidden border-b border-border/60 bg-secondary/20 px-5 py-3 lg:grid lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)_140px] lg:gap-5">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Move</p>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Why now</p>
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Expected effect</p>
        <p className="text-center text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">CTA</p>
      </div>
      <div className="divide-y divide-border/60">
        {rows.map((row) => (
          <div
            key={row.id}
            className={`grid gap-4 px-5 py-5 transition-colors ${rowHoverClassName} lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,1fr)_140px] lg:gap-5`}
          >
            <div className="min-w-0">
              <p className="font-semibold text-foreground">{row.move}</p>
            </div>
            <div className="min-w-0">
              <p className="text-sm leading-6 text-muted-foreground">{row.whyNow}</p>
            </div>
            <div className="min-w-0">
              <p className="text-sm leading-6 text-muted-foreground">{row.expectedEffect}</p>
            </div>
            <div className="flex items-start lg:justify-center">
              <Button asChild className="w-full justify-center lg:w-[132px]" size="sm" variant={row.tone === 'danger' ? 'default' : 'outline'}>
                <Link to={row.ctaHref}>{row.ctaLabel}</Link>
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function PerformanceRoute() {
  const inventory = useInventory();
  const { currency, language } = usePreferences();
  const [timeRange, setTimeRange] = useState<PerformanceTimeRange>('30d');
  const [scope, setScope] = useState<PerformanceScope>('all');
  const [compareMode, setCompareMode] = useState(true);
  const [skuDetailsById, setSkuDetailsById] = useState<Record<string, Awaited<ReturnType<typeof inventory.loadSenaSkuDetail>>>>({});
  const [serviceDetailsById, setServiceDetailsById] = useState<Record<string, Awaited<ReturnType<typeof inventory.loadSenaServiceDetail>>>>({});
  const [isHydratingDetails, setIsHydratingDetails] = useState(false);

  useEffect(() => {
    if (!inventory.catalog || !inventory.workspaceSummary) {
      setSkuDetailsById({});
      setServiceDetailsById({});
      setIsHydratingDetails(false);
      return;
    }

    let active = true;
    setIsHydratingDetails(true);

    void Promise.all([
      Promise.all(
        inventory.catalog.skus.map(async (sku) => {
          try {
            return [sku.skuId, await inventory.loadSenaSkuDetail(sku.skuId)] as const;
          } catch {
            return [sku.skuId, null] as const;
          }
        }),
      ),
      Promise.all(
        inventory.catalog.services.map(async (service) => {
          try {
            return [service.serviceId, await inventory.loadSenaServiceDetail(service.serviceId)] as const;
          } catch {
            return [service.serviceId, null] as const;
          }
        }),
      ),
    ])
      .then(([skuEntries, serviceEntries]) => {
        if (!active) {
          return;
        }
        setSkuDetailsById(Object.fromEntries(skuEntries));
        setServiceDetailsById(Object.fromEntries(serviceEntries));
        setIsHydratingDetails(false);
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setIsHydratingDetails(false);
      });

    return () => {
      active = false;
    };
  }, [inventory, inventory.catalog, inventory.workspaceSummary]);

  const model = useMemo(() => {
    if (!inventory.catalog || !inventory.workspaceSummary) {
      return null;
    }

    return derivePerformanceViewModel({
      catalog: inventory.catalog,
      currency,
      diagnostics: inventory.diagnostics,
      language,
      observations: inventory.observations,
      scope,
      serviceDetailsById,
      skuDetailsById,
      workspaceSummary: inventory.workspaceSummary,
    });
  }, [
    currency,
    inventory.catalog,
    inventory.diagnostics,
    inventory.observations,
    inventory.workspaceSummary,
    language,
    scope,
    serviceDetailsById,
    skuDetailsById,
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
        title="Performance"
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
              <ToggleGroupItem value="7d">7d</ToggleGroupItem>
              <ToggleGroupItem value="30d">30d</ToggleGroupItem>
              <ToggleGroupItem value="90d">90d</ToggleGroupItem>
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
              vs previous
            </SteeringPill>

            <Button disabled size="sm" variant="outline">
              Analysis
            </Button>
          </div>
        }
      >
        <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span>{model.lastUpdatedLabel}</span>
          {isHydratingDetails ? <span>Refining pipeline and capacity signals…</span> : null}
          <span>{scope === 'all' ? 'Mixed portfolio view' : scope === 'services' ? 'Service posture only' : 'SKU posture only'}</span>
          <span>{compareMode ? `Showing ${timeRange} posture vs previous window` : `Showing ${timeRange} posture only`}</span>
        </div>
      </WorkspaceTitleCard>

      <section className={`${HEADER_SURFACE_CLASS_NAME} overflow-hidden`}>
        <div className="grid divide-y divide-border/60 bg-border/40 md:grid-cols-2 md:divide-x md:divide-y-0 xl:grid-cols-5">
          {model.ribbon.map((metric) => (
            <div key={metric.key} className="bg-white px-5 py-4 sm:px-6">
              <p className="text-[0.72rem] font-medium tracking-[0.08em] text-muted-foreground/80">{metric.label}</p>
              <p className="mt-2 text-[1.45rem] font-semibold tracking-[-0.04em] text-foreground">{metric.value}</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{metric.detail}</p>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="grid min-w-0 gap-6">
          <SectionShell
            title="Move now"
            tooltip="Commercial interventions belong here. Overview owns the operational queue; Performance owns the business move."
            description="The highest-value commercial moves across services and SKUs, ordered by where Banji sees the next steering intervention."
          >
            <MoveNowTable rows={model.moves} />
          </SectionShell>

          <SectionShell
            title="Demand × capacity board"
            tooltip="Demand alone is not enough. Capacity, pipeline support, and margin posture change the real business picture."
            description="A mixed scan across services and SKUs so the owner can read the portfolio in one pass rather than splitting by subsystem."
          >
            <div className="overflow-hidden rounded-[1.4rem] border border-border/60 bg-background/70">
              <div className="hidden border-b border-border/60 bg-secondary/20 px-5 py-3 xl:grid xl:grid-cols-[minmax(0,1.2fr)_110px_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_110px] xl:gap-4">
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Entity</p>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Type</p>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Demand trend</p>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Sellable / support</p>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Pipeline support</p>
                <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Price / margin tone</p>
                <p className="text-center text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Status</p>
              </div>
              <div className="divide-y divide-border/60">
                {model.boardRows.map((row) => (
                  <div
                    key={row.id}
                    className={`grid gap-4 px-5 py-5 transition-colors ${rowHoverClassName} xl:grid-cols-[minmax(0,1.2fr)_110px_minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_110px] xl:gap-4`}
                  >
                    <div className="min-w-0">
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground xl:hidden">Entity</p>
                      <Link className="font-semibold text-foreground hover:text-primary" to={row.entityHref}>
                        {row.entity}
                      </Link>
                    </div>
                    <div>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground xl:hidden">Type</p>
                      <p className="text-sm text-muted-foreground">{row.type}</p>
                    </div>
                    <div>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground xl:hidden">Demand trend</p>
                      <p className="text-sm text-foreground">{row.demandTrend}</p>
                    </div>
                    <div>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground xl:hidden">Sellable / support</p>
                      <p className="text-sm leading-6 text-muted-foreground">{row.supportStatus}</p>
                    </div>
                    <div>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground xl:hidden">Pipeline support</p>
                      <p className="text-sm leading-6 text-muted-foreground">{row.pipelineSupport}</p>
                    </div>
                    <div>
                      <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground xl:hidden">Price / margin tone</p>
                      <p className="text-sm leading-6 text-muted-foreground">{row.priceMarginTone}</p>
                    </div>
                    <div className="flex items-start xl:justify-center">
                      <span className={`inline-flex rounded-full border px-2.5 py-1 text-[0.72rem] font-medium ${statusPillClassName(row.statusTone)}`}>
                        {row.statusLabel}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </SectionShell>

          <SectionShell
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
          </SectionShell>
        </div>

        <aside className="grid gap-4 lg:sticky lg:top-6 lg:self-start">
          <RightRailBlock
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
          </RightRailBlock>

          <RightRailBlock
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
          </RightRailBlock>

          <RightRailBlock
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
          </RightRailBlock>

          <RightRailBlock
            title="Confidence / coverage"
            tooltip="Quiet trust context: signal coverage, evidence freshness, and where the page is least certain."
          >
            <div className="space-y-3">
              <p className="text-sm leading-6 text-muted-foreground">Signal coverage {model.confidence.coverageLabel}</p>
              <p className="text-sm leading-6 text-muted-foreground">{model.confidence.evidenceLabel}</p>
              <p className="text-sm leading-6 text-muted-foreground">Least certain {model.confidence.weakSpotLabel}</p>
            </div>
          </RightRailBlock>
        </aside>
      </div>

      <SectionShell
        title="Business timeline"
        tooltip="A business memory lane, not a technical evidence ledger. Demand shifts, pricing moves, stock episodes, and recovery moments sit together here."
        description="A compact temporal read of what has been changing in the business posture."
      >
        <div className="flex flex-wrap gap-3">
          {model.timeline.map((event) => (
            <TimelineStep key={event.id} event={event} />
          ))}
        </div>
      </SectionShell>
    </WorkspacePage>
  );
}
