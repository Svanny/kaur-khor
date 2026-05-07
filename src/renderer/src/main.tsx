import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import { installBrowserDesktopBridge } from './dev/browser-desktop-bridge';
import { isBenchmarkRendererMode } from './lib/benchmark-mode';
import { embeddedModeForPath, webLandingMountForPath } from './routes/web/embedded-entry';
import './globals.css';

const EmbeddedAppRoute = React.lazy(() => import('./routes/web/embedded-app').then((module) => ({ default: module.EmbeddedAppRoute })));
const WebRoutes = React.lazy(() => import('./routes/web/landing').then((module) => ({ default: module.WebRoutes })));
const embeddedMode = embeddedModeForPath(window.location.pathname, import.meta.env.BASE_URL.replace(/\/$/, ''));
const webLandingMount = webLandingMountForPath(window.location.pathname, import.meta.env.BASE_URL.replace(/\/$/, ''));

installBrowserDesktopBridge();

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

ReactDOM.createRoot(document.getElementById('root')!).render(
  embeddedMode || webLandingMount ? <React.Suspense fallback={null}>{app}</React.Suspense> : isBenchmarkRendererMode() ? app : (
    <React.StrictMode>
      {app}
    </React.StrictMode>
  ),
);
