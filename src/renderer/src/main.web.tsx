import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './globals.css';

const EmbeddedAppRoute = React.lazy(() => import('@/routes/web/embedded-app').then((module) => ({ default: module.EmbeddedAppRoute })));
const WebRoutes = React.lazy(() => import('@/routes/web/landing').then((module) => ({ default: module.WebRoutes })));

const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
const relativePath = basePath && window.location.pathname.startsWith(basePath)
  ? window.location.pathname.slice(basePath.length) || '/'
  : window.location.pathname;

const app = relativePath === '/demo' || relativePath === '/app'
  ? <EmbeddedAppRoute mode={relativePath === '/demo' ? 'demo' : 'app'} />
  : (
    <BrowserRouter basename={basePath === '' ? undefined : basePath}>
      <WebRoutes />
    </BrowserRouter>
  );

ReactDOM.createRoot(document.getElementById('root')!).render(
  relativePath === '/demo' || relativePath === '/app'
    ? <React.Suspense fallback={null}>{app}</React.Suspense>
    : (
      <React.StrictMode>
        <React.Suspense fallback={null}>{app}</React.Suspense>
      </React.StrictMode>
    ),
);
