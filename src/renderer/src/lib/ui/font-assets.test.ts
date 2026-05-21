import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'vitest';

function cssDeclarationsForSelector(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 's'));
  if (!match?.[1]) {
    return null;
  }
  return match[1]
    .split(';')
    .map((declaration) => declaration.trim())
    .filter(Boolean)
    .map((declaration) => {
      const [property, ...valueParts] = declaration.split(':');
      const rawValue = valueParts.join(':').trim();
      return {
        important: /!important$/.test(rawValue),
        property: property.trim(),
        value: rawValue.replace(/\s*!important$/, '').trim(),
      };
    });
}

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

    expect(globalsCss).toMatch(/\.khmer-safe-display\s*\{[^}]*line-height:\s*1\.5\s*!important;[^}]*padding-block:\s*0\.08em 0\.12em\s*!important;/s);
    expect(globalsCss).toMatch(/\[data-language="km"\]\s+\.khmer-safe-display\s*\{[^}]*letter-spacing:\s*0\s*!important;/s);
    expect(globalsCss).toMatch(/\[data-language="km"\]\s+\.khmer-safe-eyebrow,\s*\[data-language="km"\]\s+\.khmer-safe-label\s*\{[^}]*letter-spacing:\s*0\s*!important;[^}]*line-height:\s*1\.45;[^}]*text-transform:\s*none\s*!important;/s);
  });

  test('resets tracked action controls in Khmer mode', () => {
    const globalsCss = readFileSync(join(process.cwd(), 'src/renderer/src/globals.css'), 'utf8');

    expect(globalsCss).toMatch(/\[data-language="km"\]\s+\.khmer-safe-action,\s*\[data-language="km"\]\s+:where\(button, \[role="button"\], \[data-slot="button"\], \[data-slot="toggle-group-item"\]\),\s*\[data-language="km"\]\s+:where\(button, \[role="button"\], \[data-slot="button"\], \[data-slot="toggle-group-item"\]\)\s+:where\(\*\)\s*\{[^}]*letter-spacing:\s*0\s*!important;[^}]*line-height:\s*1\.45;[^}]*text-transform:\s*none\s*!important;/s);
  });

  test('keeps embedded phone onboarding inside horizontal gutters', () => {
    const globalsCss = readFileSync(join(process.cwd(), 'src/renderer/src/globals.css'), 'utf8');
    const declarations = cssDeclarationsForSelector(
      globalsCss,
      'html[data-kaur-khor-embedded-phone-portrait="true"] [data-slot="onboarding-page"]',
    );

    expect(globalsCss).toMatch(/\[data-slot="embedded-phone-shell"\]\s+\[data-slot="embedded-phone-main"\]\s*>\s*\[data-slot="onboarding-page"\]\s*\{[^}]*min-height:\s*0\s*!important;[^}]*padding:\s*0 0\.75rem 1rem\s*!important;/s);
    expect(globalsCss).toMatch(/html\[data-kaur-khor-embedded-phone-portrait="true"\]\s+\[data-slot="onboarding-page"\]\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*min-height:\s*100%;/s);
    expect(declarations, 'embedded phone onboarding rule should exist').not.toBeNull();
    const padding = declarations?.find((declaration) => declaration.property === 'padding');
    expect(padding?.value).toBe('0 0.75rem 1rem');
    expect(padding?.important).toBe(true);
  });
});
