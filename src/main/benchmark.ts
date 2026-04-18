import { appendFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  isTruthyBenchmarkEnvValue,
  type BanjiBenchmarkCategory,
  type BanjiBenchmarkEvent,
  type BanjiBenchmarkEventInput,
} from '@shared/benchmark';

const DEFAULT_RUN_ID = `local-${Date.now()}`;

let cachedRunId: string | null = null;
let cachedOutputDirectory: string | null = null;

export function benchmarkEnabled() {
  return isTruthyBenchmarkEnvValue(process.env.BANJI_BENCHMARK);
}

export function benchmarkTraceEnabled() {
  return isTruthyBenchmarkEnvValue(process.env.BANJI_BENCHMARK_TRACE);
}

export function benchmarkRunId() {
  cachedRunId ??= process.env.BANJI_BENCHMARK_RUN_ID?.trim() || DEFAULT_RUN_ID;
  return cachedRunId;
}

export function benchmarkOutputDirectory() {
  cachedOutputDirectory ??= resolve(
    process.env.BANJI_BENCHMARK_OUTPUT_DIR?.trim() || join(process.cwd(), 'bench-results', benchmarkRunId()),
  );
  return cachedOutputDirectory;
}

function eventStreamPath() {
  return join(benchmarkOutputDirectory(), 'events.jsonl');
}

export function normalizeBenchmarkEvent(event: BanjiBenchmarkEventInput): BanjiBenchmarkEvent {
  return {
    ...event,
    runId: event.runId ?? benchmarkRunId(),
    ts: event.ts ?? Date.now(),
    route: event.route ?? null,
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    command: event.command ?? null,
    durationMs: event.durationMs ?? null,
  };
}

export function recordBenchmarkEvent(event: BanjiBenchmarkEventInput) {
  if (!benchmarkEnabled()) {
    return;
  }

  const normalized = normalizeBenchmarkEvent(event);
  try {
    mkdirSync(benchmarkOutputDirectory(), { recursive: true });
    appendFileSync(eventStreamPath(), `${JSON.stringify(normalized)}\n`, 'utf8');
  } catch (error) {
    console.warn('[benchmark] failed to write event', error);
  }
}

export function recordExternalBenchmarkEvent(event: BanjiBenchmarkEvent) {
  if (!benchmarkEnabled()) {
    return;
  }
  recordBenchmarkEvent({
    ...event,
    runId: event.runId || benchmarkRunId(),
    ts: event.ts || Date.now(),
  });
}

export function startBenchmarkSpan({
  category,
  name,
  layer = 'main',
  detail,
  command,
}: {
  category: BanjiBenchmarkCategory;
  name: string;
  layer?: BanjiBenchmarkEvent['layer'];
  detail?: Record<string, unknown>;
  command?: string | null;
}) {
  if (!benchmarkEnabled()) {
    return () => undefined;
  }

  const startedAt = Date.now();
  recordBenchmarkEvent({
    layer,
    category,
    name,
    phase: 'start',
    command,
    detail,
  });

  return (endDetail?: Record<string, unknown>) => {
    recordBenchmarkEvent({
      layer,
      category,
      name,
      phase: 'end',
      command,
      durationMs: Date.now() - startedAt,
      detail: {
        ...(detail ?? {}),
        ...(endDetail ?? {}),
      },
    });
  };
}

export function snapshotProcessMemory(name: string, detail?: Record<string, unknown>) {
  if (!benchmarkEnabled()) {
    return;
  }

  const memory = process.memoryUsage();
  recordBenchmarkEvent({
    layer: 'main',
    category: 'memory',
    name,
    phase: 'instant',
    detail: {
      rssMb: memory.rss / 1024 / 1024,
      heapUsedMb: memory.heapUsed / 1024 / 1024,
      heapTotalMb: memory.heapTotal / 1024 / 1024,
      externalMb: memory.external / 1024 / 1024,
      ...(detail ?? {}),
    },
  });
}
