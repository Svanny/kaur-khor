import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { getTranslation } from '@/lib/translations';
import { SkuDetailHero } from './hero';
import type { SenaSkuDetailViewModel } from './view-model';

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    language: 'en',
    showFloatingTitleActions: false,
    showHeartbeatRibbons: true,
    t: (key: string) => getTranslation('en', key as never),
  }),
}));

describe('SkuDetailHero', () => {
  test('wraps long price-now values in the key signals ribbon', () => {
    const model = {
      identity: {
        name: 'Phnom Penh Krama Scarf',
        statusLabel: 'Reorder',
        supplierName: 'Mekong Loom House',
        topRegime: 'normal',
      },
      heartbeat: {
        headlineUnits: '27 units on hand',
        heroSentence: 'Cover 6D · reorder signal 100%',
      },
      ribbon: [
        { key: 'onHand', label: 'On hand', value: '27' },
        { key: 'priceNow', label: 'Price now', value: 'KHR 102,267,000' },
      ],
    } as unknown as SenaSkuDetailViewModel;

    render(<SkuDetailHero actions={null} model={model} />);

    const priceValue = screen.getByText('KHR 102,267,000');
    expect(priceValue).toHaveClass('whitespace-normal', 'break-words');
    expect(priceValue).not.toHaveClass('truncate');
  });
});
