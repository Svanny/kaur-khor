import { useMemo } from 'react';
import { useInventory } from '../state/inventory';
import { usePreferences } from '../state/preferences';
import { formatCurrency, rankLabel } from '../lib/format';

export function DashboardRoute() {
  const { snapshot } = useInventory();
  const { currency, language, t } = usePreferences();

  const metrics = useMemo(() => {
    if (!snapshot) {
      return null;
    }

    const totalValue = snapshot.skus.reduce(
      (sum, sku) => sum + sku.unitsInStock * sku.costPerUnit,
      0,
    );

    return {
      totalValue,
      saleReady: snapshot.skus.filter((sku) => sku.soldAsProduct).length,
      services: snapshot.services.length,
      ranked: snapshot.ranking.length,
    };
  }, [snapshot]);

  return (
    <section className="page-stack">
      <div className="hero-panel">
        <p className="eyebrow">{t('dashboardEyebrow')}</p>
        <h1>{t('dashboardHeading')}</h1>
        <p className="hero-copy">{t('dashboardBody')}</p>
      </div>

      <div className="metric-grid">
        <article className="metric-card">
          <span>{t('dashboardTotalValue')}</span>
          <strong>
            {metrics ? formatCurrency(metrics.totalValue, currency, language) : '—'}
          </strong>
        </article>
        <article className="metric-card">
          <span>{t('dashboardSaleReady')}</span>
          <strong>{metrics?.saleReady ?? '—'}</strong>
        </article>
        <article className="metric-card">
          <span>{t('dashboardServices')}</span>
          <strong>{metrics?.services ?? '—'}</strong>
        </article>
        <article className="metric-card">
          <span>{t('dashboardRanked')}</span>
          <strong>{metrics?.ranked ?? '—'}</strong>
        </article>
      </div>

      <section className="panel">
        <div className="panel-header">
          <h2>{t('dashboardRecent')}</h2>
        </div>
        <div className="rank-list">
          {snapshot?.ranking.map((entry) => (
            <div className="rank-row" key={`${entry.entryType}:${entry.entryId}`}>
              <span className="rank-chip">{entry.position + 1}</span>
              <div>
                <strong>{rankLabel(entry, snapshot.skus, snapshot.services)}</strong>
                <p>{entry.entryType === 'service' ? t('serviceLabel') : t('skuLabel')}</p>
              </div>
            </div>
          )) ?? <p className="empty-copy">—</p>}
        </div>
      </section>
    </section>
  );
}
