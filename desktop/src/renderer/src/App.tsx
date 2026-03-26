import { NavLink, Route, Routes } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { DesktopAppContext } from '@shared/ipc';
import { PreferencesProvider, usePreferences } from './state/preferences';
import { InventoryProvider, useInventory } from './state/inventory';
import { DashboardRoute } from './routes/dashboard';
import { InventoryRoute } from './routes/inventory';
import { RankingRoute } from './routes/ranking';
import { ServiceFormRoute } from './routes/service-form';
import { SettingsRoute } from './routes/settings';
import { SkuFormRoute } from './routes/sku-form';
import { StockUpdateRoute } from './routes/stock-update';
import brandLogo from './assets/banji-logo.svg';

function AppFrame({ desktopContext }: { desktopContext: DesktopAppContext }) {
  const { t } = usePreferences();
  const { error, isLoading } = useInventory();

  const statusLabel =
    desktopContext.backendStatus === 'ready'
      ? t('backendReady')
      : desktopContext.backendStatus === 'error'
        ? t('backendError')
        : desktopContext.backendStatus === 'stopped'
          ? t('apiUnavailable')
          : t('backendStarting');

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <img alt="Banji logo" className="brand-logo" src={brandLogo} />
          <p className="eyebrow">macOS-first</p>
          <h1>{t('appBrand')}</h1>
          <span>{t('appTitle')}</span>
        </div>

        <nav className="nav-stack">
          <NavLink className="nav-link" to="/">
            {t('navDashboard')}
          </NavLink>
          <NavLink className="nav-link" to="/inventory">
            {t('navInventory')}
          </NavLink>
          <NavLink className="nav-link" to="/inventory/stock">
            {t('navStock')}
          </NavLink>
          <NavLink className="nav-link" to="/inventory/ranking">
            {t('navRanking')}
          </NavLink>
          <NavLink className="nav-link" to="/settings">
            {t('navSettings')}
          </NavLink>
        </nav>

        <div className="status-card">
          <span className={`status-dot status-${desktopContext.backendStatus}`} />
          <div>
            <strong>{statusLabel}</strong>
            <p>{desktopContext.apiBaseUrl || '127.0.0.1 pending'}</p>
          </div>
        </div>
      </aside>

      <main className="main-shell">
        {desktopContext.backendError ? (
          <div className="banner error-banner">
            <span>{desktopContext.backendError}</span>
            <button
              className="button secondary compact"
              onClick={() => {
                void window.banjiDesktop.restartBackend();
              }}
              type="button"
            >
              {t('retry')}
            </button>
          </div>
        ) : null}
        {error ? <div className="banner error-banner">{error}</div> : null}
        {isLoading ? <div className="banner info-banner">{t('backendStarting')}</div> : null}

        <Routes>
          <Route path="/" element={<DashboardRoute />} />
          <Route path="/inventory" element={<InventoryRoute />} />
          <Route path="/inventory/skus/new" element={<SkuFormRoute />} />
          <Route path="/inventory/skus/:skuId" element={<SkuFormRoute />} />
          <Route path="/inventory/services/new" element={<ServiceFormRoute />} />
          <Route path="/inventory/services/:serviceId" element={<ServiceFormRoute />} />
          <Route path="/inventory/stock" element={<StockUpdateRoute />} />
          <Route path="/inventory/ranking" element={<RankingRoute />} />
          <Route path="/settings" element={<SettingsRoute />} />
        </Routes>
      </main>
    </div>
  );
}

function LoadedApp({ desktopContext }: { desktopContext: DesktopAppContext }) {
  return (
    <PreferencesProvider>
      <InventoryProvider
        apiBaseUrl={desktopContext.apiBaseUrl}
        backendStatus={desktopContext.backendStatus}
      >
        <AppFrame desktopContext={desktopContext} />
      </InventoryProvider>
    </PreferencesProvider>
  );
}

export default function App() {
  const [desktopContext, setDesktopContext] = useState<DesktopAppContext | null>(null);

  useEffect(() => {
    let mounted = true;
    window.banjiDesktop.getAppContext().then((context) => {
      if (mounted) {
        setDesktopContext(context);
      }
    });
    const unsubscribe = window.banjiDesktop.onBackendStatus((context) => {
      setDesktopContext(context);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  if (!desktopContext) {
    return (
      <div className="boot-screen">
        <p className="eyebrow">Banji</p>
        <h1>Loading desktop shell…</h1>
      </div>
    );
  }

  return <LoadedApp desktopContext={desktopContext} />;
}
