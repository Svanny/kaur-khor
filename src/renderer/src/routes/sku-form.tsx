import { ActionEyeIcon, ActionSaveIcon } from '@icons/actions';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { SenaLeadTimeVariabilityClass, SenaSku } from '@shared/sena';
import {
  deriveLeadTimeFromStdDays,
  deriveLeadTimeFromVariabilityClass,
  leadTimeVariabilityOptions,
  uniqueLeadTimePresetStdDaysForClass,
} from '@shared/sena-lead-time';
import { CheckboxRow } from '@/components/system/checkbox-row';
import { ProductAttributesField } from '@/components/system/product-attributes-field';
import {
  derivedStdDaysDraft,
  LeadTimeVariabilityField,
  type LeadTimeVariabilityDraftMode,
} from '@/components/system/lead-time-variability-field';
import { SaveErrorFlash } from '@/components/system/save-error-flash';
import { SupplierField } from '@/components/system/supplier';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { CurrencyNumberInput } from '@/components/ui/currency-number-input';
import { Input } from '@/components/ui/input';
import { NumberStepperInput } from '@/components/ui/number-stepper-input';
import { useRouteLeaveConfirm } from '@/hooks/use-route-leave-confirm';
import { displayMoneyFromUsd, parseEditableNumberWithCommas, usdMoneyFromDisplay } from '@/lib/format';
import {
  createSkuAttributeVariants,
  createUniqueSkuId,
  emptySenaCatalog,
  upsertSenaSku,
} from '@/lib/sena-catalog';
import {
  emptyProductAttributeDraft,
  MAX_PRODUCT_ATTRIBUTE_VARIANTS,
  mergeCustomProductAttributePresets,
  mergedProductAttributePresets,
  productAttributeCombinationCount,
  productAttributeCombinations,
  productAttributeDraftDirtyKey,
  readCustomProductAttributePresets,
  writeCustomProductAttributePresets,
} from '@/lib/product-attributes';
import { translateUiLiteral } from '@/lib/translations';
import { useInventory } from '@/state/inventory';
import { buildKaurKhorNavigationState, useNavigationHistory } from '@/state/navigation-history';
import { usePreferences } from '@/state/preferences';
import { buildSkuCatalogEditObservation } from './catalog-edit-observation';
import { CatalogImageField } from './catalog-image-field';
import { EditorField, editorInputClassName, editorPanelClassName, editorTextareaClassName } from './editor-form-primitives';
import { SkuPageHero } from './sku-page-hero';
import { SectionLabel, SectionTitle } from './sku-detail/section-heading';

function emptySku(skuId = ''): SenaSku {
  return {
    skuId,
    name: '',
    description: '',
    imagePath: null,
    supplierName: null,
    costPerUnit: 0,
    archived: false,
    soldAsProduct: false,
    productPrice: null,
    leadTimeMeanDaysHint: null,
    leadTimeStdDaysHint: null,
  };
}

const editorSelectTriggerClassName =
  'h-14 w-full rounded-xl border-border bg-background px-3 text-base shadow-none data-[size=default]:h-14';

function normalizedSkuDirtySnapshot(sku: SenaSku, variabilityClass: SenaLeadTimeVariabilityClass | '') {
  return {
    name: sku.name.trim(),
    description: sku.description.trim(),
    imagePath: sku.imagePath?.trim() || null,
    supplierName: sku.supplierName?.trim() || null,
    costPerUnit: sku.costPerUnit,
    soldAsProduct: sku.soldAsProduct,
    productPrice: sku.productPrice,
    leadTimeMeanDaysHint: sku.leadTimeMeanDaysHint,
    leadTimeStdDaysHint: sku.leadTimeStdDaysHint,
    leadTimeVariability: variabilityClass,
  };
}

function parseOptionalNumber(value: string) {
  return value.trim() ? parseEditableNumberWithCommas(value) : null;
}

function parseNonNegativeMoneyDraft(value: string, currency: 'USD' | 'KHR', usdToKhrExchangeRate: number) {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (!/^\d{1,3}(?:,\d{3})*(?:\.\d+)?$|^\d+(?:\.\d+)?$/.test(trimmed)) {
    return null;
  }
  const displayValue = parseEditableNumberWithCommas(trimmed);
  if (!Number.isFinite(displayValue) || displayValue < 0) {
    return null;
  }
  const usdValue = usdMoneyFromDisplay(displayValue, currency, usdToKhrExchangeRate);
  return Number.isFinite(usdValue) && usdValue >= 0 ? usdValue : null;
}

function moneyDraftFromUsd(amount: number | null, currency: 'USD' | 'KHR', usdToKhrExchangeRate: number) {
  if (amount == null) {
    return '';
  }
  return String(displayMoneyFromUsd(amount, currency, usdToKhrExchangeRate));
}

function deriveCatalogVariabilityClass(sku: SenaSku): SenaLeadTimeVariabilityClass | null {
  if (sku.leadTimeStdDaysHint != null) {
    const matchingPreset = leadTimeVariabilityOptions().find((option) => {
      const presetStdDays = uniqueLeadTimePresetStdDaysForClass(sku.leadTimeMeanDaysHint, option);
      return presetStdDays != null && Math.abs(presetStdDays - sku.leadTimeStdDaysHint!) < 0.0001;
    });
    if (matchingPreset) {
      return matchingPreset;
    }
  }
  return deriveLeadTimeFromStdDays(sku.leadTimeMeanDaysHint, sku.leadTimeStdDaysHint).variabilityClass;
}

function matchesLeadTimePresetStdDays(sku: SenaSku, variabilityClass: SenaLeadTimeVariabilityClass | null) {
  if (sku.leadTimeStdDaysHint == null || variabilityClass == null) {
    return false;
  }
  const presetStdDays = uniqueLeadTimePresetStdDaysForClass(sku.leadTimeMeanDaysHint, variabilityClass);
  return presetStdDays != null && Math.abs(presetStdDays - sku.leadTimeStdDaysHint) < 0.0001;
}

function stdDaysDraftFromValue(value: number | null) {
  return value == null ? '' : String(value);
}

function deriveLeadTimeDraftMode(sku: SenaSku): LeadTimeVariabilityDraftMode {
  const variabilityClass = deriveCatalogVariabilityClass(sku);
  return matchesLeadTimePresetStdDays(sku, variabilityClass) ? 'class' : 'std';
}

export function SkuFormRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const { skuId } = useParams();
  const { catalog, ingestSenaObservation, isSaving, snapshot, upsertSenaCatalog } = useInventory();
  const { canGoBack, goBack, previousLocation } = useNavigationHistory();
  const { currency, language, t, usdToKhrExchangeRate } = usePreferences();
  const editing = Boolean(skuId);
  const initialExistingSku = catalog?.skus.find((entry) => entry.skuId === skuId) ?? null;
  const [localSavedSku, setLocalSavedSku] = useState<SenaSku | null>(() => initialExistingSku);
  const [form, setForm] = useState<SenaSku>(() => initialExistingSku ?? emptySku(skuId));
  const [costPerUnitDraft, setCostPerUnitDraft] = useState(() =>
    moneyDraftFromUsd((initialExistingSku ?? emptySku(skuId)).costPerUnit, currency, usdToKhrExchangeRate),
  );
  const [productPriceDraft, setProductPriceDraft] = useState(() =>
    moneyDraftFromUsd((initialExistingSku ?? emptySku(skuId)).productPrice, currency, usdToKhrExchangeRate),
  );
  const [leadTimeStdDaysDraft, setLeadTimeStdDaysDraft] = useState(() =>
    stdDaysDraftFromValue((initialExistingSku ?? emptySku(skuId)).leadTimeStdDaysHint),
  );
  const [leadTimeVariability, setLeadTimeVariability] = useState<SenaLeadTimeVariabilityClass | ''>(
    () => deriveCatalogVariabilityClass(initialExistingSku ?? emptySku(skuId)) ?? '',
  );
  const [leadTimeDraftMode, setLeadTimeDraftMode] = useState<LeadTimeVariabilityDraftMode>(() =>
    deriveLeadTimeDraftMode(initialExistingSku ?? emptySku(skuId)),
  );
  const [saveAttempted, setSaveAttempted] = useState(false);
  const [saveErrorFlashKey, setSaveErrorFlashKey] = useState(0);
  const [attributeDraft, setAttributeDraft] = useState(emptyProductAttributeDraft);
  const [customAttributePresets, setCustomAttributePresets] = useState(() => readCustomProductAttributePresets());
  const formId = 'sku-editor-form';
  const existingSku = useMemo(
    () => catalog?.skus.find((entry) => entry.skuId === skuId) ?? null,
    [catalog?.skus, skuId],
  );
  const previousMoneyFormatRef = useRef({ currency, usdToKhrExchangeRate });

  useEffect(() => {
    if (existingSku) {
      setLocalSavedSku(existingSku);
      setForm(existingSku);
      setCostPerUnitDraft(moneyDraftFromUsd(existingSku.costPerUnit, currency, usdToKhrExchangeRate));
      setProductPriceDraft(moneyDraftFromUsd(existingSku.productPrice, currency, usdToKhrExchangeRate));
      setLeadTimeStdDaysDraft(stdDaysDraftFromValue(existingSku.leadTimeStdDaysHint));
      setLeadTimeVariability(deriveCatalogVariabilityClass(existingSku) ?? '');
      setLeadTimeDraftMode(deriveLeadTimeDraftMode(existingSku));
      setAttributeDraft(emptyProductAttributeDraft());
    } else if (!editing) {
      setLocalSavedSku(null);
      setForm(emptySku(''));
      setCostPerUnitDraft('');
      setProductPriceDraft('');
      setLeadTimeStdDaysDraft('');
      setLeadTimeVariability('');
      setLeadTimeDraftMode('std');
      setAttributeDraft(emptyProductAttributeDraft());
    }
  }, [editing, existingSku?.skuId]);

  useEffect(() => {
    const previousMoneyFormat = previousMoneyFormatRef.current;
    if (
      previousMoneyFormat.currency === currency &&
      previousMoneyFormat.usdToKhrExchangeRate === usdToKhrExchangeRate
    ) {
      return;
    }

    const previousCostPerUnitDraft = moneyDraftFromUsd(
      form.costPerUnit,
      previousMoneyFormat.currency,
      previousMoneyFormat.usdToKhrExchangeRate,
    );
    const previousProductPriceDraft = moneyDraftFromUsd(
      form.productPrice,
      previousMoneyFormat.currency,
      previousMoneyFormat.usdToKhrExchangeRate,
    );
    if (costPerUnitDraft === previousCostPerUnitDraft) {
      setCostPerUnitDraft(moneyDraftFromUsd(form.costPerUnit, currency, usdToKhrExchangeRate));
    }
    if (productPriceDraft === previousProductPriceDraft) {
      setProductPriceDraft(moneyDraftFromUsd(form.productPrice, currency, usdToKhrExchangeRate));
    }
    previousMoneyFormatRef.current = { currency, usdToKhrExchangeRate };
  }, [costPerUnitDraft, currency, form.costPerUnit, form.productPrice, productPriceDraft, usdToKhrExchangeRate]);

  useEffect(() => {
    if (leadTimeDraftMode === 'class') {
      const syncedStdDays = deriveLeadTimeFromVariabilityClass(form.leadTimeMeanDaysHint, leadTimeVariability || null).stdDays;
      setLeadTimeStdDaysDraft(stdDaysDraftFromValue(syncedStdDays));
      return;
    }

    const parsedStdDays = parseOptionalNumber(leadTimeStdDaysDraft);
    const syncedClass = deriveLeadTimeFromStdDays(form.leadTimeMeanDaysHint, parsedStdDays).variabilityClass ?? '';
    setLeadTimeVariability(syncedClass);
  }, [form.leadTimeMeanDaysHint, leadTimeDraftMode, leadTimeStdDaysDraft, leadTimeVariability]);

  const normalizedBaseline = useMemo(() => localSavedSku ?? emptySku(editing ? (skuId ?? '') : ''), [editing, localSavedSku, skuId]);
  const baselineLeadTimeVariability = useMemo(
    () => deriveCatalogVariabilityClass(normalizedBaseline) ?? '',
    [normalizedBaseline],
  );
  const normalizedDraft = useMemo(() => {
    const parsedLeadTimeStdDaysHint = parseOptionalNumber(leadTimeStdDaysDraft);
    const leadTimeStdDaysHint =
      parsedLeadTimeStdDaysHint ??
      (form.leadTimeMeanDaysHint === normalizedBaseline.leadTimeMeanDaysHint &&
      leadTimeVariability === baselineLeadTimeVariability
        ? normalizedBaseline.leadTimeStdDaysHint
        : deriveLeadTimeFromVariabilityClass(form.leadTimeMeanDaysHint, leadTimeVariability || null).stdDays);

    return {
      ...form,
      skuId: form.skuId.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
      supplierName: form.supplierName?.trim() || null,
      leadTimeStdDaysHint,
    };
  }, [baselineLeadTimeVariability, form, leadTimeStdDaysDraft, leadTimeVariability, normalizedBaseline]);
  const draftDirtySnapshot = useMemo(
    () => normalizedSkuDirtySnapshot(form, leadTimeVariability),
    [form, leadTimeVariability],
  );
  const baselineDirtySnapshot = useMemo(
    () => normalizedSkuDirtySnapshot(normalizedBaseline, baselineLeadTimeVariability),
    [baselineLeadTimeVariability, normalizedBaseline],
  );
  const baselineCostPerUnitDraft = editing
    ? moneyDraftFromUsd(normalizedBaseline.costPerUnit, currency, usdToKhrExchangeRate)
    : '';
  const parsedCostPerUnitDraft = parseNonNegativeMoneyDraft(costPerUnitDraft, currency, usdToKhrExchangeRate);
  const parsedProductPriceDraft = productPriceDraft.trim()
    ? parseNonNegativeMoneyDraft(productPriceDraft, currency, usdToKhrExchangeRate)
    : null;
  const attributeCombinationCount = useMemo(
    () => productAttributeCombinationCount(attributeDraft),
    [attributeDraft],
  );
  const skuValidationErrors = {
    name: !form.name.trim() ? t('catalogSkuEditorNameRequired') : null,
    costPerUnit: !costPerUnitDraft.trim()
      ? t('catalogSkuEditorCostRequired')
      : parsedCostPerUnitDraft == null
        ? translateUiLiteral(language, 'Enter a non-negative finite cost before saving.')
        : null,
    productPrice:
      form.soldAsProduct && productPriceDraft.trim() && parsedProductPriceDraft == null
        ? translateUiLiteral(language, 'Enter a non-negative finite selling price before saving.')
        : null,
    leadTimeMeanDays: form.leadTimeMeanDaysHint == null ? t('catalogSkuEditorLeadTimeMeanRequired') : null,
    leadTimeUncertainty:
      leadTimeDraftMode === 'std'
        ? !leadTimeStdDaysDraft.trim()
          ? t('catalogSkuEditorLeadTimeUncertaintyRequired')
          : null
        : !leadTimeVariability
        ? t('catalogSkuEditorLeadTimeUncertaintyRequired')
        : null,
    attributes: attributeCombinationCount > MAX_PRODUCT_ATTRIBUTE_VARIANTS
      ? translateUiLiteral(language, 'Choose 100 or fewer variants before saving.')
      : null,
  };
  const hasSkuValidationErrors = Object.values(skuValidationErrors).some(Boolean);
  const visibleSkuValidationErrors = saveAttempted ? skuValidationErrors : {
    ...skuValidationErrors,
    costPerUnit: skuValidationErrors.costPerUnit,
    productPrice: skuValidationErrors.productPrice,
  };
  const attributePresets = useMemo(
    () => mergedProductAttributePresets(customAttributePresets),
    [customAttributePresets],
  );
  const attributeCombinations = useMemo(
    () => productAttributeCombinations(attributeDraft),
    [attributeDraft],
  );
  const hasUnsavedSkuChanges =
    JSON.stringify(draftDirtySnapshot) !== JSON.stringify(baselineDirtySnapshot) ||
    costPerUnitDraft !== baselineCostPerUnitDraft ||
    productAttributeDraftDirtyKey(attributeDraft) !== productAttributeDraftDirtyKey(emptyProductAttributeDraft());
  function resetSkuDraft() {
    setForm(normalizedBaseline);
    setCostPerUnitDraft(moneyDraftFromUsd(normalizedBaseline.costPerUnit, currency, usdToKhrExchangeRate));
    setProductPriceDraft(moneyDraftFromUsd(normalizedBaseline.productPrice, currency, usdToKhrExchangeRate));
    setLeadTimeStdDaysDraft(stdDaysDraftFromValue(normalizedBaseline.leadTimeStdDaysHint));
    setLeadTimeVariability(baselineLeadTimeVariability);
    setLeadTimeDraftMode(deriveLeadTimeDraftMode(normalizedBaseline));
    setAttributeDraft(emptyProductAttributeDraft());
    setSaveAttempted(false);
    setSaveErrorFlashKey(0);
  }

  const { confirmLeave, discardConfirmDialog } = useRouteLeaveConfirm({
    enabled: hasUnsavedSkuChanges,
    description: t('skuEditorUnsavedLeavePrompt'),
    isSaveDisabled: hasSkuValidationErrors || isSaving,
    onDiscard: resetSkuDraft,
    onSave: (continueAfterSave) => saveSkuDraft({ afterSave: continueAfterSave, navigateAfterCreate: false }),
    saveLabel: t('saveDraft'),
  });

  const detailNavigationState = buildKaurKhorNavigationState(location, '/catalog');
  const currentOrigin =
    location.state &&
    typeof location.state === 'object' &&
    'kaurKhorNavigationOrigin' in location.state &&
    typeof location.state.kaurKhorNavigationOrigin === 'string'
      ? location.state.kaurKhorNavigationOrigin
      : null;
  const detailNavigationOrigin = currentOrigin ?? previousLocation ?? '/catalog';
  const detailPath = editing ? `/catalog/skus/${normalizedBaseline.skuId}` : null;

  function openDetails() {
    if (!detailPath) {
      return;
    }
    confirmLeave(() => {
      void navigate(detailPath, {
        state: {
          ...detailNavigationState,
          kaurKhorNavigationOrigin: detailNavigationOrigin,
        },
      });
    });
  }

  async function saveSkuDraft({
    afterSave,
    navigateAfterCreate,
  }: {
    afterSave?: () => void;
    navigateAfterCreate: boolean;
  }) {
    setSaveAttempted(true);
    if (hasSkuValidationErrors) {
      setSaveErrorFlashKey((current) => current + 1);
      return false;
    }
    const baseCatalog = catalog ?? emptySenaCatalog();
    const nextSku = editing
      ? normalizedDraft
      : {
          ...normalizedDraft,
          skuId: createUniqueSkuId(baseCatalog),
        };
    const catalogWithBase = upsertSenaSku(baseCatalog, nextSku, normalizedBaseline.skuId);
    const nextCatalog = createSkuAttributeVariants(catalogWithBase, nextSku, attributeCombinations);
    await upsertSenaCatalog(nextCatalog);
    const observation = editing
      ? buildSkuCatalogEditObservation({
          baseline: normalizedBaseline,
          next: nextSku,
          snapshot,
        })
      : null;
    if (observation) {
      await ingestSenaObservation(observation);
    }
    setLocalSavedSku(nextSku);
    setForm(nextSku);
    setCostPerUnitDraft(moneyDraftFromUsd(nextSku.costPerUnit, currency, usdToKhrExchangeRate));
    setProductPriceDraft(moneyDraftFromUsd(nextSku.productPrice, currency, usdToKhrExchangeRate));
    setLeadTimeStdDaysDraft(stdDaysDraftFromValue(nextSku.leadTimeStdDaysHint));
    setLeadTimeVariability(deriveCatalogVariabilityClass(nextSku) ?? '');
    setLeadTimeDraftMode(deriveLeadTimeDraftMode(nextSku));
    const nextCustomPresets = mergeCustomProductAttributePresets(customAttributePresets, attributeDraft);
    writeCustomProductAttributePresets(nextCustomPresets);
    setCustomAttributePresets(readCustomProductAttributePresets());
    setAttributeDraft(emptyProductAttributeDraft());
    setSaveAttempted(false);
    setSaveErrorFlashKey(0);
    afterSave?.();
    if (!editing && navigateAfterCreate) {
      await navigate(`/catalog/skus/${nextSku.skuId}`, {
        replace: true,
        state: {
          ...detailNavigationState,
          kaurKhorNavigationOrigin: detailNavigationOrigin,
        },
      });
    }
    return true;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await saveSkuDraft({ navigateAfterCreate: true });
  }

  function renderSellAsProductControl(compact = false) {
    return (
      <CheckboxRow
        checked={form.soldAsProduct}
        className={compact ? 'min-h-14 rounded-xl py-0' : undefined}
        helper={compact ? undefined : t('catalogSkuEditorSellAsProductHelper')}
        label={
          <SectionLabel helpHref="/settings/help#catalog-sku-editor-sell-as-product" tooltip={t('catalogSkuEditorSellAsProductTooltip')}>
            {t('fieldSoldAsProduct')}
          </SectionLabel>
        }
        onCheckedChange={(checked) => {
          setProductPriceDraft(checked ? moneyDraftFromUsd(form.productPrice, currency, usdToKhrExchangeRate) : '');
          setForm((current) => ({
            ...current,
            soldAsProduct: checked,
            productPrice: checked ? current.productPrice : null,
          }));
        }}
      />
    );
  }

  return (
    <WorkspacePage className="pb-32 md:pb-36">
      {discardConfirmDialog}
      <SkuPageHero
        actions={
          <WorkspaceActionRow>
            {detailPath ? (
              <Button type="button" variant="outline" onClick={openDetails}>
                <ActionEyeIcon data-icon="inline-start" />
                {translateUiLiteral(language, 'Details')}
              </Button>
            ) : null}
            <Button disabled={(editing && !hasUnsavedSkuChanges) || isSaving} form={formId} type="submit">
              <ActionSaveIcon data-icon="inline-start" />
              {editing ? t('saveDraft') : t('createEntry')}
            </Button>
          </WorkspaceActionRow>
        }
        onBack={canGoBack ? () => confirmLeave(goBack) : undefined}
        title={editing ? t('catalogSkuEditorTitleEdit') : t('catalogSkuEditorTitleNew')}
      />

      <form
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]"
        id={formId}
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
      >
        <div className="grid min-w-0 gap-6">
          <WorkspacePanel
            className={editorPanelClassName}
            descriptor={t('catalogSkuEditorDetailsDescriptor')}
            title={
              <SectionTitle
                helpHref="/settings/help#catalog-sku-editor-details"
                title={t('editorDetailsTitle')}
                tooltip={t('catalogSkuEditorDetailsTooltip')}
              />
            }
          >
            <div className="grid items-start gap-4 md:grid-cols-2">
              <EditorField
                error={visibleSkuValidationErrors.name ?? undefined}
                errorFlashKey={saveErrorFlashKey}
                helper={t('catalogSkuEditorNameHelper')}
                label={t('fieldName')}
              >
                <input
                  autoFocus
                  className={editorInputClassName}
                  required
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
              </EditorField>
              <EditorField
                errorFlashKey={saveErrorFlashKey}
                helper={t('catalogSkuEditorSupplierHelper')}
                label={t('fieldSupplier')}
              >
                <SupplierField
                  catalog={catalog}
                  inputClassName={editorInputClassName}
                  placeholder={t('catalogSkuEditorSupplierPlaceholder')}
                  value={form.supplierName ?? ''}
                  onChange={(value) => setForm((current) => ({ ...current, supplierName: value }))}
                />
              </EditorField>
            </div>

            <EditorField helper={t('catalogSkuEditorDescriptionHelper')} label={t('fieldDescription')}>
              <textarea
                className={editorTextareaClassName}
                value={form.description}
                onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              />
            </EditorField>

            <CatalogImageField
              helper="Choose, drop, or paste one PNG, JPEG, or WebP picture for this SKU. Kaur Khor will show it on supported item surfaces."
              imagePath={form.imagePath}
              label="Picture"
              name={form.name || 'SKU image'}
              type="sku"
              onChange={(value) => setForm((current) => ({ ...current, imagePath: value }))}
            />
          </WorkspacePanel>

          <WorkspacePanel
            className={editorPanelClassName}
            descriptor={translateUiLiteral(language, 'Create active variants from selected attributes when saving this SKU.')}
            title={<SectionTitle helpHref="/settings/help#catalog-sku-editor-details" title={translateUiLiteral(language, 'Attributes')} tooltip={translateUiLiteral(language, 'Generate SKU variants without copying logs, observations, or captures.')} />}
          >
            <ProductAttributesField
              draft={attributeDraft}
              language={language}
              presets={attributePresets}
              onChange={setAttributeDraft}
            />
          </WorkspacePanel>

          <WorkspacePanel
            className={editorPanelClassName}
            descriptor={t('catalogSkuEditorPricingDescriptor')}
            title={<SectionTitle helpHref="/settings/help#catalog-sku-editor-pricing" title={t('editorPricingTitle')} tooltip={t('catalogSkuEditorPricingTooltip')} />}
          >
            <EditorField
              error={visibleSkuValidationErrors.costPerUnit ?? undefined}
              errorFlashKey={saveErrorFlashKey}
              helper={t('catalogSkuEditorCostHelper')}
              label={t('fieldCostPerUnit')}
            >
              <CurrencyNumberInput
                aria-invalid={visibleSkuValidationErrors.costPerUnit ? 'true' : 'false'}
                className={editorInputClassName}
                currency={currency}
                min="0"
                required
                value={costPerUnitDraft}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setCostPerUnitDraft(nextValue);
                  if (!nextValue.trim()) {
                    return;
                  }
                  setForm((current) => ({
                    ...current,
                    costPerUnit: usdMoneyFromDisplay(parseEditableNumberWithCommas(nextValue), currency, usdToKhrExchangeRate),
                  }));
                }}
              />
            </EditorField>

            {form.soldAsProduct ? (
              <div className="grid gap-2">
                <div className="flex min-h-8 items-center text-sm font-medium text-foreground">
                  <SectionLabel helpHref="/settings/help#catalog-sku-editor-pricing" tooltip={t('catalogSkuEditorRetailPriceTooltip')}>
                    {t('fieldProductPrice')}
                  </SectionLabel>
                </div>
                <div className="grid items-start gap-4 md:grid-cols-2">
                  {renderSellAsProductControl(true)}
                  <label className="grid w-full content-start gap-2 text-sm">
                    <CurrencyNumberInput
                      aria-label={t('fieldProductPrice')}
                      aria-invalid={visibleSkuValidationErrors.productPrice ? 'true' : 'false'}
                      className={editorInputClassName}
                      currency={currency}
                      min="0"
                      value={productPriceDraft}
                      onChange={(event) => {
                        const nextValue = event.target.value;
                        setProductPriceDraft(nextValue);
                        setForm((current) => ({
                          ...current,
                          productPrice:
                            nextValue.trim().length > 0
                              ? usdMoneyFromDisplay(parseEditableNumberWithCommas(nextValue), currency, usdToKhrExchangeRate)
                              : null,
                        }));
                      }}
                    />
                    <span className="text-xs leading-5 text-muted-foreground">{t('catalogSkuEditorRetailPriceHelper')}</span>
                    {visibleSkuValidationErrors.productPrice ? (
                      <SaveErrorFlash className="text-xs leading-5 text-destructive" flashKey={saveErrorFlashKey}>
                        {visibleSkuValidationErrors.productPrice}
                      </SaveErrorFlash>
                    ) : null}
                  </label>
                </div>
              </div>
            ) : (
              renderSellAsProductControl()
            )}
          </WorkspacePanel>
        </div>

        <WorkspacePanel
          className={editorPanelClassName}
          descriptor={t('catalogSkuEditorPlanningDescriptor')}
          title={<SectionTitle helpHref="/settings/help#catalog-sku-editor-planning" title={t('catalogSkuPlanningInputsTitle')} tooltip={t('catalogSkuEditorPlanningTooltip')} />}
        >
          <EditorField
            error={visibleSkuValidationErrors.leadTimeMeanDays ?? undefined}
            errorFlashKey={saveErrorFlashKey}
            helper={t('catalogSkuEditorLeadTimeMeanHelper')}
            helpHref="/settings/help#catalog-sku-editor-planning"
            label={t('fieldLeadTimeMeanDays')}
            tooltip={t('catalogSkuEditorLeadTimeMeanTooltip')}
          >
            <NumberStepperInput
              className={editorInputClassName}
              data-testid="sku-lead-time-mean-days-input"
              min="0"
              step="0.01"
              value={form.leadTimeMeanDaysHint ?? ''}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  leadTimeMeanDaysHint: parseOptionalNumber(event.target.value),
                }))
              }
            />
          </EditorField>

          <EditorField
            error={visibleSkuValidationErrors.leadTimeUncertainty ?? undefined}
            errorFlashKey={saveErrorFlashKey}
            helper={t('catalogSkuEditorLeadTimeVariabilityHelper')}
            helpHref="/settings/help#catalog-sku-editor-planning"
            hint={t('catalogSkuEditorLeadTimeVariabilityHint')}
            label={t('fieldLeadTimeVariability')}
            tooltip={t('catalogSkuEditorLeadTimeVariabilityTooltip')}
          >
            <LeadTimeVariabilityField
              customInputClassName={editorInputClassName}
              customStdDays={leadTimeStdDaysDraft}
              language={language}
              meanDays={form.leadTimeMeanDaysHint}
              mode={leadTimeDraftMode}
              placeholder={t('catalogSkuLeadTimeVariabilityPlaceholder')}
              selectContentPosition="popper"
              selectTriggerClassName={editorSelectTriggerClassName}
              value={leadTimeVariability}
              onCustomStdDaysChange={(value) => {
                setLeadTimeDraftMode('std');
                setLeadTimeStdDaysDraft(value);
              }}
              onModeChange={setLeadTimeDraftMode}
              onValueChange={(value) => {
                setLeadTimeVariability(value);
                if (value) {
                  setLeadTimeStdDaysDraft(derivedStdDaysDraft(form.leadTimeMeanDaysHint, value));
                }
              }}
            />
          </EditorField>
        </WorkspacePanel>
      </form>
    </WorkspacePage>
  );
}
