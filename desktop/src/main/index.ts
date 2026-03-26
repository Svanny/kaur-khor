import { app, BrowserWindow, ipcMain, nativeImage } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  startManagedApi,
  stopManagedApi,
  type ManagedApiProcess,
} from './backend';
import { hasMacDockIconPair, macIconAssets } from './icon';
import {
  IPC_CHANNELS,
  type BackendStatus,
  type DesktopAppContext,
} from '@shared/ipc';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../../..');
const iconAssets = macIconAssets(projectRoot);

let mainWindow: BrowserWindow | null = null;
let managedApi: ManagedApiProcess | null = null;
let desktopContext: DesktopAppContext = {
  apiBaseUrl: '',
  appVersion: app.getVersion(),
  backendStatus: 'starting',
};

function broadcastBackendStatus(status: BackendStatus, backendError?: string) {
  desktopContext = {
    ...desktopContext,
    backendStatus: status,
    backendError,
  };
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.backendStatus, desktopContext);
  }
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1420,
    height: 920,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#f2e8d8',
    title: 'Banji Desktop',
    icon: process.platform === 'darwin' ? undefined : iconAssets.dockIconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

async function restartManagedBackend() {
  const rendererOrigin = process.env.ELECTRON_RENDERER_URL;

  await stopManagedApi(managedApi);
  managedApi = null;
  desktopContext = {
    ...desktopContext,
    apiBaseUrl: '',
    backendStatus: 'starting',
    backendError: undefined,
  };
  broadcastBackendStatus('starting');

  if (process.platform === 'darwin' && hasMacDockIconPair(projectRoot)) {
    app.dock.setIcon(nativeImage.createFromPath(iconAssets.dockIconPath));
  }

  try {
    managedApi = await startManagedApi({
      projectRoot,
      userDataPath: app.getPath('userData'),
      rendererOrigin,
      preferredPort: 8787,
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath,
    });
    desktopContext = {
      ...desktopContext,
      apiBaseUrl: managedApi.apiBaseUrl,
      backendStatus: 'ready',
      backendError: undefined,
    };
    broadcastBackendStatus('ready');
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Banji API failed to start';
    managedApi = null;
    desktopContext = {
      ...desktopContext,
      apiBaseUrl: '',
      backendStatus: 'error',
      backendError: message,
    };
    broadcastBackendStatus('error', message);
  }
}

async function boot() {
  await restartManagedBackend();
  await createMainWindow();
}

ipcMain.handle(IPC_CHANNELS.getAppContext, async () => desktopContext);
ipcMain.handle(IPC_CHANNELS.restartBackend, async () => {
  await restartManagedBackend();
  return desktopContext;
});

app.whenReady().then(boot);

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    await stopManagedApi(managedApi);
    broadcastBackendStatus('stopped');
    app.quit();
  }
});

app.on('before-quit', async () => {
  await stopManagedApi(managedApi);
  broadcastBackendStatus('stopped');
});
