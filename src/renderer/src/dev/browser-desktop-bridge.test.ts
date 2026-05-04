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
    delete (window as Partial<Window>).kaurKhorDesktop;
    resetBrowserDesktopBridgeMock();
  });

  it('installs a seeded desktop bridge when preload is missing', async () => {
    installBrowserDesktopBridge();

    expect(window.kaurKhorDesktop).toBeDefined();

    const [context, preferences, catalog, summary] = await Promise.all([
      window.kaurKhorDesktop.system.getAppContext(),
      window.kaurKhorDesktop.preferences.get(),
      window.kaurKhorDesktop.sena.getCatalog(),
      window.kaurKhorDesktop.sena.getWorkspaceSummary(),
    ]);

    expect(context.platform).toBe('browser');
    expect(preferences.language).toBe('en');
    expect(catalog?.skus.length).toBeGreaterThan(0);
    expect(summary?.skuSummaries.length).toBeGreaterThan(0);
  });

  it('seeds the automation bridge and promotes mock intake into a ticket', async () => {
    installBrowserDesktopBridge();

    const workspace = await window.kaurKhorDesktop.automation!.getWorkspace();
    expect(workspace.connection.status).toBe('connected');
    expect(workspace.exposures.some((row) => row.exposed)).toBe(true);

    const result = await window.kaurKhorDesktop.automation!.promoteIntake({
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

    expect(state.catalog.skus).toHaveLength(10);
    expect(state.catalog.services).toHaveLength(10);
    expect(new Set(state.catalog.skus.map((sku) => sku.name)).size).toBe(10);
    expect(new Set(state.catalog.services.map((service) => service.name)).size).toBe(10);
    expect(state.catalog.skus.every((sku) => /[\u1780-\u17ff]/.test(sku.name))).toBe(true);
    expect(state.catalog.services.every((service) => /[\u1780-\u17ff]/.test(service.name))).toBe(true);
    expect(state.catalog.skus.every((sku) => sku.imagePath?.includes('kaur-khor-dev-sku-'))).toBe(true);
    expect(state.catalog.services.every((service) => service.imagePath?.includes('kaur-khor-dev-service-'))).toBe(true);
    expect(state.workspaceSummary.skuCount).toBe(10);
    expect(state.workspaceSummary.serviceCount).toBe(10);
    expect(Object.keys(state.skuDetails)).toHaveLength(10);
    expect(Object.keys(state.serviceDetails)).toHaveLength(10);
    expect(state.automation.connection.status).toBe('connected');
    expect(state.automationMessages['conv-demo']).toHaveLength(1);
    expect(state.automation.intakes[0]?.intakeId).toBe('intake-demo');
    expect(state.orderBatches.some((batch) => batch.status === 'awaiting_receipt')).toBe(true);
  });

  it('builds automation workspace fixtures with exposed sellables', () => {
    const workspace = createMockAutomationWorkspace();

    expect(workspace.connection.botUsername).toBe('kaur_khor_demo_bot');
    expect(workspace.exposures.some((row) => row.entityType === 'sku' && row.exposed)).toBe(true);
    expect(workspace.metrics.exposedSellables).toBeGreaterThan(0);
  });

  it('supports current order-batch reads and edits in the browser bridge', async () => {
    installBrowserDesktopBridge();

    const batches = await window.kaurKhorDesktop.sena.listOrderBatches();
    expect(batches.length).toBeGreaterThan(0);

    const firstChild = batches[0]?.children[0];
    expect(firstChild).toBeTruthy();
    if (!firstChild) {
      return;
    }

    const updatedBatch = await window.kaurKhorDesktop.sena.updateOrderChild({
      childOrderId: firstChild.childOrderId,
      overrides: { receivedQuantity: 6, receiptTimestamp: '2026-04-11T00:00:00.000Z' },
      status: 'received',
    });

    expect(updatedBatch.children.find((child) => child.childOrderId === firstChild.childOrderId)?.effective.receivedQuantity).toBe(6);
    expect(
      await window.kaurKhorDesktop.sena.listOrderBatches({ childOrderId: firstChild.childOrderId }),
    ).toHaveLength(1);
  });

  it('recomputes browser SENA run summary and detail from current observations', async () => {
    installBrowserDesktopBridge();

    const before = await window.kaurKhorDesktop.sena.getWorkspaceSummary();
    const observation = await window.kaurKhorDesktop.sena.ingestObservation({
      observedAt: '2026-05-02T00:00:00.000Z',
      stockSnapshot: [{
        skuId: 'sku-001',
        unitsInStock: 0,
        costPerUnit: 18,
        productPrice: 42,
      }],
      retailSalesSnapshot: [{
        skuId: 'sku-001',
        unitsSold: 1000,
      }],
      serviceSalesSnapshot: [],
      serviceRankings: [],
      retailRankings: ['sku-001'],
      serviceStockouts: [],
      retailStockouts: ['sku-001'],
      orderSignals: [],
      servicePrices: [],
      retailPrices: [],
      leadTimeHints: [{
        skuId: 'sku-001',
        typicalDays: 5,
        lowDays: 4,
        highDays: 6,
        variabilityClass: 'tight',
      }],
      regimeHint: 'stockout_constrained',
      notes: null,
    });
    const run = await window.kaurKhorDesktop.sena.triggerRun();
    const after = await window.kaurKhorDesktop.sena.getWorkspaceSummary();
    const detailPage = await window.kaurKhorDesktop.sena.getSkuDetail({ skuId: 'sku-001', limit: 5 });

    expect(observation.observationId).toBeTruthy();
    expect(run.status).toBe('succeeded');
    expect(run.summary?.runId).toBe(run.runId);
    expect(after?.runId).toBe(run.runId);
    expect(after?.intervalCount).toBe(run.observationCount);
    expect(after?.intervalCount ?? 0).toBeGreaterThan(before?.intervalCount ?? 0);
    expect(detailPage?.detail.summary.skuId).toBe('sku-001');
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
            text: 'ខ្ញុំចង់បានក្រមា 2',
            chat: { id: 99, username: 'customer' },
            from: { username: 'customer', first_name: 'Dara' },
          },
        }],
      })));
    vi.stubGlobal('fetch', fetchMock);
    installBrowserDesktopBridge();

    await window.kaurKhorDesktop.automation!.saveConnection({
      channel: 'telegram',
      botToken: 'browser-token',
      status: 'connected',
    });
    const connection = await window.kaurKhorDesktop.automation!.testTelegramConnection();
    const workspace = await window.kaurKhorDesktop.automation!.getWorkspace();

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

    await window.kaurKhorDesktop.automation!.saveConnection({
      channel: 'telegram',
      botToken: 'browser-token',
      status: 'connected',
    });
    await expect(window.kaurKhorDesktop.automation!.testTelegramConnection()).rejects.toThrow(
      'Telegram browser fetch was blocked or unavailable.',
    );

    const connection = await window.kaurKhorDesktop.automation!.getConnection();
    expect(connection.status).toBe('error');
    expect(connection.lastErrorMessage).toContain('browser fetch was blocked');
  });
});
