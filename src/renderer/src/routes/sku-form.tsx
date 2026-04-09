import { ActionSaveIcon } from '@icons/actions';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { SenaLeadTimeVariabilityClass, SenaSku } from '@shared/sena';
import {
  classifyLeadTimeVariability,
  compatibilityStdDaysForClass,
  impliedLeadTimeRangeFromMeanStd,
  leadTimeVariabilityOptions,
  relativeLeadTimeWidth,
} from '@shared/sena-lead-time';
import { CheckboxRow } from '@/components/system/checkbox-row';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useRouteLeaveConfirm } from '@/hooks/use-route-leave-confirm';
import { displayMoneyFromUsd, moneyInputStep, usdMoneyFromDisplay } from '@/lib/format';
import { translateLeadTimeVariabilityLabel } from '@/lib/localized-display';
import { emptySenaCatalog, upsertSenaSku, validateCatalogEntityId } from '@/lib/sena-catalog';
import { useInventory } from '@/state/inventory';
import { useNavigationHistory } from '@/state/navigation-history';
import { usePreferences } from '@/state/preferences';
import { catalogItemIdErrorMessage } from './catalog-id-validation';
import { EditorField, editorInputClassName, editorPanelClassName, editorTextareaClassName } from './editor-form-primitives';
import { SkuPageHero } from './sku-page-hero';
import { SectionLabel, SectionTitle } from './sku-detail/section-heading';

function emptySku(skuId = ''): SenaSku {
  return {
    skuId,
    name: '',
    description: '',
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
const leadTimeVariabilityPlaceholderValue = '__none__';

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
  const { catalog, isSaving, renameCatalogEntity, upsertSenaCatalog } = useInventory();
  const { canGoBack, goBack } = useNavigationHistory();
  const { currency, language, t, usdToKhrExchangeRate } = usePreferences();
  const editing = Boolean(skuId);
  const initialExistingSku = catalog?.skus.find((entry) => entry.skuId === skuId) ?? null;
  const [form, setForm] = useState<SenaSku>(() => initialExistingSku ?? emptySku(skuId));
  const [leadTimeVariability, setLeadTimeVariability] = useState<SenaLeadTimeVariabilityClass | ''>(
    () => deriveCatalogVariabilityClass(initialExistingSku ?? emptySku(skuId)) ?? '',
  );
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
  const idError = useMemo(
    () =>
      catalogItemIdErrorMessage(
        t,
        validateCatalogEntityId(catalog, 'sku', form.skuId, editing ? normalizedBaseline.skuId : null),
      ),
    [catalog, editing, form.skuId, normalizedBaseline.skuId, t],
  );
  const hasUnsavedSkuChanges = JSON.stringify(draftDirtySnapshot) !== JSON.stringify(baselineDirtySnapshot);
  function resetSkuDraft() {
    setForm(normalizedBaseline);
    setLeadTimeVariability(baselineLeadTimeVariability);
  }

  const { confirmLeave, discardConfirmDialog } = useRouteLeaveConfirm({
    enabled: hasUnsavedSkuChanges,
    description: t('skuEditorUnsavedLeavePrompt'),
    onDiscard: resetSkuDraft,
  });

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (idError) {
      return;
    }
    const baseCatalog = catalog ?? emptySenaCatalog();
    if (editing && normalizedBaseline.skuId !== normalizedDraft.skuId) {
      await renameCatalogEntity({
        entityType: 'sku',
        previousId: normalizedBaseline.skuId,
        nextSku: normalizedDraft,
      });
    } else {
      const nextCatalog = upsertSenaSku(baseCatalog, normalizedDraft, normalizedBaseline.skuId);
      await upsertSenaCatalog(nextCatalog);
    }
    await navigate(`/catalog/skus/${normalizedDraft.skuId}`);
  }

  return (
    <WorkspacePage>
      {discardConfirmDialog}
      <SkuPageHero
        actions={
          <WorkspaceActionRow>
            <Button disabled={!hasUnsavedSkuChanges || isSaving || idError != null} form={formId} type="submit">
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
                title={t('editorDetailsTitle')}
                tooltip={t('catalogSkuEditorDetailsTooltip')}
              />
            }
          >
            <div className="grid items-start gap-4 md:grid-cols-2">
              <EditorField
                error={idError ?? undefined}
                helper={editing ? t('catalogSkuEditorIdentifierDescription') : t('catalogSkuEditorIdentifierHelper')}
                label={t('fieldId')}
                tooltip={t('catalogSkuEditorDetailsTooltip')}
              >
                <input
                  aria-invalid={idError ? 'true' : 'false'}
                  className={editorInputClassName}
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
            <Select
              value={leadTimeVariability || leadTimeVariabilityPlaceholderValue}
              onValueChange={(value) =>
                setLeadTimeVariability(
                  value === leadTimeVariabilityPlaceholderValue ? '' : (value as SenaLeadTimeVariabilityClass),
                )
              }
            >
              <SelectTrigger aria-label={t('fieldLeadTimeVariability')} className={editorSelectTriggerClassName}>
                <SelectValue placeholder={t('catalogSkuLeadTimeVariabilityPlaceholder')} />
              </SelectTrigger>
              <SelectContent align="start" position="popper">
                <SelectItem value={leadTimeVariabilityPlaceholderValue}>
                  {t('catalogSkuLeadTimeVariabilityPlaceholder')}
                </SelectItem>
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
