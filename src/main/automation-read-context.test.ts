// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  loadAutomationCatalog,
  loadAutomationObservations,
  loadAutomationRecordUpdateContext,
  loadAutomationWorkspaceContext,
  type AutomationReadContextDeps,
} from './automation-read-context';

function createDeps() {
  const loadCachedSenaRead = vi.fn<AutomationReadContextDeps['loadCachedSenaRead']>((_key, loader) => loader());
  const invoke = vi.fn<AutomationReadContextDeps['invoke']>();

  return {
    deps: {
      loadCachedSenaRead,
      invoke,
      timeoutMs: 60_000,
    } satisfies AutomationReadContextDeps,
    loadCachedSenaRead,
    invoke,
  };
}

describe('automation read context loaders', () => {
  it('loads the automation catalog through the cached SENA catalog read', async () => {
    const { deps, loadCachedSenaRead, invoke } = createDeps();
    const catalog = { schemaVersion: 1, bundles: [], services: [], sharingMask: [], skus: [] };
    invoke.mockResolvedValueOnce(catalog);

    await expect(loadAutomationCatalog(deps)).resolves.toEqual(catalog);
    expect(loadCachedSenaRead).toHaveBeenCalledWith('catalog', expect.any(Function));
    expect(invoke).toHaveBeenCalledWith('sena.getCatalog', undefined, {
      timeoutMs: 60_000,
      readPriority: 'critical',
    });
  });

  it('loads automation observations through the cached observation read', async () => {
    const { deps, loadCachedSenaRead, invoke } = createDeps();
    const observations = [{ observationId: 'obs-1' }] as unknown[];
    invoke.mockResolvedValueOnce(observations);

    await expect(loadAutomationObservations(deps)).resolves.toEqual(observations);
    expect(loadCachedSenaRead).toHaveBeenCalledWith('observations', expect.any(Function));
    expect(invoke).toHaveBeenCalledWith('sena.listObservations', undefined, {
      timeoutMs: 60_000,
      readPriority: 'background',
    });
  });

  it('loads automation stock context through the cached record-update context read', async () => {
    const { deps, loadCachedSenaRead, invoke } = createDeps();
    const recordUpdateContext = {
      observationFingerprint: {
        count: 1,
        latestObservationId: 'obs-1',
        latestObservedAt: '2025-01-01T00:00:00.000Z',
      },
      latestObservedAt: '2025-01-01T00:00:00.000Z',
      latestStockBySku: {},
      latestRetailSaleBySku: {},
      latestServiceSaleByService: {},
      latestOrderBySku: {},
      latestReceiptBySku: {},
    };
    invoke.mockResolvedValueOnce(recordUpdateContext);

    await expect(loadAutomationRecordUpdateContext(deps)).resolves.toEqual(recordUpdateContext);
    expect(loadCachedSenaRead).toHaveBeenCalledWith('record-update-context', expect.any(Function));
    expect(invoke).toHaveBeenCalledWith('sena.getRecordUpdateContext', undefined, {
      timeoutMs: 60_000,
      readPriority: 'critical',
    });
  });

  it('builds the automation workspace context from catalog and compact stock reads', async () => {
    const { deps, invoke } = createDeps();
    const catalog = { schemaVersion: 1, bundles: [], services: [], sharingMask: [], skus: [] };
    const recordUpdateContext = {
      observationFingerprint: {
        count: 1,
        latestObservationId: 'obs-1',
        latestObservedAt: '2025-01-01T00:00:00.000Z',
      },
      latestObservedAt: '2025-01-01T00:00:00.000Z',
      latestStockBySku: {},
      latestRetailSaleBySku: {},
      latestServiceSaleByService: {},
      latestOrderBySku: {},
      latestReceiptBySku: {},
    };
    invoke
      .mockResolvedValueOnce(catalog)
      .mockResolvedValueOnce(recordUpdateContext);

    await expect(loadAutomationWorkspaceContext(deps)).resolves.toEqual({
      catalog,
      recordUpdateContext,
    });
    expect(invoke).toHaveBeenNthCalledWith(1, 'sena.getCatalog', undefined, {
      timeoutMs: 60_000,
      readPriority: 'critical',
    });
    expect(invoke).toHaveBeenNthCalledWith(2, 'sena.getRecordUpdateContext', undefined, {
      timeoutMs: 60_000,
      readPriority: 'critical',
    });
  });
});
