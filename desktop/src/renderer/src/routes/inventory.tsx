import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import type { InventoryFilter } from '@shared/inventory';
import { useInventory } from '../state/inventory';
import { usePreferences } from '../state/preferences';
import { formatCurrency, formatNumber } from '../lib/format';

export function InventoryRoute() {
  const { snapshot } = useInventory();
  const { currency, language, t } = usePreferences();
  const [filter, setFilter] = useState<InventoryFilter>('all');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    if (!snapshot) {
      return [];
    }

    const normalizedSearch = search.trim().toLowerCase();
    const entries = [
      ...snapshot.skus.map((sku) => ({
        id: sku.skuId,
        kind: 'sku' as const,
        title: sku.name,
        subtitle: sku.description,
        meta: `${formatNumber(sku.unitsInStock, language)} units`,
        amount: formatCurrency(sku.costPerUnit, currency, language),
        href: `/inventory/skus/${sku.skuId}`,
      })),
      ...snapshot.services.map((service) => ({
        id: service.serviceId,
        kind: 'service' as const,
        title: service.name,
        subtitle: service.description,
        meta: `${service.skuIds.length} linked SKU${service.skuIds.length === 1 ? '' : 's'}`,
        amount: formatCurrency(service.price, currency, language),
        href: `/inventory/services/${service.serviceId}`,
      })),
    ];

    return entries.filter((entry) => {
      if (filter !== 'all' && entry.kind !== filter) {
        return false;
      }
      if (!normalizedSearch) {
        return true;
      }
      const haystack = `${entry.id} ${entry.title} ${entry.subtitle}`.toLowerCase();
      return haystack.includes(normalizedSearch);
    });
  }, [currency, filter, language, search, snapshot]);

  return (
    <section className="page-stack">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h1>{t('inventoryHeading')}</h1>
            <p>{t('inventoryBody')}</p>
          </div>
          <div className="action-row">
            <Link className="button secondary" to="/inventory/ranking">
              {t('rankingFlow')}
            </Link>
            <Link className="button secondary" to="/inventory/stock">
              {t('stockFlow')}
            </Link>
            <Link className="button primary" to="/inventory/services/new">
              {t('createService')}
            </Link>
            <Link className="button primary" to="/inventory/skus/new">
              {t('createSku')}
            </Link>
          </div>
        </div>

        <div className="toolbar">
          <div className="segmented">
            {(['all', 'sku', 'service'] as const).map((option) => (
              <button
                type="button"
                key={option}
                className={filter === option ? 'segment active' : 'segment'}
                onClick={() => setFilter(option)}
              >
                {option === 'all'
                  ? t('filterAll')
                  : option === 'sku'
                    ? t('filterSku')
                    : t('filterService')}
              </button>
            ))}
          </div>

          <input
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('searchPlaceholder')}
          />
        </div>
      </div>

      <div className="inventory-grid">
        {rows.map((entry) => (
          <Link className="inventory-card" key={`${entry.kind}:${entry.id}`} to={entry.href}>
            <span className="kind-pill">
              {entry.kind === 'sku' ? t('skuLabel') : t('serviceLabel')}
            </span>
            <h3>{entry.title}</h3>
            <p>{entry.subtitle}</p>
            <div className="inventory-card-footer">
              <span>{entry.meta}</span>
              <strong>{entry.amount}</strong>
            </div>
          </Link>
        ))}
        {rows.length === 0 ? <p className="empty-copy">{t('noResults')}</p> : null}
      </div>
    </section>
  );
}
