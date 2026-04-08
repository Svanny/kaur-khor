import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StepWizard } from './step-wizard';

describe('StepWizard', () => {
  it('renders progress and disables locked future steps', () => {
    const onStepSelect = vi.fn();

    render(
      <StepWizard
        currentStepId="context"
        percentComplete={40}
        steps={[
          { id: 'context', title: 'Interval and context', complete: true },
          { id: 'stock', title: 'Stock count' },
          { id: 'review', title: 'Review and save' },
        ]}
        unlockedStepCount={2}
        onStepSelect={onStepSelect}
      />,
    );

    expect(screen.getByRole('progressbar', { name: 'Wizard progress' })).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByRole('button', { name: /Review and save/i })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: /Stock count/i }));
    expect(onStepSelect).toHaveBeenCalledWith('stock');
  });

  it('marks the current step for assistive technology', () => {
    render(
      <StepWizard
        currentStepId="stock"
        percentComplete={60}
        steps={[
          { id: 'context', title: 'Interval and context', complete: true },
          { id: 'stock', title: 'Stock count' },
          { id: 'events', title: 'Real-world events' },
        ]}
        unlockedStepCount={3}
        onStepSelect={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: /Stock count/i })).toHaveAttribute('aria-current', 'step');
  });

  it('does not show future steps as complete before the user reaches them', () => {
    render(
      <StepWizard
        currentStepId="context"
        percentComplete={20}
        steps={[
          { id: 'context', title: 'Interval and context', complete: true },
          { id: 'stock', title: 'Stock count', complete: true },
          { id: 'events', title: 'Real-world events' },
        ]}
        unlockedStepCount={1}
        onStepSelect={() => {}}
      />,
    );

    expect(screen.getByRole('button', { name: /Interval and context/i })).toHaveTextContent('Interval and context');
    expect(screen.getByRole('button', { name: /Stock count/i })).toHaveTextContent('2');
    expect(screen.getByRole('button', { name: /Stock count/i })).not.toHaveTextContent('check');
  });
});
