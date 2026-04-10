import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, screen, session, shell } from 'electron';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasMacDockIconPair, macIconAssets } from '@icons/native';
import { createManagedCoreController } from './core-manager';
import { migrateLegacyDesktopData } from './data-migration';
import {
  clearCurrentDesktopData,
  createAutomaticDesktopBackupSnapshot,
  createDesktopBackupSnapshot,
  desktopBackupDirectoryPath,
  restoreDesktopBackupSnapshot,
} from './local-backup';
import { loadDesktopPreferences, saveDesktopPreferences } from './preferences';
import {
  IPC_CHANNELS,
  type DesktopAppContext,
  type DesktopBackupRestoreResult,
  type DesktopBackupSnapshotResult,
  type DesktopClearCurrentDataResult,
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
const PREFERRED_BASELINE_ZOOM_LEVEL = -1;
const PREFERRED_BASELINE_ZOOM_FACTOR = 1.2 ** PREFERRED_BASELINE_ZOOM_LEVEL;
const ZOOM_LEVEL_STEP = 0.5;
const MIN_WINDOW_ZOOM_LEVEL = -3;
const MAX_WINDOW_ZOOM_LEVEL = 3;
const senaReadCache = new Map<string, unknown>();
const senaInflightReads = new Map<string, Promise<unknown>>();
const windowZoomLevels = new WeakMap<BrowserWindow, number>();
let senaObservationFingerprint: string | null = null;

async function snapshotBeforeWorkspaceMutation(reason: string) {
  try {
    await createAutomaticDesktopBackupSnapshot({
      reason,
      userDataPath: desktopDataPath,
    });
  } catch (error) {
    console.warn(`[desktop-data] automatic backup snapshot skipped for ${reason}`, error);
  }
}

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

function clampWindowZoomLevel(level: number) {
  return Math.max(MIN_WINDOW_ZOOM_LEVEL, Math.min(MAX_WINDOW_ZOOM_LEVEL, level));
}

function getManagedWindowZoomLevel(window: BrowserWindow | null | undefined) {
  if (!window) {
    return PREFERRED_BASELINE_ZOOM_LEVEL;
  }
  return windowZoomLevels.get(window) ?? PREFERRED_BASELINE_ZOOM_LEVEL;
}

function applyManagedWindowZoomLevel(window: BrowserWindow | null | undefined) {
  if (!window) {
    return;
  }
  const zoomLevel = getManagedWindowZoomLevel(window);
  window.webContents.setZoomLevel(zoomLevel);
}

function setManagedWindowZoomLevel(window: BrowserWindow | null | undefined, level: number) {
  if (!window) {
    return;
  }
  windowZoomLevels.set(window, clampWindowZoomLevel(level));
  applyManagedWindowZoomLevel(window);
}

function changeFocusedWindowZoom(stepDelta: number) {
  const window = BrowserWindow.getFocusedWindow();
  if (!window) {
    return;
  }
  setManagedWindowZoomLevel(window, getManagedWindowZoomLevel(window) + stepDelta * ZOOM_LEVEL_STEP);
}

function applyPreferredWindowZoomLevel(window: BrowserWindow | null | undefined) {
  setManagedWindowZoomLevel(window, PREFERRED_BASELINE_ZOOM_LEVEL);
}

function installOptionalWindowZoomLimits(window: BrowserWindow) {
  const { webContents } = window;

  if (typeof webContents.setVisualZoomLevelLimits === 'function') {
    webContents.setVisualZoomLevelLimits(1, 1).catch((error) => {
      console.warn('[window] failed to disable visual zoom', error);
    });
  }

  if (typeof (webContents as Electron.WebContents & {
    setLayoutZoomLevelLimits?: (minimumLevel: number, maximumLevel: number) => void;
  }).setLayoutZoomLevelLimits === 'function') {
    (webContents as Electron.WebContents & {
      setLayoutZoomLevelLimits: (minimumLevel: number, maximumLevel: number) => void;
    }).setLayoutZoomLevelLimits(0, 0);
  }
}

function installPreferredWindowZoomBehavior(window: BrowserWindow) {
  const { webContents } = window;

  // Banji owns zoom state itself so Chromium cannot drift to a different per-origin level and then
  // snap back later. Reapply the managed zoom across every lifecycle edge that can recreate or
  // reattach the renderer.
  windowZoomLevels.set(window, PREFERRED_BASELINE_ZOOM_LEVEL);
  installOptionalWindowZoomLimits(window);
  applyManagedWindowZoomLevel(window);
  webContents.on('did-start-loading', () => {
    applyManagedWindowZoomLevel(window);
  });
  webContents.on('did-navigate', () => {
    applyManagedWindowZoomLevel(window);
  });
  webContents.on('did-navigate-in-page', () => {
    applyManagedWindowZoomLevel(window);
  });
  webContents.on('dom-ready', () => {
    applyManagedWindowZoomLevel(window);
  });
  webContents.on('did-finish-load', () => {
    applyManagedWindowZoomLevel(window);
  });
  window.on('focus', () => {
    applyManagedWindowZoomLevel(window);
  });
}

function createMainWindowWebPreferences(): Electron.BrowserWindowConstructorOptions['webPreferences'] {
  return {
    preload: join(__dirname, '../preload/index.mjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    // Seed the preferred baseline into Chromium before the first paint so Banji never flashes at
    // Electron's default 100% zoom and then snaps back out after load.
    zoomFactor: PREFERRED_BASELINE_ZOOM_FACTOR,
  };
}

function setFocusedWindowToActualSize() {
  // Banji's "Actual Size" restores the app's preferred baseline zoom, not Electron's literal 100%.
  applyPreferredWindowZoomLevel(BrowserWindow.getFocusedWindow());
}

function navigateMainWindowToHashRoute(route: `/${string}`) {
  const window = mainWindow ?? BrowserWindow.getFocusedWindow();
  const currentUrl = window?.webContents.getURL();

  if (!window || !currentUrl) {
    return;
  }

  const baseUrl = currentUrl.replace(/#.*$/, '');
  void window.loadURL(`${baseUrl}#${route}`);
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
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => {
            changeFocusedWindowZoom(1);
          },
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            changeFocusedWindowZoom(-1);
          },
        },
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
      submenu: [
        {
          label: 'User Guide',
          click: () => {
            navigateMainWindowToHashRoute('/help');
          },
        },
        {
          label: 'Report an Issue',
          click: () => {
            void shell.openExternal('https://github.com/Svanny/banji/issues');
          },
        },
      ],
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
    webPreferences: createMainWindowWebPreferences(),
  });

  installPreferredWindowZoomBehavior(mainWindow);

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
    backupDirectoryPath: desktopBackupDirectoryPath(desktopDataPath),
    storageFormat: 'sqlite',
  };
  return info;
});
ipcMain.handle(IPC_CHANNELS.systemCreateBackupSnapshot, async () => {
  const snapshot: DesktopBackupSnapshotResult = await createDesktopBackupSnapshot({
    reason: 'settings',
    trigger: 'manual',
    userDataPath: desktopDataPath,
  });
  return snapshot;
});
ipcMain.handle(IPC_CHANNELS.systemRestoreBackupSnapshot, async () => {
  const selection = await dialog.showOpenDialog(mainWindow ?? undefined, {
    buttonLabel: 'Restore snapshot',
    defaultPath: desktopBackupDirectoryPath(desktopDataPath),
    properties: ['openDirectory', 'openFile'],
    title: 'Choose a saved snapshot to restore',
  });
  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }

  await managedCore.stop();
  const result: DesktopBackupRestoreResult = await restoreDesktopBackupSnapshot({
    selectedPath: selection.filePaths[0]!,
    userDataPath: desktopDataPath,
  });
  await invalidateSenaReadCache();
  return result;
});
ipcMain.handle(IPC_CHANNELS.systemClearCurrentData, async () => {
  await managedCore.stop();
  const result: DesktopClearCurrentDataResult = await clearCurrentDesktopData(desktopDataPath);
  await invalidateSenaReadCache();
  return result;
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
ipcMain.handle(IPC_CHANNELS.inventorySubmitReport, async (_event, payload: StockReportSubmission) => {
  await snapshotBeforeWorkspaceMutation('inventory-submit-report');
  return managedCore.invoke<StockReport>('inventory.submitReport', payload);
});
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
  await snapshotBeforeWorkspaceMutation('sena-upsert-catalog');
  const result = await managedCore.invoke<SenaCatalog>('sena.upsertCatalog', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
});
ipcMain.handle(IPC_CHANNELS.senaIngestObservation, async (_event, payload: SenaObservationInput) => {
  await snapshotBeforeWorkspaceMutation('sena-ingest-observation');
  const result = await managedCore.invoke<SenaObservationRecord>('sena.ingestObservation', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
});
ipcMain.handle(IPC_CHANNELS.senaUpdateObservation, async (_event, payload: SenaObservationUpdatePayload) => {
  await snapshotBeforeWorkspaceMutation('sena-update-observation');
  const result = await managedCore.invoke<SenaObservationRecord>('sena.updateObservation', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
});
ipcMain.handle(IPC_CHANNELS.senaDeleteObservation, async (_event, payload: SenaObservationDeletePayload) => {
  await snapshotBeforeWorkspaceMutation('sena-delete-observation');
  await managedCore.invoke('sena.deleteObservation', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
});
ipcMain.handle(IPC_CHANNELS.senaTriggerRun, async (_event, payload?: SenaTriggerRunPayload) => {
  await snapshotBeforeWorkspaceMutation('sena-trigger-run');
  const result = await managedCore.invoke<SenaAnalysisRunRecord>('sena.triggerRun', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
});
ipcMain.handle(IPC_CHANNELS.senaRetryRun, async (_event, payload: SenaRunLookupPayload) => {
  await snapshotBeforeWorkspaceMutation('sena-retry-run');
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
  async (_event, payload: Partial<DesktopPreferences>) => {
    await snapshotBeforeWorkspaceMutation('preferences-save');
    return saveDesktopPreferences(desktopDataPath, payload);
  },
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
