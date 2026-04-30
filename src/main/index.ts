import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, protocol, screen, session, shell } from 'electron';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hasMacDockIconPair, macIconAssets } from '@icons/native';
import { createManagedCoreController } from './core-manager';
import {
  clearCurrentDesktopData,
  createAutomaticDesktopBackupSnapshot,
  createDesktopBackupSnapshot,
  desktopBackupDirectoryPath,
  restoreDesktopBackupSnapshot,
} from './local-backup';
import { loadDesktopPreferences, saveDesktopPreferences } from './preferences';
import { normalizeDesktopImage } from './desktop-image';
import { storeDroppedImageHandler } from './store-dropped-image';
import {
  finalizeAutomationPromotion,
  listAutomationConversations,
  listAutomationExposureRows,
  listAutomationIntakes,
  patchAutomationExposureRow,
  prepareAutomationPromotion,
  readAutomationConnection,
  readAutomationConversation,
  readAutomationIntake,
  testAutomationTelegramConnection,
  readAutomationWorkspace,
  resolveAutomationIntake,
} from './automation-store';
import {
  notifyTelegramCustomerOfTicketUpdate,
  notifyTelegramCustomerOfPromotion,
  runTelegramConnectionTest,
  startTelegramAutomationLoop,
  validateAndSaveTelegramAutomationConnection,
} from './automation-telegram';
import { loadAutomationCatalog, loadAutomationObservations, loadAutomationWorkspaceContext } from './automation-read-context';
import {
  IPC_CHANNELS,
  type AutomationBenchmarkSeedPayload,
  type AutomationBenchmarkSeedResult,
  type AutomationConnectionPatch,
  type AutomationExposurePatch,
  type AutomationListIntakesPayload,
  type AutomationReadConversationPayload,
  type AutomationReadIntakePayload,
  type AutomationResolveIntakePayload,
  type DesktopAppContext,
  type DesktopBackupRestoreResult,
  type DesktopBackupSnapshotResult,
  type DesktopClearCurrentDataResult,
  type DesktopLocalDataInfo,
  type DesktopPreferences,
  type DesktopStoreDroppedImagePayload,
  type PromoteAutomationIntakePayload,
  type SenaDetailCacheClearPayload,
  type SenaRunLookupPayload,
  type SenaServiceLookupPayload,
  type SenaSkuLookupPayload,
  type SenaTriggerRunPayload,
} from '@shared/ipc';
import type {
  AutomationChannelConnection,
  AutomationConversationSummary,
  AutomationExposureRow,
  AutomationOrderIntake,
  AutomationWorkspace,
  PromoteAutomationIntakeResult,
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
  benchmarkEventCount,
  recordBenchmarkEvent,
  recordExternalBenchmarkEvent,
  snapshotProcessMemory,
  startBenchmarkSpan,
  waitForBenchmarkEventCount,
} from './benchmark';
import { registerBenchmarkRunnerIpc } from './benchmark-runner';
import {
  detectDevWorkspaceSeedState,
  prepareGeneratedWorkspace,
  shouldPrepareGeneratedWorkspace,
} from './dev-history-generator';
import {
  prepareInactiveMacDevWindowLaunch,
  shouldPrepareInactiveMacDevWindowLaunch,
  showWindowWithoutStealingFocus,
} from './window-activation';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../..');
const iconAssets = macIconAssets(projectRoot);
const configuredDesktopDataPath = process.env.BANJI_BENCHMARK_DATA_DIR?.trim()
  || process.env.BANJI_DESKTOP_DATA_DIR?.trim();
const benchmarkWindowBackgroundMode = process.env.BANJI_BENCHMARK_BACKGROUND === '1';
const shouldUseInactiveMacDevWindowLaunch = shouldPrepareInactiveMacDevWindowLaunch({
  benchmarkWindowBackgroundMode,
  isPackaged: app.isPackaged,
  platform: process.platform,
  rendererUrl: process.env.ELECTRON_RENDERER_URL,
});

prepareInactiveMacDevWindowLaunch({
  app,
  shouldPrepare: shouldUseInactiveMacDevWindowLaunch,
});

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
const DESKTOP_IMAGE_IMPORT_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp'] as const;
const DESKTOP_ALLOWED_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

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
const SENA_READ_CACHE_PERSIST_DEBOUNCE_MS = 500;
const PREFERRED_BASELINE_ZOOM_LEVEL = 0;
const PREFERRED_BASELINE_ZOOM_FACTOR = 1.2 ** PREFERRED_BASELINE_ZOOM_LEVEL;
const ZOOM_LEVEL_STEP = 0.5;
const MIN_WINDOW_ZOOM_LEVEL = -3;
const MAX_WINDOW_ZOOM_LEVEL = 3;

function restoreSnapshotDialogProperties(): Electron.OpenDialogOptions['properties'] {
  return process.platform === 'darwin' ? ['openFile', 'openDirectory'] : ['openDirectory'];
}
const senaReadCache = new Map<string, unknown>();
const senaInflightReads = new Map<string, Promise<unknown>>();
const windowZoomLevels = new WeakMap<BrowserWindow, number>();
let senaObservationFingerprint: string | null = null;
let senaFreshnessCheck: Promise<void> | null = null;
let senaReadCacheValidated = false;
let senaReadCachePersistTimer: ReturnType<typeof setTimeout> | null = null;
let telegramAutomationLoop: ReturnType<typeof startTelegramAutomationLoop> | null = null;

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
    await createAutomaticDesktopBackupSnapshot({
      reason,
      userDataPath: desktopDataPath,
    });
  } catch (error) {
    console.warn(`[desktop-data] automatic backup snapshot skipped for ${reason}`, error);
  }
}

async function seedAutomationBenchmarkWorkspace(
  payload?: AutomationBenchmarkSeedPayload,
): Promise<AutomationBenchmarkSeedResult> {
  const minimumExposedRows = Math.max(1, payload?.minimumExposedRows ?? 2);
  const minimumIntakes = Math.max(1, payload?.minimumIntakes ?? 2);

  await validateAndSaveTelegramAutomationConnection(desktopDataPath, {
    channel: 'telegram',
    status: 'disconnected',
    botDisplayName: 'banji benchmark bot',
    botToken: 'bench-token:offline',
    botUsername: 'banji_benchmark_bot',
    externalLink: 'https://t.me/banji_benchmark_bot',
  });

  const context = await loadAutomationWorkspaceContext({
    loadCachedSenaRead,
    invoke: managedCore.invoke.bind(managedCore),
    timeoutMs: SENA_READ_TIMEOUT_MS,
  });
  let workspace = await readAutomationWorkspace(desktopDataPath, context);
  const eligibleExposureRows = workspace.exposures.filter((row) =>
    !row.archived && row.availabilityStatus !== 'hidden' && row.price != null);
  if (eligibleExposureRows.length < minimumExposedRows) {
    throw new Error(
      `Benchmark fixture is missing required automations exposure rows (needed ${minimumExposedRows}, found ${eligibleExposureRows.length}).`,
    );
  }

  for (const row of eligibleExposureRows.slice(0, minimumExposedRows)) {
    await patchAutomationExposureRow(desktopDataPath, context, {
      entityType: row.entityType,
      entityId: row.entityId,
      exposed: true,
    });
  }

  const supplierSkuRow = eligibleExposureRows.find((row) => row.entityType === 'sku');
  if (!supplierSkuRow) {
    throw new Error('Benchmark fixture is missing an eligible SKU row for supplier task seeding.');
  }
  const nowIso = new Date().toISOString();
  const expectedArrivalAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  await managedCore.invoke<SenaOrderBatchRecord>('sena.createOrderBatch', {
    supplierName: supplierSkuRow.supplierName ?? null,
    shared: {
      orderedQuantity: 6,
      receivedQuantity: 0,
      placementTimestamp: nowIso,
      expectedArrivalAt,
      costPerUnit: supplierSkuRow.price ?? 1,
    },
    children: [{
      skuId: supplierSkuRow.entityId,
      overrides: {
        orderedQuantity: 6,
        receivedQuantity: 0,
        costPerUnit: supplierSkuRow.price ?? 1,
        placementTimestamp: nowIso,
        expectedArrivalAt,
      },
    }],
  } satisfies SenaCreateOrderBatchPayload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();

  const preferences = await loadDesktopPreferences(desktopDataPath);
  workspace = await readAutomationWorkspace(desktopDataPath, context);
  for (let attempt = 0; attempt < minimumIntakes * 3 && workspace.intakes.length < minimumIntakes; attempt += 1) {
    await testAutomationTelegramConnection(desktopDataPath, {
      ...context,
      currency: preferences.currency,
    });
    workspace = await readAutomationWorkspace(desktopDataPath, context);
  }
  if (workspace.intakes.length < minimumIntakes) {
    throw new Error(
      `Benchmark fixture is missing required automations intake rows (needed ${minimumIntakes}, found ${workspace.intakes.length}).`,
    );
  }

  const hasNeedsReviewIntake = workspace.intakes.some((intake) => intake.status === 'needs_review' || intake.status === 'failed');
  if (!hasNeedsReviewIntake) {
    const candidate = workspace.intakes.find((intake) => intake.status !== 'ticketed' && intake.status !== 'completed') ?? workspace.intakes[0] ?? null;
    if (!candidate) {
      throw new Error('Benchmark fixture does not have an intake available to seed exceptions.');
    }
    await resolveAutomationIntake(desktopDataPath, {
      intakeId: candidate.intakeId,
      status: 'needs_review',
      note: 'Seeded for benchmark exceptions coverage.',
    });
    workspace = await readAutomationWorkspace(desktopDataPath, context);
  }

  const targetSupplierFilterLabel = supplierSkuRow.supplierName?.trim() || 'No supplier';
  return {
    exposedRows: workspace.exposures.filter((row) => row.exposed).length,
    intakeRows: workspace.intakes.length,
    needsReviewRows: workspace.intakes.filter((intake) => intake.status === 'needs_review' || intake.status === 'failed').length,
    targetSupplierFilterLabel,
  };
}

function senaReadCachePath() {
  return join(desktopDataPath, SENA_READ_CACHE_FILENAME);
}

function desktopAssetDirectoryPath() {
  return join(desktopDataPath, DESKTOP_ASSET_DIRECTORY);
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

function installMacDockIcon() {
  if (process.platform === 'darwin' && hasMacDockIconPair(projectRoot)) {
    app.dock.setIcon(nativeImage.createFromPath(iconAssets.dockIconPath));
  }
}

async function installReactDevToolsForDevelopment() {
  if (app.isPackaged || !process.env.ELECTRON_RENDERER_URL) {
    return;
  }

  try {
    const extension = await installExtension(REACT_DEVELOPER_TOOLS, {
      session: session.defaultSession,
    });
    console.log(`[main] Installed ${extension.name}.`);
  } catch (error) {
    console.warn(
      '[main] React Developer Tools could not be installed.',
      error instanceof Error ? error.message : String(error),
    );
  }
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
    showWindowWithoutStealingFocus({
      app,
      targetWindow: mainWindow,
      restoreRegularActivationPolicy: shouldUseInactiveMacDevWindowLaunch,
    });
    installMacDockIcon();
  }
  snapshotProcessMemory('main.window.renderer.loaded');
  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`);
  });
}

async function boot() {
  installMacDockIcon();
  await installReactDevToolsForDevelopment();

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
    if (process.env.BANJI_BENCHMARK_DISABLE_DEV_SEED !== '1') {
      const endSeed = startBenchmarkSpan({
        category: 'startup',
        name: 'main.boot.dev-seed',
      });
      try {
        const seedState = await detectDevWorkspaceSeedState(desktopDataPath);
        const seeded = shouldPrepareGeneratedWorkspace(seedState)
          ? (await prepareGeneratedWorkspace({
            dataDirectory: desktopDataPath,
            size: 'medium',
          }, {
            repoRoot: projectRoot,
          })).seeded
          : false;
        if (seeded) {
          await invalidateSenaReadCache();
          console.log(`[desktop-data] seeded local dev SENA workspace via ${seedState.mode}`);
        }
        endSeed({ ok: true, seeded, mode: seedState.mode });
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
  telegramAutomationLoop = startTelegramAutomationLoop(desktopDataPath, {
    loadContext: () => loadAutomationWorkspaceContext({
      loadCachedSenaRead,
      invoke: managedCore.invoke.bind(managedCore),
      timeoutMs: SENA_READ_TIMEOUT_MS,
    }),
    loadPreferences: async () => {
      const preferences = await loadDesktopPreferences(desktopDataPath);
      return {
        currency: preferences.currency,
        language: preferences.language,
        showAutomationsPage: preferences.showAutomationsPage,
        usdToKhrExchangeRate: preferences.usdToKhrExchangeRate,
      };
    },
  });
  await createMainWindow();
  snapshotProcessMemory('main.boot.ready');
}

ipcMain.on(IPC_CHANNELS.benchmarkRecordEvent, (_event, event) => {
  recordExternalBenchmarkEvent(event);
});
ipcMain.handle(IPC_CHANNELS.benchmarkGetEventCount, benchmarkIpcHandle(IPC_CHANNELS.benchmarkGetEventCount, async (_event, name: string) => {
  if (typeof name !== 'string' || name.trim().length === 0) {
    throw new Error('Benchmark event name is required.');
  }
  return benchmarkEventCount(name.trim());
}));
ipcMain.handle(
  IPC_CHANNELS.benchmarkWaitForEventCount,
  benchmarkIpcHandle(
    IPC_CHANNELS.benchmarkWaitForEventCount,
    async (
      _event,
      payload: {
        name: string;
        minimumCount: number;
        timeoutMs?: number;
      },
    ) => {
      const name = payload?.name?.trim();
      const minimumCount = Number.isFinite(payload?.minimumCount) ? payload.minimumCount : 1;
      if (!name) {
        throw new Error('Benchmark event name is required.');
      }
      if (minimumCount < 1) {
        throw new Error('Benchmark minimumCount must be at least 1.');
      }
      return waitForBenchmarkEventCount({
        name,
        minimumCount,
        timeoutMs: payload?.timeoutMs,
      });
    },
  ),
);

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
    message: 'Choose a snapshot folder. You can also select a file inside a snapshot.',
    properties: restoreSnapshotDialogProperties(),
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
ipcMain.handle(IPC_CHANNELS.systemOpenExternalUrl, benchmarkIpcHandle(IPC_CHANNELS.systemOpenExternalUrl, async (_event, targetUrl: string) => {
  if (typeof targetUrl !== 'string' || targetUrl.trim().length === 0) {
    throw new Error('A URL is required.');
  }

  await shell.openExternal(targetUrl.trim());
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
    throw new Error('Please choose a PNG, JPEG, or WebP image.');
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
  const normalizedImage = normalizeDesktopImage(sourcePath);
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
ipcMain.handle(IPC_CHANNELS.systemStoreDroppedImage, benchmarkIpcHandle(IPC_CHANNELS.systemStoreDroppedImage, async (_event, payload: DesktopStoreDroppedImagePayload) => {
  return storeDroppedImageHandler(payload, desktopAssetDirectoryPath());
}));

ipcMain.handle(IPC_CHANNELS.automationGetWorkspace, benchmarkIpcHandle(IPC_CHANNELS.automationGetWorkspace, async () => {
  const context = await loadAutomationWorkspaceContext({
    loadCachedSenaRead,
    invoke: managedCore.invoke.bind(managedCore),
    timeoutMs: SENA_READ_TIMEOUT_MS,
  });
  return readAutomationWorkspace(desktopDataPath, context);
}));
ipcMain.handle(
  IPC_CHANNELS.automationSeedBenchmarkWorkspace,
  benchmarkIpcHandle(
    IPC_CHANNELS.automationSeedBenchmarkWorkspace,
    async (_event, payload?: AutomationBenchmarkSeedPayload) => seedAutomationBenchmarkWorkspace(payload),
  ),
);
ipcMain.handle(IPC_CHANNELS.automationGetConnection, benchmarkIpcHandle(IPC_CHANNELS.automationGetConnection, async () =>
  readAutomationConnection(desktopDataPath),
));
async function ensureAutomationEnabled() {
  const preferences = await loadDesktopPreferences(desktopDataPath);
  if (!preferences.showAutomationsPage) {
    throw new Error('Automations are disabled in Settings / Interface.');
  }
}

ipcMain.handle(IPC_CHANNELS.automationSaveConnection, benchmarkIpcHandle(IPC_CHANNELS.automationSaveConnection, async (_event, payload: AutomationConnectionPatch) => {
  const connection = await validateAndSaveTelegramAutomationConnection(desktopDataPath, payload);
  const preferences = await loadDesktopPreferences(desktopDataPath);
  if (preferences.showAutomationsPage) {
    telegramAutomationLoop?.triggerSoon();
  }
  return connection;
}));
ipcMain.handle(IPC_CHANNELS.automationListExposureRows, benchmarkIpcHandle(IPC_CHANNELS.automationListExposureRows, async () => {
  const context = await loadAutomationWorkspaceContext({
    loadCachedSenaRead,
    invoke: managedCore.invoke.bind(managedCore),
    timeoutMs: SENA_READ_TIMEOUT_MS,
  });
  return listAutomationExposureRows(desktopDataPath, context);
}));
ipcMain.handle(IPC_CHANNELS.automationPatchExposureRow, benchmarkIpcHandle(IPC_CHANNELS.automationPatchExposureRow, async (_event, payload: AutomationExposurePatch) => {
  await ensureAutomationEnabled();
  const context = await loadAutomationWorkspaceContext({
    loadCachedSenaRead,
    invoke: managedCore.invoke.bind(managedCore),
    timeoutMs: SENA_READ_TIMEOUT_MS,
  });
  return patchAutomationExposureRow(desktopDataPath, context, payload);
}));
ipcMain.handle(IPC_CHANNELS.automationListConversations, benchmarkIpcHandle(IPC_CHANNELS.automationListConversations, async () =>
  listAutomationConversations(desktopDataPath),
));
ipcMain.handle(IPC_CHANNELS.automationReadConversation, benchmarkIpcHandle(IPC_CHANNELS.automationReadConversation, async (_event, payload: AutomationReadConversationPayload) =>
  readAutomationConversation(desktopDataPath, payload.conversationId),
));
ipcMain.handle(IPC_CHANNELS.automationListIntakes, benchmarkIpcHandle(IPC_CHANNELS.automationListIntakes, async (_event, payload?: AutomationListIntakesPayload) =>
  listAutomationIntakes(desktopDataPath, payload),
));
ipcMain.handle(IPC_CHANNELS.automationReadIntake, benchmarkIpcHandle(IPC_CHANNELS.automationReadIntake, async (_event, payload: AutomationReadIntakePayload) =>
  readAutomationIntake(desktopDataPath, payload.intakeId),
));
ipcMain.handle(IPC_CHANNELS.automationResolveIntake, benchmarkIpcHandle(IPC_CHANNELS.automationResolveIntake, async (_event, payload: AutomationResolveIntakePayload) => {
  await ensureAutomationEnabled();
  return resolveAutomationIntake(desktopDataPath, payload);
}));
ipcMain.handle(IPC_CHANNELS.automationPromoteIntake, benchmarkIpcHandle(IPC_CHANNELS.automationPromoteIntake, async (_event, payload: PromoteAutomationIntakePayload) => {
  await ensureAutomationEnabled();
  const observations = await loadAutomationObservations({
    loadCachedSenaRead,
    invoke: managedCore.invoke.bind(managedCore),
    timeoutMs: SENA_READ_TIMEOUT_MS,
  });
  const prepared = await prepareAutomationPromotion(desktopDataPath, payload, { observations });
  await snapshotBeforeWorkspaceMutation('automation-promote-intake');
  await managedCore.invoke<SenaObservationRecord>('sena.ingestObservation', prepared.observationInput, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await finalizeAutomationPromotion(desktopDataPath, prepared.updatedIntake);
  try {
    await notifyTelegramCustomerOfPromotion(desktopDataPath, {
      conversationId: prepared.updatedIntake.conversationId,
      intake: prepared.updatedIntake,
    });
  } catch (error) {
    console.warn('[automation] failed to notify Telegram customer after promotion', error);
  }
  await invalidateSenaReadCache();
  return {
    intake: prepared.updatedIntake,
    ticketEvent: prepared.ticketEvent,
    commercialEvents: prepared.commercialEvents,
  } satisfies PromoteAutomationIntakeResult;
}));
ipcMain.handle(IPC_CHANNELS.automationTestTelegramConnection, benchmarkIpcHandle(IPC_CHANNELS.automationTestTelegramConnection, async () => {
  await ensureAutomationEnabled();
  if (process.env.BANJI_BENCHMARK === '1') {
    const [preferences, context] = await Promise.all([
      loadDesktopPreferences(desktopDataPath),
      loadAutomationWorkspaceContext({
        loadCachedSenaRead,
        invoke: managedCore.invoke.bind(managedCore),
        timeoutMs: SENA_READ_TIMEOUT_MS,
      }),
    ]);
    return testAutomationTelegramConnection(desktopDataPath, {
      ...context,
      currency: preferences.currency,
    });
  }

  const latestConversationChatId = (await listAutomationConversations(desktopDataPath))[0]?.externalConversationKey ?? null;
  const connection = await runTelegramConnectionTest(desktopDataPath, {
    latestConversationChatId,
  });
  telegramAutomationLoop?.triggerSoon();
  return connection;
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
      readPriority: 'critical',
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
      readPriority: 'background',
    }),
  ),
));
ipcMain.handle(IPC_CHANNELS.senaListOrderBatches, benchmarkIpcHandle(IPC_CHANNELS.senaListOrderBatches, async (_event, payload?: SenaOrderLookupPayload) =>
  loadCachedSenaRead(`order-batches:${JSON.stringify(payload ?? {})}`, () =>
    managedCore.invoke<SenaOrderBatchRecord[]>('sena.listOrderBatches', payload, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
      readPriority: 'critical',
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
  const telegramCustomerTicketEvents = (payload?.ticketEvents ?? []).filter((event) =>
    event.ticketFamily === 'customer' && event.party?.channelKey === 'telegram',
  );
  for (const ticketEvent of telegramCustomerTicketEvents) {
    try {
      await notifyTelegramCustomerOfTicketUpdate(desktopDataPath, { ticketEvent });
    } catch (error) {
      console.warn('[automation] failed to notify Telegram customer after ticket update', error);
    }
  }
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
      readPriority: 'critical',
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
      readPriority: 'background',
    }),
  ),
));
ipcMain.handle(
  IPC_CHANNELS.senaGetServiceDetail,
  benchmarkIpcHandle(IPC_CHANNELS.senaGetServiceDetail, async (_event, payload: SenaServiceLookupPayload) => {
    const cacheKey = `service-detail:${payload.serviceId}:before:${payload.beforeIntervalIndex ?? 'latest'}:limit:${payload.limit ?? 20}`;
    return loadCachedSenaRead(cacheKey, async () => {
      const endCoreRoundTrip = startBenchmarkSpan({
        category: 'ipc',
        name: 'main.service-detail.core-round-trip',
        detail: {
          beforeIntervalIndex: payload.beforeIntervalIndex ?? null,
          limit: payload.limit ?? 20,
          serviceId: payload.serviceId,
        },
      });
      try {
        const result = await managedCore.invoke<SenaServiceDetailPage | null>('sena.getServiceDetail', {
          serviceId: payload.serviceId,
          beforeIntervalIndex: payload.beforeIntervalIndex ?? null,
          limit: payload.limit ?? 20,
        }, {
          timeoutMs: SENA_READ_TIMEOUT_MS,
        });
        endCoreRoundTrip({
          ok: true,
          result: summarizeBenchmarkPayload(result),
        });
        return result;
      } catch (error) {
        endCoreRoundTrip({
          error: error instanceof Error ? error.message : String(error),
          ok: false,
        });
        throw error;
      }
    });
  }),
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
    const previousPreferences = await loadDesktopPreferences(desktopDataPath);
    await snapshotBeforeWorkspaceMutation('preferences-save');
    const nextPreferences = await saveDesktopPreferences(desktopDataPath, payload);
    if (previousPreferences.showAutomationsPage !== nextPreferences.showAutomationsPage) {
      telegramAutomationLoop?.setEnabled(nextPreferences.showAutomationsPage);
    }
    return nextPreferences;
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
    telegramAutomationLoop?.stop();
    await managedCore.stop();
    app.quit();
  }
});

app.on('before-quit', async () => {
  telegramAutomationLoop?.stop();
  await managedCore.stop();
});
