import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { NavigationNextIcon, NavigationPreviousIcon } from '@icons/navigation';
import { cardFrameClassName, cardSurfaceClassName } from '@/components/ui/card';
import { pillHoverClassName } from '@/lib/interactive-surface';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';
import { SectionTitle } from './sku-detail/section-heading';

const DEFAULT_MEASURED_PANEL_MAX_BODY_HEIGHT = 360;
const DEFAULT_MEASURED_PANEL_FALLBACK_ROWS = 3;

function minHeightStyle(value: number) {
  return value > 0 ? { minHeight: `${Math.ceil(value)}px` } : undefined;
}

function PanelFrame({
  children,
  title,
  tooltip,
}: {
  children: ReactNode;
  title: string;
  tooltip: string;
}) {
  return (
    <section className={`${cardFrameClassName} ${cardSurfaceClassName} rounded-[2rem]`}>
      <div className="border-b border-border/60 px-6 py-4">
        <SectionTitle title={title} tooltip={tooltip} />
      </div>
      {children}
    </section>
  );
}

export function PagedPanelNavigation({
  firstLabel,
  className,
  nextAriaLabel,
  pageCount,
  pageIndex,
  pageLabel,
  previousAriaLabel,
  setPageIndex,
  lastLabel,
}: {
  firstLabel?: string;
  className?: string;
  nextAriaLabel?: string;
  pageCount: number;
  pageIndex: number;
  pageLabel?: string;
  previousAriaLabel?: string;
  setPageIndex: (value: number | ((current: number) => number)) => void;
  lastLabel?: string;
}) {
  const { t } = usePreferences();
  const resolvedPageLabel =
    pageLabel ??
    t('catalogSenaSkuEvidencePageLabel')
      .replace('{current}', String(pageIndex + 1))
      .replace('{total}', String(pageCount));
  const resolvedPreviousAriaLabel = previousAriaLabel ?? t('catalogSenaSkuEvidencePrevious');
  const resolvedNextAriaLabel = nextAriaLabel ?? t('catalogSenaSkuEvidenceNext');
  const resolvedFirstLabel = firstLabel ?? t('catalogSenaSkuEvidenceFirst');
  const resolvedLastLabel = lastLabel ?? t('catalogSenaSkuEvidenceLast');

  return (
    <div className={cn('flex w-full items-center justify-between border-t border-border/60 px-6 py-3', className)}>
      <p className="text-sm text-muted-foreground">{resolvedPageLabel}</p>
      <div className="flex items-center gap-2">
        <button
          aria-label={resolvedPreviousAriaLabel}
          className={`rounded-full border border-border/70 p-2 text-foreground transition-colors ${pillHoverClassName} disabled:text-muted-foreground disabled:hover:bg-transparent disabled:hover:text-muted-foreground disabled:hover:shadow-none`}
          data-slot="paged-panel-nav-pill"
          disabled={pageIndex === 0}
          type="button"
          onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
        >
          <NavigationPreviousIcon className="size-4" />
        </button>
        <button
          className={`rounded-full border border-border/70 px-3 py-1 text-sm text-foreground transition-colors ${pillHoverClassName} disabled:text-muted-foreground disabled:hover:bg-transparent disabled:hover:text-muted-foreground disabled:hover:shadow-none`}
          data-slot="paged-panel-nav-pill"
          disabled={pageIndex === 0}
          type="button"
          onClick={() => setPageIndex(0)}
        >
          <NavigationPreviousIcon data-icon="inline-start" className="mr-1 inline size-4" />
          {resolvedFirstLabel}
        </button>
        <button
          className={`rounded-full border border-border/70 px-3 py-1 text-sm text-foreground transition-colors ${pillHoverClassName} disabled:text-muted-foreground disabled:hover:bg-transparent disabled:hover:text-muted-foreground disabled:hover:shadow-none`}
          data-slot="paged-panel-nav-pill"
          disabled={pageIndex >= pageCount - 1}
          type="button"
          onClick={() => setPageIndex(pageCount - 1)}
        >
          <NavigationNextIcon data-icon="inline-start" className="mr-1 inline size-4" />
          {resolvedLastLabel}
        </button>
        <button
          aria-label={resolvedNextAriaLabel}
          className={`rounded-full border border-border/70 p-2 text-foreground transition-colors ${pillHoverClassName} disabled:text-muted-foreground disabled:hover:bg-transparent disabled:hover:text-muted-foreground disabled:hover:shadow-none`}
          data-slot="paged-panel-nav-pill"
          disabled={pageIndex >= pageCount - 1}
          type="button"
          onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
        >
          <NavigationNextIcon className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function MeasuredPagedDetailPanel<T>({
  fallbackRows = DEFAULT_MEASURED_PANEL_FALLBACK_ROWS,
  items,
  listTestId,
  maxBodyHeight = DEFAULT_MEASURED_PANEL_MAX_BODY_HEIGHT,
  renderItem,
  title,
  tooltip,
}: {
  fallbackRows?: number;
  items: T[];
  listTestId?: string;
  maxBodyHeight?: number;
  renderItem: (item: T) => ReactNode;
  title: string;
  tooltip: string;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [pageIndex, setPageIndex] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(items.length);
  const [isMeasuring, setIsMeasuring] = useState(true);
  const [stableBodyHeight, setStableBodyHeight] = useState(0);

  useEffect(() => {
    const node = listRef.current;
    if (!node) {
      return;
    }

    const measureRows = () => {
      const children = Array.from(node.children) as HTMLDivElement[];
      if (children.length === 0) {
        setRowsPerPage(items.length);
        setIsMeasuring(false);
        return;
      }

      const measuredHeights = children.map((child) => child.getBoundingClientRect().height);
      if (measuredHeights.every((height) => height <= 0)) {
        setRowsPerPage(items.length);
        setIsMeasuring(false);
        return;
      }

      const estimatedTotalHeight = measuredHeights.reduce((sum, height) => sum + (height > 0 ? height : 104), 0);
      if (estimatedTotalHeight <= maxBodyHeight) {
        setRowsPerPage(items.length);
        setIsMeasuring(false);
        return;
      }

      let accumulatedHeight = 0;
      let fittedRows = 0;
      for (const [index] of children.entries()) {
        const rectHeight = measuredHeights[index] ?? 0;
        const childHeight = rectHeight > 0 ? rectHeight : 104;
        if (fittedRows > 0 && accumulatedHeight + childHeight > maxBodyHeight) {
          break;
        }
        accumulatedHeight += childHeight;
        fittedRows += 1;
      }

      setRowsPerPage(Math.max(1, Math.min(fittedRows || fallbackRows, items.length)));
      setIsMeasuring(false);
    };

    const observer = new ResizeObserver(() => measureRows());
    observer.observe(node);
    measureRows();
    return () => observer.disconnect();
  }, [fallbackRows, items, maxBodyHeight]);

  const shouldPaginate = !isMeasuring && rowsPerPage < items.length;
  const pageCount = shouldPaginate ? Math.max(1, Math.ceil(items.length / rowsPerPage)) : 1;
  const pagedItems = useMemo(() => {
    if (!shouldPaginate || isMeasuring) {
      return items;
    }
    const start = pageIndex * rowsPerPage;
    return items.slice(start, start + rowsPerPage);
  }, [isMeasuring, items, pageIndex, rowsPerPage, shouldPaginate]);

  useEffect(() => {
    setPageIndex((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    const node = listRef.current;
    if (!node) {
      return;
    }
    const nextHeight = node.getBoundingClientRect().height;
    if (nextHeight > stableBodyHeight) {
      setStableBodyHeight(nextHeight);
    }
  }, [pagedItems, stableBodyHeight]);

  return (
    <PanelFrame title={title} tooltip={tooltip}>
      <div
        ref={listRef}
        className="divide-y divide-border/60 px-6 py-2"
        data-testid={listTestId}
        style={minHeightStyle(stableBodyHeight)}
      >
        {pagedItems.map((item, index) => (
          <div key={index}>{renderItem(item)}</div>
        ))}
      </div>
      {shouldPaginate ? <PagedPanelNavigation pageCount={pageCount} pageIndex={pageIndex} setPageIndex={setPageIndex} /> : null}
    </PanelFrame>
  );
}

export function PagedEvidenceTimelinePanel<T>({
  emptyState,
  items,
  pageSize = 5,
  renderItem,
  title,
  tooltip,
}: {
  emptyState?: ReactNode;
  items: T[];
  pageSize?: number;
  renderItem: (item: T) => ReactNode;
  title: string;
  tooltip: string;
}) {
  const [pageIndex, setPageIndex] = useState(0);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [stableBodyHeight, setStableBodyHeight] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const pagedItems = useMemo(() => {
    const start = pageIndex * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, pageIndex, pageSize]);

  useEffect(() => {
    setPageIndex((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  useEffect(() => {
    const node = bodyRef.current;
    if (!node) {
      return;
    }
    const nextHeight = node.getBoundingClientRect().height;
    if (nextHeight > stableBodyHeight) {
      setStableBodyHeight(nextHeight);
    }
  }, [pagedItems, stableBodyHeight]);

  return (
    <PanelFrame title={title} tooltip={tooltip}>
      <div ref={bodyRef} className="divide-y divide-border/60 px-6 py-2" style={minHeightStyle(stableBodyHeight)}>
        {items.length > 0 ? pagedItems.map((item, index) => <div key={index}>{renderItem(item)}</div>) : emptyState}
      </div>
      {items.length > pageSize ? (
        <PagedPanelNavigation pageCount={pageCount} pageIndex={pageIndex} setPageIndex={setPageIndex} />
      ) : null}
    </PanelFrame>
  );
}
