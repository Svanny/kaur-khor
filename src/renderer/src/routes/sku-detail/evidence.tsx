import { usePreferences } from '@/state/preferences';
import type { SenaSkuDetailViewModel } from './view-model';

export function SkuDetailEvidence({ evidence }: { evidence: SenaSkuDetailViewModel['evidence'] }) {
  const { t } = usePreferences();

  return (
    <section className="overflow-hidden rounded-[2rem] border border-border/70 bg-background/90 shadow-sm">
      <div className="border-b border-border/60 px-6 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">{t('catalogSenaSkuEvidenceTimeline')}</p>
        <h2 className="mt-1 text-2xl font-semibold tracking-[-0.03em] text-foreground">{t('catalogSenaSkuEvidenceTimeline')}</h2>
      </div>
      <div className="divide-y divide-border/60 px-6 py-2">
        {evidence.map((entry) => (
          <div key={entry.id} className="grid gap-1 py-4">
            <div className="flex items-center gap-3">
              <span className="size-2 rounded-full bg-foreground/55" />
              <p className="text-sm font-medium text-foreground">{entry.title}</p>
            </div>
            <p className="ml-5 text-sm text-muted-foreground">{entry.observedAt}</p>
            <p className="ml-5 text-sm text-muted-foreground">{entry.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
