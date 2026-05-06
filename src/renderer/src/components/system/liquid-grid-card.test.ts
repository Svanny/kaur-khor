import { describe, expect, test } from 'vitest';
import { liquidGridCardBaseClassName } from './liquid-grid-card';

describe('liquidGridCardBaseClassName', () => {
  test('does not animate layout sizing when centered tile dimensions update', () => {
    const classes = liquidGridCardBaseClassName.split(/\s+/);

    expect(classes).not.toContain('transition');
    expect(classes).not.toContain('transition-all');
    expect(classes).not.toContain('transition-transform');
    expect(liquidGridCardBaseClassName).toContain('transition-[border-color,box-shadow]');
  });

  test('fills the centered grid track instead of pinning itself to the max tile size', () => {
    const classes = liquidGridCardBaseClassName.split(/\s+/);

    expect(classes).toContain('size-full');
    expect(classes).toContain('max-w-[var(--centered-tile-max-size)]');
    expect(classes).toContain('max-h-[var(--centered-tile-max-size)]');
    expect(liquidGridCardBaseClassName).not.toContain('md:w-[var(--hub-tile-size)]');
  });
});
