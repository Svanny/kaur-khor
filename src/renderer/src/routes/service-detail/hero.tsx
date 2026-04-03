import type { ReactNode } from 'react';
import { SkuPageHero } from '@/routes/sku-page-hero';
import { SectionLabel } from '@/routes/sku-detail/section-heading';
import type { ServiceDetailViewModel } from './view-model';

export function ServiceDetailHero({
  actions,
  model,
}: {
  actions: ReactNode;
  model: ServiceDetailViewModel;
}) {
  return (
    <SkuPageHero
      actions={actions}
      badges={
        <>
          <span className="rounded-md border border-border/70 bg-muted/45 px-3 py-1 text-sm font-medium text-foreground">
            {model.identity.availabilityLabel}
          </span>
          <span className="rounded-md border border-border/70 bg-muted/45 px-3 py-1 text-sm font-medium text-muted-foreground">
            {model.identity.fragilityLabel}
          </span>
          <span className="rounded-md border border-border/70 bg-muted/45 px-3 py-1 text-sm font-medium text-muted-foreground">
            {model.identity.confidenceLabel}
          </span>
        </>
      }
      title={model.identity.name}
    >
      <div className="mt-7 grid gap-6">
        <div className="grid gap-3 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <SectionLabel tooltip="Service sellability combines demand, contributor fragility, receipts, and stock evidence.">
              Sellability truth
            </SectionLabel>
          </p>
          <h2 className="mx-auto max-w-4xl text-4xl font-semibold tracking-[-0.06em] text-foreground sm:text-5xl">
            {model.hero.headline}
          </h2>
          <p className="mx-auto max-w-5xl text-base leading-7 text-muted-foreground">
            {model.hero.summary}
          </p>
        </div>

        <div className="overflow-hidden rounded-[1rem] border border-border/70 bg-white shadow-[0_10px_24px_rgba(48,31,20,0.06)]">
          <div className="border-b border-border/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              <SectionLabel tooltip="A compact service scan across sellability, demand pressure, bottlenecks, and restoration timing.">
                Operational ribbon
              </SectionLabel>
            </p>
          </div>
          <div className="grid divide-y divide-border/60 bg-border/40 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-6">
            {model.ribbon.map((metric) => (
              <div key={metric.key} className="bg-white px-4 py-3">
                <p className="text-sm text-muted-foreground">{metric.label}</p>
                <p className="mt-1 text-[1.2rem] font-semibold tracking-[-0.03em] text-foreground">{metric.value}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </SkuPageHero>
  );
}
