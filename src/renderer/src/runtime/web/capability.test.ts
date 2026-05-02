import { describe, expect, it } from 'vitest';
import { detectBrowserStorageCapability, isBanjiBrowserDatabaseName } from './capability';
import {
  BANJI_BROWSER_APP_DATABASE,
  BANJI_BROWSER_DEMO_DATABASE,
  BANJI_BROWSER_PREFERRED_VFS,
} from './constants';

describe('detectBrowserStorageCapability', () => {
  it('reports supported when worker, wasm, secure context, and OPFS are available', () => {
    const capability = detectBrowserStorageCapability({
      Worker: class Worker {} as unknown as typeof Worker,
      WebAssembly,
      isSecureContext: true,
      crossOriginIsolated: false,
      navigator: {
        storage: {
          getDirectory: () => undefined,
        },
      },
    });

    expect(capability.status).toBe('supported');
    expect(capability.preferredVfs).toBe(BANJI_BROWSER_PREFERRED_VFS);
    expect(capability.databaseNames).toEqual({
      app: BANJI_BROWSER_APP_DATABASE,
      demo: BANJI_BROWSER_DEMO_DATABASE,
    });
    expect(capability.details.crossOriginIsolated).toBe(false);
  });

  it('reports explicit unsupported reasons instead of falling back to weak storage', () => {
    const capability = detectBrowserStorageCapability({
      Worker: undefined as unknown as typeof Worker,
      WebAssembly: undefined as unknown as typeof WebAssembly,
      isSecureContext: false,
      navigator: {},
    });

    expect(capability.status).toBe('unsupported');
    expect(capability.reasons).toEqual([
      'Web Worker support is required for SQLite WASM persistent OPFS storage.',
      'WebAssembly support is required for SQLite WASM.',
      'Origin Private File System access is required for the opfs-sahpool VFS.',
      'A secure browser context is required before real app data can be stored.',
    ]);
  });

  it('can evaluate an already-running storage worker without requiring nested workers', () => {
    const capability = detectBrowserStorageCapability(
      {
        Worker: undefined as unknown as typeof Worker,
        WebAssembly,
        isSecureContext: true,
        navigator: {
          storage: {
            getDirectory: () => undefined,
          },
        },
      },
      { requireWorker: false },
    );

    expect(capability.status).toBe('supported');
    expect(capability.details.hasWorker).toBe(false);
  });
});

describe('isBanjiBrowserDatabaseName', () => {
  it('accepts only the production browser database names', () => {
    expect(isBanjiBrowserDatabaseName(BANJI_BROWSER_APP_DATABASE)).toBe(true);
    expect(isBanjiBrowserDatabaseName(BANJI_BROWSER_DEMO_DATABASE)).toBe(true);
    expect(isBanjiBrowserDatabaseName('banji_browser_app.sqlite3')).toBe(false);
  });
});
