import { useMemo, useState } from 'react';
import type { StockReportSubmission } from '@shared/inventory';
import type { SenaObservationInput } from '@shared/sena';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useInventory } from '@/state/inventory';
import type { SenaSkuDetailViewModel } from './view-model';

type ActionMode = 'stock' | 'order' | 'receipt' | 'price' | null;

function initialObservedAt(value: string | null) {
  if (value) {
    return new Date(value).toISOString().slice(0, 16);
  }
  return new Date().toISOString().slice(0, 16);
}

export function SkuDetailActions({
  actionContext,
  skuId,
  onComplete,
}: {
  actionContext: SenaSkuDetailViewModel['actionContext'];
  skuId: string;
  onComplete: () => Promise<void>;
}) {
  const { ingestSenaObservation, isSaving, submitLegacyReport, triggerSenaRun } = useInventory();
  const [mode, setMode] = useState<ActionMode>(null);
  const [observedAt, setObservedAt] = useState(() => initialObservedAt(actionContext.latestObservationAt));
  const [notes, setNotes] = useState('');
  const [unitsInStock, setUnitsInStock] = useState(String(Math.round(actionContext.currentStock)));
  const [costPerUnit, setCostPerUnit] = useState(String(actionContext.costPerUnit));
  const [productPrice, setProductPrice] = useState(actionContext.productPrice != null ? String(actionContext.productPrice) : '');
  const [approximateOrderQuantity, setApproximateOrderQuantity] = useState('');
  const [approximateReceiptQuantity, setApproximateReceiptQuantity] = useState('');
  const [typicalLeadTimeDays, setTypicalLeadTimeDays] = useState('');
  const [lowLeadTimeDays, setLowLeadTimeDays] = useState('');
  const [highLeadTimeDays, setHighLeadTimeDays] = useState('');
  const [error, setError] = useState<string | null>(null);

  const baselineSnapshot = useMemo(
    () => ({
      skuId,
      unitsInStock: Number(unitsInStock || actionContext.currentStock),
      costPerUnit: Number(costPerUnit || actionContext.costPerUnit),
      productPrice:
        actionContext.soldAsProduct && productPrice !== ''
          ? Number(productPrice)
          : actionContext.productPrice ?? null,
    }),
    [actionContext.costPerUnit, actionContext.currentStock, actionContext.productPrice, actionContext.soldAsProduct, costPerUnit, productPrice, skuId, unitsInStock],
  );

  function resetForm(nextMode: ActionMode) {
    setMode(nextMode);
    setObservedAt(initialObservedAt(actionContext.latestObservationAt));
    setNotes('');
    setUnitsInStock(String(Math.round(actionContext.currentStock)));
    setCostPerUnit(String(actionContext.costPerUnit));
    setProductPrice(actionContext.productPrice != null ? String(actionContext.productPrice) : '');
    setApproximateOrderQuantity('');
    setApproximateReceiptQuantity('');
    setTypicalLeadTimeDays('');
    setLowLeadTimeDays('');
    setHighLeadTimeDays('');
    setError(null);
  }

  async function submit(modeValue: Exclude<ActionMode, null>) {
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

    if (modeValue === 'stock') {
      legacyPayload = {
        reportedAt: observedAtIso,
        skuObservations: [
          {
            skuId,
            unitsInStock: Number(unitsInStock),
            costPerUnit: Number(costPerUnit),
            productPrice: actionContext.soldAsProduct && productPrice !== '' ? Number(productPrice) : null,
          },
        ],
        notes: notes.trim() || null,
      };
      senaPayload.stockSnapshot = [
        {
          ...baselineSnapshot,
          unitsInStock: Number(unitsInStock),
          costPerUnit: Number(costPerUnit),
          productPrice: actionContext.soldAsProduct && productPrice !== '' ? Number(productPrice) : null,
        },
      ];
    }

    if (modeValue === 'order') {
      senaPayload.orderSignals = [
        {
          skuId,
          orderPlaced: true,
          receiptArrived: false,
          approximateOrderQuantity: Number(approximateOrderQuantity),
          approximateReceiptQuantity: null,
        },
      ];
      if (typicalLeadTimeDays || lowLeadTimeDays || highLeadTimeDays) {
        senaPayload.leadTimeHints = [
          {
            skuId,
            typicalDays: typicalLeadTimeDays ? Number(typicalLeadTimeDays) : null,
            lowDays: lowLeadTimeDays ? Number(lowLeadTimeDays) : null,
            highDays: highLeadTimeDays ? Number(highLeadTimeDays) : null,
            variabilityClass: null,
          },
        ];
      }
    }

    if (modeValue === 'receipt') {
      legacyPayload = {
        reportedAt: observedAtIso,
        skuObservations: [
          {
            skuId,
            unitsInStock: Number(unitsInStock),
            costPerUnit: costPerUnit ? Number(costPerUnit) : actionContext.costPerUnit,
            productPrice: actionContext.productPrice,
            restockIncluded: true,
          },
        ],
        notes: notes.trim() || null,
      };
      senaPayload.stockSnapshot = [
        {
          ...baselineSnapshot,
          unitsInStock: Number(unitsInStock),
          costPerUnit: costPerUnit ? Number(costPerUnit) : actionContext.costPerUnit,
        },
      ];
      senaPayload.orderSignals = [
        {
          skuId,
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
        skuObservations: [
          {
            skuId,
            unitsInStock: actionContext.currentStock,
            costPerUnit: actionContext.costPerUnit,
            productPrice: Number(productPrice),
          },
        ],
        notes: notes.trim() || null,
      };
      senaPayload.retailPrices = [{ skuId, price: Number(productPrice) }];
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
      setError(nextError instanceof Error ? nextError.message : 'Mutation failed.');
    }
  }

  const submitDisabled =
    isSaving ||
    mode == null ||
    (mode === 'stock' && (!unitsInStock || !costPerUnit)) ||
    (mode === 'order' && !approximateOrderQuantity) ||
    (mode === 'receipt' && (!approximateReceiptQuantity || !unitsInStock)) ||
    (mode === 'price' && (!actionContext.soldAsProduct || !productPrice));

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" type="button" onClick={() => resetForm('stock')}>
          Record stock
        </Button>
        <Button size="sm" type="button" variant="outline" onClick={() => resetForm('order')}>
          Log order
        </Button>
        <Button size="sm" type="button" variant="outline" onClick={() => resetForm('receipt')}>
          Log receipt
        </Button>
        <Button
          disabled={!actionContext.soldAsProduct}
          size="sm"
          title={actionContext.soldAsProduct ? undefined : 'This SKU is not sold directly at retail.'}
          type="button"
          variant="outline"
          onClick={() => resetForm('price')}
        >
          Update price
        </Button>
      </div>

      <Sheet open={mode != null} onOpenChange={(open) => setMode(open ? mode : null)}>
        <SheetContent className="w-full max-w-xl overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {mode === 'stock'
                ? 'Record stock'
                : mode === 'order'
                  ? 'Log order'
                  : mode === 'receipt'
                    ? 'Log receipt'
                    : 'Update price'}
            </SheetTitle>
            <SheetDescription>Capture one SKU-local observation and refresh the SENA posterior.</SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 px-4 pb-6">
            <label className="grid gap-2 text-sm">
              <span>Observed at</span>
              <input
                className="rounded-xl border border-border bg-background px-3 py-2"
                required
                type="datetime-local"
                value={observedAt}
                onChange={(event) => setObservedAt(event.target.value)}
              />
            </label>

            {(mode === 'stock' || mode === 'receipt') ? (
              <>
                <label className="grid gap-2 text-sm">
                  <span>Units in stock</span>
                  <input className="rounded-xl border border-border bg-background px-3 py-2" min="0" step="1" type="number" value={unitsInStock} onChange={(event) => setUnitsInStock(event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm">
                  <span>Cost per unit</span>
                  <input className="rounded-xl border border-border bg-background px-3 py-2" min="0" step="0.01" type="number" value={costPerUnit} onChange={(event) => setCostPerUnit(event.target.value)} />
                </label>
              </>
            ) : null}

            {mode === 'stock' && actionContext.soldAsProduct ? (
              <label className="grid gap-2 text-sm">
                <span>Product price</span>
                <input className="rounded-xl border border-border bg-background px-3 py-2" min="0" step="0.01" type="number" value={productPrice} onChange={(event) => setProductPrice(event.target.value)} />
              </label>
            ) : null}

            {mode === 'order' ? (
              <>
                <label className="grid gap-2 text-sm">
                  <span>Approximate order quantity</span>
                  <input className="rounded-xl border border-border bg-background px-3 py-2" min="0" step="1" type="number" value={approximateOrderQuantity} onChange={(event) => setApproximateOrderQuantity(event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm">
                  <span>Typical lead time days</span>
                  <input className="rounded-xl border border-border bg-background px-3 py-2" min="0" step="0.1" type="number" value={typicalLeadTimeDays} onChange={(event) => setTypicalLeadTimeDays(event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm">
                  <span>Low lead time days</span>
                  <input className="rounded-xl border border-border bg-background px-3 py-2" min="0" step="0.1" type="number" value={lowLeadTimeDays} onChange={(event) => setLowLeadTimeDays(event.target.value)} />
                </label>
                <label className="grid gap-2 text-sm">
                  <span>High lead time days</span>
                  <input className="rounded-xl border border-border bg-background px-3 py-2" min="0" step="0.1" type="number" value={highLeadTimeDays} onChange={(event) => setHighLeadTimeDays(event.target.value)} />
                </label>
              </>
            ) : null}

            {mode === 'receipt' ? (
              <label className="grid gap-2 text-sm">
                <span>Approximate receipt quantity</span>
                <input className="rounded-xl border border-border bg-background px-3 py-2" min="0" step="1" type="number" value={approximateReceiptQuantity} onChange={(event) => setApproximateReceiptQuantity(event.target.value)} />
              </label>
            ) : null}

            {mode === 'price' ? (
              <label className="grid gap-2 text-sm">
                <span>Product price</span>
                <input className="rounded-xl border border-border bg-background px-3 py-2" min="0" step="0.01" type="number" value={productPrice} onChange={(event) => setProductPrice(event.target.value)} />
              </label>
            ) : null}

            <label className="grid gap-2 text-sm">
              <span>Notes</span>
              <textarea className="min-h-24 rounded-xl border border-border bg-background px-3 py-2" value={notes} onChange={(event) => setNotes(event.target.value)} />
            </label>

            {error ? <p className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p> : null}
          </div>
          <SheetFooter>
            <Button disabled={submitDisabled} type="button" onClick={() => void submit(mode as Exclude<ActionMode, null>)}>
              {isSaving ? 'Saving…' : 'Save and refresh'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
