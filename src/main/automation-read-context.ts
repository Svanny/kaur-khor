import type { SenaCatalog, SenaObservationRecord } from '@shared/sena';

export interface AutomationReadContextDeps {
  loadCachedSenaRead: <T>(key: string, loader: () => Promise<T>) => Promise<T>;
  invoke: <T>(command: string, payload: undefined, options: { timeoutMs: number }) => Promise<T>;
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
    }),
  );
}

export async function loadAutomationWorkspaceContext(deps: AutomationReadContextDeps) {
  const [catalog, observations] = await Promise.all([
    loadAutomationCatalog(deps),
    loadAutomationObservations(deps),
  ]);
  return { catalog, observations };
}
