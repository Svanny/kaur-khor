import type { UTCTimestamp } from 'lightweight-charts';
import type { TradingChartModel, TradingChartPoint } from '@/components/system/trading-chart/model';
import type { AnalysisWorkbenchViewModel } from './analysis-view-model';

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

export function deriveAnalysisTradingChartModel(model: AnalysisWorkbenchViewModel): TradingChartModel {
  const inventoryByInterval = new Map(model.workbench.inventoryDemandLane.points.map((point) => [point.intervalIndex, point]));
  const leadTimeByInterval = new Map(model.workbench.leadTimeLane.points.map((point) => [point.intervalIndex, point]));
  const pipelineByInterval = new Map<number, {
    inTransitMean: number;
    ordersReceivedMean: number;
    newOrderFlag: number;
    newReceiptFlag: number;
  }>();

  for (const span of model.workbench.pipelineLane.spans) {
    const current = pipelineByInterval.get(span.intervalIndex) ?? {
      inTransitMean: 0,
      ordersReceivedMean: 0,
      newOrderFlag: 0,
      newReceiptFlag: 0,
    };
    current.inTransitMean += span.inTransitMean;
    current.ordersReceivedMean += span.receiptQuantityMean;
    pipelineByInterval.set(span.intervalIndex, current);
  }

  for (const marker of model.workbench.pipelineLane.markers) {
    const current = pipelineByInterval.get(marker.intervalIndex) ?? {
      inTransitMean: 0,
      ordersReceivedMean: 0,
      newOrderFlag: 0,
      newReceiptFlag: 0,
    };
    if (marker.kind === 'order') {
      current.newOrderFlag += 1;
    } else {
      current.newReceiptFlag += 1;
    }
    pipelineByInterval.set(marker.intervalIndex, current);
  }

  const points: TradingChartPoint[] = model.workbench.regimePriceLane.intervals.map((interval, index) => {
    const inventory = inventoryByInterval.get(interval.intervalIndex);
    const leadTime = leadTimeByInterval.get(interval.intervalIndex);
    const pipeline = pipelineByInterval.get(interval.intervalIndex);
    const time = (parseTimestampSeconds(interval.endAt) ?? parseTimestampSeconds(interval.startAt) ?? syntheticTimestamp(index)) as UTCTimestamp;
    return {
      intervalIndex: interval.intervalIndex,
      startAt: interval.startAt,
      endAt: interval.endAt,
      time,
      label: model.intervals[index]?.label ?? `Interval ${interval.intervalIndex + 1}`,
      inventoryMean: inventory?.inventoryMean ?? null,
      inventoryLow: inventory?.inventoryLow ?? null,
      inventoryHigh: inventory?.inventoryHigh ?? null,
      reorderPoint: null,
      safetyStock: null,
      serviceDemandMean: inventory?.serviceDemandMean ?? null,
      retailDemandMean: inventory?.retailDemandMean ?? null,
      availableCapacity: null,
      demandMinusAvailableCapacity: null,
      receiptsMean: inventory?.receiptsMean ?? null,
      adjustmentsMean: inventory?.adjustmentsMean ?? null,
      ordersInTransitMean: pipeline?.inTransitMean ?? null,
      ordersLateMean: null,
      ordersReadyToReceiveMean: null,
      ordersReceivedMean: pipeline?.ordersReceivedMean ?? null,
      newOrderFlag: pipeline?.newOrderFlag ?? null,
      newReceiptFlag: pipeline?.newReceiptFlag ?? null,
      price: interval.priceCueCount > 0 ? interval.priceCueCount : null,
      leadTimeMean: leadTime?.meanDays ?? null,
      leadTimeLow: leadTime?.lowDays ?? null,
      leadTimeHigh: leadTime?.highDays ?? null,
      dominantRegime: interval.regimeKey,
    };
  });

  return {
    points,
    pointByIntervalIndex: new Map(points.map((point) => [point.intervalIndex, point])),
    pointByTimeKey: new Map(points.map((point) => [String(point.time), point])),
    availability: {
      inventory: points.some((point) => point.inventoryMean != null),
      uncertainty: points.some((point) => point.inventoryLow != null && point.inventoryHigh != null),
      reorderPoint: false,
      safetyStock: false,
      demand: false,
      serviceDemand: points.some((point) => point.serviceDemandMean != null),
      retailDemand: points.some((point) => point.retailDemandMean != null),
      availableCapacity: false,
      demandMinusAvailableCapacity: false,
      receipts: points.some((point) => point.receiptsMean != null || point.adjustmentsMean != null),
      ordersInTransit: points.some((point) => point.ordersInTransitMean != null),
      ordersLate: false,
      ordersReadyToReceive: false,
      ordersReceived: points.some((point) => point.ordersReceivedMean != null),
      newOrderFlags: points.some((point) => (point.newOrderFlag ?? 0) > 0),
      newReceiptFlags: points.some((point) => (point.newReceiptFlag ?? 0) > 0),
      price: points.some((point) => point.price != null),
      leadTime: points.some((point) => point.leadTimeMean != null),
      leadTimeRange: points.some((point) => point.leadTimeLow != null && point.leadTimeHigh != null),
      regime: points.some((point) => point.dominantRegime != null),
    },
  };
}
