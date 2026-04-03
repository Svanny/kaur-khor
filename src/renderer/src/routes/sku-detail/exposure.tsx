import { usePreferences } from '@/state/preferences';
import type { SenaSkuDetailViewModel } from './view-model';

export function SkuDetailExposure({ rows }: { rows: SenaSkuDetailViewModel['dependencyImpact'] }) {
  const { t } = usePreferences();

  return (
    <section className="overflow-hidden rounded-[2rem] border border-border/70 bg-background/90 shadow-sm">
      <div className="border-b border-border/60 px-6 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{t('catalogSenaSkuDependencyImpact')}</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground">{t('catalogSenaSkuDependencyImpact')}</h2>
      </div>
      <div className="divide-y divide-border/60 px-6 py-2">
        {rows.map((row) => (
          <div key={row.serviceId} className="grid grid-cols-[minmax(0,1fr)_auto] gap-4 py-4">
            <div>
              <p className="font-medium text-foreground">{row.name}</p>
              <p className="mt-1 text-sm text-muted-foreground">{row.severity}</p>
            </div>
            <div className="text-right text-sm text-muted-foreground">
              <p>Usage {row.usageProbability}</p>
              <p>Bottleneck {row.bottleneckProbability}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
