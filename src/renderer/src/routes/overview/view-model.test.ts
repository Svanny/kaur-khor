import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SenaCatalog, SenaObservationRecord, SenaWorkspaceSummary } from '@shared/sena';
import { buildOverviewModel } from './view-model';

const taskCatalog: SenaCatalog = {
  schemaVersion: 1,
  skus: [
    {
      skuId: 'sku-1',
      name: 'Shampoo Classic',
      description: 'Retail shampoo',
      costPerUnit: 5,
      soldAsProduct: true,
      productPrice: 20,
      leadTimeMeanDaysHint: 4,
      leadTimeStdDaysHint: 1,
    },
  ],
  services: [],
  bundles: [],
  sharingMask: [],
};

const taskWorkspaceSummary: SenaWorkspaceSummary = {
  ownerSub: 'desktop-owner',
  runId: 'run-1',
  latestObservedAt: '2026-04-01T10:00:00.000Z',
  skuCount: 1,
  serviceCount: 0,
  intervalCount: 0,
  pendingReorderCount: 0,
  topRegime: 'normal',
  highRiskSkuIds: [],
  skuSummaries: [
    {
      skuId: 'sku-1',
      latestPosteriorUnits: 5,
      credibleIntervalLow: 3,
      credibleIntervalHigh: 10,
      demandPerDayMean: 4,
      stockoutRisk: 0.82,
      daysOfCover: 2,
      expectedLeadTimeDemand: 12,
      safetyStock: 2,
      reorderPoint: 14,
      reorderTriggerProbability: 0.88,
      reorderQuantity: {
        recommendedUnits: 14.2,
        ungatedRecommendedUnits: 14.2,
        likelyRangeLow: 10,
        likelyRangeHigh: 18,
        needProbability: 0.78,
        recommendationIssued: true,
        recommendationQuantile: 0.7,
        intervalLowQuantile: 0.1,
        intervalHighQuantile: 0.9,
        needProbabilityGate: 0.5,
        reviewDelayDays: 0,
      },
      leadTimeMeanDays: 4,
      leadTimeStdDays: 1,
      regimeProbabilities: { promo: 0.8, normal: 0.2 },
    },
  ],
};

const reminderCatalog: SenaCatalog = {
  schemaVersion: 1,
  skus: [],
  services: [],
  bundles: [],
  sharingMask: [],
};

const reminderWorkspaceSummary: SenaWorkspaceSummary = {
  ...taskWorkspaceSummary,
  skuCount: 0,
  skuSummaries: [],
};

function makeObservation(observedAt: string): SenaObservationRecord {
  return {
    observationId: `obs-${observedAt}`,
    ownerSub: 'desktop-owner',
    input: {
      observedAt,
      stockSnapshot: [],
      serviceRankings: [],
      retailRankings: [],
      serviceStockouts: [],
      retailStockouts: [],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [],
      adjustmentSignals: [],
      recipeUsageHints: [],
      notes: null,
    },
  };
}

describe('buildOverviewModel stale update reminder', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-12T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('adds a reminder task when the last recorded update is more than 7 days old', () => {
    const model = buildOverviewModel({
      catalog: reminderCatalog,
      detailBySkuId: {},
      language: 'en',
      observations: [makeObservation('2026-04-01T10:00:00.000Z')],
      workspaceSummary: reminderWorkspaceSummary,
    });

    expect(model.tasks).toHaveLength(1);
    expect(model.tasks[0]).toMatchObject({
      kind: 'stale_update_reminder',
      actionLabel: 'Start update',
      snoozeActionLabel: 'Remind tomorrow',
      staleDays: 11,
    });
  });

  it('does not add a reminder task when the last recorded update is 7 days old or newer', () => {
    const model = buildOverviewModel({
      catalog: reminderCatalog,
      detailBySkuId: {},
      language: 'en',
      observations: [makeObservation('2026-04-05T10:00:00.000Z')],
      workspaceSummary: reminderWorkspaceSummary,
    });

    expect(model.tasks).toHaveLength(0);
  });

  it('suppresses the reminder while snoozed and brings it back after the snooze day passes', () => {
    const baseInput = {
      catalog: reminderCatalog,
      detailBySkuId: {},
      language: 'en' as const,
      observations: [makeObservation('2026-04-01T10:00:00.000Z')],
      workspaceSummary: reminderWorkspaceSummary,
    };

    const suppressedModel = buildOverviewModel({
      ...baseInput,
      staleUpdateReminderSnoozeUntil: '2026-04-13T00:00:00.000Z',
    });
    expect(suppressedModel.tasks).toHaveLength(0);

    const visibleAgainModel = buildOverviewModel({
      ...baseInput,
      staleUpdateReminderSnoozeUntil: '2026-04-12T00:00:00.000Z',
    });
    expect(visibleAgainModel.tasks).toHaveLength(1);
    expect(visibleAgainModel.tasks[0]?.kind).toBe('stale_update_reminder');
  });

  it('can force the reminder visible in dev even when the last update is recent', () => {
    const model = buildOverviewModel({
      catalog: reminderCatalog,
      detailBySkuId: {},
      forceStaleUpdateReminder: true,
      language: 'en',
      observations: [makeObservation('2026-04-10T10:00:00.000Z')],
      workspaceSummary: reminderWorkspaceSummary,
    });

    expect(model.tasks).toHaveLength(1);
    expect(model.tasks[0]).toMatchObject({
      kind: 'stale_update_reminder',
      actionLabel: 'Start update',
    });
  });

  it('builds localized signals from stable task state instead of English labels', () => {
    const model = buildOverviewModel({
      catalog: taskCatalog,
      detailBySkuId: {
        'sku-1': {
          summary: taskWorkspaceSummary.skuSummaries[0]!,
          inventoryPosterior: [],
          demandPosterior: [],
          pipelinePosterior: [],
          leadTimePosterior: [],
        },
      },
      language: 'km',
      observations: [
        {
          ...makeObservation('2026-04-10T10:00:00.000Z'),
          input: {
            ...makeObservation('2026-04-10T10:00:00.000Z').input,
            retailPrices: [{ price: 18, skuId: 'sku-1' }],
          },
        },
      ],
      workspaceSummary: taskWorkspaceSummary,
    });

    expect(model.signals.some((signal) => signal.text.includes('Shampoo Classic'))).toBe(true);
    expect(model.signals.some((signal) => signal.text.includes('promo'))).toBe(false);
    expect(model.signals).toHaveLength(2);
  });
});
