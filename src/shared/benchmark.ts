export type BanjiBenchmarkLayer = 'renderer' | 'main' | 'preload' | 'core' | 'playwright';

export type BanjiBenchmarkCategory =
  | 'startup'
  | 'navigation'
  | 'interaction'
  | 'ipc'
  | 'core-command'
  | 'memory'
  | 'stability';

export type BanjiBenchmarkPhase = 'instant' | 'start' | 'end';

export interface BanjiBenchmarkEvent {
  runId: string;
  ts: number;
  layer: BanjiBenchmarkLayer;
  category: BanjiBenchmarkCategory;
  name: string;
  phase: BanjiBenchmarkPhase;
  route?: string | null;
  entityType?: 'sku' | 'service' | null;
  entityId?: string | null;
  command?: string | null;
  durationMs?: number | null;
  detail?: Record<string, unknown>;
}

export type BanjiBenchmarkEventInput = Omit<BanjiBenchmarkEvent, 'runId' | 'ts'> & {
  runId?: string;
  ts?: number;
};

export interface BanjiBenchmarkMetadata {
  enabled: boolean;
  runId: string;
}

export function isTruthyBenchmarkEnvValue(value: string | undefined) {
  return value !== undefined && ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function summarizeBenchmarkPayload(payload: unknown): string {
  if (payload === undefined) {
    return 'undefined';
  }
  if (payload === null) {
    return 'null';
  }
  if (Array.isArray(payload)) {
    return `array(len=${payload.length})`;
  }
  if (typeof payload === 'object') {
    const keys = Object.keys(payload as Record<string, unknown>);
    return `object(keys=${keys.slice(0, 8).join(',')}${keys.length > 8 ? ',…' : ''})`;
  }
  return `${typeof payload}(${String(payload)})`;
}
