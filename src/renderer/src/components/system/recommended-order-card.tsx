import type { SenaReorderQuantityDisplay } from '@/lib/sena-reorder-quantity';
import { translateUiLiteral } from '@/lib/translations';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';

export function RecommendedOrderCard({
  className,
  recommendation,
}: {
  className?: string;
  recommendation: SenaReorderQuantityDisplay;
}) {
  const { language, t } = usePreferences();

  return (
    <div className={cn('rounded-[1.35rem] border border-border/65 bg-background/75 px-4 py-4 shadow-[0_1px_0_rgba(255,255,255,0.85)]', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {t('overviewDrawerRecommendedOrderTitle')}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
            {recommendation.recommendationIssued || recommendation.optionalOrderLabel
              ? recommendation.recommendedUnitsLabel
              : recommendation.quietLabel}
          </p>
        </div>
        {recommendation.recommendationIssued ? (
          <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {t('overviewDrawerRecommendedOrderLikely', { value: recommendation.needProbabilityValueLabel })}
          </span>
        ) : null}
      </div>
      <div aria-label={recommendation.likelyRangeLabel} className="mt-5 border-t border-border/70 pt-5">
        <span className="sr-only">{recommendation.likelyRangeLabel}</span>
        <p aria-hidden="true" className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {translateUiLiteral(language, 'Recommended range')}
        </p>
        <p aria-hidden="true" className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
          {recommendation.likelyRangeValueLabel}
        </p>
      </div>
      <div className="mt-3 grid gap-1 text-sm leading-6 text-muted-foreground">
        {recommendation.recommendationIssued ? <p>{recommendation.needProbabilityLabel}</p> : null}
        <p>{t('overviewDrawerRecommendedOrderBasis')}</p>
      </div>
    </div>
  );
}
