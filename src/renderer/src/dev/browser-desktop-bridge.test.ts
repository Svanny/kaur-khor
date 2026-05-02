import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockAutomationWorkspace,
  createMockState,
  installBrowserDesktopBridge,
  resetBrowserDesktopBridgeMock,
} from './browser-desktop-bridge';

describe('installBrowserDesktopBridge', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (window as Partial<Window>).banjiDesktop;
    resetBrowserDesktopBridgeMock();
  });

  it('installs a seeded desktop bridge when preload is missing', async () => {
    installBrowserDesktopBridge();

    expect(window.banjiDesktop).toBeDefined();

    const [context, preferences, catalog, summary] = await Promise.all([
      window.banjiDesktop.system.getAppContext(),
      window.banjiDesktop.preferences.get(),
      window.banjiDesktop.sena.getCatalog(),
      window.banjiDesktop.sena.getWorkspaceSummary(),
    ]);

    expect(context.platform).toBe('browser');
    expect(preferences.language).toBe('en');
    expect(catalog?.skus.length).toBeGreaterThan(0);
    expect(summary?.skuSummaries.length).toBeGreaterThan(0);
  });

  it('seeds the automation bridge and promotes mock intake into a ticket', async () => {
    installBrowserDesktopBridge();

    const workspace = await window.banjiDesktop.automation!.getWorkspace();
    expect(workspace.connection.status).toBe('connected');
    expect(workspace.exposures.some((row) => row.exposed)).toBe(true);

    const result = await window.banjiDesktop.automation!.promoteIntake({
      intakeId: 'intake-demo',
      mode: 'create_ticket',
    });

    expect(result.intake.status).toBe('ticketed');
    expect(result.intake.promotedTicketId).toBeTruthy();
    expect(result.ticketEvent.ticketId).toBe(result.intake.promotedTicketId);
    expect(result.commercialEvents.length).toBeGreaterThan(0);
  });

  it('builds a seeded browser mock state with automation workspace data', () => {
    const state = createMockState();

    expect(state.automation.connection.status).toBe('connected');
    expect(state.automationMessages['conv-demo']).toHaveLength(1);
    expect(state.automation.intakes[0]?.intakeId).toBe('intake-demo');
    expect(state.orderBatches.some((batch) => batch.status === 'awaiting_receipt')).toBe(true);
  });

  it('builds automation workspace fixtures with exposed sellables', () => {
    const workspace = createMockAutomationWorkspace();

    expect(workspace.connection.botUsername).toBe('banji_demo_bot');
    expect(workspace.exposures.some((row) => row.entityType === 'sku' && row.exposed)).toBe(true);
    expect(workspace.metrics.exposedSellables).toBeGreaterThan(0);
  });

  it('supports current order-batch reads and edits in the browser bridge', async () => {
    installBrowserDesktopBridge();

    const batches = await window.banjiDesktop.sena.listOrderBatches();
    expect(batches.length).toBeGreaterThan(0);

    const firstChild = batches[0]?.children[0];
    expect(firstChild).toBeTruthy();
    if (!firstChild) {
      return;
    }

    const updatedBatch = await window.banjiDesktop.sena.updateOrderChild({
      childOrderId: firstChild.childOrderId,
      overrides: { receivedQuantity: 6, receiptTimestamp: '2026-04-11T00:00:00.000Z' },
      status: 'received',
    });

    expect(updatedBatch.children.find((child) => child.childOrderId === firstChild.childOrderId)?.effective.receivedQuantity).toBe(6);
    expect(
      await window.banjiDesktop.sena.listOrderBatches({ childOrderId: firstChild.childOrderId }),
    ).toHaveLength(1);
  });

  it('recomputes browser SENA run summary and detail from current observations', async () => {
    installBrowserDesktopBridge();

    const before = await window.banjiDesktop.sena.getWorkspaceSummary();
    const observation = await window.banjiDesktop.sena.ingestObservation({
      observedAt: '2026-05-02T00:00:00.000Z',
      stockSnapshot: [{
        skuId: 'sku-1',
        unitsInStock: 0,
        costPerUnit: 18,
        productPrice: 42,
      }],
      retailSalesSnapshot: [{
        skuId: 'sku-1',
        unitsSold: 1000,
      }],
      serviceSalesSnapshot: [],
      serviceRankings: [],
      retailRankings: ['sku-1'],
      serviceStockouts: [],
      retailStockouts: ['sku-1'],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [{
        skuId: 'sku-1',
        typicalDays: 5,
        lowDays: 4,
        highDays: 6,
        variabilityClass: 'tight',
      }],
      regimeHint: 'stockout_constrained',
      notes: null,
    });
    const run = await window.banjiDesktop.sena.triggerRun();
    const after = await window.banjiDesktop.sena.getWorkspaceSummary();
    const detailPage = await window.banjiDesktop.sena.getSkuDetail({ skuId: 'sku-1', limit: 5 });

    expect(observation.observationId).toBeTruthy();
    expect(run.status).toBe('succeeded');
    expect(run.summary?.runId).toBe(run.runId);
    expect(after?.runId).toBe(run.runId);
    expect(after?.intervalCount).toBe(run.observationCount);
    expect(after?.intervalCount ?? 0).toBeGreaterThan(before?.intervalCount ?? 0);
    expect(detailPage?.detail.summary.skuId).toBe('sku-1');
    expect(detailPage?.detail.summary.stockoutRisk).toBeGreaterThanOrEqual(0);
    expect(detailPage?.detail.demandPosterior.at(-1)?.retailDemandMean).toBeGreaterThan(0);
  });

  it('polls Telegram directly in browser mode and stages messages as needs-review intake', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, result: { id: 123, username: 'shop_bot' } })))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        result: [{
          update_id: 42,
          message: {
            message_id: 7,
            date: 1770000000,
            text: 'two scarves please',
            chat: { id: 99, username: 'customer' },
            from: { username: 'customer', first_name: 'Dara' },
          },
        }],
      })));
    vi.stubGlobal('fetch', fetchMock);
    installBrowserDesktopBridge();

    await window.banjiDesktop.automation!.saveConnection({
      channel: 'telegram',
      botToken: 'browser-token',
      status: 'connected',
    });
    const connection = await window.banjiDesktop.automation!.testTelegramConnection();
    const workspace = await window.banjiDesktop.automation!.getWorkspace();

    expect(connection.status).toBe('connected');
    expect(workspace.intakes.some((intake) => intake.intakeId === 'browser-telegram-intake-42')).toBe(true);
    expect(workspace.metrics.needsReview).toBeGreaterThan(0);
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.telegram.org/botbrowser-token/getUpdates',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('marks browser Telegram polling as browser-blocked when fetch is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    installBrowserDesktopBridge();

    await window.banjiDesktop.automation!.saveConnection({
      channel: 'telegram',
      botToken: 'browser-token',
      status: 'connected',
    });
    await expect(window.banjiDesktop.automation!.testTelegramConnection()).rejects.toThrow(
      'Telegram browser fetch was blocked or unavailable.',
    );

    const connection = await window.banjiDesktop.automation!.getConnection();
    expect(connection.status).toBe('error');
    expect(connection.lastErrorMessage).toContain('browser fetch was blocked');
  });
});
