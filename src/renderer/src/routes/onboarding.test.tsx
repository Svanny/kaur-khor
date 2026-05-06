import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SENA_ENGINE_PARAMETERS } from '@shared/ipc';
import { PreferencesProvider } from '@/state/preferences';
import { OnboardingRoute } from './onboarding';

describe('OnboardingRoute', () => {
  const originalMatchMedia = window.matchMedia;
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

    window.kaurKhorDesktop = {
      ...window.kaurKhorDesktop,
      preferences: {
        get: getPreferences,
        save: savePreferences,
      },
    };
  });

  afterEach(() => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: originalMatchMedia,
    });
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

    expect((await screen.findAllByText('Set up Kaur Khor')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Welcome').length).toBeGreaterThan(0);
    expect(screen.getByText('abc')).toBeInTheDocument();
    expect(screen.getByText('$')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Currency' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(savePreferences).not.toHaveBeenCalled();
    expect(await screen.findByText('Choose interface view')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Default View' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Minimal View' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Maximal View' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Custom View' })).not.toBeInTheDocument();

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

    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
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

  it('shows an alert and lets users retry when onboarding preferences fail to save', async () => {
    savePreferences.mockRejectedValueOnce(new Error('disk full'));

    renderRoute();

    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Could not save setup. Check the app connection and try again.',
    );
    expect(screen.queryByText('Overview screen')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeEnabled();

    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));

    expect(await screen.findByText('Overview screen')).toBeInTheDocument();
    expect(savePreferences).toHaveBeenCalledTimes(2);
  });

  it('returns to the preferences step when back is clicked on the interface step', async () => {
    renderRoute();

    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));
    expect(await screen.findByRole('button', { name: 'Back' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(savePreferences).not.toHaveBeenCalled();
    expect(await screen.findByRole('combobox', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Currency' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Default View' })).not.toBeInTheDocument();
  });

  it('preserves unsaved language and currency selections when returning from interface setup', async () => {
    renderRoute();

    fireEvent.click(await screen.findByRole('combobox', { name: 'Language' }));
    fireEvent.click(screen.getByRole('option', { name: /Khmer/ }));
    fireEvent.click(screen.getByRole('combobox', { name: 'រូបិយប័ណ្ណ' }));
    fireEvent.click(screen.getByRole('option', { name: /KHR/ }));
    fireEvent.click(screen.getByRole('button', { name: 'បន្ត' }));

    fireEvent.click(await screen.findByRole('button', { name: 'ត្រឡប់ក្រោយ' }));

    expect(savePreferences).not.toHaveBeenCalled();
    expect(await screen.findByRole('combobox', { name: 'ភាសា' })).toHaveTextContent('ខ្មែរ');
    expect(screen.getByRole('combobox', { name: 'រូបិយប័ណ្ណ' })).toHaveTextContent('KHR');
  });

  it('renders Khmer interface view cards for Khmer onboarding', async () => {
    getPreferences.mockResolvedValue({
      ...basePreferences,
      language: 'km',
    });

    renderRoute();

    fireEvent.click(await screen.findByRole('button', { name: 'បន្ត' }));

    expect(await screen.findByRole('heading', { name: 'ជ្រើសរើសទិដ្ឋភាពចំណុចប្រទាក់' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Choose interface view' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ត្រឡប់ក្រោយ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'បន្ត' })).toBeInTheDocument();
    expect(await screen.findByRole('radio', { name: 'ទិដ្ឋភាពលំនាំដើម' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'ទិដ្ឋភាពសាមញ្ញ' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'ទិដ្ឋភាពពេញលេញ' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'ទិដ្ឋភាពផ្ទាល់ខ្លួន' })).not.toBeInTheDocument();
  });

  it('uses corrected Khmer onboarding copy for controls and brand spacing', async () => {
    getPreferences.mockResolvedValue({
      ...basePreferences,
      language: 'km',
    });

    renderRoute();

    expect(await screen.findByText('រៀបចំ កខ')).toBeInTheDocument();
    expect(screen.getByText('ជ្រើសរើសភាសា និងរូបិយប័ណ្ណមូលដ្ឋានជាមុនសិន។ អ្នកអាចកែសម្រួលការគ្រប់គ្រងនីមួយៗនៅពេលក្រោយក្នុងការកំណត់។')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'រៀបចំ កខ' })).not.toHaveClass('tracking-[-0.05em]');
    expect(screen.queryByText(/ប៊ូតុងនីមួយៗ/)).not.toBeInTheDocument();
    expect(screen.queryByText(/រៀបចំកខ/)).not.toBeInTheDocument();
  });

  it('localizes Khmer preference combobox names and option labels', async () => {
    getPreferences.mockResolvedValue({
      ...basePreferences,
      language: 'km',
    });

    renderRoute();

    const languageCombobox = await screen.findByRole('combobox', { name: 'ភាសា' });
    expect(languageCombobox).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'រូបិយប័ណ្ណ' })).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Language' })).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Currency' })).not.toBeInTheDocument();

    fireEvent.click(languageCombobox);

    expect(screen.getByRole('option', { name: /អង់គ្លេស/ })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /ខ្មែរ/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /English/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Khmer/ })).not.toBeInTheDocument();
    expect(screen.queryByText('abc')).not.toBeInTheDocument();
    expect(screen.getByText('អង់')).not.toHaveClass('font-mono', 'uppercase', 'tracking-[0.18em]');
  });

  it('renders full-height onboarding wireframes without scaled-down previews', async () => {
    renderRoute();

    fireEvent.click(await screen.findByRole('button', { name: 'Continue' }));

    for (const wireframe of screen.getAllByTestId('interface-view-wireframe')) {
      expect(wireframe).not.toHaveAttribute('style');
      expect(wireframe.firstElementChild).not.toHaveAttribute('style');
    }
  });

  it('renders stable onboarding copy when reduced motion is requested', async () => {
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      writable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        media: '(prefers-reduced-motion: reduce)',
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    });

    renderRoute();

    expect(await screen.findByRole('heading', { name: 'Set up Kaur Khor' })).toBeInTheDocument();
    expect(screen.getByText('Welcome')).toBeInTheDocument();
    expect(document.querySelector('[style*="kaur-khor-onboarding-copy"]')).not.toBeInTheDocument();
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
