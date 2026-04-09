import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { StockReportSubmission } from '@shared/inventory';
import type { SenaLeadTimeVariabilityClass } from '@shared/sena';
import {
  compatibilityRangeForClass,
  leadTimeVariabilityLabel,
  leadTimeVariabilityOptions,
} from '@shared/sena-lead-time';
import { ArrowUpRight, BadgePlus, ClipboardPlus, PackageCheck, Save, SquarePen, Tags } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Textarea } from '@/components/ui/textarea';
import { useDiscardChangesConfirm } from '@/hooks/use-route-leave-confirm';
import { formatEditableMoneyFromUsd, moneyInputStep, reformatMoneyDraftValue, usdMoneyFromDisplay } from '@/lib/format';
import { cn } from '@/lib/utils';
import {
  ActionSheetField,
  actionSheetInputClassName,
  actionSheetSelectTriggerClassName,
  actionSheetTextareaClassName,
} from '@/routes/detail-action-sheet';
import { createEmptyObservationInput } from '@/routes/observation-payload';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import type { ServiceDetailViewModel } from './service-detail/view-model';
import type { SenaSkuDetailViewModel } from './sku-detail/view-model';

export type SkuActionMode = 'stock' | 'order' | 'receipt' | 'price';
export type ServiceActionMode = 'stock' | 'receipt' | 'price';

export interface SkuMutationActionsProps {
  actionContext: SenaSkuDetailViewModel['actionContext'];
  skuId: string;
  mode?: SkuActionMode | null;
  onModeChange?: (mode: SkuActionMode | null) => void;
  onComplete: () => Promise<void>;
  onActionStart?: (mode: SkuActionMode) => void;
  showEditButton?: boolean;
  layout?: 'row' | 'menu';
  catalogEntityName?: string;
}

export interface ServiceMutationActionsProps {
  actions: ServiceDetailViewModel['actions'];
  mode?: ServiceActionMode | null;
  onModeChange?: (mode: ServiceActionMode | null) => void;
  onComplete: () => Promise<void>;
  onActionStart?: (mode: ServiceActionMode) => void;
  showEditButton?: boolean;
  showPrimarySkuButton?: boolean;
  layout?: 'row' | 'menu';
  catalogEntityName?: string;
}

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

interface ActionButtonProps {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  disabledReason?: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
  variant?: 'default' | 'outline' | 'ghost';
}

function ActionButton({
  children,
  className,
  disabled = false,
  disabledReason,
  onClick,
  type = 'button',
  variant = 'outline',
}: ActionButtonProps) {
  const [tooltipOpen, setTooltipOpen] = useState(false);

  if (!disabled || !disabledReason) {
    return (
      <Button className={className} disabled={disabled} size="sm" type={type} variant={variant} onClick={onClick}>
        {children}
      </Button>
    );
  }

  return (
    <TooltipProvider>
      <Tooltip open={tooltipOpen}>
        <TooltipTrigger asChild>
          <span
            aria-label={disabledReason}
            className={cn('block', className)}
            role="button"
            tabIndex={0}
            onBlur={() => setTooltipOpen(false)}
            onClick={() => setTooltipOpen(true)}
            onFocus={() => setTooltipOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setTooltipOpen(true);
              }
              if (event.key === 'Escape') {
                setTooltipOpen(false);
              }
            }}
            onMouseLeave={() => setTooltipOpen(false)}
            onPointerEnter={() => setTooltipOpen(true)}
          >
            <Button className="pointer-events-none w-full justify-start" disabled size="sm" type={type} variant={variant}>
              {children}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="left" sideOffset={8}>
          {disabledReason}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function formatCatalogSheetTitle(
  actionLabel: string,
  layout: 'row' | 'menu',
  catalogEntityName?: string,
) {
  if (layout === 'menu' && catalogEntityName) {
    return `${actionLabel} for ${catalogEntityName}`;
  }

  return actionLabel;
}

function formatMoneyDraft(value: number, currency: 'USD' | 'KHR', usdToKhrExchangeRate: number) {
  return formatEditableMoneyFromUsd(value, currency, usdToKhrExchangeRate);
}

function parseMoneyDraft(value: string, currency: 'USD' | 'KHR', usdToKhrExchangeRate: number) {
  return usdMoneyFromDisplay(Number(value), currency, usdToKhrExchangeRate);
}

function useControllableMode<TMode extends string>(
  controlledMode: TMode | null | undefined,
  onModeChange: ((mode: TMode | null) => void) | undefined,
) {
  const [uncontrolledMode, setUncontrolledMode] = useState<TMode | null>(null);
  const isControlled = controlledMode !== undefined;
  const mode = isControlled ? controlledMode ?? null : uncontrolledMode;

  function setMode(nextMode: TMode | null) {
    if (!isControlled) {
      setUncontrolledMode(nextMode);
    }
    onModeChange?.(nextMode);
  }

  return [mode, setMode] as const;
}

export function SkuMutationActions({
  actionContext,
  skuId,
  mode: controlledMode,
  onModeChange,
  onComplete,
  onActionStart,
  showEditButton = true,
  layout = 'row',
  catalogEntityName,
}: SkuMutationActionsProps) {
  const { ingestSenaObservation, isSaving, submitLegacyReport, triggerSenaRun } = useInventory();
  const { currency, t, usdToKhrExchangeRate } = usePreferences();
  const [mode, setMode] = useControllableMode(controlledMode, onModeChange);
  const [observedAt, setObservedAt] = useState(() => initialObservedAt(actionContext.latestObservationAt));
  const [notes, setNotes] = useState('');
  const [unitsInStock, setUnitsInStock] = useState(String(Math.round(actionContext.currentStock)));
  const [costPerUnit, setCostPerUnit] = useState(formatMoneyDraft(actionContext.costPerUnit, currency, usdToKhrExchangeRate));
  const [productPrice, setProductPrice] = useState(actionContext.productPrice != null ? formatMoneyDraft(actionContext.productPrice, currency, usdToKhrExchangeRate) : '');
  const [approximateOrderQuantity, setApproximateOrderQuantity] = useState('');
  const [approximateReceiptQuantity, setApproximateReceiptQuantity] = useState('');
  const [typicalLeadTimeDays, setTypicalLeadTimeDays] = useState('');
  const [leadTimeVariability, setLeadTimeVariability] = useState<SenaLeadTimeVariabilityClass | ''>('');
  const [error, setError] = useState<string | null>(null);
  const previousMoneyPreferencesRef = useRef({ currency, usdToKhrExchangeRate });

  useEffect(() => {
    const previous = previousMoneyPreferencesRef.current;
    if (previous.currency === currency && previous.usdToKhrExchangeRate === usdToKhrExchangeRate) {
      return;
    }

    setCostPerUnit((current) =>
      reformatMoneyDraftValue({
        value: current,
        previousCurrency: previous.currency,
        previousUsdToKhrExchangeRate: previous.usdToKhrExchangeRate,
        nextCurrency: currency,
        nextUsdToKhrExchangeRate: usdToKhrExchangeRate,
      }),
    );
    setProductPrice((current) =>
      reformatMoneyDraftValue({
        value: current,
        previousCurrency: previous.currency,
        previousUsdToKhrExchangeRate: previous.usdToKhrExchangeRate,
        nextCurrency: currency,
        nextUsdToKhrExchangeRate: usdToKhrExchangeRate,
      }),
    );
    previousMoneyPreferencesRef.current = { currency, usdToKhrExchangeRate };
  }, [currency, usdToKhrExchangeRate]);

  const baselineSnapshot = useMemo(
    () => ({
      skuId,
      unitsInStock: Number(unitsInStock || actionContext.currentStock),
      costPerUnit: costPerUnit ? parseMoneyDraft(costPerUnit, currency, usdToKhrExchangeRate) : actionContext.costPerUnit,
      productPrice:
        actionContext.soldAsProduct && productPrice !== ''
          ? parseMoneyDraft(productPrice, currency, usdToKhrExchangeRate)
          : actionContext.productPrice ?? null,
    }),
    [actionContext.costPerUnit, actionContext.currentStock, actionContext.productPrice, actionContext.soldAsProduct, costPerUnit, currency, productPrice, skuId, unitsInStock, usdToKhrExchangeRate],
  );

  function resetForm(nextMode: SkuActionMode) {
    setMode(nextMode);
    onActionStart?.(nextMode);
    setObservedAt(initialObservedAt(actionContext.latestObservationAt));
    setNotes('');
    setUnitsInStock(String(Math.round(actionContext.currentStock)));
    setCostPerUnit(formatMoneyDraft(actionContext.costPerUnit, currency, usdToKhrExchangeRate));
    setProductPrice(actionContext.productPrice != null ? formatMoneyDraft(actionContext.productPrice, currency, usdToKhrExchangeRate) : '');
    setApproximateOrderQuantity(
      nextMode === 'order' && actionContext.recommendedOrderQuantity > 0
        ? String(actionContext.recommendedOrderQuantity)
        : '',
    );
    setApproximateReceiptQuantity('');
    setTypicalLeadTimeDays('');
    setLeadTimeVariability(actionContext.leadTimeVariability ?? '');
    setError(null);
  }

  function skuActionDraftSnapshot(modeValue: SkuActionMode) {
    return {
      mode: modeValue,
      observedAt,
      notes,
      unitsInStock,
      costPerUnit,
      productPrice,
      approximateOrderQuantity,
      approximateReceiptQuantity,
      typicalLeadTimeDays,
      leadTimeVariability,
    };
  }

  function skuActionBaselineSnapshot(modeValue: SkuActionMode) {
    return {
      mode: modeValue,
      observedAt: initialObservedAt(actionContext.latestObservationAt),
      notes: '',
      unitsInStock: String(Math.round(actionContext.currentStock)),
      costPerUnit: formatMoneyDraft(actionContext.costPerUnit, currency, usdToKhrExchangeRate),
      productPrice: actionContext.productPrice != null ? formatMoneyDraft(actionContext.productPrice, currency, usdToKhrExchangeRate) : '',
      approximateOrderQuantity:
        modeValue === 'order' && actionContext.recommendedOrderQuantity > 0
          ? String(actionContext.recommendedOrderQuantity)
          : '',
      approximateReceiptQuantity: '',
      typicalLeadTimeDays: '',
      leadTimeVariability: actionContext.leadTimeVariability ?? '',
    };
  }

  async function submit(modeValue: SkuActionMode) {
    setError(null);
    const observedAtIso = new Date(observedAt).toISOString();
    const senaPayload = createEmptyObservationInput({
      observedAt: observedAtIso,
      notes: notes.trim() || null,
    });
    let legacyPayload: StockReportSubmission | null = null;

    if (modeValue === 'stock') {
      legacyPayload = {
        reportedAt: observedAtIso,
        skuObservations: [
          {
            skuId,
            unitsInStock: Number(unitsInStock),
            costPerUnit: parseMoneyDraft(costPerUnit, currency, usdToKhrExchangeRate),
            productPrice: actionContext.soldAsProduct && productPrice !== '' ? parseMoneyDraft(productPrice, currency, usdToKhrExchangeRate) : null,
          },
        ],
        notes: notes.trim() || null,
      };
      senaPayload.stockSnapshot = [
        {
          ...baselineSnapshot,
          unitsInStock: Number(unitsInStock),
          costPerUnit: parseMoneyDraft(costPerUnit, currency, usdToKhrExchangeRate),
          productPrice: actionContext.soldAsProduct && productPrice !== '' ? parseMoneyDraft(productPrice, currency, usdToKhrExchangeRate) : null,
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
        senaPayload.leadTimeHints = [leadTimeHint];
      }
    }

    if (modeValue === 'receipt') {
      legacyPayload = {
        reportedAt: observedAtIso,
        skuObservations: [
          {
            skuId,
            unitsInStock: Number(unitsInStock),
            costPerUnit: costPerUnit ? parseMoneyDraft(costPerUnit, currency, usdToKhrExchangeRate) : actionContext.costPerUnit,
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
          costPerUnit: costPerUnit ? parseMoneyDraft(costPerUnit, currency, usdToKhrExchangeRate) : actionContext.costPerUnit,
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
            productPrice: parseMoneyDraft(productPrice, currency, usdToKhrExchangeRate),
          },
        ],
        notes: notes.trim() || null,
      };
      senaPayload.retailPrices = [{ skuId, price: parseMoneyDraft(productPrice, currency, usdToKhrExchangeRate) }];
    }

    try {
      if (legacyPayload) {
        await submitLegacyReport(legacyPayload);
      }
      await ingestSenaObservation(senaPayload);
      await triggerSenaRun({ algorithmVersion: 'sena-analysis-v3' });
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
  const hasUnsavedSheetChanges =
    mode != null &&
    JSON.stringify(skuActionDraftSnapshot(mode)) !== JSON.stringify(skuActionBaselineSnapshot(mode));
  const { discardConfirmDialog, requestDiscard } = useDiscardChangesConfirm({
    enabled: hasUnsavedSheetChanges,
    description: t('sheetUnsavedLeavePrompt'),
    onDiscard: () => setError(null),
  });

  function handleSheetOpenChange(open: boolean) {
    if (open) {
      return;
    }
    requestDiscard(() => setMode(null));
  }

  return (
    <>
      <div className={layout === 'menu' ? 'grid gap-1' : 'flex flex-wrap gap-2'}>
        <ActionButton className={layout === 'menu' ? 'w-full justify-start' : undefined} type="button" variant={layout === 'menu' ? 'ghost' : 'default'} onClick={() => resetForm('stock')}>
          <BadgePlus className="size-4" />
          {t('catalogSenaSkuRecordStock')}
        </ActionButton>
        <ActionButton className={layout === 'menu' ? 'w-full justify-start' : undefined} type="button" variant={layout === 'menu' ? 'ghost' : 'outline'} onClick={() => resetForm('order')}>
          <ClipboardPlus className="size-4" />
          {t('catalogSenaSkuLogOrder')}
        </ActionButton>
        <ActionButton className={layout === 'menu' ? 'w-full justify-start' : undefined} type="button" variant={layout === 'menu' ? 'ghost' : 'outline'} onClick={() => resetForm('receipt')}>
          <PackageCheck className="size-4" />
          {t('catalogSenaSkuLogReceipt')}
        </ActionButton>
        {actionContext.soldAsProduct ? (
          <ActionButton className={layout === 'menu' ? 'w-full justify-start' : undefined} type="button" variant={layout === 'menu' ? 'ghost' : 'outline'} onClick={() => resetForm('price')}>
            <Tags className="size-4" />
            {t('catalogSenaSkuUpdatePrice')}
          </ActionButton>
        ) : null}
        {showEditButton ? (
          <Button asChild size="sm" type="button" variant={layout === 'menu' ? 'ghost' : 'outline'} className={layout === 'menu' ? 'w-full justify-start' : undefined}>
            <Link to={`/catalog/skus/${skuId}/edit`}>
              <SquarePen className="size-4" />
              {t('catalogSkuEditAction')}
            </Link>
          </Button>
        ) : null}
      </div>

      <Sheet open={mode != null} onOpenChange={handleSheetOpenChange}>
        <SheetContent className="w-full max-w-2xl gap-0 overflow-y-auto border-l border-border/70 bg-white px-0 shadow-[0_28px_72px_rgba(48,31,20,0.18)] sm:max-w-2xl">
          {discardConfirmDialog}
          <SheetHeader className="gap-3 border-b border-border/60 px-8 py-7">
            <SheetTitle>
              {formatCatalogSheetTitle(
                mode === 'stock'
                  ? t('catalogSenaSkuRecordStock')
                  : mode === 'order'
                    ? t('catalogSenaSkuLogOrder')
                    : mode === 'receipt'
                      ? t('catalogSenaSkuLogReceipt')
                      : t('catalogSenaSkuUpdatePrice'),
                layout,
                catalogEntityName,
              )}
            </SheetTitle>
            <SheetDescription className="max-w-2xl text-base leading-7">
              {t('catalogSenaSkuDialogDescription')}
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-5 px-8 py-7">
            <ActionSheetField label={t('catalogSenaSkuObservedAt')}>
              <Input
                aria-label={t('catalogSenaSkuObservedAt')}
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
                    aria-label={t('catalogSenaSkuUnitsInStock')}
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
                    aria-label={t('catalogSenaSkuCostPerUnit')}
                    className={actionSheetInputClassName}
                    min="0"
                    step={moneyInputStep(currency)}
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
                  aria-label={t('catalogSenaSkuProductPrice')}
                  className={actionSheetInputClassName}
                  min="0"
                  step={moneyInputStep(currency)}
                  type="number"
                  value={productPrice}
                  onChange={(event) => setProductPrice(event.target.value)}
                />
              </ActionSheetField>
            ) : null}

            {mode === 'order' ? (
              <>
                <ActionSheetField
                  description={
                    actionContext.reorderRecommendation.recommendationIssued
                      ? `${actionContext.reorderRecommendation.likelyRangeLabel}. ${actionContext.reorderRecommendation.needProbabilityLabel}.`
                      : actionContext.reorderRecommendation.quietLabel
                  }
                  label={t('catalogSenaSkuApproximateOrderQuantity')}
                >
                  <Input
                    aria-label={t('catalogSenaSkuApproximateOrderQuantity')}
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
                    aria-label={t('catalogSenaSkuTypicalLeadTimeDays')}
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
                  aria-label={t('catalogSenaSkuApproximateReceiptQuantity')}
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
                  aria-label={t('catalogSenaSkuProductPrice')}
                  className={actionSheetInputClassName}
                  min="0"
                  step={moneyInputStep(currency)}
                  type="number"
                  value={productPrice}
                  onChange={(event) => setProductPrice(event.target.value)}
                />
              </ActionSheetField>
            ) : null}

            <ActionSheetField label={t('catalogSenaSkuNotes')}>
              <Textarea
                aria-label={t('catalogSenaSkuNotes')}
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
              onClick={() => void submit(mode as SkuActionMode)}
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

export function ServiceMutationActions({
  actions,
  mode: controlledMode,
  onModeChange,
  onComplete,
  onActionStart,
  showEditButton = true,
  showPrimarySkuButton = true,
  layout = 'row',
  catalogEntityName,
}: ServiceMutationActionsProps) {
  const { ingestSenaObservation, isSaving, submitLegacyReport, triggerSenaRun } = useInventory();
  const { currency, t, usdToKhrExchangeRate } = usePreferences();
  const [mode, setMode] = useControllableMode(controlledMode, onModeChange);
  const [observedAt, setObservedAt] = useState(() => initialObservedAt(actions.latestObservedAt));
  const [notes, setNotes] = useState('');
  const [unitsInStock, setUnitsInStock] = useState(
    actions.bottleneckSku ? String(Math.round(actions.bottleneckSku.unitsInStock)) : '0',
  );
  const [costPerUnit, setCostPerUnit] = useState(actions.bottleneckSku ? formatMoneyDraft(actions.bottleneckSku.costPerUnit, currency, usdToKhrExchangeRate) : '0');
  const [productPrice, setProductPrice] = useState(
    actions.bottleneckSku?.productPrice != null ? formatMoneyDraft(actions.bottleneckSku.productPrice, currency, usdToKhrExchangeRate) : '',
  );
  const [approximateReceiptQuantity, setApproximateReceiptQuantity] = useState('');
  const [servicePrice, setServicePrice] = useState(formatMoneyDraft(actions.servicePrice.currentPrice, currency, usdToKhrExchangeRate));
  const [error, setError] = useState<string | null>(null);
  const previousMoneyPreferencesRef = useRef({ currency, usdToKhrExchangeRate });

  useEffect(() => {
    const previous = previousMoneyPreferencesRef.current;
    if (previous.currency === currency && previous.usdToKhrExchangeRate === usdToKhrExchangeRate) {
      return;
    }

    setCostPerUnit((current) =>
      reformatMoneyDraftValue({
        value: current,
        previousCurrency: previous.currency,
        previousUsdToKhrExchangeRate: previous.usdToKhrExchangeRate,
        nextCurrency: currency,
        nextUsdToKhrExchangeRate: usdToKhrExchangeRate,
      }),
    );
    setProductPrice((current) =>
      reformatMoneyDraftValue({
        value: current,
        previousCurrency: previous.currency,
        previousUsdToKhrExchangeRate: previous.usdToKhrExchangeRate,
        nextCurrency: currency,
        nextUsdToKhrExchangeRate: usdToKhrExchangeRate,
      }),
    );
    setServicePrice((current) =>
      reformatMoneyDraftValue({
        value: current,
        previousCurrency: previous.currency,
        previousUsdToKhrExchangeRate: previous.usdToKhrExchangeRate,
        nextCurrency: currency,
        nextUsdToKhrExchangeRate: usdToKhrExchangeRate,
      }),
    );
    previousMoneyPreferencesRef.current = { currency, usdToKhrExchangeRate };
  }, [currency, usdToKhrExchangeRate]);

  const baselineSnapshot = useMemo(
    () =>
      actions.bottleneckSku
        ? {
            skuId: actions.bottleneckSku.skuId,
            unitsInStock: Number(unitsInStock || actions.bottleneckSku.unitsInStock),
            costPerUnit: costPerUnit ? parseMoneyDraft(costPerUnit, currency, usdToKhrExchangeRate) : actions.bottleneckSku.costPerUnit,
            productPrice:
              actions.bottleneckSku.soldAsProduct && productPrice !== ''
                ? parseMoneyDraft(productPrice, currency, usdToKhrExchangeRate)
                : actions.bottleneckSku.productPrice ?? null,
          }
        : null,
    [actions.bottleneckSku, costPerUnit, currency, productPrice, unitsInStock, usdToKhrExchangeRate],
  );

  function resetForm(nextMode: ServiceActionMode) {
    setMode(nextMode);
    onActionStart?.(nextMode);
    setObservedAt(initialObservedAt(actions.latestObservedAt));
    setNotes('');
    setUnitsInStock(actions.bottleneckSku ? String(Math.round(actions.bottleneckSku.unitsInStock)) : '0');
    setCostPerUnit(actions.bottleneckSku ? formatMoneyDraft(actions.bottleneckSku.costPerUnit, currency, usdToKhrExchangeRate) : '0');
    setProductPrice(actions.bottleneckSku?.productPrice != null ? formatMoneyDraft(actions.bottleneckSku.productPrice, currency, usdToKhrExchangeRate) : '');
    setApproximateReceiptQuantity('');
    setServicePrice(formatMoneyDraft(actions.servicePrice.currentPrice, currency, usdToKhrExchangeRate));
    setError(null);
  }

  function serviceActionDraftSnapshot(modeValue: ServiceActionMode) {
    return {
      mode: modeValue,
      observedAt,
      notes,
      unitsInStock,
      costPerUnit,
      productPrice,
      approximateReceiptQuantity,
      servicePrice,
    };
  }

  function serviceActionBaselineSnapshot(modeValue: ServiceActionMode) {
    return {
      mode: modeValue,
      observedAt: initialObservedAt(actions.latestObservedAt),
      notes: '',
      unitsInStock: actions.bottleneckSku ? String(Math.round(actions.bottleneckSku.unitsInStock)) : '0',
      costPerUnit: actions.bottleneckSku ? formatMoneyDraft(actions.bottleneckSku.costPerUnit, currency, usdToKhrExchangeRate) : '0',
      productPrice: actions.bottleneckSku?.productPrice != null ? formatMoneyDraft(actions.bottleneckSku.productPrice, currency, usdToKhrExchangeRate) : '',
      approximateReceiptQuantity: '',
      servicePrice: formatMoneyDraft(actions.servicePrice.currentPrice, currency, usdToKhrExchangeRate),
    };
  }

  async function submit(modeValue: ServiceActionMode) {
    setError(null);
    const observedAtIso = new Date(observedAt).toISOString();
    const senaPayload = createEmptyObservationInput({
      observedAt: observedAtIso,
      notes: notes.trim() || null,
    });
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
            costPerUnit: parseMoneyDraft(costPerUnit, currency, usdToKhrExchangeRate),
            productPrice:
              actions.bottleneckSku.soldAsProduct && productPrice !== '' ? parseMoneyDraft(productPrice, currency, usdToKhrExchangeRate) : null,
          },
        ],
        notes: notes.trim() || null,
      };
      senaPayload.stockSnapshot = [
        {
          ...baselineSnapshot,
          unitsInStock: Number(unitsInStock),
          costPerUnit: parseMoneyDraft(costPerUnit, currency, usdToKhrExchangeRate),
          productPrice:
            actions.bottleneckSku.soldAsProduct && productPrice !== '' ? parseMoneyDraft(productPrice, currency, usdToKhrExchangeRate) : null,
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
            costPerUnit: costPerUnit ? parseMoneyDraft(costPerUnit, currency, usdToKhrExchangeRate) : actions.bottleneckSku.costPerUnit,
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
          costPerUnit: costPerUnit ? parseMoneyDraft(costPerUnit, currency, usdToKhrExchangeRate) : actions.bottleneckSku.costPerUnit,
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
            price: parseMoneyDraft(servicePrice, currency, usdToKhrExchangeRate),
            previousPrice: actions.servicePrice.currentPrice,
          },
        ],
        notes: notes.trim() || null,
      };
      senaPayload.servicePrices = [{ serviceId: actions.servicePrice.serviceId, price: parseMoneyDraft(servicePrice, currency, usdToKhrExchangeRate) }];
    }

    try {
      if (legacyPayload) {
        await submitLegacyReport(legacyPayload);
      }
      await ingestSenaObservation(senaPayload);
      await triggerSenaRun({ algorithmVersion: 'sena-analysis-v3' });
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
  const hasUnsavedSheetChanges =
    mode != null &&
    JSON.stringify(serviceActionDraftSnapshot(mode)) !== JSON.stringify(serviceActionBaselineSnapshot(mode));
  const { discardConfirmDialog, requestDiscard } = useDiscardChangesConfirm({
    enabled: hasUnsavedSheetChanges,
    description: t('sheetUnsavedLeavePrompt'),
    onDiscard: () => setError(null),
  });

  function handleSheetOpenChange(open: boolean) {
    if (open) {
      return;
    }
    requestDiscard(() => setMode(null));
  }

  return (
    <>
      <div className={layout === 'menu' ? 'grid gap-1' : 'flex flex-wrap gap-2'}>
        {showPrimarySkuButton ? (
          <Button asChild size="sm" type="button" variant={layout === 'menu' ? 'ghost' : 'default'} className={layout === 'menu' ? 'w-full justify-start' : undefined}>
            <Link to={actions.primarySkuHref}>
              <ArrowUpRight className="size-4" />
              Open bottleneck SKU
            </Link>
          </Button>
        ) : null}
        <ActionButton
          className={layout === 'menu' ? 'w-full justify-start' : undefined}
          disabled={bottleneckUnavailable}
          disabledReason={bottleneckUnavailable ? actions.noBottleneckHint : undefined}
          type="button"
          variant={layout === 'menu' ? 'ghost' : 'outline'}
          onClick={() => resetForm('receipt')}
        >
          <ClipboardPlus className="size-4" />
          Log receipt
        </ActionButton>
        <ActionButton
          className={layout === 'menu' ? 'w-full justify-start' : undefined}
          disabled={bottleneckUnavailable}
          disabledReason={bottleneckUnavailable ? actions.noBottleneckHint : undefined}
          type="button"
          variant={layout === 'menu' ? 'ghost' : 'outline'}
          onClick={() => resetForm('stock')}
        >
          <PackageCheck className="size-4" />
          Record stock
        </ActionButton>
        <ActionButton className={layout === 'menu' ? 'w-full justify-start' : undefined} type="button" variant={layout === 'menu' ? 'ghost' : 'outline'} onClick={() => resetForm('price')}>
          <Tags className="size-4" />
          Update price
        </ActionButton>
        {showEditButton ? (
          <Button asChild size="sm" type="button" variant={layout === 'menu' ? 'ghost' : 'outline'} className={layout === 'menu' ? 'w-full justify-start' : undefined}>
            <Link to={actions.editServiceHref}>
              <SquarePen className="size-4" />
              Edit service
            </Link>
          </Button>
        ) : null}
      </div>

      <Sheet open={mode != null} onOpenChange={handleSheetOpenChange}>
        <SheetContent className="w-full max-w-2xl gap-0 overflow-y-auto border-l border-border/70 bg-white px-0 shadow-[0_28px_72px_rgba(48,31,20,0.18)] sm:max-w-2xl">
          {discardConfirmDialog}
          <SheetHeader className="gap-3 border-b border-border/60 px-8 py-7">
            <SheetTitle>
              {formatCatalogSheetTitle(
                mode === 'stock' ? 'Record stock' : mode === 'receipt' ? 'Log receipt' : 'Update price',
                layout,
                catalogEntityName,
              )}
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
                aria-label="Observed at"
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
                    aria-label="Units in stock"
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
                    aria-label="Cost per unit"
                    className={actionSheetInputClassName}
                    min="0"
                    step={moneyInputStep(currency)}
                    type="number"
                    value={costPerUnit}
                    onChange={(event) => setCostPerUnit(event.target.value)}
                  />
                </ActionSheetField>
                {mode === 'stock' && actions.bottleneckSku?.soldAsProduct ? (
                  <ActionSheetField label="Product price">
                    <Input
                      aria-label="Product price"
                      className={actionSheetInputClassName}
                      min="0"
                      step={moneyInputStep(currency)}
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
                  aria-label="Approximate receipt quantity"
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
                  aria-label="Service price"
                  className={actionSheetInputClassName}
                  min="0"
                  step={moneyInputStep(currency)}
                  type="number"
                  value={servicePrice}
                  onChange={(event) => setServicePrice(event.target.value)}
                />
              </ActionSheetField>
            ) : null}

            <ActionSheetField label="Notes">
              <Textarea
                aria-label="Notes"
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
              onClick={() => void submit(mode as ServiceActionMode)}
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
