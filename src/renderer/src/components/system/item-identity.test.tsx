import { render } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { ItemAvatar } from './item-identity';

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    itemImageMode: 'thumbnail',
  }),
}));

describe('ItemAvatar', () => {
  test('renders stored asset paths through the asset protocol', () => {
    const { container } = render(
      <ItemAvatar imagePath="/tmp/banji/assets/razor-refill.png" name="Razor refill" type="sku" />,
    );

    expect(container.querySelector('img')).toHaveAttribute('src', 'banji-asset://local/razor-refill.png');
  });

  test('renders existing plain local image paths through the asset protocol', () => {
    const { container } = render(
      <ItemAvatar imagePath="/tmp/not-banji/razor-refill.png" name="Razor refill" type="sku" />,
    );

    expect(container.querySelector('img')).toHaveAttribute('src', 'banji-asset://local/razor-refill.png');
  });
});
