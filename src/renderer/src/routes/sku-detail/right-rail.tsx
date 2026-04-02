import type { ReactNode } from 'react';
import type { SenaSkuDetailViewModel } from './view-model';

function RailBlock({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-[1.4rem] border border-border/60 bg-background/90 p-4">
      <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function SkuDetailRightRail({ model }: { model: SenaSkuDetailViewModel }) {
  return (
    <aside className="grid gap-4 lg:sticky lg:top-6 lg:self-start">
      <RailBlock title="Selected interval">
        <p className="font-medium text-foreground">{model.rail.selectedIntervalSummary.label}</p>
        <p className="mt-2 text-sm text-muted-foreground">Regime {model.rail.selectedIntervalSummary.dominantRegime}</p>
        <p className="text-sm text-muted-foreground">Service demand {model.rail.selectedIntervalSummary.serviceDemand}</p>
        <p className="text-sm text-muted-foreground">Retail demand {model.rail.selectedIntervalSummary.retailDemand}</p>
        <p className="text-sm text-muted-foreground">Receipts {model.rail.selectedIntervalSummary.receipts}</p>
        <p className="text-sm text-muted-foreground">Adjustments {model.rail.selectedIntervalSummary.adjustments}</p>
      </RailBlock>
      <RailBlock title="Act now">
        <p className="font-medium text-foreground">{model.rail.actNow.headline}</p>
        <p className="mt-1 text-sm text-muted-foreground">{model.rail.actNow.quantityBand}</p>
        {model.rail.actNow.rationale.map((line) => (
          <p key={line} className="mt-2 text-sm text-muted-foreground">{line}</p>
        ))}
      </RailBlock>
      <RailBlock title="Open pipeline">
        {model.rail.openPipeline.summary.map((line) => (
          <p key={line} className="text-sm text-muted-foreground">{line}</p>
        ))}
        <div className="mt-3 grid gap-2">
          {model.rail.openPipeline.events.map((event) => (
            <div key={event.key} className="rounded-xl border border-border/60 bg-muted/35 p-3">
              <p className="text-sm font-medium text-foreground">{event.timestamp}</p>
              <p className="text-sm text-muted-foreground">{event.state} · {event.quantity}</p>
            </div>
          ))}
        </div>
      </RailBlock>
      <RailBlock title="Exposure">
        <div className="grid gap-2">
          {model.rail.exposure.map((item) => (
            <div key={item.serviceId} className="rounded-xl border border-border/60 bg-muted/35 p-3">
              <p className="font-medium text-foreground">{item.serviceName}</p>
              <p className="text-sm text-muted-foreground">Usage {item.usageProbability}</p>
              <p className="text-sm text-muted-foreground">Bottleneck {item.bottleneckProbability}</p>
              <p className="text-sm text-muted-foreground">{item.severity}</p>
            </div>
          ))}
        </div>
      </RailBlock>
      <RailBlock title="Next touch">
        <p className="font-medium text-foreground">{model.rail.nextTouch.dateLabel}</p>
        <p className="mt-1 text-sm text-muted-foreground">{model.rail.nextTouch.reason}</p>
      </RailBlock>
    </aside>
  );
}
