import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { useTimeframedIntervalHistory } from './timeframed-interval-history';
import type { IntervalPageEnvelope } from './interval-history';
import { RECENT_TIMEFRAME_MIN_REPORTS, type ChartTimeframe } from './chart-timeframe';

type Detail = {
  items: Array<{ intervalIndex: number; startAt: string; endAt: string }>;
};

type Page = IntervalPageEnvelope<Detail>;

function makePage(start: number, count: number, nextBeforeIntervalIndex: number | null): Page {
  return {
    detail: {
      items: Array.from({ length: count }, (_, index) => {
        const intervalIndex = start + index;
        return {
          endAt: `2026-03-${String((intervalIndex % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
          intervalIndex,
          startAt: `2026-02-${String((intervalIndex % 28) + 1).padStart(2, '0')}T00:00:00.000Z`,
        };
      }),
    },
    hasOlder: nextBeforeIntervalIndex != null,
    latestIntervalIndex: start + count - 1,
    nextBeforeIntervalIndex,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function Harness({
  fetchInitialPage,
  fetchOlderPage,
  intervalCount,
  latestObservedAt,
  hydrateTimeframeSequentially,
  initialPage = null,
  onPruneTransition,
  timeframe,
  timeframeBoundaryOverride,
  timeframeCacheKey,
}: {
  fetchInitialPage: (limit?: number) => Promise<Page | null>;
  fetchOlderPage: (beforeIntervalIndex: number, limit?: number) => Promise<Page | null>;
  hydrateTimeframeSequentially?: boolean;
  initialPage?: Page | null;
  intervalCount: number;
  latestObservedAt: string;
  onPruneTransition?: () => Promise<void> | void;
  timeframe: ChartTimeframe;
  timeframeBoundaryOverride?: Date | null;
  timeframeCacheKey?: string;
}) {
  const { detail, isHydratingDetails, resolvedTimeframe, timeframeHydrationProgress } = useTimeframedIntervalHistory<Detail, Page>({
    fetchInitialPage: async (limit) => fetchInitialPage(limit),
    fetchOlderPage: async (beforeIntervalIndex, limit) => fetchOlderPage(beforeIntervalIndex, limit),
    getLoadedIntervalCount: (page) => page?.detail.items.length ?? 0,
    getOldestIntervalAt: (page) => page?.detail.items[0]?.startAt ?? null,
    initialPage,
    intervalCount,
    latestObservedAt,
    hydrateTimeframeSequentially,
    mergeDetails: (older, newer) => ({
      items: [...older.items, ...newer.items],
    }),
    onPruneTransition,
    timeframe,
    timeframeBoundaryOverride,
    timeframeCacheKey,
  });

  return (
    <div>
      <span data-testid="count">{detail?.items.length ?? 0}</span>
      <span data-testid="hydrating">{String(isHydratingDetails)}</span>
      <span data-testid="progress">
        {timeframeHydrationProgress ? `${timeframeHydrationProgress.current}/${timeframeHydrationProgress.total}` : 'idle'}
      </span>
      <span data-testid="resolved-timeframe">{resolvedTimeframe ?? 'none'}</span>
    </div>
  );
}

describe('useTimeframedIntervalHistory', () => {
  test('requests only the Recent minimum on first Recent load', async () => {
    const fetchInitialPage = vi.fn(async () => makePage(35, RECENT_TIMEFRAME_MIN_REPORTS, 35));
    const fetchOlderPage = vi.fn(async () => makePage(25, 10, 25));

    render(
      <Harness
        fetchInitialPage={fetchInitialPage}
        fetchOlderPage={fetchOlderPage}
        intervalCount={40}
        latestObservedAt="2026-03-21T04:00:00.000Z"
        timeframe="Recent"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('resolved-timeframe')).toHaveTextContent('Recent'));
    expect(fetchInitialPage).toHaveBeenCalledWith(RECENT_TIMEFRAME_MIN_REPORTS);
    expect(fetchOlderPage).not.toHaveBeenCalled();
  });

  test('does not backfill every dense Recent page on first load', async () => {
    const initialPage: Page = {
      ...makePage(35, 5, 35),
      detail: {
        items: Array.from({ length: 5 }, (_, index) => ({
          endAt: `2026-03-21T0${index}:00:00.000Z`,
          intervalIndex: 35 + index,
          startAt: `2026-03-20T0${index}:00:00.000Z`,
        })),
      },
    };
    const fetchInitialPage = vi.fn(async () => makePage(35, 5, 35));
    const fetchOlderPage = vi.fn(async () => makePage(25, 10, 25));

    render(
      <Harness
        fetchInitialPage={fetchInitialPage}
        fetchOlderPage={fetchOlderPage}
        initialPage={initialPage}
        intervalCount={40}
        latestObservedAt="2026-03-21T04:00:00.000Z"
        timeframe="Recent"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('resolved-timeframe')).toHaveTextContent('Recent'));
    expect(screen.getByTestId('count')).toHaveTextContent('5');
    expect(fetchOlderPage).not.toHaveBeenCalled();
  });

  test('loads estimated timeframe history in one expanded older request', async () => {
    const olderPage = deferred<Page | null>();
    const fetchInitialPage = async () => makePage(20, 20, 20);
    const fetchOlderPage = vi.fn(async (beforeIntervalIndex: number) => {
      if (beforeIntervalIndex === 20) {
        return olderPage.promise;
      }
      return null;
    });

    render(
      <Harness
        fetchInitialPage={fetchInitialPage}
        fetchOlderPage={fetchOlderPage}
        intervalCount={40}
        latestObservedAt="2026-03-21T00:00:00.000Z"
        timeframe="MAX"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('20'));
    expect(screen.getByTestId('hydrating')).toHaveTextContent('true');
    expect(screen.getByTestId('progress')).toHaveTextContent('1/2');
    expect(fetchOlderPage).toHaveBeenCalledWith(20, 20);

    await act(async () => {
      olderPage.resolve(makePage(0, 20, null));
      await olderPage.promise;
    });

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('40'));
    await waitFor(() => expect(screen.getByTestId('progress')).toHaveTextContent('idle'));
    await waitFor(() => expect(screen.getByTestId('hydrating')).toHaveTextContent('false'));
    expect(screen.getByTestId('resolved-timeframe')).toHaveTextContent('MAX');
    expect(fetchOlderPage).toHaveBeenCalledTimes(1);
  });

  test('can hydrate timeframe history one older page at a time without batch progress', async () => {
    const fetchInitialPage = async () => makePage(20, 20, 20);
    const fetchOlderPage = vi.fn(async (beforeIntervalIndex: number) => {
      if (beforeIntervalIndex === 20) {
        return makePage(10, 10, 10);
      }
      if (beforeIntervalIndex === 10) {
        return makePage(0, 10, null);
      }
      return null;
    });

    render(
      <Harness
        fetchInitialPage={fetchInitialPage}
        fetchOlderPage={fetchOlderPage}
        hydrateTimeframeSequentially
        intervalCount={40}
        latestObservedAt="2026-03-21T00:00:00.000Z"
        timeframe="MAX"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('40'));
    expect(screen.getByTestId('progress')).toHaveTextContent('idle');
    expect(fetchOlderPage).toHaveBeenNthCalledWith(1, 20, 10);
    expect(fetchOlderPage).toHaveBeenNthCalledWith(2, 10, 10);
    expect(fetchOlderPage).toHaveBeenCalledTimes(2);
  });

  test('marks a pruned narrower timeframe as resolved without requiring a hydrate pass', async () => {
    const onPruneTransition = vi.fn();
    const fetchInitialPage = async (_limit?: number) => makePage(20, 20, 20);
    const fetchOlderPage = async (beforeIntervalIndex: number) => {
      if (beforeIntervalIndex === 20) {
        return makePage(10, 10, 10);
      }
      if (beforeIntervalIndex === 10) {
        return makePage(0, 10, null);
      }
      return null;
    };

    const { rerender } = render(
      <Harness
        fetchInitialPage={fetchInitialPage}
        fetchOlderPage={fetchOlderPage}
        intervalCount={40}
        latestObservedAt="2026-03-21T00:00:00.000Z"
        onPruneTransition={onPruneTransition}
        timeframe="MAX"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('resolved-timeframe')).toHaveTextContent('MAX'));

    rerender(
      <Harness
        fetchInitialPage={fetchInitialPage}
        fetchOlderPage={fetchOlderPage}
        intervalCount={40}
        latestObservedAt="2026-03-21T00:00:00.000Z"
        onPruneTransition={onPruneTransition}
        timeframe="Recent"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('resolved-timeframe')).toHaveTextContent('Recent'));
    await waitFor(() => expect(screen.getByTestId('hydrating')).toHaveTextContent('false'));
    expect(onPruneTransition).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('progress')).toHaveTextContent('idle');
    expect(screen.getByTestId('count')).toHaveTextContent('20');
  });

  test('ignores stale hydration results after the timeframe changes again', async () => {
    const maxOlderPage = deferred<Page | null>();
    const fetchInitialPage = vi.fn(async (_limit?: number) => makePage(20, 20, 20));
    const fetchOlderPage = vi.fn(async (beforeIntervalIndex: number) => {
      if (beforeIntervalIndex === 20) {
        return maxOlderPage.promise;
      }
      return null;
    });

    const { rerender } = render(
      <Harness
        fetchInitialPage={fetchInitialPage}
        fetchOlderPage={fetchOlderPage}
        intervalCount={40}
        latestObservedAt="2026-03-21T00:00:00.000Z"
        timeframe="MAX"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('20'));
    expect(screen.getByTestId('hydrating')).toHaveTextContent('true');

    rerender(
      <Harness
        fetchInitialPage={fetchInitialPage}
        fetchOlderPage={fetchOlderPage}
        intervalCount={40}
        latestObservedAt="2026-03-21T00:00:00.000Z"
        timeframe="1M"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('resolved-timeframe')).toHaveTextContent('1M'));

    await act(async () => {
      maxOlderPage.resolve(makePage(10, 10, 10));
      await maxOlderPage.promise;
    });

    await waitFor(() => expect(screen.getByTestId('resolved-timeframe')).toHaveTextContent('1M'));
    expect(screen.getByTestId('count')).toHaveTextContent('20');
    expect(screen.getByTestId('hydrating')).toHaveTextContent('false');
  });

  test('hydrates against a custom boundary override using a custom cache key', async () => {
    const fetchInitialPage = vi.fn(async () => makePage(20, 20, 20));
    const fetchOlderPage = vi.fn(async (beforeIntervalIndex: number) => {
      if (beforeIntervalIndex === 20) {
        return makePage(0, 20, null);
      }
      return null;
    });

    render(
      <Harness
        fetchInitialPage={fetchInitialPage}
        fetchOlderPage={fetchOlderPage}
        intervalCount={40}
        latestObservedAt="2026-03-21T00:00:00.000Z"
        timeframe="MAX"
        timeframeBoundaryOverride={new Date('2026-02-01T00:00:00.000Z')}
        timeframeCacheKey="Custom:2026-02-01:2026-03-21"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('40'));
    expect(fetchOlderPage).toHaveBeenCalledWith(20, 20);
  });

  test('does not restart hydration when an equivalent boundary date is recreated', async () => {
    const fetchInitialPage = vi.fn(async () => makePage(20, 20, 20));
    const fetchOlderPage = vi.fn(async () => makePage(0, 20, 0));

    const { rerender } = render(
      <Harness
        fetchInitialPage={fetchInitialPage}
        fetchOlderPage={fetchOlderPage}
        intervalCount={60}
        latestObservedAt="2026-03-21T00:00:00.000Z"
        timeframe="MAX"
        timeframeBoundaryOverride={new Date('2026-02-01T00:00:00.000Z')}
        timeframeCacheKey="Custom:2026-02-01:2026-03-21"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('resolved-timeframe')).toHaveTextContent('MAX'));

    rerender(
      <Harness
        fetchInitialPage={fetchInitialPage}
        fetchOlderPage={fetchOlderPage}
        intervalCount={60}
        latestObservedAt="2026-03-21T00:00:00.000Z"
        timeframe="MAX"
        timeframeBoundaryOverride={new Date('2026-02-01T00:00:00.000Z')}
        timeframeCacheKey="Custom:2026-02-01:2026-03-21"
      />,
    );

    await waitFor(() => expect(screen.getByTestId('resolved-timeframe')).toHaveTextContent('MAX'));
    expect(fetchInitialPage).toHaveBeenCalledTimes(1);
  });
});
