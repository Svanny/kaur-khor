import { Children, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const DEFAULT_CENTERED_TILE_GAP_REM = 1.5;
const DEFAULT_CENTERED_TILE_MAX_REM = 22;
const DEFAULT_CENTERED_TILE_PADDING_REM = 1;

export function CenteredTileGrid({
  children,
  className,
  columns = 2,
  gapRem = DEFAULT_CENTERED_TILE_GAP_REM,
  maxTileRem = DEFAULT_CENTERED_TILE_MAX_REM,
  paddingRem = DEFAULT_CENTERED_TILE_PADDING_REM,
}: {
  children: ReactNode;
  className?: string;
  columns?: number;
  gapRem?: number;
  maxTileRem?: number;
  paddingRem?: number;
}) {
  const columnCount = Math.max(1, columns);
  const childCount = Children.count(children);
  const rowCount = Math.max(1, Math.ceil(childCount / columnCount));
  const hubTileSize = `min(${maxTileRem}rem, calc((100cqw - ${Math.max(0, columnCount - 1)} * var(--centered-tile-gap)) / ${columnCount}), calc((100cqh - ${Math.max(0, rowCount - 1)} * var(--centered-tile-gap)) / ${rowCount}))`;

  return (
    <div
      className={cn('grid min-h-0 flex-1 h-full content-center place-items-center p-[var(--centered-tile-padding)]', className)}
      style={
        {
          containerType: 'size',
          '--centered-tile-columns': columnCount,
          '--centered-tile-gap': `${gapRem}rem`,
          '--centered-tile-padding': `${paddingRem}rem`,
          '--hub-tile-size': hubTileSize,
        } as CSSProperties
      }
    >
      <div
        className="inline-grid max-w-full grid-cols-1 justify-center gap-[var(--centered-tile-gap)] sm:grid-cols-[repeat(var(--centered-tile-columns),var(--hub-tile-size))]"
      >
        {children}
      </div>
    </div>
  );
}
