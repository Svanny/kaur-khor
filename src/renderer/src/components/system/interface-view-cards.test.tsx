import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InterfaceViewModeCards } from './interface-view-cards';

describe('InterfaceViewModeCards', () => {
  const baseProps = {
    displayViewMode: 'default' as const,
    onDisplayViewModeChange: vi.fn(),
  };

  it('centers a single mode in a 1x1 grid', () => {
    render(<InterfaceViewModeCards {...baseProps} modes={['default']} />);
    const container = screen.getByRole('radiogroup');
    expect(container.className).toContain('justify-center');
    expect(container.className).toContain('grid-cols-[minmax(0,23rem)]');
  });

  it('centers three modes in a 1x3 grid at sm and above', () => {
    render(
      <InterfaceViewModeCards {...baseProps} modes={['default', 'minimal', 'maximal']} />,
    );
    const container = screen.getByRole('radiogroup');
    expect(container.className).toContain('justify-center');
    expect(container.className).toContain('grid-cols-[minmax(0,23rem)]');
    expect(container.className).toContain('sm:grid-cols-[repeat(3,minmax(0,23rem))]');
  });

  it('centers four modes in a 2x2 grid across breakpoints', () => {
    render(
      <InterfaceViewModeCards
        {...baseProps}
        modes={['default', 'minimal', 'maximal', 'custom']}
      />,
    );
    const container = screen.getByRole('radiogroup');
    expect(container.className).toContain('justify-center');
    expect(container.className).toContain('grid-cols-[minmax(0,23rem)]');
    expect(container.className).toContain('sm:grid-cols-[repeat(2,minmax(0,23rem))]');
    expect(container.className).not.toContain('xl:grid-cols-[repeat(4,minmax(0,23rem))]');
  });
});
