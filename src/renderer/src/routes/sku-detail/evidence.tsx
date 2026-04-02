import type { SenaSkuDetailViewModel } from './view-model';

export function SkuDetailEvidence({ evidence }: { evidence: SenaSkuDetailViewModel['evidence'] }) {
  return (
    <section className="rounded-[2rem] border border-border/70 bg-background/85 p-6 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">Evidence timeline</p>
      <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground">Evidence timeline</h2>
      <div className="mt-5 grid gap-3">
        {evidence.map((entry) => (
          <div key={entry.id} className="rounded-[1.2rem] border border-border/60 bg-background/90 p-4">
            <p className="text-sm font-medium text-foreground">{entry.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{entry.observedAt}</p>
            <p className="mt-2 text-sm text-muted-foreground">{entry.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
