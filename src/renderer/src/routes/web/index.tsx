import { useEffect, useRef, useState, type MouseEvent } from 'react';
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
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
} from '@icons/actions';
import {
  NavigationSelectExpandIcon,
} from '@icons/navigation';
import { StatusWarningIcon } from '@icons/status';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import type { AppLanguage } from '@shared/inventory';
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
const sourceBuildCodeFontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
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

const landingKhmerCopy: Record<string, string> = {
  'Advanced users': 'អ្នកប្រើប្រាស់ជំនាញ',
  'Analyze Pressure': 'វិភាគសម្ពាធ',
  'and run': 'ហើយដំណើរការ',
  'Attach item images': 'ភ្ជាប់រូបភាពទំនិញ',
  'Automatic checks only run while the tab is open': 'ការត្រួតពិនិត្យស្វ័យប្រវត្តិដំណើរការតែពេលផ្ទាំងនេះបើកប៉ុណ្ណោះ',
  'Avoid prebuilt downloads': 'ជៀសវាងការទាញយកដែលបានសាងសង់រួច',
  banji: 'បញ្ជី',
  Bash: 'Bash',
  'Browser App': 'អេបក្នុងប្រោសឺរ',
  'Browser cleanup can remove data': 'ការសម្អាតប្រោសឺរអាចលុបទិន្នន័យ',
  'Build From Source': 'សាងសង់ពីកូដប្រភព',
  'Build from source': 'សាងសង់ពីកូដប្រភព',
  'Build it': 'សាងសង់',
  'Build it yourself': 'សាងសង់ដោយខ្លួនឯង',
  'Build the app yourself': 'សាងសង់អេបដោយខ្លួនឯង',
  'Browse Archived Items': 'មើលធាតុដែលបានរក្សាទុក',
  'Choose a download': 'ជ្រើសរើសឯកសារទាញយក',
  'Choose a download to see the matching install notes.': 'ជ្រើសរើសឯកសារទាញយក ដើម្បីមើលកំណត់សម្គាល់ដំឡើងដែលត្រូវគ្នា។',
  'Choose the download for your computer': 'ជ្រើសរើសឯកសារទាញយកសម្រាប់កុំព្យូទ័ររបស់អ្នក',
  'Choose your language': 'ជ្រើសរើសភាសារបស់អ្នក',
  'Checking latest release...': 'កំពុងពិនិត្យកំណែចុងក្រោយ...',
  'Control-click banji, choose Open, then confirm Open.': 'Control-click លើ បញ្ជី ជ្រើស Open រួចបញ្ជាក់ Open។',
  'Copied': 'បានចម្លង',
  'Copy': 'ចម្លង',
  'Copy failed': 'ចម្លងមិនបាន',
  'Copy the code below and paste it inside Terminal.': 'ចម្លងកូដខាងក្រោម រួចបិទភ្ជាប់ក្នុង Terminal។',
  'Count Stock': 'រាប់ស្តុក',
  Demo: 'សាកល្បង',
  'Download': 'ទាញយក',
  'Download only from the official GitHub release. Verify release files against': 'ទាញយកតែពី GitHub release ផ្លូវការ។ ផ្ទៀងផ្ទាត់ឯកសារ release ជាមួយ',
  'Download selected': 'ទាញយកជម្រើស',
  'Download the desktop app': 'ទាញយកដេសថបអេប',
  'Downloads come from': 'ឯកសារទាញយកមកពី',
  'Desktop App': 'ដេសថបអេប',
  'Do not disable SmartScreen globally.': 'កុំបិទ SmartScreen សម្រាប់ប្រព័ន្ធទាំងមូល។',
  'English': 'អង់គ្លេស',
  'Everything in Browser App and:': 'អ្វីៗក្នុងអេបក្នុងប្រោសឺរ ហើយបន្ថែម៖',
  'Everything in Demo and:': 'អ្វីៗក្នុងការសាកល្បង ហើយបន្ថែម៖',
  'Everything in Desktop App and:': 'អ្វីៗក្នុងដេសថបអេប ហើយបន្ថែម៖',
  'Explain Inventory Signals': 'ពន្យល់សញ្ញាស្តុក',
  'Export backups': 'នាំចេញបេកអាប់',
  'Free': 'ឥតគិតថ្លៃ',
  from: 'ពី',
  'Get started': 'ចាប់ផ្តើម',
  'GitHub Releases': 'GitHub Releases',
  'If blocked, use System Settings -> Privacy & Security -> Open Anyway.': 'បើត្រូវបានទប់ស្កាត់ សូមចូល System Settings -> Privacy & Security -> Open Anyway។',
  'If SmartScreen appears, choose More info -> Run anyway.': 'បើ SmartScreen បង្ហាញ សូមជ្រើស More info -> Run anyway។',
  'If you choose a deb file, install it with your package manager.': 'បើអ្នកជ្រើសឯកសារ deb សូមដំឡើងវាជាមួយ package manager។',
  'Import backups': 'នាំចូលបេកអាប់',
  'Inspect the code': 'ពិនិត្យកូដ',
  'Inspect the source on the': 'ពិនិត្យកូដប្រភពនៅលើ',
  'Install notes': 'កំណត់សម្គាល់ដំឡើង',
  'Install the': 'ដំឡើង',
  'Install the desktop app': 'ដំឡើងដេសថបអេប',
  'Install the full app': 'ដំឡើងអេបពេញលេញ',
  'Keep automation running': 'រក្សាអូតូម៉េសិនឱ្យដំណើរការ',
  'Keep in mind:': 'ចងចាំ៖',
  'Khmer': 'ខ្មែរ',
  'Language:': 'ភាសា៖',
  'Linux ARM64 AppImage': 'Linux ARM64 AppImage',
  'Linux ARM64 deb package': 'Linux ARM64 deb package',
  'Linux install notes': 'កំណត់សម្គាល់ដំឡើង Linux',
  'Linux x64 AppImage': 'Linux x64 AppImage',
  'Linux x64 deb package': 'Linux x64 deb package',
  'macOS Apple Silicon DMG': 'macOS Apple Silicon DMG',
  'macOS install notes': 'កំណត់សម្គាល់ដំឡើង macOS',
  'macOS Intel DMG': 'macOS Intel DMG',
  'Make app snapshots': 'បង្កើតស្នេបស្ហតអេប',
  'Manage Products': 'គ្រប់គ្រងផលិតផល',
  'Manage Services': 'គ្រប់គ្រងសេវាកម្ម',
  'Mark AppImages executable before opening them.': 'កំណត់ AppImage ឱ្យ executable មុនបើកវា។',
  'No sign-up or login. Your data stays on your device.': 'មិនចាំបាច់ចុះឈ្មោះ ឬចូលប្រើវ៉ាយហ្វាយ។ ទិន្នន័យរបស់អ្នកនៅលើឧបករណ៍របស់អ្នក។',
  'Not your real workspace': 'មិនមែនកន្លែងធ្វើការពិតរបស់អ្នក',
  'Operator-facing banji features': 'មុខងារបញ្ជីសម្រាប់អ្នកប្រតិបត្តិការ',
  'official GitHub page': 'ទំព័រ GitHub ផ្លូវការ',
  'Official source page': 'ទំព័រកូដប្រភពផ្លូវការ',
  'Open the DMG and drag banji to Applications if prompted.': 'បើក DMG ហើយអូស បញ្ជី ទៅ Applications បើមានសារ។',
  'Open the Terminal app.': 'បើក Terminal អេប។',
  'on macOS.': 'លើ macOS។',
  'Place Supplier Orders': 'បញ្ជាទិញពីអ្នកផ្គត់ផ្គង់',
  'Point-of-Sale and updates': 'លក់ផ្ទាល់ និងអាប់ដេត',
  'Receive Supplier Orders': 'ទទួលទំនិញពីអ្នកផ្គត់ផ្គង់',
  'Recommended for Linux ARM64': 'ណែនាំសម្រាប់ Linux ARM64',
  'Recommended for Linux x64': 'ណែនាំសម្រាប់ Linux x64',
  'Recommended for macOS Apple Silicon': 'ណែនាំសម្រាប់ macOS Apple Silicon',
  'Recommended for macOS Intel': 'ណែនាំសម្រាប់ macOS Intel',
  'Recommended for Windows x64': 'ណែនាំសម្រាប់ Windows x64',
  'recommended': 'បានណែនាំ',
  'Record Immediate Sales': 'កត់ត្រាការលក់ភ្លាមៗ',
  'Need to use the Terminal app': 'ត្រូវប្រើ Terminal អេប',
  'Release downloads are unavailable right now.': 'ឯកសារទាញយកកំណែមិនទាន់អាចប្រើបានឥឡូវនេះ។',
  'Releases': 'កំណែចេញផ្សាយ',
  'Reset anytime': 'កំណត់ឡើងវិញបានគ្រប់ពេល',
  'Review Money': 'ពិនិត្យប្រាក់',
  'Review Telegram Intake': 'ពិនិត្យសំណើតេលេក្រាម',
  'Review Work Queue': 'ពិនិត្យជួរការងារ',
  'Run Point-of-Sale': 'ដំណើរការលក់ផ្ទាល់',
  'Run the installer.': 'ដំណើរការកម្មវិធីដំឡើង។',
  'Save real work in this browser': 'រក្សាទុកការងារពិតក្នុងប្រោសឺរនេះ',
  'Save work in local app files': 'រក្សាទុកការងារក្នុងឯកសារអេបមូលដ្ឋាន',
  'Search Catalog': 'ស្វែងរកកាតាឡុក',
  'See the main workflow': 'មើលលំហូរការងារសំខាន់',
  'Set up language, currency, and interface preferences': 'ជ្រើសរើសភាសា រូបិយប័ណ្ណ និងចំណូលចិត្តអេប',
  'Screenshot carousel': 'រូបភាពបង្ហាញកម្មវិធី',
  'Show Business health': 'បង្ហាញសុខភាពអាជីវកម្ម',
  'Show Catalog': 'បង្ហាញកាតាឡុក',
  'Show Insights': 'បង្ហាញការយល់ដឹង',
  'Show Mission Control': 'បង្ហាញផ្ទាំងបញ្ជា',
  'Show Point-of-Sale and updates': 'បង្ហាញការលក់ផ្ទាល់ និងអាប់ដេត',
  'Source Build': 'សាងសង់ពីកូដប្រភព',
  'Start in': 'ចាប់ផ្តើមក្នុង',
  'Start in the browser': 'ចាប់ផ្តើមក្នុងប្រោសឺរ',
  'Start Quick': 'ចាប់ផ្តើមរហ័ស',
  'Start Quick Demo': 'ចាប់ផ្តើមសាកល្បងរហ័ស',
  'desktop app': 'ដេសថបអេប',
  'the browser': 'ប្រោសឺរ',
  'The app you build may still show safety prompts': 'អេបដែលអ្នកសាងសង់អាចនៅតែបង្ហាញសារសុវត្ថិភាព',
  'Track Customer Orders': 'តាមដានការបញ្ជាទិញរបស់អតិថិជន',
  'Try sample data': 'សាកល្បងទិន្នន័យគំរូ',
  'Try sample shelves': 'សាកល្បងធ្នើគំរូ',
  'Use it in this browser': 'ប្រើវាក្នុងប្រោសឺរនេះ',
  'View logs': 'មើលកំណត់ហេតុ',
  'What you get:': 'អ្វីដែលអ្នកទទួលបាន៖',
  'Windows install notes': 'កំណត់សម្គាល់ដំឡើង Windows',
  'Windows x64 installer': 'Windows x64 installer',
  'YouTube tutorial for opening macOS app from unidentified developer': 'វីដេអូណែនាំការបើក macOS អេប ពីអ្នកអភិវឌ្ឍន៍មិនស្គាល់',
  'Your computer may show safety prompts': 'កុំព្យូទ័ររបស់អ្នកអាចបង្ហាញសារសុវត្ថិភាព',
  yourself: 'ដោយខ្លួនឯង',
  'A warm, local-first inventory desk for small teams: try sample shelves in the browser, keep real browser data local when OPFS is available, or install the desktop app for the full offline runtime.':
    'អេបស្តុកក្នុងម៉ាស៊ីនសម្រាប់ក្រុមតូច៖ សាកល្បងទិន្នន័យគំរូក្នុងប្រោសឺរ រក្សាទិន្នន័យប្រោសឺរពិតក្នុងម៉ាស៊ីនពេល OPFS អាចប្រើបាន ឬដំឡើងដេសថបអេបសម្រាប់ប្រើក្រៅបណ្ដាញពេញលេញ។',
  'Building locally avoids downloading a prebuilt app, but it does not magically make software safe.':
    'ការសាងសង់ក្នុងម៉ាស៊ីនជៀសវាងការទាញយកអេបដែលបានសាងសង់រួច ប៉ុន្តែមិនធ្វើឱ្យ software មានសុវត្ថិភាពដោយស្វ័យប្រវត្តិទេ។',
  'Verify SHA256SUMS when available and keep normal OS safety prompts on.':
    'ផ្ទៀងផ្ទាត់ SHA256SUMS ពេលមាន ហើយរក្សាសារ safety របស់ OS ឱ្យនៅដដែល។',
  'when available, and do not run copies from mirrors or reposts.':
    'ពេលមាន ហើយកុំដំណើរការច្បាប់ចម្លងពី mirror ឬ repost។',
};

function landingText(language: AppLanguage, text: string) {
  return language === 'km' ? landingKhmerCopy[text] ?? text : text;
}

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
];

const sharedProductDrawbacks: ProductCardItem[] = [
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
      ...sharedProductDrawbacks,
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
      ...sharedProductDrawbacks,
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
      ...sharedProductDrawbacks,
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
      ...sharedProductDrawbacks,
      { icon: Terminal, label: 'Need to use the Terminal app' },
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

function LandingLanguageOptionLabel({
  prefix,
  label,
}: {
  prefix: string;
  label: string;
}) {
  const isKhmerPrefix = /[ក-៿]/.test(prefix);
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className={cn(
        'shrink-0 text-xs font-semibold text-muted-foreground',
        isKhmerPrefix ? 'tracking-normal' : 'font-mono uppercase tracking-[0.18em]',
      )}>
        {prefix}
      </span>
      <span className="min-w-0 truncate">{label}</span>
    </span>
  );
}

function LandingLanguageSelect({
  language,
  onLanguageChange,
}: {
  language: AppLanguage;
  onLanguageChange: (language: AppLanguage) => void;
}) {
  return (
    <label className="grid gap-1 text-xs font-semibold text-muted-foreground">
      <span className="sr-only">Choose your language</span>
      <Select value={language} onValueChange={(value) => onLanguageChange(value as AppLanguage)}>
        <SelectTrigger
          aria-label="Choose your language"
          className="h-10 w-fit min-w-0 max-w-[calc(100vw-2rem)] justify-start gap-1.5 rounded-xl border border-border/70 bg-background/80 px-3 text-sm font-medium shadow-xs data-[size=default]:h-10 [&>svg]:ml-1 [&_[data-slot=select-value]]:min-w-0 [&_[data-slot=select-value]]:overflow-visible"
        >
          <span className="shrink-0 text-muted-foreground">{landingText(language, 'Language:')}</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end" position="popper">
          <SelectItem value="en">
            <LandingLanguageOptionLabel prefix="abc" label={landingText(language, 'English')} />
          </SelectItem>
          <SelectItem value="km">
            <LandingLanguageOptionLabel prefix="កខគ" label={landingText(language, 'Khmer')} />
          </SelectItem>
        </SelectContent>
      </Select>
    </label>
  );
}

function HomeRoute() {
  const [language, setLanguage] = useState<AppLanguage>('en');

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
    <div className="relative h-svh overflow-x-hidden overflow-y-auto bg-background text-foreground" data-language={language} lang={language === 'km' ? 'km' : 'en'}>
      <main>
        <section className="relative overflow-hidden border-b border-border/70">
          <div className="absolute inset-0 hero-mesh opacity-80" aria-hidden="true" />
          <div className="absolute inset-0 bg-[image:var(--noise-paper)] bg-[length:10px_10px] opacity-70" aria-hidden="true" />
          <div className="relative z-20 flex w-screen max-w-full justify-end px-4 pt-4 sm:px-8 sm:pt-5 xl:px-12">
            <LandingLanguageSelect language={language} onLanguageChange={setLanguage} />
          </div>
          <div className="relative grid min-h-[calc(100svh-11rem)] w-screen max-w-full items-center gap-10 px-4 pb-6 pt-8 sm:px-8 sm:pb-8 sm:pt-10 lg:grid-cols-[0.92fr_1.08fr] xl:px-12">
            <div className="max-w-2xl text-center sm:text-left">
              <div className="flex items-center justify-center gap-3 sm:justify-start sm:gap-4">
                <img alt="" aria-hidden="true" className="h-14 w-auto sm:h-16" src={brandLogo} />
                <h1 className="text-7xl font-semibold leading-[0.9] tracking-normal text-foreground sm:text-8xl">
                  {landingText(language, 'banji')}
                </h1>
              </div>
              <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground sm:text-xl">
                {landingText(language, 'A warm, local-first inventory desk for small teams: try sample shelves in the browser, keep real browser data local when OPFS is available, or install the desktop app for the full offline runtime.')}
              </p>
              <Button asChild className="mt-8 h-14 w-full justify-center text-base sm:w-auto sm:min-w-56" size="lg">
                <a href="#ways-to-start" onClick={onSectionAnchorClick('ways-to-start')}>{landingText(language, 'Get started')} <ActionContinueIcon className="size-4" /></a>
              </Button>
            </div>
            <WorkshopIllustration language={language} />
          </div>
          <TeamsCanDoRail language={language} />
        </section>
        <section id="ways-to-start" className="grid w-screen max-w-full items-stretch gap-4 overflow-hidden px-4 py-12 sm:px-6 md:grid-cols-2 md:px-8 xl:grid-cols-4 xl:px-12">
          {productTiers.map((tier) => (
            <ProductCard key={tier.title} language={language} tier={tier} />
          ))}
        </section>
        <ReleasesSection language={language} />
        <section id="build-from-source" className="w-full max-w-full scroll-mt-20 border-t border-border/70 py-14">
          <div className="mx-4 grid min-w-0 max-w-full gap-6 overflow-hidden rounded-[1.35rem] border border-border/70 bg-card/70 p-6 shadow-panel sm:mx-8 xl:mx-12">
            <div className="min-w-0">
              <p className={cn('text-xs font-semibold text-muted-foreground', language === 'km' ? 'tracking-normal' : 'uppercase tracking-[0.16em]')}>{landingText(language, 'Advanced users')}</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-normal">{landingText(language, 'Build From Source')}</h2>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
                {landingText(language, 'Inspect the source on the')} <a className="font-medium text-foreground underline decoration-border underline-offset-4 hover:text-primary" href={sourceUrl} rel="noreferrer" target="_blank">{landingText(language, 'official GitHub page')}</a> {landingText(language, 'and run')} <code className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">scripts/build-mac-from-source.sh</code> {landingText(language, 'on macOS.')} {landingText(language, 'Building locally avoids downloading a prebuilt app, but it does not magically make software safe.')}
              </p>
              <ul className="mt-4 grid gap-2 text-sm leading-6 text-muted-foreground">
                <li className="flex gap-3">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{landingText(language, 'Open the Terminal app.')}</span>
                </li>
                <li className="flex gap-3">
                  <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{landingText(language, 'Copy the code below and paste it inside Terminal.')}</span>
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

function WorkshopIllustration({ language }: { language: AppLanguage }) {
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
              alt={index === activeSlide ? landingText(language, item.alt) : ''}
              aria-hidden={index === activeSlide ? undefined : 'true'}
              className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-500 ease-out ${index === activeSlide ? 'opacity-100' : 'opacity-0'}`}
              src={item.image}
            />
          ))}
        </div>
        <div className="mx-auto flex w-fit gap-1.5 rounded-full border border-border/70 bg-card/95 px-3 py-2 shadow-panel backdrop-blur" aria-label={landingText(language, 'Screenshot carousel')}>
          {screenshotSlides.map((item, index) => (
            <button
              key={item.label}
              aria-label={landingText(language, `Show ${item.label}`)}
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

function TeamsCanDoRail({ language }: { language: AppLanguage }) {
  const railGroups = [railFeatures, railFeatures];

  return (
    <div className="relative -mt-4 w-screen max-w-full pb-10">
      <div className="overflow-hidden border-y border-border/70 bg-card/84 px-4 py-3 backdrop-blur sm:px-8 xl:px-12">
        <div className="flex w-max items-center motion-safe:animate-[banji-teams-rail_68s_linear_infinite] motion-reduce:w-full motion-reduce:flex-wrap">
          {railGroups.map((group, groupIndex) => (
            <div
              key={groupIndex}
              aria-label={groupIndex === 0 ? landingText(language, 'Operator-facing banji features') : undefined}
              className="flex shrink-0 gap-3 pr-3 motion-reduce:flex-wrap"
              role="list"
              aria-hidden={groupIndex > 0 ? 'true' : undefined}
            >
              {group.map(({ icon: Icon, label, tone }) => (
                <div key={`${label}-${groupIndex}`} className="flex min-w-[14.5rem] items-center gap-3 rounded-xl bg-background/78 px-4 py-3 shadow-xs ring-1 ring-border/55 sm:min-w-[15.5rem]" role="listitem">
                  <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${tone}`}>
                    <Icon aria-hidden="true" className="size-4.5" />
                  </span>
                  <span className="min-w-0 text-sm font-semibold leading-5 text-foreground">{landingText(language, label)}</span>
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

function ReleasesSection({ language }: { language: AppLanguage }) {
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
  const releaseStatusText = downloadState.status === 'error'
    ? landingText(language, 'Release downloads are unavailable right now.')
    : language === 'km'
      ? `${landingText(language, platformDescription)}${downloadState.releaseName ? ` ${landingText(language, 'from')} ${downloadState.releaseName}` : ''}។`
      : `${platformDescription}${downloadState.releaseName ? ` from ${downloadState.releaseName}` : ''}.`;

  return (
    <section id="releases" className="w-screen max-w-full border-t border-border/70 px-4 py-12 sm:px-8 xl:px-12">
      <div className="grid gap-6 rounded-[1.35rem] border border-border/70 bg-card/70 p-6 shadow-panel">
        <div>
          <p className={cn('text-xs font-semibold text-muted-foreground', language === 'km' ? 'tracking-normal' : 'uppercase tracking-[0.16em]')}>{landingText(language, 'Releases')}</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-normal">{landingText(language, 'Download the desktop app')}</h2>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-muted-foreground">
            {landingText(language, 'Downloads come from')} <a className="font-medium text-foreground underline decoration-border underline-offset-4 hover:text-primary" href={releasesUrl} rel="noreferrer" target="_blank">{landingText(language, 'GitHub Releases')}</a>. {landingText(language, 'Verify SHA256SUMS when available and keep normal OS safety prompts on.')}
          </p>
        </div>
        <div className="grid max-w-4xl gap-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="grid min-w-0 gap-2 text-sm font-semibold text-foreground sm:w-full sm:max-w-md sm:flex-none">
              <span className="sr-only">{landingText(language, 'Download')}</span>
              <span className="relative">
                <select
                  aria-label={landingText(language, 'Download')}
                  className="h-12 w-full min-w-0 appearance-none rounded-xl border border-border/70 bg-background px-4 pr-11 text-sm font-medium text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isLoading || downloadState.status === 'error' || downloadState.options.length === 0}
                  onChange={(event) => setSelectedAssetName(event.target.value)}
                  value={selectedAssetName}
                >
                  <option value="">{landingText(language, isLoading ? 'Checking latest release...' : 'Choose a download')}</option>
                  {downloadState.options.map((option) => (
                    <option key={option.asset.name} value={option.asset.name}>
                      {option.platform === downloadState.detectedPlatform
                        ? `${landingText(language, option.label)} - ${landingText(language, 'recommended')}`
                        : landingText(language, option.label)}
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
                  {landingText(language, 'Download selected')}
                </a>
              </Button>
            ) : null}
          </div>
          <p className="text-xs leading-5 text-muted-foreground">
            {releaseStatusText}
          </p>
        </div>
        <div className="border-t border-border/70 pt-5">
          <div>
            <h3 className="text-xl font-semibold">{landingText(language, installGuide.title)}</h3>
            <div className="mt-2">
              <StepList language={language} steps={installGuide.steps} />
            </div>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              {landingText(language, 'Download only from the official GitHub release. Verify release files against')} <code className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">SHA256SUMS</code> {landingText(language, 'when available, and do not run copies from mirrors or reposts.')}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductCard({ language, tier }: { language: AppLanguage; tier: ProductTier }) {
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
      <span className="hidden min-w-0 text-balance leading-5 xl:inline">{landingText(language, action)}</span>
      <span className="grid min-w-0 justify-items-center leading-5 xl:hidden" aria-hidden="true">
        {actionLines.map((line) => (
          <span key={line}>{landingText(language, line)}</span>
        ))}
      </span>
      <ActionContinueIcon className="size-4 shrink-0" />
    </>
  );
  const actionButton = href.startsWith('#') ? (
    <a
      aria-label={landingText(language, action)}
      className={actionButtonClassName}
      href={href}
      onClick={onSectionAnchorClick(href.slice(1))}
    >
      {actionButtonContent}
    </a>
  ) : (
    <a aria-label={landingText(language, action)} className={actionButtonClassName} href={href}>
      {actionButtonContent}
    </a>
  );
  const content = (
    <>
      <LiquidGridCardLayer />
      <div className="relative z-10 flex h-full flex-col gap-4 p-5 text-center xl:p-6">
        <div className="grid h-12 place-items-center text-foreground">
          <MainIcon aria-hidden="true" className="size-10 text-current" strokeWidth={1.8} />
        </div>
        <div className="grid min-h-[4.25rem] content-start gap-2">
          <h2 className="text-xl font-semibold leading-7 text-foreground">{landingText(language, title)}</h2>
          <p className="text-sm font-semibold leading-5 text-muted-foreground">{landingText(language, summary)}</p>
        </div>
        {actionButton}
        <div className="w-full text-left md:min-h-[13.75rem] xl:min-h-[14.75rem]">
          <p className="min-h-6 text-sm font-semibold leading-6 text-muted-foreground md:min-h-12 xl:min-h-6">{landingText(language, includes ?? 'What you get:')}</p>
          <ul className="mt-3 grid gap-3 text-sm leading-5 text-muted-foreground">
            {benefitsWithPromise.map(({ icon: Icon, label }) => (
              <li key={label} className="flex min-w-0 items-start gap-3">
                <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-current" />
                <span className="min-w-0 break-words font-medium">{landingText(language, label)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="w-full border-t border-white/70 pt-4 text-left">
          <p className="text-sm font-semibold leading-5 text-muted-foreground">{landingText(language, 'Keep in mind:')}</p>
          <ul className="mt-3 grid gap-3 text-sm leading-5 text-muted-foreground">
            {drawbacks.map(({ icon: Icon, label }) => (
              <li key={label} className="flex min-w-0 items-start gap-3">
                <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-current" />
                <span className="min-w-0 break-words font-medium">{landingText(language, label)}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </>
  );

  const className = cn(
    'liquid-grid-card-frame group relative block h-full min-h-0 min-w-0 overflow-hidden rounded-[1.15rem] border shadow-[0_16px_36px_rgba(48,31,20,0.08)] transition-[border-color,box-shadow,transform] duration-200 before:pointer-events-none before:absolute before:inset-0 before:bg-white/7 before:backdrop-blur-xl before:content-[\'\'] after:pointer-events-none after:absolute after:inset-[1px] after:rounded-[calc(1.15rem-1px)] after:bg-[linear-gradient(135deg,rgba(255,255,255,0.24),rgba(255,255,255,0.06)_42%,rgba(255,255,255,0.16))] after:mix-blend-screen after:content-[\'\'] hover:-translate-y-0.5 hover:border-foreground/30 hover:shadow-[0_22px_48px_rgba(48,31,20,0.12)]',
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
    <div
      className="source-code-island w-full min-w-0 max-w-full overflow-hidden rounded-[1rem] border border-white/10 bg-foreground text-xs leading-6 text-background shadow-sm"
      lang="en"
      style={{ fontFamily: sourceBuildCodeFontFamily }}
    >
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
      <pre
        className="source-code-island min-w-0 max-w-full overflow-x-auto whitespace-pre-wrap px-4 py-5 [overflow-wrap:anywhere]"
        lang="en"
        style={{ fontFamily: sourceBuildCodeFontFamily }}
      >
        <code ref={codeRef} className="source-code-island" lang="en" style={{ fontFamily: sourceBuildCodeFontFamily }}>
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

function StepList({ language, steps }: { language: AppLanguage; steps: Array<string | { href: string; label: string }> }) {
  return (
    <ol className="space-y-2 text-sm leading-6 text-muted-foreground">
      {steps.map((step) => (
        <li key={typeof step === 'string' ? step : step.href} className="flex gap-3">
          <span aria-hidden="true" className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
          {typeof step === 'string' ? (
            <span>{landingText(language, step)}</span>
          ) : (
            <a className="inline-flex items-center gap-1.5 font-medium text-foreground underline decoration-border underline-offset-4 hover:text-primary" href={step.href} rel="noreferrer" target="_blank">
              {landingText(language, step.label)}
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

export function formatBrowserStorageErrorMessage(message: string) {
  if (
    message.includes('createSyncAccessHandle') ||
    message.includes('Access Handles cannot be created') ||
    message.includes('another open Access Handle')
  ) {
    return 'Cannot have two banji browser tabs open at the same time. Close the other tab, then reload this page.';
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
