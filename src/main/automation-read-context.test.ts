// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import {
  loadAutomationCatalog,
  loadAutomationObservations,
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
    expect(invoke).toHaveBeenCalledWith('sena.getCatalog', undefined, { timeoutMs: 60_000 });
  });

  it('loads automation observations through the cached observation read', async () => {
    const { deps, loadCachedSenaRead, invoke } = createDeps();
    const observations = [{ observationId: 'obs-1' }] as unknown[];
    invoke.mockResolvedValueOnce(observations);

    await expect(loadAutomationObservations(deps)).resolves.toEqual(observations);
    expect(loadCachedSenaRead).toHaveBeenCalledWith('observations', expect.any(Function));
    expect(invoke).toHaveBeenCalledWith('sena.listObservations', undefined, { timeoutMs: 60_000 });
  });

  it('builds the automation workspace context from catalog and observation reads', async () => {
    const { deps, invoke } = createDeps();
    const catalog = { schemaVersion: 1, bundles: [], services: [], sharingMask: [], skus: [] };
    const observations = [{ observationId: 'obs-1' }] as unknown[];
    invoke
      .mockResolvedValueOnce(catalog)
      .mockResolvedValueOnce(observations);

    await expect(loadAutomationWorkspaceContext(deps)).resolves.toEqual({
      catalog,
      observations,
    });
    expect(invoke).toHaveBeenNthCalledWith(1, 'sena.getCatalog', undefined, { timeoutMs: 60_000 });
    expect(invoke).toHaveBeenNthCalledWith(2, 'sena.listObservations', undefined, { timeoutMs: 60_000 });
  });
});
