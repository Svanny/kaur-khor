import { describe, expect, it } from 'vitest';
import { currencyLabel, getTranslation } from './translations';

describe('translations', () => {
  it('falls back to English when Khmer is missing a key', () => {
    expect(getTranslation('km', 'overviewSupportPromptBody')).toBe(
      'Overview stays focused on the next operational decision. Detailed editing, reporting, and planning live in their own sections.',
    );
  });

  it('formats currency labels through the same fallback path', () => {
    expect(currencyLabel('km', 'USD')).toBe('ដុល្លារ ($)');
    expect(currencyLabel('km', 'KHR')).toBe('រៀល (៛)');
  });
});
