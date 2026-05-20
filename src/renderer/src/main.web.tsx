import React from 'react';
import ReactDOM from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { embeddedModeForPath } from '@/routes/web/embedded-entry';
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

const loadingFallback = (
  <div className="grid min-h-svh place-items-center bg-background px-6 text-center text-foreground">
    <div>
      <p className="text-sm font-semibold text-primary">KAUR KHOR</p>
      <h1 className="mt-3 text-3xl font-semibold tracking-normal">
        {embeddedMode ? 'Loading workspace…' : 'Loading preferences…'}
      </h1>
    </div>
  </div>
);

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
