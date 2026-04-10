import type { DesktopBridge } from '@shared/ipc';

declare global {
  interface Window {
    banjiDesktop: DesktopBridge;
  }
}

declare module '*.md?raw' {
  const content: string;
  export default content;
}

export {};
