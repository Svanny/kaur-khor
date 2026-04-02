import type { SenaSkuDetailViewModel } from './view-model';

export function SkuDetailExposure({ rows }: { rows: SenaSkuDetailViewModel['dependencyImpact'] }) {
  return (
    <section className="rounded-[2rem] border border-border/70 bg-background/85 p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Dependency impact</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground">Dependency impact</h2>
      <div className="mt-5 grid gap-3">
        {rows.map((row) => (
          <div key={row.serviceId} className="rounded-[1.2rem] border border-border/60 bg-background/90 p-4">
            <p className="font-medium text-foreground">{row.name}</p>
            <p className="mt-1 text-sm text-muted-foreground">{row.severity}</p>
            <p className="text-sm text-muted-foreground">Usage {row.usageProbability}</p>
            <p className="text-sm text-muted-foreground">Bottleneck {row.bottleneckProbability}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
