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

  it('centers four modes in a 1x4 grid at sm and above', () => {
    render(
      <InterfaceViewModeCards
        {...baseProps}
        modes={['default', 'minimal', 'maximal', 'custom']}
      />,
    );
    const container = screen.getByRole('radiogroup');
    expect(container.className).toContain('justify-center');
    expect(container.className).toContain('grid-cols-[minmax(0,23rem)]');
    expect(container.className).toContain('sm:grid-cols-[repeat(4,minmax(0,23rem))]');
  });

  it('marks Khmer mode labels as Khmer-safe display text', () => {
    render(
      <InterfaceViewModeCards
        {...baseProps}
        language="km"
        modes={['default']}
      />,
    );

    expect(screen.getByText('ទិដ្ឋភាពលំនាំដើម').parentElement?.className).toContain('khmer-safe-display');
  });

  it('renders Khmer accessible labels and card descriptions without English mode copy', () => {
    render(
      <InterfaceViewModeCards
        {...baseProps}
        language="km"
        modes={['default', 'minimal', 'maximal', 'custom']}
      />,
    );

    expect(screen.getByRole('radiogroup', { name: 'របៀបទិដ្ឋភាពបង្ហាញ' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'ទិដ្ឋភាពលំនាំដើម' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'ទិដ្ឋភាពសាមញ្ញ' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'ទិដ្ឋភាពពេញលេញ' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'ទិដ្ឋភាពផ្ទាល់ខ្លួន' })).toBeInTheDocument();
    expect(screen.getByText('រក្សាការណែនាំ សកម្មភាពអណ្តែត និងសញ្ញាស្ថានភាពឱ្យមើលឃើញ។').className)
      .toContain('khmer-safe');

    expect(screen.queryByRole('radiogroup', { name: 'Display view mode' })).not.toBeInTheDocument();
    expect(screen.queryByText('Default View')).not.toBeInTheDocument();
    expect(screen.queryByText('Minimal View')).not.toBeInTheDocument();
    expect(screen.queryByText('Maximal View')).not.toBeInTheDocument();
    expect(screen.queryByText('Custom View')).not.toBeInTheDocument();
    expect(screen.queryByText('Guidance, floating actions, and status signals stay visible.')).not.toBeInTheDocument();
    expect(screen.queryByText('Hides optional interface layers for the quietest workspace.')).not.toBeInTheDocument();
  });
});
