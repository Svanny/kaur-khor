import React from 'react';
import ReactDOM from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { getBrowserDesktopBridgeMockState } from '@/dev/browser-desktop-bridge';
import { embeddedModeForPath } from '@/routes/web/embedded-entry';
import { WebLoadingFallback } from '@/routes/web/loading-fallback';
import { WebRoutes } from '@/routes/web/landing';
import './globals.css';

const EmbeddedAppRoute = React.lazy(() => import('@/routes/web/embedded-app').then((module) => ({ default: module.EmbeddedAppRoute })));

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const embeddedMode = embeddedModeForPath(window.location.pathname, basePath);

function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) {
    return;
  }

  const serviceWorkerPath = `${basePath}/sw.js`;
  const scope = `${basePath}/`;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register(serviceWorkerPath, { scope });
  });
}

registerServiceWorker();

const app = embeddedMode
  ? <EmbeddedAppRoute mode={embeddedMode} />
  : (
    <BrowserRouter basename={basePath === '' ? undefined : basePath}>
      <WebRoutes />
    </BrowserRouter>
  );

const loadingLanguage = getBrowserDesktopBridgeMockState().preferences.language;
const loadingFallback = <WebLoadingFallback embeddedMode={Boolean(embeddedMode)} language={loadingLanguage} />;

const rootElement = document.getElementById('root')! as HTMLElement & { __kaurKhorRoot?: Root };
const root = rootElement.__kaurKhorRoot ?? ReactDOM.createRoot(rootElement);
rootElement.__kaurKhorRoot = root;

root.render(
  embeddedMode
    ? <React.Suspense fallback={loadingFallback}>{app}</React.Suspense>
    : (
      <React.StrictMode>
        <React.Suspense fallback={loadingFallback}>{app}</React.Suspense>
      </React.StrictMode>
    ),
);
