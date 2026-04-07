import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePreferences, PreferencesProvider } from './preferences';

function PreferencesProbe() {
  const {
    currency,
    hasPendingChanges,
    language,
    persistedCurrency,
    persistedLanguage,
    persistedShowExplanatoryTooltips,
    persistedShowFloatingTitleActions,
    persistedShowRightRailCards,
    resetPreferences,
    savePreferences,
    setCurrency,
    setLanguage,
    setShowExplanatoryTooltips,
    setShowFloatingTitleActions,
    setShowRightRailCards,
    showFloatingTitleActions,
    showRightRailCards,
    showExplanatoryTooltips,
    t,
  } = usePreferences();

  return (
    <div>
      <div data-testid="language">{language}</div>
      <div data-testid="currency">{currency}</div>
      <div data-testid="persisted-language">{persistedLanguage}</div>
      <div data-testid="persisted-currency">{persistedCurrency}</div>
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
    getPreferences.mockResolvedValue({ language: 'en', currency: 'USD', showExplanatoryTooltips: true, showFloatingTitleActions: true, showRightRailCards: true });
    savePreferences.mockResolvedValue({ language: 'km', currency: 'KHR', showExplanatoryTooltips: false, showFloatingTitleActions: false, showRightRailCards: false });
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
      'Preview workspace preferences live, keep advanced model tuning tucked away until needed, and save everything from one page action row.',
    );

    fireEvent.click(screen.getByText('preview-language'));
    fireEvent.click(screen.getByText('preview-currency'));
    fireEvent.click(screen.getByText('hide-explanatory-tooltips'));
    fireEvent.click(screen.getByText('hide-floating-title-actions'));
    fireEvent.click(screen.getByText('hide-right-rail-cards'));

    await waitFor(() => {
      expect(screen.getByTestId('language').textContent).toBe('km');
    });
    expect(screen.getByTestId('currency').textContent).toBe('KHR');
    expect(screen.getByTestId('show-explanatory-tooltips').textContent).toBe('false');
    expect(screen.getByTestId('show-floating-title-actions').textContent).toBe('false');
    expect(screen.getByTestId('show-right-rail-cards').textContent).toBe('false');
    expect(screen.getByTestId('pending').textContent).toBe('true');
    expect(screen.getByTestId('translation').textContent).toBe('ការកំណត់');
    expect(screen.getByTestId('description-translation').textContent).toBe(
      'Preview workspace preferences live, keep advanced model tuning tucked away until needed, and save everything from one page action row.',
    );
    expect(savePreferences).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('reset'));
    expect(screen.getByTestId('language').textContent).toBe('en');
    expect(screen.getByTestId('currency').textContent).toBe('USD');
    expect(screen.getByTestId('show-explanatory-tooltips').textContent).toBe('true');
    expect(screen.getByTestId('show-floating-title-actions').textContent).toBe('true');
    expect(screen.getByTestId('show-right-rail-cards').textContent).toBe('true');

    fireEvent.click(screen.getByText('preview-language'));
    fireEvent.click(screen.getByText('preview-currency'));
    fireEvent.click(screen.getByText('hide-explanatory-tooltips'));
    fireEvent.click(screen.getByText('hide-floating-title-actions'));
    fireEvent.click(screen.getByText('hide-right-rail-cards'));
    fireEvent.click(screen.getByText('save'));

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith({ language: 'km', currency: 'KHR', showExplanatoryTooltips: false, showFloatingTitleActions: false, showRightRailCards: false });
    });
    expect(screen.getByTestId('persisted-language').textContent).toBe('km');
    expect(screen.getByTestId('persisted-currency').textContent).toBe('KHR');
    expect(screen.getByTestId('persisted-show-explanatory-tooltips').textContent).toBe('false');
    expect(screen.getByTestId('persisted-show-floating-title-actions').textContent).toBe('false');
    expect(screen.getByTestId('persisted-show-right-rail-cards').textContent).toBe('false');
    expect(screen.getByTestId('pending').textContent).toBe('false');
  });
});
