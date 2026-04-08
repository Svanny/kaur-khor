import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SenaCatalog, SenaObservationRecord, SenaWorkspaceSummary } from '@shared/sena';
import { buildOverviewModel } from './view-model';

const catalog: SenaCatalog = {
  schemaVersion: 1,
  skus: [],
  services: [],
  bundles: [],
  sharingMask: [],
};

const workspaceSummary: SenaWorkspaceSummary = {
  ownerSub: 'desktop-owner',
  runId: 'run-1',
  latestObservedAt: '2026-04-01T10:00:00.000Z',
  skuCount: 0,
  serviceCount: 0,
  intervalCount: 0,
  pendingReorderCount: 0,
  topRegime: 'normal',
  highRiskSkuIds: [],
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
      catalog,
      detailBySkuId: {},
      language: 'en',
      observations: [makeObservation('2026-04-01T10:00:00.000Z')],
      workspaceSummary,
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
      catalog,
      detailBySkuId: {},
      language: 'en',
      observations: [makeObservation('2026-04-05T10:00:00.000Z')],
      workspaceSummary,
    });

    expect(model.tasks).toHaveLength(0);
  });

  it('suppresses the reminder while snoozed and brings it back after the snooze day passes', () => {
    const baseInput = {
      catalog,
      detailBySkuId: {},
      language: 'en' as const,
      observations: [makeObservation('2026-04-01T10:00:00.000Z')],
      workspaceSummary,
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
      catalog,
      detailBySkuId: {},
      forceStaleUpdateReminder: true,
      language: 'en',
      observations: [makeObservation('2026-04-10T10:00:00.000Z')],
      workspaceSummary,
    });

    expect(model.tasks).toHaveLength(1);
    expect(model.tasks[0]).toMatchObject({
      kind: 'stale_update_reminder',
      actionLabel: 'Start update',
    });
  });
});
