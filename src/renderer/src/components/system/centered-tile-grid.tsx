import { Children, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const DEFAULT_CENTERED_TILE_GAP_REM = 1.5;
const DEFAULT_CENTERED_TILE_MAX_REM = 22;
const DEFAULT_CENTERED_TILE_MIN_REM = 12;
const DEFAULT_CENTERED_TILE_PADDING_REM = 1;

export function CenteredTileGrid({
  children,
  className,
  columns = 2,
  gapRem = DEFAULT_CENTERED_TILE_GAP_REM,
  maxTileRem = DEFAULT_CENTERED_TILE_MAX_REM,
  minTileRem = DEFAULT_CENTERED_TILE_MIN_REM,
  paddingRem = DEFAULT_CENTERED_TILE_PADDING_REM,
}: {
  children: ReactNode;
  className?: string;
  columns?: number;
  gapRem?: number;
  maxTileRem?: number;
  minTileRem?: number;
  paddingRem?: number;
}) {
  const columnCount = Math.max(1, columns);
  const childCount = Children.count(children);
  const rowCount = Math.max(1, Math.ceil(childCount / columnCount));
  const gridMaxInlineSize = `calc(${columnCount} * var(--centered-tile-max-size) + ${Math.max(0, columnCount - 1)} * var(--centered-tile-gap))`;

  return (
    <div
      data-centered-tile-rows={rowCount}
      data-slot="centered-tile-grid"
      className={cn('flex min-h-0 flex-1 h-full items-center justify-center p-[var(--centered-tile-padding)]', className)}
      style={
        {
          '--centered-tile-columns': columnCount,
          '--centered-tile-gap': `${gapRem}rem`,
          '--centered-tile-min-size': `${minTileRem}rem`,
          '--centered-tile-max-size': `${maxTileRem}rem`,
          '--centered-tile-padding': `${paddingRem}rem`,
          '--centered-grid-max-inline-size': gridMaxInlineSize,
          '--hub-tile-size': `var(--centered-tile-max-size)`,
        } as CSSProperties
      }
    >
      <div
        data-slot="centered-tile-grid-inner"
        className="grid max-w-full justify-center gap-[var(--centered-tile-gap)]"
        style={
          {
            width: '100%',
            maxWidth: 'var(--centered-grid-max-inline-size)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, var(--centered-tile-min-size)), 1fr))',
          } as CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}
