import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { InsightsRoute } from './insights';

const preferencesHook = vi.fn();

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

vi.mock('@/lib/page-state-memory', () => ({
  buildRememberedAnalysisHref: () => '/insights/explain',
  buildRememberedFinancialsHref: () => '/insights/money',
  buildRememberedInsightsHref: () => '/insights',
  buildRememberedPerformanceHref: () => '/insights/pressure',
}));

describe('InsightsRoute', () => {
  beforeEach(() => {
    preferencesHook.mockReturnValue({
      language: 'km',
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

    expect(screen.getByText('តម្រូវការ ការគាំទ្រ ពេលវេលា តម្លៃ និងសម្ពាធស្ដារឡើងវិញ។')).toBeInTheDocument();
    expect(screen.getByText('ប្រាក់ចូល ទុនដែលជាប់ និងតម្លៃដែលលេចធ្លាយ។')).toBeInTheDocument();
    expect(screen.getByText('ការពន្យល់លម្អិត ការសង្កេត ភាពងាយខូច និងការកំណត់គំនូសតាង។')).toBeInTheDocument();
    expect(screen.queryByText(/support, timing/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Money in/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Detailed explanation/i)).not.toBeInTheDocument();
  });
});
