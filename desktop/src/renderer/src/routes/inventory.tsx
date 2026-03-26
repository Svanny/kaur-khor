import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { ArrowRight, Boxes, ListOrdered, PackagePlus, SquareChartGantt } from 'lucide-react';
import type { InventoryFilter } from '@shared/inventory';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  EmptyState,
  MetricStrip,
  PageIntro,
  PageSection,
  SectionHeading,
  Surface,
} from '@/components/banji-primitives';
import { formatCurrency, formatNumber } from '@/lib/format';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

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
  }, [filter, search, snapshot]);

  return (
    <PageSection className="space-y-6">
      <PageIntro
        actions={
          <>
            <Button asChild className="rounded-full px-5" variant="secondary">
              <Link to="/inventory/ranking">
                <ListOrdered className="size-4" />
                <span>{t('rankingFlow')}</span>
              </Link>
            </Button>
            <Button asChild className="rounded-full px-5" variant="secondary">
              <Link to="/inventory/stock">
                <SquareChartGantt className="size-4" />
                <span>{t('stockFlow')}</span>
              </Link>
            </Button>
            <Button asChild className="rounded-full px-5">
              <Link to="/inventory/skus/new">
                <PackagePlus className="size-4" />
                <span>{t('createSkuAction')}</span>
              </Link>
            </Button>
          </>
        }
        aside={
          <div className="grid w-full gap-2 rounded-[24px] border border-border/80 bg-background/80 p-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2 text-foreground">
              <Boxes className="size-4 text-primary" />
              <span className="font-medium">{t('inventoryBody')}</span>
            </div>
          </div>
        }
        description={t('inventoryBody')}
        eyebrow={t('navInventory')}
        title={t('allItemsTitle')}
      />

      <MetricStrip
        items={[
          { label: t('skusHeading'), value: snapshot?.skus.length ?? 0 },
          { label: t('servicesHeading'), value: snapshot?.services.length ?? 0 },
          {
            label: t('dashboardTotalValue'),
            value: formatCurrency(
              snapshot?.skus.reduce((sum, sku) => sum + sku.unitsInStock * sku.costPerUnit, 0) ?? 0,
              currency,
              language,
            ),
          },
        ]}
        className="xl:grid-cols-3"
      />

      <Surface className="space-y-4">
        <SectionHeading title={t('searchItems')} />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <Input
            aria-label={t('searchItems')}
            className="h-12 rounded-full bg-background px-5 text-base lg:max-w-md"
            placeholder={t('searchPlaceholder')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Tabs
            className="w-full lg:w-auto"
            value={filter}
            onValueChange={(value) => setFilter(value as InventoryFilter)}
          >
            <TabsList className="h-auto rounded-full bg-muted/70 p-1" variant="default">
              <TabsTrigger className="rounded-full px-4" value="all">
                {t('filterAll')}
              </TabsTrigger>
              <TabsTrigger className="rounded-full px-4" value="sku">
                {t('filterSku')}
              </TabsTrigger>
              <TabsTrigger className="rounded-full px-4" value="service">
                {t('filterService')}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </Surface>

      {rows.services.length > 0 ? (
        <Surface className="space-y-4">
          <SectionHeading title={t('servicesHeading')} />
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
              {rows.services.map((service) => {
                const linkedSkus = snapshot?.skus.filter((sku) => service.skuIds.includes(sku.skuId)) ?? [];
                const unitCount =
                  linkedSkus.length === 0
                    ? 0
                    : linkedSkus.reduce((min, sku) => Math.min(min, sku.unitsInStock), linkedSkus[0].unitsInStock);
                const estimatedValue =
                  linkedSkus.length === 0
                    ? '—'
                    : formatCurrency(unitCount * service.price, currency, language);

                return (
                  <TableRow key={service.serviceId}>
                    <TableCell className="min-w-0">
                      <Link className="group inline-flex max-w-full items-start gap-3" to={`/inventory/services/${service.serviceId}`}>
                        <div className="rounded-2xl border border-border/70 bg-accent/60 p-2 text-primary">
                          <Boxes className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground group-hover:text-primary">
                            {service.name}
                          </p>
                          <p className="truncate text-sm text-muted-foreground">
                            {service.description}
                          </p>
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
        </Surface>
      ) : null}

      {rows.skus.length > 0 ? (
        <Surface className="space-y-4">
          <SectionHeading title={t('skusHeading')} />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('inventoryColumnItem')}</TableHead>
                <TableHead>{t('fieldUnitsInStock')}</TableHead>
                <TableHead>{t('fieldCostPerUnit')}</TableHead>
                <TableHead>{t('fieldProductPrice')}</TableHead>
                <TableHead className="text-right">{t('inventoryColumnValue')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.skus.map((sku) => (
                <TableRow key={sku.skuId}>
                  <TableCell className="min-w-0">
                    <Link className="group inline-flex max-w-full items-start gap-3" to={`/inventory/skus/${sku.skuId}`}>
                      <div className="rounded-2xl border border-border/70 bg-background p-2 text-primary">
                        <PackagePlus className="size-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate font-medium text-foreground group-hover:text-primary">
                            {sku.name}
                          </p>
                          <Badge className="rounded-full" variant={sku.soldAsProduct ? 'secondary' : 'outline'}>
                            {sku.soldAsProduct ? t('inventorySoldAsProduct') : t('inventoryNotSoldAsProduct')}
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
                  <TableCell className="text-right font-medium">
                    {formatCurrency(sku.unitsInStock * sku.costPerUnit, currency, language)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Surface>
      ) : null}

      {rows.skus.length === 0 && rows.services.length === 0 ? (
        <EmptyState
          description={t('inventoryNoResultsDescription')}
          title={t('inventoryNoResultsTitle')}
          action={
            <Button asChild className="rounded-full" variant="outline">
              <Link to="/inventory/skus/new">
                <span>{t('createSkuAction')}</span>
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          }
        />
      ) : null}
    </PageSection>
  );
}
