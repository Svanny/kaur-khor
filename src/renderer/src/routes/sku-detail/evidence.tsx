import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePreferences } from '@/state/preferences';
import { SectionTitle } from './section-heading';
import type { SenaSkuDetailViewModel } from './view-model';

const EVIDENCE_PAGE_SIZE = 5;

export function SkuDetailEvidence({ evidence }: { evidence: SenaSkuDetailViewModel['evidence'] }) {
  const { t } = usePreferences();
  const [pageIndex, setPageIndex] = useState(0);

  const pageCount = Math.max(1, Math.ceil(evidence.length / EVIDENCE_PAGE_SIZE));
  const pagedEvidence = useMemo(() => {
    const start = pageIndex * EVIDENCE_PAGE_SIZE;
    return evidence.slice(start, start + EVIDENCE_PAGE_SIZE);
  }, [evidence, pageIndex]);

  useEffect(() => {
    setPageIndex((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  return (
    <section className="overflow-hidden rounded-[2rem] border border-border/70 bg-background/90 shadow-sm">
      <div className="border-b border-border/60 px-6 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {t('catalogSenaSkuEvidenceTimeline')}
        </p>
        <div className="mt-1">
          <SectionTitle title={t('catalogSenaSkuEvidenceTimeline')} tooltip={t('catalogSenaSkuEvidenceTimelineTooltip')} />
        </div>
      </div>
      <div className="divide-y divide-border/60 px-6 py-2">
        {pagedEvidence.map((entry) => (
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
      <div className="flex items-center justify-between border-t border-border/60 px-6 py-3">
        <p className="text-sm text-muted-foreground">
          {t('catalogSenaSkuEvidencePageLabel')
            .replace('{current}', String(pageIndex + 1))
            .replace('{total}', String(pageCount))}
        </p>
        <div className="flex items-center gap-2">
          <button
            aria-label={t('catalogSenaSkuEvidencePrevious')}
            className="rounded-full border border-border/70 p-2 text-foreground disabled:text-muted-foreground"
            disabled={pageIndex === 0}
            type="button"
            onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            className="rounded-full border border-border/70 px-3 py-1 text-sm text-foreground disabled:text-muted-foreground"
            disabled={pageIndex === 0}
            type="button"
            onClick={() => setPageIndex(0)}
          >
            {t('catalogSenaSkuEvidenceFirst')}
          </button>
          <button
            className="rounded-full border border-border/70 px-3 py-1 text-sm text-foreground disabled:text-muted-foreground"
            disabled={pageIndex >= pageCount - 1}
            type="button"
            onClick={() => setPageIndex(pageCount - 1)}
          >
            {t('catalogSenaSkuEvidenceLast')}
          </button>
          <button
            aria-label={t('catalogSenaSkuEvidenceNext')}
            className="rounded-full border border-border/70 p-2 text-foreground disabled:text-muted-foreground"
            disabled={pageIndex >= pageCount - 1}
            type="button"
            onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>
    </section>
  );
}
