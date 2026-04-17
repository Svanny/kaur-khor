import type { UTCTimestamp } from 'lightweight-charts';
import type { TradingChartModel, TradingChartPoint } from '@/components/system/trading-chart/model';
import type { ServiceDetailViewModel } from './view-model';

function parseTimestampSeconds(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    return null;
  }
  return Math.floor(timestamp / 1000);
}

function syntheticTimestamp(order: number) {
  return 1_577_836_800 + order * 86_400;
}

function orderedTimestamp(interval: ServiceDetailViewModel['intervals'][number], order: number) {
  return (parseTimestampSeconds(interval.endAt) ?? parseTimestampSeconds(interval.endAt) ?? syntheticTimestamp(order)) as UTCTimestamp;
}

export function deriveServiceTradingChartModel(model: ServiceDetailViewModel): TradingChartModel {
  const points: TradingChartPoint[] = model.intervals.map((interval, index) => ({
    intervalIndex: interval.intervalIndex,
    startAt: null,
    endAt: interval.endAt,
    time: orderedTimestamp(interval, index),
    label: interval.label,
    inventoryMean: null,
    inventoryLow: null,
    inventoryHigh: null,
    reorderPoint: null,
    safetyStock: null,
    serviceDemandMean: interval.demandValue,
    retailDemandMean: 0,
    availableCapacity: interval.sellableValue,
    demandMinusAvailableCapacity: interval.sellableValue - interval.demandValue,
    receiptsMean: null,
    adjustmentsMean: null,
    ordersInTransitMean: null,
    ordersLateMean: null,
    ordersReadyToReceiveMean: null,
    ordersReceivedMean: null,
    newOrderFlag: null,
    newReceiptFlag: null,
    price: interval.priceValue,
    leadTimeMean: null,
    leadTimeLow: null,
    leadTimeHigh: null,
    dominantRegime: interval.regimeKey,
  }));

  return {
    points,
    pointByIntervalIndex: new Map(points.map((point) => [point.intervalIndex, point])),
    pointByTimeKey: new Map(points.map((point) => [String(point.time), point])),
    availability: {
      inventory: false,
      uncertainty: false,
      reorderPoint: false,
      safetyStock: false,
      demand: points.some((point) => point.serviceDemandMean != null),
      serviceDemand: false,
      retailDemand: false,
      availableCapacity: points.some((point) => point.availableCapacity != null),
      demandMinusAvailableCapacity: points.some((point) => point.demandMinusAvailableCapacity != null),
      receipts: false,
      ordersInTransit: false,
      ordersLate: false,
      ordersReadyToReceive: false,
      ordersReceived: false,
      newOrderFlags: false,
      newReceiptFlags: false,
      price: points.some((point) => point.price != null),
      leadTime: false,
      leadTimeRange: false,
      regime: points.some((point) => point.dominantRegime != null),
    },
  };
}
