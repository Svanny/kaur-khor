import { render } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { rowHoverClassName } from '@/lib/interactive-surface';
import { CheckboxRow } from './checkbox-row';

describe('CheckboxRow', () => {
  test('uses the shared row hover styling', () => {
    const { container } = render(
      <CheckboxRow
        checked
        helper="Helpful copy"
        label="Show tooltips"
        onCheckedChange={vi.fn()}
      />,
    );

    expect(container.querySelector('[data-slot="checkbox-row"]')?.className).toContain(rowHoverClassName);
  });
});
