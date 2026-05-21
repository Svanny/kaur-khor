import type { SenaCatalog, SenaObservationRecord, SenaRecordUpdateContext } from '@shared/sena';

type AutomationReadPriority = 'critical' | 'deferred' | 'background';

export interface AutomationReadContextDeps {
  loadCachedSenaRead: <T>(key: string, loader: () => Promise<T>) => Promise<T>;
  invoke: <T>(
    command: string,
    payload: undefined,
    options: { timeoutMs: number; readPriority?: AutomationReadPriority },
  ) => Promise<T>;
  timeoutMs: number;
}

export async function loadAutomationCatalog({
  loadCachedSenaRead,
  invoke,
  timeoutMs,
}: AutomationReadContextDeps) {
  return loadCachedSenaRead('catalog', () =>
    invoke<SenaCatalog | null>('sena.getCatalog', undefined, {
      timeoutMs,
      readPriority: 'critical',
    }),
  );
}

export async function loadAutomationObservations({
  loadCachedSenaRead,
  invoke,
  timeoutMs,
}: AutomationReadContextDeps) {
  return loadCachedSenaRead('observations', () =>
    invoke<SenaObservationRecord[]>('sena.listObservations', undefined, {
      timeoutMs,
      readPriority: 'background',
    }),
  );
}

export async function loadAutomationRecordUpdateContext({
  loadCachedSenaRead,
  invoke,
  timeoutMs,
}: AutomationReadContextDeps) {
  return loadCachedSenaRead('record-update-context', () =>
    invoke<SenaRecordUpdateContext>('sena.getRecordUpdateContext', undefined, {
      timeoutMs,
      readPriority: 'critical',
    }),
  );
}

export async function loadAutomationWorkspaceContext(deps: AutomationReadContextDeps) {
  const [catalog, recordUpdateContext] = await Promise.all([
    loadAutomationCatalog(deps),
    loadAutomationRecordUpdateContext(deps),
  ]);
  return { catalog, recordUpdateContext };
}
