import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import { detectBrowserStorageCapability, isKaurKhorBrowserDatabaseName } from './capability';
import { KAUR_KHOR_BROWSER_PREFERRED_VFS, KAUR_KHOR_BROWSER_SCHEMA_VERSION, type KaurKhorBrowserDatabaseName } from './constants';
import {
  createBrowserStorageBackup,
  validateBrowserStorageBackup,
  validateBrowserStorageDocumentRecords,
  type BrowserStorageDocumentRecord,
} from './backup';
import { BROWSER_STORAGE_SCHEMA_SQL } from './schema';
import type {
  BrowserStorageInitResult,
  BrowserStorageWorkerEnvelope,
  BrowserStorageWorkerRequest,
  BrowserStorageWorkerResponse,
  BrowserStorageWorkerResult,
} from './protocol';
import type { BrowserSenaPersistState } from './sena-persistence';

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
let databaseName: KaurKhorBrowserDatabaseName | null = null;
let sqliteVersion = '';

function readWorkerEnvelopeId(value: unknown): number | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const id = (value as { id?: unknown }).id;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isWorkerRequest(value: unknown): value is BrowserStorageWorkerRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }

  const request = value as { backup?: unknown; collection?: unknown; databaseName?: unknown; records?: unknown; state?: unknown; type?: unknown };
  switch (request.type) {
    case 'init':
      return typeof request.databaseName === 'string' && isKaurKhorBrowserDatabaseName(request.databaseName);
    case 'listDocuments':
      return request.collection == null || typeof request.collection === 'string';
    case 'putDocuments':
      return Array.isArray(request.records);
    case 'persistSenaState':
      return Boolean(request.state) && typeof request.state === 'object' && !Array.isArray(request.state);
    case 'importBackup':
      return Boolean(request.backup) && typeof request.backup === 'object' && !Array.isArray(request.backup);
    case 'exportBackup':
    case 'clear':
      return true;
    default:
      return false;
  }
}

function readWorkerEnvelope(value: unknown): BrowserStorageWorkerEnvelope | null {
  const id = readWorkerEnvelopeId(value);
  if (id == null || !value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const request = (value as { request?: unknown }).request;
  return isWorkerRequest(request) ? { id, request } : null;
}

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

function parseStoredDocumentJson(record: { collection: string; id: string; json: string }) {
  try {
    return JSON.parse(record.json) as unknown;
  } catch {
    throw new Error(`Stored browser document ${record.collection}/${record.id} contains invalid JSON.`);
  }
}

async function initStorage(name: KaurKhorBrowserDatabaseName): Promise<BrowserStorageInitResult> {
  const capability = detectBrowserStorageCapability(globalThis, { requireWorker: false });
  if (capability.status !== 'supported') {
    throw new Error(capability.reasons.join(' '));
  }
  if (db) {
    if (databaseName !== name) {
      throw new Error(`Browser storage is already initialized for ${databaseName}, not ${name}.`);
    }
    return {
      databaseName,
      filename: db.filename,
      sqliteVersion,
      vfs: KAUR_KHOR_BROWSER_PREFERRED_VFS,
    };
  }

  const sqlite3 = await sqlite3InitModule();
  sqliteVersion = sqlite3.version.libVersion;
  const sahPool = await sqlite3.installOpfsSAHPoolVfs({
    name: KAUR_KHOR_BROWSER_PREFERRED_VFS,
    directory: '.kaur-khor-browser-opfs-sahpool',
    initialCapacity: 8,
  });
  db = new sahPool.OpfsSAHPoolDb(name) as SqliteDatabase;
  databaseName = name;
  db.exec(BROWSER_STORAGE_SCHEMA_SQL);
  db.exec(`PRAGMA user_version = ${KAUR_KHOR_BROWSER_SCHEMA_VERSION};`);

  return {
    databaseName: name,
    filename: db.filename,
    sqliteVersion,
    vfs: KAUR_KHOR_BROWSER_PREFERRED_VFS,
  };
}

function listDocuments(collection?: string): BrowserStorageDocumentRecord[] {
  const rows: unknown[] = [];
  const sql = collection
    ? 'SELECT collection, id, json, updated_at AS updatedAt FROM kaur_khor_documents WHERE collection = $collection ORDER BY collection, id'
    : 'SELECT collection, id, json, updated_at AS updatedAt FROM kaur_khor_documents ORDER BY collection, id';
  assertDb().exec({
    sql,
    bind: collection ? { $collection: collection } : undefined,
    rowMode: 'object',
    returnValue: 'resultRows',
    resultRows: rows,
  });
  const records = rows.map((row) => {
    const record = row as { collection: string; id: string; json: string; updatedAt: string };
    return {
      collection: record.collection,
      id: record.id,
      json: parseStoredDocumentJson(record),
      updatedAt: record.updatedAt,
    };
  });
  const validation = validateBrowserStorageDocumentRecords(records);
  if (!validation.ok) {
    throw new Error(validation.errors.join(' '));
  }
  return validation.records;
}

function putDocuments(records: BrowserStorageDocumentRecord[]) {
  const validation = validateBrowserStorageDocumentRecords(records);
  if (!validation.ok) {
    throw new Error(validation.errors.join(' '));
  }
  const storage = assertDb();
  return runStorageTransaction(storage, () => insertDocumentsUnlocked(storage, validation.records));
}

function insertDocumentsUnlocked(storage: SqliteDatabase, records: BrowserStorageDocumentRecord[]) {
  for (const record of records) {
    storage.exec({
      sql: `
        INSERT INTO kaur_khor_documents(collection, id, json, updated_at)
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
  return records.length;
}

function runStorageTransaction<T>(storage: SqliteDatabase, task: () => T) {
  storage.exec('BEGIN IMMEDIATE;');
  try {
    const result = task();
    storage.exec('COMMIT;');
    return result;
  } catch (error) {
    storage.exec('ROLLBACK;');
    throw error;
  }
}

function upsertJsonTable(
  storage: SqliteDatabase,
  sql: string,
  bind: Record<string, unknown>,
) {
  storage.exec({
    sql,
    bind,
  });
}

function persistSenaState(state: BrowserSenaPersistState) {
  const storage = assertDb();
  const updatedAt = nowIso();
  storage.exec('BEGIN IMMEDIATE;');
  try {
    upsertJsonTable(storage, `
      INSERT INTO app_metadata(key, value_json, updated_at)
      VALUES ('context', json($json), $updatedAt)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `, {
      $json: jsonStringify(state.appContext),
      $updatedAt: updatedAt,
    });
    upsertJsonTable(storage, `
      INSERT INTO preferences(key, value_json, updated_at)
      VALUES ('current', json($json), $updatedAt)
      ON CONFLICT(key) DO UPDATE SET
        value_json = excluded.value_json,
        updated_at = excluded.updated_at
    `, {
      $json: jsonStringify(state.preferences),
      $updatedAt: updatedAt,
    });
    upsertJsonTable(storage, `
      INSERT INTO catalog(singleton_id, catalog_json, updated_at)
      VALUES ('current', json($json), $updatedAt)
      ON CONFLICT(singleton_id) DO UPDATE SET
        catalog_json = excluded.catalog_json,
        updated_at = excluded.updated_at
    `, {
      $json: jsonStringify(state.catalog),
      $updatedAt: updatedAt,
    });
    storage.exec('DELETE FROM observations;');
    for (const observation of state.observations) {
      upsertJsonTable(storage, `
        INSERT INTO observations(observation_id, observed_at, observation_json, created_at, updated_at)
        VALUES ($observationId, $observedAt, json($json), $createdAt, $updatedAt)
      `, {
        $observationId: observation.observationId,
        $observedAt: observation.input.observedAt,
        $json: jsonStringify(observation),
        $createdAt: observation.input.observedAt,
        $updatedAt: updatedAt,
      });
    }
    storage.exec('DELETE FROM order_batches;');
    for (const batch of state.orderBatches) {
      upsertJsonTable(storage, `
        INSERT INTO order_batches(batch_order_id, supplier_name, status, order_batch_json, created_at, updated_at)
        VALUES ($batchOrderId, $supplierName, $status, json($json), $createdAt, $updatedAt)
      `, {
        $batchOrderId: batch.batchOrderId,
        $supplierName: batch.supplierName,
        $status: batch.status,
        $json: jsonStringify(batch),
        $createdAt: batch.createdAt,
        $updatedAt: batch.updatedAt,
      });
    }
    upsertJsonTable(storage, `
      INSERT INTO analysis_runs(run_id, status, created_at, completed_at, run_json)
      VALUES ($runId, $status, $createdAt, $completedAt, json($json))
      ON CONFLICT(run_id) DO UPDATE SET
        status = excluded.status,
        completed_at = excluded.completed_at,
        run_json = excluded.run_json
    `, {
      $runId: state.latestRun.runId,
      $status: state.latestRun.status,
      $createdAt: state.latestRun.createdAt,
      $completedAt: state.latestRun.completedAt,
      $json: jsonStringify(state.latestRun),
    });
    upsertJsonTable(storage, `
      INSERT INTO workspace_summary_cache(singleton_id, summary_json, updated_at)
      VALUES ('current', json($json), $updatedAt)
      ON CONFLICT(singleton_id) DO UPDATE SET
        summary_json = excluded.summary_json,
        updated_at = excluded.updated_at
    `, {
      $json: jsonStringify(state.workspaceSummary),
      $updatedAt: updatedAt,
    });
    upsertJsonTable(storage, `
      INSERT INTO diagnostics_cache(singleton_id, diagnostics_json, updated_at)
      VALUES ('latest', json($json), $updatedAt)
      ON CONFLICT(singleton_id) DO UPDATE SET
        diagnostics_json = excluded.diagnostics_json,
        updated_at = excluded.updated_at
    `, {
      $json: jsonStringify(state.diagnostics),
      $updatedAt: updatedAt,
    });
    storage.exec('DELETE FROM sku_detail_cache;');
    for (const [skuId, detail] of Object.entries(state.skuDetails)) {
      upsertJsonTable(storage, `
        INSERT INTO sku_detail_cache(sku_id, detail_json, updated_at)
        VALUES ($skuId, json($json), $updatedAt)
      `, {
        $skuId: skuId,
        $json: jsonStringify(detail),
        $updatedAt: updatedAt,
      });
    }
    storage.exec('DELETE FROM service_detail_cache;');
    for (const [serviceId, detail] of Object.entries(state.serviceDetails)) {
      upsertJsonTable(storage, `
        INSERT INTO service_detail_cache(service_id, detail_json, updated_at)
        VALUES ($serviceId, json($json), $updatedAt)
      `, {
        $serviceId: serviceId,
        $json: jsonStringify(detail),
        $updatedAt: updatedAt,
      });
    }
    upsertJsonTable(storage, `
      INSERT INTO automation_workspace(singleton_id, workspace_json, updated_at)
      VALUES ('current', json($json), $updatedAt)
      ON CONFLICT(singleton_id) DO UPDATE SET
        workspace_json = excluded.workspace_json,
        updated_at = excluded.updated_at
    `, {
      $json: jsonStringify(state.automation),
      $updatedAt: updatedAt,
    });
    storage.exec('COMMIT;');
    return 11;
  } catch (error) {
    storage.exec('ROLLBACK;');
    throw error;
  }
}

function clearDocuments() {
  const storage = assertDb();
  runStorageTransaction(storage, () => {
    clearDocumentsUnlocked(storage);
  });
}

function clearDocumentsUnlocked(storage: SqliteDatabase) {
  storage.exec('DELETE FROM kaur_khor_documents;');
  storage.exec('DELETE FROM app_metadata;');
  storage.exec('DELETE FROM preferences;');
  storage.exec('DELETE FROM catalog;');
  storage.exec('DELETE FROM observations;');
  storage.exec('DELETE FROM order_batches;');
  storage.exec('DELETE FROM analysis_runs;');
  storage.exec('DELETE FROM workspace_summary_cache;');
  storage.exec('DELETE FROM diagnostics_cache;');
  storage.exec('DELETE FROM sku_detail_cache;');
  storage.exec('DELETE FROM service_detail_cache;');
  storage.exec('DELETE FROM automation_workspace;');
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
  if (databaseName && validation.backup.databaseName !== databaseName) {
    throw new Error(`Backup is for ${validation.backup.databaseName}, not ${databaseName}.`);
  }
  const storage = assertDb();
  return runStorageTransaction(storage, () => {
    clearDocumentsUnlocked(storage);
    return insertDocumentsUnlocked(storage, validation.backup.records);
  });
}

async function handle(request: BrowserStorageWorkerRequest): Promise<BrowserStorageWorkerResult> {
  switch (request.type) {
    case 'init':
      return { type: 'init', result: await initStorage(request.databaseName) };
    case 'listDocuments':
      return { type: 'listDocuments', result: listDocuments(request.collection) };
    case 'putDocuments':
      return { type: 'putDocuments', result: { storedRecords: putDocuments(request.records) } };
    case 'persistSenaState':
      return { type: 'persistSenaState', result: { storedTables: persistSenaState(request.state) } };
    case 'exportBackup':
      return { type: 'exportBackup', result: exportBackup() };
    case 'importBackup':
      return { type: 'importBackup', result: { importedRecords: importBackup(request.backup) } };
    case 'clear':
      clearDocuments();
      return { type: 'clear', result: { cleared: true } };
    default:
      throw new Error('Unsupported browser storage request.');
  }
}

self.addEventListener('message', (event: MessageEvent<unknown>) => {
  const id = readWorkerEnvelopeId(event.data);
  if (id == null) {
    return;
  }

  const envelope = readWorkerEnvelope(event.data);
  if (!envelope) {
    post({ id, ok: false, error: 'Malformed browser storage request.' });
    return;
  }

  void handle(envelope.request)
    .then((response) => post({ id: envelope.id, ok: true, response }))
    .catch((error: unknown) => post({
      id: envelope.id,
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      capability: detectBrowserStorageCapability(globalThis, { requireWorker: false }),
    }));
});
