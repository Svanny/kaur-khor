import { useEffect, useState } from 'react';
import { generatePath, Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import type { DesktopAppContext } from '@shared/ipc';
import { BanjiShell } from '@/components/banji-shell';
import { CommandPaletteProvider } from '@/components/command-palette';
import { AnalysisRoute } from '@/routes/analysis';
import { ArchiveRoute } from '@/routes/archive';
import { DashboardRoute } from '@/routes/dashboard';
import { FinancialsRoute } from '@/routes/financials';
import { HelpRoute } from '@/routes/help';
import { InventoryRoute } from '@/routes/inventory';
import { deriveNavigationAvailability } from '@/lib/navigation-availability';
import { OnboardingRoute } from '@/routes/onboarding';
import { PerformanceRoute } from '@/routes/performance';
import { RecordUpdateHubRoute } from '@/routes/record-update-hub';
import { ServiceDetailRoute } from '@/routes/service-detail';
import { ServiceFormRoute } from '@/routes/service-form';
import { SettingsRoute } from '@/routes/settings';
import { SkuDetailLedgerRoute, SkuDetailRoute } from '@/routes/sku-detail';
import { SkuFormRoute } from '@/routes/sku-form';
import { StockUpdateRoute } from '@/routes/stock-update';
import { StockUpdateSessionRoute } from '@/routes/stock-update-session';
import {
  RECORD_UPDATE_CUSTOMER_COMPLETED_PATH,
  RECORD_UPDATE_CUSTOMER_PENDING_PATH,
  RECORD_UPDATE_HUB_PATH,
  RECORD_UPDATE_LANES,
  RECORD_UPDATE_STOCK_COUNT_PATH,
  RECORD_UPDATE_SUPPLIER_PENDING_PATH,
  RECORD_UPDATE_SUPPLIER_RECEIPT_PATH,
} from '@/lib/record-update-routes';
import { PreferencesProvider } from '@/state/preferences';
import { InventoryProvider } from '@/state/inventory';
import { NavigationHistoryProvider } from '@/state/navigation-history';
import { useInventory } from '@/state/inventory';
import { usePreferences } from '@/state/preferences';

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
  const inventory = useInventory();
  const availability = deriveNavigationAvailability(inventory);
  const canRedirectFromLockedPage = !inventory.isLoading;
  const recordUpdateGuardedElement = availability.hasRecordUpdateTab
    ? <RecordUpdateHubRoute />
    : <Navigate replace to="/" />;
  const stockUpdateSessionGuardedElement = availability.hasRecordUpdateTab
    ? <StockUpdateSessionRoute />
    : <Navigate replace to="/" />;

  return (
    <Routes>
      <Route element={<DashboardRoute />} path="/" />
      <Route element={<AnalysisRoute />} path="/analysis" />
      <Route element={canRedirectFromLockedPage ? recordUpdateGuardedElement : <RecordUpdateHubRoute />} path={RECORD_UPDATE_HUB_PATH} />
      {RECORD_UPDATE_LANES.map((lane) => (
        <Route key={lane.id} element={canRedirectFromLockedPage ? stockUpdateSessionGuardedElement : <StockUpdateSessionRoute />} path={lane.path} />
      ))}
      <Route element={<RedirectWithSearch to={RECORD_UPDATE_CUSTOMER_PENDING_PATH} />} path="/record-update/sales-update" />
      <Route element={<RedirectWithSearch to={RECORD_UPDATE_SUPPLIER_PENDING_PATH} />} path="/record-update/record-order" />
      <Route element={<RedirectWithSearch to={RECORD_UPDATE_SUPPLIER_RECEIPT_PATH} />} path="/record-update/record-receipt" />
      <Route element={<RedirectWithSearch to={RECORD_UPDATE_CUSTOMER_COMPLETED_PATH} />} path="/record-update/immediate-sale" />
      <Route
        element={
          canRedirectFromLockedPage && !availability.hasPerformanceTab ? <Navigate replace to="/" /> : <PerformanceRoute />
        }
        path="/performance"
      />
      <Route
        element={
          canRedirectFromLockedPage && !availability.hasFinancialsTab ? <Navigate replace to="/" /> : <FinancialsRoute />
        }
        path="/financials"
      />
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
      <Route
        element={
          canRedirectFromLockedPage && !availability.hasCatalogTab ? <Navigate replace to="/catalog/skus/new" /> : <InventoryRoute />
        }
        path="/catalog"
      />
      <Route element={<HelpRoute />} path="/help" />
      <Route element={<SkuFormRoute />} path="/catalog/skus/new" />
      <Route element={<SkuDetailRoute />} path="/catalog/skus/:skuId" />
      <Route element={<SkuDetailLedgerRoute />} path="/catalog/skus/:skuId/ledger" />
      <Route element={<SkuFormRoute />} path="/catalog/skus/:skuId/edit" />
      <Route element={<ServiceFormRoute />} path="/catalog/services/new" />
      <Route element={<ServiceDetailRoute />} path="/catalog/services/:serviceId" />
      <Route element={<ServiceFormRoute />} path="/catalog/services/:serviceId/edit" />
      <Route
        element={
          canRedirectFromLockedPage && !availability.hasLogsTab
            ? <Navigate replace to={availability.hasRecordUpdateTab ? '/record-update' : '/'} />
            : <StockUpdateRoute />
        }
        path="/operations"
      />
      <Route element={<ArchiveRoute />} path="/operations/archive" />
      <Route element={<RedirectWithSearch to={RECORD_UPDATE_STOCK_COUNT_PATH} />} path="/operations/session" />
      <Route element={<SettingsRoute />} path="/settings/*" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}

function AppFrame() {
  const { isHydrated, onboardingCompletedAt } = usePreferences();

  if (!isHydrated) {
    return (
      <div className="flex min-h-svh items-center justify-center px-6">
        <div className="hero-mesh editorial-panel w-full max-w-md rounded-[32px] p-8 text-center">
          <p className="text-base font-semibold leading-none tracking-normal text-primary/80">
            banji
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">
            Loading preferences…
          </h1>
        </div>
      </div>
    );
  }

  if (!onboardingCompletedAt) {
    return (
      <Routes>
        <Route element={<OnboardingRoute />} path="/onboarding" />
        <Route element={<Navigate replace to="/onboarding" />} path="*" />
      </Routes>
    );
  }

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
          <p className="text-base font-semibold leading-none tracking-normal text-primary/80">
            banji
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
