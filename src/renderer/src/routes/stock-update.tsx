import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardPlus, Layers3, Package, RefreshCcw, Store } from 'lucide-react';
import type { SenaCatalog, SenaObservationRecord } from '@shared/sena';
import { SearchInput } from '@/components/system/search-input';
import { WorkspaceActionRow, WorkspacePage, WorkspacePanel, WorkspaceTitleCard } from '@/components/system/workspace';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';
import { PagedPanelNavigation } from './detail-panels';

type ObservationScope = 'all' | 'skus' | 'services';
const REPORTS_PAGE_SIZE = 5;

function hasSkuObservation(observation: SenaObservationRecord) {
  return (
    observation.input.stockSnapshot.length > 0 ||
    observation.input.orderSignals.length > 0 ||
    observation.input.retailRankings.length > 0 ||
    observation.input.retailStockouts.length > 0 ||
    observation.input.retailPrices.length > 0 ||
    observation.input.leadTimeHints.length > 0
  );
}

function hasServiceObservation(observation: SenaObservationRecord) {
  return (
    observation.input.serviceRankings.length > 0 ||
    observation.input.serviceStockouts.length > 0 ||
    observation.input.servicePrices.length > 0
  );
}

function linkedServiceSkuIds(catalog: SenaCatalog | null) {
  return new Set(
    (catalog?.sharingMask ?? [])
      .filter((entry) => entry.enabled)
      .map((entry) => entry.skuId),
  );
}

function observationSearchText(observation: SenaObservationRecord, catalog: SenaCatalog | null) {
  const skuNameById = new Map((catalog?.skus ?? []).map((sku) => [sku.skuId, sku.name]));
  const serviceNameById = new Map((catalog?.services ?? []).map((service) => [service.serviceId, service.name]));
  const linkedServiceNamesBySkuId = new Map<string, string[]>();

  for (const entry of catalog?.sharingMask ?? []) {
    if (!entry.enabled) {
      continue;
    }
    const names = linkedServiceNamesBySkuId.get(entry.skuId) ?? [];
    const serviceName = serviceNameById.get(entry.serviceId);
    if (serviceName) {
      names.push(serviceName);
      linkedServiceNamesBySkuId.set(entry.skuId, names);
    }
  }

  const skuTokens = [
    ...observation.input.stockSnapshot.flatMap((entry) => [entry.skuId, skuNameById.get(entry.skuId) ?? '']),
    ...observation.input.orderSignals.flatMap((entry) => [entry.skuId, skuNameById.get(entry.skuId) ?? '']),
    ...observation.input.retailPrices.flatMap((entry) => [entry.skuId, skuNameById.get(entry.skuId) ?? '']),
    ...observation.input.leadTimeHints.flatMap((entry) => [entry.skuId, skuNameById.get(entry.skuId) ?? '']),
    ...observation.input.stockSnapshot.flatMap((entry) => linkedServiceNamesBySkuId.get(entry.skuId) ?? []),
    ...observation.input.orderSignals.flatMap((entry) => linkedServiceNamesBySkuId.get(entry.skuId) ?? []),
    ...observation.input.retailPrices.flatMap((entry) => linkedServiceNamesBySkuId.get(entry.skuId) ?? []),
    ...observation.input.leadTimeHints.flatMap((entry) => linkedServiceNamesBySkuId.get(entry.skuId) ?? []),
  ];
  const serviceTokens = [
    ...observation.input.servicePrices.flatMap((entry) => [entry.serviceId, serviceNameById.get(entry.serviceId) ?? '']),
    ...observation.input.serviceRankings,
    ...observation.input.serviceStockouts,
  ];

  return [
    observation.input.observedAt,
    observation.input.notes ?? '',
    ...skuTokens,
    ...serviceTokens,
    ...observation.input.retailRankings,
    ...observation.input.retailStockouts,
  ]
    .join(' ')
    .toLowerCase();
}

function hasServiceLinkedSkuObservation(
  observation: SenaObservationRecord,
  serviceLinkedSkuIds: Set<string>,
) {
  return (
    observation.input.stockSnapshot.some((entry) => serviceLinkedSkuIds.has(entry.skuId)) ||
    observation.input.orderSignals.some((entry) => serviceLinkedSkuIds.has(entry.skuId)) ||
    observation.input.retailPrices.some((entry) => serviceLinkedSkuIds.has(entry.skuId)) ||
    observation.input.leadTimeHints.some((entry) => serviceLinkedSkuIds.has(entry.skuId))
  );
}

function matchesObservationScope(
  observation: SenaObservationRecord,
  scope: ObservationScope,
  serviceLinkedSkuIds: Set<string>,
) {
  if (scope === 'all') {
    return true;
  }

  if (scope === 'skus') {
    return hasSkuObservation(observation);
  }

  return hasServiceObservation(observation) || hasServiceLinkedSkuObservation(observation, serviceLinkedSkuIds);
}

function matchesObservationQuery(
  observation: SenaObservationRecord,
  query: string,
  catalog: SenaCatalog | null,
) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }
  return observationSearchText(observation, catalog).includes(normalized);
}

export function StockUpdateRoute() {
  const {
    catalog,
    isSaving,
    latestRun,
    observations,
    retrySenaRun,
    triggerSenaRun,
    workspaceSummary,
  } = useInventory();
  const { t } = usePreferences();
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [scope, setScope] = useState<ObservationScope>('all');
  const [pageIndex, setPageIndex] = useState(0);

  const serviceLinkedSkuIdSet = useMemo(() => linkedServiceSkuIds(catalog), [catalog]);
  const visibleObservations = useMemo(
    () =>
      observations
        .filter(
          (observation) =>
            matchesObservationScope(observation, scope, serviceLinkedSkuIdSet) &&
            matchesObservationQuery(observation, deferredQuery, catalog),
        )
        .sort(
          (left, right) =>
            new Date(right.input.observedAt).getTime() - new Date(left.input.observedAt).getTime(),
        ),
    [catalog, deferredQuery, observations, scope, serviceLinkedSkuIdSet],
  );
  const observationsTitle =
    scope === 'all'
      ? `Captured observations (${visibleObservations.length})`
      : `Captured observations for ${scope === 'skus' ? 'SKUs' : 'Services'} (${visibleObservations.length})`;
  const shouldPaginate = visibleObservations.length > REPORTS_PAGE_SIZE;
  const pageCount = shouldPaginate ? Math.ceil(visibleObservations.length / REPORTS_PAGE_SIZE) : 1;
  const pagedObservations = useMemo(() => {
    if (!shouldPaginate) {
      return visibleObservations;
    }
    const start = pageIndex * REPORTS_PAGE_SIZE;
    return visibleObservations.slice(start, start + REPORTS_PAGE_SIZE);
  }, [pageIndex, shouldPaginate, visibleObservations]);

  useEffect(() => {
    setPageIndex(0);
  }, [deferredQuery, scope]);

  useEffect(() => {
    setPageIndex((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  async function handleRun() {
    if (workspaceSummary?.runId) {
      await retrySenaRun({ runId: workspaceSummary.runId });
      return;
    }
    await triggerSenaRun({ algorithmVersion: 'sena-analysis-v1' });
  }

  return (
    <WorkspacePage>
      <WorkspaceTitleCard
        eyebrow="Operations"
        title="Interval evidence"
        description="Operations now records SENA observation packages instead of stock snapshot mutations."
        actions={
          <WorkspaceActionRow>
            <Button asChild>
              <Link to="/operations/session">
                <ClipboardPlus aria-hidden="true" className="size-4" />
                New observation
              </Link>
            </Button>
            <Button disabled={isSaving} type="button" variant="outline" onClick={() => void handleRun()}>
              <RefreshCcw aria-hidden="true" className="size-4" />
              {latestRun ? 'Re-run analysis' : 'Run analysis'}
            </Button>
          </WorkspaceActionRow>
        }
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-start lg:gap-4">
          <div className="w-full max-w-xl">
            <SearchInput
              ariaLabel="Search observations"
              placeholder={t('searchPlaceholder')}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
          <ToggleGroup
            aria-label={t('searchItems')}
            className="inline-flex max-w-full justify-start overflow-x-auto rounded-2xl"
            spacing={1}
            type="single"
            value={scope}
            onValueChange={(nextValue) => {
              if (nextValue) {
                setScope(nextValue as ObservationScope);
              }
            }}
          >
            <ToggleGroupItem value="all">
              <Layers3 data-icon="inline-start" />
              {t('operationsFilterEverything')}
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
      <WorkspacePanel
        title={observationsTitle}
        description="Review the observation packages currently available to the local SENA run."
        footer={
          shouldPaginate ? (
            <PagedPanelNavigation
              className="border-t-0 pt-0"
              pageCount={pageCount}
              pageIndex={pageIndex}
              setPageIndex={setPageIndex}
            />
          ) : null
        }
      >
        {visibleObservations.length > 0 ? (
          <div className="grid gap-3">
            {pagedObservations.map((observation) => (
              <div
                key={observation.observationId}
                className="rounded-[1.25rem] border border-border/70 bg-background/70 p-4"
              >
                <p className="font-medium text-foreground">{observation.input.observedAt}</p>
                <p className="text-sm text-muted-foreground">
                  {observation.input.stockSnapshot.length} stock rows · {observation.input.orderSignals.length} order signals
                </p>
                {observation.input.notes ? (
                  <p className="mt-2 text-sm text-muted-foreground">{observation.input.notes}</p>
                ) : null}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            No observations have been captured yet. Add the first observation to begin local SENA inference.
          </p>
        )}
      </WorkspacePanel>
    </WorkspacePage>
  );
}
