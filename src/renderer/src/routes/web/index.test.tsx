const runtimeWebMocks = vi.hoisted(() => ({
  openBrowserStorage: vi.fn(),
}));

vi.mock('@/App', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/App')>();
  return {
    ...actual,
    default: () => null,
  };
});

vi.mock('@/runtime/web', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/runtime/web')>();
  return {
    ...actual,
    openBrowserStorage: runtimeWebMocks.openBrowserStorage,
  };
});

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { RESPONSIVE_PHONE_VIEWPORT_MAX_SCALE } from '@shared/responsive-zoom';
import { getBrowserDesktopBridgeMockState, setBrowserDesktopBridgeMockState } from '@/dev/browser-desktop-bridge';
import {
  KAUR_KHOR_BROWSER_APP_DATABASE,
  KAUR_KHOR_BROWSER_DEMO_DATABASE,
  type BrowserStorageDocumentRecord,
  type BrowserStorageJsonBackup,
  type BrowserStorageSupportedHandle,
  type BrowserStorageUnsupportedHandle,
} from '@/runtime/web';
import {
  BROWSER_WORKSPACE_CLOSE_WARNING,
  BROWSER_WORKSPACE_TELEGRAM_CLOSE_WARNING,
  browserWorkspaceCloseWarningMessage,
  EmbeddedAppBanner,
  EmbeddedAppRoute,
  EmbeddedAutoZoomViewport,
  fallbackStateForMode,
  formatBrowserStorageErrorMessage,
  installBrowserBeforeUnloadWarning,
  isBrowserTelegramLiveListening,
  normalizeBrowserStateForMode,
  PhoneViewWarningOverlay,
  WebRoutes,
} from './index';
import { buildPhoneQueueObservationInput, phoneSheetTaskForSupplierTask } from '../mobile';

const operatorFeatureLabels = [
  'Review Work Queue',
  'Run Point-of-Sale',
  'Count Stock',
  'Track Customer Orders',
  'Record Immediate Sales',
  'Place Supplier Orders',
  'Receive Supplier Orders',
  'Search Products',
  'Manage Products',
  'Manage Services',
  'Browse Archived Items',
  'Analyze Pressure',
  'Review Money',
  'Explain Inventory Signals',
  'Review Telegram Intake',
] as const;

const previousNounLabels = [
  'Work Queue',
  'Point-of-Sale Workbench',
  'Products Update',
  'Customer Orders',
  'Immediate Sales',
  'Supplier Orders',
  'Supplier Receipts',
  'Products Search',
  'Product SKUs',
  'Services',
  'Archived Items',
  'Pressure Analysis',
  'Money Workspace',
  'Explain Workspace',
  'Telegram Intake',
] as const;

const sharedProductBenefits = [
  'Free',
] as const;

const sharedProductDrawbacks = [
  'No sign-up or login. Your data stays on your device.',
] as const;
const releasesUrl = 'https://github.com/Svanny/kaur-khor/releases/latest';
const sourceUrl = 'https://github.com/Svanny/kaur-khor';

const productCardCopy = {
  actions: ['Start Quick Demo', 'Start in the browser', 'Install the desktop app', 'Build it yourself'],
  titles: ['Demo', 'Browser App', 'Desktop App', 'Source Build'],
  summaries: ['Try sample data', 'Use it in this browser', 'Install the full app', 'Build from source'],
  includes: [
    'Everything in Demo and:',
    'Everything in Browser App and:',
    'Everything in Desktop App and:',
  ],
  benefits: [
    'Try sample shelves',
    'See the main workflow',
    'Reset anytime',
    'Save real work in this browser',
    'Export backups',
    'Import backups',
    'Save work in local app files',
    'Make app snapshots',
    'Keep automation running',
    'Attach item images',
    'View logs',
    'Inspect the code',
    'Build the app yourself',
    'Avoid prebuilt downloads',
  ],
  drawbacks: [
    'Not your real workspace',
    'Browser cleanup can remove data',
    'Automatic checks only run while the tab is open',
    'Your computer may show safety prompts',
    'Need to use the Terminal app',
    'The app you build may still show safety prompts',
  ],
} as const;

const embeddedStorage = {
  databaseName: KAUR_KHOR_BROWSER_DEMO_DATABASE,
  handle: null,
  lastBackupAt: null,
  message: 'This demo uses a separate sample workspace.',
  persistence: 'unknown',
  sqliteVersion: 'pending',
  status: 'ready',
  vfs: 'opfs-sahpool',
} as const;
const hiddenPhoneOperatorHash = '#/__phone/7f4b0e2d-9a61-4f83-a61e-21d63bfb8e7c/';

function readBlobText(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(String(reader.result ?? '')));
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Failed to read blob.')));
    reader.readAsText(blob);
  });
}

const releaseAssets = [
  {
    browser_download_url: 'https://github.com/Svanny/kaur-khor/releases/download/v1.2.3/kaur-khor-v1.2.3-mac-arm64.dmg',
    name: 'kaur-khor-v1.2.3-mac-arm64.dmg',
  },
  {
    browser_download_url: 'https://github.com/Svanny/kaur-khor/releases/download/v1.2.3/kaur-khor-v1.2.3-mac-x64.dmg',
    name: 'kaur-khor-v1.2.3-mac-x64.dmg',
  },
  {
    browser_download_url: 'https://github.com/Svanny/kaur-khor/releases/download/v1.2.3/kaur-khor-v1.2.3-win-x64.exe',
    name: 'kaur-khor-v1.2.3-win-x64.exe',
  },
  {
    browser_download_url: 'https://github.com/Svanny/kaur-khor/releases/download/v1.2.3/kaur-khor-v1.2.3-linux-x64.AppImage',
    name: 'kaur-khor-v1.2.3-linux-x64.AppImage',
  },
  {
    browser_download_url: 'https://github.com/Svanny/kaur-khor/releases/download/v1.2.3/kaur-khor-v1.2.3-linux-arm64.AppImage',
    name: 'kaur-khor-v1.2.3-linux-arm64.AppImage',
  },
  {
    browser_download_url: 'https://github.com/Svanny/kaur-khor/releases/download/v1.2.3/kaur-khor-v1.2.3-linux-x64.deb',
    name: 'kaur-khor-v1.2.3-linux-x64.deb',
  },
  {
    browser_download_url: 'https://github.com/Svanny/kaur-khor/releases/download/v1.2.3/SHA256SUMS',
    name: 'SHA256SUMS',
  },
] as const;

const currentReleaseAssets = [
  {
    browser_download_url: 'https://github.com/Svanny/kaur-khor/releases/download/v0.2.3/KAUR.KHOR-0.2.3-linux-amd64.deb',
    name: 'KAUR.KHOR-0.2.3-linux-amd64.deb',
  },
  {
    browser_download_url: 'https://github.com/Svanny/kaur-khor/releases/download/v0.2.3/KAUR.KHOR-0.2.3-linux-arm64.AppImage',
    name: 'KAUR.KHOR-0.2.3-linux-arm64.AppImage',
  },
  {
    browser_download_url: 'https://github.com/Svanny/kaur-khor/releases/download/v0.2.3/KAUR.KHOR-0.2.3-linux-x86_64.AppImage',
    name: 'KAUR.KHOR-0.2.3-linux-x86_64.AppImage',
  },
  {
    browser_download_url: 'https://github.com/Svanny/kaur-khor/releases/download/v0.2.3/KAUR.KHOR-0.2.3-mac-arm64.dmg',
    name: 'KAUR.KHOR-0.2.3-mac-arm64.dmg',
  },
  {
    browser_download_url: 'https://github.com/Svanny/kaur-khor/releases/download/v0.2.3/KAUR.KHOR-0.2.3-mac-x64.dmg',
    name: 'KAUR.KHOR-0.2.3-mac-x64.dmg',
  },
  {
    browser_download_url: 'https://github.com/Svanny/kaur-khor/releases/download/v0.2.3/KAUR.KHOR-0.2.3-win-x64.exe',
    name: 'KAUR.KHOR-0.2.3-win-x64.exe',
  },
] as const;

beforeEach(() => {
  mockViewport(1440, 900);
  window.location.hash = '';
  mockNavigator();
  mockReducedMotion(false);
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value: 'visible',
  });
  setBrowserDesktopBridgeMockState(fallbackStateForMode('app'));
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
});

afterEach(() => {
  vi.useRealTimers();
  runtimeWebMocks.openBrowserStorage.mockReset();
});

function renderWebHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <WebRoutes />
    </MemoryRouter>,
  );
}

function renderWebPath(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <WebRoutes />
    </MemoryRouter>,
  );
}

function switchLandingToKhmer() {
  fireEvent.click(screen.getByRole('combobox', { name: 'Choose your language' }));
  fireEvent.click(screen.getByRole('option', { name: /Khmer/ }));
}

function getProductCardsSection(container: HTMLElement) {
  const section = container.querySelector('#ways-to-start');
  expect(section).not.toBeNull();
  return section as HTMLElement;
}

function getBuildFromSourceSection(container: HTMLElement) {
  const section = container.querySelector('#build-from-source');
  expect(section).not.toBeNull();
  return section as HTMLElement;
}

function mockLatestReleaseFetch(assets: readonly { browser_download_url: string; name: string }[] = releaseAssets, tagName = 'v1.2.3') {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({
      assets,
      tag_name: tagName,
    }),
  })));
}

function mockLatestReleasePayload(payload: unknown) {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => payload,
  })));
}

function mockFailedReleaseFetch() {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: false,
    status: 403,
  })));
}

function mockNavigator({
  platform = 'unknown',
  userAgent = 'unknown',
  userAgentData,
}: {
  platform?: string;
  userAgent?: string;
  userAgentData?: {
    getHighEntropyValues?: (hints: string[]) => Promise<{ architecture?: string }>;
    platform?: string;
  };
} = {}) {
  Object.defineProperty(window.navigator, 'platform', {
    configurable: true,
    value: platform,
  });
  Object.defineProperty(window.navigator, 'userAgent', {
    configurable: true,
    value: userAgent,
  });
  Object.defineProperty(window.navigator, 'userAgentData', {
    configurable: true,
    value: userAgentData,
  });
}

function createSupportedBrowserStorageHandle(
  initialRecords: BrowserStorageDocumentRecord[] = [],
): BrowserStorageSupportedHandle {
  const records = [...initialRecords];
  return {
    status: 'supported',
    capability: {
      status: 'supported',
      preferredVfs: 'opfs-sahpool',
      databaseNames: {
        app: KAUR_KHOR_BROWSER_APP_DATABASE,
        demo: KAUR_KHOR_BROWSER_DEMO_DATABASE,
      },
      reasons: [],
      details: {
        hasWorker: true,
        hasWebAssembly: true,
        hasNavigatorStorage: true,
        hasOpfsDirectory: true,
        isSecureContext: true,
        crossOriginIsolated: true,
      },
    },
    init: {
      databaseName: KAUR_KHOR_BROWSER_APP_DATABASE,
      filename: 'kaur-khor-browser-app.sqlite3',
      sqliteVersion: '3.46.1',
      vfs: 'opfs-sahpool',
    },
    listDocuments: vi.fn(async (collection?: string) => (
      collection ? records.filter((record) => record.collection === collection) : [...records]
    )),
    putDocuments: vi.fn(async (nextRecords: BrowserStorageDocumentRecord[]) => {
      for (const nextRecord of nextRecords) {
        const index = records.findIndex((record) => record.collection === nextRecord.collection && record.id === nextRecord.id);
        if (index >= 0) {
          records[index] = nextRecord;
        } else {
          records.push(nextRecord);
        }
      }
      return nextRecords.length;
    }),
    exportBackup: vi.fn(async () => {
      const backup: BrowserStorageJsonBackup = {
        format: 'kaur-khor.browser.storage.backup',
        version: 1,
        databaseName: KAUR_KHOR_BROWSER_APP_DATABASE,
        schemaVersion: 1,
        exportedAt: '2026-05-05T00:00:00.000Z',
        records: [...records],
      };
      return backup;
    }),
    importBackup: vi.fn(async (backup) => {
      records.splice(0, records.length, ...backup.records);
      return backup.records.length;
    }),
    persistSenaState: vi.fn(async () => 1),
    clear: vi.fn(async () => {
      records.splice(0, records.length);
    }),
    seedDemo: vi.fn(async () => 0),
    close: vi.fn(),
  };
}

function createUnsupportedBrowserStorageHandle(): BrowserStorageUnsupportedHandle {
  return {
    status: 'unsupported',
    capability: {
      status: 'unsupported',
      preferredVfs: 'opfs-sahpool',
      databaseNames: {
        app: KAUR_KHOR_BROWSER_APP_DATABASE,
        demo: KAUR_KHOR_BROWSER_DEMO_DATABASE,
      },
      reasons: ['OPFS access handles are unavailable.'],
      details: {
        hasWorker: true,
        hasWebAssembly: true,
        hasNavigatorStorage: true,
        hasOpfsDirectory: false,
        isSecureContext: true,
        crossOriginIsolated: true,
      },
    },
  };
}

function createOnboardedBrowserStorageHandle(mode: 'app' | 'demo') {
  const state = fallbackStateForMode(mode);
  state.preferences.onboardingCompletedAt = '2026-05-05T00:00:00.000Z';
  const databaseName = mode === 'demo' ? KAUR_KHOR_BROWSER_DEMO_DATABASE : KAUR_KHOR_BROWSER_APP_DATABASE;
  return createSupportedBrowserStorageHandle([
    {
      collection: 'browser_state',
      id: databaseName,
      json: state,
      updatedAt: '2026-05-05T00:00:00.000Z',
    },
  ]);
}

test('normalizes partially persisted browser state before bridge hydration', () => {
  const fallback = fallbackStateForMode('app');
  const validSkuDetail = {
    demandPosterior: [],
    inventoryPosterior: [],
    leadTimePosterior: [],
    pipelinePosterior: [],
    summary: {},
  };
  const validServiceDetail = {
    contributors: [],
    regimeTimeline: [],
    serviceId: 'service-valid',
  };
  const normalized = normalizeBrowserStateForMode('app', {
    ...fallback,
    automation: {
      ...fallback.automation,
      conversations: undefined as never,
      exposures: undefined as never,
      intakes: undefined as never,
      metrics: undefined as never,
    },
    automationMessages: {
      'conv-dirty': { messageId: 'not-an-array' },
      'conv-mixed': [
        null,
        {
          conversationId: 'conv-mixed',
          direction: 'inbound',
          externalMessageKey: 'telegram-1',
          messageId: 'message-1',
          normalizedText: 'hello',
          parseConfidence: null,
          rawText: 'hello',
          sentAt: '2026-05-05T00:00:00.000Z',
        },
      ],
    } as never,
    browserTelegramToken: 42 as never,
    browserTelegramUpdateOffset: Number.NaN,
    catalog: {
      ...fallback.catalog,
      bundles: undefined as never,
      services: undefined as never,
      sharingMask: undefined as never,
      skus: undefined as never,
    },
    observations: undefined as never,
    orderBatches: undefined as never,
    serviceDetails: {
      dirty: {},
      'service-valid': validServiceDetail,
    } as never,
    skuDetails: {
      dirty: {},
      'sku-valid': validSkuDetail,
    } as never,
  });

  expect(normalized.automation.conversations).toEqual(fallback.automation.conversations);
  expect(normalized.automation.exposures).toEqual(fallback.automation.exposures);
  expect(normalized.automation.intakes).toEqual(fallback.automation.intakes);
  expect(normalized.automation.metrics).toEqual(fallback.automation.metrics);
  expect(normalized.automationMessages).toEqual({
    'conv-mixed': [{
      conversationId: 'conv-mixed',
      direction: 'inbound',
      externalMessageKey: 'telegram-1',
      messageId: 'message-1',
      normalizedText: 'hello',
      parseConfidence: null,
      rawText: 'hello',
      sentAt: '2026-05-05T00:00:00.000Z',
    }],
  });
  expect(normalized.browserTelegramToken).toBeNull();
  expect(normalized.browserTelegramUpdateOffset).toBeNull();
  expect(normalized.catalog.bundles).toEqual(fallback.catalog.bundles);
  expect(normalized.catalog.services).toEqual(fallback.catalog.services);
  expect(normalized.catalog.sharingMask).toEqual(fallback.catalog.sharingMask);
  expect(normalized.catalog.skus).toEqual(fallback.catalog.skus);
  expect(normalized.observations).toEqual(fallback.observations);
  expect(normalized.orderBatches).toEqual(fallback.orderBatches);
  expect(normalized.serviceDetails).toEqual({ 'service-valid': validServiceDetail });
  expect(normalized.skuDetails).toEqual({ 'sku-valid': validSkuDetail });
});

function mockViewport(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width,
  });
  Object.defineProperty(window, 'innerHeight', {
    configurable: true,
    writable: true,
    value: height,
  });
  Object.defineProperty(window, 'visualViewport', {
    configurable: true,
    value: {
      addEventListener: vi.fn(),
      height,
      removeEventListener: vi.fn(),
      width,
    },
  });
}

function mockReducedMotion(matches: boolean) {
  const matchMedia = vi.fn((query: string) => ({
    addEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    matches,
    media: query,
    onchange: null,
    removeEventListener: vi.fn(),
  }));
  vi.stubGlobal('matchMedia', matchMedia);
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: matchMedia,
  });
}

async function expectRecommendedDownload(expectedAssetName: string, expectedHref: string) {
  const select = await screen.findByLabelText('Download') as HTMLSelectElement;
  fireEvent.focus(select);
  await waitFor(() => expect(select.value).toBe(expectedAssetName));
  expect(screen.getByRole('link', { name: /Download selected/i })).toHaveAttribute('href', expectedHref);
  return select;
}

async function startReleaseDownloadLoad() {
  const select = await screen.findByLabelText('Download') as HTMLSelectElement;
  fireEvent.focus(select);
  return select;
}

describe('WebRoutes landing rail', () => {
  test('renders a top-right language selector for the browser main page', () => {
    const { container } = renderWebHome();

    const languageSelect = screen.getByRole('combobox', { name: 'Choose your language' });

    expect(languageSelect).toHaveTextContent('English');
    expect(container.querySelector('[data-language="en"]')).not.toBeNull();

    fireEvent.click(languageSelect);
    fireEvent.click(screen.getByRole('option', { name: /Khmer/ }));

    expect(screen.getByRole('combobox', { name: 'Choose your language' })).toHaveTextContent('ខ្មែរ');
    expect(container.querySelector('[data-language="km"]')).not.toBeNull();
  });

  test('translates the visible landing page copy into Khmer', () => {
    const { container } = renderWebHome();

    switchLandingToKhmer();

    expect(screen.getByRole('heading', { name: 'កខ' })).toBeInTheDocument();
    expect(screen.getByText(/អេបស្តុកក្នុងម៉ាស៊ីនសម្រាប់ក្រុមតូច/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ចាប់ផ្តើម' })).toBeInTheDocument();

    const cardsSection = getProductCardsSection(container);
    expect(cardsSection).toHaveTextContent('អេបក្នុងប្រោសឺរ');
    expect(cardsSection).not.toHaveTextContent('ជ្រើសរើសភាសា រូបិយប័ណ្ណ និងចំណូលចិត្តអេប');
    expect(cardsSection).toHaveTextContent('ចងចាំ៖');
    expect(cardsSection).toHaveTextContent('មិនចាំបាច់ចុះឈ្មោះ ឬចូលគណនីទេ។');
    expect(cardsSection).not.toHaveTextContent('ចូលប្រើវ៉ាយហ្វាយ');

    const releasesSection = container.querySelector('#releases');
    expect(releasesSection).not.toBeNull();
    expect(releasesSection).toHaveTextContent('ទាញយកដេសថបអេប');
    expect(releasesSection).toHaveTextContent('កំណត់សម្គាល់ដំឡើង');
    expect(releasesSection).toHaveTextContent('រក្សាសារសុវត្ថិភាពធម្មតារបស់ប្រព័ន្ធប្រតិបត្តិការ');
    expect(releasesSection).toHaveTextContent('ប្រភពចម្លង ឬការបង្ហោះឡើងវិញ');
    expect(releasesSection).not.toHaveTextContent('safety');
    expect(releasesSection).not.toHaveTextContent('mirror');
    expect(releasesSection).not.toHaveTextContent('repost');

    const buildSection = getBuildFromSourceSection(container);
    expect(buildSection).toHaveTextContent('ឧបករណ៍សាងសង់');
    expect(buildSection).toHaveTextContent('មិនធ្វើឱ្យកម្មវិធីមានសុវត្ថិភាពដោយស្វ័យប្រវត្តិទេ។');
    expect(within(buildSection).getByRole('button', { name: 'ចម្លង' })).toHaveAttribute('lang', 'km');
    expect(within(buildSection).queryByRole('button', { name: 'Copy' })).not.toBeInTheDocument();
    expect(buildSection).not.toHaveTextContent('dependency');
    expect(buildSection).not.toHaveTextContent('native build');
    expect(buildSection).not.toHaveTextContent('platform flag');
    expect(buildSection).not.toHaveTextContent('software');

    expect(screen.getByRole('img', { name: 'រូបភាពផ្ទាំងបញ្ជា កខ បង្ហាញជួរការងារសំខាន់' })).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: 'Kaur Khor mission control overview showing the main work queue' })).not.toBeInTheDocument();
  });

  test('renders every operator-facing feature once in the accessible rail', () => {
    renderWebHome();

    const rail = screen.getByRole('list', { name: 'Operator-facing Kaur Khor features' });
    const accessibleItems = within(rail).getAllByRole('listitem');

    expect(accessibleItems).toHaveLength(operatorFeatureLabels.length);
    for (const label of operatorFeatureLabels) {
      expect(rail).toHaveTextContent(label);
      expect(screen.getAllByText(label)).toHaveLength(2);
    }
  });

  test('keeps the marquee repeat hidden and removes POS copy from the landing page', () => {
    const { container } = renderWebHome();

    const hiddenRail = container.querySelector('[role="list"][aria-hidden="true"]');
    expect(hiddenRail).not.toBeNull();
    for (const label of operatorFeatureLabels) {
      expect(hiddenRail).toHaveTextContent(label);
    }
    expect(container).not.toHaveTextContent(/\bPOS\b/);
    expect(container).not.toHaveTextContent('Custom Capture');
    for (const label of previousNounLabels) {
      expect(screen.queryByText(label, { exact: true })).not.toBeInTheDocument();
    }
    expect(screen.getAllByText('Run Point-of-Sale')).toHaveLength(2);
  });

  test('does not auto-advance the screenshot carousel when reduced motion is requested', () => {
    vi.useFakeTimers();
    const setIntervalSpy = vi.spyOn(window, 'setInterval');
    mockReducedMotion(true);

    renderWebHome();

    expect(screen.getByRole('img', { name: 'Kaur Khor mission control overview showing the main work queue' })).toBeInTheDocument();
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  test('supports legacy reduced-motion media query listeners on the landing page', () => {
    const addListener = vi.fn();
    const removeListener = vi.fn();
    const matchMedia = vi.fn((query: string) => ({
      addListener,
      dispatchEvent: vi.fn(),
      matches: false,
      media: query,
      onchange: null,
      removeListener,
    }));
    vi.stubGlobal('matchMedia', matchMedia);
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: matchMedia,
    });

    const { unmount } = renderWebHome();

    expect(addListener).toHaveBeenCalledTimes(1);
    unmount();
    expect(removeListener).toHaveBeenCalledTimes(1);
  });

  test('exposes the active screenshot carousel slide', () => {
    renderWebHome();

    const missionControlButton = screen.getByRole('button', { name: 'Show Mission Control' });
    const catalogButton = screen.getByRole('button', { name: 'Show Products' });

    expect(missionControlButton).toHaveAttribute('aria-current', 'true');
    expect(catalogButton).not.toHaveAttribute('aria-current');

    fireEvent.click(catalogButton);

    expect(missionControlButton).not.toHaveAttribute('aria-current');
    expect(catalogButton).toHaveAttribute('aria-current', 'true');
  });
});

describe('WebRoutes releases section', () => {
  test('does not request release assets before the releases section is requested', () => {
    const fetchMock = vi.fn(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);

    renderWebHome();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('selects the macOS Apple Silicon DMG for macOS ARM browsers', async () => {
    mockLatestReleaseFetch();
    mockNavigator({
      userAgentData: {
        getHighEntropyValues: vi.fn(async () => ({ architecture: 'arm' })),
        platform: 'macOS',
      },
    });

    renderWebHome();

    const select = await expectRecommendedDownload(
      'kaur-khor-v1.2.3-mac-arm64.dmg',
      releaseAssets[0]!.browser_download_url,
    );
    expect(screen.getByText(/Recommended for macOS Apple Silicon from v1\.2\.3\./)).toBeInTheDocument();
    expect(select).toHaveTextContent('Kaur Khor v1.2.3 - macOS Apple Silicon DMG - recommended');
    expect(select).toHaveTextContent('Kaur Khor v1.2.3 - Linux x64 deb package');
    expect(screen.getByRole('link', { name: 'YouTube tutorial for opening macOS app from unidentified developer' })).toHaveAttribute(
      'href',
      'https://youtu.be/sLox8h-6BVw',
    );
  });

  test('selects the current macOS Apple Silicon DMG naming pattern', async () => {
    mockLatestReleaseFetch(currentReleaseAssets, 'v0.2.3');
    mockNavigator({
      userAgentData: {
        getHighEntropyValues: vi.fn(async () => ({ architecture: 'arm' })),
        platform: 'macOS',
      },
    });

    renderWebHome();

    await expectRecommendedDownload(
      'KAUR.KHOR-0.2.3-mac-arm64.dmg',
      currentReleaseAssets[3]!.browser_download_url,
    );
    expect(screen.getByRole('combobox', { name: 'Download' })).toHaveTextContent('macOS Apple Silicon DMG - recommended');
  });

  test('selects the macOS Intel DMG for macOS x64 browsers', async () => {
    mockLatestReleaseFetch();
    mockNavigator({
      userAgentData: {
        getHighEntropyValues: vi.fn(async () => ({ architecture: 'x86' })),
        platform: 'macOS',
      },
    });

    renderWebHome();

    await expectRecommendedDownload(
      'kaur-khor-v1.2.3-mac-x64.dmg',
      releaseAssets[1]!.browser_download_url,
    );
  });

  test('selects the Windows x64 installer for Windows browsers', async () => {
    mockLatestReleaseFetch();
    mockNavigator({
      userAgentData: {
        platform: 'Windows',
      },
    });

    renderWebHome();

    await expectRecommendedDownload(
      'kaur-khor-v1.2.3-win-x64.exe',
      releaseAssets[2]!.browser_download_url,
    );
  });

  test('selects the Linux x64 AppImage for Linux x64 browsers', async () => {
    mockLatestReleaseFetch();
    mockNavigator({
      platform: 'Linux x86_64',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
    });

    renderWebHome();

    await expectRecommendedDownload(
      'kaur-khor-v1.2.3-linux-x64.AppImage',
      releaseAssets[3]!.browser_download_url,
    );
  });

  test('selects the Linux ARM64 AppImage for Linux ARM64 browsers', async () => {
    mockLatestReleaseFetch();
    mockNavigator({
      userAgentData: {
        getHighEntropyValues: vi.fn(async () => ({ architecture: 'arm' })),
        platform: 'Linux',
      },
    });

    renderWebHome();

    await expectRecommendedDownload(
      'kaur-khor-v1.2.3-linux-arm64.AppImage',
      releaseAssets[4]!.browser_download_url,
    );
  });

  test('leaves the download unselected for unknown platforms', async () => {
    mockLatestReleaseFetch();
    mockNavigator();

    renderWebHome();

    const select = await startReleaseDownloadLoad();
    await waitFor(() => expect(select.value).toBe(''));
    expect(screen.queryByRole('link', { name: /Download selected/i })).not.toBeInTheDocument();
  });

  test('shows the browser app link instead of a desktop download for Android browsers', async () => {
    mockLatestReleaseFetch();
    mockNavigator({
      userAgentData: {
        platform: 'Android',
      },
    });

    renderWebHome();

    const select = await startReleaseDownloadLoad();
    await waitFor(() => expect(select).toBeDisabled());
    expect(select.value).toBe('');
    expect(screen.getByRole('heading', { name: 'Android app is not supported' })).toBeInTheDocument();
    expect(screen.getByText('Download is unavailable.')).toBeInTheDocument();
    expect(screen.getAllByText('Android app is not supported. Use the browser app instead.')).toHaveLength(1);
    expect(screen.getByText('Open the browser app, then use your browser menu to add Kaur Khor to your home screen.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open browser app' })).toHaveAttribute('href', '/app');
    expect(screen.queryByRole('link', { name: /Download selected/i })).not.toBeInTheDocument();
  });

  test('shows the browser app link instead of a desktop download for iOS browsers', async () => {
    mockLatestReleaseFetch();
    mockNavigator({
      platform: 'iPhone',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    });

    renderWebHome();

    const select = await startReleaseDownloadLoad();
    await waitFor(() => expect(select).toBeDisabled());
    expect(select.value).toBe('');
    expect(screen.getByRole('heading', { name: 'iOS app is not supported' })).toBeInTheDocument();
    expect(screen.getByText('Download is unavailable.')).toBeInTheDocument();
    expect(screen.getAllByText('iOS app is not supported. Use the browser app instead.')).toHaveLength(1);
    expect(screen.getByText('On iPhone or iPad, open the browser app in Safari, then use Share -> Add to Home Screen.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open browser app' })).toHaveAttribute('href', '/app');
    expect(screen.queryByRole('link', { name: /Download selected/i })).not.toBeInTheDocument();
  });

  test('renders mobile install guidance in Khmer', async () => {
    mockLatestReleaseFetch();
    mockNavigator({
      userAgentData: {
        platform: 'Android',
      },
    });

    renderWebHome();
    switchLandingToKhmer();

    const select = await screen.findByLabelText('ទាញយក') as HTMLSelectElement;
    fireEvent.focus(select);
    await waitFor(() => expect(select).toBeDisabled());

    expect(screen.getByText('Android អេបមិនទាន់គាំទ្រទេ។ សូមប្រើអេបក្នុងប្រោសឺរជំនួសវិញ។')).toBeInTheDocument();
    expect(screen.getByText('បើកអេបក្នុងប្រោសឺរ រួចប្រើមីនុយប្រោសឺរដើម្បីបន្ថែម កខ ទៅអេក្រង់ដើម។')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'បើកអេបក្នុងប្រោសឺរ' })).toHaveAttribute('href', '/app');
  });

  test('updates the download button when the dropdown changes', async () => {
    mockLatestReleaseFetch();
    mockNavigator({
      userAgentData: {
        platform: 'Windows',
      },
    });

    renderWebHome();

    const select = await startReleaseDownloadLoad();
    await waitFor(() => expect(select.value).toBe('kaur-khor-v1.2.3-win-x64.exe'));

    fireEvent.change(select, { target: { value: 'kaur-khor-v1.2.3-linux-arm64.AppImage' } });

    expect(screen.getByRole('link', { name: /Download selected/i })).toHaveAttribute(
      'href',
      releaseAssets[4]!.browser_download_url,
    );
  });

  test('ignores malformed and untrusted release assets from the GitHub response', async () => {
    mockLatestReleasePayload({
      assets: [
        {
          browser_download_url: 'javascript:alert(1)',
          name: 'kaur-khor-v1.2.3-win-x64.exe',
        },
        {
          browser_download_url: 'https://example.com/Svanny/kaur-khor/releases/download/v1.2.3/kaur-khor-v1.2.3-mac-arm64.dmg',
          name: 'kaur-khor-v1.2.3-mac-arm64.dmg',
        },
        {
          browser_download_url: 'https://github.com/Svanny/kaur-khor/releases/download/v1.2.3/kaur-khor-v1.2.3-linux-x64.AppImage',
          name: 'kaur-khor-v1.2.3-linux-x64.AppImage',
        },
        {
          browser_download_url: 42,
          name: 'kaur-khor-v1.2.3-linux-arm64.AppImage',
        },
      ],
      tag_name: 123,
    });
    mockNavigator({
      userAgentData: {
        platform: 'Linux',
      },
    });

    renderWebHome();

    const select = await startReleaseDownloadLoad();
    await waitFor(() => expect(select.value).toBe('kaur-khor-v1.2.3-linux-x64.AppImage'));

    expect(screen.getByRole('link', { name: /Download selected/i })).toHaveAttribute(
      'href',
      'https://github.com/Svanny/kaur-khor/releases/download/v1.2.3/kaur-khor-v1.2.3-linux-x64.AppImage',
    );
    expect(screen.queryByText(/Recommended for Linux x64 from/i)).not.toBeInTheDocument();
  });

  test('falls back to the latest release page when the release API fails', async () => {
    mockFailedReleaseFetch();
    mockNavigator({
      userAgentData: {
        platform: 'Windows',
      },
    });

    renderWebHome();

    await startReleaseDownloadLoad();
    expect(await screen.findByText('Release downloads are unavailable right now.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Download selected/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Open latest release/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'GitHub Releases' })).toHaveAttribute('href', releasesUrl);
  });

  test('includes merged install guidance on the landing releases section', () => {
    const { container } = renderWebHome();
    const releasesSection = container.querySelector('#releases');

    expect(releasesSection).not.toBeNull();
    expect(releasesSection).toHaveTextContent('Install notes');
    expect(releasesSection).toHaveTextContent('Choose a download to see the matching install notes.');
    expect(releasesSection).toHaveTextContent('Download only from the official GitHub release.');
    expect(releasesSection).not.toHaveTextContent('Browser app limits');
    expect(releasesSection).not.toHaveTextContent('Checksums and honest warnings');
  });

  test('changes install guidance with the selected download platform', async () => {
    mockLatestReleaseFetch();
    mockNavigator({
      userAgentData: {
        platform: 'Windows',
      },
    });

    renderWebHome();

    const select = await startReleaseDownloadLoad();
    await waitFor(() => expect(select.value).toBe('kaur-khor-v1.2.3-win-x64.exe'));
    expect(screen.getByText('Windows install notes')).toBeInTheDocument();
    expect(screen.getByText('Do not disable SmartScreen globally.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /YouTube tutorial for opening macOS app/i })).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'kaur-khor-v1.2.3-linux-arm64.AppImage' } });

    expect(screen.getByText('Linux install notes')).toBeInTheDocument();
    expect(screen.getByText('Mark AppImages executable before opening them.')).toBeInTheDocument();
    expect(screen.queryByText('Windows install notes')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /YouTube tutorial for opening macOS app/i })).not.toBeInTheDocument();
  });

  test('renders Linux install guidance in natural Khmer without generic English leaks', async () => {
    mockLatestReleaseFetch();
    mockNavigator({
      platform: 'Linux x86_64',
      userAgent: 'Mozilla/5.0 (X11; Linux x86_64)',
    });

    renderWebHome();
    switchLandingToKhmer();

    const select = await screen.findByLabelText('ទាញយក') as HTMLSelectElement;
    fireEvent.focus(select);
    await waitFor(() => expect(select.value).toBe('kaur-khor-v1.2.3-linux-x64.AppImage'));

    expect(screen.getByText('កំណត់សម្គាល់ដំឡើង Linux')).toBeInTheDocument();
    expect(screen.getByText('កំណត់ឯកសារ AppImage ឱ្យអាចដំណើរការបាន មុនបើកវា។')).toBeInTheDocument();
    expect(screen.getByText('បើអ្នកជ្រើសឯកសារ deb សូមដំឡើងវាជាមួយកម្មវិធីគ្រប់គ្រងកញ្ចប់របស់អ្នក។')).toBeInTheDocument();
    expect(screen.queryByText(/executable/)).not.toBeInTheDocument();
    expect(screen.queryByText(/package manager/)).not.toBeInTheDocument();
  });

  test('removes the standalone install page and install links', async () => {
    const { container } = renderWebPath('/install');

    expect(await screen.findByRole('heading', { name: 'KAUR KHOR' })).toBeInTheDocument();
    expect(container).not.toHaveTextContent('Install Kaur Khor from official releases.');
    expect(container.querySelectorAll('a[href*="/install"]')).toHaveLength(0);
  });
});

describe('WebRoutes product cards', () => {
  test('renders simple tier copy with benefits first and drawbacks last', () => {
    const { container } = renderWebHome();
    const section = getProductCardsSection(container);
    const cards = Array.from(section.querySelectorAll('.liquid-grid-card-frame'));

    expect(cards).toHaveLength(productCardCopy.titles.length);
    for (const label of sharedProductBenefits) {
      expect(within(section).getAllByText(label)).toHaveLength(productCardCopy.titles.length);
    }
    for (const label of sharedProductDrawbacks) {
      expect(within(section).getAllByText(label)).toHaveLength(productCardCopy.titles.length);
    }
    expect(within(section).getAllByText('What you get:')).toHaveLength(1);
    for (const include of productCardCopy.includes) {
      expect(within(section).getByText(include)).toBeInTheDocument();
    }
    for (const label of [
      ...productCardCopy.titles,
      ...productCardCopy.summaries,
      ...productCardCopy.includes,
      ...productCardCopy.benefits,
      ...sharedProductDrawbacks,
      ...productCardCopy.drawbacks,
    ]) {
      expect(section).toHaveTextContent(label);
    }

    for (const card of cards) {
      expect(card).toBeInstanceOf(HTMLElement);
      const cardQueries = within(card as HTMLElement);
      const firstBenefit = productCardCopy.benefits.find((label) => cardQueries.queryByText(label));
      expect(firstBenefit).toBeDefined();
      const benefit = cardQueries.getByText(firstBenefit!);
      const drawbackHeading = cardQueries.getByText('Keep in mind:');
      expect(benefit.compareDocumentPosition(drawbackHeading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    const desktopCard = within(section)
      .getByRole('heading', { name: 'Desktop App' })
      .closest('.liquid-grid-card-frame');
    const sourceCard = within(section)
      .getByRole('heading', { name: 'Source Build' })
      .closest('.liquid-grid-card-frame');
    expect(desktopCard).not.toBeNull();
    expect(sourceCard).not.toBeNull();
    for (const inheritedBrowserBenefit of [
      'Export backups',
      'Import backups',
    ]) {
      expect(within(desktopCard as HTMLElement).queryByText(inheritedBrowserBenefit)).not.toBeInTheDocument();
    }
    for (const inheritedDesktopBenefit of [
      'Save work in local app files',
      'Make app snapshots',
      'Keep automation running',
      'Attach item images',
      'View logs',
    ]) {
      expect(within(sourceCard as HTMLElement).queryByText(inheritedDesktopBenefit)).not.toBeInTheDocument();
    }
  });

  test('removes old product-card labels and technical storage terms from the cards', () => {
    const { container } = renderWebHome();
    const section = getProductCardsSection(container);

    expect(section).not.toHaveTextContent(/\bFREE\b/);
    expect(section).not.toHaveTextContent('NO INSTALL');
    expect(section).not.toHaveTextContent('FULL POWER');
    expect(section).not.toHaveTextContent('ADVANCED');
    expect(section).not.toHaveTextContent('OPFS');
    expect(section).not.toHaveTextContent('SQLite');
    expect(section).not.toHaveTextContent('WASM');
  });

  test('uses a static frosted tint surface for each product card', () => {
    const { container } = renderWebHome();
    const section = getProductCardsSection(container);

    for (const card of section.querySelectorAll('.liquid-grid-card-frame')) {
      expect(card).toHaveClass('liquid-grid-card-frame');
      expect(card).not.toHaveClass('backdrop-blur-md');
      expect(card.className).not.toContain('backdrop-blur');
      expect(card.className).not.toContain('mix-blend-screen');
      expect(card.className).not.toContain('hover:-translate');
      expect(card.className).not.toContain('hover:border-foreground');
      expect(card.className).toContain('motion-safe:hover:scale-[1.015]');
      expect(card.className).toContain('motion-safe:focus-within:scale-[1.015]');
      expect(card.className).toContain('hover:border-[color:var(--product-card-accent)]');
      expect((card as HTMLElement).style.getPropertyValue('--product-card-pointer-x')).toBe('50%');
      expect((card as HTMLElement).style.getPropertyValue('--product-card-pointer-y')).toBe('50%');
    }
    const sourceCard = within(section)
      .getByRole('heading', { name: 'Source Build' })
      .closest('.liquid-grid-card-frame');
    expect(sourceCard).not.toBeNull();
    expect(sourceCard?.className).not.toContain('border-black');
    expect(section.querySelector('.liquid-grid-card-glass')).toBeNull();
  });

  test('renders shared privacy copy as list items and uses only the card buttons as links', () => {
    const { container } = renderWebHome();
    const section = getProductCardsSection(container);

    for (const label of [...sharedProductBenefits, ...sharedProductDrawbacks]) {
      for (const item of within(section).getAllByText(label)) {
        expect(item.closest('li')).not.toBeNull();
      }
    }
    for (const privacyItem of within(section).getAllByText('No sign-up or login. Your data stays on your device.')) {
      const card = privacyItem.closest('.liquid-grid-card-frame');
      expect(card).not.toBeNull();
      const keepInMindHeading = within(card as HTMLElement).getByText('Keep in mind:');
      expect(keepInMindHeading.compareDocumentPosition(privacyItem) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }

    for (const action of productCardCopy.actions) {
      const button = within(section).getByRole('link', { name: action });
      const label = within(button).getByText(action);
      expect(button).toHaveClass('bg-white', 'text-foreground');
      expect(button.className).toContain('group/action');
      expect(button.className).toContain('before:bg-[radial-gradient');
      expect(button.className).toContain('hover:border-[color:var(--product-card-accent)]');
      expect(button).not.toHaveClass('bg-primary');
      expect(label).toHaveClass('sm:whitespace-nowrap');
      expect(label).not.toHaveClass('hidden');
      expect(label).not.toHaveClass('xl:inline');
      const icon = button.querySelector('svg');
      expect(icon?.className.baseVal).toContain('motion-safe:group-hover/action:translate-x-1');
    }
    expect(section.querySelector('a span[aria-hidden="true"]')).toBeNull();
    expect(within(section).getAllByRole('link')).toHaveLength(productCardCopy.actions.length);
    for (const card of section.querySelectorAll('.liquid-grid-card-frame')) {
      expect(card.tagName).not.toBe('A');
    }
  });

  test('routes browser product card starts through onboarding', () => {
    const { container } = renderWebHome();
    const section = getProductCardsSection(container);

    expect(within(section).getByRole('link', { name: 'Start Quick Demo' })).toHaveAttribute('href', '/demo#/onboarding');
    expect(within(section).getByRole('link', { name: 'Start in the browser' })).toHaveAttribute('href', '/app#/onboarding');
  });
});

describe('WebRoutes embedded app fallback state', () => {
  test('uses the standard beforeunload prompt for real browser workspace close warnings', () => {
    const cleanup = installBrowserBeforeUnloadWarning();
    const event = new Event('beforeunload', { cancelable: true });

    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    cleanup();
    const cleanEvent = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(cleanEvent);
    expect(cleanEvent.defaultPrevented).toBe(false);
  });

  test('keeps Telegram-specific browser close copy state-aware', () => {
    expect(browserWorkspaceCloseWarningMessage(false)).toBe(BROWSER_WORKSPACE_CLOSE_WARNING);
    expect(browserWorkspaceCloseWarningMessage(true)).toBe(BROWSER_WORKSPACE_TELEGRAM_CLOSE_WARNING);
  });

  test('keeps the installed browser close warning current after Telegram state changes', () => {
    let beforeUnloadHandler: ((event: BeforeUnloadEvent) => unknown) | null = null;
    const target = {
      addEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'beforeunload') {
          expect(beforeUnloadHandler).toBeNull();
          expect(typeof listener).toBe('function');
          beforeUnloadHandler = listener as (event: BeforeUnloadEvent) => unknown;
        }
      }),
      removeEventListener: vi.fn((type: string, listener: EventListenerOrEventListenerObject) => {
        if (type === 'beforeunload' && listener === beforeUnloadHandler) {
          beforeUnloadHandler = null;
        }
      }),
    } as unknown as Window;
    const cleanup = installBrowserBeforeUnloadWarning(
      target,
      () => browserWorkspaceCloseWarningMessage(isBrowserTelegramLiveListening()),
    );

    try {
      const installedBeforeUnloadHandler = beforeUnloadHandler as ((event: BeforeUnloadEvent) => unknown) | null;
      if (!installedBeforeUnloadHandler) {
        throw new Error('Expected installBrowserBeforeUnloadWarning to install a beforeunload handler.');
      }
      const standardEvent = {
        preventDefault: vi.fn(),
        returnValue: '',
      } as unknown as BeforeUnloadEvent;
      installedBeforeUnloadHandler(standardEvent);
      expect(standardEvent.returnValue).toBe(BROWSER_WORKSPACE_CLOSE_WARNING);

      const state = fallbackStateForMode('app');
      state.automation.connection = {
        ...state.automation.connection,
        status: 'connected',
        hasBotToken: true,
      };
      setBrowserDesktopBridgeMockState(state);
      window.dispatchEvent(new Event('kaur-khor-browser-state-changed'));

      const telegramEvent = {
        preventDefault: vi.fn(),
        returnValue: '',
      } as unknown as BeforeUnloadEvent;
      installedBeforeUnloadHandler(telegramEvent);
      expect(telegramEvent.returnValue).toBe(BROWSER_WORKSPACE_TELEGRAM_CLOSE_WARNING);
      expect(target.addEventListener).toHaveBeenCalledTimes(1);
    } finally {
      cleanup();
    }
    expect(target.removeEventListener).toHaveBeenCalledTimes(1);
  });

  test('does not install the browser route beforeunload warning so reload remains available', async () => {
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createSupportedBrowserStorageHandle());
    let beforeUnloadHandler: ((event: BeforeUnloadEvent) => unknown) | null = null;
    const addEventListener = window.addEventListener.bind(window);
    const addEventListenerSpy = vi.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
      if (type === 'beforeunload') {
        beforeUnloadHandler = listener as (event: BeforeUnloadEvent) => unknown;
      }
      return addEventListener(type, listener, options);
    });

    try {
      render(<EmbeddedAppRoute mode="app" />);

      await screen.findByRole('button', { name: 'Export backup' });
      expect(beforeUnloadHandler).toBeNull();
    } finally {
      addEventListenerSpy.mockRestore();
    }
  });

  test('retargets browser persistence hooks when switching embedded app modes', async () => {
    const demoHandle = createSupportedBrowserStorageHandle();
    demoHandle.init.databaseName = KAUR_KHOR_BROWSER_DEMO_DATABASE;
    const appHandle = createSupportedBrowserStorageHandle();
    appHandle.init.databaseName = KAUR_KHOR_BROWSER_APP_DATABASE;
    runtimeWebMocks.openBrowserStorage
      .mockResolvedValueOnce(demoHandle)
      .mockResolvedValueOnce(appHandle);

    const { rerender } = render(<EmbeddedAppRoute mode="demo" />);

    await waitFor(() => expect(demoHandle.putDocuments).toHaveBeenCalledWith([
      expect.objectContaining({ id: KAUR_KHOR_BROWSER_DEMO_DATABASE }),
    ]));
    await act(async () => {
      await window.kaurKhorDesktop.preferences.save({ language: 'km' });
    });
    expect(demoHandle.putDocuments).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: KAUR_KHOR_BROWSER_DEMO_DATABASE }),
    ]);

    await act(async () => {
      rerender(<EmbeddedAppRoute mode="app" />);
    });

    await waitFor(() => expect(demoHandle.close).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(appHandle.putDocuments).toHaveBeenCalledWith([
      expect.objectContaining({ id: KAUR_KHOR_BROWSER_APP_DATABASE }),
    ]));
    await act(async () => {
      await window.kaurKhorDesktop.preferences.save({ language: 'en' });
    });
    expect(appHandle.putDocuments).toHaveBeenLastCalledWith([
      expect.objectContaining({ id: KAUR_KHOR_BROWSER_APP_DATABASE }),
    ]);
  });

  test('leaves browser backup actions available after a bad import file', async () => {
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createSupportedBrowserStorageHandle());

    const { container } = render(<EmbeddedAppRoute mode="app" />);

    const exportButton = await screen.findByRole('button', { name: 'Export backup' });
    const importButton = screen.getByRole('button', { name: 'Import backup' });
    expect(exportButton).toBeEnabled();
    expect(importButton).toBeEnabled();

    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    const badFile = {
      name: 'bad-backup.json',
      text: vi.fn(async () => '{nope'),
      type: 'application/json',
    } as unknown as File;
    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [badFile],
      },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Backup JSON could not be parsed.');
    expect(screen.getByRole('button', { name: 'Export backup' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Import backup' })).toBeEnabled();
  });

  test('shows an actionable browser backup export error when persistence fails', async () => {
    const handle = createSupportedBrowserStorageHandle();
    vi.mocked(handle.persistSenaState)
      .mockResolvedValueOnce(1)
      .mockRejectedValueOnce(new Error('browser storage write failed'));
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(handle);

    render(<EmbeddedAppRoute mode="app" />);

    fireEvent.click(await screen.findByRole('button', { name: 'Export backup' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('browser storage write failed');
    expect(screen.getByRole('button', { name: 'Export backup' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Import backup' })).toBeEnabled();
  });

  test('exports every browser storage document, not only the bridge state record', async () => {
    const handle = createSupportedBrowserStorageHandle([
      {
        collection: 'browser_state',
        id: KAUR_KHOR_BROWSER_APP_DATABASE,
        json: fallbackStateForMode('app'),
        updatedAt: '2026-05-05T00:00:00.000Z',
      },
      {
        collection: 'custom_reports',
        id: 'daily-close',
        json: { rows: [1, 2, 3] },
        updatedAt: '2026-05-06T00:00:00.000Z',
      },
    ]);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(handle);
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:kaur-khor-backup');
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    try {
      render(<EmbeddedAppRoute mode="app" />);

      fireEvent.click(await screen.findByRole('button', { name: 'Export backup' }));

      await waitFor(() => expect(handle.exportBackup).toHaveBeenCalled());
      const exportedBlob = createObjectUrlSpy.mock.calls.at(-1)?.[0] as Blob | undefined;
      expect(exportedBlob).toBeInstanceOf(Blob);
      const exportedBackup = JSON.parse(await readBlobText(exportedBlob!)) as BrowserStorageJsonBackup;
      expect(exportedBackup.records).toEqual(expect.arrayContaining([
        expect.objectContaining({
          collection: 'browser_state',
          id: KAUR_KHOR_BROWSER_APP_DATABASE,
        }),
        expect.objectContaining({
          collection: 'custom_reports',
          id: 'daily-close',
          json: { rows: [1, 2, 3] },
        }),
      ]));
      expect(anchorClickSpy).toHaveBeenCalled();
    } finally {
      createObjectUrlSpy.mockRestore();
      revokeObjectUrlSpy.mockRestore();
      anchorClickSpy.mockRestore();
    }
  });

  test('does not import a backup before confirming it has browser workspace state', async () => {
    const existingState = fallbackStateForMode('app');
    const handle = createSupportedBrowserStorageHandle([
      {
        collection: 'browser_state',
        id: KAUR_KHOR_BROWSER_APP_DATABASE,
        json: existingState,
        updatedAt: '2026-05-05T00:00:00.000Z',
      },
    ]);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(handle);

    const { container } = render(<EmbeddedAppRoute mode="app" />);

    await screen.findByRole('button', { name: 'Export backup' });
    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    const incompleteBackupFile = {
      name: 'empty-backup.json',
      text: vi.fn(async () => JSON.stringify({
        databaseName: KAUR_KHOR_BROWSER_APP_DATABASE,
        exportedAt: '2026-05-05T00:00:00.000Z',
        format: 'kaur-khor.browser.storage.backup',
        records: [],
        schemaVersion: 1,
        version: 1,
      })),
      type: 'application/json',
    } as unknown as File;

    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [incompleteBackupFile],
      },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Backup did not contain a browser workspace state.');
    expect(handle.importBackup).not.toHaveBeenCalled();
    await expect(handle.listDocuments('browser_state')).resolves.toEqual([
      expect.objectContaining({
        id: KAUR_KHOR_BROWSER_APP_DATABASE,
        json: expect.objectContaining({
          appContext: expect.objectContaining({ platform: 'web' }),
        }),
      }),
    ]);
    expect(screen.getByRole('button', { name: 'Export backup' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Import backup' })).toBeEnabled();
  });

  test('does not import a backup with malformed browser workspace state', async () => {
    const existingState = fallbackStateForMode('app');
    const handle = createSupportedBrowserStorageHandle([
      {
        collection: 'browser_state',
        id: KAUR_KHOR_BROWSER_APP_DATABASE,
        json: existingState,
        updatedAt: '2026-05-05T00:00:00.000Z',
      },
    ]);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(handle);

    const { container } = render(<EmbeddedAppRoute mode="app" />);

    await screen.findByRole('button', { name: 'Export backup' });
    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    const malformedBackupFile = {
      name: 'malformed-state-backup.json',
      text: vi.fn(async () => JSON.stringify({
        databaseName: KAUR_KHOR_BROWSER_APP_DATABASE,
        exportedAt: '2026-05-05T00:00:00.000Z',
        format: 'kaur-khor.browser.storage.backup',
        records: [{
          collection: 'browser_state',
          id: KAUR_KHOR_BROWSER_APP_DATABASE,
          json: {},
          updatedAt: '2026-05-05T00:00:00.000Z',
        }],
        schemaVersion: 1,
        version: 1,
      })),
      type: 'application/json',
    } as unknown as File;

    fireEvent.change(input as HTMLInputElement, {
      target: {
        files: [malformedBackupFile],
      },
    });

    expect(await screen.findByRole('alert')).toHaveTextContent('Backup did not contain a browser workspace state.');
    expect(handle.importBackup).not.toHaveBeenCalled();
    await expect(handle.listDocuments('browser_state')).resolves.toEqual([
      expect.objectContaining({
        id: KAUR_KHOR_BROWSER_APP_DATABASE,
        json: expect.objectContaining({
          appContext: expect.objectContaining({ platform: 'web' }),
        }),
      }),
    ]);
  });

  test('imports older browser backups with recoverable partial workspace state', async () => {
    const existingState = fallbackStateForMode('app');
    const handle = createSupportedBrowserStorageHandle([
      {
        collection: 'browser_state',
        id: KAUR_KHOR_BROWSER_APP_DATABASE,
        json: existingState,
        updatedAt: '2026-05-05T00:00:00.000Z',
      },
    ]);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(handle);
    const reloadLocation = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        ...originalLocation,
        reload: reloadLocation,
      },
    });

    try {
      const { container } = render(<EmbeddedAppRoute mode="app" />);

      await screen.findByRole('button', { name: 'Export backup' });
      const input = container.querySelector('input[type="file"]');
      expect(input).not.toBeNull();
      const olderState = {
        appContext: existingState.appContext,
        catalog: {
          ...existingState.catalog,
          skus: [{
            skuId: 'sku-restored',
            name: 'Restored SKU',
            supplierName: null,
            unitsInStock: 4,
            costPerUnit: 2,
            leadTimeMeanDaysHint: null,
            leadTimeStdDaysHint: null,
            soldAsProduct: true,
            productPrice: 8,
            notes: null,
          }],
        },
        observations: existingState.observations,
        preferences: existingState.preferences,
      };
      const olderBackupFile = {
        name: 'older-backup.json',
        text: vi.fn(async () => JSON.stringify({
          databaseName: KAUR_KHOR_BROWSER_APP_DATABASE,
          exportedAt: '2026-05-05T00:00:00.000Z',
          format: 'kaur-khor.browser.storage.backup',
          records: [{
            collection: 'browser_state',
            id: KAUR_KHOR_BROWSER_APP_DATABASE,
            json: olderState,
            updatedAt: '2026-05-05T00:00:00.000Z',
          }],
          schemaVersion: 1,
          version: 1,
        })),
        type: 'application/json',
      } as unknown as File;

      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [olderBackupFile],
        },
      });

      await waitFor(() => expect(handle.importBackup).toHaveBeenCalledTimes(1));
      expect(getBrowserDesktopBridgeMockState().catalog.skus[0]?.skuId).toBe('sku-restored');
      expect(getBrowserDesktopBridgeMockState().skuDetails).toEqual({});
      expect(getBrowserDesktopBridgeMockState().orderBatches).toEqual([]);
      expect(reloadLocation).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: originalLocation,
      });
    }
  });

  test('shows browser workspace data-risk copy without Telegram copy when no bot is connected', () => {
    setBrowserDesktopBridgeMockState(fallbackStateForMode('app'));

    render(
      <MemoryRouter initialEntries={['/']}>
        <EmbeddedAppBanner
          mode="app"
          storage={embeddedStorage}
          onExport={vi.fn()}
          onImport={vi.fn()}
          onReset={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Export a backup before closing.')).toBeInTheDocument();
    expect(screen.getByText(BROWSER_WORKSPACE_CLOSE_WARNING)).toBeInTheDocument();
    expect(screen.queryByText(BROWSER_WORKSPACE_TELEGRAM_CLOSE_WARNING)).not.toBeInTheDocument();
  });

  test('shows Telegram live-listening browser close copy when the bot is connected', () => {
    const state = fallbackStateForMode('app');
    state.automation.connection = {
      ...state.automation.connection,
      status: 'connected',
      hasBotToken: true,
    };
    setBrowserDesktopBridgeMockState(state);

    render(
      <MemoryRouter initialEntries={['/']}>
        <EmbeddedAppBanner
          mode="app"
          storage={embeddedStorage}
          onExport={vi.fn()}
          onImport={vi.fn()}
          onReset={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText(BROWSER_WORKSPACE_TELEGRAM_CLOSE_WARNING)).toBeInTheDocument();
    expect(screen.queryByText(BROWSER_WORKSPACE_CLOSE_WARNING)).not.toBeInTheDocument();
  });

  test('does not show real browser workspace close copy for demo mode', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <EmbeddedAppBanner
          mode="demo"
          storage={embeddedStorage}
          onExport={vi.fn()}
          onImport={vi.fn()}
          onReset={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Demo data - not your real workspace.')).toBeInTheDocument();
    expect(screen.queryByText(BROWSER_WORKSPACE_CLOSE_WARNING)).not.toBeInTheDocument();
    expect(screen.queryByText(BROWSER_WORKSPACE_TELEGRAM_CLOSE_WARNING)).not.toBeInTheDocument();
  });

  test('localizes demo browser banner copy to Khmer', () => {
    const state = fallbackStateForMode('demo');
    state.preferences.language = 'km';
    setBrowserDesktopBridgeMockState(state);

    render(
      <MemoryRouter initialEntries={['/']}>
        <EmbeddedAppBanner
          mode="demo"
          storage={embeddedStorage}
          onExport={vi.fn()}
          onImport={vi.fn()}
          onReset={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('ទិន្នន័យសាកល្បង មិនមែនកន្លែងធ្វើការពិតរបស់អ្នកទេ។')).toBeInTheDocument();
    expect(screen.getByText('កន្លែងធ្វើការគំរូ។ អាចកំណត់ឡើងវិញបានគ្រប់ពេល។')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'នាំចេញច្បាប់បម្រុង' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'នាំចូលច្បាប់បម្រុង' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'កំណត់សាកល្បងឡើងវិញ' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'ប្រើអេបក្នុងប្រោសឺរ' })).not.toBeInTheDocument();
    expect(screen.queryByText('Demo data - not your real workspace.')).not.toBeInTheDocument();
  });

  test('keeps the embedded sidebar banner surfaced and compact in Khmer', async () => {
    const state = fallbackStateForMode('demo');
    state.preferences.language = 'km';
    setBrowserDesktopBridgeMockState(state);
    const target = document.createElement('div');
    target.dataset.slot = 'embedded-sidebar-banner-slot';
    document.body.appendChild(target);

    try {
      render(
        <MemoryRouter initialEntries={['/']}>
          <EmbeddedAppBanner
            mode="demo"
            storage={embeddedStorage}
            onExport={vi.fn()}
            onImport={vi.fn()}
            onReset={vi.fn()}
          />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(within(target).getByText('ទិន្នន័យសាកល្បង មិនមែនកន្លែងធ្វើការពិតរបស់អ្នកទេ។')).toBeInTheDocument();
      });
      const bannerCard = target.querySelector('[data-slot="web-app-banner-card"]');
      expect(bannerCard).toHaveClass('h-full', 'rounded-xl', 'border-border/70', 'bg-white/90');
      expect(within(target).getAllByText('នាំចេញ').length).toBeGreaterThan(0);
      expect(within(target).getAllByText('នាំចូល').length).toBeGreaterThan(0);
      expect(within(target).getAllByText('កំណត់').length).toBeGreaterThan(0);
      expect(within(target).queryByText('ប្រើប្រោសឺរ')).not.toBeInTheDocument();
      expect(within(target).queryByText('Export')).not.toBeInTheDocument();
      expect(within(target).queryByText('Reset')).not.toBeInTheDocument();
    } finally {
      target.remove();
    }
  });

  test('localizes browser app warning banner copy to Khmer', () => {
    const state = fallbackStateForMode('app');
    state.preferences.language = 'km';
    setBrowserDesktopBridgeMockState(state);

    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <EmbeddedAppBanner
          mode="app"
          storage={embeddedStorage}
          onExport={vi.fn()}
          onImport={vi.fn()}
          onReset={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('នាំចេញច្បាប់បម្រុងមុនពេលបិទ។')).toBeInTheDocument();
    expect(screen.getByText(/កន្លែងធ្វើការកខរបស់អ្នកត្រូវបានរក្សាទុក/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'កំណត់កន្លែងធ្វើការឡើងវិញ' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'ទាញយកកម្មវិធី' })).not.toBeInTheDocument();
    expect(screen.queryByText('Export a backup before closing.')).not.toBeInTheDocument();
  });

  test('does not apply embedded product auto zoom to the public landing route', () => {
    const { container } = renderWebHome();

    expect(container.querySelector('[data-slot="embedded-auto-zoom-viewport"]')).toBeNull();
  });

  test('applies embedded product auto zoom at narrow browser widths', async () => {
    mockViewport(900, 800);

    const { container } = render(
      <EmbeddedAutoZoomViewport>
        <div>Embedded product</div>
      </EmbeddedAutoZoomViewport>,
    );

    const viewport = container.querySelector('[data-slot="embedded-auto-zoom-viewport"]');
    const spacer = container.querySelector('[data-slot="embedded-auto-zoom-layout-spacer"]');
    const surface = container.querySelector('[data-slot="embedded-auto-zoom-surface"]');
    expect(viewport).not.toBeNull();
    expect(spacer).not.toBeNull();
    expect(surface).not.toBeNull();
    expect(viewport).toHaveAttribute('data-phone-landscape', 'false');
    expect(viewport).toHaveAttribute('data-zoom-level', '-2');
    expect(viewport).toHaveAttribute('data-effective-height', String(Math.round(800 / (1.2 ** -2))));
    expect(viewport).toHaveAttribute('data-measured-area', String(900 * 800));
    expect(viewport).toHaveClass('h-svh', 'overflow-auto');
    expect(viewport).not.toHaveClass('overflow-hidden');
    expect(spacer).toHaveStyle({
      height: '800px',
      width: '900px',
    });
    expect(viewport).toHaveStyle({
      '--kaur-khor-embedded-shell-content-height': `${800 / (1.2 ** -2)}px`,
      '--kaur-khor-embedded-shell-content-width': `${900 / (1.2 ** -2)}px`,
    });
    expect(surface).toHaveStyle({ width: `${900 / (1.2 ** -2)}px` });
    await waitFor(() => {
      expect(document.documentElement.dataset.kaurKhorEffectiveViewportWidth).toBe(String(Math.round(900 / (1.2 ** -2))));
      expect(document.documentElement.dataset.kaurKhorEffectiveViewportHeight).toBe(String(Math.round(800 / (1.2 ** -2))));
    });
  });

  test('applies embedded product auto zoom when height and area are cramped', async () => {
    mockViewport(1440, 799);

    const { container } = render(
      <EmbeddedAutoZoomViewport>
        <div>Embedded product</div>
      </EmbeddedAutoZoomViewport>,
    );

    const viewport = container.querySelector('[data-slot="embedded-auto-zoom-viewport"]');
    const spacer = container.querySelector('[data-slot="embedded-auto-zoom-layout-spacer"]');
    const surface = container.querySelector('[data-slot="embedded-auto-zoom-surface"]');
    expect(viewport).not.toBeNull();
    expect(spacer).not.toBeNull();
    expect(surface).not.toBeNull();
    expect(viewport).toHaveAttribute('data-phone-landscape', 'false');
    expect(viewport).toHaveAttribute('data-zoom-level', '-1');
    expect(viewport).toHaveAttribute('data-effective-width', String(Math.round(1440 / (1.2 ** -1))));
    expect(viewport).toHaveAttribute('data-effective-height', String(Math.round(799 / (1.2 ** -1))));
    expect(viewport).toHaveAttribute('data-measured-area', String(1440 * 799));
    expect(spacer).toHaveStyle({
      height: '799px',
      width: '1440px',
    });
    expect(surface).toHaveStyle({
      minHeight: `${799 / (1.2 ** -1)}px`,
      width: `${1440 / (1.2 ** -1)}px`,
    });
  });

  test('refreshes embedded product auto zoom after browser viewport resizing settles', async () => {
    mockViewport(900, 800);

    const { container } = render(
      <EmbeddedAutoZoomViewport>
        <div>Embedded product</div>
      </EmbeddedAutoZoomViewport>,
    );

    const viewport = container.querySelector('[data-slot="embedded-auto-zoom-viewport"]');
    const spacer = container.querySelector('[data-slot="embedded-auto-zoom-layout-spacer"]');
    const surface = container.querySelector('[data-slot="embedded-auto-zoom-surface"]');
    expect(viewport).not.toBeNull();
    expect(spacer).not.toBeNull();
    expect(surface).not.toBeNull();
    expect(viewport).toHaveAttribute('data-zoom-level', '-2');

    mockViewport(1600, 900);
    fireEvent.resize(window);

    await waitFor(() => {
      expect(viewport).toHaveAttribute('data-zoom-level', '0');
      expect(viewport).toHaveAttribute('data-effective-height', '900');
      expect(viewport).toHaveAttribute('data-effective-width', '1600');
      expect(spacer).toHaveStyle({
        height: '900px',
        width: '1600px',
      });
      expect(surface).toHaveStyle({
        minHeight: '900px',
        width: '1600px',
      });
    });
  });

  test('uses a portrait-native embedded product shell for portrait phones', async () => {
    mockViewport(390, 844);

    const { container } = render(
      <EmbeddedAutoZoomViewport>
        <div>Embedded product</div>
      </EmbeddedAutoZoomViewport>,
    );

    const viewport = container.querySelector('[data-slot="embedded-auto-zoom-viewport"]');
    const spacer = container.querySelector('[data-slot="embedded-auto-zoom-layout-spacer"]');
    const surface = container.querySelector('[data-slot="embedded-auto-zoom-surface"]');
    expect(viewport).not.toBeNull();
    expect(spacer).not.toBeNull();
    expect(surface).not.toBeNull();
    expect(container.querySelector('[data-slot="embedded-landscape-scroll-spacer"]')).toBeNull();
    expect(container.querySelector('[data-slot="embedded-landscape-frame"]')).toBeNull();
    expect(viewport).toHaveAttribute('data-phone-landscape', 'false');
    expect(viewport).toHaveAttribute('data-phone-portrait', 'true');
    expect(viewport).toHaveAttribute('data-zoom-level', '0');
    expect(viewport).toHaveClass('overflow-auto');
    expect(viewport).not.toHaveClass('overflow-hidden');
    expect(viewport).toHaveAttribute('data-effective-width', '390');
    expect(viewport).toHaveAttribute('data-effective-height', '844');
    expect(viewport).toHaveAttribute('data-measured-area', String(390 * 844));
    expect(viewport).toHaveStyle({
      '--kaur-khor-embedded-shell-content-height': '844px',
      '--kaur-khor-embedded-shell-content-width': '390px',
    });
    expect(spacer).toHaveStyle({
      height: '844px',
      width: '390px',
    });
    expect(surface).toHaveStyle({
      minHeight: '844px',
      width: '390px',
    });
    await waitFor(() => {
      expect(document.documentElement.dataset.kaurKhorEmbeddedPhonePortrait).toBe('true');
      expect(document.documentElement.dataset.kaurKhorEmbeddedPhoneLandscape).toBe('false');
      expect(Number(document.documentElement.dataset.kaurKhorEffectiveViewportWidth)).toBe(390);
      expect(Number(document.documentElement.dataset.kaurKhorEffectiveViewportHeight)).toBe(844);
    });
  });

  test('keeps portrait phone content upright and scrollable when content is tall', async () => {
    mockViewport(390, 844);

    const { container } = render(
      <EmbeddedAutoZoomViewport>
        <div style={{ minHeight: 1600 }}>Long phone content</div>
      </EmbeddedAutoZoomViewport>,
    );

    const viewport = container.querySelector('[data-slot="embedded-auto-zoom-viewport"]');
    const surface = container.querySelector('[data-slot="embedded-auto-zoom-surface"]');
    expect(viewport).not.toBeNull();
    expect(surface).not.toBeNull();
    await waitFor(() => {
      expect(viewport).toHaveClass('overflow-auto');
      expect(viewport).toHaveAttribute('data-phone-portrait', 'true');
      expect(surface).toHaveStyle({
        minHeight: '844px',
        transform: 'scale(1)',
        width: '390px',
      });
    });
  });

  test.each(['demo', 'app'] as const)('renders the portrait phone operator shell on public embedded phones in %s mode', async (mode) => {
    window.location.hash = '#/';
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle(mode));

    const { container } = render(<EmbeddedAppRoute mode={mode} />);

    const phoneNav = await screen.findByRole('navigation', { name: 'Phone navigation' });
    expect(container.querySelector('[data-slot="embedded-phone-shell"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-today-page"]')).not.toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Rotate screen' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="embedded-phone-landscape-overlay"]')).toBeNull();
    expect(screen.getByText('Phone operator mode')).toBeInTheDocument();
    expect(within(phoneNav).getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
    expect(within(phoneNav).getByRole('link', { name: 'Queue' })).toHaveAttribute('href', '#/work/queue');
    expect(within(phoneNav).queryByRole('link', { name: 'Insights' })).not.toBeInTheDocument();
    await waitFor(() => {
      expect(container.querySelector('[data-slot="embedded-auto-zoom-viewport"]')).toHaveAttribute('data-phone-landscape', 'false');
      expect(container.querySelector('[data-slot="embedded-auto-zoom-viewport"]')).toHaveAttribute('data-phone-portrait', 'true');
      expect(container.querySelector('[data-slot="embedded-auto-zoom-viewport"]')).toHaveAttribute('data-zoom-level', '0');
      expect(document.documentElement.dataset.kaurKhorEmbeddedPhoneLandscape).toBe('false');
      expect(document.documentElement.dataset.kaurKhorEmbeddedPhonePortrait).toBe('true');
      expect(document.documentElement.dataset.kaurKhorEffectiveViewportWidth).toBe('390');
      expect(document.documentElement.dataset.kaurKhorEffectiveViewportHeight).toBe('844');
    });
  });

  test('blocks real public phone app storage failures before the phone shell renders', async () => {
    window.location.hash = '#/settings';
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createUnsupportedBrowserStorageHandle());

    const { container } = render(<EmbeddedAppRoute mode="app" />);

    expect(await screen.findByRole('heading', { name: 'Kaur Khor cannot store real browser-app data here.' })).toBeInTheDocument();
    expect(screen.getByText(/OPFS access handles are unavailable/)).toBeInTheDocument();
    expect(container.querySelector('[data-slot="embedded-phone-shell"]')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Workspace safety' })).not.toBeInTheDocument();
  });

  test.each(['demo', 'app'] as const)('keeps first-run portrait phones in the public setup flow in %s mode', async (mode) => {
    window.location.hash = '#/';
    mockViewport(390, 844);
    const state = fallbackStateForMode(mode);
    state.preferences.onboardingCompletedAt = null;
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createSupportedBrowserStorageHandle([
      {
        collection: 'browser_state',
        id: mode === 'demo' ? KAUR_KHOR_BROWSER_DEMO_DATABASE : KAUR_KHOR_BROWSER_APP_DATABASE,
        json: state,
        updatedAt: '2026-05-05T00:00:00.000Z',
      },
    ]));

    const { container } = render(<EmbeddedAppRoute mode={mode} />);

    expect(await screen.findByRole('heading', { name: 'Set up Kaur Khor' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="onboarding-page"]')).not.toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Rotate screen' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="embedded-phone-shell"]')).toBeNull();
    expect(container.querySelector('[data-slot="embedded-phone-landscape-overlay"]')).toBeNull();
    await waitFor(() => {
      expect(container.querySelector('[data-slot="embedded-auto-zoom-viewport"]')).toHaveAttribute('data-phone-landscape', 'false');
      expect(container.querySelector('[data-slot="embedded-auto-zoom-viewport"]')).toHaveAttribute('data-phone-portrait', 'true');
      expect(container.querySelector('[data-slot="embedded-auto-zoom-viewport"]')).toHaveAttribute('data-zoom-level', '0');
      expect(document.documentElement.dataset.kaurKhorEmbeddedPhoneLandscape).toBe('false');
      expect(document.documentElement.dataset.kaurKhorEmbeddedPhonePortrait).toBe('true');
      expect(document.documentElement.dataset.kaurKhorEffectiveViewportWidth).toBe('390');
      expect(document.documentElement.dataset.kaurKhorEffectiveViewportHeight).toBe('844');
    });
  });

  test.each(['demo', 'app'] as const)('renders the hidden portrait phone shell from the secret hash in %s mode', async (mode) => {
    window.location.hash = hiddenPhoneOperatorHash;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle(mode));

    const { container } = render(<EmbeddedAppRoute mode={mode} />);

    const phoneNav = await screen.findByRole('navigation', { name: 'Phone navigation' });
    expect(container.querySelector('[data-slot="embedded-phone-shell"]')).not.toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Rotate screen' })).not.toBeInTheDocument();
    expect(screen.queryByText('Demo data - not your real workspace.')).not.toBeInTheDocument();
    expect(screen.queryByText('Export a backup before closing.')).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="embedded-phone-landscape-overlay"]')).toBeNull();
    expect(screen.getByText('Phone operator mode')).toBeInTheDocument();
    const phoneShell = container.querySelector('[data-slot="embedded-phone-shell"]');
    const phoneMain = container.querySelector<HTMLElement>('[data-slot="embedded-phone-main"]');
    const phoneHeaderEyebrow = container.querySelector('[data-slot="embedded-phone-header-eyebrow"]');
    const phoneHeaderTitle = container.querySelector('[data-slot="embedded-phone-header-title"]');
    expect(phoneShell).not.toBeNull();
    expect(phoneShell).toHaveClass('grid', 'min-h-[var(--kaur-khor-embedded-effective-height,100dvh)]', 'max-w-full', 'grid-cols-[minmax(0,1fr)]', 'grid-rows-[auto_auto_minmax(0,1fr)_auto]', 'overflow-x-clip', 'overscroll-contain', 'bg-background');
    expect(phoneShell).not.toHaveClass('content-start', 'grid-rows-[auto_auto_auto_auto]', 'min-h-dvh');
    expect(phoneMain).not.toBeNull();
    expect(phoneMain).toHaveClass('row-start-3', 'max-w-full', 'overflow-x-clip');
    expect(phoneMain?.style.paddingBottom).toContain('env(safe-area-inset-bottom)');
    expect(container.querySelector('[data-slot="embedded-phone-bottom-nav"]')).toHaveClass('sticky', 'bottom-0', 'row-start-4', 'h-fit', 'self-end');
    expect(container.querySelector('[data-slot="embedded-phone-header"]')).not.toBeNull();
    expect(phoneHeaderEyebrow).toHaveTextContent('KAUR KHOR');
    expect(phoneHeaderTitle).toHaveTextContent('Phone operator mode');
    expect(container.querySelector('[data-slot="phone-today-page"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-next-move"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-primary-action"]')).not.toBeNull();
    if (mode === 'demo') {
      const inventoryItemTitles = container.querySelectorAll('[data-slot="phone-today-inventory-item-title"]');
      const inventoryItemDescriptions = container.querySelectorAll('[data-slot="phone-today-inventory-item-description"]');
      expect(inventoryItemTitles.length).toBeGreaterThan(0);
      expect(inventoryItemDescriptions.length).toBeGreaterThan(0);
      for (const title of inventoryItemTitles) {
        expect(title).not.toHaveClass('truncate');
        expect(title).toHaveClass('whitespace-normal', 'break-words');
      }
      for (const description of inventoryItemDescriptions) {
        expect(description).not.toHaveClass('truncate');
        expect(description).toHaveClass('whitespace-normal', 'break-words');
      }
    }
    expect(container.querySelector('[data-slot="phone-metric-strip"]')?.querySelectorAll('[data-slot="phone-metric"]')).toHaveLength(3);
    expect(container.querySelector('[data-slot="phone-metric-strip"]')?.querySelectorAll('[data-slot="phone-metric-icon"]')).toHaveLength(3);
    expect(container.querySelector('[data-slot="phone-metric-strip"]')).toHaveAttribute('href', `${hiddenPhoneOperatorHash}work/queue`);
    expect(container.querySelector('[data-slot="phone-metric-strip"]')).toHaveClass('hover:bg-accent/15', 'active:bg-accent/30');
    expect(container.querySelectorAll('[data-slot="phone-metric"].border-l')).toHaveLength(2);
    fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-secondary-metric-strip"]')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Fast paths' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Supplier work' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-workspace-safety-alert"]')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Open safety' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-bottom-nav-item"][data-phone-tab="today"]')).not.toBeNull();
    expect(within(phoneNav).getByRole('link', { name: 'Today' })).toHaveAttribute('aria-current', 'page');
    expect(within(phoneNav).getByRole('link', { name: 'Queue' })).toHaveAttribute('href', `${hiddenPhoneOperatorHash}work/queue`);
    expect(within(phoneNav).getByRole('link', { name: 'Capture' })).toHaveAttribute('href', `${hiddenPhoneOperatorHash}work/capture`);
    expect(within(phoneNav).getByRole('link', { name: 'Products' })).toHaveAttribute('href', `${hiddenPhoneOperatorHash}catalog`);
    expect(within(phoneNav).queryByRole('link', { name: 'Insights' })).not.toBeInTheDocument();
    fireEvent.click(within(phoneNav).getByRole('link', { name: 'Queue' }));
    expect(await screen.findByRole('heading', { name: 'Work that needs a decision' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-page-header"]')).toHaveClass('sr-only');
    expect(phoneHeaderEyebrow).toHaveTextContent('Queue');
    expect(phoneHeaderTitle).toHaveTextContent('Work that needs a decision');
    expect(container.querySelector('[data-slot="phone-queue-page"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-queue-page"]')).toHaveClass('max-w-full');
    expect(container.querySelector('[data-slot="phone-queue-page"]')).not.toHaveClass('overflow-x-hidden', 'overflow-x-clip');
    expect(container.querySelector('[data-slot="phone-segmented-control"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-queue-summary-strip"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-queue-summary-strip"]')).toHaveClass('grid-cols-3', 'overflow-hidden');
    expect(container.querySelector('[data-slot="phone-queue-summary-strip"]')?.querySelectorAll('[data-slot="phone-metric-icon"]')).toHaveLength(3);
    expect(container.querySelector('[data-slot="phone-queue-summary-strip"]')?.querySelectorAll('[data-slot="phone-metric"].border-l')).toHaveLength(2);
    expect(container.querySelector('[data-slot="phone-queue-filter-row"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-queue-filter-row"]')).toHaveClass('max-w-full', 'overflow-x-auto', 'overscroll-x-contain');
    expect(container.querySelector('[data-slot="phone-queue-filter-row"]')).not.toHaveClass('-mx-4');
    expect(container.querySelector('[data-slot="phone-queue-filter-row"]')?.querySelectorAll('[data-slot="phone-queue-filter-icon"]')).toHaveLength(6);
    expect(container.querySelector('[data-slot="phone-queue-filter-row"]')?.querySelectorAll('[data-slot="phone-queue-filter-label"]')).toHaveLength(6);
    expect(screen.getByRole('textbox', { name: 'Search queue' })).toHaveAttribute('data-slot', 'phone-queue-search');
    expect(within(phoneNav).getByRole('link', { name: 'Queue' })).toHaveAttribute('aria-current', 'page');
    if (mode === 'demo') {
      fireEvent.click(screen.getByRole('button', { name: 'To order' }));
      await waitFor(() => expect(window.location.hash).toContain('filter=to-order'));
      fireEvent.click(screen.getByRole('button', { name: 'All' }));
      await waitFor(() => expect(window.location.hash).not.toContain('filter='));
      fireEvent.change(screen.getByRole('textbox', { name: 'Search queue' }), { target: { value: 'missing queue item' } });
      await waitFor(() => expect(window.location.hash).toContain('q=missing+queue+item'));
      expect(container.querySelector('[data-slot="phone-queue-empty-state"]')).not.toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));
      await waitFor(() => expect(window.location.hash).not.toContain('q='));
      const supplierQueueItems = container.querySelectorAll('[data-slot="phone-list-item"]');
      expect(supplierQueueItems.length).toBeGreaterThan(0);
      expect(within(supplierQueueItems[0] as HTMLElement).getAllByText(/Supplier/).length).toBeGreaterThan(0);
      expect(within(supplierQueueItems[0] as HTMLElement).getAllByText(/Recommended|SKUs|Since last update/).length).toBeGreaterThan(0);
      expect(within(supplierQueueItems[0] as HTMLElement).getByText('Record now')).toBeInTheDocument();
      expect(within(supplierQueueItems[0] as HTMLElement).queryByText('Record Supplier order')).not.toBeInTheDocument();
      fireEvent.click(supplierQueueItems[0]);
      await waitFor(() => expect(window.location.hash).toContain('task='));
      await waitFor(() => expect(document.querySelector('[data-slot="phone-task-drawer"]')).not.toBeNull());
      expect(screen.getByRole('link', { name: /Edit in Capture/ })).toHaveAttribute('href', expect.stringContaining('/work/capture/supplier-order'));
      expect(screen.getByRole('button', { name: /Save|Record|Mark/ })).toBeInTheDocument();
      fireEvent.click(within(document.querySelector('[data-slot="phone-task-drawer"]') as HTMLElement).getAllByRole('button', { name: 'Close' })[0]);
      await waitFor(() => expect(window.location.hash).not.toContain('task='));
      expect(document.querySelector('[data-slot="phone-task-drawer"]')).toBeNull();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Customer' }));
    expect(screen.getByRole('button', { name: 'Customer' })).toHaveAttribute('aria-pressed', 'true');
    await waitFor(() => expect(window.location.hash).toContain('scope=customer'));
    expect(screen.getByRole('button', { name: 'Quoted' })).toBeInTheDocument();
    if (mode === 'demo') {
      const customerQueueItems = container.querySelectorAll('[data-slot="phone-list-item"]');
      expect(customerQueueItems.length).toBeGreaterThan(0);
      expect(within(customerQueueItems[0] as HTMLElement).getAllByText(/Ticket|Legacy|Telegram|customer/i).length).toBeGreaterThan(0);
      expect(within(customerQueueItems[0] as HTMLElement).getAllByText(/pending|completed|blocked|order/i).length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole('button', { name: 'Review' }));
      await waitFor(() => expect(window.location.hash).toContain('filter=review'));
      const queueHashBeforeIntake = window.location.hash;
      fireEvent.click(screen.getByRole('button', { name: /Open intake/ }));
      await waitFor(() => expect(screen.getByText('Telegram intake')).toBeInTheDocument());
      expect(window.location.hash).toBe(queueHashBeforeIntake);
      expect(window.location.hash).not.toContain('/work/intake');
      expect(window.location.hash).not.toContain('/insights');
      expect(document.querySelector('[data-slot="sheet-content"]')?.className).toContain('data-[state=open]:slide-in-from-bottom');
      expect(document.querySelector('[data-slot="sheet-content"]')).toHaveClass('rounded-t-[1.4rem]');
      fireEvent.click(screen.getAllByRole('button', { name: 'Close' })[0]);
      await waitFor(() => expect(screen.queryByText('Telegram intake')).not.toBeInTheDocument());
    }
    fireEvent.click(within(phoneNav).getByRole('link', { name: 'Capture' }));
    expect(await screen.findByRole('heading', { name: 'Record what changed' })).toBeInTheDocument();
    expect(phoneHeaderEyebrow).toHaveTextContent('Capture');
    expect(phoneHeaderTitle).toHaveTextContent('Record what changed');
    expect(container.querySelector('[data-slot="phone-capture-page"]')).not.toBeNull();
    await waitFor(() => expect(container.querySelector('[data-slot="centered-tile-grid"]')).not.toBeNull());
    const captureGrid = container.querySelector('[data-slot="centered-tile-grid"]');
    expect(captureGrid).not.toBeNull();
    expect(captureGrid).toHaveClass('phone-capture-hub-grid');
    expect(captureGrid).toHaveStyle({
      '--hub-tile-size': 'min(calc((100vw - 3rem) / 2), calc((var(--kaur-khor-embedded-effective-height,100dvh) - 19rem) / 2), 10.75rem)',
    });
    expect(captureGrid?.querySelector('.liquid-grid-card-glass')).toBeNull();
    expect(screen.queryByText('Phone capture keeps entry fast. Use the queue to update existing tickets or a wider view for custom multi-lane updates.')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Products Update' })).toHaveAttribute('href', `${hiddenPhoneOperatorHash}work/capture/stock-count`);
    expect(screen.getByRole('button', { name: 'Supplier Order' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Immediate Sale' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Customer Order' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Supplier Receipts' })).not.toBeInTheDocument();
    fireEvent.click(within(phoneNav).getByRole('link', { name: 'Products' }));
    expect(await screen.findByRole('heading', { name: 'Offered Selections' })).toBeInTheDocument();
    expect(phoneHeaderEyebrow).toHaveTextContent('Products');
    expect(phoneHeaderTitle).toHaveTextContent('Offered Selections');
    expect(container.querySelector('[data-slot="phone-products-page"]')).not.toBeNull();
    expect(screen.getByRole('textbox', { name: 'Search products' })).toHaveAttribute('data-slot', 'phone-products-search');
    window.location.hash = `${hiddenPhoneOperatorHash}insights`;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByRole('heading', { name: 'Choose an operating lens' })).toBeInTheDocument();
    expect(phoneHeaderEyebrow).toHaveTextContent('Insights');
    expect(phoneHeaderTitle).toHaveTextContent('Choose an operating lens');
    expect(container.querySelector('[data-slot="phone-insights-page"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Inventory' }));
    expect(await screen.findByRole('heading', { name: 'Inventory health' })).toBeInTheDocument();
    expect(phoneHeaderTitle).toHaveTextContent('Inventory health');
    expect(container.querySelector('[data-slot="phone-inventory-strip"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-inventory-focus-list"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-inventory-projection-preview"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Back to insights' }));
    expect(await screen.findByRole('heading', { name: 'Choose an operating lens' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Money' }));
    expect(await screen.findByRole('heading', { name: 'Money statement' })).toBeInTheDocument();
    expect(phoneHeaderTitle).toHaveTextContent('Money statement');
    expect(container.querySelector('[data-slot="phone-insights-money-page"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-money-ribbon"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-money-statement"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-money-contributors"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Back to insights' }));
    expect(await screen.findByRole('heading', { name: 'Choose an operating lens' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: 'Explain' }));
    expect(await screen.findByRole('heading', { name: 'Explain confidence' })).toBeInTheDocument();
    expect(phoneHeaderTitle).toHaveTextContent('Explain confidence');
    expect(container.querySelector('[data-slot="phone-explain-posture"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-explain-evidence-freshness"]')).not.toBeNull();
    expect(screen.getByText('Count freshness')).toBeInTheDocument();
    expect(screen.getByText('Confidence')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-explain-fragile-list"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Back to insights' }));
    expect(await screen.findByRole('heading', { name: 'Choose an operating lens' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Workspace safety' }));
    expect(container.querySelector('[data-slot="phone-utility-safety-sheet"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Open settings' }));
    expect(await screen.findByRole('heading', { name: 'Workspace safety' })).toBeInTheDocument();
    expect(phoneHeaderEyebrow).toHaveTextContent('Settings');
    expect(phoneHeaderTitle).toHaveTextContent('Configurations');
    expect(phoneHeaderTitle?.querySelector('[data-slot="embedded-phone-header-title-icon"]')).toBeNull();
    expect(container.querySelector('[data-slot="phone-more-page"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-workspace-safety"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-settings-index"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Export backup' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Import backup' })).toBeEnabled();
    expect(screen.queryByRole('heading', { name: 'Workspace' })).not.toBeInTheDocument();
    expect(screen.queryByText('Backup controls are ready for this phone workspace.')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Interface' })).not.toBeInTheDocument();
    expect(screen.queryByText('Phone mode keeps dense desktop controls behind focused cards, sheets, and compact route summaries.')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Preferences' })).toBeInTheDocument();
    expect(screen.getByText('Language')).toBeInTheDocument();
    expect(screen.getByText('Currency')).toBeInTheDocument();
    expect(screen.getByText('abc')).toBeInTheDocument();
    expect(screen.getByText('កខគ')).toBeInTheDocument();
    expect(screen.getByText('$')).toBeInTheDocument();
    expect(screen.getByText('៛')).toBeInTheDocument();
    expect(screen.getByText('USD to KHR exchange rate')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'History' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Local data' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-settings-index"]')?.querySelectorAll('[data-slot="phone-section-title-icon"]')).toHaveLength(4);
    expect(screen.queryByRole('heading', { name: 'Planning' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Lightweight insights' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Help' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Settings and help' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Danger zone' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: mode === 'demo' ? 'Reset demo' : 'Reset workspace' })).toBeEnabled();
    expect(screen.getByRole('link', { name: 'Update history' })).toHaveAttribute('href', `${hiddenPhoneOperatorHash}settings/history`);
    await waitFor(() => {
      expect(container.querySelector('[data-slot="embedded-auto-zoom-viewport"]')).toHaveAttribute('data-phone-portrait', 'true');
      expect(container.querySelector('[data-slot="embedded-auto-zoom-viewport"]')).toHaveAttribute('data-phone-landscape', 'false');
      expect(container.querySelector('[data-slot="embedded-auto-zoom-viewport"]')).toHaveAttribute('data-zoom-level', '0');
      expect(document.documentElement.dataset.kaurKhorEmbeddedPhonePortrait).toBe('true');
      expect(document.documentElement.dataset.kaurKhorEmbeddedPhoneLandscape).toBe('false');
      expect(document.documentElement.dataset.kaurKhorEffectiveViewportWidth).toBe('390');
      expect(document.documentElement.dataset.kaurKhorEffectiveViewportHeight).toBe('844');
    });
  });

  test('opens the Today primary action in the shared queue bottom drawer', async () => {
    window.location.hash = hiddenPhoneOperatorHash;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    await waitFor(() => expect(container.querySelector('[data-slot="phone-today-page"]')).not.toBeNull());
    expect(container.querySelector('[data-slot="phone-today-page"]')).not.toBeNull();
    const primaryAction = container.querySelector<HTMLElement>('[data-slot="phone-primary-action"]');
    expect(primaryAction).not.toBeNull();
    fireEvent.click(primaryAction!);

    await waitFor(() => expect(window.location.hash).toContain('work/queue?task='));
    await waitFor(() => expect(document.querySelector('[data-slot="phone-task-drawer"]')).not.toBeNull());
    expect(screen.getByRole('link', { name: /Edit in Capture/ })).toHaveAttribute('href', expect.stringContaining('/work/capture/supplier-order'));
    fireEvent.click(within(document.querySelector('[data-slot="phone-task-drawer"]') as HTMLElement).getAllByRole('button', { name: 'Close' })[0]);
    await waitFor(() => expect(document.querySelector('[data-slot="phone-task-drawer"]')).toBeNull());
    expect(window.location.hash).not.toContain('task=');
  });

  test.each([
    [360, 740],
    [375, 812],
    [390, 844],
    [414, 896],
    [430, 932],
    [768, 1024],
  ])('renders Today at %i x %i with the required phone sections', async (width, height) => {
    window.location.hash = hiddenPhoneOperatorHash;
    mockViewport(width, height);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    await waitFor(() => expect(container.querySelector('[data-slot="phone-today-page"]')).not.toBeNull());
    expect(container.querySelector('[data-slot="phone-next-move"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-primary-action"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-metric-strip"]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Quick record' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Supplier work' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Customer work' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-recent-outcome"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="embedded-auto-zoom-viewport"]')).toHaveAttribute('data-measured-area', String(width * height));
    if (width < 768) {
      expect(container.querySelector('[data-slot="embedded-auto-zoom-viewport"]')).toHaveAttribute('data-effective-width', String(width));
      expect(container.querySelector('[data-slot="embedded-auto-zoom-viewport"]')).toHaveAttribute('data-effective-height', String(height));
    }
    expect(container.querySelector('[data-slot="embedded-phone-main"]')).toHaveClass('overflow-x-clip');
  });

  test('opens workspace safety from the phone header without a Today safety card', async () => {
    window.location.hash = hiddenPhoneOperatorHash;
    mockViewport(390, 844);
    const handle = createOnboardedBrowserStorageHandle('demo');
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(handle);
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:kaur-khor-backup');
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);

    try {
      const { container } = render(<EmbeddedAppRoute mode="demo" />);

      await waitFor(() => expect(container.querySelector('[data-slot="phone-today-page"]')).not.toBeNull());
      expect(container.querySelector('[data-slot="phone-workspace-safety-alert"]')).toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Workspace safety' }));
      expect(container.querySelector('[data-slot="phone-utility-safety-sheet"]')).not.toBeNull();
      fireEvent.click(screen.getByRole('button', { name: 'Export backup' }));
      await waitFor(() => expect(handle.persistSenaState).toHaveBeenCalled());
      expect(createObjectUrlSpy).toHaveBeenCalled();
      expect(anchorClickSpy).toHaveBeenCalled();
      await waitFor(() => expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:kaur-khor-backup'));
      expect(await screen.findByText('Backup export ready.')).toBeInTheDocument();
    } finally {
      createObjectUrlSpy.mockRestore();
      revokeObjectUrlSpy.mockRestore();
      anchorClickSpy.mockRestore();
    }
  });

  test.each([
    {
      heading: 'ក្រមាភ្នំពេញ',
      route: 'catalog/skus/sku-001',
      summary: 'phone-product-detail-summary',
      type: 'SKU',
    },
    {
      heading: 'ឈុតរុំអំណោយក្រមា',
      route: 'catalog/services/service-001',
      summary: 'phone-product-detail-summary',
      type: 'Service',
    },
  ])('renders a phone-native $type detail route from Products', async ({ heading, route, summary, type }) => {
    window.location.hash = `${hiddenPhoneOperatorHash}${route}`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
    const pageHeader = container.querySelector('[data-slot="phone-page-header"]');
    expect(pageHeader).not.toBeNull();
    expect(within(pageHeader as HTMLElement).getByText(type)).toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-product-detail-page"]')).not.toBeNull();
    expect(container.querySelector(`[data-slot="${summary}"]`)).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-detail-section-tabs"]')).toBeNull();
    expect(container.querySelector('[data-slot="phone-detail-refresh"]')).toBeNull();
    expect(container.querySelector('[data-slot="phone-detail-metric-strip"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-product-actions"]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Actions' })).toBeInTheDocument();
    if (type === 'SKU') {
      expect(container.querySelector('[data-slot="phone-sku-heartbeat"]')).not.toBeNull();
      expect(container.querySelector('[data-slot="phone-sku-services-section"]')).not.toBeNull();
      expect(container.querySelector('[data-slot="phone-sku-pipeline-section"]')).toBeNull();
      expect(container.querySelector('[data-slot="phone-sku-evidence-section"]')).toBeNull();
      expect(container.querySelector('[data-slot="phone-sku-ledger-section"]')).toBeNull();
      expect(screen.getByText(/likely on hand|Unknown likely on hand/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Products Update' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Supplier Order' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Customer Order' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Immediate Sale' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Updated price' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Supplier Receipts' })).not.toBeInTheDocument();
    } else {
      expect(container.querySelector('[data-slot="phone-service-heartbeat"]')).not.toBeNull();
      expect(container.querySelector('[data-slot="phone-service-bottlenecks-section"]')).toBeNull();
      expect(container.querySelector('[data-slot="phone-service-recovery-section"]')).toBeNull();
      expect(container.querySelector('[data-slot="phone-service-customer-work-section"]')).toBeNull();
      expect(container.querySelector('[data-slot="phone-service-evidence-section"]')).toBeNull();
      expect(container.querySelector('[data-slot="phone-service-ledger-section"]')).toBeNull();
      expect(screen.getAllByText(/service units likely sellable today|Blocked until linked stock is refreshed|Sellability unknown/).length).toBeGreaterThan(0);
      expect(screen.queryByText('On hand')).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Open bottleneck SKU' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Products Update' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Customer Order' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Immediate Sale' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Updated price' })).toBeInTheDocument();
    }
    expect(screen.getByRole('link', { name: 'Back to products' })).toHaveAttribute('href', `${hiddenPhoneOperatorHash}catalog`);
    expect(screen.queryByRole('heading', { name: 'Catalog' })).not.toBeInTheDocument();
  });

  test('renders a phone-native missing product state', async () => {
    window.location.hash = `${hiddenPhoneOperatorHash}catalog/skus/missing-sku`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    expect(await screen.findByRole('heading', { name: 'Product not found' })).toBeInTheDocument();
    expect(screen.getByText('This product is not available in the phone catalog.')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-product-detail-page"]')).not.toBeNull();
    expect(screen.getByRole('link', { name: 'Back to products' })).toHaveAttribute('href', `${hiddenPhoneOperatorHash}catalog`);
  });

  test('prompts before opening a targeted phone SKU capture action and preserves desktop route params', async () => {
    window.location.hash = `${hiddenPhoneOperatorHash}catalog/skus/sku-001`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    render(<EmbeddedAppRoute mode="demo" />);

    expect(await screen.findByRole('heading', { name: 'ក្រមាភ្នំពេញ' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Customer Order' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Leave detail page?');
    fireEvent.click(screen.getByRole('button', { name: 'Continue to capture' }));

    await waitFor(() => {
      expect(window.location.hash).toContain(`${hiddenPhoneOperatorHash}work/capture/customer-order?`);
    });
    expect(window.location.hash).toContain('targetAction=customer-order');
    expect(window.location.hash).toContain('targetType=sku');
    expect(window.location.hash).toContain('targetId=sku-001');
    expect(window.location.hash).toContain('ticketMode=new');
    expect(window.location.hash).toContain('source=sku-detail');
  });

  test('lets phone SKU detail delete an existing capture draft before starting a targeted session', async () => {
    window.localStorage.setItem('kaur-khor:record-update:draft:supplier-order-pending:v1', '{"version":1}');
    window.location.hash = `${hiddenPhoneOperatorHash}catalog/skus/sku-001`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    render(<EmbeddedAppRoute mode="demo" />);

    expect(await screen.findByRole('heading', { name: 'ក្រមាភ្នំពេញ' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Supplier Order' }));

    expect(screen.getByRole('dialog')).toHaveTextContent('Delete saved draft?');
    fireEvent.click(screen.getByRole('button', { name: 'Delete draft and start new' }));

    await waitFor(() => {
      expect(window.location.hash).toContain(`${hiddenPhoneOperatorHash}work/capture/supplier-order?`);
    });
    expect(window.location.hash).toContain('targetAction=supplier-order');
    expect(window.location.hash).toContain('targetType=sku');
    expect(window.location.hash).toContain('targetId=sku-001');
    expect(window.localStorage.getItem('kaur-khor:record-update:draft:supplier-order-pending:v1')).toBeNull();
  });

  test('omits the phone SKU price capture action for non-sellable SKUs', async () => {
    const state = fallbackStateForMode('demo');
    state.preferences.onboardingCompletedAt = '2026-05-05T00:00:00.000Z';
    state.catalog.skus = state.catalog.skus.map((sku) => (
      sku.skuId === 'sku-001'
        ? { ...sku, productPrice: null, soldAsProduct: false }
        : sku
    ));
    window.location.hash = `${hiddenPhoneOperatorHash}catalog/skus/sku-001`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createSupportedBrowserStorageHandle([
      {
        collection: 'browser_state',
        id: KAUR_KHOR_BROWSER_DEMO_DATABASE,
        json: state,
        updatedAt: '2026-05-05T00:00:00.000Z',
      },
    ]));

    render(<EmbeddedAppRoute mode="demo" />);

    expect(await screen.findByRole('heading', { name: 'ក្រមាភ្នំពេញ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Products Update' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Supplier Order' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Customer Order' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Immediate Sale' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Updated price' })).not.toBeInTheDocument();
  });

  test('opens phone Service capture actions through desktop-parity targets', async () => {
    window.location.hash = `${hiddenPhoneOperatorHash}catalog/services/service-001`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    render(<EmbeddedAppRoute mode="demo" />);

    expect(await screen.findByRole('heading', { name: 'ឈុតរុំអំណោយក្រមា' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to products' })).toHaveAttribute('href', `${hiddenPhoneOperatorHash}catalog`);
    expect(screen.queryByRole('button', { name: 'Products Update' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Open bottleneck SKU' }));
    const openBottleneckDialog = screen.getByRole('dialog');
    expect(openBottleneckDialog).toHaveTextContent('Open bottleneck SKU?');
    fireEvent.click(within(openBottleneckDialog).getByRole('button', { name: 'Open bottleneck SKU' }));
    await waitFor(() => {
      expect(window.location.hash).toContain(`${hiddenPhoneOperatorHash}catalog/skus/sku-001`);
    });

    window.location.hash = `${hiddenPhoneOperatorHash}catalog/services/service-001`;
    await waitFor(() => expect(screen.getByRole('heading', { name: 'ឈុតរុំអំណោយក្រមា' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Updated price' })).toBeInTheDocument();
  });

  test('ignores stale phone service price capture routes instead of exposing form-only controls', async () => {
    const params = new URLSearchParams({
      targetAction: 'service-price',
      targetType: 'service',
      targetId: 'service-001',
      source: 'service-detail',
      breadcrumb: 'Opened from Service detail · ឈុតរុំអំណោយក្រមា',
      returnTo: '/catalog/services/service-001',
    });
    window.location.hash = `${hiddenPhoneOperatorHash}work/capture/stock-count?${params.toString()}`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    await waitFor(() => expect(container.querySelector('[data-slot="embedded-phone-header-title"]')).toHaveTextContent('Products Update'));
    expect(container.querySelector('[data-slot="phone-wide-only-page"]')).toBeNull();
    await waitFor(() => expect(container.querySelector('[data-slot="phone-capture-session-header"]')).not.toBeNull());
    expect(screen.getByText('Main workbench')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="mobile-service-signal-card"]')).toBeNull();
    expect(container.querySelector('[data-slot="record-update-table"]')).toBeNull();
    expect(screen.queryByRole('textbox', { name: /Price if changed/ })).not.toBeInTheDocument();
  });

  test('shows an empty catalog message before phone product search has inventory', async () => {
    window.location.hash = `${hiddenPhoneOperatorHash}catalog`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('app'));

    render(<EmbeddedAppRoute mode="app" />);

    expect(await screen.findByRole('heading', { name: 'Offered Selections' })).toBeInTheDocument();
    expect(screen.getByText('No products yet. Create your first SKU or service to start tracking stock and sellability.')).toBeInTheDocument();
    expect(screen.queryByText('No products match this search.')).not.toBeInTheDocument();
  });

  test('renders route-specific phone empty states for an empty browser workspace', async () => {
    window.location.hash = hiddenPhoneOperatorHash;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('app'));

    const { container } = render(<EmbeddedAppRoute mode="app" />);

    expect(await screen.findByRole('heading', { name: 'Start with products' })).toBeInTheDocument();
    expect(screen.getByText('Create your first SKU or service so Kaur Khor can build today’s work.')).toBeInTheDocument();
    expect(screen.getByText('Create a SKU or service before recording updates.')).toBeInTheDocument();

    window.location.hash = `${hiddenPhoneOperatorHash}work/queue`;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByRole('heading', { name: 'Work that needs a decision' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-queue-empty-state"]')).not.toBeNull();
    expect(screen.getByText('Work needs products first.')).toBeInTheDocument();

    window.location.hash = `${hiddenPhoneOperatorHash}work/capture`;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByRole('heading', { name: 'Record what changed' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Products Update' })).toHaveAttribute('href', `${hiddenPhoneOperatorHash}work/capture/stock-count`);
    expect(screen.getByRole('button', { name: 'Supplier Order' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Immediate Sale' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Customer Order' })).toBeInTheDocument();

    window.location.hash = `${hiddenPhoneOperatorHash}insights/money`;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByRole('heading', { name: 'Money statement' })).toBeInTheDocument();
    expect(screen.getByText('No inventory items yet. Create products before reading mobile insights.')).toBeInTheDocument();
    expect(screen.getByText('Money is not ready yet. Record stock-linked activity so Kaur Khor can calculate the statement.')).toBeInTheDocument();
  });

  test('keeps phone insight analysis refresh failures actionable on the route', async () => {
    window.location.hash = `${hiddenPhoneOperatorHash}insights/explain`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    expect(await screen.findByRole('heading', { name: 'Explain confidence' })).toBeInTheDocument();
    const originalTriggerRun = window.kaurKhorDesktop.sena.triggerRun;
    window.kaurKhorDesktop.sena.triggerRun = vi.fn(async () => {
      throw new Error('analysis worker unavailable');
    });
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh analysis' }));

      expect(await screen.findByText('Unable to refresh analysis.')).toBeInTheDocument();
      expect(container.querySelector('[data-slot="phone-analysis-refresh-error"]')).not.toBeNull();
      expect(within(container.querySelector('[data-slot="phone-analysis-refresh-error"]') as HTMLElement).getByText(/analysis worker unavailable/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
      expect(screen.getByRole('link', { name: 'Open safety' })).toHaveAttribute('href', `${hiddenPhoneOperatorHash}settings`);
      expect(container.querySelector('[data-slot="phone-workspace-error"]')).toBeNull();
      expect(screen.getByRole('heading', { name: 'Explain confidence' })).toBeInTheDocument();
    } finally {
      window.kaurKhorDesktop.sena.triggerRun = originalTriggerRun;
    }
  });

  test('preserves phone insight route state in URL-backed controls', async () => {
    window.location.hash = `${hiddenPhoneOperatorHash}insights/money`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    expect(await screen.findByRole('heading', { name: 'Money statement' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Contributors' }));
    await waitFor(() => expect(window.location.hash).toContain('scope=contributors'));
    expect(container.querySelector('[data-slot="phone-money-contributors"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-money-statement"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Compare evidence' }));
    await waitFor(() => expect(window.location.hash).toContain('compare=evidence'));
    const moneyContributors = container.querySelector('[data-slot="phone-money-contributors"]') as HTMLElement;
    const moneyContributorLink = within(moneyContributors).getAllByRole('link')[0];
    expect(moneyContributorLink).toHaveAttribute('href', expect.stringContaining('returnTo='));
    fireEvent.click(moneyContributorLink);
    expect(await screen.findByRole('heading', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to products' })).toHaveAttribute('href', expect.stringContaining(`${hiddenPhoneOperatorHash}insights/money`));

    window.location.hash = `${hiddenPhoneOperatorHash}insights/explain?section=evidence&timeframe=all`;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByRole('heading', { name: 'Explain confidence' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-explain-evidence-freshness"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-explain-posture"]')).toBeNull();
    expect(container.querySelector('[data-slot="phone-explain-fragile-list"]')).toBeNull();
    expect(screen.getByText(/all-evidence phone diagnostics/)).toBeInTheDocument();

    window.location.hash = `${hiddenPhoneOperatorHash}insights/inventory?scope=all&range=all`;
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(await screen.findByRole('heading', { name: 'Inventory health' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All rows' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All evidence' })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('[data-slot="phone-inventory-focus-list"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-inventory-projection-preview"]')).not.toBeNull();
  });

  test('opens phone inventory row inspector with persisted filters and capture actions', async () => {
    window.location.hash = `${hiddenPhoneOperatorHash}insights/inventory?scope=all&range=all&entity=sku&horizon=30d&view=pipeline`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    expect(await screen.findByRole('heading', { name: 'Inventory health' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All rows' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'All evidence' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Pipeline' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '30D' })).toHaveAttribute('aria-pressed', 'true');
    expect(container.querySelector('[data-slot="phone-inventory-compact-filter-bar"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-inventory-coverage-note"]')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(container.querySelector('[data-slot="phone-inventory-filter-sheet"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'SKUs' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    const firstRowCard = container.querySelector('[data-slot="phone-inventory-row-card"]') as HTMLElement;
    expect(firstRowCard).not.toBeNull();
    fireEvent.click(within(firstRowCard).getByRole('button'));

    await waitFor(() => expect(window.location.hash).toContain('row=sku%3A'));
    const inspector = container.querySelector('[data-slot="phone-inventory-row-inspector"]') as HTMLElement;
    expect(inspector).not.toBeNull();
    expect(within(inspector).getByText('Summary')).toBeInTheDocument();
    expect(within(inspector).getByText('Flow in selected range')).toBeInTheDocument();
    expect(within(inspector).getByText('Pipeline/projection')).toBeInTheDocument();
    expect(within(inspector).getByText('Evidence/freshness')).toBeInTheDocument();
    expect(within(inspector).getByText(/30D projection/)).toBeInTheDocument();
    expect(within(inspector).getByRole('link', { name: 'View details' })).toHaveAttribute('href', expect.stringContaining('returnTo='));
    expect(within(inspector).getByRole('link', { name: 'Products Update' })).toHaveAttribute('href', expect.stringContaining('targetType=sku'));
    expect(within(inspector).getByRole('link', { name: 'Products Update' })).toHaveAttribute('href', expect.stringContaining('source=inventory'));
    expect(within(inspector).getByRole('link', { name: 'Supplier Order' })).toHaveAttribute('href', expect.stringContaining('supplier-order'));
  });

  test('renders phone money statement filters, quality bands, and coverage actions', async () => {
    window.location.hash = `${hiddenPhoneOperatorHash}insights/money?range=90d&entity=service&compare=evidence`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    expect(await screen.findByRole('heading', { name: 'Money statement' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-money-filter-summary"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-money-ribbon"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-money-statement"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-money-quality-bands"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-money-rail-sections"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-money-coverage"]')).not.toBeNull();
    expect(screen.getAllByText(/Net sales/).length).toBeGreaterThan(0);
    expect(screen.getByText('Money tied up')).toBeInTheDocument();
    expect(screen.getByText(/Blocked margin/)).toBeInTheDocument();
    expect(screen.getByText('Earners')).toBeInTheDocument();
    expect(screen.getByText('Commitments due')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Record Update' })).toHaveAttribute('href', expect.stringContaining(`${hiddenPhoneOperatorHash}work/capture?`));
    expect(screen.getByRole('link', { name: 'Record Update' })).toHaveAttribute('href', expect.stringContaining('source=money'));

    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    const moneyFilterDialog = screen.getByRole('dialog', { name: 'Filter money' });
    expect(moneyFilterDialog).toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-money-filter-sheet"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Services' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '90D' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'SKUs' }));
    await waitFor(() => expect(window.location.hash).toContain('entity=sku'));
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(window.location.hash).not.toContain('entity='));
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Filter money' }), { key: 'Escape' });
    await waitFor(() => expect(container.querySelector('[data-slot="phone-money-filter-sheet"]')).toBeNull());
  });

  test('renders phone explain filters, signals, timeline, and wide boundary', async () => {
    window.location.hash = `${hiddenPhoneOperatorHash}insights/explain?entity=sku&timeframe=all`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    expect(await screen.findByRole('heading', { name: 'Explain confidence' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-explain-filter-summary"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-explain-posture"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-explain-evidence-freshness"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-explain-signal-list"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-explain-fragile-list"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-explain-evidence-timeline"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-explain-wide-boundary"]')).not.toBeNull();
    expect(screen.getByText(/Coverage/)).toBeInTheDocument();
    expect(screen.getByText(/Top structural pressure/)).toBeInTheDocument();
    expect(screen.getByText('Full workbench needs a wider view.')).toBeInTheDocument();
    const fragileList = container.querySelector('[data-slot="phone-explain-fragile-list"]') as HTMLElement;
    expect(within(fragileList).getAllByRole('link')[0]).toHaveAttribute('href', expect.stringContaining('source=explain'));

    fireEvent.click(screen.getByRole('button', { name: 'Filter' }));
    expect(screen.getByRole('dialog', { name: 'Filter explain' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-explain-filter-sheet"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'SKUs' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Services' }));
    await waitFor(() => expect(window.location.hash).toContain('entity=service'));
  });

  test('preserves phone product search query through detail navigation', async () => {
    window.location.hash = `${hiddenPhoneOperatorHash}catalog`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    expect(await screen.findByRole('heading', { name: 'Offered Selections' })).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search products' }), { target: { value: 'ក្រមា' } });
    await waitFor(() => expect(window.location.hash).toContain('q='));
    const productLinks = container.querySelectorAll<HTMLAnchorElement>('[data-slot="phone-list-item"]');
    expect(productLinks.length).toBeGreaterThan(0);
    expect(productLinks[0]?.getAttribute('href')).toContain('q=');
    fireEvent.click(productLinks[0]);

    expect(await screen.findByRole('heading', { name: 'Actions' })).toBeInTheDocument();
    expect(window.location.hash).toContain('q=');
    expect(screen.getByRole('link', { name: 'Back to products' })).toHaveAttribute('href', expect.stringContaining('q='));
    window.history.back();
    expect(await screen.findByRole('heading', { name: 'Offered Selections' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Search products' })).toHaveValue('ក្រមា');
    await waitFor(() => expect(window.location.hash).toContain('q='));
    const restoredProductLinks = container.querySelectorAll<HTMLAnchorElement>('[data-slot="phone-list-item"]');
    expect(restoredProductLinks.length).toBeGreaterThan(0);
    expect(restoredProductLinks[0]?.getAttribute('href')).toContain('q=');
  });

  test('filters phone products and opens product action sheet routes with context', async () => {
    window.location.hash = `${hiddenPhoneOperatorHash}catalog`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    expect(await screen.findByRole('heading', { name: 'Offered Selections' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-products-type-filter"]')).not.toBeNull();
    expect(within(container.querySelector('[data-slot="phone-products-type-filter"]') as HTMLElement).getByRole('button', { name: 'All' }).querySelector('.lucide-layers')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-products-quick-filter"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="phone-products-quick-filter"]')?.querySelectorAll('[data-slot="phone-chip-row-icon"]')).toHaveLength(6);
    expect(container.querySelector('[data-slot="phone-products-quick-filter"]')).toHaveClass('phone-product-filter-row', 'flex-nowrap');
    expect(container.querySelector('[data-slot="phone-products-quick-filter"]')?.querySelectorAll('[data-slot="phone-product-filter-label"]')).toHaveLength(6);
    expect(screen.getByRole('button', { name: 'Blocked services' }).querySelector('.lucide-store')).not.toBeNull();
    expect(
      (container.querySelector('[data-slot="phone-products-type-filter"]')?.compareDocumentPosition(screen.getByRole('textbox', { name: 'Search products' })) ?? 0) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.change(screen.getByRole('textbox', { name: 'Search products' }), { target: { value: 'MekongLoomHouse' } });
    expect(await screen.findByText('ក្រមាភ្នំពេញ')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Services' }));
    expect(await screen.findByText('ឈុតរុំអំណោយក្រមា')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'SKUs' }));
    expect(await screen.findByText('ក្រមាភ្នំពេញ')).toBeInTheDocument();

    const firstProductCard = container.querySelector('[data-slot="phone-product-card"]') as HTMLElement;
    expect(firstProductCard).not.toBeNull();
    expect(within(firstProductCard).queryByRole('button', { name: 'Actions' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-product-actions-sheet"]')).toBeNull();
  });

  test('keeps phone product detail focused without inline refresh controls', async () => {
    window.location.hash = `${hiddenPhoneOperatorHash}catalog/skus/sku-001`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    expect(await screen.findByRole('heading', { name: 'Actions' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Refresh detail' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-detail-refresh"]')).toBeNull();
    expect(container.querySelector('[data-slot="phone-detail-refresh-error"]')).toBeNull();
    expect(container.querySelector('[data-slot="phone-workspace-error"]')).toBeNull();
    expect(screen.getByRole('link', { name: 'Back to products' })).toHaveAttribute('href', `${hiddenPhoneOperatorHash}catalog`);
  });

  test('resets the phone viewport scroll position after route changes', async () => {
    window.location.hash = '#/';
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));
    const scrollToSpy = vi.fn();
    const originalScrollTo = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrollToSpy;

    try {
      render(<EmbeddedAppRoute mode="demo" />);

      const phoneNav = await screen.findByRole('navigation', { name: 'Phone navigation' });
      scrollToSpy.mockClear();
      fireEvent.click(within(phoneNav).getByRole('link', { name: 'Products' }));

      expect(await screen.findByRole('heading', { name: 'Offered Selections' })).toBeInTheDocument();
      await waitFor(() => expect(scrollToSpy).toHaveBeenCalledWith(0, 0));
    } finally {
      HTMLElement.prototype.scrollTo = originalScrollTo;
    }
  });

  test.each([
    `${hiddenPhoneOperatorHash}catalog/skus/sku-001/edit`,
    `${hiddenPhoneOperatorHash}work/intake`,
    `${hiddenPhoneOperatorHash}inventory`,
  ])('keeps unsupported phone route %s behind the wide-view boundary', async (route) => {
    window.location.hash = route;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    expect(await screen.findByRole('heading', { name: 'Use a wider view for deep analysis' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-wide-only-page"]')).not.toBeNull();
    expect(screen.queryByRole('heading', { name: 'Edit SKU' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Inventory' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Intake' })).not.toBeInTheDocument();
    const safeLinks = container.querySelector('[data-slot="phone-wide-only-safe-links"]') as HTMLElement;
    expect(safeLinks).not.toBeNull();
    expect(within(safeLinks).getByRole('link', { name: 'Today' })).toHaveAttribute('href', hiddenPhoneOperatorHash.replace(/\/$/, ''));
    expect(within(safeLinks).getByRole('link', { name: 'Queue' })).toHaveAttribute('href', `${hiddenPhoneOperatorHash}work/queue`);
    expect(within(safeLinks).getByRole('link', { name: 'Capture' })).toHaveAttribute('href', `${hiddenPhoneOperatorHash}work/capture`);
    expect(within(safeLinks).getByRole('link', { name: 'Products' })).toHaveAttribute('href', `${hiddenPhoneOperatorHash}catalog`);
    expect(within(safeLinks).getByRole('link', { name: 'Insights' })).toHaveAttribute('href', `${hiddenPhoneOperatorHash}insights`);
  });

  test('redirects deprecated phone custom capture links to stock count', async () => {
    window.location.hash = `${hiddenPhoneOperatorHash}work/capture/custom?lanes=stock-count,supplier-order-pending`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    await waitFor(() => expect(window.location.hash).toContain(`${hiddenPhoneOperatorHash}work/capture/stock-count`));
    expect(await screen.findByText('Main workbench')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-capture-session-header"]')).not.toBeNull();
  });

  test('renders onboarding as a supported embedded phone route', async () => {
    window.location.hash = `${hiddenPhoneOperatorHash}onboarding`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    expect(await screen.findByRole('heading', { name: 'Set up Kaur Khor' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="embedded-phone-shell"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="onboarding-page"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="embedded-phone-main"]')).toHaveClass('grid', 'items-center', 'pt-0');
    expect(container.querySelector('[data-slot="embedded-phone-main"]')).toHaveStyle({ paddingBottom: '0px' });
    expect(container.querySelector('[data-slot="phone-wide-only-page"]')).toBeNull();
    expect(container.querySelector('[data-slot="embedded-phone-header-title"]')).toHaveTextContent('Set up Kaur Khor');
  });

  test.each([
    {
      label: 'Products Update',
      route: 'work/capture/stock-count',
    },
    {
      label: 'Supplier Order',
      route: 'work/capture/supplier-order?ticketMode=new',
    },
    {
      label: 'Supplier Receipt',
      route: 'work/capture/supplier-receipt?ticketMode=edit',
    },
    {
      label: 'Immediate Sale',
      route: 'work/capture/immediate-sale?ticketMode=new',
    },
    {
      label: 'Customer Order',
      route: 'work/capture/customer-order?ticketMode=new',
    },
  ])('renders the shared mobile $label capture session', async ({ label, route }) => {
    window.location.hash = `${hiddenPhoneOperatorHash}${route}`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    await waitFor(() => expect(container.querySelector('[data-slot="embedded-phone-header-title"]')).toHaveTextContent(label));
    expect(container.querySelector('[data-slot="phone-capture-page"]')).toBeNull();
    expect(container.querySelector('[data-slot="phone-capture-lane-summary"]')).toBeNull();
    expect(container.querySelector('[data-slot="phone-capture-stepper"]')).toBeNull();
    expect(container.querySelector('[data-slot="phone-capture-menu"]')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Command home' })).not.toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Phone navigation' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-capture-reduced-nav"]')).toBeNull();
    expect(container.querySelector('[data-slot="phone-capture-session-header"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="embedded-phone-header"] > div')).toHaveClass('flex-wrap', 'gap-y-2');
    expect(container.querySelector('[data-slot="embedded-phone-header"] > div > div')).toHaveClass('flex-[999_0_max-content]', 'max-w-full');
    expect(container.querySelector('[data-slot="embedded-phone-header-title"] span')).toHaveClass('whitespace-nowrap', 'min-w-fit');
    expect(container.querySelector('[data-slot="embedded-phone-capture-header-title-meta"]')).not.toBeNull();
    const headerActions = container.querySelector('[data-slot="embedded-phone-capture-header-actions"]');
    expect(headerActions).toHaveClass('flex-[1_1_26rem]', 'min-w-[min(100%,26rem)]', 'flex-wrap', 'justify-end');
    expect(headerActions?.firstElementChild).toHaveClass('w-full', 'flex-wrap', 'items-stretch');
    const buttons = Array.from(headerActions?.querySelectorAll('button') ?? []);
    expect(buttons[0]).toHaveClass('flex-[1_1_0]', 'min-w-[18rem]', 'whitespace-nowrap');
    expect(buttons[1]).toHaveClass('w-full', 'min-w-0');
    expect(screen.queryByRole('link', { name: 'Close capture' })).not.toBeInTheDocument();
  });

  test('routes contextual mobile supplier queue params into the shared Supplier Order session', async () => {
    const params = new URLSearchParams({
      source: 'queue',
      breadcrumb: 'Opened from Queue · Supplier task',
      returnTo: '/work/queue?scope=customer',
      targetType: 'sku',
      targetId: 'sku-001',
      skus: 'sku-001',
      quantitySuggestion: '12',
      supplierName: 'Phnom Penh Supply',
    });
    window.location.hash = `${hiddenPhoneOperatorHash}work/capture/supplier-order?${params.toString()}`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    await waitFor(() => expect(container.querySelector('[data-slot="embedded-phone-header-title"]')).toHaveTextContent('Supplier Order'));
    expect(container.querySelector('[data-slot="phone-capture-source-breadcrumb"]')).toBeNull();
    expect(container.querySelector('[data-slot="phone-capture-prefill-summary"]')).toBeNull();
    expect(container.querySelector('[data-slot="phone-capture-supplier-context"]')).toBeNull();
    expect(container.querySelector('[data-slot="phone-capture-session-header"]')).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'Close capture' })).not.toBeInTheDocument();
    expect(window.location.hash).toContain('quantitySuggestion=12');
    expect(window.location.hash).toContain('supplierName=Phnom+Penh+Supply');
  });

  test('spans unpaired phone capture metadata actions across the full row', async () => {
    window.location.hash = `${hiddenPhoneOperatorHash}work/capture/customer-order?ticketMode=new`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    await waitFor(() => expect(container.querySelector('[data-slot="embedded-phone-header-title"]')).toHaveTextContent('Customer Order'));
    const metadataActions = container.querySelector('[data-slot="phone-capture-metadata-actions"]') as HTMLElement;
    expect(metadataActions).not.toBeNull();
    expect(within(metadataActions).getByRole('button', { name: /^Notes/i })).toHaveClass('col-span-2');
    expect(within(metadataActions).getByRole('button', { name: /^Context/i })).toHaveClass('col-span-2');
    expect(within(metadataActions).getByRole('button', { name: /^Delivery/i })).not.toHaveClass('col-span-2');
    expect(within(metadataActions).getByRole('button', { name: /^Discount/i })).not.toHaveClass('col-span-2');
  });

  test('builds a phone customer ticket queue action as a sparse ticket event', () => {
    const input = buildPhoneQueueObservationInput({
      action: 'mark_completed',
      actionLabel: 'Mark completed',
      detail: 'Customer wants two',
      href: '/work/capture/customer-order?ticketMode=edit&ticketId=ticket-phone-customer',
      id: 'customer:ticket:ticket-phone-customer',
      meta: '2 requested',
      quantitySuggestion: 2,
      returnTo: '/work/queue?scope=customer',
      scope: 'customer',
      sourceBreadcrumb: 'Opened from Queue · Customer task',
      targetId: 'sku-001',
      targetType: 'sku',
      ticket: {
        ticketId: 'ticket-phone-customer',
        ticketFamily: 'customer',
        lifecycle: 'open',
        stage: 'pending',
        revision: 1,
        eventType: 'created',
        occurredAt: '2026-05-05T08:00:00.000Z',
        nextTouchAt: null,
        party: {
          role: 'customer',
          customerName: 'Phone Customer',
        },
        lines: [{
          entityType: 'sku',
          entityId: 'sku-001',
          quantityDelta: 2,
        }],
        note: 'Phone ticket seed',
      },
      title: 'Customer Ticket ID: 2026-05-05-#1',
    }, '2', '2026-05-08', 'phone ticket follow-up');

    expect(input?.ticketEvents).toEqual([
      expect.objectContaining({
        ticketId: 'ticket-phone-customer',
        ticketFamily: 'customer',
        lifecycle: 'resolved',
        stage: 'fulfilled_immediate',
        eventType: 'fulfilled_immediate',
        revision: 2,
        note: 'phone ticket follow-up',
      }),
    ]);
    expect(input?.ticketEvents?.[0]?.lines[0]).toEqual(expect.objectContaining({
      entityId: 'sku-001',
      note: 'phone ticket follow-up',
    }));
  });

  test('only exposes phone queue batch metadata when a real supplier group exists', () => {
    const baseTask = {
      action: 'log_order',
      actionLabel: 'Place supplier order',
      batchOrderId: null,
      childOrderId: null,
      id: 'supplier:sku-001',
      kind: 'sku',
      skuId: 'sku-001',
      skuName: 'Phone SKU 1',
      stateLabel: 'To order',
      suggestedOrderQuantity: 4,
      supplierName: 'Phone Supplier',
      supplierTicketId: null,
      whyNow: 'Needs replenishment.',
    } as const;
    const groupedTask = {
      ...baseTask,
      id: 'supplier:sku-002',
      skuId: 'sku-002',
      skuName: 'Phone SKU 2',
    } as const;

    const singleSheetTask = phoneSheetTaskForSupplierTask(baseTask as never, [baseTask as never]);
    const groupedSheetTask = phoneSheetTaskForSupplierTask(baseTask as never, [baseTask as never, groupedTask as never]);

    expect(singleSheetTask.batchTaskCount).toBeNull();
    expect(singleSheetTask.batchUpdateHref).toBeNull();
    expect(groupedSheetTask.batchTaskCount).toBe(2);
    expect(groupedSheetTask.batchUpdateHref).toContain('skus=sku-001%2Csku-002');
  });

  test('keeps shared capture sessions free of legacy phone-only draft UI', async () => {
    window.sessionStorage.setItem(
      'kaur-khor:phone-capture-draft:stock-count:sku-001',
      JSON.stringify({ note: 'legacy draft', quantity: '9' }),
    );
    window.location.hash = `${hiddenPhoneOperatorHash}work/capture/stock-count?skus=sku-001&returnTo=/catalog`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    await waitFor(() => expect(container.querySelector('[data-slot="embedded-phone-header-title"]')).toHaveTextContent('Products Update'));
    expect(screen.queryByRole('navigation', { name: 'Phone navigation' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-capture-session-header"]')).not.toBeNull();
    expect(screen.queryByRole('link', { name: 'Close capture' })).not.toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-capture-draft-indicator"]')).toBeNull();
    expect(container.querySelector('[data-slot="phone-capture-leave-confirmation"]')).toBeNull();
    expect(window.sessionStorage.getItem('kaur-khor:phone-capture-draft:stock-count:sku-001')).toContain('legacy draft');
  });

  test('keeps shared capture sessions rendering when sessionStorage is blocked', async () => {
    const getItemSpy = vi.spyOn(window.sessionStorage.__proto__, 'getItem').mockImplementation(() => {
      throw new Error('sessionStorage blocked');
    });
    const setItemSpy = vi.spyOn(window.sessionStorage.__proto__, 'setItem').mockImplementation(() => {
      throw new Error('sessionStorage blocked');
    });
    window.location.hash = `${hiddenPhoneOperatorHash}work/capture/stock-count?skus=sku-001&returnTo=/catalog`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    try {
      const { container } = render(<EmbeddedAppRoute mode="demo" />);

      await waitFor(() => expect(container.querySelector('[data-slot="embedded-phone-header-title"]')).toHaveTextContent('Products Update'));
      expect(screen.queryByRole('navigation', { name: 'Phone navigation' })).not.toBeInTheDocument();
      expect(container.querySelector('[data-slot="phone-capture-session-header"]')).not.toBeNull();
      expect(screen.queryByRole('link', { name: 'Close capture' })).not.toBeInTheDocument();
      expect(container.querySelector('[data-slot="phone-capture-draft-indicator"]')).toBeNull();
      expect(container.querySelector('[data-slot="phone-capture-leave-confirmation"]')).toBeNull();
    } finally {
      getItemSpy.mockRestore();
      setItemSpy.mockRestore();
    }
  });

  test('wires hidden phone shell safety actions to browser backup handlers', async () => {
    window.location.hash = `${hiddenPhoneOperatorHash}settings`;
    mockViewport(390, 844);
    const handle = createOnboardedBrowserStorageHandle('app');
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(handle);
    const createObjectUrlSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:kaur-khor-backup');
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    const inputClickSpy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    try {
      const { container } = render(<EmbeddedAppRoute mode="app" />);

      fireEvent.click(await screen.findByRole('button', { name: 'Export backup' }));
      await waitFor(() => expect(handle.persistSenaState).toHaveBeenCalled());
      expect(createObjectUrlSpy).toHaveBeenCalled();
      expect(anchorClickSpy).toHaveBeenCalled();
      await waitFor(() => expect(revokeObjectUrlSpy).toHaveBeenCalledWith('blob:kaur-khor-backup'));
      expect(container.querySelector('[data-slot="phone-storage-feedback"]')).not.toBeNull();
      expect(await screen.findByText('Backup export ready.')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Import backup' }));
      expect(inputClickSpy).toHaveBeenCalled();
      const input = container.querySelector('input[type="file"]');
      expect(input).not.toBeNull();
      fireEvent.change(input as HTMLInputElement, {
        target: {
          files: [{
            name: 'bad-backup.json',
            text: vi.fn(async () => '{nope'),
            type: 'application/json',
          } as unknown as File],
        },
      });
      expect(await screen.findByText('Backup import needs attention.')).toBeInTheDocument();
      expect(within(container.querySelector('[data-slot="phone-storage-feedback"]') as HTMLElement).getByText('Backup JSON could not be parsed.')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Reset workspace' }));
      expect(container.querySelector('[data-slot="phone-reset-confirmation"]')).not.toBeNull();
      expect(screen.getByText('This removes local browser workspace data from this device. Export a backup first if you need this data. This action cannot be undone.')).toBeInTheDocument();
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(handle.clear).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(container.querySelector('[data-slot="phone-reset-confirmation"]')).toBeNull();
    } finally {
      createObjectUrlSpy.mockRestore();
      revokeObjectUrlSpy.mockRestore();
      anchorClickSpy.mockRestore();
      inputClickSpy.mockRestore();
      confirmSpy.mockRestore();
    }
  });

  test('renders phone update history shell with the shared phone header', async () => {
    window.location.hash = `${hiddenPhoneOperatorHash}settings/history`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    expect(await screen.findByRole('heading', { name: 'Update history' })).toBeInTheDocument();
    expect(container.querySelector('[data-slot="phone-history-summary"]')).not.toBeNull();
    expect(container.querySelector('[data-slot="embedded-phone-header-title"]')).toHaveTextContent('Update history');
    expect(screen.getByRole('button', { name: 'Refresh history' })).toBeEnabled();
  });

  test('keeps phone update history usable after observation refresh failure', async () => {
    window.location.hash = `${hiddenPhoneOperatorHash}settings/history`;
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle('demo'));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    expect(await screen.findByRole('heading', { name: 'Update history' })).toBeInTheDocument();
    const originalListObservations = window.kaurKhorDesktop.sena.listObservations;
    window.kaurKhorDesktop.sena.listObservations = vi.fn(async () => {
      throw new Error('observation index unavailable');
    });
    try {
      fireEvent.click(screen.getByRole('button', { name: 'Refresh history' }));

      expect(await screen.findByText('Unable to refresh update history.')).toBeInTheDocument();
      expect(container.querySelector('[data-slot="phone-history-refresh-error"]')).not.toBeNull();
      expect(within(container.querySelector('[data-slot="phone-history-refresh-error"]') as HTMLElement).getByText(/observation index unavailable/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Retry' })).toBeEnabled();
      expect(screen.getByRole('link', { name: 'Open safety' })).toHaveAttribute('href', `${hiddenPhoneOperatorHash}settings`);
      expect(container.querySelector('[data-slot="phone-workspace-error"]')).toBeNull();
      expect(screen.getByRole('heading', { name: 'Update history' })).toBeInTheDocument();
    } finally {
      window.kaurKhorDesktop.sena.listObservations = originalListObservations;
    }
  });

  test.each(['demo', 'app'] as const)('refreshes public embedded route auto zoom from phone shell to wide browser and back in %s mode', async (mode) => {
    window.location.hash = '#/';
    mockViewport(390, 844);
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createOnboardedBrowserStorageHandle(mode));

    const { container } = render(<EmbeddedAppRoute mode={mode} />);

    const viewport = await waitFor(() => {
      const current = container.querySelector('[data-slot="embedded-auto-zoom-viewport"]');
      expect(current).not.toBeNull();
      expect(current).toHaveAttribute('data-phone-landscape', 'false');
      expect(current).toHaveAttribute('data-phone-portrait', 'true');
      expect(current).toHaveAttribute('data-zoom-level', '0');
      expect(current).toHaveAttribute('data-effective-width', '390');
      expect(current).toHaveAttribute('data-effective-height', '844');
      return current;
    });

    mockViewport(1600, 900);
    fireEvent.resize(window);

    await waitFor(() => {
      expect(viewport).toHaveAttribute('data-phone-landscape', 'false');
      expect(viewport).toHaveAttribute('data-phone-portrait', 'false');
      expect(viewport).toHaveAttribute('data-zoom-level', '0');
      expect(viewport).toHaveAttribute('data-effective-width', '1600');
      expect(viewport).toHaveAttribute('data-effective-height', '900');
      expect(document.documentElement.dataset.kaurKhorEmbeddedPhoneLandscape).toBe('false');
      expect(document.documentElement.dataset.kaurKhorEmbeddedPhonePortrait).toBe('false');
    });

    mockViewport(390, 844);
    fireEvent.resize(window);

    await waitFor(() => {
      expect(viewport).toHaveAttribute('data-phone-landscape', 'false');
      expect(viewport).toHaveAttribute('data-phone-portrait', 'true');
      expect(viewport).toHaveAttribute('data-zoom-level', '0');
      expect(viewport).toHaveAttribute('data-effective-width', '390');
      expect(viewport).toHaveAttribute('data-effective-height', '844');
      expect(document.documentElement.dataset.kaurKhorEmbeddedPhoneLandscape).toBe('false');
      expect(document.documentElement.dataset.kaurKhorEmbeddedPhonePortrait).toBe('true');
    });
  });

  test('does not render the rotate overlay when portrait phones use the native shell', async () => {
    mockViewport(390, 844);

    render(
      <EmbeddedAutoZoomViewport phoneLandscapeOverlay={<div role="dialog" aria-label="Rotate screen" />}>
        <div>Embedded product</div>
      </EmbeddedAutoZoomViewport>,
    );

    expect(screen.queryByRole('dialog', { name: 'Rotate screen' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="embedded-phone-landscape-overlay"]')).toBeNull();
  });

  test('renders Khmer hidden phone shell copy from the browser workspace language', async () => {
    window.location.hash = hiddenPhoneOperatorHash;
    mockViewport(390, 844);
    const state = fallbackStateForMode('demo');
    state.preferences.language = 'km';
    state.preferences.onboardingCompletedAt = '2026-05-05T00:00:00.000Z';
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createSupportedBrowserStorageHandle([
      {
        collection: 'browser_state',
        id: KAUR_KHOR_BROWSER_DEMO_DATABASE,
        json: state,
        updatedAt: '2026-05-05T00:00:00.000Z',
      },
    ]));

    const { container } = render(<EmbeddedAppRoute mode="demo" />);

    expect(await screen.findByRole('navigation', { name: 'ការរុករកលើទូរស័ព្ទ' })).toBeInTheDocument();
    expect(screen.getByText('របៀបប្រតិបត្តិករទូរស័ព្ទ')).toBeInTheDocument();
    expect(screen.getByText('សកម្មភាពបន្ទាប់')).toBeInTheDocument();
    expect(screen.queryByText('ផ្លូវលឿន')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'បង្វិលអេក្រង់' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: 'ទំនិញ' }));
    expect(await screen.findByRole('heading', { name: 'ជម្រើសដែលផ្តល់ជូន' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'ស្វែងរកទំនិញ' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'សុវត្ថិភាពកន្លែងធ្វើការ' }));
    expect(container.querySelector('[data-slot="phone-utility-safety-sheet"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'នាំចេញច្បាប់បម្រុង' })).toBeEnabled();
  });

  test('renders Khmer rotate warning copy from the browser workspace language', () => {
    mockViewport(390, 844);
    const state = fallbackStateForMode('demo');
    state.preferences.language = 'km';
    setBrowserDesktopBridgeMockState(state);

    render(
      <EmbeddedAutoZoomViewport enablePhoneLandscapeWorkaround phoneLandscapeOverlay={<PhoneViewWarningOverlay />}>
        <div>Embedded product</div>
      </EmbeddedAutoZoomViewport>,
    );

    expect(screen.getByRole('dialog', { name: 'បង្វិលអេក្រង់' })).toBeInTheDocument();
    expect(screen.getAllByText('កខត្រូវការកន្លែងធំជាងនេះ។ បង្វិលអេក្រង់របស់អ្នកទៅចំហៀង រួចបន្តនៅក្នុងប្លង់ធំជាងនេះ។').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'រួចរាល់' })).toBeDisabled();
  });

  test('does not show the rotate warning on non-phone landscape viewports', () => {
    mockViewport(844, 390);

    render(
      <EmbeddedAutoZoomViewport>
        <div>Embedded product</div>
      </EmbeddedAutoZoomViewport>,
    );

    expect(screen.queryByRole('dialog', { name: 'Rotate screen' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-slot="embedded-phone-landscape-overlay"]')).toBeNull();
    expect(document.querySelector('[data-slot="embedded-auto-zoom-viewport"]')).toHaveClass('overflow-hidden');
    expect(document.querySelector('[data-slot="embedded-auto-zoom-viewport"]')).toHaveAttribute('data-effective-width', String(Math.round(693 / RESPONSIVE_PHONE_VIEWPORT_MAX_SCALE)));
    expect(document.querySelector('[data-slot="embedded-auto-zoom-viewport"]')).toHaveAttribute('data-effective-height', String(Math.round(390 / RESPONSIVE_PHONE_VIEWPORT_MAX_SCALE)));
    expect(document.querySelector('[data-slot="embedded-phone-landscape-frame"]')).toHaveStyle({
      height: '390px',
      width: '844px',
    });
    expect(document.querySelector('[data-slot="embedded-auto-zoom-layout-spacer"]')).toHaveStyle({
      height: '390px',
      left: '75.5px',
      position: 'absolute',
      top: '0px',
      width: '693px',
    });
  });

  test('refreshes root embedded viewport metadata after phone rotation with stable effective dimensions', async () => {
    mockViewport(844, 390);

    const { container } = render(
      <EmbeddedAutoZoomViewport>
        <div>Embedded product</div>
      </EmbeddedAutoZoomViewport>,
    );

    const viewport = container.querySelector('[data-slot="embedded-auto-zoom-viewport"]');
    expect(viewport).not.toBeNull();
    await waitFor(() => {
      expect(document.documentElement.dataset.kaurKhorEmbeddedPhoneLandscape).toBe('true');
      expect(document.documentElement.dataset.kaurKhorEmbeddedPhonePortrait).toBe('false');
      expect(viewport).toHaveAttribute('data-phone-landscape', 'true');
      expect(viewport).toHaveAttribute('data-phone-portrait', 'false');
      expect(document.documentElement.dataset.kaurKhorEffectiveViewportWidth).toBe(String(Math.round(693 / RESPONSIVE_PHONE_VIEWPORT_MAX_SCALE)));
      expect(document.documentElement.dataset.kaurKhorEffectiveViewportHeight).toBe(String(Math.round(390 / RESPONSIVE_PHONE_VIEWPORT_MAX_SCALE)));
      expect(viewport?.querySelector('[data-slot="embedded-phone-landscape-overlay"]')).toBeNull();
    });

    mockViewport(390, 844);
    fireEvent(window, new Event('orientationchange'));

    await waitFor(() => {
      expect(viewport).toHaveAttribute('data-phone-landscape', 'false');
      expect(viewport).toHaveAttribute('data-phone-portrait', 'true');
      expect(document.documentElement.dataset.kaurKhorEmbeddedPhoneLandscape).toBe('false');
      expect(document.documentElement.dataset.kaurKhorEmbeddedPhonePortrait).toBe('true');
      expect(document.documentElement.dataset.kaurKhorEffectiveViewportWidth).toBe('390');
      expect(document.documentElement.dataset.kaurKhorEffectiveViewportHeight).toBe('844');
    });
  });

  test('renders the embedded onboarding banner in the app flow', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <EmbeddedAppBanner
          mode="demo"
          storage={embeddedStorage}
          onExport={vi.fn()}
          onImport={vi.fn()}
          onReset={vi.fn()}
        />
      </MemoryRouter>,
    );

    const bannerCard = container.querySelector('[data-slot="web-app-banner-card"]');
    const bannerFrame = bannerCard?.parentElement;
    expect(bannerFrame).not.toBeNull();
    expect(bannerFrame).toHaveClass('relative', 'px-3', 'py-3', 'md:px-4', 'md:py-4');
    expect(bannerFrame).not.toHaveClass('fixed', 'inset-x-3', 'top-3', 'md:inset-x-4');
    expect(bannerFrame).not.toHaveClass('md:left-1/2', 'md:w-[min(64rem,calc(100vw-2rem))]', 'md:-translate-x-1/2');
    expect(bannerCard).not.toBeNull();
    expect(bannerCard).toHaveClass('flex-row', 'rounded-xl', 'bg-background/95', 'text-sm', 'md:text-sm');
    expect(bannerCard).not.toHaveClass('backdrop-blur-xl');
    expect(screen.getByText('Demo data - not your real workspace.')).toHaveClass('whitespace-normal', 'break-words');
    expect(screen.getByText('Demo data - not your real workspace.').parentElement).toHaveClass('flex-1');
    expect(screen.getByText('Demo data - not your real workspace.').parentElement).not.toHaveClass('max-w-[18rem]', 'sm:max-w-[24rem]');
    expect(screen.getByRole('button', { name: 'Export backup' })).toHaveClass('w-36', 'sm:w-44', 'rounded-lg');
    expect(screen.getByRole('link', { name: 'Main page' })).toHaveAttribute('href', '/');
  });

  test('renders the embedded browser onboarding banner in the app flow', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <EmbeddedAppBanner
          mode="app"
          storage={embeddedStorage}
          onExport={vi.fn()}
          onImport={vi.fn()}
          onReset={vi.fn()}
        />
      </MemoryRouter>,
    );

    const bannerCard = container.querySelector('[data-slot="web-app-banner-card"]');
    const bannerFrame = bannerCard?.parentElement;
    expect(bannerFrame).not.toBeNull();
    expect(bannerFrame).toHaveClass('relative', 'px-3', 'py-3', 'md:px-4', 'md:py-4');
    expect(bannerFrame).not.toHaveClass('fixed', 'inset-x-3', 'top-3', 'md:inset-x-4');
    expect(bannerCard).not.toBeNull();
    expect(bannerCard).toHaveClass('flex-row', 'rounded-xl', 'bg-background/95', 'text-sm', 'md:text-sm');
    expect(bannerCard).not.toHaveClass('backdrop-blur-xl');
    expect(screen.getByText('Export a backup before closing.')).toHaveClass('whitespace-normal', 'break-words');
    expect(screen.getByRole('button', { name: 'Export backup' })).toHaveClass('w-36', 'sm:w-44', 'rounded-lg');
    expect(screen.queryByRole('link', { name: 'Download app' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Main page' })).toHaveAttribute('href', '/');
  });

  test('keeps browser app banner copy compact on mobile', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <EmbeddedAppBanner
          mode="app"
          storage={embeddedStorage}
          onExport={vi.fn()}
          onImport={vi.fn()}
          onReset={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getByText('Export a backup before closing.')).toBeInTheDocument();
    expect(screen.getByText(BROWSER_WORKSPACE_CLOSE_WARNING)).toBeInTheDocument();
    expect(screen.queryByText(/Reports and Telegram checks only keep running/)).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Download app' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Main page' })).toHaveAttribute('href', '/');
  });

  test('removes the embedded banner backing card when the sidebar is collapsed', async () => {
    const sidebar = document.createElement('div');
    sidebar.dataset.slot = 'sidebar';
    sidebar.dataset.state = 'collapsed';
    const target = document.createElement('div');
    target.dataset.slot = 'embedded-sidebar-banner-slot';
    document.body.appendChild(sidebar);
    document.body.appendChild(target);
    try {
      render(
        <MemoryRouter initialEntries={['/']}>
          <EmbeddedAppBanner
            mode="demo"
            storage={embeddedStorage}
            onExport={vi.fn()}
            onImport={vi.fn()}
            onReset={vi.fn()}
          />
        </MemoryRouter>,
      );

      await waitFor(() => {
        const bannerCard = target.querySelector('[data-slot="web-app-banner-card"]');
        expect(bannerCard).not.toBeNull();
        expect(bannerCard).toHaveClass('h-full', 'md:border-0', 'md:bg-transparent', 'md:px-0', 'md:py-0');
      });
      expect(screen.getByRole('button', { name: 'Export backup' })).toHaveClass('md:size-8', 'md:justify-center', 'md:p-2');
      expect(screen.getByRole('button', { name: 'Export backup' }).parentElement).not.toHaveClass('md:-translate-y-3');
      expect(screen.getByRole('button', { name: 'Export backup' }).parentElement).toHaveClass('md:content-start');
    } finally {
      sidebar.remove();
      target.remove();
    }
  });

  test('keeps the embedded banner backing card in expanded phone landscape mode', async () => {
    const target = document.createElement('div');
    target.dataset.slot = 'embedded-sidebar-banner-slot';
    document.body.appendChild(target);
    document.documentElement.dataset.kaurKhorEmbeddedPhoneLandscape = 'true';
    try {
      render(
        <MemoryRouter initialEntries={['/']}>
          <EmbeddedAppBanner
            mode="demo"
            storage={embeddedStorage}
            onExport={vi.fn()}
            onImport={vi.fn()}
            onReset={vi.fn()}
          />
        </MemoryRouter>,
      );

      await waitFor(() => {
        const bannerCard = target.querySelector('[data-slot="web-app-banner-card"]');
        expect(bannerCard).not.toBeNull();
        expect(bannerCard).toHaveClass('h-full', 'rounded-xl', 'border-border/70', 'bg-white/90');
        expect(bannerCard).not.toHaveClass('rounded-none', 'border-0', 'bg-transparent', 'px-0', 'py-0');
      });
      expect(screen.getByRole('button', { name: 'Export backup' })).not.toHaveClass('size-8', 'justify-center', 'p-2');
      expect(screen.getByRole('link', { name: 'Main page' })).toHaveAttribute('href', '/');
      expect(target.querySelector('.embedded-sidebar-action-label-full')).not.toHaveClass('sr-only');
    } finally {
      delete document.documentElement.dataset.kaurKhorEmbeddedPhoneLandscape;
      target.remove();
    }
  });

  test('keeps fresh demo and browser fallbacks eligible for onboarding', () => {
    const demoState = fallbackStateForMode('demo');
    const browserState = fallbackStateForMode('app');

    expect(demoState.preferences.onboardingCompletedAt).toBeNull();
    expect(demoState.preferences.showAutomationsPage).toBe(true);
    expect(demoState.preferences.customShowAutomationsPage).toBe(true);
    expect(browserState.preferences.onboardingCompletedAt).toBeNull();
    expect(demoState.workspaceSummary.skuCount).toBeGreaterThan(0);
    expect(browserState.workspaceSummary.skuCount).toBe(0);
  });

  test('enables automation intake when restoring older demo browser state', async () => {
    const olderDemoState = fallbackStateForMode('demo');
    olderDemoState.preferences.showAutomationsPage = false;
    olderDemoState.preferences.customShowAutomationsPage = false;
    runtimeWebMocks.openBrowserStorage.mockResolvedValue(createSupportedBrowserStorageHandle([
      {
        collection: 'browser_state',
        id: KAUR_KHOR_BROWSER_DEMO_DATABASE,
        json: olderDemoState,
        updatedAt: '2026-05-05T00:00:00.000Z',
      },
    ]));

    render(<EmbeddedAppRoute mode="demo" />);

    await screen.findByRole('button', { name: 'Export backup' });
    expect(getBrowserDesktopBridgeMockState().preferences.showAutomationsPage).toBe(true);
    expect(getBrowserDesktopBridgeMockState().preferences.customShowAutomationsPage).toBe(true);
  });

  test('normalizes dirty browser backup preferences before restoring state', () => {
    const dirtyState = fallbackStateForMode('app');
    dirtyState.preferences = {
      ...dirtyState.preferences,
      language: 'dirty' as never,
      currency: 'dirty' as never,
      usdToKhrExchangeRate: Number.NaN,
      showAutomationsPage: 'yes' as never,
    };

    expect(normalizeBrowserStateForMode('app', dirtyState).preferences).toMatchObject({
      language: 'en',
      currency: 'USD',
      usdToKhrExchangeRate: 4000,
      showAutomationsPage: true,
    });
  });

  test('normalizes dirty browser backup catalog collections before restoring state', () => {
    const dirtyState = fallbackStateForMode('app');
    dirtyState.catalog = {
      ...dirtyState.catalog,
      bundles: ['dirty', { serviceId: 'bundle-restored' }] as never,
      services: [null, { serviceId: 'service-restored', name: 'Restored service' }] as never,
      sharingMask: [{ bad: true }, false] as never,
      skus: ['dirty', { skuId: 'sku-restored', name: 'Restored SKU' }] as never,
    };

    expect(normalizeBrowserStateForMode('app', dirtyState).catalog).toMatchObject({
      bundles: [{ serviceId: 'bundle-restored' }],
      services: [{ serviceId: 'service-restored', name: 'Restored service' }],
      sharingMask: [{ bad: true }],
      skus: [{ skuId: 'sku-restored', name: 'Restored SKU' }],
    });
  });

  test('normalizes dirty browser backup state arrays before restoring state', () => {
    const dirtyState = fallbackStateForMode('app');
    const observation = { observationId: 'observation-restored' };
    const orderBatch = { batchOrderId: 'batch-restored' };
    const conversation = { conversationId: 'conversation-restored' };
    const exposure = { exposureId: 'exposure-restored' };
    const intake = { intakeId: 'intake-restored' };
    dirtyState.observations = [null, observation] as never;
    dirtyState.orderBatches = ['dirty', orderBatch] as never;
    dirtyState.automation = {
      ...dirtyState.automation,
      conversations: [false, conversation] as never,
      exposures: ['dirty', exposure] as never,
      intakes: [null, intake] as never,
    };

    const normalized = normalizeBrowserStateForMode('app', dirtyState);

    expect(normalized.observations).toEqual([observation]);
    expect(normalized.orderBatches).toEqual([orderBatch]);
    expect(normalized.automation.conversations).toEqual([conversation]);
    expect(normalized.automation.exposures).toEqual([exposure]);
    expect(normalized.automation.intakes).toEqual([intake]);
  });

  test('uses a friendly message for browser storage access-handle contention', () => {
    const rawMessage = "Failed to execute 'createSyncAccessHandle' on 'FileSystemFileHandle': Access Handles cannot be created if there is another open Access Handle or Writable stream associated with the same file.";

    expect(formatBrowserStorageErrorMessage(rawMessage)).toBe(
      'Cannot have two Kaur Khor browser tabs open at the same time. Close the other tab, then reload this page.',
    );
    expect(formatBrowserStorageErrorMessage('Backup did not contain a browser workspace state.')).toBe(
      'Backup did not contain a browser workspace state.',
    );
  });
});

describe('WebRoutes build from source section', () => {
  test('links to the official source page and uses the shell source build script by default', () => {
    const { container } = renderWebHome();
    const section = getBuildFromSourceSection(container);

    expect(within(section).getByRole('link', { name: 'official GitHub page' })).toHaveAttribute('href', sourceUrl);
    expect(section).not.toHaveTextContent('on macOS');
    expect(section).toHaveTextContent('Inspect the source on the official GitHub page and run scripts/build-from-source.sh for your platform.');
    expect(section).toHaveTextContent('Open the Terminal app.');
    expect(section).toHaveTextContent('Copy the code below and paste it inside Terminal.');
    expect(section).toHaveTextContent('Shell');
    expect(within(section).getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(section).toHaveTextContent('curl -L https://github.com/Svanny/kaur-khor/releases/latest/download/kaur-khor-latest-source-build.tar.gz -o kaur-khor-latest-source-build.tar.gz');
    expect(section).toHaveTextContent('kaur-khor-latest-source-build.tar.gz.sha256');
    expect(section).toHaveTextContent('sha256sum -c kaur-khor-latest-source-build.tar.gz.sha256');
    expect(section).toHaveTextContent('tar -tzf kaur-khor-latest-source-build.tar.gz');
    expect(section).toHaveTextContent('Refusing unsafe archive path');
    expect(section).toHaveTextContent('tar -xzf kaur-khor-latest-source-build.tar.gz');
    expect(section).toHaveTextContent('rm kaur-khor-latest-source-build.tar.gz kaur-khor-latest-source-build.tar.gz.sha256');
    expect(section).toHaveTextContent('cd kaur-khor-*-source-build');
    expect(section).toHaveTextContent('./scripts/build-from-source.sh --update');
    expect(section).toHaveTextContent('./scripts/build-from-source.sh --platform=linux-x64');
    expect(section).not.toHaveTextContent('git clone');
    expect(section).not.toHaveTextContent('node scripts/build-from-source.mjs');
    expect(section).not.toHaveTextContent('build-mac-from-source.sh');
    expect(section).not.toHaveTextContent('curl -L https://github.com/Svanny/kaur-khor/archive/refs/heads/main.zip -o kaur-khor.zip');
  });

  test('uses PowerShell source build commands on Windows', async () => {
    mockNavigator({
      platform: 'Win32',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
    });

    const { container } = renderWebHome();
    const section = getBuildFromSourceSection(container);
    const snippet = section.querySelector('pre code');

    await waitFor(() => {
      expect(section).toHaveTextContent('PowerShell');
    });

    expect(snippet).not.toBeNull();
    expect(section).toHaveTextContent('Open PowerShell.');
    expect(section).toHaveTextContent('Copy the code below and paste it inside PowerShell.');
    expect(section).toHaveTextContent('Inspect the source on the official GitHub page and run scripts/build-from-source.ps1 for your platform.');
    expect(section).toHaveTextContent('.\\scripts\\build-from-source.ps1 --platform=windows-x64');
    expect(snippet).toHaveTextContent('Invoke-WebRequest -Uri "https://github.com/Svanny/kaur-khor/releases/latest/download/kaur-khor-latest-source-build.tar.gz" -OutFile "kaur-khor-latest-source-build.tar.gz"');
    expect(snippet).toHaveTextContent('kaur-khor-latest-source-build.tar.gz.sha256');
    expect(snippet).toHaveTextContent('Get-FileHash -Algorithm SHA256');
    expect(snippet).toHaveTextContent('tar -tf "kaur-khor-latest-source-build.tar.gz"');
    expect(snippet).toHaveTextContent('Refusing unsafe archive path');
    expect(snippet).toHaveTextContent('tar -xzf "kaur-khor-latest-source-build.tar.gz"');
    expect(snippet).toHaveTextContent('Remove-Item -Path "kaur-khor-latest-source-build.tar.gz", "kaur-khor-latest-source-build.tar.gz.sha256"');
    expect(snippet).toHaveTextContent('Set-Location "kaur-khor-*-source-build"');
    expect(snippet).toHaveTextContent('.\\scripts\\build-from-source.ps1 --update');
    expect(snippet).not.toHaveTextContent('curl -L https://github.com/Svanny/kaur-khor/archive/refs/heads/main.tar.gz -o kaur-khor-source.tar.gz');
    expect(snippet).not.toHaveTextContent('tar -xzf kaur-khor-source.tar.gz');
    expect(snippet).not.toHaveTextContent('./scripts/build-from-source.sh');
    expect(snippet).not.toHaveTextContent('node .\\scripts\\build-from-source.mjs');
  });

  test('clears the source snippet copy reset timer on unmount', async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(window.navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');

    const { container, unmount } = renderWebHome();
    const section = getBuildFromSourceSection(container);

    fireEvent.click(within(section).getByRole('button', { name: 'Copy' }));
    expect(await within(section).findByRole('button', { name: 'Copied' })).toBeInTheDocument();

    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});
