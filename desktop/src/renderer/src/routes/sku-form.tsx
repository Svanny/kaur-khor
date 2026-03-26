import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { PageIntro, PageSection, SaveHeader, SectionHeading, Surface } from '@/components/banji-primitives';
import { limits, normalizeText, validateNonNegativeDecimal, validateRequiredText } from '@/lib/validation';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

function randomId(prefix: 'sku') {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

type SkuField = 'name' | 'description' | 'unitsInStock' | 'costPerUnit' | 'productPrice';

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
    costPerUnit: currentSku?.costPerUnit.toString() ?? '0',
    soldAsProduct: currentSku?.soldAsProduct ?? false,
    productPrice: currentSku?.productPrice?.toString() ?? '',
  });
  const [errors, setErrors] = useState<Partial<Record<SkuField, string>>>({});
  const fieldRefs = useRef<Partial<Record<SkuField, HTMLInputElement | HTMLTextAreaElement>>>({});

  const initialForm = useMemo(
    () => ({
      skuId: currentSku?.skuId ?? form.skuId,
      name: currentSku?.name ?? '',
      description: currentSku?.description ?? '',
      unitsInStock: currentSku?.unitsInStock.toString() ?? '0',
      costPerUnit: currentSku?.costPerUnit.toString() ?? '0',
      soldAsProduct: currentSku?.soldAsProduct ?? false,
      productPrice: currentSku?.productPrice?.toString() ?? '',
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
        costPerUnit: currentSku.costPerUnit.toString(),
        soldAsProduct: currentSku.soldAsProduct,
        productPrice: currentSku.productPrice?.toString() ?? '',
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
      });
    }
  }, [currentSku, isNew]);

  const hasChanges =
    JSON.stringify({
      ...form,
      name: normalizeText(form.name),
      description: normalizeText(form.description),
    }) !== JSON.stringify(initialForm);

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

    if (nameError) nextErrors.name = t('validationRequired');
    if (descriptionError) nextErrors.description = t('validationRequired');
    if (unitsError) nextErrors.unitsInStock = t('validationNonNegative');
    if (costError) nextErrors.costPerUnit = t('validationNonNegative');
    if (productPriceError) nextErrors.productPrice = t('validationProductPrice');

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
        },
        isNew,
      );
      navigate('/inventory');
    } catch {
      return;
    }
  }

  function leaveEditor() {
    if (hasChanges && !window.confirm(t('unsavedChanges'))) {
      return;
    }
    navigate('/inventory');
  }

  return (
    <PageSection className="space-y-6">
      <SaveHeader
        cancelLabel={t('cancel')}
        description={t('editorSkuHelper')}
        formId={formId}
        hasChanges={hasChanges}
        isSaving={isSaving}
        onBack={leaveEditor}
        onCancel={leaveEditor}
        saveLabel={isNew ? t('createEntry') : t('saveDraft')}
        savedLabel={t('savedState')}
        title={t('skuEditorTitle')}
        unsavedLabel={t('unsavedChanges')}
      />

      <PageIntro
        aside={
          <Badge className="rounded-full px-4 py-2 text-sm" variant="secondary">
            {form.skuId}
          </Badge>
        }
        description={t('editorSkuHelper')}
        eyebrow={t('skuLabel')}
        title={form.name || t('skuEditorTitle')}
      />

      <form className="grid gap-6 xl:grid-cols-[minmax(0,1.05fr)_minmax(320px,0.95fr)]" id={formId} onSubmit={onSubmit}>
        <Surface className="space-y-5">
          <SectionHeading title={t('editorDetailsTitle')} />
          <div className="grid gap-4">
            <Field
              error={errors.name}
              label={t('fieldName')}
            >
              <Input
                ref={(node) => {
                  fieldRefs.current.name = node;
                }}
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              />
            </Field>
            <Field error={errors.description} label={t('fieldDescription')}>
              <Textarea
                ref={(node) => {
                  fieldRefs.current.description = node;
                }}
                rows={6}
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
              />
            </Field>
          </div>
        </Surface>

        <div className="space-y-6">
          <Surface className="space-y-5">
            <SectionHeading title={t('editorInventoryTitle')} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field error={errors.unitsInStock} label={t('fieldUnitsInStock')}>
                <Input
                  ref={(node) => {
                    fieldRefs.current.unitsInStock = node;
                  }}
                  inputMode="decimal"
                  value={form.unitsInStock}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, unitsInStock: event.target.value }))
                  }
                />
              </Field>
              <Field error={errors.costPerUnit} label={t('fieldCostPerUnit')}>
                <Input
                  ref={(node) => {
                    fieldRefs.current.costPerUnit = node;
                  }}
                  inputMode="decimal"
                  value={form.costPerUnit}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, costPerUnit: event.target.value }))
                  }
                />
              </Field>
            </div>
          </Surface>

          <Surface className="space-y-5">
            <SectionHeading title={t('editorPricingTitle')} />
            <label className="flex items-start gap-3 rounded-[24px] border border-border/70 bg-background/70 px-4 py-3">
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
              <div className="space-y-1">
                <span className="text-sm font-medium text-foreground">{t('fieldSoldAsProduct')}</span>
                <p className="text-sm text-muted-foreground">{t('editorSkuHelper')}</p>
              </div>
            </label>
            {form.soldAsProduct ? (
              <Field error={errors.productPrice} label={t('fieldProductPrice')}>
                <Input
                  ref={(node) => {
                    fieldRefs.current.productPrice = node;
                  }}
                  inputMode="decimal"
                  value={form.productPrice}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, productPrice: event.target.value }))
                  }
                />
              </Field>
            ) : null}
            <div className="rounded-[24px] border border-dashed border-border bg-background/60 px-4 py-3 text-sm text-muted-foreground">
              <p>{t('fieldId')}</p>
              <p className="mt-1 font-medium text-foreground">{form.skuId}</p>
            </div>
          </Surface>
        </div>
      </form>
    </PageSection>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-2 text-sm font-medium text-foreground">
      <span>{label}</span>
      {children}
      {error ? <span className="text-sm font-normal text-destructive">{error}</span> : null}
    </label>
  );
}
