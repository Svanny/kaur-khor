import { useEffect, useRef, useState, type ReactNode } from 'react';
import { HashRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
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
  ActionContinueIcon,
  ActionDatabaseDownloadIcon,
  ActionDatabaseUploadIcon,
  ActionExportIcon,
  ActionOpenExternalIcon,
  ActionResetIcon,
  ActionResumeIcon,
  ActionSaveIcon,
} from '@icons/actions';
import { EntityPackageSearchIcon, EntitySafetyStockIcon } from '@icons/entities';
import { StatusWarningIcon } from '@icons/status';
import overviewImageUrl from '../../../../../docs/readme/overview-fullscreen.png';
import {
  BANJI_BROWSER_APP_DATABASE,
  BANJI_BROWSER_DEMO_DATABASE,
  createBrowserStorageBackup,
  openBrowserStorage,
  parseBrowserStorageBackupJson,
  type BanjiBrowserDatabaseName,
  type BrowserStorageDocumentRecord,
  type BrowserStorageHandle,
  type BrowserStorageSupportedHandle,
} from '@/runtime/web';
import type { DesktopBridge } from '@shared/ipc';

type EmbeddedMode = 'app' | 'demo';
type PersistenceStatus = 'loading' | 'ready' | 'unsupported' | 'error';

type StorageUiState = {
  status: PersistenceStatus;
  message: string;
  databaseName: BanjiBrowserDatabaseName;
  vfs: string;
  sqliteVersion: string;
  persistence: 'granted' | 'not-granted' | 'unknown';
  lastBackupAt: string | null;
  handle: BrowserStorageSupportedHandle | null;
};

const releasesUrl = 'https://github.com/Svanny/banji/releases/latest';
const sourceUrl = 'https://github.com/Svanny/banji';

function publicPath(path: string) {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${basePath}${path}`;
}

function WebNav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/70 bg-background/88 backdrop-blur-xl">
      <nav className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-3 px-4">
        <Link className="inline-flex items-center gap-2 text-sm font-semibold tracking-normal text-foreground" to="/">
          <span aria-hidden="true" className="size-2.5 rounded-full bg-primary ring-4 ring-primary/15" />
          banji
        </Link>
        <div className="flex min-w-0 items-center gap-1">
          <Button asChild size="sm" variant="ghost">
            <a href={publicPath('/demo')}><ActionResumeIcon className="size-4" />Demo</a>
          </Button>
          <Button asChild size="sm" variant="ghost">
            <a href={publicPath('/app')}><ActionSaveIcon className="size-4" />App</a>
          </Button>
          <Button asChild size="sm">
            <Link to="/install"><ActionDatabaseDownloadIcon className="size-4" />Install</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}

function HomeRoute() {
  return (
    <div className="h-svh overflow-y-auto bg-background text-foreground">
      <WebNav />
      <main>
        <section className="relative overflow-hidden border-b border-border/70">
          <div className="absolute inset-0 hero-mesh opacity-80" aria-hidden="true" />
          <div className="absolute inset-0 bg-[image:var(--noise-paper)] bg-[length:10px_10px] opacity-70" aria-hidden="true" />
          <div className="relative mx-auto grid min-h-[calc(100svh-3.5rem)] w-full max-w-6xl items-center gap-10 px-4 py-10 sm:py-14 lg:grid-cols-[0.92fr_1.08fr]">
            <div className="max-w-2xl">
              <p className="inline-flex w-fit items-center gap-2 rounded-full border border-border/70 bg-card/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground shadow-xs">
                <EntitySafetyStockIcon className="size-3.5 text-primary" />
                Local-first inventory workspace
              </p>
              <h1 className="mt-5 text-6xl font-semibold leading-[0.9] tracking-normal text-foreground sm:text-8xl">
                banji
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
                A warm, local-first inventory desk for small teams: try sample shelves in the browser, keep real browser data local when OPFS is available, or install the desktop app for the full offline runtime.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg">
                  <a href={publicPath('/demo')}><ActionResumeIcon className="size-4" />Try Demo</a>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href={publicPath('/app')}><ActionSaveIcon className="size-4" />Use Browser App</a>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link to="/install">
                    <ActionDatabaseDownloadIcon className="size-4" />
                    Download Desktop App
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <a href="#build-from-source">
                    Build From Source
                    <ActionContinueIcon className="size-4" />
                  </a>
                </Button>
              </div>
              <div className="mt-8 max-w-xl rounded-2xl border border-primary/20 bg-card/80 p-4 text-sm leading-6 text-muted-foreground shadow-panel">
                <p className="flex gap-2 font-medium text-foreground">
                  <StatusWarningIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                  Browser data lives in this browser.
                </p>
                <p className="mt-1 pl-6">
                  Stored locally with SQLite WASM + OPFS when available. Export backups regularly; clearing browser data may delete your banji browser workspace.
                </p>
              </div>
            </div>
            <WorkshopIllustration />
          </div>
        </section>
        <section className="mx-auto grid w-full max-w-6xl gap-4 px-4 py-12 md:grid-cols-3">
          <Feature
            icon={<ActionResumeIcon className="size-5" />}
            title="Demo shelves"
            text="Seeded data stays separate from the browser app workspace and can be reset any time."
          />
          <Feature
            icon={<ActionSaveIcon className="size-5" />}
            title="Browser-local desk"
            text="Real browser mode only opens when durable SQLite WASM + OPFS storage is available."
          />
          <Feature
            icon={<EntitySafetyStockIcon className="size-5" />}
            title="Honest desktop install"
            text="Unsigned downloads can show OS warnings. Use official releases and do not disable security globally."
          />
        </section>
        <section id="build-from-source" className="mx-auto w-full max-w-6xl border-t border-border/70 px-4 py-14">
          <div className="grid gap-6 rounded-[1.35rem] border border-border/70 bg-card/70 p-6 shadow-panel md:grid-cols-[1fr_0.78fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Advanced users</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-normal">Build From Source</h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
                Inspect the source and run <code className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">scripts/build-mac-from-source.sh</code> on macOS. Building locally avoids downloading a prebuilt app, but it does not magically make software safe.
              </p>
            </div>
            <div className="rounded-[1rem] border border-border/70 bg-foreground p-4 font-mono text-xs leading-6 text-background shadow-sm">
              <p>$ git clone https://github.com/Svanny/banji.git</p>
              <p>$ cd banji</p>
              <p>$ scripts/build-mac-from-source.sh</p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

function WorkshopIllustration() {
  return (
    <div className="relative min-h-[28rem] overflow-hidden rounded-[1.45rem] border border-border/70 bg-card/72 p-4 shadow-panel">
      <div className="absolute inset-0 paper-grid opacity-45" aria-hidden="true" />
      <div className="absolute left-8 top-7 flex gap-2" aria-hidden="true">
        <span className="h-3 w-10 rounded-full bg-primary/70" />
        <span className="h-3 w-6 rounded-full bg-accent" />
        <span className="h-3 w-14 rounded-full bg-secondary" />
      </div>
      <div className="absolute right-7 top-7 rounded-full border border-border/70 bg-background/80 px-3 py-1 text-xs font-medium text-muted-foreground shadow-xs">
        OPFS ready
      </div>
      <div className="relative mt-12 grid gap-4 lg:grid-cols-[0.58fr_1fr]">
        <div className="space-y-3">
          <div className="rounded-[1.1rem] border border-border/70 bg-background/86 p-4 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">today shelf</span>
              <span aria-hidden="true" className="size-2 rounded-full bg-accent" />
            </div>
            {['Supplier queue', 'Low-stock scarf', 'Receipt landed'].map((label, index) => (
              <div key={label} className="mt-3 flex items-center gap-3 rounded-xl bg-muted/45 px-3 py-2">
                <span aria-hidden="true" className={`size-3 rounded-full ${index === 1 ? 'bg-primary' : 'bg-accent'}`} />
                <span className="text-sm font-medium text-foreground">{label}</span>
              </div>
            ))}
          </div>
          <div className="rounded-[1.1rem] border border-border/70 bg-accent/30 p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid size-12 place-items-center rounded-2xl bg-background text-primary shadow-xs">
                <EntityPackageSearchIcon className="size-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">little inventory marker</p>
                <p className="text-xs leading-5 text-muted-foreground">tags, counts, and gentle nudges</p>
              </div>
            </div>
          </div>
        </div>
        <div className="relative rounded-[1.2rem] border border-border/70 bg-background p-2 shadow-float">
          <img
            alt="banji overview workspace showing inventory queue, local tasks, and status"
            className="aspect-[16/11] h-full w-full rounded-[0.9rem] object-cover object-left-top"
            src={overviewImageUrl}
          />
          <div className="absolute -bottom-4 left-6 right-6 rounded-[1rem] border border-border/70 bg-card/95 p-3 shadow-panel backdrop-blur">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">local workspace</p>
                <p className="text-sm font-semibold text-foreground">browser preview, desktop depth</p>
              </div>
              <span aria-hidden="true" className="h-9 w-14 rounded-full bg-primary/85" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, title, text }: { icon: ReactNode; title: string; text: string }) {
  return (
    <section className="rounded-[1.15rem] border border-border/70 bg-card/70 p-5 shadow-panel">
      <div className="mb-4 grid size-10 place-items-center rounded-[0.9rem] bg-accent/45 text-foreground">
        {icon}
      </div>
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{text}</p>
    </section>
  );
}

function InstallRoute() {
  return (
    <div className="h-svh overflow-y-auto bg-background text-foreground">
      <WebNav />
      <main className="mx-auto w-full max-w-5xl px-4 py-12">
        <section className="rounded-[1.45rem] border border-border/70 bg-card/72 p-6 shadow-panel sm:p-8">
          <p className="inline-flex w-fit items-center gap-2 rounded-full border border-border/70 bg-background/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <ActionDatabaseDownloadIcon className="size-3.5 text-primary" />
            Install
          </p>
          <div className="mt-5 grid gap-8 lg:grid-cols-[1fr_0.72fr] lg:items-end">
            <div>
              <h1 className="max-w-2xl text-4xl font-semibold tracking-normal sm:text-6xl">Install banji from official releases.</h1>
              <p className="mt-5 max-w-2xl text-base leading-7 text-muted-foreground">
                Download desktop artifacts only from GitHub Releases, verify SHA256 checksums, and use normal OS trust prompts. Warnings are real security signals, not bugs.
              </p>
            </div>
            <div className="flex flex-wrap gap-3 lg:justify-end">
              <Button asChild size="lg">
                <a href={releasesUrl} rel="noreferrer" target="_blank">
                  <ActionDatabaseDownloadIcon className="size-4" />
                  Latest release
                </a>
              </Button>
              <Button asChild size="lg" variant="outline">
                <a href={sourceUrl} rel="noreferrer" target="_blank">
                  <ActionOpenExternalIcon className="size-4" />
                  Source
                </a>
              </Button>
            </div>
          </div>
        </section>
        <div className="mt-8 grid gap-4">
          <InstallSection icon={<EntityPackageSearchIcon className="size-5" />} title="macOS DMG">
            <StepList
              steps={[
                'Download only from the official GitHub release.',
                'Open the DMG and drag banji to Applications if prompted.',
                'Control-click banji, choose Open, then confirm Open.',
                'If blocked, use System Settings -> Privacy & Security -> Open Anyway.',
              ]}
            />
          </InstallSection>
          <InstallSection icon={<ActionDatabaseDownloadIcon className="size-5" />} title="Windows EXE">
            <StepList
              steps={[
                'Download only from the official GitHub release.',
                'Verify the checksum when SHA256SUMS is available.',
                'Run the installer. If SmartScreen appears, choose More info -> Run anyway.',
                'Do not disable SmartScreen globally.',
              ]}
            />
          </InstallSection>
          <InstallSection icon={<ActionOpenExternalIcon className="size-5" />} title="Linux packages">
            <p className="text-sm leading-6 text-muted-foreground">
              AppImage and deb artifacts are provided when the release includes them. Mark AppImages executable, or install local deb files with your package manager.
            </p>
          </InstallSection>
          <InstallSection icon={<EntitySafetyStockIcon className="size-5" />} title="Checksums and honest warnings">
            <p className="text-sm leading-6 text-muted-foreground">
              Verify release files against the <code className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">SHA256SUMS</code> asset on the same release. The repository is source-visible, but <code className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">package.json</code> currently declares <code className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">UNLICENSED</code>. Do not run copies from mirrors or reposts.
            </p>
          </InstallSection>
        </div>
      </main>
    </div>
  );
}

function InstallSection({
  children,
  icon,
  title,
}: {
  children: ReactNode;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className="grid gap-4 rounded-[1.15rem] border border-border/70 bg-card/68 p-5 shadow-panel sm:grid-cols-[2.5rem_1fr]">
      <div className="grid size-10 place-items-center rounded-[0.9rem] bg-accent/45 text-foreground">{icon}</div>
      <div>
        <h2 className="text-xl font-semibold">{title}</h2>
        <div className="mt-2">{children}</div>
      </div>
    </section>
  );
}

function StepList({ steps }: { steps: string[] }) {
  return (
    <ol className="space-y-2 text-sm leading-6 text-muted-foreground">
      {steps.map((step) => (
        <li key={step} className="flex gap-3">
          <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
          <span>{step}</span>
        </li>
      ))}
    </ol>
  );
}

function databaseForMode(mode: EmbeddedMode): BanjiBrowserDatabaseName {
  return mode === 'demo' ? BANJI_BROWSER_DEMO_DATABASE : BANJI_BROWSER_APP_DATABASE;
}

function fallbackStateForMode(mode: EmbeddedMode): BrowserMockState {
  const state = mode === 'demo' ? createMockState() : createEmptyBrowserMockState();
  state.appContext = {
    ...state.appContext,
    platform: mode === 'demo' ? 'web-demo' : 'web',
  };
  state.localDataInfo = {
    ...state.localDataInfo,
    dataDirectoryPath: 'OPFS / banji browser workspace',
    workspaceStorePath: databaseForMode(mode),
    preferencesPath: 'SQLite preferences table',
    backupDirectoryPath: 'downloaded backups',
    assetDirectoryPath: 'Browser image storage unavailable in this release',
  };
  if (mode === 'demo') {
    state.preferences = {
      ...state.preferences,
      onboardingCompletedAt: state.preferences.onboardingCompletedAt ?? new Date().toISOString(),
    };
  }
  return state;
}

function stateRecord(
  databaseName: BanjiBrowserDatabaseName,
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

function readStateRecord(records: BrowserStorageDocumentRecord[], databaseName: BanjiBrowserDatabaseName): BrowserMockState | null {
  const record = records.find((entry) => entry.collection === 'browser_state' && entry.id === databaseName);
  if (!record || typeof record.json !== 'object' || record.json === null) {
    return null;
  }
  return record.json as BrowserMockState;
}

async function persistCurrentState(handle: BrowserStorageSupportedHandle, databaseName: BanjiBrowserDatabaseName) {
  await handle.putDocuments([stateRecord(databaseName, getBrowserDesktopBridgeMockState())]);
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
    return result;
  }) as T[K];
}

function installPersistenceHooks(
  handle: BrowserStorageSupportedHandle,
  databaseName: BanjiBrowserDatabaseName,
  mode: EmbeddedMode,
) {
  const bridge = window.banjiDesktop as DesktopBridge & { __banjiWebPersistenceWrapped?: boolean };
  if (bridge.__banjiWebPersistenceWrapped) {
    return;
  }
  bridge.__banjiWebPersistenceWrapped = true;
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

  bridge.system.clearCurrentData = async () => {
    setBrowserDesktopBridgeMockState(fallbackStateForMode(mode));
    await persist();
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

function WebAppBanner({
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
  const isDemo = mode === 'demo';
  const importInputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="border-b border-border/70 bg-background/95 px-4 py-3 text-foreground shadow-[0_10px_30px_rgba(27,15,7,0.06)]">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 rounded-[1.15rem] border border-primary/20 bg-card/82 px-4 py-3 text-sm leading-6 shadow-panel lg:flex-row lg:items-center lg:justify-between">
        <div className="flex gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-[0.85rem] bg-accent/45 text-foreground">
            <StatusWarningIcon className="size-4" />
          </span>
          <div>
            <p className="font-semibold">
              {isDemo ? 'Demo data - not your real workspace.' : 'Your banji browser data lives in this browser profile. Export backups regularly.'}
            </p>
            <p>
              {storage.message} OPFS: {storage.status === 'ready' ? 'available' : storage.status}. Persistence: {storage.persistence.replace('-', ' ')}.
              {storage.lastBackupAt ? ` Last backup: ${new Date(storage.lastBackupAt).toLocaleString()}.` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" type="button" variant="outline" onClick={onExport} disabled={storage.status !== 'ready'}>
            <ActionExportIcon className="size-4" />
            Export backup
          </Button>
          <Button size="sm" type="button" variant="outline" onClick={() => importInputRef.current?.click()} disabled={storage.status !== 'ready'}>
            <ActionDatabaseUploadIcon className="size-4" />
            Import backup
          </Button>
          <Button size="sm" type="button" variant="outline" onClick={onReset}>
            <ActionResetIcon className="size-4" />
            {isDemo ? 'Reset demo' : 'Reset workspace'}
          </Button>
          <Button asChild size="sm" variant="outline">
            <a href={publicPath(isDemo ? '/app' : '/install')}>
              {isDemo ? <ActionSaveIcon className="size-4" /> : <ActionDatabaseDownloadIcon className="size-4" />}
              {isDemo ? 'Use browser app' : 'Download desktop app'}
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
            ? 'Demo is isolated in banji_browser_demo_v1.sqlite3.'
            : 'Browser app data is stored locally in this browser using SQLite WASM + OPFS.',
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
          message: error instanceof Error ? error.message : String(error),
        }));
        if (mode === 'demo') {
          setIsReady(true);
        }
      });

    return () => {
      mounted = false;
    };
  }, [databaseName, mode]);

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
      downloadJson(`banji-${mode}-backup-${new Date().toISOString().slice(0, 10)}.banji-backup.json`, backup);
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
            <h1 className="mt-4 text-4xl font-semibold tracking-normal">banji cannot store real browser-app data here.</h1>
            <p className="mt-4 text-base leading-7 text-muted-foreground">
              {storage.message} Use demo mode, download the desktop app, or build from source. banji does not silently fall back to weak storage for real browser data.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Button asChild>
                <a href={publicPath('/demo')}><ActionResumeIcon className="size-4" />Try demo</a>
              </Button>
              <Button asChild variant="outline">
                <a href={publicPath('/install')}><ActionDatabaseDownloadIcon className="size-4" />Download desktop app</a>
              </Button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <div className="flex min-h-svh items-center justify-center bg-background px-6 text-foreground">
        <div className="w-full max-w-md text-center">
          <p className="text-sm font-semibold text-primary">banji</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-normal">Preparing browser workspace...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-svh bg-background">
      <WebAppBanner
        mode={mode}
        storage={storage}
        onExport={handleExport}
        onImport={handleImport}
        onReset={handleReset}
      />
      <HashRouter>
        <App />
      </HashRouter>
    </div>
  );
}

export function WebRoutes() {
  return (
    <Routes>
      <Route element={<HomeRoute />} path="/" />
      <Route element={<InstallRoute />} path="/install" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}
