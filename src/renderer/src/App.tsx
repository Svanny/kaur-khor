import { lazy, Suspense, useEffect, useRef, useState, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { DesktopAppContext } from '@shared/ipc';
import { KaurKhorShell } from '@/components/kaur-khor-shell';
import { CommandPaletteProvider } from '@/components/command-palette';
import { CommandHomeRoute } from '@/routes/workspace/command-home';
import { deriveNavigationAvailability } from '@/lib/navigation/navigation-availability';
import { readCatalogRouteState } from '@/lib/navigation/navigation-state';
import { PageStateMemoryObserver } from '@/lib/settings/page-state-memory';
import { OnboardingRoute } from '@/routes/workspace/onboarding';
import {
  RECORD_UPDATE_HUB_PATH,
  RECORD_UPDATE_LANES,
  RECORD_UPDATE_STOCK_COUNT_PATH,
} from '@/lib/navigation/record-update-routes';
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
} from '@/lib/ui/benchmark';

const InventoryRoute = lazy(() => import('@/routes/inventory/catalog-route').then((module) => ({ default: module.InventoryRoute })));
const InsightsRoute = lazy(() => import('@/routes/insights/insights').then((module) => ({ default: module.InsightsRoute })));
const RecordUpdateHubRoute = lazy(() => import('@/routes/records/record-update-hub').then((module) => ({ default: module.RecordUpdateHubRoute })));
const WorkRoute = lazy(() => import('@/routes/workspace/work').then((module) => ({ default: module.WorkRoute })));
const ServiceDetailRoute = lazy(() => import('@/routes/inventory/service-detail').then((module) => ({ default: module.ServiceDetailRoute })));
const ServiceFormRoute = lazy(() => import('@/routes/inventory/service-form').then((module) => ({ default: module.ServiceFormRoute })));
const SettingsRoute = lazy(() => import('@/routes/settings/settings').then((module) => ({ default: module.SettingsRoute })));
const SkuDetailRoute = lazy(() => import('@/routes/inventory/sku-detail').then((module) => ({ default: module.SkuDetailRoute })));
const SkuDetailLedgerRoute = lazy(() => import('@/routes/inventory/sku-detail').then((module) => ({ default: module.SkuDetailLedgerRoute })));
const SkuFormRoute = lazy(() => import('@/routes/inventory/sku-form').then((module) => ({ default: module.SkuFormRoute })));
const StockUpdateRoute = lazy(() => import('@/routes/records/stock-update').then((module) => ({ default: module.StockUpdateRoute })));
const StockUpdateSessionRoute = lazy(() => import('@/routes/records/stock-update-session').then((module) => ({ default: module.StockUpdateSessionRoute })));

const ROUTE_LOCAL_READY_NAMES = new Set([
  'insights.explain',
  'insights.money',
  'insights.pressure',
  'automations',
  'service-detail',
  'work.intake',
  'work.queue',
]);

export function routeBenchmarkName(pathname: string) {
  if (pathname === '/') {
    return 'home';
  }
  if (pathname === '/work') {
    return 'work';
  }
  if (pathname === '/work/queue') {
    return 'work.queue';
  }
  if (pathname.startsWith('/work/capture')) {
    return 'work.capture';
  }
  if (pathname.startsWith('/work/intake')) {
    return 'work.intake';
  }
  if (pathname === '/insights') {
    return 'insights';
  }
  if (pathname === '/insights/pressure') {
    return 'insights.pressure';
  }
  if (pathname === '/insights/money') {
    return 'insights.money';
  }
  if (pathname === '/insights/explain') {
    return 'insights.explain';
  }
  if (pathname.startsWith('/catalog/skus/')) {
    return 'sku-detail';
  }
  if (pathname.startsWith('/catalog/services/')) {
    return 'service-detail';
  }
  if (pathname === '/settings/history') {
    return 'history';
  }
  if (pathname === '/catalog') {
    return 'catalog';
  }
  return pathname.replace(/^\/+/, '').replace(/\//g, '-') || 'home';
}

function CatalogGuardedRoute({
  canRedirectFromLockedPage,
  hasCatalog,
  hasCatalogTab,
}: {
  canRedirectFromLockedPage: boolean;
  hasCatalog: boolean;
  hasCatalogTab: boolean;
}) {
  const location = useLocation();
  const routeState = readCatalogRouteState(new URLSearchParams(location.search));
  if (canRedirectFromLockedPage && hasCatalog && !hasCatalogTab && routeState.status !== 'archived') {
    return <Navigate replace to="/catalog/skus/new" />;
  }
  return <InventoryRoute />;
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
  const recordUpdateGuardedElement = availability.hasWorkCapture
    ? <RecordUpdateHubRoute />
    : <Navigate replace to="/" />;
  const stockUpdateSessionGuardedElement = availability.hasWorkCapture
    ? <StockUpdateSessionRoute />
    : <Navigate replace to="/" />;

  return (
    <Suspense fallback={null}>
      <Routes>
      <Route element={<CommandHomeRoute />} path="/" />
      <Route element={<WorkRoute />} path="/work/*" />
      <Route element={<InsightsRoute />} path="/insights/*" />
      <Route element={canRedirectFromLockedPage ? recordUpdateGuardedElement : <RecordUpdateHubRoute />} path={RECORD_UPDATE_HUB_PATH} />
      {RECORD_UPDATE_LANES.map((lane) => (
        <Route
          key={lane.id}
          element={
            lane.id === 'custom'
              ? <Navigate replace to={RECORD_UPDATE_STOCK_COUNT_PATH} />
              : canRedirectFromLockedPage
                ? stockUpdateSessionGuardedElement
                : <StockUpdateSessionRoute />
          }
          path={lane.path}
        />
      ))}
      <Route
        element={<CatalogGuardedRoute canRedirectFromLockedPage={canRedirectFromLockedPage} hasCatalog={Boolean(inventory.catalog)} hasCatalogTab={availability.hasCatalogTab} />}
        path="/catalog"
      />
      <Route element={<SkuFormRoute />} path="/catalog/skus/new" />
      <Route element={<SkuDetailRoute />} path="/catalog/skus/:skuId" />
      <Route element={<SkuDetailLedgerRoute />} path="/catalog/skus/:skuId/ledger" />
      <Route element={<SkuFormRoute />} path="/catalog/skus/:skuId/edit" />
      <Route element={<ServiceFormRoute />} path="/catalog/services/new" />
      <Route element={<ServiceDetailRoute />} path="/catalog/services/:serviceId" />
      <Route element={<ServiceFormRoute />} path="/catalog/services/:serviceId/edit" />
      <Route
        element={
          canRedirectFromLockedPage && !availability.hasHistory
            ? <Navigate replace to={availability.hasWorkCapture ? '/work/capture' : '/'} />
            : <StockUpdateRoute />
        }
        path="/settings/history"
      />
      <Route element={<SettingsRoute />} path="/settings/*" />
      <Route element={<Navigate replace to="/" />} path="*" />
      </Routes>
    </Suspense>
  );
}

function AppFrame() {
  const { isHydrated, language, onboardingCompletedAt } = usePreferences();
  const location = useLocation();
  const allowCompletedOnboarding =
    typeof location.state === 'object' &&
    location.state != null &&
    'kaurKhorAllowCompletedOnboarding' in location.state &&
    location.state.kaurKhorAllowCompletedOnboarding === true;
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
            KAUR KHOR
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

  if (location.pathname === '/onboarding' && allowCompletedOnboarding) {
    return <OnboardingRoute allowCompleted />;
  }

  return (
    <div className="contents" data-language={language} lang={language === 'km' ? 'km' : 'en'}>
      <NavigationHistoryProvider>
        <PageStateMemoryObserver />
        <CommandPaletteProvider>
          <KaurKhorShell>
            <AppRoutes />
          </KaurKhorShell>
        </CommandPaletteProvider>
      </NavigationHistoryProvider>
    </div>
  );
}

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <PreferencesProvider>
      <InventoryProvider>
        <AutomationProvider>
          <BenchmarkRouteObserver />
          {children}
        </AutomationProvider>
      </InventoryProvider>
    </PreferencesProvider>
  );
}

export function LoadedApp() {
  return (
    <AppProviders>
      <AppFrame />
    </AppProviders>
  );
}

export default function App() {
  const [desktopContext, setDesktopContext] = useState<DesktopAppContext | null>(null);
  const loadingShellRecordedRef = useRef(false);

  useEffect(() => {
    let mounted = true;
    recordBenchmarkInstant('renderer.app.mount.start', 'startup');
    markBenchmarkStart('renderer.app.getAppContext', 'startup');
    window.kaurKhorDesktop.system.getAppContext()
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
            KAUR KHOR
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
