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
import { GripVertical, HandCoins, Package, Triangle, type LucideIcon } from 'lucide-react';
import type { InventorySnapshot } from '@shared/inventory';
import { formatCurrency, rankLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { usePreferences } from '@/state/preferences';
import { clampOverlayTransformToBoundary } from '@/routes/ranking-drag';
import { buildRankingEntryId, reorderRankingEntries } from '@/routes/ranking-order';

type RankingRowModel = {
  id: string;
  index: number;
  label: string;
  kindIcon: LucideIcon;
  kindLabel: string;
  movedFromBaseline: boolean;
  priceChangeDirection: 'up' | 'down' | null;
  priceText: string;
};

const rankingGridClassName =
  'grid grid-cols-[128px_minmax(0,1.45fr)_minmax(120px,0.65fr)_minmax(168px,0.85fr)] gap-4';

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
  movedByEntryKey,
}: {
  entries: RankingEntry[];
  snapshot: InventorySnapshot;
  onChange: (entries: RankingEntry[]) => void;
  titleLabel?: string;
  helperText?: string;
  priceByEntryKey?: Record<string, number>;
  priceChangeByEntryKey?: Record<string, 'up' | 'down' | null>;
  movedByEntryKey?: Record<string, boolean>;
}) {
  const { currency, language, t } = usePreferences();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeWidth, setActiveWidth] = useState<number | undefined>(undefined);
  const [suppressedHandleId, setSuppressedHandleId] = useState<string | null>(null);
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
      const fallbackPrice =
        entry.entryType === 'service'
          ? snapshot.services.find((service) => service.serviceId === entry.entryId)?.price ?? 0
          : snapshot.skus.find((sku) => sku.skuId === entry.entryId)?.costPerUnit ?? 0;
      const price = priceByEntryKey?.[entryKey] ?? fallbackPrice;

      return {
        id: buildRankingEntryId(entry),
        index,
        label,
        kindIcon: entry.entryType === 'service' ? HandCoins : Package,
        kindLabel: entry.entryType === 'service' ? t('serviceLabel') : t('skuLabel'),
        movedFromBaseline: Boolean(movedByEntryKey?.[entryKey]),
        priceChangeDirection: priceChangeByEntryKey?.[entryKey] ?? null,
        priceText: formatCurrency(price, currency, language),
      };
    });
  }, [currency, entries, language, movedByEntryKey, priceByEntryKey, priceChangeByEntryKey, snapshot.services, snapshot.skus, t]);

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
    setSuppressedHandleId(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    setActiveId(null);
    setActiveWidth(undefined);
    setSuppressedHandleId(String(over?.id ?? active.id));

    if (!over) {
      return;
    }

    onChange(reorderRankingEntries(entries, String(active.id), String(over.id)));
  }

  return (
    <div className="overflow-x-auto">
      <div
        aria-label={titleLabel ?? t('productRankingTitle')}
        className="min-w-[860px]"
        role="table"
      >
        {helperText ? (
          <p className="mb-3 text-sm text-muted-foreground">{helperText}</p>
        ) : null}
        <div className="border-b border-border/60 pb-3" role="rowgroup">
          <div
            className={cn(rankingGridClassName, 'px-3 text-sm font-medium text-foreground md:px-4')}
            role="row"
          >
            <div className="px-2" role="columnheader">
              <div className="grid grid-cols-[1.75rem_auto] items-center gap-3">
                <span aria-hidden="true" className="block size-7" />
                <span>{t('rankHeaderRank')}</span>
              </div>
            </div>
            <div className="px-2" role="columnheader">
              {t('rankHeaderName')}
            </div>
            <div className="px-2 text-center" role="columnheader">
              {t('rankHeaderType')}
            </div>
            <div className="px-2 text-center" role="columnheader">
              {t('rankHeaderPrice')}
            </div>
          </div>
        </div>

        <DndContext
          collisionDetection={closestCenter}
          onDragCancel={() => {
            setActiveId(null);
            setActiveWidth(undefined);
            setSuppressedHandleId(null);
          }}
          onDragEnd={handleDragEnd}
          onDragStart={handleDragStart}
          sensors={sensors}
        >
          <SortableContext
            items={rowModels.map((row) => row.id)}
            strategy={verticalListSortingStrategy}
          >
            <div
              className="divide-y divide-border/60"
              data-testid="ranking-list"
              ref={dragBoundaryRef}
              role="rowgroup"
            >
              {rowModels.map((row) => (
                <SortableRankingRow
                  id={row.id}
                  index={row.index}
                  key={row.id}
                  kindIcon={row.kindIcon}
                  kindLabel={row.kindLabel}
                  label={row.label}
                  movedFromBaseline={row.movedFromBaseline}
                  priceChangeDirection={row.priceChangeDirection}
                  priceText={row.priceText}
                  suppressedHandle={suppressedHandleId === row.id}
                  onHandleReset={() => {
                    setSuppressedHandleId((current) => (current === row.id ? null : current));
                  }}
                />
              ))}
            </div>
          </SortableContext>

          {typeof document !== 'undefined'
            ? createPortal(
                <DragOverlay dropAnimation={dropAnimation} modifiers={overlayModifiers}>
                  {activeRow ? (
                    <RankingRowCard
                      handle={<StaticGripHandle />}
                      index={activeRow.index}
                      kindIcon={activeRow.kindIcon}
                      kindLabel={activeRow.kindLabel}
                      label={activeRow.label}
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
    </div>
  );
}

function SortableRankingRow({
  id,
  index,
  kindIcon,
  label,
  kindLabel,
  movedFromBaseline,
  priceChangeDirection,
  priceText,
  suppressedHandle,
  onHandleReset,
}: RankingRowModel & {
  suppressedHandle: boolean;
  onHandleReset: () => void;
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
      onPointerLeave={onHandleReset}
      handle={
        <button
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${label}`}
          className="flex size-8 touch-none items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[background-color,color,transform,opacity] duration-150 ease-out group-hover/row:opacity-100 data-[dragging=true]:opacity-100 data-[suppressed=true]:opacity-0 hover:bg-accent/60 hover:text-foreground focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 active:scale-95 active:cursor-grabbing motion-reduce:transition-none"
          data-dragging={isDragging || undefined}
          data-suppressed={suppressedHandle || undefined}
          ref={setActivatorNodeRef}
          type="button"
        >
          <GripVertical aria-hidden="true" className="size-4 cursor-grab" />
        </button>
      }
      index={index}
      kindIcon={kindIcon}
      kindLabel={kindLabel}
      label={label}
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
  kindIcon: LucideIcon;
  kindLabel: string;
  label: string;
  movedFromBaseline: boolean;
  overlay?: boolean;
  priceChangeDirection: 'up' | 'down' | null;
  priceText: string;
};

const RankingRowCard = forwardRef<HTMLDivElement, RankingRowCardProps>(function RankingRowCard(
  {
    className,
    dragging = false,
    handle,
    index,
    kindIcon: KindIcon,
    kindLabel,
    label,
    movedFromBaseline,
    overlay = false,
    priceChangeDirection,
    priceText,
    style,
    ...props
  },
  ref,
) {
  return (
    <div
      {...props}
      className={cn(
        rankingGridClassName,
        'group/row px-3 py-4 transition-[background-color,box-shadow,opacity] duration-150 ease-out motion-reduce:transition-none md:px-4',
        overlay
          ? 'pointer-events-none rounded-2xl border border-border/70 bg-background/95 shadow-[0_24px_80px_-28px_rgba(39,27,18,0.35)] backdrop-blur-[2px]'
          : movedFromBaseline
            ? 'bg-muted/60 hover:bg-muted/70'
            : 'bg-transparent hover:bg-white/45',
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
      <div className="px-2" role="cell">
        <div className="grid grid-cols-[1.75rem_auto] items-center gap-3">
          <div className="flex items-center justify-center">{handle}</div>
          <div className="text-lg font-medium tracking-tight text-foreground tabular-nums">
            #{index + 1}
          </div>
        </div>
      </div>
      <div className="min-w-0 px-2" role="cell">
        <p className="truncate text-[1.05rem] font-medium tracking-tight text-foreground">{label}</p>
      </div>
      <div className="px-2 text-center" role="cell">
        <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <span className="inline-flex size-8 items-center justify-center rounded-full border border-border/70 bg-background text-primary">
            <KindIcon aria-hidden="true" className="size-3.5" />
          </span>
          <span>{kindLabel}</span>
        </div>
      </div>
      <div className="px-2 text-lg font-medium tracking-tight text-foreground tabular-nums" role="cell">
        <div className="grid grid-cols-[0.75rem_auto_0.75rem] items-center">
          <span aria-hidden="true" />
          <span className="text-center">{priceText}</span>
          <span className="flex justify-end">
            {priceChangeDirection ? (
              <Triangle
                aria-hidden="true"
                className={cn(
                  '!size-3 fill-current',
                  priceChangeDirection === 'up' ? 'text-emerald-600' : 'rotate-180 text-red-600',
                )}
              />
            ) : null}
          </span>
        </div>
      </div>
    </div>
  );
});

function StaticGripHandle() {
  return (
    <div className="flex size-8 items-center justify-center rounded-md bg-white/70 text-muted-foreground shadow-sm">
      <GripVertical aria-hidden="true" className="size-4" />
    </div>
  );
}
