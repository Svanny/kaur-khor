import { useState } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { InterfaceViewMode } from '@shared/interface-view';
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

  it('can render modes as a swipe picker with dot controls', () => {
    function TestCards() {
      const [displayViewMode, setDisplayViewMode] = useState<InterfaceViewMode>('default');

      return (
        <InterfaceViewModeCards
          displayViewMode={displayViewMode}
          modes={['default', 'minimal', 'maximal']}
          onDisplayViewModeChange={setDisplayViewMode}
          presentation="carousel"
        />
      );
    }

    render(<TestCards />);

    const container = screen.getByRole('radiogroup');
    expect(container).toHaveAttribute('data-presentation', 'carousel');
    expect(container.className).toContain('overflow-hidden');
    expect(container.querySelector('[data-slot="interface-view-carousel-track"]')).toHaveStyle({
      transform: 'translateX(-0%)',
    });
    expect(screen.getByRole('button', { name: 'Show Default View' })).toHaveAttribute('aria-current', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Show Minimal View' }));

    expect(container.querySelector('[data-slot="interface-view-carousel-track"]')).toHaveStyle({
      transform: 'translateX(-100%)',
    });
    expect(screen.getByRole('button', { name: 'Show Minimal View' })).toHaveAttribute('aria-current', 'true');

    fireEvent.touchStart(container, { touches: [{ clientX: 240, clientY: 100 }] });
    fireEvent.touchEnd(container, { changedTouches: [{ clientX: 80, clientY: 105 }] });

    expect(container.querySelector('[data-slot="interface-view-carousel-track"]')).toHaveStyle({
      transform: 'translateX(-200%)',
    });
    expect(screen.getByRole('button', { name: 'Show Maximal View' })).toHaveAttribute('aria-current', 'true');
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

  it('exposes visible descriptions as radio descriptions', () => {
    render(
      <InterfaceViewModeCards
        {...baseProps}
        modes={['default', 'minimal', 'maximal']}
      />,
    );

    expect(screen.getByRole('radio', { name: 'Default View' })).toHaveAccessibleDescription(
      'Guidance, floating actions, and status signals stay visible.',
    );
    expect(screen.getByRole('radio', { name: 'Minimal View' })).toHaveAccessibleDescription(
      'Hides optional interface layers for the quietest workspace.',
    );
    expect(screen.getByRole('radio', { name: 'Maximal View' })).toHaveAccessibleDescription(
      'Shows every optional panel, control, and status signal.',
    );
  });

  it('supports roving radio keyboard selection', () => {
    function TestCards() {
      const [displayViewMode, setDisplayViewMode] = useState<InterfaceViewMode>('default');

      return (
        <InterfaceViewModeCards
          displayViewMode={displayViewMode}
          modes={['default', 'minimal', 'maximal']}
          onDisplayViewModeChange={setDisplayViewMode}
        />
      );
    }

    render(<TestCards />);

    const defaultMode = screen.getByRole('radio', { name: 'Default View' });
    defaultMode.focus();
    expect(defaultMode).toHaveFocus();

    fireEvent.keyDown(defaultMode, { key: 'ArrowRight' });

    const minimalMode = screen.getByRole('radio', { name: 'Minimal View' });
    expect(minimalMode).toHaveFocus();
    expect(minimalMode).toHaveAttribute('aria-checked', 'true');

    fireEvent.keyDown(minimalMode, { key: 'ArrowLeft' });

    expect(defaultMode).toHaveFocus();
    expect(defaultMode).toHaveAttribute('aria-checked', 'true');

    fireEvent.keyDown(defaultMode, { key: 'ArrowRight' });
    expect(minimalMode).toHaveFocus();

    fireEvent.keyDown(minimalMode, { key: 'ArrowUp' });

    expect(defaultMode).toHaveFocus();
    expect(defaultMode).toHaveAttribute('aria-checked', 'true');
  });
});
