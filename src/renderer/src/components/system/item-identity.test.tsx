import { render } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { ItemAvatar } from './item-identity';

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    itemImageMode: 'thumbnail',
  }),
}));

describe('ItemAvatar', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/');
  });

  test('renders stored asset paths through the asset protocol', () => {
    const { container } = render(
      <ItemAvatar imagePath="/tmp/kaur-khor/assets/razor-refill.png" name="Razor refill" type="sku" />,
    );

    expect(container.querySelector('img')).toHaveAttribute('src', 'kaur-khor-asset://local/razor-refill.png');
  });

  test('renders existing plain local image paths through the asset protocol', () => {
    const { container } = render(
      <ItemAvatar imagePath="/tmp/not-kaur-khor/razor-refill.png" name="Razor refill" type="sku" />,
    );

    expect(container.querySelector('img')).toHaveAttribute('src', 'kaur-khor-asset://local/razor-refill.png');
  });

  test('renders bundled Vite asset URLs directly', () => {
    const { container } = render(
      <ItemAvatar imagePath="/assets/kaur-khor-dev-sku-001.png" name="ក្រមាភ្នំពេញ" type="sku" />,
    );

    expect(container.querySelector('img')).toHaveAttribute('src', '/assets/kaur-khor-dev-sku-001.png');
  });

  test('falls back for desktop-only asset paths in embedded browser routes', () => {
    window.history.replaceState({}, '', '/kaur-khor/demo');

    const { container } = render(
      <ItemAvatar imagePath="kaur-khor-asset://local/razor-refill.png" name="Razor refill" type="sku" />,
    );

    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });
});
