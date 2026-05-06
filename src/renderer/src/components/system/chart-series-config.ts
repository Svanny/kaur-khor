import type { AppLanguage } from '@shared/inventory';

export type ChartInputValueSource = 'open' | 'high' | 'low' | 'close' | 'hl2' | 'ohlc4' | 'ohlc';

export interface ChartInputSourceOption {
  value: ChartInputValueSource;
  label: string;
}

export const CHART_INPUT_VALUE_SOURCE_OPTIONS: ChartInputSourceOption[] = [
  { value: 'open', label: 'Open' },
  { value: 'high', label: 'High' },
  { value: 'low', label: 'Low' },
  { value: 'close', label: 'Close' },
  { value: 'hl2', label: '(H+L)/2' },
  { value: 'ohlc4', label: '(O + H + L + C)/4' },
  { value: 'ohlc', label: 'OHLC' },
];

export function chartInputSourceLabel(source: ChartInputValueSource) {
  return CHART_INPUT_VALUE_SOURCE_OPTIONS.find((option) => option.value === source)?.label ?? source;
}

export function localizedChartInputSourceLabel(language: AppLanguage, source: ChartInputValueSource) {
  if (language !== 'km') {
    return chartInputSourceLabel(source);
  }
  switch (source) {
    case 'open':
      return 'តម្លៃបើក';
    case 'high':
      return 'តម្លៃខ្ពស់';
    case 'low':
      return 'តម្លៃទាប';
    case 'close':
      return 'តម្លៃបិទ';
    case 'hl2':
      return 'មធ្យមតម្លៃខ្ពស់ និងទាប';
    case 'ohlc4':
      return 'មធ្យមតម្លៃបើក ខ្ពស់ ទាប និងបិទ';
    case 'ohlc':
      return 'តម្លៃបើក ខ្ពស់ ទាប និងបិទ';
  }
}

export function isOhlcSource(source: ChartInputValueSource) {
  return source === 'ohlc';
}

export function isSingleValueSource(source: ChartInputValueSource) {
  return source !== 'ohlc';
}
