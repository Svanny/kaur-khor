import type { SenaCatalog, SenaObservationInput, SenaObservationRecord, SenaOrderBatchRecord, SenaService, SenaServiceSkuMaskEntry, SenaSku } from '@shared/sena';
import { createOpaqueInventoryId } from '../formatting/ids';
import type { ProductAttributeCombination } from './product-attributes';
import { uniqueProductVariantName } from './product-attributes';
import { validateEntryId } from '../ui/validation';

export type SenaCatalogEntityType = 'sku' | 'service';
export type CatalogDeleteBlocker = 'activity' | 'linked-service' | 'last-sku';

export function normalizeSenaSku(sku: SenaSku): SenaSku {
  return {
    ...sku,
    imagePath: normalizeImagePath(sku.imagePath),
    supplierName: normalizeSupplierName(sku.supplierName),
    archived: normalizeArchivedFlag(sku.archived),
  };
}

function normalizeOptionalString(value: string | null | undefined) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeImagePath(value: string | null | undefined) {
  const normalized = normalizeOptionalString(value);
  return normalized.length > 0 ? normalized : null;
}

export function normalizeSupplierName(value: string | null | undefined) {
  const normalized = normalizeOptionalString(value);
  return normalized.length > 0 ? normalized : null;
}

export function supplierNameForSku(sku: SenaSku | null | undefined) {
  return normalizeSupplierName(sku?.supplierName);
}

export function matchesSupplierName(supplierName: string | null | undefined, supplierFilter: SupplierFilterValue | null | undefined) {
  if (!supplierFilter || supplierFilter === 'all') {
    return true;
  }
  const normalizedSupplierName = normalizeSupplierName(supplierName);
  if (supplierFilter === 'none') {
    return normalizedSupplierName == null;
  }
  return normalizedSupplierName === supplierFilter;
}

export function supplierNamesFromCatalog(catalog: SenaCatalog | null | undefined) {
  return Array.from(
    new Set(
      (catalog?.skus ?? [])
        .map((sku) => supplierNameForSku(sku))
        .filter((supplierName): supplierName is string => Boolean(supplierName)),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export type SupplierFilterValue = 'all' | 'none' | string;

export function matchesSkuSupplier(sku: SenaSku, supplierFilter: SupplierFilterValue | null | undefined) {
  return matchesSupplierName(supplierNameForSku(sku), supplierFilter);
}

export function linkedSkusForService(catalog: SenaCatalog | null | undefined, serviceId: string) {
  if (!catalog) {
    return [];
  }

  const skuById = new Map(catalog.skus.map((sku) => [sku.skuId, sku] as const));
  const seenSkuIds = new Set<string>();
  const linkedSkus: SenaSku[] = [];
  for (const entry of catalog.sharingMask) {
    if (!entry.enabled || entry.serviceId !== serviceId || seenSkuIds.has(entry.skuId)) {
      continue;
    }
    const sku = skuById.get(entry.skuId);
    if (sku) {
      seenSkuIds.add(entry.skuId);
      linkedSkus.push(sku);
    }
  }
  return linkedSkus;
}

export function supplierNamesForService(catalog: SenaCatalog | null | undefined, serviceId: string) {
  return Array.from(
    new Set(
      linkedSkusForService(catalog, serviceId)
        .map((sku) => supplierNameForSku(sku))
        .filter((supplierName): supplierName is string => Boolean(supplierName)),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export function matchesServiceSupplier(
  service: SenaService,
  catalog: SenaCatalog | null | undefined,
  supplierFilter: SupplierFilterValue | null | undefined,
) {
  if (!supplierFilter || supplierFilter === 'all') {
    return true;
  }

  const linkedSkus = linkedSkusForService(catalog, service.serviceId);
  if (supplierFilter === 'none') {
    return linkedSkus.every((sku) => supplierNameForSku(sku) == null);
  }

  return linkedSkus.some((sku) => matchesSkuSupplier(sku, supplierFilter));
}

export function filterCatalogBySupplier(
  catalog: SenaCatalog | null | undefined,
  supplierFilter: SupplierFilterValue | null | undefined,
) {
  if (!catalog || !supplierFilter || supplierFilter === 'all') {
    return catalog ?? null;
  }

  const skus = catalog.skus.filter((sku) => matchesSkuSupplier(sku, supplierFilter));
  const services = catalog.services.filter((service) => matchesServiceSupplier(service, catalog, supplierFilter));
  const skuIds = new Set(skus.map((sku) => sku.skuId));
  const serviceIds = new Set(services.map((service) => service.serviceId));

  return {
    ...catalog,
    skus,
    services,
    bundles: catalog.bundles.filter((bundle) => serviceIds.has(bundle.serviceId)),
    sharingMask: catalog.sharingMask.filter((entry) => serviceIds.has(entry.serviceId) && skuIds.has(entry.skuId)),
  };
}

export function skuSearchParts(sku: SenaSku) {
  return [sku.skuId, sku.name, sku.description, supplierNameForSku(sku)];
}

export function groupSkusBySupplier<T extends { skuId: string }>(
  rows: T[],
  skuById: Map<string, SenaSku>,
) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const supplierName = supplierNameForSku(skuById.get(row.skuId)) ?? '';
    const groupRows = groups.get(supplierName) ?? [];
    groupRows.push(row);
    groups.set(supplierName, groupRows);
  }
  return Array.from(groups.entries()).sort(([left], [right]) => {
    if (!left && right) return 1;
    if (left && !right) return -1;
    return left.localeCompare(right);
  });
}

export function normalizeSenaService(service: SenaService): SenaService {
  return {
    ...service,
    imagePath: normalizeImagePath(service.imagePath),
    archived: normalizeArchivedFlag(service.archived),
  };
}

function normalizeArchivedFlag(value: boolean | null | undefined) {
  return typeof value === 'boolean' ? value : false;
}

export function normalizeSenaCatalog(catalog: SenaCatalog | null): SenaCatalog | null {
  if (!catalog) {
    return null;
  }

  return {
    ...catalog,
    skus: catalog.skus.map(normalizeSenaSku),
    services: catalog.services.map(normalizeSenaService),
  };
}

export function emptySenaCatalog(): SenaCatalog {
  return {
    schemaVersion: 1,
    skus: [],
    services: [],
    bundles: [],
    sharingMask: [],
  };
}

export function isSenaSkuArchived(sku: SenaSku | null | undefined) {
  return Boolean(sku?.archived);
}

export function isSenaServiceArchived(service: SenaService | null | undefined) {
  return Boolean(service?.archived);
}

export function activeSenaSkus(catalog: SenaCatalog | null | undefined) {
  return (catalog?.skus ?? []).filter((sku) => !isSenaSkuArchived(sku));
}

export function archivedSenaSkus(catalog: SenaCatalog | null | undefined) {
  return (catalog?.skus ?? []).filter((sku) => isSenaSkuArchived(sku));
}

export function activeSenaServices(catalog: SenaCatalog | null | undefined) {
  return (catalog?.services ?? []).filter((service) => !isSenaServiceArchived(service));
}

export function archivedSenaServices(catalog: SenaCatalog | null | undefined) {
  return (catalog?.services ?? []).filter((service) => isSenaServiceArchived(service));
}

export function hasActiveSenaSku(catalog: SenaCatalog | null | undefined, skuId: string) {
  return activeSenaSkus(catalog).some((sku) => sku.skuId === skuId);
}

export function hasActiveSenaService(catalog: SenaCatalog | null | undefined, serviceId: string) {
  return activeSenaServices(catalog).some((service) => service.serviceId === serviceId);
}

export function createUniqueSkuId(
  catalog: SenaCatalog | null | undefined,
  createId: (prefix: 'sku') => string = createOpaqueInventoryId,
) {
  let nextId = createId('sku');

  while (hasCatalogEntityIdConflict(catalog, 'sku', nextId)) {
    nextId = createId('sku');
  }

  return nextId;
}

export function createUniqueServiceId(
  catalog: SenaCatalog | null | undefined,
  createId: (prefix: 'service') => string = createOpaqueInventoryId,
) {
  let nextId = createId('service');

  while (hasCatalogEntityIdConflict(catalog, 'service', nextId)) {
    nextId = createId('service');
  }

  return nextId;
}

export function hasCatalogEntityIdConflict(
  catalog: SenaCatalog | null | undefined,
  entityType: SenaCatalogEntityType,
  candidateId: string,
  currentId?: string | null,
) {
  const normalizedCandidateId = candidateId.trim();
  const normalizedCurrentId = currentId?.trim() ?? null;

  if (!normalizedCandidateId) {
    return false;
  }

  if (entityType === 'sku') {
    return (
      (catalog?.skus ?? []).some(
        (sku) => sku.skuId === normalizedCandidateId && sku.skuId !== normalizedCurrentId,
      ) || (catalog?.services ?? []).some((service) => service.serviceId === normalizedCandidateId)
    );
  }

  return (
    (catalog?.services ?? []).some(
      (service) => service.serviceId === normalizedCandidateId && service.serviceId !== normalizedCurrentId,
    ) || (catalog?.skus ?? []).some((sku) => sku.skuId === normalizedCandidateId)
  );
}

export function validateCatalogEntityId(
  catalog: SenaCatalog | null | undefined,
  entityType: SenaCatalogEntityType,
  candidateId: string,
  currentId?: string | null,
): 'required' | 'invalid' | 'duplicate' | null {
  const formatError = validateEntryId(candidateId);
  if (formatError) {
    return formatError;
  }
  if (hasCatalogEntityIdConflict(catalog, entityType, candidateId, currentId)) {
    return 'duplicate';
  }
  return null;
}

export function activeSenaCatalog(catalog: SenaCatalog | null | undefined): SenaCatalog | null {
  if (!catalog) {
    return null;
  }

  const activeSkus = activeSenaSkus(catalog);
  const activeServices = activeSenaServices(catalog);
  const activeSkuIds = new Set(activeSkus.map((sku) => sku.skuId));
  const activeServiceIds = new Set(activeServices.map((service) => service.serviceId));

  return {
    ...catalog,
    skus: activeSkus,
    services: activeServices,
    bundles: catalog.bundles.filter((bundle) => activeServiceIds.has(bundle.serviceId)),
    sharingMask: catalog.sharingMask.filter(
      (entry) => activeSkuIds.has(entry.skuId) && activeServiceIds.has(entry.serviceId),
    ),
  };
}

export function upsertSenaSku(catalog: SenaCatalog, sku: SenaSku, previousSkuId = sku.skuId): SenaCatalog {
  const existingSku =
    catalog.skus.find((entry) => entry.skuId === previousSkuId) ??
    catalog.skus.find((entry) => entry.skuId === sku.skuId);
  const nextSku = normalizeSenaSku({
    ...sku,
    archived: existingSku?.archived ?? sku.archived ?? false,
  });
  const skus = catalog.skus.some((entry) => entry.skuId === previousSkuId)
    ? catalog.skus.map((entry) => (entry.skuId === previousSkuId ? nextSku : entry))
    : [...catalog.skus, nextSku];

  return {
    ...catalog,
    skus,
    sharingMask: catalog.sharingMask.map((entry) =>
      entry.skuId === previousSkuId ? { ...entry, skuId: nextSku.skuId } : entry,
    ),
  };
}

export function removeSenaSku(catalog: SenaCatalog, skuId: string): SenaCatalog {
  return {
    ...catalog,
    skus: catalog.skus.filter((sku) => sku.skuId !== skuId),
    sharingMask: catalog.sharingMask.filter((entry) => entry.skuId !== skuId),
  };
}

export function nextCatalogCopyName(existingNames: string[], sourceName: string) {
  const baseName = sourceName.trim() || 'Untitled';
  const normalizedNames = new Set(existingNames.map((name) => name.trim().toLocaleLowerCase()));
  const firstCandidate = `${baseName} (copy)`;
  if (!normalizedNames.has(firstCandidate.toLocaleLowerCase())) {
    return firstCandidate;
  }

  for (let index = 1; index < 10_000; index += 1) {
    const candidate = `${firstCandidate} (${index})`;
    if (!normalizedNames.has(candidate.toLocaleLowerCase())) {
      return candidate;
    }
  }

  return `${firstCandidate} (${Date.now()})`;
}

export function duplicateSenaSku(
  catalog: SenaCatalog,
  sku: SenaSku,
  createId: (catalog: SenaCatalog | null | undefined) => string = createUniqueSkuId,
): SenaCatalog {
  return upsertSenaSku(catalog, {
    ...sku,
    archived: false,
    name: nextCatalogCopyName(catalog.skus.map((entry) => entry.name), sku.name),
    skuId: createId(catalog),
  });
}

export function createSkuAttributeVariants(
  catalog: SenaCatalog,
  sku: SenaSku,
  combinations: ProductAttributeCombination[],
  createId: (catalog: SenaCatalog | null | undefined) => string = createUniqueSkuId,
): SenaCatalog {
  let nextCatalog = catalog;
  const plannedNames = [...catalog.skus.map((entry) => entry.name)];

  for (const combination of combinations) {
    if (combination.length === 0) {
      continue;
    }
    const name = uniqueProductVariantName(plannedNames, sku.name, combination);
    plannedNames.push(name);
    nextCatalog = upsertSenaSku(nextCatalog, {
      ...sku,
      archived: false,
      name,
      skuId: createId(nextCatalog),
    });
  }

  return nextCatalog;
}

export function linkedSkuIdsForService(catalog: SenaCatalog, serviceId: string) {
  const seenSkuIds = new Set<string>();
  const skuIds: string[] = [];
  for (const entry of catalog.sharingMask) {
    if (entry.serviceId !== serviceId || !entry.enabled || seenSkuIds.has(entry.skuId)) {
      continue;
    }
    seenSkuIds.add(entry.skuId);
    skuIds.push(entry.skuId);
  }
  return skuIds;
}

export function linkedServiceIdsForSku(catalog: SenaCatalog, skuId: string) {
  return catalog.sharingMask
    .filter((entry) => entry.skuId === skuId && entry.enabled)
    .map((entry) => entry.serviceId);
}

export function upsertSenaService(
  catalog: SenaCatalog,
  service: SenaService,
  skuIds: string[],
  previousServiceId = service.serviceId,
): SenaCatalog {
  const existingService =
    catalog.services.find((entry) => entry.serviceId === previousServiceId) ??
    catalog.services.find((entry) => entry.serviceId === service.serviceId);
  const nextService = normalizeSenaService({
    ...service,
    archived: existingService?.archived ?? service.archived ?? false,
  });
  const services = catalog.services.some((entry) => entry.serviceId === previousServiceId)
    ? catalog.services.map((entry) => (entry.serviceId === previousServiceId ? nextService : entry))
    : [...catalog.services, nextService];

  const existingMaskBySkuId = new Map(
    catalog.sharingMask
      .filter((entry) => entry.serviceId === previousServiceId || entry.serviceId === nextService.serviceId)
      .map((entry) => [entry.skuId, entry] as const),
  );
  const remainingMask = catalog.sharingMask.filter((entry) => entry.serviceId !== previousServiceId);
  const nextSkuIds = Array.from(new Set(skuIds.map((skuId) => skuId.trim()).filter(Boolean)));
  const nextMaskEntries: SenaServiceSkuMaskEntry[] = nextSkuIds.map((skuId) => ({
    enabled: true,
    serviceId: nextService.serviceId,
    skuId,
    usageProbability: existingMaskBySkuId.get(skuId)?.usageProbability ?? null,
  }));

  return {
    ...catalog,
    services,
    bundles: catalog.bundles.map((bundle) =>
      bundle.serviceId === previousServiceId ? { ...bundle, serviceId: nextService.serviceId } : bundle,
    ),
    sharingMask: [...remainingMask, ...nextMaskEntries],
  };
}

export function duplicateSenaService(
  catalog: SenaCatalog,
  service: SenaService,
  createId: (catalog: SenaCatalog | null | undefined) => string = createUniqueServiceId,
): SenaCatalog {
  const linkedSkuIds = linkedSkuIdsForService(catalog, service.serviceId);
  const nextService = {
    ...service,
    archived: false,
    name: nextCatalogCopyName(catalog.services.map((entry) => entry.name), service.name),
    serviceId: createId(catalog),
  };
  return upsertSenaService(catalog, nextService, linkedSkuIds);
}

export function createServiceAttributeVariants(
  catalog: SenaCatalog,
  service: SenaService,
  skuIds: string[],
  combinations: ProductAttributeCombination[],
  createId: (catalog: SenaCatalog | null | undefined) => string = createUniqueServiceId,
): SenaCatalog {
  let nextCatalog = catalog;
  const plannedNames = [...catalog.services.map((entry) => entry.name)];

  for (const combination of combinations) {
    if (combination.length === 0) {
      continue;
    }
    const name = uniqueProductVariantName(plannedNames, service.name, combination);
    plannedNames.push(name);
    nextCatalog = upsertSenaService(
      nextCatalog,
      {
        ...service,
        archived: false,
        name,
        serviceId: createId(nextCatalog),
      },
      skuIds,
    );
  }

  return nextCatalog;
}

export function archiveSenaSku(catalog: SenaCatalog, skuId: string): SenaCatalog {
  return {
    ...catalog,
    skus: catalog.skus.map((sku) => (sku.skuId === skuId ? { ...sku, archived: true } : sku)),
  };
}

export function unarchiveSenaSku(catalog: SenaCatalog, skuId: string): SenaCatalog {
  return {
    ...catalog,
    skus: catalog.skus.map((sku) => (sku.skuId === skuId ? { ...sku, archived: false } : sku)),
  };
}

export function archiveSenaService(catalog: SenaCatalog, serviceId: string): SenaCatalog {
  return {
    ...catalog,
    services: catalog.services.map((service) =>
      service.serviceId === serviceId ? { ...service, archived: true } : service
    ),
  };
}

export function unarchiveSenaService(catalog: SenaCatalog, serviceId: string): SenaCatalog {
  return {
    ...catalog,
    services: catalog.services.map((service) =>
      service.serviceId === serviceId ? { ...service, archived: false } : service
    ),
  };
}

export function removeSenaService(catalog: SenaCatalog, serviceId: string): SenaCatalog {
  return {
    ...catalog,
    services: catalog.services.filter((service) => service.serviceId !== serviceId),
    bundles: catalog.bundles.filter((bundle) => bundle.serviceId !== serviceId),
    sharingMask: catalog.sharingMask.filter((entry) => entry.serviceId !== serviceId),
  };
}

function ticketEventsReferenceEntity(input: SenaObservationInput, entityType: SenaCatalogEntityType, entityId: string) {
  return (input.ticketEvents ?? []).some((event) =>
    event.lines.some((line) => line.entityType === entityType && line.entityId === entityId),
  );
}

function observationReferencesSku(input: SenaObservationInput, skuId: string) {
  return (
    input.stockSnapshot.some((entry) => entry.skuId === skuId) ||
    (input.retailSalesSnapshot ?? []).some((entry) => entry.skuId === skuId) ||
    input.retailRankings.includes(skuId) ||
    input.retailStockouts.includes(skuId) ||
    input.orderSignals.some((entry) => entry.skuId === skuId) ||
    input.retailPrices.some((entry) => entry.skuId === skuId) ||
    input.leadTimeHints.some((entry) => entry.skuId === skuId) ||
    (input.adjustmentSignals ?? []).some((entry) => entry.skuId === skuId) ||
    (input.commercialEvents ?? []).some((entry) => entry.entityType === 'sku' && entry.entityId === skuId) ||
    (input.recipeUsageHints ?? []).some((entry) => entry.skuId === skuId) ||
    ticketEventsReferenceEntity(input, 'sku', skuId)
  );
}

function observationReferencesService(input: SenaObservationInput, serviceId: string) {
  return (
    (input.serviceSalesSnapshot ?? []).some((entry) => entry.serviceId === serviceId) ||
    input.serviceRankings.includes(serviceId) ||
    input.serviceStockouts.includes(serviceId) ||
    input.servicePrices.some((entry) => entry.serviceId === serviceId) ||
    (input.commercialEvents ?? []).some((entry) => entry.entityType === 'service' && entry.entityId === serviceId) ||
    (input.recipeUsageHints ?? []).some((entry) => entry.serviceId === serviceId) ||
    ticketEventsReferenceEntity(input, 'service', serviceId)
  );
}

export function catalogEntityActivityBlockers({
  catalog,
  entityId,
  entityType,
  observations,
  orderBatches,
}: {
  catalog: SenaCatalog;
  entityId: string;
  entityType: SenaCatalogEntityType;
  observations: SenaObservationRecord[];
  orderBatches: SenaOrderBatchRecord[];
}): CatalogDeleteBlocker[] {
  const blockers = new Set<CatalogDeleteBlocker>();

  if (entityType === 'sku') {
    const targetSku = catalog.skus.find((sku) => sku.skuId === entityId);
    if (!isSenaSkuArchived(targetSku) && activeSenaSkus(catalog).length <= 1) {
      blockers.add('last-sku');
    }
    if (catalog.sharingMask.some((entry) => entry.enabled && entry.skuId === entityId)) {
      blockers.add('linked-service');
    }
    if (
      observations.some((observation) => observationReferencesSku(observation.input, entityId)) ||
      orderBatches.some((batch) => batch.children.some((child) => child.skuId === entityId))
    ) {
      blockers.add('activity');
    }
    return Array.from(blockers);
  }

  if (observations.some((observation) => observationReferencesService(observation.input, entityId))) {
    blockers.add('activity');
  }

  return Array.from(blockers);
}
