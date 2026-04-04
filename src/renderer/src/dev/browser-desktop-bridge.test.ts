import { beforeEach, describe, expect, it } from 'vitest';
import { installBrowserDesktopBridge, resetBrowserDesktopBridgeMock } from './browser-desktop-bridge';

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
});
