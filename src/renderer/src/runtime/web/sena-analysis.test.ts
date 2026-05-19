import { describe, expect, it } from 'vitest';
import { createMockState } from '@/dev/browser-desktop-bridge';
import {
  browserSenaObservationFingerprint,
  browserSenaObservationPage,
  browserSenaRecordUpdateContext,
  pageBrowserSenaSkuDetail,
  runBrowserSenaAnalysis,
  runBrowserSenaAnalysisJson,
} from './sena-analysis';

describe('browser SENA analysis', () => {
  it('runs deterministically across the JSON boundary', () => {
    const state = createMockState();
    const input = {
      ownerSub: 'browser-owner',
      runId: 'browser-test-run',
      createdAt: '2026-05-02T00:00:00.000Z',
      catalog: state.catalog,
      observations: state.observations,
      payload: {
        algorithmVersion: 'sena-analysis-v3',
        parameters: state.preferences.senaEngineParameters,
      },
    };

    const first = JSON.parse(runBrowserSenaAnalysisJson(JSON.stringify(input)));
    const second = JSON.parse(runBrowserSenaAnalysisJson(JSON.stringify(input)));

    expect(second).toEqual(first);
    expect(first.run.status).toBe('succeeded');
    expect(first.workspaceSummary.runId).toBe('browser-test-run');
    expect(first.workspaceSummary.intervalCount).toBe(state.observations.length);
    expect(Object.keys(first.skuDetails)).toEqual(state.catalog.skus.map((sku) => sku.skuId));
    expect(Object.keys(first.serviceDetails)).toEqual(state.catalog.services.map((service) => service.serviceId));
    expect(first.diagnostics.regimeHistory).toHaveLength(state.observations.length);
  });

  it('uses the Rust SENA default for missing service-linked SKU usage probability', () => {
    const state = createMockState();
    const linkedEntry = state.catalog.sharingMask.find((entry) => entry.enabled);
    expect(linkedEntry).toBeDefined();
    linkedEntry!.usageProbability = null;
    const serviceId = linkedEntry!.serviceId;
    const skuId = linkedEntry!.skuId;
    state.observations = state.observations.map((observation, index) => ({
      ...observation,
      input: {
        ...observation.input,
        serviceSalesSnapshot: index === state.observations.length - 1
          ? [{ serviceId, unitsSold: 10 }]
          : [],
      },
    }));

    const output = runBrowserSenaAnalysis({
      ownerSub: 'browser-owner',
      runId: 'browser-default-usage',
      createdAt: '2026-05-02T00:00:00.000Z',
      catalog: state.catalog,
      observations: state.observations,
      payload: {
        algorithmVersion: 'sena-analysis-v3',
        parameters: state.preferences.senaEngineParameters,
      },
    });

    const lastObservation = state.observations.at(-1)!;
    const previousObservation = state.observations.at(-2)!;
    const deltaDays = (Date.parse(lastObservation.input.observedAt) - Date.parse(previousObservation.input.observedAt)) / 86_400_000;
    expect(output.serviceDetails[serviceId]?.contributors.find((entry) => entry.skuId === skuId)?.usageProbability).toBe(0.85);
    expect(output.skuDetails[skuId]?.demandPosterior.at(-1)?.serviceDemandMean).toBe(8.5 / deltaDays);
  });

  it('builds compact browser read contexts without listObservations callers', () => {
    const state = createMockState();
    const fingerprint = browserSenaObservationFingerprint(state.observations);
    const context = browserSenaRecordUpdateContext(state.observations);

    expect(fingerprint.count).toBe(state.observations.length);
    expect(context.observationFingerprint).toEqual(fingerprint);
    expect(Object.keys(context.latestStockBySku).length).toBeGreaterThan(0);
    expect(context.recentActivity.length).toBeGreaterThan(0);
  });

  it('keeps malformed timestamp tickets and activity behind valid browser context entries', () => {
    const state = createMockState();
    const observations = [
      {
        ...state.observations[0]!,
        observationId: 'dirty',
        input: {
          ...state.observations[0]!.input,
          observedAt: 'not-a-date',
          ticketEvents: [{
            ticketFamily: 'supplier' as const,
            ticketId: 'ticket-dirty',
            ticketLabel: 'Dirty ticket',
            lifecycle: 'open' as const,
            action: 'opened' as const,
            eventType: 'created' as const,
            occurredAt: 'not-a-date',
            revision: 1,
            stage: 'ordered_waiting' as const,
            lines: [],
          }],
        },
      },
      {
        ...state.observations[0]!,
        observationId: 'valid',
        input: {
          ...state.observations[0]!.input,
          observedAt: '2026-05-03T00:00:00.000Z',
          ticketEvents: [{
            ticketFamily: 'supplier' as const,
            ticketId: 'ticket-valid',
            ticketLabel: 'Valid ticket',
            lifecycle: 'open' as const,
            action: 'opened' as const,
            eventType: 'created' as const,
            occurredAt: '2026-05-03T00:00:00.000Z',
            revision: 1,
            stage: 'ordered_waiting' as const,
            lines: [],
          }],
        },
      },
    ];

    const context = browserSenaRecordUpdateContext(observations);

    expect(context.openTicketsByFamily.supplier.map((ticket) => ticket.ticketId)).toEqual([
      'ticket-valid',
      'ticket-dirty',
    ]);
    expect(context.recentActivity[0]?.observationId).toBe('valid');
  });

  it('ignores invalid timestamps when selecting the latest browser observation fingerprint', () => {
    const state = createMockState();
    const observations = [
      {
        ...state.observations[0]!,
        observationId: 'dirty',
        input: {
          ...state.observations[0]!.input,
          observedAt: 'not-a-date',
        },
      },
      {
        ...state.observations[0]!,
        observationId: 'newer',
        input: {
          ...state.observations[0]!.input,
          observedAt: '2026-05-03T00:00:00.000Z',
        },
      },
      {
        ...state.observations[0]!,
        observationId: 'older',
        input: {
          ...state.observations[0]!.input,
          observedAt: '2026-05-01T00:00:00.000Z',
        },
      },
    ];

    expect(browserSenaObservationFingerprint(observations)).toMatchObject({
      latestObservedAt: '2026-05-03T00:00:00.000Z',
      latestObservationId: 'newer',
    });
  });

  it('keeps malformed timestamp observations reachable through browser observation pagination', () => {
    const state = createMockState();
    const observations = [
      {
        ...state.observations[0]!,
        observationId: 'bad-date',
        input: {
          ...state.observations[0]!.input,
          observedAt: 'not-a-date',
        },
      },
      {
        ...state.observations[0]!,
        observationId: 'newer',
        input: {
          ...state.observations[0]!.input,
          observedAt: '2026-05-03T00:00:00.000Z',
        },
      },
      {
        ...state.observations[0]!,
        observationId: 'older',
        input: {
          ...state.observations[0]!.input,
          observedAt: '2026-05-01T00:00:00.000Z',
        },
      },
    ];

    const firstPage = browserSenaObservationPage(observations, { limit: 1 });
    const secondPage = browserSenaObservationPage(observations, {
      beforeObservedAt: firstPage.nextCursor?.observedAt,
      beforeObservationId: firstPage.nextCursor?.observationId,
      limit: 5,
    });

    expect(firstPage.observations.map((observation) => observation.observationId)).toEqual(['newer']);
    expect(secondPage.observations.map((observation) => observation.observationId)).toEqual(['older', 'bad-date']);
  });

  it('keeps posterior metrics numeric when browser observations contain invalid timestamps', () => {
    const state = createMockState();
    const skuId = state.catalog.skus[0]!.skuId;
    const observations = state.observations.slice(0, 3).map((observation, index) => ({
      ...observation,
      input: {
        ...observation.input,
        observedAt: index === 1 ? 'not-a-date' : observation.input.observedAt,
        orderSignals: index === 2
          ? [{
              approximateOrderQuantity: 4,
              orderPlaced: true,
              placementTimestamp: 'not-a-date',
              skuId,
            }]
          : observation.input.orderSignals,
      },
    }));
    const output = JSON.parse(runBrowserSenaAnalysisJson(JSON.stringify({
      ownerSub: 'browser-owner',
      runId: 'browser-dirty-dates',
      createdAt: '2026-05-02T00:00:00.000Z',
      catalog: state.catalog,
      observations,
      payload: {
        algorithmVersion: 'sena-analysis-v3',
        parameters: state.preferences.senaEngineParameters,
      },
    })));
    const detail = output.skuDetails[skuId];

    expect(detail.demandPosterior.every((point: { deltaDays: unknown; serviceDemandMean: unknown }) =>
      typeof point.deltaDays === 'number' &&
      Number.isFinite(point.deltaDays) &&
      typeof point.serviceDemandMean === 'number' &&
      Number.isFinite(point.serviceDemandMean),
    )).toBe(true);
    expect(detail.pipelinePosterior.every((point: { ageDaysMean: unknown }) =>
      typeof point.ageDaysMean === 'number' && Number.isFinite(point.ageDaysMean),
    )).toBe(true);
  });

  it('keeps inventory posterior points when paging detail windows with non-zero interval indexes', () => {
    const baseTime = Date.parse('2026-03-01T00:00:00.000Z');
    const demandPosterior = Array.from({ length: 40 }, (_, index) => ({
      adjustmentsMean: 0,
      deltaDays: 1,
      endAt: new Date(baseTime + index * 86_400_000 + 8 * 60 * 60 * 1000).toISOString(),
      intervalIndex: index,
      realizedConsumptionMean: 1,
      receiptsMean: 0,
      retailDemandMean: 1,
      serviceDemandMean: 0,
      startAt: new Date(baseTime + index * 86_400_000).toISOString(),
      unconstrainedDemandMean: 1,
    }));
    const detail = {
      demandPosterior,
      inventoryPosterior: demandPosterior.map((interval) => ({
        at: interval.endAt,
        high: 12,
        low: 8,
        mean: 10,
      })),
      leadTimePosterior: demandPosterior.map((interval) => ({
        intervalIndex: interval.intervalIndex,
        logMeanDays: 1,
        logStdDays: 0.1,
        meanDays: 3,
        observedRelativeWidth: 0.2,
        observedVariabilityClass: 'tight' as const,
        stdDays: 1,
      })),
      pipelinePosterior: demandPosterior.map((interval) => ({
        ageDaysMean: 1,
        inTransitMean: 0,
        intervalIndex: interval.intervalIndex,
        orderProbability: 0,
        orderQuantityMean: 0,
        receiptQuantityMean: 0,
      })),
      summary: {
        credibleIntervalHigh: 12,
        credibleIntervalLow: 8,
        daysOfCover: 10,
        demandPerDayMean: 1,
        expectedLeadTimeDemand: 3,
        latestPosteriorUnits: 10,
        leadTimeMeanDays: 3,
        leadTimeStdDays: 1,
        regimeProbabilities: { normal: 1 },
        reorderPoint: 5,
        reorderTriggerProbability: 0.1,
        safetyStock: 2,
        skuId: 'sku-1',
        stockoutRisk: 0.1,
      },
    };
    const page = pageBrowserSenaSkuDetail(detail, null, 20);

    expect(page.detail.demandPosterior[0]?.intervalIndex).toBeGreaterThan(0);
    expect(page.detail.inventoryPosterior.length).toBeGreaterThan(0);
    expect(page.detail.inventoryPosterior.at(-1)?.at).toBe(page.detail.demandPosterior.at(-1)?.endAt);
  });
});
