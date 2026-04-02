import { app, BrowserWindow, ipcMain, nativeImage, shell } from 'electron';
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createManagedCoreController } from './core-manager';
import { migrateLegacyDesktopData } from './data-migration';
import { hasMacDockIconPair, macIconAssets } from './icon';
import { loadDesktopPreferences, saveDesktopPreferences } from './preferences';
import {
  IPC_CHANNELS,
  type DesktopAppContext,
  type DesktopLocalDataInfo,
  type DesktopPreferences,
  type SenaRunLookupPayload,
  type SenaServiceLookupPayload,
  type SenaSkuLookupPayload,
  type SenaTriggerRunPayload,
} from '@shared/ipc';
import type { InventorySnapshot, StockReport, StockReportSubmission } from '@shared/inventory';
import type {
  SenaAnalysisRunRecord,
  SenaCatalog,
  SenaDiagnostics,
  SenaObservationInput,
  SenaObservationRecord,
  SenaServiceDetail,
  SenaSkuDetail,
  SenaWorkspaceSummary,
} from '@shared/sena';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../..');
const iconAssets = macIconAssets(projectRoot);
const desktopDataPath = app.isPackaged
  ? app.getPath('userData')
  : join(projectRoot, '.banji-dev-data');

const SENA_STORE_FILENAME = 'desktop-sena-store.sqlite3';
const PREFERENCES_STORE_FILENAME = 'desktop-preferences.json';

let mainWindow: BrowserWindow | null = null;
let desktopContext: DesktopAppContext = {
  appVersion: app.getVersion(),
  platform: process.platform,
};

const managedCore = createManagedCoreController({
  projectRoot,
  userDataPath: desktopDataPath,
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

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
}

async function boot() {
  if (!app.isPackaged) {
    const migratedFiles = await migrateLegacyDesktopData(
      desktopDataPath,
      app.getPath('userData'),
    );
    if (migratedFiles.length > 0) {
      console.log(
        `[desktop-data] migrated ${migratedFiles.join(', ')} from legacy Electron userData`,
      );
    }
    const seeded = await managedCore.invoke<boolean>('sena.seedDevWorkspace');
    if (seeded) {
      console.log('[desktop-data] seeded local dev SENA workspace');
    }
  }
  if (process.platform === 'darwin' && hasMacDockIconPair(projectRoot)) {
    app.dock.setIcon(nativeImage.createFromPath(iconAssets.dockIconPath));
  }
  await createMainWindow();
}

ipcMain.handle(IPC_CHANNELS.systemGetAppContext, async () => desktopContext);
ipcMain.handle(IPC_CHANNELS.systemGetLocalDataInfo, async () => {
  const info: DesktopLocalDataInfo = {
    dataDirectoryPath: desktopDataPath,
    workspaceStorePath: join(desktopDataPath, SENA_STORE_FILENAME),
    preferencesPath: join(desktopDataPath, PREFERENCES_STORE_FILENAME),
    storageFormat: 'sqlite',
  };
  return info;
});
ipcMain.handle(IPC_CHANNELS.systemOpenLocalDataFolder, async () => {
  await mkdir(desktopDataPath, { recursive: true });
  const openError = await shell.openPath(desktopDataPath);
  if (openError) {
    throw new Error(openError);
  }
});

ipcMain.handle(IPC_CHANNELS.inventoryLoadSnapshot, async () =>
  managedCore.invoke<InventorySnapshot>('inventory.loadSnapshot'),
);
ipcMain.handle(IPC_CHANNELS.inventoryListReports, async () =>
  managedCore.invoke<StockReport[]>('inventory.listReports'),
);
ipcMain.handle(IPC_CHANNELS.inventorySubmitReport, async (_event, payload: StockReportSubmission) =>
  managedCore.invoke<StockReport>('inventory.submitReport', payload),
);
ipcMain.handle(IPC_CHANNELS.senaGetCatalog, async () =>
  managedCore.invoke<SenaCatalog | null>('sena.getCatalog'),
);
ipcMain.handle(IPC_CHANNELS.senaListObservations, async () =>
  managedCore.invoke<SenaObservationRecord[]>('sena.listObservations'),
);
ipcMain.handle(IPC_CHANNELS.senaUpsertCatalog, async (_event, payload: SenaCatalog) =>
  managedCore.invoke<SenaCatalog>('sena.upsertCatalog', payload),
);
ipcMain.handle(IPC_CHANNELS.senaIngestObservation, async (_event, payload: SenaObservationInput) =>
  managedCore.invoke<SenaObservationRecord>('sena.ingestObservation', payload),
);
ipcMain.handle(IPC_CHANNELS.senaTriggerRun, async (_event, payload?: SenaTriggerRunPayload) =>
  managedCore.invoke<SenaAnalysisRunRecord>('sena.triggerRun', payload),
);
ipcMain.handle(IPC_CHANNELS.senaRetryRun, async (_event, payload: SenaRunLookupPayload) =>
  managedCore.invoke<SenaAnalysisRunRecord>('sena.retryRun', payload),
);
ipcMain.handle(IPC_CHANNELS.senaGetWorkspaceSummary, async () =>
  managedCore.invoke<SenaWorkspaceSummary | null>('sena.getWorkspaceSummary'),
);
ipcMain.handle(IPC_CHANNELS.senaGetSkuDetail, async (_event, payload: SenaSkuLookupPayload) =>
  managedCore.invoke<SenaSkuDetail | null>('sena.getSkuDetail', { skuId: payload.skuId }),
);
ipcMain.handle(IPC_CHANNELS.senaGetDiagnostics, async () =>
  managedCore.invoke<SenaDiagnostics | null>('sena.getDiagnostics'),
);
ipcMain.handle(
  IPC_CHANNELS.senaGetServiceDetail,
  async (_event, payload: SenaServiceLookupPayload) =>
    managedCore.invoke<SenaServiceDetail | null>('sena.getServiceDetail', {
      serviceId: payload.serviceId,
    }),
);
ipcMain.handle(IPC_CHANNELS.senaGetRunStatus, async (_event, payload: SenaRunLookupPayload) =>
  managedCore.invoke<SenaAnalysisRunRecord | null>('sena.getRunStatus', payload),
);

ipcMain.handle(IPC_CHANNELS.preferencesGet, async () =>
  loadDesktopPreferences(desktopDataPath),
);
ipcMain.handle(
  IPC_CHANNELS.preferencesSave,
  async (_event, payload: Partial<DesktopPreferences>) =>
    saveDesktopPreferences(desktopDataPath, payload),
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
