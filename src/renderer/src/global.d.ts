import type { DesktopBridge } from '@shared/ipc';
import type { BanjiBenchmarkEvent } from '@shared/benchmark';

declare global {
  interface Window {
    banjiDesktop: DesktopBridge;
    __BANJI_BENCHMARK_EVENTS__?: BanjiBenchmarkEvent[];
  }
}

declare module '*.md?raw' {
  const content: string;
  export default content;
}

export {};
