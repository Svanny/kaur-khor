import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { detectBrowserStorageCapability } from './capability';
import { BANJI_BROWSER_PREFERRED_VFS, BANJI_BROWSER_SCHEMA_VERSION, type BanjiBrowserDatabaseName } from './constants';
import { createBrowserStorageBackup, validateBrowserStorageBackup, type BrowserStorageDocumentRecord } from './backup';
import { BROWSER_STORAGE_SCHEMA_SQL } from './schema';
import type {
  BrowserStorageInitResult,
  BrowserStorageWorkerEnvelope,
  BrowserStorageWorkerRequest,
  BrowserStorageWorkerResponse,
  BrowserStorageWorkerResult,
} from './protocol';

type SqliteDatabase = {
  filename: string;
  exec: (args: string | {
    sql: string;
    bind?: Record<string, unknown> | unknown[];
    rowMode?: 'object' | 'array' | 'scalar';
    returnValue?: 'resultRows';
    resultRows?: unknown[];
  }) => unknown;
  close: () => void;
};

let db: SqliteDatabase | null = null;
let databaseName: BanjiBrowserDatabaseName | null = null;
let sqliteVersion = '';

function post(response: BrowserStorageWorkerResponse) {
  self.postMessage(response);
}

function nowIso() {
  return new Date().toISOString();
}

function assertDb(): SqliteDatabase {
  if (!db) {
    throw new Error('Browser storage has not been initialized.');
  }
  return db;
}

function jsonStringify(value: unknown) {
  return JSON.stringify(value);
}

async function initStorage(name: BanjiBrowserDatabaseName): Promise<BrowserStorageInitResult> {
  const capability = detectBrowserStorageCapability(globalThis, { requireWorker: false });
  if (capability.status !== 'supported') {
    throw new Error(capability.reasons.join(' '));
  }
  if (db) {
    return {
      databaseName: name,
      filename: db.filename,
      sqliteVersion,
      vfs: BANJI_BROWSER_PREFERRED_VFS,
    };
  }

  const sqlite3 = await sqlite3InitModule();
  sqliteVersion = sqlite3.version.libVersion;
  const sahPool = await sqlite3.installOpfsSAHPoolVfs({
    name: BANJI_BROWSER_PREFERRED_VFS,
    directory: '.banji-browser-opfs-sahpool',
    initialCapacity: 8,
  });
  db = new sahPool.OpfsSAHPoolDb(name) as SqliteDatabase;
  databaseName = name;
  db.exec(BROWSER_STORAGE_SCHEMA_SQL);
  db.exec(`PRAGMA user_version = ${BANJI_BROWSER_SCHEMA_VERSION};`);

  return {
    databaseName: name,
    filename: db.filename,
    sqliteVersion,
    vfs: BANJI_BROWSER_PREFERRED_VFS,
  };
}

function listDocuments(collection?: string): BrowserStorageDocumentRecord[] {
  const rows: unknown[] = [];
  const sql = collection
    ? 'SELECT collection, id, json, updated_at AS updatedAt FROM banji_documents WHERE collection = $collection ORDER BY collection, id'
    : 'SELECT collection, id, json, updated_at AS updatedAt FROM banji_documents ORDER BY collection, id';
  assertDb().exec({
    sql,
    bind: collection ? { $collection: collection } : undefined,
    rowMode: 'object',
    returnValue: 'resultRows',
    resultRows: rows,
  });
  return rows.map((row) => {
    const record = row as { collection: string; id: string; json: string; updatedAt: string };
    return {
      collection: record.collection,
      id: record.id,
      json: JSON.parse(record.json),
      updatedAt: record.updatedAt,
    };
  });
}

function putDocuments(records: BrowserStorageDocumentRecord[]) {
  const storage = assertDb();
  storage.exec('BEGIN IMMEDIATE;');
  try {
    for (const record of records) {
      storage.exec({
        sql: `
          INSERT INTO banji_documents(collection, id, json, updated_at)
          VALUES ($collection, $id, json($json), $updatedAt)
          ON CONFLICT(collection, id) DO UPDATE SET
            json = excluded.json,
            updated_at = excluded.updated_at
        `,
        bind: {
          $collection: record.collection,
          $id: record.id,
          $json: jsonStringify(record.json),
          $updatedAt: record.updatedAt,
        },
      });
    }
    storage.exec('COMMIT;');
    return records.length;
  } catch (error) {
    storage.exec('ROLLBACK;');
    throw error;
  }
}

function clearDocuments() {
  assertDb().exec('DELETE FROM banji_documents;');
}

function exportBackup() {
  if (!databaseName) {
    throw new Error('Browser storage has not been initialized.');
  }
  return createBrowserStorageBackup(databaseName, listDocuments(), nowIso());
}

function importBackup(requestedBackup: unknown) {
  const validation = validateBrowserStorageBackup(requestedBackup);
  if (!validation.ok) {
    throw new Error(validation.errors.join(' '));
  }
  clearDocuments();
  return putDocuments(validation.backup.records);
}

async function handle(request: BrowserStorageWorkerRequest): Promise<BrowserStorageWorkerResult> {
  switch (request.type) {
    case 'init':
      return { type: 'init', result: await initStorage(request.databaseName) };
    case 'listDocuments':
      return { type: 'listDocuments', result: listDocuments(request.collection) };
    case 'putDocuments':
      return { type: 'putDocuments', result: { storedRecords: putDocuments(request.records) } };
    case 'exportBackup':
      return { type: 'exportBackup', result: exportBackup() };
    case 'importBackup':
      return { type: 'importBackup', result: { importedRecords: importBackup(request.backup) } };
    case 'clear':
      clearDocuments();
      return { type: 'clear', result: { cleared: true } };
  }
}

self.addEventListener('message', (event: MessageEvent<BrowserStorageWorkerEnvelope>) => {
  void handle(event.data.request)
    .then((response) => post({ id: event.data.id, ok: true, response }))
    .catch((error: unknown) => post({
      id: event.data.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      capability: detectBrowserStorageCapability(globalThis, { requireWorker: false }),
    }));
});
