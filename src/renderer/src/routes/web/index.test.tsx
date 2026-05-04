import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { setBrowserDesktopBridgeMockState } from '@/dev/browser-desktop-bridge';
import {
  BROWSER_WORKSPACE_CLOSE_WARNING,
  BROWSER_WORKSPACE_TELEGRAM_CLOSE_WARNING,
  browserWorkspaceCloseWarningMessage,
  EmbeddedAppBanner,
  EmbeddedAutoZoomViewport,
  fallbackStateForMode,
  formatBrowserStorageErrorMessage,
  installBrowserBeforeUnloadWarning,
  WebRoutes,
} from './index';

const operatorFeatureLabels = [
  'Review Work Queue',
  'Run Point-of-Sale',
  'Count Stock',
  'Track Customer Orders',
  'Record Immediate Sales',
  'Place Supplier Orders',
  'Receive Supplier Orders',
  'Search Catalog',
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
  'Stock Counts',
  'Customer Orders',
  'Immediate Sales',
  'Supplier Orders',
  'Supplier Receipts',
  'Catalog Search',
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
const releasesUrl = 'https://github.com/Svanny/banji/releases/latest';
const sourceUrl = 'https://github.com/Svanny/banji';

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
  databaseName: 'kaur-khor-browser-demo',
  handle: null,
  lastBackupAt: null,
  message: 'This demo uses a separate sample workspace.',
  persistence: 'unknown',
  sqliteVersion: 'pending',
  status: 'ready',
  vfs: 'opfs-sahpool',
} as const;

const releaseAssets = [
  {
    browser_download_url: 'https://github.com/Svanny/banji/releases/download/v1.2.3/banji-1.2.3-darwin-arm64.dmg',
    name: 'banji-1.2.3-darwin-arm64.dmg',
  },
  {
    browser_download_url: 'https://github.com/Svanny/banji/releases/download/v1.2.3/banji-1.2.3-darwin-x64.dmg',
    name: 'banji-1.2.3-darwin-x64.dmg',
  },
  {
    browser_download_url: 'https://github.com/Svanny/banji/releases/download/v1.2.3/banji-1.2.3-win-x64.exe',
    name: 'banji-1.2.3-win-x64.exe',
  },
  {
    browser_download_url: 'https://github.com/Svanny/banji/releases/download/v1.2.3/banji-1.2.3-linux-x64.AppImage',
    name: 'banji-1.2.3-linux-x64.AppImage',
  },
  {
    browser_download_url: 'https://github.com/Svanny/banji/releases/download/v1.2.3/banji-1.2.3-linux-arm64.AppImage',
    name: 'banji-1.2.3-linux-arm64.AppImage',
  },
  {
    browser_download_url: 'https://github.com/Svanny/banji/releases/download/v1.2.3/SHA256SUMS',
    name: 'SHA256SUMS',
  },
] as const;

beforeEach(() => {
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

function mockLatestReleaseFetch() {
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({
      assets: releaseAssets,
      tag_name: 'v1.2.3',
    }),
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
    expect(buildSection).not.toHaveTextContent('dependency');
    expect(buildSection).not.toHaveTextContent('native build');
    expect(buildSection).not.toHaveTextContent('platform flag');
    expect(buildSection).not.toHaveTextContent('software');
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

    expect(screen.getByAltText('Kaur Khor mission control overview showing the main work queue')).toBeInTheDocument();
    expect(setIntervalSpy).not.toHaveBeenCalled();
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

    await expectRecommendedDownload(
      'banji-1.2.3-darwin-arm64.dmg',
      releaseAssets[0]!.browser_download_url,
    );
    expect(screen.getByText(/Recommended for macOS Apple Silicon from v1\.2\.3\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'YouTube tutorial for opening macOS app from unidentified developer' })).toHaveAttribute(
      'href',
      'https://youtu.be/sLox8h-6BVw',
    );
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
      'banji-1.2.3-darwin-x64.dmg',
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
      'banji-1.2.3-win-x64.exe',
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
      'banji-1.2.3-linux-x64.AppImage',
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
      'banji-1.2.3-linux-arm64.AppImage',
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

  test('updates the download button when the dropdown changes', async () => {
    mockLatestReleaseFetch();
    mockNavigator({
      userAgentData: {
        platform: 'Windows',
      },
    });

    renderWebHome();

    const select = await startReleaseDownloadLoad();
    await waitFor(() => expect(select.value).toBe('banji-1.2.3-win-x64.exe'));

    fireEvent.change(select, { target: { value: 'banji-1.2.3-linux-arm64.AppImage' } });

    expect(screen.getByRole('link', { name: /Download selected/i })).toHaveAttribute(
      'href',
      releaseAssets[4]!.browser_download_url,
    );
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
    await waitFor(() => expect(select.value).toBe('banji-1.2.3-win-x64.exe'));
    expect(screen.getByText('Windows install notes')).toBeInTheDocument();
    expect(screen.getByText('Do not disable SmartScreen globally.')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /YouTube tutorial for opening macOS app/i })).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'banji-1.2.3-linux-arm64.AppImage' } });

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
    await waitFor(() => expect(select.value).toBe('banji-1.2.3-linux-x64.AppImage'));

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
      const cardQueries = within(card);
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
    const surface = container.querySelector('[data-slot="embedded-auto-zoom-surface"]');
    expect(viewport).not.toBeNull();
    expect(surface).not.toBeNull();
    expect(viewport).toHaveAttribute('data-phone-landscape', 'false');
    expect(viewport).toHaveAttribute('data-zoom-level', '-2');
    expect(viewport).toHaveAttribute('data-effective-height', String(Math.round(800 / (1.2 ** -2))));
    expect(viewport).toHaveAttribute('data-measured-area', String(900 * 800));
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
    const surface = container.querySelector('[data-slot="embedded-auto-zoom-surface"]');
    expect(viewport).not.toBeNull();
    expect(surface).not.toBeNull();
    expect(viewport).toHaveAttribute('data-phone-landscape', 'false');
    expect(viewport).toHaveAttribute('data-zoom-level', '-1');
    expect(viewport).toHaveAttribute('data-effective-width', String(Math.round(1440 / (1.2 ** -1))));
    expect(viewport).toHaveAttribute('data-effective-height', String(Math.round(799 / (1.2 ** -1))));
    expect(viewport).toHaveAttribute('data-measured-area', String(1440 * 799));
    expect(surface).toHaveStyle({
      minHeight: `${799 / (1.2 ** -1)}px`,
      width: `${1440 / (1.2 ** -1)}px`,
    });
  });

  test('uses a landscape-first embedded product shell for portrait phones', async () => {
    mockViewport(390, 844);

    const { container } = render(
      <EmbeddedAutoZoomViewport>
        <div>Embedded product</div>
      </EmbeddedAutoZoomViewport>,
    );

    const viewport = container.querySelector('[data-slot="embedded-auto-zoom-viewport"]');
    const frame = container.querySelector('[data-slot="embedded-landscape-frame"]');
    expect(viewport).not.toBeNull();
    expect(frame).not.toBeNull();
    expect(viewport).toHaveAttribute('data-phone-landscape', 'true');
    expect(viewport).toHaveAttribute('data-zoom-level', '-2');
    expect(frame).toHaveStyle({
      height: '390px',
      transform: 'rotate(90deg) translateY(-100%)',
      width: '844px',
    });
    await waitFor(() => {
      expect(Number(document.documentElement.dataset.kaurKhorEffectiveViewportWidth)).toBe(Math.round(844 / (1.2 ** -2)));
    });
  });

  test('renders the embedded onboarding banner as a top nav overlay', () => {
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
    expect(bannerCard).not.toBeNull();
    expect(bannerCard).toHaveClass('flex-row', 'rounded-xl', 'bg-background/90', 'text-sm', 'md:text-sm', 'backdrop-blur-xl');
    expect(screen.getByText('Demo data - not your real workspace.')).toHaveClass('whitespace-normal', 'break-words');
    expect(screen.getByRole('button', { name: 'Export backup' })).toHaveClass('w-36', 'sm:w-44', 'rounded-lg');
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
  });

  test('removes the embedded banner backing card when the sidebar is collapsed', async () => {
    const sidebar = document.createElement('div');
    sidebar.dataset.slot = 'sidebar';
    sidebar.dataset.state = 'collapsed';
    document.body.appendChild(sidebar);
    try {
      const { container } = render(
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

      const bannerCard = container.querySelector('[data-slot="web-app-banner-card"]');
      expect(bannerCard).not.toBeNull();
      await waitFor(() => {
        expect(bannerCard).toHaveClass('md:min-h-[13.5rem]', 'md:border-0', 'md:bg-transparent', 'md:px-0', 'md:py-0');
      });
      expect(screen.getByRole('button', { name: 'Export backup' })).toHaveClass('md:size-8', 'md:justify-center', 'md:p-2');
    } finally {
      sidebar.remove();
    }
  });

  test('keeps fresh demo and browser fallbacks eligible for onboarding', () => {
    const demoState = fallbackStateForMode('demo');
    const browserState = fallbackStateForMode('app');

    expect(demoState.preferences.onboardingCompletedAt).toBeNull();
    expect(browserState.preferences.onboardingCompletedAt).toBeNull();
    expect(demoState.workspaceSummary.skuCount).toBeGreaterThan(0);
    expect(browserState.workspaceSummary.skuCount).toBe(0);
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
  test('links to the official source page and uses the cross-platform source build script', () => {
    const { container } = renderWebHome();
    const section = getBuildFromSourceSection(container);

    expect(within(section).getByRole('link', { name: 'official GitHub page' })).toHaveAttribute('href', sourceUrl);
    expect(section).not.toHaveTextContent('on macOS');
    expect(section).toHaveTextContent('Inspect the source on the official GitHub page and run scripts/build-from-source.sh for your platform.');
    expect(section).toHaveTextContent('Open the Terminal app.');
    expect(section).toHaveTextContent('Copy the code below and paste it inside Terminal.');
    expect(section).toHaveTextContent('Shell');
    expect(within(section).getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(section).toHaveTextContent('curl -L https://github.com/Svanny/banji/archive/refs/heads/main.tar.gz -o banji-source.tar.gz');
    expect(section).toHaveTextContent('tar -xzf banji-source.tar.gz');
    expect(section).toHaveTextContent('cd banji-main');
    expect(section).toHaveTextContent('./scripts/build-from-source.sh');
    expect(section).toHaveTextContent('./scripts/build-from-source.sh --platform=linux-x64');
    expect(section).not.toHaveTextContent('git clone');
    expect(section).not.toHaveTextContent('node scripts/build-from-source.mjs');
    expect(section).not.toHaveTextContent('build-mac-from-source.sh');
    expect(section).not.toHaveTextContent('curl -L https://github.com/Svanny/banji/archive/refs/heads/main.zip -o banji.zip');
  });
});
