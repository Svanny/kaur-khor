import { Link, Route, Routes, useLocation } from 'react-router-dom';
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
  const location = useLocation();
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
      <header className="top-app-bar">
        <Link className="brand-lockup" to="/">
          <img alt="Banji logo" className="brand-logo" src={brandLogo} />
          <span className="brand-name">{t('appBrand')}</span>
        </Link>

        <div className="top-app-actions">
          <Link
            aria-label={t('navInventory')}
            className={location.pathname.startsWith('/inventory') ? 'icon-pill icon-pill-active' : 'icon-pill'}
            to="/inventory"
          >
            <span aria-hidden="true">☰</span>
          </Link>
          <Link
            aria-label={t('navSettings')}
            className={location.pathname === '/settings' ? 'icon-pill icon-pill-active' : 'icon-pill'}
            to="/settings"
          >
            <span aria-hidden="true">⚙</span>
          </Link>
          <div className="status-pill" title={desktopContext.apiBaseUrl || ''}>
            <span className={`status-dot status-${desktopContext.backendStatus}`} />
            <span>{statusLabel}</span>
          </div>
        </div>
      </header>

      <main className="main-shell">
        {desktopContext.backendError ? (
          <div className="banner error-banner">
            <span>{desktopContext.backendError}</span>
            <button
              className="secondary-pill-button compact-pill-button"
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

        <div className="page-shell">
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
        </div>
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
        <p className="shell-kicker">Banji</p>
        <h1>Loading desktop shell…</h1>
      </div>
    );
  }

  return <LoadedApp desktopContext={desktopContext} />;
}
