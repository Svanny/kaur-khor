import { startTransition, useDeferredValue, useMemo, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDown, ArrowUp, HandCoins, Package, PackagePlus, Search, type LucideIcon } from 'lucide-react';
import type { InventorySnapshot, ServiceRecord, SkuRecord } from '@shared/inventory';
import { NewServiceIcon } from '@/components/system/new-service-icon';
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
import { PageTitleWithBack } from '@/components/system/page-navigation';
import {
  catalogViewFromSearchParams,
  computeServiceSellableUnits,
  matchesCatalogQuery,
  serviceCoverageStateKey,
  sortByName,
  type CatalogView,
} from '@/lib/catalog';
import { formatCurrency, formatNumber, formatWholeNumber } from '@/lib/format';
import { statusPillClassName, type StatusPillTone } from '@/lib/status-pill';
import { cn } from '@/lib/utils';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

const CATALOG_PREVIEW_LIMIT = 4;
type SkuRevenueMetric = 'revenue' | 'gross-margin';
type CatalogSortDirection = 'asc' | 'desc';
type CatalogSortMode<TColumn extends string> = {
  column: TColumn;
  direction: CatalogSortDirection;
};
type SkuPreviewSortColumn = 'item' | 'status' | 'units';
type ServicePreviewSortColumn = 'item' | 'status' | 'sellable';
type SkuSortColumn = 'item' | 'status' | 'units' | 'cost' | 'value' | 'price' | 'outcome';
type ServiceSortColumn = 'item' | 'status' | 'sellable' | 'linked' | 'price' | 'revenue';

function compareStrings(left: string, right: string, direction: CatalogSortDirection) {
  const delta = left.localeCompare(right);
  return direction === 'asc' ? delta : -delta;
}

function compareNumbers(left: number, right: number, direction: CatalogSortDirection) {
  const delta = left - right;
  return direction === 'asc' ? delta : -delta;
}

function compareOptionalNumbers(
  left: number | null,
  right: number | null,
  direction: CatalogSortDirection,
) {
  if (left == null && right == null) {
    return 0;
  }
  if (left == null) {
    return 1;
  }
  if (right == null) {
    return -1;
  }
  return compareNumbers(left, right, direction);
}

function toggleSortMode<TColumn extends string>(
  current: CatalogSortMode<TColumn>,
  column: TColumn,
): CatalogSortMode<TColumn> {
  if (current.column === column) {
    return {
      column,
      direction: current.direction === 'asc' ? 'desc' : 'asc',
    };
  }

  return {
    column,
    direction: 'asc',
  };
}

function inventoryValueForSku(sku: SkuRecord) {
  return sku.unitsInStock * sku.costPerUnit;
}

function potentialRevenueForSku(sku: SkuRecord) {
  if (!sku.soldAsProduct || sku.productPrice === null) {
    return null;
  }

  return sku.unitsInStock * sku.productPrice;
}

function skuStatusKey(sku: SkuRecord, highRiskSkuIds: Set<string>) {
  if (highRiskSkuIds.has(sku.skuId)) {
    return 'catalogServiceAtRiskState';
  }

  return sku.soldAsProduct ? 'inventorySoldAsProduct' : 'inventoryNotSoldAsProduct';
}

function skuStatusTone(statusKey: string): StatusPillTone {
  if (statusKey === 'catalogServiceAtRiskState') {
    return 'warning';
  }

  return statusKey === 'inventorySoldAsProduct' ? 'success' : 'neutral';
}

function serviceStatusTone(statusKey: string): StatusPillTone {
  if (statusKey === 'catalogServiceAtRiskState') {
    return 'warning';
  }
  if (statusKey === 'catalogServiceAvailabilityStockout') {
    return 'danger';
  }
  if (statusKey === 'catalogServiceAvailabilityUnlinked') {
    return 'neutral';
  }

  return 'success';
}

function SortableTableHeader({
  align = 'left',
  direction,
  isActive,
  label,
  onClick,
}: {
  align?: 'left' | 'center';
  direction: CatalogSortDirection;
  isActive: boolean;
  label: string;
  onClick: () => void;
}) {
  const icon = direction === 'asc' ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />;

  return (
    <button
      className={cn(
        'inline-flex items-center gap-1 text-left font-medium text-foreground transition-colors hover:text-foreground/80',
        align === 'center' && 'justify-center',
      )}
      type="button"
      onClick={onClick}
    >
      <span>{label}</span>
      {isActive ? (
        <span aria-hidden="true" className="text-muted-foreground">
          {icon}
        </span>
      ) : null}
      {isActive ? (
        <span className="sr-only">
          {direction === 'asc' ? 'sorted ascending' : 'sorted descending'}
        </span>
      ) : null}
    </button>
  );
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

function CatalogRowIcon({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background text-primary">
      <Icon className="size-4" />
    </div>
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
  const [sortMode, setSortMode] = useState<CatalogSortMode<ServiceSortColumn>>({
    column: 'item',
    direction: 'asc',
  });
  const sortedRows = useMemo(() => {
    return [...rows].sort((left, right) => {
      const leftSellable = computeServiceSellableUnits(left, snapshot);
      const rightSellable = computeServiceSellableUnits(right, snapshot);
      const leftRevenue = leftSellable * left.price;
      const rightRevenue = rightSellable * right.price;
      const leftStatus = t(serviceCoverageStateKey(left, snapshot));
      const rightStatus = t(serviceCoverageStateKey(right, snapshot));

      if (sortMode.column === 'status') {
        const delta = compareStrings(leftStatus, rightStatus, sortMode.direction);
        return delta !== 0 ? delta : compareStrings(left.name, right.name, 'asc');
      }
      if (sortMode.column === 'sellable') {
        const delta = compareNumbers(leftSellable, rightSellable, sortMode.direction);
        return delta !== 0 ? delta : compareStrings(left.name, right.name, 'asc');
      }
      if (sortMode.column === 'linked') {
        const delta = compareNumbers(left.skuIds.length, right.skuIds.length, sortMode.direction);
        return delta !== 0 ? delta : compareStrings(left.name, right.name, 'asc');
      }
      if (sortMode.column === 'price') {
        const delta = compareNumbers(left.price, right.price, sortMode.direction);
        return delta !== 0 ? delta : compareStrings(left.name, right.name, 'asc');
      }
      if (sortMode.column === 'revenue') {
        const delta = compareNumbers(leftRevenue, rightRevenue, sortMode.direction);
        return delta !== 0 ? delta : compareStrings(left.name, right.name, 'asc');
      }

      return compareStrings(left.name, right.name, sortMode.direction);
    });
  }, [rows, snapshot, sortMode, t]);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <SortableTableHeader
                direction={sortMode.direction}
                isActive={sortMode.column === 'item'}
                label={t('inventoryColumnItem')}
                onClick={() => setSortMode((current) => toggleSortMode(current, 'item'))}
              />
            </TableHead>
            <TableHead>
              <SortableTableHeader
                direction={sortMode.direction}
                isActive={sortMode.column === 'status'}
                label={t('inventoryColumnStatus')}
                onClick={() => setSortMode((current) => toggleSortMode(current, 'status'))}
              />
            </TableHead>
            <TableHead className="text-center">
              <SortableTableHeader
                align="center"
                direction={sortMode.direction}
                isActive={sortMode.column === 'sellable'}
                label={t('inventoryColumnSellable')}
                onClick={() => setSortMode((current) => toggleSortMode(current, 'sellable'))}
              />
            </TableHead>
            <TableHead className="text-center">
              <SortableTableHeader
                align="center"
                direction={sortMode.direction}
                isActive={sortMode.column === 'linked'}
                label={t('inventoryColumnLinkedSkus')}
                onClick={() => setSortMode((current) => toggleSortMode(current, 'linked'))}
              />
            </TableHead>
            <TableHead className="text-center">
              <SortableTableHeader
                align="center"
                direction={sortMode.direction}
                isActive={sortMode.column === 'price'}
                label={t('rankHeaderPrice')}
                onClick={() => setSortMode((current) => toggleSortMode(current, 'price'))}
              />
            </TableHead>
            <TableHead className="text-center">
              <SortableTableHeader
                align="center"
                direction={sortMode.direction}
                isActive={sortMode.column === 'revenue'}
                label={t('inventoryPotentialRevenue')}
                onClick={() => setSortMode((current) => toggleSortMode(current, 'revenue'))}
              />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((service) => {
            const sellableUnits = computeServiceSellableUnits(service, snapshot);
            const statusKey = serviceCoverageStateKey(service, snapshot);

            return (
              <TableRow key={service.serviceId}>
                <TableCell className="min-w-0">
                  <Link
                    className="group inline-flex max-w-full items-start gap-3"
                    to={`/catalog/services/${service.serviceId}`}
                  >
                    <CatalogRowIcon icon={HandCoins} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground group-hover:text-primary">
                        {service.name}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">{service.serviceId}</p>
                      <p className="truncate text-sm text-muted-foreground">
                        {service.description}
                      </p>
                    </div>
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge
                    className={cn('rounded-full', statusPillClassName(serviceStatusTone(statusKey)))}
                    variant="outline"
                  >
                    {t(statusKey)}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">{formatWholeNumber(sellableUnits, language)}</TableCell>
                <TableCell className="text-center">{formatWholeNumber(service.skuIds.length, language)}</TableCell>
                <TableCell className="text-center">
                  {formatCurrency(service.price, currency, language)}
                </TableCell>
                <TableCell className="text-center font-medium">
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
  const [sortMode, setSortMode] = useState<CatalogSortMode<ServicePreviewSortColumn>>({
    column: 'item',
    direction: 'asc',
  });
  const sortedRows = useMemo(() => {
    return [...rows].sort((left, right) => {
      const leftSellable = computeServiceSellableUnits(left, snapshot);
      const rightSellable = computeServiceSellableUnits(right, snapshot);
      const leftStatus = t(servicePreviewStatus({ service: left, snapshot }));
      const rightStatus = t(servicePreviewStatus({ service: right, snapshot }));

      if (sortMode.column === 'status') {
        const delta = compareStrings(leftStatus, rightStatus, sortMode.direction);
        return delta !== 0 ? delta : compareStrings(left.name, right.name, 'asc');
      }
      if (sortMode.column === 'sellable') {
        const delta = compareNumbers(leftSellable, rightSellable, sortMode.direction);
        return delta !== 0 ? delta : compareStrings(left.name, right.name, 'asc');
      }

      return compareStrings(left.name, right.name, sortMode.direction);
    });
  }, [rows, snapshot, sortMode, t]);

  return (
    <div className="overflow-x-auto">
      <Table className="table-fixed">
        <CatalogPreviewColGroup />
        <TableHeader>
          <TableRow>
            <TableHead>
              <SortableTableHeader
                direction={sortMode.direction}
                isActive={sortMode.column === 'item'}
                label={t('inventoryColumnItem')}
                onClick={() => setSortMode((current) => toggleSortMode(current, 'item'))}
              />
            </TableHead>
            <TableHead>
              <SortableTableHeader
                direction={sortMode.direction}
                isActive={sortMode.column === 'status'}
                label={t('inventoryColumnStatus')}
                onClick={() => setSortMode((current) => toggleSortMode(current, 'status'))}
              />
            </TableHead>
            <TableHead className="text-right">
              <SortableTableHeader
                align="center"
                direction={sortMode.direction}
                isActive={sortMode.column === 'sellable'}
                label={t('inventoryColumnSellable')}
                onClick={() => setSortMode((current) => toggleSortMode(current, 'sellable'))}
              />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((service) => {
            const sellableUnits = computeServiceSellableUnits(service, snapshot);
            const statusKey = servicePreviewStatus({ service, snapshot });

            return (
              <TableRow key={service.serviceId}>
                <TableCell className="min-w-0">
                  <Link className="group inline-flex max-w-full min-w-0 items-start gap-3" to={`/catalog/services/${service.serviceId}`}>
                    <CatalogRowIcon icon={HandCoins} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium text-foreground group-hover:text-primary">
                        {service.name}
                      </span>
                      <span className="block truncate text-sm text-muted-foreground">{service.serviceId}</span>
                    </span>
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge
                    className={cn('rounded-full', statusPillClassName(serviceStatusTone(statusKey)))}
                    variant="outline"
                  >
                    {t(statusKey)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">{formatWholeNumber(sellableUnits, language)}</TableCell>
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
  metric,
  rows,
  snapshot,
  t,
}: {
  currency: 'USD' | 'KHR';
  language: 'en' | 'km';
  metric: SkuRevenueMetric;
  rows: SkuRecord[];
  snapshot: InventorySnapshot;
  t: (key: string) => string;
}) {
  const highRiskSkuIds = new Set(snapshot.sist.highRiskSkuIds);
  const [sortMode, setSortMode] = useState<CatalogSortMode<SkuSortColumn>>({
    column: 'item',
    direction: 'asc',
  });
  const sortedRows = useMemo(() => {
    return [...rows].sort((left, right) => {
      const leftStatus = t(skuStatusKey(left, highRiskSkuIds));
      const rightStatus = t(skuStatusKey(right, highRiskSkuIds));
      const leftValue = inventoryValueForSku(left);
      const rightValue = inventoryValueForSku(right);
      const leftRevenue = potentialRevenueForSku(left);
      const rightRevenue = potentialRevenueForSku(right);
      const leftOutcome =
        metric === 'gross-margin'
          ? leftRevenue === null
            ? null
            : leftRevenue - leftValue
          : leftRevenue;
      const rightOutcome =
        metric === 'gross-margin'
          ? rightRevenue === null
            ? null
            : rightRevenue - rightValue
          : rightRevenue;

      if (sortMode.column === 'status') {
        const delta = compareStrings(leftStatus, rightStatus, sortMode.direction);
        return delta !== 0 ? delta : compareStrings(left.name, right.name, 'asc');
      }
      if (sortMode.column === 'units') {
        const delta = compareNumbers(left.unitsInStock, right.unitsInStock, sortMode.direction);
        return delta !== 0 ? delta : compareStrings(left.name, right.name, 'asc');
      }
      if (sortMode.column === 'cost') {
        const delta = compareNumbers(left.costPerUnit, right.costPerUnit, sortMode.direction);
        return delta !== 0 ? delta : compareStrings(left.name, right.name, 'asc');
      }
      if (sortMode.column === 'value') {
        const delta = compareNumbers(leftValue, rightValue, sortMode.direction);
        return delta !== 0 ? delta : compareStrings(left.name, right.name, 'asc');
      }
      if (sortMode.column === 'price') {
        const delta = compareOptionalNumbers(left.productPrice, right.productPrice, sortMode.direction);
        return delta !== 0 ? delta : compareStrings(left.name, right.name, 'asc');
      }
      if (sortMode.column === 'outcome') {
        const delta = compareOptionalNumbers(leftOutcome, rightOutcome, sortMode.direction);
        return delta !== 0 ? delta : compareStrings(left.name, right.name, 'asc');
      }

      return compareStrings(left.name, right.name, sortMode.direction);
    });
  }, [highRiskSkuIds, metric, rows, sortMode, t]);

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <SortableTableHeader
                direction={sortMode.direction}
                isActive={sortMode.column === 'item'}
                label={t('inventoryColumnItem')}
                onClick={() => setSortMode((current) => toggleSortMode(current, 'item'))}
              />
            </TableHead>
            <TableHead>
              <SortableTableHeader
                direction={sortMode.direction}
                isActive={sortMode.column === 'status'}
                label={t('inventoryColumnStatus')}
                onClick={() => setSortMode((current) => toggleSortMode(current, 'status'))}
              />
            </TableHead>
            <TableHead className="text-center">
              <SortableTableHeader
                align="center"
                direction={sortMode.direction}
                isActive={sortMode.column === 'units'}
                label={t('fieldUnitsInStock')}
                onClick={() => setSortMode((current) => toggleSortMode(current, 'units'))}
              />
            </TableHead>
            <TableHead className="text-center">
              <SortableTableHeader
                align="center"
                direction={sortMode.direction}
                isActive={sortMode.column === 'cost'}
                label={t('fieldCostPerUnit')}
                onClick={() => setSortMode((current) => toggleSortMode(current, 'cost'))}
              />
            </TableHead>
            <TableHead className="text-center">
              <SortableTableHeader
                align="center"
                direction={sortMode.direction}
                isActive={sortMode.column === 'value'}
                label={t('inventoryColumnValue')}
                onClick={() => setSortMode((current) => toggleSortMode(current, 'value'))}
              />
            </TableHead>
            <TableHead className="text-center">
              <SortableTableHeader
                align="center"
                direction={sortMode.direction}
                isActive={sortMode.column === 'price'}
                label={t('fieldProductPrice')}
                onClick={() => setSortMode((current) => toggleSortMode(current, 'price'))}
              />
            </TableHead>
            <TableHead className="text-center">
              <SortableTableHeader
                align="center"
                direction={sortMode.direction}
                isActive={sortMode.column === 'outcome'}
                label={
                  metric === 'gross-margin'
                    ? t('inventoryPotentialGrossMargin')
                    : t('inventoryPotentialRevenue')
                }
                onClick={() => setSortMode((current) => toggleSortMode(current, 'outcome'))}
              />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((sku) => {
            const statusKey = skuStatusKey(sku, highRiskSkuIds);
            const inventoryValue = inventoryValueForSku(sku);
            const potentialRevenue = potentialRevenueForSku(sku);
            const potentialGrossMargin =
              potentialRevenue === null ? null : potentialRevenue - inventoryValue;

            return (
              <TableRow key={sku.skuId}>
                <TableCell className="min-w-0">
                  <Link
                    className="group inline-flex max-w-full items-start gap-3"
                    to={`/catalog/skus/${sku.skuId}`}
                  >
                    <CatalogRowIcon icon={Package} />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-foreground group-hover:text-primary">
                        {sku.name}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">{sku.skuId}</p>
                      <p className="truncate text-sm text-muted-foreground">{sku.description}</p>
                    </div>
                  </Link>
                </TableCell>
                <TableCell>
                  <Badge
                    className={cn('rounded-full', statusPillClassName(skuStatusTone(statusKey)))}
                    variant="outline"
                  >
                    {t(statusKey)}
                  </Badge>
                </TableCell>
                <TableCell className="text-center">{formatWholeNumber(sku.unitsInStock, language)}</TableCell>
                <TableCell className="text-center">
                  {formatCurrency(sku.costPerUnit, currency, language)}
                </TableCell>
                <TableCell className="text-center">
                  {formatCurrency(inventoryValue, currency, language)}
                </TableCell>
                <TableCell className="text-center">
                  {sku.soldAsProduct && sku.productPrice !== null
                    ? formatCurrency(sku.productPrice, currency, language)
                    : '—'}
                </TableCell>
                <TableCell className="text-center">
                  {metric === 'gross-margin'
                    ? potentialGrossMargin === null
                      ? '—'
                      : formatCurrency(potentialGrossMargin, currency, language)
                    : potentialRevenue === null
                      ? '—'
                      : formatCurrency(potentialRevenue, currency, language)}
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
  const [sortMode, setSortMode] = useState<CatalogSortMode<SkuPreviewSortColumn>>({
    column: 'item',
    direction: 'asc',
  });
  const sortedRows = useMemo(() => {
    return [...rows].sort((left, right) => {
      const leftStatus = left.soldAsProduct ? t('inventorySoldAsProduct') : t('inventoryNotSoldAsProduct');
      const rightStatus = right.soldAsProduct ? t('inventorySoldAsProduct') : t('inventoryNotSoldAsProduct');

      if (sortMode.column === 'status') {
        const delta = compareStrings(leftStatus, rightStatus, sortMode.direction);
        return delta !== 0 ? delta : compareStrings(left.name, right.name, 'asc');
      }
      if (sortMode.column === 'units') {
        const delta = compareNumbers(left.unitsInStock, right.unitsInStock, sortMode.direction);
        return delta !== 0 ? delta : compareStrings(left.name, right.name, 'asc');
      }

      return compareStrings(left.name, right.name, sortMode.direction);
    });
  }, [rows, sortMode, t]);

  return (
    <div className="overflow-x-auto">
      <Table className="table-fixed">
        <CatalogPreviewColGroup />
        <TableHeader>
          <TableRow>
            <TableHead>
              <SortableTableHeader
                direction={sortMode.direction}
                isActive={sortMode.column === 'item'}
                label={t('inventoryColumnItem')}
                onClick={() => setSortMode((current) => toggleSortMode(current, 'item'))}
              />
            </TableHead>
            <TableHead>
              <SortableTableHeader
                direction={sortMode.direction}
                isActive={sortMode.column === 'status'}
                label={t('catalogSkuDirectSellStatus')}
                onClick={() => setSortMode((current) => toggleSortMode(current, 'status'))}
              />
            </TableHead>
            <TableHead className="text-right">
              <SortableTableHeader
                align="center"
                direction={sortMode.direction}
                isActive={sortMode.column === 'units'}
                label={t('fieldUnitsInStock')}
                onClick={() => setSortMode((current) => toggleSortMode(current, 'units'))}
              />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedRows.map((sku) => (
            <TableRow key={sku.skuId}>
              <TableCell className="min-w-0">
                <Link className="group inline-flex max-w-full min-w-0 items-start gap-3" to={`/catalog/skus/${sku.skuId}`}>
                  <CatalogRowIcon icon={Package} />
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-foreground group-hover:text-primary">
                      {sku.name}
                    </span>
                    <span className="block truncate text-sm text-muted-foreground">{sku.skuId}</span>
                  </span>
                </Link>
              </TableCell>
              <TableCell>
                <Badge
                  className={cn(
                    'rounded-full',
                    statusPillClassName(
                      sku.soldAsProduct ? 'success' : 'neutral',
                    ),
                  )}
                  variant="outline"
                >
                  {sku.soldAsProduct ? t('inventorySoldAsProduct') : t('inventoryNotSoldAsProduct')}
                </Badge>
              </TableCell>
              <TableCell className="text-right">{formatWholeNumber(sku.unitsInStock, language)}</TableCell>
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
  const [skuRevenueMetric, setSkuRevenueMetric] = useState<SkuRevenueMetric>('revenue');

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
                <NewServiceIcon className="relative inline-flex size-4 shrink-0" />
                {t('createServiceAction')}
              </Link>
            </Button>
          </div>
        }
        description={t('inventoryBody')}
        title={<PageTitleWithBack>{t('allItemsTitle')}</PageTitleWithBack>}
      >
        <div className="grid gap-4">
          <InputGroup className="h-12 w-full rounded-full">
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

          <div>
            <ToggleGroup
              aria-label={t('searchItems')}
              className="inline-flex max-w-full justify-start overflow-x-auto"
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
            action={
              <ToggleGroup
                aria-label={t('catalogSkuMetricToggle')}
                spacing={1}
                type="single"
                value={skuRevenueMetric}
                onValueChange={(nextValue) => {
                  if (nextValue) {
                    setSkuRevenueMetric(nextValue as SkuRevenueMetric);
                  }
                }}
              >
                <ToggleGroupItem value="revenue">{t('catalogSkuMetricRevenue')}</ToggleGroupItem>
                <ToggleGroupItem value="gross-margin">
                  {t('catalogSkuMetricGrossMargin')}
                </ToggleGroupItem>
              </ToggleGroup>
            }
            count={rows.skus.length}
            description={t('catalogSkusDescription')}
            title={t('skusHeading')}
          />
          <SkuCatalogTable
            currency={currency}
            language={language}
            metric={skuRevenueMetric}
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
