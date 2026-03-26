import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useInventory } from '../state/inventory';
import { usePreferences } from '../state/preferences';
import { limits, normalizeText, validateNonNegativeDecimal, validateRequiredText } from '../lib/validation';

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

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
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

  return (
    <section className="page-stack">
      <form className="panel form-panel" onSubmit={onSubmit}>
        <div className="panel-header">
          <div>
            <h1>{t('skuEditorTitle')}</h1>
            <p>{form.skuId}</p>
          </div>
          <div className="action-row">
            <Link className="button secondary" to="/inventory">
              {t('cancel')}
            </Link>
            <button className="button primary" disabled={isSaving} type="submit">
              {isNew ? t('createEntry') : t('saveChanges')}
            </button>
          </div>
        </div>

        <label className="field">
          <span>{t('fieldId')}</span>
          <input disabled value={form.skuId} />
        </label>

        <div className="field-grid">
          <label className="field">
            <span>{t('fieldName')}</span>
            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
            />
          </label>
          <label className="field">
            <span>{t('fieldDescription')}</span>
            <textarea
              rows={4}
              value={form.description}
              onChange={(event) =>
                setForm((current) => ({ ...current, description: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>{t('fieldUnitsInStock')}</span>
            <input
              inputMode="decimal"
              value={form.unitsInStock}
              onChange={(event) =>
                setForm((current) => ({ ...current, unitsInStock: event.target.value }))
              }
            />
          </label>
          <label className="field">
            <span>{t('fieldCostPerUnit')}</span>
            <input
              inputMode="decimal"
              value={form.costPerUnit}
              onChange={(event) =>
                setForm((current) => ({ ...current, costPerUnit: event.target.value }))
              }
            />
          </label>
        </div>

        <label className="checkbox-field">
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
          <span>{t('fieldSoldAsProduct')}</span>
        </label>

        {form.soldAsProduct ? (
          <label className="field">
            <span>{t('fieldProductPrice')}</span>
            <input
              inputMode="decimal"
              value={form.productPrice}
              onChange={(event) =>
                setForm((current) => ({ ...current, productPrice: event.target.value }))
              }
            />
          </label>
        ) : null}

        {error ? <p className="error-banner">{error}</p> : null}
      </form>
    </section>
  );
}
