import { describe, expect, test } from 'vitest';
import type { InventoryContextValue } from '@/state/inventory';
import { PAGE_STATE_MEMORY_STORAGE_KEY } from './page-state-memory';
import { buildCommandDescriptors, groupCommandDescriptors, searchCommandDescriptors } from './command-palette';

function createInventory(overrides?: Partial<InventoryContextValue>): InventoryContextValue {
  return {
    catalog: null,
    diagnostics: null,
    error: null,
    isLoading: false,
    isSaving: false,
    latestRun: null,
    observations: [],
    reload: async () => {},
    reports: [],
    senaMeta: { catalogHash: null, lastBootstrapSkuId: null, lastCompletedRunId: null },
    snapshot: null,
    workspaceSummary: null,
    loadInventorySnapshot: async () => {
      throw new Error('not implemented');
    },
    listStockReports: async () => [],
    upsertSenaCatalog: async (payload) => payload,
    archiveCatalogEntity: async (payload) => {
      throw new Error(`not implemented: ${payload.entityType}:${payload.entityId}`);
    },
    unarchiveCatalogEntity: async (payload) => {
      throw new Error(`not implemented: ${payload.entityType}:${payload.entityId}`);
    },
    loadSenaCatalog: async () => null,
    ingestSenaObservation: async () => {
      throw new Error('not implemented');
    },
    updateSenaObservation: async () => {
      throw new Error('not implemented');
    },
    deleteSenaObservation: async () => {
      throw new Error('not implemented');
    },
    listSenaObservations: async () => [],
    loadSenaObservations: async () => [],
    triggerSenaRun: async () => {
      throw new Error('not implemented');
    },
    retrySenaRun: async () => {
      throw new Error('not implemented');
    },
    loadSenaWorkspaceSummary: async () => null,
    loadSenaSkuDetail: async () => null,
    loadSenaServiceDetail: async () => null,
    clearSenaSkuDetailCache: async () => {},
    clearSenaServiceDetailCache: async () => {},
    loadSenaDiagnostics: async () => null,
    loadSenaRunStatus: async () => null,
    updateSenaMeta: () => {},
    ...overrides,
  };
}

describe('command palette descriptors', () => {
  test('hides analysis commands when the explain mode is disabled', () => {
    const commands = buildCommandDescriptors({
      currency: 'USD',
      displayViewMode: 'custom',
      inventory: createInventory(),
      language: 'en',
      senaEngineParameters: { smoothingEnabled: true },
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showAutomationsPage: true,
      showAnalysisPage: false,
      t: (key) =>
        ({
          navAnalysis: 'Explain',
          navAutomations: 'Automations',
          navArchive: 'Archive',
          navCatalog: 'Catalog',
          navOperations: 'Logs',
          navOverview: 'Overview',
          navPerformance: 'Performance',
          navFinancials: 'Financials',
          navHome: 'Home',
          navInbox: 'Inbox',
          navWork: 'Work',
          navCapture: 'Capture',
          navInsights: 'Insights',
          navHistory: 'History',
          navRecordUpdate: 'Record update',
          navSettings: 'Settings',
          navHelp: 'Help',
        }[key] ?? key),
    });

    expect(commands.some((command) => command.pageId === 'analysis')).toBe(false);
    expect(commands.some((command) => command.id === 'page:analysis')).toBe(false);
  });

  test('builds the settings command for automations and intake visibility', () => {
    const enabledCommands = buildCommandDescriptors({
      currency: 'USD',
      displayViewMode: 'custom',
      inventory: createInventory(),
      language: 'en',
      senaEngineParameters: { smoothingEnabled: true },
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showAutomationsPage: true,
      showAnalysisPage: true,
      t: (key) => key,
    });
    const disabledCommands = buildCommandDescriptors({
      currency: 'USD',
      displayViewMode: 'custom',
      inventory: createInventory(),
      language: 'en',
      senaEngineParameters: { smoothingEnabled: true },
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showAutomationsPage: false,
      showAnalysisPage: true,
      t: (key) => key,
    });

    expect(enabledCommands.find((command) => command.id === 'settings:automations-page:off')).toMatchObject({
      action: {
        effect: 'set-show-automations-page',
        href: '/settings/interface?highlight=automations',
        type: 'settings',
        value: false,
      },
      title: 'Hide automations and intake',
    });
    expect(disabledCommands.find((command) => command.id === 'settings:automations-page:on')).toMatchObject({
      action: {
        effect: 'set-show-automations-page',
        href: '/settings/interface?highlight=automations',
        type: 'settings',
        value: true,
      },
      title: 'Show automations and intake',
    });
    expect(disabledCommands.some((command) => command.id === 'page:automations')).toBe(false);
    expect(disabledCommands.some((command) => command.action.href === '/work/intake')).toBe(false);
  });

  test('builds static, entity, and overview workflow commands', () => {
    const inventory = createInventory({
      catalog: {
        schemaVersion: 1,
        bundles: [],
        services: [{ archived: false, bundle: false, description: 'Hair service', name: 'Haircut', price: 12, serviceId: 'service-1' }],
        sharingMask: [{ enabled: true, serviceId: 'service-1', skuId: 'sku-1', usageProbability: 1 }],
        skus: [{
          archived: false,
          costPerUnit: 4,
          description: 'Cotton tee',
          supplierName: 'Mekong Looms',
          leadTimeMeanDaysHint: 5,
          leadTimeStdDaysHint: 1,
          name: 'Market Tee',
          productPrice: 9,
          skuId: 'sku-1',
          soldAsProduct: true,
        }],
      },
      observations: [
        {
          observationId: 'obs-1',
          ownerSub: 'desktop-owner',
          input: {
            observedAt: '2026-04-01T00:00:00Z',
            stockSnapshot: [],
            orderSignals: [],
            retailPrices: [],
            servicePrices: [],
            leadTimeHints: [],
            retailRankings: [],
            serviceRankings: [],
            retailStockouts: [],
            serviceStockouts: [],
          },
        } as never,
        {
          observationId: 'obs-2',
          ownerSub: 'desktop-owner',
          input: {
            observedAt: '2026-04-02T00:00:00Z',
            stockSnapshot: [],
            orderSignals: [],
            retailPrices: [],
            servicePrices: [],
            leadTimeHints: [],
            retailRankings: [],
            serviceRankings: [],
            retailStockouts: [],
            serviceStockouts: [],
          },
        } as never,
      ],
      reports: [{ reportId: 'report-1' } as never],
      workspaceSummary: {
        ownerSub: 'desktop-owner',
        runId: 'run-1',
        latestObservedAt: '2026-04-02T00:00:00Z',
        skuCount: 1,
        serviceCount: 1,
        intervalCount: 1,
        pendingReorderCount: 1,
        topRegime: 'normal',
        highRiskSkuIds: ['sku-1'],
        skuSummaries: [{
          skuId: 'sku-1',
          latestPosteriorUnits: 2,
          credibleIntervalLow: 1,
          credibleIntervalHigh: 4,
          demandPerDayMean: 3,
          stockoutRisk: 0.82,
          daysOfCover: 1,
          expectedLeadTimeDemand: 8,
          safetyStock: 2,
          reorderPoint: 7,
          reorderTriggerProbability: 0.91,
          reorderQuantity: {
            recommendedUnits: 10,
            ungatedRecommendedUnits: 10,
            likelyRangeLow: 8,
            likelyRangeHigh: 12,
            needProbability: 0.91,
            recommendationIssued: true,
            recommendationQuantile: 0.8,
            intervalLowQuantile: 0.1,
            intervalHighQuantile: 0.9,
            needProbabilityGate: 0.7,
            reviewDelayDays: 1,
          },
          leadTimeMeanDays: 5,
          leadTimeStdDays: 1,
          regimeProbabilities: { normal: 1 },
        }],
      },
    });

    const commands = buildCommandDescriptors({
      currency: 'USD',
      displayViewMode: 'custom',
      inventory,
      language: 'en',
      senaEngineParameters: { smoothingEnabled: true },
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showAutomationsPage: true,
      showAnalysisPage: true,
      t: (key) =>
        ({
          navAnalysis: 'Explain',
          navAutomations: 'Automations',
          navArchive: 'Archive',
          navCatalog: 'Catalog',
          navOperations: 'Logs',
          navOverview: 'Overview',
          navPerformance: 'Performance',
          navFinancials: 'Financials',
          navHome: 'Home',
          navInbox: 'Inbox',
          navWork: 'Work',
          navCapture: 'Capture',
          navInsights: 'Insights',
          navHistory: 'History',
          navRecordUpdate: 'Record update',
          navSettings: 'Settings',
          navHelp: 'Help',
        }[key] ?? key),
    });

    expect(commands.some((command) => command.id === 'page:catalog')).toBe(true);
    expect(commands.some((command) => command.id === 'page:home')).toBe(true);
    expect(commands.some((command) => command.id === 'page:work')).toBe(true);
    expect(commands.some((command) => command.id === 'page:capture')).toBe(false);
    expect(commands.some((command) => command.id === 'page:insights')).toBe(true);
    expect(commands.some((command) => command.id === 'page:history')).toBe(true);
    expect(commands.some((command) => command.id === 'page:automations')).toBe(false);
    expect(commands.some((command) => command.id === 'page:archive')).toBe(true);
    expect(commands.some((command) => command.id === 'page:help')).toBe(true);
    expect(commands.some((command) => command.id === 'sku:open:sku-1')).toBe(true);
    expect(commands.some((command) => command.id === 'sku:archive:sku-1')).toBe(true);
    expect(commands.some((command) => command.id === 'sku:sheet:order:sku-1')).toBe(true);
    expect(commands.some((command) => command.id === 'service:sheet:price:service-1')).toBe(true);
    expect(commands.some((command) => command.id === 'service:archive:service-1')).toBe(true);
    expect(commands.some((command) => command.id === 'work:task:sku-1:log_order')).toBe(true);
    expect(commands.some((command) => command.id === 'settings:language:km')).toBe(true);
    expect(commands.some((command) => command.id === 'settings:workspace:create-backup-snapshot')).toBe(true);
    expect(commands.some((command) => command.id === 'settings:workspace:restore-backup-snapshot')).toBe(true);
    expect(commands.some((command) => command.id === 'settings:workspace:export-planning-data')).toBe(true);
    expect(commands.find((command) => command.id === 'sku:open:sku-1')?.subtitle).toBe('SKU · Supplier: Mekong Looms');
    expect(commands.find((command) => command.id === 'sku:sheet:order:sku-1')?.subtitle).toBe('SKU action · Supplier: Mekong Looms');
    expect(commands.find((command) => command.id === 'sku:sheet:order:sku-1')?.action.href).toBe('/catalog/skus/sku-1');
    expect(commands.find((command) => command.id === 'service:sheet:price:service-1')?.action.href).toBe('/catalog/services/service-1');
    expect(commands.find((command) => command.id === 'work:task:sku-1:log_order')?.action.href).toBe('/work/queue?filter=to_order');
    expect(commands.find((command) => command.id === 'sku:open:sku-1')?.keywords).toContain('Mekong Looms');
  });

  test('omits gated page commands when the workspace has not unlocked them yet', () => {
    const commands = buildCommandDescriptors({
      currency: 'USD',
      displayViewMode: 'custom',
      inventory: createInventory({
        catalog: {
          schemaVersion: 1,
          bundles: [],
          services: [],
          sharingMask: [],
          skus: [],
        },
        observations: [],
      }),
      language: 'en',
      senaEngineParameters: { smoothingEnabled: true },
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showAutomationsPage: true,
      showAnalysisPage: true,
      t: (key) =>
        ({
          navAnalysis: 'Explain',
          navAutomations: 'Automations',
          navArchive: 'Archive',
          navCatalog: 'Catalog',
          navOperations: 'Logs',
          navOverview: 'Overview',
          navPerformance: 'Performance',
          navFinancials: 'Financials',
          navHome: 'Home',
          navInbox: 'Inbox',
          navWork: 'Work',
          navCapture: 'Capture',
          navInsights: 'Insights',
          navHistory: 'History',
          navRecordUpdate: 'Record update',
          navSettings: 'Settings',
          navHelp: 'Help',
        }[key] ?? key),
    });

    expect(commands.some((command) => command.id === 'page:catalog')).toBe(false);
    expect(commands.some((command) => command.id === 'page:history')).toBe(false);
    expect(commands.some((command) => command.id === 'page:performance')).toBe(false);
    expect(commands.some((command) => command.id === 'page:financials')).toBe(false);
    expect(commands.some((command) => command.id === 'page:automations')).toBe(false);
  });

  test('uses remembered page state for page commands and preserves it for explicit tab commands', () => {
    window.localStorage.setItem(PAGE_STATE_MEMORY_STORAGE_KEY, JSON.stringify({
      catalog: '?q=scarf&view=skus',
      performance: '?compare=0&range=7d&scope=skus&supplier=Mekong+Looms',
    }));

    const commands = buildCommandDescriptors({
      currency: 'USD',
      displayViewMode: 'custom',
      inventory: createInventory({
        catalog: {
          schemaVersion: 1,
          bundles: [],
          services: [],
          sharingMask: [],
          skus: [{
            archived: false,
            costPerUnit: 4,
            description: 'Cotton tee',
            leadTimeMeanDaysHint: 5,
            leadTimeStdDaysHint: 1,
            name: 'SKU 1',
            productPrice: 9,
            skuId: 'sku-1',
            soldAsProduct: true,
          }],
        },
        observations: [{ observationId: 'obs-1' }, { observationId: 'obs-2' }] as never,
        reports: [{ reportId: 'report-1' } as never],
      }),
      language: 'en',
      senaEngineParameters: { smoothingEnabled: true },
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showAutomationsPage: true,
      showAnalysisPage: true,
      t: (key) =>
        ({
          navAnalysis: 'Explain',
          navAutomations: 'Automations',
          navArchive: 'Archive',
          navCatalog: 'Catalog',
          navOperations: 'Logs',
          navOverview: 'Overview',
          navPerformance: 'Performance',
          navFinancials: 'Financials',
          navHome: 'Home',
          navInbox: 'Inbox',
          navWork: 'Work',
          navCapture: 'Capture',
          navInsights: 'Insights',
          navHistory: 'History',
          navRecordUpdate: 'Record update',
          navSettings: 'Settings',
          navHelp: 'Help',
        }[key] ?? key),
    });

    expect(commands.find((command) => command.id === 'page:catalog')?.action.href).toBe('/catalog?q=scarf&view=skus');
    expect(commands.find((command) => command.id === 'page:insights')?.action.href).toBe('/insights');
    expect(commands.find((command) => command.id === 'performance:range:90d')?.action.href).toBe(
      '/insights/pressure?range=90d&scope=skus&supplier=Mekong+Looms',
    );
  });

  test('does not match raw sku ids in search results', () => {
    const inventory = createInventory({
      catalog: {
        schemaVersion: 1,
        bundles: [],
        services: [],
        sharingMask: [],
        skus: [{
          archived: false,
          costPerUnit: 4,
          description: 'Cotton tee',
          leadTimeMeanDaysHint: 5,
          leadTimeStdDaysHint: 1,
          name: 'SKU 1',
          productPrice: 9,
          skuId: 'sku-1',
          soldAsProduct: true,
        }],
      },
    });

    const commands = buildCommandDescriptors({
      currency: 'USD',
      displayViewMode: 'custom',
      inventory,
      language: 'en',
      senaEngineParameters: { smoothingEnabled: true },
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showAutomationsPage: true,
      showAnalysisPage: true,
      t: (key) => key,
    });

    expect(
      searchCommandDescriptors({
        commands,
        currentPathname: '/catalog',
        query: 'sku-1',
      }).some((command) => command.id === 'sku:open:sku-1'),
    ).toBe(false);
  });

  test('excludes archived entities from normal results and emits unarchive commands on the archive page', () => {
    const inventory = createInventory({
      catalog: {
        schemaVersion: 1,
        bundles: [],
        services: [
          { archived: false, bundle: false, description: 'Active service', name: 'Haircut', price: 12, serviceId: 'service-1' },
          { archived: true, bundle: false, description: 'Archived service', name: 'Color', price: 18, serviceId: 'service-2' },
        ],
        sharingMask: [],
        skus: [
          {
            archived: false,
            costPerUnit: 4,
            description: 'Active sku',
            leadTimeMeanDaysHint: 5,
            leadTimeStdDaysHint: 1,
            name: 'SKU 1',
            productPrice: 9,
            skuId: 'sku-1',
            soldAsProduct: true,
          },
          {
            archived: true,
            costPerUnit: 6,
            description: 'Archived sku',
            leadTimeMeanDaysHint: 7,
            leadTimeStdDaysHint: 2,
            name: 'SKU 2',
            productPrice: 12,
            skuId: 'sku-2',
            soldAsProduct: true,
          },
        ],
      },
    });

    const commands = buildCommandDescriptors({
      currency: 'USD',
      displayViewMode: 'custom',
      inventory,
      language: 'en',
      senaEngineParameters: { smoothingEnabled: true },
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showAutomationsPage: true,
      showAnalysisPage: true,
      t: (key) =>
        ({
          navAnalysis: 'Explain',
          navAutomations: 'Automations',
          navArchive: 'Archive',
          navCatalog: 'Catalog',
          navOperations: 'Logs',
          navOverview: 'Overview',
          navPerformance: 'Performance',
          navFinancials: 'Financials',
          navRecordUpdate: 'Record update',
          navSettings: 'Settings',
          navHelp: 'Help',
        }[key] ?? key),
    });

    expect(commands.some((command) => command.id === 'sku:open:sku-2')).toBe(false);
    expect(commands.some((command) => command.id === 'service:open:service-2')).toBe(false);
    expect(commands.some((command) => command.id === 'sku:archive:sku-2')).toBe(false);
    expect(commands.some((command) => command.id === 'service:archive:service-2')).toBe(false);
    expect(commands.find((command) => command.id === 'sku:unarchive:sku-2')?.pageId).toBe('archive');
    expect(commands.find((command) => command.id === 'service:unarchive:service-2')?.pageId).toBe('archive');
  });

  test('prefers exact and prefix matches over fuzzy matches', () => {
    const commands = [
      {
        action: { href: '/catalog', type: 'page' as const },
        aliases: [],
        id: 'catalog',
        keywords: ['catalog'],
        kind: 'page' as const,
        pageId: 'catalog',
        pageOrder: 3,
        pagePrefixes: ['/catalog'],
        priority: 20,
        title: 'Catalog',
      },
      {
        action: { href: '/analysis', type: 'page' as const },
        aliases: ['cat'],
        id: 'analysis',
        keywords: ['analysis'],
        kind: 'page' as const,
        pageId: 'analysis',
        pageOrder: 4,
        pagePrefixes: ['/analysis'],
        priority: 10,
        title: 'Explain',
      },
    ];

    const [first] = searchCommandDescriptors({
      commands,
      currentPathname: '/',
      query: 'cat',
    });

    expect(first?.id).toBe('analysis');
  });

  test('matches pill labels as fuzzy-search terms', () => {
    const commands = [
      {
        action: { href: '/overview', type: 'page' as const },
        aliases: [],
        id: 'page-overview',
        keywords: ['overview'],
        kind: 'page' as const,
        pageId: 'overview',
        pageOrder: 0,
        pagePrefixes: ['/'],
        priority: 10,
        title: 'Overview',
      },
      {
        action: { href: '/overview?scope=all', type: 'tab' as const },
        aliases: [],
        id: 'tab-overview-all',
        keywords: ['overview'],
        kind: 'tab' as const,
        pageId: 'overview',
        pageOrder: 0,
        pagePrefixes: ['/'],
        priority: 20,
        tabOrder: 0,
        title: 'All overview items',
      },
    ];

    expect(
      searchCommandDescriptors({
        commands,
        currentPathname: '/',
        query: 'pages',
      }).map((command) => command.id),
    ).toContain('page-overview');
    expect(
      searchCommandDescriptors({
        commands,
        currentPathname: '/',
        query: 'tabs',
      }).map((command) => command.id),
    ).toContain('tab-overview-all');
  });

  test('prefers the page result for title-plus-pill queries', () => {
    const commands = [
      {
        action: { href: '/overview', type: 'page' as const },
        aliases: [],
        id: 'page-overview',
        keywords: ['overview'],
        kind: 'page' as const,
        pageId: 'overview',
        pageOrder: 0,
        pagePrefixes: ['/'],
        priority: 10,
        title: 'Overview',
      },
      {
        action: { href: '/overview?scope=all', type: 'tab' as const },
        aliases: [],
        id: 'tab-overview-all',
        keywords: ['overview'],
        kind: 'tab' as const,
        pageId: 'overview',
        pageOrder: 0,
        pagePrefixes: ['/'],
        priority: 20,
        tabOrder: 0,
        title: 'All overview items',
      },
    ];

    const [first] = searchCommandDescriptors({
      commands,
      currentPathname: '/',
      query: 'overview page',
    });

    expect(first?.id).toBe('page-overview');
  });

  test('groups results into best matches, pages, tabs, and alphabetized actions', () => {
    const sections = groupCommandDescriptors([
      {
        action: { href: '/catalog/skus/sku-1', type: 'entity' as const },
        aliases: [],
        id: 'action-b',
        keywords: [],
        kind: 'entity' as const,
        pageId: 'catalog',
        pageOrder: 3,
        pagePrefixes: ['/catalog'],
        priority: 300,
        title: 'Zebra item',
      },
      {
        action: { href: '/analysis?timeframe=Recent', type: 'tab' as const },
        aliases: [],
        id: 'tab-analysis',
        keywords: [],
        kind: 'tab' as const,
        pageId: 'analysis',
        pageOrder: 4,
        pagePrefixes: ['/analysis'],
        priority: 120,
        tabOrder: 2,
        title: 'Explain / Timeframe / Recent',
      },
      {
        action: { href: '/catalog?view=skus', type: 'tab' as const },
        aliases: [],
        id: 'tab-catalog',
        keywords: [],
        kind: 'tab' as const,
        pageId: 'catalog',
        pageOrder: 3,
        pagePrefixes: ['/catalog'],
        priority: 60,
        tabOrder: 0,
        title: 'Catalog / SKUs',
      },
      {
        action: { href: '/settings', type: 'page' as const },
        aliases: [],
        id: 'page-settings',
        keywords: [],
        kind: 'page' as const,
        pageId: 'settings',
        pageOrder: 6,
        pagePrefixes: ['/settings'],
        priority: 16,
        title: 'Settings',
      },
      {
        action: { href: '/performance', type: 'page' as const },
        aliases: [],
        id: 'page-performance',
        keywords: [],
        kind: 'page' as const,
        pageId: 'performance',
        pageOrder: 2,
        pagePrefixes: ['/performance'],
        priority: 12,
        title: 'Performance',
      },
      {
        action: { href: '/catalog/services/new', type: 'workflow' as const },
        aliases: [],
        id: 'action-a',
        keywords: [],
        kind: 'workflow' as const,
        pageId: 'catalog',
        pageOrder: 3,
        pagePrefixes: ['/catalog'],
        priority: 17,
        title: 'Alpha action',
      },
    ], {
      bestMatchCount: 2,
      includeBestMatches: true,
    });

    expect(sections.map((section) => section.title)).toEqual(['Best Matches', 'Pages', 'Tabs', 'Actions']);
    expect(sections[0]?.items.map((item) => item.title)).toEqual(['Zebra item', 'Explain / Timeframe / Recent']);
    expect(sections[1]?.items.map((item) => item.title)).toEqual(['Performance', 'Settings']);
    expect(sections[2]?.items.map((item) => item.title)).toEqual(['Catalog / SKUs']);
    expect(sections[3]?.items.map((item) => item.title)).toEqual(['Alpha action']);
  });
});
