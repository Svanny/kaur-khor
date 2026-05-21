import { PagedEvidenceTimelinePanel } from '@/routes/inventory/detail-panels';
import { usePreferences } from '@/state/preferences';
import type { SenaSkuDetailViewModel } from './view-model';

export function SkuDetailEvidence({ evidence }: { evidence: SenaSkuDetailViewModel['evidence'] }) {
  const { t } = usePreferences();

  return (
    <PagedEvidenceTimelinePanel
      helpHref="/settings/help#catalog-sku-evidence-timeline"
      items={evidence}
      title={t('catalogSenaSkuEvidenceTimeline')}
      tooltip={t('catalogSenaSkuEvidenceTimelineTooltip')}
      renderItem={(entry) => (
        <div className="grid gap-1 py-4">
          <div className="flex items-center gap-3">
            <span className="size-2 rounded-full bg-foreground/55" />
            <p className="text-sm font-medium text-foreground">{entry.title}</p>
          </div>
          <p className="ml-5 text-sm text-muted-foreground">{entry.observedAt}</p>
          <p className="ml-5 text-sm text-muted-foreground">{entry.detail}</p>
        </div>
      )}
    />
  );
}
