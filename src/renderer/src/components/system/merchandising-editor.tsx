import type { HTMLAttributes, ReactNode } from 'react';
import { forwardRef, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RankingEntry, RankingEntryType } from '@shared/inventory';
import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical, Triangle, type LucideIcon } from 'lucide-react';
import type { InventorySnapshot } from '@shared/inventory';
import { formatCurrency, rankLabel } from '@/lib/format';
import { rankingEntryTypeIconMap } from '@/lib/icon-mappings';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';
import { clampOverlayTransformToBoundary } from '@/routes/ranking-drag';
import { buildRankingEntryId, reorderRankingEntries } from '@/routes/ranking-order';
import {
  createHeaderedTableLayout,
  HeaderedTable,
  HeaderedTableBody,
  HeaderedTableHeader,
  HeaderedTableHeaderCell,
  HeaderedTableMobileLabel,
  HeaderedTableRow,
} from './headered-table';

type RankingRowModel = {
  id: string;
  index: number;
  costText: string;
  label: string;
  kindIcon: LucideIcon;
  kindLabel: string;
  movedFromBaseline: boolean;
  rankChangeDirection: 'up' | 'down' | null;
  priceChangeDirection: 'up' | 'down' | null;
  priceText: string;
};

const rankingGridClassName =
  'grid grid-cols-[max-content_max-content_24px_minmax(0,1fr)_max-content_max-content] gap-4';
const rankingTableLayout = createHeaderedTableLayout({
  breakpoint: 'lg',
  columns: 'max-content max-content 24px minmax(0,1fr) max-content max-content',
  gap: 4,
});

const dropAnimation = {
  duration: 160,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
};

export function buildEligibleReportRanking(snapshot: InventorySnapshot): RankingEntry[] {
  return [
    ...snapshot.services.map((service, index) => ({
      entryType: 'service' as const,
      entryId: service.serviceId,
      position: index,
    })),
    ...snapshot.skus
      .filter((sku) => sku.soldAsProduct && sku.productPrice !== null)
      .map((sku, index) => ({
        entryType: 'sku' as const,
        entryId: sku.skuId,
        position: snapshot.services.length + index,
      })),
  ];
}

export function normalizeReportRanking(
  snapshot: InventorySnapshot,
  preferredEntries?: RankingEntry[],
): RankingEntry[] {
  const eligibleEntries = buildEligibleReportRanking(snapshot);
  const eligibleIds = new Set(eligibleEntries.map((entry) => `${entry.entryType}:${entry.entryId}`));
  const seen = new Set<string>();

  const preferredInScope =
    preferredEntries?.filter((entry) => {
      const key = `${entry.entryType}:${entry.entryId}`;
      if (!eligibleIds.has(key) || seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    }) ?? [];

  const remainingEntries = eligibleEntries.filter((entry) => {
    const key = `${entry.entryType}:${entry.entryId}`;
    return !seen.has(key);
  });

  return [...preferredInScope, ...remainingEntries].map((entry, index) => ({
    ...entry,
    position: index,
  }));
}

export function buildDefaultReportRanking(snapshot: InventorySnapshot): RankingEntry[] {
  return normalizeReportRanking(snapshot, snapshot.ranking.length > 0 ? snapshot.ranking : undefined);
}

export function rankingIdsByType(entries: RankingEntry[], entryType: RankingEntryType) {
  return entries.filter((entry) => entry.entryType === entryType).map((entry) => entry.entryId);
}

export function hasRankingChanged(baseEntries: RankingEntry[], nextEntries: RankingEntry[]) {
  if (baseEntries.length !== nextEntries.length) {
    return true;
  }

  return baseEntries.some((entry, index) => {
    const next = nextEntries[index];
    return (
      entry.entryType !== next?.entryType ||
      entry.entryId !== next?.entryId ||
      entry.position !== next?.position
    );
  });
}

export function MerchandisingEditor({
  entries,
  snapshot,
  onChange,
  titleLabel,
  helperText,
  priceByEntryKey,
  priceChangeByEntryKey,
  rankChangeByEntryKey,
}: {
  entries: RankingEntry[];
  snapshot: InventorySnapshot;
  onChange: (entries: RankingEntry[]) => void;
  titleLabel?: string;
  helperText?: string;
  priceByEntryKey?: Record<string, number>;
  priceChangeByEntryKey?: Record<string, 'up' | 'down' | null>;
  rankChangeByEntryKey?: Record<string, 'up' | 'down' | null>;
}) {
  const { currency, language, t, usdToKhrExchangeRate } = usePreferences();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeWidth, setActiveWidth] = useState<number | undefined>(undefined);
  const dragBoundaryRef = useRef<HTMLDivElement | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const rowModels = useMemo(() => {
    return entries.map((entry, index) => {
      const label = rankLabel(entry, snapshot.skus, snapshot.services);
      const entryKey = `${entry.entryType}:${entry.entryId}`;
      const service = entry.entryType === 'service' ? snapshot.services.find((candidate) => candidate.serviceId === entry.entryId) : null;
      const sku = entry.entryType === 'sku' ? snapshot.skus.find((candidate) => candidate.skuId === entry.entryId) : null;
      const cost =
        entry.entryType === 'service'
          ? (service?.skuIds ?? []).reduce(
              (sum, skuId) => sum + (snapshot.skus.find((candidate) => candidate.skuId === skuId)?.costPerUnit ?? 0),
              0,
            )
          : (sku?.costPerUnit ?? 0);
      const fallbackPrice = entry.entryType === 'service' ? (service?.price ?? 0) : (sku?.productPrice ?? 0);
      const price = priceByEntryKey?.[entryKey] ?? fallbackPrice;
      const KindIcon = rankingEntryTypeIconMap[entry.entryType];

      return {
        id: buildRankingEntryId(entry),
        index,
        costText: formatCurrency(cost, currency, language, usdToKhrExchangeRate),
        label,
        kindIcon: KindIcon,
        kindLabel: entry.entryType === 'service' ? t('serviceLabel') : t('skuLabel'),
        movedFromBaseline: (rankChangeByEntryKey?.[entryKey] ?? null) !== null,
        rankChangeDirection: rankChangeByEntryKey?.[entryKey] ?? null,
        priceChangeDirection: priceChangeByEntryKey?.[entryKey] ?? null,
        priceText: formatCurrency(price, currency, language, usdToKhrExchangeRate),
      };
    });
  }, [currency, entries, language, priceByEntryKey, priceChangeByEntryKey, rankChangeByEntryKey, snapshot.services, snapshot.skus, t, usdToKhrExchangeRate]);

  const activeRow = rowModels.find((row) => row.id === activeId) ?? null;
  const overlayModifiers = useMemo<Modifier[]>(
    () => [
      ({ activeNodeRect, overlayNodeRect, transform }) =>
        clampOverlayTransformToBoundary({
          activeNodeRect,
          boundaryRect: dragBoundaryRef.current?.getBoundingClientRect() ?? null,
          overlayNodeRect,
          transform,
        }),
    ],
    [],
  );

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setActiveWidth(event.active.rect.current.initial?.width);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    setActiveId(null);
    setActiveWidth(undefined);

    if (!over) {
      return;
    }

    onChange(reorderRankingEntries(entries, String(active.id), String(over.id)));
  }

  return (
    <div className="overflow-x-auto">
      <HeaderedTable
        className="min-w-[860px]"
        variant="framed"
      >
        {helperText ? (
          <p className="mb-3 text-sm text-muted-foreground">{helperText}</p>
        ) : null}
        <div
          aria-label={titleLabel ?? t('productRankingTitle')}
          className={rankingTableLayout.containerClassName}
          role="table"
          style={rankingTableLayout.style}
        >
          <HeaderedTableHeader className={rankingTableLayout.headerClassName}>
            <HeaderedTableHeaderCell aria-hidden="true" />
            <HeaderedTableHeaderCell align="center">{t('rankHeaderRank')}</HeaderedTableHeaderCell>
            <HeaderedTableHeaderCell aria-hidden="true" />
            <HeaderedTableHeaderCell align="left" className="pl-4">Item</HeaderedTableHeaderCell>
            <HeaderedTableHeaderCell align="center">Cost</HeaderedTableHeaderCell>
            <HeaderedTableHeaderCell align="center">{t('rankHeaderPrice')}</HeaderedTableHeaderCell>
          </HeaderedTableHeader>

        <DndContext
          collisionDetection={closestCenter}
          onDragCancel={() => {
            setActiveId(null);
            setActiveWidth(undefined);
          }}
          onDragEnd={handleDragEnd}
          onDragStart={handleDragStart}
          sensors={sensors}
        >
          <SortableContext
            items={rowModels.map((row) => row.id)}
            strategy={verticalListSortingStrategy}
          >
            <HeaderedTableBody
              className={rankingTableLayout.bodyClassName}
              data-testid="ranking-list"
              ref={dragBoundaryRef}
              role="rowgroup"
            >
              {rowModels.map((row) => (
                <SortableRankingRow
                  id={row.id}
                  index={row.index}
                  costText={row.costText}
                  key={row.id}
                  kindIcon={row.kindIcon}
                  kindLabel={row.kindLabel}
                  label={row.label}
                  rankChangeDirection={row.rankChangeDirection}
                  rowClassName={rankingTableLayout.rowClassName}
                  movedFromBaseline={row.movedFromBaseline}
                  priceChangeDirection={row.priceChangeDirection}
                  priceText={row.priceText}
                />
              ))}
            </HeaderedTableBody>
          </SortableContext>

          {typeof document !== 'undefined'
            ? createPortal(
                <DragOverlay dropAnimation={dropAnimation} modifiers={overlayModifiers}>
                  {activeRow ? (
                    <RankingRowCard
                      handle={<StaticGripHandle />}
                      index={activeRow.index}
                      costText={activeRow.costText}
                      kindIcon={activeRow.kindIcon}
                      kindLabel={activeRow.kindLabel}
                      label={activeRow.label}
                      rankChangeDirection={activeRow.rankChangeDirection}
                      movedFromBaseline={activeRow.movedFromBaseline}
                      overlay
                      priceChangeDirection={activeRow.priceChangeDirection}
                      priceText={activeRow.priceText}
                      style={activeWidth ? { width: activeWidth } : undefined}
                    />
                  ) : null}
                </DragOverlay>,
                document.body,
              )
            : null}
        </DndContext>
        </div>
      </HeaderedTable>
    </div>
  );
}

function SortableRankingRow({
  id,
  index,
  costText,
  kindIcon,
  label,
  kindLabel,
  movedFromBaseline,
  rankChangeDirection,
  priceChangeDirection,
  priceText,
  rowClassName,
}: RankingRowModel & {
  rowClassName: string;
}) {
  const {
    attributes,
    isDragging,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  return (
    <RankingRowCard
      dragging={isDragging}
      handle={
        <button
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${label}`}
          className="flex size-8 touch-none items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[background-color,color,transform,opacity] duration-150 ease-out group-hover/row:opacity-100 data-[dragging=true]:opacity-100 hover:bg-accent/60 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95 active:cursor-grabbing motion-reduce:transition-none"
          data-dragging={isDragging || undefined}
          ref={setActivatorNodeRef}
          type="button"
        >
          <GripVertical aria-hidden="true" className="size-4 cursor-grab" />
        </button>
      }
      index={index}
      costText={costText}
      kindIcon={kindIcon}
      kindLabel={kindLabel}
      label={label}
      rankChangeDirection={rankChangeDirection}
      rowClassName={rowClassName}
      movedFromBaseline={movedFromBaseline}
      priceChangeDirection={priceChangeDirection}
      priceText={priceText}
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
      }}
    />
  );
}

type RankingRowCardProps = HTMLAttributes<HTMLDivElement> & {
  dragging?: boolean;
  handle: ReactNode;
  index: number;
  costText: string;
  kindIcon: LucideIcon;
  kindLabel: string;
  label: string;
  movedFromBaseline: boolean;
  overlay?: boolean;
  rankChangeDirection: 'up' | 'down' | null;
  priceChangeDirection: 'up' | 'down' | null;
  priceText: string;
  rowClassName?: string;
};

const RankingRowCard = forwardRef<HTMLDivElement, RankingRowCardProps>(function RankingRowCard(
  {
    className,
    dragging = false,
    handle,
    index,
    costText,
    kindIcon: KindIcon,
    kindLabel,
    label,
    movedFromBaseline,
    overlay = false,
    rankChangeDirection,
    priceChangeDirection,
    priceText,
    rowClassName,
    style,
    ...props
  },
  ref,
) {
  return (
    <HeaderedTableRow
      {...props}
      className={cn(
        overlay ? rankingGridClassName : rowClassName,
        'group/row px-3 py-4 transition-[background-color,box-shadow,opacity] duration-150 ease-out motion-reduce:transition-none md:px-4',
        overlay
          ? 'pointer-events-none rounded-2xl border border-border/70 bg-background/95 shadow-[0_24px_80px_-28px_rgba(39,27,18,0.35)] backdrop-blur-[2px]'
          : movedFromBaseline
            ? 'bg-muted/60 hover:bg-muted/70'
            : `bg-transparent ${rowHoverClassName}`,
        dragging && 'opacity-0',
        className,
      )}
      ref={ref}
      role="row"
      style={{
        ...style,
        willChange: 'transform',
      }}
    >
      <div className="pr-1" role="cell">
        <div className="flex min-h-8 items-center justify-center">{handle}</div>
      </div>
      <div className="px-1 text-center" role="cell">
        <HeaderedTableMobileLabel className={rankingTableLayout.mobileLabelClassName}>Rank</HeaderedTableMobileLabel>
        <div className="flex min-h-8 items-center justify-center gap-1.5 text-center text-lg font-medium tracking-tight text-foreground tabular-nums">
          <span>#{index + 1}</span>
          {rankChangeDirection ? (
            <Triangle
              aria-hidden="true"
              className={cn(
                'rank-change-triangle !size-2 fill-current',
                rankChangeDirection === 'up' ? 'text-emerald-600' : 'rotate-180 text-red-600',
              )}
            />
          ) : null}
        </div>
      </div>
      <div aria-hidden="true" role="presentation" />
      <div className="min-w-0 px-2 pl-4 text-left" role="cell">
        <HeaderedTableMobileLabel className={rankingTableLayout.mobileLabelClassName}>Item</HeaderedTableMobileLabel>
        <div className="flex min-w-0 items-center justify-start gap-2.5">
          <span className="shrink-0 text-muted-foreground">
            <KindIcon aria-hidden="true" className="size-4" />
            <span className="sr-only">{kindLabel}</span>
          </span>
          <p className="min-w-0 truncate text-[1.05rem] font-medium tracking-tight text-foreground">{label}</p>
        </div>
      </div>
      <div className="px-2 text-lg font-medium tracking-tight text-foreground tabular-nums" role="cell">
        <HeaderedTableMobileLabel className={rankingTableLayout.mobileLabelClassName}>Cost</HeaderedTableMobileLabel>
        <p className="text-center">{costText}</p>
      </div>
      <div className="px-2 text-lg font-medium tracking-tight text-foreground tabular-nums" role="cell">
        <HeaderedTableMobileLabel className={rankingTableLayout.mobileLabelClassName}>Price</HeaderedTableMobileLabel>
        <div className="grid grid-cols-[0.75rem_auto_0.75rem] items-center justify-center">
          <span aria-hidden="true" />
          <span className="text-center">{priceText}</span>
          <span className="flex justify-end">
            {priceChangeDirection ? (
              <Triangle
                aria-hidden="true"
                className={cn(
                  'price-change-triangle',
                  '!size-3 fill-current',
                  priceChangeDirection === 'up' ? 'text-emerald-600' : 'rotate-180 text-red-600',
                )}
              />
            ) : null}
          </span>
        </div>
      </div>
    </HeaderedTableRow>
  );
});

function StaticGripHandle() {
  return (
    <div className="flex size-8 items-center justify-center rounded-md bg-white/70 text-muted-foreground shadow-sm">
      <GripVertical aria-hidden="true" className="size-4" />
    </div>
  );
}
