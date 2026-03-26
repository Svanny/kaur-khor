import { useMemo } from 'react';
import { useInventory } from '../state/inventory';
import { usePreferences } from '../state/preferences';
import { formatCurrency, rankLabel } from '../lib/format';
import { FloatingAction, SectionTitle, ShellCard } from '../ui';

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
    <section className="page-stack dashboard-page">
      <SectionTitle title={t('homeKeyMetrics')} />
      <div className="metric-grid">
        <ShellCard className="metric-card">
          <span className="metric-label">{t('dashboardTotalValue')}</span>
          <strong>
            {metrics ? formatCurrency(metrics.totalValue, currency, language) : '—'}
          </strong>
        </ShellCard>
        <ShellCard className="metric-card">
          <span className="metric-label">{t('dashboardSaleReady')}</span>
          <strong>{metrics?.saleReady ?? '—'}</strong>
        </ShellCard>
        <ShellCard className="metric-card">
          <span className="metric-label">{t('dashboardServices')}</span>
          <strong>{metrics?.services ?? '—'}</strong>
        </ShellCard>
        <ShellCard className="metric-card">
          <span className="metric-label">{t('dashboardRanked')}</span>
          <strong>{metrics?.ranked ?? '—'}</strong>
        </ShellCard>
      </div>

      <SectionTitle title={t('homePerformance')} />
      <ShellCard className="performance-card">
        <div className="performance-bars">
          <div className="performance-bar-row">
            <span>{t('dashboardSaleReady')}</span>
            <div className="performance-bar-track">
              <div
                className="performance-bar-fill"
                style={{
                  width: `${metrics ? Math.max(18, Math.min(100, metrics.saleReady * 18)) : 18}%`,
                }}
              />
            </div>
          </div>
          <div className="performance-bar-row">
            <span>{t('dashboardServices')}</span>
            <div className="performance-bar-track">
              <div
                className="performance-bar-fill performance-bar-fill-soft"
                style={{
                  width: `${metrics ? Math.max(18, Math.min(100, metrics.services * 24)) : 18}%`,
                }}
              />
            </div>
          </div>
        </div>
      </ShellCard>

      <SectionTitle title={t('homeRecentActivity')} />
      <ShellCard>
        <div className="activity-list">
          {snapshot?.ranking.map((entry) => (
            <div className="activity-row" key={`${entry.entryType}:${entry.entryId}`}>
              <span className="activity-avatar">{entry.position + 1}</span>
              <div className="activity-copy">
                <strong>{rankLabel(entry, snapshot.skus, snapshot.services)}</strong>
                <p>{entry.entryType === 'service' ? t('serviceLabel') : t('skuLabel')}</p>
              </div>
            </div>
          )) ?? <p className="empty-copy">—</p>}
        </div>
      </ShellCard>

      <FloatingAction label={t('stockFlow')} to="/inventory/stock" />
    </section>
  );
}
