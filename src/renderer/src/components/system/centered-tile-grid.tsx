import { Children, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const DEFAULT_CENTERED_TILE_GAP_REM = 1.5;
const DEFAULT_CENTERED_TILE_MAX_REM = 22;
const DEFAULT_CENTERED_TILE_MIN_REM = 12;
const DEFAULT_CENTERED_TILE_PADDING_REM = 1;

export function CenteredTileGrid({
  children,
  className,
  columns = 2,
  disableMeasurement = false,
  gapRem = DEFAULT_CENTERED_TILE_GAP_REM,
  maxTileRem = DEFAULT_CENTERED_TILE_MAX_REM,
  minTileRem = DEFAULT_CENTERED_TILE_MIN_REM,
  paddingRem = DEFAULT_CENTERED_TILE_PADDING_REM,
  tileSize,
}: {
  children: ReactNode;
  className?: string;
  columns?: number;
  disableMeasurement?: boolean;
  gapRem?: number;
  maxTileRem?: number;
  minTileRem?: number;
  paddingRem?: number;
  tileSize?: string;
}) {
  const columnCount = Math.max(1, columns);
  const childCount = Children.count(children);
  const rowCount = Math.max(1, Math.ceil(childCount / columnCount));
  const gridMaxInlineSize = `calc(${columnCount} * var(--centered-tile-max-size) + ${Math.max(0, columnCount - 1)} * var(--centered-tile-gap))`;
  const gridMaxBlockSize = `calc(${rowCount} * var(--centered-tile-max-size) + ${Math.max(0, rowCount - 1)} * var(--centered-tile-gap))`;
  const gridRef = useRef<HTMLDivElement | null>(null);
  const [measuredTileSize, setMeasuredTileSize] = useState<string | null>(null);

  useLayoutEffect(() => {
    if (disableMeasurement) {
      setMeasuredTileSize(null);
      return undefined;
    }
    const grid = gridRef.current;
    if (!grid || typeof ResizeObserver === 'undefined') {
      return undefined;
    }
    const targetGrid = grid;

    function updateTileSize() {
      const remPx = Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
      const bounds = targetGrid.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) {
        return;
      }
      const gapPx = gapRem * remPx;
      const paddingPx = paddingRem * remPx;
      const maxTilePx = maxTileRem * remPx;
      const inlineFitPx = (bounds.width - 2 * paddingPx - Math.max(0, columnCount - 1) * gapPx) / columnCount;
      const blockFitPx = (bounds.height - 2 * paddingPx - Math.max(0, rowCount - 1) * gapPx) / rowCount;
      const nextTilePx = Math.max(1, Math.min(maxTilePx, inlineFitPx, blockFitPx));
      setMeasuredTileSize(`${nextTilePx.toFixed(2)}px`);
    }

    updateTileSize();
    const resizeObserver = new ResizeObserver(updateTileSize);
    resizeObserver.observe(targetGrid);
    return () => {
      resizeObserver.disconnect();
    };
  }, [columnCount, disableMeasurement, gapRem, maxTileRem, paddingRem, rowCount]);

  return (
    <div
      data-centered-tile-rows={rowCount}
      data-slot="centered-tile-grid"
      ref={gridRef}
      className={cn('flex min-h-0 flex-1 h-full items-center justify-center p-[var(--centered-tile-padding)]', className)}
      style={
        {
          '--centered-tile-columns': columnCount,
          '--centered-tile-gap': `${gapRem}rem`,
          '--centered-tile-min-size': `${minTileRem}rem`,
          '--centered-tile-max-size': `${maxTileRem}rem`,
          '--centered-tile-padding': `${paddingRem}rem`,
          '--centered-grid-max-inline-size': gridMaxInlineSize,
          '--centered-grid-max-block-size': gridMaxBlockSize,
          '--hub-tile-size': measuredTileSize ?? tileSize ?? 'var(--centered-tile-max-size)',
        } as CSSProperties
      }
    >
      <div
        data-slot="centered-tile-grid-inner"
        className="grid max-w-full place-items-center justify-center gap-[var(--centered-tile-gap)]"
        style={
          {
            width: 'fit-content',
            height: 'fit-content',
            maxWidth: 'var(--centered-grid-max-inline-size)',
            maxHeight: 'min(100%, var(--centered-grid-max-block-size))',
            gridAutoRows: 'var(--hub-tile-size)',
            gridTemplateColumns: 'repeat(var(--centered-tile-columns), var(--hub-tile-size))',
          } as CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}
