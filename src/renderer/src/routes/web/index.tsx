import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from 'react';
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
import brandLogo from '@/assets/banji-logo.svg';
import {
  Archive,
  BadgeDollarSign,
  Bot,
  Check,
  ClipboardCopy,
  ClipboardList,
  Download,
  FileSearch,
  Globe2,
  HardDrive,
  Package,
  PackageCheck,
  PackagePlus,
  ReceiptText,
  RotateCcw,
  ScanLine,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Store,
  Terminal,
  TrendingUp,
  Users,
  WifiOff,
  X,
  type LucideIcon,
} from 'lucide-react';
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
import {
  EntityPackageSearchIcon,
  EntitySafetyStockIcon,
} from '@icons/entities';
import { NavigationSidebarIcon } from '@icons/navigation';
import { StatusWarningIcon } from '@icons/status';
import analysisImageUrl from '../../../../../docs/readme/web-current-analysis.png';
import catalogImageUrl from '../../../../../docs/readme/web-current-catalog.png';
import overviewImageUrl from '../../../../../docs/readme/web-current-overview.png';
import performanceImageUrl from '../../../../../docs/readme/web-current-performance.png';
import recordUpdateImageUrl from '../../../../../docs/readme/web-current-record-update.png';
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
const sourceBuildCommands = [
  'git clone https://github.com/Svanny/banji.git',
  'cd banji',
  'scripts/build-mac-from-source.sh',
] as const;
const screenshotSlides = [
  {
    alt: 'banji mission control overview showing the main work queue',
    image: overviewImageUrl,
    label: 'Mission Control',
  },
  {
    alt: 'banji catalog showing searchable SKUs and services',
    image: catalogImageUrl,
    label: 'Catalog',
  },
  {
    alt: 'banji record update workflow for stock and order changes',
    image: recordUpdateImageUrl,
    label: 'Point-of-Sale and updates',
  },
  {
    alt: 'banji business health dashboard showing pressure and diagnostics',
    image: performanceImageUrl,
    label: 'Business health',
  },
  {
    alt: 'banji analysis workspace showing inventory insight tools',
    image: analysisImageUrl,
    label: 'Insights',
  },
];
type RailFeature = {
  icon: LucideIcon;
  label: string;
  tone: string;
};

const railFeatures: RailFeature[] = [
  { icon: ClipboardList, label: 'Review Work Queue', tone: 'bg-[#DC2626] text-white' },
  { icon: ShoppingBag, label: 'Run Point-of-Sale', tone: 'bg-[#16A34A] text-white' },
  { icon: ScanLine, label: 'Count Stock', tone: 'bg-[#D97706] text-white' },
  { icon: Users, label: 'Track Customer Orders', tone: 'bg-[#2563EB] text-white' },
  { icon: BadgeDollarSign, label: 'Record Immediate Sales', tone: 'bg-[#7C3AED] text-white' },
  { icon: PackagePlus, label: 'Place Supplier Orders', tone: 'bg-[#0891B2] text-white' },
  { icon: ReceiptText, label: 'Receive Supplier Orders', tone: 'bg-[#0D9488] text-white' },
  { icon: Search, label: 'Search Catalog', tone: 'bg-[#65A30D] text-white' },
  { icon: Package, label: 'Manage Products', tone: 'bg-[#EA580C] text-white' },
  { icon: Store, label: 'Manage Services', tone: 'bg-[#4338CA] text-white' },
  { icon: Archive, label: 'Browse Archived Items', tone: 'bg-[#059669] text-white' },
  { icon: TrendingUp, label: 'Analyze Pressure', tone: 'bg-[#334155] text-white' },
  { icon: BadgeDollarSign, label: 'Review Money', tone: 'bg-[#0284C7] text-white' },
  { icon: FileSearch, label: 'Explain Inventory Signals', tone: 'bg-[#C026D3] text-white' },
  { icon: Bot, label: 'Review Telegram Intake', tone: 'bg-[#229ED9] text-white' },
];

function publicPath(path: string) {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${basePath}${path}`;
}

function scrollToSection(sectionId: string) {
  const target = document.getElementById(sectionId);
  if (!target) {
    return;
  }
  target.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function onSectionAnchorClick(sectionId: string) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    window.history.replaceState(null, '', `#${sectionId}`);
    scrollToSection(sectionId);
  };
}

async function writeClipboardText(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    if (document.execCommand('copy')) {
      return true;
    }
  } catch {
    // Fall through to the async Clipboard API when selection copying is unavailable.
  } finally {
    document.body.removeChild(textarea);
  }
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

function selectElementText(element: HTMLElement | null) {
  if (!element) {
    return false;
  }
  const selection = window.getSelection();
  if (!selection) {
    return false;
  }
  const range = document.createRange();
  range.selectNodeContents(element);
  selection.removeAllRanges();
  selection.addRange(range);
  return true;
}

function WebNav() {
  return (
    <header className="sticky left-0 right-0 top-0 z-50 w-screen max-w-full overflow-hidden border-b border-border/70 bg-card/92 shadow-panel backdrop-blur-xl">
      <nav className="flex h-16 w-full max-w-full items-center justify-between gap-3 px-4 sm:h-[4.5rem] sm:px-8">
        <Link className="inline-flex items-center gap-2 text-3xl font-semibold tracking-normal text-foreground sm:text-4xl" to="/">
          <img alt="" aria-hidden="true" className="size-7" src={brandLogo} />
          banji
        </Link>
        <div className="hidden min-w-0 items-center gap-3 sm:flex">
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
        <details className="group relative sm:hidden">
          <summary className="grid size-12 list-none place-items-center rounded-[0.9rem] border border-border/70 bg-background text-foreground shadow-xs [&::-webkit-details-marker]:hidden">
            <NavigationSidebarIcon className="size-5" />
            <span className="sr-only">Open navigation</span>
          </summary>
          <div className="absolute right-0 top-14 z-50 grid w-56 gap-2 rounded-[1rem] border border-border/70 bg-card p-2 shadow-panel">
            <Button asChild className="justify-start" variant="ghost">
              <a href={publicPath('/demo')}><ActionResumeIcon className="size-4" />Demo</a>
            </Button>
            <Button asChild className="justify-start" variant="ghost">
              <a href={publicPath('/app')}><ActionSaveIcon className="size-4" />App</a>
            </Button>
            <Button asChild className="justify-start">
              <Link to="/install"><ActionDatabaseDownloadIcon className="size-4" />Install</Link>
            </Button>
          </div>
        </details>
      </nav>
    </header>
  );
}

function HomeRoute() {
  return (
    <div className="h-svh overflow-x-hidden overflow-y-auto bg-background text-foreground">
      <main>
        <section className="relative overflow-hidden border-b border-border/70">
          <div className="absolute inset-0 hero-mesh opacity-80" aria-hidden="true" />
          <div className="absolute inset-0 bg-[image:var(--noise-paper)] bg-[length:10px_10px] opacity-70" aria-hidden="true" />
          <div className="relative grid min-h-[78svh] w-screen max-w-full items-center gap-10 px-4 py-6 sm:px-8 sm:py-8 lg:grid-cols-[0.92fr_1.08fr] xl:px-12">
            <div className="max-w-2xl text-center sm:text-left">
              <div className="flex items-center justify-center gap-3 sm:justify-start sm:gap-4">
                <img alt="" aria-hidden="true" className="h-14 w-auto sm:h-16" src={brandLogo} />
                <h1 className="text-7xl font-semibold leading-[0.9] tracking-normal text-foreground sm:text-8xl">
                  banji
                </h1>
              </div>
              <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
                A warm, local-first inventory desk for small teams: try sample shelves in the browser, keep real browser data local when OPFS is available, or install the desktop app for the full offline runtime.
              </p>
              <Button asChild className="mt-8 h-14 w-full justify-center text-base sm:w-auto sm:min-w-56" size="lg">
                <a href="#ways-to-start" onClick={onSectionAnchorClick('ways-to-start')}>Get started <ActionContinueIcon className="size-4" /></a>
              </Button>
            </div>
            <WorkshopIllustration />
          </div>
          <TeamsCanDoRail />
        </section>
        <section id="ways-to-start" className="grid w-screen max-w-full gap-4 overflow-hidden px-4 py-12 sm:px-6 md:grid-cols-4 md:px-8 xl:px-12">
          <ProductCard
            action="Start Quick Demo"
            href={publicPath('/demo')}
            icon={<ActionResumeIcon className="size-5" />}
            price="Free"
            tone="bg-[#D6E9F8] text-[#1F5F86]"
            title="Demo"
            benefits={[
              { icon: <PackageCheck className="size-4" />, label: 'Sample shelves included' },
              { icon: <WifiOff className="size-4" />, label: 'No install or account' },
              { icon: <RotateCcw className="size-4" />, label: 'Reset whenever you want' },
            ]}
          />
          <ProductCard
            action="Start in the browser"
            href={publicPath('/app')}
            icon={<ActionSaveIcon className="size-5" />}
            price="No install"
            tone="bg-[#DDE8B5] text-[#42511F]"
            title="Browser App"
            benefits={[
              { icon: <Globe2 className="size-4" />, label: 'Real workspace in this profile' },
              { icon: <HardDrive className="size-4" />, label: 'SQLite WASM + OPFS when available' },
              { icon: <Download className="size-4" />, label: 'Export backups regularly' },
            ]}
          />
          <ProductCard
            action="Install the desktop app"
            href="/install"
            icon={<EntitySafetyStockIcon className="size-5" />}
            price="Full power"
            tone="bg-[#E8DDF2] text-[#554178]"
            title="Desktop App"
            benefits={[
              { icon: <ShieldCheck className="size-4" />, label: 'Full offline runtime' },
              { icon: <HardDrive className="size-4" />, label: 'Local files and snapshots' },
              { icon: <Sparkles className="size-4" />, label: 'Desktop automation support' },
            ]}
          />
          <ProductCard
            action="Build it yourself"
            href="#build-from-source"
            icon={<ActionDatabaseDownloadIcon className="size-5" />}
            price="Advanced"
            tone="bg-[#F6D9BE] text-[#70420D]"
            title="Source Build"
            benefits={[
              { icon: <Terminal className="size-4" />, label: 'Inspect the source-visible code' },
              { icon: <PackageCheck className="size-4" />, label: 'Build locally on macOS' },
              { icon: <StatusWarningIcon className="size-4" />, label: 'Unsigned output with OS warnings' },
            ]}
          />
        </section>
        <section id="build-from-source" className="w-screen max-w-full border-t border-border/70 px-4 py-14 sm:px-8 xl:px-12">
          <div className="grid gap-6 rounded-[1.35rem] border border-border/70 bg-card/70 p-6 shadow-panel md:grid-cols-[1fr_0.78fr]">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Advanced users</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-normal">Build From Source</h2>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
                Inspect the source and run <code className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">scripts/build-mac-from-source.sh</code> on macOS. Building locally avoids downloading a prebuilt app, but it does not magically make software safe.
              </p>
            </div>
            <SourceBuildSnippet />
          </div>
        </section>
      </main>
    </div>
  );
}

function WorkshopIllustration() {
  const [activeSlide, setActiveSlide] = useState(0);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % screenshotSlides.length);
    }, 4500);
    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <div className="relative overflow-hidden rounded-[1.45rem] border border-border/70 bg-card p-4 shadow-panel">
      <div className="absolute inset-0 paper-grid opacity-45" aria-hidden="true" />
      <div className="relative grid gap-3">
        <div className="relative overflow-hidden rounded-[1.05rem] shadow-float ring-1 ring-border/50">
          <img alt="" aria-hidden="true" className="block w-full opacity-0" src={screenshotSlides[0]!.image} />
          {screenshotSlides.map((item, index) => (
            <img
              key={item.label}
              alt={index === activeSlide ? item.alt : ''}
              aria-hidden={index === activeSlide ? undefined : 'true'}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ease-out ${index === activeSlide ? 'opacity-100' : 'opacity-0'}`}
              src={item.image}
            />
          ))}
        </div>
        <div className="mx-auto flex w-fit gap-1.5 rounded-full border border-border/70 bg-card/95 px-3 py-2 shadow-panel backdrop-blur" aria-label="Screenshot carousel">
          {screenshotSlides.map((item, index) => (
            <button
              key={item.label}
              aria-label={`Show ${item.label}`}
              className={`size-2.5 rounded-full transition-colors ${index === activeSlide ? 'bg-primary' : 'bg-muted-foreground/25'}`}
              type="button"
              onClick={() => setActiveSlide(index)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TeamsCanDoRail() {
  const railGroups = [railFeatures, railFeatures];

  return (
    <div className="relative -mt-4 w-screen max-w-full pb-10">
      <div className="overflow-hidden border-y border-border/70 bg-card/84 px-4 py-3 backdrop-blur sm:px-8 xl:px-12">
        <div className="flex w-max items-center motion-safe:animate-[banji-teams-rail_68s_linear_infinite] motion-reduce:w-full motion-reduce:flex-wrap">
          {railGroups.map((group, groupIndex) => (
            <div
              key={groupIndex}
              aria-label={groupIndex === 0 ? 'Operator-facing banji features' : undefined}
              className="flex shrink-0 gap-3 pr-3 motion-reduce:flex-wrap"
              role="list"
              aria-hidden={groupIndex > 0 ? 'true' : undefined}
            >
              {group.map(({ icon: Icon, label, tone }) => (
                <div key={`${label}-${groupIndex}`} className="flex min-w-[14.5rem] items-center gap-3 rounded-xl bg-background/78 px-4 py-3 shadow-xs ring-1 ring-border/55 sm:min-w-[15.5rem]" role="listitem">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}>
                    <Icon aria-hidden="true" className="size-4.5" />
                  </span>
                  <span className="min-w-0 text-sm font-semibold leading-5 text-foreground">{label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-12 bg-linear-to-r from-background to-transparent" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-12 bg-linear-to-l from-background to-transparent" aria-hidden="true" />
    </div>
  );
}

function ProductCard({
  action,
  benefits,
  href,
  icon,
  price,
  title,
  tone,
}: {
  action: string;
  benefits: Array<{ icon: ReactNode; label: string }>;
  href: string;
  icon: ReactNode;
  price: string;
  title: string;
  tone: string;
}) {
  const content = (
    <>
      <div className={`mx-auto grid size-16 place-items-center rounded-[1.25rem] shadow-xs ${tone}`}>
        {icon}
      </div>
      <p className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">{price}</p>
      <h2 className="mt-2 text-xl font-semibold">{title}</h2>
      <span className="mt-4 inline-flex w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-border/70 bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-xs">
        <span className="min-w-0 text-balance">{action}</span>
        <ActionContinueIcon className="size-4 shrink-0" />
      </span>
      <ul className="mt-6 grid w-full rounded-xl bg-muted/35 p-2 text-sm leading-5 text-muted-foreground">
        {benefits.map((benefit) => (
          <li key={benefit.label} className="flex min-w-0 items-center gap-4 px-3 py-2.5">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-background text-primary shadow-xs">
              {benefit.icon}
            </span>
            <span className="min-w-0 text-left font-medium">{benefit.label}</span>
          </li>
        ))}
      </ul>
    </>
  );

  const className = 'flex min-h-80 min-w-0 flex-col items-center justify-center rounded-[1.15rem] border border-border/70 bg-card p-5 text-center shadow-panel transition-transform hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none xl:p-6';

  if (href === '/install') {
    return (
      <Link className={className} to={href}>
        {content}
      </Link>
    );
  }

  if (href.startsWith('#')) {
    const sectionId = href.slice(1);
    return (
      <a className={className} href={href} onClick={onSectionAnchorClick(sectionId)}>
        {content}
      </a>
    );
  }

  return (
    <a className={className} href={href}>
      {content}
    </a>
  );
}

function SourceBuildSnippet() {
  const codeRef = useRef<HTMLElement | null>(null);
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'failed'>('idle');

  async function copyCommands() {
    if (await writeClipboardText(sourceBuildCommands.join('\n'))) {
      setCopyStatus('copied');
    } else {
      selectElementText(codeRef.current);
      setCopyStatus('failed');
    }
    window.setTimeout(() => setCopyStatus('idle'), 2200);
  }

  const copyLabel = copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy';
  const copyIcon = copyStatus === 'copied'
    ? <Check className="size-3.5" data-icon />
    : copyStatus === 'failed'
      ? <X className="size-3.5" data-icon />
      : <ClipboardCopy className="size-3.5" data-icon />;

  return (
    <div className="relative rounded-[1rem] border border-border/70 bg-foreground p-4 font-mono text-xs leading-6 text-background shadow-sm">
      <button
        className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-lg border border-background/15 bg-background/10 px-2.5 py-1 text-[0.68rem] font-semibold text-background/90 shadow-xs transition-colors hover:bg-background/16 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/40"
        type="button"
        onClick={copyCommands}
      >
        {copyIcon}
        {copyLabel}
      </button>
      <pre className="overflow-x-auto pb-8 whitespace-pre-wrap"><code ref={codeRef}>{sourceBuildCommands.join('\n')}</code></pre>
    </div>
  );
}

function InstallRoute() {
  return (
    <div className="h-svh overflow-x-hidden overflow-y-auto bg-background text-foreground">
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
            <div className="space-y-4">
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
              <InstallHeroSketch />
            </div>
          </div>
        </section>
        <div className="mt-8 grid gap-4 lg:grid-cols-3">
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
          <InstallSection className="lg:col-span-2" icon={<EntitySafetyStockIcon className="size-5" />} title="Checksums and honest warnings">
            <p className="text-sm leading-6 text-muted-foreground">
              Verify release files against the <code className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">SHA256SUMS</code> asset on the same release. The repository is source-visible, but <code className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">package.json</code> currently declares <code className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">UNLICENSED</code>. Do not run copies from mirrors or reposts.
            </p>
          </InstallSection>
          <InstallSection icon={<ActionSaveIcon className="size-5" />} title="Browser app limits">
            <p className="text-sm leading-6 text-muted-foreground">
              The browser app stores data in the current browser profile when OPFS is available. Telegram automation polls only while the tab is open, visible, and awake; the token is stored in that browser profile; benchmark diagnostics, native logs, snapshots, folder reveal, and persistent image assets require the desktop app.
            </p>
          </InstallSection>
        </div>
      </main>
    </div>
  );
}

function InstallHeroSketch() {
  return (
    <div className="relative ml-auto hidden min-h-44 w-full max-w-sm overflow-hidden rounded-[1.25rem] border border-border/70 bg-background/72 p-5 shadow-sm lg:block">
      <div className="absolute inset-0 paper-grid opacity-35" aria-hidden="true" />
      <div className="relative mx-auto mt-4 h-24 w-44 rounded-b-[1.2rem] border border-primary/30 bg-primary/18">
        <div className="absolute -top-7 left-3 h-8 w-20 origin-bottom -rotate-12 rounded-t-xl border border-primary/25 bg-secondary" />
        <div className="absolute -top-7 right-3 h-8 w-20 origin-bottom rotate-12 rounded-t-xl border border-primary/25 bg-secondary" />
        <div className="absolute -top-12 left-1/2 h-16 w-2 -translate-x-1/2 rounded-full bg-accent" />
        <div className="absolute -top-11 left-[44%] h-12 w-7 -rotate-[35deg] rounded-full bg-accent/70" />
        <div className="absolute -top-10 right-[40%] h-12 w-7 rotate-[35deg] rounded-full bg-accent/70" />
        <p className="absolute inset-x-0 bottom-4 text-center text-2xl font-semibold text-foreground">banji</p>
      </div>
    </div>
  );
}

function InstallSection({
  children,
  className = '',
  icon,
  title,
}: {
  children: ReactNode;
  className?: string;
  icon: ReactNode;
  title: string;
}) {
  return (
    <section className={`grid gap-4 rounded-[1.15rem] border border-border/70 bg-card/68 p-5 shadow-panel sm:grid-cols-[2.5rem_1fr] ${className}`}>
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
  wrapMutation(bridge.automation, 'testTelegramConnection', persist);

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

function shouldPollBrowserTelegram(mode: EmbeddedMode) {
  if (mode !== 'app' || document.visibilityState !== 'visible') {
    return false;
  }
  const connection = getBrowserDesktopBridgeMockState().automation.connection;
  return connection.status === 'connected' && connection.hasBotToken;
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

function storageStatusLabel(status: PersistenceStatus) {
  if (status === 'ready') {
    return 'ready';
  }
  if (status === 'loading') {
    return 'starting';
  }
  return 'not available';
}

function persistenceStatusLabel(status: StorageUiState['persistence']) {
  if (status === 'granted') {
    return 'on';
  }
  if (status === 'not-granted') {
    return 'off';
  }
  return 'not checked';
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
  const displayMessage = storage.status === 'error'
    ? (isDemo ? 'Demo is running with temporary sample data because durable browser storage could not start.' : 'Browser storage could not start.')
    : storage.message;
  return (
    <div className="border-b border-border/70 bg-background/95 px-4 py-3 text-foreground shadow-[0_10px_30px_rgba(27,15,7,0.06)] md:fixed md:bottom-[6.2rem] md:left-2 md:z-40 md:w-[calc(12.8rem-1rem)] md:border-0 md:bg-transparent md:p-0 md:shadow-none">
      <div className="mx-auto flex max-w-6xl flex-col gap-3 rounded-[1.15rem] border border-primary/20 bg-card/82 px-4 py-3 text-sm leading-6 shadow-panel md:max-w-none md:items-stretch md:gap-2 md:rounded-xl md:px-2.5 md:py-2 md:text-xs md:leading-5">
        <div className="flex gap-3 md:gap-2">
          <span className="grid size-9 shrink-0 place-items-center rounded-[0.85rem] bg-accent/45 text-foreground md:size-7 md:rounded-lg">
            <StatusWarningIcon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className="font-semibold md:leading-4">
              {isDemo ? 'Demo data - not your real workspace.' : 'banji saves your work in this browser. Back it up regularly.'}
            </p>
            <p className="md:hidden">
              {displayMessage} Storage: {storageStatusLabel(storage.status)}. Extra browser protection: {persistenceStatusLabel(storage.persistence)}.
              {storage.lastBackupAt ? ` Last backup: ${new Date(storage.lastBackupAt).toLocaleString()}.` : ''}
            </p>
            <p className="hidden text-muted-foreground md:block">
              {isDemo ? 'Sample workspace. Reset anytime.' : 'Local browser workspace.'}
            </p>
            <p className="md:hidden">
              Reports and Telegram checks only keep running while this tab is open and awake. Use the desktop app for always-on automation.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 md:gap-1.5">
          <Button className="w-full justify-start md:h-8 md:min-w-0 md:px-2" size="sm" type="button" variant="outline" onClick={onExport} disabled={storage.status !== 'ready'}>
            <ActionExportIcon className="size-4" />
            <span>Export backup</span>
          </Button>
          <Button className="w-full justify-start md:h-8 md:min-w-0 md:px-2" size="sm" type="button" variant="outline" onClick={() => importInputRef.current?.click()} disabled={storage.status !== 'ready'}>
            <ActionDatabaseUploadIcon className="size-4" />
            <span>Import backup</span>
          </Button>
          <Button className="w-full justify-start md:h-8 md:min-w-0 md:px-2" size="sm" type="button" variant="outline" onClick={onReset}>
            <ActionResetIcon className="size-4" />
            <span>{isDemo ? 'Reset demo' : 'Reset workspace'}</span>
          </Button>
          <Button asChild className="w-full justify-start md:h-8 md:min-w-0 md:px-2" size="sm" variant="outline">
            <a href={publicPath(isDemo ? '/app' : '/install')}>
              {isDemo ? <ActionSaveIcon className="size-4" /> : <ActionDatabaseDownloadIcon className="size-4" />}
              <span>{isDemo ? 'Use browser app' : 'Download desktop app'}</span>
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
      window.banjiDesktop.automation?.testTelegramConnection()
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
