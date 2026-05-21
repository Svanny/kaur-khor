import type { ReactNode } from 'react';
import { ItemAvatar } from '@/components/system/item-identity';
import { SkuPageHero } from '@/routes/inventory/sku-page-hero';
import { SectionLabel } from '@/routes/inventory/sku-detail/section-heading';
import { MetricRibbon } from '@/components/system/metric-ribbon';
import { usePreferences } from '@/state/preferences';
import type { ServiceDetailViewModel } from './view-model';

export function ServiceDetailHero({
  actions,
  imagePath,
  model,
}: {
  actions: ReactNode;
  imagePath?: string | null;
  model: ServiceDetailViewModel;
}) {
  const { showHeartbeatRibbons = true, t } = usePreferences();

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
      visual={<ItemAvatar imagePath={imagePath} name={model.identity.name} size="hero" type="service" />}
      title={model.identity.name}
    >
      {showHeartbeatRibbons ? (
        <div className="mt-7 grid gap-6">
          <div className="grid gap-3 text-center">
            <p className="khmer-safe-label text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              <SectionLabel helpHref="/settings/help#catalog-service-availability" tooltip={t('catalogServiceHeroAvailabilityTooltip')}>
                {t('catalogServiceHeroAvailabilityTitle')}
              </SectionLabel>
            </p>
            <h2 className="khmer-safe-display mx-auto max-w-4xl text-4xl font-semibold tracking-[-0.06em] text-foreground sm:text-5xl">
              {model.hero.headline}
            </h2>
            <p className="mx-auto max-w-5xl text-base leading-7 text-muted-foreground">
              {model.hero.summary}
            </p>
          </div>

          <MetricRibbon
            title={
              <SectionLabel helpHref="/settings/help#catalog-service-operational-ribbon" tooltip={t('catalogServiceHeroRibbonTooltip')}>
                {t('catalogServiceHeroRibbonTitle')}
              </SectionLabel>
            }
            items={model.ribbon.map((metric) => ({
              key: metric.key,
              label: metric.label,
              value: metric.value,
              valueClassName:
                metric.key === 'bottleneck'
                  ? 'khmer-safe-display mt-1 text-[1.2rem] leading-tight font-semibold tracking-[-0.03em] text-foreground'
                  : 'khmer-safe-display mt-1 truncate text-[1.2rem] font-semibold tracking-[-0.03em] text-foreground',
            }))}
          />
        </div>
      ) : null}
    </SkuPageHero>
  );
}
