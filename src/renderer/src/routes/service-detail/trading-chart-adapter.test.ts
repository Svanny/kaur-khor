import { describe, expect, test } from 'vitest';
import { deriveServiceTradingChartModel } from './trading-chart-adapter';
import type { ServiceDetailViewModel } from './view-model';

describe('deriveServiceTradingChartModel', () => {
  test('maps service interval values into the shared trading chart model', () => {
    const model = {
      identity: {
        name: 'Tea service',
        serviceId: 'svc-1',
      },
      intervals: [
        {
          intervalIndex: 2,
          label: 'Interval 3',
          caption: '',
          regimeKey: 'promo',
          dominantRegime: 'Promo',
          endAt: '2026-04-01T00:00:00.000Z',
          priceLabel: '$12',
          priceValue: 12,
          demandValue: 14,
          demandLabel: '14',
          sellableValue: 10,
          sellableLabel: '10',
          gapLabel: '-4',
          tensionLabel: '',
          tone: 'tight',
          evidenceSummary: '',
          bindingLabel: '',
          changeHeadline: '',
          changeLines: [],
        },
      ],
    } as unknown as ServiceDetailViewModel;

    const chartModel = deriveServiceTradingChartModel(model);
    const point = chartModel.points[0]!;

    expect(point.intervalIndex).toBe(2);
    expect(point.price).toBe(12);
    expect(point.serviceDemandMean).toBe(14);
    expect(point.availableCapacity).toBe(10);
    expect(point.demandMinusAvailableCapacity).toBe(4);
    expect(point.dominantRegime).toBe('promo');
    expect(chartModel.availability.price).toBe(true);
    expect(chartModel.availability.demand).toBe(true);
    expect(chartModel.availability.availableCapacity).toBe(true);
    expect(chartModel.availability.demandMinusAvailableCapacity).toBe(true);
    expect(chartModel.availability.regime).toBe(true);
  });
});
