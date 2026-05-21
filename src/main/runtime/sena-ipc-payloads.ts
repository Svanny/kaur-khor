import { normalizeSenaEngineParameters } from '@shared/ipc';
import type {
  SenaDetailCacheClearPayload,
  SenaRunLookupPayload,
  SenaServiceLookupPayload,
  SenaSkuLookupPayload,
  SenaTriggerRunPayload,
} from '@shared/ipc';
import type {
  SenaObservationDeletePayload,
  SenaObservationUpdatePayload,
  SenaCatalog,
  SenaCommercialEntityType,
  SenaCommercialFlow,
  SenaCommercialParty,
  SenaCommercialStage,
  SenaCreateOrderBatchPayload,
  SenaDeliveryFeeBucket,
  SenaDeliveryFeePayer,
  SenaDiscountMode,
  SenaObservationInput,
  SenaObservationPageRequest,
  SenaOrderFieldValues,
  SenaOrderBatchStatus,
  SenaOrderChildStatus,
  SenaOrderLookupPayload,
  SenaSplitOrderChildPayload,
  SenaTicketEventType,
  SenaTicketFamily,
  SenaTicketLifecycle,
  SenaTicketStage,
  SenaUpdateOrderBatchPayload,
  SenaUpdateOrderChildPayload,
} from '@shared/sena';

function assertRecord(value: unknown, message: string): asserts value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
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

function assertOptionalSafeInteger(value: unknown, message: string) {
  assertOptionalFiniteNumber(value, message);
  if (typeof value === 'number' && !Number.isSafeInteger(value)) {
    throw new Error(message);
  }
}

function assertOptionalNonNegativeNumber(value: unknown, message: string) {
  assertOptionalSafeInteger(value, message);
  if (typeof value === 'number' && value < 0) {
    throw new Error(message);
  }
}

function assertNonNegativeSafeInteger(value: unknown, message: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(message);
  }
}

function assertOptionalPositiveNumber(value: unknown, message: string) {
  assertOptionalSafeInteger(value, message);
  if (typeof value === 'number' && value <= 0) {
    throw new Error(message);
  }
}

function assertOptionalString(value: unknown, message: string) {
  if (value !== undefined && value !== null && typeof value !== 'string') {
    throw new Error(message);
  }
}

function assertOptionalEnum<T extends string>(value: unknown, allowed: readonly T[], message: string): asserts value is T | null | undefined {
  if (value !== undefined && value !== null && (typeof value !== 'string' || !allowed.includes(value as T))) {
    throw new Error(message);
  }
}

function assertEnum<T extends string>(value: unknown, allowed: readonly T[], message: string): asserts value is T {
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new Error(message);
  }
}

function normalizeOptionalTrimmedString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

const SENA_ISO_TIMESTAMP_PATTERN =
  /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;

function assertIsoTimestamp(value: string, message: string) {
  const match = SENA_ISO_TIMESTAMP_PATTERN.exec(value);
  if (!match) {
    throw new Error(message);
  }
  const normalizedValue = match[7] == null ? value.replace('Z', '.000Z') : value;
  const timestamp = Date.parse(normalizedValue);
  if (!Number.isFinite(timestamp) || new Date(timestamp).toISOString() !== normalizedValue) {
    throw new Error(message);
  }
}

const SENA_ORDER_BATCH_STATUSES: readonly SenaOrderBatchStatus[] = [
  'open',
  'awaiting_receipt',
  'follow_up',
  'partial_receipt',
  'received',
  'reviewed',
];

const SENA_ORDER_CHILD_STATUSES: readonly SenaOrderChildStatus[] = [
  'open',
  'awaiting_receipt',
  'follow_up',
  'received',
  'reviewed',
];
const SENA_LEAD_TIME_VARIABILITY_CLASSES = ['very_tight', 'tight', 'normal', 'wide', 'very_wide'] as const;
const SENA_COMMERCIAL_PARTIES: readonly SenaCommercialParty[] = ['customer', 'supplier'];
const SENA_COMMERCIAL_ENTITY_TYPES: readonly SenaCommercialEntityType[] = ['sku', 'service'];
const SENA_COMMERCIAL_STAGES: readonly SenaCommercialStage[] = ['pending', 'realized'];
const SENA_COMMERCIAL_FLOWS: readonly SenaCommercialFlow[] = ['scheduled', 'immediate', 'reversal'];
const SENA_TICKET_FAMILIES: readonly SenaTicketFamily[] = ['customer', 'supplier', 'adjustment'];
const SENA_TICKET_LIFECYCLES: readonly SenaTicketLifecycle[] = ['open', 'resolved', 'canceled'];
const SENA_TICKET_STAGES: readonly SenaTicketStage[] = [
  'pending',
  'ready',
  'fulfilled_immediate',
  'to_order',
  'ordered_waiting',
  'partial_received',
  'received',
  'draft',
  'applied',
];
const SENA_TICKET_EVENT_TYPES: readonly SenaTicketEventType[] = [
  'created',
  'revised',
  'note_added',
  'ready_marked',
  'fulfilled_immediate',
  'canceled',
  'eta_updated',
  'followup_logged',
  'partial_received',
  'fully_received',
  'applied',
];
const SENA_DELIVERY_FEE_PAYERS: readonly SenaDeliveryFeePayer[] = ['customer', 'merchant'];
const SENA_DELIVERY_FEE_BUCKETS: readonly SenaDeliveryFeeBucket[] = ['supplier', 'customer_order', 'immediate_sale'];
const SENA_DISCOUNT_MODES: readonly SenaDiscountMode[] = ['amount', 'percent'];

export function normalizeSenaObservationPageRequest(
  payload?: SenaObservationPageRequest,
): SenaObservationPageRequest | undefined {
  if (payload == null) {
    return undefined;
  }
  assertRecord(payload, 'SENA observation page request must be an object.');
  assertOptionalString(payload.beforeObservedAt, 'SENA observation page cursor timestamp must be a string or null.');
  assertOptionalString(payload.beforeObservationId, 'SENA observation page cursor id must be a string or null.');
  assertOptionalPositiveNumber(payload.limit, 'SENA observation page limit must be a positive finite number.');
  const pageRequest = payload as SenaObservationPageRequest;
  const beforeObservedAt = normalizeOptionalTrimmedString(pageRequest.beforeObservedAt) ?? null;
  if (beforeObservedAt !== null) {
    assertIsoTimestamp(beforeObservedAt, 'SENA observation page cursor timestamp must be an ISO timestamp or null.');
  }
  return {
    beforeObservedAt,
    beforeObservationId: normalizeOptionalTrimmedString(pageRequest.beforeObservationId) ?? null,
    limit: pageRequest.limit ?? 100,
  };
}

export function normalizeSenaOrderLookupPayload(
  payload?: SenaOrderLookupPayload,
): SenaOrderLookupPayload | undefined {
  if (payload == null) {
    return undefined;
  }
  assertRecord(payload, 'SENA order lookup must be an object.');
  assertOptionalString(payload.batchOrderId, 'SENA order lookup batch id must be a string or null.');
  assertOptionalString(payload.childOrderId, 'SENA order lookup child id must be a string or null.');
  assertOptionalString(payload.skuId, 'SENA order lookup SKU id must be a string or null.');
  assertOptionalString(payload.supplierName, 'SENA order lookup supplier name must be a string or null.');
  assertOptionalEnum(payload.status, SENA_ORDER_BATCH_STATUSES, 'SENA order lookup requires a supported status.');
  const orderLookup = payload as SenaOrderLookupPayload;
  return {
    batchOrderId: normalizeOptionalTrimmedString(orderLookup.batchOrderId),
    childOrderId: normalizeOptionalTrimmedString(orderLookup.childOrderId),
    skuId: normalizeOptionalTrimmedString(orderLookup.skuId),
    supplierName: normalizeOptionalTrimmedString(orderLookup.supplierName),
    status: orderLookup.status ?? undefined,
  };
}

export function normalizeSenaSkuLookupPayload(payload: SenaSkuLookupPayload): SenaSkuLookupPayload {
  assertRecord(payload, 'SENA SKU detail lookup must be an object.');
  assertNonEmptyString(payload.skuId, 'SENA SKU detail lookup requires a SKU id.');
  assertOptionalNonNegativeNumber(payload.beforeIntervalIndex, 'SENA SKU detail before interval must be a non-negative finite number or null.');
  assertOptionalPositiveNumber(payload.limit, 'SENA SKU detail limit must be a positive finite number.');
  return {
    skuId: payload.skuId.trim(),
    beforeIntervalIndex: payload.beforeIntervalIndex ?? null,
    limit: payload.limit ?? 20,
  };
}

export function normalizeSenaServiceLookupPayload(payload: SenaServiceLookupPayload): SenaServiceLookupPayload {
  assertRecord(payload, 'SENA service detail lookup must be an object.');
  assertNonEmptyString(payload.serviceId, 'SENA service detail lookup requires a service id.');
  assertOptionalNonNegativeNumber(payload.beforeIntervalIndex, 'SENA service detail before interval must be a non-negative finite number or null.');
  assertOptionalPositiveNumber(payload.limit, 'SENA service detail limit must be a positive finite number.');
  return {
    serviceId: payload.serviceId.trim(),
    beforeIntervalIndex: payload.beforeIntervalIndex ?? null,
    limit: payload.limit ?? 20,
  };
}

export function normalizeSenaObservationUpdatePayload(payload: SenaObservationUpdatePayload): SenaObservationUpdatePayload {
  assertRecord(payload, 'SENA observation update must be an object.');
  assertNonEmptyString(payload.observationId, 'SENA observation update requires an observation id.');
  assertRecord(payload.input, 'SENA observation update requires observation input.');
  return {
    ...payload,
    observationId: payload.observationId.trim(),
    input: normalizeSenaObservationInputPayload(payload.input as SenaObservationInput),
  };
}

function assertArray(value: unknown, message: string): asserts value is unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(message);
  }
}

function assertFiniteNumber(value: unknown, message: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(message);
  }
}

function assertNonNegativeFiniteNumber(value: unknown, message: string): asserts value is number {
  assertFiniteNumber(value, message);
  if (value < 0) {
    throw new Error(message);
  }
}

function assertRequiredOptionalNonNegativeFiniteNumber(value: unknown, message: string) {
  if (value !== null) {
    assertNonNegativeFiniteNumber(value, message);
  }
}

function assertBoolean(value: unknown, message: string): asserts value is boolean {
  if (typeof value !== 'boolean') {
    throw new Error(message);
  }
}

function assertRequiredOptionalProbability(value: unknown, message: string) {
  assertRequiredOptionalNonNegativeFiniteNumber(value, message);
  if (typeof value === 'number' && value > 1) {
    throw new Error(message);
  }
}

function assertOptionalNonNegativeFiniteNumber(value: unknown, message: string) {
  if (value !== undefined && value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0)) {
    throw new Error(message);
  }
}

function assertOptionalNumberAtMost(value: unknown, max: number, message: string) {
  assertOptionalNonNegativeFiniteNumber(value, message);
  if (typeof value === 'number' && value > max) {
    throw new Error(message);
  }
}

function assertOptionalFiniteNumberValue(value: unknown, message: string) {
  if (value !== undefined && value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw new Error(message);
  }
}

function normalizeStringArrayIds(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

function entryIds(entries: unknown[], key: string) {
  return entries.map((entry) =>
    entry && typeof entry === 'object' ? (entry as Record<string, unknown>)[key] : undefined,
  );
}

function assertUniqueIds(values: unknown[], message: string) {
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string') {
      continue;
    }
    const normalized = value.trim();
    if (seen.has(normalized)) {
      throw new Error(message);
    }
    seen.add(normalized);
  }
}

function assertUniquePairs(
  entries: unknown[],
  leftKey: string,
  rightKey: string,
  message: string,
) {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    const record = entry as Record<string, unknown>;
    if (typeof record[leftKey] !== 'string' || typeof record[rightKey] !== 'string') {
      continue;
    }
    const key = `${record[leftKey].trim()}\u0000${record[rightKey].trim()}`;
    if (seen.has(key)) {
      throw new Error(message);
    }
    seen.add(key);
  }
}

function validateSenaDeliveryFeeMetadata(value: unknown) {
  if (value == null) {
    return;
  }
  assertRecord(value, 'SENA delivery fee metadata must be an object.');
  assertOptionalNonNegativeFiniteNumber(value.feeUsd, 'SENA delivery fee amount must be a non-negative finite number or null.');
  assertEnum(value.payer, SENA_DELIVERY_FEE_PAYERS, 'SENA delivery fee payer requires a supported value.');
  assertEnum(value.bucket, SENA_DELIVERY_FEE_BUCKETS, 'SENA delivery fee bucket requires a supported value.');
  assertOptionalNonNegativeFiniteNumber(value.subtotalUsd, 'SENA delivery fee subtotal must be a non-negative finite number or null.');
  assertOptionalNonNegativeFiniteNumber(value.displayDeliveryUsd, 'SENA delivery fee display amount must be a non-negative finite number or null.');
  assertOptionalNonNegativeFiniteNumber(value.displayTotalUsd, 'SENA delivery fee display total must be a non-negative finite number or null.');
  assertOptionalFiniteNumberValue(value.netSettlementUsd, 'SENA delivery fee net settlement must be a finite number or null.');
}

function validateSenaDiscountMetadata(value: unknown) {
  if (value == null) {
    return;
  }
  assertRecord(value, 'SENA discount metadata must be an object.');
  assertEnum(value.mode, SENA_DISCOUNT_MODES, 'SENA discount mode requires a supported value.');
  assertOptionalNonNegativeFiniteNumber(value.amountUsd, 'SENA discount amount must be a non-negative finite number or null.');
  assertOptionalNumberAtMost(value.percent, 100, 'SENA discount percent must be between 0 and 100 or null.');
  assertOptionalNonNegativeFiniteNumber(value.subtotalUsd, 'SENA discount subtotal must be a non-negative finite number or null.');
  assertOptionalNonNegativeFiniteNumber(value.displayDiscountUsd, 'SENA discount display amount must be a non-negative finite number or null.');
  assertOptionalNonNegativeFiniteNumber(value.discountedSubtotalUsd, 'SENA discounted subtotal must be a non-negative finite number or null.');
}

function validateSenaObservationInputEntries(payload: SenaObservationInput) {
  assertUniqueIds(entryIds(payload.stockSnapshot, 'skuId'), 'SENA stock snapshot entries must not contain duplicate SKU ids.');
  for (const snapshot of payload.stockSnapshot) {
    assertRecord(snapshot, 'SENA stock snapshot entries must be objects.');
    assertNonEmptyString(snapshot.skuId, 'SENA stock snapshot entries require a SKU id.');
    assertNonNegativeFiniteNumber(snapshot.unitsInStock, 'SENA stock snapshot units must be a non-negative finite number.');
    assertRequiredOptionalNonNegativeFiniteNumber(snapshot.costPerUnit, 'SENA stock snapshot cost must be a non-negative finite number or null.');
    assertRequiredOptionalNonNegativeFiniteNumber(snapshot.productPrice, 'SENA stock snapshot product price must be a non-negative finite number or null.');
  }
  assertUniqueIds(entryIds(payload.retailSalesSnapshot ?? [], 'skuId'), 'SENA retail sales snapshot entries must not contain duplicate SKU ids.');
  for (const snapshot of payload.retailSalesSnapshot ?? []) {
    assertRecord(snapshot, 'SENA retail sales snapshot entries must be objects.');
    assertNonEmptyString(snapshot.skuId, 'SENA retail sales snapshot entries require a SKU id.');
  }
  assertUniqueIds(entryIds(payload.serviceSalesSnapshot ?? [], 'serviceId'), 'SENA service sales snapshot entries must not contain duplicate service ids.');
  for (const snapshot of payload.serviceSalesSnapshot ?? []) {
    assertRecord(snapshot, 'SENA service sales snapshot entries must be objects.');
    assertNonEmptyString(snapshot.serviceId, 'SENA service sales snapshot entries require a service id.');
  }
  assertUniqueIds(payload.serviceRankings, 'SENA service rankings must not contain duplicate service ids.');
  for (const serviceId of payload.serviceRankings) {
    assertNonEmptyString(serviceId, 'SENA service rankings require service ids.');
  }
  assertUniqueIds(payload.retailRankings, 'SENA retail rankings must not contain duplicate SKU ids.');
  for (const skuId of payload.retailRankings) {
    assertNonEmptyString(skuId, 'SENA retail rankings require SKU ids.');
  }
  assertUniqueIds(payload.serviceStockouts, 'SENA service stockouts must not contain duplicate service ids.');
  for (const serviceId of payload.serviceStockouts) {
    assertNonEmptyString(serviceId, 'SENA service stockouts require service ids.');
  }
  assertUniqueIds(payload.retailStockouts, 'SENA retail stockouts must not contain duplicate SKU ids.');
  for (const skuId of payload.retailStockouts) {
    assertNonEmptyString(skuId, 'SENA retail stockouts require SKU ids.');
  }
  assertUniqueIds(entryIds(payload.orderSignals, 'skuId'), 'SENA order signals must not contain duplicate SKU ids.');
  for (const signal of payload.orderSignals) {
    assertRecord(signal, 'SENA order signal entries must be objects.');
    assertNonEmptyString(signal.skuId, 'SENA order signal entries require a SKU id.');
    assertRequiredOptionalNonNegativeFiniteNumber(signal.approximateOrderQuantity, 'SENA order signal order quantity must be a non-negative finite number or null.');
    assertRequiredOptionalNonNegativeFiniteNumber(signal.approximateReceiptQuantity, 'SENA order signal receipt quantity must be a non-negative finite number or null.');
  }
  assertUniqueIds(entryIds(payload.servicePrices, 'serviceId'), 'SENA service price entries must not contain duplicate service ids.');
  for (const price of payload.servicePrices) {
    assertRecord(price, 'SENA service price entries must be objects.');
    assertNonEmptyString(price.serviceId, 'SENA service price entries require a service id.');
    assertNonNegativeFiniteNumber(price.price, 'SENA service price must be a non-negative finite number.');
  }
  assertUniqueIds(entryIds(payload.retailPrices, 'skuId'), 'SENA retail price entries must not contain duplicate SKU ids.');
  for (const price of payload.retailPrices) {
    assertRecord(price, 'SENA retail price entries must be objects.');
    assertNonEmptyString(price.skuId, 'SENA retail price entries require a SKU id.');
    assertNonNegativeFiniteNumber(price.price, 'SENA retail price must be a non-negative finite number.');
  }
  assertUniqueIds(entryIds(payload.leadTimeHints, 'skuId'), 'SENA lead time hints must not contain duplicate SKU ids.');
  for (const hint of payload.leadTimeHints) {
    assertRecord(hint, 'SENA lead time hint entries must be objects.');
    assertNonEmptyString(hint.skuId, 'SENA lead time hint entries require a SKU id.');
    assertRequiredOptionalNonNegativeFiniteNumber(hint.typicalDays, 'SENA lead time typical days must be a non-negative finite number or null.');
    assertRequiredOptionalNonNegativeFiniteNumber(hint.lowDays, 'SENA lead time low days must be a non-negative finite number or null.');
    assertRequiredOptionalNonNegativeFiniteNumber(hint.highDays, 'SENA lead time high days must be a non-negative finite number or null.');
  }
  for (const adjustment of payload.adjustmentSignals ?? []) {
    assertRecord(adjustment, 'SENA adjustment signal entries must be objects.');
    assertNonEmptyString(adjustment.skuId, 'SENA adjustment signal entries require a SKU id.');
    assertFiniteNumber(adjustment.quantityDelta, 'SENA adjustment signal quantity must be a finite number.');
  }
  for (const event of payload.commercialEvents ?? []) {
    assertRecord(event, 'SENA commercial event entries must be objects.');
    assertEnum(event.party, SENA_COMMERCIAL_PARTIES, 'SENA commercial event requires a supported party.');
    assertEnum(event.entityType, SENA_COMMERCIAL_ENTITY_TYPES, 'SENA commercial event requires a supported entity type.');
    assertNonEmptyString(event.entityId, 'SENA commercial event requires an entity id.');
    assertEnum(event.stage, SENA_COMMERCIAL_STAGES, 'SENA commercial event requires a supported stage.');
    assertEnum(event.flow, SENA_COMMERCIAL_FLOWS, 'SENA commercial event requires a supported flow.');
    assertFiniteNumber(event.quantityDelta, 'SENA commercial event quantity must be a finite number.');
  }
  assertUniqueIds(entryIds(payload.ticketEvents ?? [], 'ticketId'), 'SENA ticket events must not contain duplicate ticket ids.');
  for (const ticket of payload.ticketEvents ?? []) {
    assertRecord(ticket, 'SENA ticket event entries must be objects.');
    assertNonEmptyString(ticket.ticketId, 'SENA ticket event entries require a ticket id.');
    assertEnum(ticket.ticketFamily, SENA_TICKET_FAMILIES, 'SENA ticket event requires a supported ticket family.');
    assertEnum(ticket.lifecycle, SENA_TICKET_LIFECYCLES, 'SENA ticket event requires a supported lifecycle.');
    assertEnum(ticket.stage, SENA_TICKET_STAGES, 'SENA ticket event requires a supported stage.');
    assertNonNegativeSafeInteger(ticket.revision, 'SENA ticket event revision must be a non-negative integer.');
    assertEnum(ticket.eventType, SENA_TICKET_EVENT_TYPES, 'SENA ticket event requires a supported event type.');
    assertNonEmptyString(ticket.occurredAt, 'SENA ticket event requires an occurred timestamp.');
    assertIsoTimestamp(ticket.occurredAt.trim(), 'SENA ticket event occurred timestamp must be an ISO timestamp.');
    const nextTouchAt = normalizeOptionalTrimmedString(ticket.nextTouchAt);
    if (nextTouchAt !== undefined) {
      assertIsoTimestamp(nextTouchAt, 'SENA ticket event next touch timestamp must be an ISO timestamp or null.');
    }
    assertArray(ticket.lines, 'SENA ticket event requires line entries.');
    for (const line of ticket.lines) {
      assertRecord(line, 'SENA ticket line entries must be objects.');
      assertEnum(line.entityType, SENA_COMMERCIAL_ENTITY_TYPES, 'SENA ticket line requires a supported entity type.');
      assertNonEmptyString(line.entityId, 'SENA ticket line requires an entity id.');
      if (line.quantityDelta !== undefined && line.quantityDelta !== null) {
        assertFiniteNumber(line.quantityDelta, 'SENA ticket line quantity delta must be a finite number or null.');
      }
      assertOptionalNonNegativeFiniteNumber(line.orderedQuantity, 'SENA ticket line ordered quantity must be a non-negative finite number or null.');
      assertOptionalNonNegativeFiniteNumber(line.receivedQuantity, 'SENA ticket line received quantity must be a non-negative finite number or null.');
      assertOptionalNonNegativeFiniteNumber(line.unitCost, 'SENA ticket line unit cost must be a non-negative finite number or null.');
      const promisedAt = normalizeOptionalTrimmedString(line.promisedAt);
      if (promisedAt !== undefined) {
        assertIsoTimestamp(promisedAt, 'SENA ticket line promised timestamp must be an ISO timestamp or null.');
      }
      const expectedArrivalAt = normalizeOptionalTrimmedString(line.expectedArrivalAt);
      if (expectedArrivalAt !== undefined) {
        assertIsoTimestamp(expectedArrivalAt, 'SENA ticket line expected arrival timestamp must be an ISO timestamp or null.');
      }
    }
    validateSenaDeliveryFeeMetadata(ticket.deliveryFee);
    validateSenaDiscountMetadata(ticket.discount);
  }
  for (const hint of payload.recipeUsageHints ?? []) {
    assertRecord(hint, 'SENA recipe usage hint entries must be objects.');
    assertNonEmptyString(hint.serviceId, 'SENA recipe usage hint entries require a service id.');
    assertNonEmptyString(hint.skuId, 'SENA recipe usage hint entries require a SKU id.');
    assertRequiredOptionalNonNegativeFiniteNumber(hint.typicalUnitsPerInstance, 'SENA recipe usage hint units must be a non-negative finite number or null.');
    assertRequiredOptionalNonNegativeFiniteNumber(hint.usageProbability, 'SENA recipe usage hint probability must be a non-negative finite number or null.');
    assertRequiredOptionalNonNegativeFiniteNumber(hint.variability, 'SENA recipe usage hint variability must be a non-negative finite number or null.');
  }
  validateSenaDeliveryFeeMetadata(payload.deliveryFee);
  validateSenaDiscountMetadata(payload.discount);
}

export function normalizeSenaCatalogPayload(payload: SenaCatalog): SenaCatalog {
  assertRecord(payload, 'SENA catalog upsert must be an object.');
  assertArray(payload.skus, 'SENA catalog upsert requires SKU entries.');
  assertArray(payload.services, 'SENA catalog upsert requires service entries.');
  assertArray(payload.bundles, 'SENA catalog upsert requires bundle entries.');
  assertArray(payload.sharingMask, 'SENA catalog upsert requires sharing mask entries.');
  assertUniqueIds(entryIds(payload.skus, 'skuId'), 'SENA catalog upsert must not contain duplicate SKU ids.');
  assertUniqueIds(entryIds(payload.services, 'serviceId'), 'SENA catalog upsert must not contain duplicate service ids.');
  assertUniquePairs(payload.sharingMask, 'serviceId', 'skuId', 'SENA catalog upsert must not contain duplicate service/SKU links.');
  for (const sku of payload.skus) {
    assertRecord(sku, 'SENA catalog SKU entries must be objects.');
    assertNonEmptyString(sku.skuId, 'SENA catalog SKU entries require a SKU id.');
    assertNonEmptyString(sku.name, 'SENA catalog SKU entries require a name.');
    assertNonNegativeFiniteNumber(sku.costPerUnit, 'SENA catalog SKU cost must be a non-negative finite number.');
    assertRequiredOptionalNonNegativeFiniteNumber(sku.productPrice, 'SENA catalog SKU product price must be a non-negative finite number or null.');
    assertRequiredOptionalNonNegativeFiniteNumber(sku.leadTimeMeanDaysHint, 'SENA catalog SKU lead time mean must be a non-negative finite number or null.');
    assertRequiredOptionalNonNegativeFiniteNumber(sku.leadTimeStdDaysHint, 'SENA catalog SKU lead time uncertainty must be a non-negative finite number or null.');
    assertBoolean(sku.archived, 'SENA catalog SKU archived flag must be a boolean.');
    assertBoolean(sku.soldAsProduct, 'SENA catalog SKU sold-as-product flag must be a boolean.');
  }
  for (const service of payload.services) {
    assertRecord(service, 'SENA catalog service entries must be objects.');
    assertNonEmptyString(service.serviceId, 'SENA catalog service entries require a service id.');
    assertNonEmptyString(service.name, 'SENA catalog service entries require a name.');
    assertNonNegativeFiniteNumber(service.price, 'SENA catalog service price must be a non-negative finite number.');
    assertBoolean(service.archived, 'SENA catalog service archived flag must be a boolean.');
    assertBoolean(service.bundle, 'SENA catalog service bundle flag must be a boolean.');
  }
  for (const bundle of payload.bundles) {
    assertRecord(bundle, 'SENA catalog bundle entries must be objects.');
    assertNonEmptyString(bundle.bundleId, 'SENA catalog bundle entries require a bundle id.');
    assertNonEmptyString(bundle.serviceId, 'SENA catalog bundle entries require a service id.');
    assertNonEmptyString(bundle.name, 'SENA catalog bundle entries require a name.');
  }
  for (const entry of payload.sharingMask) {
    assertRecord(entry, 'SENA catalog sharing mask entries must be objects.');
    assertNonEmptyString(entry.serviceId, 'SENA catalog sharing mask entries require a service id.');
    assertNonEmptyString(entry.skuId, 'SENA catalog sharing mask entries require a SKU id.');
    assertBoolean(entry.enabled, 'SENA catalog sharing mask enabled flag must be a boolean.');
    assertRequiredOptionalProbability(entry.usageProbability, 'SENA catalog sharing mask usage probability must be between 0 and 1 or null.');
  }
  return {
    ...payload,
    skus: payload.skus.map((sku) => ({ ...sku, skuId: sku.skuId.trim() })),
    services: payload.services.map((service) => ({ ...service, serviceId: service.serviceId.trim() })),
    bundles: payload.bundles.map((bundle) => ({
      ...bundle,
      bundleId: bundle.bundleId.trim(),
      serviceId: bundle.serviceId.trim(),
    })),
    sharingMask: payload.sharingMask.map((entry) => ({
      ...entry,
      serviceId: entry.serviceId.trim(),
      skuId: entry.skuId.trim(),
    })),
  };
}

export function normalizeSenaObservationInputPayload(payload: SenaObservationInput): SenaObservationInput {
  assertRecord(payload, 'SENA observation input must be an object.');
  assertNonEmptyString(payload.observedAt, 'SENA observation input requires an observed timestamp.');
  const observedAt = payload.observedAt.trim();
  assertIsoTimestamp(observedAt, 'SENA observation input observed timestamp must be an ISO timestamp.');
  assertArray(payload.stockSnapshot, 'SENA observation input requires stock snapshot entries.');
  assertArray(payload.serviceRankings, 'SENA observation input requires service rankings.');
  assertArray(payload.retailRankings, 'SENA observation input requires retail rankings.');
  assertArray(payload.serviceStockouts, 'SENA observation input requires service stockouts.');
  assertArray(payload.retailStockouts, 'SENA observation input requires retail stockouts.');
  assertArray(payload.orderSignals, 'SENA observation input requires order signals.');
  assertArray(payload.servicePrices, 'SENA observation input requires service price entries.');
  assertArray(payload.retailPrices, 'SENA observation input requires retail price entries.');
  assertArray(payload.leadTimeHints, 'SENA observation input requires lead time hints.');
  if (payload.retailSalesSnapshot !== undefined) {
    assertArray(payload.retailSalesSnapshot, 'SENA observation input retail sales snapshot must be an array.');
  }
  if (payload.serviceSalesSnapshot !== undefined) {
    assertArray(payload.serviceSalesSnapshot, 'SENA observation input service sales snapshot must be an array.');
  }
  if (payload.adjustmentSignals !== undefined) {
    assertArray(payload.adjustmentSignals, 'SENA observation input adjustment signals must be an array.');
  }
  if (payload.commercialEvents !== undefined) {
    assertArray(payload.commercialEvents, 'SENA observation input commercial events must be an array.');
  }
  if (payload.ticketEvents !== undefined) {
    assertArray(payload.ticketEvents, 'SENA observation input ticket events must be an array.');
  }
  if (payload.recipeUsageHints !== undefined) {
    assertArray(payload.recipeUsageHints, 'SENA observation input recipe usage hints must be an array.');
  }
  if (payload.notes !== null && typeof payload.notes !== 'string') {
    throw new Error('SENA observation input notes must be a string or null.');
  }
  validateSenaObservationInputEntries(payload);
  return {
    ...payload,
    observedAt,
    stockSnapshot: payload.stockSnapshot.map((entry) => ({ ...entry, skuId: entry.skuId.trim() })),
    retailSalesSnapshot: payload.retailSalesSnapshot?.map((entry) => ({ ...entry, skuId: entry.skuId.trim() })),
    serviceSalesSnapshot: payload.serviceSalesSnapshot?.map((entry) => ({ ...entry, serviceId: entry.serviceId.trim() })),
    serviceRankings: normalizeStringArrayIds(payload.serviceRankings),
    retailRankings: normalizeStringArrayIds(payload.retailRankings),
    serviceStockouts: normalizeStringArrayIds(payload.serviceStockouts),
    retailStockouts: normalizeStringArrayIds(payload.retailStockouts),
    orderSignals: payload.orderSignals.map((entry) => ({ ...entry, skuId: entry.skuId.trim() })),
    servicePrices: payload.servicePrices.map((entry) => ({ ...entry, serviceId: entry.serviceId.trim() })),
    retailPrices: payload.retailPrices.map((entry) => ({ ...entry, skuId: entry.skuId.trim() })),
    leadTimeHints: payload.leadTimeHints.map((entry) => ({ ...entry, skuId: entry.skuId.trim() })),
    adjustmentSignals: payload.adjustmentSignals?.map((entry) => ({ ...entry, skuId: entry.skuId.trim() })),
    commercialEvents: payload.commercialEvents?.map((entry) => ({ ...entry, entityId: entry.entityId.trim() })),
    ticketEvents: payload.ticketEvents?.map((entry) => ({
      ...entry,
      ticketId: entry.ticketId.trim(),
      occurredAt: entry.occurredAt.trim(),
      nextTouchAt: normalizeOptionalStringValue(entry.nextTouchAt) as typeof entry.nextTouchAt,
      lines: entry.lines.map((line) => ({
        ...line,
        entityId: line.entityId.trim(),
        expectedArrivalAt: normalizeOptionalStringValue(line.expectedArrivalAt) as typeof line.expectedArrivalAt,
        promisedAt: normalizeOptionalStringValue(line.promisedAt) as typeof line.promisedAt,
      })),
    })),
    recipeUsageHints: payload.recipeUsageHints?.map((entry) => ({
      ...entry,
      serviceId: entry.serviceId.trim(),
      skuId: entry.skuId.trim(),
    })),
    notes: payload.notes?.trim() || null,
  };
}

function normalizeOptionalStringValue(value: unknown) {
  return typeof value === 'string' ? value.trim() || null : value;
}

function normalizeOptionalIsoTimestampValue(value: unknown, message: string) {
  const normalized = normalizeOptionalStringValue(value);
  if (normalized != null) {
    if (typeof normalized !== 'string') {
      throw new Error(message);
    }
    assertIsoTimestamp(normalized, message);
  }
  return normalized;
}

function normalizeSenaOrderFieldPatch<T extends Partial<SenaOrderFieldValues> | undefined>(value: T): T {
  if (value == null) {
    return value;
  }
  assertRecord(value, 'SENA order fields must be an object.');
  const normalized = {
    ...value,
  };
  if (Object.hasOwn(value, 'supplierName')) {
    normalized.supplierName = normalizeOptionalStringValue(value.supplierName) as SenaOrderFieldValues['supplierName'];
  }
  if (Object.hasOwn(value, 'supplierNote')) {
    normalized.supplierNote = normalizeOptionalStringValue(value.supplierNote) as SenaOrderFieldValues['supplierNote'];
  }
  if (Object.hasOwn(value, 'expectedArrivalAt')) {
    normalized.expectedArrivalAt = normalizeOptionalIsoTimestampValue(
      value.expectedArrivalAt,
      'SENA order expected arrival timestamp must be an ISO timestamp or null.',
    ) as SenaOrderFieldValues['expectedArrivalAt'];
  }
  if (Object.hasOwn(value, 'placementTimestamp')) {
    normalized.placementTimestamp = normalizeOptionalIsoTimestampValue(
      value.placementTimestamp,
      'SENA order placement timestamp must be an ISO timestamp or null.',
    ) as SenaOrderFieldValues['placementTimestamp'];
  }
  if (Object.hasOwn(value, 'receiptTimestamp')) {
    normalized.receiptTimestamp = normalizeOptionalIsoTimestampValue(
      value.receiptTimestamp,
      'SENA order receipt timestamp must be an ISO timestamp or null.',
    ) as SenaOrderFieldValues['receiptTimestamp'];
  }
  if (Object.hasOwn(value, 'orderedQuantity')) {
    assertOptionalNonNegativeFiniteNumber(value.orderedQuantity, 'SENA order ordered quantity must be a non-negative finite number or null.');
  }
  if (Object.hasOwn(value, 'receivedQuantity')) {
    assertOptionalNonNegativeFiniteNumber(value.receivedQuantity, 'SENA order received quantity must be a non-negative finite number or null.');
  }
  if (Object.hasOwn(value, 'costPerUnit')) {
    assertOptionalNonNegativeFiniteNumber(value.costPerUnit, 'SENA order cost per unit must be a non-negative finite number or null.');
  }
  if (Object.hasOwn(value, 'leadTimeDaysHint')) {
    assertOptionalNonNegativeFiniteNumber(value.leadTimeDaysHint, 'SENA order lead time days hint must be a non-negative finite number or null.');
  }
  if (Object.hasOwn(value, 'leadTimeVariability')) {
    assertOptionalEnum(
      value.leadTimeVariability,
      SENA_LEAD_TIME_VARIABILITY_CLASSES,
      'SENA order lead time variability requires a supported value.',
    );
  }
  if (Object.hasOwn(value, 'deliveryFee')) {
    validateSenaDeliveryFeeMetadata(value.deliveryFee);
  }
  if (Object.hasOwn(value, 'discount')) {
    validateSenaDiscountMetadata(value.discount);
  }
  return normalized as T;
}

export function normalizeSenaCreateOrderBatchPayload(
  payload: SenaCreateOrderBatchPayload,
): SenaCreateOrderBatchPayload {
  assertRecord(payload, 'SENA order batch create must be an object.');
  assertRecord(payload.shared, 'SENA order batch create requires shared fields.');
  assertArray(payload.children, 'SENA order batch create requires child entries.');
  return {
    ...payload,
    supplierName: normalizeOptionalStringValue(payload.supplierName) as SenaCreateOrderBatchPayload['supplierName'],
    shared: normalizeSenaOrderFieldPatch(payload.shared),
    children: payload.children.map((child) => {
      assertRecord(child, 'SENA order batch create child must be an object.');
      assertNonEmptyString(child.skuId, 'SENA order batch create child requires a SKU id.');
      return {
        ...child,
        skuId: child.skuId.trim(),
        overrides: normalizeSenaOrderFieldPatch(child.overrides),
      };
    }),
  };
}

export function normalizeSenaUpdateOrderBatchPayload(
  payload: SenaUpdateOrderBatchPayload,
): SenaUpdateOrderBatchPayload {
  assertRecord(payload, 'SENA order batch update must be an object.');
  assertNonEmptyString(payload.batchOrderId, 'SENA order batch update requires a batch order id.');
  assertOptionalEnum(payload.status, SENA_ORDER_BATCH_STATUSES, 'SENA order batch update requires a supported status.');
  return {
    ...payload,
    batchOrderId: payload.batchOrderId.trim(),
    supplierName: normalizeOptionalStringValue(payload.supplierName) as SenaUpdateOrderBatchPayload['supplierName'],
    shared: normalizeSenaOrderFieldPatch(payload.shared),
  };
}

export function normalizeSenaUpdateOrderChildPayload(
  payload: SenaUpdateOrderChildPayload,
): SenaUpdateOrderChildPayload {
  assertRecord(payload, 'SENA order child update must be an object.');
  assertNonEmptyString(payload.childOrderId, 'SENA order child update requires a child order id.');
  assertOptionalEnum(payload.status, SENA_ORDER_CHILD_STATUSES, 'SENA order child update requires a supported status.');
  return {
    ...payload,
    childOrderId: payload.childOrderId.trim(),
    skuId: normalizeOptionalStringValue(payload.skuId) as SenaUpdateOrderChildPayload['skuId'],
    overrides: normalizeSenaOrderFieldPatch(payload.overrides),
    appendSupplierNote: normalizeOptionalStringValue(payload.appendSupplierNote) as SenaUpdateOrderChildPayload['appendSupplierNote'],
  };
}

export function normalizeSenaSplitOrderChildPayload(
  payload: SenaSplitOrderChildPayload,
): SenaSplitOrderChildPayload {
  assertRecord(payload, 'SENA order child split must be an object.');
  assertNonEmptyString(payload.childOrderId, 'SENA order child split requires a child order id.');
  return {
    childOrderId: payload.childOrderId.trim(),
  };
}

export function normalizeSenaObservationDeletePayload(payload: SenaObservationDeletePayload): SenaObservationDeletePayload {
  assertRecord(payload, 'SENA observation delete must be an object.');
  assertNonEmptyString(payload.observationId, 'SENA observation delete requires an observation id.');
  return {
    observationId: payload.observationId.trim(),
  };
}

export function normalizeSenaRunLookupPayload(payload: SenaRunLookupPayload): SenaRunLookupPayload {
  assertRecord(payload, 'SENA run lookup must be an object.');
  assertNonEmptyString(payload.runId, 'SENA run lookup requires a run id.');
  return {
    runId: payload.runId.trim(),
  };
}

export function normalizeSenaTriggerRunPayload(payload?: SenaTriggerRunPayload): SenaTriggerRunPayload | undefined {
  if (payload === undefined || payload === null) {
    return undefined;
  }
  assertRecord(payload, 'SENA trigger run payload must be an object.');
  const algorithmVersion =
    typeof payload.algorithmVersion === 'string' && payload.algorithmVersion.trim().length > 0
      ? payload.algorithmVersion.trim()
      : undefined;
  const parameters = payload.parameters === undefined
    ? undefined
    : normalizeSenaEngineParameters(
        payload.parameters as Parameters<typeof normalizeSenaEngineParameters>[0],
      );
  return {
    ...(algorithmVersion ? { algorithmVersion } : {}),
    ...(parameters ? { parameters } : {}),
  };
}

export function normalizeSenaDetailCacheClearPayload(payload: SenaDetailCacheClearPayload): SenaDetailCacheClearPayload {
  assertRecord(payload, 'SENA detail cache clear must be an object.');
  if (payload.entityType !== 'sku' && payload.entityType !== 'service') {
    throw new Error('SENA detail cache clear requires a supported entity type.');
  }
  assertNonEmptyString(payload.entityId, 'SENA detail cache clear requires an entity id.');
  return {
    entityType: payload.entityType,
    entityId: payload.entityId.trim(),
  };
}
