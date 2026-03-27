import { describe, expect, it } from 'vitest';
import { currencyLabel, getTranslation } from './translations';

describe('translations', () => {
  it('falls back to English when Khmer is missing a key', () => {
    expect(getTranslation('km', 'dashboardHeading')).toBe(
      'Daily control for inventory, stock moves, and storefront priorities',
    );
  });

  it('formats currency labels through the same fallback path', () => {
    expect(currencyLabel('km', 'USD')).toBe('ដុល្លារ ($)');
    expect(currencyLabel('km', 'KHR')).toBe('រៀល (៛)');
  });
});
