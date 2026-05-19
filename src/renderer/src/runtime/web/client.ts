import { detectBrowserStorageCapability, isKaurKhorBrowserDatabaseName, type BrowserStorageCapability } from './capability';
import { KAUR_KHOR_BROWSER_APP_DATABASE, KAUR_KHOR_BROWSER_PREFERRED_VFS, type KaurKhorBrowserDatabaseName } from './constants';
import { validateBrowserStorageBackup, validateBrowserStorageDocumentRecords, type BrowserStorageDocumentRecord, type BrowserStorageJsonBackup } from './backup';
import { createBrowserDemoSeedBackup } from './demo-seed';
import type {
  BrowserStorageInitResult,
  BrowserStorageWorkerEnvelope,
  BrowserStorageWorkerRequest,
  BrowserStorageWorkerResponse,
  BrowserStorageWorkerResult,
} from './protocol';
import type { BrowserSenaPersistState } from './sena-persistence';

type PendingRequest = {
  resolve: (result: BrowserStorageWorkerResult) => void;
  reject: (error: Error) => void;
};

export type BrowserStorageUnsupportedHandle = {
  status: 'unsupported';
  capability: BrowserStorageCapability;
};

export type BrowserStorageSupportedHandle = {
  status: 'supported';
  capability: BrowserStorageCapability;
  init: BrowserStorageInitResult;
  listDocuments: (collection?: string) => Promise<BrowserStorageDocumentRecord[]>;
  putDocuments: (records: BrowserStorageDocumentRecord[]) => Promise<number>;
  exportBackup: () => Promise<BrowserStorageJsonBackup>;
  importBackup: (backup: BrowserStorageJsonBackup) => Promise<number>;
  persistSenaState: (state: BrowserSenaPersistState) => Promise<number>;
  clear: () => Promise<void>;
  seedDemo: () => Promise<number>;
  close: () => void;
};

export type BrowserStorageHandle = BrowserStorageUnsupportedHandle | BrowserStorageSupportedHandle;

export type OpenBrowserStorageOptions = {
  databaseName?: KaurKhorBrowserDatabaseName;
  workerFactory?: () => Worker;
};

function readWorkerResponseId(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const id = (value as { id?: unknown }).id;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function isBrowserStorageWorkerResponse(value: unknown): value is BrowserStorageWorkerResponse {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const response = value as { error?: unknown; id?: unknown; ok?: unknown; response?: unknown };
  if (
    typeof response.id !== 'number' ||
    !Number.isSafeInteger(response.id) ||
    response.id <= 0 ||
    typeof response.ok !== 'boolean'
  ) {
    return false;
  }

  if (response.ok) {
    return Boolean(response.response) && typeof response.response === 'object' && !Array.isArray(response.response);
  }

  return typeof response.error === 'string';
}

function isNonNegativeSafeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isBrowserStorageInitResult(value: unknown): value is BrowserStorageInitResult {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const result = value as { databaseName?: unknown; filename?: unknown; sqliteVersion?: unknown; vfs?: unknown };
  return (
    typeof result.databaseName === 'string' &&
    isKaurKhorBrowserDatabaseName(result.databaseName) &&
    typeof result.filename === 'string' &&
    result.filename.trim().length > 0 &&
    typeof result.sqliteVersion === 'string' &&
    result.sqliteVersion.trim().length > 0 &&
    result.vfs === KAUR_KHOR_BROWSER_PREFERRED_VFS
  );
}

export class BrowserStorageClient implements BrowserStorageSupportedHandle {
  readonly status = 'supported' as const;
  #nextId = 1;
  #pending = new Map<number, PendingRequest>();
  #closed = false;

  constructor(
    readonly capability: BrowserStorageCapability,
    public init: BrowserStorageInitResult,
    private readonly worker: Worker,
  ) {
    worker.addEventListener('message', this.#handleMessage);
    worker.addEventListener('error', this.#handleError);
  }

  listDocuments(collection?: string) {
    return this.request({ type: 'listDocuments', collection }).then((response) => {
      if (response.type !== 'listDocuments') {
        throw new Error('Unexpected listDocuments response.');
      }
      const validation = validateBrowserStorageDocumentRecords(response.result);
      if (!validation.ok) {
        throw new Error('Malformed listDocuments response.');
      }
      return validation.records;
    });
  }

  putDocuments(records: BrowserStorageDocumentRecord[]) {
    return this.request({ type: 'putDocuments', records }).then((response) => {
      if (response.type !== 'putDocuments') {
        throw new Error('Unexpected putDocuments response.');
      }
      if (!isNonNegativeSafeInteger(response.result.storedRecords)) {
        throw new Error('Malformed putDocuments response.');
      }
      return response.result.storedRecords;
    });
  }

  exportBackup() {
    return this.request({ type: 'exportBackup' }).then((response) => {
      if (response.type !== 'exportBackup') {
        throw new Error('Unexpected exportBackup response.');
      }
      const validation = validateBrowserStorageBackup(response.result);
      if (!validation.ok) {
        throw new Error('Malformed exportBackup response.');
      }
      return validation.backup;
    });
  }

  importBackup(backup: BrowserStorageJsonBackup) {
    return this.request({ type: 'importBackup', backup }).then((response) => {
      if (response.type !== 'importBackup') {
        throw new Error('Unexpected importBackup response.');
      }
      if (!isNonNegativeSafeInteger(response.result.importedRecords)) {
        throw new Error('Malformed importBackup response.');
      }
      return response.result.importedRecords;
    });
  }

  persistSenaState(state: BrowserSenaPersistState) {
    return this.request({ type: 'persistSenaState', state }).then((response) => {
      if (response.type !== 'persistSenaState') {
        throw new Error('Unexpected persistSenaState response.');
      }
      if (!isNonNegativeSafeInteger(response.result.storedTables)) {
        throw new Error('Malformed persistSenaState response.');
      }
      return response.result.storedTables;
    });
  }

  clear() {
    return this.request({ type: 'clear' }).then((response) => {
      if (response.type !== 'clear') {
        throw new Error('Unexpected clear response.');
      }
      if (response.result.cleared !== true) {
        throw new Error('Malformed clear response.');
      }
    });
  }

  seedDemo() {
    return this.importBackup(createBrowserDemoSeedBackup());
  }

  close() {
    if (this.#closed) {
      return;
    }
    this.#closed = true;
    this.worker.removeEventListener('message', this.#handleMessage);
    this.worker.removeEventListener('error', this.#handleError);
    this.worker.terminate();
    for (const pending of this.#pending.values()) {
      pending.reject(new Error('Browser storage worker was closed.'));
    }
    this.#pending.clear();
  }

  request(request: BrowserStorageWorkerRequest): Promise<BrowserStorageWorkerResult> {
    if (this.#closed) {
      return Promise.reject(new Error('Browser storage worker was closed.'));
    }
    const id = this.#nextId;
    this.#nextId += 1;
    const envelope: BrowserStorageWorkerEnvelope = { id, request };
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      try {
        this.worker.postMessage(envelope);
      } catch (error) {
        this.#pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  #handleMessage = (event: MessageEvent<BrowserStorageWorkerResponse>) => {
    const responseId = readWorkerResponseId(event.data);
    if (responseId == null) {
      return;
    }

    const pending = this.#pending.get(responseId);
    if (!pending) {
      return;
    }
    this.#pending.delete(responseId);

    if (!isBrowserStorageWorkerResponse(event.data)) {
      pending.reject(new Error('Browser storage worker returned a malformed response.'));
      return;
    }

    const message = event.data;
    if (message.ok) {
      pending.resolve(message.response);
    } else {
      pending.reject(new Error(message.error));
    }
  };

  #handleError = (event: ErrorEvent) => {
    const error = new Error(event.message || 'Browser storage worker failed.');
    this.#closed = true;
    this.worker.removeEventListener('message', this.#handleMessage);
    this.worker.removeEventListener('error', this.#handleError);
    for (const pending of this.#pending.values()) {
      pending.reject(error);
    }
    this.#pending.clear();
  };
}

function createDefaultWorker(): Worker {
  return new Worker(new URL('./sqlite-worker.ts', import.meta.url), {
    type: 'module',
    name: 'kaur-khor-browser-storage',
  });
}

export async function openBrowserStorage(
  options: OpenBrowserStorageOptions = {},
): Promise<BrowserStorageHandle> {
  const capability = detectBrowserStorageCapability();
  if (capability.status !== 'supported') {
    return { status: 'unsupported', capability };
  }

  const worker = (options.workerFactory ?? createDefaultWorker)();
  const bootstrap = new BrowserStorageClient(
    capability,
    {
      databaseName: options.databaseName ?? KAUR_KHOR_BROWSER_APP_DATABASE,
      filename: options.databaseName ?? KAUR_KHOR_BROWSER_APP_DATABASE,
      sqliteVersion: 'pending',
      vfs: 'opfs-sahpool',
    },
    worker,
  );

  try {
    const response = await bootstrap.request({
      type: 'init',
      databaseName: options.databaseName ?? KAUR_KHOR_BROWSER_APP_DATABASE,
    });
    if (response.type !== 'init') {
      throw new Error('Unexpected init response.');
    }
    if (!isBrowserStorageInitResult(response.result)) {
      throw new Error('Malformed init response.');
    }
    bootstrap.init = response.result;
    return bootstrap;
  } catch (error) {
    bootstrap.close();
    throw error;
  }
}
