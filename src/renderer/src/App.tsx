import { useEffect, useState } from 'react';
import { generatePath, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import type { DesktopAppContext } from '@shared/ipc';
import { BanjiShell } from '@/components/banji-shell';
import { DashboardRoute } from '@/routes/dashboard';
import { InventoryRoute } from '@/routes/inventory';
import { PlanningRoute } from '@/routes/planning';
import { ServiceDetailRoute } from '@/routes/service-detail';
import { ServiceFormRoute } from '@/routes/service-form';
import { SettingsRoute } from '@/routes/settings';
import { SkuDetailRoute } from '@/routes/sku-detail';
import { SkuFormRoute } from '@/routes/sku-form';
import { StockUpdateRoute } from '@/routes/stock-update';
import { StockUpdateSessionRoute } from '@/routes/stock-update-session';
import { PreferencesProvider } from '@/state/preferences';
import { InventoryProvider } from '@/state/inventory';
import { OperationsSessionProvider } from '@/state/operations-session';

function LegacyInventoryRedirect({ to }: { to: string }) {
  const location = useLocation();
  const params = useParams();

  return (
    <Navigate
      replace
      to={{
        pathname: generatePath(to, params),
        search: location.search,
      }}
    />
  );
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<DashboardRoute />} path="/" />
      <Route element={<LegacyInventoryRedirect to="/catalog" />} path="/inventory" />
      <Route element={<LegacyInventoryRedirect to="/catalog/skus/new" />} path="/inventory/skus/new" />
      <Route
        element={<LegacyInventoryRedirect to="/catalog/skus/:skuId/edit" />}
        path="/inventory/skus/:skuId"
      />
      <Route
        element={<LegacyInventoryRedirect to="/catalog/services/new" />}
        path="/inventory/services/new"
      />
      <Route
        element={<LegacyInventoryRedirect to="/catalog/services/:serviceId/edit" />}
        path="/inventory/services/:serviceId"
      />
      <Route element={<LegacyInventoryRedirect to="/operations" />} path="/inventory/stock" />
      <Route
        element={<LegacyInventoryRedirect to="/operations/session" />}
        path="/inventory/stock/session"
      />
      <Route element={<LegacyInventoryRedirect to="/planning" />} path="/inventory/ranking" />
      <Route element={<InventoryRoute />} path="/catalog" />
      <Route element={<SkuFormRoute />} path="/catalog/skus/new" />
      <Route element={<SkuDetailRoute />} path="/catalog/skus/:skuId" />
      <Route element={<SkuFormRoute />} path="/catalog/skus/:skuId/edit" />
      <Route element={<ServiceFormRoute />} path="/catalog/services/new" />
      <Route element={<ServiceDetailRoute />} path="/catalog/services/:serviceId" />
      <Route element={<ServiceFormRoute />} path="/catalog/services/:serviceId/edit" />
      <Route element={<StockUpdateRoute />} path="/operations" />
      <Route element={<StockUpdateSessionRoute />} path="/operations/session" />
      <Route element={<PlanningRoute />} path="/planning" />
      <Route element={<SettingsRoute />} path="/settings" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}

function AppFrame() {
  return (
    <BanjiShell>
      <AppRoutes />
    </BanjiShell>
  );
}

function LoadedApp() {
  return (
    <PreferencesProvider>
      <InventoryProvider>
        <OperationsSessionProvider>
          <AppFrame />
        </OperationsSessionProvider>
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
