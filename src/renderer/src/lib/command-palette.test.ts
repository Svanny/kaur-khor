import { describe, expect, test } from 'vitest';
import type { InventoryContextValue } from '@/state/inventory';
import { buildCommandDescriptors, searchCommandDescriptors } from './command-palette';

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
    submitLegacyReport: async () => {
      throw new Error('not implemented');
    },
    upsertSenaCatalog: async (payload) => payload,
    loadSenaCatalog: async () => null,
    ingestSenaObservation: async () => {
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
  test('builds static, entity, and overview workflow commands', () => {
    const inventory = createInventory({
      catalog: {
        schemaVersion: 1,
        bundles: [],
        services: [{ bundle: false, description: 'Hair service', name: 'Haircut', price: 12, serviceId: 'service-1' }],
        sharingMask: [{ enabled: true, serviceId: 'service-1', skuId: 'sku-1', usageProbability: 1 }],
        skus: [{
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
      inventory,
      language: 'en',
      t: (key) =>
        ({
          navAnalysis: 'Analysis',
          navCatalog: 'Catalog',
          navOperations: 'Logs',
          navOverview: 'Overview',
          navPerformance: 'Performance',
          navRecordUpdate: 'Record update',
          navSettings: 'Settings',
        }[key] ?? key),
    });

    expect(commands.some((command) => command.id === 'page:catalog')).toBe(true);
    expect(commands.some((command) => command.id === 'sku:open:sku-1')).toBe(true);
    expect(commands.some((command) => command.id === 'sku:sheet:order:sku-1')).toBe(true);
    expect(commands.some((command) => command.id === 'service:sheet:price:service-1')).toBe(true);
    expect(commands.some((command) => command.id === 'overview:task:sku-1:log_order')).toBe(true);
  });

  test('prefers exact and prefix matches over fuzzy matches', () => {
    const commands = [
      {
        action: { href: '/catalog', type: 'page' as const },
        aliases: [],
        id: 'catalog',
        keywords: ['catalog'],
        kind: 'page' as const,
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
        pagePrefixes: ['/analysis'],
        priority: 10,
        title: 'Analysis',
      },
    ];

    const [first] = searchCommandDescriptors({
      commands,
      currentPathname: '/',
      query: 'cat',
    });

    expect(first?.id).toBe('analysis');
  });
});
