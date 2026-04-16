import type { SenaCatalog } from '@shared/sena';
import { vi } from 'vitest';
import {
  createUniqueSkuId,
  hasCatalogEntityIdConflict,
  matchesServiceSupplier,
  matchesSkuSupplier,
  normalizeSenaSku,
  skuSearchParts,
  supplierNamesForService,
  supplierNamesFromCatalog,
  upsertSenaService,
  upsertSenaSku,
} from './sena-catalog';

const sampleCatalog: SenaCatalog = {
  schemaVersion: 1,
  skus: [
    {
      skuId: 'sku-1',
      name: 'SKU 1',
      description: 'Primary SKU',
      supplierName: 'Mekong Looms',
      costPerUnit: 4,
      archived: false,
      soldAsProduct: true,
      productPrice: 9,
      leadTimeMeanDaysHint: 5,
      leadTimeStdDaysHint: 1,
    },
    {
      skuId: 'sku-archived',
      name: 'Archived SKU',
      description: 'Archived',
      supplierName: null,
      costPerUnit: 6,
      archived: true,
      soldAsProduct: false,
      productPrice: null,
      leadTimeMeanDaysHint: null,
      leadTimeStdDaysHint: null,
    },
    {
      skuId: 'sku-2',
      name: 'SKU 2',
      description: 'Secondary SKU',
      supplierName: 'Tonle Supply',
      costPerUnit: 5,
      archived: false,
      soldAsProduct: true,
      productPrice: 10,
      leadTimeMeanDaysHint: 4,
      leadTimeStdDaysHint: 1,
    },
  ],
  services: [
    {
      serviceId: 'service-1',
      name: 'Service 1',
      description: 'Primary service',
      price: 20,
      archived: false,
      bundle: false,
    },
    {
      serviceId: 'service-archived',
      name: 'Archived service',
      description: 'Archived',
      price: 18,
      archived: true,
      bundle: false,
    },
    {
      serviceId: 'service-2',
      name: 'Service 2',
      description: 'Secondary service',
      price: 16,
      archived: false,
      bundle: false,
    },
    {
      serviceId: 'service-3',
      name: 'Service 3',
      description: 'No supplier service',
      price: 14,
      archived: false,
      bundle: false,
    },
  ],
  bundles: [
    {
      bundleId: 'bundle-1',
      serviceId: 'service-1',
      name: 'Bundle 1',
    },
  ],
  sharingMask: [
    {
      enabled: true,
      serviceId: 'service-1',
      skuId: 'sku-1',
      usageProbability: null,
    },
    {
      enabled: true,
      serviceId: 'service-2',
      skuId: 'sku-2',
      usageProbability: null,
    },
    {
      enabled: true,
      serviceId: 'service-3',
      skuId: 'sku-archived',
      usageProbability: null,
    },
  ],
};

describe('sena catalog helpers', () => {
  it('renames a sku and rewrites sharing mask references', () => {
    const nextCatalog = upsertSenaSku(
      sampleCatalog,
      {
        ...sampleCatalog.skus[0],
        skuId: 'sku-1-renamed',
      },
      'sku-1',
    );

    expect(nextCatalog.skus[0]).toMatchObject({
      skuId: 'sku-1-renamed',
      archived: false,
    });
    expect(nextCatalog.sharingMask).toEqual(
      expect.arrayContaining([
        {
          enabled: true,
          serviceId: 'service-1',
          skuId: 'sku-1-renamed',
          usageProbability: null,
        },
      ]),
    );
  });

  it('renames a service and rewrites sharing mask and bundle references', () => {
    const nextCatalog = upsertSenaService(
      sampleCatalog,
      {
        ...sampleCatalog.services[0],
        serviceId: 'service-1-renamed',
      },
      ['sku-1'],
      'service-1',
    );

    expect(nextCatalog.services[0]).toMatchObject({
      serviceId: 'service-1-renamed',
      archived: false,
    });
    expect(nextCatalog.bundles).toEqual([
      {
        bundleId: 'bundle-1',
        serviceId: 'service-1-renamed',
        name: 'Bundle 1',
      },
    ]);
    expect(nextCatalog.sharingMask).toEqual(
      expect.arrayContaining([
        {
          enabled: true,
          serviceId: 'service-1-renamed',
          skuId: 'sku-1',
          usageProbability: null,
        },
      ]),
    );
  });

  it('treats archived ids as conflicts', () => {
    expect(hasCatalogEntityIdConflict(sampleCatalog, 'sku', 'sku-archived')).toBe(true);
    expect(hasCatalogEntityIdConflict(sampleCatalog, 'service', 'service-archived')).toBe(true);
  });

  it('treats cross-type ids as conflicts and allows unchanged ids while editing', () => {
    expect(hasCatalogEntityIdConflict(sampleCatalog, 'sku', 'service-1')).toBe(true);
    expect(hasCatalogEntityIdConflict(sampleCatalog, 'service', 'sku-1')).toBe(true);
    expect(hasCatalogEntityIdConflict(sampleCatalog, 'sku', 'sku-1', 'sku-1')).toBe(false);
    expect(hasCatalogEntityIdConflict(sampleCatalog, 'service', 'service-1', 'service-1')).toBe(false);
  });

  it('creates a unique opaque sku id and retries collisions', () => {
    const createId = vi
      .fn<(prefix: 'sku') => string>()
      .mockReturnValueOnce('sku-1')
      .mockReturnValueOnce('service-1')
      .mockReturnValueOnce('sku-generated-unique');

    expect(createUniqueSkuId(sampleCatalog, createId)).toBe('sku-generated-unique');
    expect(createId).toHaveBeenCalledTimes(3);
  });

  it('normalizes supplier names and exposes supplier filters', () => {
    const primaryService = sampleCatalog.services.find((service) => service.serviceId === 'service-1')!;
    const secondaryService = sampleCatalog.services.find((service) => service.serviceId === 'service-2')!;
    const noSupplierService = sampleCatalog.services.find((service) => service.serviceId === 'service-3')!;

    expect(normalizeSenaSku({ ...sampleCatalog.skus[0], supplierName: '  Mekong Looms  ' }).supplierName).toBe('Mekong Looms');
    expect(normalizeSenaSku({ ...sampleCatalog.skus[0], supplierName: '   ' }).supplierName).toBeNull();
    expect(supplierNamesFromCatalog(sampleCatalog)).toEqual(['Mekong Looms', 'Tonle Supply']);
    expect(matchesSkuSupplier(sampleCatalog.skus[0], 'Mekong Looms')).toBe(true);
    expect(matchesSkuSupplier(sampleCatalog.skus[0], 'none')).toBe(false);
    expect(matchesSkuSupplier(sampleCatalog.skus[1], 'none')).toBe(true);
    expect(supplierNamesForService(sampleCatalog, 'service-1')).toEqual(['Mekong Looms']);
    expect(matchesServiceSupplier(primaryService, sampleCatalog, 'Mekong Looms')).toBe(true);
    expect(matchesServiceSupplier(secondaryService, sampleCatalog, 'Mekong Looms')).toBe(false);
    expect(matchesServiceSupplier(noSupplierService, sampleCatalog, 'none')).toBe(true);
    expect(skuSearchParts(sampleCatalog.skus[0])).toEqual(['sku-1', 'SKU 1', 'Primary SKU', 'Mekong Looms']);
  });
});
