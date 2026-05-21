import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, net, protocol, screen, session, shell } from 'electron';
import installExtension, { REACT_DEVELOPER_TOOLS } from 'electron-devtools-installer';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { hasMacDockIconPair, macIconAssets } from '@icons/native';
import { createManagedCoreController } from './runtime/core-manager';
import {
  cleanupCloseSafetyDesktopBackupSnapshots,
  clearCurrentDesktopData,
  createAutomaticDesktopBackupSnapshot,
  createCloseSafetyDesktopBackupSnapshot,
  createDesktopBackupSnapshot,
  desktopBackupDirectoryPath,
  readLatestDesktopBackupSnapshotCreatedAt,
  restoreDesktopBackupSnapshot,
} from './local-data/local-backup';
import { loadDesktopPreferences, saveDesktopPreferences } from './local-data/preferences';
import { normalizeDesktopImage } from './desktop/desktop-image';
import { assertDesktopImageFileIsSafeForImport } from './desktop/desktop-image-import';
import { resolveDesktopAssetPathFromRequest } from './desktop/desktop-asset-protocol';
import { normalizeAllowedExternalUrl } from './security/external-url';
import { normalizeAllowedLocalDataPath } from './local-data/local-path-access';
import { installMainWindowNavigationGuards } from './window/navigation-guards';
import { storeDroppedImageHandler } from './desktop/store-dropped-image';
import { checkForKaurKhorUpdate, launchKaurKhorSourceUpdate } from './update/desktop-update';
import {
  normalizeSenaDetailCacheClearPayload,
  normalizeSenaCatalogPayload,
  normalizeSenaCreateOrderBatchPayload,
  normalizeSenaObservationInputPayload,
  normalizeSenaObservationDeletePayload,
  normalizeSenaObservationPageRequest,
  normalizeSenaOrderLookupPayload,
  normalizeSenaObservationUpdatePayload,
  normalizeSenaRunLookupPayload,
  normalizeSenaServiceLookupPayload,
  normalizeSenaSplitOrderChildPayload,
  normalizeSenaSkuLookupPayload,
  normalizeSenaTriggerRunPayload,
  normalizeSenaUpdateOrderBatchPayload,
  normalizeSenaUpdateOrderChildPayload,
} from './runtime/sena-ipc-payloads';
import {
  finalizeAutomationPromotion,
  listAutomationConversations,
  listAutomationExposureRows,
  listAutomationIntakes,
  patchAutomationExposureRow,
  prepareAutomationPromotion,
  readAutomationTransportState,
  readAutomationConnection,
  readAutomationConversation,
  readAutomationIntake,
  readAutomationIntakeThread,
  testAutomationTelegramConnection,
  readAutomationWorkspace,
  resolveAutomationIntake,
  ticketEventsRequiringTelegramNotification,
} from './automation/automation-store';
import {
  notifyTelegramCustomerOfPromotion,
  notifyTelegramCustomerOfTicketUpdate,
  runTelegramConnectionTest,
  sendTelegramCustomerMessageForIntake,
  startTelegramAutomationLoop,
  validateAndSaveTelegramAutomationConnection,
} from './automation/automation-telegram';
import { loadAutomationCatalog, loadAutomationWorkspaceContext } from './automation/automation-read-context';
import {
  IPC_CHANNELS,
  type AutomationBenchmarkSeedPayload,
  type AutomationBenchmarkSeedResult,
  type AutomationConnectionPatch,
  type AutomationExposurePatch,
  type AutomationListIntakesPayload,
  type AutomationReadConversationPayload,
  type AutomationReadIntakePayload,
  type AutomationReadIntakeThreadPayload,
  type AutomationSendIntakeThreadMessagePayload,
  type AutomationResolveIntakePayload,
  type DesktopAppContext,
  type DesktopBackupRestoreResult,
  type DesktopBackupSnapshotResult,
  type DesktopClearCurrentDataResult,
  type DesktopLocalDataInfo,
  type DesktopPreferences,
  type DesktopStoreDroppedImagePayload,
  type DesktopUpdateRunPayload,
  type DesktopUpdateRunResult,
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
  PromoteAutomationIntakePayload,
  PromoteAutomationIntakeResult,
} from '@shared/automation';
import { isAutomationEligibleExposureRow } from '@shared/automation-sellables';
import type {
  SenaAnalysisArtifactRecord,
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
  SenaTicketEvent,
  SenaStartupWorkspace,
  SenaUpdateOrderBatchPayload,
  SenaUpdateOrderChildPayload,
  SenaWorkspaceSummary,
} from '@shared/sena';
import { summarizeBenchmarkPayload, type KaurKhorBenchmarkCategory } from '@shared/benchmark';
import {
  benchmarkEventCount,
  recordBenchmarkEvent,
  recordExternalBenchmarkEvent,
  snapshotProcessMemory,
  startBenchmarkSpan,
  waitForBenchmarkEventCount,
} from './benchmark/benchmark';
import { registerBenchmarkRunnerIpc } from './benchmark/benchmark-runner';
import {
  detectDevWorkspaceSeedState,
  markDevWorkspaceBlank,
  prepareGeneratedWorkspace,
  shouldPrepareGeneratedWorkspace,
  shouldSeedGeneratedDevWorkspace,
} from './runtime/dev-history-generator';
import {
  prepareInactiveMacDevWindowLaunch,
  shouldPrepareInactiveMacDevWindowLaunch,
  showWindowWithoutStealingFocus,
} from './window/window-activation';
import {
  changeManualWindowZoomLevel,
  createManagedWindowZoomState,
  initialWindowZoomFactor,
  installLandscapeWindowResizeRestriction,
  installWindowResizeZoomListeners,
  managedWindowZoomLevel,
  resetManualWindowZoomLevel,
  updateAutomaticWindowZoomLevel,
  type ManagedWindowZoomState,
} from './window/window-zoom';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '../..');
const iconAssets = macIconAssets(projectRoot);
const configuredDesktopDataPath = process.env.KAUR_KHOR_BENCHMARK_DATA_DIR?.trim()
  || process.env.KAUR_KHOR_DESKTOP_DATA_DIR?.trim();

if (process.platform === 'linux') {
  app.disableHardwareAcceleration();
}
const benchmarkWindowBackgroundMode = process.env.KAUR_KHOR_BENCHMARK_BACKGROUND === '1';
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
  : configuredDesktopDataPath || join(projectRoot, '.kaur-khor-dev-data');

if (!app.isPackaged && configuredDesktopDataPath) {
  app.setPath('userData', configuredDesktopDataPath);
}

const SENA_STORE_FILENAME = 'desktop-sena-store.sqlite3';
const PREFERENCES_STORE_FILENAME = 'desktop-preferences.json';
const SENA_READ_CACHE_FILENAME = 'desktop-sena-read-cache.json';
const SENA_READ_CACHE_SCHEMA_VERSION = 1;
const SENA_READ_CACHE_MAX_PERSISTED_ENTRY_BYTES = 512_000;
const DESKTOP_ASSET_DIRECTORY = 'assets';
const DESKTOP_ASSET_PROTOCOL = 'kaur-khor-asset';
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

if (!app.isPackaged) {
  registerBenchmarkRunnerIpc({
    appIsPackaged: app.isPackaged,
    projectRoot,
  });
}

const LONG_RUNNING_CORE_TIMEOUT_MS = 180_000;
const SENA_READ_TIMEOUT_MS = 60_000;
const SENA_READ_CACHE_PERSIST_DEBOUNCE_MS = 500;
const DESKTOP_CLOSE_AUTOMATION_WARNING_TITLE = 'Close Kaur Khor and stop automations?';
const DESKTOP_CLOSE_AUTOMATION_WARNING_MESSAGE = 'Your Telegram bot is connected and live listening. Closing Kaur Khor stops Telegram listening, automation intake, and automatic checks until you open Kaur Khor again.';
const DESKTOP_CLOSE_AUTOMATION_CANCEL_BUTTON = 'Keep Kaur Khor open';
const DESKTOP_CLOSE_AUTOMATION_CONFIRM_BUTTON = 'Close Kaur Khor';
function restoreSnapshotDialogProperties(): Electron.OpenDialogOptions['properties'] {
  return process.platform === 'darwin' ? ['openFile', 'openDirectory'] : ['openDirectory'];
}
const senaReadCache = new Map<string, unknown>();
const senaInflightReads = new Map<string, Promise<unknown>>();
const windowZoomStates = new WeakMap<BrowserWindow, ManagedWindowZoomState>();
let senaObservationFingerprint: string | null = null;
let senaFreshnessCheck: Promise<void> | null = null;
let senaReadCacheValidated = false;
let senaReadCachePersistTimer: ReturnType<typeof setTimeout> | null = null;
let telegramAutomationLoop: ReturnType<typeof startTelegramAutomationLoop> | null = null;
let desktopQuitConfirmed = false;
let desktopQuitConfirmationInFlight: Promise<boolean> | null = null;
let desktopShutdownPromise: Promise<void> | null = null;
let desktopShutdownStarted = false;
let desktopShutdownCompleted = false;
let desktopDataReplacementQueue: Promise<void> = Promise.resolve();
let pendingDesktopDataReplacements = 0;
let desktopDataReplacementSuspension: Promise<void> | null = null;
let selectedUpdateBackupDirectoryPath: string | null = null;
let selectedUpdateDataDirectoryPath: string | null = null;

function dialogParentWindow() {
  return mainWindow ?? BrowserWindow.getFocusedWindow() ?? null;
}

async function showKaurKhorMessageBox(options: Electron.MessageBoxOptions) {
  const parentWindow = dialogParentWindow();
  return parentWindow
    ? dialog.showMessageBox(parentWindow, options)
    : dialog.showMessageBox(options);
}

async function showKaurKhorOpenDialog(options: Electron.OpenDialogOptions) {
  const parentWindow = dialogParentWindow();
  return parentWindow
    ? dialog.showOpenDialog(parentWindow, options)
    : dialog.showOpenDialog(options);
}

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
  category: KaurKhorBenchmarkCategory = 'ipc',
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

function shouldBypassDesktopCloseAutomationWarning() {
  return process.env.KAUR_KHOR_BENCHMARK === '1';
}

async function isDesktopTelegramAutomationLiveListening() {
  const preferences = await loadDesktopPreferences(desktopDataPath);
  if (!preferences.showAutomationsPage) {
    return false;
  }
  const transport = await readAutomationTransportState(desktopDataPath);
  return transport.connection.status === 'connected'
    && transport.connection.hasBotToken
    && Boolean(transport.botToken?.trim());
}

async function createCloseSafetySnapshotBeforeQuit() {
  try {
    await createCloseSafetyDesktopBackupSnapshot(desktopDataPath);
  } catch (error) {
    console.warn('[desktop-data] close-safety backup snapshot skipped for before-close-automation', error);
  }
}

async function confirmDesktopQuitForLiveAutomation() {
  if (desktopQuitConfirmed || shouldBypassDesktopCloseAutomationWarning()) {
    return true;
  }
  if (desktopQuitConfirmationInFlight) {
    return desktopQuitConfirmationInFlight;
  }

  desktopQuitConfirmationInFlight = (async () => {
    let isLiveListening = false;
    try {
      isLiveListening = await isDesktopTelegramAutomationLiveListening();
    } catch (error) {
      console.warn('[automation] close live-listening check skipped', error);
    }
    if (!isLiveListening) {
      return true;
    }
    await createCloseSafetySnapshotBeforeQuit();
    const result = await showKaurKhorMessageBox({
      type: 'warning',
      title: DESKTOP_CLOSE_AUTOMATION_WARNING_TITLE,
      message: DESKTOP_CLOSE_AUTOMATION_WARNING_MESSAGE,
      buttons: [
        DESKTOP_CLOSE_AUTOMATION_CANCEL_BUTTON,
        DESKTOP_CLOSE_AUTOMATION_CONFIRM_BUTTON,
      ],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (result.response === 1) {
      desktopQuitConfirmed = true;
      return true;
    }
    return false;
  })().finally(() => {
    desktopQuitConfirmationInFlight = null;
  });

  return desktopQuitConfirmationInFlight;
}

function stopDesktopRuntimeForShutdown() {
  desktopShutdownStarted = true;
  desktopShutdownPromise ??= (async () => {
    await telegramAutomationLoop?.stopAndDrain();
    await desktopDataReplacementQueue.catch(() => undefined);
    await managedCore.stop();
  })().finally(() => {
    desktopShutdownCompleted = true;
  });
  return desktopShutdownPromise;
}

async function suspendDesktopRuntimeForDataReplacement() {
  await telegramAutomationLoop?.stopAndDrain();
  telegramAutomationLoop = null;
  if (senaReadCachePersistTimer) {
    clearTimeout(senaReadCachePersistTimer);
    senaReadCachePersistTimer = null;
  }
  senaInflightReads.clear();
  senaFreshnessCheck = null;
  await managedCore.stop();
}

async function runDesktopDataReplacement<T>(task: () => Promise<T>): Promise<T> {
  pendingDesktopDataReplacements += 1;
  if (!desktopDataReplacementSuspension) {
    desktopDataReplacementSuspension = suspendDesktopRuntimeForDataReplacement();
  }

  const run = desktopDataReplacementQueue
    .catch(() => undefined)
    .then(async () => {
      await desktopDataReplacementSuspension;
      return task();
    })
    .finally(() => {
      pendingDesktopDataReplacements = Math.max(0, pendingDesktopDataReplacements - 1);
      if (pendingDesktopDataReplacements === 0) {
        desktopDataReplacementSuspension = null;
        if (!desktopShutdownStarted) {
          startDesktopTelegramAutomationLoop();
        }
      }
    });

  desktopDataReplacementQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function startDesktopTelegramAutomationLoop() {
  void telegramAutomationLoop?.stop();
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
}

async function notifyTelegramCustomersForTicketEvents(ticketEvents: SenaTicketEvent[] | undefined) {
  for (const ticketEvent of ticketEventsRequiringTelegramNotification(ticketEvents)) {
    try {
      await notifyTelegramCustomerOfTicketUpdate(desktopDataPath, { ticketEvent });
    } catch (error) {
      console.warn('[automation] failed to notify Telegram customer after ticket update', error);
    }
  }
}

async function listFreshSenaObservations() {
  return managedCore.invoke<SenaObservationRecord[]>('sena.listObservations', undefined, {
    timeoutMs: SENA_READ_TIMEOUT_MS,
    readPriority: 'critical',
  });
}

function requestDesktopQuit() {
  void confirmDesktopQuitForLiveAutomation().then((shouldQuit) => {
    if (!shouldQuit) {
      return;
    }
    desktopQuitConfirmed = true;
    void stopDesktopRuntimeForShutdown().finally(() => {
      app.quit();
    });
  });
}

function isSameResolvedPath(left: string, right: string) {
  return resolve(left) === resolve(right);
}

function resolveUpdateDataDirectoryPath(candidatePath: string | null | undefined) {
  const trimmedPath = candidatePath?.trim();
  if (!trimmedPath || isSameResolvedPath(trimmedPath, desktopDataPath)) {
    return desktopDataPath;
  }
  if (selectedUpdateDataDirectoryPath && isSameResolvedPath(trimmedPath, selectedUpdateDataDirectoryPath)) {
    return selectedUpdateDataDirectoryPath;
  }
  throw new Error('Choose the update data folder from Kaur Khor before starting the updater.');
}

function resolveUpdateBackupDirectoryPath(candidatePath: string | null | undefined, skipBackup: boolean) {
  const trimmedPath = candidatePath?.trim();
  if (skipBackup) {
    return null;
  }
  if (trimmedPath && selectedUpdateBackupDirectoryPath && isSameResolvedPath(trimmedPath, selectedUpdateBackupDirectoryPath)) {
    return selectedUpdateBackupDirectoryPath;
  }
  throw new Error('Choose the update snapshot export folder from Kaur Khor before starting the updater.');
}

async function seedAutomationBenchmarkWorkspace(
  payload?: AutomationBenchmarkSeedPayload,
): Promise<AutomationBenchmarkSeedResult> {
  const minimumExposedRows = Math.max(1, payload?.minimumExposedRows ?? 2);
  const minimumIntakes = Math.max(1, payload?.minimumIntakes ?? 2);

  await validateAndSaveTelegramAutomationConnection(desktopDataPath, {
    channel: 'telegram',
    status: 'disconnected',
    botDisplayName: 'kaur khor benchmark bot',
    botToken: 'bench-token:offline',
    botUsername: 'kaur_khor_benchmark_bot',
    externalLink: 'https://t.me/kaur_khor_benchmark_bot',
  });

  const context = await loadAutomationWorkspaceContext({
    loadCachedSenaRead,
    invoke: managedCore.invoke.bind(managedCore),
    timeoutMs: SENA_READ_TIMEOUT_MS,
  });
  let workspace = await readAutomationWorkspace(desktopDataPath, context);
  const eligibleExposureRows = workspace.exposures.filter(isAutomationEligibleExposureRow);
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

function readRequiredStringPayloadField(payload: unknown, field: string, message: string) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error(message);
  }
  const value = (payload as Record<string, unknown>)[field];
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(message);
  }
  return value.trim();
}

function installDesktopAssetProtocol() {
  protocol.handle(DESKTOP_ASSET_PROTOCOL, async (request) => {
    const assetPath = await resolveDesktopAssetPathFromRequest(request.url, desktopAssetDirectoryPath());
    if (!assetPath) {
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
  return JSON.stringify(fingerprint);
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
    "img-src 'self' data: blob: file: kaur-khor-asset:",
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

function getManagedWindowZoomState(window: BrowserWindow | null | undefined) {
  if (!window) {
    return null;
  }
  const existing = windowZoomStates.get(window);
  if (existing) {
    return existing;
  }
  const state = createManagedWindowZoomState(window.getContentBounds());
  windowZoomStates.set(window, state);
  return state;
}

function updateManagedWindowAutomaticZoomLevel(window: BrowserWindow | null | undefined) {
  const state = getManagedWindowZoomState(window);
  if (!window || !state) {
    return null;
  }
  return updateAutomaticWindowZoomLevel(state, window.getContentBounds());
}

function applyManagedWindowZoomLevel(window: BrowserWindow | null | undefined, { force = false }: { force?: boolean } = {}) {
  const state = updateManagedWindowAutomaticZoomLevel(window);
  if (!window || !state) {
    return;
  }
  const zoomLevel = managedWindowZoomLevel(state);
  if (!force && state.appliedLevel === zoomLevel) {
    return;
  }
  state.appliedLevel = zoomLevel;
  window.webContents.setZoomLevel(zoomLevel);
}

function changeFocusedWindowZoom(stepDelta: number) {
  const window = BrowserWindow.getFocusedWindow();
  const state = getManagedWindowZoomState(window);
  if (!window || !state) {
    return;
  }
  changeManualWindowZoomLevel(state, stepDelta);
  applyManagedWindowZoomLevel(window);
}

function applyPreferredWindowZoomLevel(window: BrowserWindow | null | undefined) {
  const state = getManagedWindowZoomState(window);
  if (!window || !state) {
    return;
  }
  resetManualWindowZoomLevel(state);
  applyManagedWindowZoomLevel(window);
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

  // Kaur Khor owns zoom state itself so Chromium cannot drift to a different per-origin level and then
  // snap back later. Reapply the managed zoom across every lifecycle edge that can recreate or
  // reattach the renderer.
  windowZoomStates.set(window, createManagedWindowZoomState(window.getContentBounds()));
  installOptionalWindowZoomLimits(window);
  installWindowResizeZoomListeners(window, () => {
    applyManagedWindowZoomLevel(window);
  });
  applyManagedWindowZoomLevel(window);
  webContents.on('did-start-loading', () => {
    applyManagedWindowZoomLevel(window, { force: true });
  });
  webContents.on('did-navigate', () => {
    applyManagedWindowZoomLevel(window, { force: true });
  });
  webContents.on('did-navigate-in-page', () => {
    applyManagedWindowZoomLevel(window, { force: true });
  });
  webContents.on('dom-ready', () => {
    applyManagedWindowZoomLevel(window, { force: true });
  });
  webContents.on('did-finish-load', () => {
    applyManagedWindowZoomLevel(window, { force: true });
  });
  window.on('focus', () => {
    applyManagedWindowZoomLevel(window);
  });
}

function createMainWindowWebPreferences(
  contentBounds: Pick<Electron.Rectangle, 'height' | 'width'>,
): Electron.BrowserWindowConstructorOptions['webPreferences'] {
  return {
    preload: join(__dirname, '../preload/index.mjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: false,
    // Seed the preferred baseline into Chromium before the first paint so Kaur Khor never flashes at
    // Electron's default 100% zoom and then snaps back out after load.
    zoomFactor: initialWindowZoomFactor(contentBounds),
  };
}

function installMacDockIcon() {
  if (process.platform === 'darwin' && app.dock && hasMacDockIconPair(projectRoot)) {
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
  // Kaur Khor's "Actual Size" resets the manual zoom offset while preserving automatic viewport zoom.
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
  const appMenu: Electron.MenuItemConstructorOptions[] = process.platform === 'darwin'
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
            {
              label: 'Quit Kaur Khor',
              accelerator: 'CmdOrCtrl+Q',
              click: requestDesktopQuit,
            },
          ],
        },
      ]
    : [];
  const fileSubmenu: Electron.MenuItemConstructorOptions[] = process.platform === 'darwin'
    ? [{ role: 'close' }]
    : [{
        label: 'Quit Kaur Khor',
        accelerator: 'CmdOrCtrl+Q',
        click: requestDesktopQuit,
      }];
  const editPlatformSubmenu: Electron.MenuItemConstructorOptions[] = process.platform === 'darwin'
    ? [
        { role: 'pasteAndMatchStyle' },
        { role: 'delete' },
        { role: 'selectAll' },
      ]
    : [
        { role: 'delete' },
        { type: 'separator' },
        { role: 'selectAll' },
      ];
  const windowSubmenu: Electron.MenuItemConstructorOptions[] = process.platform === 'darwin'
    ? [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
        { type: 'separator' },
        { role: 'window' },
      ]
    : [{ role: 'minimize' }, { role: 'close' }];
  const template: Electron.MenuItemConstructorOptions[] = [
    ...appMenu,
    {
      label: 'File',
      submenu: fileSubmenu,
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
        ...editPlatformSubmenu,
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
      submenu: windowSubmenu,
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
            void shell.openExternal('https://github.com/Svanny/kaur-khor/issues');
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
    minWidth: 760,
    minHeight: 760,
    backgroundColor: '#f2e8d8',
    title: 'kaur khor desktop',
    icon: process.platform === 'darwin' ? undefined : iconAssets.dockIconPath,
    show: false,
    focusable: !benchmarkWindowBackgroundMode,
    skipTaskbar: benchmarkWindowBackgroundMode,
    webPreferences: createMainWindowWebPreferences({ height, width }),
  });
  endCreate({ ok: true });

  installMainWindowNavigationGuards(mainWindow);
  installLandscapeWindowResizeRestriction(mainWindow);
  installPreferredWindowZoomBehavior(mainWindow);
  mainWindow.on('close', (event) => {
    if (desktopQuitConfirmed || shouldBypassDesktopCloseAutomationWarning()) {
      return;
    }
    event.preventDefault();
    void confirmDesktopQuitForLiveAutomation().then((shouldQuit) => {
      if (!shouldQuit) {
        return;
      }
      desktopQuitConfirmed = true;
      app.quit();
    });
  });

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
    if (shouldSeedGeneratedDevWorkspace()) {
      const endSeed = startBenchmarkSpan({
        category: 'startup',
        name: 'main.boot.dev-seed',
      });
      try {
        const seedState = await detectDevWorkspaceSeedState(desktopDataPath);
        const seeded = shouldPrepareGeneratedWorkspace(seedState, { allowBlankWorkspaceSeed: true })
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
  startDesktopTelegramAutomationLoop();
  await createMainWindow();
  try {
    await cleanupCloseSafetyDesktopBackupSnapshots(desktopDataPath);
  } catch (error) {
    console.warn('[desktop-data] close-safety backup snapshot cleanup skipped', error);
  }
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
    latestBackupSnapshotCreatedAt: await readLatestDesktopBackupSnapshotCreatedAt(desktopDataPath),
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
  const selection = await showKaurKhorOpenDialog({
    buttonLabel: 'Restore snapshot',
    defaultPath: desktopBackupDirectoryPath(desktopDataPath),
    message: 'Choose a snapshot folder. You can also select a file inside a snapshot.',
    properties: restoreSnapshotDialogProperties(),
    title: 'Choose a saved snapshot to restore',
  });
  if (selection.canceled || selection.filePaths.length === 0) {
    return null;
  }

  return runDesktopDataReplacement(async () => {
    const result: DesktopBackupRestoreResult = await restoreDesktopBackupSnapshot({
      selectedPath: selection.filePaths[0]!,
      userDataPath: desktopDataPath,
    });
    await invalidateSenaReadCache();
    return result;
  });
}));
ipcMain.handle(IPC_CHANNELS.systemClearCurrentData, benchmarkIpcHandle(IPC_CHANNELS.systemClearCurrentData, async () => {
  return runDesktopDataReplacement(async () => {
    const result: DesktopClearCurrentDataResult = await clearCurrentDesktopData(desktopDataPath);
    if (!app.isPackaged) {
      await markDevWorkspaceBlank(desktopDataPath);
    }
    await invalidateSenaReadCache();
    return result;
  });
}));
ipcMain.handle(IPC_CHANNELS.systemCheckForUpdate, benchmarkIpcHandle(IPC_CHANNELS.systemCheckForUpdate, async () =>
  checkForKaurKhorUpdate({
    appVersion: app.getVersion(),
    platform: process.platform,
  }),
));
ipcMain.handle(IPC_CHANNELS.systemChooseUpdateBackupDirectory, benchmarkIpcHandle(IPC_CHANNELS.systemChooseUpdateBackupDirectory, async () => {
  const selection = await showKaurKhorOpenDialog({
    buttonLabel: 'Use this folder',
    message: 'Choose where Kaur Khor should export a pre-update snapshot.',
    properties: ['openDirectory', 'createDirectory'],
    title: 'Choose update snapshot export folder',
  });
  selectedUpdateBackupDirectoryPath = selection.canceled ? null : selection.filePaths[0] ?? null;
  return selectedUpdateBackupDirectoryPath;
}));
ipcMain.handle(IPC_CHANNELS.systemChooseUpdateDataDirectory, benchmarkIpcHandle(IPC_CHANNELS.systemChooseUpdateDataDirectory, async () => {
  const selection = await showKaurKhorOpenDialog({
    buttonLabel: 'Use this data folder',
    defaultPath: desktopDataPath,
    message: 'Choose the Kaur Khor data folder to export before updating.',
    properties: ['openDirectory'],
    title: 'Choose Kaur Khor data folder',
  });
  selectedUpdateDataDirectoryPath = selection.canceled ? null : selection.filePaths[0] ?? null;
  return selectedUpdateDataDirectoryPath;
}));
ipcMain.handle(IPC_CHANNELS.systemRunSourceBuildUpdate, benchmarkIpcHandle(IPC_CHANNELS.systemRunSourceBuildUpdate, async (_event, payload?: DesktopUpdateRunPayload): Promise<DesktopUpdateRunResult> => {
  const dataDirectoryPath = resolveUpdateDataDirectoryPath(payload?.dataDirectoryPath);
  const backupDirectoryPath = resolveUpdateBackupDirectoryPath(payload?.backupDirectoryPath, payload?.skipBackup === true);
  const shouldQuit = await confirmDesktopQuitForLiveAutomation();
  if (!shouldQuit) {
    return {
      started: false,
      message: 'Update canceled because Kaur Khor stayed open.',
    };
  }
  desktopQuitConfirmed = true;
  await stopDesktopRuntimeForShutdown();
  return launchKaurKhorSourceUpdate({
    app,
    appVersion: app.getVersion(),
    dataDirectoryPath,
    payload: {
      ...payload,
      backupDirectoryPath,
      dataDirectoryPath,
    },
  });
}));
ipcMain.handle(IPC_CHANNELS.systemRevealPath, benchmarkIpcHandle(IPC_CHANNELS.systemRevealPath, async (_event, targetPath: string) => {
  const normalizedPath = normalizeAllowedLocalDataPath(targetPath, [desktopDataPath]);
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
  await shell.openExternal(normalizeAllowedExternalUrl(targetUrl));
}));
ipcMain.handle(IPC_CHANNELS.systemPickAndStoreImage, benchmarkIpcHandle(IPC_CHANNELS.systemPickAndStoreImage, async () => {
  const selection = await showKaurKhorOpenDialog({
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
  await assertDesktopImageFileIsSafeForImport(sourcePath);

  const sourceStats = await stat(sourcePath).catch(() => null);
  const endNormalize = startBenchmarkSpan({
    category: 'interaction',
    name: 'main.image.normalize',
    detail: {
      extension,
      sourceBytes: sourceStats?.size ?? null,
    },
  });
  let normalizedImage: Awaited<ReturnType<typeof normalizeDesktopImage>>;
  try {
    normalizedImage = await normalizeDesktopImage(sourcePath);
    endNormalize({
      ok: true,
      outputBytes: normalizedImage.bytes.byteLength,
      outputExtension: normalizedImage.extension,
    });
  } catch (error) {
    endNormalize({
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

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
  readAutomationConversation(
    desktopDataPath,
    readRequiredStringPayloadField(payload, 'conversationId', 'Automation conversation reads require a conversation id.'),
  ),
));
ipcMain.handle(IPC_CHANNELS.automationReadIntakeThread, benchmarkIpcHandle(IPC_CHANNELS.automationReadIntakeThread, async (_event, payload: AutomationReadIntakeThreadPayload) =>
  readAutomationIntakeThread(
    desktopDataPath,
    readRequiredStringPayloadField(payload, 'intakeId', 'Automation intake reads require an intake id.'),
  ),
));
ipcMain.handle(IPC_CHANNELS.automationSendIntakeThreadMessage, benchmarkIpcHandle(IPC_CHANNELS.automationSendIntakeThreadMessage, async (_event, payload: AutomationSendIntakeThreadMessagePayload) => {
  await ensureAutomationEnabled();
  const text = readRequiredStringPayloadField(payload, 'text', 'Enter a message before sending.');
  const intake = await readAutomationIntake(
    desktopDataPath,
    readRequiredStringPayloadField(payload, 'intakeId', 'Automation intake reads require an intake id.'),
  );
  if (!intake) {
    throw new Error('Automation intake not found.');
  }
  const sent = await sendTelegramCustomerMessageForIntake(desktopDataPath, {
    conversationId: intake.conversationId,
    intakeId: intake.intakeId,
    text,
  });
  if (!sent) {
    throw new Error('Connect a Telegram bot before sending customer messages.');
  }
  return readAutomationIntakeThread(desktopDataPath, intake.intakeId);
}));
ipcMain.handle(IPC_CHANNELS.automationListIntakes, benchmarkIpcHandle(IPC_CHANNELS.automationListIntakes, async (_event, payload?: AutomationListIntakesPayload) =>
  listAutomationIntakes(desktopDataPath, payload),
));
ipcMain.handle(IPC_CHANNELS.automationReadIntake, benchmarkIpcHandle(IPC_CHANNELS.automationReadIntake, async (_event, payload: AutomationReadIntakePayload) =>
  readAutomationIntake(
    desktopDataPath,
    readRequiredStringPayloadField(payload, 'intakeId', 'Automation intake reads require an intake id.'),
  ),
));
ipcMain.handle(IPC_CHANNELS.automationResolveIntake, benchmarkIpcHandle(IPC_CHANNELS.automationResolveIntake, async (_event, payload: AutomationResolveIntakePayload) => {
  await ensureAutomationEnabled();
  const intake = await resolveAutomationIntake(desktopDataPath, payload);
  if (payload.customerMessage?.send && payload.customerMessage.text?.trim()) {
    try {
      await sendTelegramCustomerMessageForIntake(desktopDataPath, {
        conversationId: intake.conversationId,
        intakeId: intake.intakeId,
        text: payload.customerMessage.text.trim(),
      });
    } catch (error) {
      console.warn('[automation] failed to send Telegram customer intake resolution message', error);
    }
  }
  return intake;
}));
ipcMain.handle(IPC_CHANNELS.automationPromoteIntake, benchmarkIpcHandle(IPC_CHANNELS.automationPromoteIntake, async (_event, payload: PromoteAutomationIntakePayload) => {
  await ensureAutomationEnabled();
  const observations = await listFreshSenaObservations();
  const prepared = await prepareAutomationPromotion(desktopDataPath, payload, { observations });
  if (prepared.shouldIngestObservation) {
    await snapshotBeforeWorkspaceMutation('automation-promote-intake');
    await managedCore.invoke<SenaObservationRecord>('sena.ingestObservation', prepared.observationInput, {
      timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
    });
  }
  await finalizeAutomationPromotion(desktopDataPath, prepared.updatedIntake);
  if (payload.customerMessage) {
    if (payload.customerMessage.send && payload.customerMessage.text?.trim()) {
      try {
        await sendTelegramCustomerMessageForIntake(desktopDataPath, {
          conversationId: prepared.updatedIntake.conversationId,
          intakeId: prepared.updatedIntake.intakeId,
          text: payload.customerMessage.text.trim(),
        });
      } catch (error) {
        console.warn('[automation] failed to send Telegram customer promotion message', error);
      }
    }
  } else {
    try {
      await notifyTelegramCustomerOfPromotion(desktopDataPath, {
        conversationId: prepared.updatedIntake.conversationId,
        intake: prepared.updatedIntake,
      });
    } catch (error) {
      console.warn('[automation] failed to notify Telegram customer after promotion', error);
    }
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
  if (process.env.KAUR_KHOR_BENCHMARK === '1') {
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
ipcMain.handle(IPC_CHANNELS.senaListObservationPage, benchmarkIpcHandle(IPC_CHANNELS.senaListObservationPage, async (_event, payload?: SenaObservationPageRequest) => {
  const pagePayload = normalizeSenaObservationPageRequest(payload);
  return loadCachedSenaRead(`observation-page:${JSON.stringify(pagePayload ?? {})}`, () =>
    managedCore.invoke<SenaObservationPage>('sena.listObservationPage', pagePayload, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
    }),
  );
}));
ipcMain.handle(IPC_CHANNELS.senaListObservations, benchmarkIpcHandle(IPC_CHANNELS.senaListObservations, async () =>
  loadCachedSenaRead('observations', () =>
    managedCore.invoke<SenaObservationRecord[]>('sena.listObservations', undefined, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
      readPriority: 'background',
    }),
  ),
));
ipcMain.handle(IPC_CHANNELS.senaListOrderBatches, benchmarkIpcHandle(IPC_CHANNELS.senaListOrderBatches, async (_event, payload?: SenaOrderLookupPayload) => {
  const orderPayload = normalizeSenaOrderLookupPayload(payload);
  return loadCachedSenaRead(`order-batches:${JSON.stringify(orderPayload ?? {})}`, () =>
    managedCore.invoke<SenaOrderBatchRecord[]>('sena.listOrderBatches', orderPayload, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
      readPriority: 'critical',
    }),
  );
}));
ipcMain.handle(IPC_CHANNELS.senaUpsertCatalog, benchmarkIpcHandle(IPC_CHANNELS.senaUpsertCatalog, async (_event, payload: SenaCatalog) => {
  const catalogPayload = normalizeSenaCatalogPayload(payload);
  await snapshotBeforeWorkspaceMutation('sena-upsert-catalog');
  const result = await managedCore.invoke<SenaCatalog>('sena.upsertCatalog', catalogPayload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
}));
ipcMain.handle(IPC_CHANNELS.senaIngestObservation, benchmarkIpcHandle(IPC_CHANNELS.senaIngestObservation, async (_event, payload: SenaObservationInput) => {
  const observationPayload = normalizeSenaObservationInputPayload(payload);
  await snapshotBeforeWorkspaceMutation('sena-ingest-observation');
  const result = await managedCore.invoke<SenaObservationRecord>('sena.ingestObservation', observationPayload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  await notifyTelegramCustomersForTicketEvents(observationPayload.ticketEvents);
  return result;
}));
ipcMain.handle(IPC_CHANNELS.senaUpdateObservation, benchmarkIpcHandle(IPC_CHANNELS.senaUpdateObservation, async (_event, payload: SenaObservationUpdatePayload) => {
  const updatePayload = normalizeSenaObservationUpdatePayload(payload);
  const observationsBeforeUpdate = await listFreshSenaObservations();
  const previousObservation = observationsBeforeUpdate.find((entry) => entry.observationId === updatePayload.observationId) ?? null;
  await snapshotBeforeWorkspaceMutation('sena-update-observation');
  const result = await managedCore.invoke<SenaObservationRecord>('sena.updateObservation', updatePayload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  await notifyTelegramCustomersForTicketEvents(
    ticketEventsRequiringTelegramNotification(updatePayload.input.ticketEvents, previousObservation?.input.ticketEvents),
  );
  return result;
}));
ipcMain.handle(IPC_CHANNELS.senaDeleteObservation, benchmarkIpcHandle(IPC_CHANNELS.senaDeleteObservation, async (_event, payload: SenaObservationDeletePayload) => {
  const deletePayload = normalizeSenaObservationDeletePayload(payload);
  await snapshotBeforeWorkspaceMutation('sena-delete-observation');
  await managedCore.invoke('sena.deleteObservation', deletePayload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
}));
ipcMain.handle(IPC_CHANNELS.senaCreateOrderBatch, benchmarkIpcHandle(IPC_CHANNELS.senaCreateOrderBatch, async (_event, payload: SenaCreateOrderBatchPayload) => {
  const createPayload = normalizeSenaCreateOrderBatchPayload(payload);
  await snapshotBeforeWorkspaceMutation('sena-create-order-batch');
  const result = await managedCore.invoke<SenaOrderBatchRecord>('sena.createOrderBatch', createPayload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
}));
ipcMain.handle(IPC_CHANNELS.senaUpdateOrderBatch, benchmarkIpcHandle(IPC_CHANNELS.senaUpdateOrderBatch, async (_event, payload: SenaUpdateOrderBatchPayload) => {
  const updatePayload = normalizeSenaUpdateOrderBatchPayload(payload);
  await snapshotBeforeWorkspaceMutation('sena-update-order-batch');
  const result = await managedCore.invoke<SenaOrderBatchRecord>('sena.updateOrderBatch', updatePayload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
}));
ipcMain.handle(IPC_CHANNELS.senaUpdateOrderChild, benchmarkIpcHandle(IPC_CHANNELS.senaUpdateOrderChild, async (_event, payload: SenaUpdateOrderChildPayload) => {
  const updatePayload = normalizeSenaUpdateOrderChildPayload(payload);
  await snapshotBeforeWorkspaceMutation('sena-update-order-child');
  const result = await managedCore.invoke<SenaOrderBatchRecord>('sena.updateOrderChild', updatePayload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
}));
ipcMain.handle(IPC_CHANNELS.senaSplitOrderChild, benchmarkIpcHandle(IPC_CHANNELS.senaSplitOrderChild, async (_event, payload: SenaSplitOrderChildPayload) => {
  const splitPayload = normalizeSenaSplitOrderChildPayload(payload);
  await snapshotBeforeWorkspaceMutation('sena-split-order-child');
  const result = await managedCore.invoke<SenaOrderBatchRecord>('sena.splitOrderChild', splitPayload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
}));
ipcMain.handle(IPC_CHANNELS.senaTriggerRun, benchmarkIpcHandle(IPC_CHANNELS.senaTriggerRun, async (_event, payload?: SenaTriggerRunPayload) => {
  const triggerPayload = normalizeSenaTriggerRunPayload(payload);
  await snapshotBeforeWorkspaceMutation('sena-trigger-run');
  const result = await managedCore.invoke<SenaAnalysisRunRecord>('sena.triggerRun', triggerPayload, {
    timeoutMs: LONG_RUNNING_CORE_TIMEOUT_MS,
  });
  await invalidateSenaReadCache();
  return result;
}));
ipcMain.handle(IPC_CHANNELS.senaRetryRun, benchmarkIpcHandle(IPC_CHANNELS.senaRetryRun, async (_event, payload: SenaRunLookupPayload) => {
  const runPayload = normalizeSenaRunLookupPayload(payload);
  await snapshotBeforeWorkspaceMutation('sena-retry-run');
  const result = await managedCore.invoke<SenaAnalysisRunRecord>('sena.retryRun', runPayload, {
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
ipcMain.handle(IPC_CHANNELS.senaGetSkuDetail, benchmarkIpcHandle(IPC_CHANNELS.senaGetSkuDetail, async (_event, payload: SenaSkuLookupPayload) => {
  const detailPayload = normalizeSenaSkuLookupPayload(payload);
  return loadCachedSenaRead(`sku-detail:${detailPayload.skuId}:before:${detailPayload.beforeIntervalIndex ?? 'latest'}:limit:${detailPayload.limit ?? 20}`, () =>
    managedCore.invoke<SenaSkuDetailPage | null>('sena.getSkuDetail', {
      skuId: detailPayload.skuId,
      beforeIntervalIndex: detailPayload.beforeIntervalIndex ?? null,
      limit: detailPayload.limit ?? 20,
    }, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
    }),
  );
}));
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
    const detailPayload = normalizeSenaServiceLookupPayload(payload);
    const cacheKey = `service-detail:${detailPayload.serviceId}:before:${detailPayload.beforeIntervalIndex ?? 'latest'}:limit:${detailPayload.limit ?? 20}`;
    return loadCachedSenaRead(cacheKey, async () => {
      const endCoreRoundTrip = startBenchmarkSpan({
        category: 'ipc',
        name: 'main.service-detail.core-round-trip',
        detail: {
          beforeIntervalIndex: detailPayload.beforeIntervalIndex ?? null,
          limit: detailPayload.limit ?? 20,
          serviceId: detailPayload.serviceId,
        },
      });
      try {
        const result = await managedCore.invoke<SenaServiceDetailPage | null>('sena.getServiceDetail', {
          serviceId: detailPayload.serviceId,
          beforeIntervalIndex: detailPayload.beforeIntervalIndex ?? null,
          limit: detailPayload.limit ?? 20,
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
    invalidateSenaDetailCache(normalizeSenaDetailCacheClearPayload(payload)),
  ),
);
ipcMain.handle(IPC_CHANNELS.senaGetRunStatus, benchmarkIpcHandle(IPC_CHANNELS.senaGetRunStatus, async (_event, payload: SenaRunLookupPayload) => {
  const runPayload = normalizeSenaRunLookupPayload(payload);
  return loadCachedSenaRead(`run-status:${runPayload.runId}`, () =>
    managedCore.invoke<SenaAnalysisRunRecord | null>('sena.getRunStatus', runPayload, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
    }),
  );
}));
ipcMain.handle(IPC_CHANNELS.senaGetAnalysisArtifact, benchmarkIpcHandle(IPC_CHANNELS.senaGetAnalysisArtifact, async (_event, payload: SenaRunLookupPayload) => {
  const runPayload = normalizeSenaRunLookupPayload(payload);
  return loadCachedSenaRead(`analysis-artifact:${runPayload.runId}`, () =>
    managedCore.invoke<SenaAnalysisArtifactRecord | null>('sena.getAnalysisArtifact', runPayload, {
      timeoutMs: SENA_READ_TIMEOUT_MS,
      readPriority: 'background',
    }),
  );
}));

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
    await stopDesktopRuntimeForShutdown();
    desktopQuitConfirmed = true;
    app.quit();
  }
});

app.on('before-quit', (event) => {
  if (desktopQuitConfirmed || shouldBypassDesktopCloseAutomationWarning()) {
    if (desktopShutdownCompleted) {
      return;
    }
    event.preventDefault();
    void stopDesktopRuntimeForShutdown().finally(() => {
      app.quit();
    });
    return;
  }
  event.preventDefault();
  void confirmDesktopQuitForLiveAutomation().then((shouldQuit) => {
    if (!shouldQuit) {
      return;
    }
    desktopQuitConfirmed = true;
    void stopDesktopRuntimeForShutdown().finally(() => {
      app.quit();
    });
  });
});
