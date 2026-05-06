type ActivationPolicy = 'regular' | 'accessory' | 'prohibited';

type WindowActivationApp = {
  setActivationPolicy?: (policy: ActivationPolicy) => boolean | void;
};

type WindowActivationTarget = {
  showInactive: () => void;
};

type InactiveMacDevLaunchOptions = {
  benchmarkWindowBackgroundMode: boolean;
  isPackaged: boolean;
  platform: NodeJS.Platform | string;
  rendererUrl: string | undefined;
};

export function shouldPrepareInactiveMacDevWindowLaunch({
  benchmarkWindowBackgroundMode,
  isPackaged,
  platform,
  rendererUrl,
}: InactiveMacDevLaunchOptions): boolean {
  return platform === 'darwin'
    && !isPackaged
    && !benchmarkWindowBackgroundMode
    && Boolean(rendererUrl?.trim());
}

export function prepareInactiveMacDevWindowLaunch({
  app,
  shouldPrepare,
}: {
  app: WindowActivationApp;
  shouldPrepare: boolean;
}) {
  if (!shouldPrepare) {
    return;
  }

  app.setActivationPolicy?.('accessory');
}

export function showWindowWithoutStealingFocus({
  app,
  targetWindow,
  restoreRegularActivationPolicy,
}: {
  app: WindowActivationApp;
  targetWindow: WindowActivationTarget;
  restoreRegularActivationPolicy: boolean;
}) {
  targetWindow.showInactive();

  if (restoreRegularActivationPolicy) {
    app.setActivationPolicy?.('regular');
  }
}
