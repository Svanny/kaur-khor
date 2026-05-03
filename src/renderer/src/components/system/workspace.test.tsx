import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DescriptionTextVisibilityProvider } from '@/components/system/description-text';
import { PreferencesProvider } from '@/state/preferences';
import { EmptyTitle } from '@/components/ui/empty';
import { CardTitle } from '@/components/ui/card';
import { MetricCard, SectionEyebrow, WorkspacePage, WorkspacePageTitle, WorkspacePanel, WorkspaceTitleCard } from './workspace';
import { headerActionSurfaceClassName } from '@/components/system/floating-title-actions';
import { RIGHT_RAIL_ASIDE_CLASS_NAME, rightRailLayoutClassName } from '@/components/system/right-rail-layout';

describe('WorkspacePanel', () => {
  beforeEach(() => {
    window.banjiDesktop = {
      ...window.banjiDesktop,
      preferences: {
        get: vi.fn().mockResolvedValue({
          language: 'en',
          currency: 'USD',
          showExplanatoryTooltips: true,
          showFloatingTitleActions: true,
          showRightRailCards: true,
        }),
        save: vi.fn(),
      },
    };
  });

  test('applies default vertical spacing to stacked content sections', () => {
    render(
      <WorkspacePanel title="Panel title">
        <div>First block</div>
        <div>Second block</div>
      </WorkspacePanel>,
    );

    const firstBlock = screen.getByText('First block');
    const content = firstBlock.parentElement;

    expect(content?.getAttribute('data-slot')).toBe('card-content');
    expect(content?.className).toContain('flex');
    expect(content?.className).toContain('flex-col');
    expect(content?.className).toContain('gap-6');
  });

  test('omits header chrome when title and description are not provided', () => {
    const { container } = render(
      <WorkspacePanel>
        <div>Panel body</div>
      </WorkspacePanel>,
    );

    expect(screen.getByText('Panel body')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="card-header"]')).toBeNull();
  });

  test('keeps header-only panels visible by default', () => {
    render(<WorkspacePanel title="Panel title" />);

    expect(screen.getByText('Panel title')).toBeInTheDocument();
  });

  test('hides header-only panels when empty hiding is enabled', () => {
    const { container } = render(<WorkspacePanel hideWhenEmpty title="Panel title" />);

    expect(container).toBeEmptyDOMElement();
  });

  test('renders description content when forceDescription is enabled', () => {
    render(
      <WorkspacePanel
        description={<div>Visible helper copy</div>}
        forceDescription
        title="Panel title"
      >
        <div>Panel body</div>
      </WorkspacePanel>,
    );

    expect(screen.getByText('Visible helper copy')).toBeInTheDocument();
  });

  test('hides optional hints when optional help is disabled', () => {
    render(
      <DescriptionTextVisibilityProvider visible={false}>
        <WorkspacePanel hint="Optional next step" title="Panel title">
          <div>Panel body</div>
        </WorkspacePanel>
      </DescriptionTextVisibilityProvider>,
    );

    expect(screen.queryByText('Optional next step')).not.toBeInTheDocument();
  });

  test('shows a floating action island when a title card with actions scrolls out of view', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: -12,
      height: 120,
      left: 0,
      right: 800,
      top: -132,
      width: 800,
      x: 0,
      y: -132,
      toJSON: () => ({}),
    } as DOMRect);

    const { container } = render(
      <PreferencesProvider>
        <WorkspaceTitleCard
          actions={<button type="button">Quick action</button>}
          title="Panel title"
        />
      </PreferencesProvider>,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-slot="floating-title-actions"]')).not.toBeNull();
    });
  });

  test('shows a floating action island when a title card only provides floatingActions', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: -12,
      height: 120,
      left: 0,
      right: 800,
      top: -132,
      width: 800,
      x: 0,
      y: -132,
      toJSON: () => ({}),
    } as DOMRect);

    const { container } = render(
      <PreferencesProvider>
        <WorkspaceTitleCard
          floatingActions={<button type="button">Pinned controls</button>}
          title="Panel title"
        >
          <div>Inline hero controls</div>
        </WorkspaceTitleCard>
      </PreferencesProvider>,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-slot="floating-title-actions"]')).not.toBeNull();
    });
  });

  test('updates a floating action island when an embedded scroll container moves', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect')
      .mockReturnValueOnce({
        bottom: 24,
        height: 120,
        left: 0,
        right: 800,
        top: -96,
        width: 800,
        x: 0,
        y: -96,
        toJSON: () => ({}),
      } as DOMRect)
      .mockReturnValue({
        bottom: -12,
        height: 120,
        left: 0,
        right: 800,
        top: -132,
        width: 800,
        x: 0,
        y: -132,
        toJSON: () => ({}),
      } as DOMRect);

    const { container } = render(
      <div data-testid="embedded-scroll-container">
        <PreferencesProvider>
          <WorkspaceTitleCard
            actions={<button type="button">Quick action</button>}
            title="Panel title"
          />
        </PreferencesProvider>
      </div>,
    );

    expect(container.querySelector('[data-slot="floating-title-actions"]')).toBeNull();

    fireEvent.scroll(screen.getByTestId('embedded-scroll-container'));

    await waitFor(() => {
      expect(container.querySelector('[data-slot="floating-title-actions"]')).not.toBeNull();
    });
  });

  test('applies shared header action sizing to title-card and floating action surfaces', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      bottom: -12,
      height: 120,
      left: 0,
      right: 800,
      top: -132,
      width: 800,
      x: 0,
      y: -132,
      toJSON: () => ({}),
    } as DOMRect);

    const { container } = render(
      <PreferencesProvider>
        <WorkspaceTitleCard
          actions={<button data-slot="button" type="button">Quick action</button>}
          title="Panel title"
        />
      </PreferencesProvider>,
    );

    await waitFor(() => {
      expect(container.querySelector('[data-slot="floating-title-actions"]')).not.toBeNull();
    });

    const titleActionSurface = container.querySelector('[data-slot="card-action"]');
    const floatingActionSurface = container.querySelector('[data-slot="floating-title-actions"] > div > div');

    expect(titleActionSurface?.className).toContain(headerActionSurfaceClassName);
    expect(floatingActionSurface?.className).toContain(headerActionSurfaceClassName);
  });

  test('marks title-card eyebrow and display title as Khmer-safe typography surfaces', async () => {
    const { container } = render(
      <PreferencesProvider>
        <WorkspaceTitleCard
          descriptor="Start with the next operational decision."
          eyebrow="ទំព័រដើម"
          title="ទំព័រដើមបញ្ជា"
        />
      </PreferencesProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('ទំព័រដើម').className).toContain('khmer-safe-eyebrow');
    });

    const title = screen.getByText('ទំព័រដើមបញ្ជា');
    expect(title.className).toContain('khmer-safe-display');
    expect(title.className).toContain('font-semibold');
    expect(container.querySelector('[data-slot="card-description"]')).not.toBeNull();
  });

  test('marks shared workspace headings and labels as Khmer-safe typography surfaces', () => {
    render(
      <>
        <WorkspacePageTitle>ទំព័រដើមបញ្ជា</WorkspacePageTitle>
        <MetricCard label="កាតាឡុក" value="ធាតុ 1" />
        <SectionEyebrow>សកម្មភាពបន្ទាប់</SectionEyebrow>
      </>,
    );

    expect(screen.getByText('ទំព័រដើមបញ្ជា').className).toContain('khmer-safe-display');
    expect(screen.getByText('កាតាឡុក').className).toContain('khmer-safe-label');
    expect(screen.getByText('ធាតុ 1').className).toContain('khmer-safe-display');
    expect(screen.getByText('សកម្មភាពបន្ទាប់').className).toContain('khmer-safe-label');
  });

  test('marks shared card and empty-state titles as Khmer-safe display surfaces', () => {
    render(
      <>
        <CardTitle>ចំណងជើងកាត</CardTitle>
        <EmptyTitle>គ្មានលទ្ធផល</EmptyTitle>
      </>,
    );

    expect(screen.getByText('ចំណងជើងកាត').className).toContain('khmer-safe-display');
    expect(screen.getByText('គ្មានលទ្ធផល').className).toContain('khmer-safe-display');
  });

  test('adds bottom safe-area spacing when floating title actions are enabled', async () => {
    render(
      <PreferencesProvider>
        <WorkspacePage>
          <div>Page body</div>
        </WorkspacePage>
      </PreferencesProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Page body').parentElement?.className).toContain('pb-32');
    });
  });

  test('joins the flex height chain when fitViewport is enabled', async () => {
    render(
      <PreferencesProvider>
        <WorkspacePage fitViewport>
          <div>Page body</div>
        </WorkspacePage>
      </PreferencesProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Page body').parentElement?.className).toContain('min-h-0');
    });
    expect(screen.getByText('Page body').parentElement?.className).toContain('flex-1');
    expect(screen.getByText('Page body').parentElement?.className).toContain('w-full');
  });

  test('keeps shared right-rail layouts content-sized by default', () => {
    const layoutClassName = rightRailLayoutClassName(true);

    expect(layoutClassName).toContain('lg:grid-cols-[minmax(0,1fr)_320px]');
    expect(layoutClassName).not.toContain('flex-1');
    expect(layoutClassName).not.toContain('h-full');
    expect(RIGHT_RAIL_ASIDE_CLASS_NAME).toContain('lg:sticky');
    expect(RIGHT_RAIL_ASIDE_CLASS_NAME).toContain('lg:self-start');
    expect(RIGHT_RAIL_ASIDE_CLASS_NAME).not.toContain('lg:h-full');
  });
});
