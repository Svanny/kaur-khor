import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { DesktopAppContext } from '@shared/ipc';
import { BanjiShell } from '@/components/banji-shell';
import { CommandPaletteProvider } from '@/components/command-palette';
import { DashboardRoute } from '@/routes/dashboard';
import { deriveNavigationAvailability } from '@/lib/navigation-availability';
import { PageStateMemoryObserver } from '@/lib/page-state-memory';
import { OnboardingRoute } from '@/routes/onboarding';
import {
  RECORD_UPDATE_HUB_PATH,
  RECORD_UPDATE_LANES,
} from '@/lib/record-update-routes';
import { PreferencesProvider } from '@/state/preferences';
import { InventoryProvider, useInventoryState } from '@/state/inventory';
import { AutomationProvider } from '@/state/automation';
import { NavigationHistoryProvider } from '@/state/navigation-history';
import { usePreferences } from '@/state/preferences';
import {
  installLongTaskObserver,
  markBenchmarkEnd,
  markBenchmarkStart,
  recordBenchmarkInstant,
  snapshotRendererMemory,
} from '@/lib/benchmark';

const AnalysisRoute = lazy(() => import('@/routes/analysis').then((module) => ({ default: module.AnalysisRoute })));
const ArchiveRoute = lazy(() => import('@/routes/archive').then((module) => ({ default: module.ArchiveRoute })));
const FinancialsRoute = lazy(() => import('@/routes/financials').then((module) => ({ default: module.FinancialsRoute })));
const HelpRoute = lazy(() => import('@/routes/help').then((module) => ({ default: module.HelpRoute })));
const InventoryRoute = lazy(() => import('@/routes/inventory').then((module) => ({ default: module.InventoryRoute })));
const AutomationsRoute = lazy(() => import('@/routes/automations').then((module) => ({ default: module.AutomationsRoute })));
const PerformanceRoute = lazy(() => import('@/routes/performance').then((module) => ({ default: module.PerformanceRoute })));
const RecordUpdateHubRoute = lazy(() => import('@/routes/record-update-hub').then((module) => ({ default: module.RecordUpdateHubRoute })));
const ServiceDetailRoute = lazy(() => import('@/routes/service-detail').then((module) => ({ default: module.ServiceDetailRoute })));
const ServiceFormRoute = lazy(() => import('@/routes/service-form').then((module) => ({ default: module.ServiceFormRoute })));
const SettingsRoute = lazy(() => import('@/routes/settings').then((module) => ({ default: module.SettingsRoute })));
const SkuDetailRoute = lazy(() => import('@/routes/sku-detail').then((module) => ({ default: module.SkuDetailRoute })));
const SkuDetailLedgerRoute = lazy(() => import('@/routes/sku-detail').then((module) => ({ default: module.SkuDetailLedgerRoute })));
const SkuFormRoute = lazy(() => import('@/routes/sku-form').then((module) => ({ default: module.SkuFormRoute })));
const StockUpdateRoute = lazy(() => import('@/routes/stock-update').then((module) => ({ default: module.StockUpdateRoute })));
const StockUpdateSessionRoute = lazy(() => import('@/routes/stock-update-session').then((module) => ({ default: module.StockUpdateSessionRoute })));

const ROUTE_LOCAL_READY_NAMES = new Set([
  'analysis',
  'automations',
  'dashboard',
  'financials',
  'performance',
  'service-detail',
]);

export function routeBenchmarkName(pathname: string) {
  if (pathname === '/') {
    return 'dashboard';
  }
  if (pathname.startsWith('/record-update')) {
    return 'record-update';
  }
  if (pathname === '/performance') {
    return 'performance';
  }
  if (pathname === '/financials') {
    return 'financials';
  }
  if (pathname === '/automations') {
    return 'automations';
  }
  if (pathname === '/analysis') {
    return 'analysis';
  }
  if (pathname.startsWith('/catalog/skus/')) {
    return 'sku-detail';
  }
  if (pathname.startsWith('/catalog/services/')) {
    return 'service-detail';
  }
  if (pathname === '/operations') {
    return 'operations';
  }
  if (pathname === '/catalog') {
    return 'catalog';
  }
  return pathname.replace(/^\/+/, '').replace(/\//g, '-') || 'dashboard';
}

function BenchmarkRouteObserver() {
  const location = useLocation();
  const inventory = useInventoryState();
  const { isHydrated } = usePreferences();
  const pendingRouteRef = useRef<string | null>(null);
  const workspaceReadyRecordedRef = useRef(false);

  useEffect(() => installLongTaskObserver(), []);

  useEffect(() => {
    const route = `${location.pathname}${location.search}`;
    pendingRouteRef.current = route;
    markBenchmarkStart('renderer.route.navigation', 'navigation', {
      route,
      routeName: routeBenchmarkName(location.pathname),
    });
  }, [location.pathname, location.search]);

  useEffect(() => {
    const route = `${location.pathname}${location.search}`;
    const isReady = isHydrated && !inventory.isLoading && !inventory.isPreparingWorkspace;
    if (!isReady || pendingRouteRef.current !== route) {
      return;
    }

    const routeName = routeBenchmarkName(location.pathname);
    if (!ROUTE_LOCAL_READY_NAMES.has(routeName)) {
      recordBenchmarkInstant(`route.${routeName}.ready`, 'navigation', {
        route,
        routeName,
        hasWorkspaceSummary: Boolean(inventory.workspaceSummary),
      });
      snapshotRendererMemory(`renderer.route.${routeName}.ready`, {
        route,
        routeName,
        hasWorkspaceSummary: Boolean(inventory.workspaceSummary),
      });
      pendingRouteRef.current = null;
    }

    if (!workspaceReadyRecordedRef.current) {
      workspaceReadyRecordedRef.current = true;
      recordBenchmarkInstant('renderer.workspace.ready', 'startup', {
        route,
        hasWorkspaceSummary: Boolean(inventory.workspaceSummary),
      });
      snapshotRendererMemory('renderer.workspace.ready');
    }
  }, [
    inventory.isLoading,
    inventory.isPreparingWorkspace,
    inventory.workspaceSummary,
    isHydrated,
    location.pathname,
    location.search,
  ]);

  return null;
}

export function AppRoutes() {
  const inventory = useInventoryState();
  const availability = deriveNavigationAvailability(inventory);
  const canRedirectFromLockedPage = !inventory.isLoading;
  const recordUpdateGuardedElement = availability.hasRecordUpdateTab
    ? <RecordUpdateHubRoute />
    : <Navigate replace to="/" />;
  const stockUpdateSessionGuardedElement = availability.hasRecordUpdateTab
    ? <StockUpdateSessionRoute />
    : <Navigate replace to="/" />;

  return (
    <Suspense fallback={null}>
      <Routes>
      <Route element={<DashboardRoute />} path="/" />
      <Route element={<AnalysisRoute />} path="/analysis" />
      <Route element={canRedirectFromLockedPage ? recordUpdateGuardedElement : <RecordUpdateHubRoute />} path={RECORD_UPDATE_HUB_PATH} />
      {RECORD_UPDATE_LANES.map((lane) => (
        <Route key={lane.id} element={canRedirectFromLockedPage ? stockUpdateSessionGuardedElement : <StockUpdateSessionRoute />} path={lane.path} />
      ))}
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
      <Route element={<AutomationsRoute />} path="/automations" />
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
      <Route element={<SettingsRoute />} path="/settings/*" />
      <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </Suspense>
  );
}

function AppFrame() {
  const { isHydrated, onboardingCompletedAt } = usePreferences();
  const preferencesHydrationRecordedRef = useRef(false);

  useEffect(() => {
    if (!isHydrated || preferencesHydrationRecordedRef.current) {
      return;
    }
    preferencesHydrationRecordedRef.current = true;
    recordBenchmarkInstant('renderer.preferences.hydration.end', 'startup');
  }, [isHydrated]);

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
      <PageStateMemoryObserver />
      <CommandPaletteProvider>
        <BanjiShell>
          <AppRoutes />
        </BanjiShell>
      </CommandPaletteProvider>
    </NavigationHistoryProvider>
  );
}

export function LoadedApp() {
  return (
    <PreferencesProvider>
      <InventoryProvider>
        <AutomationProvider>
          <BenchmarkRouteObserver />
          <AppFrame />
        </AutomationProvider>
      </InventoryProvider>
    </PreferencesProvider>
  );
}

export default function App() {
  const [desktopContext, setDesktopContext] = useState<DesktopAppContext | null>(null);
  const loadingShellRecordedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    recordBenchmarkInstant('renderer.app.mount.start', 'startup');
    markBenchmarkStart('renderer.app.getAppContext', 'startup');
    window.banjiDesktop.system.getAppContext()
      .then((context) => {
        markBenchmarkEnd('renderer.app.getAppContext', 'startup', { ok: true });
        if (mounted) {
          setDesktopContext(context);
        }
      })
      .catch((error) => {
        markBenchmarkEnd('renderer.app.getAppContext', 'startup', {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
        throw error;
      });
    return () => {
      mounted = false;
    };
  }, []);

  if (!desktopContext) {
    if (!loadingShellRecordedRef.current) {
      loadingShellRecordedRef.current = true;
      recordBenchmarkInstant('renderer.app.loaded-shell.visible', 'startup');
    }
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
