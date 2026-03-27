import { app, BrowserWindow, ipcMain, nativeImage } from 'electron';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createManagedCoreController } from './core-manager';
import { hasMacDockIconPair, macIconAssets } from './icon';
import { loadDesktopPreferences, saveDesktopPreferences } from './preferences';
import {
  IPC_CHANNELS,
  type DesktopAppContext,
  type DesktopPreferences,
  type GetSistSkuDetailPayload,
  type SaveRankingPayload,
  type SaveServicePayload,
  type SaveSkuPayload,
} from '@shared/ipc';
import type {
  InventorySnapshot,
  SistSettings,
  StockReport,
  StockReportSubmission,
  StockUpdatePayload,
} from '@shared/inventory';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../../..');
const iconAssets = macIconAssets(projectRoot);

let mainWindow: BrowserWindow | null = null;
let desktopContext: DesktopAppContext = {
  appVersion: app.getVersion(),
  platform: process.platform,
};
const managedCore = createManagedCoreController({
  projectRoot,
  userDataPath: app.getPath('userData'),
  isPackaged: app.isPackaged,
  resourcesPath: process.resourcesPath,
});

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

async function boot() {
  if (process.platform === 'darwin' && hasMacDockIconPair(projectRoot)) {
    app.dock.setIcon(nativeImage.createFromPath(iconAssets.dockIconPath));
  }
  await createMainWindow();
}

ipcMain.handle(IPC_CHANNELS.systemGetAppContext, async () => desktopContext);
ipcMain.handle(IPC_CHANNELS.inventoryGetSnapshot, async () =>
  managedCore.invoke<InventorySnapshot>('inventory.getSnapshot'),
);
ipcMain.handle(IPC_CHANNELS.inventoryListStockReports, async () =>
  managedCore.invoke<StockReport[]>('inventory.listStockReports'),
);
ipcMain.handle(IPC_CHANNELS.inventorySaveSku, async (_event, payload: SaveSkuPayload) =>
  managedCore.invoke<InventorySnapshot>('inventory.saveSku', payload),
);
ipcMain.handle(
  IPC_CHANNELS.inventorySaveService,
  async (_event, payload: SaveServicePayload) =>
    managedCore.invoke<InventorySnapshot>('inventory.saveService', payload),
);
ipcMain.handle(
  IPC_CHANNELS.inventoryApplyStockUpdates,
  async (_event, payload: StockUpdatePayload) =>
    managedCore.invoke<InventorySnapshot>('inventory.applyStockUpdates', payload),
);
ipcMain.handle(
  IPC_CHANNELS.inventorySubmitStockReport,
  async (_event, payload: StockReportSubmission) =>
    managedCore.invoke<InventorySnapshot>('inventory.submitStockReport', payload),
);
ipcMain.handle(
  IPC_CHANNELS.inventorySaveRanking,
  async (_event, payload: SaveRankingPayload) =>
    managedCore.invoke<InventorySnapshot>('inventory.saveRanking', payload),
);
ipcMain.handle(
  IPC_CHANNELS.inventoryGetSistSkuDetail,
  async (_event, payload: GetSistSkuDetailPayload) =>
    managedCore.invoke('inventory.getSistSkuDetail', {
      skuId: payload.skuId,
    }),
);
ipcMain.handle(
  IPC_CHANNELS.inventoryUpdateSistSettings,
  async (_event, payload: SistSettings) =>
    managedCore.invoke<InventorySnapshot>('inventory.updateSistSettings', payload),
);
ipcMain.handle(IPC_CHANNELS.preferencesGet, async () =>
  loadDesktopPreferences(app.getPath('userData')),
);
ipcMain.handle(
  IPC_CHANNELS.preferencesSave,
  async (_event, payload: Partial<DesktopPreferences>) =>
    saveDesktopPreferences(app.getPath('userData'), payload),
);

app.whenReady().then(boot);

app.on('activate', async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createMainWindow();
  }
});

app.on('window-all-closed', async () => {
  if (process.platform !== 'darwin') {
    await managedCore.stop();
    app.quit();
  }
});

app.on('before-quit', async () => {
  await managedCore.stop();
});
