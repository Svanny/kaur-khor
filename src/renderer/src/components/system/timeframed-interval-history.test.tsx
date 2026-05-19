import { act, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { ChartTimeframe } from './chart-timeframe';
import { useTimeframedIntervalHistory } from './timeframed-interval-history';

type TestDetail = {
  intervals: Array<{ endAt: string; intervalIndex: number; startAt: string }>;
};

type TestPage = {
  detail: TestDetail;
  hasOlder: boolean;
  latestIntervalIndex: number | null;
  nextBeforeIntervalIndex: number | null;
};

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function page(intervalIndex: number, hasOlder = false): TestPage {
  return {
    detail: {
      intervals: [{
        endAt: `2026-04-${String(intervalIndex + 1).padStart(2, '0')}T00:00:00.000Z`,
        intervalIndex,
        startAt: `2026-04-${String(intervalIndex).padStart(2, '0')}T00:00:00.000Z`,
      }],
    },
    hasOlder,
    latestIntervalIndex: intervalIndex,
    nextBeforeIntervalIndex: hasOlder ? intervalIndex - 1 : null,
  };
}

describe('useTimeframedIntervalHistory', () => {
  it('ignores older-page loads that resolve after the timeframe changes', async () => {
    const olderPage = deferred<TestPage | null>();

    function Harness() {
      const [timeframe, setTimeframe] = useState<ChartTimeframe>('Recent');
      const history = useTimeframedIntervalHistory<TestDetail, TestPage>({
        fetchInitialPage: async () => page(timeframe === 'Recent' ? 10 : 30, timeframe === 'Recent'),
        fetchOlderPage: async () => olderPage.promise,
        getLoadedIntervalCount: (nextPage) => nextPage?.detail.intervals.length ?? 0,
        getOldestIntervalAt: (nextPage) => nextPage?.detail.intervals[0]?.startAt ?? null,
        initialPage: page(10, true),
        intervalCount: 40,
        latestObservedAt: '2026-04-30T00:00:00.000Z',
        mergeDetails: (older, newer) => ({
          intervals: [...older.intervals, ...newer.intervals],
        }),
        timeframe,
      });

      return (
        <div>
          <div data-testid="interval-indexes">
            {history.detail?.intervals.map((interval) => interval.intervalIndex).join(',') ?? 'none'}
          </div>
          <button type="button" onClick={() => void history.loadOlder()}>
            load older
          </button>
          <button type="button" onClick={() => setTimeframe('MAX')}>
            show max
          </button>
        </div>
      );
    }

    render(<Harness />);

    await waitFor(() => {
      expect(screen.getByTestId('interval-indexes')).toHaveTextContent('10');
    });

    await act(async () => {
      screen.getByText('load older').click();
      screen.getByText('show max').click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('interval-indexes')).toHaveTextContent('30');
    });

    await act(async () => {
      olderPage.resolve(page(9));
      await olderPage.promise;
    });

    expect(screen.getByTestId('interval-indexes')).toHaveTextContent('30');
  });
});
