import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

describe('bundled font assets', () => {
  const fontDir = join(process.cwd(), 'src/renderer/src/assets/fonts');

  test('bundles Noto Sans Khmer weights used by the renderer', () => {
    for (const fileName of [
      'NotoSansKhmer-Regular.ttf',
      'NotoSansKhmer-Medium.ttf',
      'NotoSansKhmer-SemiBold.ttf',
      'NotoSansKhmer-Bold.ttf',
    ]) {
      expect(existsSync(join(fontDir, fileName)), fileName).toBe(true);
    }
    expect(existsSync(join(fontDir, 'OFL-NotoSansKhmer.txt'))).toBe(true);
  });

  test('declares Noto Sans Khmer font faces for renderer weights', () => {
    const globalsCss = readFileSync(join(process.cwd(), 'src/renderer/src/globals.css'), 'utf8');

    expect(globalsCss).toContain('font-family: "Noto Sans Khmer"');
    expect(globalsCss).toContain('NotoSansKhmer-Regular.ttf');
    expect(globalsCss).toContain('NotoSansKhmer-Medium.ttf');
    expect(globalsCss).toContain('NotoSansKhmer-SemiBold.ttf');
    expect(globalsCss).toContain('NotoSansKhmer-Bold.ttf');
    expect(globalsCss).toMatch(/font-weight:\s*400/);
    expect(globalsCss).toMatch(/font-weight:\s*500/);
    expect(globalsCss).toMatch(/font-weight:\s*600/);
    expect(globalsCss).toMatch(/font-weight:\s*700/);
  });

  test('keeps Khmer-safe display utilities vertically roomy', () => {
    const globalsCss = readFileSync(join(process.cwd(), 'src/renderer/src/globals.css'), 'utf8');

    expect(globalsCss).toMatch(/\[data-language="km"\]\s+\.khmer-safe-display\s*\{[^}]*letter-spacing:\s*0\s*!important;[^}]*line-height:\s*1\.35;/s);
    expect(globalsCss).toMatch(/\[data-language="km"\]\s+\.khmer-safe-eyebrow,\s*\[data-language="km"\]\s+\.khmer-safe-label\s*\{[^}]*letter-spacing:\s*0\s*!important;[^}]*line-height:\s*1\.45;[^}]*text-transform:\s*none\s*!important;/s);
  });

  test('resets tracked action controls in Khmer mode', () => {
    const globalsCss = readFileSync(join(process.cwd(), 'src/renderer/src/globals.css'), 'utf8');

    expect(globalsCss).toMatch(/\[data-language="km"\]\s+\.khmer-safe-action,\s*\[data-language="km"\]\s+:where\(button, \[role="button"\], \[data-slot="button"\], \[data-slot="toggle-group-item"\]\),\s*\[data-language="km"\]\s+:where\(button, \[role="button"\], \[data-slot="button"\], \[data-slot="toggle-group-item"\]\)\s+:where\(\*\)\s*\{[^}]*letter-spacing:\s*0\s*!important;[^}]*line-height:\s*1\.45;[^}]*text-transform:\s*none\s*!important;/s);
  });
});
