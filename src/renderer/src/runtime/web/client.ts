import { detectBrowserStorageCapability, type BrowserStorageCapability } from './capability';
import { BANJI_BROWSER_APP_DATABASE, type BanjiBrowserDatabaseName } from './constants';
import type { BrowserStorageDocumentRecord, BrowserStorageJsonBackup } from './backup';
import { createBrowserDemoSeedBackup } from './demo-seed';
import type {
  BrowserStorageInitResult,
  BrowserStorageWorkerEnvelope,
  BrowserStorageWorkerRequest,
  BrowserStorageWorkerResponse,
  BrowserStorageWorkerResult,
} from './protocol';

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
  clear: () => Promise<void>;
  seedDemo: () => Promise<number>;
  close: () => void;
};

export type BrowserStorageHandle = BrowserStorageUnsupportedHandle | BrowserStorageSupportedHandle;

export type OpenBrowserStorageOptions = {
  databaseName?: BanjiBrowserDatabaseName;
  workerFactory?: () => Worker;
};

class BrowserStorageClient implements BrowserStorageSupportedHandle {
  readonly status = 'supported' as const;
  #nextId = 1;
  #pending = new Map<number, PendingRequest>();

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
      return response.result;
    });
  }

  putDocuments(records: BrowserStorageDocumentRecord[]) {
    return this.request({ type: 'putDocuments', records }).then((response) => {
      if (response.type !== 'putDocuments') {
        throw new Error('Unexpected putDocuments response.');
      }
      return response.result.storedRecords;
    });
  }

  exportBackup() {
    return this.request({ type: 'exportBackup' }).then((response) => {
      if (response.type !== 'exportBackup') {
        throw new Error('Unexpected exportBackup response.');
      }
      return response.result;
    });
  }

  importBackup(backup: BrowserStorageJsonBackup) {
    return this.request({ type: 'importBackup', backup }).then((response) => {
      if (response.type !== 'importBackup') {
        throw new Error('Unexpected importBackup response.');
      }
      return response.result.importedRecords;
    });
  }

  clear() {
    return this.request({ type: 'clear' }).then((response) => {
      if (response.type !== 'clear') {
        throw new Error('Unexpected clear response.');
      }
    });
  }

  seedDemo() {
    return this.importBackup(createBrowserDemoSeedBackup());
  }

  close() {
    this.worker.removeEventListener('message', this.#handleMessage);
    this.worker.removeEventListener('error', this.#handleError);
    this.worker.terminate();
    for (const pending of this.#pending.values()) {
      pending.reject(new Error('Browser storage worker was closed.'));
    }
    this.#pending.clear();
  }

  request(request: BrowserStorageWorkerRequest): Promise<BrowserStorageWorkerResult> {
    const id = this.#nextId;
    this.#nextId += 1;
    const envelope: BrowserStorageWorkerEnvelope = { id, request };
    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject });
      this.worker.postMessage(envelope);
    });
  }

  #handleMessage = (event: MessageEvent<BrowserStorageWorkerResponse>) => {
    const message = event.data;
    const pending = this.#pending.get(message.id);
    if (!pending) {
      return;
    }
    this.#pending.delete(message.id);
    if (message.ok) {
      pending.resolve(message.response);
    } else {
      pending.reject(new Error(message.error));
    }
  };

  #handleError = (event: ErrorEvent) => {
    const error = new Error(event.message || 'Browser storage worker failed.');
    for (const pending of this.#pending.values()) {
      pending.reject(error);
    }
    this.#pending.clear();
  };
}

function createDefaultWorker(): Worker {
  return new Worker(new URL('./sqlite-worker.ts', import.meta.url), {
    type: 'module',
    name: 'banji-browser-storage',
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
      databaseName: options.databaseName ?? BANJI_BROWSER_APP_DATABASE,
      filename: options.databaseName ?? BANJI_BROWSER_APP_DATABASE,
      sqliteVersion: 'pending',
      vfs: 'opfs-sahpool',
    },
    worker,
  );

  try {
    const response = await bootstrap.request({
      type: 'init',
      databaseName: options.databaseName ?? BANJI_BROWSER_APP_DATABASE,
    });
    if (response.type !== 'init') {
      throw new Error('Unexpected init response.');
    }
    bootstrap.init = response.result;
    return bootstrap;
  } catch (error) {
    bootstrap.close();
    throw error;
  }
}
