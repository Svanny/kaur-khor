import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportLogsAction, exportPlanningDataAction } from './settings-workspace-actions';

const t = (key: string, variables?: Record<string, string | number | null | undefined>) =>
  variables?.format ? `${key}:${variables.format}` : key;

describe('settings workspace actions', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:banji-test'),
      revokeObjectURL: vi.fn(),
    });

    window.banjiDesktop = {
      ...(window.banjiDesktop ?? {}),
      sena: {
        ...(window.banjiDesktop?.sena ?? {}),
        listObservations: vi.fn(async () => []),
        getCatalog: vi.fn(async () => ({
          skus: [{ skuId: 'sku-1', name: 'SKU 1' }],
          services: [],
          bundles: [],
          sharingMask: [],
        })),
        getWorkspaceSummary: vi.fn(async () => ({
          runId: 'run-1',
          skuSummaries: [],
        })),
        getDiagnostics: vi.fn(async () => ({ coverageEstimate: 0.91 })),
        getRunStatus: vi.fn(async () => ({ runId: 'run-1', status: 'succeeded' })),
      },
    } as typeof window.banjiDesktop;
  });

  it('skips anchor click navigation under jsdom while still exporting logs', async () => {
    const click = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        return { click, download: '', href: '' } as unknown as HTMLAnchorElement;
      }
      return document.createElement(tagName);
    });

    const message = await exportLogsAction('json', t as never);

    expect(message).toBe('settingsLogsExported:JSON');
    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:banji-test');
    expect(click).not.toHaveBeenCalled();
  });

  it('exports planning data without triggering jsdom document navigation', async () => {
    const click = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        return { click, download: '', href: '' } as unknown as HTMLAnchorElement;
      }
      return document.createElement(tagName);
    });

    const message = await exportPlanningDataAction('excel', t as never);

    expect(message).toBe('settingsParameterRunStatusExported:Excel');
    expect(window.banjiDesktop.sena.getCatalog).toHaveBeenCalledTimes(1);
    expect(window.banjiDesktop.sena.listObservations).toHaveBeenCalledTimes(1);
    expect(window.banjiDesktop.sena.getWorkspaceSummary).toHaveBeenCalledTimes(1);
    expect(window.banjiDesktop.sena.getDiagnostics).toHaveBeenCalledTimes(1);
    expect(window.banjiDesktop.sena.getRunStatus).toHaveBeenCalledWith({ runId: 'run-1' });
    expect(click).not.toHaveBeenCalled();
  });
});
