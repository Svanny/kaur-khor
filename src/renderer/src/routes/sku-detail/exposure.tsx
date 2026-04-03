import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePreferences } from '@/state/preferences';
import { SectionTitle } from './section-heading';
import type { SenaSkuDetailViewModel } from './view-model';

const DEPENDENCY_IMPACT_MAX_BODY_HEIGHT = 360;
const DEPENDENCY_IMPACT_FALLBACK_ROWS = 3;

export function SkuDetailExposure({ rows }: { rows: SenaSkuDetailViewModel['dependencyImpact'] }) {
  const { t } = usePreferences();
  const listRef = useRef<HTMLDivElement | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(rows.length);
  const [isMeasuring, setIsMeasuring] = useState(true);

  useEffect(() => {
    const node = listRef.current;
    if (!node) {
      return;
    }

    const measureRows = () => {
      const children = Array.from(node.children) as HTMLDivElement[];
      if (children.length === 0) {
        setRowsPerPage(rows.length);
        setIsMeasuring(false);
        return;
      }

      const measuredHeights = children.map((child) => child.getBoundingClientRect().height);
      if (measuredHeights.every((height) => height <= 0)) {
        setRowsPerPage(rows.length);
        setIsMeasuring(false);
        return;
      }

      const estimatedTotalHeight = measuredHeights.reduce((sum, height) => sum + (height > 0 ? height : 104), 0);
      if (estimatedTotalHeight <= DEPENDENCY_IMPACT_MAX_BODY_HEIGHT) {
        setRowsPerPage(rows.length);
        setIsMeasuring(false);
        return;
      }

      let accumulatedHeight = 0;
      let fittedRows = 0;
      for (const [index] of children.entries()) {
        const rectHeight = measuredHeights[index] ?? 0;
        const childHeight = rectHeight > 0 ? rectHeight : 104;
        if (fittedRows > 0 && accumulatedHeight + childHeight > DEPENDENCY_IMPACT_MAX_BODY_HEIGHT) {
          break;
        }
        accumulatedHeight += childHeight;
        fittedRows += 1;
      }

      setRowsPerPage(Math.max(1, Math.min(fittedRows || DEPENDENCY_IMPACT_FALLBACK_ROWS, rows.length)));
      setIsMeasuring(false);
    };

    const observer = new ResizeObserver(() => measureRows());
    observer.observe(node);
    measureRows();
    return () => observer.disconnect();
  }, [rows]);

  const shouldPaginate = !isMeasuring && rowsPerPage < rows.length;
  const pageCount = shouldPaginate ? Math.max(1, Math.ceil(rows.length / rowsPerPage)) : 1;
  const pagedRows = useMemo(() => {
    if (!shouldPaginate || isMeasuring) {
      return rows;
    }
    const start = pageIndex * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [isMeasuring, pageIndex, rows, rowsPerPage, shouldPaginate]);

  useEffect(() => {
    setPageIndex((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-border/70 bg-background/90 shadow-sm">
      <div className="border-b border-border/60 px-6 py-4">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted-foreground">
          {t('catalogSenaSkuDependencyImpact')}
        </p>
        <div className="mt-1">
          <SectionTitle title={t('catalogSenaSkuDependencyImpact')} tooltip={t('catalogSenaSkuDependencyImpactTooltip')} />
        </div>
      </div>
      <div ref={listRef} className="divide-y divide-border/60 px-6 py-2" data-testid="dependency-impact-list">
        {pagedRows.map((row) => (
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
      {shouldPaginate ? (
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
      ) : null}
    </section>
  );
}
