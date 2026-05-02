import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { EmbeddedAppRoute, WebRoutes } from '@/routes/web';
import './globals.css';

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
    ? app
    : (
      <React.StrictMode>
        {app}
      </React.StrictMode>
    ),
);
