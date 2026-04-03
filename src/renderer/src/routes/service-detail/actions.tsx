import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { StockReportSubmission } from '@shared/inventory';
import type { SenaObservationInput } from '@shared/sena';
import { ArrowUpRight, ClipboardPlus, PackageCheck, Save, SquarePen, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import {
  ActionSheetField,
  actionSheetInputClassName,
  actionSheetTextareaClassName,
} from '@/routes/detail-action-sheet';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import type { ServiceDetailViewModel } from './view-model';

type ActionMode = 'stock' | 'receipt' | 'price' | null;

function initialObservedAt(value: string | null) {
  if (value) {
    return new Date(value).toISOString().slice(0, 16);
  }
  return new Date().toISOString().slice(0, 16);
}

export function ServiceDetailActions({
  actions,
  onComplete,
}: {
  actions: ServiceDetailViewModel['actions'];
  onComplete: () => Promise<void>;
}) {
  const { ingestSenaObservation, isSaving, submitLegacyReport, triggerSenaRun } = useInventory();
  const { t } = usePreferences();
  const [mode, setMode] = useState<ActionMode>(null);
  const [observedAt, setObservedAt] = useState(() => initialObservedAt(actions.latestObservedAt));
  const [notes, setNotes] = useState('');
  const [unitsInStock, setUnitsInStock] = useState(
    actions.bottleneckSku ? String(Math.round(actions.bottleneckSku.unitsInStock)) : '0',
  );
  const [costPerUnit, setCostPerUnit] = useState(actions.bottleneckSku ? String(actions.bottleneckSku.costPerUnit) : '0');
  const [productPrice, setProductPrice] = useState(
    actions.bottleneckSku?.productPrice != null ? String(actions.bottleneckSku.productPrice) : '',
  );
  const [approximateReceiptQuantity, setApproximateReceiptQuantity] = useState('');
  const [servicePrice, setServicePrice] = useState(String(actions.servicePrice.currentPrice));
  const [error, setError] = useState<string | null>(null);

  const baselineSnapshot = useMemo(
    () =>
      actions.bottleneckSku
        ? {
            skuId: actions.bottleneckSku.skuId,
            unitsInStock: Number(unitsInStock || actions.bottleneckSku.unitsInStock),
            costPerUnit: Number(costPerUnit || actions.bottleneckSku.costPerUnit),
            productPrice:
              actions.bottleneckSku.soldAsProduct && productPrice !== ''
                ? Number(productPrice)
                : actions.bottleneckSku.productPrice ?? null,
          }
        : null,
    [actions.bottleneckSku, costPerUnit, productPrice, unitsInStock],
  );

  function resetForm(nextMode: ActionMode) {
    setMode(nextMode);
    setObservedAt(initialObservedAt(actions.latestObservedAt));
    setNotes('');
    setUnitsInStock(actions.bottleneckSku ? String(Math.round(actions.bottleneckSku.unitsInStock)) : '0');
    setCostPerUnit(actions.bottleneckSku ? String(actions.bottleneckSku.costPerUnit) : '0');
    setProductPrice(actions.bottleneckSku?.productPrice != null ? String(actions.bottleneckSku.productPrice) : '');
    setApproximateReceiptQuantity('');
    setServicePrice(String(actions.servicePrice.currentPrice));
    setError(null);
  }

  async function submit(modeValue: Exclude<ActionMode, null>) {
    setError(null);
    const observedAtIso = new Date(observedAt).toISOString();
    const senaPayload: SenaObservationInput = {
      observedAt: observedAtIso,
      stockSnapshot: [],
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

    if (modeValue === 'stock') {
      if (!baselineSnapshot || !actions.bottleneckSku) {
        setError(actions.noBottleneckHint);
        return;
      }
      legacyPayload = {
        reportedAt: observedAtIso,
        skuObservations: [
          {
            skuId: actions.bottleneckSku.skuId,
            unitsInStock: Number(unitsInStock),
            costPerUnit: Number(costPerUnit),
            productPrice:
              actions.bottleneckSku.soldAsProduct && productPrice !== '' ? Number(productPrice) : null,
          },
        ],
        notes: notes.trim() || null,
      };
      senaPayload.stockSnapshot = [
        {
          ...baselineSnapshot,
          unitsInStock: Number(unitsInStock),
          costPerUnit: Number(costPerUnit),
          productPrice:
            actions.bottleneckSku.soldAsProduct && productPrice !== '' ? Number(productPrice) : null,
        },
      ];
    }

    if (modeValue === 'receipt') {
      if (!baselineSnapshot || !actions.bottleneckSku) {
        setError(actions.noBottleneckHint);
        return;
      }
      legacyPayload = {
        reportedAt: observedAtIso,
        skuObservations: [
          {
            skuId: actions.bottleneckSku.skuId,
            unitsInStock: Number(unitsInStock),
            costPerUnit: costPerUnit ? Number(costPerUnit) : actions.bottleneckSku.costPerUnit,
            productPrice: actions.bottleneckSku.productPrice,
            restockIncluded: true,
          },
        ],
        notes: notes.trim() || null,
      };
      senaPayload.stockSnapshot = [
        {
          ...baselineSnapshot,
          unitsInStock: Number(unitsInStock),
          costPerUnit: costPerUnit ? Number(costPerUnit) : actions.bottleneckSku.costPerUnit,
        },
      ];
      senaPayload.orderSignals = [
        {
          skuId: actions.bottleneckSku.skuId,
          orderPlaced: false,
          receiptArrived: true,
          approximateOrderQuantity: null,
          approximateReceiptQuantity: Number(approximateReceiptQuantity),
        },
      ];
    }

    if (modeValue === 'price') {
      legacyPayload = {
        reportedAt: observedAtIso,
        skuObservations: [],
        servicePriceAdjustments: [
          {
            serviceId: actions.servicePrice.serviceId,
            price: Number(servicePrice),
            previousPrice: actions.servicePrice.currentPrice,
          },
        ],
        notes: notes.trim() || null,
      };
      senaPayload.servicePrices = [{ serviceId: actions.servicePrice.serviceId, price: Number(servicePrice) }];
    }

    try {
      if (legacyPayload) {
        await submitLegacyReport(legacyPayload);
      }
      await ingestSenaObservation(senaPayload);
      await triggerSenaRun({ algorithmVersion: 'sena-analysis-v2' });
      await onComplete();
      setMode(null);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('catalogSenaSkuMutationFailed'));
    }
  }

  const bottleneckUnavailable = actions.bottleneckSku == null;
  const submitDisabled =
    isSaving ||
    mode == null ||
    ((mode === 'stock' || mode === 'receipt') && bottleneckUnavailable) ||
    (mode === 'stock' && (!unitsInStock || !costPerUnit)) ||
    (mode === 'receipt' && (!approximateReceiptQuantity || !unitsInStock)) ||
    (mode === 'price' && !servicePrice);

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" type="button">
          <Link to={actions.primarySkuHref}>
            <ArrowUpRight className="size-4" />
            Open bottleneck SKU
          </Link>
        </Button>
        <Button
          disabled={bottleneckUnavailable}
          size="sm"
          title={bottleneckUnavailable ? actions.noBottleneckHint : undefined}
          type="button"
          variant="outline"
          onClick={() => resetForm('receipt')}
        >
          <ClipboardPlus className="size-4" />
          Log receipt
        </Button>
        <Button
          disabled={bottleneckUnavailable}
          size="sm"
          title={bottleneckUnavailable ? actions.noBottleneckHint : undefined}
          type="button"
          variant="outline"
          onClick={() => resetForm('stock')}
        >
          <PackageCheck className="size-4" />
          Record stock
        </Button>
        <Button size="sm" type="button" variant="outline" onClick={() => resetForm('price')}>
          <Tags className="size-4" />
          Update price
        </Button>
        <Button asChild size="sm" type="button" variant="outline">
          <Link to={actions.editServiceHref}>
            <SquarePen className="size-4" />
            Edit service
          </Link>
        </Button>
      </div>

      <Sheet open={mode != null} onOpenChange={(open) => setMode(open ? mode : null)}>
        <SheetContent className="w-full max-w-2xl gap-0 overflow-y-auto border-l border-border/70 bg-white px-0 shadow-[0_28px_72px_rgba(48,31,20,0.18)] sm:max-w-2xl">
          <SheetHeader className="gap-3 border-b border-border/60 px-8 py-7">
            <SheetTitle>
              {mode === 'stock' ? 'Record stock' : mode === 'receipt' ? 'Log receipt' : 'Update price'}
            </SheetTitle>
            <SheetDescription className="max-w-2xl text-base leading-7">
              {mode === 'price'
                ? `Update the latest observed price for ${actions.servicePrice.serviceName}.`
                : actions.bottleneckSku
                  ? `Capture a fresh bottleneck signal for ${actions.bottleneckSku.name}.`
                  : actions.noBottleneckHint}
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-5 px-8 py-7">
            <ActionSheetField label="Observed at">
              <Input
                className={actionSheetInputClassName}
                required
                type="datetime-local"
                value={observedAt}
                onChange={(event) => setObservedAt(event.target.value)}
              />
            </ActionSheetField>

            {(mode === 'stock' || mode === 'receipt') ? (
              <>
                <ActionSheetField label="Units in stock">
                  <Input
                    className={actionSheetInputClassName}
                    min="0"
                    step="1"
                    type="number"
                    value={unitsInStock}
                    onChange={(event) => setUnitsInStock(event.target.value)}
                  />
                </ActionSheetField>
                <ActionSheetField label="Cost per unit">
                  <Input
                    className={actionSheetInputClassName}
                    min="0"
                    step="0.01"
                    type="number"
                    value={costPerUnit}
                    onChange={(event) => setCostPerUnit(event.target.value)}
                  />
                </ActionSheetField>
                {mode === 'stock' && actions.bottleneckSku?.soldAsProduct ? (
                  <ActionSheetField label="Product price">
                    <Input
                      className={actionSheetInputClassName}
                      min="0"
                      step="0.01"
                      type="number"
                      value={productPrice}
                      onChange={(event) => setProductPrice(event.target.value)}
                    />
                  </ActionSheetField>
                ) : null}
              </>
            ) : null}

            {mode === 'receipt' ? (
              <ActionSheetField label="Approximate receipt quantity">
                <Input
                  className={actionSheetInputClassName}
                  min="0"
                  step="1"
                  type="number"
                  value={approximateReceiptQuantity}
                  onChange={(event) => setApproximateReceiptQuantity(event.target.value)}
                />
              </ActionSheetField>
            ) : null}

            {mode === 'price' ? (
              <ActionSheetField label="Service price">
                <Input
                  className={actionSheetInputClassName}
                  min="0"
                  step="0.01"
                  type="number"
                  value={servicePrice}
                  onChange={(event) => setServicePrice(event.target.value)}
                />
              </ActionSheetField>
            ) : null}

            <ActionSheetField label="Notes">
              <Textarea
                className={actionSheetTextareaClassName}
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
              />
            </ActionSheetField>

            {error ? <p className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p> : null}
          </div>
          <SheetFooter className="border-t border-border/60 px-8 py-6">
            <Button
              className="h-14 w-full rounded-[1.5rem] text-base font-semibold shadow-sm shadow-primary/15"
              disabled={submitDisabled}
              size="lg"
              type="button"
              onClick={() => void submit(mode as Exclude<ActionMode, null>)}
            >
              <Save data-icon="inline-start" />
              {isSaving ? t('catalogSenaSkuSaving') : t('catalogSenaSkuSaveAndRefresh')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
