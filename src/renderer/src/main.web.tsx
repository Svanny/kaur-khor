import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { embeddedModeForPath } from '@/routes/web/embedded-entry';
import './globals.css';

const EmbeddedAppRoute = React.lazy(() => import('@/routes/web/embedded-app').then((module) => ({ default: module.EmbeddedAppRoute })));
const WebRoutes = React.lazy(() => import('@/routes/web/landing').then((module) => ({ default: module.WebRoutes })));

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const embeddedMode = embeddedModeForPath(window.location.pathname, basePath);

const app = embeddedMode
  ? <EmbeddedAppRoute mode={embeddedMode} />
  : (
    <BrowserRouter basename={basePath === '' ? undefined : basePath}>
      <WebRoutes />
    </BrowserRouter>
  );

ReactDOM.createRoot(document.getElementById('root')!).render(
  embeddedMode
    ? <React.Suspense fallback={null}>{app}</React.Suspense>
    : (
      <React.StrictMode>
        <React.Suspense fallback={null}>{app}</React.Suspense>
      </React.StrictMode>
    ),
);
