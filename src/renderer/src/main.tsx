import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import { installBrowserDesktopBridge } from './dev/browser-desktop-bridge';
import { isBenchmarkRendererMode } from './lib/benchmark-mode';
import './globals.css';

installBrowserDesktopBridge();

const app = (
  <HashRouter>
    <App />
  </HashRouter>
);

ReactDOM.createRoot(document.getElementById('root')!).render(
  isBenchmarkRendererMode() ? app : (
    <React.StrictMode>
      {app}
    </React.StrictMode>
  ),
);
