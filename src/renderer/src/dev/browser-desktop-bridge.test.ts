import { beforeEach, describe, expect, it } from 'vitest';
import {
  createMockAutomationWorkspace,
  createMockState,
  installBrowserDesktopBridge,
  resetBrowserDesktopBridgeMock,
} from './browser-desktop-bridge';

describe('installBrowserDesktopBridge', () => {
  beforeEach(() => {
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
});
