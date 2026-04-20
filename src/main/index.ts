import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, protocol, screen, session, shell } from 'electron';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
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
  SenaCreateOrderBatchPayload,
  SenaObservationDeletePayload,
  SenaDiagnostics,
  SenaObservationFingerprint,
  SenaObservationInput,
  SenaObservationPage,
  SenaObservationPageRequest,
  SenaObservationRecord,
  SenaOrderBatchRecord,
  SenaOrderLookupPayload,
  SenaRecordUpdateContext,
  SenaSplitOrderChildPayload,
  SenaObservationUpdatePayload,
  SenaServiceDetailPage,
  SenaSkuDetailPage,
  SenaStartupWorkspace,
  SenaUpdateOrderBatchPayload,
  SenaUpdateOrderChildPayload,
  SenaWorkspaceSummary,
} from '@shared/sena';
import { summarizeBenchmarkPayload, type BanjiBenchmarkCategory } from '@shared/benchmark';
import {
  recordBenchmarkEvent,
  recordExternalBenchmarkEvent,
  snapshotProcessMemory,
  startBenchmarkSpan,
} from './benchmark';
import { registerBenchmarkRunnerIpc } from './benchmark-runner';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../..');
const iconAssets = macIconAssets(projectRoot);
const configuredDesktopDataPath = process.env.BANJI_BENCHMARK_DATA_DIR?.trim()
  || process.env.BANJI_DESKTOP_DATA_DIR?.trim();
const benchmarkWindowBackgroundMode = process.env.BANJI_BENCHMARK_BACKGROUND === '1';
const desktopDataPath = app.isPackaged
  ? app.getPath('userData')
  : configuredDesktopDataPath || join(projectRoot, '.banji-dev-data');

if (!app.isPackaged && configuredDesktopDataPath) {
  app.setPath('userData', configuredDesktopDataPath);
}

const SENA_STORE_FILENAME = 'desktop-sena-store.sqlite3';
const PREFERENCES_STORE_FILENAME = 'desktop-preferences.json';
const SENA_READ_CACHE_FILENAME = 'desktop-sena-read-cache.json';
const SENA_READ_CACHE_SCHEMA_VERSION = 1;
const SENA_READ_CACHE_MAX_PERSISTED_ENTRY_BYTES = 512_000;
const DESKTOP_ASSET_DIRECTORY = 'assets';
const DESKTOP_ASSET_PROTOCOL = 'banji-asset';
const DESKTOP_ASSET_HOST = 'local';
const DESKTOP_IMAGE_IMPORT_EXTENSIONS = ['png', 'jpg', 'jpeg'] as const;
const DESKTOP_ALLOWED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const DESKTOP_IMAGE_MAX_DIMENSION_PX = 1600;
const DESKTOP_IMAGE_TARGET_MAX_BYTES = 1_500_000;
const DESKTOP_IMAGE_SCALE_STEPS = [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.25] as const;
const DESKTOP_IMAGE_JPEG_QUALITY_STEPS = [88, 80, 72, 64, 56, 48] as const;

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

registerBenchmarkRunnerIpc({
  appIsPackaged: app.isPackaged,
  projectRoot,
});

const LONG_RUNNING_CORE_TIMEOUT_MS = 180_000;
const SENA_READ_TIMEOUT_MS = 60_000;
const INVENTORY_READ_TIMEOUT_MS = 60_000;
const SENA_READ_CACHE_PERSIST_DEBOUNCE_MS = 500;
const PREFERRED_BASELINE_ZOOM_LEVEL = -1;
const PREFERRED_BASELINE_ZOOM_FACTOR = 1.2 ** PREFERRED_BASELINE_ZOOM_LEVEL;
const ZOOM_LEVEL_STEP = 0.5;
const MIN_WINDOW_ZOOM_LEVEL = -3;
const MAX_WINDOW_ZOOM_LEVEL = 3;
const senaReadCache = new Map<string, unknown>();
const senaInflightReads = new Map<string, Promise<unknown>>();
const windowZoomLevels = new WeakMap<BrowserWindow, number>();
let senaObservationFingerprint: string | null = null;
let senaFreshnessCheck: Promise<void> | null = null;
let senaReadCacheValidated = false;
let senaReadCachePersistTimer: ReturnType<typeof setTimeout> | null = null;

recordBenchmarkEvent({
  layer: 'main',
  category: 'startup',
  name: 'main.boot.start',
  phase: 'instant',
  detail: {
    appVersion: desktopContext.appVersion,
    platform: desktopContext.platform,
  },
});

function benchmarkIpcHandle<TArgs extends unknown[], TResult>(
  channel: string,
  handler: (...args: TArgs) => Promise<TResult> | TResult,
) {
  return async (...args: TArgs): Promise<TResult> => {
    const end = startBenchmarkSpan({
      category: 'ipc',
      name: `ipc.${channel}.handle`,
      command: channel,
      detail: {
        payload: summarizeBenchmarkPayload(args.slice(1)),
      },
    });
    try {
      const result = await handler(...args);
      end({
        ok: true,
        result: summarizeBenchmarkPayload(result),
      });
      return result;
    } catch (error) {
      end({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };
}

function benchmarkCacheEvent(
  name: string,
  detail?: Record<string, unknown>,
  category: BanjiBenchmarkCategory = 'ipc',
) {
  recordBenchmarkEvent({
    layer: 'main',
    category,
    name,
    phase: 'instant',
    detail,
  });
}

async function snapshotBeforeWorkspaceMutation(reason: string) {
  try {
    await managedCore.stop();
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

function desktopAssetDirectoryPath() {
  return join(desktopDataPath, DESKTOP_ASSET_DIRECTORY);
}

function normalizeImportedImageExtension(sourcePath: string) {
  const extension = extname(sourcePath).toLowerCase();
  if (extension === '.png') {
    return '.png' as const;
  }
  if (extension === '.jpg' || extension === '.jpeg') {
    return '.jpg' as const;
  }
  return null;
}

function computeImportedImageDimensions(width: number, height: number, scaleStep: number) {
  const maxEdge = Math.max(width, height);
  const boundedScale = Math.min(1, DESKTOP_IMAGE_MAX_DIMENSION_PX / maxEdge);
  const effectiveScale = Math.min(1, boundedScale * scaleStep);

  return {
    width: Math.max(1, Math.round(width * effectiveScale)),
    height: Math.max(1, Math.round(height * effectiveScale)),
  };
}

function encodeImportedImage(
  image: Electron.NativeImage,
  targetExtension: '.png' | '.jpg',
  jpegQuality?: number,
) {
  return targetExtension === '.png' ? image.toPNG() : image.toJPEG(jpegQuality ?? 80);
}

function normalizeImportedImage(sourcePath: string) {
  const targetExtension = normalizeImportedImageExtension(sourcePath);
  if (!targetExtension) {
    throw new Error('Please choose a PNG or JPEG image.');
  }

  const importedImage = nativeImage.createFromPath(sourcePath);
  if (importedImage.isEmpty()) {
    throw new Error('banji could not read that image file.');
  }

  const { width, height } = importedImage.getSize();
  if (width <= 0 || height <= 0) {
    throw new Error('banji could not determine the image dimensions.');
  }

  let bestBytes = encodeImportedImage(importedImage, targetExtension);

  for (const scaleStep of DESKTOP_IMAGE_SCALE_STEPS) {
    const dimensions = computeImportedImageDimensions(width, height, scaleStep);
    const resizedImage = importedImage.resize(dimensions);

    if (targetExtension === '.png') {
      const pngBytes = encodeImportedImage(resizedImage, '.png');
      if (pngBytes.byteLength < bestBytes.byteLength) {
        bestBytes = pngBytes;
      }
      if (pngBytes.byteLength <= DESKTOP_IMAGE_TARGET_MAX_BYTES) {
        return { bytes: pngBytes, extension: '.png' as const };
      }
      continue;
    }

    for (const jpegQuality of DESKTOP_IMAGE_JPEG_QUALITY_STEPS) {
      const jpegBytes = encodeImportedImage(resizedImage, '.jpg', jpegQuality);
      if (jpegBytes.byteLength < bestBytes.byteLength) {
        bestBytes = jpegBytes;
      }
      if (jpegBytes.byteLength <= DESKTOP_IMAGE_TARGET_MAX_BYTES) {
        return { bytes: jpegBytes, extension: '.jpg' as const };
      }
    }
  }

  return { bytes: bestBytes, extension: targetExtension };
}

function resolveDesktopAssetPathFromRequest(requestUrl: string) {
  try {
    const assetUrl = new URL(requestUrl);
    if (assetUrl.protocol !== `${DESKTOP_ASSET_PROTOCOL}:` || assetUrl.hostname !== DESKTOP_ASSET_HOST) {
      return null;
    }

    const requestedAssetName = decodeURIComponent(assetUrl.pathname.replace(/^\/+/, ''));
    if (!requestedAssetName || requestedAssetName !== basename(requestedAssetName)) {
      return null;
    }

    const assetExtension = extname(requestedAssetName).toLowerCase();
    if (!DESKTOP_ALLOWED_IMAGE_EXTENSIONS.has(assetExtension)) {
      return null;
    }

    return join(desktopAssetDirectoryPath(), requestedAssetName);
  } catch {
    return null;
  }
}

function installDesktopAssetProtocol() {
  protocol.handle(DESKTOP_ASSET_PROTOCOL, async (request) => {
    const assetPath = resolveDesktopAssetPathFromRequest(request.url);
    if (!assetPath) {
      return new Response('Not found', { status: 404 });
    }

    const assetStats = await stat(assetPath).catch(() => null);
    if (!assetStats?.isFile()) {
      return new Response('Not found', { status: 404 });
    }

    return net.fetch(pathToFileURL(assetPath).toString());
  });
}

function shouldPersistSenaReadCacheEntry(key: string, value: unknown) {
  if (key === 'observations' || key.startsWith('observation-page:')) {
    return false;
  }
  try {
    return JSON.stringify(value).length <= SENA_READ_CACHE_MAX_PERSISTED_ENTRY_BYTES;
  } catch {
    return false;
  }
}

function serializeSenaReadCache() {
  const entries = Object.fromEntries(
    Array.from(senaReadCache.entries()).filter(([key, value]) =>
      shouldPersistSenaReadCacheEntry(key, value),
    ),
  );
  return {
    schemaVersion: SENA_READ_CACHE_SCHEMA_VERSION,
    observationFingerprint: senaObservationFingerprint,
    entries,
  };
}

async function persistSenaReadCache() {
  if (senaReadCachePersistTimer) {
    clearTimeout(senaReadCachePersistTimer);
    senaReadCachePersistTimer = null;
  }
  await mkdir(desktopDataPath, { recursive: true });
  await writeFile(senaReadCachePath(), JSON.stringify(serializeSenaReadCache()), 'utf8');
}

function schedulePersistSenaReadCache() {
  if (senaReadCachePersistTimer) {
    clearTimeout(senaReadCachePersistTimer);
  }
  senaReadCachePersistTimer = setTimeout(() => {
    senaReadCachePersistTimer = null;
    void persistSenaReadCache();
  }, SENA_READ_CACHE_PERSIST_DEBOUNCE_MS);
}

async function loadPersistedSenaReadCache() {
  const end = startBenchmarkSpan({
    category: 'startup',
    name: 'main.boot.persisted-cache.load',
  });
  try {
    const raw = await readFile(senaReadCachePath(), 'utf8');
    const parsed = JSON.parse(raw) as {
      schemaVersion?: number;
      observationFingerprint?: string | null;
      entries?: Record<string, unknown>;
    };
    if (parsed.schemaVersion !== SENA_READ_CACHE_SCHEMA_VERSION || !parsed.entries) {
      end({
        ok: true,
        skipped: true,
        reason: 'schema-mismatch',
      });
      return;
    }
    senaReadCache.clear();
    for (const [key, value] of Object.entries(parsed.entries)) {
      if (shouldPersistSenaReadCacheEntry(key, value)) {
        senaReadCache.set(key, value);
      }
    }
    senaObservationFingerprint = parsed.observationFingerprint ?? null;
    end({
      ok: true,
      entries: senaReadCache.size,
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[desktop-data] failed to load persisted SENA cache', error);
    }
    end({
      ok: (error as NodeJS.ErrnoException).code === 'ENOENT',
      skipped: (error as NodeJS.ErrnoException).code === 'ENOENT',
      error: (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? undefined
        : error instanceof Error ? error.message : String(error),
    });
  }
}

function formatObservationFingerprint(fingerprint: SenaObservationFingerprint) {
  return `${fingerprint.count}:${fingerprint.latestObservedAt ?? 'none'}:${fingerprint.latestObservationId ?? 'none'}`;
}

async function readCurrentObservationFingerprint() {
  const fingerprint = await managedCore.invoke<SenaObservationFingerprint>('sena.getObservationFingerprint', undefined, {
    timeoutMs: SENA_READ_TIMEOUT_MS,
    readPriority: 'critical',
  });
  return formatObservationFingerprint(fingerprint);
}

function buildRendererContentSecurityPolicy() {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "img-src 'self' data: blob: file: banji-asset:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
  ];

  if (process.env.ELECTRON_RENDERER_URL) {
    directives.push(
      "script-src 'self' 'unsafe-inline' http://localhost:* http://127.0.0.1:*",
      "worker-src 'self' blob: http://localhost:* http://127.0.0.1:*",
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
  benchmarkCacheEvent('main.cache.sena-read.invalidate', {
    entries: senaReadCache.size,
    inflight: senaInflightReads.size,
  });
  senaReadCache.clear();
  senaInflightReads.clear();
  senaObservationFingerprint = null;
  senaReadCacheValidated = false;
  senaFreshnessCheck = null;
  await persistSenaReadCache();
}

async function invalidateSenaDetailCache({ entityId, entityType }: SenaDetailCacheClearPayload) {
  const prefix = entityType === 'sku'
    ? `sku-detail:${entityId}:`
    : `service-detail:${entityId}:`;
  let removedEntries = 0;
  let removedInflight = 0;
  for (const key of senaReadCache.keys()) {
    if (key.startsWith(prefix)) {
      senaReadCache.delete(key);
      removedEntries += 1;
    }
  }
  for (const key of senaInflightReads.keys()) {
    if (key.startsWith(prefix)) {
      senaInflightReads.delete(key);
      removedInflight += 1;
    }
  }
  benchmarkCacheEvent('main.cache.sena-detail.invalidate', {
    entityId,
    entityType,
    removedEntries,
    removedInflight,
  });
  await persistSenaReadCache();
}

async function ensureFreshSenaReadCache() {
  if (senaReadCacheValidated) {
    return;
  }
  if (senaFreshnessCheck) {
    return senaFreshnessCheck;
  }
  senaFreshnessCheck = (async () => {
    const currentFingerprint = await readCurrentObservationFingerprint();
    if (senaObservationFingerprint === currentFingerprint) {
      benchmarkCacheEvent('main.cache.sena-read.fresh', {
        observationFingerprint: currentFingerprint,
      });
      senaReadCacheValidated = true;
      return;
    }
    benchmarkCacheEvent('main.cache.sena-read.stale', {
      previousFingerprint: senaObservationFingerprint,
      currentFingerprint,
      entries: senaReadCache.size,
    });
    senaReadCache.clear();
    senaInflightReads.clear();
    senaObservationFingerprint = currentFingerprint;
    senaReadCacheValidated = true;
    await persistSenaReadCache();
  })().finally(() => {
    senaFreshnessCheck = null;
  });
  return senaFreshnessCheck;
}

async function loadCachedSenaRead<T>(key: string, loader: () => Promise<T>): Promise<T> {
  await ensureFreshSenaReadCache();

  if (senaReadCache.has(key)) {
    benchmarkCacheEvent('main.cache.sena-read.hit', { key });
    return senaReadCache.get(key) as T;
  }

  const inflight = senaInflightReads.get(key);
  if (inflight) {
    benchmarkCacheEvent('main.cache.sena-read.inflight-hit', { key });
    return (await inflight) as T;
  }

  const endMiss = startBenchmarkSpan({
    category: 'ipc',
    name: 'main.cache.sena-read.miss',
    detail: { key },
  });
  const request = loader()
    .then((value) => {
      senaReadCache.set(key, value);
      senaInflightReads.delete(key);
      if (shouldPersistSenaReadCacheEntry(key, value)) {
        schedulePersistSenaReadCache();
      }
      endMiss({
        ok: true,
        result: summarizeBenchmarkPayload(value),
      });
      return value;
    })
    .catch((error) => {
      senaInflightReads.delete(key);
      endMiss({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    });

  senaInflightReads.set(key, request);
  return (await request) as T;
}

async function loadStartupWorkspace(): Promise<SenaStartupWorkspace> {
  const workspace = await managedCore.invoke<SenaStartupWorkspace>('sena.getStartupWorkspace', undefined, {
    timeoutMs: SENA_READ_TIMEOUT_MS,
    readPriority: 'critical',
  });
  const currentFingerprint = formatObservationFingerprint(workspace.observationFingerprint);
  if (senaObservationFingerprint !== currentFingerprint) {
    benchmarkCacheEvent('main.cache.sena-read.startup-stale', {
      previousFingerprint: senaObservationFingerprint,
      currentFingerprint,
      entries: senaReadCache.size,
    });
    senaReadCache.clear();
    senaInflightReads.clear();
  } else {
    benchmarkCacheEvent('main.cache.sena-read.startup-fresh', {
      observationFingerprint: currentFingerprint,
    });
  }
  senaObservationFingerprint = currentFingerprint;
  senaReadCacheValidated = true;
  senaReadCache.set('catalog', workspace.catalog);
  senaReadCache.set('workspace-summary', workspace.workspaceSummary);
  if (workspace.latestRun) {
    senaReadCache.set(`run-status:${workspace.latestRun.runId}`, workspace.latestRun);
  }
  await persistSenaReadCache();
  return workspace;
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

  // banji owns zoom state itself so Chromium cannot drift to a different per-origin level and then
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
    // Seed the preferred baseline into Chromium before the first paint so banji never flashes at
    // Electron's default 100% zoom and then snaps back out after load.
    zoomFactor: PREFERRED_BASELINE_ZOOM_FACTOR,
  };
}

function setFocusedWindowToActualSize() {
  // banji's "Actual Size" restores the app's preferred baseline zoom, not Electron's literal 100%.
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
  const endCreate = startBenchmarkSpan({
    category: 'startup',
    name: 'main.window.create',
    detail: { width, height },
  });
  mainWindow = new BrowserWindow({
    x,
    y,
    width,
    height,
    minWidth: 1180,
    minHeight: 760,
    backgroundColor: '#f2e8d8',
    title: 'banji desktop',
    icon: process.platform === 'darwin' ? undefined : iconAssets.dockIconPath,
    show: false,
    focusable: !benchmarkWindowBackgroundMode,
    skipTaskbar: benchmarkWindowBackgroundMode,
    webPreferences: createMainWindowWebPreferences(),
  });
  endCreate({ ok: true });

  installPreferredWindowZoomBehavior(mainWindow);

  const endLoad = startBenchmarkSpan({
    category: 'startup',
    name: 'main.window.renderer.load',
    detail: {
      mode: process.env.ELECTRON_RENDERER_URL ? 'url' : 'file',
    },
  });
  if (process.env.ELECTRON_RENDERER_URL) {
    await mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
  endLoad({ ok: true });
  if (!benchmarkWindowBackgroundMode) {
    mainWindow.showInactive();
  }
  snapshotProcessMemory('main.window.renderer.loaded');
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
}

async function boot() {
  const prewarmManagedCore = async () => {
    const endPrewarm = startBenchmarkSpan({
      category: 'startup',
      name: 'main.boot.core-prewarm',
    });
    try {
      await managedCore.invoke('system.ping', undefined, {
        timeoutMs: SENA_READ_TIMEOUT_MS,
      });
      endPrewarm({ ok: true });
    } catch (error) {
      endPrewarm({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  };

  installRendererContentSecurityPolicy();
  recordBenchmarkEvent({
    layer: 'main',
    category: 'startup',
    name: 'main.boot.install-csp.end',
    phase: 'instant',
  });
  installDesktopAssetProtocol();
  recordBenchmarkEvent({
    layer: 'main',
    category: 'startup',
    name: 'main.boot.install-asset-protocol.end',
    phase: 'instant',
  });
  installApplicationMenu();
  recordBenchmarkEvent({
    layer: 'main',
    category: 'startup',
    name: 'main.boot.menu.end',
    phase: 'instant',
  });
  await loadPersistedSenaReadCache();
  if (!app.isPackaged) {
    const endMigration = startBenchmarkSpan({
      category: 'startup',
      name: 'main.boot.dev-migration',
    });
    const migratedFiles = await migrateLegacyDesktopData(
      desktopDataPath,
      app.getPath('userData'),
    );
    endMigration({
      ok: true,
      migratedFiles: migratedFiles.length,
    });
    if (migratedFiles.length > 0) {
      console.log(
        `[desktop-data] migrated ${migratedFiles.join(', ')} from legacy Electron userData`,
      );
    }
    if (process.env.BANJI_BENCHMARK_DISABLE_DEV_SEED !== '1') {
      const endSeed = startBenchmarkSpan({
        category: 'startup',
        name: 'main.boot.dev-seed',
      });
      try {
        const seeded = await managedCore.invoke<boolean>('sena.seedDevWorkspace', undefined, {
          timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
        });
        if (seeded) {
          await invalidateSenaReadCache();
          console.log('[desktop-data] seeded local dev SENA workspace');
        }
        endSeed({ ok: true, seeded });
      } catch (error) {
        endSeed({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        });
        console.error('[desktop-data] failed to seed local dev SENA workspace', error);
      }
    } else {
      recordBenchmarkEvent({
        layer: 'main',
        category: 'startup',
        name: 'main.boot.dev-seed.skipped',
        phase: 'instant',
      });
      await prewarmManagedCore();
    }
  } else {
    await prewarmManagedCore();
  }
  if (process.platform === 'darwin' && hasMacDockIconPair(projectRoot)) {
    app.dock.setIcon(nativeImage.createFromPath(iconAssets.dockIconPath));
  }
  await createMainWindow();
  snapshotProcessMemory('main.boot.ready');
}

ipcMain.on(IPC_CHANNELS.benchmarkRecordEvent, (_event, event) => {
  recordExternalBenchmarkEvent(event);
});

ipcMain.handle(IPC_CHANNELS.systemGetAppContext, benchmarkIpcHandle(IPC_CHANNELS.systemGetAppContext, async () => {
  recordBenchmarkEvent({
    layer: 'main',
    category: 'startup',
    name: 'ipc.systemGetAppContext.end',
    phase: 'instant',
  });
  return desktopContext;
}));
ipcMain.handle(IPC_CHANNELS.systemGetLocalDataInfo, benchmarkIpcHandle(IPC_CHANNELS.systemGetLocalDataInfo, async () => {
  const info: DesktopLocalDataInfo = {
    dataDirectoryPath: desktopDataPath,
    workspaceStorePath: join(desktopDataPath, SENA_STORE_FILENAME),
    preferencesPath: join(desktopDataPath, PREFERENCES_STORE_FILENAME),
    backupDirectoryPath: desktopBackupDirectoryPath(desktopDataPath),
    assetDirectoryPath: desktopAssetDirectoryPath(),
    storageFormat: 'sqlite',
  };
  return info;
}));
ipcMain.handle(IPC_CHANNELS.systemCreateBackupSnapshot, benchmarkIpcHandle(IPC_CHANNELS.systemCreateBackupSnapshot, async () => {
  await managedCore.stop();
  const snapshot: DesktopBackupSnapshotResult = await createDesktopBackupSnapshot({
    reason: 'settings',
    trigger: 'manual',
    userDataPath: desktopDataPath,
  });
  return snapshot;
}));
ipcMain.handle(IPC_CHANNELS.systemRestoreBackupSnapshot, benchmarkIpcHandle(IPC_CHANNELS.systemRestoreBackupSnapshot, async () => {
  const selection = await dialog.showOpenDialog(mainWindow ?? undefined, {
    buttonLabel: 'Restore snapshot',
    defaultPath: desktopBackupDirectoryPath(desktopDataPath),
    properties: ['openDirectory', 'openFile'],
    title: 'Choose a saved snapshot to restore',
  });
  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }

  const restoreOperation = restoreDesktopBackupSnapshot({
    selectedPath: selection.filePaths[0]!,
    userDataPath: desktopDataPath,
  });
  await managedCore.stop();
  const result: DesktopBackupRestoreResult = await restoreOperation;
  await invalidateSenaReadCache();
  return result;
}));
ipcMain.handle(IPC_CHANNELS.systemClearCurrentData, benchmarkIpcHandle(IPC_CHANNELS.systemClearCurrentData, async () => {
  await managedCore.stop();
  const result: DesktopClearCurrentDataResult = await clearCurrentDesktopData(desktopDataPath);
  await invalidateSenaReadCache();
  return result;
}));
ipcMain.handle(IPC_CHANNELS.systemRevealPath, benchmarkIpcHandle(IPC_CHANNELS.systemRevealPath, async (_event, targetPath: string) => {
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
}));
ipcMain.handle(IPC_CHANNELS.systemPickAndStoreImage, benchmarkIpcHandle(IPC_CHANNELS.systemPickAndStoreImage, async () => {
  const selection = await dialog.showOpenDialog(mainWindow ?? undefined, {
    buttonLabel: 'Use image',
    filters: [
      {
        name: 'Images',
        extensions: [...DESKTOP_IMAGE_IMPORT_EXTENSIONS],
      },
    ],
    properties: ['openFile'],
    title: 'Choose an item picture',
  });
  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }

  const sourcePath = selection.filePaths[0];
  if (!sourcePath) {
    return null;
  }

  const extension = extname(sourcePath).toLowerCase();
  if (!DESKTOP_ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
    throw new Error('Please choose a PNG or JPEG image.');
  }

  const sourceStats = await stat(sourcePath).catch(() => null);
  const endNormalize = startBenchmarkSpan({
    category: 'interaction',
    name: 'main.image.normalize',
    detail: {
      extension,
      sourceBytes: sourceStats?.size ?? null,
    },
  });
  const normalizedImage = normalizeImportedImage(sourcePath);
  endNormalize({
    ok: true,
    outputBytes: normalizedImage.bytes.byteLength,
    outputExtension: normalizedImage.extension,
  });

  const targetDirectory = desktopAssetDirectoryPath();
  await mkdir(targetDirectory, { recursive: true });
  const targetPath = join(targetDirectory, `${randomUUID()}${normalizedImage.extension}`);
  await writeFile(targetPath, normalizedImage.bytes);
  return targetPath;
}));

ipcMain.handle(IPC_CHANNELS.inventoryLoadSnapshot, benchmarkIpcHandle(IPC_CHANNELS.inventoryLoadSnapshot, async () =>
  managedCore.invoke<InventorySnapshot>('inventory.loadSnapshot', undefined, {
    timeoutMs: INVENTORY_READ_TIMEOUT_MS,
  }),
));
ipcMain.handle(IPC_CHANNELS.inventoryListReports, benchmarkIpcHandle(IPC_CHANNELS.inventoryListReports, async () =>
  managedCore.invoke<StockReport[]>('inventory.listReports', undefined, {
    timeoutMs: INVENTORY_READ_TIMEOUT_MS,
  }),
));
ipcMain.handle(IPC_CHANNELS.inventorySubmitReport, benchmarkIpcHandle(IPC_CHANNELS.inventorySubmitReport, async (_event, payload: StockReportSubmission) => {
  await snapshotBeforeWorkspaceMutation('inventory-submit-report');
  return managedCore.invoke<StockReport>('inventory.submitReport', payload);
}));
ipcMain.handle(IPC_CHANNELS.senaGetCatalog, benchmarkIpcHandle(IPC_CHANNELS.senaGetCatalog, async () =>
  loadCachedSenaRead('catalog', () =>
    managedCore.invoke<SenaCatalog | null>('sena.getCatalog', undefined, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
    }),
  ),
));
ipcMain.handle(IPC_CHANNELS.senaGetObservationFingerprint, benchmarkIpcHandle(IPC_CHANNELS.senaGetObservationFingerprint, async () =>
  managedCore.invoke<SenaObservationFingerprint>('sena.getObservationFingerprint', undefined, {
    timeoutMs: SENA_READ_TIMEOUT_MS,
    readPriority: 'critical',
  }),
));
ipcMain.handle(IPC_CHANNELS.senaGetStartupWorkspace, benchmarkIpcHandle(IPC_CHANNELS.senaGetStartupWorkspace, async () =>
  loadStartupWorkspace(),
));
ipcMain.handle(IPC_CHANNELS.senaGetRecordUpdateContext, benchmarkIpcHandle(IPC_CHANNELS.senaGetRecordUpdateContext, async () =>
  loadCachedSenaRead('record-update-context', () =>
    managedCore.invoke<SenaRecordUpdateContext>('sena.getRecordUpdateContext', undefined, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
    }),
  ),
));
ipcMain.handle(IPC_CHANNELS.senaListObservationPage, benchmarkIpcHandle(IPC_CHANNELS.senaListObservationPage, async (_event, payload?: SenaObservationPageRequest) =>
  loadCachedSenaRead(`observation-page:${JSON.stringify(payload ?? {})}`, () =>
    managedCore.invoke<SenaObservationPage>('sena.listObservationPage', payload, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
    }),
  ),
));
ipcMain.handle(IPC_CHANNELS.senaListObservations, benchmarkIpcHandle(IPC_CHANNELS.senaListObservations, async () =>
  loadCachedSenaRead('observations', () =>
    managedCore.invoke<SenaObservationRecord[]>('sena.listObservations', undefined, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
    }),
  ),
));
ipcMain.handle(IPC_CHANNELS.senaListOrderBatches, benchmarkIpcHandle(IPC_CHANNELS.senaListOrderBatches, async (_event, payload?: SenaOrderLookupPayload) =>
  loadCachedSenaRead(`order-batches:${JSON.stringify(payload ?? {})}`, () =>
    managedCore.invoke<SenaOrderBatchRecord[]>('sena.listOrderBatches', payload, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
    }),
  ),
));
ipcMain.handle(IPC_CHANNELS.senaUpsertCatalog, benchmarkIpcHandle(IPC_CHANNELS.senaUpsertCatalog, async (_event, payload: SenaCatalog) => {
  await snapshotBeforeWorkspaceMutation('sena-upsert-catalog');
  const result = await managedCore.invoke<SenaCatalog>('sena.upsertCatalog', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
}));
ipcMain.handle(IPC_CHANNELS.senaIngestObservation, benchmarkIpcHandle(IPC_CHANNELS.senaIngestObservation, async (_event, payload: SenaObservationInput) => {
  await snapshotBeforeWorkspaceMutation('sena-ingest-observation');
  const result = await managedCore.invoke<SenaObservationRecord>('sena.ingestObservation', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
}));
ipcMain.handle(IPC_CHANNELS.senaUpdateObservation, benchmarkIpcHandle(IPC_CHANNELS.senaUpdateObservation, async (_event, payload: SenaObservationUpdatePayload) => {
  await snapshotBeforeWorkspaceMutation('sena-update-observation');
  const result = await managedCore.invoke<SenaObservationRecord>('sena.updateObservation', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
}));
ipcMain.handle(IPC_CHANNELS.senaDeleteObservation, benchmarkIpcHandle(IPC_CHANNELS.senaDeleteObservation, async (_event, payload: SenaObservationDeletePayload) => {
  await snapshotBeforeWorkspaceMutation('sena-delete-observation');
  await managedCore.invoke('sena.deleteObservation', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
}));
ipcMain.handle(IPC_CHANNELS.senaCreateOrderBatch, benchmarkIpcHandle(IPC_CHANNELS.senaCreateOrderBatch, async (_event, payload: SenaCreateOrderBatchPayload) => {
  await snapshotBeforeWorkspaceMutation('sena-create-order-batch');
  const result = await managedCore.invoke<SenaOrderBatchRecord>('sena.createOrderBatch', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
}));
ipcMain.handle(IPC_CHANNELS.senaUpdateOrderBatch, benchmarkIpcHandle(IPC_CHANNELS.senaUpdateOrderBatch, async (_event, payload: SenaUpdateOrderBatchPayload) => {
  await snapshotBeforeWorkspaceMutation('sena-update-order-batch');
  const result = await managedCore.invoke<SenaOrderBatchRecord>('sena.updateOrderBatch', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
}));
ipcMain.handle(IPC_CHANNELS.senaUpdateOrderChild, benchmarkIpcHandle(IPC_CHANNELS.senaUpdateOrderChild, async (_event, payload: SenaUpdateOrderChildPayload) => {
  await snapshotBeforeWorkspaceMutation('sena-update-order-child');
  const result = await managedCore.invoke<SenaOrderBatchRecord>('sena.updateOrderChild', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
}));
ipcMain.handle(IPC_CHANNELS.senaSplitOrderChild, benchmarkIpcHandle(IPC_CHANNELS.senaSplitOrderChild, async (_event, payload: SenaSplitOrderChildPayload) => {
  await snapshotBeforeWorkspaceMutation('sena-split-order-child');
  const result = await managedCore.invoke<SenaOrderBatchRecord>('sena.splitOrderChild', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
}));
ipcMain.handle(IPC_CHANNELS.senaTriggerRun, benchmarkIpcHandle(IPC_CHANNELS.senaTriggerRun, async (_event, payload?: SenaTriggerRunPayload) => {
  await snapshotBeforeWorkspaceMutation('sena-trigger-run');
  const result = await managedCore.invoke<SenaAnalysisRunRecord>('sena.triggerRun', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
}));
ipcMain.handle(IPC_CHANNELS.senaRetryRun, benchmarkIpcHandle(IPC_CHANNELS.senaRetryRun, async (_event, payload: SenaRunLookupPayload) => {
  await snapshotBeforeWorkspaceMutation('sena-retry-run');
  const result = await managedCore.invoke<SenaAnalysisRunRecord>('sena.retryRun', payload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
}));
ipcMain.handle(IPC_CHANNELS.senaGetWorkspaceSummary, benchmarkIpcHandle(IPC_CHANNELS.senaGetWorkspaceSummary, async () =>
  loadCachedSenaRead('workspace-summary', () =>
    managedCore.invoke<SenaWorkspaceSummary | null>('sena.getWorkspaceSummary', undefined, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
    }),
  ),
));
ipcMain.handle(IPC_CHANNELS.senaGetSkuDetail, benchmarkIpcHandle(IPC_CHANNELS.senaGetSkuDetail, async (_event, payload: SenaSkuLookupPayload) =>
  loadCachedSenaRead(`sku-detail:${payload.skuId}:before:${payload.beforeIntervalIndex ?? 'latest'}:limit:${payload.limit ?? 20}`, () =>
    managedCore.invoke<SenaSkuDetailPage | null>('sena.getSkuDetail', {
      skuId: payload.skuId,
      beforeIntervalIndex: payload.beforeIntervalIndex ?? null,
      limit: payload.limit ?? 20,
    }, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
    }),
  ),
));
ipcMain.handle(IPC_CHANNELS.senaGetDiagnostics, benchmarkIpcHandle(IPC_CHANNELS.senaGetDiagnostics, async () =>
  loadCachedSenaRead('diagnostics', () =>
    managedCore.invoke<SenaDiagnostics | null>('sena.getDiagnostics', undefined, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
    }),
  ),
));
ipcMain.handle(
  IPC_CHANNELS.senaGetServiceDetail,
  benchmarkIpcHandle(IPC_CHANNELS.senaGetServiceDetail, async (_event, payload: SenaServiceLookupPayload) =>
    loadCachedSenaRead(`service-detail:${payload.serviceId}:before:${payload.beforeIntervalIndex ?? 'latest'}:limit:${payload.limit ?? 20}`, () =>
      managedCore.invoke<SenaServiceDetailPage | null>('sena.getServiceDetail', {
        serviceId: payload.serviceId,
        beforeIntervalIndex: payload.beforeIntervalIndex ?? null,
        limit: payload.limit ?? 20,
      }, {
        timeoutMs: SENA_READ_TIMEOUT_MS,
      }),
    ),
  ),
);
ipcMain.handle(
  IPC_CHANNELS.senaClearDetailCache,
  benchmarkIpcHandle(IPC_CHANNELS.senaClearDetailCache, async (_event, payload: SenaDetailCacheClearPayload) =>
    invalidateSenaDetailCache(payload),
  ),
);
ipcMain.handle(IPC_CHANNELS.senaGetRunStatus, benchmarkIpcHandle(IPC_CHANNELS.senaGetRunStatus, async (_event, payload: SenaRunLookupPayload) =>
  loadCachedSenaRead(`run-status:${payload.runId}`, () =>
    managedCore.invoke<SenaAnalysisRunRecord | null>('sena.getRunStatus', payload, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
    }),
  ),
));

ipcMain.handle(IPC_CHANNELS.preferencesGet, benchmarkIpcHandle(IPC_CHANNELS.preferencesGet, async () =>
  loadDesktopPreferences(desktopDataPath),
));
ipcMain.handle(
  IPC_CHANNELS.preferencesSave,
  benchmarkIpcHandle(IPC_CHANNELS.preferencesSave, async (_event, payload: Partial<DesktopPreferences>) => {
    await snapshotBeforeWorkspaceMutation('preferences-save');
    return saveDesktopPreferences(desktopDataPath, payload);
  }),
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
