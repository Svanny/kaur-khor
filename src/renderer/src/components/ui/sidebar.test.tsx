import { render, screen } from '@testing-library/react';
import { beforeAll, describe, expect, test, vi } from 'vitest';
import { rowHoverClassName } from '@/lib/ui/interactive-surface';
import { SidebarMenuButton, SidebarMenuSubButton, SidebarProvider } from './sidebar';

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

describe('Sidebar row hovers', () => {
  test('applies the shared row hover styling to menu buttons', () => {
    render(
      <SidebarProvider>
        <SidebarMenuButton>Overview</SidebarMenuButton>
      </SidebarProvider>,
    );

    expect(screen.getByRole('button', { name: 'Overview' }).className).toContain(rowHoverClassName);
  });

  test('applies the shared row hover styling to submenu buttons', () => {
    render(<SidebarMenuSubButton href="#settings">Settings</SidebarMenuSubButton>);

    expect(screen.getByRole('link', { name: 'Settings' }).className).toContain(rowHoverClassName);
  });
});
