import { ChevronDown, Save } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { SenaLeadTimeVariabilityClass, SenaSku } from '@shared/sena';
import {
  classifyLeadTimeVariability,
  compatibilityStdDaysForClass,
  impliedLeadTimeRangeFromMeanStd,
  leadTimeVariabilityLabel,
  leadTimeVariabilityOptions,
  relativeLeadTimeWidth,
} from '@shared/sena-lead-time';
import { CheckboxRow } from '@/components/system/checkbox-row';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { useRouteLeaveConfirm } from '@/hooks/use-route-leave-confirm';
import { displayMoneyFromUsd, moneyInputStep, usdMoneyFromDisplay } from '@/lib/format';
import { emptySenaCatalog, upsertSenaSku } from '@/lib/sena-catalog';
import { useInventory } from '@/state/inventory';
import { useNavigationHistory } from '@/state/navigation-history';
import { usePreferences } from '@/state/preferences';
import { EditorField, editorInputClassName, editorPanelClassName, editorTextareaClassName } from './editor-form-primitives';
import { SkuPageHero } from './sku-page-hero';
import { SectionLabel, SectionTitle } from './sku-detail/section-heading';

function emptySku(skuId = ''): SenaSku {
  return {
    skuId,
    name: '',
    description: '',
    costPerUnit: 0,
    soldAsProduct: false,
    productPrice: null,
    leadTimeMeanDaysHint: null,
    leadTimeStdDaysHint: null,
  };
}

const nativeSelectClassName =
  'h-14 w-full appearance-none rounded-xl border border-border bg-background px-3 pr-12 text-base shadow-none outline-none';

function normalizedSkuDirtySnapshot(sku: SenaSku, variabilityClass: SenaLeadTimeVariabilityClass | '') {
  return {
    skuId: sku.skuId.trim(),
    name: sku.name.trim(),
    description: sku.description.trim(),
    costPerUnit: sku.costPerUnit,
    soldAsProduct: sku.soldAsProduct,
    productPrice: sku.productPrice,
    leadTimeMeanDaysHint: sku.leadTimeMeanDaysHint,
    leadTimeVariability: variabilityClass,
  };
}

function parseOptionalNumber(value: string) {
  return value.trim() ? Number(value) : null;
}

function deriveCatalogVariabilityClass(sku: SenaSku): SenaLeadTimeVariabilityClass | null {
  if (sku.leadTimeMeanDaysHint == null || sku.leadTimeStdDaysHint == null) {
    return null;
  }
  const range = impliedLeadTimeRangeFromMeanStd(sku.leadTimeMeanDaysHint, sku.leadTimeStdDaysHint);
  return classifyLeadTimeVariability(relativeLeadTimeWidth(range?.lowDays ?? null, range?.highDays ?? null));
}

export function SkuFormRoute() {
  const navigate = useNavigate();
  const { skuId } = useParams();
  const { catalog, isSaving, upsertSenaCatalog } = useInventory();
  const { canGoBack, goBack } = useNavigationHistory();
  const { currency, t, usdToKhrExchangeRate } = usePreferences();
  const [form, setForm] = useState<SenaSku>(() => emptySku(skuId));
  const [leadTimeVariability, setLeadTimeVariability] = useState<SenaLeadTimeVariabilityClass | ''>('');
  const editing = Boolean(skuId);
  const formId = 'sku-editor-form';
  const existingSku = useMemo(
    () => catalog?.skus.find((entry) => entry.skuId === skuId) ?? null,
    [catalog?.skus, skuId],
  );

  useEffect(() => {
    if (existingSku) {
      setForm(existingSku);
      setLeadTimeVariability(deriveCatalogVariabilityClass(existingSku) ?? '');
    } else if (!editing) {
      setForm(emptySku(''));
      setLeadTimeVariability('');
    }
  }, [editing, existingSku]);

  const normalizedBaseline = useMemo(() => existingSku ?? emptySku(editing ? (skuId ?? '') : ''), [editing, existingSku, skuId]);
  const baselineLeadTimeVariability = useMemo(
    () => deriveCatalogVariabilityClass(normalizedBaseline) ?? '',
    [normalizedBaseline],
  );
  const normalizedDraft = useMemo(() => {
    const leadTimeStdDaysHint =
      form.leadTimeMeanDaysHint === normalizedBaseline.leadTimeMeanDaysHint &&
      leadTimeVariability === baselineLeadTimeVariability
        ? normalizedBaseline.leadTimeStdDaysHint
        : compatibilityStdDaysForClass(form.leadTimeMeanDaysHint, leadTimeVariability || null);

    return {
      ...form,
      skuId: form.skuId.trim(),
      name: form.name.trim(),
      description: form.description.trim(),
      leadTimeStdDaysHint,
    };
  }, [baselineLeadTimeVariability, form, leadTimeVariability, normalizedBaseline]);
  const draftDirtySnapshot = useMemo(
    () => normalizedSkuDirtySnapshot(form, leadTimeVariability),
    [form, leadTimeVariability],
  );
  const baselineDirtySnapshot = useMemo(
    () => normalizedSkuDirtySnapshot(normalizedBaseline, baselineLeadTimeVariability),
    [baselineLeadTimeVariability, normalizedBaseline],
  );
  const hasUnsavedSkuChanges = JSON.stringify(draftDirtySnapshot) !== JSON.stringify(baselineDirtySnapshot);
  function resetSkuDraft() {
    setForm(normalizedBaseline);
    setLeadTimeVariability(baselineLeadTimeVariability);
  }

  const { confirmLeave, discardConfirmDialog } = useRouteLeaveConfirm({
    enabled: hasUnsavedSkuChanges,
    description: 'You have unsaved SKU changes. Leave this page and discard the current draft?',
    onDiscard: resetSkuDraft,
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const baseCatalog = catalog ?? emptySenaCatalog();
    const nextCatalog = upsertSenaSku(baseCatalog, normalizedDraft);
    await upsertSenaCatalog(nextCatalog);
    await navigate(`/catalog/skus/${normalizedDraft.skuId}`);
  }

  return (
    <WorkspacePage>
      {discardConfirmDialog}
      <SkuPageHero
        actions={
          <WorkspaceActionRow>
            <Button disabled={!hasUnsavedSkuChanges || isSaving} form={formId} type="submit">
              <Save data-icon="inline-start" />
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
                title={t('editorDetailsTitle')}
                tooltip={t('catalogSkuEditorDetailsTooltip')}
              />
            }
          >
            <div className="grid items-start gap-4 md:grid-cols-2">
              <EditorField
                helper={editing ? t('catalogSkuEditorIdentifierDescription') : t('catalogSkuEditorIdentifierHelper')}
                label={t('fieldId')}
                tooltip={t('catalogSkuEditorDetailsTooltip')}
              >
                <input
                  className={editorInputClassName}
                  disabled={editing}
                  required
                  value={form.skuId}
                  onChange={(event) => setForm((current) => ({ ...current, skuId: event.target.value }))}
                />
              </EditorField>
              <EditorField helper={t('catalogSkuEditorNameHelper')} label={t('fieldName')}>
                <input
                  className={editorInputClassName}
                  required
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
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
          </WorkspacePanel>

          <WorkspacePanel
            className={editorPanelClassName}
            descriptor={t('catalogSkuEditorPricingDescriptor')}
            title={<SectionTitle title={t('editorPricingTitle')} tooltip={t('catalogSkuEditorPricingTooltip')} />}
          >
            <div className="grid items-start gap-4 md:grid-cols-2">
              <EditorField helper={t('catalogSkuEditorCostHelper')} label={t('fieldCostPerUnit')}>
                <input
                  className={editorInputClassName}
                  min="0"
                  required
                  step={moneyInputStep(currency)}
                  type="number"
                  value={displayMoneyFromUsd(form.costPerUnit, currency, usdToKhrExchangeRate)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      costPerUnit: usdMoneyFromDisplay(Number(event.target.value), currency, usdToKhrExchangeRate),
                    }))
                  }
                />
              </EditorField>

              <EditorField
                helper={t('catalogSkuEditorRetailPriceHelper')}
                label={t('fieldProductPrice')}
                tooltip={t('catalogSkuEditorRetailPriceTooltip')}
              >
                <input
                  className={editorInputClassName}
                  disabled={!form.soldAsProduct}
                  min="0"
                  step={moneyInputStep(currency)}
                  type="number"
                  value={form.productPrice == null ? '' : displayMoneyFromUsd(form.productPrice, currency, usdToKhrExchangeRate)}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      productPrice:
                        event.target.value.trim().length > 0
                          ? usdMoneyFromDisplay(Number(event.target.value), currency, usdToKhrExchangeRate)
                          : null,
                    }))
                  }
                />
              </EditorField>
            </div>

            <CheckboxRow
              checked={form.soldAsProduct}
              helper={t('catalogSkuEditorSellAsProductHelper')}
              label={
                <SectionLabel tooltip={t('catalogSkuEditorSellAsProductTooltip')}>
                  {t('fieldSoldAsProduct')}
                </SectionLabel>
              }
              onCheckedChange={(checked) =>
                setForm((current) => ({
                  ...current,
                  soldAsProduct: checked,
                  productPrice: checked ? current.productPrice : null,
                }))
              }
            />
          </WorkspacePanel>
        </div>

        <WorkspacePanel
          className={editorPanelClassName}
          descriptor={t('catalogSkuEditorPlanningDescriptor')}
          title={<SectionTitle title={t('catalogSkuPlanningInputsTitle')} tooltip={t('catalogSkuEditorPlanningTooltip')} />}
        >
          <EditorField
            helper={t('catalogSkuEditorLeadTimeMeanHelper')}
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
            helper={t('catalogSkuEditorLeadTimeVariabilityHelper')}
            hint={t('catalogSkuEditorLeadTimeVariabilityHint')}
            label={t('fieldLeadTimeVariability')}
            tooltip={t('catalogSkuEditorLeadTimeVariabilityTooltip')}
          >
            <div className="relative">
              <select
                aria-label={t('fieldLeadTimeVariability')}
                className={nativeSelectClassName}
                value={leadTimeVariability}
                onChange={(event) =>
                  setLeadTimeVariability((event.target.value as SenaLeadTimeVariabilityClass | '') || '')
                }
              >
                <option value="">{t('catalogSkuLeadTimeVariabilityPlaceholder')}</option>
                {leadTimeVariabilityOptions().map((option) => (
                  <option key={option} value={option}>
                    {leadTimeVariabilityLabel(option)}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-foreground">
                <ChevronDown className="size-5" />
              </span>
            </div>
          </EditorField>
        </WorkspacePanel>
      </form>
    </WorkspacePage>
  );
}
