import { Children, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

const DEFAULT_CENTERED_TILE_GAP_REM = 1.5;
const DEFAULT_CENTERED_TILE_MAX_REM = 22;
const DEFAULT_CENTERED_TILE_PADDING_REM = 1;
const ROOT_FONT_SIZE_FALLBACK = 16;

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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerSize, setContainerSize] = useState({ height: 0, width: 0 });
  const childCount = Children.count(children);
  const rowCount = Math.max(1, Math.ceil(childCount / columns));

  useEffect(() => {
    const node = containerRef.current;
    if (!node || typeof ResizeObserver === 'undefined') {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const rect = entry.contentRect;
        setContainerSize({
          height: Math.max(0, rect.height),
          width: Math.max(0, rect.width),
        });
      }
    });

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const rootFontSize = typeof window === 'undefined'
    ? ROOT_FONT_SIZE_FALLBACK
    : Number.parseFloat(window.getComputedStyle(document.documentElement).fontSize) || ROOT_FONT_SIZE_FALLBACK;
  const gapPx = gapRem * rootFontSize;
  const maxTilePx = maxTileRem * rootFontSize;
  const widthBound = (containerSize.width - gapPx * Math.max(0, columns - 1)) / columns;
  const heightBound = (containerSize.height - gapPx * Math.max(0, rowCount - 1)) / rowCount;
  const tileSize = Math.max(0, Math.floor(Math.min(maxTilePx, widthBound || maxTilePx, heightBound || maxTilePx)));

  return (
    <div
      ref={containerRef}
      className={cn('grid min-h-0 flex-1 place-items-center p-[var(--centered-tile-padding)]', className)}
      style={
        {
          '--centered-tile-columns': columns,
          '--centered-tile-gap': `${gapRem}rem`,
          '--centered-tile-padding': `${paddingRem}rem`,
          '--hub-tile-size': tileSize > 0 ? `${tileSize}px` : `${Math.min(maxTileRem, 18)}rem`,
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
