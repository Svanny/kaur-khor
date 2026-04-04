import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
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
        <ToggleGroupItem value="all">All</ToggleGroupItem>
      </ToggleGroup>,
    );

    expect(screen.getByRole('radio', { name: 'All' }).className).toContain(pillHoverClassName);
  });
});
