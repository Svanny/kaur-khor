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

  test('uses a white selected pill surface', () => {
    render(
      <Toggle aria-label="Standalone toggle" pressed>
        Standalone
      </Toggle>,
    );

    expect(screen.getByRole('button', { name: 'Standalone toggle' }).className).toContain('aria-pressed:bg-white');
    expect(screen.getByRole('button', { name: 'Standalone toggle' }).className).toContain('aria-pressed:hover:bg-white');
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

  test('uses a white selected pill surface', () => {
    render(
      <ToggleGroup aria-label="Scope" type="single" value="all">
        <ToggleGroupItem value="all">
          <EntityLayersIcon data-icon="inline-start" />
          All
        </ToggleGroupItem>
      </ToggleGroup>,
    );

    expect(screen.getByRole('radio', { name: 'All' }).className).toContain('data-[state=on]:bg-white');
    expect(screen.getByRole('radio', { name: 'All' }).className).toContain('data-[state=on]:hover:bg-white');
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
