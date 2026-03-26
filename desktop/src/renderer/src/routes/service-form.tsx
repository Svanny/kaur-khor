import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useInventory } from '../state/inventory';
import { usePreferences } from '../state/preferences';
import {
  limits,
  normalizeText,
  validateNonNegativeDecimal,
  validateRequiredText,
} from '../lib/validation';

function randomId(prefix: 'service') {
  return `${prefix}-${crypto.randomUUID().slice(0, 8)}`;
}

export function ServiceFormRoute() {
  const navigate = useNavigate();
  const { serviceId } = useParams();
  const isNew = !serviceId;
  const { snapshot, saveService, isSaving } = useInventory();
  const { t } = usePreferences();

  const currentService = useMemo(
    () => snapshot?.services.find((service) => service.serviceId === serviceId),
    [serviceId, snapshot],
  );

  const [form, setForm] = useState({
    serviceId: currentService?.serviceId ?? randomId('service'),
    name: currentService?.name ?? '',
    description: currentService?.description ?? '',
    price: currentService?.price.toString() ?? '',
    skuIds: currentService?.skuIds ?? [],
  });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (currentService) {
      setForm({
        serviceId: currentService.serviceId,
        name: currentService.name,
        description: currentService.description,
        price: currentService.price.toString(),
        skuIds: currentService.skuIds,
      });
      return;
    }

    if (isNew) {
      setForm({
        serviceId: randomId('service'),
        name: '',
        description: '',
        price: '',
        skuIds: [],
      });
    }
  }, [currentService, isNew]);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nameError = validateRequiredText(form.name, limits.serviceNameMaxLength);
    const descriptionError = validateRequiredText(
      form.description,
      limits.serviceDescriptionMaxLength,
    );
    const priceError = validateNonNegativeDecimal(form.price, limits.monetaryAmountMax);

    if (nameError || descriptionError) {
      setError(t('validationRequired'));
      return;
    }
    if (priceError) {
      setError(t('validationNonNegative'));
      return;
    }
    if (form.skuIds.length === 0) {
      setError(t('validationSelection'));
      return;
    }

    setError(null);
    await saveService(
      {
        serviceId: form.serviceId,
        name: normalizeText(form.name),
        description: normalizeText(form.description),
        price: Number(form.price),
        skuIds: [...form.skuIds].sort(),
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
            <h1>{t('serviceEditorTitle')}</h1>
            <p>{form.serviceId}</p>
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
          <input disabled value={form.serviceId} />
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
            <span>{t('fieldPrice')}</span>
            <input
              inputMode="decimal"
              value={form.price}
              onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
            />
          </label>
        </div>

        <fieldset className="checklist">
          <legend>{t('fieldLinkedSkus')}</legend>
          {snapshot?.skus.map((sku) => {
            const selected = form.skuIds.includes(sku.skuId);
            return (
              <label className="checkbox-field" key={sku.skuId}>
                <input
                  checked={selected}
                  type="checkbox"
                  onChange={(event) => {
                    setForm((current) => ({
                      ...current,
                      skuIds: event.target.checked
                        ? [...current.skuIds, sku.skuId]
                        : current.skuIds.filter((value) => value !== sku.skuId),
                    }));
                  }}
                />
                <span>{sku.name}</span>
              </label>
            );
          })}
        </fieldset>

        {error ? <p className="error-banner">{error}</p> : null}
      </form>
    </section>
  );
}
