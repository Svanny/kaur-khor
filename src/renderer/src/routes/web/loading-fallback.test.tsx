import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { WebLoadingFallback, webLoadingFallbackTitle } from './loading-fallback';

describe('WebLoadingFallback', () => {
  test('shows workspace loading copy for embedded app routes', () => {
    render(<WebLoadingFallback embeddedMode language="en" />);

    expect(screen.getByRole('heading', { name: 'Loading workspace…' })).toBeInTheDocument();
  });

  test('shows preferences loading copy for the standard landing route', () => {
    render(<WebLoadingFallback embeddedMode={false} language="en" />);

    expect(screen.getByRole('heading', { name: 'Loading preferences…' })).toBeInTheDocument();
  });

  test('localizes the conditional fallback title', () => {
    expect(webLoadingFallbackTitle(true, 'km')).toBe('កំពុងផ្ទុកកន្លែងធ្វើការ…');
    expect(webLoadingFallbackTitle(false, 'km')).toBe('កំពុងផ្ទុកចំណូលចិត្ត…');
  });
});
