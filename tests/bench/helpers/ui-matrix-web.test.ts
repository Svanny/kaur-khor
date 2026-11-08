import type { Page } from '@playwright/test';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@playwright/test', () => ({
  expect: (locator: { waitFor: (options: { state: string }) => Promise<void>; count: () => number }) => ({
    toBeVisible: () => locator.waitFor({ state: 'visible' }),
    toHaveCount: async (count: number) => expect(locator.count()).toBe(count),
  }),
}));

import { completeEmbeddedOnboardingIfPresent } from '../../ui-matrix/helpers/web';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const originalBridge = window.kaurKhorDesktop;
afterEach(() => {
  window.kaurKhorDesktop = originalBridge;
  document.body.innerText = '';
  window.location.hash = '';
});

function onboardingPage() {
  const preferences = deferred<{ onboardingCompletedAt: string | null }>();
  const rendered = deferred<void>();
  let step = 'loading';
  const getPreferences = vi.fn(() => preferences.promise);
  window.kaurKhorDesktop = {
    preferences: { get: getPreferences },
  } as unknown as typeof window.kaurKhorDesktop;
  const setupHeading = {
    isVisible: vi.fn(async () => step === 'preferences'),
    waitFor: vi.fn(async () => {
      await rendered.promise;
      step = 'preferences';
    }),
    count: () => Number(step === 'preferences'),
  };
  const interfaceHeading = {
    isVisible: vi.fn(async () => step === 'interface'),
    count: () => Number(step === 'interface'),
  };
  const click = vi.fn(async () => {
    if (step === 'preferences') {
      step = 'interface';
      document.body.innerText = 'Choose interface view';
    } else {
      expect(step).toBe('interface');
      step = 'complete';
      document.body.innerText = 'Home';
      window.location.hash = '#/';
    }
  });
  const page = {
    getByRole: (role: string, options: { name: string }) => {
      if (role === 'button') return { click };
      return options.name === 'Set up Kaur Khor' ? setupHeading : interfaceHeading;
    },
    evaluate: async (callback: () => unknown) => callback(),
    waitForFunction: async (callback: () => unknown) => expect(await callback()).toBeTruthy(),
    waitForTimeout: vi.fn(async () => undefined),
  } as unknown as Page;
  return { page, preferences, rendered, getPreferences, setupHeading, click };
}

describe('embedded onboarding readiness', () => {
  it('waits for delayed preferences and setup rendering before completing onboarding', async () => {
    const fixture = onboardingPage();
    let returned = false;
    const completion = completeEmbeddedOnboardingIfPresent(fixture.page).then(() => { returned = true; });

    await vi.waitFor(() => expect(fixture.getPreferences).toHaveBeenCalledOnce());
    expect(returned).toBe(false);
    expect(fixture.click).not.toHaveBeenCalled();
    expect(fixture.setupHeading.waitFor).not.toHaveBeenCalled();

    fixture.preferences.resolve({ onboardingCompletedAt: null });
    await vi.waitFor(() => expect(fixture.setupHeading.waitFor).toHaveBeenCalledWith({ state: 'visible' }));
    expect(returned).toBe(false);
    expect(fixture.click).not.toHaveBeenCalled();

    fixture.rendered.resolve();
    await completion;
    expect(fixture.click).toHaveBeenCalledTimes(2);
    expect(returned).toBe(true);
  });

  it('skips setup promptly when saved preferences confirm onboarding is complete', async () => {
    const fixture = onboardingPage();
    fixture.preferences.resolve({ onboardingCompletedAt: '2026-11-08T00:00:00.000Z' });

    await completeEmbeddedOnboardingIfPresent(fixture.page);

    expect(fixture.getPreferences).toHaveBeenCalledOnce();
    expect(fixture.setupHeading.waitFor).not.toHaveBeenCalled();
    expect(fixture.click).not.toHaveBeenCalled();
  });

  it('does not treat a failed preferences read as completed onboarding', async () => {
    const fixture = onboardingPage();
    const failure = new Error('preferences unavailable');
    fixture.getPreferences.mockRejectedValueOnce(failure);

    await expect(completeEmbeddedOnboardingIfPresent(fixture.page)).rejects.toBe(failure);
    expect(fixture.click).not.toHaveBeenCalled();
  });
});
