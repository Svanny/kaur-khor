import type { HTMLAttributes, ReactNode } from 'react';
import { forwardRef, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { RankingEntry } from '@shared/inventory';
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
import { GripVertical } from 'lucide-react';
import { EditorHeader } from '@/components/system/editor';
import {
  WorkspacePage,
  WorkspacePanel,
} from '@/components/system/workspace';
import { formatCurrency, rankLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import { clampOverlayTransformToBoundary } from './ranking-drag';
import { buildRankingEntryId, reorderRankingEntries } from './ranking-order';

type RankingRowModel = {
  id: string;
  index: number;
  label: string;
  kindLabel: string;
  priceText: string;
};

const rankingGridClassName =
  'grid grid-cols-[128px_minmax(0,1.55fr)_minmax(168px,0.85fr)] gap-4';

const dropAnimation = {
  duration: 160,
  easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
};

export function RankingRoute() {
  const { snapshot, persistRanking, isSaving } = useInventory();
  const { currency, language, t } = usePreferences();
  const [entries, setEntries] = useState<RankingEntry[]>([]);
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

  useEffect(() => {
    if (snapshot?.ranking) {
      setEntries(snapshot.ranking);
    }
  }, [snapshot]);

  const rowModels = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    return entries.map((entry, index) => {
      const label = rankLabel(entry, snapshot.skus, snapshot.services);
      const price =
        entry.entryType === 'service'
          ? snapshot.services.find((service) => service.serviceId === entry.entryId)?.price ?? 0
          : snapshot.skus.find((sku) => sku.skuId === entry.entryId)?.productPrice ?? 0;

      return {
        id: buildRankingEntryId(entry),
        index,
        label,
        kindLabel: entry.entryType === 'service' ? t('serviceLabel') : t('skuLabel'),
        priceText: formatCurrency(price, currency, language),
      };
    });
  }, [currency, entries, language, snapshot, t]);

  const activeRow = rowModels.find((row) => row.id === activeId) ?? null;
  const overlayModifiers = useMemo<Modifier[]>(
    () =>
      [
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

  if (!snapshot) {
    return null;
  }

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

    setEntries((current) =>
      reorderRankingEntries(current, String(active.id), String(over.id)),
    );
  }

  return (
    <WorkspacePage>
      <EditorHeader
        cancelLabel={t('resetAction')}
        isSaving={isSaving}
        onCancel={() => setEntries(snapshot.ranking)}
        onSave={() => {
          void persistRanking(entries);
        }}
        saveLabel={t('saveRankingAction')}
      />

      <div className="grid gap-6">
        <WorkspacePanel description={t('merchandisingPriorityNote')} title={t('productRankingTitle')}>
          <div className="overflow-x-auto">
            <div
              aria-label={t('productRankingTitle')}
              className="min-w-[720px]"
              role="table"
            >
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
                  <div className="px-2" role="columnheader">
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
                        kindLabel={row.kindLabel}
                        label={row.label}
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
                            kindLabel={activeRow.kindLabel}
                            label={activeRow.label}
                            overlay
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
        </WorkspacePanel>
      </div>
    </WorkspacePage>
  );
}

function SortableRankingRow({
  id,
  index,
  label,
  kindLabel,
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
      kindLabel={kindLabel}
      label={label}
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
  kindLabel: string;
  label: string;
  overlay?: boolean;
  priceText: string;
};

const RankingRowCard = forwardRef<HTMLDivElement, RankingRowCardProps>(function RankingRowCard(
  { className, dragging = false, handle, index, kindLabel, label, overlay = false, priceText, style, ...props },
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
        <p className="text-sm text-muted-foreground">{kindLabel}</p>
      </div>
      <div className="px-2 text-lg font-medium tracking-tight text-foreground tabular-nums" role="cell">
        {priceText}
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
