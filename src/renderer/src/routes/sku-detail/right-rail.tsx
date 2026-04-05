import type { ReactNode } from 'react';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { RIGHT_RAIL_ASIDE_CLASS_NAME } from '@/components/system/right-rail-layout';
import { usePreferences } from '@/state/preferences';
import { SectionLabel } from './section-heading';
import type { SenaSkuDetailViewModel } from './view-model';

function RailBlock({
  children,
  title,
  tooltip,
}: {
  children: ReactNode;
  title: string;
  tooltip: string;
}) {
  return (
    <section className={`${cardFrameClassName} ${cardSurfaceClassName} rounded-[1.4rem]`}>
      <div className="border-b border-border/60 px-4 py-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          <SectionLabel tooltip={tooltip}>{title}</SectionLabel>
        </h3>
      </div>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

export function SkuDetailRightRail({ model }: { model: SenaSkuDetailViewModel }) {
  const { t } = usePreferences();

  return (
    <aside className={RIGHT_RAIL_ASIDE_CLASS_NAME}>
      <RailBlock title={t('catalogSenaSkuSelectedInterval')} tooltip={t('catalogSenaSkuSelectedIntervalTooltip')}>
        <p className="font-medium text-foreground">{model.rail.selectedIntervalSummary.label}</p>
        <div className="mt-3 grid gap-1">
          <p className="text-sm text-muted-foreground">Regime {model.rail.selectedIntervalSummary.dominantRegime}</p>
          <p className="text-sm text-muted-foreground">Service demand {model.rail.selectedIntervalSummary.serviceDemand}</p>
          <p className="text-sm text-muted-foreground">Retail demand {model.rail.selectedIntervalSummary.retailDemand}</p>
          <p className="text-sm text-muted-foreground">Receipts {model.rail.selectedIntervalSummary.receipts}</p>
          <p className="text-sm text-muted-foreground">Adjustments {model.rail.selectedIntervalSummary.adjustments}</p>
        </div>
      </RailBlock>

      <RailBlock title={t('catalogSenaSkuActNow')} tooltip={t('catalogSenaSkuActNowTooltip')}>
        <p className="text-2xl font-semibold tracking-[-0.03em] text-foreground">{model.rail.actNow.headline}</p>
        <p className="mt-2 text-lg font-medium text-foreground">{model.rail.actNow.quantityBand}</p>
        <div className="mt-4 space-y-2">
          {model.rail.actNow.rationale.map((line, index) => (
            <p key={`${index}:${line}`} className="text-sm leading-6 text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
      </RailBlock>

      <RailBlock title={t('catalogSenaSkuOpenPipeline')} tooltip={t('catalogSenaSkuOpenPipelineTooltip')}>
        <div className="grid gap-1">
          {model.rail.openPipeline.summary.map((line) => (
            <p key={line} className="text-sm text-muted-foreground">{line}</p>
          ))}
        </div>
        <div className="mt-4 divide-y divide-border/60">
          {model.rail.openPipeline.events.length > 0 ? (
            model.rail.openPipeline.events.map((event) => (
              <div key={event.key} className="py-3 first:pt-0 last:pb-0">
                <p className="text-sm font-medium text-foreground">{event.timestamp}</p>
                <p className="mt-1 text-sm text-muted-foreground">{event.state} · {event.quantity}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">{t('catalogSenaSkuOpenPipelineEmpty')}</p>
          )}
        </div>
      </RailBlock>

      <RailBlock title={t('catalogSenaSkuNextTouch')} tooltip={t('catalogSenaSkuNextTouchTooltip')}>
        <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">{model.rail.nextTouch.dateLabel}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{model.rail.nextTouch.reason}</p>
      </RailBlock>
    </aside>
  );
}
