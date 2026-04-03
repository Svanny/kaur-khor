import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import type { ServiceDetailViewModel, ServiceInspectorSelection } from './view-model';

function RailBlock({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className={`${cardFrameClassName} ${cardSurfaceClassName} rounded-[1.4rem]`}>
      <div className="border-b border-border/60 px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</h3>
      </div>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

function selectedContributor(model: ServiceDetailViewModel, selection: ServiceInspectorSelection) {
  if (selection.type !== 'contributor' || !selection.skuId) {
    return null;
  }
  return model.contributors.find((entry) => entry.skuId === selection.skuId) ?? null;
}

function selectedInterval(model: ServiceDetailViewModel, selection: ServiceInspectorSelection) {
  if (selection.type !== 'interval' || selection.intervalIndex == null) {
    return null;
  }
  return model.intervals.find((entry) => entry.intervalIndex === selection.intervalIndex) ?? null;
}

export function ServiceDetailRightRail({
  model,
  selection,
}: {
  model: ServiceDetailViewModel;
  selection: ServiceInspectorSelection;
}) {
  const contributor = selectedContributor(model, selection);
  const interval = selectedInterval(model, selection);

  return (
    <aside className="grid gap-4 lg:sticky lg:top-6 lg:self-start">
      {contributor ? (
        <RailBlock title="Selected contributor">
          <p className="text-2xl font-semibold tracking-[-0.03em] text-foreground">{contributor.name}</p>
          <div className="mt-3 grid gap-1 text-sm text-muted-foreground">
            <p>{contributor.statusLabel}</p>
            <p>{contributor.daysOfCoverLabel} cover</p>
            <p>{contributor.probabilityLabel} limiting probability</p>
            <p>{contributor.stockLabel}</p>
            <p>{contributor.inboundLabel}</p>
          </div>
          <Button asChild className="mt-4 w-full">
            <Link to={contributor.openSkuHref}>
              <ArrowUpRight className="size-4" />
              Open SKU detail
            </Link>
          </Button>
        </RailBlock>
      ) : null}

      {interval ? (
        <RailBlock title="Selected interval">
          <p className="text-2xl font-semibold tracking-[-0.03em] text-foreground">{interval.changeHeadline}</p>
          <div className="mt-3 grid gap-1 text-sm text-muted-foreground">
            <p>{interval.label} · {interval.dominantRegime}</p>
            <p>Demand {interval.demandLabel} · Sellable {interval.sellableLabel}</p>
            <p>Binding SKU {interval.bindingLabel}</p>
          </div>
          <div className="mt-4 space-y-2">
            {interval.changeLines.map((line) => (
              <p key={line} className="text-sm leading-6 text-muted-foreground">{line}</p>
            ))}
          </div>
        </RailBlock>
      ) : null}

      <RailBlock title="Act now">
        <p className="text-2xl font-semibold tracking-[-0.03em] text-foreground">{model.rail.overviewTitle}</p>
        <div className="mt-4 space-y-2">
          {model.rail.overviewReason.map((line, index) => (
            <p key={`${index}:${line}`} className="text-sm leading-6 text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
      </RailBlock>

      <RailBlock title="Bottleneck stack">
        <div className="divide-y divide-border/60">
          {model.rail.bottleneckStack.map((entry, index) => (
            <div key={entry.skuId} className="py-3 first:pt-0 last:pb-0">
              <p className="text-sm font-medium text-foreground">
                {index + 1}. {entry.label}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{entry.role}</p>
            </div>
          ))}
        </div>
      </RailBlock>

      <RailBlock title="Recovery path">
        <div className="grid gap-2">
          {model.rail.recoveryPath.map((line) => (
            <p key={line} className="text-sm leading-6 text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
      </RailBlock>

      <RailBlock title="Next touch">
        <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">{model.rail.nextTouch.dateLabel}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{model.rail.nextTouch.reason}</p>
      </RailBlock>
    </aside>
  );
}
