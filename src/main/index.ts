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

const LONG_RUNNING_CORE_TIMEOUT_MS = 180_000;
const SENA_READ_TIMEOUT_MS = 60_000;
const senaReadCache = new Map<string, unknown>();
const senaInflightReads = new Map<string, Promise<unknown>>();

function invalidateSenaReadCache() {
  senaReadCache.clear();
  senaInflightReads.clear();
}

async function loadCachedSenaRead<T>(key: string, loader: () => Promise<T>): Promise<T> {
  if (senaReadCache.has(key)) {
    return senaReadCache.get(key) as T;
  }

  const inflight = senaInflightReads.get(key);
  if (inflight) {
    return (await inflight) as T;
  }

  const request = loader()
    .then((value) => {
      senaReadCache.set(key, value);
      senaInflightReads.delete(key);
      return value;
    })
    .catch((error) => {
      senaInflightReads.delete(key);
      throw error;
    });

  senaInflightReads.set(key, request);
  return (await request) as T;
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
    try {
      const seeded = await managedCore.invoke<boolean>('sena.seedDevWorkspace', undefined, {
        timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
      });
      if (seeded) {
        invalidateSenaReadCache();
        console.log('[desktop-data] seeded local dev SENA workspace');
      }
    } catch (error) {
      console.error('[desktop-data] failed to seed local dev SENA workspace', error);
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
  loadCachedSenaRead('catalog', () =>
    managedCore.invoke<SenaCatalog | null>('sena.getCatalog', undefined, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
    }),
  ),
);
ipcMain.handle(IPC_CHANNELS.senaListObservations, async () =>
  loadCachedSenaRead('observations', () =>
    managedCore.invoke<SenaObservationRecord[]>('sena.listObservations', undefined, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
    }),
  ),
);
ipcMain.handle(IPC_CHANNELS.senaUpsertCatalog, async (_event, payload: SenaCatalog) => {
  const result = await managedCore.invoke<SenaCatalog>('sena.upsertCatalog', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  invalidateSenaReadCache();
  return result;
});
ipcMain.handle(IPC_CHANNELS.senaIngestObservation, async (_event, payload: SenaObservationInput) => {
  const result = await managedCore.invoke<SenaObservationRecord>('sena.ingestObservation', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  invalidateSenaReadCache();
  return result;
});
ipcMain.handle(IPC_CHANNELS.senaTriggerRun, async (_event, payload?: SenaTriggerRunPayload) => {
  const result = await managedCore.invoke<SenaAnalysisRunRecord>('sena.triggerRun', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  invalidateSenaReadCache();
  return result;
});
ipcMain.handle(IPC_CHANNELS.senaRetryRun, async (_event, payload: SenaRunLookupPayload) => {
  const result = await managedCore.invoke<SenaAnalysisRunRecord>('sena.retryRun', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  invalidateSenaReadCache();
  return result;
});
ipcMain.handle(IPC_CHANNELS.senaGetWorkspaceSummary, async () =>
  loadCachedSenaRead('workspace-summary', () =>
    managedCore.invoke<SenaWorkspaceSummary | null>('sena.getWorkspaceSummary', undefined, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
    }),
  ),
);
ipcMain.handle(IPC_CHANNELS.senaGetSkuDetail, async (_event, payload: SenaSkuLookupPayload) =>
  loadCachedSenaRead(`sku-detail:${payload.skuId}`, () =>
    managedCore.invoke<SenaSkuDetail | null>('sena.getSkuDetail', { skuId: payload.skuId }, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
    }),
  ),
);
ipcMain.handle(IPC_CHANNELS.senaGetDiagnostics, async () =>
  loadCachedSenaRead('diagnostics', () =>
    managedCore.invoke<SenaDiagnostics | null>('sena.getDiagnostics', undefined, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
    }),
  ),
);
ipcMain.handle(
  IPC_CHANNELS.senaGetServiceDetail,
  async (_event, payload: SenaServiceLookupPayload) =>
    loadCachedSenaRead(`service-detail:${payload.serviceId}`, () =>
      managedCore.invoke<SenaServiceDetail | null>('sena.getServiceDetail', {
        serviceId: payload.serviceId,
      }, {
        timeoutMs: SENA_READ_TIMEOUT_MS,
      }),
    ),
);
ipcMain.handle(IPC_CHANNELS.senaGetRunStatus, async (_event, payload: SenaRunLookupPayload) =>
  loadCachedSenaRead(`run-status:${payload.runId}`, () =>
    managedCore.invoke<SenaAnalysisRunRecord | null>('sena.getRunStatus', payload, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
    }),
  ),
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
