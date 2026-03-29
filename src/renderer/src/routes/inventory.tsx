import { startTransition, useDeferredValue, useMemo, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Boxes, PackagePlus, PanelsTopLeft, Search } from 'lucide-react';
import type { InventorySnapshot, ServiceRecord, SkuRecord } from '@shared/inventory';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from '@/components/ui/input-group';
import {
  WorkspaceEmpty,
  WorkspacePage,
  WorkspacePanel,
} from '@/components/system/workspace';
import { DescriptionText } from '@/components/system/description-text';
import {
  catalogViewFromSearchParams,
  computeServiceSellableUnits,
  matchesCatalogQuery,
  serviceCoverageStateKey,
  sortByName,
  type CatalogView,
} from '@/lib/catalog';
import { formatCurrency, formatNumber } from '@/lib/format';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

const CATALOG_PREVIEW_LIMIT = 4;

function catalogCountLabel({
  count,
  language,
  singular,
  plural,
}: {
  count: number;
  language: 'en' | 'km';
  singular: string;
  plural: string;
}) {
  return `${formatNumber(count, language)} ${count === 1 ? singular : plural}`;
}

function patchCatalogSearchParams({
  query,
  searchParams,
  setSearchParams,
  view,
}: {
  query: string;
  searchParams: URLSearchParams;
  setSearchParams: ReturnType<typeof useSearchParams>[1];
  view: CatalogView;
}) {
  const next = new URLSearchParams(searchParams);

  if (query.trim()) {
    next.set('q', query);
  } else {
    next.delete('q');
  }

  if (view === 'all') {
    next.delete('view');
  } else {
    next.set('view', view);
  }

  startTransition(() => {
    setSearchParams(next, { replace: true });
  });
}

function catalogEmptyState({
  createHref,
  createLabel,
}: {
  createHref: string;
  createLabel: string;
}) {
  return (
    <Button asChild variant="outline">
      <Link to={createHref}>{createLabel}</Link>
    </Button>
  );
}

function CatalogPreviewColGroup() {
  return (
    <colgroup>
      <col className="w-[56%]" />
      <col className="w-[24%]" />
      <col className="w-[20%]" />
    </colgroup>
  );
}

function SkuCatalogColGroup() {
  return (
    <colgroup>
      <col className="w-[46%]" />
      <col className="w-[20%]" />
      <col className="w-[12%]" />
      <col className="w-[11%]" />
      <col className="w-[11%]" />
    </colgroup>
  );
}

function ServiceCatalogTable({
  currency,
  language,
  rows,
  snapshot,
  t,
}: {
  currency: 'USD' | 'KHR';
  language: 'en' | 'km';
  rows: ServiceRecord[];
  snapshot: InventorySnapshot;
  t: (key: string) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('inventoryColumnItem')}</TableHead>
            <TableHead>{t('inventoryColumnStatus')}</TableHead>
            <TableHead>{t('inventoryColumnSellable')}</TableHead>
            <TableHead>{t('inventoryColumnLinkedSkus')}</TableHead>
            <TableHead>{t('rankHeaderPrice')}</TableHead>
            <TableHead className="text-right">{t('inventoryPotentialRevenue')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((service) => {
            const sellableUnits = computeServiceSellableUnits(service, snapshot);
            const statusKey = serviceCoverageStateKey(service, snapshot);

            return (
              <TableRow key={service.serviceId}>
                <TableCell className="min-w-0">
                  <Link
                    className="group inline-flex max-w-full items-start gap-3"
                    to={`/catalog/services/${service.serviceId}`}
                  >
                    <div className="rounded-2xl border border-border/70 bg-accent/35 p-2 text-primary">
                      <Boxes className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground group-hover:text-primary">
                        {service.name}
                      </p>
                      <DescriptionText className="truncate text-sm text-muted-foreground">
                        {service.description}
                      </DescriptionText>
                    </div>
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge
                    className="rounded-full"
                    variant={statusKey === 'catalogServiceAvailabilityAvailable' ? 'secondary' : 'outline'}
                  >
                    {t(statusKey)}
                  </Badge>
                </TableCell>
                <TableCell>{formatNumber(sellableUnits, language)}</TableCell>
                <TableCell>{formatNumber(service.skuIds.length, language)}</TableCell>
                <TableCell>{formatCurrency(service.price, currency, language)}</TableCell>
                <TableCell className="text-right font-medium">
                  {formatCurrency(sellableUnits * service.price, currency, language)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function servicePreviewStatus({
  service,
  snapshot,
}: {
  service: ServiceRecord;
  snapshot: InventorySnapshot;
}) {
  return serviceCoverageStateKey(service, snapshot);
}

function ServiceCatalogPreviewTable({
  language,
  rows,
  snapshot,
  t,
}: {
  language: 'en' | 'km';
  rows: ServiceRecord[];
  snapshot: InventorySnapshot;
  t: (key: string) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <Table className="table-fixed">
        <CatalogPreviewColGroup />
        <TableHeader>
          <TableRow>
            <TableHead>{t('inventoryColumnItem')}</TableHead>
            <TableHead>{t('inventoryColumnStatus')}</TableHead>
            <TableHead className="text-right">{t('inventoryColumnSellable')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((service) => {
            const sellableUnits = computeServiceSellableUnits(service, snapshot);
            const statusKey = servicePreviewStatus({ service, snapshot });

            return (
              <TableRow key={service.serviceId}>
                <TableCell className="min-w-0">
                  <Link className="group inline-flex max-w-full min-w-0 flex-col" to={`/catalog/services/${service.serviceId}`}>
                    <span className="truncate font-medium text-foreground group-hover:text-primary">
                      {service.name}
                    </span>
                    <span className="truncate text-sm text-muted-foreground">{service.serviceId}</span>
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge
                    className="rounded-full"
                    variant={statusKey === 'catalogServiceAvailabilityAvailable' ? 'secondary' : 'outline'}
                  >
                    {t(statusKey)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{formatNumber(sellableUnits, language)}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function SkuCatalogTable({
  currency,
  language,
  rows,
  snapshot,
  t,
}: {
  currency: 'USD' | 'KHR';
  language: 'en' | 'km';
  rows: SkuRecord[];
  snapshot: InventorySnapshot;
  t: (key: string) => string;
}) {
  const highRiskSkuIds = new Set(snapshot.sist.highRiskSkuIds);

  return (
    <div className="overflow-x-auto">
      <Table className="table-fixed">
        <SkuCatalogColGroup />
        <TableHeader>
          <TableRow>
            <TableHead>{t('inventoryColumnItem')}</TableHead>
            <TableHead>{t('inventoryColumnStatus')}</TableHead>
            <TableHead>{t('fieldUnitsInStock')}</TableHead>
            <TableHead>{t('fieldCostPerUnit')}</TableHead>
            <TableHead>{t('fieldProductPrice')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((sku) => {
            const statusKey = highRiskSkuIds.has(sku.skuId)
              ? 'catalogServiceAtRiskState'
              : sku.soldAsProduct
                ? 'inventorySoldAsProduct'
                : 'inventoryNotSoldAsProduct';

            return (
              <TableRow key={sku.skuId}>
                <TableCell className="min-w-0">
                  <Link
                    className="group inline-flex max-w-full items-start gap-3"
                    to={`/catalog/skus/${sku.skuId}`}
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
                <TableCell>
                  <Badge
                    className="rounded-full"
                    variant={statusKey === 'inventorySoldAsProduct' ? 'secondary' : 'outline'}
                  >
                    {t(statusKey)}
                  </Badge>
                </TableCell>
                <TableCell>{formatNumber(sku.unitsInStock, language)}</TableCell>
                <TableCell>{formatCurrency(sku.costPerUnit, currency, language)}</TableCell>
                <TableCell>
                  {sku.soldAsProduct && sku.productPrice !== null
                    ? formatCurrency(sku.productPrice, currency, language)
                    : '—'}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function SkuCatalogPreviewTable({
  language,
  rows,
  t,
}: {
  language: 'en' | 'km';
  rows: SkuRecord[];
  t: (key: string) => string;
}) {
  return (
    <div className="overflow-x-auto">
      <Table className="table-fixed">
        <CatalogPreviewColGroup />
        <TableHeader>
          <TableRow>
            <TableHead>{t('inventoryColumnItem')}</TableHead>
            <TableHead>{t('catalogSkuDirectSellStatus')}</TableHead>
            <TableHead>{t('fieldUnitsInStock')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((sku) => (
            <TableRow key={sku.skuId}>
              <TableCell className="min-w-0">
                <Link className="group inline-flex max-w-full min-w-0 flex-col" to={`/catalog/skus/${sku.skuId}`}>
                  <span className="truncate font-medium text-foreground group-hover:text-primary">
                    {sku.name}
                  </span>
                  <span className="truncate text-sm text-muted-foreground">{sku.skuId}</span>
                </Link>
              </TableCell>
              <TableCell>
                <Badge
                  className="rounded-full"
                  variant={sku.soldAsProduct ? 'secondary' : 'outline'}
                >
                  {sku.soldAsProduct ? t('inventorySoldAsProduct') : t('inventoryNotSoldAsProduct')}
                </Badge>
              </TableCell>
              <TableCell>{formatNumber(sku.unitsInStock, language)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function CatalogSectionHeader({
  action,
  count,
  description,
  title,
}: {
  action?: ReactNode;
  count: number;
  description: string;
  title: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-lg font-semibold tracking-[-0.03em]">{title}</p>
          <Badge variant="outline">{count}</Badge>
        </div>
        <DescriptionText className="text-sm text-muted-foreground">{description}</DescriptionText>
      </div>
      {action}
    </div>
  );
}

export function InventoryRoute() {
  const { snapshot } = useInventory();
  const { currency, language, t } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();

  const view = catalogViewFromSearchParams(searchParams);
  const query = searchParams.get('q') ?? '';
  const deferredQuery = useDeferredValue(query.trim());

  const rows = useMemo(() => {
    if (!snapshot) {
      return { services: [], skus: [] };
    }

    return {
      services: sortByName(
        snapshot.services.filter((service) =>
          matchesCatalogQuery(
            [service.serviceId, service.name, service.description].join(' '),
            deferredQuery,
          ),
        ),
      ),
      skus: sortByName(
        snapshot.skus.filter((sku) =>
          matchesCatalogQuery([sku.skuId, sku.name, sku.description].join(' '), deferredQuery),
        ),
      ),
    };
  }, [deferredQuery, snapshot]);

  const hasCatalog = Boolean(snapshot && (snapshot.skus.length > 0 || snapshot.services.length > 0));
  const hasMatches = rows.skus.length > 0 || rows.services.length > 0;
  const resultSummary = (() => {
    const skuSummary = catalogCountLabel({
      count: rows.skus.length,
      language,
      singular: t('catalogResultSkuSingular'),
      plural: t('catalogResultSkuPlural'),
    });
    const serviceSummary = catalogCountLabel({
      count: rows.services.length,
      language,
      singular: t('catalogResultServiceSingular'),
      plural: t('catalogResultServicePlural'),
    });

    if (view === 'skus') {
      return query.trim()
        ? `${skuSummary} ${t('catalogResultsMatchingFor')} "${query.trim()}"`
        : skuSummary;
    }

    if (view === 'services') {
      return query.trim()
        ? `${serviceSummary} ${t('catalogResultsMatchingFor')} "${query.trim()}"`
        : serviceSummary;
    }

    const combined = `${skuSummary} ${t('catalogResultsJoiner')} ${serviceSummary}`;
    return query.trim() ? `${combined} ${t('catalogResultsMatchingFor')} "${query.trim()}"` : combined;
  })();

  function updateCatalog(queryValue: string, nextView: CatalogView) {
    patchCatalogSearchParams({
      query: queryValue,
      searchParams,
      setSearchParams,
      view: nextView,
    });
  }

  function renderCatalogEmptyState() {
    if (!hasCatalog) {
      return (
        <WorkspaceEmpty
          action={catalogEmptyState({
            createHref: '/catalog/skus/new',
            createLabel: t('catalogEmptyPrimaryAction'),
          })}
          description={t('catalogEmptyDescription')}
          title={t('catalogEmptyTitle')}
        />
      );
    }

    return (
      <WorkspaceEmpty
        action={
          <div className="flex flex-wrap gap-3">
            <Button type="button" variant="outline" onClick={() => updateCatalog('', view)}>
              {t('catalogNoResultsClearAction')}
            </Button>
            <Button asChild>
              <Link to="/catalog/skus/new">{t('catalogNoResultsCreateAction')}</Link>
            </Button>
          </div>
        }
        description={t('catalogNoResultsDescription')}
        title={t('catalogNoResultsTitle')}
      />
    );
  }

  return (
    <WorkspacePage>
      <WorkspacePanel
        action={
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/catalog/skus/new">
                <PackagePlus data-icon="inline-start" />
                {t('createSkuAction')}
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/catalog/services/new">
                <PanelsTopLeft data-icon="inline-start" />
                {t('createServiceAction')}
              </Link>
            </Button>
          </div>
        }
        description={t('inventoryBody')}
        title={t('allItemsTitle')}
      >
        <div className="grid gap-3">
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
                onChange={(event) => updateCatalog(event.target.value, view)}
              />
            </InputGroup>

            <ToggleGroup
              aria-label={t('searchItems')}
              spacing={1}
              type="single"
              value={view}
              onValueChange={(nextValue) => {
                if (!nextValue) {
                  return;
                }
                updateCatalog(query, nextValue as CatalogView);
              }}
            >
              <ToggleGroupItem value="all">{t('filterAll')}</ToggleGroupItem>
              <ToggleGroupItem value="skus">{t('filterSku')}</ToggleGroupItem>
              <ToggleGroupItem value="services">{t('filterService')}</ToggleGroupItem>
            </ToggleGroup>
          </div>
          <p className="text-sm text-muted-foreground">{resultSummary}</p>
        </div>
      </WorkspacePanel>

      {!hasMatches ? (
        renderCatalogEmptyState()
      ) : view === 'all' ? (
        <div className="grid gap-6">
          <WorkspacePanel>
            <CatalogSectionHeader
              action={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => updateCatalog(query, 'skus')}
                >
                  {t('catalogViewAllSkusAction')}
                </Button>
              }
              count={rows.skus.length}
              description={t('catalogAllSkusDescription')}
              title={t('skusHeading')}
            />
            <SkuCatalogPreviewTable
              language={language}
              rows={rows.skus.slice(0, CATALOG_PREVIEW_LIMIT)}
              t={t}
            />
          </WorkspacePanel>

          <WorkspacePanel>
            <CatalogSectionHeader
              action={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => updateCatalog(query, 'services')}
                >
                  {t('catalogViewAllServicesAction')}
                </Button>
              }
              count={rows.services.length}
              description={t('catalogAllServicesDescription')}
              title={t('servicesHeading')}
            />
            <ServiceCatalogPreviewTable
              language={language}
              rows={rows.services.slice(0, CATALOG_PREVIEW_LIMIT)}
              snapshot={snapshot!}
              t={t}
            />
          </WorkspacePanel>
        </div>
      ) : view === 'skus' ? (
        <WorkspacePanel>
          <CatalogSectionHeader
            count={rows.skus.length}
            description={t('catalogSkusDescription')}
            title={t('skusHeading')}
          />
          <SkuCatalogTable
            currency={currency}
            language={language}
            rows={rows.skus}
            snapshot={snapshot!}
            t={t}
          />
        </WorkspacePanel>
      ) : (
        <WorkspacePanel>
          <CatalogSectionHeader
            count={rows.services.length}
            description={t('catalogServicesDescription')}
            title={t('servicesHeading')}
          />
          <ServiceCatalogTable
            currency={currency}
            language={language}
            rows={rows.services}
            snapshot={snapshot!}
            t={t}
          />
        </WorkspacePanel>
      )}
    </WorkspacePage>
  );
}
