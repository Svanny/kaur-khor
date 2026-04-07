import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import { DescriptionTextVisibilityProvider } from '@/components/system/description-text';
import { PreferencesProvider } from '@/state/preferences';
import { WorkspacePage, WorkspacePanel, WorkspaceTitleCard } from './workspace';
import { headerActionSurfaceClassName } from '@/components/system/floating-title-actions';

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
});
