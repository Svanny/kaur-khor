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
});
