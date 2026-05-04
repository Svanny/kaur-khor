import { readdir, readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { describe, expect, test } from 'vitest';
import { kmUiCopy } from './km-ui-copy';
import {
  translateChartTimeframeLabel,
  translateLeadTimeVariabilityDescription,
  translateObservationEvidenceLabel,
  translateRiskLevelLabel,
} from './localized-display';
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
  return [...source.matchAll(/\btranslateUiLiteral\(\s*(?!['"]en['"])(?:[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*,\s*(['"])((?:\\.|(?!\1).)*)\1/g)].map((match) => ({
    literal: match[2].replace(/\\'/g, "'").replace(/\\"/g, '"'),
    line: source.slice(0, match.index).split('\n').length,
  })).filter(({ literal }) => literal.length > 1);
}

function collectTernaryTranslateUiLiteralCalls(source: string): Array<{ literal: string; line: number }> {
  return [...source.matchAll(/\btranslateUiLiteral\(\s*(?!['"]en['"])(?:[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)?)\s*,\s*[^?\n]+?\?\s*(['"])((?:\\.|(?!\1).)*)\1\s*:\s*(['"])((?:\\.|(?!\3).)*)\3/g)].flatMap((match) => {
    const line = source.slice(0, match.index).split('\n').length;
    return [
      { literal: match[2].replace(/\\'/g, "'").replace(/\\"/g, '"'), line },
      { literal: match[4].replace(/\\'/g, "'").replace(/\\"/g, '"'), line },
    ];
  }).filter(({ literal }) => literal.length > 1);
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
      'កំណត់របៀបដែលផែនការក្នុងម៉ាស៊ីនដោះស្រាយភាពមិនច្បាស់លាស់ ពេលប៉ាន់ស្មានស្តុក និងណែនាំបរិមាណបញ្ជាទិញ។',
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
    expect(getTranslation('km', 'analysisRouteScopeSkus' as never)).toBe('ធាតុស្តុក');
    expect(getTranslation('km', 'analysisRouteScopeServices' as never)).toBe('សេវាកម្ម');
  });

  test('uses natural Khmer verbs for catalog creation actions', () => {
    expect(translateUiLiteral('km', 'New SKU')).toBe('បន្ថែមអេសខេយូ');
    expect(translateUiLiteral('km', 'New service')).toBe('បន្ថែមសេវាកម្ម');
    expect(translateUiLiteral('km', 'Create new SKU')).toBe('បង្កើតអេសខេយូ');
    expect(translateUiLiteral('km', 'Create a new SKU')).toBe('បង្កើតអេសខេយូ');
    expect(translateUiLiteral('km', 'Create a new service')).toBe('បង្កើតសេវាកម្ម');
  });

  test('uses natural Khmer for rendered command palette literals', () => {
    expect(translateUiLiteral('km', 'Command home and daily entry point')).toBe(
      'ទំព័រដើម និងច្រកចូលការងារប្រចាំថ្ងៃ',
    );
    expect(translateUiLiteral('km', 'Queue, capture, and intake work')).toBe(
      'ជួរការងារ ការកត់ត្រា និងការទទួលសំណើ',
    );
    expect(translateUiLiteral('km', 'All work items')).toBe('ធាតុការងារទាំងអស់');
    expect(translateUiLiteral('km', 'Work SKU tasks')).toBe('ការងារអេសខេយូ');
    expect(translateUiLiteral('km', 'Work service tasks')).toBe('ការងារសេវាកម្ម');
    expect(translateUiLiteral('km', 'All work tasks')).toBe('ការងារទាំងអស់');
    expect(translateUiLiteral('km', 'Capture update')).toBe('កត់ត្រាការអាប់ដេត');
  });

  test('localizes bounded Khmer runtime literals without scanner leaks', () => {
    const literals = [
      'Automations',
      'Configuration',
      'Overview',
      'Catalog',
      'handle',
      'token',
      'Mission Control',
      'SKUs ({count})',
      '{count} linked SKUs',
      '{quantity} x {label}',
      '{items} +{overflow} more',
      'Telegram customer',
      'Telegram intake',
      'Telegram',
      'Chart duration',
      'Chart timeframe',
      'Chart flags',
      'Ledger for {name}',
      'adjustments',
      'Optional guidance',
      'Floating page actions',
      'Right-side context panels',
      'Work queue filter tabs',
      'US dollar',
      'Cambodian riel',
    ];

    for (const literal of literals) {
      const translated = translateUiLiteral('km', literal, {
        count: 2,
        items: 'សាប៊ូ, កន្សែង',
        label: 'សាប៊ូ',
        overflow: 1,
        quantity: 3,
        name: 'សាប៊ូ',
      });
      expect(translated).not.toBe(literal);
      expect(/[A-Za-z]/.test(stripAllowedLatin(translated))).toBe(false);
    }
  });

  test('localizes representative helper display labels in Khmer', () => {
    expect(translateLeadTimeVariabilityDescription('km', 'very_tight')).toBe(
      'ពេលវេលាដឹកមកដល់មានស្ថិរភាពខ្លាំង។',
    );
    expect(translateChartTimeframeLabel('km', 'Recent')).toBe('ថ្មីៗ');
    expect(translateChartTimeframeLabel('km', 'MAX')).toBe('ទាំងអស់');
    expect(translateRiskLevelLabel('km', 'High risk')).toBe('ហានិភ័យខ្ពស់');
    expect(translateRiskLevelLabel('km', 'Low')).toBe('ទាប');
    expect(translateObservationEvidenceLabel('km', 'No direct evidence in this period.')).toBe(
      'មិនមានភស្តុតាងផ្ទាល់នៅក្នុងរយៈពេលនេះទេ។',
    );
    expect(getTranslation('km', 'catalogServiceRailCoverLine' as never, { value: '8 ថ្ងៃ' })).toBe(
      'ថ្ងៃគ្រប់គ្រាន់ 8 ថ្ងៃ',
    );
  });

  test('documents the bounded Latin-token policy used by Khmer guardrails', () => {
    expect(/[A-Za-z]/.test(stripAllowedLatin('អេសខេយូ SKU CSV USD KHR API JSON SQLite ID IDs ETA SENA ESS 1M'))).toBe(false);
    expect(/[A-Za-z]/.test(stripAllowedLatin('ឯកសារ Excel'))).toBe(true);
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
      'Expose approved sellables to Telegram, turn messages into customer tickets, and keep banji as the source of pricing and fulfillment truth.',
      'Expose approved sellables to Telegram, turn messages into tickets, and keep banji as source.',
      '@bot_username',
      'https://t.me/your_bot',
      'Demand, support, timing, price, and recovery pressure.',
      'Money in, money tied up, and value leakage.',
      'Detailed explanation, observations, fragility, and chart settings.',
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
      for (const { literal, line } of collectTernaryTranslateUiLiteralCalls(source)) {
        const translated = translateUiLiteral('km', literal);
        if (/[A-Za-z]/.test(stripTemplateVariables(translated))) {
          offenders.push(`${relative(rendererRoot, sourceFile)}:${line}: ${literal} -> ${translated}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  test('keeps Khmer insight route titles and tabs localized consistently', () => {
    expect(getTranslation('km', 'performanceRouteTitle' as never)).toBe('សម្ពាធ');
    expect(getTranslation('km', 'analysisRouteTitle' as never)).toBe('ការពន្យល់');
    expect(getTranslation('km', 'analysisWorkbenchNavPressure' as never)).toBe('ហានិភ័យ');
    expect(getTranslation('km', 'analysisWorkbenchNavObservations' as never)).toBe('ភស្តុតាង');
    expect(getTranslation('km', 'analysisWorkbenchNavFragility' as never)).toBe('ចំណុចរារាំង');
    expect(getTranslation('km', 'analysisWorkbenchNavSettings' as never)).toBe('ប៉ារ៉ាម៉ែត្រ');
    expect(getTranslation('km', 'analysisWorkbenchSelectSurface' as never)).toBe('ជ្រើសទិដ្ឋភាពការពន្យល់');
  });

  test('keeps Khmer Money terminology aligned across financial surfaces', () => {
    expect(getTranslation('km', 'navFinancials' as never)).toBe('ហិរញ្ញវត្ថុ');
    expect(getTranslation('km', 'financialsRouteTitle' as never)).toBe('ហិរញ្ញវត្ថុ');
    expect(translateUiLiteral('km', 'Money')).toBe('ហិរញ្ញវត្ថុ');
  });

  test('keeps Khmer settings route copy natural on rendered route surfaces', () => {
    expect(getTranslation('km', 'settingsInterfaceVisibilityTitle' as never)).toBe(
      'ចំណុចប្រទាក់',
    );
    expect(getTranslation('km', 'settingsCreditsTitle' as never)).toBe('អំពីអ្នកបង្កើត');
    expect(getTranslation('km', 'settingsMadeWith' as never)).toBe(
      'បង្កើតដោយយកចិត្តទុកដាក់',
    );
    expect(getTranslation('km', 'settingsDangerZoneTitle' as never)).toBe('តំបន់ប្រយ័ត្ន');
    expect(getTranslation('km', 'settingsSenaParametersPanelDescription' as never)).toBe(
      'កំណត់របៀបដែលផែនការក្នុងម៉ាស៊ីនដោះស្រាយភាពមិនច្បាស់លាស់ ពេលប៉ាន់ស្មានស្តុក និងណែនាំបរិមាណបញ្ជាទិញ។',
    );
    expect(getTranslation('km', 'settingsTargetServiceLevelTooltip' as never)).toBe(
      'កម្រិតភាពមានស្រាប់គោលដៅ គឺជាគោលដៅស្តុកដែលបញ្ជីប្រើសម្រាប់ផែនការ។ កម្រិតខ្ពស់ជាទូទៅមានន័យថាត្រូវរក្សាស្តុកច្រើនជាងមុន។',
    );
    expect(getTranslation('km', 'settingsReviewDelayDaysTooltip' as never)).toBe(
      'បន្ថែមចំនួនថ្ងៃនេះទៅពេលវេលាដឹកមកដល់ ដើម្បីឲ្យការណែនាំគ្របដណ្តប់ដល់ពេលដែលអាចសម្រេចបំពេញស្តុកជាក់ស្តែងបន្ទាប់បាន។',
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
