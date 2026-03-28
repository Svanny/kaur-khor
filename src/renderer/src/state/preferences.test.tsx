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
    resetPreferences,
    savePreferences,
    setCurrency,
    setLanguage,
    t,
  } = usePreferences();

  return (
    <div>
      <div data-testid="language">{language}</div>
      <div data-testid="currency">{currency}</div>
      <div data-testid="persisted-language">{persistedLanguage}</div>
      <div data-testid="persisted-currency">{persistedCurrency}</div>
      <div data-testid="pending">{String(hasPendingChanges)}</div>
      <div data-testid="translation">{t('settingsTitle')}</div>
      <button type="button" onClick={() => setLanguage('km')}>
        preview-language
      </button>
      <button type="button" onClick={() => setCurrency('KHR')}>
        preview-currency
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
    getPreferences.mockResolvedValue({ language: 'en', currency: 'USD' });
    savePreferences.mockResolvedValue({ language: 'km', currency: 'KHR' });
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

    fireEvent.click(screen.getByText('preview-language'));
    fireEvent.click(screen.getByText('preview-currency'));

    await waitFor(() => {
      expect(screen.getByTestId('language').textContent).toBe('km');
    });
    expect(screen.getByTestId('currency').textContent).toBe('KHR');
    expect(screen.getByTestId('pending').textContent).toBe('true');
    expect(screen.getByTestId('translation').textContent).toBe('ការកំណត់');
    expect(savePreferences).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('reset'));
    expect(screen.getByTestId('language').textContent).toBe('en');
    expect(screen.getByTestId('currency').textContent).toBe('USD');

    fireEvent.click(screen.getByText('preview-language'));
    fireEvent.click(screen.getByText('preview-currency'));
    fireEvent.click(screen.getByText('save'));

    await waitFor(() => {
      expect(savePreferences).toHaveBeenCalledWith({ language: 'km', currency: 'KHR' });
    });
    expect(screen.getByTestId('persisted-language').textContent).toBe('km');
    expect(screen.getByTestId('persisted-currency').textContent).toBe('KHR');
    expect(screen.getByTestId('pending').textContent).toBe('false');
  });
});
