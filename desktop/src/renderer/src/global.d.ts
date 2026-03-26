import type { DesktopAppContext } from '@shared/ipc';

declare global {
  interface Window {
    banjiDesktop: {
      getAppContext: () => Promise<DesktopAppContext>;
      restartBackend: () => Promise<DesktopAppContext>;
      onBackendStatus: (listener: (context: DesktopAppContext) => void) => () => void;
    };
  }
}

export {};
