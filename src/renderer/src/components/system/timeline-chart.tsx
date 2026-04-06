import { cn } from '@/lib/utils';
import { deriveSlotCenterX, deriveSlotLeftX } from './interval-strip';

export function deriveLabelGutterOffset({
  plotY,
  plotHeight = 120,
  gutterHeight = 32,
  viewBoxHeight = 42,
}: {
  plotY: number;
  plotHeight?: number;
  gutterHeight?: number;
  viewBoxHeight?: number;
}) {
  return gutterHeight + (plotY / viewBoxHeight) * plotHeight;
}

export function buildPolyline(
  values: number[],
  slotWidth: number,
  height: number,
  options?: {
    axisStartPadding?: number;
    topPadding?: number;
    bottomPadding?: number;
  },
) {
  if (values.length === 0) {
    return '';
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const axisStartPadding = options?.axisStartPadding ?? 0;
  const topPadding = options?.topPadding ?? 0;
  const bottomPadding = options?.bottomPadding ?? 0;
  const drawableHeight = Math.max(1, height - topPadding - bottomPadding);

  return values
    .map((value, index) => {
      const x = deriveSlotCenterX({ index, slotWidth, axisStartPadding });
      const y = topPadding + drawableHeight - ((value - min) / range) * drawableHeight;
      return `${x},${y}`;
    })
    .join(' ');
}

export function buildPointCoordinates(
  values: number[],
  slotWidth: number,
  height: number,
  options?: {
    axisStartPadding?: number;
    topPadding?: number;
    bottomPadding?: number;
  },
) {
  if (values.length === 0) {
    return [];
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const axisStartPadding = options?.axisStartPadding ?? 0;
  const topPadding = options?.topPadding ?? 0;
  const bottomPadding = options?.bottomPadding ?? 0;
  const drawableHeight = Math.max(1, height - topPadding - bottomPadding);

  return values.map((value, index) => ({
    x: deriveSlotCenterX({ index, slotWidth, axisStartPadding }),
    y: topPadding + drawableHeight - ((value - min) / range) * drawableHeight,
    value,
  }));
}

export function buildPointCoordinatesWithDomain(
  values: number[],
  slotWidth: number,
  height: number,
  domainMin: number,
  domainMax: number,
  options?: {
    axisStartPadding?: number;
    topPadding?: number;
    bottomPadding?: number;
  },
) {
  if (values.length === 0) {
    return [];
  }

  const min = Math.min(domainMin, domainMax);
  const max = Math.max(domainMin, domainMax);
  const range = max - min || 1;
  const axisStartPadding = options?.axisStartPadding ?? 0;
  const topPadding = options?.topPadding ?? 0;
  const bottomPadding = options?.bottomPadding ?? 0;
  const drawableHeight = Math.max(1, height - topPadding - bottomPadding);

  return values.map((value, index) => ({
    x: deriveSlotCenterX({ index, slotWidth, axisStartPadding }),
    y: topPadding + drawableHeight - ((value - min) / range) * drawableHeight,
    value,
  }));
}

export function buildPolylineWithDomain(
  values: number[],
  slotWidth: number,
  height: number,
  domainMin: number,
  domainMax: number,
  options?: {
    axisStartPadding?: number;
    topPadding?: number;
    bottomPadding?: number;
  },
) {
  return buildPointCoordinatesWithDomain(values, slotWidth, height, domainMin, domainMax, options)
    .map((point) => `${point.x},${point.y}`)
    .join(' ');
}

export function buildTrajectoryBandPath(
  lows: number[],
  highs: number[],
  slotWidth: number,
  height: number,
  domainMin: number,
  domainMax: number,
  options?: {
    axisStartPadding?: number;
    topPadding?: number;
    bottomPadding?: number;
  },
) {
  if (lows.length === 0 || highs.length === 0 || lows.length !== highs.length) {
    return '';
  }

  const lowCoordinates = buildPointCoordinatesWithDomain(lows, slotWidth, height, domainMin, domainMax, options);
  const highCoordinates = buildPointCoordinatesWithDomain(highs, slotWidth, height, domainMin, domainMax, options);
  if (lowCoordinates.length === 0 || highCoordinates.length === 0) {
    return '';
  }

  const upperPath = highCoordinates.map((point) => `${point.x},${point.y}`).join(' L ');
  const lowerPath = [...lowCoordinates].reverse().map((point) => `${point.x},${point.y}`).join(' L ');
  return `M ${upperPath} L ${lowerPath} Z`;
}

function deriveFlowBarHeight(value: number, maxMagnitude: number, maxHeight: number, minHeight: number) {
  const magnitude = Math.abs(value);
  if (magnitude <= 0 || maxMagnitude <= 0 || maxHeight <= 0) {
    return 0;
  }
  return Math.max(minHeight, (magnitude / maxMagnitude) * maxHeight);
}

export function deriveFlowStackHeights(
  values: {
    serviceDemandMean: number;
    retailDemandMean: number;
    receiptsMean: number;
    adjustmentsMean: number;
  },
  maxMagnitude: number,
  options?: {
    demandMaxHeight?: number;
    supplyMaxHeight?: number;
    minHeight?: number;
  },
) {
  const demandMaxHeight = options?.demandMaxHeight ?? 24;
  const supplyMaxHeight = options?.supplyMaxHeight ?? demandMaxHeight;
  const minHeight = options?.minHeight ?? 2;

  const serviceHeight = deriveFlowBarHeight(values.serviceDemandMean, maxMagnitude, demandMaxHeight, minHeight);
  const retailHeight = deriveFlowBarHeight(values.retailDemandMean, maxMagnitude, demandMaxHeight, minHeight);
  const receiptsHeight = deriveFlowBarHeight(values.receiptsMean, maxMagnitude, supplyMaxHeight, minHeight);
  const adjustmentHeight = deriveFlowBarHeight(values.adjustmentsMean, maxMagnitude, supplyMaxHeight, minHeight);

  return {
    demand: {
      serviceHeight,
      retailHeight,
      retailOffset: serviceHeight,
    },
    supply: {
      receiptsHeight,
      adjustmentHeight,
      adjustmentOffset: receiptsHeight,
    },
  };
}

function buildSparsePointCoordinates(
  markers: Array<{ intervalIndex: number; price: number }>,
  intervalIndices: number[],
  slotWidth: number,
  height: number,
  options?: {
    axisStartPadding?: number;
    topPadding?: number;
    bottomPadding?: number;
  },
) {
  if (markers.length === 0) {
    return [];
  }

  const intervalPosition = new Map(intervalIndices.map((value, index) => [value, index]));
  const values = markers.map((marker) => marker.price);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const axisStartPadding = options?.axisStartPadding ?? 0;
  const topPadding = options?.topPadding ?? 0;
  const bottomPadding = options?.bottomPadding ?? 0;
  const drawableHeight = Math.max(1, height - topPadding - bottomPadding);

  return markers
    .map((marker) => {
      const position = intervalPosition.get(marker.intervalIndex);
      if (position == null) {
        return null;
      }
      return {
        intervalIndex: marker.intervalIndex,
        price: marker.price,
        x: deriveSlotCenterX({ index: position, slotWidth, axisStartPadding }),
        y: topPadding + drawableHeight - ((marker.price - min) / range) * drawableHeight,
      };
    })
    .filter((point): point is { intervalIndex: number; price: number; x: number; y: number } => point != null);
}

export function buildSparsePolylineSegments(
  markers: Array<{ intervalIndex: number; price: number }>,
  intervalIndices: number[],
  slotWidth: number,
  height: number,
  options?: {
    axisStartPadding?: number;
    topPadding?: number;
    bottomPadding?: number;
  },
) {
  const points = buildSparsePointCoordinates(markers, intervalIndices, slotWidth, height, options);
  if (points.length === 0) {
    return { points: [], segments: [] as string[] };
  }

  const intervalPosition = new Map(intervalIndices.map((value, index) => [value, index]));
  const segments: string[] = [];
  let currentSegment: string[] = [];
  let previousPosition: number | null = null;

  for (const point of points) {
    const position = intervalPosition.get(point.intervalIndex) ?? null;
    if (position == null) {
      continue;
    }
    if (previousPosition != null && position !== previousPosition + 1) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment.join(' '));
      }
      currentSegment = [];
    }
    currentSegment.push(`${point.x},${point.y}`);
    previousPosition = position;
  }

  if (currentSegment.length > 0) {
    segments.push(currentSegment.join(' '));
  }

  return { points, segments };
}

export function SelectedIntervalColumnOverlay({
  activeIndex,
  axisContentWidth,
  axisStartPadding,
  axisEndPadding,
  itemCount,
  slotWidth,
  className,
}: {
  activeIndex: number | null;
  axisContentWidth: number;
  axisStartPadding: number;
  axisEndPadding: number;
  itemCount: number;
  slotWidth: number;
  className?: string;
}) {
  if (activeIndex == null || itemCount <= 0) {
    return null;
  }

  const left = deriveSlotLeftX({ index: activeIndex, slotWidth, axisStartPadding });

  return (
    <div
      aria-hidden="true"
      className={cn('pointer-events-none absolute inset-y-0 rounded-[1rem] border border-foreground/10 bg-foreground/[0.05]', className)}
      data-selected-interval-column="true"
      style={{
        left,
        width: slotWidth,
        maxWidth: Math.max(0, axisContentWidth - axisStartPadding - axisEndPadding),
      }}
    >
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-foreground/15" />
    </div>
  );
}
