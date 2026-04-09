import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SENA_ENGINE_PARAMETERS } from '@shared/ipc';
import { usePreferences, PreferencesProvider } from './preferences';

function PreferencesProbe() {
  const {
    currency,
    hasPendingChanges,
    language,
    persistedCurrency,
    persistedLanguage,
    persistedUsdToKhrExchangeRate,
    persistedShowExplanatoryTooltips,
    persistedShowFloatingTitleActions,
    persistedShowRightRailCards,
    resetPreferences,
    savePreferences,
    setCurrency,
    setLanguage,
    setUsdToKhrExchangeRate,
    setShowExplanatoryTooltips,
    setShowFloatingTitleActions,
    setShowRightRailCards,
    showFloatingTitleActions,
    showRightRailCards,
    showExplanatoryTooltips,
    t,
    usdToKhrExchangeRate,
  } = usePreferences();

  return (
    <div>
      <div data-testid="language">{language}</div>
      <div data-testid="currency">{currency}</div>
      <div data-testid="exchange-rate">{usdToKhrExchangeRate}</div>
      <div data-testid="persisted-language">{persistedLanguage}</div>
      <div data-testid="persisted-currency">{persistedCurrency}</div>
      <div data-testid="persisted-exchange-rate">{persistedUsdToKhrExchangeRate}</div>
      <div data-testid="show-explanatory-tooltips">{String(showExplanatoryTooltips)}</div>
      <div data-testid="persisted-show-explanatory-tooltips">{String(persistedShowExplanatoryTooltips)}</div>
      <div data-testid="show-floating-title-actions">{String(showFloatingTitleActions)}</div>
      <div data-testid="persisted-show-floating-title-actions">{String(persistedShowFloatingTitleActions)}</div>
      <div data-testid="show-right-rail-cards">{String(showRightRailCards)}</div>
      <div data-testid="persisted-show-right-rail-cards">{String(persistedShowRightRailCards)}</div>
      <div data-testid="pending">{String(hasPendingChanges)}</div>
      <div data-testid="translation">{t('settingsTitle')}</div>
      <div data-testid="description-translation">{t('settingsBody')}</div>
      <button type="button" onClick={() => setLanguage('km')}>
        preview-language
      </button>
      <button type="button" onClick={() => setCurrency('KHR')}>
        preview-currency
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
    getPreferences.mockResolvedValue({ language: 'en', currency: 'USD', usdToKhrExchangeRate: 4000, showExplanatoryTooltips: true, showFloatingTitleActions: true, showRightRailCards: true, senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS });
    savePreferences.mockResolvedValue({ language: 'km', currency: 'KHR', usdToKhrExchangeRate: 4100, showExplanatoryTooltips: false, showFloatingTitleActions: false, showRightRailCards: false, senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS });
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

    await waitFor(() => {
      expect(screen.getByTestId('language').textContent).toBe('km');
    });
    expect(screen.getByTestId('currency').textContent).toBe('KHR');
    expect(screen.getByTestId('exchange-rate').textContent).toBe('4100');
    expect(screen.getByTestId('show-explanatory-tooltips').textContent).toBe('false');
    expect(screen.getByTestId('show-floating-title-actions').textContent).toBe('false');
    expect(screen.getByTestId('show-right-rail-cards').textContent).toBe('false');
    expect(screen.getByTestId('pending').textContent).toBe('true');
    expect(screen.getByTestId('translation').textContent).toBe('ការកំណត់');
    expect(screen.getByTestId('description-translation').textContent).toBe(
      'កែប្រែរបៀបដំណើរការក្នុងម៉ាស៊ីន ជំនួយស្រេចចិត្ត និងចំណូលចិត្តសម្រាប់កន្លែងធ្វើការពីទំព័រតែមួយ។',
    );
    expect(savePreferences).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('reset'));
    expect(screen.getByTestId('language').textContent).toBe('en');
    expect(screen.getByTestId('currency').textContent).toBe('USD');
    expect(screen.getByTestId('exchange-rate').textContent).toBe('4000');
    expect(screen.getByTestId('show-explanatory-tooltips').textContent).toBe('true');
    expect(screen.getByTestId('show-floating-title-actions').textContent).toBe('true');
    expect(screen.getByTestId('show-right-rail-cards').textContent).toBe('true');

    fireEvent.click(screen.getByText('preview-language'));
    fireEvent.click(screen.getByText('preview-currency'));
    fireEvent.click(screen.getByText('preview-exchange-rate'));
    fireEvent.click(screen.getByText('hide-explanatory-tooltips'));
    fireEvent.click(screen.getByText('hide-floating-title-actions'));
    fireEvent.click(screen.getByText('hide-right-rail-cards'));
    fireEvent.click(screen.getByText('save'));

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith(expect.objectContaining({
        language: 'km',
        currency: 'KHR',
        usdToKhrExchangeRate: 4100,
        showExplanatoryTooltips: false,
        showFloatingTitleActions: false,
        showRightRailCards: false,
        senaEngineParameters: DEFAULT_SENA_ENGINE_PARAMETERS,
      }));
    });
    expect(screen.getByTestId('persisted-language').textContent).toBe('km');
    expect(screen.getByTestId('persisted-currency').textContent).toBe('KHR');
    expect(screen.getByTestId('persisted-exchange-rate').textContent).toBe('4100');
    expect(screen.getByTestId('persisted-show-explanatory-tooltips').textContent).toBe('false');
    expect(screen.getByTestId('persisted-show-floating-title-actions').textContent).toBe('false');
    expect(screen.getByTestId('persisted-show-right-rail-cards').textContent).toBe('false');
    expect(screen.getByTestId('pending').textContent).toBe('false');
  });
});
