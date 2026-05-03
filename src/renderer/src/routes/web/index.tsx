import { useEffect, useRef, useState, type MouseEvent } from 'react';
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
import { LiquidGridCardLayer } from '@/components/system/liquid-grid-card';
import brandLogo from '@/assets/banji-logo.svg';
import {
  Archive,
  BadgeDollarSign,
  BadgeAlert,
  Bot,
  Check,
  CirclePlay,
  ClipboardList,
  Code2,
  Copy,
  Clock,
  DatabaseBackup,
  Download,
  EyeOff,
  FileSearch,
  FileText,
  Globe,
  Image,
  Laptop,
  MonitorDown,
  Package,
  PackageCheck,
  PackagePlus,
  PackageX,
  ReceiptText,
  RefreshCcw,
  ScanLine,
  Search,
  ShieldAlert,
  ShieldCheck,
  ShoppingBag,
  Store,
  Terminal,
  TrendingUp,
  Trash2,
  Upload,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import {
  ActionContinueIcon,
  ActionDatabaseUploadIcon,
  ActionExportIcon,
  ActionOpenExternalIcon,
  ActionResetIcon,
  ActionResumeIcon,
  ActionSaveIcon,
} from '@icons/actions';
import {
  NavigationSelectExpandIcon,
  NavigationSidebarIcon,
} from '@icons/navigation';
import { StatusWarningIcon } from '@icons/status';
import { cn } from '@/lib/utils';
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
const latestReleaseApiUrl = 'https://api.github.com/repos/Svanny/banji/releases/latest';
const sourceBuildCommands = [
  'curl -L https://github.com/Svanny/banji/archive/refs/heads/main.zip -o banji.zip',
  'unzip banji.zip',
  'mv banji-main banji',
  'cd banji',
  'chmod +x scripts/build-mac-from-source.sh',
  './scripts/build-mac-from-source.sh',
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

type ProductCardItem = {
  icon: LucideIcon;
  label: string;
};

type ProductCardTone = 'demo' | 'browser' | 'desktop' | 'source-build';

type ProductTier = {
  action: string;
  actionLines: [string, string];
  benefits: ProductCardItem[];
  drawbacks: ProductCardItem[];
  href: string;
  icon: LucideIcon;
  includes?: string;
  summary: string;
  title: string;
  tone: ProductCardTone;
};

type DetectedPlatform =
  | 'linux-arm64'
  | 'linux-x64'
  | 'mac-arm64'
  | 'mac-x64'
  | 'unknown'
  | 'windows-x64';

type GitHubReleaseAsset = {
  browser_download_url: string;
  name: string;
};

type GitHubLatestRelease = {
  assets?: GitHubReleaseAsset[];
  tag_name?: string;
};

type DownloadOption = {
  asset: GitHubReleaseAsset;
  label: string;
  platform: DetectedPlatform | 'other';
};

type ReleaseInstallGuide = {
  steps: Array<string | { href: string; label: string }>;
  title: string;
};

type ReleaseDownloadState =
  | {
    detectedPlatform: DetectedPlatform;
    error: string | null;
    options: DownloadOption[];
    releaseName: string | null;
    status: 'error' | 'loaded' | 'loading';
  };

type NavigatorUserAgentData = {
  getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
  platform?: string;
};

type NavigatorWithUserAgentData = Navigator & {
  userAgentData?: NavigatorUserAgentData;
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

const sharedProductBenefits: ProductCardItem[] = [
  { icon: BadgeDollarSign, label: 'Free' },
  { icon: ShieldCheck, label: 'No sign-up or login. Your data stays on your device.' },
];

const productTiers: ProductTier[] = [
  {
    action: 'Start Quick Demo',
    actionLines: ['Start Quick', 'Demo'],
    benefits: [
      { icon: PackageCheck, label: 'Try sample shelves' },
      { icon: ScanLine, label: 'See the main workflow' },
      { icon: RefreshCcw, label: 'Reset anytime' },
    ],
    drawbacks: [
      { icon: EyeOff, label: 'Not your real workspace' },
    ],
    href: publicPath('/demo'),
    icon: CirclePlay,
    summary: 'Try sample data',
    title: 'Demo',
    tone: 'demo',
  },
  {
    action: 'Start in the browser',
    actionLines: ['Start in', 'the browser'],
    benefits: [
      { icon: Globe, label: 'Save real work in this browser' },
      { icon: Download, label: 'Export backups' },
      { icon: Upload, label: 'Import backups' },
    ],
    drawbacks: [
      { icon: Trash2, label: 'Browser cleanup can remove data' },
      { icon: Clock, label: 'Automatic checks only run while the tab is open' },
    ],
    href: publicPath('/app'),
    icon: Globe,
    includes: 'Everything in Demo and:',
    summary: 'Use it in this browser',
    title: 'Browser App',
    tone: 'browser',
  },
  {
    action: 'Install the desktop app',
    actionLines: ['Install the', 'desktop app'],
    benefits: [
      { icon: FileText, label: 'Save work in local app files' },
      { icon: DatabaseBackup, label: 'Make app snapshots' },
      { icon: Bot, label: 'Keep automation running' },
      { icon: Image, label: 'Attach item images' },
      { icon: FileSearch, label: 'View logs' },
    ],
    drawbacks: [
      { icon: ShieldAlert, label: 'Your computer may show safety prompts' },
    ],
    href: '#releases',
    icon: MonitorDown,
    includes: 'Everything in Browser App and:',
    summary: 'Install the full app',
    title: 'Desktop App',
    tone: 'desktop',
  },
  {
    action: 'Build it yourself',
    actionLines: ['Build it', 'yourself'],
    benefits: [
      { icon: Code2, label: 'Inspect the code' },
      { icon: Terminal, label: 'Build the app yourself' },
      { icon: PackageX, label: 'Avoid prebuilt downloads' },
    ],
    drawbacks: [
      { icon: Wrench, label: 'Requires developer tools' },
      { icon: Laptop, label: 'Currently focused on macOS' },
      { icon: BadgeAlert, label: 'The app you build may still show safety prompts' },
    ],
    href: '#build-from-source',
    icon: Code2,
    includes: 'Everything in Desktop App and:',
    summary: 'Build from source',
    title: 'Source Build',
    tone: 'source-build',
  },
];

function productCardSurfaceClassName(tone: ProductCardTone) {
  switch (tone) {
    case 'demo':
      return 'backdrop-blur-md saturate-[1.3] border-[#D97706]/35 bg-[#D97706]/[0.08]';
    case 'browser':
      return 'backdrop-blur-md saturate-[1.3] border-[#2563EB]/35 bg-[#2563EB]/[0.08]';
    case 'desktop':
      return 'backdrop-blur-md saturate-[1.3] border-[#9333EA]/35 bg-[#9333EA]/[0.08]';
    case 'source-build':
      return 'backdrop-blur-md saturate-[1.3] border-black/35 bg-black/[0.08]';
  }
}

function publicPath(path: string) {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${basePath}${path}`;
}

async function fetchLatestRelease(signal?: AbortSignal): Promise<GitHubLatestRelease> {
  const response = await fetch(latestReleaseApiUrl, {
    headers: { Accept: 'application/vnd.github+json' },
    signal,
  });
  if (!response.ok) {
    throw new Error(`GitHub latest release request failed with ${response.status}`);
  }
  return await response.json() as GitHubLatestRelease;
}

async function detectDownloadPlatform(): Promise<DetectedPlatform> {
  if (typeof navigator === 'undefined') {
    return 'unknown';
  }

  const userAgentData = (navigator as NavigatorWithUserAgentData).userAgentData;
  const userAgentDataPlatform = userAgentData?.platform?.toLowerCase() ?? '';
  if (userAgentDataPlatform.includes('mac')) {
    const architecture = await readUserAgentArchitecture(userAgentData);
    return architecture.includes('arm') ? 'mac-arm64' : 'mac-x64';
  }
  if (userAgentDataPlatform.includes('windows')) {
    return 'windows-x64';
  }
  if (userAgentDataPlatform.includes('linux')) {
    const architecture = await readUserAgentArchitecture(userAgentData);
    return architecture.includes('arm') || architecture.includes('aarch64') ? 'linux-arm64' : 'linux-x64';
  }

  const platform = navigator.platform.toLowerCase();
  const userAgent = navigator.userAgent.toLowerCase();
  const platformSignal = `${platform} ${userAgent}`;

  if (platformSignal.includes('mac')) {
    return 'mac-x64';
  }
  if (platformSignal.includes('win')) {
    return 'windows-x64';
  }
  if (platformSignal.includes('linux')) {
    return platformSignal.includes('arm64') || platformSignal.includes('aarch64') ? 'linux-arm64' : 'linux-x64';
  }
  return 'unknown';
}

async function readUserAgentArchitecture(userAgentData?: NavigatorUserAgentData) {
  try {
    const highEntropyValues = await userAgentData?.getHighEntropyValues?.(['architecture']);
    return highEntropyValues?.architecture?.toLowerCase() ?? '';
  } catch {
    return '';
  }
}

function buildDownloadOptions(assets: GitHubReleaseAsset[] = []): DownloadOption[] {
  return assets
    .filter((asset) => /\.(appimage|deb|dmg|exe)$/i.test(asset.name))
    .map((asset) => ({
      asset,
      label: formatReleaseAssetLabel(asset.name),
      platform: detectAssetPlatform(asset.name),
    }))
    .sort((first, second) => first.label.localeCompare(second.label));
}

function detectAssetPlatform(assetName: string): DownloadOption['platform'] {
  const lowerName = assetName.toLowerCase();
  if (/darwin-arm64\.dmg$/.test(lowerName)) {
    return 'mac-arm64';
  }
  if (/darwin-x64\.dmg$/.test(lowerName)) {
    return 'mac-x64';
  }
  if (/win(?:32)?-x64\.exe$/.test(lowerName)) {
    return 'windows-x64';
  }
  if (/linux-arm64\.appimage$/.test(lowerName)) {
    return 'linux-arm64';
  }
  if (/linux-x64\.appimage$/.test(lowerName)) {
    return 'linux-x64';
  }
  if (/linux-arm64\.deb$/.test(lowerName)) {
    return 'linux-arm64';
  }
  if (/linux-x64\.deb$/.test(lowerName)) {
    return 'linux-x64';
  }
  return 'other';
}

function formatReleaseAssetLabel(assetName: string) {
  const lowerName = assetName.toLowerCase();
  if (/darwin-arm64\.dmg$/.test(lowerName)) {
    return 'macOS Apple Silicon DMG';
  }
  if (/darwin-x64\.dmg$/.test(lowerName)) {
    return 'macOS Intel DMG';
  }
  if (/win(?:32)?-x64\.exe$/.test(lowerName)) {
    return 'Windows x64 installer';
  }
  if (/linux-arm64\.appimage$/.test(lowerName)) {
    return 'Linux ARM64 AppImage';
  }
  if (/linux-x64\.appimage$/.test(lowerName)) {
    return 'Linux x64 AppImage';
  }
  if (/linux-arm64\.deb$/.test(lowerName)) {
    return 'Linux ARM64 deb package';
  }
  if (/linux-x64\.deb$/.test(lowerName)) {
    return 'Linux x64 deb package';
  }
  return assetName;
}

function describeDetectedPlatform(platform: DetectedPlatform) {
  switch (platform) {
    case 'linux-arm64':
      return 'Recommended for Linux ARM64';
    case 'linux-x64':
      return 'Recommended for Linux x64';
    case 'mac-arm64':
      return 'Recommended for macOS Apple Silicon';
    case 'mac-x64':
      return 'Recommended for macOS Intel';
    case 'windows-x64':
      return 'Recommended for Windows x64';
    case 'unknown':
      return 'Choose the download for your computer';
  }
}

function findRecommendedOption(options: DownloadOption[], platform: DetectedPlatform) {
  if (platform === 'unknown') {
    return null;
  }
  return options.find((option) => option.platform === platform) ?? null;
}

function guideForDownloadPlatform(platform: DetectedPlatform | DownloadOption['platform']): ReleaseInstallGuide {
  switch (platform) {
    case 'mac-arm64':
    case 'mac-x64':
      return {
        steps: [
          'Open the DMG and drag banji to Applications if prompted.',
          'Control-click banji, choose Open, then confirm Open.',
          'If blocked, use System Settings -> Privacy & Security -> Open Anyway.',
          {
            href: 'https://youtu.be/sLox8h-6BVw',
            label: 'YouTube tutorial for opening macOS app from unidentified developer',
          },
        ],
        title: 'macOS install notes',
      };
    case 'windows-x64':
      return {
        steps: [
          'Run the installer.',
          'If SmartScreen appears, choose More info -> Run anyway.',
          'Do not disable SmartScreen globally.',
        ],
        title: 'Windows install notes',
      };
    case 'linux-arm64':
    case 'linux-x64':
      return {
        steps: [
          'Mark AppImages executable before opening them.',
          'If you choose a deb file, install it with your package manager.',
        ],
        title: 'Linux install notes',
      };
    case 'other':
    case 'unknown':
      return {
        steps: ['Choose a download to see the matching install notes.'],
        title: 'Install notes',
      };
  }
}

function scrollBlockForSection(sectionId: string): ScrollLogicalPosition {
  return sectionId === 'build-from-source' ? 'end' : 'start';
}

function scrollToSection(
  sectionId: string,
  block: ScrollLogicalPosition = scrollBlockForSection(sectionId),
  behavior: ScrollBehavior = 'smooth',
) {
  const target = document.getElementById(sectionId);
  if (!target) {
    return;
  }
  target.scrollIntoView({ behavior, block });
}

function onSectionAnchorClick(sectionId: string, block?: ScrollLogicalPosition) {
  return (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    window.history.replaceState(null, '', `#${sectionId}`);
    scrollToSection(sectionId, block);
  };
}

function scheduleHashSectionScroll(sectionId: string) {
  const block = scrollBlockForSection(sectionId);
  const frameId = window.requestAnimationFrame(() => scrollToSection(sectionId, block, 'auto'));
  const timeoutIds = [120, 520].map((delay) => (
    window.setTimeout(() => scrollToSection(sectionId, block, 'auto'), delay)
  ));
  return () => {
    window.cancelAnimationFrame(frameId);
    for (const timeoutId of timeoutIds) {
      window.clearTimeout(timeoutId);
    }
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
            <a href="#releases" onClick={onSectionAnchorClick('releases')}><Download className="size-4" />Install</a>
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
              <a href="#releases" onClick={onSectionAnchorClick('releases')}><Download className="size-4" />Install</a>
            </Button>
          </div>
        </details>
      </nav>
    </header>
  );
}

function HomeRoute() {
  useEffect(() => {
    let cancelScheduledScroll = () => {};

    function handleHashSectionScroll() {
      cancelScheduledScroll();
      const sectionId = window.location.hash.replace(/^#/, '');
      if (!sectionId) {
        cancelScheduledScroll = () => {};
        return;
      }
      cancelScheduledScroll = scheduleHashSectionScroll(sectionId);
    }

    handleHashSectionScroll();
    window.addEventListener('hashchange', handleHashSectionScroll);
    return () => {
      cancelScheduledScroll();
      window.removeEventListener('hashchange', handleHashSectionScroll);
    };
  }, []);

  return (
    <div className="h-svh overflow-x-hidden overflow-y-auto bg-background text-foreground">
      <main>
        <section className="relative overflow-hidden border-b border-border/70">
          <div className="absolute inset-0 hero-mesh opacity-80" aria-hidden="true" />
          <div className="absolute inset-0 bg-[image:var(--noise-paper)] bg-[length:10px_10px] opacity-70" aria-hidden="true" />
          <div className="relative grid min-h-[calc(100svh-7.5rem)] w-screen max-w-full items-center gap-10 px-4 py-6 sm:px-8 sm:py-8 lg:grid-cols-[0.92fr_1.08fr] xl:px-12">
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
        <section id="ways-to-start" className="grid w-screen max-w-full items-stretch gap-4 overflow-hidden px-4 py-12 sm:px-6 md:grid-cols-4 md:px-8 xl:px-12">
          {productTiers.map((tier) => (
            <ProductCard key={tier.title} tier={tier} />
          ))}
        </section>
        <ReleasesSection />
        <section id="build-from-source" className="w-full max-w-full scroll-mt-20 border-t border-border/70 py-14">
          <div className="mx-4 grid min-w-0 max-w-full gap-6 overflow-hidden rounded-[1.35rem] border border-border/70 bg-card/70 p-6 shadow-panel sm:mx-8 xl:mx-12">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Advanced users</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-normal">Build From Source</h2>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
                Inspect the source on the <a className="font-medium text-foreground underline decoration-border underline-offset-4 hover:text-primary" href={sourceUrl} rel="noreferrer" target="_blank">official GitHub page</a> and run <code className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">scripts/build-mac-from-source.sh</code> on macOS. Building locally avoids downloading a prebuilt app, but it does not magically make software safe.
              </p>
              <ul className="mt-4 grid gap-2 text-sm leading-6 text-muted-foreground">
                <li className="flex gap-3">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>Open the Terminal app.</span>
                </li>
                <li className="flex gap-3">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>Copy the code below and paste it inside Terminal.</span>
                </li>
              </ul>
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

function ReleasesSection() {
  const [downloadState, setDownloadState] = useState<ReleaseDownloadState>({
    detectedPlatform: 'unknown',
    error: null,
    options: [],
    releaseName: null,
    status: 'loading',
  });
  const [selectedAssetName, setSelectedAssetName] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    async function loadReleaseDownloads() {
      const detectedPlatform = await detectDownloadPlatform();
      try {
        const release = await fetchLatestRelease(controller.signal);
        if (cancelled) {
          return;
        }
        const options = buildDownloadOptions(release.assets);
        const recommendedOption = findRecommendedOption(options, detectedPlatform);
        setSelectedAssetName(recommendedOption?.asset.name ?? '');
        setDownloadState({
          detectedPlatform,
          error: null,
          options,
          releaseName: release.tag_name ?? null,
          status: 'loaded',
        });
      } catch (error) {
        if (cancelled || controller.signal.aborted) {
          return;
        }
        setSelectedAssetName('');
        setDownloadState({
          detectedPlatform,
          error: error instanceof Error ? error.message : 'Release downloads are unavailable right now.',
          options: [],
          releaseName: null,
          status: 'error',
        });
      }
    }

    void loadReleaseDownloads();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const selectedOption = downloadState.options.find((option) => option.asset.name === selectedAssetName) ?? null;
  const platformDescription = describeDetectedPlatform(downloadState.detectedPlatform);
  const installGuide = guideForDownloadPlatform(selectedOption?.platform ?? downloadState.detectedPlatform);
  const isLoading = downloadState.status === 'loading';

  return (
    <section id="releases" className="w-screen max-w-full border-t border-border/70 px-4 py-12 sm:px-8 xl:px-12">
      <div className="grid gap-6 rounded-[1.35rem] border border-border/70 bg-card/70 p-6 shadow-panel">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Releases</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-normal">Download the desktop app</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            Downloads come from <a className="font-medium text-foreground underline decoration-border underline-offset-4 hover:text-primary" href={releasesUrl} rel="noreferrer" target="_blank">GitHub Releases</a>. Verify SHA256SUMS when available and keep normal OS safety prompts on.
          </p>
        </div>
        <div className="grid max-w-4xl gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="grid min-w-0 gap-2 text-sm font-semibold text-foreground sm:w-full sm:max-w-md sm:flex-none">
              <span className="sr-only">Download</span>
              <span className="relative">
                <select
                  aria-label="Download"
                  className="h-12 w-full min-w-0 appearance-none rounded-xl border border-border/70 bg-background px-4 pr-11 text-sm font-medium text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoading || downloadState.status === 'error' || downloadState.options.length === 0}
                  onChange={(event) => setSelectedAssetName(event.target.value)}
                  value={selectedAssetName}
                >
                  <option value="">{isLoading ? 'Checking latest release...' : 'Choose a download'}</option>
                  {downloadState.options.map((option) => (
                    <option key={option.asset.name} value={option.asset.name}>
                      {option.platform === downloadState.detectedPlatform ? `${option.label} - recommended` : option.label}
                    </option>
                  ))}
                </select>
                <NavigationSelectExpandIcon className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              </span>
            </label>
            {selectedOption ? (
              <Button asChild className="h-12 w-full min-w-0 justify-center rounded-xl sm:w-auto sm:min-w-56" size="lg">
                <a href={selectedOption.asset.browser_download_url} rel="noreferrer" target="_blank">
                  <Download className="size-4" />
                  Download selected
                </a>
              </Button>
            ) : null}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {downloadState.status === 'error'
              ? 'Release downloads are unavailable right now.'
              : `${platformDescription}${downloadState.releaseName ? ` from ${downloadState.releaseName}` : ''}.`}
          </p>
        </div>
        <div className="border-t border-border/70 pt-5">
          <div>
            <h3 className="text-xl font-semibold">{installGuide.title}</h3>
            <div className="mt-2">
              <StepList steps={installGuide.steps} />
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              Download only from the official GitHub release. Verify release files against <code className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">SHA256SUMS</code> when available, and do not run copies from mirrors or reposts.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductCard({ tier }: { tier: ProductTier }) {
  const {
    action,
    actionLines,
    benefits,
    drawbacks,
    href,
    icon: MainIcon,
    includes,
    summary,
    title,
    tone,
  } = tier;
  const benefitsWithPromise: ProductCardItem[] = [
    ...sharedProductBenefits,
    ...benefits,
  ];
  const actionButtonClassName = 'inline-flex min-h-12 w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-white/80 bg-white px-4 py-3 text-sm font-semibold text-foreground shadow-xs transition-colors hover:bg-white/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70';
  const actionButtonContent = (
    <>
      <span className="hidden min-w-0 text-balance leading-5 xl:inline">{action}</span>
      <span className="grid min-w-0 justify-items-center leading-5 xl:hidden" aria-hidden="true">
        {actionLines.map((line) => (
          <span key={line}>{line}</span>
        ))}
      </span>
      <ActionContinueIcon className="size-4 shrink-0" />
    </>
  );
  const actionButton = href.startsWith('#') ? (
    <a
      aria-label={action}
      className={actionButtonClassName}
      href={href}
      onClick={onSectionAnchorClick(href.slice(1))}
    >
      {actionButtonContent}
    </a>
  ) : (
    <a aria-label={action} className={actionButtonClassName} href={href}>
      {actionButtonContent}
    </a>
  );
  const content = (
    <>
      <LiquidGridCardLayer />
      <div className="relative z-10 grid h-full grid-rows-[3rem_4.25rem_4rem_25rem_1fr] items-start gap-y-4 p-5 text-center xl:grid-rows-[3rem_4.25rem_4rem_18rem_1fr] xl:p-6">
        <div className="grid h-12 place-items-center text-foreground">
          <MainIcon aria-hidden="true" className="size-10 text-current" strokeWidth={1.8} />
        </div>
        <div className="grid content-start gap-2">
          <h2 className="text-xl font-semibold leading-7 text-foreground">{title}</h2>
          <p className="text-sm font-semibold leading-5 text-muted-foreground">{summary}</p>
        </div>
        {actionButton}
        <div className="w-full text-left">
          <p className="min-h-6 text-sm font-semibold leading-6 text-muted-foreground md:min-h-12 xl:min-h-6">{includes ?? 'What you get:'}</p>
          <ul className="mt-3 grid gap-3 text-sm leading-5 text-muted-foreground">
            {benefitsWithPromise.map(({ icon: Icon, label }) => (
              <li key={label} className="flex min-w-0 items-start gap-3">
                <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-current" />
                <span className="min-w-0 font-medium">{label}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="w-full border-t border-white/70 pt-4 text-left">
          <p className="text-sm font-semibold leading-5 text-muted-foreground">Keep in mind:</p>
          <ul className="mt-3 grid gap-3 text-sm leading-5 text-muted-foreground">
            {drawbacks.map(({ icon: Icon, label }) => (
              <li key={label} className="flex min-w-0 items-start gap-3">
                <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-current" />
                <span className="min-w-0 font-medium">{label}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );

  const className = cn(
    'liquid-grid-card-frame group relative block h-full min-h-[45rem] min-w-0 overflow-hidden rounded-[1.15rem] border shadow-[0_16px_36px_rgba(48,31,20,0.08)] transition-[border-color,box-shadow,transform] duration-200 before:pointer-events-none before:absolute before:inset-0 before:bg-white/7 before:backdrop-blur-xl before:content-[\'\'] after:pointer-events-none after:absolute after:inset-[1px] after:rounded-[calc(1.15rem-1px)] after:bg-[linear-gradient(135deg,rgba(255,255,255,0.24),rgba(255,255,255,0.06)_42%,rgba(255,255,255,0.16))] after:mix-blend-screen after:content-[\'\'] hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-[0_22px_48px_rgba(48,31,20,0.12)] xl:min-h-[39rem]',
    productCardSurfaceClassName(tone),
  );

  return (
    <article className={className}>
      {content}
    </article>
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
    ? <Check className="size-4" data-icon />
    : copyStatus === 'failed'
      ? <X className="size-4" data-icon />
      : <Copy className="size-4" data-icon />;

  return (
    <div className="w-full min-w-0 max-w-full overflow-hidden rounded-[1rem] border border-white/10 bg-foreground font-mono text-xs leading-6 text-background shadow-sm">
      <div className="flex items-center justify-between border-b border-white/10 bg-white/[0.04] px-4 py-3">
        <span className="inline-flex items-center gap-2 font-sans text-sm font-semibold text-background">
          <Code2 className="size-4" />
          Bash
        </span>
        <button
          aria-label={copyLabel}
          className="grid size-9 place-items-center rounded-lg text-background/90 transition-colors hover:bg-background/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/40"
          type="button"
          onClick={copyCommands}
        >
          {copyIcon}
        </button>
      </div>
      <pre className="min-w-0 max-w-full overflow-x-auto whitespace-pre-wrap px-4 py-5 [overflow-wrap:anywhere]">
        <code ref={codeRef}>
          {sourceBuildCommands.map((command, index) => (
            <span key={command}>
              {renderSourceBuildCommand(command)}
              {index < sourceBuildCommands.length - 1 ? '\n' : null}
            </span>
          ))}
        </code>
      </pre>
    </div>
  );
}

function renderSourceBuildCommand(command: string) {
  const parts = command.split(/(\s+)/);
  return parts.map((part, index) => {
    if (/^\s+$/.test(part)) {
      return part;
    }

    const className = index === 0
      ? 'text-[#ff9d5c]'
      : part.startsWith('-') || part === '+x'
        ? 'text-[#f6b35c]'
        : undefined;

    return (
      <span key={`${part}-${index}`} className={className}>
        {part}
      </span>
    );
  });
}

function StepList({ steps }: { steps: Array<string | { href: string; label: string }> }) {
  return (
    <ol className="space-y-2 text-sm leading-6 text-muted-foreground">
      {steps.map((step) => (
        <li key={typeof step === 'string' ? step : step.href} className="flex gap-3">
          <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
          {typeof step === 'string' ? (
            <span>{step}</span>
          ) : (
            <a className="inline-flex items-center gap-1.5 font-medium text-foreground underline decoration-border underline-offset-4 hover:text-primary" href={step.href} rel="noreferrer" target="_blank">
              {step.label}
              <ActionOpenExternalIcon aria-hidden="true" className="size-3.5 shrink-0" />
            </a>
          )}
        </li>
      ))}
    </ol>
  );
}

function databaseForMode(mode: EmbeddedMode): BanjiBrowserDatabaseName {
  return mode === 'demo' ? BANJI_BROWSER_DEMO_DATABASE : BANJI_BROWSER_APP_DATABASE;
}

export function fallbackStateForMode(mode: EmbeddedMode): BrowserMockState {
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
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const sidebarCollapsed = useEmbeddedSidebarCollapsed();
  const displayMessage = storage.status === 'error'
    ? (isDemo ? 'Demo is running with temporary sample data because durable browser storage could not start.' : 'Browser storage could not start.')
    : storage.message;
  return (
    <div
      className={cn(
        'border-b border-border/70 bg-background/95 px-4 py-3 text-foreground shadow-[0_10px_30px_rgba(27,15,7,0.06)] md:fixed md:bottom-[6.2rem] md:left-2 md:z-40 md:w-[calc(12.8rem-1rem)] md:border-0 md:bg-transparent md:p-0 md:shadow-none',
        sidebarCollapsed ? 'md:w-12' : null,
        isOnboarding ? 'fixed left-3 top-3 z-50 w-[13.25rem] border-0 bg-transparent p-0 shadow-none md:bottom-auto md:left-3 md:top-3 md:w-[13.25rem]' : null,
      )}
    >
      <div className={cn(
        'mx-auto flex max-w-6xl flex-col gap-3 rounded-[1.15rem] border border-primary/20 bg-card/82 px-4 py-3 text-sm leading-6 shadow-none md:max-w-none md:items-stretch md:gap-2 md:rounded-xl md:px-2.5 md:py-2 md:text-xs md:leading-5',
        sidebarCollapsed ? 'md:px-1.5' : null,
      )}>
        <div className="grid gap-2">
          <span className="grid size-9 shrink-0 place-items-center justify-self-center rounded-[0.85rem] bg-amber-100 text-amber-950 md:size-7 md:rounded-lg">
            <StatusWarningIcon className="size-4" />
          </span>
          <div className={cn('min-w-0 text-left', sidebarCollapsed ? 'md:sr-only' : null)}>
            <p className="font-semibold md:leading-4">
              {isDemo ? 'Demo data - not your real workspace.' : 'banji saves your work in this browser. Back it up regularly.'}
            </p>
            <p className="md:hidden">
              {displayMessage} Storage: {storageStatusLabel(storage.status)}. Extra browser protection: {persistenceStatusLabel(storage.persistence)}.
              {storage.lastBackupAt ? ` Last backup: ${new Date(storage.lastBackupAt).toLocaleString()}.` : ''}
            </p>
            {isDemo ? (
              <p className="hidden text-muted-foreground md:block">Sample workspace. Reset anytime.</p>
            ) : null}
            <p className="md:hidden">
              Reports and Telegram checks only keep running while this tab is open and awake. Use the desktop app for always-on automation.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-2 md:gap-1.5">
          <Button aria-label="Export backup" className={cn('w-full justify-start md:h-8 md:min-w-0 md:px-2', sidebarCollapsed ? 'md:justify-center' : null)} size="sm" type="button" variant="outline" onClick={onExport} disabled={storage.status !== 'ready'}>
            <ActionExportIcon className="size-4" />
            <span className={sidebarCollapsed ? 'md:sr-only' : undefined}>Export backup</span>
          </Button>
          <Button aria-label="Import backup" className={cn('w-full justify-start md:h-8 md:min-w-0 md:px-2', sidebarCollapsed ? 'md:justify-center' : null)} size="sm" type="button" variant="outline" onClick={() => importInputRef.current?.click()} disabled={storage.status !== 'ready'}>
            <ActionDatabaseUploadIcon className="size-4" />
            <span className={sidebarCollapsed ? 'md:sr-only' : undefined}>Import backup</span>
          </Button>
          <Button aria-label={isDemo ? 'Reset demo' : 'Reset workspace'} className={cn('w-full justify-start md:h-8 md:min-w-0 md:px-2', sidebarCollapsed ? 'md:justify-center' : null)} size="sm" type="button" variant="outline" onClick={onReset}>
            <ActionResetIcon className="size-4" />
            <span className={sidebarCollapsed ? 'md:sr-only' : undefined}>{isDemo ? 'Reset demo' : 'Reset workspace'}</span>
          </Button>
          <Button asChild className={cn('w-full justify-start md:h-8 md:min-w-0 md:px-2', sidebarCollapsed ? 'md:justify-center' : null)} size="sm" variant="outline">
            <a aria-label={isDemo ? 'Use browser app' : 'Download app'} href={publicPath(isDemo ? '/app' : '/#releases')}>
              {isDemo ? <Globe className="size-4" /> : <Download className="size-4" />}
              <span className={sidebarCollapsed ? 'md:sr-only' : undefined}>{isDemo ? 'Use browser app' : 'Download app'}</span>
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
  const [hash, setHash] = useState(() => window.location.hash);
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
    const updateHash = () => setHash(window.location.hash);
    window.addEventListener('hashchange', updateHash);
    return () => window.removeEventListener('hashchange', updateHash);
  }, []);

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
                <a href={publicPath('/#releases')}><Download className="size-4" />Download app</a>
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
        isOnboarding={hash.replace(/^#/, '').startsWith('/onboarding')}
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
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}
