import { beforeEach, describe, expect, test, vi } from 'vitest';
import {
  curatedProductAttributePresets,
  customProductAttributePresetsFromDraft,
  formatProductAttributeSuffix,
  MAX_CUSTOM_PRODUCT_ATTRIBUTE_PRESETS,
  MAX_PRODUCT_ATTRIBUTE_OPTIONS_PER_PRESET,
  MAX_PRODUCT_ATTRIBUTE_VARIANTS,
  mergedProductAttributePresets,
  PRODUCT_ATTRIBUTE_PRESETS_STORAGE_KEY,
  productAttributeCombinationCount,
  productAttributeCombinations,
  productAttributeDraftDirtyKey,
  readCustomProductAttributePresets,
  sanitizedProductAttributeDraft,
  sanitizeProductAttributePresets,
  uniqueProductVariantName,
  writeCustomProductAttributePresets,
} from './product-attributes';

describe('product attributes helpers', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('loads broad curated product and service presets', () => {
    expect(curatedProductAttributePresets).toEqual(
      expect.arrayContaining([
        { name: 'Size', options: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
        { name: 'Flavor', options: ['Original', 'Spicy', 'Sweet', 'Sour', 'Savory', 'Unsweetened'] },
        { name: 'Service type', options: ['Basic', 'Standard', 'Premium', 'Express', 'Custom'] },
        { name: 'Location', options: ['In-store', 'Delivery', 'On-site', 'Remote'] },
      ]),
    );
  });

  test('sanitizes, merges, persists, and ignores empty custom presets', () => {
    const presets = sanitizeProductAttributePresets([
      { name: ' Finish ', options: [' Matte ', '', 'Gloss'] },
      { name: 'finish', options: ['Gloss', ' Satin '] },
      { name: '', options: ['Ignored'] },
      { name: 'Empty', options: [] },
    ]);

    expect(presets).toEqual([{ name: 'Finish', options: ['Matte', 'Gloss', 'Satin'] }]);

    writeCustomProductAttributePresets(presets);
    expect(JSON.parse(window.localStorage.getItem(PRODUCT_ATTRIBUTE_PRESETS_STORAGE_KEY) ?? '[]')).toEqual(presets);
    expect(readCustomProductAttributePresets()).toEqual(presets);
    expect(mergedProductAttributePresets(presets)).toEqual(
      expect.arrayContaining([{ name: 'Finish', options: ['Matte', 'Gloss', 'Satin'] }]),
    );
  });

  test('caps custom preset storage so large localStorage payloads cannot inflate the form', () => {
    const presets = sanitizeProductAttributePresets(
      Array.from({ length: MAX_CUSTOM_PRODUCT_ATTRIBUTE_PRESETS + 5 }, (_, presetIndex) => ({
        name: `Custom ${presetIndex}`,
        options: Array.from({ length: MAX_PRODUCT_ATTRIBUTE_OPTIONS_PER_PRESET + 5 }, (_, optionIndex) => (
          `Option ${presetIndex}-${optionIndex}`
        )),
      })),
    );

    expect(presets).toHaveLength(MAX_CUSTOM_PRODUCT_ATTRIBUTE_PRESETS);
    expect(presets[0]?.options).toHaveLength(MAX_PRODUCT_ATTRIBUTE_OPTIONS_PER_PRESET);

    writeCustomProductAttributePresets(presets);
    expect(readCustomProductAttributePresets()).toHaveLength(MAX_CUSTOM_PRODUCT_ATTRIBUTE_PRESETS);
    expect(mergedProductAttributePresets(presets)).toHaveLength(
      curatedProductAttributePresets.length + MAX_CUSTOM_PRODUCT_ATTRIBUTE_PRESETS,
    );
  });

  test('treats blocked localStorage access as optional preset storage', () => {
    const localStorageSpy = vi.spyOn(globalThis, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('storage blocked');
    });

    try {
      expect(readCustomProductAttributePresets()).toEqual([]);
      expect(() =>
        writeCustomProductAttributePresets([{ name: 'Finish', options: ['Matte'] }]),
      ).not.toThrow();
    } finally {
      localStorageSpy.mockRestore();
    }
  });

  test('extracts only custom preset additions from a draft', () => {
    expect(
      customProductAttributePresetsFromDraft({
        enabled: true,
        rows: [
          { name: 'Color', options: ['Black', 'Copper'], selectedOptions: ['Copper'] },
          { name: 'Finish', options: ['Matte'], selectedOptions: ['Matte'] },
        ],
      }),
    ).toEqual([
      { name: 'Color', options: ['Copper'] },
      { name: 'Finish', options: ['Matte'] },
    ]);
  });

  test('treats partial or corrupted attribute drafts as empty draft state', () => {
    expect(sanitizedProductAttributeDraft(null)).toEqual({ enabled: false, rows: [] });
    expect(sanitizedProductAttributeDraft({ enabled: true })).toEqual({ enabled: true, rows: [] });
    expect(productAttributeDraftDirtyKey({ enabled: true } as never)).toBe('{"enabled":true,"rows":[]}');
    expect(productAttributeCombinationCount({ enabled: true, rows: 'dirty' } as never)).toBe(0);
    expect(productAttributeCombinations({ enabled: true, rows: [{ name: 'Size', options: 'dirty' }] } as never)).toEqual([]);
  });

  test('builds one-attribute and multi-attribute combinations', () => {
    expect(
      productAttributeCombinations({
        enabled: true,
        rows: [{ name: 'Size', options: ['S', 'M'], selectedOptions: ['S', 'M'] }],
      }),
    ).toEqual([[{ name: 'Size', option: 'S' }], [{ name: 'Size', option: 'M' }]]);

    const combinations = productAttributeCombinations({
      enabled: true,
      rows: [
        { name: 'Size', options: ['S', 'M'], selectedOptions: ['S', 'M'] },
        { name: 'Color', options: ['Blue'], selectedOptions: ['Blue'] },
      ],
    });

    expect(combinations.map(formatProductAttributeSuffix)).toEqual([
      '(Size: S, Color: Blue)',
      '(Size: M, Color: Blue)',
    ]);
  });

  test('counts oversized attribute sets without generating every variant', () => {
    const oversizedDraft = {
      enabled: true,
      rows: [
        { name: 'Size', options: ['1', '2', '3', '4', '5', '6'], selectedOptions: ['1', '2', '3', '4', '5', '6'] },
        { name: 'Color', options: ['1', '2', '3', '4', '5'], selectedOptions: ['1', '2', '3', '4', '5'] },
        { name: 'Quality', options: ['1', '2', '3', '4'], selectedOptions: ['1', '2', '3', '4'] },
      ],
    };

    expect(productAttributeCombinationCount(oversizedDraft)).toBeGreaterThan(MAX_PRODUCT_ATTRIBUTE_VARIANTS);
    expect(productAttributeCombinations(oversizedDraft)).toEqual([]);
  });

  test('generates unique variant names with incrementing conflicts', () => {
    const combination = [{ name: 'Size', option: 'XXL' }];
    expect(uniqueProductVariantName([], 'Hotdog Shirt', combination)).toBe('Hotdog Shirt (Size: XXL)');
    expect(
      uniqueProductVariantName(
        ['Hotdog Shirt (Size: XXL)', 'Hotdog Shirt (Size: XXL) (1)'],
        'Hotdog Shirt',
        combination,
      ),
    ).toBe('Hotdog Shirt (Size: XXL) (2)');
  });
});
