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

function renderWebHome() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <WebRoutes />
    </MemoryRouter>,
  );
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
