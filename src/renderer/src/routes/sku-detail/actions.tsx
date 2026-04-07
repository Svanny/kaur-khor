import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { StockReportSubmission } from '@shared/inventory';
import type { SenaLeadTimeVariabilityClass, SenaObservationInput } from '@shared/sena';
import {
  compatibilityRangeForClass,
  leadTimeVariabilityLabel,
  leadTimeVariabilityOptions,
} from '@shared/sena-lead-time';
import { BadgePlus, ClipboardPlus, PackageCheck, Save, SquarePen, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  ActionSheetField,
  actionSheetInputClassName,
  actionSheetSelectTriggerClassName,
  actionSheetTextareaClassName,
} from '@/routes/detail-action-sheet';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import type { SenaSkuDetailViewModel } from './view-model';

type ActionMode = 'stock' | 'order' | 'receipt' | 'price' | null;

function initialObservedAt(value: string | null) {
  if (value) {
    return new Date(value).toISOString().slice(0, 16);
  }
  return new Date().toISOString().slice(0, 16);
}

export function buildLeadTimeHintFromInputs({
  skuId,
  typicalLeadTimeDays,
  variabilityClass,
}: {
  skuId: string;
  typicalLeadTimeDays: string;
  variabilityClass: SenaLeadTimeVariabilityClass | '';
}) {
  const typicalDays = typicalLeadTimeDays ? Number(typicalLeadTimeDays) : null;
  const range = compatibilityRangeForClass(typicalDays, variabilityClass || null);
  if (typicalDays == null && !variabilityClass) {
    return null;
  }

  return {
    skuId,
    typicalDays,
    lowDays: range?.lowDays ?? null,
    highDays: range?.highDays ?? null,
    variabilityClass: variabilityClass || null,
  };
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
  const { t } = usePreferences();
  const [mode, setMode] = useState<ActionMode>(null);
  const [observedAt, setObservedAt] = useState(() => initialObservedAt(actionContext.latestObservationAt));
  const [notes, setNotes] = useState('');
  const [unitsInStock, setUnitsInStock] = useState(String(Math.round(actionContext.currentStock)));
  const [costPerUnit, setCostPerUnit] = useState(String(actionContext.costPerUnit));
  const [productPrice, setProductPrice] = useState(actionContext.productPrice != null ? String(actionContext.productPrice) : '');
  const [approximateOrderQuantity, setApproximateOrderQuantity] = useState('');
  const [approximateReceiptQuantity, setApproximateReceiptQuantity] = useState('');
  const [typicalLeadTimeDays, setTypicalLeadTimeDays] = useState('');
  const [leadTimeVariability, setLeadTimeVariability] = useState<SenaLeadTimeVariabilityClass | ''>('');
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
    setLeadTimeVariability(actionContext.leadTimeVariability ?? '');
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
      const leadTimeHint = buildLeadTimeHintFromInputs({
        skuId,
        typicalLeadTimeDays,
        variabilityClass: leadTimeVariability,
      });
      if (leadTimeHint) {
        senaPayload.leadTimeHints = [
          leadTimeHint,
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
      setError(nextError instanceof Error ? nextError.message : t('catalogSenaSkuMutationFailed'));
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
          <BadgePlus className="size-4" />
          {t('catalogSenaSkuRecordStock')}
        </Button>
        <Button size="sm" type="button" variant="outline" onClick={() => resetForm('order')}>
          <ClipboardPlus className="size-4" />
          {t('catalogSenaSkuLogOrder')}
        </Button>
        <Button size="sm" type="button" variant="outline" onClick={() => resetForm('receipt')}>
          <PackageCheck className="size-4" />
          {t('catalogSenaSkuLogReceipt')}
        </Button>
        {actionContext.soldAsProduct ? (
          <Button
            size="sm"
            type="button"
            variant="outline"
            onClick={() => resetForm('price')}
          >
            <Tags className="size-4" />
            {t('catalogSenaSkuUpdatePrice')}
          </Button>
        ) : null}
        <Button asChild size="sm" type="button" variant="outline">
          <Link to={`/catalog/skus/${skuId}/edit`}>
            <SquarePen className="size-4" />
            {t('catalogSkuEditAction')}
          </Link>
        </Button>
      </div>

      <Sheet open={mode != null} onOpenChange={(open) => setMode(open ? mode : null)}>
        <SheetContent className="w-full max-w-2xl gap-0 overflow-y-auto border-l border-border/70 bg-white px-0 shadow-[0_28px_72px_rgba(48,31,20,0.18)] sm:max-w-2xl">
          <SheetHeader className="gap-3 border-b border-border/60 px-8 py-7">
            <SheetTitle>
              {mode === 'stock'
                ? t('catalogSenaSkuRecordStock')
                : mode === 'order'
                  ? t('catalogSenaSkuLogOrder')
                  : mode === 'receipt'
                    ? t('catalogSenaSkuLogReceipt')
                    : t('catalogSenaSkuUpdatePrice')}
            </SheetTitle>
            <SheetDescription className="max-w-2xl text-base leading-7">
              {t('catalogSenaSkuDialogDescription')}
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-5 px-8 py-7">
            <ActionSheetField label={t('catalogSenaSkuObservedAt')}>
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
                <ActionSheetField label={t('catalogSenaSkuUnitsInStock')}>
                  <Input
                    className={actionSheetInputClassName}
                    min="0"
                    step="1"
                    type="number"
                    value={unitsInStock}
                    onChange={(event) => setUnitsInStock(event.target.value)}
                  />
                </ActionSheetField>
                <ActionSheetField label={t('catalogSenaSkuCostPerUnit')}>
                  <Input
                    className={actionSheetInputClassName}
                    min="0"
                    step="0.01"
                    type="number"
                    value={costPerUnit}
                    onChange={(event) => setCostPerUnit(event.target.value)}
                  />
                </ActionSheetField>
              </>
            ) : null}

            {mode === 'stock' && actionContext.soldAsProduct ? (
              <ActionSheetField label={t('catalogSenaSkuProductPrice')}>
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

            {mode === 'order' ? (
              <>
                <ActionSheetField label={t('catalogSenaSkuApproximateOrderQuantity')}>
                  <Input
                    className={actionSheetInputClassName}
                    min="0"
                    step="1"
                    type="number"
                    value={approximateOrderQuantity}
                    onChange={(event) => setApproximateOrderQuantity(event.target.value)}
                  />
                </ActionSheetField>
                <ActionSheetField label={t('catalogSenaSkuTypicalLeadTimeDays')}>
                  <Input
                    className={actionSheetInputClassName}
                    min="0"
                    step="0.1"
                    type="number"
                    value={typicalLeadTimeDays}
                    onChange={(event) => setTypicalLeadTimeDays(event.target.value)}
                  />
                </ActionSheetField>
                <ActionSheetField
                  description={t('catalogSenaSkuLeadTimeVariabilityHint')}
                  label={t('catalogSenaSkuLeadTimeVariability')}
                >
                  <Select
                    value={leadTimeVariability || '__none__'}
                    onValueChange={(value) =>
                      setLeadTimeVariability(value === '__none__' ? '' : (value as SenaLeadTimeVariabilityClass))
                    }
                  >
                    <SelectTrigger aria-label={t('catalogSenaSkuLeadTimeVariability')} className={actionSheetSelectTriggerClassName}>
                      <SelectValue placeholder={t('catalogSkuLeadTimeVariabilityPlaceholder')} />
                    </SelectTrigger>
                    <SelectContent align="start">
                      <SelectItem value="__none__">{t('catalogSkuLeadTimeVariabilityPlaceholder')}</SelectItem>
                      {leadTimeVariabilityOptions().map((option) => (
                        <SelectItem key={option} value={option}>
                          {leadTimeVariabilityLabel(option)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </ActionSheetField>
              </>
            ) : null}

            {mode === 'receipt' ? (
              <ActionSheetField label={t('catalogSenaSkuApproximateReceiptQuantity')}>
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
              <ActionSheetField label={t('catalogSenaSkuProductPrice')}>
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

            <ActionSheetField label={t('catalogSenaSkuNotes')}>
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
