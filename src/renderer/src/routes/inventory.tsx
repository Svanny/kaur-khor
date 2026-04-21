import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActionCreatePackageIcon,
  ActionEditPencilIcon,
} from '@icons/actions';
import { NewServiceIcon } from '@icons/custom';
import {
  EntityLayersIcon,
  EntityOverflowMenuIcon,
  EntityPreviewIcon,
  EntityServiceIcon,
  EntitySkuIcon,
} from '@icons/entities';
import { StatusArchiveIcon } from '@icons/status';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { SearchInput } from '@/components/system/search-input';
import { ItemIdentityBlock } from '@/components/system/item-identity';
import { compactFilterControlClassName } from '@/components/system/compact-controls';
import { SupplierBadge, SupplierFilter, supplierFilterQueryValue, supplierFilterValueForQuery } from '@/components/system/supplier';
import { ConfirmActionDialog } from '@/components/system/confirm-action-dialog';
import { CreateFirstSkuButton } from '@/components/system/create-first-sku-button';
import {
  WorkspaceActionRow,
  WorkspaceEmpty,
  WorkspacePage,
  WorkspacePanel,
  WorkspaceTitleCard,
} from '@/components/system/workspace';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { matchesCatalogQuery, type CatalogView } from '@/lib/catalog';
import { formatCurrency } from '@/lib/format';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { buildCatalogSearchParams, readCatalogView } from '@/lib/navigation-state';
import { normalizeServiceDetailPage } from '@/lib/sena-detail-pages';
import { formatSenaReorderQuantity } from '@/lib/sena-reorder-quantity';
import {
  activeSenaCatalog,
  linkedServiceIdsForSku,
  linkedSkuIdsForService,
  matchesServiceSupplier,
  matchesSkuSupplier,
  skuSearchParts,
} from '@/lib/sena-catalog';
import { projectInventorySnapshotFromSena } from '@/lib/project-inventory-snapshot-from-sena';
import { translateUiLiteral } from '@/lib/translations';
import { ServiceMutationActions, SkuMutationActions } from '@/routes/catalog-item-actions';
import type { ServiceActionMode, SkuActionMode } from '@/routes/catalog-item-actions';
import { WorkspaceTitleCardWireframe } from '@/routes/loading-wireframes';
import type { SenaSkuDetailViewModel } from '@/routes/sku-detail/view-model';
import { deriveServiceDetailViewModel, type ServiceDetailViewModel } from '@/routes/service-detail/view-model';
import { useInventory } from '@/state/inventory';
import { buildBanjiNavigationState } from '@/state/navigation-history';
import { usePreferences } from '@/state/preferences';

function updateCatalogSearchParams(
  current: URLSearchParams,
  updates: {
    q?: string;
    supplier?: string | null;
    view?: CatalogView;
  },
) {
  return buildCatalogSearchParams(current, {
    q: updates.q,
    supplier: updates.supplier,
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
  const parts = [
    translateUiLiteral(options.language, '{count} linked services', { count: linkedServiceCount }),
    translateUiLiteral(options.language, options.soldAsProduct ? 'sellable' : 'not sellable'),
  ];

  if (options.soldAsProduct && options.productPrice != null) {
    parts.push(
      translateUiLiteral(options.language, 'price {value}', {
        value: formatCurrency(options.productPrice, options.currency, options.language, options.usdToKhrExchangeRate),
      }),
    );
  }

  parts.push(
    translateUiLiteral(options.language, 'cost {value}', {
      value: formatCurrency(options.costPerUnit, options.currency, options.language, options.usdToKhrExchangeRate),
    }),
  );
  return parts.join(' · ');
}

function CatalogActionMenu({
  children,
  label = 'More actions',
}: {
  children: (closeMenu: () => void) => ReactNode;
  label?: string;
}) {
  return (
    <AnchoredMenu
      label={label}
      triggerIcon={<EntityOverflowMenuIcon className="size-4" />}
    >
      {children}
    </AnchoredMenu>
  );
}

function CatalogSkuRowActions({
  actionContext,
  label,
  name,
  skuId,
}: {
  actionContext: SenaSkuDetailViewModel['actionContext'];
  label: string;
  name: string;
  skuId: string;
}) {
  const [mode, setMode] = useState<SkuActionMode | null>(null);

  return (
    <>
      <SkuMutationActions
        actionContext={actionContext}
        catalogEntityName={name}
        layout="menu"
        mode={mode}
        onComplete={async () => {}}
        onModeChange={setMode}
        showActionButtons={false}
        showEditButton={false}
        skuId={skuId}
      />
      <CatalogActionMenu label={label}>
        {(closeMenu) => (
          <SkuMutationActions
            actionContext={actionContext}
            catalogEntityName={name}
            layout="menu"
            mode={mode}
            onActionStart={() => {
              closeMenu();
            }}
            onComplete={async () => {}}
            onModeChange={setMode}
            showEditButton={false}
            skuId={skuId}
          />
        )}
      </CatalogActionMenu>
    </>
  );
}

function CatalogServiceRowActions({
  actions,
  label,
  name,
}: {
  actions: ServiceDetailViewModel['actions'];
  label: string;
  name: string;
}) {
  const [mode, setMode] = useState<ServiceActionMode | null>(null);

  return (
    <>
      <ServiceMutationActions
        actions={actions}
        catalogEntityName={name}
        layout="menu"
        mode={mode}
        onComplete={async () => {}}
        onModeChange={setMode}
        showActionButtons={false}
        showEditButton={false}
        showPrimarySkuButton={false}
      />
      <CatalogActionMenu label={label}>
        {(closeMenu) => (
          <ServiceMutationActions
            actions={actions}
            catalogEntityName={name}
            layout="menu"
            mode={mode}
            onActionStart={() => {
              closeMenu();
            }}
            onComplete={async () => {}}
            onModeChange={setMode}
            showEditButton={false}
            showPrimarySkuButton={false}
          />
        )}
      </CatalogActionMenu>
    </>
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
  const { language } = usePreferences();

  return (
    <WorkspacePage>
      <WorkspaceTitleCardWireframe
        actions={
          <WorkspaceActionRow>
            <Skeleton className="h-10 w-28 rounded-full" />
            <Skeleton className="h-10 w-32 rounded-full" />
          </WorkspaceActionRow>
        }
        descriptor={translateUiLiteral(language, 'Browse the catalog, search by name or description, and jump straight into the next edit.')}
        eyebrow={translateUiLiteral(language, 'Catalog')}
        title={translateUiLiteral(language, 'Offered Selections')}
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
          descriptor={translateUiLiteral(language, 'Stock-carrying items banji tracks directly.')}
        >
          <div className="grid gap-3">
            {CatalogLoadingRows({ count: 4 })}
          </div>
        </WorkspacePanel>

        <WorkspacePanel
          title={translateUiLiteral(language, 'Services')}
          descriptor={translateUiLiteral(language, 'Sellable services and the SKUs that support them.')}
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
  const location = useLocation();
  const { currency, language, t, usdToKhrExchangeRate } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const [serviceActionModels, setServiceActionModels] = useState<Record<string, ServiceDetailViewModel>>({});
  const [pendingArchive, setPendingArchive] = useState<{
    entityId: string;
    entityName: string;
    entityType: 'sku' | 'service';
  } | null>(null);
  const visibleCatalog = useMemo(() => activeSenaCatalog(catalog), [catalog]);

  const projectedSnapshot = useMemo(
    () => (visibleCatalog ? projectInventorySnapshotFromSena(visibleCatalog, observations) : null),
    [observations, visibleCatalog],
  );
  const activeSnapshot = snapshot ?? projectedSnapshot;

  const query = searchParams.get('q') ?? '';
  const supplierFilter = supplierFilterValueForQuery(searchParams.get('supplier'));
  const view = readCatalogView(searchParams);
  const filteredSkus = useMemo(
    () =>
      visibleCatalog?.skus.filter((sku) =>
        matchesCatalogRow(skuSearchParts(sku), query) && matchesSkuSupplier(sku, supplierFilter),
      ) ?? [],
    [query, supplierFilter, visibleCatalog],
  );
  const filteredServices = useMemo(
    () =>
      visibleCatalog?.services.filter((service) =>
        matchesCatalogRow([service.serviceId, service.name, service.description], query) &&
        matchesServiceSupplier(service, visibleCatalog, supplierFilter),
      ) ?? [],
    [query, supplierFilter, visibleCatalog],
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
          eyebrow={translateUiLiteral(language, 'Catalog')}
          title={translateUiLiteral(language, 'Set up the catalog')}
          descriptor={translateUiLiteral(language, 'Start with the first SKU. banji uses the catalog to connect stock, services, and planning.')}
          actions={
            <Button asChild>
              <Link state={buildBanjiNavigationState(location, '/catalog')} to="/catalog/skus/new">
                <ActionCreatePackageIcon data-icon="inline-start" />
                {translateUiLiteral(language, 'New SKU')}
              </Link>
            </Button>
          }
        />
        <WorkspaceEmpty
          title={translateUiLiteral(language, 'No catalog loaded yet')}
          hint={translateUiLiteral(language, 'Create the first SKU to initialize the local catalog.')}
          action={<CreateFirstSkuButton variant="outline" />}
        />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <WorkspaceTitleCard
        eyebrow={translateUiLiteral(language, 'Catalog')}
        title={translateUiLiteral(language, 'Offered Selections')}
        descriptor={translateUiLiteral(language, 'Browse the catalog, search by name or description, and jump straight into the next edit.')}
        actions={
          <WorkspaceActionRow>
            <Button asChild>
              <Link state={buildBanjiNavigationState(location, '/catalog')} to="/catalog/skus/new">
                <ActionCreatePackageIcon data-icon="inline-start" />
                {translateUiLiteral(language, 'New SKU')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link state={buildBanjiNavigationState(location, '/catalog')} to="/catalog/services/new">
                <NewServiceIcon className="size-4 shrink-0" />
                {translateUiLiteral(language, 'New service')}
              </Link>
            </Button>
          </WorkspaceActionRow>
        }
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-start lg:gap-4">
          <div className="w-full max-w-xl">
            <SearchInput
              ariaLabel={translateUiLiteral(language, 'Search catalog')}
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
              <EntityLayersIcon data-icon="inline-start" />
              {translateUiLiteral(language, 'All')}
            </ToggleGroupItem>
            <ToggleGroupItem value="skus">
              <EntitySkuIcon data-icon="inline-start" />
              {t('filterSku')}
            </ToggleGroupItem>
            <ToggleGroupItem value="services">
              <EntityServiceIcon data-icon="inline-start" />
              {t('filterService')}
            </ToggleGroupItem>
          </ToggleGroup>
          <SupplierFilter
            catalog={catalog}
            className={compactFilterControlClassName}
            value={supplierFilter}
            onChange={(nextSupplier) => {
              setSearchParams(
                updateCatalogSearchParams(searchParams, { supplier: supplierFilterQueryValue(nextSupplier) }),
              );
            }}
          />
        </div>
      </WorkspaceTitleCard>

      {!hasResults ? (
        <WorkspaceEmpty
          title={translateUiLiteral(language, 'No matching catalog items')}
          hint={translateUiLiteral(language, 'Try another search or create a new item that fits this view.')}
          action={
            <WorkspaceActionRow>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSearchParams(updateCatalogSearchParams(searchParams, { q: '', supplier: null, view: 'all' }))}
              >
                {translateUiLiteral(language, 'Clear filters')}
              </Button>
              <Button asChild>
                <Link state={buildBanjiNavigationState(location, '/catalog')} to="/catalog/skus/new">{translateUiLiteral(language, 'New SKU')}</Link>
              </Button>
            </WorkspaceActionRow>
          }
        />
      ) : null}

      <div className="grid min-w-0 gap-6">
      <ConfirmActionDialog
        open={pendingArchive != null}
        title={pendingArchive ? translateUiLiteral(language, 'Archive {name}?', { name: pendingArchive.entityName }) : ''}
        description={
          pendingArchive
            ? translateUiLiteral(
                language,
                'Archived items disappear from active work, but their history stays available in banji.',
              )
            : undefined
        }
        confirmLabel={translateUiLiteral(language, 'Archive')}
        isSubmitting={inventory.isSaving}
        onCancel={() => {
          if (!inventory.isSaving) {
            setPendingArchive(null);
          }
        }}
        onConfirm={() => {
          if (!pendingArchive) {
            return;
          }
          void inventory
            .archiveCatalogEntity({
              entityId: pendingArchive.entityId,
              entityType: pendingArchive.entityType,
            })
            .then(() => {
              setPendingArchive(null);
            });
        }}
      />

      {showSkus && filteredSkus.length > 0 ? (
            <WorkspacePanel
              title={`SKUs (${filteredSkus.length})`}
              descriptor={translateUiLiteral(language, 'Stock-carrying items banji tracks directly.')}
            >
              <div className="grid">
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
                    <div key={sku.skuId}>
                      <div
                        className={`group flex flex-col gap-2 px-5 py-4 transition-colors md:flex-row md:items-center md:justify-between sm:px-6 ${rowHoverClassName}`}
                      >
                        <ItemIdentityBlock
                          className="min-w-0"
                          description={sku.description || translateUiLiteral(language, 'No description')}
                          imagePath={sku.imagePath}
                          metadata={<SupplierBadge supplierName={sku.supplierName} />}
                          name={
                            <Link
                              className="font-medium text-foreground transition-colors group-hover:text-primary"
                              state={buildBanjiNavigationState(location, '/catalog')}
                              to={`/catalog/skus/${sku.skuId}`}
                            >
                              {sku.name}
                            </Link>
                          }
                          secondary={skuMetaLine(linkedServices.length, {
                            costPerUnit: sku.costPerUnit,
                            currency,
                            language,
                            productPrice: sku.productPrice,
                            soldAsProduct: sku.soldAsProduct,
                            usdToKhrExchangeRate,
                          })}
                          size="default"
                          type="sku"
                        />
                        <WorkspaceActionRow>
                          <Button asChild size="sm" variant="outline">
                            <Link state={buildBanjiNavigationState(location, '/catalog')} to={`/catalog/skus/${sku.skuId}`}>
                              <EntityPreviewIcon data-icon="inline-start" />
                              {translateUiLiteral(language, 'Detail')}
                            </Link>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link state={buildBanjiNavigationState(location, '/catalog')} to={`/catalog/skus/${sku.skuId}/edit`}>
                              <ActionEditPencilIcon data-icon="inline-start" />
                              {translateUiLiteral(language, 'Edit')}
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setPendingArchive({
                                entityId: sku.skuId,
                                entityName: sku.name,
                                entityType: 'sku',
                              });
                            }}
                          >
                            <StatusArchiveIcon data-icon="inline-start" />
                            {translateUiLiteral(language, 'Archive')}
                          </Button>
                          <CatalogSkuRowActions
                            actionContext={fallbackSkuActionContext}
                            label={translateUiLiteral(language, 'More actions for {name}', { name: sku.name })}
                            name={sku.name}
                            skuId={sku.skuId}
                          />
                        </WorkspaceActionRow>
                      </div>
                      <div className="border-b border-border/60" />
                    </div>
                  );
                })}
              </div>
            </WorkspacePanel>
          ) : null}

          {showServices && filteredServices.length > 0 ? (
            <WorkspacePanel
              title={`${translateUiLiteral(language, 'Services')} (${filteredServices.length})`}
              descriptor={translateUiLiteral(language, 'Sellable services and the SKUs that support them.')}
            >
              <div className="grid">
                {filteredServices.map((service) => {
                  const linkedSkus = linkedSkuIdsForService(catalog, service.serviceId);
                  const serviceModel = serviceActionModels[service.serviceId] ?? null;
                  const fallbackServiceActions = {
                    primarySkuHref: '/catalog',
                    editServiceHref: `/catalog/services/${service.serviceId}/edit`,
                    latestObservedAt: workspaceSummary?.latestObservedAt ?? observations.at(-1)?.input.observedAt ?? null,
                    noBottleneckHint: translateUiLiteral(language, 'No limiting contributor is active right now.'),
                    bottleneckSku: null,
                    servicePrice: {
                      serviceId: service.serviceId,
                      serviceName: service.name,
                      currentPrice: service.price,
                    },
                  } satisfies ServiceDetailViewModel['actions'];

                  return (
                    <div key={service.serviceId}>
                      <div
                        className={`group flex flex-col gap-2 px-5 py-4 transition-colors md:flex-row md:items-center md:justify-between sm:px-6 ${rowHoverClassName}`}
                      >
                        <ItemIdentityBlock
                          className="min-w-0"
                          description={
                            <>
                              <span className="mt-1 block text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground/75">
                                {service.serviceId}
                              </span>
                              <span>{service.description || translateUiLiteral(language, 'No description')}</span>
                            </>
                          }
                          imagePath={service.imagePath}
                          name={
                            <Link
                              className="font-medium text-foreground transition-colors group-hover:text-primary"
                              state={buildBanjiNavigationState(location, '/catalog')}
                              to={`/catalog/services/${service.serviceId}`}
                            >
                              {service.name}
                            </Link>
                          }
                          secondary={`${translateUiLiteral(language, '{count} linked SKUs', { count: linkedSkus.length })} · ${translateUiLiteral(language, 'price {value}', {
                            value: formatCurrency(service.price, currency, language, usdToKhrExchangeRate),
                          })}`}
                          size="default"
                          type="service"
                        />
                        <WorkspaceActionRow>
                          <Button asChild size="sm" variant="outline">
                            <Link state={buildBanjiNavigationState(location, '/catalog')} to={`/catalog/services/${service.serviceId}`}>
                              <EntityPreviewIcon data-icon="inline-start" />
                              {translateUiLiteral(language, 'Detail')}
                            </Link>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link state={buildBanjiNavigationState(location, '/catalog')} to={`/catalog/services/${service.serviceId}/edit`}>
                              <ActionEditPencilIcon data-icon="inline-start" />
                              {translateUiLiteral(language, 'Edit')}
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setPendingArchive({
                                entityId: service.serviceId,
                                entityName: service.name,
                                entityType: 'service',
                              });
                            }}
                          >
                            <StatusArchiveIcon data-icon="inline-start" />
                            {translateUiLiteral(language, 'Archive')}
                          </Button>
                          <CatalogServiceRowActions
                            actions={serviceModel?.actions ?? fallbackServiceActions}
                            label={translateUiLiteral(language, 'More actions for {name}', { name: service.name })}
                            name={service.name}
                          />
                        </WorkspaceActionRow>
                      </div>
                      <div className="border-b border-border/60" />
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
