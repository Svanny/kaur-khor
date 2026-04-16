import type { ReactNode } from 'react';
import { getRegimeIcon } from '@icons/domain';
import { translateRegimeLabel } from '@/lib/localized-display';
import { SkuPageHero } from '@/routes/sku-page-hero';
import { ItemAvatar } from '@/components/system/item-identity';
import { SupplierBadge } from '@/components/system/supplier';
import { usePreferences } from '@/state/preferences';
import { SectionLabel } from './section-heading';
import type { SenaSkuDetailViewModel } from './view-model';

const ribbonGridColumnsClassNames = {
  1: 'xl:grid-cols-1',
  2: 'xl:grid-cols-2',
  3: 'xl:grid-cols-3',
  4: 'xl:grid-cols-4',
  5: 'xl:grid-cols-5',
  6: 'xl:grid-cols-6',
} as const;

export function ribbonGridClassName(metricCount: number) {
  return ribbonGridColumnsClassNames[Math.min(Math.max(metricCount, 1), 6) as keyof typeof ribbonGridColumnsClassNames];
}

export function SkuDetailHero({
  actions,
  imagePath,
  model,
}: {
  actions: ReactNode;
  imagePath?: string | null;
  model: SenaSkuDetailViewModel;
}) {
  const { language, showHeartbeatRibbons = true, t } = usePreferences();
  const TopRegimeIcon = getRegimeIcon(model.identity.topRegime);
  const topRegimeLabel = translateRegimeLabel(language, model.identity.topRegime);

  return (
    <SkuPageHero
      actions={actions}
      badges={
        <>
          <span className="rounded-md border border-border/70 bg-muted/45 px-3 py-1 text-sm font-medium text-foreground">
            {model.identity.statusLabel}
          </span>
          <span className="rounded-md border border-border/70 bg-muted/45 px-3 py-1 text-sm font-medium text-muted-foreground">
            <span className="inline-flex items-center gap-2">
              <TopRegimeIcon className="size-4" />
              <span>{topRegimeLabel}</span>
            </span>
          </span>
          <SupplierBadge showEmpty className="px-3 py-1 text-sm" supplierName={model.identity.supplierName} />
        </>
      }
      visual={<ItemAvatar imagePath={imagePath} name={model.identity.name} size="hero" type="sku" />}
      title={model.identity.name}
    >
      {showHeartbeatRibbons ? (
        <div className="mt-7 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <SectionLabel tooltip={t('catalogSenaSkuHeroTooltip')}>
              {t('catalogSenaSkuHeroTitle')}
            </SectionLabel>
          </p>
          <h2 className="mt-4 text-5xl leading-[1.18] font-semibold tracking-[-0.06em] text-foreground sm:text-6xl">
            {model.heartbeat.headlineUnits}
          </h2>
          <p className="mx-auto mt-6 max-w-5xl text-base leading-7 text-muted-foreground">
            {model.heartbeat.heroSentence}
          </p>
        </div>
      ) : null}

      {showHeartbeatRibbons ? (
        <div className="mt-6 overflow-hidden rounded-[1rem] border border-border/70 bg-white shadow-[0_10px_24px_rgba(48,31,20,0.06)]">
          <div className="border-b border-border/60 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              <SectionLabel tooltip={t('catalogSenaSkuRibbonTooltip')}>
                {t('catalogSenaSkuOperationalRibbon')}
              </SectionLabel>
            </p>
          </div>
          <div className={`grid divide-y divide-border/60 bg-border/40 sm:grid-cols-2 sm:divide-x sm:divide-y-0 ${ribbonGridClassName(model.ribbon.length)}`}>
            {model.ribbon.map((metric) => (
              <div key={metric.key} className="bg-white px-4 py-3">
                <p className="text-sm text-muted-foreground">{metric.label}</p>
                <p className="mt-1 text-[1.35rem] font-semibold tracking-[-0.03em] text-foreground">{metric.value}</p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </SkuPageHero>
  );
}
