import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BrowserStorageClient,
  isBrowserStorageWorkerResponse,
  openBrowserStorage,
} from './client';
import {
  KAUR_KHOR_BROWSER_APP_DATABASE,
  KAUR_KHOR_BROWSER_DEMO_DATABASE,
  KAUR_KHOR_BROWSER_PREFERRED_VFS,
  KAUR_KHOR_BROWSER_SCHEMA_VERSION,
} from './constants';

class FakeStorageWorker extends EventTarget {
  readonly postMessage = vi.fn();
  readonly terminate = vi.fn();
}

function createClient(worker = new FakeStorageWorker()) {
  const client = new BrowserStorageClient(
    {
      status: 'supported',
      preferredVfs: KAUR_KHOR_BROWSER_PREFERRED_VFS,
      databaseNames: {
        app: KAUR_KHOR_BROWSER_APP_DATABASE,
        demo: KAUR_KHOR_BROWSER_DEMO_DATABASE,
      },
      reasons: [],
      details: {
        hasWorker: true,
        hasWebAssembly: true,
        hasNavigatorStorage: true,
        hasOpfsDirectory: true,
        isSecureContext: true,
        crossOriginIsolated: false,
      },
    },
    {
      databaseName: KAUR_KHOR_BROWSER_APP_DATABASE,
      filename: KAUR_KHOR_BROWSER_APP_DATABASE,
      sqliteVersion: 'pending',
      vfs: 'opfs-sahpool',
    },
    worker as unknown as Worker,
  );

  return { client, worker };
}

function dispatchWorkerMessage(worker: FakeStorageWorker, data: unknown) {
  worker.dispatchEvent(new MessageEvent('message', { data }));
}

describe('BrowserStorageClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects requests when posting to the worker fails', async () => {
    const worker = new FakeStorageWorker();
    worker.postMessage.mockImplementation(() => {
      throw new Error('DataCloneError');
    });
    const { client } = createClient(worker);

    await expect(client.listDocuments()).rejects.toThrow('DataCloneError');
  });

  it('rejects new requests after the worker client is closed', async () => {
    const { client, worker } = createClient();

    client.close();
    client.close();

    expect(worker.terminate).toHaveBeenCalledTimes(1);
    await expect(client.listDocuments()).rejects.toThrow('Browser storage worker was closed.');
    expect(worker.postMessage).not.toHaveBeenCalled();
  });

  it('rejects pending and future requests after the worker fails', async () => {
    const { client, worker } = createClient();
    const request = client.listDocuments();

    worker.dispatchEvent(new ErrorEvent('error', { message: 'worker failed' }));

    await expect(request).rejects.toThrow('worker failed');
    await expect(client.exportBackup()).rejects.toThrow('Browser storage worker was closed.');
    expect(worker.postMessage).toHaveBeenCalledTimes(1);
  });

  it('rejects pending requests when the worker returns a malformed matching response', async () => {
    const { client, worker } = createClient();
    const request = client.listDocuments();

    dispatchWorkerMessage(worker, { id: 1, ok: 'true', response: { type: 'listDocuments', result: [] } });

    await expect(request).rejects.toThrow('Browser storage worker returned a malformed response.');
  });

  it('ignores malformed worker messages without a matching request id', async () => {
    const { client, worker } = createClient();
    const request = client.listDocuments();

    dispatchWorkerMessage(worker, null);
    dispatchWorkerMessage(worker, { id: 1, ok: true, response: { type: 'listDocuments', result: [] } });

    await expect(request).resolves.toEqual([]);
  });

  it('rejects method responses with malformed result payloads', async () => {
    const { client, worker } = createClient();
    const listRequest = client.listDocuments();
    dispatchWorkerMessage(worker, { id: 1, ok: true, response: { type: 'listDocuments', result: 'not-records' } });
    await expect(listRequest).rejects.toThrow('Malformed listDocuments response.');

    const putRequest = client.putDocuments([]);
    dispatchWorkerMessage(worker, { id: 2, ok: true, response: { type: 'putDocuments', result: { storedRecords: -1 } } });
    await expect(putRequest).rejects.toThrow('Malformed putDocuments response.');

    const importRequest = client.importBackup({
      format: 'kaur-khor.browser.storage.backup',
      version: 1,
      databaseName: KAUR_KHOR_BROWSER_APP_DATABASE,
      schemaVersion: KAUR_KHOR_BROWSER_SCHEMA_VERSION,
      exportedAt: '2026-05-01T00:00:00.000Z',
      records: [],
    });
    dispatchWorkerMessage(worker, { id: 3, ok: true, response: { type: 'importBackup', result: {} } });
    await expect(importRequest).rejects.toThrow('Malformed importBackup response.');

    const clearRequest = client.clear();
    dispatchWorkerMessage(worker, { id: 4, ok: true, response: { type: 'clear', result: { cleared: false } } });
    await expect(clearRequest).rejects.toThrow('Malformed clear response.');
  });

  it('rejects malformed init responses before marking storage ready', async () => {
    const worker = new FakeStorageWorker();
    vi.stubGlobal('Worker', FakeStorageWorker);
    vi.stubGlobal('isSecureContext', true);
    vi.stubGlobal('navigator', {
      storage: {
        getDirectory: vi.fn(),
      },
    });

    const storageRequest = openBrowserStorage({ workerFactory: () => worker as unknown as Worker });

    dispatchWorkerMessage(worker, {
      id: 1,
      ok: true,
      response: {
        type: 'init',
        result: {
          databaseName: KAUR_KHOR_BROWSER_APP_DATABASE,
          filename: '',
          sqliteVersion: 'pending',
          vfs: 'opfs-sahpool',
        },
      },
    });

    await expect(storageRequest).rejects.toThrow('Malformed init response.');
    expect(worker.terminate).toHaveBeenCalledTimes(1);
  });

  it('returns normalized document records from worker responses', async () => {
    const { client, worker } = createClient();
    const request = client.listDocuments();

    dispatchWorkerMessage(worker, {
      id: 1,
      ok: true,
      response: {
        type: 'listDocuments',
        result: [{
          collection: ' preferences ',
          id: ' current ',
          json: { language: 'en' },
          updatedAt: '2026-05-01T00:00:00.000Z',
        }],
      },
    });

    await expect(request).resolves.toEqual([{
      collection: 'preferences',
      id: 'current',
      json: { language: 'en' },
      updatedAt: '2026-05-01T00:00:00.000Z',
    }]);
  });

  it('returns normalized backup records from worker export responses', async () => {
    const { client, worker } = createClient();
    const request = client.exportBackup();

    dispatchWorkerMessage(worker, {
      id: 1,
      ok: true,
      response: {
        type: 'exportBackup',
        result: {
          format: 'kaur-khor.browser.storage.backup',
          version: 1,
          databaseName: KAUR_KHOR_BROWSER_APP_DATABASE,
          schemaVersion: KAUR_KHOR_BROWSER_SCHEMA_VERSION,
          exportedAt: '2026-05-01T00:01:00.000Z',
          records: [{
            collection: ' browser_state ',
            id: ' current ',
            json: { ok: true },
            updatedAt: '2026-05-01T00:00:00.000Z',
          }],
        },
      },
    });

    await expect(request).resolves.toMatchObject({
      records: [{
        collection: 'browser_state',
        id: 'current',
      }],
    });
  });

  it('accepts only well-formed worker response envelopes', () => {
    expect(isBrowserStorageWorkerResponse({
      id: 1,
      ok: true,
      response: { type: 'clear', result: { cleared: true } },
    })).toBe(true);
    expect(isBrowserStorageWorkerResponse({ id: 2, ok: false, error: 'failed' })).toBe(true);

    expect(isBrowserStorageWorkerResponse({ id: '1', ok: true, response: { type: 'clear' } })).toBe(false);
    expect(isBrowserStorageWorkerResponse({ id: 1, ok: 'true', response: { type: 'clear' } })).toBe(false);
    expect(isBrowserStorageWorkerResponse({ id: 1, ok: false, error: { message: 'failed' } })).toBe(false);
    expect(isBrowserStorageWorkerResponse({ id: 1, ok: true, response: null })).toBe(false);
  });
});
