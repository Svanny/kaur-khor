import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { CreateFirstSkuButton } from './create-first-sku-button';

const preferencesHook = vi.fn();

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

describe('CreateFirstSkuButton', () => {
  beforeEach(() => {
    preferencesHook.mockReturnValue({
      language: 'en',
    });
  });

  test('renders the first SKU CTA with its icon and target route', () => {
    render(
      <MemoryRouter>
        <CreateFirstSkuButton variant="outline" />
      </MemoryRouter>,
    );

    const link = screen.getByRole('link', { name: 'Create first SKU' });
    expect(link).toHaveAttribute('href', '/catalog/skus/new');
    expect(link.querySelector('svg')).not.toBeNull();
  });
});
