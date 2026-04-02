import type { ReactNode } from 'react';
import { RouteBackButton } from '@/components/system/page-navigation';
import type { SenaSkuDetailViewModel } from './view-model';

export function SkuDetailHero({
  actions,
  model,
}: {
  actions: ReactNode;
  model: SenaSkuDetailViewModel;
}) {
  return (
    <section className="rounded-[2rem] border border-border/70 bg-background/85 p-6 shadow-sm">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <RouteBackButton />
              <div className="min-w-0">
                <h1 className="truncate text-3xl font-semibold tracking-[-0.04em] text-foreground">{model.identity.name}</h1>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span className="rounded-full border border-border/70 px-2 py-1">{model.identity.skuId}</span>
                  <span className="rounded-full border border-border/70 px-2 py-1">{model.identity.topRegime}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <span className="rounded-full border border-border/70 bg-secondary/60 px-3 py-1 text-sm font-medium text-foreground">
              {model.identity.statusLabel}
            </span>
            {actions}
          </div>
        </div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">SENA heartbeat</p>
            <h2 className="mt-2 text-4xl font-semibold tracking-[-0.05em] text-foreground">{model.heartbeat.headlineUnits}</h2>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-muted-foreground">{model.heartbeat.heroSentence}</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-[1.4rem] border border-border/60 bg-muted/35">
          <div className="grid gap-px bg-border/50 md:grid-cols-6">
            {model.ribbon.map((metric) => (
              <div key={metric.key} className="bg-background/90 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{metric.label}</p>
                <p className="mt-1 text-lg font-semibold text-foreground">{metric.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
