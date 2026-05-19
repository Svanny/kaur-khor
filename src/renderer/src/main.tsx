import React from 'react';
import ReactDOM from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import { isBenchmarkRendererMode } from './lib/benchmark-mode';
import { embeddedModeForPath, webLandingMountForPath } from './routes/web/embedded-entry';
import './globals.css';

const EmbeddedAppRoute = React.lazy(() => import('./routes/web/embedded-app').then((module) => ({ default: module.EmbeddedAppRoute })));
const WebRoutes = React.lazy(() => import('./routes/web/landing').then((module) => ({ default: module.WebRoutes })));
const embeddedMode = embeddedModeForPath(window.location.pathname, import.meta.env.BASE_URL.replace(/\/$/, ''));
const webLandingMount = webLandingMountForPath(window.location.pathname, import.meta.env.BASE_URL.replace(/\/$/, ''));

async function installBrowserBridgeWhenNeeded() {
  if (window.kaurKhorDesktop) {
    return;
  }
  const { installBrowserDesktopBridge } = await import('./dev/browser-desktop-bridge');
  installBrowserDesktopBridge();
}

async function renderApp() {
  await installBrowserBridgeWhenNeeded();

  const desktopApp = (
    <HashRouter>
      <App />
    </HashRouter>
  );
  const webLandingApp = (
    <BrowserRouter basename={webLandingMount ?? undefined}>
      <WebRoutes />
    </BrowserRouter>
  );
  const app = embeddedMode
    ? <EmbeddedAppRoute mode={embeddedMode} />
    : webLandingMount
      ? webLandingApp
      : desktopApp;

  const rootElement = document.getElementById('root')! as HTMLElement & { __kaurKhorRoot?: Root };
  const root = rootElement.__kaurKhorRoot ?? ReactDOM.createRoot(rootElement);
  rootElement.__kaurKhorRoot = root;

  root.render(
    embeddedMode || webLandingMount ? <React.Suspense fallback={null}>{app}</React.Suspense> : isBenchmarkRendererMode() ? app : (
      <React.StrictMode>
        {app}
      </React.StrictMode>
    ),
  );
}

void renderApp();
