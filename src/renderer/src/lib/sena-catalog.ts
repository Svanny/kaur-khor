import type { SenaCatalog, SenaService, SenaServiceSkuMaskEntry, SenaSku } from '@shared/sena';
import { validateEntryId } from './validation';

export type SenaCatalogEntityType = 'sku' | 'service';

export function normalizeSenaSku(sku: SenaSku): SenaSku {
  return {
    ...sku,
    archived: sku.archived ?? false,
  };
}

export function normalizeSenaService(service: SenaService): SenaService {
  return {
    ...service,
    archived: service.archived ?? false,
  };
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

export function linkedSkuIdsForService(catalog: SenaCatalog, serviceId: string) {
  return catalog.sharingMask
    .filter((entry) => entry.serviceId === serviceId && entry.enabled)
    .map((entry) => entry.skuId);
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

  const remainingMask = catalog.sharingMask.filter((entry) => entry.serviceId !== previousServiceId);
  const nextMaskEntries: SenaServiceSkuMaskEntry[] = skuIds.map((skuId) => ({
    enabled: true,
    serviceId: nextService.serviceId,
    skuId,
    usageProbability: null,
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
