import { app, BrowserWindow, ipcMain, Menu, nativeImage, screen, session, shell } from 'electron';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasMacDockIconPair, macIconAssets } from '@icons/native';
import { createManagedCoreController } from './core-manager';
import { migrateLegacyDesktopData } from './data-migration';
import { loadDesktopPreferences, saveDesktopPreferences } from './preferences';
import {
  IPC_CHANNELS,
  type DesktopAppContext,
  type DesktopLocalDataInfo,
  type DesktopPreferences,
  type SenaDetailCacheClearPayload,
  type SenaRunLookupPayload,
  type SenaServiceLookupPayload,
  type SenaSkuLookupPayload,
  type SenaTriggerRunPayload,
} from '@shared/ipc';
import type { InventorySnapshot, StockReport, StockReportSubmission } from '@shared/inventory';
import type {
  SenaAnalysisRunRecord,
  SenaCatalog,
  SenaObservationDeletePayload,
  SenaDiagnostics,
  SenaObservationInput,
  SenaObservationRecord,
  SenaObservationUpdatePayload,
  SenaServiceDetailPage,
  SenaSkuDetailPage,
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
const SENA_READ_CACHE_FILENAME = 'desktop-sena-read-cache.json';
const SENA_READ_CACHE_SCHEMA_VERSION = 1;

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
const INVENTORY_READ_TIMEOUT_MS = 60_000;
const DEFAULT_ACTUAL_SIZE_ZOOM_LEVEL = -1;
const senaReadCache = new Map<string, unknown>();
const senaInflightReads = new Map<string, Promise<unknown>>();
let senaObservationFingerprint: string | null = null;

function senaReadCachePath() {
  return join(desktopDataPath, SENA_READ_CACHE_FILENAME);
}

function serializeSenaReadCache() {
  return {
    schemaVersion: SENA_READ_CACHE_SCHEMA_VERSION,
    observationFingerprint: senaObservationFingerprint,
    entries: Object.fromEntries(senaReadCache.entries()),
  };
}

async function persistSenaReadCache() {
  await mkdir(desktopDataPath, { recursive: true });
  await writeFile(senaReadCachePath(), JSON.stringify(serializeSenaReadCache()), 'utf8');
}

async function loadPersistedSenaReadCache() {
  try {
    const raw = await readFile(senaReadCachePath(), 'utf8');
    const parsed = JSON.parse(raw) as {
      schemaVersion?: number;
      observationFingerprint?: string | null;
      entries?: Record<string, unknown>;
    };
    if (parsed.schemaVersion !== SENA_READ_CACHE_SCHEMA_VERSION || !parsed.entries) {
      return;
    }
    senaReadCache.clear();
    for (const [key, value] of Object.entries(parsed.entries)) {
      senaReadCache.set(key, value);
    }
    senaObservationFingerprint = parsed.observationFingerprint ?? null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[desktop-data] failed to load persisted SENA cache', error);
    }
  }
}

function deriveObservationFingerprint(observations: SenaObservationRecord[]) {
  const latest = observations.reduce<SenaObservationRecord | null>((current, candidate) => {
    if (!current) {
      return candidate;
    }
    const currentAt = current.input.observedAt ?? '';
    const candidateAt = candidate.input.observedAt ?? '';
    if (candidateAt > currentAt) {
      return candidate;
    }
    if (candidateAt < currentAt) {
      return current;
    }
    return candidate.observationId > current.observationId ? candidate : current;
  }, null);
  return `${observations.length}:${latest?.input.observedAt ?? 'none'}:${latest?.observationId ?? 'none'}`;
}

async function readCurrentObservationFingerprint() {
  const observations = await managedCore.invoke<SenaObservationRecord[]>('sena.listObservations', undefined, {
    timeoutMs: SENA_READ_TIMEOUT_MS,
  });
  return deriveObservationFingerprint(observations);
}

function buildRendererContentSecurityPolicy() {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
  ];

  if (process.env.ELECTRON_RENDERER_URL) {
    directives.push(
      "script-src 'self' 'unsafe-inline' http://localhost:* http://127.0.0.1:*",
      "connect-src 'self' ws://localhost:* ws://127.0.0.1:* http://localhost:* http://127.0.0.1:*",
    );
  } else {
    directives.push("script-src 'self'", "connect-src 'self'");
  }

  return directives.join('; ');
}

function installRendererContentSecurityPolicy() {
  const policy = buildRendererContentSecurityPolicy();
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [policy],
      },
    });
  });
}

async function invalidateSenaReadCache() {
  senaReadCache.clear();
  senaInflightReads.clear();
  senaObservationFingerprint = null;
  await persistSenaReadCache();
}

async function invalidateSenaDetailCache({ entityId, entityType }: SenaDetailCacheClearPayload) {
  const prefix = entityType === 'sku'
    ? `sku-detail:${entityId}:`
    : `service-detail:${entityId}:`;
  for (const key of senaReadCache.keys()) {
    if (key.startsWith(prefix)) {
      senaReadCache.delete(key);
    }
  }
  for (const key of senaInflightReads.keys()) {
    if (key.startsWith(prefix)) {
      senaInflightReads.delete(key);
    }
  }
  await persistSenaReadCache();
}

async function ensureFreshSenaReadCache() {
  const currentFingerprint = await readCurrentObservationFingerprint();
  if (senaObservationFingerprint === currentFingerprint) {
    return;
  }
  senaReadCache.clear();
  senaInflightReads.clear();
  senaObservationFingerprint = currentFingerprint;
  await persistSenaReadCache();
}

async function loadCachedSenaRead<T>(key: string, loader: () => Promise<T>): Promise<T> {
  await ensureFreshSenaReadCache();

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
      void persistSenaReadCache();
      return value;
    })
    .catch((error) => {
      senaInflightReads.delete(key);
      throw error;
    });

  senaInflightReads.set(key, request);
  return (await request) as T;
}

function setFocusedWindowToActualSize() {
  const focusedWindow = BrowserWindow.getFocusedWindow();
  focusedWindow?.webContents.setZoomLevel(DEFAULT_ACTUAL_SIZE_ZOOM_LEVEL);
}

function installApplicationMenu() {
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(process.platform === 'darwin'
      ? [
          {
            label: app.name,
            submenu: [
              { role: 'about' },
              { type: 'separator' },
              { role: 'services' },
              { type: 'separator' },
              { role: 'hide' },
              { role: 'hideOthers' },
              { role: 'unhide' },
              { type: 'separator' },
              { role: 'quit' },
            ],
          },
        ]
      : []),
    {
      label: 'File',
      submenu: process.platform === 'darwin' ? [{ role: 'close' }] : [{ role: 'quit' }],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(process.platform === 'darwin'
          ? [
              { role: 'pasteAndMatchStyle' },
              { role: 'delete' },
              { role: 'selectAll' },
            ]
          : [
              { role: 'delete' },
              { type: 'separator' },
              { role: 'selectAll' },
            ]),
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        { type: 'separator' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        {
          label: 'Actual Size',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            setFocusedWindowToActualSize();
          },
        },
      ],
    },
    {
      label: 'Window',
      submenu: process.platform === 'darwin'
        ? [
            { role: 'minimize' },
            { role: 'zoom' },
            { type: 'separator' },
            { role: 'front' },
            { type: 'separator' },
            { role: 'window' },
          ]
        : [{ role: 'minimize' }, { role: 'close' }],
    },
    {
      label: 'Help',
      submenu: [],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

async function createMainWindow() {
  const { x, y, width, height } = screen.getPrimaryDisplay().workArea;
  mainWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
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

  mainWindow.webContents.setZoomLevel(DEFAULT_ACTUAL_SIZE_ZOOM_LEVEL);
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
}

async function boot() {
  installRendererContentSecurityPolicy();
  installApplicationMenu();
  await loadPersistedSenaReadCache();
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
        await invalidateSenaReadCache();
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
ipcMain.handle(IPC_CHANNELS.systemRevealPath, async (_event, targetPath: string) => {
  if (typeof targetPath !== 'string' || targetPath.trim().length === 0) {
    throw new Error('A local path is required.');
  }

  const normalizedPath = targetPath.trim();
  const targetStats = await stat(normalizedPath).catch(() => null);
  if (targetStats?.isDirectory()) {
    const openError = await shell.openPath(normalizedPath);
    if (openError) {
      throw new Error(openError);
    }
    return;
  }

  shell.showItemInFolder(normalizedPath);
});

ipcMain.handle(IPC_CHANNELS.inventoryLoadSnapshot, async () =>
  managedCore.invoke<InventorySnapshot>('inventory.loadSnapshot', undefined, {
    timeoutMs: INVENTORY_READ_TIMEOUT_MS,
  }),
);
ipcMain.handle(IPC_CHANNELS.inventoryListReports, async () =>
  managedCore.invoke<StockReport[]>('inventory.listReports', undefined, {
    timeoutMs: INVENTORY_READ_TIMEOUT_MS,
  }),
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
  await invalidateSenaReadCache();
  return result;
});
ipcMain.handle(IPC_CHANNELS.senaIngestObservation, async (_event, payload: SenaObservationInput) => {
  const result = await managedCore.invoke<SenaObservationRecord>('sena.ingestObservation', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
});
ipcMain.handle(IPC_CHANNELS.senaUpdateObservation, async (_event, payload: SenaObservationUpdatePayload) => {
  const result = await managedCore.invoke<SenaObservationRecord>('sena.updateObservation', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
});
ipcMain.handle(IPC_CHANNELS.senaDeleteObservation, async (_event, payload: SenaObservationDeletePayload) => {
  await managedCore.invoke('sena.deleteObservation', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
});
ipcMain.handle(IPC_CHANNELS.senaTriggerRun, async (_event, payload?: SenaTriggerRunPayload) => {
  const result = await managedCore.invoke<SenaAnalysisRunRecord>('sena.triggerRun', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
});
ipcMain.handle(IPC_CHANNELS.senaRetryRun, async (_event, payload: SenaRunLookupPayload) => {
  const result = await managedCore.invoke<SenaAnalysisRunRecord>('sena.retryRun', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
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
  loadCachedSenaRead(`sku-detail:${payload.skuId}:before:${payload.beforeIntervalIndex ?? 'latest'}:limit:${payload.limit ?? 20}`, () =>
    managedCore.invoke<SenaSkuDetailPage | null>('sena.getSkuDetail', {
      skuId: payload.skuId,
      beforeIntervalIndex: payload.beforeIntervalIndex ?? null,
      limit: payload.limit ?? 20,
    }, {
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
    loadCachedSenaRead(`service-detail:${payload.serviceId}:before:${payload.beforeIntervalIndex ?? 'latest'}:limit:${payload.limit ?? 20}`, () =>
      managedCore.invoke<SenaServiceDetailPage | null>('sena.getServiceDetail', {
        serviceId: payload.serviceId,
        beforeIntervalIndex: payload.beforeIntervalIndex ?? null,
        limit: payload.limit ?? 20,
      }, {
        timeoutMs: SENA_READ_TIMEOUT_MS,
      }),
    ),
);
ipcMain.handle(
  IPC_CHANNELS.senaClearDetailCache,
  async (_event, payload: SenaDetailCacheClearPayload) =>
    invalidateSenaDetailCache(payload),
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
