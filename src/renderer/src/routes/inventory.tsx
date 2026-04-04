import { Eye, Layers3, Package, PackagePlus, Pencil, Store } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import { NewServiceIcon } from '@/components/system/new-service-icon';
import { SearchInput } from '@/components/system/search-input';
import {
  WorkspaceActionRow,
  WorkspaceEmpty,
  WorkspacePage,
  WorkspacePanel,
  WorkspaceTitleCard,
} from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { catalogViewFromSearchParams, matchesCatalogQuery, type CatalogView } from '@/lib/catalog';
import { linkedServiceIdsForSku, linkedSkuIdsForService } from '@/lib/sena-catalog';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

function updateCatalogSearchParams(
  current: URLSearchParams,
  updates: {
    q?: string;
    view?: CatalogView;
  },
) {
  const next = new URLSearchParams(current);

  if (updates.q !== undefined) {
    const query = updates.q.trim();
    if (query) {
      next.set('q', query);
    } else {
      next.delete('q');
    }
  }

  if (updates.view !== undefined) {
    if (updates.view === 'all') {
      next.delete('view');
    } else {
      next.set('view', updates.view);
    }
  }

  return next;
}

function matchesCatalogRow(parts: Array<string | null | undefined>, query: string) {
  return matchesCatalogQuery(parts.filter(Boolean).join(' '), query);
}

export function InventoryRoute() {
  const { catalog } = useInventory();
  const { t } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();

  if (!catalog) {
    return (
      <WorkspacePage>
        <WorkspaceTitleCard
          eyebrow="Catalog"
          title="Build the SENA catalog"
          description="SKUs, services, bundles, and sharing masks now live in one SENA catalog. Start by adding the first SKU."
          actions={
            <Button asChild>
              <Link to="/catalog/skus/new">
                <PackagePlus data-icon="inline-start" />
                New SKU
              </Link>
            </Button>
          }
        />
        <WorkspaceEmpty
          title="No catalog loaded yet"
          description="Create the first SKU to initialize the local SENA workspace catalog."
          action={
            <Button asChild variant="outline">
              <Link to="/catalog/skus/new">Create first SKU</Link>
            </Button>
          }
        />
      </WorkspacePage>
    );
  }

  const query = searchParams.get('q') ?? '';
  const view = catalogViewFromSearchParams(searchParams);
  const filteredSkus = catalog.skus.filter((sku) =>
    matchesCatalogRow([sku.skuId, sku.name, sku.description], query),
  );
  const filteredServices = catalog.services.filter((service) =>
    matchesCatalogRow([service.serviceId, service.name, service.description], query),
  );
  const showSkus = view !== 'services';
  const showServices = view !== 'skus';
  const hasResults =
    (showSkus && filteredSkus.length > 0) ||
    (showServices && filteredServices.length > 0);

  return (
    <WorkspacePage>
      <WorkspaceTitleCard
        eyebrow="Catalog"
        title="SENA Integrated"
        description="Catalog editing is now SENA-native. Services link to SKUs through the sharing mask rather than the old snapshot recipe model."
        actions={
          <WorkspaceActionRow>
            <Button asChild>
              <Link to="/catalog/skus/new">
                <PackagePlus data-icon="inline-start" />
                New SKU
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/catalog/services/new">
                <NewServiceIcon className="size-4 shrink-0" />
                New service
              </Link>
            </Button>
          </WorkspaceActionRow>
        }
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-start lg:gap-4">
          <div className="w-full max-w-xl">
            <SearchInput
              ariaLabel="Search catalog"
              placeholder={t('searchPlaceholder')}
              value={query}
              onChange={(event) => {
                setSearchParams(
                  updateCatalogSearchParams(searchParams, { q: event.target.value }),
                );
              }}
            />
          </div>
          <ToggleGroup
            aria-label={t('searchItems')}
            className="inline-flex max-w-full justify-start overflow-x-auto rounded-2xl"
            spacing={1}
            type="single"
            value={view}
            onValueChange={(nextView) => {
              if (!nextView) {
                return;
              }
              setSearchParams(
                updateCatalogSearchParams(searchParams, { view: nextView as CatalogView }),
              );
            }}
          >
            <ToggleGroupItem value="all">
              <Layers3 data-icon="inline-start" />
              All
            </ToggleGroupItem>
            <ToggleGroupItem value="skus">
              <Package data-icon="inline-start" />
              {t('filterSku')}
            </ToggleGroupItem>
            <ToggleGroupItem value="services">
              <Store data-icon="inline-start" />
              {t('filterService')}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      </WorkspaceTitleCard>

      {!hasResults ? (
        <WorkspaceEmpty
          title="No matching catalog items"
          description="Try clearing the current filters or create a new item that fits this search."
          action={
            <WorkspaceActionRow>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSearchParams(updateCatalogSearchParams(searchParams, { q: '', view: 'all' }))}
              >
                Clear filters
              </Button>
              <Button asChild>
                <Link to="/catalog/skus/new">New SKU</Link>
              </Button>
            </WorkspaceActionRow>
          }
        />
      ) : null}

      {showSkus && filteredSkus.length > 0 ? (
        <WorkspacePanel
          title={`SKUs (${filteredSkus.length})`}
          description="Canonical SENA stock-carrying entities."
        >
        <div className="grid gap-3">
          {filteredSkus.map((sku) => {
            const linkedServices = linkedServiceIdsForSku(catalog, sku.skuId);
            return (
              <div
                key={sku.skuId}
                className="flex flex-col gap-2 rounded-[1.25rem] border border-border/70 bg-background/70 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{sku.name}</p>
                  <p className="text-sm text-muted-foreground">{sku.description || 'No description'}</p>
                  <p className="text-xs text-muted-foreground">
                    {linkedServices.length} linked services · cost {sku.costPerUnit}
                  </p>
                </div>
                <WorkspaceActionRow>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/catalog/skus/${sku.skuId}`}>
                      <Eye data-icon="inline-start" />
                      Detail
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/catalog/skus/${sku.skuId}/edit`}>
                      <Pencil data-icon="inline-start" />
                      Edit
                    </Link>
                  </Button>
                </WorkspaceActionRow>
              </div>
            );
          })}
        </div>
        </WorkspacePanel>
      ) : null}

      {showServices && filteredServices.length > 0 ? (
        <WorkspacePanel
          title={`Services (${filteredServices.length})`}
          description="Demand-facing services and their SKU mask coverage."
        >
        <div className="grid gap-3">
          {filteredServices.map((service) => {
            const linkedSkus = linkedSkuIdsForService(catalog, service.serviceId);
            return (
              <div
                key={service.serviceId}
                className="flex flex-col gap-2 rounded-[1.25rem] border border-border/70 bg-background/70 p-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{service.name}</p>
                  <p className="text-sm text-muted-foreground">{service.description || 'No description'}</p>
                  <p className="text-xs text-muted-foreground">
                    {linkedSkus.length} linked SKUs · price {service.price}
                  </p>
                </div>
                <WorkspaceActionRow>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/catalog/services/${service.serviceId}`}>
                      <Eye data-icon="inline-start" />
                      Detail
                    </Link>
                  </Button>
                  <Button asChild size="sm" variant="outline">
                    <Link to={`/catalog/services/${service.serviceId}/edit`}>
                      <Pencil data-icon="inline-start" />
                      Edit
                    </Link>
                  </Button>
                </WorkspaceActionRow>
              </div>
            );
          })}
        </div>
        </WorkspacePanel>
      ) : null}
    </WorkspacePage>
  );
}
