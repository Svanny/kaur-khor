import { describe, expect, test } from 'vitest';
import { getTranslation } from './translations';

describe('getTranslation', () => {
  test('falls back to English for newer semantic help keys when Khmer is missing them', () => {
    expect(getTranslation('km', 'catalogSkuEditorNameHelper')).toBe(
      'Name the SKU the way staff will search for it.',
    );
    expect(getTranslation('km', 'catalogServiceEditorLinkedSkusDescriptor')).toBe(
      'Link the SKUs this service consumes so Banji can track coverage and blockers.',
    );
  });
});
