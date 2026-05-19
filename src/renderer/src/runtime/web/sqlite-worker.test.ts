import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sqliteWorkerSource = readFileSync(
  resolve(process.cwd(), 'src/renderer/src/runtime/web/sqlite-worker.ts'),
  'utf8',
);

describe('browser sqlite worker persistence guards', () => {
  it('imports backups by clearing and inserting records in one transaction', () => {
    expect(sqliteWorkerSource).toContain('function runStorageTransaction<T>');
    expect(sqliteWorkerSource).toContain('clearDocumentsUnlocked(storage);');
    expect(sqliteWorkerSource).toContain('return insertDocumentsUnlocked(storage, validation.backup.records);');
    expect(sqliteWorkerSource).toMatch(
      /return runStorageTransaction\(storage, \(\) => \{\s+clearDocumentsUnlocked\(storage\);\s+return insertDocumentsUnlocked\(storage, validation\.backup\.records\);/s,
    );
  });

  it('validates direct document writes before inserting records', () => {
    expect(sqliteWorkerSource).toContain('validateBrowserStorageDocumentRecords');
    expect(sqliteWorkerSource).toMatch(
      /function putDocuments\(records: BrowserStorageDocumentRecord\[\]\) \{\s+const validation = validateBrowserStorageDocumentRecords\(records\);\s+if \(!validation\.ok\) \{\s+throw new Error\(validation\.errors\.join\(' '\)\);\s+\}\s+const storage = assertDb\(\);\s+return runStorageTransaction\(storage, \(\) => insertDocumentsUnlocked\(storage, validation\.records\)\);/s,
    );
  });

  it('validates stored document rows before returning them from reads and exports', () => {
    expect(sqliteWorkerSource).toContain('function parseStoredDocumentJson(record: { collection: string; id: string; json: string })');
    expect(sqliteWorkerSource).toContain('throw new Error(`Stored browser document ${record.collection}/${record.id} contains invalid JSON.`);');
    expect(sqliteWorkerSource).toMatch(
      /const records = rows\.map\(\(row\) => \{\s+const record = row as \{ collection: string; id: string; json: string; updatedAt: string \};\s+return \{\s+collection: record\.collection,\s+id: record\.id,\s+json: parseStoredDocumentJson\(record\),\s+updatedAt: record\.updatedAt,\s+\};\s+\}\);\s+const validation = validateBrowserStorageDocumentRecords\(records\);\s+if \(!validation\.ok\) \{\s+throw new Error\(validation\.errors\.join\(' '\)\);\s+\}\s+return validation\.records;/s,
    );
  });

  it('rejects backups for a different browser database before replacing records', () => {
    expect(sqliteWorkerSource).toContain('validation.backup.databaseName !== databaseName');
    expect(sqliteWorkerSource).toContain('throw new Error(`Backup is for ${validation.backup.databaseName}, not ${databaseName}.`);');
  });

  it('rejects reinitializing an open worker against a different browser database', () => {
    expect(sqliteWorkerSource).toContain('if (databaseName !== name)');
    expect(sqliteWorkerSource).toContain('throw new Error(`Browser storage is already initialized for ${databaseName}, not ${name}.`);');
    expect(sqliteWorkerSource).toMatch(
      /if \(db\) \{\s+if \(databaseName !== name\) \{\s+throw new Error\(`Browser storage is already initialized for \$\{databaseName\}, not \$\{name\}\.`\);\s+\}\s+return \{\s+databaseName,/s,
    );
  });

  it('rejects malformed request envelopes before dispatching worker requests', () => {
    expect(sqliteWorkerSource).toContain('function readWorkerEnvelopeId(value: unknown): number | null');
    expect(sqliteWorkerSource).toContain('function isWorkerRequest(value: unknown): value is BrowserStorageWorkerRequest');
    expect(sqliteWorkerSource).toContain("return typeof request.databaseName === 'string' && isKaurKhorBrowserDatabaseName(request.databaseName);");
    expect(sqliteWorkerSource).toContain("return request.collection == null || typeof request.collection === 'string';");
    expect(sqliteWorkerSource).toContain('return Array.isArray(request.records);');
    expect(sqliteWorkerSource).toContain("return Boolean(request.backup) && typeof request.backup === 'object' && !Array.isArray(request.backup);");
    expect(sqliteWorkerSource).toContain("post({ id, ok: false, error: 'Malformed browser storage request.' });");
    expect(sqliteWorkerSource).toMatch(
      /const envelope = readWorkerEnvelope\(event\.data\);\s+if \(!envelope\) \{\s+post\(\{ id, ok: false, error: 'Malformed browser storage request\.' \}\);\s+return;\s+\}\s+void handle\(envelope\.request\)/s,
    );
  });
});
