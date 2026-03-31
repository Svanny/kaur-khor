import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { FieldGroup } from '@/components/ui/field';
import { EditorHeader } from '@/components/system/editor';
import {
  TextAreaField,
  TextInputField,
} from '@/components/system/form-fields';
import { WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { useRouteLeaveConfirm } from '@/hooks/use-route-leave-confirm';
import {
  formatEditableMoney,
  formatEditableWholeNumber,
  sanitizeWholeNumberForDisplay,
} from '@/lib/format';
import {
  limits,
  normalizeText,
  validateEntryId,
  validateNonNegativeDecimal,
  validateRequiredText,
} from '@/lib/validation';
import { useInventory } from '@/state/inventory';
import { useNavigationHistory } from '@/state/navigation-history';
import { usePreferences } from '@/state/preferences';

function randomId(prefix: 'sku') {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

type SkuField =
  | 'skuId'
  | 'name'
  | 'description'
  | 'unitsInStock'
  | 'costPerUnit'
  | 'productPrice'
  | 'leadTimeMeanDays'
  | 'leadTimeStdDays';

export function SkuFormRoute() {
  const navigate = useNavigate();
  const { skuId } = useParams();
  const isNew = !skuId;
  const { snapshot, saveSku, isSaving } = useInventory();
  const { canGoBack, goBack } = useNavigationHistory();
  const { t } = usePreferences();
  const formId = 'sku-editor-form';

  const currentSku = useMemo(
    () => snapshot?.skus.find((sku) => sku.skuId === skuId),
    [skuId, snapshot],
  );
  const currentInsight = useMemo(
    () => snapshot?.sist.skuInsights.find((insight) => insight.skuId === skuId) ?? null,
    [skuId, snapshot],
  );

  const leadTimeMeanValue = currentSku?.leadTimeMeanDays ?? currentInsight?.leadTime.meanDays ?? null;
  const leadTimeStdValue = currentSku?.leadTimeStdDays ?? currentInsight?.leadTime.stdDays ?? null;

  const [form, setForm] = useState({
    skuId: currentSku?.skuId ?? randomId('sku'),
    name: currentSku?.name ?? '',
    description: currentSku?.description ?? '',
    unitsInStock: currentSku ? formatEditableWholeNumber(currentSku.unitsInStock) : '0',
    costPerUnit: currentSku ? formatEditableMoney(currentSku.costPerUnit) : '0',
    soldAsProduct: currentSku?.soldAsProduct ?? false,
    productPrice:
      currentSku?.productPrice == null ? '' : formatEditableMoney(currentSku.productPrice),
    leadTimeMeanDays: leadTimeMeanValue?.toString() ?? '',
    leadTimeStdDays: leadTimeStdValue?.toString() ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<SkuField, string>>>({});
  const fieldRefs = useRef<Partial<Record<SkuField, HTMLInputElement | HTMLTextAreaElement>>>({});

  const initialForm = useMemo(
    () => ({
      skuId: currentSku?.skuId ?? form.skuId,
      name: currentSku?.name ?? '',
      description: currentSku?.description ?? '',
      unitsInStock: currentSku ? formatEditableWholeNumber(currentSku.unitsInStock) : '0',
      costPerUnit: currentSku ? formatEditableMoney(currentSku.costPerUnit) : '0',
      soldAsProduct: currentSku?.soldAsProduct ?? false,
      productPrice:
        currentSku?.productPrice == null ? '' : formatEditableMoney(currentSku.productPrice),
      leadTimeMeanDays: leadTimeMeanValue?.toString() ?? '',
      leadTimeStdDays: leadTimeStdValue?.toString() ?? '',
    }),
    [currentSku, currentInsight, form.skuId, leadTimeMeanValue, leadTimeStdValue],
  );

  useEffect(() => {
    if (currentSku) {
      setForm({
        skuId: currentSku.skuId,
        name: currentSku.name,
        description: currentSku.description,
        unitsInStock: formatEditableWholeNumber(currentSku.unitsInStock),
        costPerUnit: formatEditableMoney(currentSku.costPerUnit),
        soldAsProduct: currentSku.soldAsProduct,
        productPrice:
          currentSku.productPrice == null ? '' : formatEditableMoney(currentSku.productPrice),
        leadTimeMeanDays: leadTimeMeanValue?.toString() ?? '',
        leadTimeStdDays: leadTimeStdValue?.toString() ?? '',
      });
      return;
    }

    if (isNew) {
      setForm({
        skuId: randomId('sku'),
        name: '',
        description: '',
        unitsInStock: '0',
        costPerUnit: '0',
        soldAsProduct: false,
        productPrice: '',
        leadTimeMeanDays: '',
        leadTimeStdDays: '',
      });
    }
  }, [currentSku, isNew, leadTimeMeanValue, leadTimeStdValue]);

  const hasChanges =
    JSON.stringify({
      ...form,
      name: normalizeText(form.name),
      description: normalizeText(form.description),
    }) !== JSON.stringify(initialForm);
  const impactNotes = useMemo(() => {
    const notes: string[] = [];

    if (form.soldAsProduct !== initialForm.soldAsProduct) {
      notes.push(
        form.soldAsProduct
          ? t('skuEditorImpactSellableEnabled')
          : t('skuEditorImpactSellableDisabled'),
      );
    }
    if (form.soldAsProduct && form.productPrice !== initialForm.productPrice) {
      notes.push(t('skuEditorImpactPrice'));
    }
    if (
      form.leadTimeMeanDays !== initialForm.leadTimeMeanDays ||
      form.leadTimeStdDays !== initialForm.leadTimeStdDays
    ) {
      notes.push(t('skuEditorImpactPlanning'));
    }

    return notes;
  }, [form, initialForm, t]);

  const confirmLeave = useRouteLeaveConfirm({
    enabled: hasChanges,
    message: t('unsavedChanges'),
  });

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const nextErrors: Partial<Record<SkuField, string>> = {};
    const skuIdError = validateEntryId(form.skuId);
    const nameError = validateRequiredText(form.name, limits.skuNameMaxLength);
    const descriptionError = validateRequiredText(form.description, limits.skuDescriptionMaxLength);
    const unitsError = validateNonNegativeDecimal(form.unitsInStock, limits.inventoryUnitsMax);
    const costError = validateNonNegativeDecimal(form.costPerUnit, limits.monetaryAmountMax);
    const productPriceError = form.soldAsProduct
      ? validateNonNegativeDecimal(form.productPrice, limits.monetaryAmountMax)
      : null;
    const leadTimeMeanError =
      form.leadTimeMeanDays.trim() === ''
        ? null
        : validateNonNegativeDecimal(form.leadTimeMeanDays, 365);
    const leadTimeStdError =
      form.leadTimeStdDays.trim() === ''
        ? null
        : validateNonNegativeDecimal(form.leadTimeStdDays, 365);

    if (skuIdError) nextErrors.skuId = t('validationRequired');
    if (nameError) nextErrors.name = t('validationRequired');
    if (descriptionError) nextErrors.description = t('validationRequired');
    if (unitsError) nextErrors.unitsInStock = t('validationNonNegative');
    if (costError) nextErrors.costPerUnit = t('validationNonNegative');
    if (productPriceError) nextErrors.productPrice = t('validationProductPrice');
    if (leadTimeMeanError) nextErrors.leadTimeMeanDays = t('validationNonNegative');
    if (leadTimeStdError) nextErrors.leadTimeStdDays = t('validationNonNegative');

    setErrors(nextErrors);

    const firstError = (Object.keys(nextErrors) as SkuField[])[0];
    if (firstError) {
      fieldRefs.current[firstError]?.focus();
      return;
    }

    try {
      await saveSku(
        {
          skuId: form.skuId.trim(),
          name: normalizeText(form.name),
          description: normalizeText(form.description),
          unitsInStock: sanitizeWholeNumberForDisplay(Number(form.unitsInStock)),
          costPerUnit: Number(form.costPerUnit),
          soldAsProduct: form.soldAsProduct,
          productPrice: form.soldAsProduct ? Number(form.productPrice) : null,
          leadTimeMeanDays:
            form.leadTimeMeanDays.trim() === '' ? null : Number(form.leadTimeMeanDays),
          leadTimeStdDays:
            form.leadTimeStdDays.trim() === '' ? null : Number(form.leadTimeStdDays),
        },
      );
      navigate(`/catalog/skus/${form.skuId.trim()}`);
    } catch {
      return;
    }
  }

  function leaveEditor() {
    if (!confirmLeave()) {
      return;
    }
    if (canGoBack) {
      goBack();
      return;
    }
    navigate(isNew ? '/catalog' : `/catalog/skus/${form.skuId.trim()}`);
  }

  if (!snapshot) {
    return (
      <WorkspacePage>
        <WorkspacePanel
          description={t('apiUnavailable')}
          title={isNew ? t('catalogSkuEditorTitleNew') : t('catalogSkuEditorTitleEdit')}
        >
          <p className="text-sm text-muted-foreground">{t('apiUnavailable')}</p>
        </WorkspacePanel>
      </WorkspacePage>
    );
  }

  if (!isNew && !currentSku) {
    return (
      <WorkspacePage>
        <WorkspacePanel
          description={t('catalogSkuDetailNotFoundDescription')}
          title={t('catalogSkuDetailNotFoundTitle')}
        >
          <div className="flex justify-start">
            <Button type="button" variant="outline" onClick={() => navigate('/catalog')}>
              {t('backToCatalog')}
            </Button>
          </div>
        </WorkspacePanel>
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <form className="flex w-full flex-col gap-6" id={formId} onSubmit={onSubmit}>
        <WorkspacePanel
          className="gap-0"
          contentClassName="!px-0 gap-6"
        >
          <EditorHeader
            backLabel={t('stockSessionBack')}
            cancelLabel={t('cancel')}
            description={isNew ? t('catalogSkuEditorDescriptionNew') : t('catalogSkuEditorDescriptionEdit')}
            disableSave={!hasChanges}
            formId={formId}
            isSaving={isSaving}
            onBack={leaveEditor}
            onCancel={leaveEditor}
            saveLabel={isNew ? t('createEntry') : t('saveDraft')}
            title={isNew ? t('catalogSkuEditorTitleNew') : t('catalogSkuEditorDetailsTitleEdit')}
          />

          {impactNotes.length > 0 ? (
            <div className="mx-6 flex flex-col gap-3 rounded-2xl border border-border/60 bg-card/30 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline">{t('skuEditorImpactTitle')}</Badge>
                <p className="text-sm text-muted-foreground">{impactNotes[0]}</p>
              </div>
              {impactNotes.length > 1 ? (
                <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                  {impactNotes.slice(1).map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="px-6">
            <FieldGroup>
              <TextInputField
                id="sku-id"
                error={errors.skuId}
                inputRef={(node) => {
                  fieldRefs.current.skuId = node ?? undefined;
                }}
                label={t('fieldId')}
                value={form.skuId}
                onChange={(event) => setForm((current) => ({ ...current, skuId: event.target.value }))}
              />
              <TextInputField
                id="sku-name"
                error={errors.name}
                inputRef={(node) => {
                  fieldRefs.current.name = node ?? undefined;
                }}
                label={t('fieldName')}
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
              <TextAreaField
                id="sku-description"
                error={errors.description}
                inputRef={(node) => {
                  fieldRefs.current.description = node ?? undefined;
                }}
                label={t('fieldDescription')}
                rows={6}
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </FieldGroup>
          </div>

          <section className="space-y-4 border-t border-border/50 px-6 pt-4">
            <h3 className="font-heading text-base font-medium tracking-[-0.02em]">
              {t('catalogSkuPlanningInputsTitle')}
            </h3>
            <FieldGroup className="md:grid md:grid-cols-2">
              <TextInputField
                id="sku-lead-time-mean"
                error={errors.leadTimeMeanDays}
                inputMode="decimal"
                inputRef={(node) => {
                  fieldRefs.current.leadTimeMeanDays = node ?? undefined;
                }}
                label={t('fieldLeadTimeMeanDays')}
                value={form.leadTimeMeanDays}
                onChange={(event) =>
                  setForm((current) => ({ ...current, leadTimeMeanDays: event.target.value }))
                }
              />
              <TextInputField
                id="sku-lead-time-std"
                error={errors.leadTimeStdDays}
                inputMode="decimal"
                inputRef={(node) => {
                  fieldRefs.current.leadTimeStdDays = node ?? undefined;
                }}
                label={t('fieldLeadTimeStdDays')}
                value={form.leadTimeStdDays}
                onChange={(event) =>
                  setForm((current) => ({ ...current, leadTimeStdDays: event.target.value }))
                }
              />
            </FieldGroup>
          </section>
        </WorkspacePanel>
      </form>
    </WorkspacePage>
  );
}
