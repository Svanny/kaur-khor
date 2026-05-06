import {
  KAUR_KHOR_BROWSER_APP_DATABASE,
  KAUR_KHOR_BROWSER_DEMO_DATABASE,
  KAUR_KHOR_BROWSER_PREFERRED_VFS,
  type KaurKhorBrowserDatabaseName,
} from './constants';

export type BrowserStorageCapabilityStatus = 'supported' | 'unsupported';

export type BrowserStorageCapability = {
  status: BrowserStorageCapabilityStatus;
  preferredVfs: typeof KAUR_KHOR_BROWSER_PREFERRED_VFS;
  databaseNames: {
    app: typeof KAUR_KHOR_BROWSER_APP_DATABASE;
    demo: typeof KAUR_KHOR_BROWSER_DEMO_DATABASE;
  };
  reasons: string[];
  details: {
    hasWorker: boolean;
    hasWebAssembly: boolean;
    hasNavigatorStorage: boolean;
    hasOpfsDirectory: boolean;
    isSecureContext: boolean;
    crossOriginIsolated: boolean;
  };
};

type CapabilityGlobal = Pick<typeof globalThis, 'Worker' | 'WebAssembly'> & {
  crossOriginIsolated?: boolean;
  isSecureContext?: boolean;
  navigator?: {
    storage?: {
      getDirectory?: unknown;
    };
  };
};

export type BrowserStorageCapabilityOptions = {
  requireWorker?: boolean;
};

export function isKaurKhorBrowserDatabaseName(value: string): value is KaurKhorBrowserDatabaseName {
  return value === KAUR_KHOR_BROWSER_APP_DATABASE || value === KAUR_KHOR_BROWSER_DEMO_DATABASE;
}

export function detectBrowserStorageCapability(
  target: CapabilityGlobal = globalThis,
  options: BrowserStorageCapabilityOptions = {},
): BrowserStorageCapability {
  const requireWorker = options.requireWorker ?? true;
  const hasWorker = typeof target.Worker === 'function';
  const hasWebAssembly = typeof target.WebAssembly === 'object';
  const hasNavigatorStorage = typeof target.navigator?.storage === 'object';
  const hasOpfsDirectory = typeof target.navigator?.storage?.getDirectory === 'function';
  const isSecureContext = target.isSecureContext === true;
  const crossOriginIsolated = target.crossOriginIsolated === true;
  const reasons: string[] = [];

  if (requireWorker && !hasWorker) {
    reasons.push('Web Worker support is required for SQLite WASM persistent OPFS storage.');
  }
  if (!hasWebAssembly) {
    reasons.push('WebAssembly support is required for SQLite WASM.');
  }
  if (!hasNavigatorStorage || !hasOpfsDirectory) {
    reasons.push('Origin Private File System access is required for the opfs-sahpool VFS.');
  }
  if (!isSecureContext) {
    reasons.push('A secure browser context is required before real app data can be stored.');
  }

  return {
    status: reasons.length === 0 ? 'supported' : 'unsupported',
    preferredVfs: KAUR_KHOR_BROWSER_PREFERRED_VFS,
    databaseNames: {
      app: KAUR_KHOR_BROWSER_APP_DATABASE,
      demo: KAUR_KHOR_BROWSER_DEMO_DATABASE,
    },
    reasons,
    details: {
      hasWorker,
      hasWebAssembly,
      hasNavigatorStorage,
      hasOpfsDirectory,
      isSecureContext,
      crossOriginIsolated,
    },
  };
}
