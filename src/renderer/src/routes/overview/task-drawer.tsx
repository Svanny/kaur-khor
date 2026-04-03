import { useEffect, useState } from 'react';
import type { StockReportSubmission } from '@shared/inventory';
import type { SenaLeadTimeVariabilityClass, SenaObservationInput } from '@shared/sena';
import {
  deriveLeadTimeVariabilityClass,
  leadTimeVariabilityDescription,
  leadTimeVariabilityLabel,
  leadTimeVariabilityOptions,
} from '@shared/sena-lead-time';
import { CheckCircle2, PackageCheck, Save, Truck, Undo2 } from 'lucide-react';
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
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  ActionSheetField,
  actionSheetInputClassName,
  actionSheetSelectTriggerClassName,
  actionSheetTextareaClassName,
} from '@/routes/detail-action-sheet';
import { useInventory } from '@/state/inventory';
import type { OverviewTask, OverviewTaskDrawerMode } from './view-model';

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

function sectionClassName() {
  return 'rounded-[1.6rem] border border-border/70 bg-white/90 p-5 shadow-[0_12px_28px_rgba(48,31,20,0.06)]';
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

  if (!task) {
    return null;
  }

  const baselineSnapshot = {
    skuId: task.skuId,
    unitsInStock: Math.max(0, Math.round(task.currentStock)),
    costPerUnit: task.costPerUnit,
    productPrice: task.productPrice,
  };

  async function submit() {
    setError(null);
    const observedAtIso = new Date(observedAt).toISOString();
    const senaPayload: SenaObservationInput = {
      observedAt: observedAtIso,
      stockSnapshot: [baselineSnapshot],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      notes: notes.trim() || null,
    };
    let legacyPayload: StockReportSubmission | null = null;

    if (mode === 'ordered_waiting' || mode === 'eta_changed') {
      senaPayload.orderSignals = [
        {
          skuId: task.skuId,
          orderPlaced: true,
          receiptArrived: false,
          approximateOrderQuantity: orderedQuantity ? Number(orderedQuantity) : task.suggestedOrderQuantity || null,
          approximateReceiptQuantity: null,
        },
      ];
      senaPayload.leadTimeHints = leadTimeHintFromTaskInputs({
        observedAt,
        skuId: task.skuId,
        uncertaintyDays,
        useLeadTimeEstimate,
        variabilityClass,
        expectedArrivalDate,
      });
    }

    if (mode === 'goods_received') {
      const receivedUnits = Number(receivedQuantity);
      const updatedUnitsInStock = Math.max(0, Math.round(task.currentStock) + receivedUnits);
      const nextCost = receivedCost ? Number(receivedCost) : task.costPerUnit;
      legacyPayload = {
        reportedAt: observedAtIso,
        skuObservations: [
          {
            skuId: task.skuId,
            unitsInStock: updatedUnitsInStock,
            costPerUnit: nextCost,
            productPrice: task.productPrice,
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
          skuId: task.skuId,
          orderPlaced: false,
          receiptArrived: true,
          approximateOrderQuantity: null,
          approximateReceiptQuantity: receivedUnits,
        },
      ];
    }

    try {
      if (legacyPayload) {
        await submitLegacyReport(legacyPayload);
      }
      await ingestSenaObservation(senaPayload);
      await triggerSenaRun({ algorithmVersion: 'sena-analysis-v2' });
      onOpenChange(false);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Task update failed.');
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
  const submitDisabled =
    isSaving ||
    (mode === 'ordered_waiting' && !orderedQuantity) ||
    ((mode === 'ordered_waiting' || mode === 'eta_changed') && !expectedArrivalDate) ||
    (mode === 'goods_received' && (!receivedQuantity || Number(receivedQuantity) <= 0));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-[42rem] gap-0 overflow-y-auto border-l border-border/70 bg-[#f8f4ef] px-0 shadow-[0_28px_72px_rgba(48,31,20,0.18)] sm:max-w-[42rem]">
        <SheetHeader className="gap-3 border-b border-border/60 px-8 py-7">
          <SheetTitle className="text-2xl tracking-[-0.03em]">{task.skuName}</SheetTitle>
          <SheetDescription className="max-w-2xl text-base leading-7">
            {task.whyNow} · {task.serviceImpact.toLowerCase()} · {task.etaLabel}
          </SheetDescription>
        </SheetHeader>

        <div className="grid gap-5 px-8 py-7">
          <section className={sectionClassName()}>
            <div className="mb-4 flex items-center gap-2">
              <CheckCircle2 className="size-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Why Banji Is Asking
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {task.heartbeat.map((line) => (
                <div
                  key={line}
                  className="rounded-full border border-border/70 bg-background/80 px-3 py-2 text-sm text-foreground"
                >
                  {line}
                </div>
              ))}
            </div>
          </section>

          <section className={sectionClassName()}>
            <div className="mb-4 flex items-center gap-2">
              <Truck className="size-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                What Happened In Real Life
              </h2>
            </div>

            <ToggleGroup
              className="mb-5 grid w-full grid-cols-2 gap-2 rounded-[1.5rem] bg-transparent p-0 md:grid-cols-4"
              spacing={1}
              type="single"
              value={mode}
              onValueChange={(nextValue) => {
                if (nextValue) {
                  setMode(nextValue as OverviewTaskDrawerMode);
                }
              }}
            >
              <ToggleGroupItem className="h-auto min-h-16 flex-col items-start rounded-[1.2rem] border border-border/70 px-4 py-3 text-left" value="not_ordered">
                <span className="font-medium">Not ordered yet</span>
                <span className="text-xs text-muted-foreground">Keep the task visible</span>
              </ToggleGroupItem>
              <ToggleGroupItem className="h-auto min-h-16 flex-col items-start rounded-[1.2rem] border border-border/70 px-4 py-3 text-left" value="ordered_waiting">
                <span className="font-medium">Ordered, waiting</span>
                <span className="text-xs text-muted-foreground">Log the open order</span>
              </ToggleGroupItem>
              <ToggleGroupItem className="h-auto min-h-16 flex-col items-start rounded-[1.2rem] border border-border/70 px-4 py-3 text-left" value="eta_changed">
                <span className="font-medium">ETA changed</span>
                <span className="text-xs text-muted-foreground">Refresh the arrival window</span>
              </ToggleGroupItem>
              <ToggleGroupItem className="h-auto min-h-16 flex-col items-start rounded-[1.2rem] border border-border/70 px-4 py-3 text-left" value="goods_received">
                <span className="font-medium">Goods received</span>
                <span className="text-xs text-muted-foreground">Confirm the inventory event</span>
              </ToggleGroupItem>
            </ToggleGroup>

            <div className="grid gap-5">
              <ActionSheetField label={mode === 'goods_received' ? 'Received date/time' : 'Observed at'}>
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
                <>
                  <ActionSheetField label="Ordered quantity">
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
                  <ActionSheetField label="Expected arrival date">
                    <Input
                      aria-label="Expected arrival date"
                      className={actionSheetInputClassName}
                      type="date"
                      value={expectedArrivalDate}
                      onChange={(event) => setExpectedArrivalDate(event.target.value)}
                    />
                  </ActionSheetField>
                  <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <ActionSheetField label="Uncertainty ± days">
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
                      description={
                        variabilityClass
                          ? leadTimeVariabilityDescription(variabilityClass)
                          : 'Capture whether supplier timing is tight or drifting.'
                      }
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
                  <label className="flex items-start gap-3 rounded-[1.2rem] border border-border/70 bg-background/70 px-4 py-3 text-sm text-foreground">
                    <Checkbox
                      checked={useLeadTimeEstimate}
                      className="mt-0.5"
                      onCheckedChange={(checked) => setUseLeadTimeEstimate(checked === true)}
                    />
                    <span>Use this to improve lead time estimate.</span>
                  </label>
                </>
              ) : null}

              {mode === 'goods_received' ? (
                <>
                  <ActionSheetField label="Received quantity">
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
                  <ActionSheetField label="Received cost if changed">
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
                  <div className="rounded-[1.3rem] border border-emerald-200 bg-emerald-50/80 px-4 py-4 text-sm text-emerald-900">
                    Banji will add +{receiptPreviewQuantity || 0} units and close the open receipt task.
                    {' '}
                    Inventory will move to {receiptPreviewNextStock} units.
                  </div>
                </>
              ) : null}

              <ActionSheetField label={mode === 'ordered_waiting' || mode === 'eta_changed' ? 'Supplier note' : 'Note'}>
                <Textarea
                  aria-label={mode === 'ordered_waiting' || mode === 'eta_changed' ? 'Supplier note' : 'Note'}
                  className={actionSheetTextareaClassName}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </ActionSheetField>
            </div>
          </section>

          <section className={sectionClassName()}>
            <div className="mb-4 flex items-center gap-2">
              <Undo2 className="size-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                What Banji Will Do Next
              </h2>
            </div>
            <div className="grid gap-3">
              {task.nextSteps.map((line) => (
                <div key={line} className="rounded-[1rem] border border-border/60 bg-background/75 px-4 py-3 text-sm text-foreground">
                  {line}
                </div>
              ))}
            </div>
          </section>

          {error ? (
            <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>

        <SheetFooter className="border-t border-border/60 px-8 py-6">
          <Button
            className="h-14 w-full rounded-[1.5rem] text-base font-semibold shadow-sm shadow-primary/15"
            disabled={submitDisabled}
            size="lg"
            type="button"
            onClick={() => void submit()}
          >
            {mode === 'goods_received' ? <PackageCheck className="size-4" /> : <Save className="size-4" />}
            {isSaving ? 'Saving…' : submitLabel}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
