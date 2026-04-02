import type { SenaCatalog, SenaService, SenaServiceSkuMaskEntry, SenaSku } from '@shared/sena';

export function emptySenaCatalog(): SenaCatalog {
  return {
    schemaVersion: 1,
    skus: [],
    services: [],
    bundles: [],
    sharingMask: [],
  };
}

export function upsertSenaSku(catalog: SenaCatalog, sku: SenaSku): SenaCatalog {
  const skus = catalog.skus.some((entry) => entry.skuId === sku.skuId)
    ? catalog.skus.map((entry) => (entry.skuId === sku.skuId ? sku : entry))
    : [...catalog.skus, sku];

  return {
    ...catalog,
    skus,
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
): SenaCatalog {
  const services = catalog.services.some((entry) => entry.serviceId === service.serviceId)
    ? catalog.services.map((entry) => (entry.serviceId === service.serviceId ? service : entry))
    : [...catalog.services, service];

  const remainingMask = catalog.sharingMask.filter((entry) => entry.serviceId !== service.serviceId);
  const nextMaskEntries: SenaServiceSkuMaskEntry[] = skuIds.map((skuId) => ({
    enabled: true,
    serviceId: service.serviceId,
    skuId,
    usageProbability: null,
  }));

  return {
    ...catalog,
    services,
    sharingMask: [...remainingMask, ...nextMaskEntries],
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
