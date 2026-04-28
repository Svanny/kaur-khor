import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SENA_ENGINE_PARAMETERS } from '@shared/ipc';
import { PreferencesProvider } from '@/state/preferences';
import { OnboardingRoute } from './onboarding';

describe('OnboardingRoute', () => {
  const getPreferences = vi.fn();
  const savePreferences = vi.fn();
  const basePreferences = {
    language: 'en' as const,
    currency: 'USD' as const,
    usdToKhrExchangeRate: 4000,
    displayViewMode: 'custom' as const,
    itemImageMode: 'small' as const,
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
      logOrder: 'ask' as const,
      updateEta: 'ask' as const,
      followUp: 'ask' as const,
      receive: 'ask' as const,
      review: 'ask' as const,
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
  };

  beforeEach(() => {
    getPreferences.mockReset();
    savePreferences.mockReset();
    getPreferences.mockResolvedValue(basePreferences);
    savePreferences.mockImplementation(async (payload) => ({
      ...(await getPreferences()),
      ...payload,
    }));

    window.banjiDesktop = {
      ...window.banjiDesktop,
      preferences: {
        get: getPreferences,
        save: savePreferences,
      },
    };
  });

  function renderRoute(initialEntry = '/onboarding') {
    render(
      <MemoryRouter initialEntries={[initialEntry]}>
        <PreferencesProvider>
          <Routes>
            <Route element={<OnboardingRoute />} path="/onboarding" />
            <Route element={<div>Overview screen</div>} path="/" />
          </Routes>
        </PreferencesProvider>
      </MemoryRouter>,
    );
  }

  it('renders the first-run onboarding form and saves the onboarding defaults', async () => {
    renderRoute();

    expect((await screen.findAllByText('Set up banji')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Welcome').length).toBeGreaterThan(0);
    expect(screen.getByText('abc')).toBeInTheDocument();
    expect(screen.getByText('$')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Currency' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Default View' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Minimal View' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Maximal View' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Custom View' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        language: 'en',
        currency: 'USD',
        displayViewMode: 'default',
        showExplanatoryTooltips: true,
        showFloatingTitleActions: true,
        showRightRailCards: false,
        showOverviewTaskTabs: false,
        showAutomationsPage: false,
        showAnalysisPage: true,
        showPerformanceCompareToggle: false,
        showPerformanceTimelineCard: false,
        showLogsViewToggle: false,
        showHeartbeatRibbons: true,
        onboardingCompletedAt: expect.any(String),
        seenUnlockedNavItems: {
          catalog: false,
        insights: false,
        work: false,
        },
      }));
    });
  });

  it('saves the selected maximal onboarding preset', async () => {
    renderRoute();

    fireEvent.click(await screen.findByRole('radio', { name: 'Maximal View' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        displayViewMode: 'maximal',
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
      }));
    });
  });

  it('redirects completed users back to the main app', async () => {
    getPreferences.mockResolvedValue({
      ...basePreferences,
      onboardingCompletedAt: '2026-04-10T00:00:00.000Z',
      seenUnlockedNavItems: {
        catalog: true,
      insights: true,
      work: true,
      },
    });

    renderRoute();

    expect(await screen.findByText('Overview screen')).toBeInTheDocument();
  });
});
