import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { CompactSparkline } from './compact-sparkline';

describe('CompactSparkline', () => {
  test('renders a sparkline path from the supplied series', () => {
    const { container } = render(<CompactSparkline points={[1, 3, 2, 5]} tone="up" />);

    expect(container.querySelector('[data-tone="up"]')).not.toBeNull();
    expect(container.querySelector('[data-chart-kind="compact-sparkline"]')).not.toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  test('applies the tone as a reusable attribute and class hook', () => {
    const { container } = render(<CompactSparkline points={[2, 2, 2]} tone="down" />);

    const root = container.querySelector('[data-tone]');
    expect(root?.getAttribute('data-tone')).toBe('down');
  });

  test('handles a short flat series without crashing', () => {
    const { container } = render(<CompactSparkline points={[4]} tone="flat" />);

    expect(container.querySelector('[data-tone="flat"]')).not.toBeNull();
    expect(container.querySelector('svg')).not.toBeNull();
  });

  test('renders a vertical divider when a split index is provided', () => {
    const { container } = render(<CompactSparkline points={[1, 2, 3, 4, 5, 6]} splitIndex={3} tone="up" />);

    expect(container.querySelector('[data-split-index="3"]')).not.toBeNull();
    expect(container.querySelector('line[stroke-dasharray="4 3"]')).not.toBeNull();
    expect(container.querySelector('circle')).not.toBeNull();
  });

  test('pins the split marker within the chart for flat series', () => {
    const { container } = render(<CompactSparkline height={24} points={[4, 4, 4, 4]} splitIndex={2} tone="flat" width={56} />);

    const marker = container.querySelector('circle');
    expect(Number(marker?.getAttribute('cx'))).toBeGreaterThan(0);
    expect(Number(marker?.getAttribute('cy'))).toBeGreaterThan(0);
  });

  test('renders responsively instead of forcing a fixed svg width', () => {
    const { container } = render(<CompactSparkline points={[1, 3, 2, 5]} tone="up" width={160} />);

    const root = container.querySelector('[data-chart-kind="compact-sparkline"]');
    const svg = container.querySelector('svg');
    expect(root).toHaveStyle({ maxWidth: '100%' });
    expect(svg?.getAttribute('width')).toBe('160');
  });
});
