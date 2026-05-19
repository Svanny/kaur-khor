import type {
  SenaRunLookupPayload,
  SenaServiceLookupPayload,
  SenaSkuLookupPayload,
} from '@shared/ipc';
import type {
  SenaObservationDeletePayload,
  SenaObservationUpdatePayload,
} from '@shared/sena';

function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object') {
    throw new Error(message);
  }
}

function assertNonEmptyString(value: unknown, message: string): asserts value is string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(message);
  }
}

function assertOptionalFiniteNumber(value: unknown, message: string) {
  if (value !== undefined && value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error(message);
  }
}

export function normalizeSenaSkuLookupPayload(payload: SenaSkuLookupPayload): SenaSkuLookupPayload {
  assertRecord(payload, 'SENA SKU detail lookup must be an object.');
  assertNonEmptyString(payload.skuId, 'SENA SKU detail lookup requires a SKU id.');
  assertOptionalFiniteNumber(payload.beforeIntervalIndex, 'SENA SKU detail before interval must be a finite number or null.');
  assertOptionalFiniteNumber(payload.limit, 'SENA SKU detail limit must be a finite number.');
  return {
    skuId: payload.skuId.trim(),
    beforeIntervalIndex: payload.beforeIntervalIndex ?? null,
    limit: payload.limit ?? 20,
  };
}

export function normalizeSenaServiceLookupPayload(payload: SenaServiceLookupPayload): SenaServiceLookupPayload {
  assertRecord(payload, 'SENA service detail lookup must be an object.');
  assertNonEmptyString(payload.serviceId, 'SENA service detail lookup requires a service id.');
  assertOptionalFiniteNumber(payload.beforeIntervalIndex, 'SENA service detail before interval must be a finite number or null.');
  assertOptionalFiniteNumber(payload.limit, 'SENA service detail limit must be a finite number.');
  return {
    serviceId: payload.serviceId.trim(),
    beforeIntervalIndex: payload.beforeIntervalIndex ?? null,
    limit: payload.limit ?? 20,
  };
}

export function assertSenaObservationUpdatePayloadIsValid(payload: SenaObservationUpdatePayload) {
  assertRecord(payload, 'SENA observation update must be an object.');
  assertNonEmptyString(payload.observationId, 'SENA observation update requires an observation id.');
  assertRecord(payload.input, 'SENA observation update requires observation input.');
}

export function assertSenaObservationDeletePayloadIsValid(payload: SenaObservationDeletePayload) {
  assertRecord(payload, 'SENA observation delete must be an object.');
  assertNonEmptyString(payload.observationId, 'SENA observation delete requires an observation id.');
}

export function assertSenaRunLookupPayloadIsValid(payload: SenaRunLookupPayload) {
  assertRecord(payload, 'SENA run lookup must be an object.');
  assertNonEmptyString(payload.runId, 'SENA run lookup requires a run id.');
}
