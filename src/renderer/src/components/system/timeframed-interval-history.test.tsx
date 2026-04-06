import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { useTimeframedIntervalHistory } from './timeframed-interval-history';
import type { IntervalPageEnvelope } from './interval-history';
import type { ChartTimeframe } from './chart-timeframe';

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
    pageLimit: count,
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
  onPruneTransition,
  timeframe,
}: {
  fetchInitialPage: (limit?: number) => Promise<Page | null>;
  fetchOlderPage: (beforeIntervalIndex: number, limit?: number) => Promise<Page | null>;
  intervalCount: number;
  latestObservedAt: string;
  onPruneTransition?: () => Promise<void> | void;
  timeframe: ChartTimeframe;
}) {
  const { detail, isHydratingDetails, resolvedTimeframe, timeframeHydrationProgress } = useTimeframedIntervalHistory({
    fetchInitialPage: async (limit) => fetchInitialPage(limit),
    fetchOlderPage: async (beforeIntervalIndex, limit) => fetchOlderPage(beforeIntervalIndex, limit),
    getLoadedIntervalCount: (page) => page?.detail.items.length ?? 0,
    getOldestIntervalAt: (page) => page?.detail.items[0]?.startAt ?? null,
    initialPage: null,
    intervalCount,
    latestObservedAt,
    mergeDetails: (older, newer) => ({
      items: [...older.items, ...newer.items],
    }),
    onPruneTransition,
    timeframe,
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
  test('does not leave hydration stuck after incremental timeframe page publishes', async () => {
    const firstOlderPage = deferred<Page | null>();
    const secondOlderPage = deferred<Page | null>();
    const fetchInitialPage = async () => makePage(20, 20, 20);
    const fetchOlderPage = async (beforeIntervalIndex: number) => {
      if (beforeIntervalIndex === 20) {
        return firstOlderPage.promise;
      }
      if (beforeIntervalIndex === 10) {
        return secondOlderPage.promise;
      }
      return null;
    };

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

    await act(async () => {
      firstOlderPage.resolve(makePage(10, 10, 10));
      await firstOlderPage.promise;
    });

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('30'));
    expect(screen.getByTestId('hydrating')).toHaveTextContent('true');
    expect(screen.getByTestId('progress')).toHaveTextContent('2/2');

    await act(async () => {
      secondOlderPage.resolve(makePage(0, 10, null));
      await secondOlderPage.promise;
    });

    await waitFor(() => expect(screen.getByTestId('count')).toHaveTextContent('40'));
    await waitFor(() => expect(screen.getByTestId('progress')).toHaveTextContent('idle'));
    await waitFor(() => expect(screen.getByTestId('hydrating')).toHaveTextContent('false'));
    expect(screen.getByTestId('resolved-timeframe')).toHaveTextContent('MAX');
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
});
