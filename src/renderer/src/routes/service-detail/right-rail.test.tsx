import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, test, vi } from 'vitest';
import { getTranslation } from '@/lib/translations';
import { ServiceDetailRightRail } from './right-rail';
import type { ServiceDetailViewModel, ServiceInspectorSelection } from './view-model';

vi.mock('@/state/preferences', () => ({
  usePreferences: () => ({
    language: 'en',
    t: (key: string, variables?: Record<string, string | number | null | undefined>) =>
      getTranslation('en', key as never, variables),
  }),
}));

function expectBefore(left: HTMLElement, right: HTMLElement) {
  expect(left.compareDocumentPosition(right) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

function renderRightRail(selection: ServiceInspectorSelection) {
  const model = {
    contributors: [
      {
        skuId: 'sku-1',
        name: 'Market Tee',
        statusLabel: 'Healthy',
        daysOfCoverLabel: '8d',
        probabilityLabel: '12%',
        stockLabel: '12 units',
        inboundLabel: '0 inbound',
        restockGuidance: null,
        openSkuHref: '/catalog/skus/sku-1',
      },
    ],
    intervals: [
      {
        intervalIndex: 1,
        changeHeadline: 'Demand steady',
        label: 'Mar 24-Apr 7',
        dominantRegime: 'normal',
        demandLabel: '10',
        sellableLabel: '12',
        gapLabel: '0 at risk',
        bindingLabel: 'Market Tee',
        changeLines: ['No bottleneck change.'],
      },
    ],
    rail: {
      overviewTitle: 'Monitor',
      overviewReason: ['No order quantity recommended.'],
      bottleneckStack: [{ skuId: 'sku-1', label: 'Market Tee', role: 'Primary contributor' }],
      recoveryPath: ['Keep observing demand.'],
      nextTouch: {
        dateLabel: 'Apr 8',
        reason: 'Review the next observation.',
      },
    },
  } as ServiceDetailViewModel;

  render(
    <MemoryRouter>
      <ServiceDetailRightRail model={model} selection={selection} />
    </MemoryRouter>,
  );
}

describe('ServiceDetailRightRail', () => {
  test('renders the act now card above selected contributor and static rail cards', () => {
    renderRightRail({ type: 'contributor', skuId: 'sku-1' });

    const actNow = screen.getByText('Next step');

    expectBefore(actNow, screen.getByText('Selected SKU'));
    expectBefore(actNow, screen.getByText('Main blockers'));
    expectBefore(actNow, screen.getByText('What could restore service'));
    expectBefore(actNow, screen.getByText('Next check'));
  });

  test('renders the act now card above selected interval cards', () => {
    renderRightRail({ type: 'interval', intervalIndex: 1 });

    expectBefore(screen.getByText('Next step'), screen.getByText('Selected period'));
    expect(screen.getByText('Demand steady')).toBeInTheDocument();
    expect(screen.getByText('Can deliver')).toBeInTheDocument();
    expect(screen.getByText('Main blocker')).toBeInTheDocument();
  });
});
