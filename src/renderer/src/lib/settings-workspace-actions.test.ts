import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportLogsAction, exportPlanningDataAction } from './settings-workspace-actions';

const t = (key: string, variables?: Record<string, string | number | null | undefined>) =>
  variables?.format ? `${key}:${variables.format}` : key;

async function exportedBlobText() {
  const blob = vi.mocked(URL.createObjectURL).mock.calls.at(-1)?.[0] as Blob | undefined;
  if (!blob) {
    throw new Error('Expected an exported blob');
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result)));
    reader.addEventListener('error', () => reject(reader.error));
    reader.readAsText(blob);
  });
}

describe('settings workspace actions', () => {
  beforeEach(() => {
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:Kaur Khor-test'),
      revokeObjectURL: vi.fn(),
    });

    window.kaurKhorDesktop = {
      ...(window.kaurKhorDesktop ?? {}),
      sena: {
        ...(window.kaurKhorDesktop?.sena ?? {}),
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
    } as unknown as typeof window.kaurKhorDesktop;
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
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:Kaur Khor-test');
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
    expect(window.kaurKhorDesktop.sena.getCatalog).toHaveBeenCalledTimes(1);
    expect(window.kaurKhorDesktop.sena.listObservations).toHaveBeenCalledTimes(1);
    expect(window.kaurKhorDesktop.sena.getWorkspaceSummary).toHaveBeenCalledTimes(1);
    expect(window.kaurKhorDesktop.sena.getDiagnostics).toHaveBeenCalledTimes(1);
    expect(window.kaurKhorDesktop.sena.getRunStatus).toHaveBeenCalledWith({ runId: 'run-1' });
    expect(click).not.toHaveBeenCalled();
  });

  it('prefixes formula-leading CSV cells while preserving CSV quoting', async () => {
    window.kaurKhorDesktop.sena.getCatalog = vi.fn(async () => ({
      skus: [
        {
          skuId: 'sku-1',
          name: '=SUM(1,2)',
          notes: '+1',
          payload: '-1',
          tabFormula: '\t=SUM(1,2)',
          spaceFormula: ' @foo',
          crlfFormula: '\r\n-1',
        },
        {
          skuId: 'sku-2',
          name: '@foo',
        },
      ],
      services: [],
      bundles: [],
      sharingMask: [],
    })) as never;
    window.kaurKhorDesktop.sena.listObservations = vi.fn(async () => [
      {
        observationId: 'obs-1',
        ownerSub: 'owner-1',
        input: {
          observedAt: '2026-04-30T00:00:00.000Z',
          stockSnapshot: [],
          serviceRankings: [],
          retailRankings: [],
          serviceStockouts: [],
          retailStockouts: [],
          orderSignals: [],
          servicePrices: [],
          retailPrices: [],
          leadTimeHints: [],
          notes: '@foo',
        },
      },
    ]) as never;

    await exportPlanningDataAction('csv', t as never);

    const csv = await exportedBlobText();
    expect(csv).toContain(`"'=SUM(1,2)"`);
    expect(csv).toContain("'+1");
    expect(csv).toContain("'-1");
    expect(csv).toContain("'@foo");
    expect(csv).toContain(`'\t=SUM(1,2)`);
    expect(csv).toContain("' @foo");
    expect(csv).toContain(`"'\r\n-1"`);
  });
});
