import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ActionArchiveIcon,
  ActionCopyIcon,
  ActionCreatePackageIcon,
  ActionDeleteIcon,
  ActionEditPencilIcon,
  ActionSearchOffIcon,
} from '@icons/actions';
import type { IconComponent } from '@icons';
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
import { FilterControlRow } from '@/components/system/filter-control-row';
import { ResponsiveToggleFilter } from '@/components/system/responsive-toggle-filter';
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
import { matchesCatalogQuery, type CatalogView } from '@/lib/catalog';
import { formatCurrency } from '@/lib/format';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { buildCatalogSearchParams, readCatalogRouteState, readCatalogView } from '@/lib/navigation-state';
import { normalizeServiceDetailPage, normalizeSkuDetailPage } from '@/lib/sena-detail-pages';
import { formatSenaReorderQuantity } from '@/lib/sena-reorder-quantity';
import {
  activeSenaCatalog,
  catalogEntityActivityBlockers,
  duplicateSenaService,
  duplicateSenaSku,
  linkedServiceIdsForSku,
  linkedSkuIdsForService,
  matchesServiceSupplier,
  matchesSkuSupplier,
  skuSearchParts,
  type CatalogDeleteBlocker,
} from '@/lib/sena-catalog';
import { projectInventorySnapshotFromSena } from '@/lib/project-inventory-snapshot-from-sena';
import { translateUiLiteral } from '@/lib/translations';
import { ServiceMutationActions, SkuMutationActions } from '@/routes/catalog-item-actions';
import type { ServiceActionMode, SkuActionMode } from '@/routes/catalog-item-actions';
import { WorkspaceTitleCardWireframe } from '@/routes/loading-wireframes';
import { deriveSenaSkuDetailViewModel, type SenaSkuDetailViewModel } from '@/routes/sku-detail/view-model';
import { deriveServiceDetailViewModel, type ServiceDetailViewModel } from '@/routes/service-detail/view-model';
import { useInventory } from '@/state/inventory';
import { buildKaurKhorNavigationState } from '@/state/navigation-history';
import { usePreferences } from '@/state/preferences';
import { ArchiveRoute } from './archive';
import { AutomationsRoute } from './automations';
import type { SenaObservationRecord } from '@shared/sena';

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

function catalogEntityKey(entityType: 'sku' | 'service', entityId: string) {
  return `${entityType}:${entityId}`;
}

function deleteBlockerDescription(language: 'en' | 'km', blockers: CatalogDeleteBlocker[] | 'checking' | 'failed') {
  if (blockers === 'checking') {
    return translateUiLiteral(language, 'Kaur Khor is still checking whether this product has saved history. Try again in a moment.');
  }
  if (blockers === 'failed') {
    return translateUiLiteral(language, 'Kaur Khor could not check this product history yet. Try again after the page finishes loading.');
  }
  if (blockers.includes('linked-service')) {
    return translateUiLiteral(language, 'This SKU is linked to a service. Unlink it from services before deleting it.');
  }
  if (blockers.includes('last-sku')) {
    return translateUiLiteral(language, 'At least one SKU must remain in Products.');
  }
  return translateUiLiteral(language, 'This product has saved logs, observations, edits, or captures. Archive it instead so its history stays intact.');
}

function CatalogActionMenu({
  children,
  label = 'More actions',
  onOpenChange,
}: {
  children: (closeMenu: () => void) => ReactNode;
  label?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <AnchoredMenu
      label={label}
      onOpenChange={onOpenChange}
      triggerIcon={<EntityOverflowMenuIcon className="size-4" />}
    >
      {children}
    </AnchoredMenu>
  );
}

function CatalogSkuRowActions({
  actionContextFreshnessKey,
  fallbackActionContext,
  label,
  loadActionContext,
  name,
  skuId,
}: {
  actionContextFreshnessKey: string;
  fallbackActionContext: SenaSkuDetailViewModel['actionContext'];
  label: string;
  loadActionContext?: () => Promise<SenaSkuDetailViewModel['actionContext'] | null>;
  name: string;
  skuId: string;
}) {
  const [mode, setMode] = useState<SkuActionMode | null>(null);
  const [resolvedActionContext, setResolvedActionContext] = useState<SenaSkuDetailViewModel['actionContext'] | null>(null);
  const [isLoadingActionContext, setIsLoadingActionContext] = useState(false);
  const hasAttemptedActionContextLoadRef = useRef(false);
  const actionContextLoadGenerationRef = useRef(0);
  const actionContext = resolvedActionContext ?? fallbackActionContext;

  useEffect(() => {
    actionContextLoadGenerationRef.current += 1;
    hasAttemptedActionContextLoadRef.current = false;
    setResolvedActionContext(null);
    setIsLoadingActionContext(false);
  }, [actionContextFreshnessKey]);

  function handleOpenChange(open: boolean) {
    if (
      !open ||
      resolvedActionContext ||
      isLoadingActionContext ||
      hasAttemptedActionContextLoadRef.current ||
      !loadActionContext
    ) {
      return;
    }
    hasAttemptedActionContextLoadRef.current = true;
    setIsLoadingActionContext(true);
    const loadGeneration = actionContextLoadGenerationRef.current;
    void loadActionContext()
      .then((nextActionContext) => {
        if (nextActionContext && actionContextLoadGenerationRef.current === loadGeneration) {
          setResolvedActionContext(nextActionContext);
        }
      })
      .finally(() => {
        if (actionContextLoadGenerationRef.current === loadGeneration) {
          setIsLoadingActionContext(false);
        }
      });
  }

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
      <CatalogActionMenu label={label} onOpenChange={handleOpenChange}>
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
            recordActionLayout="direct"
            showEditButton={false}
            skuId={skuId}
          />
        )}
      </CatalogActionMenu>
    </>
  );
}

function CatalogServiceRowActions({
  fallbackActions,
  label,
  loadActions,
  name,
}: {
  fallbackActions: ServiceDetailViewModel['actions'];
  label: string;
  loadActions?: () => Promise<ServiceDetailViewModel['actions'] | null>;
  name: string;
}) {
  const [mode, setMode] = useState<ServiceActionMode | null>(null);
  const [resolvedActions, setResolvedActions] = useState<ServiceDetailViewModel['actions'] | null>(null);
  const [isLoadingActions, setIsLoadingActions] = useState(false);
  const actions = resolvedActions ?? fallbackActions;

  function handleOpenChange(open: boolean) {
    if (!open || resolvedActions || isLoadingActions || !loadActions) {
      return;
    }
    setIsLoadingActions(true);
    void loadActions()
      .then((nextActions) => {
        if (nextActions) {
          setResolvedActions(nextActions);
        }
      })
      .finally(() => {
        setIsLoadingActions(false);
      });
  }

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
      <CatalogActionMenu label={label} onOpenChange={handleOpenChange}>
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
            recordActionLayout="direct"
            showEditButton={false}
            showPrimarySkuButton={false}
            showStockCountAction={false}
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
        descriptor={translateUiLiteral(language, 'Browse products, search by name or description, and jump straight into the next edit.')}
        eyebrow={translateUiLiteral(language, 'Products')}
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
          descriptor={translateUiLiteral(language, 'Stock-carrying items Kaur Khor tracks directly.')}
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
  const { catalog, diagnostics, observations, orderBatches, reports, snapshot, workspaceSummary } = inventory;
  const { listSenaObservationPage, listSenaOrderBatches } = inventory;
  const location = useLocation();
  const { currency, language, showAutomationsPage, t, usdToKhrExchangeRate } = usePreferences();
  const [searchParams, setSearchParams] = useSearchParams();
  const catalogRouteState = readCatalogRouteState(searchParams);
  const [pendingArchive, setPendingArchive] = useState<{
    entityId: string;
    entityName: string;
    entityType: 'sku' | 'service';
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    entityId: string;
    entityName: string;
    entityType: 'sku' | 'service';
  } | null>(null);
  const [productActionNotice, setProductActionNotice] = useState<{
    reason: string;
    title: string;
  } | null>(null);
  const [deleteScan, setDeleteScan] = useState<{
    blockersByKey: Record<string, CatalogDeleteBlocker[]>;
    status: 'checking' | 'failed' | 'ready';
  }>({ blockersByKey: {}, status: 'checking' });

  const visibleCatalog = useMemo(() => activeSenaCatalog(catalog), [catalog]);

  const projectedSnapshot = useMemo(
    () => (visibleCatalog ? projectInventorySnapshotFromSena(visibleCatalog, observations) : null),
    [observations, visibleCatalog],
  );
  const activeSnapshot = snapshot ?? projectedSnapshot;

  const query = searchParams.get('q') ?? '';
  const supplierFilter = supplierFilterValueForQuery(searchParams.get('supplier'));
  const view = readCatalogView(searchParams);
  const catalogFilterOptions = [
    { icon: EntityLayersIcon, label: translateUiLiteral(language, 'All'), value: 'all' },
    { icon: EntitySkuIcon, label: t('filterSku'), value: 'skus' },
    { icon: EntityServiceIcon, label: t('filterService'), value: 'services' },
  ] satisfies Array<{ icon: IconComponent; label: string; value: CatalogView }>;
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
  const showSkus = view !== 'services';
  const showServices = view !== 'skus';
  const skuActionContextFreshnessKey = [
    workspaceSummary?.runId ?? 'no-run',
    workspaceSummary?.latestObservedAt ?? observations.at(-1)?.input.observedAt ?? 'no-observation',
    language,
  ].join('|');
  const hasResults =
    (showSkus && filteredSkus.length > 0) ||
    (showServices && filteredServices.length > 0);

  useEffect(() => {
    if (!catalog || catalogRouteState.status === 'archived' || catalogRouteState.section === 'automation') {
      return;
    }

    const activeCatalog = catalog;
    let cancelled = false;
    setDeleteScan({ blockersByKey: {}, status: 'checking' });

    async function scanDeleteEligibility() {
      const scannedObservations: SenaObservationRecord[] = [];
      let beforeObservedAt: string | null = null;
      let beforeObservationId: string | null = null;

      do {
        const page = await listSenaObservationPage({
          beforeObservedAt,
          beforeObservationId,
          limit: 250,
        });
        scannedObservations.push(...page.observations);
        beforeObservedAt = page.nextCursor?.observedAt ?? null;
        beforeObservationId = page.nextCursor?.observationId ?? null;
        if (!page.hasOlder) {
          break;
        }
      } while (beforeObservedAt && beforeObservationId);

      const scannedOrderBatches = await listSenaOrderBatches();
      const blockersByKey: Record<string, CatalogDeleteBlocker[]> = {};
      for (const sku of activeCatalog.skus) {
        blockersByKey[catalogEntityKey('sku', sku.skuId)] = catalogEntityActivityBlockers({
          catalog: activeCatalog,
          entityId: sku.skuId,
          entityType: 'sku',
          observations: scannedObservations,
          orderBatches: scannedOrderBatches,
        });
      }
      for (const service of activeCatalog.services) {
        blockersByKey[catalogEntityKey('service', service.serviceId)] = catalogEntityActivityBlockers({
          catalog: activeCatalog,
          entityId: service.serviceId,
          entityType: 'service',
          observations: scannedObservations,
          orderBatches: scannedOrderBatches,
        });
      }
      if (!cancelled) {
        setDeleteScan({ blockersByKey, status: 'ready' });
      }
    }

    void scanDeleteEligibility().catch(() => {
      if (!cancelled) {
        setDeleteScan({ blockersByKey: {}, status: 'failed' });
      }
    });

    return () => {
      cancelled = true;
    };
  }, [catalog, catalogRouteState.section, catalogRouteState.status, listSenaObservationPage, listSenaOrderBatches]);

  if (catalogRouteState.status === 'archived') {
    return <ArchiveRoute />;
  }
  if (catalogRouteState.section === 'automation' && showAutomationsPage) {
    return <AutomationsRoute forcedSection="catalog" />;
  }

  async function loadCatalogServiceActions(serviceId: string) {
    if (!activeSnapshot) {
      return null;
    }
    const snapshotService =
      activeSnapshot.services.find((entry) => entry.serviceId === serviceId) ?? null;
    if (!snapshotService) {
      return null;
    }
    const detailPage = normalizeServiceDetailPage(
      await inventory.loadSenaServiceDetail(serviceId).catch(() => null),
    );
    return deriveServiceDetailViewModel({
      currency,
      detail: detailPage?.detail ?? null,
      language,
      observations,
      reports,
      service: snapshotService,
      snapshot: activeSnapshot,
      workspaceSummary,
    }).actions;
  }

  async function loadCatalogSkuActionContext(skuId: string) {
    if (!activeSnapshot) {
      return null;
    }
    const snapshotSku = activeSnapshot.skus.find((entry) => entry.skuId === skuId) ?? null;
    if (!snapshotSku) {
      return null;
    }
    const detailPage = normalizeSkuDetailPage(
      await inventory.loadSenaSkuDetail(skuId).catch(() => null),
    );
    return deriveSenaSkuDetailViewModel({
      currency,
      detail: detailPage?.detail ?? null,
      diagnostics: diagnostics ?? null,
      language,
      linkedServiceDetails: [],
      observations,
      orderBatches: orderBatches ?? [],
      selectedIntervalIndex: null,
      skuId,
      snapshot: activeSnapshot,
      supplierName: catalog?.skus.find((entry) => entry.skuId === skuId)?.supplierName,
      uiState: 'ready',
      usdToKhrExchangeRate,
      workspaceSummary,
    }).actionContext;
  }

  async function handleDuplicateSku(skuId: string) {
    const sku = catalog?.skus.find((entry) => entry.skuId === skuId);
    if (!catalog || !sku) {
      return;
    }
    try {
      await inventory.upsertSenaCatalog(duplicateSenaSku(catalog, sku));
    } catch {
      setProductActionNotice({
        reason: translateUiLiteral(language, 'Kaur Khor could not duplicate this product. Try again.'),
        title: translateUiLiteral(language, 'Could not duplicate {name}', { name: sku.name }),
      });
    }
  }

  async function handleDuplicateService(serviceId: string) {
    const service = catalog?.services.find((entry) => entry.serviceId === serviceId);
    if (!catalog || !service) {
      return;
    }
    try {
      await inventory.upsertSenaCatalog(duplicateSenaService(catalog, service));
    } catch {
      setProductActionNotice({
        reason: translateUiLiteral(language, 'Kaur Khor could not duplicate this product. Try again.'),
        title: translateUiLiteral(language, 'Could not duplicate {name}', { name: service.name }),
      });
    }
  }

  function requestDeleteProduct(target: { entityId: string; entityName: string; entityType: 'sku' | 'service' }) {
    const key = catalogEntityKey(target.entityType, target.entityId);
    if (deleteScan.status !== 'ready') {
      setProductActionNotice({
        reason: deleteBlockerDescription(language, deleteScan.status),
        title: translateUiLiteral(language, 'Cannot delete {name}', { name: target.entityName }),
      });
      return;
    }

    const blockers = deleteScan.blockersByKey[key] ?? [];
    if (blockers.length > 0) {
      setProductActionNotice({
        reason: deleteBlockerDescription(language, blockers),
        title: translateUiLiteral(language, 'Cannot delete {name}', { name: target.entityName }),
      });
      return;
    }

    setPendingDelete(target);
  }

  function deleteButtonState(entityType: 'sku' | 'service', entityId: string) {
    if (deleteScan.status !== 'ready') {
      return {
        ariaDisabled: true,
        reason: deleteBlockerDescription(language, deleteScan.status),
      };
    }
    const blockers = deleteScan.blockersByKey[catalogEntityKey(entityType, entityId)] ?? [];
    return {
      ariaDisabled: blockers.length > 0,
      reason: blockers.length > 0 ? deleteBlockerDescription(language, blockers) : undefined,
    };
  }

  if (inventory.isLoading && !catalog) {
    return <CatalogLoadingState />;
  }

  if (!catalog) {
    return (
      <WorkspacePage>
        <WorkspaceTitleCard
          eyebrow={translateUiLiteral(language, 'Products')}
          helperExemptReason="Empty products title card is covered by the descriptor and first-SKU action."
          title={translateUiLiteral(language, 'Set up products')}
          descriptor={translateUiLiteral(language, 'Start with the first SKU. Kaur Khor uses products to connect stock, services, and planning.')}
          actions={
            <Button asChild>
              <Link state={buildKaurKhorNavigationState(location, '/catalog')} to="/catalog/skus/new">
                <ActionCreatePackageIcon data-icon="inline-start" />
                {translateUiLiteral(language, 'New SKU')}
              </Link>
            </Button>
          }
        />
        <WorkspaceEmpty
          title={translateUiLiteral(language, 'No products loaded yet')}
          hint={translateUiLiteral(language, 'Create the first SKU to initialize local products.')}
          action={<CreateFirstSkuButton variant="outline" />}
        />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <WorkspaceTitleCard
        eyebrow={translateUiLiteral(language, 'Products')}
        helperExemptReason="Products route title card is covered by the descriptor and catalog controls."
        title={translateUiLiteral(language, 'Offered Selections')}
        descriptor={translateUiLiteral(language, 'Browse products, search by name or description, and jump straight into the next edit.')}
        actions={
          <WorkspaceActionRow>
            <Button asChild>
              <Link state={buildKaurKhorNavigationState(location, '/catalog')} to="/catalog/skus/new">
                <ActionCreatePackageIcon data-icon="inline-start" />
                {translateUiLiteral(language, 'New SKU')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link state={buildKaurKhorNavigationState(location, '/catalog')} to="/catalog/services/new">
                <NewServiceIcon className="size-4 shrink-0" />
                {translateUiLiteral(language, 'New service')}
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link state={buildKaurKhorNavigationState(location, '/catalog')} to="/catalog?status=archived">
                <ActionArchiveIcon className="size-4 shrink-0" />
                {translateUiLiteral(language, 'Archive')}
              </Link>
            </Button>
          </WorkspaceActionRow>
        }
      >
        <FilterControlRow
          search={
            <SearchInput
              ariaLabel={translateUiLiteral(language, 'Search products')}
              className="h-12 min-w-0 rounded-full"
              placeholder={t('searchPlaceholder')}
              value={query}
              onChange={(event) => {
                setSearchParams(
                  updateCatalogSearchParams(searchParams, { q: event.target.value }),
                );
              }}
            />
          }
          primaryFilter={
            <ResponsiveToggleFilter
              ariaLabel={t('searchItems')}
              options={catalogFilterOptions}
              value={view}
              triggerClassName="max-w-[9rem]"
              onValueChange={(nextView) => {
                setSearchParams(
                  updateCatalogSearchParams(searchParams, { view: nextView }),
                );
              }}
            />
          }
          secondaryFilter={
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
          }
        />
      </WorkspaceTitleCard>

      {!hasResults ? (
        <WorkspaceEmpty
          title={translateUiLiteral(language, 'No matching products')}
          hint={translateUiLiteral(language, 'Try another search or create a new item that fits this view.')}
          action={
            <WorkspaceActionRow>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSearchParams(updateCatalogSearchParams(searchParams, { q: '', supplier: null, view: 'all' }))}
              >
                <ActionSearchOffIcon data-icon="inline-start" />
                {translateUiLiteral(language, 'Clear filters')}
              </Button>
              <Button asChild>
                <Link state={buildKaurKhorNavigationState(location, '/catalog')} to="/catalog/skus/new">
                  <ActionCreatePackageIcon data-icon="inline-start" />
                  {translateUiLiteral(language, 'New SKU')}
                </Link>
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
                'Archived items disappear from active work, but their history stays available in Kaur Khor.',
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

      <ConfirmActionDialog
        open={productActionNotice != null}
        title={productActionNotice?.title ?? ''}
        description={productActionNotice?.reason}
        confirmLabel={translateUiLiteral(language, 'Close')}
        confirmVariant="default"
        hideCancel
        icon={<ActionDeleteIcon className="size-4" />}
        iconTone="default"
        onCancel={() => setProductActionNotice(null)}
        onConfirm={() => setProductActionNotice(null)}
      />

      <ConfirmActionDialog
        open={pendingDelete != null}
        title={pendingDelete ? translateUiLiteral(language, 'Delete {name}?', { name: pendingDelete.entityName }) : ''}
        description={
          pendingDelete
            ? translateUiLiteral(
                language,
                'This permanently removes the product from Products because no saved history references it.',
              )
            : undefined
        }
        confirmIcon={<ActionDeleteIcon />}
        confirmLabel={translateUiLiteral(language, 'Delete')}
        isSubmitting={inventory.isSaving}
        onCancel={() => {
          if (!inventory.isSaving) {
            setPendingDelete(null);
          }
        }}
        onConfirm={() => {
          if (!pendingDelete) {
            return;
          }
          void inventory
            .deleteCatalogEntity({
              entityId: pendingDelete.entityId,
              entityType: pendingDelete.entityType,
            })
            .then(() => {
              setPendingDelete(null);
            });
        }}
      />

      {showSkus && filteredSkus.length > 0 ? (
            <WorkspacePanel
              title={translateUiLiteral(language, 'SKUs ({count})', { count: filteredSkus.length })}
              descriptor={translateUiLiteral(language, 'Stock-carrying items Kaur Khor tracks directly.')}
              helperExemptReason="Products list panel descriptor supplies the active section guidance."
            >
              <div className="grid">
                {filteredSkus.map((sku) => {
                  const linkedServices = linkedServiceIdsForSku(catalog, sku.skuId);
                  const deleteState = deleteButtonState('sku', sku.skuId);
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
                        className={`group flex flex-col gap-3 px-5 py-4 transition-colors xl:flex-row xl:items-center xl:justify-between sm:px-6 ${rowHoverClassName}`}
                      >
                        <ItemIdentityBlock
                          className="min-w-0"
                          description={sku.description || translateUiLiteral(language, 'No description')}
                          imagePath={sku.imagePath}
                          metadata={<SupplierBadge supplierName={sku.supplierName} />}
                          name={
                            <Link
                              className="font-medium text-foreground transition-colors group-hover:text-primary"
                              state={buildKaurKhorNavigationState(location, '/catalog')}
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
                        <WorkspaceActionRow wrap={false} className="pb-1 xl:justify-end">
                          <Button asChild size="sm" variant="outline">
                            <Link state={buildKaurKhorNavigationState(location, '/catalog')} to={`/catalog/skus/${sku.skuId}`}>
                              <EntityPreviewIcon data-icon="inline-start" />
                              {translateUiLiteral(language, 'Detail')}
                            </Link>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link state={buildKaurKhorNavigationState(location, '/catalog')} to={`/catalog/skus/${sku.skuId}/edit`}>
                              <ActionEditPencilIcon data-icon="inline-start" />
                              {translateUiLiteral(language, 'Edit')}
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            type="button"
                            variant="outline"
                            onClick={() => {
                              void handleDuplicateSku(sku.skuId);
                            }}
                          >
                            <ActionCopyIcon data-icon="inline-start" />
                            {translateUiLiteral(language, 'Duplicate')}
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
                          <Button
                            aria-disabled={deleteState.ariaDisabled || undefined}
                            className={deleteState.ariaDisabled ? 'opacity-50' : undefined}
                            size="sm"
                            title={deleteState.reason}
                            type="button"
                            variant="destructive-outline"
                            onClick={() => {
                              requestDeleteProduct({
                                entityId: sku.skuId,
                                entityName: sku.name,
                                entityType: 'sku',
                              });
                            }}
                          >
                            <ActionDeleteIcon data-icon="inline-start" />
                            {translateUiLiteral(language, 'Delete')}
                          </Button>
                          <CatalogSkuRowActions
                            actionContextFreshnessKey={skuActionContextFreshnessKey}
                            fallbackActionContext={fallbackSkuActionContext}
                            label={translateUiLiteral(language, 'More actions for {name}', { name: sku.name })}
                            loadActionContext={() => loadCatalogSkuActionContext(sku.skuId)}
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
              helperExemptReason="Products list panel descriptor supplies the active section guidance."
            >
              <div className="grid">
                {filteredServices.map((service) => {
                  const linkedSkus = linkedSkuIdsForService(catalog, service.serviceId);
                  const deleteState = deleteButtonState('service', service.serviceId);
                  const fallbackServiceActions = {
                    primarySkuHref: linkedSkus[0] ? `/catalog/skus/${linkedSkus[0]}` : '/catalog',
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
                              <span>{service.description || translateUiLiteral(language, 'No description')}</span>
                            </>
                          }
                          imagePath={service.imagePath}
                          name={
                            <Link
                              className="font-medium text-foreground transition-colors group-hover:text-primary"
                              state={buildKaurKhorNavigationState(location, '/catalog')}
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
                        <WorkspaceActionRow wrap={false} className="pb-1 xl:justify-end">
                          <Button asChild size="sm" variant="outline">
                            <Link state={buildKaurKhorNavigationState(location, '/catalog')} to={`/catalog/services/${service.serviceId}`}>
                              <EntityPreviewIcon data-icon="inline-start" />
                              {translateUiLiteral(language, 'Detail')}
                            </Link>
                          </Button>
                          <Button asChild size="sm" variant="outline">
                            <Link state={buildKaurKhorNavigationState(location, '/catalog')} to={`/catalog/services/${service.serviceId}/edit`}>
                              <ActionEditPencilIcon data-icon="inline-start" />
                              {translateUiLiteral(language, 'Edit')}
                            </Link>
                          </Button>
                          <Button
                            size="sm"
                            type="button"
                            variant="outline"
                            onClick={() => {
                              void handleDuplicateService(service.serviceId);
                            }}
                          >
                            <ActionCopyIcon data-icon="inline-start" />
                            {translateUiLiteral(language, 'Duplicate')}
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
                          <Button
                            aria-disabled={deleteState.ariaDisabled || undefined}
                            className={deleteState.ariaDisabled ? 'opacity-50' : undefined}
                            size="sm"
                            title={deleteState.reason}
                            type="button"
                            variant="destructive-outline"
                            onClick={() => {
                              requestDeleteProduct({
                                entityId: service.serviceId,
                                entityName: service.name,
                                entityType: 'service',
                              });
                            }}
                          >
                            <ActionDeleteIcon data-icon="inline-start" />
                            {translateUiLiteral(language, 'Delete')}
                          </Button>
                          <CatalogServiceRowActions
                            fallbackActions={fallbackServiceActions}
                            label={translateUiLiteral(language, 'More actions for {name}', { name: service.name })}
                            loadActions={() => loadCatalogServiceActions(service.serviceId)}
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
