import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInventory } from '../state/inventory';
import { usePreferences } from '../state/preferences';
import { SaveChangeHeader, ShellCard } from '../ui';

type Preset = 'small' | 'medium' | 'big';

const presetSteps: Record<Preset, { units: number; cost: number }> = {
  small: { units: 1, cost: 0.25 },
  medium: { units: 5, cost: 0.5 },
  big: { units: 20, cost: 1 },
};

export function StockUpdateRoute() {
  const navigate = useNavigate();
  const { snapshot, saveStock, isSaving } = useInventory();
  const { currency, language, t } = usePreferences();
  const [rows, setRows] = useState<Record<string, { unitsInStock: string; costPerUnit: string }>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [preset, setPreset] = useState<Preset>('small');

  useEffect(() => {
    if (!snapshot) {
      return;
    }
    const nextRows = Object.fromEntries(
      snapshot.skus.map((sku) => [
        sku.skuId,
        {
          unitsInStock: sku.unitsInStock.toString(),
          costPerUnit: sku.costPerUnit.toString(),
        },
      ]),
    );
    setRows(nextRows);
  }, [snapshot]);

  useEffect(() => {
    setCurrentIndex(0);
  }, [snapshot?.skus.length]);

  const changedEntries =
    snapshot?.skus
      .map((sku) => ({
        sku,
        unitsInStock: Number(rows[sku.skuId]?.unitsInStock ?? sku.unitsInStock),
        costPerUnit: Number(rows[sku.skuId]?.costPerUnit ?? sku.costPerUnit),
      }))
      .filter(
        (entry) =>
          entry.unitsInStock !== entry.sku.unitsInStock || entry.costPerUnit !== entry.sku.costPerUnit,
      ) ?? [];

  const hasChanges = changedEntries.length > 0;
  const confirmationIndex = snapshot?.skus.length ?? 0;
  const showingConfirmation = currentIndex >= confirmationIndex;

  function setField(
    skuId: string,
    key: 'unitsInStock' | 'costPerUnit',
    value: string,
  ) {
    setRows((current) => ({
      ...current,
      [skuId]: {
        ...current[skuId],
        [key]: value,
      },
    }));
  }

  function adjustCurrent(field: 'unitsInStock' | 'costPerUnit', direction: -1 | 1) {
    if (!snapshot || showingConfirmation) {
      return;
    }
    const currentSku = snapshot.skus[currentIndex];
    const step = field === 'unitsInStock' ? presetSteps[preset].units : presetSteps[preset].cost;
    const currentValue = Number(rows[currentSku.skuId]?.[field] ?? currentSku[field]);
    const nextValue = Math.max(0, currentValue + step * direction);
    setField(currentSku.skuId, field, String(nextValue));
  }

  async function onSave() {
    if (!snapshot) {
      return;
    }

    if (!hasChanges) {
      setError(t('validationStockChanges'));
      return;
    }

    setError(null);
    await saveStock(
      changedEntries.map((entry) => ({
        skuId: entry.sku.skuId,
        unitsInStock: entry.unitsInStock,
        costPerUnit: entry.costPerUnit,
      })),
    );
    navigate('/inventory');
  }

  function leavePage() {
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
        onBack={leavePage}
        onCancel={() => {
          if (!snapshot) {
            return;
          }
          setRows(
            Object.fromEntries(
              snapshot.skus.map((sku) => [
                sku.skuId,
                {
                  unitsInStock: String(sku.unitsInStock),
                  costPerUnit: String(sku.costPerUnit),
                },
              ]),
            ),
          );
          setCurrentIndex(0);
          setError(null);
        }}
        onSave={() => {
          void onSave();
        }}
        saveLabel={t('stockDone')}
        title={t('stockChangesTitle')}
      />

      <div className="stock-layout">
        <div className="stock-indicator-rail" aria-hidden="true">
          {snapshot?.skus.map((sku, index) => (
            <span
              className={index <= currentIndex ? 'stock-indicator stock-indicator-active' : 'stock-indicator'}
              key={sku.skuId}
            />
          ))}
          <span className={showingConfirmation ? 'stock-indicator stock-indicator-active' : 'stock-indicator'} />
        </div>

        {!showingConfirmation && snapshot ? (
          <ShellCard
            className="stock-card"
            onWheel={(event: React.WheelEvent<HTMLElement>) => {
              if (event.deltaY > 40) {
                setCurrentIndex((value) => Math.min(confirmationIndex, value + 1));
              }
              if (event.deltaY < -40) {
                setCurrentIndex((value) => Math.max(0, value - 1));
              }
            }}
          >
            <div className="stock-card-stack-shadow stock-card-stack-shadow-one" />
            <div className="stock-card-stack-shadow stock-card-stack-shadow-two" />
            <div className="stock-card-head">
              <p className="editor-id">{snapshot.skus[currentIndex].skuId}</p>
              <h2>{snapshot.skus[currentIndex].name}</h2>
              <p>{snapshot.skus[currentIndex].description}</p>
            </div>

            <div className="pill-row">
              {(['small', 'medium', 'big'] as const).map((option) => (
                <button
                  className={preset === option ? 'filter-pill filter-pill-active' : 'filter-pill'}
                  key={option}
                  type="button"
                  onClick={() => setPreset(option)}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="stock-field-grid">
              <div className="stock-adjust-card">
                <span>{t('fieldUnitsInStock')}</span>
                <strong>{rows[snapshot.skus[currentIndex].skuId]?.unitsInStock ?? snapshot.skus[currentIndex].unitsInStock}</strong>
                <div className="inline-actions">
                  <button className="secondary-pill-button compact-pill-button" type="button" onClick={() => adjustCurrent('unitsInStock', -1)}>
                    − {presetSteps[preset].units}
                  </button>
                  <button className="secondary-pill-button compact-pill-button" type="button" onClick={() => adjustCurrent('unitsInStock', 1)}>
                    ＋ {presetSteps[preset].units}
                  </button>
                </div>
                <input
                  inputMode="decimal"
                  value={rows[snapshot.skus[currentIndex].skuId]?.unitsInStock ?? ''}
                  onChange={(event) => setField(snapshot.skus[currentIndex].skuId, 'unitsInStock', event.target.value)}
                />
              </div>

              <div className="stock-adjust-card">
                <span>{t('fieldCostPerUnit')}</span>
                <strong>{rows[snapshot.skus[currentIndex].skuId]?.costPerUnit ?? snapshot.skus[currentIndex].costPerUnit}</strong>
                <div className="inline-actions">
                  <button className="secondary-pill-button compact-pill-button" type="button" onClick={() => adjustCurrent('costPerUnit', -1)}>
                    − {presetSteps[preset].cost}
                  </button>
                  <button className="secondary-pill-button compact-pill-button" type="button" onClick={() => adjustCurrent('costPerUnit', 1)}>
                    ＋ {presetSteps[preset].cost}
                  </button>
                </div>
                <input
                  inputMode="decimal"
                  value={rows[snapshot.skus[currentIndex].skuId]?.costPerUnit ?? ''}
                  onChange={(event) => setField(snapshot.skus[currentIndex].skuId, 'costPerUnit', event.target.value)}
                />
              </div>
            </div>

            <div className="stock-nav">
              <button
                className="secondary-pill-button"
                disabled={currentIndex === 0}
                type="button"
                onClick={() => setCurrentIndex((value) => Math.max(0, value - 1))}
              >
                {t('stockPrevious')}
              </button>
              <button
                className="primary-pill-button"
                type="button"
                onClick={() => setCurrentIndex((value) => Math.min(confirmationIndex, value + 1))}
              >
                {currentIndex === confirmationIndex - 1 ? t('stockConfirm') : t('stockNext')}
              </button>
            </div>
          </ShellCard>
        ) : (
          <ShellCard className="stock-card confirmation-card">
            <div className="stock-card-head">
              <p className="editor-id">{t('stockConfirm')}</p>
              <h2>{changedEntries.length === 0 ? t('stockNoChanges') : `${changedEntries.length} updates ready`}</h2>
              <p>{t('stockUpdateHint')}</p>
            </div>
            <div className="confirmation-list">
              {changedEntries.map((entry) => (
                <div className="confirmation-row" key={entry.sku.skuId}>
                  <div>
                    <strong>{entry.sku.name}</strong>
                    <p>{entry.sku.skuId}</p>
                  </div>
                  <div className="confirmation-values">
                    <span>{entry.unitsInStock}</span>
                    <span>{entry.costPerUnit} {currency}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="stock-nav">
              <button
                className="secondary-pill-button"
                type="button"
                onClick={() => setCurrentIndex(Math.max(0, confirmationIndex - 1))}
              >
                {t('stockPrevious')}
              </button>
              <button className="primary-pill-button" disabled={!hasChanges || isSaving} type="button" onClick={() => { void onSave(); }}>
                {t('stockDone')}
              </button>
            </div>
          </ShellCard>
        )}
      </div>

      {error ? <p className="banner error-banner">{error}</p> : null}
    </section>
  );
}
