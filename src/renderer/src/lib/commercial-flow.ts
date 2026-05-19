import type { SenaCatalog, SenaCommercialEntityType, SenaCommercialEvent, SenaCommercialParty, SenaObservationRecord } from '@shared/sena';
import { linkedSkuIdsForService } from '@/lib/sena-catalog';

export type CommercialEntityKey = `${SenaCommercialEntityType}:${string}`;

export interface CommercialEntitySnapshot {
  entityType: SenaCommercialEntityType;
  entityId: string;
  pendingQuantity: number;
  realizedWindowQuantity: number;
  reversalWindowQuantity: number;
  canceledWindowQuantity: number;
  latestObservedAt: string | null;
  oldestOpenPendingAt: string | null;
}

export interface CommercialSkuSnapshot extends CommercialEntitySnapshot {
  blockedPendingQuantity: number;
}

export interface CommercialServiceSnapshot extends CommercialEntitySnapshot {
  blockedPendingQuantity: number;
  bottleneckSkuId: string | null;
}

function entityKey(entityType: SenaCommercialEntityType, entityId: string): CommercialEntityKey {
  return `${entityType}:${entityId}`;
}

function observationTime(value: string) {
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function normalizeCommercialEvents(observation: SenaObservationRecord) {
  return observation.input.commercialEvents ?? [];
}

function latestObservationTime(observations: SenaObservationRecord[]) {
  let latestTime = Number.NEGATIVE_INFINITY;
  for (const observation of observations) {
    latestTime = Math.max(latestTime, observationTime(observation.input.observedAt));
  }
  return Number.isFinite(latestTime) ? latestTime : observationTime(new Date().toISOString());
}

export function filterObservationsForDays(
  observations: SenaObservationRecord[],
  rangeDays: number,
  endAt?: string | null,
) {
  if (rangeDays <= 0) {
    return [];
  }
  const endTime = endAt ? observationTime(endAt) : latestObservationTime(observations);
  const startTime = endTime - rangeDays * 24 * 60 * 60 * 1000;
  return observations.filter((observation) => {
    const observedAt = observationTime(observation.input.observedAt);
    return observedAt <= endTime && observedAt > startTime;
  });
}

export function latestStockUnitsBySku(observations: SenaObservationRecord[]) {
  const ordered = [...observations].sort(
    (left, right) => observationTime(right.input.observedAt) - observationTime(left.input.observedAt),
  );
  const map = new Map<string, number>();
  for (const observation of ordered) {
    for (const snapshot of observation.input.stockSnapshot) {
      if (!map.has(snapshot.skuId)) {
        map.set(snapshot.skuId, snapshot.unitsInStock);
      }
    }
  }
  return map;
}

export function buildCommercialEntitySnapshots({
  observations,
  party,
  rangeDays,
  endAt,
}: {
  observations: SenaObservationRecord[];
  party: SenaCommercialParty;
  rangeDays: number;
  endAt?: string | null;
}) {
  const latestObservedAtByEntity = new Map<CommercialEntityKey, string>();
  const oldestOpenPendingAtByEntity = new Map<CommercialEntityKey, string>();
  const pendingQuantityByEntity = new Map<CommercialEntityKey, number>();
  const realizedWindowQuantityByEntity = new Map<CommercialEntityKey, number>();
  const reversalWindowQuantityByEntity = new Map<CommercialEntityKey, number>();
  const canceledWindowQuantityByEntity = new Map<CommercialEntityKey, number>();
  const recentObservations = filterObservationsForDays(observations, rangeDays, endAt);
  const ordered = [...observations].sort(
    (left, right) => observationTime(left.input.observedAt) - observationTime(right.input.observedAt),
  );

  for (const observation of ordered) {
    for (const event of normalizeCommercialEvents(observation)) {
      if (event.party !== party) {
        continue;
      }
      const key = entityKey(event.entityType, event.entityId);
      const previousPendingQuantity = pendingQuantityByEntity.get(key) ?? 0;
      const nextPendingQuantity = previousPendingQuantity + (event.stage === 'pending' ? event.quantityDelta : 0);
      pendingQuantityByEntity.set(key, nextPendingQuantity);
      if (event.stage === 'pending') {
        if (previousPendingQuantity <= 0 && nextPendingQuantity > 0 && event.quantityDelta > 0) {
          oldestOpenPendingAtByEntity.set(key, observation.input.observedAt);
        }
        if (nextPendingQuantity <= 0) {
          oldestOpenPendingAtByEntity.delete(key);
        }
      }
      latestObservedAtByEntity.set(key, observation.input.observedAt);
    }
  }

  for (const observation of recentObservations) {
    for (const event of normalizeCommercialEvents(observation)) {
      if (event.party !== party) {
        continue;
      }
      const key = entityKey(event.entityType, event.entityId);
      if (event.stage === 'realized') {
        if (event.quantityDelta >= 0) {
          realizedWindowQuantityByEntity.set(
            key,
            (realizedWindowQuantityByEntity.get(key) ?? 0) + event.quantityDelta,
          );
        } else {
          reversalWindowQuantityByEntity.set(
            key,
            (reversalWindowQuantityByEntity.get(key) ?? 0) + Math.abs(event.quantityDelta),
          );
        }
      }
      if (event.stage === 'pending' && event.quantityDelta < 0) {
        canceledWindowQuantityByEntity.set(
          key,
          (canceledWindowQuantityByEntity.get(key) ?? 0) + Math.abs(event.quantityDelta),
        );
      }
    }
  }

  return {
    latestObservedAtByEntity,
    oldestOpenPendingAtByEntity,
    pendingQuantityByEntity,
    realizedWindowQuantityByEntity,
    reversalWindowQuantityByEntity,
    canceledWindowQuantityByEntity,
  };
}

export function buildSkuCommercialSnapshots({
  observations,
  rangeDays,
  endAt,
}: {
  observations: SenaObservationRecord[];
  rangeDays: number;
  endAt?: string | null;
}) {
  const customer = buildCommercialEntitySnapshots({ observations, party: 'customer', rangeDays, endAt });
  const latestStockBySku = latestStockUnitsBySku(observations);
  const result = new Map<string, CommercialSkuSnapshot>();

  for (const [key, pendingQuantity] of customer.pendingQuantityByEntity) {
    if (!key.startsWith('sku:')) {
      continue;
    }
    const skuId = key.slice(4);
    const onHand = latestStockBySku.get(skuId) ?? 0;
    result.set(skuId, {
      entityType: 'sku',
      entityId: skuId,
      pendingQuantity,
      realizedWindowQuantity: customer.realizedWindowQuantityByEntity.get(key) ?? 0,
      reversalWindowQuantity: customer.reversalWindowQuantityByEntity.get(key) ?? 0,
      canceledWindowQuantity: customer.canceledWindowQuantityByEntity.get(key) ?? 0,
      latestObservedAt: customer.latestObservedAtByEntity.get(key) ?? null,
      oldestOpenPendingAt: customer.oldestOpenPendingAtByEntity.get(key) ?? null,
      blockedPendingQuantity: Math.max(0, pendingQuantity - onHand),
    });
  }

  return result;
}

export function buildServiceCommercialSnapshots({
  catalog,
  observations,
  rangeDays,
  endAt,
}: {
  catalog: SenaCatalog;
  observations: SenaObservationRecord[];
  rangeDays: number;
  endAt?: string | null;
}) {
  const customer = buildCommercialEntitySnapshots({ observations, party: 'customer', rangeDays, endAt });
  const latestStockBySku = latestStockUnitsBySku(observations);
  const result = new Map<string, CommercialServiceSnapshot>();

  for (const [key, pendingQuantity] of customer.pendingQuantityByEntity) {
    if (!key.startsWith('service:')) {
      continue;
    }
    const serviceId = key.slice(8);
    const linkedSkuIds = linkedSkuIdsForService(catalog, serviceId);
    let blockedPendingQuantity = 0;
    let bottleneckSkuId: string | null = null;
    if (linkedSkuIds.length > 0 && pendingQuantity > 0) {
      const lowestStockEntry = linkedSkuIds
        .map((skuId) => ({ skuId, units: latestStockBySku.get(skuId) ?? 0 }))
        .sort((left, right) => left.units - right.units)[0] ?? null;
      bottleneckSkuId = lowestStockEntry?.skuId ?? null;
      blockedPendingQuantity = lowestStockEntry && lowestStockEntry.units <= 0 ? pendingQuantity : 0;
    }
    result.set(serviceId, {
      entityType: 'service',
      entityId: serviceId,
      pendingQuantity,
      realizedWindowQuantity: customer.realizedWindowQuantityByEntity.get(key) ?? 0,
      reversalWindowQuantity: customer.reversalWindowQuantityByEntity.get(key) ?? 0,
      canceledWindowQuantity: customer.canceledWindowQuantityByEntity.get(key) ?? 0,
      latestObservedAt: customer.latestObservedAtByEntity.get(key) ?? null,
      oldestOpenPendingAt: customer.oldestOpenPendingAtByEntity.get(key) ?? null,
      blockedPendingQuantity,
      bottleneckSkuId,
    });
  }

  return result;
}

export function commercialEventsForObservation(observation: SenaObservationRecord) {
  return normalizeCommercialEvents(observation);
}

export function observationCommercialSummary(events: SenaCommercialEvent[]) {
  return {
    customerPending: events.filter((event) => event.party === 'customer' && event.stage === 'pending').length,
    customerCompleted: events.filter((event) => event.party === 'customer' && event.stage === 'realized' && event.quantityDelta > 0).length,
    customerRefunded: events.filter((event) => event.party === 'customer' && event.stage === 'realized' && event.quantityDelta < 0).length,
    supplierPending: events.filter((event) => event.party === 'supplier' && event.stage === 'pending').length,
    supplierReceived: events.filter((event) => event.party === 'supplier' && event.stage === 'realized' && event.quantityDelta > 0).length,
    supplierReversed: events.filter((event) => event.party === 'supplier' && event.stage === 'realized' && event.quantityDelta < 0).length,
  };
}
