import { describe, expect, test } from 'vitest';
import { resolveInventoryColumns } from './columns';
import { deriveInventoryViewModel, formatInventoryCell } from './view-model';
import type { DeriveInventoryViewModelInput } from './view-model';

function baseInput(overrides: Partial<DeriveInventoryViewModelInput> = {}): DeriveInventoryViewModelInput {
  return {
    catalog: {
      bundles: [],
      schemaVersion: 1,
      services: [
        {
          archived: false,
          bundle: false,
          description: '',
          imagePath: null,
          name: 'Tea pairing',
          price: 12,
          serviceId: 'service-tea',
        },
      ],
      sharingMask: [{ enabled: true, serviceId: 'service-tea', skuId: 'sku-tea', usageProbability: 1 }],
      skus: [
        {
          archived: false,
          costPerUnit: 2,
          description: '',
          imagePath: null,
          leadTimeMeanDaysHint: 4,
          leadTimeStdDaysHint: 1,
          name: 'Palm sugar',
          productPrice: 6,
          skuId: 'sku-tea',
          soldAsProduct: true,
          supplierName: 'Supplier',
        },
      ],
    },
    customColumns: undefined,
    language: 'en',
    observations: [],
    projectionHorizon: '7d',
    range: '30d',
    recordUpdateContext: null,
    rowSet: 'all',
    scope: 'all',
    serviceDetailsById: new Map(),
    skuDetailsById: new Map(),
    supplier: 'all',
    viewPreset: 'health',
    workspaceSummary: {
      highRiskSkuIds: [],
      intervalCount: 1,
      latestObservedAt: '2026-04-03T08:00:00.000Z',
      ownerSub: 'desktop-owner',
      pendingReorderCount: 0,
      runId: 'run-1',
      serviceCount: 1,
      skuCount: 1,
      skuSummaries: [
        {
          credibleIntervalHigh: 10,
          credibleIntervalLow: 8,
          daysOfCover: 5,
          demandPerDayMean: 1,
          expectedLeadTimeDemand: 4,
          latestPosteriorUnits: 9,
          leadTimeMeanDays: 4,
          leadTimeStdDays: 1,
          reorderPoint: 3,
          reorderTriggerProbability: 0.1,
          regimeProbabilities: { normal: 1 },
          safetyStock: 2,
          skuId: 'sku-tea',
          stockoutRisk: 0.05,
        },
      ],
      topRegime: 'normal',
    },
    ...overrides,
  };
}

describe('deriveInventoryViewModel', () => {
  test('deduplicates custom inventory columns before rendering the grid', () => {
    expect(resolveInventoryColumns('custom', ['onHand', 'bogus', 'onHand', 'cover'])).toEqual([
      'item',
      'onHand',
      'cover',
    ]);
  });

  test('normalizes non-finite SENA inventory signals before formatting rows', () => {
    const input = baseInput({
      skuDetailsById: new Map([
        ['sku-tea', {
          demandPosterior: [
            {
              adjustmentsMean: Number.NaN,
              endAt: '2026-04-03T08:00:00.000Z',
              inventoryPositionMean: Number.POSITIVE_INFINITY,
              lostDemandMean: Number.NaN,
              preClampInventoryMean: Number.NaN,
              realizedConsumptionMean: Number.POSITIVE_INFINITY,
              receiptsMean: 4,
            },
          ],
          leadTimePosterior: [{ meanDays: Number.POSITIVE_INFINITY, stdDays: Number.NaN }],
          pipelinePosterior: [{ inTransitMean: Number.POSITIVE_INFINITY, orderProbability: Number.NaN }],
        } as never],
      ]),
      serviceDetailsById: new Map([
        ['service-tea', {
          activityMean: Number.POSITIVE_INFINITY,
          bottleneckProbability: Number.POSITIVE_INFINITY,
          contributors: [{ bottleneckProbability: Number.NaN, skuId: 'sku-tea' }],
        } as never],
      ]),
      workspaceSummary: {
        ...baseInput().workspaceSummary,
        skuSummaries: [
          {
            ...baseInput().workspaceSummary.skuSummaries[0]!,
            credibleIntervalHigh: Number.NaN,
            credibleIntervalLow: Number.POSITIVE_INFINITY,
            daysOfCover: Number.NaN,
            demandPerDayMean: Number.POSITIVE_INFINITY,
            leadTimeMeanDays: Number.POSITIVE_INFINITY,
            latestPosteriorUnits: Number.POSITIVE_INFINITY,
            reorderPoint: Number.POSITIVE_INFINITY,
            reorderTriggerProbability: Number.POSITIVE_INFINITY,
            safetyStock: Number.NaN,
            stockoutRisk: Number.POSITIVE_INFINITY,
          },
        ],
      },
    });

    const model = deriveInventoryViewModel(input);
    const renderedText = [
      ...model.strip.map((metric) => `${metric.value} ${metric.detail}`),
      ...model.rows.flatMap((row) => [
        formatInventoryCell(row, 'onHand', 'en', '7d'),
        formatInventoryCell(row, 'cover', 'en', '7d'),
        formatInventoryCell(row, 'projection', 'en', '7d'),
        formatInventoryCell(row, 'stockoutRisk', 'en', '7d'),
        formatInventoryCell(row, 'demand', 'en', '7d'),
      ]),
      ...model.projectionMatrix.flatMap((row) => Object.values(row.horizonCells).map((cell) => cell.label)),
    ].join(' ');

    expect(renderedText).not.toMatch(/NaN|Infinity|∞/);
    expect(model.rows.find((row) => row.type === 'sku')?.focusReasonCodes).toContain('unknown-cover');
    expect(model.rows.find((row) => row.type === 'service')?.bottleneckProbability).toBe(0);
  });
});
