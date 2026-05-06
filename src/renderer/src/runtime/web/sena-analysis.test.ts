import { describe, expect, it } from 'vitest';
import { createMockState } from '@/dev/browser-desktop-bridge';
import {
  browserSenaObservationFingerprint,
  browserSenaRecordUpdateContext,
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

  it('builds compact browser read contexts without listObservations callers', () => {
    const state = createMockState();
    const fingerprint = browserSenaObservationFingerprint(state.observations);
    const context = browserSenaRecordUpdateContext(state.observations);

    expect(fingerprint.count).toBe(state.observations.length);
    expect(context.observationFingerprint).toEqual(fingerprint);
    expect(Object.keys(context.latestStockBySku).length).toBeGreaterThan(0);
    expect(context.recentActivity.length).toBeGreaterThan(0);
  });
});
