import { useEffect, useState } from 'react';
import { generatePath, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import type { DesktopAppContext } from '@shared/ipc';
import { BanjiShell } from '@/components/banji-shell';
import { CommandPaletteProvider } from '@/components/command-palette';
import { AnalysisRoute } from '@/routes/analysis';
import { ArchiveRoute } from '@/routes/archive';
import { DashboardRoute } from '@/routes/dashboard';
import { HelpRoute } from '@/routes/help';
import { InventoryRoute } from '@/routes/inventory';
import { PerformanceRoute } from '@/routes/performance';
import { RecordUpdateHubRoute } from '@/routes/record-update-hub';
import { ServiceDetailRoute } from '@/routes/service-detail';
import { ServiceFormRoute } from '@/routes/service-form';
import { SettingsRoute } from '@/routes/settings';
import { SkuDetailRoute } from '@/routes/sku-detail';
import { SkuFormRoute } from '@/routes/sku-form';
import { StockUpdateRoute } from '@/routes/stock-update';
import { StockUpdateSessionRoute } from '@/routes/stock-update-session';
import { RECORD_UPDATE_HUB_PATH, RECORD_UPDATE_LANES, RECORD_UPDATE_STOCK_COUNT_PATH } from '@/lib/record-update-routes';
import { PreferencesProvider } from '@/state/preferences';
import { InventoryProvider } from '@/state/inventory';
import { NavigationHistoryProvider } from '@/state/navigation-history';

function RedirectWithSearch({ to }: { to: string }) {
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
      <Route element={<AnalysisRoute />} path="/analysis" />
      <Route element={<RecordUpdateHubRoute />} path={RECORD_UPDATE_HUB_PATH} />
      {RECORD_UPDATE_LANES.map((lane) => (
        <Route key={lane.id} element={<StockUpdateSessionRoute />} path={lane.path} />
      ))}
      <Route element={<PerformanceRoute />} path="/performance" />
      <Route element={<RedirectWithSearch to="/catalog" />} path="/inventory" />
      <Route element={<RedirectWithSearch to="/catalog/skus/new" />} path="/inventory/skus/new" />
      <Route element={<RedirectWithSearch to="/catalog/skus/:skuId" />} path="/inventory/skus/:skuId" />
      <Route element={<RedirectWithSearch to="/catalog/services/new" />} path="/inventory/services/new" />
      <Route
        element={<RedirectWithSearch to="/catalog/services/:serviceId" />}
        path="/inventory/services/:serviceId"
      />
      <Route element={<RedirectWithSearch to="/operations" />} path="/inventory/stock" />
      <Route element={<RedirectWithSearch to={RECORD_UPDATE_STOCK_COUNT_PATH} />} path="/inventory/stock/session" />
      <Route element={<RedirectWithSearch to="/operations" />} path="/inventory/ranking" />
      <Route element={<RedirectWithSearch to="/operations" />} path="/planning" />
      <Route element={<RedirectWithSearch to="/operations" />} path="/sist" />
      <Route element={<InventoryRoute />} path="/catalog" />
      <Route element={<HelpRoute />} path="/help" />
      <Route element={<SkuFormRoute />} path="/catalog/skus/new" />
      <Route element={<SkuDetailRoute />} path="/catalog/skus/:skuId" />
      <Route element={<SkuFormRoute />} path="/catalog/skus/:skuId/edit" />
      <Route element={<ServiceFormRoute />} path="/catalog/services/new" />
      <Route element={<ServiceDetailRoute />} path="/catalog/services/:serviceId" />
      <Route element={<ServiceFormRoute />} path="/catalog/services/:serviceId/edit" />
      <Route element={<StockUpdateRoute />} path="/operations" />
      <Route element={<ArchiveRoute />} path="/operations/archive" />
      <Route element={<RedirectWithSearch to={RECORD_UPDATE_STOCK_COUNT_PATH} />} path="/operations/session" />
      <Route element={<SettingsRoute />} path="/settings/*" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}

function AppFrame() {
  return (
    <NavigationHistoryProvider>
      <CommandPaletteProvider>
        <BanjiShell>
          <AppRoutes />
        </BanjiShell>
      </CommandPaletteProvider>
    </NavigationHistoryProvider>
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
            Loading local workspace…
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Starting the desktop core and opening the local workspace.
          </p>
        </div>
      </div>
    );
  }

  return <LoadedApp />;
}
