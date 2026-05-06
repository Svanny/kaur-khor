import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { getTranslation } from '@/lib/translations';
import { InventoryRoute } from './inventory';

const inventoryHook = vi.fn();
const preferencesHook = vi.fn();

vi.mock('@/state/inventory', () => ({
  useInventory: () => inventoryHook(),
}));

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

vi.mock('./automations', () => ({
  AutomationsRoute: () => <div>Embedded automations</div>,
}));

describe('InventoryRoute', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  test('does not embed automations from catalog when automations are hidden', () => {
    inventoryHook.mockReturnValue({
      catalog: {
        bundles: [],
        schemaVersion: 1,
        services: [],
        sharingMask: [],
        skus: [],
      },
      observations: [],
      reports: [],
      snapshot: null,
      workspaceSummary: null,
    });
    preferencesHook.mockReturnValue({
      currency: 'USD',
      language: 'en',
      showAutomationsPage: false,
      t: (
        key: Parameters<typeof getTranslation>[1],
        variables?: Parameters<typeof getTranslation>[2],
      ) => getTranslation('en', key, variables),
      usdToKhrExchangeRate: 4000,
    });

    render(
      <MemoryRouter initialEntries={['/catalog?section=automation']}>
        <InventoryRoute />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Embedded automations')).not.toBeInTheDocument();
    expect(screen.getByText('Offered Selections')).toBeInTheDocument();
  });

  test('lazy-loads SKU detail when catalog row actions open', async () => {
    const loadSenaSkuDetail = vi.fn(async () => ({
      summary: {
        skuId: 'sku-1',
        latestPosteriorUnits: 9,
        credibleIntervalLow: 6,
        credibleIntervalHigh: 12,
        demandPerDayMean: 2,
        stockoutRisk: 0.4,
        daysOfCover: 4,
        expectedLeadTimeDemand: 8,
        safetyStock: 3,
        reorderPoint: 7,
        reorderTriggerProbability: 0.55,
        reorderQuantity: {
          recommendedUnits: 6,
          ungatedRecommendedUnits: 6,
          likelyRangeLow: 5,
          likelyRangeHigh: 7,
          needProbability: 0.91,
          recommendationIssued: true,
          recommendationQuantile: 0.7,
          intervalLowQuantile: 0.1,
          intervalHighQuantile: 0.9,
          needProbabilityGate: 0.5,
          reviewDelayDays: 2,
        },
        leadTimeMeanDays: 5,
        leadTimeStdDays: 1,
        regimeProbabilities: { normal: 1 },
      },
      inventoryPosterior: [],
      demandPosterior: [],
      pipelinePosterior: [],
      leadTimePosterior: [],
    }));
    inventoryHook.mockReturnValue({
      catalog: {
        bundles: [],
        schemaVersion: 1,
        services: [],
        sharingMask: [],
        skus: [
          {
            archived: false,
            costPerUnit: 4,
            description: 'Cotton tee',
            imagePath: null,
            leadTimeMeanDaysHint: 5,
            leadTimeStdDaysHint: 1,
            name: 'SKU 1',
            productPrice: 9,
            skuId: 'sku-1',
            soldAsProduct: true,
            supplierName: 'Mekong Looms',
          },
        ],
      },
      diagnostics: null,
      isLoading: false,
      isSaving: false,
      loadSenaSkuDetail,
      observations: [
        {
          observationId: 'obs-1',
          ownerSub: 'desktop-owner',
          input: {
            observedAt: '2026-04-02T00:00:00Z',
            stockSnapshot: [],
            serviceRankings: [],
            retailRankings: [],
            serviceStockouts: [],
            retailStockouts: [],
            orderSignals: [],
            servicePrices: [],
            retailPrices: [],
            leadTimeHints: [],
            adjustmentSignals: [],
            commercialEvents: [],
            ticketEvents: [],
            recipeUsageHints: [],
          },
        },
      ],
      orderBatches: [],
      reports: [],
      snapshot: {
        ranking: [],
        services: [],
        sist: {
          asOf: '2026-04-02T00:00:00Z',
          highRiskSkuIds: ['sku-1'],
          pendingReorderCount: 1,
          settings: {
            forecastHorizonDays: 14,
            particleCount: 512,
            smoothingWindowReports: 90,
            targetServiceLevel: 0.95,
          },
          skuInsights: [],
          status: {
            confidence: 'medium',
            reason: null,
            reportCount: 1,
            state: 'ready',
            updatedAt: '2026-04-02T00:00:00Z',
          },
          topRegime: 'normal',
        },
        skus: [
          {
            costPerUnit: 4,
            description: 'Cotton tee',
            leadTimeMeanDays: 5,
            leadTimeStdDays: 1,
            name: 'SKU 1',
            productPrice: 9,
            skuId: 'sku-1',
            soldAsProduct: true,
            unitsInStock: 12,
          },
        ],
      },
      workspaceSummary: {
        highRiskSkuIds: ['sku-1'],
        intervalCount: 1,
        latestObservedAt: '2026-04-02T00:00:00Z',
        ownerSub: 'desktop-owner',
        pendingReorderCount: 1,
        runId: 'run-1',
        serviceCount: 0,
        skuCount: 1,
        skuSummaries: [],
        topRegime: 'normal',
      },
    });
    preferencesHook.mockReturnValue({
      currency: 'USD',
      language: 'en',
      showAutomationsPage: false,
      t: (
        key: Parameters<typeof getTranslation>[1],
        variables?: Parameters<typeof getTranslation>[2],
      ) => getTranslation('en', key, variables),
      usdToKhrExchangeRate: 4000,
    });

    render(
      <MemoryRouter initialEntries={['/catalog']}>
        <InventoryRoute />
      </MemoryRouter>,
    );

    const skuRow = screen.getByRole('link', { name: 'SKU 1' }).closest('div.group');
    expect(skuRow).not.toBeNull();
    expect(loadSenaSkuDetail).not.toHaveBeenCalled();

    fireEvent.click(within(skuRow!).getByRole('button', { name: 'More actions for SKU 1' }));

    await waitFor(() => {
      expect(loadSenaSkuDetail).toHaveBeenCalledWith('sku-1');
    });
    expect(loadSenaSkuDetail).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Record' })).toBeInTheDocument();
  });
});
