import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { detailPanelGridClassName, MeasuredPagedDetailPanel, PagedEvidenceTimelinePanel } from './detail-panels';

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    t: (key: string) => key,
  }),
}));

describe('detail panels', () => {
  test('stretches a single visible detail panel and splits multiple panels', () => {
    expect(detailPanelGridClassName(1)).toBe('grid gap-6');
    expect(detailPanelGridClassName(2)).toBe('grid gap-6 xl:grid-cols-2');
  });

  test('hides measured panels when there are no items', () => {
    const { container } = render(
      <MeasuredPagedDetailPanel
        helpHref="/help"
        items={[]}
        title="Dependency impact"
        tooltip="Dependency impact details"
        renderItem={(item: string) => <div>{item}</div>}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  test('renders measured panels when items are present', () => {
    render(
      <MeasuredPagedDetailPanel
        helpHref="/help"
        items={['Linked service']}
        title="Dependency impact"
        tooltip="Dependency impact details"
        renderItem={(item) => <div>{item}</div>}
      />,
    );

    expect(screen.getByRole('heading', { name: /Dependency impact/ })).toBeInTheDocument();
    expect(screen.getByText('Linked service')).toBeInTheDocument();
  });

  test('hides evidence panels when there are no items and no empty state', () => {
    const { container } = render(
      <PagedEvidenceTimelinePanel
        helpHref="/help"
        items={[]}
        title="Evidence timeline"
        tooltip="Evidence timeline details"
        renderItem={(item: string) => <div>{item}</div>}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });

  test('renders evidence panel empty-state copy as meaningful content', () => {
    render(
      <PagedEvidenceTimelinePanel
        emptyState={<div>No evidence yet</div>}
        helpHref="/help"
        items={[]}
        title="Evidence timeline"
        tooltip="Evidence timeline details"
        renderItem={(item: string) => <div>{item}</div>}
      />,
    );

    expect(screen.getByRole('heading', { name: /Evidence timeline/ })).toBeInTheDocument();
    expect(screen.getByText('No evidence yet')).toBeInTheDocument();
  });
});
