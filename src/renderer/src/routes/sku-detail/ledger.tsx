import { usePreferences } from '@/state/preferences';
import type { SenaSkuDetailViewModel } from './view-model';

function intervalIndices(model: SenaSkuDetailViewModel) {
  const values = new Set<number>();
  model.lanes.regimePriceLane.intervals.forEach((entry) => values.add(entry.intervalIndex));
  model.lanes.flowLane.intervals.forEach((entry) => values.add(entry.intervalIndex));
  model.lanes.pipelineLane.intervals.forEach((entry) => values.add(entry.intervalIndex));
  return [...values].sort((left, right) => left - right);
}

function buildPolyline(values: number[], width: number, height: number) {
  if (values.length === 0) {
    return '';
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${x},${y}`;
    })
    .join(' ');
}

function LaneTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-3">
      <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</h3>
      {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
    </div>
  );
}

function IntervalStrip({
  activeIndex,
  indices,
  onSelect,
}: {
  activeIndex: number | null;
  indices: number[];
  onSelect: (index: number) => void;
}) {
  return (
    <div className="mt-4 flex flex-wrap gap-2">
      {indices.map((index) => (
        <button
          key={index}
          className={`rounded-md border px-3 py-1 text-sm ${activeIndex === index ? 'border-foreground bg-foreground text-background' : 'border-border/70 bg-background text-foreground'}`}
          type="button"
          onClick={() => onSelect(index)}
        >
          Interval {index + 1}
        </button>
      ))}
    </div>
  );
}

export function SkuDetailLedger({
  model,
  selectedIntervalIndex,
  setSelectedIntervalIndex,
}: {
  model: SenaSkuDetailViewModel;
  selectedIntervalIndex: number | null;
  setSelectedIntervalIndex: (index: number) => void;
}) {
  const { t } = usePreferences();
  const indices = intervalIndices(model);
  const inventoryValues = model.lanes.inventoryLane.points.map((point) => point.mean);
  const inventoryPolyline = buildPolyline(inventoryValues, 100, 42);
  const priceValues =
    model.lanes.regimePriceLane.priceMarkers.length > 0
      ? model.lanes.regimePriceLane.priceMarkers.map((marker) => marker.price)
      : [0];
  const pricePolyline = buildPolyline(priceValues, 100, 18);

  return (
    <section className="rounded-[2rem] border border-border/70 bg-background/90 px-6 py-5 shadow-sm">
      <div className="flex flex-col gap-2 border-b border-border/60 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Ledger</p>
          <h2 className="mt-1 text-[2rem] font-semibold tracking-[-0.04em] text-foreground">
            {t('catalogSenaSkuLedgerTitle')}
          </h2>
        </div>
        <p className="text-sm text-muted-foreground">{model.selectedInterval.label}</p>
      </div>

      <IntervalStrip activeIndex={selectedIntervalIndex} indices={indices} onSelect={setSelectedIntervalIndex} />

      <div className="mt-5">
        <div className="pb-5">
          <LaneTitle title={t('catalogSenaSkuRegimePriceLane')} subtitle={model.lanes.regimePriceLane.currentPriceLabel} />
          <div className="grid gap-3">
            <div className="flex overflow-hidden rounded-md bg-muted/35">
              {model.lanes.regimePriceLane.intervals.map((interval) => (
                <button
                  key={interval.intervalIndex}
                  className={`min-h-8 flex-1 border-r border-background/40 px-2 text-left text-xs ${selectedIntervalIndex === interval.intervalIndex ? 'bg-foreground/80 text-background' : 'bg-secondary/45 text-foreground'}`}
                  type="button"
                  onClick={() => setSelectedIntervalIndex(interval.intervalIndex)}
                >
                  {interval.dominantRegime}
                </button>
              ))}
            </div>
            <svg aria-hidden="true" className="h-12 w-full" preserveAspectRatio="none" viewBox="0 0 100 18">
              <polyline fill="none" points={pricePolyline} stroke="currentColor" strokeWidth="1.4" className="text-foreground/70" />
            </svg>
            <p className="text-sm text-muted-foreground">{model.lanes.regimePriceLane.summary}</p>
          </div>
        </div>

        <div className="border-t border-border/60 py-5">
          <LaneTitle title={t('catalogSenaSkuInventoryLane')} subtitle={`${t('catalogSenaSkuReorderPoint')}: ${model.lanes.inventoryLane.reorderPointLabel} · ${t('catalogSenaSkuSafetyStock')}: ${model.lanes.inventoryLane.safetyStockLabel}`} />
          <div className="overflow-hidden rounded-md bg-muted/25 px-2 py-3">
            <svg aria-hidden="true" className="h-28 w-full" preserveAspectRatio="none" viewBox="0 0 100 42">
              <path d="M0 10 H100" strokeDasharray="2 2" stroke="currentColor" strokeWidth="0.6" className="text-muted-foreground/70" />
              <path d="M0 24 H100" strokeDasharray="4 3" stroke="currentColor" strokeWidth="0.6" className="text-muted-foreground/50" />
              <polyline fill="none" points={inventoryPolyline} stroke="currentColor" strokeWidth="1.8" className="text-foreground" />
            </svg>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{model.lanes.inventoryLane.summary}</p>
        </div>

        <div className="border-t border-border/60 py-5">
          <LaneTitle title={t('catalogSenaSkuFlowLane')} />
          <div className="space-y-2">
            <div className="grid grid-cols-12 items-end gap-1 rounded-md bg-muted/20 px-2 py-3">
              {model.lanes.flowLane.intervals.map((interval) => (
                <button
                  key={interval.intervalIndex}
                  className="flex flex-col items-center gap-1"
                  type="button"
                  onClick={() => setSelectedIntervalIndex(interval.intervalIndex)}
                >
                  <span className="w-full rounded-sm bg-foreground/20" style={{ height: `${Math.max(12, interval.serviceDemandMean * 18)}px` }} />
                  <span className="w-full rounded-sm bg-foreground/45" style={{ height: `${Math.max(10, interval.retailDemandMean * 18)}px` }} />
                  <span className="w-full rounded-sm bg-secondary" style={{ height: `${Math.max(8, interval.receiptsMean * 18)}px` }} />
                </button>
              ))}
            </div>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{model.lanes.flowLane.summary}</p>
        </div>

        <div className="border-t border-border/60 pt-5">
          <LaneTitle title={t('catalogSenaSkuPipelineLane')} />
          <div className="space-y-3">
            {model.lanes.pipelineLane.intervals.map((interval) => (
              <button
                key={interval.intervalIndex}
                className={`grid w-full grid-cols-[minmax(0,1fr)_120px] items-center gap-3 rounded-md px-2 py-2 text-left ${selectedIntervalIndex === interval.intervalIndex ? 'bg-muted/35' : 'bg-transparent'}`}
                type="button"
                onClick={() => setSelectedIntervalIndex(interval.intervalIndex)}
              >
                <div className="relative h-3 rounded-full bg-muted/35">
                  <div className="absolute inset-y-0 left-0 rounded-full bg-secondary" style={{ width: `${Math.min(100, Math.max(6, interval.inTransitMean * 10))}%` }} />
                </div>
                <span className="text-sm text-muted-foreground">
                  {Math.round(interval.inTransitMean)} in transit
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted-foreground">{model.lanes.pipelineLane.summary}</p>
        </div>
      </div>
    </section>
  );
}
