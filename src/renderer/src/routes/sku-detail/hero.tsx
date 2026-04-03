import type { ReactNode } from 'react';
import { SkuPageHero } from '@/routes/sku-page-hero';
import { usePreferences } from '@/state/preferences';
import { SectionLabel } from './section-heading';
import type { SenaSkuDetailViewModel } from './view-model';

export function SkuDetailHero({
  actions,
  model,
}: {
  actions: ReactNode;
  model: SenaSkuDetailViewModel;
}) {
  const { t } = usePreferences();

  return (
    <SkuPageHero
      actions={actions}
      badges={
        <>
          <span className="rounded-md border border-border/70 bg-muted/45 px-3 py-1 text-sm font-medium text-foreground">
            {model.identity.statusLabel}
          </span>
          <span className="rounded-md border border-border/70 bg-muted/45 px-3 py-1 text-sm font-medium text-muted-foreground">
            {model.identity.topRegime}
          </span>
          <span className="rounded-md border border-border/70 bg-muted/45 px-3 py-1 text-sm font-medium text-muted-foreground">
            {model.identity.skuId}
          </span>
        </>
      }
      title={model.identity.name}
    >
      <div className="mt-7 text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          <SectionLabel tooltip={t('catalogSenaSkuHeroTooltip')}>
            {t('catalogSenaSkuHeroTitle')}
          </SectionLabel>
        </p>
        <h2 className="mt-4 text-5xl font-semibold tracking-[-0.06em] text-foreground sm:text-6xl">
          {model.heartbeat.headlineUnits}
        </h2>
        <p className="mx-auto mt-4 max-w-5xl text-base leading-7 text-muted-foreground">
          {model.heartbeat.heroSentence}
        </p>
      </div>

      <div className="mt-6 overflow-hidden rounded-[1rem] border border-border/70 bg-white shadow-[0_10px_24px_rgba(48,31,20,0.06)]">
        <div className="border-b border-border/60 px-4 py-3">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <SectionLabel tooltip={t('catalogSenaSkuRibbonTooltip')}>
              {t('catalogSenaSkuOperationalRibbon')}
            </SectionLabel>
          </p>
        </div>
        <div className="grid divide-y divide-border/60 bg-border/40 sm:grid-cols-2 sm:divide-x sm:divide-y-0 xl:grid-cols-6">
          {model.ribbon.map((metric) => (
            <div key={metric.key} className="bg-white px-4 py-3">
              <p className="text-sm text-muted-foreground">{metric.label}</p>
              <p className="mt-1 text-[1.35rem] font-semibold tracking-[-0.03em] text-foreground">{metric.value}</p>
            </div>
          ))}
        </div>
      </div>
    </SkuPageHero>
  );
}
