import { describe, expect, it } from 'vitest';
import { createMockState } from '@/dev/browser-desktop-bridge';
import { createBrowserDemoSeedBackup, createBrowserDemoSeedRecords } from './demo-seed';
import { KAUR_KHOR_BROWSER_DEMO_DATABASE } from './constants';

describe('browser demo seed helpers', () => {
  it('builds seed records from the browser desktop bridge mock state', () => {
    const state = createMockState();
    const records = createBrowserDemoSeedRecords(state, '2026-05-01T00:00:00.000Z');

    expect(records).toEqual(expect.arrayContaining([
      expect.objectContaining({ collection: 'catalog', id: 'current', json: state.catalog }),
      expect.objectContaining({ collection: 'workspace_summary', id: 'current', json: state.workspaceSummary }),
      expect.objectContaining({ collection: 'analysis_runs', id: state.latestRun.runId, json: state.latestRun }),
      expect.objectContaining({ collection: 'automation', id: 'workspace', json: state.automation }),
    ]));
    expect(records.filter((record) => record.collection === 'observations')).toHaveLength(state.observations.length);
    expect(records.filter((record) => record.collection === 'order_batches')).toHaveLength(state.orderBatches.length);
  });

  it('wraps demo seed records in a demo database backup envelope', () => {
    const backup = createBrowserDemoSeedBackup(createMockState(), '2026-05-01T00:00:00.000Z');

    expect(backup.databaseName).toBe(KAUR_KHOR_BROWSER_DEMO_DATABASE);
    expect(backup.records.length).toBeGreaterThan(0);
    expect(backup.exportedAt).toBe('2026-05-01T00:00:00.000Z');
  });
});

