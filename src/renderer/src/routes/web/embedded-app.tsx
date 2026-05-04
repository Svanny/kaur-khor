import { useEffect, useRef, useState } from 'react';
import { HashRouter, useLocation } from 'react-router-dom';
import App from '@/App';
import {
  createEmptyBrowserMockState,
  createMockState,
  getBrowserDesktopBridgeMockState,
  installBrowserDesktopBridge,
  setBrowserDesktopBridgeMockState,
  type BrowserMockState,
} from '@/dev/browser-desktop-bridge';
import { Button } from '@/components/ui/button';
import {
  ActionDatabaseUploadIcon,
  ActionExportIcon,
  ActionResetIcon,
  ActionResumeIcon,
} from '@icons/actions';
import { StatusWarningIcon } from '@icons/status';
import { WebDownloadIcon, WebGlobeIcon } from '@icons/web';
import { cn } from '@/lib/utils';
import { translateUiLiteral } from '@/lib/translations';
import {
  KAUR_KHOR_BROWSER_APP_DATABASE,
  KAUR_KHOR_BROWSER_DEMO_DATABASE,
  createBrowserStorageBackup,
  openBrowserStorage,
  parseBrowserStorageBackupJson,
  type KaurKhorBrowserDatabaseName,
  type BrowserStorageDocumentRecord,
  type BrowserStorageHandle,
  type BrowserStorageSupportedHandle,
} from '@/runtime/web';
import type { AppLanguage } from '@shared/inventory';
import type { DesktopBridge } from '@shared/ipc';
import { EmbeddedAutoZoomViewport } from './embedded-viewport';

type EmbeddedMode = 'app' | 'demo';
type PersistenceStatus = 'loading' | 'ready' | 'unsupported' | 'error';

type StorageUiState = {
  status: PersistenceStatus;
  message: string;
  databaseName: KaurKhorBrowserDatabaseName;
  vfs: string;
  sqliteVersion: string;
  persistence: 'granted' | 'not-granted' | 'unknown';
  lastBackupAt: string | null;
  handle: BrowserStorageSupportedHandle | null;
};

const embeddedBannerRailHeightClassName = 'md:min-h-[13.5rem]';
export const BROWSER_WORKSPACE_CLOSE_WARNING = 'Your Kaur Khor workspace is saved in this browser profile. Browser cleanup, site-data removal, or private browsing cleanup can remove it. Export a backup before closing if you need this workspace.';
export const BROWSER_WORKSPACE_TELEGRAM_CLOSE_WARNING = 'Your Kaur Khor workspace is saved in this browser profile. Export a backup before closing. Closing this tab also stops live Telegram listening and automation intake until you open /app again.';

export function isBrowserTelegramLiveListening() {
  const connection = getBrowserDesktopBridgeMockState().automation.connection;
  return connection.status === 'connected' && connection.hasBotToken;
}

export function browserWorkspaceCloseWarningMessage(isTelegramLiveListening: boolean) {
  return isTelegramLiveListening
    ? BROWSER_WORKSPACE_TELEGRAM_CLOSE_WARNING
    : BROWSER_WORKSPACE_CLOSE_WARNING;
}

export function installBrowserBeforeUnloadWarning(
  target: Window = window,
  message = BROWSER_WORKSPACE_CLOSE_WARNING,
) {
  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    event.preventDefault();
    event.returnValue = message;
    return message;
  };
  target.addEventListener('beforeunload', handleBeforeUnload);
  return () => {
    target.removeEventListener('beforeunload', handleBeforeUnload);
  };
}

function publicPath(path: string) {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return base + path;
}

function databaseForMode(mode: EmbeddedMode): KaurKhorBrowserDatabaseName {
  return mode === 'demo' ? KAUR_KHOR_BROWSER_DEMO_DATABASE : KAUR_KHOR_BROWSER_APP_DATABASE;
}

export function fallbackStateForMode(mode: EmbeddedMode): BrowserMockState {
  const state = mode === 'demo' ? createMockState() : createEmptyBrowserMockState();
  state.appContext = {
    ...state.appContext,
    platform: mode === 'demo' ? 'web-demo' : 'web',
  };
  state.localDataInfo = {
    ...state.localDataInfo,
    dataDirectoryPath: 'OPFS / Kaur Khor browser workspace',
    workspaceStorePath: databaseForMode(mode),
    preferencesPath: 'SQLite preferences table',
    backupDirectoryPath: 'downloaded backups',
    assetDirectoryPath: 'Browser image storage unavailable in this release',
  };
  return state;
}

function stateRecord(
  databaseName: KaurKhorBrowserDatabaseName,
  state: BrowserMockState,
  updatedAt = new Date().toISOString(),
): BrowserStorageDocumentRecord {
  return {
    collection: 'browser_state',
    id: databaseName,
    json: state,
    updatedAt,
  };
}

function readStateRecord(records: BrowserStorageDocumentRecord[], databaseName: KaurKhorBrowserDatabaseName): BrowserMockState | null {
  const record = records.find((entry) => entry.collection === 'browser_state' && entry.id === databaseName);
  if (!record || typeof record.json !== 'object' || record.json === null) {
    return null;
  }
  return record.json as BrowserMockState;
}

async function persistCurrentState(handle: BrowserStorageSupportedHandle, databaseName: KaurKhorBrowserDatabaseName) {
  const state = getBrowserDesktopBridgeMockState();
  await handle.persistSenaState(state);
  await handle.putDocuments([stateRecord(databaseName, state)]);
}

function wrapMutation<T extends object, K extends keyof T>(
  owner: T | undefined,
  key: K,
  persist: () => Promise<void>,
) {
  if (!owner) {
    return;
  }
  const original = owner[key];
  if (typeof original !== 'function') {
    return;
  }
  owner[key] = (async (...args: unknown[]) => {
    const result = await (original as (...methodArgs: unknown[]) => Promise<unknown>)(...args);
    await persist();
    window.dispatchEvent(new Event('kaur-khor-browser-state-changed'));
    return result;
  }) as T[K];
}

function installPersistenceHooks(
  handle: BrowserStorageSupportedHandle,
  databaseName: KaurKhorBrowserDatabaseName,
  mode: EmbeddedMode,
) {
  const bridge = window.kaurKhorDesktop as DesktopBridge & { __kaurKhorWebPersistenceWrapped?: boolean };
  if (bridge.__kaurKhorWebPersistenceWrapped) {
    return;
  }
  bridge.__kaurKhorWebPersistenceWrapped = true;
  const persist = () => persistCurrentState(handle, databaseName);

  wrapMutation(bridge.preferences, 'save', persist);
  wrapMutation(bridge.sena, 'upsertCatalog', persist);
  wrapMutation(bridge.sena, 'ingestObservation', persist);
  wrapMutation(bridge.sena, 'updateObservation', persist);
  wrapMutation(bridge.sena, 'deleteObservation', persist);
  wrapMutation(bridge.sena, 'createOrderBatch', persist);
  wrapMutation(bridge.sena, 'updateOrderBatch', persist);
  wrapMutation(bridge.sena, 'updateOrderChild', persist);
  wrapMutation(bridge.sena, 'splitOrderChild', persist);
  wrapMutation(bridge.sena, 'triggerRun', persist);
  wrapMutation(bridge.sena, 'retryRun', persist);
  wrapMutation(bridge.automation, 'saveConnection', persist);
  wrapMutation(bridge.automation, 'patchExposureRow', persist);
  wrapMutation(bridge.automation, 'resolveIntake', persist);
  wrapMutation(bridge.automation, 'promoteIntake', persist);
  wrapMutation(bridge.automation, 'testTelegramConnection', persist);

  bridge.system.clearCurrentData = async () => {
    setBrowserDesktopBridgeMockState(fallbackStateForMode(mode));
    await persist();
    window.dispatchEvent(new Event('kaur-khor-browser-state-changed'));
    return {
      clearedFileCount: 1,
      safetySnapshot: {
        createdAt: new Date().toISOString(),
        fileCount: 1,
        snapshotPath: 'downloaded backups',
        trigger: 'manual',
      },
    };
  };
}

function shouldPollBrowserTelegram(mode: EmbeddedMode) {
  if (mode !== 'app' || document.visibilityState !== 'visible') {
    return false;
  }
  return isBrowserTelegramLiveListening();
}

async function requestPersistentStorage(): Promise<StorageUiState['persistence']> {
  if (!navigator.storage?.persist) {
    return 'unknown';
  }
  return await navigator.storage.persist() ? 'granted' : 'not-granted';
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function formatBrowserStorageErrorMessage(message: string) {
  if (
    message.includes('createSyncAccessHandle') ||
    message.includes('Access Handles cannot be created') ||
    message.includes('another open Access Handle')
  ) {
    return 'Cannot have two Kaur Khor browser tabs open at the same time. Close the other tab, then reload this page.';
  }
  return message;
}

function useEmbeddedSidebarCollapsed() {
  const [isCollapsed, setIsCollapsed] = useState(false);

  useEffect(() => {
    const readSidebarState = () => {
      const sidebar = document.querySelector<HTMLElement>('[data-slot="sidebar"][data-state]');
      setIsCollapsed(sidebar?.dataset.state === 'collapsed');
      return sidebar;
    };

    let sidebar = readSidebarState();
    const observer = new MutationObserver(() => {
      readSidebarState();
    });

    if (sidebar) {
      observer.observe(sidebar, { attributes: true, attributeFilter: ['data-state'] });
    }

    const documentObserver = new MutationObserver(() => {
      const nextSidebar = document.querySelector<HTMLElement>('[data-slot="sidebar"][data-state]');
      if (nextSidebar && nextSidebar !== sidebar) {
        observer.disconnect();
        observer.observe(nextSidebar, { attributes: true, attributeFilter: ['data-state'] });
        sidebar = nextSidebar;
        setIsCollapsed(nextSidebar.dataset.state === 'collapsed');
      }
    });

    documentObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      documentObserver.disconnect();
    };
  }, []);

  return isCollapsed;
}

function useBrowserTelegramLiveListening(mode: EmbeddedMode) {
  const [isLiveListening, setIsLiveListening] = useState(() =>
    mode === 'app' && isBrowserTelegramLiveListening(),
  );

  useEffect(() => {
    if (mode !== 'app') {
      setIsLiveListening(false);
      return;
    }

    const readLiveState = () => {
      setIsLiveListening(isBrowserTelegramLiveListening());
    };

    readLiveState();
    window.addEventListener('kaur-khor-browser-state-changed', readLiveState);
    return () => {
      window.removeEventListener('kaur-khor-browser-state-changed', readLiveState);
    };
  }, [mode]);

  return isLiveListening;
}

function useBrowserWorkspaceLanguage() {
  const [language, setLanguage] = useState<AppLanguage>(() =>
    getBrowserDesktopBridgeMockState().preferences.language,
  );

  useEffect(() => {
    const readLanguage = () => {
      setLanguage(getBrowserDesktopBridgeMockState().preferences.language);
    };

    readLanguage();
    window.addEventListener('kaur-khor-browser-state-changed', readLanguage);
    return () => {
      window.removeEventListener('kaur-khor-browser-state-changed', readLanguage);
    };
  }, []);

  return language;
}

function WebAppBanner({
  isOnboarding,
  mode,
  storage,
  onExport,
  onImport,
  onReset,
}: {
  isOnboarding?: boolean;
  mode: EmbeddedMode;
  storage: StorageUiState;
  onExport: () => void;
  onImport: (file: File) => void;
  onReset: () => void;
}) {
  const isDemo = mode === 'demo';
  const language = useBrowserWorkspaceLanguage();
  const isTelegramLiveListening = useBrowserTelegramLiveListening(mode);
  const appWarningMessage = translateUiLiteral(language, browserWorkspaceCloseWarningMessage(isTelegramLiveListening));
  const exportBackupLabel = translateUiLiteral(language, 'Export backup');
  const importBackupLabel = translateUiLiteral(language, 'Import backup');
  const resetLabel = translateUiLiteral(language, isDemo ? 'Reset demo' : 'Reset workspace');
  const destinationLabel = translateUiLiteral(language, isDemo ? 'Use browser app' : 'Download app');
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const sidebarCollapsed = useEmbeddedSidebarCollapsed();
  const actionButtonClassName = cn(
    'w-full justify-start md:h-8 md:min-w-0 md:px-2',
    sidebarCollapsed && !isOnboarding ? 'md:size-8 md:justify-center md:p-2' : null,
    isOnboarding ? 'h-9 w-36 justify-center rounded-lg px-3 sm:w-44' : null,
  );
  return (
    <div
      className={cn(
        'border-b border-border/70 bg-background/95 px-4 py-3 text-foreground shadow-[0_10px_30px_rgba(27,15,7,0.06)] md:fixed md:bottom-[6.2rem] md:left-2 md:z-40 md:w-[calc(12.8rem-1rem)] md:border-0 md:bg-transparent md:p-0 md:shadow-none',
        sidebarCollapsed && !isOnboarding ? 'md:w-8' : null,
        isOnboarding ? 'fixed inset-x-3 top-3 z-50 border-0 bg-transparent p-0 shadow-none md:bottom-auto md:left-1/2 md:right-auto md:top-4 md:w-[min(64rem,calc(100vw-2rem))] md:-translate-x-1/2' : null,
      )}
    >
      <div
        data-slot="web-app-banner-card"
        className={cn(
          'mx-auto flex max-w-6xl flex-col gap-3 rounded-[1.15rem] border border-primary/20 bg-card/82 px-4 py-3 text-sm leading-6 shadow-none md:max-w-none md:items-stretch md:gap-2 md:rounded-xl md:px-2.5 md:py-2 md:text-xs md:leading-5',
          !isOnboarding ? embeddedBannerRailHeightClassName : null,
          sidebarCollapsed && !isOnboarding ? 'md:rounded-none md:border-0 md:bg-transparent md:px-0 md:py-0' : null,
          isOnboarding ? 'flex-row items-center justify-between gap-4 rounded-xl border-border/70 bg-background/90 px-3 py-2 text-sm leading-6 shadow-[0_18px_48px_rgba(48,31,20,0.14)] backdrop-blur-xl md:text-sm md:leading-6' : null,
        )}
      >
        <div className={cn('grid gap-2', sidebarCollapsed && !isOnboarding ? 'md:justify-items-center' : null, isOnboarding ? 'flex min-w-0 flex-1 items-center gap-3' : null)}>
          <span className={cn('grid size-9 shrink-0 place-items-center justify-self-center rounded-[0.85rem] bg-amber-100 text-amber-950 md:size-8 md:rounded-md', isOnboarding ? 'size-9 rounded-lg' : null)}>
            <StatusWarningIcon className="size-4" />
          </span>
          <div className={cn('min-w-0 text-left', sidebarCollapsed && !isOnboarding ? 'md:sr-only' : null, isOnboarding ? 'max-w-[18rem] sm:max-w-[24rem]' : null)}>
            <p className={cn('font-semibold md:leading-4', isOnboarding ? 'whitespace-normal break-words leading-snug' : null)}>
              {translateUiLiteral(language, isDemo ? 'Demo data - not your real workspace.' : 'Export a backup before closing.')}
            </p>
            {isDemo ? (
              <p className="hidden text-muted-foreground md:block">{translateUiLiteral(language, 'Sample workspace. Reset anytime.')}</p>
            ) : (
              <p className="text-muted-foreground">{appWarningMessage}</p>
            )}
          </div>
        </div>
        <div className={cn('grid grid-cols-1 gap-2 md:gap-1.5', isOnboarding ? 'grid-cols-2 justify-items-end justify-self-end' : null)}>
          <Button aria-label={exportBackupLabel} className={actionButtonClassName} size="sm" type="button" variant="outline" onClick={onExport} disabled={storage.status !== 'ready'}>
            <ActionExportIcon className="size-4" />
            <span className={sidebarCollapsed && !isOnboarding ? 'md:sr-only' : undefined}>{exportBackupLabel}</span>
          </Button>
          <Button aria-label={importBackupLabel} className={actionButtonClassName} size="sm" type="button" variant="outline" onClick={() => importInputRef.current?.click()} disabled={storage.status !== 'ready'}>
            <ActionDatabaseUploadIcon className="size-4" />
            <span className={sidebarCollapsed && !isOnboarding ? 'md:sr-only' : undefined}>{importBackupLabel}</span>
          </Button>
          <Button aria-label={resetLabel} className={actionButtonClassName} size="sm" type="button" variant="outline" onClick={onReset}>
            <ActionResetIcon className="size-4" />
            <span className={sidebarCollapsed && !isOnboarding ? 'md:sr-only' : undefined}>{resetLabel}</span>
          </Button>
          <Button asChild className={actionButtonClassName} size="sm" variant="outline">
            <a aria-label={destinationLabel} href={publicPath(isDemo ? '/app' : '/#releases')}>
              {isDemo ? <WebGlobeIcon className="size-4" /> : <WebDownloadIcon className="size-4" />}
              <span className={sidebarCollapsed && !isOnboarding ? 'md:sr-only' : undefined}>{destinationLabel}</span>
            </a>
          </Button>
          <input
            ref={importInputRef}
            accept=".json,application/json"
            className="hidden"
            type="file"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              event.currentTarget.value = '';
              if (file) {
                onImport(file);
              }
            }}
          />
        </div>
      </div>
    </div>
  );
}

export function EmbeddedAppBanner({
  mode,
  storage,
  onExport,
  onImport,
  onReset,
}: {
  mode: EmbeddedMode;
  storage: StorageUiState;
  onExport: () => void;
  onImport: (file: File) => void;
  onReset: () => void;
}) {
  const location = useLocation();

  return (
    <WebAppBanner
      isOnboarding={location.pathname === '/onboarding'}
      mode={mode}
      storage={storage}
      onExport={onExport}
      onImport={onImport}
      onReset={onReset}
    />
  );
}

export function EmbeddedAppRoute({ mode }: { mode: EmbeddedMode }) {
  const databaseName = databaseForMode(mode);
  const [storage, setStorage] = useState<StorageUiState>({
    status: 'loading',
    message: 'Opening SQLite WASM storage.',
    databaseName,
    vfs: 'opfs-sahpool',
    sqliteVersion: 'pending',
    persistence: 'unknown',
    lastBackupAt: null,
    handle: null,
  });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let mounted = true;
    const fallbackState = fallbackStateForMode(mode);
    setBrowserDesktopBridgeMockState(fallbackState);
    installBrowserDesktopBridge();

    void openBrowserStorage({ databaseName })
      .then(async (handle: BrowserStorageHandle) => {
        if (!mounted) {
          handle.status === 'supported' && handle.close();
          return;
        }

        const persistence = await requestPersistentStorage();
        if (handle.status === 'unsupported') {
          setStorage((current) => ({
            ...current,
            status: 'unsupported',
            message: handle.capability.reasons.join(' ') || 'This browser cannot open SQLite WASM OPFS storage.',
            persistence,
          }));
          if (mode === 'demo') {
            setIsReady(true);
          }
          return;
        }

        const stateRecords = await handle.listDocuments('browser_state');
        const restoredState = readStateRecord(stateRecords, databaseName);
        const nextState = restoredState ?? fallbackState;
        setBrowserDesktopBridgeMockState(nextState);
        await persistCurrentState(handle, databaseName);
        installPersistenceHooks(handle, databaseName, mode);

        setStorage({
          status: 'ready',
          message: mode === 'demo'
            ? 'This demo uses a separate sample workspace.'
            : 'Your workspace is saved in this browser on this device.',
          databaseName,
          vfs: handle.init.vfs,
          sqliteVersion: handle.init.sqliteVersion,
          persistence,
          lastBackupAt: null,
          handle,
        });
        setIsReady(true);
      })
      .catch((error: unknown) => {
        if (!mounted) {
          return;
        }
        setStorage((current) => ({
          ...current,
          status: 'error',
          message: formatBrowserStorageErrorMessage(error instanceof Error ? error.message : String(error)),
        }));
        if (mode === 'demo') {
          setIsReady(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [databaseName, mode]);

  useEffect(() => {
    if (!isReady || mode !== 'app') {
      return;
    }

    let inFlight = false;
    const poll = () => {
      if (!shouldPollBrowserTelegram(mode) || inFlight) {
        return;
      }
      inFlight = true;
      window.kaurKhorDesktop.automation?.testTelegramConnection()
        .catch(() => undefined)
        .finally(() => {
          inFlight = false;
        });
    };
    const intervalId = window.setInterval(poll, 30_000);
    document.addEventListener('visibilitychange', poll);
    poll();

    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', poll);
    };
  }, [isReady, mode]);

  useEffect(() => {
    if (!isReady || mode !== 'app' || storage.status !== 'ready') {
      return;
    }
    return installBrowserBeforeUnloadWarning(window, browserWorkspaceCloseWarningMessage(isBrowserTelegramLiveListening()));
  }, [isReady, mode, storage.status]);

  function handleExport() {
    void (async () => {
      if (!storage.handle) {
        return;
      }
      await persistCurrentState(storage.handle, databaseName);
      const backup = createBrowserStorageBackup(
        databaseName,
        [stateRecord(databaseName, getBrowserDesktopBridgeMockState())],
      );
      downloadJson(`kaur-khor-${mode}-backup-${new Date().toISOString().slice(0, 10)}.kaur-khor-backup.json`, backup);
      setStorage((current) => ({
        ...current,
        lastBackupAt: backup.exportedAt,
      }));
    })();
  }

  function handleImport(file: File) {
    void (async () => {
      if (!storage.handle) {
        return;
      }
      const validation = parseBrowserStorageBackupJson(await file.text());
      if (!validation.ok) {
        setStorage((current) => ({ ...current, status: 'error', message: validation.errors.join(' ') }));
        return;
      }
      if (validation.backup.databaseName !== databaseName) {
        setStorage((current) => ({
          ...current,
          status: 'error',
          message: `Backup is for ${validation.backup.databaseName}, not ${databaseName}.`,
        }));
        return;
      }
      await storage.handle.importBackup(validation.backup);
      const restoredState = readStateRecord(await storage.handle.listDocuments('browser_state'), databaseName);
      if (!restoredState) {
        setStorage((current) => ({ ...current, status: 'error', message: 'Backup did not contain a browser workspace state.' }));
        return;
      }
      setBrowserDesktopBridgeMockState(restoredState);
      window.location.reload();
    })();
  }

  function handleReset() {
    if (mode === 'app' && !window.confirm('Reset this browser workspace? Export a backup first if you need this data.')) {
      return;
    }
    void (async () => {
      const nextState = fallbackStateForMode(mode);
      setBrowserDesktopBridgeMockState(nextState);
      if (storage.handle) {
        await storage.handle.clear();
        await persistCurrentState(storage.handle, databaseName);
      }
      window.location.reload();
    })();
  }

  if (!isReady) {
    if (mode === 'app' && (storage.status === 'unsupported' || storage.status === 'error')) {
      return (
        <div className="flex min-h-svh items-center justify-center bg-background px-6 text-foreground">
          <div className="w-full max-w-xl rounded-[1.35rem] border border-border/70 bg-card/80 p-6 shadow-panel">
            <p className="inline-flex w-fit items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <StatusWarningIcon className="size-3.5 text-primary" />
              Unsupported browser storage
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-normal">Kaur Khor cannot store real browser-app data here.</h1>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              {storage.message} Use demo mode, download the desktop app, or build from source. Kaur Khor does not silently fall back to weak storage for real browser data.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild>
                <a href={publicPath('/demo')}><ActionResumeIcon className="size-4" />Try demo</a>
              </Button>
              <Button asChild variant="outline">
                <a href={publicPath('/#releases')}><WebDownloadIcon className="size-4" />Download app</a>
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex min-h-svh items-center justify-center bg-background px-6 text-foreground">
        <div className="w-full max-w-md text-center">
          <p className="text-sm font-semibold text-primary">KAUR KHOR</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal">Preparing browser workspace...</h1>
        </div>
      </div>
    );
  }

  return (
    <EmbeddedAutoZoomViewport>
      <HashRouter>
        <EmbeddedAppBanner
          mode={mode}
          storage={storage}
          onExport={handleExport}
          onImport={handleImport}
          onReset={handleReset}
        />
        <App />
      </HashRouter>
    </EmbeddedAutoZoomViewport>
  );
}
