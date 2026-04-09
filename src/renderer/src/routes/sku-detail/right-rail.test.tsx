import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import { getTranslation } from '@/lib/translations';
import { SkuDetailRightRail } from './right-rail';
import type { SenaSkuDetailViewModel } from './view-model';

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    t: (key: string) => getTranslation('en', key as never),
  }),
}));

function expectBefore(left: HTMLElement, right: HTMLElement) {
  expect(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

describe('SkuDetailRightRail', () => {
  test('renders the act now card above the other right rail cards', () => {
    const model = {
      rail: {
        actNow: {
          headline: 'Monitor',
          quantityBand: 'No order quantity recommended',
          rationale: ['Recommended range 0-0 units'],
        },
        selectedIntervalSummary: {
          headline: 'Service demand led this interval',
          label: 'Mar 24-Apr 7',
          dominantRegime: 'correction',
          serviceDemand: '50',
          retailDemand: '0',
          receipts: '0.02',
          adjustments: '101',
          notes: ['Receipts 0.02 · adjustments 101.'],
        },
        openPipeline: {
          summary: ['None in transit'],
          events: [],
        },
        nextTouch: {
          dateLabel: 'Apr 8',
          reason: 'Review the next observation.',
        },
      },
    } as SenaSkuDetailViewModel;

    render(<SkuDetailRightRail model={model} />);

    const actNow = screen.getByText('Act now');

    expectBefore(actNow, screen.getByText('Selected interval'));
    expectBefore(actNow, screen.getByText('Incoming stock'));
    expectBefore(actNow, screen.getByText('Next check'));
    expect(screen.getByText('Service demand led this interval')).toBeInTheDocument();
    expect(screen.getByText('Service')).toBeInTheDocument();
    expect(screen.getByText('Retail')).toBeInTheDocument();
  });
});
