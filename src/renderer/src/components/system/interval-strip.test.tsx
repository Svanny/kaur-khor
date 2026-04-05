import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import {
  deriveAnchoredZoomScrollLeft,
  deriveAxisContentWidth,
  deriveCenteredIntervalScrollLeft,
  deriveSlotCenterX,
  deriveSlotLeftX,
  deriveViewportPageScrollLeft,
  deriveVisibleWindow,
  IntervalStrip,
  intervalTooltipLabel,
  responsivePillLabel,
} from './interval-strip';

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
    expect(intervalTooltipLabel('2026-03-05T08:00:00.000Z', 1, 'en')).toBe('Mar 5');
    expect(intervalTooltipLabel(null, 11, 'en')).toBe('Interval 12');
    expect(responsivePillLabel('Feb-14', 'F-14', 80)).toBe('Feb-14');
    expect(responsivePillLabel('February-14', 'F-14', 56)).toBe('F-14');
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
    expect(screen.getByRole('button', { name: 'Mar 5' })).toHaveAttribute('data-active', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Apr 3' }));
    expect(onSelect).toHaveBeenCalledWith(2);
  });
});
