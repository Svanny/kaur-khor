import { useCallback, useEffect, useRef, useState } from 'react';

export interface IntervalPageEnvelope<T> {
  detail: T;
  hasOlder: boolean;
  nextBeforeIntervalIndex: number | null;
  latestIntervalIndex: number | null;
}

export function usePagedIntervalHistory<T>({
  initialPage,
  mergeDetails,
  onPageChange,
  fetchOlderPage,
}: {
  initialPage: IntervalPageEnvelope<T> | null;
  mergeDetails: (older: T, newer: T) => T;
  onPageChange?: (page: IntervalPageEnvelope<T> | null) => void;
  fetchOlderPage: (beforeIntervalIndex: number) => Promise<IntervalPageEnvelope<T> | null>;
}) {
  const [page, setPage] = useState<IntervalPageEnvelope<T> | null>(initialPage);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const latestInitialKeyRef = useRef<number | null>(initialPage?.latestIntervalIndex ?? null);

  useEffect(() => {
    const nextKey = initialPage?.latestIntervalIndex ?? null;
    if (nextKey !== latestInitialKeyRef.current) {
      latestInitialKeyRef.current = nextKey;
      setPage(initialPage);
    }
  }, [initialPage]);

  useEffect(() => {
    onPageChange?.(page);
  }, [onPageChange, page]);

  const loadOlder = useCallback(async () => {
    if (isLoadingOlder || !page?.hasOlder || page.nextBeforeIntervalIndex == null) {
      return null;
    }
    setIsLoadingOlder(true);
    try {
      const olderPage = await fetchOlderPage(page.nextBeforeIntervalIndex);
      if (!olderPage) {
        setPage((current) =>
          current
            ? { ...current, hasOlder: false, nextBeforeIntervalIndex: null }
            : current,
        );
        return null;
      }
      setPage((current) => {
        if (!current) {
          return olderPage;
        }
        return {
          detail: mergeDetails(olderPage.detail, current.detail),
          hasOlder: olderPage.hasOlder,
          nextBeforeIntervalIndex: olderPage.nextBeforeIntervalIndex,
          latestIntervalIndex: current.latestIntervalIndex ?? olderPage.latestIntervalIndex,
        };
      });
      return olderPage;
    } finally {
      setIsLoadingOlder(false);
    }
  }, [fetchOlderPage, isLoadingOlder, mergeDetails, page]);

  return {
    page,
    detail: page?.detail ?? null,
    hasOlder: page?.hasOlder ?? false,
    latestIntervalIndex: page?.latestIntervalIndex ?? null,
    isLoadingOlder,
    loadOlder,
  };
}
