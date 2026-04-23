import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmActionDialog } from './confirm-action-dialog';

describe('ConfirmActionDialog', () => {
  it('does not render when closed', () => {
    render(
      <ConfirmActionDialog
        confirmLabel="Confirm"
        open={false}
        title="Are you sure?"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders labels and calls cancel and confirm callbacks', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmActionDialog
        cancelLabel="Keep editing"
        confirmLabel="Discard changes"
        description="This cannot be undone."
        open
        title="Discard changes?"
        onCancel={onCancel}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole('dialog')).toHaveTextContent('Discard changes?');
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toHaveAttribute('data-variant', 'destructive');

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables dialog actions while submitting', () => {
    render(
      <ConfirmActionDialog
        cancelLabel="Cancel"
        confirmLabel="Delete"
        isSubmitting
        open
        title="Delete item?"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled();
  });

  it('allows non-destructive confirmation buttons to opt out explicitly', () => {
    render(
      <ConfirmActionDialog
        confirmLabel="Keep order"
        confirmVariant="default"
        open
        title="Keep order?"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Keep order' })).toHaveAttribute('data-variant', 'default');
  });
});
