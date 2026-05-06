import { createMockState } from '@/dev/browser-desktop-bridge';
import { KAUR_KHOR_BROWSER_DEMO_DATABASE } from './constants';
import {
  createBrowserStorageBackup,
  type BrowserStorageDocumentRecord,
  type BrowserStorageJsonBackup,
} from './backup';

type MockState = ReturnType<typeof createMockState>;

function record(collection: string, id: string, json: unknown, updatedAt: string): BrowserStorageDocumentRecord {
  return { collection, id, json, updatedAt };
}

export function createBrowserDemoSeedRecords(
  state: MockState = createMockState(),
  seededAt = new Date().toISOString(),
): BrowserStorageDocumentRecord[] {
  return [
    record('app_context', 'current', state.appContext, seededAt),
    record('preferences', 'current', state.preferences, seededAt),
    record('catalog', 'current', state.catalog, seededAt),
    record('workspace_summary', 'current', state.workspaceSummary, seededAt),
    record('diagnostics', 'latest', state.diagnostics, seededAt),
    record('analysis_runs', state.latestRun.runId, state.latestRun, state.latestRun.createdAt),
    ...state.observations.map((observation) => (
      record('observations', observation.observationId, observation, observation.input.observedAt)
    )),
    ...state.orderBatches.map((batch) => (
      record('order_batches', batch.batchOrderId, batch, batch.updatedAt)
    )),
    ...Object.entries(state.skuDetails).map(([skuId, detail]) => (
      record('sku_details', skuId, detail, seededAt)
    )),
    ...Object.entries(state.serviceDetails).map(([serviceId, detail]) => (
      record('service_details', serviceId, detail, seededAt)
    )),
    record('automation', 'workspace', state.automation, seededAt),
    ...Object.entries(state.automationMessages).map(([conversationId, messages]) => (
      record('automation_messages', conversationId, messages, seededAt)
    )),
  ];
}

export function createBrowserDemoSeedBackup(
  state: MockState = createMockState(),
  seededAt = new Date().toISOString(),
): BrowserStorageJsonBackup {
  return createBrowserStorageBackup(
    KAUR_KHOR_BROWSER_DEMO_DATABASE,
    createBrowserDemoSeedRecords(state, seededAt),
    seededAt,
  );
}

