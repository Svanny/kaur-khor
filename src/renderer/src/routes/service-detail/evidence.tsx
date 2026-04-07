import { PagedEvidenceTimelinePanel } from '@/routes/detail-panels';
import { usePreferences } from '@/state/preferences';
import { formatSenaDate } from '@/routes/sku-detail/format';
import type { ServiceDetailViewModel } from './view-model';

function formatServiceEvidenceDate(value: string, language: 'en' | 'km') {
  if (/^\d{4}-\d{2}-\d{2}T/.test(value) || /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return formatSenaDate(value, language);
  }
  return value;
}

export function ServiceEvidenceTimeline({
  evidence,
}: {
  evidence: ServiceDetailViewModel['evidence'];
}) {
  const { language } = usePreferences();

  return (
    <PagedEvidenceTimelinePanel
      items={evidence}
      title="Evidence timeline"
      tooltip="Saved events that explain why this service is currently sellable or blocked."
      emptyState={
        <div className="py-4 text-sm leading-6 text-muted-foreground">
          Evidence chips will appear after stock reports, receipts, or price changes are recorded for this service and its linked SKUs.
        </div>
      }
      renderItem={(entry) => (
        <div className="py-4">
          <p className="text-base font-semibold tracking-[-0.02em] text-foreground">{entry.title}</p>
          <p className="mt-1 text-sm text-muted-foreground">{formatServiceEvidenceDate(entry.observedAt, language)}</p>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{entry.detail}</p>
        </div>
      )}
    />
  );
}
