import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { EllipsisVertical, Eye, Layers3, Package, PackagePlus, Pencil, Store } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { matchesCatalogQuery, type CatalogView } from '@/lib/catalog';
import { formatCurrency } from '@/lib/format';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { buildCatalogSearchParams, readCatalogView } from '@/lib/navigation-state';
import { normalizeServiceDetailPage } from '@/lib/sena-detail-pages';
import { formatSenaReorderQuantity } from '@/lib/sena-reorder-quantity';
import { linkedServiceIdsForSku, linkedSkuIdsForService } from '@/lib/sena-catalog';
import { projectInventorySnapshotFromSena } from '@/lib/project-inventory-snapshot-from-sena';
import { ServiceMutationActions, SkuMutationActions } from '@/routes/catalog-item-actions';
import { WorkspaceTitleCardWireframe } from '@/routes/loading-wireframes';
import type { SenaSkuDetailViewModel } from '@/routes/sku-detail/view-model';
import { deriveServiceDetailViewModel, type ServiceDetailViewModel } from '@/routes/service-detail/view-model';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

function updateCatalogSearchParams(
  current: URLSearchParams,
  updates: {
    q?: string;
    view?: CatalogView;
  },
) {
  return buildCatalogSearchParams(current, {
    q: updates.q,
    view: updates.view,
  });
}

function matchesCatalogRow(parts: Array<string | null | undefined>, query: string) {
  return matchesCatalogQuery(parts.filter(Boolean).join(' '), query);
}

function skuMetaLine(
  linkedServiceCount: number,
  options: {
    costPerUnit: number;
    currency: 'USD' | 'KHR';
    language: 'en' | 'km';
    productPrice: number | null;
    soldAsProduct: boolean;
    usdToKhrExchangeRate: number;
  },
) {
  const parts = [`${linkedServiceCount} linked services`, options.soldAsProduct ? 'sellable' : 'not sellable'];

  if (options.soldAsProduct && options.productPrice != null) {
    parts.push(`price ${formatCurrency(options.productPrice, options.currency, options.language, options.usdToKhrExchangeRate)}`);
  }

  parts.push(`cost ${formatCurrency(options.costPerUnit, options.currency, options.language, options.usdToKhrExchangeRate)}`);
  return parts.join(' · ');
}

function CatalogActionMenu({
  children,
  label = 'More actions',
}: {
  children: (closeMenu: () => void) => ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        size="icon-sm"
        type="button"
        variant="outline"
        onClick={() => setOpen((current) => !current)}
      >
        <EllipsisVertical className="size-4" />
      </Button>
      <div
        className={`absolute right-0 top-full z-20 mt-2 min-w-48 rounded-xl border border-border/70 bg-background p-1 shadow-[0_18px_40px_rgba(48,31,20,0.16)] ${open ? 'block' : 'hidden'}`}
        role="menu"
      >
        {children(() => setOpen(false))}
      </div>
    </div>
  );
}

function CatalogLoadingRows({
  count,
  showActions = true,
}: {
  count: number;
  showActions?: boolean;
}) {
  return Array.from({ length: count }, (_, index) => (
    <div
      key={`catalog-loading-row-${index}`}
      className="rounded-[1.25rem] border border-border/70 bg-background/70 p-4"
    >
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0 flex-1">
          <Skeleton className="h-6 w-40 rounded-full" />
          <Skeleton className="mt-2 h-4 w-24 rounded-full" />
          <Skeleton className="mt-3 h-4 w-full max-w-xl rounded-full" />
          <Skeleton className="mt-2 h-4 w-3/4 rounded-full" />
        </div>
        {showActions ? (
          <div className="flex shrink-0 gap-2">
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-24 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
        ) : null}
      </div>
    </div>
  ));
}

function CatalogLoadingState() {
  return (
    <WorkspacePage>
      <WorkspaceTitleCardWireframe
        actions={
          <WorkspaceActionRow>
            <Skeleton className="h-10 w-28 rounded-full" />
            <Skeleton className="h-10 w-32 rounded-full" />
          </WorkspaceActionRow>
        }
        descriptor="Browse the catalog, search by name or id, and jump straight into the next edit."
        eyebrow="Catalog"
        title="SENA Integrated"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-start lg:gap-4">
          <Skeleton className="h-11 w-full max-w-xl rounded-2xl" />
          <div className="flex gap-2">
            <Skeleton className="h-10 w-20 rounded-2xl" />
            <Skeleton className="h-10 w-24 rounded-2xl" />
            <Skeleton className="h-10 w-28 rounded-2xl" />
          </div>
        </div>
      </WorkspaceTitleCardWireframe>

      <div className="grid gap-6">
        <WorkspacePanel
          title="SKUs"
          descriptor="Stock-carrying items Banji tracks directly."
        >
          <div className="grid gap-3">
            {CatalogLoadingRows({ count: 4 })}
          </div>
        </WorkspacePanel>

        <WorkspacePanel
          title="Services"
          descriptor="Sellable services and the SKUs that support them."
        >
          <div className="grid gap-3">
            {CatalogLoadingRows({ count: 3 })}
          </div>
        </WorkspacePanel>
      </div>
    </WorkspacePage>
  );
}

export function InventoryRoute() {
  const inventory = useInventory();
  const { catalog, observations, reports, snapshot, workspaceSummary } = inventory;
  const { currency, language, t, usdToKhrExchangeRate } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const [serviceActionModels, setServiceActionModels] = useState<Record<string, ServiceDetailViewModel>>({});

  const projectedSnapshot = useMemo(
    () => (catalog ? projectInventorySnapshotFromSena(catalog, observations) : null),
    [catalog, observations],
  );
  const activeSnapshot = snapshot ?? projectedSnapshot;

  const query = searchParams.get('q') ?? '';
  const view = readCatalogView(searchParams);
  const filteredSkus = useMemo(
    () =>
      catalog?.skus.filter((sku) =>
        matchesCatalogRow([sku.skuId, sku.name, sku.description], query),
      ) ?? [],
    [catalog, query],
  );
  const filteredServices = useMemo(
    () =>
      catalog?.services.filter((service) =>
        matchesCatalogRow([service.serviceId, service.name, service.description], query),
      ) ?? [],
    [catalog, query],
  );
  const filteredServiceIdsKey = useMemo(
    () => filteredServices.map((service) => service.serviceId).join('|'),
    [filteredServices],
  );
  const showSkus = view !== 'services';
  const showServices = view !== 'skus';
  const hasResults =
    (showSkus && filteredSkus.length > 0) ||
    (showServices && filteredServices.length > 0);

  useEffect(() => {
    if (!activeSnapshot || filteredServices.length === 0) {
      return;
    }

    let active = true;

    void Promise.all(
      filteredServices.map(async (service) => {
        const snapshotService =
          activeSnapshot.services.find((entry) => entry.serviceId === service.serviceId) ?? null;
        if (!snapshotService) {
          return [service.serviceId, null] as const;
        }

        const detailPage = normalizeServiceDetailPage(
          await inventory.loadSenaServiceDetail(service.serviceId).catch(() => null),
        );
        return [
          service.serviceId,
          deriveServiceDetailViewModel({
            currency,
            detail: detailPage?.detail ?? null,
            language,
            observations,
            reports,
            service: snapshotService,
            snapshot: activeSnapshot,
            workspaceSummary,
          }),
        ] as const;
      }),
    ).then((entries) => {
      if (!active) {
        return;
      }

      const nextEntries = Object.fromEntries(
        entries.filter((entry): entry is readonly [string, ServiceDetailViewModel] => entry[1] != null),
      );
      setServiceActionModels((current) => {
        let changed = false;
        const next = { ...current };

        for (const [serviceId, model] of Object.entries(nextEntries)) {
          if (next[serviceId] !== model) {
            next[serviceId] = model;
            changed = true;
          }
        }

        return changed ? next : current;
      });
    });

    return () => {
      active = false;
    };
  }, [activeSnapshot, currency, filteredServiceIdsKey, filteredServices, inventory, language, observations, reports, workspaceSummary]);

  if (inventory.isLoading && !catalog) {
    return <CatalogLoadingState />;
  }

  if (!catalog) {
    return (
      <WorkspacePage>
        <WorkspaceTitleCard
          eyebrow="Catalog"
          title="Build the SENA catalog"
          descriptor="Start with the first SKU. Banji uses the catalog to connect stock, services, and planning."
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
          hint="Create the first SKU to initialize the local catalog."
          action={
            <Button asChild variant="outline">
              <Link to="/catalog/skus/new">Create first SKU</Link>
            </Button>
          }
        />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <WorkspaceTitleCard
        eyebrow="Catalog"
        title="SENA Integrated"
        descriptor="Browse the catalog, search by name or id, and jump straight into the next edit."
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
          hint="Try another search or create a new item that fits this view."
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

      <div className="grid min-w-0 gap-6">
          {showSkus && filteredSkus.length > 0 ? (
            <WorkspacePanel
              title={`SKUs (${filteredSkus.length})`}
              descriptor="Stock-carrying items Banji tracks directly."
            >
              <div className="grid gap-3">
                {filteredSkus.map((sku) => {
                  const linkedServices = linkedServiceIdsForSku(catalog, sku.skuId);
                  const fallbackSkuActionContext = {
                    currentStock:
                      activeSnapshot?.skus.find((entry) => entry.skuId === sku.skuId)?.unitsInStock ?? 0,
                    costPerUnit: sku.costPerUnit,
                    leadTimeVariability: null,
                    productPrice: sku.productPrice,
                    latestObservationAt: workspaceSummary?.latestObservedAt ?? observations.at(-1)?.input.observedAt ?? null,
                    soldAsProduct: sku.soldAsProduct,
                    recommendedOrderQuantity: 0,
                    reorderRecommendation: formatSenaReorderQuantity(null, language, 0),
                  } satisfies SenaSkuDetailViewModel['actionContext'];

                  return (
                    <div
                      key={sku.skuId}
                      className={`group flex flex-col gap-2 rounded-[1.25rem] border border-border/70 bg-background/70 p-4 transition-colors md:flex-row md:items-center md:justify-between ${rowHoverClassName}`}
                    >
                      <div className="min-w-0">
                        <Link className="font-medium text-foreground transition-colors group-hover:text-primary" to={`/catalog/skus/${sku.skuId}`}>
                          {sku.name}
                        </Link>
                        <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground/75">{sku.skuId}</p>
                        <p className="text-sm text-muted-foreground">{sku.description || 'No description'}</p>
                        <p className="text-xs text-muted-foreground">
                          {skuMetaLine(linkedServices.length, {
                            costPerUnit: sku.costPerUnit,
                            currency,
                            language,
                            productPrice: sku.productPrice,
                            soldAsProduct: sku.soldAsProduct,
                            usdToKhrExchangeRate,
                          })}
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
                        <CatalogActionMenu label={`More actions for ${sku.name}`}>
                          {(closeMenu) => (
                            <SkuMutationActions
                              actionContext={fallbackSkuActionContext}
                              catalogEntityName={sku.name}
                              layout="menu"
                              skuId={sku.skuId}
                              showEditButton={false}
                              onActionStart={() => {
                                closeMenu();
                              }}
                              onComplete={async () => {}}
                            />
                          )}
                        </CatalogActionMenu>
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
              descriptor="Sellable services and the SKUs that support them."
            >
              <div className="grid gap-3">
                {filteredServices.map((service) => {
                  const linkedSkus = linkedSkuIdsForService(catalog, service.serviceId);
                  const serviceModel = serviceActionModels[service.serviceId] ?? null;
                  const fallbackServiceActions = {
                    primarySkuHref: '/catalog',
                    editServiceHref: `/catalog/services/${service.serviceId}/edit`,
                    latestObservedAt: workspaceSummary?.latestObservedAt ?? observations.at(-1)?.input.observedAt ?? null,
                    noBottleneckHint: 'No limiting contributor is active right now.',
                    bottleneckSku: null,
                    servicePrice: {
                      serviceId: service.serviceId,
                      serviceName: service.name,
                      currentPrice: service.price,
                    },
                  } satisfies ServiceDetailViewModel['actions'];

                  return (
                    <div
                      key={service.serviceId}
                      className={`group flex flex-col gap-2 rounded-[1.25rem] border border-border/70 bg-background/70 p-4 transition-colors md:flex-row md:items-center md:justify-between ${rowHoverClassName}`}
                    >
                      <div className="min-w-0">
                        <Link className="font-medium text-foreground transition-colors group-hover:text-primary" to={`/catalog/services/${service.serviceId}`}>
                          {service.name}
                        </Link>
                        <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground/75">{service.serviceId}</p>
                        <p className="text-sm text-muted-foreground">{service.description || 'No description'}</p>
                        <p className="text-xs text-muted-foreground">
                          {linkedSkus.length} linked SKUs · price {formatCurrency(service.price, currency, language, usdToKhrExchangeRate)}
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
                        <CatalogActionMenu label={`More actions for ${service.name}`}>
                          {(closeMenu) => (
                            <ServiceMutationActions
                              actions={serviceModel?.actions ?? fallbackServiceActions}
                              catalogEntityName={service.name}
                              layout="menu"
                              showEditButton={false}
                              showPrimarySkuButton={false}
                              onActionStart={() => {
                                closeMenu();
                              }}
                              onComplete={async () => {}}
                            />
                          )}
                        </CatalogActionMenu>
                      </WorkspaceActionRow>
                    </div>
                  );
                })}
              </div>
            </WorkspacePanel>
          ) : null}
      </div>
    </WorkspacePage>
  );
}
