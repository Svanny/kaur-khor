import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import {
  deriveAnchoredZoomScrollLeft,
  deriveAxisContentWidth,
  deriveCenteredIntervalScrollLeft,
  deriveFreshMountIntervalScrollLeft,
  deriveInitialViewportSlotWidth,
  deriveLatestWindowScrollLeft,
  derivePrependedScrollLeft,
  deriveSequentialOlderLoadBatchCount,
  deriveSlotCenterX,
  deriveSlotLeftX,
  deriveUniformPillLabelMode,
  deriveVisibleIntervalCount,
  deriveViewportPageScrollLeft,
  deriveVisibleWindow,
  handleIntervalChartWheel,
  IntervalStrip,
  intervalLabelForWidth,
  intervalTooltipLabel,
  MIN_SLOT_WIDTH,
  responsivePillLabelForMode,
  responsivePillLabel,
  shouldLoadOlderIntervals,
} from './interval-strip';
import { buildPointCoordinatesWithDomain, buildTrajectoryBandPath } from './timeline-chart';
import { formatSenaLongDateTime24 } from '@/routes/sku-detail/format';

describe('interval strip helpers', () => {
  test('uses one shared axis contract for slot left and center positions', () => {
    expect(
      deriveAxisContentWidth({
        itemCount: 3,
        slotWidth: 72,
        axisStartPadding: 20,
        axisEndPadding: 36,
      }),
    ).toBe(272);
    expect(deriveSlotLeftX({ index: 0, slotWidth: 72, axisStartPadding: 20 })).toBe(20);
    expect(deriveSlotCenterX({ index: 0, slotWidth: 72, axisStartPadding: 20 })).toBe(56);
    expect(deriveSlotCenterX({ index: 2, slotWidth: 72, axisStartPadding: 20 })).toBe(200);
  });

  test('centers selected scroll targeting using the same shared axis padding', () => {
    expect(
      deriveCenteredIntervalScrollLeft({
        contentWidth: 272,
        intervalIndex: 2,
        axisStartPadding: 20,
        slotWidth: 72,
        viewportWidth: 160,
      }),
    ).toBe(112);
  });

  test('anchors fresh pages to the newest visible window inside the preloaded page', () => {
    expect(
      deriveLatestWindowScrollLeft({
        contentWidth: 1496,
        itemCount: 20,
        viewportWidth: 720,
      }),
    ).toBe(776);
    expect(
      deriveLatestWindowScrollLeft({
        contentWidth: 760,
        itemCount: 10,
        viewportWidth: 720,
      }),
    ).toBe(0);
  });

  test('defers fresh-page anchoring until the viewport is measurable', () => {
    expect(
      deriveFreshMountIntervalScrollLeft({
        contentWidth: 1496,
        itemCount: 20,
        viewportWidth: 0,
      }),
    ).toBeNull();
    expect(
      deriveFreshMountIntervalScrollLeft({
        contentWidth: 760,
        itemCount: 10,
        viewportWidth: 720,
      }),
    ).toBe(0);
    expect(
      deriveFreshMountIntervalScrollLeft({
        contentWidth: 1496,
        itemCount: 20,
        viewportWidth: 720,
      }),
    ).toBe(776);
  });

  test('anchors zoom to the hovered interval while changing slot width', () => {
    expect(
      deriveAnchoredZoomScrollLeft({
        contentWidth: 2400,
        hoveredPointerX: 280,
        intervalCount: 30,
        nextSlotWidth: 80,
        previousScrollLeft: 1320,
        previousSlotWidth: 60,
        viewportWidth: 480,
      }),
    ).toBe(1840);
  });

  test('derives an initial slot width that frames the newest visible window without enforcing it forever', () => {
    expect(
      deriveInitialViewportSlotWidth({
        itemCount: 20,
        viewportWidth: 720,
      }),
    ).toBe(66.4);
    expect(
      deriveInitialViewportSlotWidth({
        itemCount: 20,
        viewportWidth: 720,
        visibleCount: 20,
      }),
    ).toBe(33.2);
  });

  test('derives viewport paging and visible window from the same slot stride', () => {
    expect(
      deriveViewportPageScrollLeft({
        contentWidth: 272,
        currentScrollLeft: 0,
        direction: 1,
        slotWidth: 72,
        viewportWidth: 160,
      }),
    ).toBe(88);
    expect(deriveVisibleWindow(6, 96, 160, 72, 0)).toEqual({ start: 1, end: 3 });
  });

  test('uses compact tooltip and label fallbacks', () => {
    expect(intervalTooltipLabel('2026-03-05T08:00:00.000Z', 1, 'en')).toBe(
      formatSenaLongDateTime24('2026-03-05T08:00:00.000Z', 'en'),
    );
    expect(intervalTooltipLabel(null, 11, 'en')).toBe('Interval 12');
    expect(responsivePillLabel('Feb-14', 'F-14', 80)).toBe('Feb-14');
    expect(responsivePillLabel('February-14', 'F-14', 56)).toBe('F-14');
    expect(
      deriveUniformPillLabelMode(
        [
          { fullLabel: 'N-1', compactLabel: '1' },
          { fullLabel: 'D-12', compactLabel: '12' },
        ],
        52,
      ),
    ).toBe('compact');
    expect(
      deriveUniformPillLabelMode(
        [
          { fullLabel: 'N-1', compactLabel: '1' },
          { fullLabel: 'D-12', compactLabel: '12' },
        ],
        18,
      ),
    ).toBe('hidden');
    expect(responsivePillLabelForMode('N-12', '12', 'full')).toBe('N-12');
    expect(responsivePillLabelForMode('N-12', '12', 'compact')).toBe('12');
    expect(responsivePillLabelForMode('N-12', '12', 'hidden')).toBe('');
  });

  test('localizes compact interval labels and fallbacks in Khmer', () => {
    expect(intervalLabelForWidth('2026-02-14T09:00:00Z', 11, 120, 'km')).not.toBe('F-14');
    expect(intervalTooltipLabel(null, 11, 'km')).toBe('ចន្លោះ 12');
  });

  test('uses the long-date accessible label for interval pills', () => {
    render(
      <IntervalStrip
        activeIndex={1}
        axisContentWidth={272}
        axisEndPadding={36}
        axisStartPadding={20}
        canScrollLeft={false}
        canScrollRight={false}
        intervals={[
          { endAt: '2026-03-05T08:00:00.000Z', intervalIndex: 0, startAt: '2026-02-27T08:00:00.000Z' },
          { endAt: '2026-03-12T08:00:00.000Z', intervalIndex: 1, startAt: '2026-03-05T08:00:00.000Z' },
        ]}
        language="en"
        onScroll={() => {}}
        onSelect={() => {}}
        scrollByViewport={() => {}}
        scrollRef={{ current: null }}
        slotWidth={72}
      />,
    );

    expect(
      screen.getByRole('button', {
        name: formatSenaLongDateTime24('2026-03-12T08:00:00.000Z', 'en'),
      }),
    ).toBeInTheDocument();
  });

  test('detects when older intervals should load and preserves scroll anchor after prepend', () => {
    expect(shouldLoadOlderIntervals({ hasOlder: true, isLoadingOlder: false, scrollLeft: 12 })).toBe(true);
    expect(shouldLoadOlderIntervals({ hasOlder: true, isLoadingOlder: true, scrollLeft: 12 })).toBe(false);
    expect(shouldLoadOlderIntervals({ hasOlder: false, isLoadingOlder: false, scrollLeft: 12 })).toBe(false);
    expect(derivePrependedScrollLeft({ currentScrollLeft: 48, prependedCount: 3, slotWidth: 72 })).toBe(264);
  });

  test('loads enough older intervals to cover the visible lane capacity with a floor of one 10-interval batch', () => {
    expect(deriveVisibleIntervalCount(720, 14, 0)).toBe(52);
    expect(
      deriveSequentialOlderLoadBatchCount({
        batchSize: 10,
        slotWidth: 14,
        viewportWidth: 720,
      }),
    ).toBe(6);
    expect(
      deriveSequentialOlderLoadBatchCount({
        batchSize: 10,
        slotWidth: 120,
        viewportWidth: 720,
      }),
    ).toBe(1);
  });

  test('clamps pinch zoom at the new deep zoom-out minimum slot width', () => {
    const onLoadOlder = vi.fn();
    const onPan = vi.fn();
    const onZoom = vi.fn();
    const currentTarget = {
      clientWidth: 720,
      getBoundingClientRect: () => ({ left: 0, top: 0, right: 720, bottom: 120, width: 720, height: 120, x: 0, y: 0, toJSON() {} }),
      scrollLeft: 200,
    };

    handleIntervalChartWheel({
      contentWidth: 1200,
      currentSlotWidth: 10,
      event: {
        clientX: 360,
        ctrlKey: true,
        currentTarget,
        deltaX: 0,
        deltaY: 500,
        metaKey: false,
        preventDefault: vi.fn(),
      } as unknown as React.WheelEvent<HTMLDivElement>,
      hasOlder: false,
      intervalCount: 20,
      isLoadingOlder: false,
      onLoadOlder,
      onPan,
      onZoom,
      viewportWidth: 720,
    });

    expect(onLoadOlder).not.toHaveBeenCalled();
    expect(onPan).not.toHaveBeenCalled();
    expect(onZoom).toHaveBeenCalledWith(
      expect.objectContaining({
        nextSlotWidth: MIN_SLOT_WIDTH,
      }),
    );
  });

  test('keeps trajectory bands visible when the low-high spread is extremely tight', () => {
    const lows = [99, 100];
    const highs = [100, 101];
    const highPoints = buildPointCoordinatesWithDomain(highs, 72, 42, 0, 5000, { topPadding: 6, bottomPadding: 6 });
    const lowPoints = buildPointCoordinatesWithDomain(lows, 72, 42, 0, 5000, { topPadding: 6, bottomPadding: 6 });

    expect(Math.abs(lowPoints[0]!.y - highPoints[0]!.y)).toBeLessThan(2);
    expect(
      buildTrajectoryBandPath(lows, highs, 72, 42, 0, 5000, { topPadding: 6, bottomPadding: 6 }),
    ).toContain('M');
  });
});

describe('IntervalStrip', () => {
  test('renders selected interval using the shared accessible label and state', () => {
    const onSelect = vi.fn();
    const scrollRef = React.createRef<HTMLDivElement>();

    render(
      <IntervalStrip
        activeIndex={1}
        axisContentWidth={272}
        axisEndPadding={36}
        axisStartPadding={20}
        canScrollLeft
        canScrollRight
        intervals={[
          { intervalIndex: 0, startAt: '2026-02-01T08:00:00.000Z', endAt: '2026-02-10T08:00:00.000Z' },
          { intervalIndex: 1, startAt: '2026-02-11T08:00:00.000Z', endAt: '2026-03-05T08:00:00.000Z' },
          { intervalIndex: 2, startAt: '2026-03-06T08:00:00.000Z', endAt: '2026-04-03T08:00:00.000Z' },
        ]}
        language="en"
        onScroll={() => {}}
        scrollByViewport={() => {}}
        scrollRef={scrollRef}
        slotWidth={72}
        onSelect={onSelect}
      />,
    );

    expect(screen.getByLabelText('Scroll intervals left')).toBeInTheDocument();
    expect(screen.getByLabelText('Scroll intervals right')).toBeInTheDocument();
    expect(
      screen.getByRole('button', {
        name: formatSenaLongDateTime24('2026-03-05T08:00:00.000Z', 'en'),
      }),
    ).toHaveAttribute('data-active', 'true');

    fireEvent.click(
      screen.getByRole('button', {
        name: formatSenaLongDateTime24('2026-04-03T08:00:00.000Z', 'en'),
      }),
    );
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});
