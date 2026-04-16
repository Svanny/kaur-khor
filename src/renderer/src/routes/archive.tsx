import { Link, useSearchParams } from 'react-router-dom';
import { EntityServiceIcon, EntitySkuIcon } from '@icons/entities';
import { ActionArchiveRestoreIcon, ActionResetIcon } from '@icons/actions';
import { ConfirmActionDialog } from '@/components/system/confirm-action-dialog';
import { CreateFirstSkuButton } from '@/components/system/create-first-sku-button';
import { SearchInput } from '@/components/system/search-input';
import { SupplierBadge, SupplierFilter, supplierFilterQueryValue, supplierFilterValueForQuery } from '@/components/system/supplier';
import {
  WorkspaceActionRow,
  WorkspaceEmpty,
  WorkspacePage,
  WorkspacePanel,
  WorkspaceTitleCard,
} from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { matchesCatalogQuery } from '@/lib/catalog';
import {
  buildArchiveSearchParams,
  readArchiveRouteState,
  type ArchiveViewValue,
} from '@/lib/navigation-state';
import {
  archivedSenaServices,
  archivedSenaSkus,
  matchesServiceSupplier,
  matchesSkuSupplier,
  skuSearchParts,
} from '@/lib/sena-catalog';
import { translateUiLiteral } from '@/lib/translations';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

import { useState } from 'react';

function updateArchiveSearchParams(
  current: URLSearchParams,
  updates: {
    q?: string | null;
    supplier?: string | null;
    view?: ArchiveViewValue;
  },
) {
  return buildArchiveSearchParams(current, updates);
}

export function ArchiveRoute() {
  const inventory = useInventory();
  const { language, t } = usePreferences();
  const [pendingUnarchive, setPendingUnarchive] = useState<{
    entityId: string;
    entityName: string;
    entityType: 'sku' | 'service';
  } | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const routeState = readArchiveRouteState(searchParams);
  const query = routeState.q ?? '';
  const supplierFilter = supplierFilterValueForQuery(routeState.supplier);
  const view = routeState.view;
  const archivedSkus = archivedSenaSkus(inventory.catalog).filter((sku) =>
    matchesCatalogQuery(skuSearchParts(sku).filter(Boolean).join(' '), query) && matchesSkuSupplier(sku, supplierFilter),
  );
  const archivedServices = archivedSenaServices(inventory.catalog).filter((service) =>
    matchesCatalogQuery([service.serviceId, service.name, service.description].join(' '), query) &&
    matchesServiceSupplier(service, inventory.catalog, supplierFilter),
  );
  const showSkus = view !== 'services';
  const showServices = view !== 'skus';
  const hasResults =
    (showSkus && archivedSkus.length > 0) ||
    (showServices && archivedServices.length > 0);

  if (inventory.isLoading && !inventory.catalog) {
    return <WorkspacePage />;
  }

  if (!inventory.catalog) {
    return (
      <WorkspacePage>
        <WorkspaceEmpty
          title={translateUiLiteral(language, 'No catalog loaded yet')}
          hint={translateUiLiteral(language, 'Create the first SKU to initialize the local catalog.')}
          action={<CreateFirstSkuButton />}
        />
      </WorkspacePage>
    );
  }

  return (
    <WorkspacePage>
      <ConfirmActionDialog
        open={pendingUnarchive != null}
        title={pendingUnarchive ? translateUiLiteral(language, 'Unarchive {name}?', { name: pendingUnarchive.entityName }) : ''}
        description={
          pendingUnarchive
            ? translateUiLiteral(
                language,
                'This item will return to active workspaces and become visible across Banji again.',
              )
            : undefined
        }
        confirmLabel={translateUiLiteral(language, 'Unarchive')}
        confirmVariant="default"
        isSubmitting={inventory.isSaving}
        onCancel={() => {
          if (!inventory.isSaving) {
            setPendingUnarchive(null);
          }
        }}
        onConfirm={() => {
          if (!pendingUnarchive) {
            return;
          }
          void inventory
            .unarchiveCatalogEntity({
              entityId: pendingUnarchive.entityId,
              entityType: pendingUnarchive.entityType,
            })
            .then(() => {
              setPendingUnarchive(null);
            });
        }}
      />
      <WorkspaceTitleCard
        eyebrow={translateUiLiteral(language, 'Logs')}
        title={translateUiLiteral(language, 'Archive')}
        descriptor={translateUiLiteral(language, 'Review archived catalog items and restore anything that should return to active workspaces.')}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-start lg:gap-4">
          <div className="w-full max-w-xl">
            <SearchInput
              ariaLabel={translateUiLiteral(language, 'Search archive')}
              placeholder={t('searchPlaceholder')}
              value={query}
              onChange={(event) => {
                setSearchParams(
                  updateArchiveSearchParams(searchParams, { q: event.target.value }),
                );
              }}
            />
          </div>
          <ToggleGroup
            aria-label={translateUiLiteral(language, 'Filter archive items')}
            className="inline-flex max-w-full justify-start overflow-x-auto rounded-2xl"
            spacing={1}
            type="single"
            value={view}
            onValueChange={(nextView) => {
              if (!nextView) {
                return;
              }
              setSearchParams(
                updateArchiveSearchParams(searchParams, { view: nextView as ArchiveViewValue }),
              );
            }}
          >
            <ToggleGroupItem value="all">
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
            catalog={inventory.catalog}
            className="h-12 w-full rounded-full px-4 data-[size=default]:h-12 sm:w-auto"
            value={supplierFilter}
            onChange={(nextSupplier) => {
              setSearchParams(
                updateArchiveSearchParams(searchParams, { supplier: supplierFilterQueryValue(nextSupplier) }),
              );
            }}
          />
        </div>
      </WorkspaceTitleCard>

      {!hasResults ? (
        <WorkspaceEmpty
          title={translateUiLiteral(language, 'No archived items match this view')}
          hint={translateUiLiteral(language, 'Try a broader search or switch filters to inspect the archive ledger.')}
          action={
            <WorkspaceActionRow>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSearchParams(updateArchiveSearchParams(searchParams, { q: '', supplier: null, view: 'all' }))}
              >
                <ActionResetIcon data-icon="inline-start" />
                {translateUiLiteral(language, 'Clear filters')}
              </Button>
            </WorkspaceActionRow>
          }
        />
      ) : null}

      <div className="grid gap-6">
        {showSkus && archivedSkus.length > 0 ? (
          <WorkspacePanel
            title={`SKUs (${archivedSkus.length})`}
            descriptor={translateUiLiteral(
              language,
              'Archived stock-carrying items stay in Banji history but stay hidden from active workspaces.',
            )}
          >
            <div className="grid gap-3">
              {archivedSkus.map((sku) => (
                <div
                  key={sku.skuId}
                  className="flex flex-col gap-3 rounded-[1.25rem] border border-border/70 bg-background/70 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{sku.name}</p>
                    <p className="text-sm text-muted-foreground">{sku.description || translateUiLiteral(language, 'No description')}</p>
                    <SupplierBadge className="mt-2" supplierName={sku.supplierName} />
                  </div>
                  <Button
                    disabled={inventory.isSaving}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPendingUnarchive({
                        entityId: sku.skuId,
                        entityName: sku.name,
                        entityType: 'sku',
                      });
                    }}
                  >
                    <ActionArchiveRestoreIcon data-icon="inline-start" />
                    {translateUiLiteral(language, 'Unarchive')}
                  </Button>
                </div>
              ))}
            </div>
          </WorkspacePanel>
        ) : null}

        {showServices && archivedServices.length > 0 ? (
          <WorkspacePanel
            title={`${translateUiLiteral(language, 'Services')} (${archivedServices.length})`}
            descriptor={translateUiLiteral(language, 'Archived services hidden from active planning and catalog workspaces.')}
          >
            <div className="grid gap-3">
              {archivedServices.map((service) => (
                <div
                  key={service.serviceId}
                  className="flex flex-col gap-3 rounded-[1.25rem] border border-border/70 bg-background/70 p-4 md:flex-row md:items-center md:justify-between"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-foreground">{service.name}</p>
                    <p className="mt-1 text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground/75">{service.serviceId}</p>
                    <p className="text-sm text-muted-foreground">{service.description || translateUiLiteral(language, 'No description')}</p>
                  </div>
                  <Button
                    disabled={inventory.isSaving}
                    size="sm"
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setPendingUnarchive({
                        entityId: service.serviceId,
                        entityName: service.name,
                        entityType: 'service',
                      });
                    }}
                  >
                    <ActionArchiveRestoreIcon data-icon="inline-start" />
                    {translateUiLiteral(language, 'Unarchive')}
                  </Button>
                </div>
              ))}
            </div>
          </WorkspacePanel>
        ) : null}
      </div>
    </WorkspacePage>
  );
}
