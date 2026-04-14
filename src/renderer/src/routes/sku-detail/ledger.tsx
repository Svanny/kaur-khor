import { useEffect, useMemo, useState } from 'react';
import type { SenaSkuDetailPage } from '@shared/sena';
import type { ChartTimeframe } from '@/components/system/chart-timeframe';
import {
  classifyWheelIntent,
  deriveAnchoredZoomScrollLeft,
  deriveAxisContentWidth,
  deriveCenteredIntervalScrollLeft,
  deriveSlotCenterX,
  deriveSlotLeftX,
  deriveVisibleWindow,
  intervalLabelForWidth,
  intervalTooltipLabel,
  isPinchZoomGesture,
  responsivePillLabel,
} from '@/components/system/interval-strip';
import {
  buildSparsePolylineSegments,
  deriveLabelGutterOffset,
} from '@/components/system/timeline-chart';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { usePreferences } from '@/state/preferences';
import { SectionTitle } from './section-heading';
import { SkuTradingChart } from './trading-chart';
import {
  defaultTradingChartIndicators,
  deriveTradingChartModel,
} from './trading-chart-model';
import type { SenaSkuDetailViewModel } from './view-model';

export {
  classifyWheelIntent,
  deriveAnchoredZoomScrollLeft,
  deriveAxisContentWidth,
  deriveCenteredIntervalScrollLeft,
  deriveSlotCenterX,
  deriveSlotLeftX,
  deriveVisibleWindow,
  isPinchZoomGesture,
  intervalLabelForWidth,
  intervalTooltipLabel,
  responsivePillLabel,
} from '@/components/system/interval-strip';
export {
  buildSparsePolylineSegments,
  deriveLabelGutterOffset,
} from '@/components/system/timeline-chart';

export function SkuDetailLedger({
  chartZoomResetToken = 0,
  hasOlderIntervals = false,
  isHydratingDetails = false,
  isLoadingOlderIntervals = false,
  loadOlderIntervals = async () => null,
  model,
  onOlderLoadProgressChange,
  onResetCharts = () => {},
  onTimeframeChange = () => {},
  selectedIntervalIndex,
  setSelectedIntervalIndex,
  timeframe = 'Recent',
}: {
  chartZoomResetToken?: string | number;
  hasOlderIntervals: boolean;
  isHydratingDetails: boolean;
  isLoadingOlderIntervals: boolean;
  loadOlderIntervals: (limit?: number) => Promise<SenaSkuDetailPage | null>;
  model: SenaSkuDetailViewModel;
  onOlderLoadProgressChange?: (progress: { current: number; total: number } | null) => void;
  onResetCharts: () => void;
  onTimeframeChange: (value: ChartTimeframe) => void;
  selectedIntervalIndex: number | null;
  setSelectedIntervalIndex: (index: number) => void;
  timeframe: ChartTimeframe;
}) {
  const { t } = usePreferences();
  const [defaultIndicatorSettings, setDefaultIndicatorSettings] = useState(() => defaultTradingChartIndicators());
  const [indicatorSettings, setIndicatorSettings] = useState(() => defaultTradingChartIndicators());
  const chartModel = useMemo(() => deriveTradingChartModel(model), [model]);

  useEffect(() => {
    const nextDefaults = defaultTradingChartIndicators();
    setDefaultIndicatorSettings(nextDefaults);
    setIndicatorSettings(structuredClone(nextDefaults));
  }, [model.identity.skuId]);

  return (
    <section className={`${cardFrameClassName} ${cardSurfaceClassName} flex min-h-[100svh] min-w-0 flex-col self-start rounded-[2rem] px-6 py-5`}>
      <div className="flex flex-col gap-2 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{t('appBrand')}</p>
          <div className="mt-1">
            <SectionTitle title="Ledger" tooltip={t('catalogSenaSkuLedgerTooltip')} />
          </div>
        </div>
      </div>

      <div className="mt-5 flex min-h-0 flex-1">
        <SkuTradingChart
          chartModel={chartModel}
          chartZoomResetToken={chartZoomResetToken}
          defaultIndicatorSettings={defaultIndicatorSettings}
          hasOlderIntervals={hasOlderIntervals}
          indicatorSettings={indicatorSettings}
          isBusy={isHydratingDetails || isLoadingOlderIntervals}
          isLoadingOlderIntervals={isLoadingOlderIntervals}
          loadOlderIntervals={loadOlderIntervals}
          selectedIntervalIndex={selectedIntervalIndex}
          setIndicatorSettings={setIndicatorSettings}
          timeframe={timeframe}
          onOlderLoadProgressChange={onOlderLoadProgressChange}
          onReset={onResetCharts}
          onSaveDefaultIndicatorSettings={setDefaultIndicatorSettings}
          onSelectInterval={setSelectedIntervalIndex}
          onTimeframeChange={onTimeframeChange}
        />
      </div>
    </section>
  );
}
