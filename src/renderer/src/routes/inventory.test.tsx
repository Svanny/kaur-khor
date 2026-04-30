import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { getTranslation } from '@/lib/translations';
import { InventoryRoute } from './inventory';

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

vi.mock('./automations', () => ({
  AutomationsRoute: () => <div>Embedded automations</div>,
}));

describe('InventoryRoute', () => {
  test('does not embed automations from catalog when automations are hidden', () => {
    inventoryHook.mockReturnValue({
      catalog: {
        bundles: [],
        schemaVersion: 1,
        services: [],
        sharingMask: [],
        skus: [],
      },
      observations: [],
      reports: [],
      snapshot: null,
      workspaceSummary: null,
    });
    preferencesHook.mockReturnValue({
      currency: 'USD',
      language: 'en',
      showAutomationsPage: false,
      t: (
        key: Parameters<typeof getTranslation>[1],
        variables?: Parameters<typeof getTranslation>[2],
      ) => getTranslation('en', key, variables),
      usdToKhrExchangeRate: 4000,
    });

    render(
      <MemoryRouter initialEntries={['/catalog?section=automation']}>
        <InventoryRoute />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Embedded automations')).not.toBeInTheDocument();
    expect(screen.getByText('Offered Selections')).toBeInTheDocument();
  });
});
