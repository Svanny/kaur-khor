import type { ReactNode } from 'react';
import { Sparklines } from 'react-sparklines';
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

type SparklineColors = ReturnType<typeof demandSparklineToneColors>;

const PREVIOUS_SEGMENT_STYLE = demandSparklineToneColors('previous');

const SPARKLINE_MARGIN = 2;
const STROKE_WIDTH = 2.2;

type ChartPoint = {
  x: number;
  y: number;
};

function polylinePoints(points: ChartPoint[]) {
  return points.flatMap((point) => [point.x, point.y]).join(' ');
}

function areaPoints({
  height,
  points,
}: {
  height: number;
  points: ChartPoint[];
}) {
  const base = polylinePoints(points);
  const endPoint = points[points.length - 1];
  const startPoint = points[0];
  if (!endPoint || !startPoint) {
    return '';
  }
  return `${base} ${endPoint.x} ${height - SPARKLINE_MARGIN} ${startPoint.x} ${height - SPARKLINE_MARGIN} ${startPoint.x} ${startPoint.y}`;
}

function midpoint(left: ChartPoint, right: ChartPoint): ChartPoint {
  return {
    x: (left.x + right.x) / 2,
    y: (left.y + right.y) / 2,
  };
}

function SparklineSegment({
  colors,
  height,
  margin,
  points,
}: {
  colors: SparklineColors;
  height: number;
  margin: number;
  points: ChartPoint[];
}) {
  if (points.length < 2) {
    return null;
  }

  return (
    <g>
      <polyline
        points={areaPoints({ height, points })}
        style={{ fill: colors.fill, fillOpacity: colors.fillOpacity, stroke: 'none', strokeWidth: 0 }}
      />
      <polyline
        points={polylinePoints(points)}
        style={{ fill: 'none', stroke: colors.stroke, strokeLinecap: 'round', strokeLinejoin: 'round', strokeWidth: STROKE_WIDTH }}
      />
    </g>
  );
}

function SparklineRenderer({
  color,
  data,
  height,
  margin,
  points,
  splitIndex,
}: {
  color: CompactSparklineTone;
  data?: number[];
  height?: number;
  margin?: number;
  points?: ChartPoint[];
  splitIndex?: number;
}) {
  if (!points || points.length === 0 || !height || margin == null) {
    return null;
  }

  const colors = demandSparklineToneColors(color);
  const showSplit = splitIndex != null && splitIndex > 0 && splitIndex < points.length;

  if (!showSplit) {
    return <SparklineSegment colors={colors} height={height} margin={margin} points={points} />;
  }

  const leftPoint = points[splitIndex - 1];
  const rightPoint = points[splitIndex];
  if (!leftPoint || !rightPoint) {
    return <SparklineSegment colors={colors} height={height} margin={margin} points={points} />;
  }

  const boundary = midpoint(leftPoint, rightPoint);
  const previousPoints = [...points.slice(0, splitIndex), boundary];
  const currentPoints = [boundary, ...points.slice(splitIndex)];

  return (
    <g>
      <SparklineSegment colors={PREVIOUS_SEGMENT_STYLE} height={height} margin={margin} points={previousPoints} />
      <SparklineSegment colors={colors} height={height} margin={margin} points={currentPoints} />
      <line
        stroke="rgba(48,31,20,0.35)"
        strokeDasharray="4 3"
        strokeWidth={STROKE_WIDTH}
        x1={boundary.x}
        x2={boundary.x}
        y1={margin}
        y2={height - margin}
      />
      <circle
        cx={boundary.x}
        cy={boundary.y}
        fill={colors.stroke}
        r={3.8}
        stroke="white"
        strokeWidth={1.8}
      />
    </g>
  );
}

function SparklineSvg({
  children,
  data,
  height,
  preserveAspectRatio,
  width,
}: {
  children: ReactNode;
  data: number[];
  height: number;
  preserveAspectRatio?: string;
  width: number;
}) {
  return (
    <Sparklines
      data={data}
      height={height}
      margin={SPARKLINE_MARGIN}
      preserveAspectRatio={preserveAspectRatio}
      style={{ display: 'block', height: '100%', overflow: 'visible', width: '100%' }}
      width={width}
    >
      {children}
    </Sparklines>
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
  const data = points.length > 1 ? points : [points[0] ?? 0, points[0] ?? 0];

  return (
    <div aria-hidden="true" className={`${className ?? ''}`.trim()} data-split-index={splitIndex} data-tone={tone}>
      <SparklineSvg data={data} height={height} preserveAspectRatio={preserveAspectRatio} width={width}>
        <SparklineRenderer color={tone} splitIndex={splitIndex} />
      </SparklineSvg>
    </div>
  );
}
