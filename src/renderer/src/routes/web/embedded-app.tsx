import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
  ActionConfirmIcon,
  ActionDatabaseUploadIcon,
  ActionExportIcon,
  ActionResetIcon,
  ActionResumeIcon,
} from '@icons/actions';
import { StatusWarningIcon } from '@icons/status';
import { WebDownloadIcon, WebHomeIcon } from '@icons/web';
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
import { EmbeddedAutoZoomViewport, useEmbeddedPhonePortraitViewport } from './embedded-viewport';
import { EmbeddedPhoneApp } from './phone-shell';

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

export const BROWSER_WORKSPACE_CLOSE_WARNING = 'Your Kaur Khor workspace is saved in this browser profile. Browser cleanup, site-data removal, or private browsing cleanup can remove it. Export a backup before closing if you need this workspace.';
export const BROWSER_WORKSPACE_TELEGRAM_CLOSE_WARNING = 'Your Kaur Khor workspace is saved in this browser profile. Export a backup before closing. Closing this tab also stops live Telegram listening and automation intake until you open /app again.';
const BROWSER_APP_READY_MESSAGE = 'Your workspace is saved in this browser on this device.';
const HIDDEN_PHONE_OPERATOR_HASH_PREFIX = '#/__phone/7f4b0e2d-9a61-4f83-a61e-21d63bfb8e7c';
const HIDDEN_PHONE_OPERATOR_BASENAME = '/__phone/7f4b0e2d-9a61-4f83-a61e-21d63bfb8e7c';
const phoneWarningCopyEnglishAnimationName = 'kaur-khor-onboarding-copy-english';
const phoneWarningCopyKhmerAnimationName = 'kaur-khor-onboarding-copy-khmer';
const phoneWarningCopyCycleMs = 9000;

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
  message: string | (() => string) = BROWSER_WORKSPACE_CLOSE_WARNING,
) {
  const handleBeforeUnload = (event: BeforeUnloadEvent) => {
    const currentMessage = typeof message === 'function' ? message() : message;
    event.preventDefault();
    event.returnValue = currentMessage;
    return currentMessage;
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

function normalizeBrowserStateForMode(mode: EmbeddedMode, state: BrowserMockState): BrowserMockState {
  if (mode !== 'demo') {
    return state;
  }

  return {
    ...state,
    preferences: {
      ...state.preferences,
      showAutomationsPage: true,
      customShowAutomationsPage: true,
    },
  };
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

function storageStateWithActionableError(current: StorageUiState, message: string): StorageUiState {
  return {
    ...current,
    status: current.handle ? 'ready' : 'error',
    message,
  };
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

function isHiddenPhoneOperatorHash(hash: string) {
  return hash === HIDDEN_PHONE_OPERATOR_HASH_PREFIX || hash.startsWith(`${HIDDEN_PHONE_OPERATOR_HASH_PREFIX}/`);
}

function useHiddenPhoneOperatorState() {
  const [hiddenPhoneOperator, setHiddenPhoneOperator] = useState(() =>
    typeof window !== 'undefined' && isHiddenPhoneOperatorHash(window.location.hash),
  );

  useEffect(() => {
    const readHiddenState = () => {
      setHiddenPhoneOperator(isHiddenPhoneOperatorHash(window.location.hash));
    };

    readHiddenState();
    window.addEventListener('hashchange', readHiddenState);
    return () => {
      window.removeEventListener('hashchange', readHiddenState);
    };
  }, []);

  return hiddenPhoneOperator;
}

function PhoneWarningAnimatedCopy({
  as: Element,
  className,
  copy,
  wrapperClassName,
}: {
  as: 'h2' | 'p' | 'span';
  className: string;
  copy: string;
  wrapperClassName?: string;
}) {
  return (
    <>
      {(['en', 'km'] as const).map((copyLanguage) => (
        <Element key={copyLanguage} className={cn('invisible col-start-1 row-start-1', className)}>
          {translateUiLiteral(copyLanguage, copy)}
        </Element>
      ))}
      <span className={cn('relative col-start-1 row-start-1 block min-h-full overflow-hidden', wrapperClassName)}>
        {(['en', 'km'] as const).map((copyLanguage) => (
          <Element
            key={copyLanguage}
            className={cn('absolute inset-0 will-change-transform', className)}
            style={{
              animation: `${copyLanguage === 'km' ? phoneWarningCopyKhmerAnimationName : phoneWarningCopyEnglishAnimationName} ${phoneWarningCopyCycleMs}ms linear infinite`,
            }}
          >
            {translateUiLiteral(copyLanguage, copy)}
          </Element>
        ))}
      </span>
    </>
  );
}

export function PhoneViewWarningOverlay() {
  const language = useBrowserWorkspaceLanguage();
  const title = 'Rotate screen';
  const description = 'Kaur Khor needs more room. Rotate your screen sideways, then continue in the larger layout.';
  const secondaryDescription = 'For regular work, use a larger browser window or the desktop app.';

  return (
    <div className="pointer-events-auto flex min-h-svh items-center justify-center bg-background px-4 py-5 text-foreground">
      <div
        data-slot="embedded-phone-view-warning-card"
        role="dialog"
        aria-labelledby="embedded-phone-view-warning-title"
        aria-describedby="embedded-phone-view-warning-description"
        className="w-full max-w-sm rounded-xl border border-amber-300/70 bg-popover p-4 text-left text-popover-foreground shadow-[0_18px_48px_rgba(48,31,20,0.16)]"
      >
        <style>{`
          @keyframes ${phoneWarningCopyEnglishAnimationName} {
            0%, 44% {
              transform: translateY(0%);
              animation-timing-function: ease-in;
            }
            46.5%, 96.5% {
              transform: translateY(-125%);
              animation-timing-function: step-end;
            }
            96.51% {
              transform: translateY(125%);
              animation-timing-function: ease-out;
            }
            100% {
              transform: translateY(0%);
            }
          }
          @keyframes ${phoneWarningCopyKhmerAnimationName} {
            0%, 46.5% {
              transform: translateY(125%);
              animation-timing-function: ease-out;
            }
            49.5%, 94% {
              transform: translateY(0%);
              animation-timing-function: ease-in;
            }
            96.5%, 100% {
              transform: translateY(-125%);
            }
          }
        `}</style>
        <div className="flex items-start gap-3">
          <div
            aria-hidden="true"
            className="grid size-[4.75rem] shrink-0 place-items-center rounded-xl bg-white p-3 text-[#111827]"
            data-slot="embedded-phone-view-warning-icon"
          >
            <div className="relative h-12 w-8 rounded-[0.55rem] border-2 border-current">
              <div className="absolute left-1/2 top-1 h-1 w-3 -translate-x-1/2 rounded-full bg-current" />
              <div className="absolute inset-x-1 bottom-1 top-3 rounded-[0.35rem] border border-current/35 bg-amber-100" />
              <div className="absolute -right-4 top-1/2 h-1.5 w-8 -translate-y-1/2 rounded-full bg-current" />
            </div>
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="embedded-phone-view-warning-title" className="sr-only">
              {translateUiLiteral(language, title)}
            </h2>
            <p id="embedded-phone-view-warning-description" className="sr-only">
              {translateUiLiteral(language, description)}
            </p>
            <div
              aria-hidden="true"
              className="min-w-0"
              data-slot="embedded-phone-view-warning-copy"
            >
              <div className="relative grid overflow-hidden" data-slot="embedded-phone-view-warning-copy-title">
                <PhoneWarningAnimatedCopy as="h2" className="text-base font-semibold leading-6" copy={title} />
              </div>
              <div className="relative mt-1 grid overflow-hidden" data-slot="embedded-phone-view-warning-copy-description">
                <PhoneWarningAnimatedCopy as="p" className="text-sm leading-6 text-muted-foreground" copy={description} />
              </div>
              <div className="relative mt-2 grid overflow-hidden" data-slot="embedded-phone-view-warning-copy-secondary-description">
                <PhoneWarningAnimatedCopy as="p" className="text-sm leading-6 text-muted-foreground" copy={secondaryDescription} />
              </div>
            </div>
          </div>
        </div>
        <Button
          aria-label={translateUiLiteral(language, 'Done')}
          className="mt-4 w-full justify-center"
          disabled
          size="sm"
          type="button"
          variant="default"
        >
          <ActionConfirmIcon data-icon="inline-start" />
          <span
            aria-hidden="true"
            className="relative grid overflow-hidden"
            data-slot="embedded-phone-view-warning-copy-done"
          >
            <PhoneWarningAnimatedCopy as="span" className="" copy="Done" />
          </span>
        </Button>
      </div>
    </div>
  );
}

function useEmbeddedSidebarBannerTarget(enabled: boolean) {
  const [target, setTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) {
      setTarget(null);
      return;
    }

    const readTarget = () => {
      setTarget(document.querySelector<HTMLElement>('[data-slot="embedded-sidebar-banner-slot"]'));
    };

    readTarget();
    const observer = new MutationObserver(readTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
    };
  }, [enabled]);

  return target;
}

function WebAppActionLabel({
  compact,
  compactMode,
  full,
  isOnboarding,
  medium,
  sidebarCollapsed,
}: {
  compact: string;
  compactMode: boolean;
  full: string;
  isOnboarding?: boolean;
  medium: string;
  sidebarCollapsed: boolean;
}) {
  if (isOnboarding) {
    return <span data-slot="web-app-banner-action-label">{full}</span>;
  }

  const collapsedClassName = compactMode ? 'sr-only' : sidebarCollapsed ? 'md:sr-only' : undefined;
  return (
    <>
      <span className={cn('embedded-sidebar-action-label-full', collapsedClassName)} data-slot="web-app-banner-action-label">{full}</span>
      <span className={cn('embedded-sidebar-action-label-medium', collapsedClassName)} data-slot="web-app-banner-action-label">{medium}</span>
      <span className={cn('embedded-sidebar-action-label-compact', collapsedClassName)} data-slot="web-app-banner-action-label">{compact}</span>
    </>
  );
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
  const appActionableErrorMessage = !isDemo && storage.status === 'ready' && storage.message !== BROWSER_APP_READY_MESSAGE
    ? storage.message
    : null;
  const exportBackupLabel = translateUiLiteral(language, 'Export backup');
  const exportShortLabel = translateUiLiteral(language, 'Export');
  const importBackupLabel = translateUiLiteral(language, 'Import backup');
  const importShortLabel = translateUiLiteral(language, 'Import');
  const resetLabel = translateUiLiteral(language, isDemo ? 'Reset demo' : 'Reset workspace');
  const resetShortLabel = translateUiLiteral(language, 'Reset');
  const mainPageLabel = translateUiLiteral(language, 'Main page');
  const mainPageCompactLabel = translateUiLiteral(language, 'Main');
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const sidebarCollapsed = useEmbeddedSidebarCollapsed();
  const sidebarBannerTarget = useEmbeddedSidebarBannerTarget(!isOnboarding);
  const isSidebarBanner = Boolean(sidebarBannerTarget && !isOnboarding);
  const compactSidebarBanner = isSidebarBanner && sidebarCollapsed;
  const actionButtonClassName = cn(
    'w-full justify-start md:h-8 md:min-w-0 md:px-2',
    compactSidebarBanner ? 'size-8 justify-center p-2' : null,
    sidebarCollapsed && !isOnboarding ? 'md:size-8 md:justify-center md:p-2' : null,
    isOnboarding ? 'h-9 w-36 justify-center rounded-lg px-3 sm:w-44' : null,
  );
  const banner = (
    <div
      className={cn(
        'border-b border-border/70 bg-background/95 px-4 py-3 text-foreground shadow-[0_10px_30px_rgba(27,15,7,0.06)] md:border-0 md:bg-transparent md:p-0 md:shadow-none',
        isSidebarBanner ? 'border-0 bg-transparent p-0 shadow-none' : null,
        isOnboarding ? 'relative z-10 border-0 bg-transparent px-3 py-3 shadow-none md:px-4 md:py-4' : null,
      )}
    >
      <div
        data-slot="web-app-banner-card"
        className={cn(
          'mx-auto flex max-w-6xl flex-col gap-3 rounded-[1.15rem] border border-primary/20 bg-card/82 px-4 py-3 text-sm leading-6 shadow-none md:max-w-none md:items-stretch md:gap-2 md:rounded-xl md:px-2.5 md:py-2 md:text-xs md:leading-5',
          isSidebarBanner ? 'h-full rounded-xl border-border/70 bg-white/90 px-3 py-3' : null,
          compactSidebarBanner ? 'rounded-none border-0 bg-transparent px-0 py-0' : null,
          sidebarCollapsed && !isOnboarding ? 'md:rounded-none md:border-0 md:bg-transparent md:px-0 md:py-0' : null,
          isOnboarding ? 'flex-row items-center justify-between gap-4 rounded-xl border-border/70 bg-background/95 px-3 py-2 text-sm leading-6 shadow-[0_10px_30px_rgba(48,31,20,0.08)] md:text-sm md:leading-6' : null,
        )}
      >
        <div className={cn(
          'grid gap-2',
          compactSidebarBanner ? 'justify-items-center' : null,
          sidebarCollapsed && !isOnboarding ? 'md:justify-items-center' : null,
          isOnboarding ? 'flex min-w-0 flex-1 items-center gap-3' : null,
        )} data-slot="web-app-banner-copy">
          <span className={cn('grid size-9 shrink-0 place-items-center justify-self-center rounded-[0.85rem] bg-amber-100 text-amber-950 md:size-8 md:rounded-md', isOnboarding ? 'size-9 rounded-lg' : null)}>
            <StatusWarningIcon className="size-4" />
          </span>
          <div
            className={cn('min-w-0 text-left', compactSidebarBanner ? 'sr-only' : null, sidebarCollapsed && !isOnboarding ? 'md:sr-only' : null, isOnboarding ? 'flex-1' : null)}
            data-slot="web-app-banner-text"
          >
            <p className={cn('font-semibold md:leading-4', isOnboarding ? 'whitespace-normal break-words leading-snug' : null)} data-slot="web-app-banner-title">
              {translateUiLiteral(language, isDemo ? 'Demo data - not your real workspace.' : 'Export a backup before closing.')}
            </p>
            {isDemo ? (
              <p className="hidden text-muted-foreground md:block" data-slot="web-app-banner-description">{translateUiLiteral(language, 'Sample workspace. Reset anytime.')}</p>
            ) : (
              <>
                <p className="text-muted-foreground" data-slot="web-app-banner-description">{appWarningMessage}</p>
                {appActionableErrorMessage ? <p className="text-destructive" role="alert">{appActionableErrorMessage}</p> : null}
              </>
            )}
          </div>
        </div>
        <div className={cn(
          'grid grid-cols-1 gap-2 md:gap-1.5',
          compactSidebarBanner ? 'content-start justify-items-center' : null,
          sidebarCollapsed && isSidebarBanner ? 'md:content-start md:justify-items-center' : null,
          isOnboarding ? 'grid-cols-2 justify-items-end justify-self-end' : null,
        )}>
          <Button aria-label={exportBackupLabel} className={actionButtonClassName} size="sm" type="button" variant="outline" onClick={onExport} disabled={storage.status !== 'ready'}>
            <ActionExportIcon className="size-4" />
            <WebAppActionLabel compact={exportShortLabel} compactMode={compactSidebarBanner} full={isSidebarBanner ? exportShortLabel : exportBackupLabel} isOnboarding={isOnboarding} medium={exportShortLabel} sidebarCollapsed={sidebarCollapsed} />
          </Button>
          <Button aria-label={importBackupLabel} className={actionButtonClassName} size="sm" type="button" variant="outline" onClick={() => importInputRef.current?.click()} disabled={storage.status !== 'ready'}>
            <ActionDatabaseUploadIcon className="size-4" />
            <WebAppActionLabel compact={importShortLabel} compactMode={compactSidebarBanner} full={isSidebarBanner ? importShortLabel : importBackupLabel} isOnboarding={isOnboarding} medium={importShortLabel} sidebarCollapsed={sidebarCollapsed} />
          </Button>
          <Button aria-label={resetLabel} className={actionButtonClassName} size="sm" type="button" variant="outline" onClick={onReset}>
            <ActionResetIcon className="size-4" />
            <WebAppActionLabel compact={resetShortLabel} compactMode={compactSidebarBanner} full={isSidebarBanner ? resetShortLabel : resetLabel} isOnboarding={isOnboarding} medium={resetShortLabel} sidebarCollapsed={sidebarCollapsed} />
          </Button>
          <Button asChild className={actionButtonClassName} size="sm" variant="outline">
            <a aria-label={mainPageLabel} href={publicPath('/')}>
              <WebHomeIcon className="size-4" />
              <WebAppActionLabel compact={mainPageCompactLabel} compactMode={compactSidebarBanner} full={mainPageLabel} isOnboarding={isOnboarding} medium={mainPageCompactLabel} sidebarCollapsed={sidebarCollapsed} />
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

  return sidebarBannerTarget && !isOnboarding ? createPortal(banner, sidebarBannerTarget) : banner;
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
  const hiddenPhoneOperator = useHiddenPhoneOperatorState();
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
        const nextState = normalizeBrowserStateForMode(mode, restoredState ?? fallbackState);
        setBrowserDesktopBridgeMockState(nextState);
        await persistCurrentState(handle, databaseName);
        installPersistenceHooks(handle, databaseName, mode);

        setStorage({
          status: 'ready',
          message: mode === 'demo'
            ? 'This demo uses a separate sample workspace.'
            : BROWSER_APP_READY_MESSAGE,
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

  function handleExport() {
    void (async () => {
      if (!storage.handle) {
        return;
      }
      try {
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
      } catch (error) {
        setStorage((current) => storageStateWithActionableError(
          current,
          formatBrowserStorageErrorMessage(error instanceof Error ? error.message : String(error)),
        ));
      }
    })();
  }

  function handleImport(file: File) {
    void (async () => {
      if (!storage.handle) {
        return;
      }
      try {
        const validation = parseBrowserStorageBackupJson(await file.text());
        if (!validation.ok) {
          setStorage((current) => storageStateWithActionableError(current, validation.errors.join(' ')));
          return;
        }
        if (validation.backup.databaseName !== databaseName) {
          setStorage((current) => storageStateWithActionableError(
            current,
            `Backup is for ${validation.backup.databaseName}, not ${databaseName}.`,
          ));
          return;
        }
        const restoredState = readStateRecord(validation.backup.records, databaseName);
        if (!restoredState) {
          setStorage((current) => storageStateWithActionableError(current, 'Backup did not contain a browser workspace state.'));
          return;
        }
        await storage.handle.importBackup(validation.backup);
        setBrowserDesktopBridgeMockState(normalizeBrowserStateForMode(mode, restoredState));
        window.location.reload();
      } catch (error) {
        setStorage((current) => storageStateWithActionableError(
          current,
          formatBrowserStorageErrorMessage(error instanceof Error ? error.message : String(error)),
        ));
      }
    })();
  }

  function handleReset() {
    if (mode === 'app' && !window.confirm('Reset this browser workspace? Export a backup first if you need this data.')) {
      return;
    }
    void (async () => {
      try {
        const nextState = fallbackStateForMode(mode);
        if (storage.handle) {
          await storage.handle.clear();
          setBrowserDesktopBridgeMockState(nextState);
          await persistCurrentState(storage.handle, databaseName);
        } else {
          setBrowserDesktopBridgeMockState(nextState);
        }
        window.location.reload();
      } catch (error) {
        setStorage((current) => storageStateWithActionableError(
          current,
          formatBrowserStorageErrorMessage(error instanceof Error ? error.message : String(error)),
        ));
      }
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
    <EmbeddedAutoZoomViewport
      enablePhoneLandscapeWorkaround={!hiddenPhoneOperator}
      phoneLandscapeOverlay={hiddenPhoneOperator ? undefined : <PhoneViewWarningOverlay />}
    >
      <HashRouter basename={hiddenPhoneOperator ? HIDDEN_PHONE_OPERATOR_BASENAME : undefined}>
        <EmbeddedAppContent
          hiddenPhoneOperator={hiddenPhoneOperator}
          mode={mode}
          storage={storage}
          onExport={handleExport}
          onImport={handleImport}
          onReset={handleReset}
        />
      </HashRouter>
    </EmbeddedAutoZoomViewport>
  );
}

function EmbeddedAppContent({
  hiddenPhoneOperator,
  mode,
  storage,
  onExport,
  onImport,
  onReset,
}: {
  hiddenPhoneOperator: boolean;
  mode: EmbeddedMode;
  storage: StorageUiState;
  onExport: () => void;
  onImport: (file: File) => void;
  onReset: () => void;
}) {
  const isPhonePortrait = useEmbeddedPhonePortraitViewport();

  if (hiddenPhoneOperator && isPhonePortrait) {
    return (
      <EmbeddedPhoneApp
        mode={mode}
        storage={storage}
        onExport={onExport}
        onImport={onImport}
        onReset={onReset}
      />
    );
  }

  return (
    <>
      <EmbeddedAppBanner
        mode={mode}
        storage={storage}
        onExport={onExport}
        onImport={onImport}
        onReset={onReset}
      />
      <App />
    </>
  );
}
