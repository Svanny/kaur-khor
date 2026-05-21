import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AnalysisTradingChartLedger } from './trading-chart-ledger';
import type { AnalysisWorkbenchViewModel } from './analysis-view-model';

const tradingChartLedgerMock = vi.fn();

vi.mock('@/components/system/trading-chart/ledger', () => ({
  TradingChartLedger: (props: Record<string, unknown>) => {
    tradingChartLedgerMock(props);
    return <div data-testid="analysis-trading-chart-ledger" />;
  },
}));

vi.mock('./trading-chart-adapter', () => ({
  deriveAnalysisTradingChartModel: () => ({ points: [] }),
}));

describe('AnalysisTradingChartLedger', () => {
  it('uses the shared chart default height and fills the available analysis surface', () => {
    render(
      <AnalysisTradingChartLedger
        hasOlderIntervals={false}
        isLoadingOlderIntervals={false}
        loadOlderIntervals={vi.fn(async () => 0)}
        model={{} as AnalysisWorkbenchViewModel}
        selectedIntervalIndex={null}
        setSelection={vi.fn()}
        timeframe="Recent"
        onTimeframeChange={vi.fn()}
      />,
    );

    const props = tradingChartLedgerMock.mock.calls.at(-1)?.[0] as Record<string, unknown>;

    expect(props.baseMinRenderHeight).toBeUndefined();
    expect(props.additionalPaneMinRenderHeight).toBeUndefined();
    expect(props.chartRenderHeight).toBeUndefined();
    expect(props.className).toBeUndefined();
    expect(props.fillAvailableHeight).toBe(true);
  });
});
