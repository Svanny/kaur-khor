import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import type { AppLanguage } from '@shared/inventory';
import type { SenaLeadTimeVariabilityClass } from '@shared/sena';
import {
  compatibilityRangeForClass,
  deriveLeadTimeFromStdDays,
} from '@shared/sena-lead-time';
import {
  ActionAddBadgeIcon,
  ActionClipboardAddIcon,
  ActionCreatePackageIcon,
  ActionEditIcon,
  ActionOpenExternalIcon,
  ActionReceiveInventoryIcon,
  ActionSaveIcon,
} from '@icons/actions';
import { EntityCustomerIcon, EntityRevenueIcon, EntityTagsIcon } from '@icons/entities';
import { NavigationExpandIcon } from '@icons/navigation';
import type { IconComponent } from '@icons';
import { Button, buttonVariants } from '@/components/ui/button';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { CurrencyNumberInput } from '@/components/ui/currency-number-input';
import { Input } from '@/components/ui/input';
import { NumberStepperInput } from '@/components/ui/number-stepper-input';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Textarea } from '@/components/ui/textarea';
import { SupplierBadge } from '@/components/system/supplier';
import { ConfirmActionDialog } from '@/components/system/confirm-action-dialog';
import {
  derivedStdDaysDraft,
  LeadTimeVariabilityField,
  type LeadTimeVariabilityDraftMode,
} from '@/components/system/lead-time-variability-field';
import { useDiscardChangesConfirm } from '@/hooks/use-route-leave-confirm';
import { formatEditableMoneyFromUsd, reformatMoneyDraftValue, usdMoneyFromDisplay } from '@/lib/format';
import { translateUiLiteral } from '@/lib/translations';
import {
  buildCaptureSessionHref,
  draftStorageKeyForLane,
  laneForCaptureSessionAction,
  type CaptureSessionAction,
  type CaptureSessionTargetType,
} from '@/lib/record-update-routes';
import { cn } from '@/lib/utils';
import { buildBanjiNavigationState } from '@/state/navigation-history';
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
  showActionButtons?: boolean;
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
  showActionButtons?: boolean;
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
  stdDays,
  skuId,
  typicalLeadTimeDays,
  variabilityClass,
}: {
  stdDays?: string;
  skuId: string;
  typicalLeadTimeDays: string;
  variabilityClass: SenaLeadTimeVariabilityClass | '';
}) {
  const typicalDays = typicalLeadTimeDays ? Number(typicalLeadTimeDays) : null;
  const customStdDays = stdDays?.trim() ? Number(stdDays) : null;
  const compatibilityRange = compatibilityRangeForClass(typicalDays, variabilityClass || null);
  const derivedLeadTime =
    customStdDays != null
      ? deriveLeadTimeFromStdDays(typicalDays, customStdDays)
      : compatibilityRange == null
        ? {
            lowDays: null,
            highDays: null,
            variabilityClass: variabilityClass || null,
          }
        : {
            ...compatibilityRange,
            variabilityClass: variabilityClass || null,
          };
  if (typicalDays == null && !variabilityClass && customStdDays == null) {
    return null;
  }

  return {
    skuId,
    typicalDays,
    lowDays: derivedLeadTime?.lowDays ?? null,
    highDays: derivedLeadTime?.highDays ?? null,
    variabilityClass: derivedLeadTime?.variabilityClass ?? null,
  };
}

interface RecordCaptureAction {
  action: CaptureSessionAction;
  disabled?: boolean;
  disabledReason?: string;
  icon: IconComponent;
  label: string;
  targetId: string;
  targetType: CaptureSessionTargetType;
}

type CaptureConfirmPrompt = 'saved-draft' | 'leave-page';

function hasSavedCaptureDraft(draftStorageKey: string | null) {
  if (!draftStorageKey || typeof window === 'undefined' || typeof window.localStorage?.getItem !== 'function') {
    return false;
  }
  return window.localStorage.getItem(draftStorageKey) != null;
}

function removeSavedCaptureDraft(draftStorageKey: string | null) {
  if (!draftStorageKey || typeof window === 'undefined' || typeof window.localStorage?.removeItem !== 'function') {
    return;
  }
  window.localStorage.removeItem(draftStorageKey);
}

function CaptureConfirmDialog({
  language,
  open,
  prompt,
  onCancel,
  onConfirm,
  onDeleteDraft,
}: {
  language: AppLanguage;
  open: boolean;
  prompt: CaptureConfirmPrompt | null;
  onCancel: () => void;
  onConfirm: () => void;
  onDeleteDraft: () => void;
}) {
  const hasDraftConfirmPrompt = prompt === 'saved-draft';
  return (
    <ConfirmActionDialog
      cancelLabel={translateUiLiteral(language, 'Cancel')}
      confirmIcon={hasDraftConfirmPrompt ? <ActionReceiveInventoryIcon /> : <ActionClipboardAddIcon />}
      confirmLabel={translateUiLiteral(language, hasDraftConfirmPrompt ? 'Resume draft' : 'Continue to capture')}
      confirmVariant="default"
      destructiveActionLabel={hasDraftConfirmPrompt ? translateUiLiteral(language, 'Delete draft and start new') : undefined}
      description={translateUiLiteral(language, hasDraftConfirmPrompt ? 'This capture lane has a saved draft. Resume the draft to keep it, or delete it before starting this targeted capture session.' : 'This will leave the detail page and open a targeted capture session.')}
      open={open}
      title={translateUiLiteral(language, hasDraftConfirmPrompt ? 'Delete saved draft?' : 'Leave detail page?')}
      onCancel={onCancel}
      onConfirm={onConfirm}
      onDestructiveAction={hasDraftConfirmPrompt ? onDeleteDraft : undefined}
    />
  );
}

function RecordCaptureActionMenu({
  actions,
  className,
  language,
}: {
  actions: RecordCaptureAction[];
  className?: string;
  language: AppLanguage;
}) {
  const navigate = useNavigate();
  const [confirmPrompt, setConfirmPrompt] = useState<CaptureConfirmPrompt | null>(null);
  const [pendingAction, setPendingAction] = useState<RecordCaptureAction | null>(null);

  function requestCaptureSession(action: RecordCaptureAction, closeMenu: () => void) {
    if (action.disabled) {
      return;
    }
    const draftStorageKey = draftStorageKeyForLane(laneForCaptureSessionAction(action.action));
    setPendingAction(action);
    setConfirmPrompt(hasSavedCaptureDraft(draftStorageKey) ? 'saved-draft' : 'leave-page');
    closeMenu();
  }

  function openPendingCaptureSession({ deleteDraft }: { deleteDraft: boolean }) {
    if (!pendingAction) {
      setConfirmPrompt(null);
      return;
    }
    const draftStorageKey = draftStorageKeyForLane(laneForCaptureSessionAction(pendingAction.action));
    if (deleteDraft) {
      removeSavedCaptureDraft(draftStorageKey);
    }
    setConfirmPrompt(null);
    setPendingAction(null);
    navigate(buildCaptureSessionHref({
      action: pendingAction.action,
      targetId: pendingAction.targetId,
      targetType: pendingAction.targetType,
    }));
  }

  return (
    <>
      <AnchoredMenu
        align="left"
        className="w-64 p-1"
        label={translateUiLiteral(language, 'Record')}
        triggerClassName={className}
        triggerIcon={
          <span className="inline-flex items-center gap-2">
            <ActionClipboardAddIcon className="size-4" />
            {translateUiLiteral(language, 'Record')}
            <NavigationExpandIcon className="size-4" />
          </span>
        }
        triggerSize="sm"
      >
        {(closeMenu) => (
          <div className="grid gap-1">
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={`${action.action}:${action.targetType}:${action.targetId}`}
                  aria-disabled={action.disabled ? 'true' : undefined}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-foreground transition-colors hover:bg-accent disabled:pointer-events-none disabled:opacity-50"
                  disabled={action.disabled}
                  role="menuitem"
                  title={action.disabled ? action.disabledReason : undefined}
                  type="button"
                  onClick={() => requestCaptureSession(action, closeMenu)}
                >
                  <Icon className="size-4" />
                  {action.label}
                </button>
              );
            })}
          </div>
        )}
      </AnchoredMenu>
      <CaptureConfirmDialog
        language={language}
        open={confirmPrompt != null}
        prompt={confirmPrompt}
        onCancel={() => setConfirmPrompt(null)}
        onConfirm={() => openPendingCaptureSession({ deleteDraft: false })}
        onDeleteDraft={() => openPendingCaptureSession({ deleteDraft: true })}
      />
    </>
  );
}

function formatCatalogSheetTitle(
  actionLabel: string,
  layout: 'row' | 'menu',
  catalogEntityName?: string,
  language: AppLanguage = 'en',
) {
  if (layout === 'menu' && catalogEntityName) {
    return translateUiLiteral(language, '{action} for {name}', {
      action: actionLabel,
      name: catalogEntityName,
    });
  }

  return actionLabel;
}

function finalizeSuccessfulSheetMutation({
  close,
  prepareWorkspace,
}: {
  close: () => void;
  prepareWorkspace: () => Promise<unknown>;
}) {
  close();
  void prepareWorkspace().catch((error) => {
    console.error('Failed to refresh parent view after catalog sheet save.', error);
  });
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
  showActionButtons = true,
  layout = 'row',
  catalogEntityName,
}: SkuMutationActionsProps) {
  const location = useLocation();
  const { ingestSenaObservation, isSaving, runWorkspacePreparation, triggerSenaRun } = useInventory();
  const { currency, language, t, usdToKhrExchangeRate } = usePreferences();
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
  const [leadTimeStdDays, setLeadTimeStdDays] = useState('');
  const [leadTimeDraftMode, setLeadTimeDraftMode] = useState<LeadTimeVariabilityDraftMode>('class');
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

  useEffect(() => {
    const typicalDays = typicalLeadTimeDays.trim() ? Number(typicalLeadTimeDays) : null;
    if (leadTimeDraftMode === 'class') {
      setLeadTimeStdDays(derivedStdDaysDraft(typicalDays, leadTimeVariability));
      return;
    }
    const nextVariabilityClass = deriveLeadTimeFromStdDays(
      typicalDays,
      leadTimeStdDays.trim() ? Number(leadTimeStdDays) : null,
    ).variabilityClass;
    setLeadTimeVariability(nextVariabilityClass ?? '');
  }, [leadTimeDraftMode, leadTimeStdDays, leadTimeVariability, typicalLeadTimeDays]);

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
    setLeadTimeStdDays('');
    setLeadTimeDraftMode('class');
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
      leadTimeStdDays,
      leadTimeDraftMode,
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
      leadTimeStdDays: '',
      leadTimeDraftMode: 'class' as const,
    };
  }

  async function submit(modeValue: SkuActionMode) {
    setError(null);
    const observedAtIso = new Date(observedAt).toISOString();
    const senaPayload = createEmptyObservationInput({
      observedAt: observedAtIso,
      notes: notes.trim() || null,
    });
    if (modeValue === 'stock') {
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
        stdDays: leadTimeDraftMode === 'std' ? leadTimeStdDays : undefined,
        typicalLeadTimeDays,
        variabilityClass: leadTimeVariability,
      });
      if (leadTimeHint) {
        senaPayload.leadTimeHints = [leadTimeHint];
      }
    }

    if (modeValue === 'receipt') {
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
      senaPayload.retailPrices = [{ skuId, price: parseMoneyDraft(productPrice, currency, usdToKhrExchangeRate) }];
    }

    try {
      await ingestSenaObservation(senaPayload);
      finalizeSuccessfulSheetMutation({
        close: () => setMode(null),
        prepareWorkspace: () =>
          runWorkspacePreparation(async () => {
            await triggerSenaRun({ algorithmVersion: 'sena-analysis-v3' });
            await onComplete();
          }),
      });
      return true;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('catalogSenaSkuMutationFailed'));
      return false;
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
    isSaveDisabled: submitDisabled,
    onDiscard: () => setError(null),
    onSave: async (continueAfterSave) => {
      if (mode == null) {
        return false;
      }
      const saved = await submit(mode);
      if (saved) {
        continueAfterSave();
      }
      return saved;
    },
  });

  function handleSheetOpenChange(open: boolean) {
    if (open) {
      return;
    }
    requestDiscard(() => setMode(null));
  }

  return (
    <>
      {showActionButtons ? (
        <div className={layout === 'menu' ? 'grid gap-1' : 'flex flex-wrap gap-2'}>
          <RecordCaptureActionMenu
            className={layout === 'menu' ? 'w-full justify-start' : undefined}
            language={language}
            actions={[
              {
                action: 'stock',
                icon: ActionAddBadgeIcon,
                label: translateUiLiteral(language, 'Stock Count'),
                targetId: skuId,
                targetType: 'sku',
              },
              {
                action: 'supplier-order',
                icon: ActionCreatePackageIcon,
                label: translateUiLiteral(language, 'Supplier Order'),
                targetId: skuId,
                targetType: 'sku',
              },
              {
                action: 'customer-order',
                icon: EntityCustomerIcon,
                label: translateUiLiteral(language, 'Customer Order'),
                targetId: skuId,
                targetType: 'sku',
              },
              {
                action: 'immediate-sale',
                icon: EntityRevenueIcon,
                label: translateUiLiteral(language, 'Immediate Sale'),
                targetId: skuId,
                targetType: 'sku',
              },
              ...(actionContext.soldAsProduct
                ? [{
                    action: 'sku-price' as const,
                    icon: EntityTagsIcon,
                    label: translateUiLiteral(language, 'Updated Price'),
                    targetId: skuId,
                    targetType: 'sku' as const,
                  }]
                : []),
            ]}
          />
          {showEditButton ? (
            <Button asChild size="sm" type="button" variant={layout === 'menu' ? 'ghost' : 'outline'} className={layout === 'menu' ? 'w-full justify-start' : undefined}>
              <Link state={buildBanjiNavigationState(location, '/catalog')} to={`/catalog/skus/${skuId}/edit`}>
                <ActionEditIcon className="size-4" />
                {t('catalogSkuEditAction')}
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      <Sheet open={mode != null} onOpenChange={handleSheetOpenChange}>
        <SheetContent className="w-full max-w-2xl gap-0 overflow-y-auto border-l border-border/70 bg-white px-0 shadow-[0_28px_72px_rgba(48,31,20,0.18)] sm:max-w-2xl">
          {discardConfirmDialog}
          <SheetHeader className="gap-3 border-b border-border/60 px-8 py-7">
            <div className="flex flex-wrap items-center gap-2">
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
                  language,
                )}
              </SheetTitle>
              <SupplierBadge supplierName={actionContext.supplierName} />
            </div>
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
                  <NumberStepperInput
                    aria-label={t('catalogSenaSkuUnitsInStock')}
                    className={actionSheetInputClassName}
                    min="0"
                    step="1"
                    variant="side-buttons"
                    value={unitsInStock}
                    onChange={(event) => setUnitsInStock(event.target.value)}
                  />
                </ActionSheetField>
                <ActionSheetField label={t('catalogSenaSkuCostPerUnit')}>
                  <CurrencyNumberInput
                    aria-label={t('catalogSenaSkuCostPerUnit')}
                    className={actionSheetInputClassName}
                    currency={currency}
                    min="0"
                    variant="side-buttons"
                    value={costPerUnit}
                    onChange={(event) => setCostPerUnit(event.target.value)}
                  />
                </ActionSheetField>
              </>
            ) : null}

            {mode === 'stock' && actionContext.soldAsProduct ? (
              <ActionSheetField label={t('catalogSenaSkuProductPrice')}>
                <CurrencyNumberInput
                  aria-label={t('catalogSenaSkuProductPrice')}
                  className={actionSheetInputClassName}
                  currency={currency}
                  min="0"
                  variant="side-buttons"
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
                  <NumberStepperInput
                    aria-label={t('catalogSenaSkuApproximateOrderQuantity')}
                    className={actionSheetInputClassName}
                    min="0"
                    step="1"
                    variant="side-buttons"
                    value={approximateOrderQuantity}
                    onChange={(event) => setApproximateOrderQuantity(event.target.value)}
                  />
                </ActionSheetField>
                <ActionSheetField label={t('catalogSenaSkuTypicalLeadTimeDays')}>
                  <NumberStepperInput
                    aria-label={t('catalogSenaSkuTypicalLeadTimeDays')}
                    className={actionSheetInputClassName}
                    min="0"
                    step="0.01"
                    variant="side-buttons"
                    value={typicalLeadTimeDays}
                    onChange={(event) => setTypicalLeadTimeDays(event.target.value)}
                  />
                </ActionSheetField>
                <ActionSheetField
                  description={t('catalogSenaSkuLeadTimeVariabilityHint')}
                  label={t('catalogSenaSkuLeadTimeVariability')}
                >
                  <LeadTimeVariabilityField
                    customInputClassName={actionSheetInputClassName}
                    customStdDays={leadTimeStdDays}
                    language={language}
                    meanDays={typicalLeadTimeDays.trim() ? Number(typicalLeadTimeDays) : null}
                    mode={leadTimeDraftMode}
                    numberInputVariant="side-buttons"
                    placeholder={t('catalogSkuLeadTimeVariabilityPlaceholder')}
                    selectTriggerClassName={actionSheetSelectTriggerClassName}
                    value={leadTimeVariability}
                    onCustomStdDaysChange={(value) => {
                      setLeadTimeDraftMode('std');
                      setLeadTimeStdDays(value);
                    }}
                    onModeChange={setLeadTimeDraftMode}
                    onValueChange={(value) => {
                      setLeadTimeVariability(value);
                      if (value) {
                        setLeadTimeStdDays(derivedStdDaysDraft(typicalLeadTimeDays.trim() ? Number(typicalLeadTimeDays) : null, value));
                      }
                    }}
                  />
                </ActionSheetField>
              </>
            ) : null}

            {mode === 'receipt' ? (
              <ActionSheetField label={t('catalogSenaSkuApproximateReceiptQuantity')}>
                <NumberStepperInput
                  aria-label={t('catalogSenaSkuApproximateReceiptQuantity')}
                  className={actionSheetInputClassName}
                  min="0"
                  step="1"
                  variant="side-buttons"
                  value={approximateReceiptQuantity}
                  onChange={(event) => setApproximateReceiptQuantity(event.target.value)}
                />
              </ActionSheetField>
            ) : null}

            {mode === 'price' ? (
              <ActionSheetField label={t('catalogSenaSkuProductPrice')}>
                <CurrencyNumberInput
                  aria-label={t('catalogSenaSkuProductPrice')}
                  className={actionSheetInputClassName}
                  currency={currency}
                  min="0"
                  variant="side-buttons"
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
              <ActionSaveIcon data-icon="inline-start" />
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
  showActionButtons = true,
  layout = 'row',
  catalogEntityName,
}: ServiceMutationActionsProps) {
  const location = useLocation();
  const { ingestSenaObservation, isSaving, runWorkspacePreparation, triggerSenaRun } = useInventory();
  const { currency, language, t, usdToKhrExchangeRate } = usePreferences();
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
    if (modeValue === 'stock') {
      if (!baselineSnapshot || !actions.bottleneckSku) {
        setError(actions.noBottleneckHint);
        return false;
      }
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
        return false;
      }
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
      senaPayload.servicePrices = [{ serviceId: actions.servicePrice.serviceId, price: parseMoneyDraft(servicePrice, currency, usdToKhrExchangeRate) }];
    }

    try {
      await ingestSenaObservation(senaPayload);
      finalizeSuccessfulSheetMutation({
        close: () => setMode(null),
        prepareWorkspace: () =>
          runWorkspacePreparation(async () => {
            await triggerSenaRun({ algorithmVersion: 'sena-analysis-v3' });
            await onComplete();
          }),
      });
      return true;
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : t('catalogSenaSkuMutationFailed'));
      return false;
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
    isSaveDisabled: submitDisabled,
    onDiscard: () => setError(null),
    onSave: async (continueAfterSave) => {
      if (mode == null) {
        return false;
      }
      const saved = await submit(mode);
      if (saved) {
        continueAfterSave();
      }
      return saved;
    },
  });

  function handleSheetOpenChange(open: boolean) {
    if (open) {
      return;
    }
    requestDiscard(() => setMode(null));
  }

  return (
    <>
      {showActionButtons ? (
        <div className={layout === 'menu' ? 'grid gap-1' : 'flex flex-wrap gap-2'}>
          {showPrimarySkuButton ? (
            <Link
              className={cn(
                buttonVariants({ size: 'sm', variant: layout === 'menu' ? 'ghost' : 'default' }),
                layout === 'menu' ? 'w-full justify-start' : undefined,
              )}
              to={actions.primarySkuHref}
            >
              <ActionOpenExternalIcon className="size-4" />
              {translateUiLiteral(language, 'Open bottleneck SKU')}
            </Link>
          ) : null}
          <RecordCaptureActionMenu
            className={layout === 'menu' ? 'w-full justify-start' : undefined}
            language={language}
            actions={[
              {
                action: 'stock',
                disabled: bottleneckUnavailable,
                disabledReason: bottleneckUnavailable ? actions.noBottleneckHint : undefined,
                icon: ActionReceiveInventoryIcon,
                label: translateUiLiteral(language, 'Stock Count'),
                targetId: actions.bottleneckSku?.skuId ?? '',
                targetType: 'sku',
              },
              {
                action: 'customer-order',
                icon: EntityCustomerIcon,
                label: translateUiLiteral(language, 'Customer Order'),
                targetId: actions.servicePrice.serviceId,
                targetType: 'service',
              },
              {
                action: 'immediate-sale',
                icon: EntityRevenueIcon,
                label: translateUiLiteral(language, 'Immediate Sale'),
                targetId: actions.servicePrice.serviceId,
                targetType: 'service',
              },
              {
                action: 'service-price',
                icon: EntityTagsIcon,
                label: translateUiLiteral(language, 'Updated Price'),
                targetId: actions.servicePrice.serviceId,
                targetType: 'service',
              },
            ]}
          />
          {showEditButton ? (
            <Link
              className={cn(
                buttonVariants({ size: 'sm', variant: layout === 'menu' ? 'ghost' : 'outline' }),
                layout === 'menu' ? 'w-full justify-start' : undefined,
              )}
              state={buildBanjiNavigationState(location, '/catalog')}
              to={actions.editServiceHref}
            >
              <ActionEditIcon className="size-4" />
              {translateUiLiteral(language, 'Edit service')}
            </Link>
          ) : null}
        </div>
      ) : null}

      <Sheet open={mode != null} onOpenChange={handleSheetOpenChange}>
        <SheetContent className="w-full max-w-2xl gap-0 overflow-y-auto border-l border-border/70 bg-white px-0 shadow-[0_28px_72px_rgba(48,31,20,0.18)] sm:max-w-2xl">
          {discardConfirmDialog}
          <SheetHeader className="gap-3 border-b border-border/60 px-8 py-7">
            <SheetTitle>
              {formatCatalogSheetTitle(
                mode === 'stock'
                  ? translateUiLiteral(language, 'Record stock')
                  : mode === 'receipt'
                    ? translateUiLiteral(language, 'Record Customer order')
                    : translateUiLiteral(language, 'Update price'),
                layout,
                catalogEntityName,
                language,
              )}
            </SheetTitle>
            <SheetDescription className="max-w-2xl text-base leading-7">
              {mode === 'price'
                ? translateUiLiteral(language, 'Update the latest observed price for {name}.', {
                    name: actions.servicePrice.serviceName,
                  })
                : actions.bottleneckSku
                  ? translateUiLiteral(language, 'Capture a fresh bottleneck signal for {name}.', {
                      name: actions.bottleneckSku.name,
                    })
                  : actions.noBottleneckHint}
            </SheetDescription>
          </SheetHeader>
          <div className="grid gap-5 px-8 py-7">
            <ActionSheetField label={translateUiLiteral(language, 'Observed at')}>
              <Input
                aria-label={translateUiLiteral(language, 'Observed at')}
                className={actionSheetInputClassName}
                required
                type="datetime-local"
                value={observedAt}
                onChange={(event) => setObservedAt(event.target.value)}
              />
            </ActionSheetField>

            {(mode === 'stock' || mode === 'receipt') ? (
              <>
                <ActionSheetField label={translateUiLiteral(language, 'Units in stock')}>
                  <NumberStepperInput
                    aria-label={translateUiLiteral(language, 'Units in stock')}
                    className={actionSheetInputClassName}
                    min="0"
                    step="1"
                    variant="side-buttons"
                    value={unitsInStock}
                    onChange={(event) => setUnitsInStock(event.target.value)}
                  />
                </ActionSheetField>
                <ActionSheetField label={translateUiLiteral(language, 'Cost per unit')}>
                  <CurrencyNumberInput
                    aria-label={translateUiLiteral(language, 'Cost per unit')}
                    className={actionSheetInputClassName}
                    currency={currency}
                    min="0"
                    variant="side-buttons"
                    value={costPerUnit}
                    onChange={(event) => setCostPerUnit(event.target.value)}
                  />
                </ActionSheetField>
                {mode === 'stock' && actions.bottleneckSku?.soldAsProduct ? (
                  <ActionSheetField label={translateUiLiteral(language, 'Product price')}>
                    <CurrencyNumberInput
                      aria-label={translateUiLiteral(language, 'Product price')}
                      className={actionSheetInputClassName}
                      currency={currency}
                      min="0"
                      variant="side-buttons"
                      value={productPrice}
                      onChange={(event) => setProductPrice(event.target.value)}
                    />
                  </ActionSheetField>
                ) : null}
              </>
            ) : null}

            {mode === 'receipt' ? (
              <ActionSheetField label={translateUiLiteral(language, 'Approximate receipt quantity')}>
                <NumberStepperInput
                  aria-label={translateUiLiteral(language, 'Approximate receipt quantity')}
                  className={actionSheetInputClassName}
                  min="0"
                  step="1"
                  variant="side-buttons"
                  value={approximateReceiptQuantity}
                  onChange={(event) => setApproximateReceiptQuantity(event.target.value)}
                />
              </ActionSheetField>
            ) : null}

            {mode === 'price' ? (
              <ActionSheetField label={translateUiLiteral(language, 'Service price')}>
                <CurrencyNumberInput
                  aria-label={translateUiLiteral(language, 'Service price')}
                  className={actionSheetInputClassName}
                  currency={currency}
                  min="0"
                  variant="side-buttons"
                  value={servicePrice}
                  onChange={(event) => setServicePrice(event.target.value)}
                />
              </ActionSheetField>
            ) : null}

            <ActionSheetField label={translateUiLiteral(language, 'Notes')}>
              <Textarea
                aria-label={translateUiLiteral(language, 'Notes')}
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
              <ActionSaveIcon data-icon="inline-start" />
              {isSaving ? t('catalogSenaSkuSaving') : t('catalogSenaSkuSaveAndRefresh')}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
