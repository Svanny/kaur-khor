import type { DesktopBridge } from '@shared/ipc';
import type { KaurKhorBenchmarkEvent } from '@shared/benchmark';

declare global {
  interface Window {
    kaurKhorDesktop: DesktopBridge;
    __KAUR_KHOR_BENCHMARK_EVENTS__?: KaurKhorBenchmarkEvent[];
  }
}

declare module '*.md?raw' {
  const content: string;
  export default content;
}

export {};
