import { useEffect, useRef, useState, type CSSProperties, type MouseEvent, type PointerEvent } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import brandLogo from '@/assets/kaur-khor-logo.svg';
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
} from '@icons/web';
import {
  ActionContinueIcon,
  ActionOpenExternalIcon,
} from '@icons/actions';
import {
  NavigationSelectExpandIcon,
} from '@icons/navigation';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import analysisImageUrl from '../../../../../docs/readme/web-current-analysis.png';
import catalogImageUrl from '../../../../../docs/readme/web-current-catalog.png';
import customerOrderImageUrl from '../../../../../docs/readme/web-current-customer-order.png';
import overviewImageUrl from '../../../../../docs/readme/web-current-overview.png';
import performanceImageUrl from '../../../../../docs/readme/web-current-performance.png';
import queueCustomerImageUrl from '../../../../../docs/readme/web-current-queue-customer.png';
import queueSupplierImageUrl from '../../../../../docs/readme/web-current-queue-supplier.png';
import recordUpdateImageUrl from '../../../../../docs/readme/web-current-record-update.png';
import stockCountImageUrl from '../../../../../docs/readme/web-current-stock-count.png';
import type { AppLanguage } from '@shared/inventory';

const releasesUrl = 'https://github.com/Svanny/kaur-khor/releases/latest';
const sourceUrl = 'https://github.com/Svanny/kaur-khor';
const latestReleaseApiUrl = 'https://api.github.com/repos/Svanny/kaur-khor/releases/latest';
const sourceBuildCommands = [
  'curl -L https://github.com/Svanny/kaur-khor/archive/refs/heads/main.tar.gz -o kaur-khor-source.tar.gz',
  'tar -xzf kaur-khor-source.tar.gz',
  'cd kaur-khor-main',
  './scripts/build-from-source.sh',
] as const;
const sourceBuildCodeFontFamily = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';
const screenshotWidth = 3456;
const screenshotHeight = 1984;
const screenshotSlides = [
  {
    alt: 'Kaur Khor mission control overview showing the main work queue',
    image: overviewImageUrl,
    label: 'Mission Control',
    width: screenshotWidth,
    height: screenshotHeight,
  },
  {
    alt: 'Kaur Khor supplier queue showing supplier follow-up work',
    image: queueSupplierImageUrl,
    label: 'Supplier queue',
    width: screenshotWidth,
    height: screenshotHeight,
  },
  {
    alt: 'Kaur Khor customer queue showing customer order follow-up work',
    image: queueCustomerImageUrl,
    label: 'Customer queue',
    width: screenshotWidth,
    height: screenshotHeight,
  },
  {
    alt: 'Kaur Khor products view showing searchable SKUs and services',
    image: catalogImageUrl,
    label: 'Products',
    width: screenshotWidth,
    height: screenshotHeight,
  },
  {
    alt: 'Kaur Khor record update workflow for stock and order changes',
    image: recordUpdateImageUrl,
    label: 'Point-of-Sale and updates',
    width: screenshotWidth,
    height: screenshotHeight,
  },
  {
    alt: 'Kaur Khor stock count capture session for physical inventory counts',
    image: stockCountImageUrl,
    label: 'Stock count',
    width: screenshotWidth,
    height: screenshotHeight,
  },
  {
    alt: 'Kaur Khor customer order capture session for pending customer demand',
    image: customerOrderImageUrl,
    label: 'Customer order',
    width: screenshotWidth,
    height: screenshotHeight,
  },
  {
    alt: 'Kaur Khor business health dashboard showing pressure and diagnostics',
    image: performanceImageUrl,
    label: 'Business health',
    width: screenshotWidth,
    height: screenshotHeight,
  },
  {
    alt: 'Kaur Khor analysis workspace showing inventory insight tools',
    image: analysisImageUrl,
    label: 'Insights',
    width: screenshotWidth,
    height: screenshotHeight,
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
  | 'android'
  | 'ios'
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

type ReleaseAssetInfo = {
  label: string;
  platform: DownloadOption['platform'];
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
    status: 'error' | 'idle' | 'loaded' | 'loading';
  };

const landingKhmerCopy: Record<string, string> = {
  'Advanced users': 'អ្នកប្រើប្រាស់ជំនាញ',
  'Analyze Pressure': 'វិភាគសម្ពាធ',
  'and run': 'ហើយដំណើរការ',
  'Attach item images': 'ភ្ជាប់រូបភាពទំនិញ',
  'Automatic checks only run while the tab is open': 'ការត្រួតពិនិត្យស្វ័យប្រវត្តិដំណើរការតែពេលផ្ទាំងនេះបើកប៉ុណ្ណោះ',
  'Avoid prebuilt downloads': 'ជៀសវាងការទាញយកដែលបានសាងសង់រួច',
  'KAUR KHOR': 'កខ',
  Bash: 'Bash',
  'Browser App': 'អេបក្នុងប្រោសឺរ',
  'Browser cleanup can remove data': 'ការសម្អាតប្រោសឺរអាចលុបទិន្នន័យ',
  'Build From Source': 'សាងសង់ពីកូដប្រភព',
  'Build from source': 'សាងសង់ពីកូដប្រភព',
  'Build it': 'សាងសង់',
  'Build it yourself': 'សាងសង់ដោយខ្លួនឯង',
  'Build the app yourself': 'សាងសង់អេបដោយខ្លួនឯង',
  'build dependencies before packaging Kaur Khor.': 'ឧបករណ៍សាងសង់ មុនពេលវេចខ្ចប់ កខ។',
  'Browse Archived Items': 'មើលធាតុដែលបានរក្សាទុក',
  'Android app is not supported': 'Android អេបមិនទាន់គាំទ្រទេ',
  'Android app is not supported. Use the browser app instead.': 'Android អេបមិនទាន់គាំទ្រទេ។ សូមប្រើអេបក្នុងប្រោសឺរជំនួសវិញ។',
  'Choose a download': 'ជ្រើសរើសឯកសារទាញយក',
  'Choose a download to see the matching install notes.': 'ជ្រើសរើសឯកសារទាញយក ដើម្បីមើលកំណត់សម្គាល់ដំឡើងដែលត្រូវគ្នា។',
  'Choose the download for your computer': 'ជ្រើសរើសឯកសារទាញយកសម្រាប់កុំព្យូទ័ររបស់អ្នក',
  'Choose your language': 'ជ្រើសរើសភាសារបស់អ្នក',
  'Checking latest release...': 'កំពុងពិនិត្យកំណែចុងក្រោយ...',
  'Control-click Kaur Khor, choose Open, then confirm Open.': 'Control-click លើ កខ ជ្រើស Open រួចបញ្ជាក់ Open។',
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
  'If you choose a deb file, install it with your package manager.': 'បើអ្នកជ្រើសឯកសារ deb សូមដំឡើងវាជាមួយកម្មវិធីគ្រប់គ្រងកញ្ចប់របស់អ្នក។',
  'Import backups': 'នាំចូលបេកអាប់',
  'Inspect the code': 'ពិនិត្យកូដ',
  'Inspect the source on the': 'ពិនិត្យកូដប្រភពនៅលើ',
  'It detects your computer and installs': 'វាស្គាល់កុំព្យូទ័ររបស់អ្នក ហើយដំឡើង',
  'iOS app is not supported': 'iOS អេបមិនទាន់គាំទ្រទេ',
  'iOS app is not supported. Use the browser app instead.': 'iOS អេបមិនទាន់គាំទ្រទេ។ សូមប្រើអេបក្នុងប្រោសឺរជំនួសវិញ។',
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
  'Mark AppImages executable before opening them.': 'កំណត់ឯកសារ AppImage ឱ្យអាចដំណើរការបាន មុនបើកវា។',
  'No sign-up or login. Your data stays on your device.': 'មិនចាំបាច់ចុះឈ្មោះ ឬចូលគណនីទេ។ ទិន្នន័យរបស់អ្នកនៅលើឧបករណ៍របស់អ្នក។',
  'Not your real workspace': 'មិនមែនកន្លែងធ្វើការពិតរបស់អ្នក',
  'Operator-facing Kaur Khor features': 'មុខងារ កខ សម្រាប់អ្នកប្រតិបត្តិការ',
  'official GitHub page': 'ទំព័រ GitHub ផ្លូវការ',
  'Official source page': 'ទំព័រកូដប្រភពផ្លូវការ',
  'Open the DMG and drag Kaur Khor to Applications if prompted.': 'បើក DMG ហើយអូស កខ ទៅ Applications បើមានសារ។',
  'Open the Terminal app.': 'បើក Terminal អេប។',
  'for your platform.': 'សម្រាប់ប្រព័ន្ធរបស់អ្នក។',
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
  'Search Products': 'ស្វែងរកទំនិញ',
  'See the main workflow': 'មើលលំហូរការងារសំខាន់',
  'Set up language, currency, and interface preferences': 'ជ្រើសរើសភាសា រូបិយប័ណ្ណ និងចំណូលចិត្តអេប',
  'Screenshot carousel': 'រូបភាពបង្ហាញកម្មវិធី',
  'Show Business health': 'បង្ហាញសុខភាពអាជីវកម្ម',
  'Show Customer queue': 'បង្ហាញជួរអតិថិជន',
  'Show Products': 'បង្ហាញទំនិញ',
  'Show Insights': 'បង្ហាញការយល់ដឹង',
  'Show Mission Control': 'បង្ហាញផ្ទាំងបញ្ជា',
  'Show Point-of-Sale and updates': 'បង្ហាញការលក់ផ្ទាល់ និងអាប់ដេត',
  'Show Stock count': 'បង្ហាញការរាប់ស្តុក',
  'Show Supplier queue': 'បង្ហាញជួរអ្នកផ្គត់ផ្គង់',
  'Source Build': 'សាងសង់ពីកូដប្រភព',
  'Start in': 'ចាប់ផ្តើមក្នុង',
  'Start in the browser': 'ចាប់ផ្តើមក្នុងប្រោសឺរ',
  'Start Quick': 'ចាប់ផ្តើមរហ័ស',
  'Start Quick Demo': 'ចាប់ផ្តើមសាកល្បងរហ័ស',
  'desktop app': 'ដេសថបអេប',
  'the browser': 'ប្រោសឺរ',
  'The app you build may still show safety prompts': 'អេបដែលអ្នកសាងសង់អាចនៅតែបង្ហាញសារសុវត្ថិភាព',
  'To choose a native build explicitly, pass a platform flag such as': 'បើចង់ជ្រើសគោលដៅសាងសង់ក្នុងម៉ាស៊ីនច្បាស់ៗ សូមបន្ថែមជម្រើសប្រព័ន្ធដូចជា',
  'Track Customer Orders': 'តាមដានការបញ្ជាទិញរបស់អតិថិជន',
  'Try sample data': 'សាកល្បងទិន្នន័យគំរូ',
  'Try sample shelves': 'សាកល្បងធ្នើគំរូ',
  'Use it in this browser': 'ប្រើវាក្នុងប្រោសឺរនេះ',
  'Open browser app': 'បើកអេបក្នុងប្រោសឺរ',
  'View logs': 'មើលកំណត់ហេតុ',
  'What you get:': 'អ្វីដែលអ្នកទទួលបាន៖',
  'Windows install notes': 'កំណត់សម្គាល់ដំឡើង Windows',
  'Windows x64 installer': 'Windows x64 installer',
  'YouTube tutorial for opening macOS app from unidentified developer': 'វីដេអូណែនាំការបើក macOS អេប ពីអ្នកអភិវឌ្ឍន៍មិនស្គាល់',
  'Your computer may show safety prompts': 'កុំព្យូទ័ររបស់អ្នកអាចបង្ហាញសារសុវត្ថិភាព',
  yourself: 'ដោយខ្លួនឯង',
  'A warm, local-first inventory desk for small teams: try sample shelves in the browser, keep real browser data local when OPFS is available, or install the desktop app for the full offline runtime.':
    'អេបស្តុកក្នុងម៉ាស៊ីនសម្រាប់ក្រុមតូច៖ សាកល្បងទិន្នន័យគំរូក្នុងប្រោសឺរ រក្សាទិន្នន័យប្រោសឺរពិតក្នុងម៉ាស៊ីនពេល OPFS អាចប្រើបាន ឬដំឡើងដេសថបអេបសម្រាប់ប្រើក្រៅបណ្ដាញពេញលេញ។',
  'Kaur Khor mission control overview showing the main work queue':
    'រូបភាពផ្ទាំងបញ្ជា កខ បង្ហាញជួរការងារសំខាន់',
  'Kaur Khor supplier queue showing supplier follow-up work':
    'រូបភាពជួរអ្នកផ្គត់ផ្គង់ កខ បង្ហាញការងារតាមដានអ្នកផ្គត់ផ្គង់',
  'Kaur Khor customer queue showing customer order follow-up work':
    'រូបភាពជួរអតិថិជន កខ បង្ហាញការងារតាមដានការបញ្ជាទិញអតិថិជន',
  'Kaur Khor products view showing searchable SKUs and services':
    'រូបភាពទំនិញ កខ បង្ហាញទំនិញ និងសេវាកម្មដែលអាចស្វែងរកបាន',
  'Kaur Khor record update workflow for stock and order changes':
    'រូបភាពលំហូរអាប់ដេតកំណត់ត្រា កខ សម្រាប់ការផ្លាស់ប្តូរស្តុក និងការបញ្ជាទិញ',
  'Kaur Khor stock count capture session for physical inventory counts':
    'រូបភាពវគ្គកត់ត្រារាប់ស្តុក កខ សម្រាប់ចំនួនស្តុកជាក់ស្តែង',
  'Kaur Khor customer order capture session for pending customer demand':
    'រូបភាពវគ្គកត់ត្រាការបញ្ជាទិញអតិថិជន កខ សម្រាប់តម្រូវការអតិថិជនកំពុងរង់ចាំ',
  'Kaur Khor business health dashboard showing pressure and diagnostics':
    'រូបភាពផ្ទាំងសុខភាពអាជីវកម្ម កខ បង្ហាញសម្ពាធ និងការពិនិត្យបញ្ហា',
  'Kaur Khor analysis workspace showing inventory insight tools':
    'រូបភាពកន្លែងវិភាគ កខ បង្ហាញឧបករណ៍យល់ដឹងអំពីស្តុក',
  'Building locally avoids downloading a prebuilt app, but it does not magically make software safe.':
    'ការសាងសង់នៅលើម៉ាស៊ីនផ្ទាល់ជៀសវាងការទាញយកអេបដែលបានសាងសង់រួច ប៉ុន្តែមិនធ្វើឱ្យកម្មវិធីមានសុវត្ថិភាពដោយស្វ័យប្រវត្តិទេ។',
  'Verify SHA256SUMS when available and keep normal OS safety prompts on.':
    'ផ្ទៀងផ្ទាត់ SHA256SUMS ពេលមាន ហើយរក្សាសារសុវត្ថិភាពធម្មតារបស់ប្រព័ន្ធប្រតិបត្តិការឱ្យនៅដដែល។',
  'when available, and do not run copies from mirrors or reposts.':
    'ពេលមាន ហើយកុំដំណើរការច្បាប់ចម្លងពីប្រភពចម្លង ឬការបង្ហោះឡើងវិញ។',
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
  { icon: Search, label: 'Search Products', tone: 'bg-[#65A30D] text-white' },
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
    benefits: [
      { icon: PackageCheck, label: 'Try sample shelves' },
      { icon: ScanLine, label: 'See the main workflow' },
      { icon: RefreshCcw, label: 'Reset anytime' },
    ],
    drawbacks: [
      ...sharedProductDrawbacks,
      { icon: EyeOff, label: 'Not your real workspace' },
    ],
    href: publicPath('/demo#/onboarding'),
    icon: CirclePlay,
    summary: 'Try sample data',
    title: 'Demo',
    tone: 'demo',
  },
  {
    action: 'Start in the browser',
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
    href: publicPath('/app#/onboarding'),
    icon: Globe,
    includes: 'Everything in Demo and:',
    summary: 'Use it in this browser',
    title: 'Browser App',
    tone: 'browser',
  },
  {
    action: 'Install the desktop app',
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
      return 'border-[#D97706]/35 bg-[#D97706]/[0.08]';
    case 'browser':
      return 'border-[#2563EB]/35 bg-[#2563EB]/[0.08]';
    case 'desktop':
      return 'border-[#9333EA]/35 bg-[#9333EA]/[0.08]';
    case 'source-build':
      return 'border-[#475569]/35 bg-[#475569]/[0.08]';
  }
}

function productCardInteractionStyle(tone: ProductCardTone) {
  const accents: Record<ProductCardTone, { accent: string; glow: string }> = {
    demo: {
      accent: '#D97706',
      glow: 'rgba(217, 119, 6, 0.16)',
    },
    browser: {
      accent: '#2563EB',
      glow: 'rgba(37, 99, 235, 0.15)',
    },
    desktop: {
      accent: '#9333EA',
      glow: 'rgba(147, 51, 234, 0.15)',
    },
    'source-build': {
      accent: '#475569',
      glow: 'rgba(71, 85, 105, 0.16)',
    },
  };
  const { accent, glow } = accents[tone];
  return {
    '--product-card-accent': accent,
    '--product-card-glow': glow,
    '--product-card-pointer-x': '50%',
    '--product-card-pointer-y': '50%',
  } as CSSProperties;
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
  if (userAgentDataPlatform.includes('android')) {
    return 'android';
  }
  if (userAgentDataPlatform.includes('ios') || userAgentDataPlatform.includes('ipados')) {
    return 'ios';
  }
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

  if (platformSignal.includes('android')) {
    return 'android';
  }
  if (/\b(iphone|ipad|ipod)\b/.test(platformSignal) || (platform.includes('mac') && navigator.maxTouchPoints > 1)) {
    return 'ios';
  }
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
    .map((asset) => {
      const info = releaseAssetInfo(asset.name);
      return {
        asset,
        label: info.label,
        platform: info.platform,
      };
    })
    .sort((first, second) => first.label.localeCompare(second.label));
}

function releaseAssetInfo(assetName: string): ReleaseAssetInfo {
  const match = /^(?:kaur[.-]khor)-v?(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)-(darwin|linux|mac|win(?:32)?|windows)-(aarch64|amd64|arm64|x64|x86_64)\.(appimage|deb|dmg|exe)$/i.exec(assetName);
  if (!match) {
    return { label: assetName, platform: 'other' };
  }

  const [, version, os, arch, extension] = match;
  const normalizedOs = os.toLowerCase();
  const normalizedArch = arch.toLowerCase();
  const normalizedExtension = extension.toLowerCase();

  if ((normalizedOs === 'darwin' || normalizedOs === 'mac') && normalizedExtension === 'dmg') {
    return {
      label: `Kaur Khor v${version} - ${normalizedArch === 'arm64' || normalizedArch === 'aarch64' ? 'macOS Apple Silicon DMG' : 'macOS Intel DMG'}`,
      platform: normalizedArch === 'arm64' || normalizedArch === 'aarch64' ? 'mac-arm64' : 'mac-x64',
    };
  }
  if ((normalizedOs === 'win' || normalizedOs === 'win32' || normalizedOs === 'windows') && normalizedExtension === 'exe') {
    return {
      label: `Kaur Khor v${version} - Windows x64 installer`,
      platform: 'windows-x64',
    };
  }
  if (normalizedOs === 'linux') {
    const isArm = normalizedArch === 'arm64' || normalizedArch === 'aarch64';
    const packageLabel = normalizedExtension === 'deb' ? 'deb package' : 'AppImage';
    return {
      label: `Kaur Khor v${version} - Linux ${isArm ? 'ARM64' : 'x64'} ${packageLabel}`,
      platform: isArm ? 'linux-arm64' : 'linux-x64',
    };
  }
  return { label: assetName, platform: 'other' };
}

function describeDetectedPlatform(platform: DetectedPlatform) {
  switch (platform) {
    case 'android':
      return 'Android app is not supported';
    case 'ios':
      return 'iOS app is not supported';
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
  if (platform === 'android' || platform === 'ios' || platform === 'unknown') {
    return null;
  }
  return options.find((option) => option.platform === platform) ?? null;
}

function guideForDownloadPlatform(platform: DetectedPlatform | DownloadOption['platform']): ReleaseInstallGuide {
  switch (platform) {
    case 'android':
      return {
        steps: [
          'Android app is not supported. Use the browser app instead.',
          { href: publicPath('/app'), label: 'Open browser app' },
        ],
        title: 'Android app is not supported',
      };
    case 'ios':
      return {
        steps: [
          'iOS app is not supported. Use the browser app instead.',
          { href: publicPath('/app'), label: 'Open browser app' },
        ],
        title: 'iOS app is not supported',
      };
    case 'mac-arm64':
    case 'mac-x64':
      return {
        steps: [
          'Open the DMG and drag Kaur Khor to Applications if prompted.',
          'Control-click Kaur Khor, choose Open, then confirm Open.',
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

function scheduleIdle(callback: () => void) {
  const idleWindow = window as Window & {
    cancelIdleCallback?: (handle: number) => void;
    requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
  };
  if (idleWindow.requestIdleCallback && idleWindow.cancelIdleCallback) {
    const idleId = idleWindow.requestIdleCallback(callback, { timeout: 1500 });
    return () => idleWindow.cancelIdleCallback?.(idleId);
  }

  const timeoutId = window.setTimeout(callback, 450);
  return () => window.clearTimeout(timeoutId);
}

function preloadLandingScreenshot(src: string) {
  const image = new window.Image();
  image.decoding = 'async';
  image.src = src;
}

function useDocumentVisible() {
  const [isVisible, setIsVisible] = useState(() => document.visibilityState !== 'hidden');

  useEffect(() => {
    const handleVisibilityChange = () => setIsVisible(document.visibilityState !== 'hidden');
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return isVisible;
}

function usePrefersReducedMotion() {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(true);

  useEffect(() => {
    const mediaQuery = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!mediaQuery) {
      setPrefersReducedMotion(false);
      return undefined;
    }

    const handleChange = () => setPrefersReducedMotion(mediaQuery.matches);
    handleChange();
    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  return prefersReducedMotion;
}

function useElementVisible<T extends Element>() {
  const elementRef = useRef<T | null>(null);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !('IntersectionObserver' in window)) {
      return undefined;
    }

    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(Boolean(entry?.isIntersecting));
    }, { rootMargin: '160px 0px', threshold: 0.08 });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [elementRef, isVisible] as const;
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
                  {landingText(language, 'KAUR KHOR')}
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
        <section id="build-from-source" className="w-full max-w-full scroll-mt-20 border-t border-border/70 py-14 [contain-intrinsic-size:auto_48rem] [content-visibility:auto]">
          <div className="mx-4 grid min-w-0 max-w-full gap-6 overflow-hidden rounded-[1.35rem] border border-border/70 bg-card/70 p-6 shadow-panel sm:mx-8 xl:mx-12">
            <div className="min-w-0">
              <p className={cn('text-xs font-semibold text-muted-foreground', language === 'km' ? 'tracking-normal' : 'uppercase tracking-[0.16em]')}>{landingText(language, 'Advanced users')}</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-normal">{landingText(language, 'Build From Source')}</h2>
              <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
                {landingText(language, 'Inspect the source on the')} <a className="font-medium text-foreground underline decoration-border underline-offset-4 hover:text-primary" href={sourceUrl} rel="noreferrer" target="_blank">{landingText(language, 'official GitHub page')}</a> {landingText(language, 'and run')} <code className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">scripts/build-from-source.sh</code> {landingText(language, 'for your platform.')} {landingText(language, 'It detects your computer and installs')} {landingText(language, 'build dependencies before packaging Kaur Khor.')} {landingText(language, 'Building locally avoids downloading a prebuilt app, but it does not magically make software safe.')}
              </p>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-muted-foreground">
                {landingText(language, 'To choose a native build explicitly, pass a platform flag such as')} <code className="rounded-md bg-muted px-1.5 py-0.5 text-foreground">./scripts/build-from-source.sh --platform=linux-x64</code>.
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
            <SourceBuildSnippet language={language} />
          </div>
        </section>
      </main>
    </div>
  );
}

function WorkshopIllustration({ language }: { language: AppLanguage }) {
  const [frameRef, isFrameVisible] = useElementVisible<HTMLDivElement>();
  const isDocumentVisible = useDocumentVisible();
  const prefersReducedMotion = usePrefersReducedMotion();
  const [activeSlide, setActiveSlide] = useState(0);
  const activeSlideItem = screenshotSlides[activeSlide] ?? screenshotSlides[0]!;
  const shouldAdvanceSlides = isFrameVisible && isDocumentVisible && !prefersReducedMotion;

  useEffect(() => {
    if (!shouldAdvanceSlides) {
      return undefined;
    }
    const intervalId = window.setInterval(() => {
      setActiveSlide((current) => (current + 1) % screenshotSlides.length);
    }, 4500);
    return () => window.clearInterval(intervalId);
  }, [shouldAdvanceSlides]);

  useEffect(() => {
    if (!shouldAdvanceSlides) {
      return undefined;
    }
    const nextSlide = screenshotSlides[(activeSlide + 1) % screenshotSlides.length];
    if (!nextSlide) {
      return undefined;
    }
    return scheduleIdle(() => preloadLandingScreenshot(nextSlide.image));
  }, [activeSlide, shouldAdvanceSlides]);

  return (
    <div ref={frameRef} className="relative overflow-hidden rounded-[1.45rem] border border-border/70 bg-card p-4 shadow-panel">
      <div className="absolute inset-0 paper-grid opacity-45" aria-hidden="true" />
      <div className="relative grid gap-3">
        <div className="relative aspect-[3456/1984] overflow-hidden rounded-[1.05rem] shadow-float ring-1 ring-border/50">
          <img
            key={activeSlideItem.label}
            alt={landingText(language, activeSlideItem.alt)}
            className="absolute inset-0 h-full w-full object-cover"
            decoding="async"
            height={activeSlideItem.height}
            loading={activeSlide === 0 ? 'eager' : 'lazy'}
            src={activeSlideItem.image}
            width={activeSlideItem.width}
          />
        </div>
        <div className="mx-auto flex w-fit gap-1.5 rounded-full border border-border/70 bg-card/95 px-3 py-2 shadow-panel backdrop-blur" aria-label={landingText(language, 'Screenshot carousel')}>
          {screenshotSlides.map((item, index) => (
            <button
              key={item.label}
              aria-label={landingText(language, `Show ${item.label}`)}
                className={`size-2.5 rounded-full transition-colors ${index === activeSlide ? 'bg-primary' : 'bg-muted-foreground/25'}`}
                aria-current={index === activeSlide ? 'true' : undefined}
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
        <div className="flex w-max items-center motion-safe:animate-[kaur-khor-teams-rail_68s_linear_infinite] motion-reduce:w-full motion-reduce:flex-wrap">
          {railGroups.map((group, groupIndex) => (
            <div
              key={groupIndex}
              aria-label={groupIndex === 0 ? landingText(language, 'Operator-facing Kaur Khor features') : undefined}
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
  const sectionRef = useRef<HTMLElement | null>(null);
  const releaseControllerRef = useRef<AbortController | null>(null);
  const hasStartedLoadRef = useRef(false);
  const [downloadState, setDownloadState] = useState<ReleaseDownloadState>({
    detectedPlatform: 'unknown',
    error: null,
    options: [],
    releaseName: null,
    status: 'idle',
  });
  const [selectedAssetName, setSelectedAssetName] = useState('');

  function startReleaseDownloads() {
    if (hasStartedLoadRef.current) {
      return;
    }
    hasStartedLoadRef.current = true;
    const controller = new AbortController();
    releaseControllerRef.current = controller;
    setDownloadState((current) => ({ ...current, status: 'loading' }));

    void (async () => {
      const detectedPlatform = await detectDownloadPlatform();
      try {
        const release = await fetchLatestRelease(controller.signal);
        if (controller.signal.aborted) {
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
        if (controller.signal.aborted) {
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
    })();
  }

  useEffect(() => {
    return () => releaseControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    const startWhenHashMatches = () => {
      if (window.location.hash === '#releases') {
        startReleaseDownloads();
      }
    };

    startWhenHashMatches();
    window.addEventListener('hashchange', startWhenHashMatches);

    const section = sectionRef.current;
    let observer: IntersectionObserver | null = null;
    if (section && 'IntersectionObserver' in window) {
      observer = new IntersectionObserver((entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          startReleaseDownloads();
          observer?.disconnect();
        }
      }, { rootMargin: '640px 0px' });
      observer.observe(section);
    }

    return () => {
      window.removeEventListener('hashchange', startWhenHashMatches);
      observer?.disconnect();
    };
  }, []);

  const selectedOption = downloadState.options.find((option) => option.asset.name === selectedAssetName) ?? null;
  const isMobileDetectedPlatform = downloadState.detectedPlatform === 'android' || downloadState.detectedPlatform === 'ios';
  const platformDescription = describeDetectedPlatform(downloadState.detectedPlatform);
  const installGuide = guideForDownloadPlatform(isMobileDetectedPlatform ? downloadState.detectedPlatform : selectedOption?.platform ?? downloadState.detectedPlatform);
  const isLoading = downloadState.status === 'loading';
  const releaseStatusText = downloadState.status === 'error'
    ? landingText(language, 'Release downloads are unavailable right now.')
    : isMobileDetectedPlatform
      ? landingText(language, `${platformDescription}. Use the browser app instead.`)
    : language === 'km'
      ? `${landingText(language, platformDescription)}${downloadState.releaseName ? ` ${landingText(language, 'from')} ${downloadState.releaseName}` : ''}។`
      : `${platformDescription}${downloadState.releaseName ? ` from ${downloadState.releaseName}` : ''}.`;

  return (
    <section ref={sectionRef} id="releases" className="w-screen max-w-full border-t border-border/70 px-4 py-12 [contain-intrinsic-size:auto_42rem] [content-visibility:auto] sm:px-8 xl:px-12">
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
                  disabled={isLoading || downloadState.status === 'error' || isMobileDetectedPlatform}
                  onChange={(event) => setSelectedAssetName(event.target.value)}
                  onFocus={startReleaseDownloads}
                  onPointerDown={startReleaseDownloads}
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
  const actionButtonClassName = 'group/action relative isolate inline-flex min-h-12 w-full min-w-0 items-center justify-center gap-2 overflow-hidden rounded-xl border border-white/80 bg-white px-4 py-3 text-sm font-semibold text-foreground shadow-xs transition-[border-color,box-shadow,color] duration-200 before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_var(--product-card-pointer-x,50%)_var(--product-card-pointer-y,50%),var(--product-card-glow),transparent_58%)] before:opacity-0 before:content-[\'\'] hover:border-[color:var(--product-card-accent)] hover:bg-white focus-visible:border-[color:var(--product-card-accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/70 motion-safe:before:transition-opacity motion-safe:hover:before:opacity-100 motion-safe:focus-visible:before:opacity-100';
  const actionButtonContent = (
    <>
      <span className="relative z-10 min-w-0 max-w-full text-center leading-5 sm:whitespace-nowrap">{landingText(language, action)}</span>
      <ActionContinueIcon className="relative z-10 size-4 shrink-0 motion-safe:transition-transform motion-safe:duration-200 motion-safe:group-hover/action:translate-x-1 motion-safe:group-focus-visible/action:translate-x-1" />
    </>
  );
  function updatePointerPosition(event: PointerEvent<HTMLElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * 100;
    const pointerY = ((event.clientY - bounds.top) / bounds.height) * 100;
    event.currentTarget.style.setProperty('--product-card-pointer-x', `${pointerX.toFixed(2)}%`);
    event.currentTarget.style.setProperty('--product-card-pointer-y', `${pointerY.toFixed(2)}%`);
  }

  function resetPointerPosition(event: PointerEvent<HTMLElement>) {
    event.currentTarget.style.setProperty('--product-card-pointer-x', '50%');
    event.currentTarget.style.setProperty('--product-card-pointer-y', '50%');
  }

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
  );

  const className = cn(
    'liquid-grid-card-frame group relative block h-full min-h-0 min-w-0 overflow-hidden rounded-[1.15rem] border shadow-[0_16px_36px_rgba(48,31,20,0.08)] transition-[border-color,box-shadow] duration-200 before:pointer-events-none before:absolute before:inset-0 before:bg-white/12 before:content-[\'\'] after:pointer-events-none after:absolute after:inset-[1px] after:rounded-[calc(1.15rem-1px)] after:bg-[radial-gradient(circle_at_var(--product-card-pointer-x,50%)_var(--product-card-pointer-y,50%),var(--product-card-glow),rgba(255,255,255,0.08)_42%,rgba(255,255,255,0.20))] after:content-[\'\'] hover:z-10 hover:border-[color:var(--product-card-accent)] hover:shadow-[0_24px_54px_rgba(48,31,20,0.14)] focus-within:z-10 focus-within:border-[color:var(--product-card-accent)] focus-within:shadow-[0_24px_54px_rgba(48,31,20,0.14)] motion-safe:transition-[border-color,box-shadow,transform] motion-safe:hover:scale-[1.015] motion-safe:focus-within:scale-[1.015]',
    productCardSurfaceClassName(tone),
  );

  return (
    <article
      className={className}
      style={productCardInteractionStyle(tone)}
      onPointerLeave={resetPointerPosition}
      onPointerMove={updatePointerPosition}
    >
      {content}
    </article>
  );
}

function SourceBuildSnippet({ language }: { language: AppLanguage }) {
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

  const copyLabel = landingText(
    language,
    copyStatus === 'copied' ? 'Copied' : copyStatus === 'failed' ? 'Copy failed' : 'Copy',
  );
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
          Shell
        </span>
        <button
          aria-label={copyLabel}
          className="grid size-9 place-items-center rounded-lg text-background/90 transition-colors hover:bg-background/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-background/40"
          lang={language === 'km' ? 'km' : 'en'}
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

export function WebRoutes() {
  return (
    <Routes>
      <Route element={<HomeRoute />} path="/" />
      <Route element={<Navigate replace to="/" />} path="*" />
    </Routes>
  );
}
