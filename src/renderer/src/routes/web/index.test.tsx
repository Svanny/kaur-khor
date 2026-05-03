import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { fallbackStateForMode, formatBrowserStorageErrorMessage, WebRoutes } from './index';

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
  vi.stubGlobal('fetch', vi.fn(() => new Promise(() => {})));
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

async function expectRecommendedDownload(expectedAssetName: string, expectedHref: string) {
  const select = await screen.findByLabelText('Download') as HTMLSelectElement;
  await waitFor(() => expect(select.value).toBe(expectedAssetName));
  expect(screen.getByRole('link', { name: /Download selected/i })).toHaveAttribute('href', expectedHref);
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

    fireEvent.click(screen.getByRole('combobox', { name: 'Choose your language' }));
    fireEvent.click(screen.getByRole('option', { name: /Khmer/ }));

    expect(screen.getByRole('heading', { name: 'បញ្ជី' })).toBeInTheDocument();
    expect(screen.getByText(/អេបស្តុកក្នុងម៉ាស៊ីនសម្រាប់ក្រុមតូច/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'ចាប់ផ្តើម' })).toBeInTheDocument();

    const cardsSection = getProductCardsSection(container);
    expect(cardsSection).toHaveTextContent('អេបក្នុងប្រោសឺរ');
    expect(cardsSection).not.toHaveTextContent('ជ្រើសរើសភាសា រូបិយប័ណ្ណ និងចំណូលចិត្តអេប');
    expect(cardsSection).toHaveTextContent('ចងចាំ៖');

    const releasesSection = container.querySelector('#releases');
    expect(releasesSection).not.toBeNull();
    expect(releasesSection).toHaveTextContent('ទាញយកដេសថបអេប');
    expect(releasesSection).toHaveTextContent('កំណត់សម្គាល់ដំឡើង');
  });

  test('renders every operator-facing feature once in the accessible rail', () => {
    renderWebHome();

    const rail = screen.getByRole('list', { name: 'Operator-facing banji features' });
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
});

describe('WebRoutes releases section', () => {
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

    const select = await screen.findByLabelText('Download') as HTMLSelectElement;
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

    const select = await screen.findByLabelText('Download') as HTMLSelectElement;
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

    const select = await screen.findByLabelText('Download') as HTMLSelectElement;
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

  test('removes the standalone install page and install links', async () => {
    const { container } = renderWebPath('/install');

    expect(await screen.findByRole('heading', { name: 'banji' })).toBeInTheDocument();
    expect(container).not.toHaveTextContent('Install banji from official releases.');
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

  test('uses the real app frosted tint surface for each product card', () => {
    const { container } = renderWebHome();
    const section = getProductCardsSection(container);

    for (const card of section.querySelectorAll('.liquid-grid-card-frame')) {
      expect(card).toHaveClass('liquid-grid-card-frame', 'backdrop-blur-md');
    }
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
      expect(button).toHaveClass('bg-white', 'text-foreground');
      expect(button).not.toHaveClass('bg-primary');
    }
    expect(within(section).getAllByRole('link')).toHaveLength(productCardCopy.actions.length);
    for (const card of section.querySelectorAll('.liquid-grid-card-frame')) {
      expect(card.tagName).not.toBe('A');
    }
  });
});

describe('WebRoutes embedded app fallback state', () => {
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
      'Cannot have two banji browser tabs open at the same time. Close the other tab, then reload this page.',
    );
    expect(formatBrowserStorageErrorMessage('Backup did not contain a browser workspace state.')).toBe(
      'Backup did not contain a browser workspace state.',
    );
  });
});

describe('WebRoutes build from source section', () => {
  test('links to the official source page and uses zip-based build commands', () => {
    const { container } = renderWebHome();
    const section = getBuildFromSourceSection(container);

    expect(within(section).getByRole('link', { name: 'official GitHub page' })).toHaveAttribute('href', sourceUrl);
    expect(section).toHaveTextContent('Inspect the source on the official GitHub page and run scripts/build-mac-from-source.sh on macOS.');
    expect(section).toHaveTextContent('Open the Terminal app.');
    expect(section).toHaveTextContent('Copy the code below and paste it inside Terminal.');
    expect(section).toHaveTextContent('Bash');
    expect(within(section).getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    expect(section).toHaveTextContent('curl -L https://github.com/Svanny/banji/archive/refs/heads/main.zip -o banji.zip');
    expect(section).toHaveTextContent('unzip banji.zip');
    expect(section).toHaveTextContent('mv banji-main banji');
    expect(section).toHaveTextContent('chmod +x scripts/build-mac-from-source.sh');
    expect(section).toHaveTextContent('./scripts/build-mac-from-source.sh');
    expect(section).not.toHaveTextContent('git clone https://github.com/Svanny/banji.git');
  });
});
