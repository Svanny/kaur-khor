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
import { ActionDragHandleIcon } from '@icons/actions';
import { rankingEntryTypeIcons } from '@icons/domain';
import type { IconComponent } from '@icons';
import { StatusDeltaTriangleIcon } from '@icons/status';
import type { InventorySnapshot } from '@shared/inventory';
import { formatCurrency, rankLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';
import { clampOverlayTransformToBoundary } from '@/routes/ranking-drag';
import { buildRankingEntryId, reorderRankingEntries } from '@/routes/ranking-order';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

type RankingRowModel = {
  id: string;
  index: number;
  costText: string;
  label: string;
  kindIcon: IconComponent;
  kindLabel: string;
  movedFromBaseline: boolean;
  rankChangeDirection: 'up' | 'down' | null;
  priceChangeDirection: 'up' | 'down' | null;
  priceText: string;
};

const rankingGridClassName =
  'grid grid-cols-[max-content_max-content_24px_minmax(0,1fr)_max-content_max-content] gap-4';

const dropAnimation = {
  duration: 160,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
};

const rankingCellContentClassName = 'flex min-h-8 items-center';
const rankingTableHeaderClassName =
  'px-4 py-3 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground';
const rankingTableCellClassName = 'px-4 py-4 align-middle whitespace-normal';

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
  const dragBoundaryRef = useRef<HTMLTableSectionElement | null>(null);

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
      const KindIcon = rankingEntryTypeIcons[entry.entryType];

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
    <div className="-mx-6 overflow-x-auto bg-white">
      {helperText ? (
        <p className="mx-6 mb-3 text-sm text-muted-foreground">{helperText}</p>
      ) : null}
      <Table
        aria-label={titleLabel ?? t('productRankingTitle')}
        className="min-w-[860px] table-fixed bg-white"
      >
        <colgroup>
          <col style={{ width: '3.5rem' }} />
          <col style={{ width: '5rem' }} />
          <col style={{ width: '2rem' }} />
          <col style={{ width: '44%' }} />
          <col style={{ width: '8rem' }} />
          <col style={{ width: '8rem' }} />
        </colgroup>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead aria-hidden="true" className={rankingTableHeaderClassName} />
            <TableHead className={cn(rankingTableHeaderClassName, 'text-center')}>{t('rankHeaderRank')}</TableHead>
            <TableHead aria-hidden="true" className={rankingTableHeaderClassName} />
            <TableHead className={cn(rankingTableHeaderClassName, 'text-left')}>Item</TableHead>
            <TableHead className={cn(rankingTableHeaderClassName, 'text-center')}>Cost</TableHead>
            <TableHead className={cn(rankingTableHeaderClassName, 'text-center')}>{t('rankHeaderPrice')}</TableHead>
          </TableRow>
        </TableHeader>
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
            <TableBody
              data-testid="ranking-list"
              ref={dragBoundaryRef}
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
                  movedFromBaseline={row.movedFromBaseline}
                  priceChangeDirection={row.priceChangeDirection}
                  priceText={row.priceText}
                />
              ))}
            </TableBody>
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
      </Table>
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
}: RankingRowModel) {
  const {
    attributes,
    isDragging,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id });

  return (
    <RankingRowCard
      {...attributes}
      {...listeners}
      aria-label={`Reorder ${label}`}
      dragging={isDragging}
      handle={
        <div
          aria-hidden="true"
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground transition-[background-color,color,transform] duration-150 ease-out group-hover/row:bg-accent/40 group-hover/row:text-foreground data-[dragging=true]:bg-accent/60 data-[dragging=true]:text-foreground motion-reduce:transition-none"
          data-dragging={isDragging || undefined}
        >
          <ActionDragHandleIcon aria-hidden="true" className="size-4" />
        </div>
      }
      index={index}
      costText={costText}
      kindIcon={kindIcon}
      kindLabel={kindLabel}
      label={label}
      rankChangeDirection={rankChangeDirection}
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

type RankingRowCardProps = HTMLAttributes<HTMLTableRowElement> & {
  dragging?: boolean;
  handle: ReactNode;
  index: number;
  costText: string;
  kindIcon: IconComponent;
  kindLabel: string;
  label: string;
  movedFromBaseline: boolean;
  overlay?: boolean;
  rankChangeDirection: 'up' | 'down' | null;
  priceChangeDirection: 'up' | 'down' | null;
  priceText: string;
};

const RankingRowCard = forwardRef<HTMLTableRowElement, RankingRowCardProps>(function RankingRowCard(
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
    style,
    ...props
  },
  ref,
) {
  const rankCell = (
    <>
      <RankingMobileLabel>Rank</RankingMobileLabel>
      <div className={cn(rankingCellContentClassName, 'justify-center gap-1.5 text-center text-lg font-medium tracking-tight text-foreground tabular-nums')}>
        <span>#{index + 1}</span>
        {rankChangeDirection ? (
          <StatusDeltaTriangleIcon
            aria-hidden="true"
            className={cn(
              'rank-change-triangle !size-2 fill-current',
              rankChangeDirection === 'up' ? 'text-emerald-600' : 'rotate-180 text-red-600',
            )}
          />
        ) : null}
      </div>
    </>
  );
  const itemCell = (
    <>
      <RankingMobileLabel>Item</RankingMobileLabel>
      <div className={cn(rankingCellContentClassName, 'min-w-0 justify-start gap-2.5')}>
        <span className="shrink-0 text-muted-foreground">
          <KindIcon aria-hidden="true" className="size-4" />
          <span className="sr-only">{kindLabel}</span>
        </span>
        <p className="min-w-0 truncate text-[1.05rem] font-medium tracking-tight text-foreground">{label}</p>
      </div>
    </>
  );
  const costCell = (
    <>
      <RankingMobileLabel>Cost</RankingMobileLabel>
      <div className={cn(rankingCellContentClassName, 'justify-center')}>
        <p className="text-center">{costText}</p>
      </div>
    </>
  );
  const priceCell = (
    <>
      <RankingMobileLabel>Price</RankingMobileLabel>
      <div className={cn(rankingCellContentClassName, 'justify-center')}>
        <div className="grid grid-cols-[0.75rem_auto_0.75rem] items-center justify-center">
          <span aria-hidden="true" />
          <span className="text-center">{priceText}</span>
          <span className="flex justify-end">
            {priceChangeDirection ? (
              <StatusDeltaTriangleIcon
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
    </>
  );

  if (overlay) {
    return (
      <div
        className={cn(
          rankingGridClassName,
          'group/row pointer-events-none rounded-2xl border border-border/70 bg-white/95 px-3 py-4 shadow-[0_24px_80px_-28px_rgba(39,27,18,0.35)] backdrop-blur-[2px] md:px-4',
          className,
        )}
        style={{
          ...style,
          willChange: 'transform',
        }}
      >
        <div className="pr-1">
          <div className="flex min-h-8 items-center justify-center">{handle}</div>
        </div>
        <div className="px-1 text-center">{rankCell}</div>
        <div aria-hidden="true" />
        <div className="min-w-0 px-2 pl-4 text-left">{itemCell}</div>
        <div className="px-2 text-lg font-medium tracking-tight text-foreground tabular-nums">{costCell}</div>
        <div className="px-2 text-lg font-medium tracking-tight text-foreground tabular-nums">{priceCell}</div>
      </div>
    );
  }

  return (
    <TableRow
      {...props}
      className={cn(
        'group/row cursor-grab touch-none transition-[background-color,box-shadow,opacity] duration-150 ease-out motion-reduce:transition-none active:cursor-grabbing',
        'bg-white hover:bg-white',
        dragging && 'opacity-0',
        className,
      )}
      ref={ref}
      style={{
        ...style,
        willChange: 'transform',
      }}
    >
      <TableCell className={cn(rankingTableCellClassName, 'w-14 px-3 text-center')}>
        <div className="flex min-h-8 items-center justify-center">{handle}</div>
      </TableCell>
      <TableCell className={cn(rankingTableCellClassName, 'text-center')}>{rankCell}</TableCell>
      <TableCell aria-hidden="true" className={rankingTableCellClassName} />
      <TableCell className={cn(rankingTableCellClassName, 'min-w-0 pl-4 text-left')}>{itemCell}</TableCell>
      <TableCell className={cn(rankingTableCellClassName, 'text-lg font-medium tracking-tight text-foreground tabular-nums')}>{costCell}</TableCell>
      <TableCell className={cn(rankingTableCellClassName, 'text-lg font-medium tracking-tight text-foreground tabular-nums')}>{priceCell}</TableCell>
    </TableRow>
  );
});

function RankingMobileLabel({ children }: { children: ReactNode }) {
  return (
    <p className="mb-1 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground lg:hidden">
      {children}
    </p>
  );
}

function StaticGripHandle() {
  return (
    <div className="flex size-8 items-center justify-center rounded-md bg-white/70 text-muted-foreground shadow-sm">
      <ActionDragHandleIcon aria-hidden="true" className="size-4" />
    </div>
  );
}
