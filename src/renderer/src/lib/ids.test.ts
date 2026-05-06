import { createOpaqueInventoryId } from './ids';

describe('opaque inventory ids', () => {
  it('creates sku ids with the expected opaque format', () => {
    expect(createOpaqueInventoryId('sku')).toMatch(/^sku-[a-z0-9]{20}$/);
  });

  it('creates service ids with the expected opaque format', () => {
    expect(createOpaqueInventoryId('service')).toMatch(/^service-[a-z0-9]{20}$/);
  });

  it('does not derive ids from timestamps', () => {
    expect(createOpaqueInventoryId('sku')).not.toMatch(/^sku-\d{10,}$/);
    expect(createOpaqueInventoryId('service')).not.toMatch(/^service-\d{10,}$/);
  });

  it('avoids collisions in a large smoke sample', () => {
    const ids = new Set<string>();
    const count = 5_000;

    for (let index = 0; index < count; index += 1) {
      ids.add(createOpaqueInventoryId('sku'));
      ids.add(createOpaqueInventoryId('service'));
    }

    expect(ids.size).toBe(count * 2);
  });
});
