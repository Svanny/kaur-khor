import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { kmUiCopy } from './km-ui-copy';
import { getTranslation, translations, translateUiLiteral } from './translations';
import { activeEnUiCopy, enUiCopyV1, enUiCopyV2 } from './ui-copy-map';

function extractTemplateVariables(template: string): string[] {
  return [...template.matchAll(/\{([A-Za-z0-9_]+)\}/g)].map((match) => match[1]).sort();
}

function stripAllowedLatin(text: string): string {
  return text
    .replace(/\{[A-Za-z0-9_]+\}/g, '')
    .replace(/\b(?:SKU|SKUs|CSV|USD|KHR|API|JSON|SQLite|ID|IDs|Monysovann|ETA|SENA|ESS)\b/g, '')
    .replace(/\b\d+(?:m|H|D|W|M|Y)\b/g, '');
}

function stripTemplateVariables(text: string): string {
  return text.replace(/\{[A-Za-z0-9_]+\}/g, '');
}

async function collectSourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        return collectSourceFiles(path);
      }
      if (!/\.(ts|tsx)$/.test(entry.name) || /\.test\.(ts|tsx)$/.test(entry.name)) {
        return [];
      }
      return [path];
    }),
  );
  return nested.flat();
}

function collectStaticTranslateUiLiteralCalls(source: string): Array<{ literal: string; line: number }> {
  return [...source.matchAll(/\btranslateUiLiteral\(\s*language\s*,\s*(['"])((?:\\.|(?!\1).)*)\1/g)].map((match) => ({
    literal: match[2].replace(/\\'/g, "'").replace(/\\"/g, '"'),
    line: source.slice(0, match.index).split('\n').length,
  }));
}

describe('getTranslation', () => {
  test('keeps v1 and v2 on the same key set', () => {
    expect(Object.keys(enUiCopyV2).sort()).toEqual(Object.keys(enUiCopyV1).sort());
  });

  test('keeps Khmer on the same key set as active English', () => {
    expect(Object.keys(kmUiCopy).sort()).toEqual(Object.keys(activeEnUiCopy).sort());
  });

  test('uses v2 as the active English copy', () => {
    expect(activeEnUiCopy.settingsSenaParametersPanelTitle).toBe('Planning settings');
    expect(getTranslation('en', 'settingsSenaParametersPanelTitle' as never)).toBe(
      'Planning settings',
    );
  });

  test('uses canonical English and Khmer brand variants', () => {
    expect(getTranslation('en', 'appBrand')).toBe('banj');
    expect(getTranslation('km', 'appBrand')).toBe('បញ្ជី');
    expect(translateUiLiteral('km', 'banj')).toBe('បញ្ជី');
    expect(translateUiLiteral('km', 'banji')).toBe('បញ្ជី');
  });

  test('preserves interpolation placeholders across the full Khmer map', () => {
    for (const [key, englishValue] of Object.entries(activeEnUiCopy)) {
      expect(extractTemplateVariables(kmUiCopy[key as keyof typeof kmUiCopy])).toEqual(
        extractTemplateVariables(englishValue),
      );
    }
  });

  test('rejects Latin letters across the full Khmer translation map', () => {
    const offenders = Object.entries(kmUiCopy).flatMap(([key, value]) => {
      const visibleText = stripTemplateVariables(value);
      return /[A-Za-z]/.test(visibleText) ? [`${key}: ${value}`] : [];
    });

    expect(offenders).toEqual([]);
  });

  test('interpolates translated templates', () => {
    expect(
      getTranslation('en', 'overviewTaskNextArrivalWindow' as never, { window: 'Apr 10-Apr 12' }),
    ).toBe('Current arrival window Apr 10-Apr 12.');
  });

  test('returns Khmer for representative v2-only and formerly missing surfaces', () => {
    expect(getTranslation('km', 'catalogSkuEditorNameHelper' as never)).toBe(
      'ដាក់ឈ្មោះ អេសខេយូ តាមរបៀបដែលបុគ្គលិកនឹងស្វែងរកវា។',
    );
    expect(getTranslation('km', 'catalogServiceEditorLinkedSkusDescriptor' as never)).toBe(
      'ភ្ជាប់ អេសខេយូ ដែលសេវាកម្មនេះប្រើ ដើម្បីឲ្យបញ្ជីអាចតាមដានការគ្របដណ្តប់ និងចំណុចរារាំងបាន។',
    );
    expect(getTranslation('km', 'analysisWorkbenchLaneInventorySubtitle' as never)).toBe(
      'ការប៉ាន់ស្មានស្តុកត្រូវបានបង្ហាញបន្តគ្នា ខណៈតម្រូវការសេវាកម្ម តម្រូវការលក់រាយ ការទទួលទំនិញ និងការកែសម្រួល នៅតែភ្ជាប់នឹងចន្លោះពេលនីមួយៗ។',
    );
    expect(getTranslation('km', 'settingsSenaParametersPanelDescription' as never)).toBe(
      'កែថា ផែនការក្នុងម៉ាស៊ីនដោះស្រាយភាពមិនច្បាស់លាស់យ៉ាងដូចម្តេច ពេលប៉ាន់ស្មានស្តុក និងណែនាំបរិមាណបញ្ជាទិញ។',
    );
    expect(getTranslation('km', 'stockUpdateGuidanceFirstUpdateNeedsCount' as never)).toBe(
      'ការអាប់ដេតលើកដំបូង ត្រូវមាន អេសខេយូ ដែលបានរាប់យ៉ាងហោចណាស់មួយ ដើម្បីឲ្យបញ្ជីចាប់យកស្តុកបាន។',
    );
  });

  test('rewrites awkward technical Khmer toward the active v2 meaning', () => {
    expect(getTranslation('km', 'backendReady' as never)).toBe(
      'កន្លែងធ្វើការផែនការក្នុងម៉ាស៊ីនរួចរាល់',
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
      'ចន្លោះដែលទំនង 3-5 · ចំណុចរារាំងសំខាន់ SKU-A · ហានិភ័យ ខ្ពស់ · ចំណុចរារាំងបន្ទាប់ SKU-B · មានស្តុកកំពុងមក',
    );
  });

  test('keeps the previously mixed Khmer surfaces fully localized', () => {
    const regressionKeys = [
      'serviceEditorUnsavedLeavePrompt',
      'skuVmHeroSentence',
      'performanceRoutePriceWatchTitle',
      'analysisRouteNeedCatalogTitle',
      'stockUpdateReviewBody',
      'catalogServiceLedgerTitle',
      'overviewReceiptAwaitingSupplierDetail',
    ] as const;

    for (const key of regressionKeys) {
      expect(/[A-Za-z]/.test(stripAllowedLatin(getTranslation('km', key as never)))).toBe(false);
    }

    expect(getTranslation('km', 'serviceEditorUnsavedLeavePrompt' as never)).toBe(
      'អ្នកមានការផ្លាស់ប្តូរសេវាកម្មមិនទាន់រក្សាទុក។ ចាកចេញពីទំព័រនេះ ហើយបោះបង់សេចក្តីព្រាងបច្ចុប្បន្នឬ?',
    );
    expect(
      getTranslation('km', 'skuVmHeroSentence' as never, {
        low: 3,
        high: 5,
        cover: '6 ថ្ងៃ',
        reorder: '72%',
        openOrders: 'មានការបញ្ជាទិញ 2',
        variability: 'ប្រែប្រួលមធ្យម',
        receipt: '10 មេសា',
      }),
    ).toBe(
      'ចន្លោះដែលទំនង 3-5 · ថ្ងៃគ្រប់គ្រាន់ 6 ថ្ងៃ · សញ្ញាបញ្ជាទិញបន្ថែម 72% · មានការបញ្ជាទិញ 2 · ប្រែប្រួលមធ្យម · ការដឹកមកដល់បន្ទាប់ 10 មេសា',
    );
  });

  test('localizes fuzzy-search chrome and shared option labels in Khmer', () => {
    expect(getTranslation('km', 'searchItems' as never)).toBe('ស្វែងរក និងបែងចែក');
    expect(getTranslation('km', 'searchPlaceholder' as never)).toBe(
      'ស្វែងរកឈ្មោះ ការពិពណ៌នា ឬលេខសម្គាល់…',
    );
    expect(getTranslation('km', 'analysisRouteScopeAll' as never)).toBe('ទាំងអស់');
    expect(getTranslation('km', 'analysisRouteScopeSkus' as never)).toBe('អេសខេយូ');
    expect(getTranslation('km', 'analysisRouteScopeServices' as never)).toBe('សេវាកម្ម');
  });

  test('localizes logs and archive hero descriptor literals in Khmer', () => {
    expect(
      translateUiLiteral(
        'km',
        'Review archived catalog items and restore anything that should return to active workspaces.',
      ),
    ).toBe(
      'ពិនិត្យធាតុកាតាឡុកដែលបានទុកក្នុងបណ្ណសារ ហើយស្ដារអ្វីដែលគួរត្រឡប់ទៅកន្លែងធ្វើការសកម្មវិញ។',
    );
    expect(
      translateUiLiteral(
        'km',
        'Search saved updates, see when real-world activity was captured, and inspect the signal package behind each interval.',
      ),
    ).toBe(
      'ស្វែងរកការអាប់ដេតដែលបានរក្សាទុក មើលថាតើសកម្មភាពជាក់ស្តែងត្រូវបានកត់ត្រាពេលណា ហើយពិនិត្យសំណុំសញ្ញាដែលនៅពីក្រោយចន្លោះនីមួយៗ។',
    );
  });

  test('blocks runtime translation calls from hard-coding English', async () => {
    const rendererRoot = resolve(process.cwd(), 'src/renderer/src');
    const sourceFiles = await collectSourceFiles(rendererRoot);
    const offenders: string[] = [];

    for (const sourceFile of sourceFiles) {
      const source = await readFile(sourceFile, 'utf8');
      const matches = [...source.matchAll(/\b(?:getTranslation|translateUiLiteral)\(\s*['"]en['"]/g)];
      offenders.push(
        ...matches.map((match) => {
          const line = source.slice(0, match.index).split('\n').length;
          return `${relative(rendererRoot, sourceFile)}:${line}`;
        }),
      );
    }

    expect(offenders).toEqual([]);
  });

  test('localizes the Khmer screenshot regression surfaces without English leaks', () => {
    const screenshotRegressionLiterals = [
      'Chart Settings',
      'Style, output values, and input values',
      'Settings',
      'Indicators',
      'Choose which indicators appear on the chart.',
      'Layout',
      'Move indicators between panes, change axis side, and remove rows from chart.',
      'Input Values',
      'Output Values',
      'Source',
      'Precision',
      'Default',
      'Labels on price scale',
      'Values in status line',
      'Right y-axis',
      'Reset chart',
      'Timeframe',
      'All',
      'Custom',
      'Stock Count',
      'Supplier Orders Pending',
      'Supplier Receipts',
      'Customer Orders Pending',
      'Confirm when this update was observed.',
      'Customer pending mode',
      'New pending',
      'Modify pending',
      'Cancel pending',
      'Supply',
      'Customer',
      'All suppliers',
    ];

    for (const literal of screenshotRegressionLiterals) {
      const translated = translateUiLiteral('km', literal);
      expect(translated).not.toBe(literal);
      expect(/[A-Za-z]/.test(stripAllowedLatin(translated))).toBe(false);
    }
  });

  test('keeps static runtime literal translations localized in Khmer', async () => {
    const rendererRoot = resolve(process.cwd(), 'src/renderer/src');
    const sourceFiles = await collectSourceFiles(rendererRoot);
    const offenders: string[] = [];

    for (const sourceFile of sourceFiles) {
      const source = await readFile(sourceFile, 'utf8');
      for (const { literal, line } of collectStaticTranslateUiLiteralCalls(source)) {
        const translated = translateUiLiteral('km', literal);
        if (/[A-Za-z]/.test(stripTemplateVariables(translated))) {
          offenders.push(`${relative(rendererRoot, sourceFile)}:${line}: ${literal} -> ${translated}`);
        }
      }
    }

    expect(offenders).toEqual([]);
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
