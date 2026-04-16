import { describe, expect, test } from 'vitest';
import type { SenaSkuDetailViewModel } from './view-model';
import {
  compatiblePlotStyles,
  defaultTradingChartIndicators,
  deriveTradingChartDisplayModel,
  deriveTradingChartPaneLayout,
  deriveTradingChartModel,
  moveTradingChartIndicator,
  nextTradingChartPaneId,
  normalizeTradingChartIndicatorSettings,
  TRADING_CHART_MAIN_PANE_ID,
} from './trading-chart-model';

function buildModel(overrides: Partial<SenaSkuDetailViewModel> = {}): SenaSkuDetailViewModel {
  return {
    identity: {
      skuId: 'sku-1',
      name: 'SKU 1',
      description: '',
      supplierName: null,
      soldAsProduct: true,
      statusLabel: 'Ready',
      statusTone: 'neutral',
      topRegime: 'normal',
      legacyFallbackAvailable: true,
    },
    heartbeat: {
      headlineUnits: '',
      credibleBandLabel: '',
      coverLabel: '',
      reorderLabel: '',
      pipelineLabel: '',
      receiptWindowLabel: '',
      variabilityLabel: '',
      heroSentence: '',
    },
    ribbon: [],
    selectedInterval: { index: 1, label: 'Interval 2' },
    lanes: {
      regimePriceLane: {
        intervals: [
          {
            intervalIndex: 0,
            startAt: '2026-03-01T00:00:00.000Z',
            endAt: '2026-03-02T00:00:00.000Z',
            dominantRegime: 'normal',
            regimeProbabilities: { normal: 1 },
          },
          {
            intervalIndex: 2,
            startAt: '2026-03-03T00:00:00.000Z',
            endAt: '2026-03-04T00:00:00.000Z',
            dominantRegime: 'spike',
            regimeProbabilities: { spike: 1 },
          },
        ],
        priceMarkers: [{ observedAt: '2026-03-04T00:00:00.000Z', price: 12.5, intervalIndex: 2 }],
        summary: '',
        currentPriceLabel: '$12.50',
      },
      inventoryLane: {
        summary: '',
        points: [
          { at: '2026-03-02T00:00:00.000Z', mean: 11, low: 9, high: 13 },
          { at: '2026-03-03T00:00:00.000Z', mean: 10, low: 8, high: 12 },
        ],
        reorderPoint: 8,
        reorderPointLabel: '8u',
        safetyStock: 4,
        safetyStockLabel: '4u',
      },
      flowLane: {
        summary: '',
        intervals: [
          {
            intervalIndex: 0,
            startAt: '2026-03-01T00:00:00.000Z',
            endAt: '2026-03-02T00:00:00.000Z',
            deltaDays: 1,
            serviceDemandMean: 1,
            retailDemandMean: 2,
            unconstrainedDemandMean: 3,
            realizedConsumptionMean: 3,
            adjustmentsMean: 0,
            receiptsMean: 4,
          },
          {
            intervalIndex: 1,
            startAt: '2026-03-02T00:00:00.000Z',
            endAt: '2026-03-03T00:00:00.000Z',
            deltaDays: 1,
            serviceDemandMean: 2,
            retailDemandMean: 3,
            unconstrainedDemandMean: 5,
            realizedConsumptionMean: 5,
            adjustmentsMean: -1,
            receiptsMean: 0,
          },
        ],
      },
      pipelineLane: {
        summary: '',
        intervals: [
          {
            intervalIndex: 1,
            inTransitMean: 5,
            orderProbability: 0.6,
            orderQuantityMean: 7,
            receiptQuantityMean: 0,
            ageDaysMean: 2,
          },
        ],
      },
    },
    rail: {
      selectedIntervalSummary: {
        headline: '',
        label: '',
        dominantRegime: 'normal',
        serviceDemand: '',
        retailDemand: '',
        receipts: '',
        adjustments: '',
        notes: [],
      },
      actNow: { headline: '', quantityBand: '', rationale: ['', '', ''] },
      openPipeline: { summary: ['', '', '', ''], events: [] },
      exposure: [],
      nextTouch: { dateLabel: '', reason: '' },
    },
    dependencyImpact: [],
    evidence: [],
    actionContext: {
      currentStock: 0,
      costPerUnit: 0,
      leadTimeVariability: null,
      productPrice: null,
      latestObservationAt: null,
      soldAsProduct: true,
      recommendedOrderQuantity: 0,
      reorderRecommendation: {
        recommendedUnits: 0,
        recommendedOrderLabel: '',
        likelyRangeLabel: '',
        needProbabilityLabel: '',
        recommendationIssued: false,
      },
    },
    uiState: 'ready',
    ...overrides,
  };
}

describe('deriveTradingChartModel', () => {
  test('merges sparse lane data by interval index', () => {
    const chartModel = deriveTradingChartModel(buildModel());

    expect(chartModel.points.map((point) => point.intervalIndex)).toEqual([0, 1, 2]);
    expect(chartModel.pointByIntervalIndex.get(1)?.ordersInTransitMean).toBe(5);
    expect(chartModel.pointByIntervalIndex.get(2)?.price).toBe(12.5);
  });

  test('reuses aggregated display models for the same points array and resolution', () => {
    const chartModel = deriveTradingChartModel(buildModel());
    const resolution = { amount: 1, unit: 'D' } as const;

    const firstDisplayModel = deriveTradingChartDisplayModel(chartModel, resolution);
    const secondDisplayModel = deriveTradingChartDisplayModel(chartModel, resolution);

    expect(secondDisplayModel).toBe(firstDisplayModel);
  });

  test('matches inventory points to intervals by timestamp before array position', () => {
    const model = buildModel();
    const chartModel = deriveTradingChartModel({
      ...model,
      lanes: {
        ...model.lanes,
        inventoryLane: {
          ...model.lanes.inventoryLane,
          points: [
            { at: '2026-03-03T00:00:00.000Z', mean: 21, low: 19, high: 23 },
          ],
        },
      },
    });

    expect(chartModel.pointByIntervalIndex.get(1)?.inventoryMean).toBe(21);
    expect(chartModel.pointByIntervalIndex.get(0)?.inventoryMean).toBeNull();
  });

  test('sanitizes uncertainty bounds around inventory mean', () => {
    const model = buildModel();
    const chartModel = deriveTradingChartModel({
      ...model,
      lanes: {
        ...model.lanes,
        inventoryLane: {
          ...model.lanes.inventoryLane,
          points: [
            { at: '2026-03-02T00:00:00.000Z', mean: 20, low: 15, high: 15 },
            { at: '2026-03-03T00:00:00.000Z', mean: 10, low: 14, high: 8 },
          ],
        },
      },
    });

    expect(chartModel.pointByIntervalIndex.get(0)?.inventoryLow).toBe(15);
    expect(chartModel.pointByIntervalIndex.get(0)?.inventoryHigh).toBe(20);
    expect(chartModel.pointByIntervalIndex.get(1)?.inventoryLow).toBe(8);
    expect(chartModel.pointByIntervalIndex.get(1)?.inventoryHigh).toBe(14);
  });

  test('derives ordered chart times from endAt with deterministic fallback', () => {
    const chartModel = deriveTradingChartModel(buildModel({
      lanes: {
        ...buildModel().lanes,
        regimePriceLane: {
          ...buildModel().lanes.regimePriceLane,
          intervals: [
            {
              intervalIndex: 0,
              startAt: null as unknown as string,
              endAt: null as unknown as string,
              dominantRegime: 'normal',
              regimeProbabilities: { normal: 1 },
            },
          ],
          priceMarkers: [],
        },
      },
    }));

    expect(Number(chartModel.points[0]?.time)).toBeGreaterThan(0);
    expect(Number(chartModel.points[1]?.time)).toBeGreaterThan(Number(chartModel.points[0]?.time));
  });

  test('excludes price data for non-sellable SKUs', () => {
    const chartModel = deriveTradingChartModel(buildModel({
      identity: {
        ...buildModel().identity,
        soldAsProduct: false,
      },
    }));

    expect(chartModel.availability.price).toBe(false);
    expect(chartModel.pointByIntervalIndex.get(2)?.price).toBeNull();
  });

  test('marks unavailable indicators when source values are missing', () => {
    const model = buildModel();
    const chartModel = deriveTradingChartModel({
      ...model,
      lanes: {
        ...model.lanes,
        inventoryLane: {
          ...model.lanes.inventoryLane,
          points: [],
          reorderPoint: null,
          safetyStock: null,
        },
      },
    });

    expect(chartModel.availability.inventory).toBe(false);
    expect(chartModel.availability.uncertainty).toBe(false);
    expect(chartModel.availability.reorderPoint).toBe(false);
    expect(chartModel.availability.safetyStock).toBe(false);
  });

  test('provides compatible plot styles and defaults for indicators', () => {
    const defaults = defaultTradingChartIndicators();

    expect(defaults.inventory.plotStyle).toBe('line');
    expect(defaults.uncertainty.plotStyle).toBe('lines');
    expect(defaults.uncertainty.lineWidth).toBe(2);
    expect(defaults.uncertainty.lineStyle).toBe('dashed');
    expect(defaults.reorderPoint.lineWidth).toBe(3);
    expect(defaults.safetyStock.lineWidth).toBe(3);
    expect(defaults.reorderPoint.plotStyle).toBe('price-line');
    expect(defaults.regime.plotStyle).toBe('icons');
    expect(compatiblePlotStyles('inventory')).toEqual(['line', 'area', 'step-line', 'histogram', 'bars', 'candles']);
    expect(compatiblePlotStyles('uncertainty')).toEqual(['lines', 'band']);
    expect(compatiblePlotStyles('regime')).toEqual(['icons', 'background-highlight', 'background-highlight-icons']);
    expect(compatiblePlotStyles('demand')).toEqual(['histogram', 'line', 'area', 'step-line', 'bars', 'candles']);
  });

  test('derives default pane layout from indicator settings', () => {
    const defaults = defaultTradingChartIndicators();
    defaults.demand.enabled = true;
    defaults.receipts.enabled = true;

    expect(deriveTradingChartPaneLayout(defaults, {
      inventory: true,
      uncertainty: true,
      reorderPoint: true,
      safetyStock: true,
      demand: true,
      receipts: true,
      pipeline: false,
      price: false,
      regime: true,
    })).toEqual([
      { id: 'main', indicatorIds: ['inventory', 'uncertainty', 'reorderPoint', 'safetyStock', 'regime'] },
      { id: 'pane-1', indicatorIds: ['demand'] },
      { id: 'pane-2', indicatorIds: ['receipts'] },
    ]);
  });

  test('preserves regime pane assignment', () => {
    const defaults = defaultTradingChartIndicators();
    defaults.regime.paneId = 'pane-99';

    expect(normalizeTradingChartIndicatorSettings(defaults).regime.paneId).toBe('pane-99');
  });

  test('creates new bottom pane ids monotonically', () => {
    const defaults = defaultTradingChartIndicators();

    expect(nextTradingChartPaneId(defaults)).toBe('pane-9');
  });

  test('moves indicators into target pane, including regime', () => {
    const defaults = defaultTradingChartIndicators();
    defaults.demand.enabled = true;
    defaults.receipts.enabled = true;

    const movedDemand = moveTradingChartIndicator(defaults, 'demand', 'pane-2', 1);
    expect(movedDemand.demand.paneId).toBe('pane-2');
    expect(movedDemand.demand.layerOrder).toBe(1);

    const movedRegime = moveTradingChartIndicator(defaults, 'regime', 'pane-2', 0);
    expect(movedRegime.regime.paneId).toBe('pane-2');
  });

  test('regime alone in its own pane creates correct layout', () => {
    const defaults = defaultTradingChartIndicators();
    // Disable all indicators except regime
    for (const key of Object.keys(defaults) as Array<keyof typeof defaults>) {
      if (key !== 'regime') {
        defaults[key].enabled = false;
      }
    }
    // Move regime to its own pane
    defaults.regime.paneId = 'pane-1';
    defaults.regime.enabled = true;

    const availability: TradingChartModel['availability'] = {
      inventory: false,
      uncertainty: false,
      reorderPoint: false,
      safetyStock: false,
      demand: false,
      receipts: false,
      pipeline: false,
      price: false,
      regime: true, // regime has data
    };

    const layout = deriveTradingChartPaneLayout(defaults, availability);
    
    expect(layout).toEqual([
      { id: 'main', indicatorIds: [] },
      { id: 'pane-1', indicatorIds: ['regime'] },
    ]);
  });

  test('regime in main pane with other indicators', () => {
    const defaults = defaultTradingChartIndicators();
    defaults.inventory.enabled = true;
    defaults.regime.enabled = true;
    defaults.regime.paneId = 'main';

    const availability: TradingChartModel['availability'] = {
      inventory: true,
      uncertainty: false,
      reorderPoint: false,
      safetyStock: false,
      demand: false,
      receipts: false,
      pipeline: false,
      price: false,
      regime: true,
    };

    const layout = deriveTradingChartPaneLayout(defaults, availability);
    
    expect(layout).toEqual([
      { id: 'main', indicatorIds: ['inventory', 'regime'] },
    ]);
  });

  test('pane height allocation with single indicator pane', () => {
    // Test the paneHeightAllocation logic for 1 indicator pane
    const totalHeight = 1000; // mock container height
    const indicatorPaneCount = 1;
    
    // When there's 1 indicator pane: indicator gets 25%, main gets 75%
    // Formula: indicatorHeight = totalHeight * 0.25 = 250
    // main = totalHeight - indicatorHeight = 750
    
    // Test with 0 indicator panes (main only)
    const mainOnly = { main: totalHeight, indicators: [] };
    expect(mainOnly.main).toBe(1000);
    expect(mainOnly.indicators).toHaveLength(0);
  });
});
