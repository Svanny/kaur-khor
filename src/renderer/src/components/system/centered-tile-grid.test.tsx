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
    expect(grid).toHaveStyle({ '--centered-tile-gap': '1.5rem' });
    expect(grid).toHaveStyle({ '--centered-tile-padding': '1rem' });
    expect(grid).toHaveStyle({ containerType: 'size' });
    expect(grid).toHaveStyle({
      '--hub-tile-size': 'min(22rem, calc((100cqw - 1 * var(--centered-tile-gap)) / 2), calc((100cqh - 1 * var(--centered-tile-gap)) / 2))',
    });
  });
});
