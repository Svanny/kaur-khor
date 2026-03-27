import { useEffect, useState } from 'react';
import { Route, Routes } from 'react-router-dom';
import type { DesktopAppContext } from '@shared/ipc';
import { BanjiShell } from '@/components/banji-shell';
import { DashboardRoute } from '@/routes/dashboard';
import { InventoryRoute } from '@/routes/inventory';
import { RankingRoute } from '@/routes/ranking';
import { ServiceFormRoute } from '@/routes/service-form';
import { SettingsRoute } from '@/routes/settings';
import { SkuFormRoute } from '@/routes/sku-form';
import { StockUpdateRoute } from '@/routes/stock-update';
import { PreferencesProvider } from '@/state/preferences';
import { InventoryProvider } from '@/state/inventory';

function AppFrame() {
  return (
    <BanjiShell>
      <Routes>
        <Route element={<DashboardRoute />} path="/" />
        <Route element={<InventoryRoute />} path="/inventory" />
        <Route element={<SkuFormRoute />} path="/inventory/skus/new" />
        <Route element={<SkuFormRoute />} path="/inventory/skus/:skuId" />
        <Route element={<ServiceFormRoute />} path="/inventory/services/new" />
        <Route element={<ServiceFormRoute />} path="/inventory/services/:serviceId" />
        <Route element={<StockUpdateRoute />} path="/inventory/stock" />
        <Route element={<RankingRoute />} path="/inventory/ranking" />
        <Route element={<SettingsRoute />} path="/settings" />
      </Routes>
    </BanjiShell>
  );
}

function LoadedApp() {
  return (
    <PreferencesProvider>
      <InventoryProvider>
        <AppFrame />
      </InventoryProvider>
    </PreferencesProvider>
  );
}

export default function App() {
  const [desktopContext, setDesktopContext] = useState<DesktopAppContext | null>(null);

  useEffect(() => {
    let mounted = true;
    window.banjiDesktop.system.getAppContext().then((context) => {
      if (mounted) {
        setDesktopContext(context);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!desktopContext) {
    return (
      <div className="flex min-h-svh items-center justify-center px-6">
        <div className="hero-mesh editorial-panel w-full max-w-md rounded-[32px] p-8 text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
            Banji
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
            Loading desktop shell…
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Warming up the local workspace and syncing the latest inventory snapshot.
          </p>
        </div>
      </div>
    );
  }

  return <LoadedApp />;
}
