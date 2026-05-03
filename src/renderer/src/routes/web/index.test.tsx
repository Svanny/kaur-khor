import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test } from 'vitest';
import { WebRoutes } from './index';

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

const sharedProductPromise = 'Free. No sign-up or login. Your data stays on your device.';

const productCardCopy = {
  actions: ['Start Quick Demo', 'Start in the browser', 'Install the desktop app', 'Build it yourself'],
  titles: ['Demo', 'Browser App', 'Desktop App', 'Source Build'],
  summaries: ['Try sample data', 'Use it in this browser', 'Install the full app', 'Build from source'],
  includes: [
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
    'Requires developer tools',
    'Currently focused on macOS',
    'The app you build may still show safety prompts',
  ],
} as const;

function renderWebHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <WebRoutes />
    </MemoryRouter>,
  );
}

function getProductCardsSection(container: HTMLElement) {
  const section = container.querySelector('#ways-to-start');
  expect(section).not.toBeNull();
  return section as HTMLElement;
}

describe('WebRoutes landing rail', () => {
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

describe('WebRoutes product cards', () => {
  test('renders simple tier copy with benefits first and drawbacks last', () => {
    const { container } = renderWebHome();
    const section = getProductCardsSection(container);
    const cards = within(section).getAllByRole('link');

    expect(cards).toHaveLength(productCardCopy.titles.length);
    expect(within(section).getAllByText(sharedProductPromise)).toHaveLength(productCardCopy.titles.length);
    for (const label of [
      ...productCardCopy.titles,
      ...productCardCopy.summaries,
      ...productCardCopy.includes,
      ...productCardCopy.benefits,
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
    expect(section).not.toHaveTextContent('Everything in Demo and:');
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

    for (const card of within(section).getAllByRole('link')) {
      expect(card).toHaveClass('liquid-grid-card-frame', 'backdrop-blur-md');
    }
  });

  test('renders shared privacy copy as list items and uses white card buttons', () => {
    const { container } = renderWebHome();
    const section = getProductCardsSection(container);

    for (const promise of within(section).getAllByText(sharedProductPromise)) {
      expect(promise.closest('li')).not.toBeNull();
    }

    for (const action of productCardCopy.actions) {
      const button = within(section).getByLabelText(action).closest('span');
      expect(button).toHaveClass('bg-white', 'text-foreground');
      expect(button).not.toHaveClass('bg-primary');
    }
  });
});
