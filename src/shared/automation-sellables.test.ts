import { describe, expect, test } from 'vitest';
import type { SenaCatalog, SenaService, SenaSku } from './sena';
import {
  isAutomationEligibleExposureRow,
  hasAutomationEligibleSellable,
  isAutomationEligibleService,
  isAutomationEligibleSku,
} from './automation-sellables';

const sku: SenaSku = {
  archived: false,
  costPerUnit: 4,
  description: 'Thread',
  imagePath: null,
  leadTimeMeanDaysHint: null,
  leadTimeStdDaysHint: null,
  name: 'Thread',
  productPrice: 9,
  skuId: 'sku-1',
  soldAsProduct: true,
  supplierName: null,
};

const service: SenaService = {
  archived: false,
  bundle: false,
  description: 'Repair service',
  imagePath: null,
  name: 'Repair',
  price: 12,
  serviceId: 'service-1',
};

function catalog(overrides: Partial<SenaCatalog> = {}): SenaCatalog {
  return {
    bundles: [],
    schemaVersion: 1,
    services: [],
    sharingMask: [],
    skus: [],
    ...overrides,
  };
}

describe('automation sellable eligibility', () => {
  test('requires SKU automation prices to be finite and non-negative', () => {
    expect(isAutomationEligibleSku(sku)).toBe(true);
    expect(isAutomationEligibleSku({ ...sku, productPrice: 0 })).toBe(true);
    expect(isAutomationEligibleSku({ ...sku, productPrice: null })).toBe(false);
    expect(isAutomationEligibleSku({ ...sku, productPrice: -1 })).toBe(false);
    expect(isAutomationEligibleSku({ ...sku, productPrice: Number.NaN })).toBe(false);
    expect(isAutomationEligibleSku({ ...sku, productPrice: Number.POSITIVE_INFINITY })).toBe(false);
  });

  test('requires service automation prices to be finite and non-negative', () => {
    expect(isAutomationEligibleService(service)).toBe(true);
    expect(isAutomationEligibleService({ ...service, price: 0 })).toBe(true);
    expect(isAutomationEligibleService({ ...service, price: -1 })).toBe(false);
    expect(isAutomationEligibleService({ ...service, price: Number.NaN })).toBe(false);
    expect(isAutomationEligibleService({ ...service, price: Number.POSITIVE_INFINITY })).toBe(false);
  });

  test('does not unlock automations for catalogs with only corrupt prices', () => {
    expect(hasAutomationEligibleSellable(catalog({
      skus: [{ ...sku, productPrice: -1 }],
      services: [{ ...service, price: Number.NaN }],
    }))).toBe(false);
  });

  test('requires exposed automation rows to be visible and priced', () => {
    const row = {
      alias: null,
      archived: false,
      availabilityLabel: 'Available',
      availabilityStatus: 'available',
      entityId: 'service-1',
      entityType: 'service',
      exposed: true,
      label: 'Repair',
      price: 12,
      sortOrder: 0,
    } as const;

    expect(isAutomationEligibleExposureRow(row)).toBe(true);
    expect(isAutomationEligibleExposureRow({ ...row, price: -1 })).toBe(false);
    expect(isAutomationEligibleExposureRow({ ...row, price: Number.NaN })).toBe(false);
    expect(isAutomationEligibleExposureRow({ ...row, price: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isAutomationEligibleExposureRow({ ...row, availabilityStatus: 'hidden' })).toBe(false);
    expect(isAutomationEligibleExposureRow({ ...row, archived: true })).toBe(false);
  });
});
