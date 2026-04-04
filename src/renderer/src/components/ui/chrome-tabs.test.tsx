import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import { ChromeTabs, ChromeTabsList, ChromeTabsTrigger } from './chrome-tabs';

function Harness() {
  return (
    <div className="max-w-[260px] overflow-x-auto">
      <ChromeTabs defaultValue="two">
        <ChromeTabsList aria-label="Demo tabs" className="min-w-max">
          <ChromeTabsTrigger value="one">One</ChromeTabsTrigger>
          <ChromeTabsTrigger value="two">Two</ChromeTabsTrigger>
          <ChromeTabsTrigger value="three">Three</ChromeTabsTrigger>
          <ChromeTabsTrigger value="four">A very long fourth tab</ChromeTabsTrigger>
        </ChromeTabsList>
      </ChromeTabs>
    </div>
  );
}

describe('ChromeTabs', () => {
  test('exposes the active tab through Radix semantics and updates on click', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    const first = screen.getByRole('tab', { name: 'One' });
    const second = screen.getByRole('tab', { name: 'Two' });

    expect(second).toHaveAttribute('data-state', 'active');
    expect(first).toHaveAttribute('data-state', 'inactive');

    await user.click(first);

    expect(first).toHaveAttribute('data-state', 'active');
    expect(second).toHaveAttribute('data-state', 'inactive');
  });

  test('only suppresses dividers adjacent to the active tab', () => {
    render(<Harness />);

    const first = screen.getByRole('tab', { name: 'One' });
    const second = screen.getByRole('tab', { name: 'Two' });
    const third = screen.getByRole('tab', { name: 'Three' });
    const fourth = screen.getByRole('tab', { name: 'A very long fourth tab' });

    expect(first).toHaveAttribute('data-hide-trailing-divider', 'true');
    expect(second).toHaveAttribute('data-hide-trailing-divider', 'true');
    expect(third).toHaveAttribute('data-hide-trailing-divider', 'false');
    expect(fourth).toHaveAttribute('data-hide-trailing-divider', 'true');
  });

  test('supports overflow layouts for long tab rows', () => {
    render(<Harness />);

    const list = screen.getByRole('tablist', { name: 'Demo tabs' });
    expect(list.className).toContain('min-w-max');
  });

  test('renders the bottom bar, shared seam bridges, and active border overlay', () => {
    render(<Harness />);

    const list = screen.getByRole('tablist', { name: 'Demo tabs' });
    const tabs = screen.getAllByRole('tab');
    const activeTab = screen.getByRole('tab', { name: 'Two' });

    expect(list.querySelector('[data-slot="chrome-tabs-bottom-bar"]')).not.toBeNull();
    expect(tabs.every((tab) => tab.querySelector('[data-slot="chrome-tabs-seam"]') != null)).toBe(true);
    expect(activeTab.querySelector('[data-slot="chrome-tabs-border"]')).not.toBeNull();
  });

  test('notifies controlled consumers when the value changes', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();

    render(
      <ChromeTabs value="one" onValueChange={onValueChange}>
        <ChromeTabsList aria-label="Controlled tabs">
          <ChromeTabsTrigger value="one">One</ChromeTabsTrigger>
          <ChromeTabsTrigger value="two">Two</ChromeTabsTrigger>
        </ChromeTabsList>
      </ChromeTabs>,
    );

    await user.click(screen.getByRole('tab', { name: 'Two' }));

    expect(onValueChange).toHaveBeenCalledWith('two');
  });
});
