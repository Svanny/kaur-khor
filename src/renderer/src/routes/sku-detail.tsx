import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { SistSkuDetail, SistSkuInsight, StockReport } from '@shared/inventory';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  WorkspaceEmpty,
  WorkspacePage,
  WorkspacePanel,
} from '@/components/system/workspace';
import { formatCurrency, formatNumber, localeFor } from '@/lib/format';
import { linkedServicesForSku } from '@/lib/catalog';
import { stockReportSourceKey, summarizeNotes } from '@/lib/stock-report-summary';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

function reportDateLabel(reportedAt: string, language: 'en' | 'km') {
  return new Intl.DateTimeFormat(localeFor(language), {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(reportedAt));
}

function leadTimeSummary(insight: SistSkuInsight, language: 'en' | 'km') {
  return `${formatNumber(insight.leadTime.meanDays, language)} ± ${formatNumber(
    insight.leadTime.stdDays,
    language,
  )}d`;
}

function RecentReportList({
  language,
  reports,
  t,
}: {
  language: 'en' | 'km';
  reports: StockReport[];
  t: (key: string) => string;
}) {
  return (
    <div className="grid gap-3">
      {reports.map((report) => {
        const notes = summarizeNotes(report.notes);

        return (
          <div
            className="rounded-3xl border border-border/70 bg-card/55 px-4 py-4"
            key={report.reportId}
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">{reportDateLabel(report.reportedAt, language)}</Badge>
              <Badge variant="secondary">{t(stockReportSourceKey(report.reportSource))}</Badge>
            </div>
            {notes ? (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{notes}</p>
            ) : (
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {t('stockHistoryNoNotes')}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function SkuDetailRoute() {
  const { skuId } = useParams();
  const { loadSistSkuDetail, snapshot } = useInventory();
  const { currency, language, t } = usePreferences();
  const [skuDetail, setSkuDetail] = useState<SistSkuDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const sku = useMemo(
    () => snapshot?.skus.find((entry) => entry.skuId === skuId) ?? null,
    [skuId, snapshot],
  );

  const snapshotInsight = useMemo(
    () => snapshot?.sist.skuInsights.find((entry) => entry.skuId === skuId) ?? null,
    [skuId, snapshot],
  );

  const linkedServices = useMemo(
    () => (snapshot && skuId ? linkedServicesForSku(skuId, snapshot) : []),
    [skuId, snapshot],
  );

  const planningInsight = skuDetail?.insight ?? snapshotInsight;

  useEffect(() => {
    let cancelled = false;

    if (!skuId || !sku) {
      return;
    }

    setDetailLoading(true);
    setDetailError(null);

    loadSistSkuDetail(skuId)
      .then((nextDetail) => {
        if (!cancelled) {
          setSkuDetail(nextDetail);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setDetailError(error instanceof Error ? error.message : t('apiUnavailable'));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setDetailLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [loadSistSkuDetail, sku, skuId, t]);

  if (!snapshot) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty description={t('apiUnavailable')} title={t('catalogSkuDetailTitle')} />
      </WorkspacePage>
    );
  }

  if (!sku) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          action={
            <Button asChild>
              <Link to="/catalog">{t('backToCatalog')}</Link>
            </Button>
          }
          description={t('catalogSkuDetailNotFoundDescription')}
          title={t('catalogSkuDetailNotFoundTitle')}
        />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage data-testid="sku-detail-route">
      <WorkspacePanel
        action={
          <div className="flex flex-wrap gap-3">
            <Button asChild variant="outline">
              <Link to="/catalog">{t('backToCatalog')}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to={`/operations/session?step=observations&focusSku=${sku.skuId}`}>
                {t('catalogSkuStockAction')}
              </Link>
            </Button>
            <Button asChild>
              <Link to={`/catalog/skus/${sku.skuId}/edit`}>{t('catalogSkuEditAction')}</Link>
            </Button>
          </div>
        }
        description={t('catalogSkuOverviewIdentityDescription')}
        title={sku.name}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">
            {t('fieldId')}: {sku.skuId}
          </Badge>
          <Badge variant={sku.soldAsProduct ? 'secondary' : 'outline'}>
            {sku.soldAsProduct ? t('inventorySoldAsProduct') : t('inventoryNotSoldAsProduct')}
          </Badge>
        </div>
      </WorkspacePanel>

      <WorkspacePanel
        description={t('catalogSkuDetailOverviewDescription')}
        title={t('catalogSkuDetailOverviewTitle')}
      >
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
          <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('fieldDescription')}
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{sku.description}</p>
          </div>
          <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('fieldId')}
            </p>
            <p className="mt-3 text-xl font-semibold tracking-[-0.03em]">{sku.skuId}</p>
          </div>
        </div>
      </WorkspacePanel>

      <WorkspacePanel
        description={t('catalogSkuDetailOverviewDescription')}
        title={t('editorInventoryTitle')}
      >
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('fieldUnitsInStock')}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
              {formatNumber(sku.unitsInStock, language)}
            </p>
          </div>
          <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('fieldCostPerUnit')}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
              {formatCurrency(sku.costPerUnit, currency, language)}
            </p>
          </div>
          <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('catalogSkuDirectSellStatus')}
            </p>
            <p className="mt-3 text-xl font-semibold tracking-[-0.03em]">
              {sku.soldAsProduct ? t('inventorySoldAsProduct') : t('inventoryNotSoldAsProduct')}
            </p>
          </div>
          <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
            <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
              {t('fieldProductPrice')}
            </p>
            <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
              {sku.soldAsProduct && sku.productPrice !== null
                ? formatCurrency(sku.productPrice, currency, language)
                : '—'}
            </p>
          </div>
        </div>
      </WorkspacePanel>

      <WorkspacePanel
        description={t('catalogSkuPlanningSignalsDescription')}
        title={t('catalogSkuPlanningSignalsTitle')}
      >
        {planningInsight ? (
          <>
            {detailError ? (
              <p className="text-sm text-muted-foreground">
                {t('catalogSkuPlanningSignalsFallback')}
              </p>
            ) : null}
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {t('catalogDaysOfCover')}
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                  {planningInsight.daysOfCover == null
                    ? '—'
                    : formatNumber(planningInsight.daysOfCover, language)}
                </p>
              </div>
              <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {t('catalogStockoutRisk')}
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                  {formatNumber(planningInsight.stockoutRisk * 100, language)}%
                </p>
              </div>
              <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {t('catalogReorderPoint')}
                </p>
                <p className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
                  {formatNumber(planningInsight.reorderPoint, language)}
                </p>
              </div>
              <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {t('catalogConfidence')}
                </p>
                <p className="mt-3 text-xl font-semibold tracking-[-0.03em]">
                  {planningInsight.confidence}
                </p>
              </div>
              <div className="rounded-3xl border border-border/70 bg-background/55 p-5">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  {t('catalogSkuLeadTimeSummary')}
                </p>
                <p className="mt-3 text-xl font-semibold tracking-[-0.03em]">
                  {leadTimeSummary(planningInsight, language)}
                </p>
              </div>
            </div>
          </>
        ) : detailLoading ? (
          <p className="text-sm text-muted-foreground">{t('catalogSkuDetailLoaderLoading')}</p>
        ) : detailError ? (
          <p className="text-sm text-muted-foreground">{t('catalogSkuPlanningSignalsFallback')}</p>
        ) : (
          <p className="text-sm text-muted-foreground">{t('catalogSkuPlanningSignalsEmpty')}</p>
        )}
      </WorkspacePanel>

      <WorkspacePanel
        description={t('catalogLinkedServicesDescription')}
        title={t('catalogLinkedServicesTitle')}
      >
        {linkedServices.length > 0 ? (
          <div className="grid gap-3">
            {linkedServices.map((service) => (
              <Link
                className="rounded-3xl border border-border/70 bg-card/55 px-4 py-4 transition-colors hover:border-primary/40 hover:text-primary"
                key={service.serviceId}
                to={`/catalog/services/${service.serviceId}`}
              >
                <p className="font-medium text-foreground">{service.name}</p>
                <p className="mt-1 text-sm text-muted-foreground">{service.description}</p>
              </Link>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('catalogLinkedServicesEmpty')}</p>
        )}
      </WorkspacePanel>

      <WorkspacePanel
        description={t('catalogSkuRecentReportsDescription')}
        title={t('catalogSkuRecentReportsTitle')}
      >
        {detailLoading && !skuDetail ? (
          <p className="text-sm text-muted-foreground">{t('catalogSkuDetailLoaderLoading')}</p>
        ) : detailError ? (
          <p className="text-sm text-muted-foreground">{t('catalogSkuRecentReportsFallback')}</p>
        ) : skuDetail && skuDetail.reports.length > 0 ? (
          <RecentReportList language={language} reports={skuDetail.reports.slice(0, 5)} t={t} />
        ) : (
          <p className="text-sm text-muted-foreground">{t('catalogSkuRecentReportsEmpty')}</p>
        )}
      </WorkspacePanel>
    </WorkspacePage>
  );
}
