import type { CSSProperties, ReactNode } from 'react';
import {
  Area,
  Bar,
  ComposedChart,
  Customized,
  Line,
  ReferenceArea,
  ReferenceLine,
  XAxis,
  YAxis,
} from 'recharts';
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeDomain(min: number, max: number) {
  if (Number.isNaN(min) || Number.isNaN(max)) {
    return { min: 0, max: 1 };
  }
  if (min === max) {
    const padding = min === 0 ? 1 : Math.max(Math.abs(min) * 0.05, 1);
    return { min: min - padding, max: max + padding };
  }
  return { min: Math.min(min, max), max: Math.max(min, max) };
}

function mapValueToPlotY({
  value,
  domainMin,
  domainMax,
  height,
  topPadding = 0,
  bottomPadding = 0,
}: {
  value: number;
  domainMin: number;
  domainMax: number;
  height: number;
  topPadding?: number;
  bottomPadding?: number;
}) {
  const domain = normalizeDomain(domainMin, domainMax);
  const range = domain.max - domain.min || 1;
  const drawableHeight = Math.max(1, height - topPadding - bottomPadding);
  return topPadding + drawableHeight - ((value - domain.min) / range) * drawableHeight;
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

  return values.map((value, index) => ({
    x: deriveSlotCenterX({ index, slotWidth, axisStartPadding: options?.axisStartPadding }),
    y: mapValueToPlotY({
      value,
      domainMin,
      domainMax,
      height,
      topPadding: options?.topPadding,
      bottomPadding: options?.bottomPadding,
    }),
    value,
  }));
}

export function buildPositionedPointCoordinatesWithDomain(
  values: Array<{ position: number; value: number }>,
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
  return values.map((entry) => ({
    x: deriveSlotCenterX({ index: entry.position, slotWidth, axisStartPadding: options?.axisStartPadding }),
    y: mapValueToPlotY({
      value: entry.value,
      domainMin,
      domainMax,
      height,
      topPadding: options?.topPadding,
      bottomPadding: options?.bottomPadding,
    }),
    value: entry.value,
  }));
}

function plotContentWidth(itemCount: number, slotWidth: number) {
  return Math.max(itemCount * slotWidth, 1);
}

function outerContentWidth(itemCount: number, slotWidth: number, axisStartPadding: number, axisEndPadding: number) {
  return axisStartPadding + plotContentWidth(itemCount, slotWidth) + axisEndPadding;
}

function TimelineChartFrame({
  axisEndPadding,
  axisStartPadding,
  children,
  gutterHeight,
  itemCount,
  plotHeight,
  slotWidth,
}: {
  axisEndPadding: number;
  axisStartPadding: number;
  children: ReactNode;
  gutterHeight: number;
  itemCount: number;
  plotHeight: number;
  slotWidth: number;
}) {
  const width = outerContentWidth(itemCount, slotWidth, axisStartPadding, axisEndPadding);

  return (
    <div className="relative overflow-visible" style={{ width, height: gutterHeight + plotHeight }}>
      <div
        aria-hidden="true"
        className="absolute overflow-visible"
        style={{
          left: axisStartPadding,
          top: gutterHeight,
          width: plotContentWidth(itemCount, slotWidth),
          height: plotHeight,
        }}
      >
        {children}
      </div>
    </div>
  );
}

export interface MeanBandTimelineDatum {
  high: number;
  intervalIndex: number;
  intervalPosition?: number;
  low: number;
  mean: number;
}

export interface TimelinePointButtonProps<TDatum> {
  ariaLabel: (datum: TDatum, index: number) => string;
  selected: (datum: TDatum, index: number) => boolean;
  selectedLabel?: (datum: TDatum, index: number) => ReactNode;
  onSelect: (datum: TDatum, index: number) => void;
}

export interface MeanBandTimelineChartProps {
  axisEndPadding: number;
  axisStartPadding: number;
  bandFill: string;
  data: MeanBandTimelineDatum[];
  gutterHeight: number;
  lineStroke: string;
  plotHeight: number;
  pointButtons: TimelinePointButtonProps<MeanBandTimelineDatum>;
  referenceLines?: Array<{
    className?: string;
    stroke: string;
    strokeDasharray?: string;
    strokeWidth?: number;
    value: number;
  }>;
  slotWidth: number;
  topPadding?: number;
  bottomPadding?: number;
}

export function MeanBandTimelineChart({
  axisEndPadding,
  axisStartPadding,
  bandFill,
  data,
  gutterHeight,
  lineStroke,
  plotHeight,
  pointButtons,
  referenceLines = [],
  slotWidth,
  topPadding = 5,
  bottomPadding = 5,
}: MeanBandTimelineChartProps) {
  const domainMin = data.length > 0 ? Math.min(...data.map((entry) => entry.low), ...referenceLines.map((entry) => entry.value)) : 0;
  const domainMax = data.length > 0 ? Math.max(...data.map((entry) => entry.high), ...referenceLines.map((entry) => entry.value)) : 1;
  const normalizedDomain = normalizeDomain(domainMin, domainMax);
  const chartWidth = plotContentWidth(data.length, slotWidth);
  const chartRows = data.map((entry, index) => ({
    bandBase: entry.low,
    bandRange: Math.max(entry.high - entry.low, 0),
    mean: entry.mean,
    x: entry.intervalPosition ?? index,
  }));
  const pointCoordinates = buildPositionedPointCoordinatesWithDomain(
    data.map((entry, index) => ({
      position: entry.intervalPosition ?? index,
      value: entry.mean,
    })),
    slotWidth,
    plotHeight,
    normalizedDomain.min,
    normalizedDomain.max,
    {
      axisStartPadding,
      topPadding,
      bottomPadding,
    },
  );

  return (
    <TimelineChartFrame
      axisEndPadding={axisEndPadding}
      axisStartPadding={axisStartPadding}
      gutterHeight={gutterHeight}
      itemCount={data.length}
      plotHeight={plotHeight}
      slotWidth={slotWidth}
    >
      <ComposedChart data={chartRows} height={plotHeight} margin={{ bottom: 0, left: 0, right: 0, top: 0 }} width={chartWidth}>
        <XAxis allowDataOverflow dataKey="x" domain={[-0.5, Math.max(data.length - 0.5, 0.5)]} hide type="number" />
        <YAxis allowDataOverflow domain={[normalizedDomain.min, normalizedDomain.max]} hide type="number" />
        {referenceLines.map((referenceLine) => (
          <ReferenceLine
            key={`reference:${referenceLine.value}:${referenceLine.strokeDasharray ?? 'solid'}`}
            className={referenceLine.className}
            ifOverflow="extendDomain"
            stroke={referenceLine.stroke}
            strokeDasharray={referenceLine.strokeDasharray}
            strokeWidth={referenceLine.strokeWidth ?? 0.8}
            y={referenceLine.value}
          />
        ))}
        <Area dataKey="bandBase" fill="transparent" isAnimationActive={false} stackId="band" stroke="none" />
        <Area dataKey="bandRange" fill={bandFill} isAnimationActive={false} stackId="band" stroke="none" />
        <Line activeDot={false} dataKey="mean" dot={false} isAnimationActive={false} stroke={lineStroke} strokeWidth={1.8} type="monotone" />
      </ComposedChart>
      {pointCoordinates.map((point, index) => {
        const datum = data[index];
        if (!datum) {
          return null;
        }

        const isSelected = pointButtons.selected(datum, index);

        return (
          <button
            key={`timeline-point:${datum.intervalIndex}`}
            aria-label={pointButtons.ariaLabel(datum, index)}
            className="absolute z-[2] -translate-x-1/2 -translate-y-1/2"
            style={{ left: point.x, top: gutterHeight + point.y }}
            type="button"
            onClick={() => pointButtons.onSelect(datum, index)}
          >
            {isSelected && pointButtons.selectedLabel ? pointButtons.selectedLabel(datum, index) : null}
            <span className={cn('block size-4 rounded-full border-2', isSelected ? 'border-foreground bg-foreground' : 'border-foreground/55 bg-background')} />
          </button>
        );
      })}
    </TimelineChartFrame>
  );
}

export interface SparseTimelineSlotDatum {
  ariaLabel: string;
  fill: string;
  intervalIndex: number;
  intervalPosition: number;
}

export interface SparseTimelinePointDatum {
  ariaLabel: string;
  intervalIndex: number;
  intervalPosition: number;
  key: string;
  value: number;
}

export interface SparseTimelineChartProps {
  axisEndPadding: number;
  axisStartPadding: number;
  gutterHeight: number;
  lineStroke: string;
  plotHeight: number;
  pointButtons: TimelinePointButtonProps<SparseTimelinePointDatum>;
  points: SparseTimelinePointDatum[];
  slotButtons?: {
    renderContent?: (slot: SparseTimelineSlotDatum, isSelected: boolean) => ReactNode;
    selected: (slot: SparseTimelineSlotDatum, index: number) => boolean;
    onSelect: (slot: SparseTimelineSlotDatum, index: number) => void;
    className?: string;
    style?: (slot: SparseTimelineSlotDatum, isSelected: boolean) => CSSProperties | undefined;
  };
  slots?: SparseTimelineSlotDatum[];
  slotWidth: number;
  topPadding?: number;
  bottomPadding?: number;
}

export function SparseTimelineChart({
  axisEndPadding,
  axisStartPadding,
  gutterHeight,
  lineStroke,
  plotHeight,
  pointButtons,
  points,
  slotButtons,
  slots = [],
  slotWidth,
  topPadding = 6,
  bottomPadding = 6,
}: SparseTimelineChartProps) {
  const itemCount = Math.max(
    slots.length,
    points.reduce((max, point) => Math.max(max, point.intervalPosition + 1), 0),
  );
  const chartWidth = plotContentWidth(itemCount, slotWidth);
  const chartRows = Array.from({ length: itemCount }, (_, intervalPosition) => {
    const point = points.find((entry) => entry.intervalPosition === intervalPosition);
    return {
      value: point?.value ?? null,
      x: intervalPosition,
    };
  });
  const domainMin = points.length > 0 ? Math.min(...points.map((point) => point.value)) : 0;
  const domainMax = points.length > 0 ? Math.max(...points.map((point) => point.value)) : 1;
  const normalizedDomain = normalizeDomain(domainMin, domainMax);
  const pointCoordinates = buildPositionedPointCoordinatesWithDomain(
    points.map((point) => ({
      position: point.intervalPosition,
      value: point.value,
    })),
    slotWidth,
    plotHeight,
    normalizedDomain.min,
    normalizedDomain.max,
    {
      axisStartPadding,
      topPadding,
      bottomPadding,
    },
  );

  return (
    <TimelineChartFrame
      axisEndPadding={axisEndPadding}
      axisStartPadding={axisStartPadding}
      gutterHeight={gutterHeight}
      itemCount={itemCount}
      plotHeight={plotHeight}
      slotWidth={slotWidth}
    >
      <ComposedChart data={chartRows} height={plotHeight} margin={{ bottom: 0, left: 0, right: 0, top: 0 }} width={chartWidth}>
        <XAxis allowDataOverflow dataKey="x" domain={[-0.5, Math.max(itemCount - 0.5, 0.5)]} hide type="number" />
        <YAxis allowDataOverflow domain={[normalizedDomain.min, normalizedDomain.max]} hide type="number" />
        {slots.map((slot) => (
          <ReferenceArea
            key={`slot:${slot.intervalIndex}`}
            fill={slot.fill}
            ifOverflow="extendDomain"
            x1={slot.intervalPosition - 0.5}
            x2={slot.intervalPosition + 0.5}
            y1={normalizedDomain.max}
            y2={normalizedDomain.min}
          />
        ))}
        <Line activeDot={false} connectNulls={false} dataKey="value" dot={false} isAnimationActive={false} stroke={lineStroke} strokeWidth={1.4} type="monotone" />
      </ComposedChart>
      {slots.map((slot, index) => {
        if (!slotButtons) {
          return null;
        }
        const isSelected = slotButtons.selected(slot, index);
        return (
          <button
            key={`slot-button:${slot.intervalIndex}`}
            aria-label={slot.ariaLabel}
            className={cn('absolute inset-y-0 z-[1]', slotButtons.className)}
            data-regime-slot="true"
            data-selected={isSelected ? 'true' : 'false'}
            style={{
              left: deriveSlotLeftX({ index: slot.intervalPosition, slotWidth, axisStartPadding }),
              width: slotWidth,
              ...slotButtons.style?.(slot, isSelected),
            }}
            type="button"
            onClick={() => slotButtons.onSelect(slot, index)}
          >
            {slotButtons.renderContent?.(slot, isSelected)}
          </button>
        );
      })}
      {pointCoordinates.map((point, index) => {
        const datum = points[index];
        if (!datum) {
          return null;
        }

        const isSelected = pointButtons.selected(datum, index);

        return (
          <button
            key={datum.key}
            aria-label={pointButtons.ariaLabel(datum, index)}
            className="absolute z-[2] -translate-x-1/2 -translate-y-1/2"
            style={{ left: point.x, top: gutterHeight + point.y }}
            type="button"
            onClick={() => pointButtons.onSelect(datum, index)}
          >
            {isSelected && pointButtons.selectedLabel ? pointButtons.selectedLabel(datum, index) : null}
            <span className={cn('block size-4 rounded-full border-2', isSelected ? 'border-foreground bg-foreground' : 'border-foreground/55 bg-background')} />
          </button>
        );
      })}
    </TimelineChartFrame>
  );
}

export interface IntervalBarTimelineDatum {
  ariaLabel: string;
  intervalIndex: number;
  values: Record<string, number>;
}

export interface IntervalBarSeriesConfig {
  dataKey: string;
  fill: string;
  stackId?: string;
}

export interface IntervalBarTimelineChartProps {
  axisEndPadding: number;
  axisStartPadding: number;
  data: IntervalBarTimelineDatum[];
  gutterHeight: number;
  plotHeight: number;
  series: IntervalBarSeriesConfig[];
  selected: (datum: IntervalBarTimelineDatum, index: number) => boolean;
  selectedLabel?: (datum: IntervalBarTimelineDatum, index: number) => ReactNode;
  slotWidth: number;
  onSelect: (datum: IntervalBarTimelineDatum, index: number) => void;
  symmetricDomainMax?: number;
}

export function IntervalBarTimelineChart({
  axisEndPadding,
  axisStartPadding,
  data,
  gutterHeight,
  plotHeight,
  series,
  selected,
  selectedLabel,
  slotWidth,
  onSelect,
  symmetricDomainMax,
}: IntervalBarTimelineChartProps) {
  const itemCount = data.length;
  const chartWidth = plotContentWidth(itemCount, slotWidth);
  const chartRows = data.map((entry, index) => ({
    ...entry.values,
    x: index,
  }));
  const maxMagnitude = symmetricDomainMax ?? Math.max(
    1,
    ...data.flatMap((entry) => Object.values(entry.values).map((value) => Math.abs(value))),
  );

  return (
    <TimelineChartFrame
      axisEndPadding={axisEndPadding}
      axisStartPadding={axisStartPadding}
      gutterHeight={gutterHeight}
      itemCount={itemCount}
      plotHeight={plotHeight}
      slotWidth={slotWidth}
    >
      <ComposedChart barCategoryGap={0} barGap={0} data={chartRows} height={plotHeight} margin={{ bottom: 0, left: 0, right: 0, top: 0 }} width={chartWidth}>
        <XAxis allowDataOverflow dataKey="x" domain={[-0.5, Math.max(itemCount - 0.5, 0.5)]} hide type="number" />
        <YAxis allowDataOverflow domain={[-maxMagnitude, maxMagnitude]} hide type="number" />
        <ReferenceLine ifOverflow="extendDomain" stroke="rgba(110, 97, 86, 0.4)" strokeWidth={0.8} y={0} />
        {series.map((entry) => (
          <Bar
            key={entry.dataKey}
            dataKey={entry.dataKey}
            fill={entry.fill}
            isAnimationActive={false}
            stackId={entry.stackId}
            barSize={Math.max(slotWidth * 0.18, 6)}
          />
        ))}
      </ComposedChart>
      {data.map((datum, index) => {
        const isSelected = selected(datum, index);
        return (
          <button
            key={`bar-slot:${datum.intervalIndex}`}
            aria-label={datum.ariaLabel}
            className="absolute inset-y-0 z-[2]"
            style={{ left: deriveSlotLeftX({ index, slotWidth, axisStartPadding }), width: slotWidth }}
            type="button"
            onClick={() => onSelect(datum, index)}
          >
            {isSelected && selectedLabel ? selectedLabel(datum, index) : null}
          </button>
        );
      })}
    </TimelineChartFrame>
  );
}

export interface IntervalTileTimelineDatum {
  ariaLabel: string;
  className?: string;
  fill: string;
  intervalIndex: number;
  label: ReactNode;
  selectedLabel?: ReactNode;
  value: number;
}

export interface IntervalTileTimelineChartProps {
  axisEndPadding: number;
  axisStartPadding: number;
  data: IntervalTileTimelineDatum[];
  gutterHeight: number;
  plotHeight: number;
  slotWidth: number;
  onSelect: (datum: IntervalTileTimelineDatum, index: number) => void;
  selected: (datum: IntervalTileTimelineDatum, index: number) => boolean;
}

export function IntervalTileTimelineChart({
  axisEndPadding,
  axisStartPadding,
  data,
  gutterHeight,
  plotHeight,
  slotWidth,
  onSelect,
  selected,
}: IntervalTileTimelineChartProps) {
  const itemCount = data.length;
  const chartWidth = plotContentWidth(itemCount, slotWidth);
  const maxValue = Math.max(1, ...data.map((entry) => entry.value));

  return (
    <TimelineChartFrame
      axisEndPadding={axisEndPadding}
      axisStartPadding={axisStartPadding}
      gutterHeight={gutterHeight}
      itemCount={itemCount}
      plotHeight={plotHeight}
      slotWidth={slotWidth}
    >
      <ComposedChart
        data={data.map((entry, index) => ({ value: entry.value, x: index }))}
        height={plotHeight}
        margin={{ bottom: 0, left: 0, right: 0, top: 0 }}
        width={chartWidth}
      >
        <XAxis allowDataOverflow dataKey="x" domain={[-0.5, Math.max(itemCount - 0.5, 0.5)]} hide type="number" />
        <YAxis allowDataOverflow domain={[0, maxValue]} hide type="number" />
        <Bar barSize={Math.max(slotWidth * 0.55, 16)} dataKey="value" fill="rgba(134, 166, 95, 0.22)" isAnimationActive={false} radius={[18, 18, 18, 18]} />
      </ComposedChart>
      {data.map((entry, index) => {
        const isSelected = selected(entry, index);
        return (
          <button
            key={`tile-slot:${entry.intervalIndex}`}
            aria-label={entry.ariaLabel}
            className={cn(
              'absolute inset-y-0 z-[2] flex min-h-24 w-[85%] -translate-x-1/2 flex-col items-center justify-center gap-1 rounded-[1.35rem] border px-1.5 py-3 text-center transition-colors',
              entry.className,
            )}
            style={{
              left: deriveSlotCenterX({ index, slotWidth, axisStartPadding }),
              width: slotWidth * 0.85,
              backgroundColor: entry.fill,
            }}
            type="button"
            onClick={() => onSelect(entry, index)}
          >
            {isSelected ? entry.selectedLabel ?? null : null}
            {entry.label}
          </button>
        );
      })}
    </TimelineChartFrame>
  );
}

export interface TimelineSpanDatum {
  ariaLabel: string;
  endPosition: number;
  fill: string;
  intervalIndex: number;
  key: string;
  label: ReactNode;
  row: number;
  startPosition: number;
  stroke: string;
  tooltip?: ReactNode;
}

export interface TimelineMarkerDatum {
  ariaLabel: string;
  fill: string;
  intervalIndex: number;
  key: string;
  kind: 'order' | 'receipt';
  quantityLabel?: ReactNode;
  row: number;
  x: number;
}

export interface TimelineRangeChartProps {
  axisEndPadding: number;
  axisStartPadding: number;
  gutterHeight: number;
  markers: TimelineMarkerDatum[];
  plotHeight: number;
  rowCount: number;
  slotWidth: number;
  spans: TimelineSpanDatum[];
  selectedIntervalIndex: number | null;
  itemCount: number;
  onSelectInterval: (intervalIndex: number) => void;
}

type CustomizedPayload = {
  points?: Array<{ x: number; y: number }>;
  xAxisMap?: Record<string, { scale?: (value: number) => number }>;
  yAxisMap?: Record<string, { scale?: (value: number) => number }>;
};

function extractFirstScale<T extends { scale?: (value: number) => number }>(map: Record<string, T> | undefined) {
  if (!map) {
    return null;
  }
  const first = Object.values(map)[0];
  return first?.scale ?? null;
}

function TimelineRangeShapes({
  markers,
  spans,
  xAxisMap,
  yAxisMap,
}: CustomizedPayload & {
  markers: TimelineMarkerDatum[];
  spans: TimelineSpanDatum[];
}) {
  const xScale = extractFirstScale(xAxisMap);
  const yScale = extractFirstScale(yAxisMap);

  if (!xScale || !yScale) {
    return null;
  }

  return (
    <g>
      {spans.map((span) => {
        const left = xScale(span.startPosition);
        const right = xScale(span.endPosition);
        const top = yScale(span.row + 0.18);
        const bottom = yScale(span.row + 0.82);
        const width = Math.max(right - left, 12);
        const height = Math.max(bottom - top, 10);

        return (
          <rect
            key={`shape:${span.key}`}
            fill={span.fill}
            height={height}
            rx={10}
            ry={10}
            stroke={span.stroke}
            width={width}
            x={left}
            y={top}
          />
        );
      })}
      {markers.map((marker) => {
        const centerX = xScale(marker.x);
        const centerY = yScale(marker.row + 0.5);

        if (marker.kind === 'order') {
          return (
            <rect
              key={`marker:${marker.key}`}
              fill={marker.fill}
              height={10}
              rx={2}
              ry={2}
              transform={`translate(${centerX - 5} ${centerY - 5}) rotate(45 5 5)`}
              width={10}
            />
          );
        }

        return <circle key={`marker:${marker.key}`} cx={centerX} cy={centerY} fill={marker.fill} r={5} />;
      })}
    </g>
  );
}

export function TimelineRangeChart({
  axisEndPadding,
  axisStartPadding,
  gutterHeight,
  markers,
  plotHeight,
  rowCount,
  slotWidth,
  spans,
  selectedIntervalIndex,
  itemCount,
  onSelectInterval,
}: TimelineRangeChartProps) {
  const chartWidth = plotContentWidth(itemCount, slotWidth);
  const rowHeight = plotHeight / Math.max(rowCount, 1);

  return (
    <TimelineChartFrame
      axisEndPadding={axisEndPadding}
      axisStartPadding={axisStartPadding}
      gutterHeight={gutterHeight}
      itemCount={itemCount}
      plotHeight={plotHeight}
      slotWidth={slotWidth}
    >
      {Array.from({ length: rowCount }, (_, row) => {
        const top = gutterHeight + rowHeight * row + 6;
        return (
          <div
            key={`timeline-row:${row}`}
            aria-hidden="true"
            className="pointer-events-none absolute left-0 right-0 rounded-full border border-foreground/[0.06] bg-foreground/[0.035]"
            style={{
              left: axisStartPadding,
              top,
              width: chartWidth,
              height: Math.max(rowHeight - 12, 20),
            }}
          >
            <div className="absolute inset-x-3 top-1/2 h-px -translate-y-1/2 border-t border-dashed border-foreground/10" />
          </div>
        );
      })}
      <ComposedChart data={[]} height={plotHeight} margin={{ bottom: 0, left: 0, right: 0, top: 0 }} width={chartWidth}>
        <XAxis allowDataOverflow domain={[-0.5, Math.max(itemCount - 0.5, 0.5)]} hide type="number" />
        <YAxis allowDataOverflow domain={[rowCount, 0]} hide type="number" />
        <Customized component={<TimelineRangeShapes markers={markers} spans={spans} />} />
      </ComposedChart>
      {spans.map((span) => {
        const left = axisStartPadding + slotWidth * (span.startPosition + 0.5);
        const width = Math.max(slotWidth * (span.endPosition - span.startPosition), slotWidth * 0.32);
        const top = gutterHeight + (plotHeight / Math.max(rowCount, 1)) * span.row + 6;
        const isSelected = selectedIntervalIndex === span.intervalIndex;

        return (
          <button
            key={span.key}
            aria-label={span.ariaLabel}
            className="absolute z-[2] flex items-center rounded-full border px-3 text-left text-[11px] font-medium tracking-[0.01em] text-foreground shadow-[0_10px_24px_rgba(48,31,20,0.08)] transition-transform hover:-translate-y-0.5"
            style={{ left, top, width }}
            type="button"
            onClick={() => onSelectInterval(span.intervalIndex)}
          >
            {isSelected ? span.tooltip ?? null : null}
            <span
              aria-hidden="true"
              className="absolute inset-0 rounded-full"
              style={{
                backgroundColor: span.fill,
                borderColor: span.stroke,
              }}
            />
            <span className="relative z-[1] min-w-0 truncate">{span.label}</span>
          </button>
        );
      })}
      {markers.map((marker) => {
        const top = gutterHeight + rowHeight * marker.row + rowHeight / 2;
        const isSelected = selectedIntervalIndex === marker.intervalIndex;

        return (
          <button
            key={marker.key}
            aria-label={marker.ariaLabel}
            className="absolute z-[2] -translate-x-1/2 -translate-y-1/2"
            style={{ left: deriveSlotCenterX({ index: marker.x, slotWidth, axisStartPadding }), top }}
            type="button"
            onClick={() => onSelectInterval(marker.intervalIndex)}
          >
            {isSelected ? marker.quantityLabel ?? null : null}
            <span
              aria-hidden="true"
              className={cn(
                'block border-2 border-white shadow-[0_6px_18px_rgba(48,31,20,0.16)]',
                marker.kind === 'order' ? 'size-4 rotate-45 rounded-[0.25rem]' : 'size-4 rounded-full',
              )}
              style={{ backgroundColor: marker.fill }}
            />
          </button>
        );
      })}
    </TimelineChartFrame>
  );
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
      className={cn('pointer-events-none absolute inset-y-0 overflow-hidden rounded-[1rem] bg-foreground/[0.025]', className)}
      data-selected-interval-column="true"
      style={{
        left,
        width: slotWidth,
        maxWidth: Math.max(0, axisContentWidth - axisStartPadding - axisEndPadding),
      }}
    >
      <div className="absolute inset-y-2 left-0 right-0 rounded-[0.9rem] border border-foreground/8" />
      <div className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-foreground/12" />
    </div>
  );
}
