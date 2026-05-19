import type { InventorySnapshot } from '@shared/inventory';
import type { SenaCatalog, SenaObservationInput, SenaRecordUpdateContext } from '@shared/sena';

type StockFallback = {
  costPerUnit?: number | null;
  productPrice?: number | null;
  unitsInStock?: number | null;
};

function finiteNumberOrNull(value: number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function latestStockInput({
  catalog,
  fallback,
  recordUpdateContext,
  skuId,
  snapshot,
}: {
  catalog?: SenaCatalog | null;
  fallback?: StockFallback | null;
  recordUpdateContext?: SenaRecordUpdateContext | null;
  skuId: string;
  snapshot?: InventorySnapshot | null;
}) {
  const stockAnchor = recordUpdateContext?.latestStockBySku[skuId]?.value ?? null;
  const snapshotSku = snapshot?.skus.find((sku) => sku.skuId === skuId) ?? null;
  const catalogSku = catalog?.skus.find((sku) => sku.skuId === skuId) ?? null;
  return {
    costPerUnit:
      finiteNumberOrNull(stockAnchor?.costPerUnit) ??
      finiteNumberOrNull(snapshotSku?.costPerUnit) ??
      finiteNumberOrNull(fallback?.costPerUnit) ??
      finiteNumberOrNull(catalogSku?.costPerUnit),
    productPrice:
      finiteNumberOrNull(stockAnchor?.productPrice) ??
      finiteNumberOrNull(snapshotSku?.productPrice) ??
      finiteNumberOrNull(fallback?.productPrice) ??
      finiteNumberOrNull(catalogSku?.productPrice),
    unitsInStock:
      finiteNumberOrNull(stockAnchor?.unitsInStock) ??
      finiteNumberOrNull(snapshotSku?.unitsInStock) ??
      finiteNumberOrNull(fallback?.unitsInStock) ??
      0,
  };
}

export function stockSnapshotForTicketInventoryDeltas({
  catalog,
  deltasBySkuId,
  fallbacksBySkuId,
  recordUpdateContext,
  snapshot,
}: {
  catalog?: SenaCatalog | null;
  deltasBySkuId: Map<string, number>;
  fallbacksBySkuId?: Map<string, StockFallback>;
  recordUpdateContext?: SenaRecordUpdateContext | null;
  snapshot?: InventorySnapshot | null;
}): SenaObservationInput['stockSnapshot'] {
  return [...deltasBySkuId]
    .filter(([, delta]) => Number.isFinite(delta) && delta !== 0)
    .map(([skuId, delta]) => {
      const current = latestStockInput({
        catalog,
        fallback: fallbacksBySkuId?.get(skuId),
        recordUpdateContext,
        skuId,
        snapshot,
      });
      return {
        skuId,
        unitsInStock: Math.max(0, current.unitsInStock + delta),
        costPerUnit: current.costPerUnit,
        productPrice: current.productPrice,
      };
    });
}
