interface Window {
  kaurKhorDesktop: import('@shared/ipc').DesktopBridge;
  __KAUR_KHOR_BENCHMARK_EVENTS__?: import('@shared/benchmark').KaurKhorBenchmarkEvent[];
}

declare module '*.md?raw' {
  const content: string;
  export default content;
}

declare module 'react-sparklines' {
  import type { CSSProperties, ReactNode } from 'react';

  export interface SparklinesProps {
    children?: ReactNode;
    data: number[];
    height?: number;
    margin?: number;
    preserveAspectRatio?: string;
    style?: CSSProperties;
    width?: number;
  }

  export function Sparklines(props: SparklinesProps): ReactNode;
}
