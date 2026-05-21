import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { InsightsRoute } from './insights';

const preferencesHook = vi.fn();

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

vi.mock('@/lib/settings/page-state-memory', () => ({
  buildRememberedAnalysisHref: () => '/insights/explain',
  buildRememberedFinancialsHref: () => '/insights/money',
  buildRememberedInventoryHref: () => '/insights/inventory',
  buildRememberedInsightsHref: () => '/insights',
}));

vi.mock('../inventory/index', () => ({
  InsightsInventoryRoute: () => <div>Inventory workspace</div>,
}));

describe('InsightsRoute', () => {
  beforeEach(() => {
    preferencesHook.mockReturnValue({
      language: 'km',
      showAnalysisPage: true,
    });
  });

  test('renders Khmer card descriptions without mixed English fragments', () => {
    render(
      <MemoryRouter initialEntries={['/insights']}>
        <Routes>
          <Route element={<InsightsRoute />} path="/insights/*" />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('ស្តុកនៅក្នុងដៃ លំហូរចូលចេញ គម្រប ផែនការទំនិញកំពុងមកដល់ និងការព្យាករ។')).toBeInTheDocument();
    expect(screen.getByText('ប្រាក់ចូល ទុនដែលជាប់ និងតម្លៃដែលលេចធ្លាយ។')).toBeInTheDocument();
    expect(screen.getByText('ការពន្យល់លម្អិត ការសង្កេត ភាពងាយខូច និងការកំណត់គំនូសតាង។')).toBeInTheDocument();
    expect(screen.queryByText(/Stock on hand/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Money in/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Detailed explanation/i)).not.toBeInTheDocument();
  });

  test('redirects legacy pressure links to inventory', async () => {
    preferencesHook.mockReturnValue({
      language: 'en',
      showAnalysisPage: true,
    });

    render(
      <MemoryRouter initialEntries={['/insights/pressure?range=7d&scope=skus']}>
        <Routes>
          <Route element={<InsightsRoute />} path="/insights/*" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Inventory workspace')).toBeInTheDocument();
  });

  test.each(['/insights', '/insights/explain'])('redirects %s when analysis is disabled', async (path) => {
    preferencesHook.mockReturnValue({
      language: 'en',
      showAnalysisPage: false,
    });

    render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<InsightsRoute />} path="/insights/*" />
          <Route element={<div>Home route</div>} path="/" />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Home route')).toBeInTheDocument();
    expect(screen.queryByText('Explain')).not.toBeInTheDocument();
  });
});
