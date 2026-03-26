import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useInventory } from '../state/inventory';
import { usePreferences } from '../state/preferences';
import { limits, normalizeText, validateNonNegativeDecimal, validateRequiredText } from '../lib/validation';
import { IconLabel, SaveChangeHeader, ShellCard } from '../ui';

function randomId(prefix: 'sku') {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function SkuFormRoute() {
  const navigate = useNavigate();
  const { skuId } = useParams();
  const isNew = !skuId;
  const { snapshot, saveSku, isSaving } = useInventory();
  const { t } = usePreferences();

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
  const [error, setError] = useState<string | null>(null);

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

  async function onSave() {
    const nameError = validateRequiredText(form.name, limits.skuNameMaxLength);
    const descriptionError = validateRequiredText(
      form.description,
      limits.skuDescriptionMaxLength,
    );
    const unitsError = validateNonNegativeDecimal(form.unitsInStock, limits.inventoryUnitsMax);
    const costError = validateNonNegativeDecimal(form.costPerUnit, limits.monetaryAmountMax);
    const productPriceError = form.soldAsProduct
      ? validateNonNegativeDecimal(form.productPrice, limits.monetaryAmountMax)
      : null;

    if (nameError || descriptionError) {
      setError(t('validationRequired'));
      return;
    }
    if (unitsError || costError) {
      setError(t('validationNonNegative'));
      return;
    }
    if (productPriceError) {
      setError(t('validationProductPrice'));
      return;
    }

    setError(null);
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
  }

  function leaveEditor() {
    if (hasChanges && !window.confirm(t('unsavedChanges'))) {
      return;
    }
    navigate('/inventory');
  }

  return (
    <section className="page-stack">
      <SaveChangeHeader
        cancelLabel={t('cancel')}
        hasChanges={hasChanges}
        isSaving={isSaving}
        onBack={leaveEditor}
        onCancel={leaveEditor}
        onSave={() => {
          void onSave();
        }}
        saveLabel={isNew ? t('createEntry') : t('saveDraft')}
        title={t('skuEditorTitle')}
      />

      <ShellCard className="editor-card editor-hero-card">
        <div className="editor-media">SKU</div>
        <div className="editor-hero-copy">
          <p className="editor-id">{form.skuId}</p>
          <h2>{form.name || t('skuEditorTitle')}</h2>
          <p>{form.description || 'Add the item details, stock count, and pricing for this SKU.'}</p>
        </div>
      </ShellCard>

      <div className="editor-grid">
        <ShellCard className="editor-card">
          <label className="editor-field">
            <span><IconLabel icon="⌗">{t('fieldId')}</IconLabel></span>
            <input disabled value={form.skuId} />
          </label>
          <label className="editor-field">
            <span><IconLabel icon="🏷">{t('fieldName')}</IconLabel></span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="editor-field">
            <span><IconLabel icon="✎">{t('fieldDescription')}</IconLabel></span>
            <textarea
              rows={5}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </label>
        </ShellCard>

        <ShellCard className="editor-card">
          <label className="editor-field">
            <span><IconLabel icon="◫">{t('fieldUnitsInStock')}</IconLabel></span>
            <input
              inputMode="decimal"
              value={form.unitsInStock}
              onChange={(event) =>
                setForm((current) => ({ ...current, unitsInStock: event.target.value }))
              }
            />
          </label>
          <label className="editor-field">
            <span><IconLabel icon="$">{t('fieldCostPerUnit')}</IconLabel></span>
            <input
              inputMode="decimal"
              value={form.costPerUnit}
              onChange={(event) =>
                setForm((current) => ({ ...current, costPerUnit: event.target.value }))
              }
            />
          </label>
          <label className="toggle-row">
            <span><IconLabel icon="◐">{t('fieldSoldAsProduct')}</IconLabel></span>
            <input
              checked={form.soldAsProduct}
              type="checkbox"
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  soldAsProduct: event.target.checked,
                  productPrice: event.target.checked ? current.productPrice || '0' : '',
                }))
              }
            />
          </label>
          {form.soldAsProduct ? (
            <label className="editor-field">
              <span><IconLabel icon="¤">{t('fieldProductPrice')}</IconLabel></span>
              <input
                inputMode="decimal"
                value={form.productPrice}
                onChange={(event) =>
                  setForm((current) => ({ ...current, productPrice: event.target.value }))
                }
              />
            </label>
          ) : null}
        </ShellCard>
      </div>

      {error ? <p className="banner error-banner">{error}</p> : null}
    </section>
  );
}
