import type { SenaSkuDetailViewModel } from './view-model';

function intervalIndices(model: SenaSkuDetailViewModel) {
  const values = new Set<number>();
  model.lanes.regimePriceLane.intervals.forEach((entry) => values.add(entry.intervalIndex));
  model.lanes.flowLane.intervals.forEach((entry) => values.add(entry.intervalIndex));
  model.lanes.pipelineLane.intervals.forEach((entry) => values.add(entry.intervalIndex));
  return [...values].sort((left, right) => left - right);
}

function Lane({
  activeIndex,
  children,
  indices,
  summary,
  title,
  onSelect,
}: {
  activeIndex: number | null;
  children?: React.ReactNode;
  indices: number[];
  summary: string;
  title: string;
  onSelect: (index: number) => void;
}) {
  return (
    <section className="rounded-[1.4rem] border border-border/60 bg-background/90 p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">{title}</h3>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {indices.map((index) => (
          <button
            key={index}
            className={`rounded-full border px-3 py-1 text-sm ${activeIndex === index ? 'border-foreground bg-foreground text-background' : 'border-border/70 bg-background text-foreground'}`}
            type="button"
            onClick={() => onSelect(index)}
          >
            Interval {index + 1}
          </button>
        ))}
      </div>
      {children ? <div className="mt-4">{children}</div> : null}
      <p className="mt-4 text-sm text-muted-foreground">{summary}</p>
    </section>
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
  const indices = intervalIndices(model);

  return (
    <section className="rounded-[2rem] border border-border/70 bg-background/85 p-6 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Ledger</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground">SENA ledger</h2>
        </div>
        <p className="text-sm text-muted-foreground">{model.selectedInterval.label}</p>
      </div>
      <div className="mt-5 grid gap-4">
        <Lane activeIndex={selectedIntervalIndex} indices={indices} summary={model.lanes.regimePriceLane.summary} title="Regime + price lane" onSelect={setSelectedIntervalIndex}>
          <p className="text-sm text-foreground">{model.lanes.regimePriceLane.intervals.at(-1)?.dominantRegime ?? 'No regime history yet'} regime</p>
        </Lane>
        <Lane activeIndex={selectedIntervalIndex} indices={indices} summary={model.lanes.inventoryLane.summary} title="Inventory lane" onSelect={setSelectedIntervalIndex}>
          <p className="text-sm text-foreground">Posterior points: {model.lanes.inventoryLane.points.length}</p>
        </Lane>
        <Lane activeIndex={selectedIntervalIndex} indices={indices} summary={model.lanes.flowLane.summary} title="Flow decomposition lane" onSelect={setSelectedIntervalIndex}>
          <p className="text-sm text-foreground">Intervals: {model.lanes.flowLane.intervals.length}</p>
        </Lane>
        <Lane activeIndex={selectedIntervalIndex} indices={indices} summary={model.lanes.pipelineLane.summary} title="Pipeline lane" onSelect={setSelectedIntervalIndex}>
          <p className="text-sm text-foreground">Aggregate pipeline points: {model.lanes.pipelineLane.intervals.length}</p>
        </Lane>
      </div>
    </section>
  );
}
