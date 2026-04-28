import guideSourceKm from '../../../../docs/user-guide.km.md?raw';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { HelpRoute } from './help';

const preferencesHook = vi.fn();

function translationsFor(language: 'en' | 'km') {
  if (language === 'km') {
    return {
      navHelp: 'ជំនួយ',
      helpPageTitle: 'មគ្គុទ្ទេសក៍អ្នកប្រើប្រាស់',
      helpPageDescriptor: 'រកមើលលំហូរការងារ និងសំណួរញឹកញាប់របស់ banji ពីទំព័រជំនួយតែមួយ។',
      helpOpenOverviewAction: 'បើក Home',
      helpStartUpdateAction: 'បើក Capture',
      helpSearchAriaLabel: 'ស្វែងរកជំនួយ',
      helpSearchPlaceholder: 'ស្វែងរកមុខងារ លំហូរការងារ ប៊ូតុង ឬសំណួរញឹកញាប់…',
      helpNoMatchesTitle: 'រកមិនឃើញផ្នែកជំនួយដែលត្រូវគ្នា',
      helpNoMatchesDescriptor: 'សាកពាក្យស្វែងរកទូលំទូលាយជាងមុន ឬសម្អាតតម្រងបច្ចុប្បន្ន។',
      helpNoMatchesBody: 'banji រកមិនឃើញផ្នែកជំនួយដែលត្រូវនឹងការស្វែងរករបស់អ្នកទេ។',
      helpClearSearchAction: 'សម្អាតការស្វែងរក',
      helpBestMatchBadge: 'ត្រូវគ្នាបំផុត',
      helpIndexTitle: 'មាតិកា',
      helpIndexDescriptor: 'លោតទៅផ្នែកដែលអ្នកត្រូវការភ្លាមៗ។',
      helpIndexAriaLabel: 'ផ្នែកជំនួយ',
      helpIndexBestBadge: 'ល្អបំផុត',
      helpMoreTitle: 'ជំនួយបន្ថែម',
      helpMoreDescriptor: 'មគ្គុទ្ទេសក៍ក្នុងឃ្លាំងកូដ ត្រូវគ្នាជាមួយទំព័រនេះ។',
      helpOpenRepositoryCopy: 'បើកច្បាប់ចម្លងក្នុងឃ្លាំងកូដ',
    };
  }

  return {
    navHelp: 'Help',
    helpPageTitle: 'User Guide',
    helpPageDescriptor: 'Browse banji workflows.',
    helpOpenOverviewAction: 'Open Home',
    helpStartUpdateAction: 'Open Capture',
    helpSearchAriaLabel: 'Search help',
    helpSearchPlaceholder: 'Search features, workflows, buttons, or FAQ…',
    helpNoMatchesTitle: 'No matching help sections',
    helpNoMatchesDescriptor: 'Try a broader search term or clear the current help filter.',
    helpNoMatchesBody: 'banji could not find a help section matching your search.',
    helpClearSearchAction: 'Clear search',
    helpBestMatchBadge: 'Best match',
    helpIndexTitle: 'Index',
    helpIndexDescriptor: 'Jump straight to the part of the guide you need.',
    helpIndexAriaLabel: 'Help sections',
    helpIndexBestBadge: 'Best',
    helpMoreTitle: 'More help',
    helpMoreDescriptor: 'The repository guide stays in sync with this in-app page.',
    helpOpenRepositoryCopy: 'Open repository copy',
  };
}

function mockPreferences(language: 'en' | 'km' = 'en') {
  const translations = translationsFor(language);
  preferencesHook.mockReturnValue({
    language,
    showFloatingTitleActions: false,
    t: (key: string) => translations[key as keyof typeof translations] ?? key,
  });
}

vi.mock('@/state/preferences', () => ({
  usePreferences: () => preferencesHook(),
}));

describe('HelpRoute', () => {
  beforeEach(() => {
    mockPreferences();
    window.history.replaceState(null, '', '/');
  });

  test('filters help sections from the page search bar', () => {
    render(
      <MemoryRouter initialEntries={['/help']}>
        <HelpRoute />
      </MemoryRouter>,
    );

    expect(screen.getAllByText('Work').length).toBeGreaterThan(0);
    expect(screen.getAllByText('FAQ').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search help' }), {
      target: { value: 'local data' },
    });

    expect(screen.getAllByText('Settings And Help').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Work')).toHaveLength(0);
    expect(screen.getByTestId('help-best-match-badge')).toBeInTheDocument();
  });

  test('highlights the best matched help section for fuzzy results', () => {
    render(
      <MemoryRouter initialEntries={['/help']}>
        <HelpRoute />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search help' }), {
      target: { value: 'work' },
    });

    expect(screen.getAllByText('Work').length).toBeGreaterThan(0);
    expect(screen.getByTestId('help-best-match-badge').closest('[data-slot="card"]')).toHaveTextContent('Work');
  });

  test('loads the Khmer guide when the app language is Khmer', () => {
    mockPreferences('km');

    render(
      <MemoryRouter initialEntries={['/help']}>
        <HelpRoute />
      </MemoryRouter>,
    );

    expect(screen.getByText('មគ្គុទ្ទេសក៍អ្នកប្រើប្រាស់')).toBeInTheDocument();
    expect(screen.getAllByText('Work').length).toBeGreaterThan(0);
    expect(screen.getAllByText('សំណួរញឹកញាប់').length).toBeGreaterThan(0);
  });

  test('searches Khmer help content when Khmer is active', () => {
    mockPreferences('km');

    render(
      <MemoryRouter initialEntries={['/help']}>
        <HelpRoute />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'ស្វែងរកជំនួយ' }), {
      target: { value: 'Settings' },
    });

    expect(screen.getAllByText('Settings និង Help').length).toBeGreaterThan(0);
    expect(screen.getByTestId('help-best-match-badge')).toBeInTheDocument();
  });

  test('shows the Khmer empty state when no Khmer help section matches the query', () => {
    mockPreferences('km');

    render(
      <MemoryRouter initialEntries={['/help']}>
        <HelpRoute />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'ស្វែងរកជំនួយ' }), {
      target: { value: 'គ្មានលទ្ធផល-zzz' },
    });

    expect(screen.getByText('រកមិនឃើញផ្នែកជំនួយដែលត្រូវគ្នា')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'សម្អាតការស្វែងរក' })).toBeInTheDocument();
  });

  test('shows an empty state when no help section matches the query', () => {
    render(
      <MemoryRouter initialEntries={['/help']}>
        <HelpRoute />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search help' }), {
      target: { value: 'zzzz-no-match' },
    });

    expect(screen.getByText('No matching help sections')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear search' })).toBeInTheDocument();
  });

  test('opens the Khmer repository copy when Khmer is active', () => {
    mockPreferences('km');

    render(
      <MemoryRouter initialEntries={['/help']}>
        <HelpRoute />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'បើកច្បាប់ចម្លងក្នុងឃ្លាំងកូដ' })).toHaveAttribute(
      'href',
      'https://github.com/Svanny/banji/blob/main/docs/user-guide.km.md',
    );
  });

  test('keeps the Khmer guide aligned with the intent-first IA', () => {
    expect(guideSourceKm).toContain('Home');
    expect(guideSourceKm).toContain('Work');
    expect(guideSourceKm).toContain('Capture');
    expect(guideSourceKm).toContain('Insights');
    expect(guideSourceKm).toContain('History');
    expect(guideSourceKm).toContain('Archive ឥឡូវនេះគឺ archived status នៅក្នុង **Catalog**');
  });

  test('jumps to the matching guide card from the index', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    render(
      <MemoryRouter initialEntries={['/help']}>
        <HelpRoute />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Settings And Help' }));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(window.location.href).toContain('/#settings-and-help');
  });
});
