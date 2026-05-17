// @vitest-environment node

import { describe, expect, it } from 'vitest';
import {
  assertSenaObservationDeletePayloadIsValid,
  assertSenaObservationUpdatePayloadIsValid,
  assertSenaRunLookupPayloadIsValid,
  normalizeSenaServiceLookupPayload,
  normalizeSenaSkuLookupPayload,
} from './sena-ipc-payloads';

describe('SENA IPC payload validation', () => {
  it('normalizes detail lookup payloads before cache keys are built', () => {
    expect(normalizeSenaSkuLookupPayload({ skuId: ' sku-1 ' })).toEqual({
      skuId: 'sku-1',
      beforeIntervalIndex: null,
      limit: 20,
    });
    expect(normalizeSenaServiceLookupPayload({ serviceId: ' service-1 ', beforeIntervalIndex: 10, limit: 5 })).toEqual({
      serviceId: 'service-1',
      beforeIntervalIndex: 10,
      limit: 5,
    });
  });

  it('rejects malformed detail lookup payloads', () => {
    expect(() => normalizeSenaSkuLookupPayload(null as never))
      .toThrow('SENA SKU detail lookup must be an object.');
    expect(() => normalizeSenaSkuLookupPayload({ skuId: '' }))
      .toThrow('SENA SKU detail lookup requires a SKU id.');
    expect(() => normalizeSenaServiceLookupPayload({ serviceId: 'service-1', limit: Number.NaN }))
      .toThrow('SENA service detail limit must be a finite number.');
  });

  it('rejects malformed mutation and run lookup payloads', () => {
    expect(() => assertSenaObservationUpdatePayloadIsValid({ observationId: '', input: {} } as never))
      .toThrow('SENA observation update requires an observation id.');
    expect(() => assertSenaObservationUpdatePayloadIsValid({ observationId: 'obs-1', input: null } as never))
      .toThrow('SENA observation update requires observation input.');
    expect(() => assertSenaObservationDeletePayloadIsValid({ observationId: ' ' }))
      .toThrow('SENA observation delete requires an observation id.');
    expect(() => assertSenaRunLookupPayloadIsValid(undefined as never))
      .toThrow('SENA run lookup must be an object.');
  });
});
