import type { BrowserStorageCapability } from './capability';
import type { BanjiBrowserDatabaseName } from './constants';
import type { BrowserStorageDocumentRecord, BrowserStorageJsonBackup } from './backup';

export type BrowserStorageInitRequest = {
  type: 'init';
  databaseName: BanjiBrowserDatabaseName;
};

export type BrowserStorageExportBackupRequest = {
  type: 'exportBackup';
};

export type BrowserStorageImportBackupRequest = {
  type: 'importBackup';
  backup: BrowserStorageJsonBackup;
};

export type BrowserStorageListDocumentsRequest = {
  type: 'listDocuments';
  collection?: string;
};

export type BrowserStoragePutDocumentsRequest = {
  type: 'putDocuments';
  records: BrowserStorageDocumentRecord[];
};

export type BrowserStorageClearRequest = {
  type: 'clear';
};

export type BrowserStorageWorkerRequest =
  | BrowserStorageInitRequest
  | BrowserStorageExportBackupRequest
  | BrowserStorageImportBackupRequest
  | BrowserStorageListDocumentsRequest
  | BrowserStoragePutDocumentsRequest
  | BrowserStorageClearRequest;

export type BrowserStorageWorkerEnvelope = {
  id: number;
  request: BrowserStorageWorkerRequest;
};

export type BrowserStorageInitResult = {
  databaseName: BanjiBrowserDatabaseName;
  filename: string;
  sqliteVersion: string;
  vfs: 'opfs-sahpool';
};

export type BrowserStorageWorkerResult =
  | { type: 'init'; result: BrowserStorageInitResult }
  | { type: 'exportBackup'; result: BrowserStorageJsonBackup }
  | { type: 'importBackup'; result: { importedRecords: number } }
  | { type: 'listDocuments'; result: BrowserStorageDocumentRecord[] }
  | { type: 'putDocuments'; result: { storedRecords: number } }
  | { type: 'clear'; result: { cleared: true } };

export type BrowserStorageWorkerResponse =
  | {
      id: number;
      ok: true;
      response: BrowserStorageWorkerResult;
    }
  | {
      id: number;
      ok: false;
      error: string;
      capability?: BrowserStorageCapability;
    };

