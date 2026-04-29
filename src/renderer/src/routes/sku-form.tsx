import { ActionSaveIcon } from '@icons/actions';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import type { SenaLeadTimeVariabilityClass, SenaSku } from '@shared/sena';
import {
  deriveLeadTimeFromStdDays,
  deriveLeadTimeFromVariabilityClass,
  leadTimeVariabilityOptions,
} from '@shared/sena-lead-time';
import { CheckboxRow } from '@/components/system/checkbox-row';
import { SupplierField } from '@/components/system/supplier';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRouteLeaveConfirm } from '@/hooks/use-route-leave-confirm';
import { displayMoneyFromUsd, moneyInputStep, usdMoneyFromDisplay } from '@/lib/format';
import {
  leadTimeVariabilityPlaceholderValue,
  shouldShowLeadTimeVariabilityPlaceholder,
} from '@/lib/lead-time-variability-select';
import { translateLeadTimeVariabilityLabel } from '@/lib/localized-display';
import { createUniqueSkuId, emptySenaCatalog, upsertSenaSku } from '@/lib/sena-catalog';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { buildBanjiNavigationState, useNavigationHistory } from '@/state/navigation-history';
import { usePreferences } from '@/state/preferences';
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
type LeadTimeDraftMode = 'class' | 'std';

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
  return value.trim() ? Number(value) : null;
}

function moneyDraftFromUsd(amount: number | null, currency: 'USD' | 'KHR', usdToKhrExchangeRate: number) {
  if (amount == null) {
    return '';
  }
  return String(displayMoneyFromUsd(amount, currency, usdToKhrExchangeRate));
}

function deriveCatalogVariabilityClass(sku: SenaSku): SenaLeadTimeVariabilityClass | null {
  return deriveLeadTimeFromStdDays(sku.leadTimeMeanDaysHint, sku.leadTimeStdDaysHint).variabilityClass;
}

function stdDaysDraftFromValue(value: number | null) {
  return value == null ? '' : String(value);
}

function deriveLeadTimeDraftMode(sku: SenaSku): LeadTimeDraftMode {
  return sku.leadTimeStdDaysHint == null && deriveCatalogVariabilityClass(sku) ? 'class' : 'std';
}

export function SkuFormRoute() {
  const location = useLocation();
  const navigate = useNavigate();
  const { skuId } = useParams();
  const { catalog, isSaving, upsertSenaCatalog } = useInventory();
  const { canGoBack, goBack, previousLocation } = useNavigationHistory();
  const { currency, language, t, usdToKhrExchangeRate } = usePreferences();
  const editing = Boolean(skuId);
  const initialExistingSku = catalog?.skus.find((entry) => entry.skuId === skuId) ?? null;
  const [form, setForm] = useState<SenaSku>(() => initialExistingSku ?? emptySku(skuId));
  const [costPerUnitDraft, setCostPerUnitDraft] = useState(() =>
    moneyDraftFromUsd((initialExistingSku ?? emptySku(skuId)).costPerUnit, currency, usdToKhrExchangeRate),
  );
  const [productPriceDraft, setProductPriceDraft] = useState(() =>
    moneyDraftFromUsd((initialExistingSku ?? emptySku(skuId)).productPrice, currency, usdToKhrExchangeRate),
  );
  const [priceEnableHintActive, setPriceEnableHintActive] = useState(false);
  const [leadTimeStdDaysDraft, setLeadTimeStdDaysDraft] = useState(() =>
    stdDaysDraftFromValue((initialExistingSku ?? emptySku(skuId)).leadTimeStdDaysHint),
  );
  const [leadTimeVariability, setLeadTimeVariability] = useState<SenaLeadTimeVariabilityClass | ''>(
    () => deriveCatalogVariabilityClass(initialExistingSku ?? emptySku(skuId)) ?? '',
  );
  const [leadTimeDraftMode, setLeadTimeDraftMode] = useState<LeadTimeDraftMode>(() =>
    deriveLeadTimeDraftMode(initialExistingSku ?? emptySku(skuId)),
  );
  const formId = 'sku-editor-form';
  const existingSku = useMemo(
    () => catalog?.skus.find((entry) => entry.skuId === skuId) ?? null,
    [catalog?.skus, skuId],
  );

  useEffect(() => {
    if (existingSku) {
      setForm(existingSku);
      setCostPerUnitDraft(moneyDraftFromUsd(existingSku.costPerUnit, currency, usdToKhrExchangeRate));
      setProductPriceDraft(moneyDraftFromUsd(existingSku.productPrice, currency, usdToKhrExchangeRate));
      setLeadTimeStdDaysDraft(stdDaysDraftFromValue(existingSku.leadTimeStdDaysHint));
      setLeadTimeVariability(deriveCatalogVariabilityClass(existingSku) ?? '');
      setLeadTimeDraftMode(deriveLeadTimeDraftMode(existingSku));
    } else if (!editing) {
      setForm(emptySku(''));
      setCostPerUnitDraft(moneyDraftFromUsd(emptySku('').costPerUnit, currency, usdToKhrExchangeRate));
      setProductPriceDraft('');
      setLeadTimeStdDaysDraft('');
      setLeadTimeVariability('');
      setLeadTimeDraftMode('std');
    }
  }, [currency, editing, existingSku, usdToKhrExchangeRate]);

  useEffect(() => {
    if (form.soldAsProduct && priceEnableHintActive) {
      setPriceEnableHintActive(false);
    }
  }, [form.soldAsProduct, priceEnableHintActive]);

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

  const normalizedBaseline = useMemo(() => existingSku ?? emptySku(editing ? (skuId ?? '') : ''), [editing, existingSku, skuId]);
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
  const costPerUnitError = !costPerUnitDraft.trim() ? t('catalogSkuEditorCostRequired') : null;
  const hasUnsavedSkuChanges = JSON.stringify(draftDirtySnapshot) !== JSON.stringify(baselineDirtySnapshot);
  function resetSkuDraft() {
    setForm(normalizedBaseline);
    setCostPerUnitDraft(moneyDraftFromUsd(normalizedBaseline.costPerUnit, currency, usdToKhrExchangeRate));
    setProductPriceDraft(moneyDraftFromUsd(normalizedBaseline.productPrice, currency, usdToKhrExchangeRate));
    setLeadTimeStdDaysDraft(stdDaysDraftFromValue(normalizedBaseline.leadTimeStdDaysHint));
    setLeadTimeVariability(baselineLeadTimeVariability);
    setLeadTimeDraftMode(deriveLeadTimeDraftMode(normalizedBaseline));
  }

  const { confirmLeave, discardConfirmDialog } = useRouteLeaveConfirm({
    enabled: hasUnsavedSkuChanges,
    description: t('skuEditorUnsavedLeavePrompt'),
    onDiscard: resetSkuDraft,
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (costPerUnitError) {
      return;
    }
    const baseCatalog = catalog ?? emptySenaCatalog();
    const nextSku = editing
      ? normalizedDraft
      : {
          ...normalizedDraft,
          skuId: createUniqueSkuId(baseCatalog),
        };
    const nextCatalog = upsertSenaSku(baseCatalog, nextSku, normalizedBaseline.skuId);
    await upsertSenaCatalog(nextCatalog);
    const detailNavigationState = buildBanjiNavigationState(location, '/catalog');
    const currentOrigin =
      location.state &&
      typeof location.state === 'object' &&
      'banjiNavigationOrigin' in location.state &&
      typeof location.state.banjiNavigationOrigin === 'string'
        ? location.state.banjiNavigationOrigin
        : null;
    await navigate(`/catalog/skus/${nextSku.skuId}`, {
      replace: true,
      state: {
        ...detailNavigationState,
        banjiNavigationOrigin: currentOrigin ?? previousLocation ?? '/catalog',
      },
    });
  }

  return (
    <WorkspacePage>
      {discardConfirmDialog}
      <SkuPageHero
        actions={
          <WorkspaceActionRow>
            <Button disabled={!hasUnsavedSkuChanges || isSaving || costPerUnitError != null} form={formId} type="submit">
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
              <EditorField helper={t('catalogSkuEditorNameHelper')} label={t('fieldName')}>
                <input
                  className={editorInputClassName}
                  required
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                />
              </EditorField>
              <EditorField helper={t('catalogSkuEditorSupplierHelper')} label={t('fieldSupplier')}>
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
              helper="Choose, drop, or paste one PNG, JPEG, or WebP picture for this SKU. banji will show it on supported item surfaces."
              imagePath={form.imagePath}
              label="Picture"
              name={form.name || 'SKU image'}
              type="sku"
              onChange={(value) => setForm((current) => ({ ...current, imagePath: value }))}
            />
          </WorkspacePanel>

          <WorkspacePanel
            className={editorPanelClassName}
            descriptor={t('catalogSkuEditorPricingDescriptor')}
            title={<SectionTitle helpHref="/settings/help#catalog-sku-editor-pricing" title={t('editorPricingTitle')} tooltip={t('catalogSkuEditorPricingTooltip')} />}
          >
            <div className="grid items-start gap-4 md:grid-cols-2">
              <EditorField error={costPerUnitError ?? undefined} helper={t('catalogSkuEditorCostHelper')} label={t('fieldCostPerUnit')}>
                <input
                  aria-invalid={costPerUnitError ? 'true' : 'false'}
                  className={editorInputClassName}
                  min="0"
                  required
                  step={moneyInputStep(currency)}
                  type="number"
                  value={costPerUnitDraft}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setCostPerUnitDraft(nextValue);
                    if (!nextValue.trim()) {
                      return;
                    }
                    setForm((current) => ({
                      ...current,
                      costPerUnit: usdMoneyFromDisplay(Number(nextValue), currency, usdToKhrExchangeRate),
                    }));
                  }}
                />
              </EditorField>

              <EditorField
                error={!form.soldAsProduct && priceEnableHintActive ? t('catalogSkuEditorRetailPriceEnableHint') : undefined}
                helper={
                  form.soldAsProduct
                    ? t('catalogSkuEditorRetailPriceHelper')
                    : t('catalogSkuEditorRetailPriceEnableHint')
                }
                label={t('fieldProductPrice')}
                helpHref="/settings/help#catalog-sku-editor-pricing"
                tooltip={t('catalogSkuEditorRetailPriceTooltip')}
              >
                <input
                  aria-disabled={!form.soldAsProduct}
                  className={cn(
                    editorInputClassName,
                    !form.soldAsProduct && 'cursor-not-allowed text-muted-foreground',
                  )}
                  min="0"
                  readOnly={!form.soldAsProduct}
                  step={moneyInputStep(currency)}
                  type="number"
                  value={productPriceDraft}
                  onClick={() => {
                    if (!form.soldAsProduct) {
                      setPriceEnableHintActive(true);
                    }
                  }}
                  onFocus={() => {
                    if (!form.soldAsProduct) {
                      setPriceEnableHintActive(true);
                    }
                  }}
                  onChange={(event) => {
                    if (!form.soldAsProduct) {
                      setPriceEnableHintActive(true);
                      return;
                    }
                    const nextValue = event.target.value;
                    setProductPriceDraft(nextValue);
                    setForm((current) => ({
                      ...current,
                      productPrice:
                        nextValue.trim().length > 0
                          ? usdMoneyFromDisplay(Number(nextValue), currency, usdToKhrExchangeRate)
                          : null,
                    }));
                  }}
                />
              </EditorField>
            </div>

            <CheckboxRow
              checked={form.soldAsProduct}
              className={
                priceEnableHintActive && !form.soldAsProduct
                  ? 'border-destructive/60 bg-destructive/10 ring-2 ring-destructive/25'
                  : undefined
              }
              helper={t('catalogSkuEditorSellAsProductHelper')}
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
          </WorkspacePanel>
        </div>

        <WorkspacePanel
          className={editorPanelClassName}
          descriptor={t('catalogSkuEditorPlanningDescriptor')}
          title={<SectionTitle helpHref="/settings/help#catalog-sku-editor-planning" title={t('catalogSkuPlanningInputsTitle')} tooltip={t('catalogSkuEditorPlanningTooltip')} />}
        >
          <EditorField
            helper={t('catalogSkuEditorLeadTimeMeanHelper')}
            helpHref="/settings/help#catalog-sku-editor-planning"
            label={t('fieldLeadTimeMeanDays')}
            tooltip={t('catalogSkuEditorLeadTimeMeanTooltip')}
          >
            <input
              className={editorInputClassName}
              min="0"
              step="0.1"
              type="number"
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
            helper={t('overviewDrawerUncertaintyDescription')}
            label={t('overviewDrawerUncertaintyLabel')}
          >
            <input
              className={editorInputClassName}
              min="0"
              step="0.1"
              type="number"
              value={leadTimeStdDaysDraft}
              onChange={(event) => {
                setLeadTimeDraftMode('std');
                setLeadTimeStdDaysDraft(event.target.value);
              }}
            />
          </EditorField>

          <EditorField
            helper={t('catalogSkuEditorLeadTimeVariabilityHelper')}
            helpHref="/settings/help#catalog-sku-editor-planning"
            hint={t('catalogSkuEditorLeadTimeVariabilityHint')}
            label={t('fieldLeadTimeVariability')}
            tooltip={t('catalogSkuEditorLeadTimeVariabilityTooltip')}
          >
            <Select
              value={leadTimeVariability || leadTimeVariabilityPlaceholderValue}
              onValueChange={(value) => {
                const nextVariability =
                  value === leadTimeVariabilityPlaceholderValue ? '' : (value as SenaLeadTimeVariabilityClass);
                setLeadTimeDraftMode('class');
                setLeadTimeVariability(nextVariability);
                setLeadTimeStdDaysDraft(
                  stdDaysDraftFromValue(deriveLeadTimeFromVariabilityClass(form.leadTimeMeanDaysHint, nextVariability || null).stdDays),
                );
              }}
            >
              <SelectTrigger aria-label={t('fieldLeadTimeVariability')} className={editorSelectTriggerClassName}>
                <SelectValue placeholder={t('catalogSkuLeadTimeVariabilityPlaceholder')} />
              </SelectTrigger>
              <SelectContent align="start" position="popper">
                {shouldShowLeadTimeVariabilityPlaceholder(leadTimeVariability) ? (
                  <SelectItem value={leadTimeVariabilityPlaceholderValue}>
                    {t('catalogSkuLeadTimeVariabilityPlaceholder')}
                  </SelectItem>
                ) : null}
                {leadTimeVariabilityOptions().map((option) => (
                  <SelectItem key={option} value={option}>
                    {translateLeadTimeVariabilityLabel(language, option)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </EditorField>
        </WorkspacePanel>
      </form>
    </WorkspacePage>
  );
}
