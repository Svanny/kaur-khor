import { startTransition, useDeferredValue, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Boxes, PackagePlus, PanelsTopLeft, Search, SquareChartGantt } from 'lucide-react';
import type { InventoryFilter, InventorySnapshot, ServiceRecord, SkuRecord } from '@shared/inventory';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import {
  MetricCard,
  MetricGrid,
  WorkspaceActionRow,
  WorkspaceEmpty,
  WorkspaceHero,
  WorkspacePage,
  WorkspacePanel,
} from '@/components/system/workspace';
import { formatCurrency, formatNumber } from '@/lib/format';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

const FILTERS: InventoryFilter[] = ['all', 'sku', 'service'];

function normalizeFilter(value: string | null): InventoryFilter {
  return FILTERS.includes(value as InventoryFilter) ? (value as InventoryFilter) : 'all';
}

function matchesQuery(value: string, query: string) {
  return !query || value.toLowerCase().includes(query.toLowerCase());
}

function ServiceCatalogTable({
  rows,
  snapshot,
  currency,
  language,
  t,
}: {
  rows: ServiceRecord[];
  snapshot: InventorySnapshot;
  currency: 'USD' | 'KHR';
  language: 'en' | 'km';
  t: (key: any) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('inventoryColumnItem')}</TableHead>
            <TableHead>{t('inventoryColumnSellable')}</TableHead>
            <TableHead>{t('inventoryColumnLinkedSkus')}</TableHead>
            <TableHead>{t('rankHeaderPrice')}</TableHead>
            <TableHead className="text-right">{t('inventoryPotentialRevenue')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((service) => {
            const linkedSkus = snapshot.skus.filter((sku) => service.skuIds.includes(sku.skuId));
            const unitCount =
              linkedSkus.length === 0
                ? 0
                : linkedSkus.reduce(
                    (min, sku) => Math.min(min, sku.unitsInStock),
                    linkedSkus[0].unitsInStock,
                  );
            const estimatedValue =
              linkedSkus.length === 0
                ? '—'
                : formatCurrency(unitCount * service.price, currency, language);

            return (
              <TableRow key={service.serviceId}>
                <TableCell className="min-w-0">
                  <Link
                    className="group inline-flex max-w-full items-start gap-3"
                    to={`/inventory/services/${service.serviceId}`}
                  >
                    <div className="rounded-2xl border border-border/70 bg-accent/35 p-2 text-primary">
                      <Boxes className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground group-hover:text-primary">
                        {service.name}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">{service.description}</p>
                    </div>
                  </Link>
                </TableCell>
                <TableCell>{formatNumber(unitCount, language)}</TableCell>
                <TableCell>{service.skuIds.length}</TableCell>
                <TableCell>{formatCurrency(service.price, currency, language)}</TableCell>
                <TableCell className="text-right font-medium">{estimatedValue}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function SkuCatalogTable({
  rows,
  snapshot,
  currency,
  language,
  t,
}: {
  rows: SkuRecord[];
  snapshot: InventorySnapshot;
  currency: 'USD' | 'KHR';
  language: 'en' | 'km';
  t: (key: any) => string;
}) {
  const insightsById = new Map(snapshot.sist.skuInsights.map((insight) => [insight.skuId, insight]));

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('inventoryColumnItem')}</TableHead>
            <TableHead>{t('fieldUnitsInStock')}</TableHead>
            <TableHead>{t('fieldCostPerUnit')}</TableHead>
            <TableHead>{t('fieldProductPrice')}</TableHead>
            <TableHead>{t('catalogDaysOfCover')}</TableHead>
            <TableHead>{t('catalogStockoutRisk')}</TableHead>
            <TableHead>{t('catalogLeadTime')}</TableHead>
            <TableHead>{t('catalogConfidence')}</TableHead>
            <TableHead className="text-right">{t('inventoryColumnValue')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((sku) => {
            const insight = insightsById.get(sku.skuId);
            return (
              <TableRow key={sku.skuId}>
                <TableCell className="min-w-0">
                  <Link
                    className="group inline-flex max-w-full items-start gap-3"
                    to={`/inventory/skus/${sku.skuId}`}
                  >
                    <div className="rounded-2xl border border-border/70 bg-background p-2 text-primary">
                      <PackagePlus className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-medium text-foreground group-hover:text-primary">
                          {sku.name}
                        </p>
                        <Badge
                          className="rounded-full"
                          variant={sku.soldAsProduct ? 'secondary' : 'outline'}
                        >
                          {sku.soldAsProduct
                            ? t('inventorySoldAsProduct')
                            : t('inventoryNotSoldAsProduct')}
                        </Badge>
                      </div>
                      <p className="truncate text-sm text-muted-foreground">{sku.description}</p>
                    </div>
                  </Link>
                </TableCell>
                <TableCell>{formatNumber(sku.unitsInStock, language)}</TableCell>
                <TableCell>{formatCurrency(sku.costPerUnit, currency, language)}</TableCell>
                <TableCell>
                  {sku.soldAsProduct && sku.productPrice !== null
                    ? formatCurrency(sku.productPrice, currency, language)
                    : '—'}
                </TableCell>
                <TableCell>
                  {insight?.daysOfCover ? formatNumber(insight.daysOfCover, language) : '—'}
                </TableCell>
                <TableCell>
                  {insight ? `${formatNumber(insight.stockoutRisk * 100, language)}%` : '—'}
                </TableCell>
                <TableCell>
                  {insight ? `${formatNumber(insight.leadTime.meanDays, language)}d` : '—'}
                </TableCell>
                <TableCell>{insight ? insight.confidence : '—'}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(sku.unitsInStock * sku.costPerUnit, currency, language)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

export function InventoryRoute() {
  const { snapshot } = useInventory();
  const { currency, language, t } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();

  const filter = normalizeFilter(searchParams.get('type'));
  const query = searchParams.get('q') ?? '';
  const deferredQuery = useDeferredValue(query);

  const rows = useMemo(() => {
    if (!snapshot) {
      return { services: [], skus: [] };
    }

    const services =
      filter === 'sku'
        ? []
        : snapshot.services.filter((service) =>
            matchesQuery(
              [service.serviceId, service.name, service.description].join(' '),
              deferredQuery.trim(),
            ),
          );
    const skus =
      filter === 'service'
        ? []
        : snapshot.skus.filter((sku) =>
            matchesQuery([sku.skuId, sku.name, sku.description].join(' '), deferredQuery.trim()),
          );

    return { services, skus };
  }, [deferredQuery, filter, snapshot]);

  function patchSearchParams(nextQuery: string, nextFilter: InventoryFilter) {
    const next = new URLSearchParams(searchParams);

    if (nextQuery.trim()) {
      next.set('q', nextQuery);
    } else {
      next.delete('q');
    }

    if (nextFilter === 'all') {
      next.delete('type');
    } else {
      next.set('type', nextFilter);
    }

    startTransition(() => {
      setSearchParams(next, { replace: true });
    });
  }

  const totalValue =
    snapshot?.skus.reduce((sum, sku) => sum + sku.unitsInStock * sku.costPerUnit, 0) ?? 0;
  const showServices = filter !== 'sku';
  const showSkus = filter !== 'service';
  const highRiskCount = snapshot?.sist.highRiskSkuIds.length ?? 0;

  return (
    <WorkspacePage>
      <WorkspaceHero
        actions={
          <WorkspaceActionRow>
            <Button asChild variant="secondary">
              <Link to="/inventory/stock">
                <SquareChartGantt data-icon="inline-start" />
                {t('stockFlow')}
              </Link>
            </Button>
            <Button asChild>
              <Link to="/inventory/skus/new">
                <PackagePlus data-icon="inline-start" />
                {t('createSkuAction')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/inventory/services/new">
                <PanelsTopLeft data-icon="inline-start" />
                {t('createServiceAction')}
              </Link>
            </Button>
          </WorkspaceActionRow>
        }
        description={t('inventoryBody')}
        eyebrow={t('navInventory')}
        title={t('allItemsTitle')}
      />

      <MetricGrid className="xl:grid-cols-3">
        <MetricCard
          detail={t('catalogSkusDescription')}
          label={t('skusHeading')}
          value={formatNumber(snapshot?.skus.length ?? 0, language)}
        />
        <MetricCard
          detail={t('catalogServicesDescription')}
          label={t('servicesHeading')}
          value={formatNumber(snapshot?.services.length ?? 0, language)}
        />
        <MetricCard
          detail={query ? `"${query}"` : t('searchItems')}
          label={t('dashboardTotalValue')}
          value={formatCurrency(totalValue, currency, language)}
        />
        <MetricCard
          detail={snapshot?.sist.status.reason ?? t('dashboardRiskDescription')}
          label={t('dashboardHighRisk')}
          value={formatNumber(highRiskCount, language)}
        />
      </MetricGrid>

      <WorkspacePanel description={t('inventoryBody')} title={t('searchItems')}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <InputGroup className="lg:max-w-xl">
            <InputGroupAddon align="inline-start">
              <InputGroupText>
                <Search />
              </InputGroupText>
            </InputGroupAddon>
            <InputGroupInput
              aria-label={t('searchItems')}
              placeholder={t('searchPlaceholder')}
              value={query}
              onChange={(event) => patchSearchParams(event.target.value, filter)}
            />
          </InputGroup>

          <ToggleGroup
            aria-label={t('searchItems')}
            spacing={1}
            type="single"
            value={filter}
            onValueChange={(value) => {
              if (!value) return;
              patchSearchParams(query, value as InventoryFilter);
            }}
          >
            <ToggleGroupItem value="all">{t('filterAll')}</ToggleGroupItem>
            <ToggleGroupItem value="sku">{t('filterSku')}</ToggleGroupItem>
            <ToggleGroupItem value="service">{t('filterService')}</ToggleGroupItem>
          </ToggleGroup>
        </div>
      </WorkspacePanel>

      <div className="grid gap-6 xl:grid-cols-2">
        {showServices ? (
          <WorkspacePanel
            description={t('catalogServicesDescription')}
            title={t('servicesHeading')}
          >
            {snapshot && rows.services.length > 0 ? (
              <ServiceCatalogTable
                currency={currency}
                language={language}
                rows={rows.services}
                snapshot={snapshot}
                t={t}
              />
            ) : (
              <WorkspaceEmpty
                description={t('inventoryNoResultsDescription')}
                title={t('servicesHeading')}
                action={
                  <Button asChild variant="outline">
                    <Link to="/inventory/services/new">
                      <PanelsTopLeft data-icon="inline-start" />
                      {t('createServiceAction')}
                    </Link>
                  </Button>
                }
              />
            )}
          </WorkspacePanel>
        ) : null}

        {showSkus ? (
          <WorkspacePanel
            description={t('catalogSkusDescription')}
            title={t('skusHeading')}
          >
            {rows.skus.length > 0 ? (
              <SkuCatalogTable
                currency={currency}
                language={language}
                rows={rows.skus}
                snapshot={snapshot}
                t={t}
              />
            ) : (
              <WorkspaceEmpty
                description={t('inventoryNoResultsDescription')}
                title={t('skusHeading')}
                action={
                  <Button asChild variant="outline">
                    <Link to="/inventory/skus/new">
                      <PackagePlus data-icon="inline-start" />
                      {t('createSkuAction')}
                    </Link>
                  </Button>
                }
              />
            )}
          </WorkspacePanel>
        ) : null}
      </div>
    </WorkspacePage>
  );
}
