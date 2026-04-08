import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useState } from 'react';
import type { StockReportSubmission } from '@shared/inventory';
import type { SenaLeadTimeVariabilityClass } from '@shared/sena';
import {
  deriveLeadTimeVariabilityClass,
  leadTimeVariabilityLabel,
  leadTimeVariabilityOptions,
} from '@shared/sena-lead-time';
import {
  Check,
  PackageCheck,
  Save,
  X,
} from 'lucide-react';
import { MeasuredTileGrid } from '@/components/system/measured-tile-grid';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { overviewDrawerBandIconMap } from '@/lib/icon-mappings';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { statusPillClassName } from '@/lib/state-tones';
import { cn } from '@/lib/utils';
import {
  ActionSheetField,
  actionSheetInputClassName,
  actionSheetSelectTriggerClassName,
  actionSheetTextareaClassName,
} from '@/routes/detail-action-sheet';
import { createEmptyObservationInput, hasStructuredObservationSignal } from '@/routes/observation-payload';
import { useInventory } from '@/state/inventory';
import type { OverviewDrawerBandId, OverviewTask, OverviewTaskDrawerMode } from './view-model';

function initialObservedAt(value: string | null) {
  if (value) {
    return new Date(value).toISOString().slice(0, 16);
  }
  return new Date().toISOString().slice(0, 16);
}

function initialExpectedArrivalDate(value: string | null) {
  if (value) {
    return new Date(value).toISOString().slice(0, 10);
  }
  const nextWeek = new Date();
  nextWeek.setDate(nextWeek.getDate() + 7);
  return nextWeek.toISOString().slice(0, 10);
}

function daysBetween(start: string, endDate: string) {
  const startTime = new Date(start).getTime();
  const endTime = new Date(`${endDate}T12:00:00`).getTime();
  if (Number.isNaN(startTime) || Number.isNaN(endTime)) {
    return null;
  }
  return Math.max(0, Math.round((endTime - startTime) / 86_400_000));
}

function leadTimeHintFromTaskInputs({
  observedAt,
  skuId,
  uncertaintyDays,
  useLeadTimeEstimate,
  variabilityClass,
  expectedArrivalDate,
}: {
  observedAt: string;
  skuId: string;
  uncertaintyDays: string;
  useLeadTimeEstimate: boolean;
  variabilityClass: SenaLeadTimeVariabilityClass | '';
  expectedArrivalDate: string;
}) {
  if (!useLeadTimeEstimate) {
    return [];
  }

  const typicalDays = daysBetween(observedAt, expectedArrivalDate);
  if (typicalDays == null) {
    return [];
  }

  const uncertainty = uncertaintyDays ? Number(uncertaintyDays) : 0;
  const lowDays = Math.max(0.5, typicalDays - uncertainty);
  const highDays = Math.max(lowDays, typicalDays + uncertainty);

  return [
    {
      skuId,
      typicalDays,
      lowDays,
      highDays,
      variabilityClass: deriveLeadTimeVariabilityClass({
        lowDays,
        highDays,
        variabilityClass: variabilityClass || null,
      }),
    },
  ];
}

const DRAWER_MODE_OPTIONS: Array<{
  value: OverviewTaskDrawerMode;
  title: string;
  description: string;
}> = [
  { value: 'not_ordered', title: 'Not ordered yet', description: 'Leave this task open' },
  { value: 'ordered_waiting', title: 'Ordered, waiting', description: 'Record the open order' },
  { value: 'eta_changed', title: 'ETA changed', description: 'Update the arrival date' },
  { value: 'goods_received', title: 'Goods received', description: 'Log the receipt' },
];

const DRAWER_MIN_WIDTH = 640;
const DRAWER_MAX_WIDTH = 1040;
const DRAWER_DEFAULT_WIDTH = 672;
const DRAWER_VIEWPORT_GUTTER = 16;

function clampDrawerWidth(nextWidth: number) {
  if (typeof window === 'undefined') {
    return Math.min(DRAWER_MAX_WIDTH, Math.max(DRAWER_MIN_WIDTH, nextWidth));
  }

  const viewportMaxWidth = Math.max(360, window.innerWidth - DRAWER_VIEWPORT_GUTTER);
  return Math.max(
    Math.min(DRAWER_MIN_WIDTH, viewportMaxWidth),
    Math.min(Math.max(nextWidth, DRAWER_MIN_WIDTH), Math.min(DRAWER_MAX_WIDTH, viewportMaxWidth)),
  );
}

function drawerCanvasClassName() {
  return 'rounded-[1.8rem] border border-border/70 bg-white/84 px-6 py-6 shadow-[0_1px_0_rgba(255,255,255,0.9)]';
}

function drawerBandClassName() {
  return 'border-t border-border/50 py-5';
}

function drawerModeLabel(mode: OverviewTaskDrawerMode) {
  return DRAWER_MODE_OPTIONS.find((option) => option.value === mode)?.title ?? 'Update';
}

function drawerModeSummary(mode: OverviewTaskDrawerMode) {
  switch (mode) {
    case 'goods_received':
      return 'Banji will log the receipt and update stock.';
    case 'ordered_waiting':
      return 'Banji will save the order signal and the current arrival window.';
    case 'eta_changed':
      return 'Banji will refresh the arrival window for this task.';
    case 'not_ordered':
      return 'Banji will keep this task open until the order state changes.';
  }
}

function DrawerBand({
  bandId,
  children,
  className,
  title,
}: {
  bandId: OverviewDrawerBandId;
  children: ReactNode;
  className?: string;
  title: string;
}) {
  const Icon = overviewDrawerBandIconMap[bandId];

  return (
    <section className={cn(drawerBandClassName(), className)} data-band-id={bandId}>
      <div className="mb-3 flex items-center gap-2.5">
        <Icon className="size-4 text-primary" />
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {title}
        </p>
      </div>
      {children}
    </section>
  );
}

function DrawerBandField({
  children,
  description,
  error,
  label,
  showLabel = true,
}: {
  children: ReactNode;
  description?: ReactNode;
  error?: string | null;
  label: string;
  showLabel?: boolean;
}) {
  if (!showLabel) {
    return children;
  }

  return (
    <ActionSheetField description={description} error={error} label={label}>
      {children}
    </ActionSheetField>
  );
}

function DrawerModeTile({
  description,
  measure = false,
  selected,
  title,
}: {
  description: string;
  measure?: boolean;
  selected: boolean;
  title: string;
}) {
  return (
    <div
      data-mode-measure={measure ? 'true' : undefined}
      className={cn(
        'flex min-h-[4.15rem] items-start gap-3 rounded-[1.15rem] border px-4 py-3 text-left transition-all',
        measure ? 'w-max max-w-none min-w-[15rem]' : 'w-full min-w-0',
        selected
          ? 'border-primary/35 bg-transparent text-foreground shadow-none'
          : cn('border-border/70 bg-transparent text-foreground/95 shadow-none hover:shadow-none', rowHoverClassName),
      )}
    >
      <div
        aria-hidden="true"
        className={cn(
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[6px] border transition-[border-color,background-color,box-shadow]',
          selected
            ? 'border-primary bg-primary text-primary-foreground'
            : 'border-muted-foreground/45 bg-card text-transparent',
        )}
      >
        <Check className="size-3.5" />
      </div>
      <div className="min-w-0">
        <span className="block text-[0.92rem] font-semibold leading-5 tracking-[-0.02em]">{title}</span>
        <span className="mt-1 block text-[0.73rem] leading-4.5 text-muted-foreground">{description}</span>
      </div>
    </div>
  );
}

function RecommendedOrderPanel({ task }: { task: OverviewTask }) {
  const recommendation = task.reorderRecommendation;

  return (
    <div className="mt-5 rounded-[1.35rem] border border-border/65 bg-background/75 px-4 py-4 shadow-[0_1px_0_rgba(255,255,255,0.85)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Recommended order
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-[-0.04em] text-foreground">
            {recommendation.recommendationIssued || recommendation.optionalOrderLabel
              ? recommendation.recommendedUnitsLabel
              : recommendation.quietLabel}
          </p>
        </div>
        {recommendation.recommendationIssued ? (
          <span className="rounded-full border border-primary/25 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            {recommendation.needProbabilityValueLabel} likely
          </span>
        ) : null}
      </div>
      <div className="mt-3 grid gap-1 text-sm leading-6 text-muted-foreground">
        <p>{recommendation.likelyRangeLabel}</p>
        {recommendation.recommendationIssued ? <p>{recommendation.needProbabilityLabel}</p> : null}
        <p>Based on on hand + in transit + lead time.</p>
      </div>
    </div>
  );
}

export function OverviewTaskDrawer({
  open,
  task,
  onOpenChange,
}: {
  open: boolean;
  task: OverviewTask | null;
  onOpenChange: (open: boolean) => void;
}) {
  const { ingestSenaObservation, isSaving, submitLegacyReport, triggerSenaRun } = useInventory();
  const [mode, setMode] = useState<OverviewTaskDrawerMode>('not_ordered');
  const [observedAt, setObservedAt] = useState(initialObservedAt(null));
  const [notes, setNotes] = useState('');
  const [orderedQuantity, setOrderedQuantity] = useState('');
  const [expectedArrivalDate, setExpectedArrivalDate] = useState(initialExpectedArrivalDate(null));
  const [uncertaintyDays, setUncertaintyDays] = useState('');
  const [variabilityClass, setVariabilityClass] = useState<SenaLeadTimeVariabilityClass | ''>('');
  const [useLeadTimeEstimate, setUseLeadTimeEstimate] = useState(true);
  const [receivedQuantity, setReceivedQuantity] = useState('');
  const [receivedCost, setReceivedCost] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [drawerWidth, setDrawerWidth] = useState(() => clampDrawerWidth(DRAWER_DEFAULT_WIDTH));

  useEffect(() => {
    if (!task) {
      return;
    }
    setMode(task.defaultDrawerMode);
    setObservedAt(initialObservedAt(task.defaultDrawerMode === 'goods_received' ? null : task.latestObservationAt));
    setNotes('');
    setOrderedQuantity(task.recentOrderQuantity != null ? String(Math.round(task.recentOrderQuantity)) : String(task.suggestedOrderQuantity || ''));
    setExpectedArrivalDate(initialExpectedArrivalDate(task.expectedArrivalDate));
    setUncertaintyDays(task.leadTimeStdDays != null ? String(Math.max(1, Math.round(task.leadTimeStdDays))) : '2');
    setVariabilityClass(task.variabilityClass ?? '');
    setUseLeadTimeEstimate(true);
    setReceivedQuantity(task.recentReceiptQuantity != null ? String(Math.round(task.recentReceiptQuantity)) : '');
    setReceivedCost(task.costPerUnit ? String(task.costPerUnit) : '');
    setError(null);
  }, [task]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleResize = () => setDrawerWidth((currentWidth) => clampDrawerWidth(currentWidth));

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (!task) {
    return null;
  }

  const activeTask = task;
  const baselineSnapshot = {
    skuId: activeTask.skuId,
    unitsInStock: Math.max(0, Math.round(activeTask.currentStock)),
    costPerUnit: activeTask.costPerUnit,
    productPrice: activeTask.productPrice,
  };

  async function submit() {
    setError(null);
    const observedAtIso = new Date(observedAt).toISOString();
    const senaPayload = createEmptyObservationInput({
      observedAt: observedAtIso,
      notes: notes.trim() || null,
    });
    let legacyPayload: StockReportSubmission | null = null;

    if (mode === 'ordered_waiting' || mode === 'eta_changed') {
      senaPayload.orderSignals = [
        {
          skuId: activeTask.skuId,
          orderPlaced: true,
          receiptArrived: false,
          approximateOrderQuantity: orderedQuantity ? Number(orderedQuantity) : activeTask.suggestedOrderQuantity || null,
          approximateReceiptQuantity: null,
        },
      ];
      senaPayload.leadTimeHints = leadTimeHintFromTaskInputs({
        observedAt,
        skuId: activeTask.skuId,
        uncertaintyDays,
        useLeadTimeEstimate,
        variabilityClass,
        expectedArrivalDate,
      });
    }

    if (mode === 'goods_received') {
      const receivedUnits = Number(receivedQuantity);
      const updatedUnitsInStock = Math.max(0, Math.round(activeTask.currentStock) + receivedUnits);
      const nextCost = receivedCost ? Number(receivedCost) : activeTask.costPerUnit;
      legacyPayload = {
        reportedAt: observedAtIso,
        skuObservations: [
          {
            skuId: activeTask.skuId,
            unitsInStock: updatedUnitsInStock,
            costPerUnit: nextCost,
            productPrice: activeTask.productPrice,
            restockIncluded: true,
          },
        ],
        notes: notes.trim() || null,
      };
      senaPayload.stockSnapshot = [
        {
          ...baselineSnapshot,
          unitsInStock: updatedUnitsInStock,
          costPerUnit: nextCost,
        },
      ];
      senaPayload.orderSignals = [
        {
          skuId: activeTask.skuId,
          orderPlaced: false,
          receiptArrived: true,
          approximateOrderQuantity: null,
          approximateReceiptQuantity: receivedUnits,
        },
      ];
    }

    try {
      if (!hasStructuredObservationSignal(senaPayload)) {
        onOpenChange(false);
        return;
      }
      if (legacyPayload) {
        await submitLegacyReport(legacyPayload);
      }
      await ingestSenaObservation(senaPayload);
      await triggerSenaRun({ algorithmVersion: 'sena-analysis-v3' });
      onOpenChange(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Banji could not save this update. Try again.');
    }
  }

  const receiptPreviewQuantity = receivedQuantity ? Number(receivedQuantity) : 0;
  const receiptPreviewNextStock = Math.max(0, Math.round(task.currentStock) + receiptPreviewQuantity);
  const submitLabel =
    mode === 'goods_received'
      ? 'Confirm inventory update'
      : mode === 'not_ordered'
        ? 'Save note'
        : 'Save and refresh';
  const RealLifeIcon = overviewDrawerBandIconMap.real_life;
  const submitDisabled =
    isSaving ||
    (mode === 'ordered_waiting' && !orderedQuantity) ||
    ((mode === 'ordered_waiting' || mode === 'eta_changed') && !expectedArrivalDate) ||
    (mode === 'goods_received' && (!receivedQuantity || Number(receivedQuantity) <= 0));

  function startDrawerResize(event: ReactPointerEvent<HTMLDivElement>) {
    if (typeof window === 'undefined') {
      return;
    }

    event.preventDefault();

    const pointerId = event.pointerId;
    const startX = event.clientX;
    const startWidth = drawerWidth;
    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const delta = startX - moveEvent.clientX;
      setDrawerWidth(clampDrawerWidth(startWidth + delta));
    };

    const stopResize = () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    const handlePointerUp = () => {
      stopResize();
    };

    event.currentTarget.setPointerCapture(pointerId);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full max-w-none gap-0 overflow-hidden border-l border-border/70 bg-[#f8f4ef] px-0 shadow-[0_28px_72px_rgba(48,31,20,0.18)]"
        showCloseButton={false}
        style={{ width: `${drawerWidth}px`, maxWidth: `calc(100vw - ${DRAWER_VIEWPORT_GUTTER}px)` }}
      >
        <div
          aria-label="Resize drawer"
          className="absolute inset-y-0 left-0 z-30 w-5 cursor-ew-resize touch-none"
          role="separator"
          tabIndex={-1}
          onPointerDown={startDrawerResize}
        />

        <SheetHeader className="sticky top-0 z-20 gap-4 border-b border-border/40 bg-[#f8f4ef]/96 px-8 py-7 backdrop-blur-sm">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <SheetTitle className="text-[2rem] leading-tight tracking-[-0.04em]">{task.skuName}</SheetTitle>
                <span
                  className={cn(
                    'inline-flex items-center self-center rounded-full border px-2.5 py-1 text-[0.72rem] font-medium',
                    statusPillClassName(task.statusTone),
                  )}
                >
                  {task.stateLabel}
                </span>
              </div>
              <SheetDescription className="mt-3 max-w-2xl text-[0.98rem] leading-7">
                {task.whyNow} · {task.serviceImpact} · {task.etaLabel}
              </SheetDescription>
              <div className="mt-4 flex flex-wrap gap-2.5">
                {task.heartbeat.map((line) => (
                  <div
                    key={line}
                    className="rounded-full border border-border/65 bg-white/72 px-3.5 py-2 text-sm text-foreground shadow-[0_1px_0_rgba(255,255,255,0.95)]"
                  >
                    {line}
                  </div>
                ))}
              </div>
            </div>

            <SheetClose className="mt-1 inline-flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary/65 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50">
              <X className="size-5" />
              <span className="sr-only">Close</span>
            </SheetClose>
          </div>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="px-8 py-6 pb-44">
            <section className={drawerCanvasClassName()} data-band-id="real_life">
              <div className="flex items-center gap-2">
                <RealLifeIcon className="size-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  What Happened In Real Life
                </h2>
              </div>

              <div className="mt-5">
                <MeasuredTileGrid
                  items={DRAWER_MODE_OPTIONS}
                  maxColumns={2}
                  minColumns={2}
                  renderGrid={({ columnCount, gridRef }) => (
                    <div ref={gridRef}>
                      <ToggleGroup
                        className="grid w-full gap-3 rounded-none bg-transparent p-0"
                        spacing={2}
                        style={{
                          gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
                        }}
                        type="single"
                        value={mode}
                        onValueChange={(nextValue) => {
                          if (nextValue) {
                            setMode(nextValue as OverviewTaskDrawerMode);
                          }
                        }}
                      >
                        {DRAWER_MODE_OPTIONS.map((option) => (
                          <ToggleGroupItem
                            key={option.value}
                            className="h-auto rounded-none border-none bg-transparent p-0 text-left shadow-none hover:bg-transparent data-[state=on]:bg-transparent data-[state=on]:shadow-none"
                            disableHoverSurface
                            disableSelectedShadow
                            value={option.value}
                          >
                            <DrawerModeTile
                              description={option.description}
                              selected={mode === option.value}
                              title={option.title}
                            />
                          </ToggleGroupItem>
                        ))}
                      </ToggleGroup>
                    </div>
                  )}
                  renderMeasureItem={(option) => (
                    <DrawerModeTile
                      key={`${option.value}-measure`}
                      description={option.description}
                      measure
                      selected={mode === option.value}
                      title={option.title}
                    />
                  )}
                />
              </div>

              <RecommendedOrderPanel task={task} />

              <DrawerBand bandId="timing" className="mt-6" title={mode === 'goods_received' ? 'Receipt timing' : 'Timing'}>
                <div className={cn(mode === 'goods_received' || mode === 'not_ordered' ? 'grid gap-5' : 'grid gap-5 md:grid-cols-2')}>
                  <ActionSheetField
                    description={mode === 'goods_received' ? 'Choose when the receipt was confirmed.' : 'Choose when you confirmed this update.'}
                    label={mode === 'goods_received' ? 'Received date/time' : 'Observed at'}
                  >
                    <Input
                      aria-label={mode === 'goods_received' ? 'Received date/time' : 'Observed at'}
                      className={actionSheetInputClassName}
                      required
                      type="datetime-local"
                      value={observedAt}
                      onChange={(event) => setObservedAt(event.target.value)}
                    />
                  </ActionSheetField>

                  {(mode === 'ordered_waiting' || mode === 'eta_changed') ? (
                    <ActionSheetField description="Use the supplier's current best estimate." label="Expected arrival date">
                      <Input
                        aria-label="Expected arrival date"
                        className={actionSheetInputClassName}
                        type="date"
                        value={expectedArrivalDate}
                        onChange={(event) => setExpectedArrivalDate(event.target.value)}
                      />
                    </ActionSheetField>
                  ) : null}
                </div>
              </DrawerBand>

              {(mode === 'ordered_waiting' || mode === 'eta_changed') ? (
                <>
                  <DrawerBand bandId="order_shape" title="Order shape">
                    <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,0.75fr)_minmax(0,1fr)]">
                      <ActionSheetField
                        description={
                          task.reorderRecommendation.recommendationIssued
                            ? `${task.reorderRecommendation.recommendedOrderLabel}. Edit if the supplier batch differs.`
                            : task.reorderRecommendation.optionalOrderLabel
                              ? `${task.reorderRecommendation.quietLabel}. Edit if the supplier batch differs.`
                            : 'Enter the quantity already ordered.'
                        }
                        label="Ordered quantity"
                      >
                        <Input
                          aria-label="Ordered quantity"
                          className={actionSheetInputClassName}
                          min="0"
                          step="1"
                          type="number"
                          value={orderedQuantity}
                          onChange={(event) => setOrderedQuantity(event.target.value)}
                        />
                      </ActionSheetField>
                      <ActionSheetField description="Add the likely plus/minus range around the arrival date." label="Uncertainty ± days">
                        <Input
                          aria-label="Uncertainty ± days"
                          className={actionSheetInputClassName}
                          min="0"
                          step="1"
                          type="number"
                          value={uncertaintyDays}
                          onChange={(event) => setUncertaintyDays(event.target.value)}
                        />
                      </ActionSheetField>
                      <ActionSheetField
                        description="Choose how steady or variable supplier timing has been."
                        label="Variability"
                      >
                        <Select
                          value={variabilityClass || '__none__'}
                          onValueChange={(value) =>
                            setVariabilityClass(value === '__none__' ? '' : (value as SenaLeadTimeVariabilityClass))
                          }
                        >
                          <SelectTrigger aria-label="Variability" className={actionSheetSelectTriggerClassName}>
                            <SelectValue placeholder="Choose variability" />
                          </SelectTrigger>
                          <SelectContent align="start">
                            <SelectItem value="__none__">Choose variability</SelectItem>
                            {leadTimeVariabilityOptions().map((option) => (
                              <SelectItem key={option} value={option}>
                                {leadTimeVariabilityLabel(option)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </ActionSheetField>
                    </div>
                  </DrawerBand>

                  <DrawerBand bandId="optional_learning" title="Optional learning">
                    <label className="flex items-start gap-3 rounded-[1.2rem] border border-border/70 bg-background/70 px-4 py-3 text-sm text-foreground">
                      <Checkbox
                        checked={useLeadTimeEstimate}
                        className="mt-0.5"
                        onCheckedChange={(checked) => setUseLeadTimeEstimate(checked === true)}
                      />
                      <span>Use this update to refine future lead-time estimates.</span>
                    </label>
                  </DrawerBand>
                </>
              ) : null}

              {mode === 'goods_received' ? (
                <>
                  <DrawerBand bandId="receipt_details" title="Receipt details">
                    <div className="grid gap-5 md:grid-cols-2">
                      <ActionSheetField description="Enter the units that actually arrived." label="Received quantity">
                        <Input
                          aria-label="Received quantity"
                          className={actionSheetInputClassName}
                          min="0"
                          step="1"
                          type="number"
                          value={receivedQuantity}
                          onChange={(event) => setReceivedQuantity(event.target.value)}
                        />
                      </ActionSheetField>
                      <ActionSheetField description="Only update this if the landed cost changed." label="Received cost if changed">
                        <Input
                          aria-label="Received cost if changed"
                          className={actionSheetInputClassName}
                          min="0"
                          step="0.01"
                          type="number"
                          value={receivedCost}
                          onChange={(event) => setReceivedCost(event.target.value)}
                        />
                      </ActionSheetField>
                    </div>
                  </DrawerBand>

                  <DrawerBand bandId="preview" title="Preview">
                    <div className="rounded-[1.3rem] border border-emerald-200 bg-emerald-50/85 px-4 py-4 text-sm leading-6 text-emerald-900">
                      Banji will add +{receiptPreviewQuantity || 0} units, close this receipt task, and move inventory to {receiptPreviewNextStock} units.
                    </div>
                  </DrawerBand>
                </>
              ) : null}

              <DrawerBand bandId="note" title={mode === 'ordered_waiting' || mode === 'eta_changed' ? 'Supplier note' : 'Note'}>
                <DrawerBandField
                  description={
                    mode === 'ordered_waiting' || mode === 'eta_changed'
                      ? 'Add context only if it changes the supplier follow-up.'
                      : 'Add context only if someone will need it later.'
                  }
                  label={mode === 'ordered_waiting' || mode === 'eta_changed' ? 'Supplier note' : 'Note'}
                  showLabel={false}
                >
                  <Textarea
                    aria-label={mode === 'ordered_waiting' || mode === 'eta_changed' ? 'Supplier note' : 'Note'}
                    className={cn(
                      actionSheetTextareaClassName,
                      mode === 'not_ordered' ? 'min-h-24' : '',
                      mode === 'goods_received' ? 'min-h-28' : '',
                    )}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </DrawerBandField>
              </DrawerBand>

              <DrawerBand bandId="next_steps" title="What Banji will do next">
                <div className="rounded-[1.35rem] border border-border/65 bg-secondary/35 px-4 py-4">
                  <div className="grid gap-3">
                    {task.nextSteps.map((line) => (
                      <div key={line} className="flex items-start gap-3 text-sm leading-6 text-foreground">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary/70" />
                        <span>{line}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </DrawerBand>

              {error ? (
                <p className="mt-5 rounded-[1.25rem] border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </section>
          </div>
        </div>

        <SheetFooter className="sticky bottom-0 z-20 border-t border-border/50 bg-[#f8f4ef]/96 px-8 py-5 shadow-[0_-10px_24px_rgba(48,31,20,0.06)] backdrop-blur-sm">
          <div className="flex w-full flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 sm:max-w-[18rem]">
              <p className="text-sm font-medium text-foreground">Mode: {drawerModeLabel(mode)}</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{drawerModeSummary(mode)}</p>
            </div>
            <Button
              className="w-full sm:w-auto sm:min-w-[15rem]"
              disabled={submitDisabled}
              size="lg"
              type="button"
              onClick={() => void submit()}
            >
              {mode === 'goods_received' ? <PackageCheck className="size-4" /> : <Save className="size-4" />}
              {isSaving ? 'Saving…' : submitLabel}
            </Button>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
