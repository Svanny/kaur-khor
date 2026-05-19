import type { AppLanguage } from '@shared/inventory';
import { translateUiLiteral } from '@/lib/translations';
import type { InventoryColumnKey } from './view-model';
import type { InventoryViewPresetValue } from '@/lib/navigation-state';

export const inventoryPresetColumns: Record<InventoryViewPresetValue, InventoryColumnKey[]> = {
  custom: ['item', 'onHand', 'cover', 'projection', 'pipeline', 'freshness'],
  flow: ['item', 'onHand', 'unitsIn', 'unitsOut', 'adjustments', 'receipts', 'lostDemand', 'inventoryPosition'],
  forecast: ['item', 'onHand', 'projection', 'stockoutRisk', 'demand'],
  health: ['item', 'onHand', 'cover', 'projection', 'pipeline', 'serviceExposure', 'freshness'],
  pipeline: ['item', 'onHand', 'inTransit', 'orderProbability', 'nextReceipt', 'leadTime', 'leadTimeUncertainty'],
};

export const inventoryCustomColumnOptions: InventoryColumnKey[] = [
  'onHand',
  'flow',
  'cover',
  'projection',
  'pipeline',
  'serviceExposure',
  'freshness',
  'stockoutRisk',
  'demand',
  'inTransit',
  'orderProbability',
];

export function inventoryColumnLabel(column: InventoryColumnKey, language: AppLanguage) {
  const labels: Record<InventoryColumnKey, string> = {
    adjustments: 'Adjustments',
    cover: 'Cover',
    demand: 'Demand/day',
    flow: 'Flow',
    freshness: 'Freshness',
    inTransit: 'In transit',
    inventoryPosition: 'Inventory position',
    item: 'Item',
    leadTime: 'Lead time mean',
    leadTimeUncertainty: 'Lead time uncertainty',
    lostDemand: 'Lost demand',
    nextReceipt: 'Next receipt',
    onHand: 'On hand',
    orderProbability: 'Order probability',
    pipeline: 'Pipeline',
    projection: 'Projection',
    receipts: 'Receipts',
    serviceExposure: 'Service exposure',
    stockoutRisk: 'Stockout risk',
    unitsIn: 'Units in',
    unitsOut: 'Units out',
  };
  return translateUiLiteral(language, labels[column]);
}

export function resolveInventoryColumns(
  preset: InventoryViewPresetValue,
  customColumns: string[],
): InventoryColumnKey[] {
  if (preset !== 'custom') {
    return inventoryPresetColumns[preset];
  }
  const validColumns = new Set<InventoryColumnKey>(inventoryCustomColumnOptions);
  const selectedColumns: InventoryColumnKey[] = [];
  for (const column of customColumns) {
    if (!validColumns.has(column as InventoryColumnKey) || selectedColumns.includes(column as InventoryColumnKey)) {
      continue;
    }
    selectedColumns.push(column as InventoryColumnKey);
  }
  return ['item', ...(selectedColumns.length > 0 ? selectedColumns : inventoryPresetColumns.custom.filter((column) => column !== 'item'))];
}
