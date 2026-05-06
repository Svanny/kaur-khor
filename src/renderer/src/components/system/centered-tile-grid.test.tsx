import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { CenteredTileGrid } from './centered-tile-grid';

describe('CenteredTileGrid', () => {
  test('sizes a two-by-two command grid from the available area on first paint', () => {
    render(
      <CenteredTileGrid className="test-host" gapRem={1.5}>
        <div>One</div>
        <div>Two</div>
        <div>Three</div>
        <div>Four</div>
      </CenteredTileGrid>,
    );

    const grid = screen.getByText('One').parentElement?.parentElement;
    expect(grid).toHaveAttribute('data-slot', 'centered-tile-grid');
    expect(grid).toHaveAttribute('data-centered-tile-rows', '2');
    expect(grid).toHaveClass('flex', 'items-center', 'justify-center');
    expect(grid).toHaveStyle({ '--centered-tile-gap': '1.5rem' });
    expect(grid).toHaveStyle({ '--centered-tile-padding': '1rem' });
    expect(grid).toHaveStyle({ '--centered-tile-min-size': '12rem' });
    expect(grid).toHaveStyle({ '--centered-tile-max-size': '22rem' });
    expect(grid).toHaveStyle({ '--centered-grid-max-inline-size': 'calc(2 * var(--centered-tile-max-size) + 1 * var(--centered-tile-gap))' });
    expect(grid).toHaveStyle({ '--centered-grid-max-block-size': 'calc(2 * var(--centered-tile-max-size) + 1 * var(--centered-tile-gap))' });
    expect(grid).toHaveStyle({
      '--hub-tile-size': 'var(--centered-tile-max-size)',
    });
    expect(screen.getByText('One').parentElement).toHaveAttribute('data-slot', 'centered-tile-grid-inner');
    expect(screen.getByText('One').parentElement?.className).toContain('grid');
    expect(screen.getByText('One').parentElement).toHaveStyle({
      gridAutoRows: 'var(--hub-tile-size)',
      gridTemplateColumns: 'repeat(var(--centered-tile-columns), var(--hub-tile-size))',
      height: 'fit-content',
      maxHeight: 'min(100%, var(--centered-grid-max-block-size))',
      maxWidth: 'var(--centered-grid-max-inline-size)',
      width: 'fit-content',
    });
  });
});
