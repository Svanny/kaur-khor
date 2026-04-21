import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ActionOpenExternalIcon } from '@icons/actions';
import { getRegimeIcon } from '@icons/domain';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { RIGHT_RAIL_ASIDE_CLASS_NAME } from '@/components/system/right-rail-layout';
import { translateRegimeLabel } from '@/lib/localized-display';
import { translateUiLiteral } from '@/lib/translations';
import { SelectedIntervalBrief } from '@/routes/detail-selected-interval-card';
import { formatSenaDateTime } from '@/routes/sku-detail/format';
import { buildBanjiNavigationState } from '@/state/navigation-history';
import { usePreferences } from '@/state/preferences';
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
  const location = useLocation();
  const { language, t } = usePreferences();
  const contributor = selectedContributor(model, selection);
  const interval = selectedInterval(model, selection);
  const SelectedRegimeIcon = interval ? getRegimeIcon(interval.regimeKey) : null;
  const selectedRegimeLabel = interval ? interval.dominantRegime : null;

  return (
    <aside className={RIGHT_RAIL_ASIDE_CLASS_NAME}>
      <RailBlock title={t('catalogServiceRailActNowTitle')}>
        <p className="text-2xl font-semibold tracking-[-0.03em] text-foreground">{model.rail.overviewTitle}</p>
        <div className="mt-4 space-y-2">
          {model.rail.overviewReason.map((line, index) => (
            <p key={`${index}:${line}`} className="text-sm leading-6 text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
      </RailBlock>

      <RailBlock title={translateUiLiteral(language, 'Customer commitments')}>
        <div className="grid gap-2">
          {(model.rail.customerCommitments ?? []).map((line) => (
            <p key={line} className="text-sm leading-6 text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
      </RailBlock>

      {contributor ? (
        <RailBlock title={t('catalogServiceRailSelectedContributorTitle')}>
          <p className="text-2xl font-semibold tracking-[-0.03em] text-foreground">{contributor.name}</p>
          <div className="mt-3 grid gap-1 text-sm text-muted-foreground">
            <p>{contributor.statusLabel}</p>
            <p>{t('catalogServiceRailCoverLine', { value: contributor.daysOfCoverLabel })}</p>
            <p>{t('catalogServiceRailLimitingProbabilityLine', { value: contributor.probabilityLabel })}</p>
            <p>{contributor.stockLabel}</p>
            <p>{contributor.inboundLabel}</p>
            {contributor.restockGuidance ? <p>{contributor.restockGuidance}</p> : null}
          </div>
          <Button asChild className="mt-4 w-full">
            <Link state={buildBanjiNavigationState(location, '/catalog')} to={contributor.openSkuHref}>
              <ActionOpenExternalIcon className="size-4" />
              {t('catalogServiceOpenSkuDetailAction')}
            </Link>
          </Button>
        </RailBlock>
      ) : null}

      {interval ? (
        <RailBlock title={t('catalogServiceRailSelectedIntervalTitle')}>
        <SelectedIntervalBrief
          headline={interval.changeHeadline}
          meta={[
            interval.label,
            <span className="inline-flex items-center gap-2">
              {SelectedRegimeIcon ? <SelectedRegimeIcon className="size-4" /> : null}
              <span>{selectedRegimeLabel}</span>
            </span>,
          ]}
          metrics={[
              { label: t('catalogServiceRailMetricDemand'), value: interval.demandLabel },
              { label: t('catalogServiceRailMetricSellable'), value: interval.sellableLabel },
              { label: t('catalogServiceRailMetricBindingSku'), value: interval.bindingLabel, wide: true },
              { label: t('catalogServiceRailMetricGap'), value: interval.gapLabel },
            ]}
            notes={interval.changeLines}
          />
        </RailBlock>
      ) : null}

      <RailBlock title={t('catalogServiceRailBottleneckStackTitle')}>
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

      <RailBlock title={t('catalogServiceRailRecoveryPathTitle')}>
        <div className="grid gap-2">
          {model.rail.recoveryPath.map((line) => (
            <p key={line} className="text-sm leading-6 text-muted-foreground">
              {line}
            </p>
          ))}
        </div>
      </RailBlock>

      <RailBlock title={t('catalogServiceRailNextTouchTitle')}>
        <p className="text-lg font-semibold tracking-[-0.03em] text-foreground">{model.rail.nextTouch.dateLabel}</p>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{model.rail.nextTouch.reason}</p>
        <p className="mt-3 rounded-[1rem] border border-border/70 bg-background/70 px-3 py-2 text-sm text-muted-foreground">
          {model.actions?.latestObservedAt
            ? t('catalogServiceRailLatestSignal', { date: formatSenaDateTime(model.actions.latestObservedAt, language) })
            : t('catalogServiceRailNoSignal')}
        </p>
      </RailBlock>
    </aside>
  );
}
