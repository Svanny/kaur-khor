import guideSourceKm from '../../../../docs/user-guide.km.md?raw';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { parseHelpContent } from './help-content';
import { HelpRoute } from './help';

const preferencesHook = vi.fn();

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}${location.hash}`}</div>;
}

function translationsFor(language: 'en' | 'km') {
  if (language === 'km') {
    return {
      navHelp: 'ជំនួយ',
      helpPageTitle: 'មគ្គុទ្ទេសក៍អ្នកប្រើប្រាស់',
      helpPageDescriptor: 'រកមើលលំហូរការងារ ការពន្យល់តាមអេក្រង់ ពាក្យសំខាន់ និងសំណួរញឹកញាប់របស់កខ ពីការកំណត់។',
      helpOpenOverviewAction: 'បើកទំព័រដើម',
      helpStartUpdateAction: 'បើកការកត់ត្រា',
      helpSearchAriaLabel: 'ស្វែងរកជំនួយ',
      helpSearchPlaceholder: 'ស្វែងរកមុខងារ លំហូរការងារ ប៊ូតុង ឬសំណួរញឹកញាប់…',
      helpNoMatchesTitle: 'រកមិនឃើញផ្នែកជំនួយដែលត្រូវគ្នា',
      helpNoMatchesDescriptor: 'សាកពាក្យស្វែងរកទូលំទូលាយជាងមុន ឬសម្អាតតម្រងបច្ចុប្បន្ន។',
      helpNoMatchesBody: 'កខរកមិនឃើញផ្នែកជំនួយដែលត្រូវនឹងការស្វែងរករបស់អ្នកទេ។',
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
    helpPageDescriptor: 'Browse Kaur Khor workflows.',
    helpOpenOverviewAction: 'Open Home',
    helpStartUpdateAction: 'Open Capture',
    helpSearchAriaLabel: 'Search help',
    helpSearchPlaceholder: 'Search features, workflows, buttons, or FAQ…',
    helpNoMatchesTitle: 'No matching help sections',
    helpNoMatchesDescriptor: 'Try a broader search term or clear the current help filter.',
    helpNoMatchesBody: 'Kaur Khor could not find a help section matching your search.',
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

function mockIntersectionObserver() {
  let trigger: IntersectionObserverCallback | null = null;
  const observe = vi.fn();
  const disconnect = vi.fn();
  const OriginalIntersectionObserver = window.IntersectionObserver;

  Object.defineProperty(window, 'IntersectionObserver', {
    configurable: true,
    value: vi.fn(function MockIntersectionObserver(callback: IntersectionObserverCallback) {
      trigger = callback;
      return {
        disconnect,
        observe,
        takeRecords: () => [],
        unobserve: vi.fn(),
      };
    }),
  });

  return {
    disconnect,
    observe,
    restore: () => {
      Object.defineProperty(window, 'IntersectionObserver', {
        configurable: true,
        value: OriginalIntersectionObserver,
      });
    },
    triggerVisible: () => {
      if (!trigger) {
        throw new Error('IntersectionObserver was not created');
      }
      trigger([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver);
    },
  };
}

describe('HelpRoute', () => {
  beforeEach(() => {
    vi.useRealTimers();
    mockPreferences();
    window.history.replaceState(null, '', '/');
    Object.defineProperty(window, 'kaurKhorDesktop', {
      configurable: true,
      value: {
        system: {
          openExternalUrl: vi.fn().mockResolvedValue(undefined),
        },
      },
    });
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

    expect(screen.getAllByText('Settings').length).toBeGreaterThan(0);
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
    expect(screen.getAllByText('ការងារ').length).toBeGreaterThan(0);
    expect(screen.getAllByText('សំណួរញឹកញាប់').length).toBeGreaterThan(0);
  });

  test('uses the Khmer overview CTA and descriptor without stale English settings copy', () => {
    mockPreferences('km');

    render(
      <MemoryRouter initialEntries={['/help']}>
        <HelpRoute />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: /បើកទំព័រដើម/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /បើកការកត់ត្រា/ })).toHaveAttribute('href', '/work/capture');
    expect(screen.getByText('រកមើលលំហូរការងារ ការពន្យល់តាមអេក្រង់ ពាក្យសំខាន់ និងសំណួរញឹកញាប់របស់កខ ពីការកំណត់។')).toBeInTheDocument();
  });

  test('keeps visible Khmer help content free of stale English navigation tokens', () => {
    mockPreferences('km');

    const { container } = render(
      <MemoryRouter initialEntries={['/help']}>
        <HelpRoute />
      </MemoryRouter>,
    );

    const visibleText = container.textContent ?? '';
    expect(visibleText).not.toMatch(/\b(?:Work|Settings|Capture|Insights)\b/);
    expect(screen.queryByRole('link', { name: /Capture/ })).not.toBeInTheDocument();
    expect(visibleText.toLowerCase()).not.toContain(['ba', 'nji'].join(''));
  });

  test('searches Khmer help content when Khmer is active', () => {
    mockPreferences('km');

    render(
      <MemoryRouter initialEntries={['/help']}>
        <HelpRoute />
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByRole('searchbox', { name: 'ស្វែងរកជំនួយ' }), {
      target: { value: 'ការកំណត់' },
    });

    expect(screen.getAllByText('ការកំណត់').length).toBeGreaterThan(0);
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

  test('opens the Khmer repository copy through the desktop URL bridge when Khmer is active', () => {
    mockPreferences('km');

    render(
      <MemoryRouter initialEntries={['/help']}>
        <HelpRoute />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'បើកច្បាប់ចម្លងក្នុងឃ្លាំងកូដ' }));

    expect(window.kaurKhorDesktop.system.openExternalUrl).toHaveBeenCalledWith(
      'https://github.com/Svanny/banji/blob/main/docs/user-guide.km.md',
    );
  });

  test('keeps the Khmer guide aligned with the intent-first IA', () => {
    expect(guideSourceKm).toContain('កត់ត្រា');
    expect(guideSourceKm).toContain('ការយល់ដឹង');
    expect(guideSourceKm).not.toMatch(/\b(?:Work|Settings|Capture|Insights)\b/);
    expect(guideSourceKm).toContain('តើគួរបញ្ចូលអ្វីមុន?');
    expect(guideSourceKm).toContain('តើធ្វើដូចម្តេច បើការណែនាំមើលទៅមិនត្រឹមត្រូវ?');
  });

  test('suppresses Khmer table-of-contents headings with variant punctuation', () => {
    const parsed = parseHelpContent(`# មគ្គុទ្ទេសក៍

សេចក្តីផ្តើម

## តារាង​មាតិកា៖

- [ការងារ](#work)
- [ការកំណត់](#settings)

## ការងារ

មាតិកាផ្នែកការងារ។`);

    expect(parsed.intro).toEqual(['សេចក្តីផ្តើម']);
    expect(parsed.sections.map((section) => section.title)).toEqual(['ការងារ']);
    expect(parsed.sections[0]?.blocks).toEqual([{ text: 'មាតិកាផ្នែកការងារ។', type: 'paragraph' }]);
  });

  test('keeps bottom breathing room at the end of the Help page', () => {
    const { container } = render(
      <MemoryRouter initialEntries={['/help']}>
        <HelpRoute />
      </MemoryRouter>,
    );

    expect(container.firstElementChild).toHaveClass('pb-24', 'md:pb-36');
  });

  test('jumps to the matching guide card from the index', () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    render(
      <MemoryRouter initialEntries={['/help']}>
        <>
          <HelpRoute />
          <LocationProbe />
        </>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(screen.getByTestId('location')).toHaveTextContent('/help#settings');
  });

  test('scrolls directly to a subsection before starting the More-link flash', () => {
    const intersectionObserver = mockIntersectionObserver();
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    render(
      <MemoryRouter initialEntries={['/settings/help#automation-intake-request']}>
        <HelpRoute />
      </MemoryRouter>,
    );

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(intersectionObserver.observe).toHaveBeenCalled();
    const target = document.getElementById('automation-intake-request');
    expect(target).toHaveTextContent('Request');
    const highlightedGroup = target?.closest('[data-active-help-subsection="true"]');
    expect(highlightedGroup).toBeNull();

    act(() => {
      intersectionObserver.triggerVisible();
    });

    const delayedHighlightedGroup = target?.closest('[data-active-help-subsection="true"]');
    expect(delayedHighlightedGroup).not.toBeNull();
    expect(delayedHighlightedGroup).not.toHaveClass('px-4');
    expect(delayedHighlightedGroup).not.toHaveClass('py-3');
    expect(delayedHighlightedGroup).not.toHaveClass('text-primary');
    expect(screen.getByTestId('help-subsection-highlight')).toHaveClass('motion-safe:animate-[kaur-khor-attention-flash_1800ms_ease-in-out_1]');
    expect(delayedHighlightedGroup).toHaveTextContent('The Request column summarizes what the customer appears to be asking for');
    expect(intersectionObserver.disconnect).toHaveBeenCalled();
    intersectionObserver.restore();
  });

  test('does not retrigger hash scrolling when filtering help results', () => {
    const intersectionObserver = mockIntersectionObserver();
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    render(
      <MemoryRouter initialEntries={['/settings/help#automation-intake-request']}>
        <HelpRoute />
      </MemoryRouter>,
    );

    expect(scrollIntoView).toHaveBeenCalledTimes(1);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Search help' }), {
      target: { value: 'automation' },
    });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    intersectionObserver.restore();
  });

  test('renders cleaned subsection titles while preserving old More-link anchors', () => {
    render(
      <MemoryRouter initialEntries={['/settings/help']}>
        <HelpRoute />
      </MemoryRouter>,
    );

    expect(document.getElementById('money-band-capital-traps')).not.toBeNull();
    expect(screen.getByRole('heading', { name: "Band's Capital Traps" })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Money Band Capital Traps' })).not.toBeInTheDocument();
  });

  test('clears the More-link subsection highlight after a short reading window', async () => {
    vi.useFakeTimers();
    const intersectionObserver = mockIntersectionObserver();
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    render(
      <MemoryRouter initialEntries={['/settings/help#automation-intake-request']}>
        <HelpRoute />
      </MemoryRouter>,
    );

    const target = document.getElementById('automation-intake-request');
    expect(target?.closest('[data-active-help-subsection="true"]')).toBeNull();

    act(() => {
      intersectionObserver.triggerVisible();
    });

    expect(target?.closest('[data-active-help-subsection="true"]')).not.toBeNull();

    act(() => {
      vi.advanceTimersByTime(1900);
    });

    expect(target?.closest('[data-active-help-subsection="true"]')).toBeNull();
    vi.useRealTimers();
    intersectionObserver.restore();
  });
});
