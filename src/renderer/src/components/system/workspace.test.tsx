import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { WorkspacePanel } from './workspace';

describe('WorkspacePanel', () => {
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
});
