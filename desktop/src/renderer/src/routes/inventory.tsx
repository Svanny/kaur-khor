import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import type { InventoryFilter } from '@shared/inventory';
import { useInventory } from '../state/inventory';
import { usePreferences } from '../state/preferences';
import { formatCurrency, formatNumber } from '../lib/format';
import { FloatingAction, PageHeader, PillButton, SectionTitle, ShellCard } from '../ui';

export function InventoryRoute() {
  const { snapshot } = useInventory();
  const { currency, language, t } = usePreferences();
  const [filter, setFilter] = useState<InventoryFilter>('all');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => {
    if (!snapshot) {
      return { services: [], skus: [] };
    }

    const normalizedSearch = search.trim().toLowerCase();
    const matchesQuery = (parts: string[]) =>
      !normalizedSearch || parts.join(' ').toLowerCase().includes(normalizedSearch);

    const services =
      filter === 'sku'
        ? []
        : snapshot.services.filter((service) =>
            matchesQuery([service.serviceId, service.name, service.description]),
          );
    const skus =
      filter === 'service'
        ? []
        : snapshot.skus.filter((sku) => matchesQuery([sku.skuId, sku.name, sku.description]));

    return { services, skus };
  }, [currency, filter, language, search, snapshot]);

  return (
    <section className="page-stack inventory-page">
      <PageHeader
        actions={
          <div className="inline-actions">
            <Link className="secondary-pill-button" to="/inventory/ranking">
              {t('rankingFlow')}
            </Link>
            <Link className="secondary-pill-button" to="/inventory/stock">
              {t('stockFlow')}
            </Link>
            <Link className="primary-pill-button" to="/inventory/services/new">
              {t('createServiceAction')}
            </Link>
          </div>
        }
        title={t('allItemsTitle')}
      />

      <ShellCard className="toolbar-card">
        <input
          aria-label={t('searchItems')}
          className="search-input"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={t('searchItems')}
        />
        <div className="pill-row">
          <PillButton active={filter !== 'service'} onClick={() => setFilter(filter === 'service' ? 'all' : 'sku')}>
            {t('filterSku')}
          </PillButton>
          <PillButton active={filter !== 'sku'} onClick={() => setFilter(filter === 'sku' ? 'all' : 'service')}>
            {t('filterService')}
          </PillButton>
        </div>
      </ShellCard>

      {rows.services.length > 0 ? (
        <div className="grouped-list">
          <SectionTitle title={t('servicesHeading')} />
          <div className="stack-list">
            {rows.services.map((service) => {
              const linkedSkus = snapshot?.skus.filter((sku) => service.skuIds.includes(sku.skuId)) ?? [];
              const unitCount =
                linkedSkus.length === 0
                  ? 0
                  : linkedSkus.reduce((min, sku) => Math.min(min, sku.unitsInStock), linkedSkus[0].unitsInStock);
              const estimatedValue =
                linkedSkus.length === 0
                  ? '???'
                  : formatCurrency(unitCount * service.price, currency, language);
              return (
                <Link
                  className="inventory-item-card"
                  key={service.serviceId}
                  to={`/inventory/services/${service.serviceId}`}
                >
                  <div className="inventory-item-media">S</div>
                  <div className="inventory-item-copy">
                    <div className="inventory-item-head">
                      <h3>{service.name}</h3>
                      <span className="kind-pill">{t('serviceLabel')}</span>
                    </div>
                    <p>{service.description}</p>
                    <div className="inventory-pill-row">
                      <span className="summary-pill">
                        {formatNumber(unitCount, language)} units
                      </span>
                      <span className="summary-pill">
                        {formatCurrency(service.price, currency, language)}
                      </span>
                    </div>
                    <div className="inventory-summary-row">
                      <span>Estimated Total Value</span>
                      <strong>{estimatedValue}</strong>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      {rows.skus.length > 0 ? (
        <div className="grouped-list">
          <SectionTitle title={t('skusHeading')} />
          <div className="stack-list">
            {rows.skus.map((sku) => (
              <Link className="inventory-item-card" key={sku.skuId} to={`/inventory/skus/${sku.skuId}`}>
                <div className="inventory-item-media">K</div>
                <div className="inventory-item-copy">
                  <div className="inventory-item-head">
                    <h3>{sku.name}</h3>
                    <span className="kind-pill">{t('skuLabel')}</span>
                  </div>
                  <p>{sku.description}</p>
                  <div className="inventory-pill-row">
                    <span className="summary-pill">
                      {formatNumber(sku.unitsInStock, language)} units
                    </span>
                    <span className="summary-pill">
                      {formatCurrency(sku.costPerUnit, currency, language)}
                    </span>
                  </div>
                  <div className="inventory-summary-row">
                    <span>Total Value</span>
                    <strong>{formatCurrency(sku.unitsInStock * sku.costPerUnit, currency, language)}</strong>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      {rows.skus.length === 0 && rows.services.length === 0 ? (
        <p className="empty-copy">{t('noResults')}</p>
      ) : null}

      <FloatingAction label={t('addItem')} to="/inventory/skus/new" />
    </section>
  );
}
