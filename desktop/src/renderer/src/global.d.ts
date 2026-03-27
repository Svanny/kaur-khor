import type { DesktopBridge } from '@shared/ipc';

declare global {
  interface Window {
    banjiDesktop: DesktopBridge;
  }
}

export {};
