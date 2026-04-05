import { useEffect, useRef, useState } from 'react';
import { Area, AreaChart, ReferenceDot, ReferenceLine, XAxis, YAxis } from 'recharts';
import { demandSparklineToneColors } from '@/lib/state-tones';

export type CompactSparklineTone = 'up' | 'flat' | 'down';

export interface CompactSparklineProps {
  className?: string;
  height?: number;
  points: number[];
  preserveAspectRatio?: string;
  splitIndex?: number;
  tone?: CompactSparklineTone;
  width?: number;
}

const PREVIOUS_SEGMENT_STYLE = demandSparklineToneColors('previous');
const CHART_MARGIN = 2;

function midpoint(left: number, right: number) {
  return (left + right) / 2;
}

function buildChartData(points: number[], splitIndex?: number) {
  const normalized = points.length > 1 ? points : [points[0] ?? 0, points[0] ?? 0];
  const showSplit = splitIndex != null && splitIndex > 0 && splitIndex < normalized.length;

  if (!showSplit) {
    return {
      boundary: null,
      rows: normalized.map((value, index) => ({
        area: value,
        current: value,
        previous: null,
        x: index,
      })),
    };
  }

  const left = normalized[splitIndex - 1];
  const right = normalized[splitIndex];
  const boundaryY = midpoint(left ?? 0, right ?? 0);
  const boundaryX = splitIndex - 0.5;
  const rows = normalized.flatMap((value, index) => {
    const row = {
      area: value,
      current: index >= splitIndex ? value : null,
      previous: index < splitIndex ? value : null,
      x: index,
    };

    if (index === splitIndex - 1) {
      return [
        row,
        {
          area: boundaryY,
          current: boundaryY,
          previous: boundaryY,
          x: boundaryX,
        },
      ];
    }

    return [row];
  });

  return {
    boundary: { x: boundaryX, y: boundaryY },
    rows,
  };
}

function SparklineChart({
  boundary,
  colors,
  height,
  rows,
  splitIndex,
  width,
}: {
  boundary: { x: number; y: number } | null;
  colors: ReturnType<typeof demandSparklineToneColors>;
  height: number;
  rows: Array<{ area: number; current: number | null; previous: number | null; x: number }>;
  splitIndex?: number;
  width: number;
}) {
  return (
    <AreaChart data={rows} height={height} margin={{ bottom: CHART_MARGIN, left: CHART_MARGIN, right: CHART_MARGIN, top: CHART_MARGIN }} width={width}>
      <XAxis allowDataOverflow dataKey="x" domain={[0, Math.max(rows.at(-1)?.x ?? 1, 1)]} hide type="number" />
      <YAxis allowDataOverflow domain={['dataMin', 'dataMax']} hide type="number" />
      {boundary ? (
        <ReferenceLine
          ifOverflow="extendDomain"
          stroke="rgba(48,31,20,0.35)"
          strokeDasharray="4 3"
          strokeWidth={2.2}
          x={boundary.x}
        />
      ) : null}
      {splitIndex != null ? (
        <Area
          activeDot={false}
          dataKey="previous"
          dot={false}
          fill={PREVIOUS_SEGMENT_STYLE.fill}
          fillOpacity={PREVIOUS_SEGMENT_STYLE.fillOpacity}
          isAnimationActive={false}
          stroke={PREVIOUS_SEGMENT_STYLE.stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2.2}
          type="monotone"
        />
      ) : null}
      <Area
        activeDot={false}
        dataKey={splitIndex != null ? 'current' : 'area'}
        dot={false}
        fill={colors.fill}
        fillOpacity={colors.fillOpacity}
        isAnimationActive={false}
        stroke={colors.stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.2}
        type="monotone"
      />
      {boundary ? (
        <ReferenceDot
          fill={colors.stroke}
          ifOverflow="extendDomain"
          isFront
          r={3.8}
          stroke="white"
          strokeWidth={1.8}
          x={boundary.x}
          y={boundary.y}
        />
      ) : null}
    </AreaChart>
  );
}

export function CompactSparkline({
  className,
  height = 24,
  points,
  preserveAspectRatio,
  splitIndex,
  tone = 'flat',
  width = 56,
}: CompactSparklineProps) {
  const colors = demandSparklineToneColors(tone);
  const { boundary, rows } = buildChartData(points, splitIndex);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const isJsdom = typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom');
  const [measuredWidth, setMeasuredWidth] = useState(width);

  useEffect(() => {
    if (isJsdom) {
      setMeasuredWidth(width);
      return;
    }

    const node = rootRef.current;
    if (!node) {
      return;
    }

    const updateWidth = () => {
      const nextWidth = Math.max(node.clientWidth, width);
      setMeasuredWidth(nextWidth);
    };

    const observer = new ResizeObserver(() => updateWidth());
    observer.observe(node);
    updateWidth();
    return () => observer.disconnect();
  }, [isJsdom, width]);

  return (
    <div
      aria-hidden="true"
      className={`${className ?? ''}`.trim()}
      data-chart-kind="compact-sparkline"
      data-split-index={splitIndex}
      data-tone={tone}
      ref={rootRef}
      style={{ height, maxWidth: '100%', minWidth: width, width: '100%' }}
    >
      <SparklineChart boundary={boundary} colors={colors} height={height} rows={rows} splitIndex={splitIndex} width={measuredWidth} />
      {preserveAspectRatio ? <span className="sr-only">{preserveAspectRatio}</span> : null}
    </div>
  );
}
