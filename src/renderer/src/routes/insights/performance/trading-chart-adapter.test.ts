import { describe, expect, test } from 'vitest';
import { deriveAnalysisTradingChartModel } from './trading-chart-adapter';
import type { AnalysisWorkbenchViewModel } from './analysis-view-model';

describe('deriveAnalysisTradingChartModel', () => {
  test('maps analysis workbench lanes into the shared trading chart model', () => {
    const model = {
      intervals: [
        {
          intervalIndex: 1,
          label: 'Interval 2',
        },
      ],
      workbench: {
        regimePriceLane: {
          intervals: [
            {
              intervalIndex: 1,
              intervalPosition: 0,
              startAt: '2026-04-01T00:00:00.000Z',
              endAt: '2026-04-02T00:00:00.000Z',
              regimeKey: 'spike',
              dominantRegime: 'Spike',
              priceCueCount: 3,
              stockoutCueCount: 1,
              cueSummary: '',
            },
          ],
        },
        inventoryDemandLane: {
          points: [
            {
              intervalIndex: 1,
              intervalPosition: 0,
              startAt: '2026-04-01T00:00:00.000Z',
              endAt: '2026-04-02T00:00:00.000Z',
              inventoryMean: 20,
              inventoryLow: 15,
              inventoryHigh: 25,
              serviceDemandMean: 7,
              retailDemandMean: 3,
              receiptsMean: 5,
              adjustmentsMean: 2,
              realizedConsumptionMean: 8,
            },
          ],
          maxFlowMagnitude: 10,
        },
        pipelineLane: {
          spans: [
            {
              key: 'span-1',
              intervalIndex: 1,
              intervalPosition: 0,
              startPosition: 0,
              endPosition: 0,
              row: 0,
              inTransitMean: 9,
              orderProbability: 0.7,
              orderQuantityMean: 4,
              receiptQuantityMean: 6,
              ageDaysMean: 2,
              leadTimeMeanDays: 5,
              overdue: false,
            },
          ],
          markers: [
            {
              key: 'order-1',
              intervalIndex: 1,
              intervalPosition: 0,
              row: 0,
              kind: 'supplier_order',
              quantityMean: 4,
            },
            {
              key: 'receipt-1',
              intervalIndex: 1,
              intervalPosition: 0,
              row: 0,
              kind: 'supplier_receipt',
              quantityMean: 6,
            },
          ],
          rowCount: 1,
        },
        leadTimeLane: {
          points: [
            {
              intervalIndex: 1,
              intervalPosition: 0,
              startAt: '2026-04-01T00:00:00.000Z',
              endAt: '2026-04-02T00:00:00.000Z',
              meanDays: 5,
              lowDays: 3,
              highDays: 8,
              variabilityClass: 'stable',
            },
          ],
        },
      },
    } as unknown as AnalysisWorkbenchViewModel;

    const chartModel = deriveAnalysisTradingChartModel(model);
    const point = chartModel.points[0]!;

    expect(point.price).toBe(3);
    expect(point.inventoryMean).toBe(20);
    expect(point.inventoryLow).toBe(15);
    expect(point.inventoryHigh).toBe(25);
    expect(point.serviceDemandMean).toBe(7);
    expect(point.retailDemandMean).toBe(3);
    expect(point.receiptsMean).toBe(5);
    expect(point.adjustmentsMean).toBe(2);
    expect(point.ordersInTransitMean).toBe(9);
    expect(point.ordersReceivedMean).toBe(6);
    expect(point.newOrderFlag).toBe(1);
    expect(point.newReceiptFlag).toBe(1);
    expect(point.leadTimeMean).toBe(5);
    expect(point.leadTimeLow).toBe(3);
    expect(point.leadTimeHigh).toBe(8);
    expect(point.dominantRegime).toBe('spike');
    expect(chartModel.availability.serviceDemand).toBe(true);
    expect(chartModel.availability.retailDemand).toBe(true);
    expect(chartModel.availability.leadTimeRange).toBe(true);
    expect(chartModel.availability.newOrderFlags).toBe(true);
    expect(chartModel.availability.newReceiptFlags).toBe(true);
  });
});
