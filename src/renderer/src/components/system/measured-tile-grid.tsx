import { type CSSProperties, type ReactNode, useEffect, useRef, useState } from 'react';
import { deriveMeasuredGridColumnCount, DEFAULT_MEASURED_GRID_GAP } from '@/lib/measured-grid';

export function MeasuredTileGrid<T>({
  gap = DEFAULT_MEASURED_GRID_GAP,
  items,
  maxColumns,
  minColumns = 1,
  renderGrid,
  renderMeasureItem,
}: {
  gap?: number;
  items: T[];
  maxColumns?: number;
  minColumns?: number;
  renderGrid: (args: { columnCount: number; gridRef: React.RefObject<HTMLDivElement | null> }) => ReactNode;
  renderMeasureItem: (item: T, index: number) => ReactNode;
}) {
  const [columnCount, setColumnCount] = useState(minColumns);
  const gridRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const hasFixedColumnCount = maxColumns != null && maxColumns === minColumns;

  useEffect(() => {
    if (hasFixedColumnCount) {
      setColumnCount(minColumns);
      return;
    }

    const gridNode = gridRef.current;
    const measureNode = measureRef.current;
    if (!gridNode || !measureNode) {
      setColumnCount(minColumns);
      return;
    }

    const updateColumns = () => {
      const containerWidth = gridNode.clientWidth;
      const measuredTiles = Array.from(
        measureNode.querySelectorAll<HTMLElement>('[data-measured-grid-item="true"]'),
      );
      const maxItemWidth = measuredTiles.reduce(
        (maxWidth, tile) => Math.max(maxWidth, tile.getBoundingClientRect().width),
        0,
      );

      const nextCount = deriveMeasuredGridColumnCount({
        containerWidth,
        gap,
        maxItemWidth,
      });

      setColumnCount(
        Math.max(
          minColumns,
          maxColumns == null ? nextCount : Math.min(maxColumns, nextCount),
        ),
      );
    };

    const observer = new ResizeObserver(() => updateColumns());
    observer.observe(gridNode);
    updateColumns();
    return () => observer.disconnect();
  }, [gap, hasFixedColumnCount, items, maxColumns, minColumns]);

  if (hasFixedColumnCount) {
    return renderGrid({ columnCount: minColumns, gridRef });
  }

  return (
    <>
      {renderGrid({ columnCount, gridRef })}
      <div
        ref={measureRef}
        aria-hidden="true"
        className="pointer-events-none invisible absolute left-0 top-0 -z-10 grid opacity-0"
        style={{ '--measured-grid-gap': `${gap}px` } as CSSProperties}
      >
        <div
          className="grid gap-[var(--measured-grid-gap)]"
          style={{ gridTemplateColumns: 'max-content' }}
        >
          {items.map((item, index) => (
            <div key={index} data-measured-grid-item="true">
              {renderMeasureItem(item, index)}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
