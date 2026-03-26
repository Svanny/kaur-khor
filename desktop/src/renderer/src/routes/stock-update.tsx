import { useEffect, useState } from 'react';
import { useInventory } from '../state/inventory';
import { usePreferences } from '../state/preferences';

export function StockUpdateRoute() {
  const { snapshot, saveStock, isSaving } = useInventory();
  const { t } = usePreferences();
  const [rows, setRows] = useState<Record<string, { unitsInStock: string; costPerUnit: string }>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);

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

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!snapshot) {
      return;
    }

    const updates = snapshot.skus
      .map((sku) => {
        const formRow = rows[sku.skuId];
        return {
          skuId: sku.skuId,
          unitsInStock: Number(formRow?.unitsInStock ?? sku.unitsInStock),
          costPerUnit: Number(formRow?.costPerUnit ?? sku.costPerUnit),
          changed:
            Number(formRow?.unitsInStock ?? sku.unitsInStock) !== sku.unitsInStock ||
            Number(formRow?.costPerUnit ?? sku.costPerUnit) !== sku.costPerUnit,
        };
      })
      .filter((sku) => sku.changed)
      .map(({ changed: _changed, ...update }) => update);

    if (updates.length === 0) {
      setError(t('validationStockChanges'));
      return;
    }

    setError(null);
    await saveStock(updates);
  }

  return (
    <section className="page-stack">
      <form className="panel" onSubmit={onSubmit}>
        <div className="panel-header">
          <div>
            <h1>{t('stockUpdateTitle')}</h1>
            <p>{t('stockUpdateBody')}</p>
          </div>
          <button className="button primary" disabled={isSaving} type="submit">
            {t('saveStock')}
          </button>
        </div>

        <p className="helper-copy">{t('stockUpdateHint')}</p>

        <div className="table">
          <div className="table-row table-head">
            <span>{t('fieldName')}</span>
            <span>{t('fieldUnitsInStock')}</span>
            <span>{t('fieldCostPerUnit')}</span>
          </div>
          {snapshot?.skus.map((sku) => (
            <div className="table-row" key={sku.skuId}>
              <span>
                <strong>{sku.name}</strong>
                <small>{sku.skuId}</small>
              </span>
              <input
                inputMode="decimal"
                value={rows[sku.skuId]?.unitsInStock ?? ''}
                onChange={(event) =>
                  setRows((current) => ({
                    ...current,
                    [sku.skuId]: {
                      ...current[sku.skuId],
                      unitsInStock: event.target.value,
                    },
                  }))
                }
              />
              <input
                inputMode="decimal"
                value={rows[sku.skuId]?.costPerUnit ?? ''}
                onChange={(event) =>
                  setRows((current) => ({
                    ...current,
                    [sku.skuId]: {
                      ...current[sku.skuId],
                      costPerUnit: event.target.value,
                    },
                  }))
                }
              />
            </div>
          ))}
        </div>

        {error ? <p className="error-banner">{error}</p> : null}
      </form>
    </section>
  );
}
