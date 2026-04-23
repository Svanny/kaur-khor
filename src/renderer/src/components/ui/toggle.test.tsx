import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { EntityLayersIcon } from '@icons/entities';
import { pillHoverClassName } from '@/lib/interactive-surface';
import { Toggle } from './toggle';
import { ToggleGroup, ToggleGroupItem } from './toggle-group';

describe('Toggle', () => {
  test('uses the shared pill hover styling', () => {
    render(<Toggle aria-label="Standalone toggle">Standalone</Toggle>);

    expect(screen.getByRole('button', { name: 'Standalone toggle' }).className).toContain(pillHoverClassName);
  });
});

describe('ToggleGroupItem', () => {
  test('inherits the shared pill hover styling from the toggle primitive', () => {
    render(
      <ToggleGroup aria-label="Scope" type="single">
        <ToggleGroupItem value="all">
          <EntityLayersIcon data-icon="inline-start" />
          All
        </ToggleGroupItem>
      </ToggleGroup>,
    );

    expect(screen.getByRole('radio', { name: 'All' }).className).toContain(pillHoverClassName);
  });

  test('renders inline icons for visible-label toggle pills', () => {
    render(
      <ToggleGroup aria-label="Scope" type="single">
        <ToggleGroupItem value="all">
          <EntityLayersIcon data-icon="inline-start" />
          All
        </ToggleGroupItem>
      </ToggleGroup>,
    );

    expect(screen.getByRole('radio', { name: 'All' }).querySelector('svg')).not.toBeNull();
  });

  test('can opt out of the selected shadow without changing the shared default', () => {
    const { rerender } = render(
      <ToggleGroup aria-label="Scope" type="single" value="all">
        <ToggleGroupItem value="all">
          <EntityLayersIcon data-icon="inline-start" />
          All
        </ToggleGroupItem>
      </ToggleGroup>,
    );

    expect(screen.getByRole('radio', { name: 'All' }).className).not.toContain('data-[state=on]:shadow-none');

    rerender(
      <ToggleGroup aria-label="Scope" type="single" value="all">
        <ToggleGroupItem disableSelectedShadow value="all">
          <EntityLayersIcon data-icon="inline-start" />
          All
        </ToggleGroupItem>
      </ToggleGroup>,
    );

    expect(screen.getByRole('radio', { name: 'All' }).className).toContain('data-[state=on]:shadow-none');
    expect(screen.getByRole('radio', { name: 'All' }).className).toContain('data-[state=on]:hover:shadow-none');
  });

  test('can opt out of the shared hover surface for custom tile content', () => {
    render(
      <ToggleGroup aria-label="Scope" type="single">
        <ToggleGroupItem disableHoverSurface value="all">
          <EntityLayersIcon data-icon="inline-start" />
          All
        </ToggleGroupItem>
      </ToggleGroup>,
    );

    expect(screen.getByRole('radio', { name: 'All' }).className).toContain('hover:bg-transparent');
    expect(screen.getByRole('radio', { name: 'All' }).className).toContain('hover:shadow-none');
  });
});
