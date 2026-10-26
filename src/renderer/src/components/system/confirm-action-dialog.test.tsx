import { useState } from 'react';
import userEvent from '@testing-library/user-event';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionSaveIcon } from '@icons/actions';
import { ConfirmActionDialog, shouldFillWrappedConfirmActionRow } from './confirm-action-dialog';

const preferences = vi.hoisted(() => ({ language: 'en' }));
vi.mock('@/state/preferences', () => ({ usePreferences: () => preferences }));
beforeEach(() => { preferences.language = 'en'; });

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
    expect(screen.getByRole('presentation')).toHaveClass('z-[130]');
    expect(screen.getByRole('presentation')).toHaveClass('pointer-events-auto');
    expect(screen.getByRole('presentation')).toHaveClass('backdrop-blur-none');
    expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toHaveAttribute('data-variant', 'destructive');

    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('renders an optional destructive action on the left side', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    const onDestructiveAction = vi.fn();

    render(
      <ConfirmActionDialog
        cancelLabel="Keep editing"
        confirmLabel="Save changes"
        confirmVariant="default"
        destructiveActionLabel="Discard changes"
        description="This cannot be undone."
        open
        title="Discard changes?"
        onCancel={onCancel}
        onConfirm={onConfirm}
        onDestructiveAction={onDestructiveAction}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveClass('w-full');
    expect(dialog).toHaveClass('max-w-md');
    expect(dialog.querySelector('[data-slot="confirm-action-dialog-actions"]')).toHaveClass('flex-wrap');
    expect(within(dialog).getAllByRole('button').map((button) => button.textContent)).toEqual([
      'Discard changes',
      'Keep editing',
      'Save changes',
    ]);
    const actionItems = dialog.querySelectorAll('[data-slot="confirm-action-dialog-action-item"]');
    expect(actionItems).toHaveLength(3);
    actionItems.forEach((item) => {
      expect(item).toHaveClass('min-w-max');
      expect(item).not.toHaveClass('flex-[1_0_max-content]');
    });
    expect(actionItems[0]).toHaveClass('mr-auto');
    expect(screen.getByRole('button', { name: 'Discard changes' })).not.toHaveClass('w-full');
    expect(screen.getByRole('button', { name: 'Keep editing' })).not.toHaveClass('w-full');
    expect(screen.getByRole('button', { name: 'Discard changes' })).toHaveAttribute('data-variant', 'destructive-outline');
    expect(screen.getByRole('button', { name: 'Save changes' })).toHaveAttribute('data-variant', 'default');

    fireEvent.click(screen.getByRole('button', { name: 'Discard changes' }));
    fireEvent.click(screen.getByRole('button', { name: 'Keep editing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(onDestructiveAction).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('only fills wrapped action rows when content would overflow one row', () => {
    expect(
      shouldFillWrappedConfirmActionRow({
        containerWidth: 640,
        gap: 12,
        itemWidths: [160, 120, 150],
      }),
    ).toBe(false);

    expect(
      shouldFillWrappedConfirmActionRow({
        containerWidth: 360,
        gap: 12,
        itemWidths: [180, 130, 170],
      }),
    ).toBe(true);
  });

  it('uses a caller-provided confirm icon when supplied', () => {
    render(
      <ConfirmActionDialog
        confirmIcon={<ActionSaveIcon data-icon="inline-start" data-testid="save-confirm-icon" />}
        confirmLabel="Save changes"
        open
        title="Save before leaving?"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    expect(screen.getByTestId('save-confirm-icon')).toBeInTheDocument();
  });

  it('can hide the leading title icon', () => {
    render(
      <ConfirmActionDialog
        confirmLabel="Done"
        hideIcon
        open
        title="Capture actions"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Capture actions' });
    expect(dialog.querySelector('[data-slot="confirm-action-dialog-icon"]')).not.toBeInTheDocument();
  });

  it('disables dialog actions while submitting', () => {
    render(
      <ConfirmActionDialog
        cancelLabel="Cancel"
        confirmLabel="Delete"
        destructiveActionLabel="Discard changes"
        isSubmitting
        open
        title="Delete item?"
        onCancel={vi.fn()}
        onConfirm={vi.fn()}
        onDestructiveAction={vi.fn()}
      />,
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Discard changes' })).toBeDisabled();
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

function KeyboardDialogHarness({ nested = false, busy = false, hideCancel = false, busyOnConfirm = false }) {
  const [open, setOpen] = useState(false);
  const [parentOpen, setParentOpen] = useState(true);
  const [pending, setPending] = useState(busy);
  const content = <>
    <button onClick={() => setOpen(true)}>Open warning</button>
    <button>Background action</button>
    <ConfirmActionDialog open={open} title="Keep your work" description="Unsaved draft"
      cancelLabel="Keep editing" confirmLabel="Discard changes" hideCancel={hideCancel}
      isSubmitting={pending} onCancel={() => setOpen(false)} onConfirm={() => busyOnConfirm ? setPending(true) : setOpen(false)} />
  </>;
  return nested ? <DialogPrimitive.Root open={parentOpen} onOpenChange={setParentOpen}>
    <DialogPrimitive.Portal><DialogPrimitive.Content aria-describedby={undefined}>
      <DialogPrimitive.Title>Parent editor</DialogPrimitive.Title>{content}
    </DialogPrimitive.Content></DialogPrimitive.Portal>
  </DialogPrimitive.Root> : content;
}

describe('confirmation keyboard safety', () => {
  it.each([false, true])('contains focus, cancels safely and restores its trigger (nested=%s)', async (nested) => {
    const user = userEvent.setup();
    render(<KeyboardDialogHarness nested={nested} />);
    const trigger = screen.getByRole('button', { name: 'Open warning' });
    for (const dismissWithEscape of [true, false]) {
      await user.click(trigger);
      const dialog = await screen.findByRole('dialog', { name: 'Keep your work' });
      const cancel = within(dialog).getByRole('button', { name: 'Keep editing' });
      const confirm = within(dialog).getByRole('button', { name: 'Discard changes' });
      await waitFor(() => expect(cancel).toHaveFocus());
      await user.tab({ shift: true });
      expect(confirm).toHaveFocus();
      await user.tab();
      expect(cancel).toHaveFocus();
      if (dismissWithEscape) await user.keyboard('{Escape}');
      else await user.click(cancel);
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Keep your work' })).not.toBeInTheDocument());
      await waitFor(() => expect(trigger).toHaveFocus());
      if (nested) expect(screen.getByRole('dialog', { name: 'Parent editor' })).toBeVisible();
    }
  });

  it('keeps a busy confirmation open on Escape and outside interaction', async () => {
    const user = userEvent.setup();
    render(<KeyboardDialogHarness busy />);
    await user.click(screen.getByRole('button', { name: 'Open warning' }));
    const dialog = await screen.findByRole('dialog', { name: 'Keep your work' });
    await waitFor(() => expect(dialog).toHaveFocus());
    await user.keyboard('{Escape}');
    fireEvent.pointerDown(screen.getByRole('presentation'));
    expect(dialog).toBeVisible();
    await user.tab();
    expect(dialog).toHaveFocus();
  });

  it('moves focus off the disabled action while work is pending and keeps Escape local', async () => {
    const user = userEvent.setup();
    const outerEscape = vi.fn();
    window.addEventListener('keydown', outerEscape);
    try {
      render(<KeyboardDialogHarness busyOnConfirm />);
      await user.click(screen.getByRole('button', { name: 'Open warning' }));
      await user.click(screen.getByRole('button', { name: 'Discard changes' }));
      const dialog = screen.getByRole('dialog', { name: 'Keep your work' });
      expect(dialog).toHaveFocus();
      await user.tab();
      expect(dialog).toHaveFocus();
      await user.tab({ shift: true });
      expect(dialog).toHaveFocus();
      outerEscape.mockClear();
      await user.keyboard('{Escape}');
      expect(outerEscape).not.toHaveBeenCalled();
      expect(dialog).toBeVisible();
    } finally {
      window.removeEventListener('keydown', outerEscape);
    }
  });

  it('preserves Khmer language and font context across the body portal', async () => {
    preferences.language = 'km';
    const user = userEvent.setup();
    const { container } = render(<KeyboardDialogHarness />);
    await user.click(screen.getByRole('button', { name: 'Open warning' }));
    const dialog = screen.getByRole('dialog', { name: 'Keep your work' });
    expect(container).not.toContainElement(dialog);
    const overlay = dialog.closest('[data-language]');
    expect(overlay).toHaveAttribute('data-language', 'km');
    expect(overlay).toHaveAttribute('lang', 'km');
  });

  it('focuses the dialog rather than a destructive action when Cancel is hidden', async () => {
    const user = userEvent.setup();
    render(<KeyboardDialogHarness hideCancel />);
    await user.click(screen.getByRole('button', { name: 'Open warning' }));
    await waitFor(() => expect(screen.getByRole('dialog', { name: 'Keep your work' })).toHaveFocus());
  });
});
