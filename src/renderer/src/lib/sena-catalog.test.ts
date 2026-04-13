import type { SenaCatalog } from '@shared/sena';
import { vi } from 'vitest';
import {
  createUniqueSkuId,
  hasCatalogEntityIdConflict,
  matchesSkuSupplier,
  normalizeSenaSku,
  skuSearchParts,
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
    expect(nextCatalog.sharingMask).toEqual([
      {
        enabled: true,
        serviceId: 'service-1',
        skuId: 'sku-1-renamed',
        usageProbability: null,
      },
    ]);
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
    expect(nextCatalog.sharingMask).toEqual([
      {
        enabled: true,
        serviceId: 'service-1-renamed',
        skuId: 'sku-1',
        usageProbability: null,
      },
    ]);
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
    expect(normalizeSenaSku({ ...sampleCatalog.skus[0], supplierName: '  Mekong Looms  ' }).supplierName).toBe('Mekong Looms');
    expect(normalizeSenaSku({ ...sampleCatalog.skus[0], supplierName: '   ' }).supplierName).toBeNull();
    expect(supplierNamesFromCatalog(sampleCatalog)).toEqual(['Mekong Looms']);
    expect(matchesSkuSupplier(sampleCatalog.skus[0], 'Mekong Looms')).toBe(true);
    expect(matchesSkuSupplier(sampleCatalog.skus[0], 'none')).toBe(false);
    expect(matchesSkuSupplier(sampleCatalog.skus[1], 'none')).toBe(true);
    expect(skuSearchParts(sampleCatalog.skus[0])).toEqual(['sku-1', 'SKU 1', 'Primary SKU', 'Mekong Looms']);
  });
});
