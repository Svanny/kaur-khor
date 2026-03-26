import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useInventory } from '../state/inventory';
import { usePreferences } from '../state/preferences';
import {
  limits,
  normalizeText,
  validateNonNegativeDecimal,
  validateRequiredText,
} from '../lib/validation';
import { IconLabel, SaveChangeHeader, ShellCard } from '../ui';

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

  const initialForm = useMemo(
    () => ({
      serviceId: currentService?.serviceId ?? form.serviceId,
      name: currentService?.name ?? '',
      description: currentService?.description ?? '',
      price: currentService?.price.toString() ?? '',
      skuIds: currentService?.skuIds ?? [],
    }),
    [currentService, form.serviceId],
  );

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

  const hasChanges = JSON.stringify({
    ...form,
    name: normalizeText(form.name),
    description: normalizeText(form.description),
    skuIds: [...form.skuIds].sort(),
  }) !== JSON.stringify({
    ...initialForm,
    skuIds: [...initialForm.skuIds].sort(),
  });

  async function onSave() {
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
        title={t('serviceEditorTitle')}
      />

      <ShellCard className="editor-card editor-hero-card">
        <div className="editor-media">SV</div>
        <div className="editor-hero-copy">
          <p className="editor-id">{form.serviceId}</p>
          <h2>{form.name || t('serviceEditorTitle')}</h2>
          <p>{form.description || 'Describe the service, price it, and link the SKUs it consumes.'}</p>
        </div>
      </ShellCard>

      <div className="editor-grid">
        <ShellCard className="editor-card">
          <label className="editor-field">
            <span><IconLabel icon="⌗">{t('fieldId')}</IconLabel></span>
            <input disabled value={form.serviceId} />
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
          <label className="editor-field">
            <span><IconLabel icon="¤">{t('fieldPrice')}</IconLabel></span>
            <input
              inputMode="decimal"
              value={form.price}
              onChange={(event) => setForm((current) => ({ ...current, price: event.target.value }))}
            />
          </label>
        </ShellCard>

        <ShellCard className="editor-card">
          <div className="field-stack-header">
            <strong>{t('fieldLinkedSkus')}</strong>
            <p>{t('fieldSkuSelectionHint')}</p>
          </div>
          <div className="choice-list">
            {snapshot?.skus.map((sku) => {
              const selected = form.skuIds.includes(sku.skuId);
              return (
                <label className={selected ? 'choice-chip choice-chip-selected' : 'choice-chip'} key={sku.skuId}>
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
          </div>
        </ShellCard>
      </div>

      {error ? <p className="banner error-banner">{error}</p> : null}
    </section>
  );
}
