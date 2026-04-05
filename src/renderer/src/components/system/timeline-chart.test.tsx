import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import {
  IntervalBarTimelineChart,
  MeanBandTimelineChart,
  SparseTimelineChart,
  TimelineRangeChart,
} from './timeline-chart';

describe('MeanBandTimelineChart', () => {
  test('renders selectable mean points over a banded series', () => {
    const onSelect = vi.fn();

    render(
      <MeanBandTimelineChart
        axisEndPadding={12}
        axisStartPadding={20}
        bandFill="rgba(48,31,20,0.1)"
        data={[
          { high: 8, intervalIndex: 0, intervalPosition: 0, low: 4, mean: 6 },
          { high: 10, intervalIndex: 1, intervalPosition: 1, low: 5, mean: 7 },
        ]}
        gutterHeight={24}
        lineStroke="rgba(48,31,20,1)"
        plotHeight={72}
        pointButtons={{
          ariaLabel: (datum) => `Inventory ${datum.intervalIndex}`,
          onSelect,
          selected: (datum) => datum.intervalIndex === 1,
          selectedLabel: (datum) => <span>{datum.mean}u</span>,
        }}
        slotWidth={72}
      />,
    );

    expect(screen.getByText('7u')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Inventory 0'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ intervalIndex: 0 }), 0);
  });
});

describe('SparseTimelineChart', () => {
  test('renders selectable regime slots and sparse price markers', () => {
    const onSelectPoint = vi.fn();
    const onSelectSlot = vi.fn();

    render(
      <SparseTimelineChart
        axisEndPadding={12}
        axisStartPadding={20}
        gutterHeight={32}
        lineStroke="rgba(48,31,20,0.7)"
        plotHeight={120}
        pointButtons={{
          ariaLabel: (point) => point.ariaLabel,
          onSelect: onSelectPoint,
          selected: (point) => point.intervalIndex === 1,
          selectedLabel: () => <span>$12</span>,
        }}
        points={[
          { ariaLabel: 'Price 10', intervalIndex: 0, intervalPosition: 0, key: 'p0', value: 10 },
          { ariaLabel: 'Price 12', intervalIndex: 1, intervalPosition: 1, key: 'p1', value: 12 },
        ]}
        slotButtons={{
          onSelect: onSelectSlot,
          selected: (slot) => slot.intervalIndex === 0,
        }}
        slots={[
          { ariaLabel: 'promo', fill: 'rgba(248,224,184,0.78)', intervalIndex: 0, intervalPosition: 0 },
          { ariaLabel: 'normal', fill: 'rgba(244,223,207,0.72)', intervalIndex: 1, intervalPosition: 1 },
        ]}
        slotWidth={72}
      />,
    );

    expect(document.querySelectorAll('[data-regime-slot="true"]')).toHaveLength(2);
    expect(screen.getByText('$12')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('promo'));
    fireEvent.click(screen.getByLabelText('Price 10'));
    expect(onSelectSlot).toHaveBeenCalled();
    expect(onSelectPoint).toHaveBeenCalled();
  });
});

describe('IntervalBarTimelineChart', () => {
  test('routes slot clicks through the shared interval bar chart', () => {
    const onSelect = vi.fn();

    render(
      <IntervalBarTimelineChart
        axisEndPadding={12}
        axisStartPadding={20}
        data={[
          { ariaLabel: 'Interval 1', intervalIndex: 0, values: { demand: -2, receipts: 3 } },
          { ariaLabel: 'Interval 2', intervalIndex: 1, values: { demand: -1, receipts: 2 } },
        ]}
        gutterHeight={24}
        plotHeight={60}
        series={[
          { dataKey: 'demand', fill: 'rgba(48,31,20,0.2)', stackId: 'demand' },
          { dataKey: 'receipts', fill: 'rgba(5,150,105,0.8)', stackId: 'supply' },
        ]}
        selected={(datum) => datum.intervalIndex === 1}
        selectedLabel={() => <span>selected</span>}
        slotWidth={72}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByText('selected')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Interval 1'));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ intervalIndex: 0 }), 0);
  });
});

describe('TimelineRangeChart', () => {
  test('routes span and marker clicks through the shared range chart', () => {
    const onSelectInterval = vi.fn();

    render(
      <TimelineRangeChart
        axisEndPadding={12}
        axisStartPadding={20}
        gutterHeight={8}
        itemCount={3}
        markers={[
          {
            ariaLabel: 'Order cue 5 units',
            fill: 'rgba(2,132,199,0.85)',
            intervalIndex: 1,
            key: 'marker-1',
            kind: 'order',
            row: 1,
            x: 1,
          },
        ]}
        plotHeight={96}
        rowCount={3}
        selectedIntervalIndex={1}
        slotWidth={72}
        spans={[
          {
            ariaLabel: '8 in transit',
            endPosition: 1.8,
            fill: 'rgba(110,231,183,0.28)',
            intervalIndex: 1,
            key: 'span-1',
            label: <span>8 in transit</span>,
            row: 1,
            startPosition: 0.6,
            stroke: 'rgba(4,120,87,0.25)',
          },
        ]}
        onSelectInterval={onSelectInterval}
      />,
    );

    fireEvent.click(screen.getByLabelText('8 in transit'));
    fireEvent.click(screen.getByLabelText('Order cue 5 units'));
    expect(onSelectInterval).toHaveBeenCalledTimes(2);
  });
});
