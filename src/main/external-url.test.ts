// @vitest-environment node

import { describe, expect, it } from 'vitest';
import { normalizeAllowedExternalUrl } from './external-url';

describe('normalizeAllowedExternalUrl', () => {
  it('allows HTTPS links', () => {
    expect(normalizeAllowedExternalUrl('  https://github.com/Svanny/kaur-khor/issues  ')).toBe(
      'https://github.com/Svanny/kaur-khor/issues',
    );
    expect(normalizeAllowedExternalUrl('https://t.me/configured_bot')).toBe(
      'https://t.me/configured_bot',
    );
  });

  it('allows Telegram deep links used by the automation bot action', () => {
    expect(normalizeAllowedExternalUrl('tg://resolve?domain=configured_bot')).toBe(
      'tg://resolve?domain=configured_bot',
    );
  });

  it('rejects other Telegram deep link actions', () => {
    expect(() => normalizeAllowedExternalUrl('tg://join?invite=configured_bot')).toThrow(
      'Only Kaur Khor GitHub and Telegram links can be opened.',
    );
  });

  it('rejects Telegram deep links with malformed domains', () => {
    expect(() => normalizeAllowedExternalUrl('tg://resolve?domain=bad/user')).toThrow(
      'Only Kaur Khor GitHub and Telegram links can be opened.',
    );
    expect(() => normalizeAllowedExternalUrl('tg://resolve?domain=x')).toThrow(
      'Only Kaur Khor GitHub and Telegram links can be opened.',
    );
    expect(() => normalizeAllowedExternalUrl('tg://resolve?domain=configured_bot&start=payload')).toThrow(
      'Only Kaur Khor GitHub and Telegram links can be opened.',
    );
  });

  it('rejects local file URLs', () => {
    expect(() => normalizeAllowedExternalUrl('file:///Users/svanny/.ssh/id_rsa')).toThrow(
      'Only Kaur Khor GitHub and Telegram links can be opened.',
    );
  });

  it('rejects script URLs and malformed values', () => {
    expect(() => normalizeAllowedExternalUrl('javascript:alert(1)')).toThrow(
      'Only Kaur Khor GitHub and Telegram links can be opened.',
    );
    expect(() => normalizeAllowedExternalUrl('not a url')).toThrow('A valid URL is required.');
  });

  it('rejects unapproved HTTPS hosts', () => {
    expect(() => normalizeAllowedExternalUrl('https://example.com/phishing')).toThrow(
      'Only Kaur Khor GitHub and Telegram links can be opened.',
    );
  });

  it('rejects credential-bearing HTTPS links on approved hosts', () => {
    expect(() => normalizeAllowedExternalUrl('https://github.com@example.com/Svanny/kaur-khor')).toThrow(
      'Only Kaur Khor GitHub and Telegram links can be opened.',
    );
    expect(() => normalizeAllowedExternalUrl('https://user:token@github.com/Svanny/kaur-khor')).toThrow(
      'Only Kaur Khor GitHub and Telegram links can be opened.',
    );
  });
});
