import { describe, expect, test } from 'vitest';
import { embeddedModeForPath, webLandingMountForPath } from './embedded-entry';

describe('embeddedModeForPath', () => {
  test('matches web build demo and app paths behind the kaur-khor base', () => {
    expect(embeddedModeForPath('/kaur-khor/demo', '/kaur-khor')).toBe('demo');
    expect(embeddedModeForPath('/kaur-khor/app', '/kaur-khor')).toBe('app');
  });

  test('matches electron renderer dev URLs that include the web base path', () => {
    expect(embeddedModeForPath('/kaur-khor/demo', '/')).toBe('demo');
    expect(embeddedModeForPath('/kaur-khor/app', '/')).toBe('app');
  });

  test('does not treat landing and desktop hash routes as embedded app routes', () => {
    expect(embeddedModeForPath('/kaur-khor', '/kaur-khor')).toBeNull();
    expect(embeddedModeForPath('/', '/')).toBeNull();
  });
});

describe('webLandingMountForPath', () => {
  test('routes the renderer /main mount to the public web landing page', () => {
    expect(webLandingMountForPath('/main')).toBe('main');
    expect(webLandingMountForPath('/main/')).toBe('main');
  });

  test('leaves embedded and desktop renderer routes alone', () => {
    expect(webLandingMountForPath('/kaur-khor/demo')).toBeNull();
    expect(webLandingMountForPath('/')).toBeNull();
  });
});
