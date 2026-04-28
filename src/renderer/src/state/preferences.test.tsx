import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SENA_ENGINE_PARAMETERS } from '@shared/ipc';
import { usePreferences, PreferencesProvider } from './preferences';

function PreferencesProbe() {
  const {
    currency,
    displayViewMode,
    dimChartsWhileLoading: showDimChartsWhileLoading,
    hasPendingChanges,
    itemImageMode,
    language,
    persistedCustomShowExplanatoryTooltips,
    persistedCustomShowFloatingTitleActions,
    persistedCustomShowRightRailCards,
    persistedCustomShowOverviewTaskTabs,
    persistedCustomShowAutomationsPage,
    persistedCustomShowAnalysisPage,
    persistedCustomShowPerformanceCompareToggle,
    persistedCustomShowPerformanceTimelineCard,
    persistedCustomShowLogsViewToggle,
    persistedCustomShowHeartbeatRibbons,
    persistedDisplayViewMode,
    persistedDimChartsWhileLoading,
    persistedItemImageMode,
    persistedCurrency,
    persistedLanguage,
    persistedUsdToKhrExchangeRate,
    persistedShowExplanatoryTooltips,
    persistedShowFloatingTitleActions,
    persistedShowRightRailCards,
    persistedShowOverviewTaskTabs,
    persistedShowAutomationsPage,
    persistedShowAnalysisPage,
    persistedShowPerformanceCompareToggle,
    persistedShowPerformanceTimelineCard,
    persistedShowLogsViewToggle,
    persistedShowHeartbeatRibbons,
    customShowExplanatoryTooltips,
    customShowFloatingTitleActions,
    customShowRightRailCards,
    customShowOverviewTaskTabs,
    customShowAutomationsPage,
    customShowAnalysisPage,
    customShowPerformanceCompareToggle,
    customShowPerformanceTimelineCard,
    customShowLogsViewToggle,
    customShowHeartbeatRibbons,
    resetPreferences,
    savePreferences,
    setCurrency,
    setDimChartsWhileLoading,
    setItemImageMode,
    setLanguage,
    setUsdToKhrExchangeRate,
    setShowExplanatoryTooltips,
    setShowFloatingTitleActions,
    setShowRightRailCards,
    setShowOverviewTaskTabs,
    setShowAutomationsPage,
    setShowAnalysisPage,
    setShowPerformanceCompareToggle,
    setShowPerformanceTimelineCard,
    setShowLogsViewToggle,
    setShowHeartbeatRibbons,
    showFloatingTitleActions,
    showOverviewTaskTabs,
    showAutomationsPage,
    showAnalysisPage,
    showPerformanceCompareToggle,
    showPerformanceTimelineCard,
    showLogsViewToggle,
    showHeartbeatRibbons,
    showRightRailCards,
    showExplanatoryTooltips,
    onboardingCompletedAt,
    seenUnlockedNavItems,
    workbenchTileOrderByLane,
    t,
    usdToKhrExchangeRate,
  } = usePreferences();

  return (
    <div>
      <div data-testid="language">{language}</div>
      <div data-testid="currency">{currency}</div>
      <div data-testid="exchange-rate">{usdToKhrExchangeRate}</div>
      <div data-testid="display-view-mode">{displayViewMode}</div>
      <div data-testid="dim-charts-while-loading">{String(showDimChartsWhileLoading)}</div>
      <div data-testid="item-image-mode">{itemImageMode}</div>
      <div data-testid="persisted-language">{persistedLanguage}</div>
      <div data-testid="persisted-currency">{persistedCurrency}</div>
      <div data-testid="persisted-exchange-rate">{persistedUsdToKhrExchangeRate}</div>
      <div data-testid="custom-show-explanatory-tooltips">{String(customShowExplanatoryTooltips)}</div>
      <div data-testid="custom-show-floating-title-actions">{String(customShowFloatingTitleActions)}</div>
      <div data-testid="custom-show-right-rail-cards">{String(customShowRightRailCards)}</div>
      <div data-testid="custom-show-overview-task-tabs">{String(customShowOverviewTaskTabs)}</div>
      <div data-testid="custom-show-automations-page">{String(customShowAutomationsPage)}</div>
      <div data-testid="custom-show-analysis-page">{String(customShowAnalysisPage)}</div>
      <div data-testid="custom-show-performance-compare-toggle">{String(customShowPerformanceCompareToggle)}</div>
      <div data-testid="custom-show-performance-timeline-card">{String(customShowPerformanceTimelineCard)}</div>
      <div data-testid="custom-show-logs-view-toggle">{String(customShowLogsViewToggle)}</div>
      <div data-testid="custom-show-heartbeat-ribbons">{String(customShowHeartbeatRibbons)}</div>
      <div data-testid="persisted-display-view-mode">{persistedDisplayViewMode}</div>
      <div data-testid="persisted-dim-charts-while-loading">{String(persistedDimChartsWhileLoading)}</div>
      <div data-testid="show-explanatory-tooltips">{String(showExplanatoryTooltips)}</div>
      <div data-testid="persisted-show-explanatory-tooltips">{String(persistedShowExplanatoryTooltips)}</div>
      <div data-testid="show-floating-title-actions">{String(showFloatingTitleActions)}</div>
      <div data-testid="persisted-show-floating-title-actions">{String(persistedShowFloatingTitleActions)}</div>
      <div data-testid="show-right-rail-cards">{String(showRightRailCards)}</div>
      <div data-testid="persisted-show-right-rail-cards">{String(persistedShowRightRailCards)}</div>
      <div data-testid="show-overview-task-tabs">{String(showOverviewTaskTabs)}</div>
      <div data-testid="persisted-show-overview-task-tabs">{String(persistedShowOverviewTaskTabs)}</div>
      <div data-testid="show-automations-page">{String(showAutomationsPage)}</div>
      <div data-testid="persisted-show-automations-page">{String(persistedShowAutomationsPage)}</div>
      <div data-testid="show-analysis-page">{String(showAnalysisPage)}</div>
      <div data-testid="persisted-show-analysis-page">{String(persistedShowAnalysisPage)}</div>
      <div data-testid="show-performance-compare-toggle">{String(showPerformanceCompareToggle)}</div>
      <div data-testid="persisted-show-performance-compare-toggle">{String(persistedShowPerformanceCompareToggle)}</div>
      <div data-testid="show-performance-timeline-card">{String(showPerformanceTimelineCard)}</div>
      <div data-testid="persisted-show-performance-timeline-card">{String(persistedShowPerformanceTimelineCard)}</div>
      <div data-testid="show-logs-view-toggle">{String(showLogsViewToggle)}</div>
      <div data-testid="show-heartbeat-ribbons">{String(showHeartbeatRibbons)}</div>
      <div data-testid="persisted-show-logs-view-toggle">{String(persistedShowLogsViewToggle)}</div>
      <div data-testid="persisted-show-heartbeat-ribbons">{String(persistedShowHeartbeatRibbons)}</div>
      <div data-testid="persisted-custom-show-explanatory-tooltips">{String(persistedCustomShowExplanatoryTooltips)}</div>
      <div data-testid="persisted-custom-show-floating-title-actions">{String(persistedCustomShowFloatingTitleActions)}</div>
      <div data-testid="persisted-custom-show-right-rail-cards">{String(persistedCustomShowRightRailCards)}</div>
      <div data-testid="persisted-custom-show-overview-task-tabs">{String(persistedCustomShowOverviewTaskTabs)}</div>
      <div data-testid="persisted-custom-show-automations-page">{String(persistedCustomShowAutomationsPage)}</div>
      <div data-testid="persisted-custom-show-analysis-page">{String(persistedCustomShowAnalysisPage)}</div>
      <div data-testid="persisted-custom-show-performance-compare-toggle">{String(persistedCustomShowPerformanceCompareToggle)}</div>
      <div data-testid="persisted-custom-show-performance-timeline-card">{String(persistedCustomShowPerformanceTimelineCard)}</div>
      <div data-testid="persisted-custom-show-logs-view-toggle">{String(persistedCustomShowLogsViewToggle)}</div>
      <div data-testid="persisted-custom-show-heartbeat-ribbons">{String(persistedCustomShowHeartbeatRibbons)}</div>
      <div data-testid="persisted-item-image-mode">{persistedItemImageMode}</div>
      <div data-testid="onboarding-completed-at">{onboardingCompletedAt ?? 'null'}</div>
      <div data-testid="seen-unlocked-nav-items">{JSON.stringify(seenUnlockedNavItems)}</div>
      <div data-testid="workbench-tile-order-by-lane">{JSON.stringify(workbenchTileOrderByLane)}</div>
      <div data-testid="pending">{String(hasPendingChanges)}</div>
      <div data-testid="translation">{t('settingsTitle')}</div>
      <div data-testid="description-translation">{t('settingsBody')}</div>
      <button type="button" onClick={() => setLanguage('km')}>
        preview-language
      </button>
      <button type="button" onClick={() => setCurrency('KHR')}>
        preview-currency
      </button>
      <button type="button" onClick={() => setItemImageMode('off')}>
        hide-item-pictures
      </button>
      <button type="button" onClick={() => setDimChartsWhileLoading(true)}>
        show-chart-loading-dim
      </button>
      <button type="button" onClick={() => setUsdToKhrExchangeRate(4100)}>
        preview-exchange-rate
      </button>
      <button type="button" onClick={() => setShowExplanatoryTooltips(false)}>
        hide-explanatory-tooltips
      </button>
      <button type="button" onClick={() => setShowFloatingTitleActions(false)}>
        hide-floating-title-actions
      </button>
      <button type="button" onClick={() => setShowRightRailCards(false)}>
        hide-right-rail-cards
      </button>
      <button type="button" onClick={() => setShowOverviewTaskTabs(false)}>
        hide-overview-task-tabs
      </button>
      <button type="button" onClick={() => setShowAutomationsPage(false)}>
        hide-automations-page
      </button>
      <button type="button" onClick={() => setShowAnalysisPage(false)}>
        hide-analysis-page
      </button>
      <button type="button" onClick={() => setShowPerformanceCompareToggle(false)}>
        hide-performance-compare-toggle
      </button>
      <button type="button" onClick={() => setShowPerformanceTimelineCard(false)}>
        hide-performance-timeline-card
      </button>
      <button type="button" onClick={() => setShowLogsViewToggle(false)}>
        hide-logs-view-toggle
      </button>
      <button type="button" onClick={() => setShowHeartbeatRibbons(false)}>
        hide-heartbeat-ribbons
      </button>
      <button type="button" onClick={() => void savePreferences()}>
        save
      </button>
      <button type="button" onClick={resetPreferences}>
        reset
      </button>
    </div>
  );
}

describe('preferences state', () => {
  const getPreferences = vi.fn();
  const savePreferences = vi.fn();

  beforeEach(() => {
    getPreferences.mockReset();
    savePreferences.mockReset();
    getPreferences.mockResolvedValue({
      language: 'en',
      currency: 'USD',
      usdToKhrExchangeRate: 4000,
      displayViewMode: 'custom',
      itemImageMode: 'small',
      dimChartsWhileLoading: false,
      showExplanatoryTooltips: true,
      showFloatingTitleActions: true,
      showRightRailCards: true,
      showOverviewTaskTabs: true,
      showAutomationsPage: true,
      showAnalysisPage: true,
      showPerformanceCompareToggle: true,
      showPerformanceTimelineCard: true,
      showLogsViewToggle: true,
      showHeartbeatRibbons: true,
      taskBatchUpdatePreferences: {
        logOrder: 'ask',
        updateEta: 'ask',
        followUp: 'ask',
        receive: 'ask',
        review: 'ask',
      },
      customShowExplanatoryTooltips: true,
      customShowFloatingTitleActions: true,
      customShowRightRailCards: true,
      customShowOverviewTaskTabs: true,
      customShowAutomationsPage: true,
      customShowAnalysisPage: true,
      customShowPerformanceCompareToggle: true,
      customShowPerformanceTimelineCard: true,
      customShowLogsViewToggle: true,
      customShowHeartbeatRibbons: true,
      senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
      overviewStaleUpdateReminderSnoozeUntil: null,
      onboardingCompletedAt: null,
      seenUnlockedNavItems: {
        catalog: false,
        insights: false,
        work: false,
      },
      workbenchTileOrderByLane: {
        'supplier-order-pending': ['supplier-order:sku-2'],
      },
    });
    savePreferences.mockImplementation(async (payload) => ({
      language: 'km',
      currency: 'KHR',
      usdToKhrExchangeRate: 4100,
      displayViewMode: payload.displayViewMode ?? 'minimal',
      itemImageMode: payload.itemImageMode ?? 'small',
      dimChartsWhileLoading: payload.dimChartsWhileLoading ?? false,
      showExplanatoryTooltips: false,
      showFloatingTitleActions: false,
      showRightRailCards: false,
      showOverviewTaskTabs: false,
      showAutomationsPage: false,
      showAnalysisPage: false,
      showPerformanceCompareToggle: false,
      showPerformanceTimelineCard: false,
      showLogsViewToggle: false,
      showHeartbeatRibbons: false,
      taskBatchUpdatePreferences: {
        logOrder: 'ask',
        updateEta: 'ask',
        followUp: 'ask',
        receive: 'ask',
        review: 'ask',
      },
      customShowExplanatoryTooltips: false,
      customShowFloatingTitleActions: false,
      customShowRightRailCards: false,
      customShowOverviewTaskTabs: false,
      customShowAutomationsPage: false,
      customShowAnalysisPage: false,
      customShowPerformanceCompareToggle: false,
      customShowPerformanceTimelineCard: false,
      customShowLogsViewToggle: false,
      customShowHeartbeatRibbons: false,
      senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
      overviewStaleUpdateReminderSnoozeUntil: null,
      onboardingCompletedAt: payload.onboardingCompletedAt ?? null,
      seenUnlockedNavItems: payload.seenUnlockedNavItems ?? {
        catalog: false,
        insights: false,
        work: false,
      },
      workbenchTileOrderByLane: payload.workbenchTileOrderByLane ?? {
        'supplier-order-pending': ['supplier-order:sku-2'],
      },
    }));
    window.banjiDesktop = {
      ...window.banjiDesktop,
      preferences: {
        get: getPreferences,
        save: savePreferences,
      },
    };
  });

  it('previews language and currency without persisting immediately, then saves and resets against baselines', async () => {
    render(
      <PreferencesProvider>
        <PreferencesProbe />
      </PreferencesProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('language').textContent).toBe('en');
    });
    expect(screen.getByTestId('translation').textContent).toBe('Settings');
    expect(screen.getByTestId('description-translation').textContent).toBe(
      'Adjust local shell behavior, optional help, and workspace preferences from one page.',
    );

    fireEvent.click(screen.getByText('preview-language'));
    fireEvent.click(screen.getByText('preview-currency'));
    fireEvent.click(screen.getByText('preview-exchange-rate'));
    fireEvent.click(screen.getByText('hide-explanatory-tooltips'));
    fireEvent.click(screen.getByText('hide-floating-title-actions'));
    fireEvent.click(screen.getByText('hide-right-rail-cards'));
    fireEvent.click(screen.getByText('hide-overview-task-tabs'));
    fireEvent.click(screen.getByText('hide-automations-page'));
    fireEvent.click(screen.getByText('hide-analysis-page'));
    fireEvent.click(screen.getByText('hide-performance-compare-toggle'));
    fireEvent.click(screen.getByText('hide-performance-timeline-card'));
    fireEvent.click(screen.getByText('hide-logs-view-toggle'));
    fireEvent.click(screen.getByText('hide-heartbeat-ribbons'));

    await waitFor(() => {
      expect(screen.getByTestId('language').textContent).toBe('km');
    });
    expect(screen.getByTestId('currency').textContent).toBe('KHR');
    expect(screen.getByTestId('exchange-rate').textContent).toBe('4100');
    expect(screen.getByTestId('display-view-mode').textContent).toBe('custom');
    expect(screen.getByTestId('dim-charts-while-loading').textContent).toBe('false');
    expect(screen.getByTestId('item-image-mode').textContent).toBe('small');
    expect(screen.getByTestId('show-explanatory-tooltips').textContent).toBe('false');
    expect(screen.getByTestId('show-floating-title-actions').textContent).toBe('false');
    expect(screen.getByTestId('show-right-rail-cards').textContent).toBe('false');
    expect(screen.getByTestId('show-overview-task-tabs').textContent).toBe('false');
    expect(screen.getByTestId('show-automations-page').textContent).toBe('false');
    expect(screen.getByTestId('show-analysis-page').textContent).toBe('true');
    expect(screen.getByTestId('show-performance-compare-toggle').textContent).toBe('false');
    expect(screen.getByTestId('show-performance-timeline-card').textContent).toBe('false');
    expect(screen.getByTestId('show-logs-view-toggle').textContent).toBe('false');
    expect(screen.getByTestId('show-heartbeat-ribbons').textContent).toBe('false');
    expect(screen.getByTestId('custom-show-explanatory-tooltips').textContent).toBe('false');
    expect(screen.getByTestId('custom-show-overview-task-tabs').textContent).toBe('false');
    expect(screen.getByTestId('custom-show-automations-page').textContent).toBe('false');
    expect(screen.getByTestId('custom-show-analysis-page').textContent).toBe('true');
    expect(screen.getByTestId('custom-show-performance-compare-toggle').textContent).toBe('false');
    expect(screen.getByTestId('custom-show-performance-timeline-card').textContent).toBe('false');
    expect(screen.getByTestId('custom-show-logs-view-toggle').textContent).toBe('false');
    expect(screen.getByTestId('custom-show-heartbeat-ribbons').textContent).toBe('false');
    expect(screen.getByTestId('pending').textContent).toBe('true');
    expect(screen.getByTestId('translation').textContent).toBe('ការកំណត់');
    expect(screen.getByTestId('description-translation').textContent).toBe(
      'កែប្រែរបៀបដំណើរការក្នុងម៉ាស៊ីន ជំនួយស្រេចចិត្ត និងចំណូលចិត្តសម្រាប់កន្លែងធ្វើការពីទំព័រតែមួយ។',
    );
    expect(screen.getByTestId('workbench-tile-order-by-lane').textContent).toBe(
      JSON.stringify({ 'supplier-order-pending': ['supplier-order:sku-2'] }),
    );
    expect(savePreferences).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('reset'));
    expect(screen.getByTestId('language').textContent).toBe('en');
    expect(screen.getByTestId('currency').textContent).toBe('USD');
    expect(screen.getByTestId('exchange-rate').textContent).toBe('4000');
    expect(screen.getByTestId('display-view-mode').textContent).toBe('custom');
    expect(screen.getByTestId('dim-charts-while-loading').textContent).toBe('false');
    expect(screen.getByTestId('show-explanatory-tooltips').textContent).toBe('true');
    expect(screen.getByTestId('show-floating-title-actions').textContent).toBe('true');
    expect(screen.getByTestId('show-right-rail-cards').textContent).toBe('true');
    expect(screen.getByTestId('show-overview-task-tabs').textContent).toBe('true');
    expect(screen.getByTestId('show-automations-page').textContent).toBe('true');
    expect(screen.getByTestId('show-analysis-page').textContent).toBe('true');
    expect(screen.getByTestId('show-performance-compare-toggle').textContent).toBe('true');
    expect(screen.getByTestId('show-performance-timeline-card').textContent).toBe('true');
    expect(screen.getByTestId('show-logs-view-toggle').textContent).toBe('true');
    expect(screen.getByTestId('show-heartbeat-ribbons').textContent).toBe('true');
    expect(screen.getByTestId('onboarding-completed-at').textContent).toBe('null');
    expect(screen.getByTestId('seen-unlocked-nav-items').textContent).toBe(
      JSON.stringify({ catalog: false, insights: false, work: false }),
    );
    expect(screen.getByTestId('workbench-tile-order-by-lane').textContent).toBe(
      JSON.stringify({ 'supplier-order-pending': ['supplier-order:sku-2'] }),
    );

    fireEvent.click(screen.getByText('hide-item-pictures'));
    expect(screen.getByTestId('item-image-mode').textContent).toBe('off');
    expect(screen.getByTestId('pending').textContent).toBe('true');

    fireEvent.click(screen.getByText('reset'));
    expect(screen.getByTestId('item-image-mode').textContent).toBe('small');
    expect(screen.getByTestId('pending').textContent).toBe('false');

    fireEvent.click(screen.getByText('preview-language'));
    fireEvent.click(screen.getByText('preview-currency'));
    fireEvent.click(screen.getByText('hide-item-pictures'));
    fireEvent.click(screen.getByText('show-chart-loading-dim'));
    fireEvent.click(screen.getByText('preview-exchange-rate'));
    fireEvent.click(screen.getByText('hide-explanatory-tooltips'));
    fireEvent.click(screen.getByText('hide-floating-title-actions'));
    fireEvent.click(screen.getByText('hide-right-rail-cards'));
    fireEvent.click(screen.getByText('hide-overview-task-tabs'));
    fireEvent.click(screen.getByText('hide-automations-page'));
    fireEvent.click(screen.getByText('hide-analysis-page'));
    fireEvent.click(screen.getByText('hide-performance-compare-toggle'));
    fireEvent.click(screen.getByText('hide-performance-timeline-card'));
    fireEvent.click(screen.getByText('hide-logs-view-toggle'));
    fireEvent.click(screen.getByText('hide-heartbeat-ribbons'));
    fireEvent.click(screen.getByText('save'));

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        language: 'km',
        currency: 'KHR',
        usdToKhrExchangeRate: 4100,
        itemImageMode: 'off',
        dimChartsWhileLoading: true,
        showExplanatoryTooltips: false,
        showFloatingTitleActions: false,
        showRightRailCards: false,
        showOverviewTaskTabs: false,
        showAutomationsPage: false,
        showAnalysisPage: true,
        showPerformanceCompareToggle: false,
        showPerformanceTimelineCard: false,
        showLogsViewToggle: false,
        showHeartbeatRibbons: false,
        senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
      }));
    });
    expect(screen.getByTestId('persisted-language').textContent).toBe('km');
    expect(screen.getByTestId('persisted-currency').textContent).toBe('KHR');
    expect(screen.getByTestId('persisted-exchange-rate').textContent).toBe('4100');
    expect(screen.getByTestId('persisted-display-view-mode').textContent).toBe('custom');
    expect(screen.getByTestId('persisted-item-image-mode').textContent).toBe('off');
    expect(screen.getByTestId('persisted-show-explanatory-tooltips').textContent).toBe('false');
    expect(screen.getByTestId('persisted-show-floating-title-actions').textContent).toBe('false');
    expect(screen.getByTestId('persisted-show-right-rail-cards').textContent).toBe('false');
    expect(screen.getByTestId('persisted-show-overview-task-tabs').textContent).toBe('false');
    expect(screen.getByTestId('persisted-show-automations-page').textContent).toBe('false');
    expect(screen.getByTestId('persisted-show-analysis-page').textContent).toBe('true');
    expect(screen.getByTestId('persisted-show-performance-compare-toggle').textContent).toBe('false');
    expect(screen.getByTestId('persisted-show-performance-timeline-card').textContent).toBe('false');
    expect(screen.getByTestId('persisted-show-logs-view-toggle').textContent).toBe('false');
    expect(screen.getByTestId('persisted-show-heartbeat-ribbons').textContent).toBe('false');
    expect(screen.getByTestId('persisted-custom-show-explanatory-tooltips').textContent).toBe('false');
    expect(screen.getByTestId('persisted-custom-show-overview-task-tabs').textContent).toBe('false');
    expect(screen.getByTestId('persisted-custom-show-automations-page').textContent).toBe('false');
    expect(screen.getByTestId('persisted-custom-show-analysis-page').textContent).toBe('true');
    expect(screen.getByTestId('persisted-custom-show-performance-compare-toggle').textContent).toBe('false');
    expect(screen.getByTestId('persisted-custom-show-performance-timeline-card').textContent).toBe('false');
    expect(screen.getByTestId('persisted-custom-show-logs-view-toggle').textContent).toBe('false');
    expect(screen.getByTestId('persisted-custom-show-heartbeat-ribbons').textContent).toBe('false');
    expect(screen.getByTestId('pending').textContent).toBe('false');
  });
});
