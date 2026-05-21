import type { InventorySnapshot } from '@shared/inventory';
import type { SenaObservationInput, SenaService, SenaSku } from '@shared/sena';
import { deriveLeadTimeFromStdDays } from '@shared/sena-lead-time';
import { createEmptyObservationInput } from '../records/observation-payload';

function emptyCatalogEditObservation() {
  return createEmptyObservationInput({
    observedAt: new Date().toISOString(),
    notes: null,
  });
}

function hasCatalogEditObservationSignal(input: SenaObservationInput) {
  return (
    input.stockSnapshot.length > 0 ||
    input.retailPrices.length > 0 ||
    input.leadTimeHints.length > 0 ||
    input.servicePrices.length > 0
  );
}

export function buildSkuCatalogEditObservation({
  baseline,
  next,
  snapshot,
}: {
  baseline: SenaSku;
  next: SenaSku;
  snapshot: InventorySnapshot | null;
}) {
  const input = emptyCatalogEditObservation();

  if (baseline.costPerUnit !== next.costPerUnit) {
    const snapshotSku = snapshot?.skus.find((entry) => entry.skuId === next.skuId);
    input.stockSnapshot = [
      {
        skuId: next.skuId,
        unitsInStock: snapshotSku?.unitsInStock ?? 0,
        costPerUnit: next.costPerUnit,
        productPrice: next.productPrice,
      },
    ];
  }

  if (
    baseline.soldAsProduct &&
    next.soldAsProduct &&
    baseline.productPrice !== next.productPrice &&
    next.productPrice != null
  ) {
    input.retailPrices = [{ skuId: next.skuId, price: next.productPrice }];
  }

  if (
    baseline.leadTimeMeanDaysHint !== next.leadTimeMeanDaysHint ||
    baseline.leadTimeStdDaysHint !== next.leadTimeStdDaysHint
  ) {
    const leadTime = deriveLeadTimeFromStdDays(next.leadTimeMeanDaysHint, next.leadTimeStdDaysHint);
    input.leadTimeHints = [
      {
        skuId: next.skuId,
        typicalDays: next.leadTimeMeanDaysHint,
        lowDays: leadTime.lowDays,
        highDays: leadTime.highDays,
        variabilityClass: leadTime.variabilityClass,
      },
    ];
  }

  return hasCatalogEditObservationSignal(input) ? input : null;
}

export function buildServiceCatalogEditObservation({
  baseline,
  next,
}: {
  baseline: SenaService;
  next: SenaService;
}) {
  if (baseline.price === next.price) {
    return null;
  }

  const input = emptyCatalogEditObservation();
  input.servicePrices = [{ serviceId: next.serviceId, price: next.price }];
  return input;
}
