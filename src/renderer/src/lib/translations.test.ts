import { describe, expect, test } from 'vitest';
import { kmUiCopy } from './km-ui-copy';
import { getTranslation, translations } from './translations';
import { activeEnUiCopy, enUiCopyV1, enUiCopyV2 } from './ui-copy-map';

function extractTemplateVariables(template: string): string[] {
  return [...template.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort();
}

describe('getTranslation', () => {
  test('keeps v1 and v2 on the same key set', () => {
    expect(Object.keys(enUiCopyV2).sort()).toEqual(Object.keys(enUiCopyV1).sort());
  });

  test('keeps Khmer on the same key set as active English', () => {
    expect(Object.keys(kmUiCopy).sort()).toEqual(Object.keys(activeEnUiCopy).sort());
  });

  test('uses v2 as the active English copy', () => {
    expect(activeEnUiCopy.settingsSenaParametersPanelTitle).toBe('Planning detail settings');
    expect(getTranslation('en', 'settingsSenaParametersPanelTitle' as never)).toBe(
      'Planning detail settings',
    );
  });

  test('preserves interpolation placeholders across the full Khmer map', () => {
    for (const [key, englishValue] of Object.entries(activeEnUiCopy)) {
      expect(extractTemplateVariables(kmUiCopy[key as keyof typeof kmUiCopy])).toEqual(
        extractTemplateVariables(englishValue),
      );
    }
  });

  test('interpolates translated templates', () => {
    expect(
      getTranslation('en', 'overviewTaskNextArrivalWindow' as never, { window: 'Apr 10-Apr 12' }),
    ).toBe('Current arrival window Apr 10-Apr 12.');
  });

  test('returns Khmer for representative v2-only and formerly missing surfaces', () => {
    expect(getTranslation('km', 'catalogSkuEditorNameHelper' as never)).toBe(
      'ដាក់ឈ្មោះ SKU តាមរបៀបដែលបុគ្គលិកនឹងស្វែងរកវា។',
    );
    expect(getTranslation('km', 'catalogServiceEditorLinkedSkusDescriptor' as never)).toBe(
      'ភ្ជាប់ SKU ដែលសេវាកម្មនេះប្រើ ដើម្បីឲ្យបញ្ជីអាចតាមដានការគ្របដណ្តប់ និងចំណុចរារាំងបាន។',
    );
    expect(getTranslation('km', 'analysisWorkbenchLaneInventorySubtitle' as never)).toBe(
      'ការប៉ាន់ស្មានស្តុកត្រូវបានបង្ហាញបន្តគ្នា ខណៈតម្រូវការសេវាកម្ម តម្រូវការលក់រាយ ការទទួលទំនិញ និងការកែសម្រួល នៅតែភ្ជាប់នឹងចន្លោះពេលនីមួយៗ។',
    );
    expect(getTranslation('km', 'settingsSenaParametersPanelDescription' as never)).toBe(
      'កែថាបញ្ជីប្រើព័ត៌មានលម្អិតប៉ុន្មាន នៅពេលប៉ាន់ស្មានស្តុក និងណែនាំបរិមាណបញ្ជាទិញបន្ថែម។',
    );
    expect(getTranslation('km', 'stockUpdateGuidanceFirstUpdateNeedsCount' as never)).toBe(
      'ការអាប់ដេតលើកដំបូង ត្រូវមាន SKU ដែលបានរាប់យ៉ាងហោចណាស់មួយ ដើម្បីឲ្យបញ្ជីចាប់យកស្តុកបាន។',
    );
  });

  test('rewrites awkward technical Khmer toward the active v2 meaning', () => {
    expect(getTranslation('km', 'backendReady' as never)).toBe(
      'កន្លែងធ្វើការក្នុងម៉ាស៊ីនរបស់បញ្ជីរួចរាល់',
    );
    expect(
      getTranslation('km', 'serviceVmHeroSummary' as never, {
        low: 3,
        high: 5,
        bottleneck: 'SKU-A',
        risk: 'ខ្ពស់',
        nextBlocker: 'SKU-B',
        inbound: 'មានស្តុកកំពុងមក',
      }),
    ).toBe(
      'ចន្លោះដែលទំនង 3-5 · ចំណុចរារាំងសំខាន់៖ SKU-A · ហានិភ័យ ខ្ពស់ · ចំណុចរារាំងបន្ទាប់ SKU-B · មានស្តុកកំពុងមក',
    );
  });

  test('still falls back to English defensively if a Khmer entry is unavailable at runtime', () => {
    const previous = translations.km.catalogSkuEditorNameHelper;
    translations.km.catalogSkuEditorNameHelper = undefined;
    expect(getTranslation('km', 'catalogSkuEditorNameHelper' as never)).toBe(
      'Name the SKU the way staff will search for it.',
    );
    translations.km.catalogSkuEditorNameHelper = previous;
  });
});
