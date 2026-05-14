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

  it('rejects backups for a different browser database before replacing records', () => {
    expect(sqliteWorkerSource).toContain('validation.backup.databaseName !== databaseName');
    expect(sqliteWorkerSource).toContain('throw new Error(`Backup is for ${validation.backup.databaseName}, not ${databaseName}.`);');
  });
});
