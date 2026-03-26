export type BackendStatus = 'starting' | 'ready' | 'error' | 'stopped';

export interface DesktopAppContext {
  apiBaseUrl: string;
  appVersion: string;
  backendStatus: BackendStatus;
  backendError?: string;
}

export const IPC_CHANNELS = {
  getAppContext: 'banji:get-app-context',
  backendStatus: 'banji:backend-status',
  restartBackend: 'banji:restart-backend',
} as const;
