import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Textarea } from '@/components/ui/textarea';
import { EditorHeader } from '@/components/system/editor';
import {
  TextInputField,
} from '@/components/system/form-fields';
import { WorkspacePage, WorkspacePanel } from '@/components/system/workspace';
import { useRouteLeaveConfirm } from '@/hooks/use-route-leave-confirm';
import { formatEditableMoney } from '@/lib/format';
import {
  limits,
  normalizeText,
  validateNonNegativeDecimal,
  validateRequiredText,
} from '@/lib/validation';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

function randomId(prefix: 'sku') {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

type SkuField =
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
  const { t } = usePreferences();
  const formId = 'sku-editor-form';

  const currentSku = useMemo(
    () => snapshot?.skus.find((sku) => sku.skuId === skuId),
    [skuId, snapshot],
  );

  const [form, setForm] = useState({
    skuId: currentSku?.skuId ?? randomId('sku'),
    name: currentSku?.name ?? '',
    description: currentSku?.description ?? '',
    unitsInStock: currentSku?.unitsInStock.toString() ?? '0',
    costPerUnit: currentSku ? formatEditableMoney(currentSku.costPerUnit) : '0',
    soldAsProduct: currentSku?.soldAsProduct ?? false,
    productPrice:
      currentSku?.productPrice == null ? '' : formatEditableMoney(currentSku.productPrice),
    leadTimeMeanDays: currentSku?.leadTimeMeanDays?.toString() ?? '',
    leadTimeStdDays: currentSku?.leadTimeStdDays?.toString() ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<SkuField, string>>>({});
  const [planningExpanded, setPlanningExpanded] = useState(false);
  const fieldRefs = useRef<Partial<Record<SkuField, HTMLInputElement | HTMLTextAreaElement>>>({});

  const initialForm = useMemo(
    () => ({
      skuId: currentSku?.skuId ?? form.skuId,
      name: currentSku?.name ?? '',
      description: currentSku?.description ?? '',
      unitsInStock: currentSku?.unitsInStock.toString() ?? '0',
      costPerUnit: currentSku ? formatEditableMoney(currentSku.costPerUnit) : '0',
      soldAsProduct: currentSku?.soldAsProduct ?? false,
      productPrice:
        currentSku?.productPrice == null ? '' : formatEditableMoney(currentSku.productPrice),
      leadTimeMeanDays: currentSku?.leadTimeMeanDays?.toString() ?? '',
      leadTimeStdDays: currentSku?.leadTimeStdDays?.toString() ?? '',
    }),
    [currentSku, form.skuId],
  );

  useEffect(() => {
    if (currentSku) {
      setForm({
        skuId: currentSku.skuId,
        name: currentSku.name,
        description: currentSku.description,
        unitsInStock: currentSku.unitsInStock.toString(),
        costPerUnit: formatEditableMoney(currentSku.costPerUnit),
        soldAsProduct: currentSku.soldAsProduct,
        productPrice:
          currentSku.productPrice == null ? '' : formatEditableMoney(currentSku.productPrice),
        leadTimeMeanDays: currentSku.leadTimeMeanDays?.toString() ?? '',
        leadTimeStdDays: currentSku.leadTimeStdDays?.toString() ?? '',
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
  }, [currentSku, isNew]);

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

    if (nameError) nextErrors.name = t('validationRequired');
    if (descriptionError) nextErrors.description = t('validationRequired');
    if (unitsError) nextErrors.unitsInStock = t('validationNonNegative');
    if (costError) nextErrors.costPerUnit = t('validationNonNegative');
    if (productPriceError) nextErrors.productPrice = t('validationProductPrice');
    if (leadTimeMeanError) nextErrors.leadTimeMeanDays = t('validationNonNegative');
    if (leadTimeStdError) nextErrors.leadTimeStdDays = t('validationNonNegative');

    if (leadTimeMeanError || leadTimeStdError) {
      setPlanningExpanded(true);
    }

    setErrors(nextErrors);

    const firstError = (Object.keys(nextErrors) as SkuField[])[0];
    if (firstError) {
      fieldRefs.current[firstError]?.focus();
      return;
    }

    try {
      await saveSku(
        {
          skuId: form.skuId,
          name: normalizeText(form.name),
          description: normalizeText(form.description),
          unitsInStock: Number(form.unitsInStock),
          costPerUnit: Number(form.costPerUnit),
          soldAsProduct: form.soldAsProduct,
          productPrice: form.soldAsProduct ? Number(form.productPrice) : null,
          leadTimeMeanDays:
            form.leadTimeMeanDays.trim() === '' ? null : Number(form.leadTimeMeanDays),
          leadTimeStdDays:
            form.leadTimeStdDays.trim() === '' ? null : Number(form.leadTimeStdDays),
        },
      );
      navigate(`/catalog/skus/${form.skuId}`);
    } catch {
      return;
    }
  }

  function leaveEditor() {
    if (!confirmLeave()) {
      return;
    }
    navigate(isNew ? '/catalog' : `/catalog/skus/${form.skuId}`);
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
      <EditorHeader
        backLabel={!isNew ? t('backToCatalog') : undefined}
        cancelLabel={t('cancel')}
        description={isNew ? t('catalogSkuEditorDescriptionNew') : t('catalogSkuEditorDescriptionEdit')}
        disableCancel={!hasChanges}
        disableSave={!hasChanges}
        formId={formId}
        isSaving={isSaving}
        onBack={!isNew ? leaveEditor : undefined}
        onCancel={leaveEditor}
        saveLabel={isNew ? t('createEntry') : t('saveDraft')}
        title={isNew ? t('catalogSkuEditorTitleNew') : t('catalogSkuEditorTitleEdit')}
        titleMeta={
          <div className="flex min-w-0 items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1.5">
            <span className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('fieldId')}
            </span>
            <code className="truncate text-xs font-semibold text-foreground">{form.skuId}</code>
          </div>
        }
      />

      {impactNotes.length > 0 ? (
        <div className="flex w-full flex-col gap-3 rounded-2xl border border-border/60 bg-card/30 px-4 py-3">
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

      <form className="flex w-full flex-col gap-6" id={formId} onSubmit={onSubmit}>
        <WorkspacePanel
          description={t('skuEditorDetailsDescription')}
          title={t('skuEditorDetailsTitle')}
        >
          <FieldGroup>
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
            <Field data-invalid={!!errors.description}>
              <FieldLabel htmlFor="sku-description">{t('fieldDescription')}</FieldLabel>
              <FieldContent>
                <Textarea
                  aria-invalid={!!errors.description}
                  id="sku-description"
                  ref={(node) => {
                    fieldRefs.current.description = node ?? undefined;
                  }}
                  rows={6}
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                />
                <FieldError>{errors.description}</FieldError>
              </FieldContent>
            </Field>
          </FieldGroup>
        </WorkspacePanel>

        <WorkspacePanel
          description={t('skuEditorStockSellingDescription')}
          title={t('skuEditorStockSellingTitle')}
        >
          <FieldGroup className="md:grid md:grid-cols-2">
            <TextInputField
              id="sku-units"
              error={errors.unitsInStock}
              inputMode="decimal"
              inputRef={(node) => {
                fieldRefs.current.unitsInStock = node ?? undefined;
              }}
              label={t('fieldUnitsInStock')}
              value={form.unitsInStock}
              onChange={(event) =>
                setForm((current) => ({ ...current, unitsInStock: event.target.value }))
              }
            />
            <TextInputField
              id="sku-cost"
              error={errors.costPerUnit}
              inputMode="decimal"
              inputRef={(node) => {
                fieldRefs.current.costPerUnit = node ?? undefined;
              }}
              label={t('fieldCostPerUnit')}
              value={form.costPerUnit}
              onChange={(event) =>
                setForm((current) => ({ ...current, costPerUnit: event.target.value }))
              }
            />
            <Field className="gap-3 rounded-2xl border border-border/60 px-4 py-3" orientation="horizontal">
              <Checkbox
                checked={form.soldAsProduct}
                onCheckedChange={(checked) =>
                  setForm((current) => ({
                    ...current,
                    soldAsProduct: checked === true,
                    productPrice: checked === true ? current.productPrice || '0' : '',
                  }))
                }
              />
              <FieldContent>
                <FieldLabel className="font-medium">{t('fieldSoldAsProduct')}</FieldLabel>
                <FieldDescription>{t('skuEditorSellAsProductDescription')}</FieldDescription>
              </FieldContent>
            </Field>
            {form.soldAsProduct ? (
              <TextInputField
                id="sku-price"
                error={errors.productPrice}
                inputMode="decimal"
                inputRef={(node) => {
                  fieldRefs.current.productPrice = node ?? undefined;
                }}
                label={t('fieldProductPrice')}
                value={form.productPrice}
                onChange={(event) =>
                  setForm((current) => ({ ...current, productPrice: event.target.value }))
                }
              />
            ) : null}
          </FieldGroup>
        </WorkspacePanel>

        <WorkspacePanel
          action={
            <Button
              type="button"
              variant="ghost"
              className="inline-flex items-center gap-2 self-center"
              onClick={() => setPlanningExpanded((current) => !current)}
            >
              {planningExpanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
              {planningExpanded
                ? t('catalogSkuPlanningInputsHide')
                : t('catalogSkuPlanningInputsShow')}
            </Button>
          }
          className="border-dashed bg-card/20 shadow-none"
          contentClassName="gap-4"
          description={t('catalogSkuPlanningInputsDescription')}
          title={t('catalogSkuPlanningInputsTitle')}
        >
          {planningExpanded ? (
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
          ) : null}
        </WorkspacePanel>
      </form>
    </WorkspacePage>
  );
}
