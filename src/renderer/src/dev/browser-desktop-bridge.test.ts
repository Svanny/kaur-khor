import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createMockAutomationWorkspace,
  createEmptyBrowserMockState,
  createMockState,
  browserStateForSenaPersistence,
  installBrowserDesktopBridge,
  normalizeBrowserDesktopPreferences,
  resetBrowserDesktopBridgeMock,
  setBrowserDesktopBridgeMockState,
} from './browser-desktop-bridge';

describe('installBrowserDesktopBridge', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    delete (window as Partial<Window>).kaurKhorDesktop;
    resetBrowserDesktopBridgeMock();
  });

  it('installs a blank desktop bridge when preload is missing', async () => {
    installBrowserDesktopBridge();

    expect(window.kaurKhorDesktop).toBeDefined();

    const [context, preferences, catalog, summary] = await Promise.all([
      window.kaurKhorDesktop.system.getAppContext(),
      window.kaurKhorDesktop.preferences.get(),
      window.kaurKhorDesktop.sena.getCatalog(),
      window.kaurKhorDesktop.sena.getWorkspaceSummary(),
    ]);

    expect(context.platform).toBe('web');
    expect(preferences.language).toBe('en');
    expect(catalog).toBeNull();
    expect(summary).toBeNull();
    await expect(window.kaurKhorDesktop.sena.getStartupWorkspace()).resolves.toMatchObject({
      catalog: null,
      workspaceSummary: null,
      latestRun: null,
      observationFingerprint: expect.objectContaining({ count: 0 }),
    });
  });

  it('announces mock preference changes to embedded browser chrome listeners', async () => {
    const listener = vi.fn();
    window.addEventListener('kaur-khor-browser-state-changed', listener);
    installBrowserDesktopBridge();

    try {
      await window.kaurKhorDesktop.preferences.save({ language: 'km' });

      expect(listener).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('kaur-khor-browser-state-changed', listener);
    }
  });

  it('normalizes dirty browser preference saves before persisting them', async () => {
    installBrowserDesktopBridge();

    const preferences = await window.kaurKhorDesktop.preferences.save({
      language: 'bad',
      currency: 'bad',
      usdToKhrExchangeRate: Number.NaN,
    } as never);

    expect(preferences).toMatchObject({
      language: 'en',
      currency: 'USD',
      usdToKhrExchangeRate: 4000,
    });
    await expect(window.kaurKhorDesktop.preferences.get()).resolves.toMatchObject({
      language: 'en',
      currency: 'USD',
      usdToKhrExchangeRate: 4000,
    });
  });

  it('clears seeded mock state through the browser system bridge', async () => {
    setBrowserDesktopBridgeMockState(createMockState());
    installBrowserDesktopBridge();

    await window.kaurKhorDesktop.system.clearCurrentData();

    const catalog = await window.kaurKhorDesktop.sena.getCatalog();
    const workspace = await window.kaurKhorDesktop.sena.getStartupWorkspace();
    const automation = await window.kaurKhorDesktop.automation!.getWorkspace();

    expect(catalog).toBeNull();
    expect(workspace.catalog).toBeNull();
    expect(workspace.workspaceSummary).toBeNull();
    expect(workspace.latestRun).toBeNull();
    expect(workspace.observationFingerprint.count).toBe(0);
    expect(automation.intakes).toHaveLength(0);
    expect(automation.exposures).toHaveLength(0);
  });

  it('normalizes restored browser preferences before renderer hydration can read them', () => {
    const fallback = createMockState().preferences;

    expect(normalizeBrowserDesktopPreferences({
      language: 'dirty',
      currency: 'dirty',
      showAutomationsPage: 'yes',
      onboardingCompletedAt: '2026-02-30T00:00:00.000Z',
      seenUnlockedNavItems: {
        catalog: 'yes',
        insights: true,
      },
    }, fallback)).toMatchObject({
      language: 'en',
      currency: 'USD',
      showAutomationsPage: fallback.showAutomationsPage,
      onboardingCompletedAt: null,
      seenUnlockedNavItems: {
        catalog: false,
        insights: true,
        work: false,
      },
    });
  });

  it('seeds the automation bridge and promotes mock intake into a ticket', async () => {
    const state = createMockState();
    state.automation.intakes[0] = {
      ...state.automation.intakes[0]!,
      status: 'quoted',
    };
    state.automation.conversations[0] = {
      ...state.automation.conversations[0]!,
      latestIntakeStatus: 'quoted',
    };
    setBrowserDesktopBridgeMockState(state);
    installBrowserDesktopBridge();

    const workspace = await window.kaurKhorDesktop.automation!.getWorkspace();
    expect(workspace.connection.status).toBe('connected');
    expect(workspace.exposures.some((row) => row.exposed)).toBe(true);

    const result = await window.kaurKhorDesktop.automation!.promoteIntake({
      customerIdentityOverride: {
        customerName: 'Dara   Browser',
        phone: '012345678',
      },
      intakeId: 'intake-demo',
      mode: 'create_ticket',
    });

    expect(result.intake.status).toBe('ticketed');
    expect(result.intake.promotedTicketId).toBeTruthy();
    expect(result.ticketEvent.ticketId).toBe(result.intake.promotedTicketId);
    expect(result.ticketEvent.party).toMatchObject({
      customerName: 'Dara   Browser',
      customerNameKey: 'dara browser',
      phone: '+855 12345678',
      phoneKey: '+85512345678',
    });
    expect(result.commercialEvents.length).toBeGreaterThan(0);

    const updatedWorkspace = await window.kaurKhorDesktop.automation!.getWorkspace();
    expect(updatedWorkspace.metrics.ticketedToday).toBe(1);
  });

  it('rejects browser automation promotion before every line is promotable', async () => {
    const state = createMockState();
    state.automation.intakes[0] = {
      ...state.automation.intakes[0]!,
      status: 'needs_review',
      quotedTotal: null,
      lines: [{
        ...state.automation.intakes[0]!.lines[0]!,
        entityId: null,
        lineTotal: null,
        quantity: null,
        unitPrice: null,
      }],
    };
    setBrowserDesktopBridgeMockState(state);
    installBrowserDesktopBridge();

    await expect(window.kaurKhorDesktop.automation!.promoteIntake({
      intakeId: 'intake-demo',
      mode: 'create_ticket',
    })).rejects.toThrow('Only quoted automation intakes can be promoted to customer tickets.');

    const workspace = await window.kaurKhorDesktop.automation!.getWorkspace();
    expect(workspace.intakes[0]).toMatchObject({
      intakeId: 'intake-demo',
      promotedTicketId: null,
      status: 'needs_review',
    });
    expect(workspace.metrics.needsReview).toBe(1);
    expect(workspace.metrics.ticketedToday).toBe(0);
  });

  it('rejects browser automation append without a target ticket', async () => {
    const state = createMockState();
    state.automation.intakes[0] = {
      ...state.automation.intakes[0]!,
      status: 'quoted',
    };
    setBrowserDesktopBridgeMockState(state);
    installBrowserDesktopBridge();

    await expect(window.kaurKhorDesktop.automation!.promoteIntake({
      intakeId: 'intake-demo',
      mode: 'append_ticket',
    })).rejects.toThrow('Appending Telegram intake requires a target customer ticket.');
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

  it('keeps empty browser workspaces free of seeded records', () => {
    const state = createEmptyBrowserMockState();

    expect(state.catalog.skus).toHaveLength(0);
    expect(state.catalog.services).toHaveLength(0);
    expect(state.observations).toHaveLength(0);
    expect(state.orderBatches).toHaveLength(0);
    expect(Object.keys(state.skuDetails)).toHaveLength(0);
    expect(Object.keys(state.serviceDetails)).toHaveLength(0);
    expect(state.automation.intakes).toHaveLength(0);
    expect(state.automation.conversations).toHaveLength(0);
    expect(state.automation.exposures).toHaveLength(0);
    expect(Object.keys(state.automationMessages)).toHaveLength(0);
    expect(state.preferences.showAutomationsPage).toBe(true);
    expect(state.preferences.customShowAutomationsPage).toBe(true);
    expect(browserStateForSenaPersistence(state)).toMatchObject({
      catalog: null,
      workspaceSummary: null,
      latestRun: null,
      diagnostics: null,
    });
  });

  it('exposes catalog but no SENA run artifacts when products exist before the first update', async () => {
    const state = createEmptyBrowserMockState();
    state.catalog = createMockState().catalog;
    setBrowserDesktopBridgeMockState(state);
    installBrowserDesktopBridge();

    const workspace = await window.kaurKhorDesktop.sena.getStartupWorkspace();

    expect(workspace.catalog?.skus.length).toBeGreaterThan(0);
    expect(workspace.workspaceSummary).toBeNull();
    expect(workspace.latestRun).toBeNull();
    expect(workspace.observationFingerprint.count).toBe(0);
    expect(browserStateForSenaPersistence(state).catalog?.skus.length).toBeGreaterThan(0);
    expect(browserStateForSenaPersistence(state).workspaceSummary).toBeNull();
  });

  it('builds automation workspace fixtures with exposed sellables', () => {
    const workspace = createMockAutomationWorkspace();

    expect(workspace.connection.botUsername).toBe('kaur_khor_demo_bot');
    expect(workspace.exposures.some((row) => row.entityType === 'sku' && row.exposed)).toBe(true);
    expect(workspace.metrics.exposedSellables).toBeGreaterThan(0);
  });

  it('counts only eligible exposed sellables in browser automation metrics', async () => {
    const state = createMockState();
    state.automation.exposures.push({
      entityType: 'sku',
      entityId: 'sku-unpriced',
      label: 'Unpriced archived row',
      imagePath: null,
      supplierName: null,
      archived: true,
      exposed: true,
      price: null,
      availabilityStatus: 'hidden',
      availabilityLabel: 'Hidden',
      alias: null,
      sortOrder: 2,
    });
    state.automation.metrics.exposedSellables = 99;
    setBrowserDesktopBridgeMockState(state);
    installBrowserDesktopBridge();

    const workspace = await window.kaurKhorDesktop.automation!.getWorkspace();
    expect(workspace.exposures.some((row) => row.entityId === 'sku-unpriced' && row.exposed)).toBe(true);
    expect(workspace.metrics.exposedSellables).toBe(2);

    await window.kaurKhorDesktop.automation!.patchExposureRow({
      entityType: 'sku',
      entityId: 'sku-001',
      exposed: false,
    });

    const updatedWorkspace = await window.kaurKhorDesktop.automation!.getWorkspace();
    expect(updatedWorkspace.metrics.exposedSellables).toBe(1);
  });

  it('excludes dirty browser automation timestamps from today metrics', async () => {
    const state = createMockState();
    state.automation.intakes = [{
      ...state.automation.intakes[0]!,
      createdAt: 'not-a-date',
      intakeId: 'dirty-intake',
      status: 'quoted',
      updatedAt: 'not-a-date',
    }];
    setBrowserDesktopBridgeMockState(state);
    installBrowserDesktopBridge();

    const workspace = await window.kaurKhorDesktop.automation!.getWorkspace();

    expect(workspace.metrics.ordersToday).toBe(0);
    expect(workspace.metrics.quotedToday).toBe(0);
    expect(workspace.metrics.ticketedToday).toBe(0);
    expect(workspace.metrics.completedToday).toBe(0);
  });

  it('ignores dirty browser observation timestamps when syncing mock summaries', async () => {
    const state = createMockState();
    state.observations = [
      {
        ...state.observations[0]!,
        observationId: 'dirty-observation',
        input: {
          ...state.observations[0]!.input,
          observedAt: 'not-a-date',
        },
      },
      {
        ...state.observations[0]!,
        observationId: 'valid-observation',
        input: {
          ...state.observations[0]!.input,
          observedAt: '2026-05-03T00:00:00.000Z',
        },
      },
      {
        ...state.observations[0]!,
        observationId: 'delete-me',
        input: {
          ...state.observations[0]!.input,
          observedAt: '2026-05-01T00:00:00.000Z',
        },
      },
    ];
    setBrowserDesktopBridgeMockState(state);
    installBrowserDesktopBridge();

    await window.kaurKhorDesktop.sena.deleteObservation({ observationId: 'delete-me' });
    const summary = await window.kaurKhorDesktop.sena.getWorkspaceSummary();

    expect(summary?.latestObservedAt).toBe('2026-05-03T00:00:00.000Z');
  });

  it('supports current order-batch reads and edits in the browser bridge', async () => {
    setBrowserDesktopBridgeMockState(createMockState());
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
    expect(
      await window.kaurKhorDesktop.sena.listOrderBatches({ childOrderId: ` ${firstChild.childOrderId} ` }),
    ).toHaveLength(1);
    await expect(window.kaurKhorDesktop.sena.updateOrderBatch({
      batchOrderId: batches[0]!.batchOrderId,
      status: 'dirty',
    } as never)).rejects.toThrow('SENA order batch update requires a supported status.');
    await expect(window.kaurKhorDesktop.sena.updateOrderChild({
      childOrderId: firstChild.childOrderId,
      status: 'dirty',
    } as never)).rejects.toThrow('SENA order child update requires a supported status.');
  });

  it('normalizes browser SENA read payloads before filtering or paging', async () => {
    setBrowserDesktopBridgeMockState(createMockState());
    installBrowserDesktopBridge();

    await expect(window.kaurKhorDesktop.sena.listObservationPage({ limit: Number.NaN } as never))
      .rejects.toThrow('SENA observation page limit must be a positive finite number.');
    await expect(window.kaurKhorDesktop.sena.listObservationPage({ beforeObservedAt: 'not-a-date' } as never))
      .rejects.toThrow('SENA observation page cursor timestamp must be an ISO timestamp or null.');
    await expect(window.kaurKhorDesktop.sena.listOrderBatches({ status: 'dirty' } as never))
      .rejects.toThrow('SENA order lookup requires a supported status.');

    const page = await window.kaurKhorDesktop.sena.listObservationPage({ limit: 2 });
    expect(page.observations).toHaveLength(2);
  });

  it('recomputes browser SENA run summary and detail from current observations', async () => {
    setBrowserDesktopBridgeMockState(createMockState());
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
