import type { ReactNode } from 'react';
import { getRegimeIcon } from '@icons/domain';
import { translateRegimeLabel } from '@/lib/localized-display';
import { SkuPageHero } from '@/routes/sku-page-hero';
import { ItemAvatar } from '@/components/system/item-identity';
import { SupplierBadge } from '@/components/system/supplier';
import { MetricRibbon } from '@/components/system/metric-ribbon';
import { usePreferences } from '@/state/preferences';
import { SectionLabel } from './section-heading';
import type { SenaSkuDetailViewModel } from './view-model';

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
            <SectionLabel helpHref="/settings/help#catalog-sku-hero-signal" tooltip={t('catalogSenaSkuHeroTooltip')}>
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
        <div className="mt-6">
          <MetricRibbon
            title={
              <SectionLabel helpHref="/settings/help#catalog-sku-operational-ribbon" tooltip={t('catalogSenaSkuRibbonTooltip')}>
                {t('catalogSenaSkuOperationalRibbon')}
              </SectionLabel>
            }
            items={model.ribbon.map((metric) => ({
              key: metric.key,
              label: metric.label,
              value: metric.value,
              valueClassName:
                metric.key === 'nextReceipt'
                  ? 'mt-1 text-[1.35rem] leading-tight font-semibold tracking-[-0.03em] text-foreground'
                  : 'mt-1 truncate text-[1.35rem] font-semibold tracking-[-0.03em] text-foreground',
            }))}
          />
        </div>
      ) : null}
    </SkuPageHero>
  );
}
