import { shell, type BrowserWindow } from 'electron';
import { normalizeAllowedExternalUrl } from './external-url';

function isSameRendererLocation(currentUrl: string, nextUrl: string) {
  try {
    const current = new URL(currentUrl);
    const next = new URL(nextUrl);
    return current.protocol === next.protocol
      && current.host === next.host
      && current.pathname === next.pathname;
  } catch {
    return false;
  }
}

function openAllowedExternalUrl(targetUrl: string) {
  try {
    void shell.openExternal(normalizeAllowedExternalUrl(targetUrl));
  } catch {
    // Deny invalid or unapproved renderer navigation without crashing the main process.
  }
}

export function installMainWindowNavigationGuards(window: BrowserWindow) {
  const { webContents } = window;

  webContents.setWindowOpenHandler(({ url }) => {
    openAllowedExternalUrl(url);
    return { action: 'deny' };
  });

  webContents.on('will-navigate', (event, targetUrl) => {
    if (isSameRendererLocation(webContents.getURL(), targetUrl)) {
      return;
    }

    event.preventDefault();
    openAllowedExternalUrl(targetUrl);
  });
}
