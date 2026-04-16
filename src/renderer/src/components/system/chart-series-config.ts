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

export function isOhlcSource(source: ChartInputValueSource) {
  return source === 'ohlc';
}

export function isSingleValueSource(source: ChartInputValueSource) {
  return source !== 'ohlc';
}
