import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  isTruthyBenchmarkEnvValue,
  type KaurKhorBenchmarkCategory,
  type KaurKhorBenchmarkEvent,
  type KaurKhorBenchmarkEventInput,
} from '@shared/benchmark';

const DEFAULT_RUN_ID = `local-${Date.now()}`;
const DEFAULT_BENCHMARK_EVENT_WAIT_TIMEOUT_MS = 60_000;

let cachedRunId: string | null = null;
let cachedOutputDirectory: string | null = null;
const benchmarkEventCounts = new Map<string, { count: number; lastTs: number | null }>();
let benchmarkEventCountsHydrated = false;
const benchmarkEventWaiters = new Map<string, Array<{
  minimumCount: number;
  resolve: (value: { count: number; ts: number | null }) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}>>();

export function benchmarkEnabled() {
  return isTruthyBenchmarkEnvValue(process.env.KAUR_KHOR_BENCHMARK);
}

export function benchmarkTraceEnabled() {
  return isTruthyBenchmarkEnvValue(process.env.KAUR_KHOR_BENCHMARK_TRACE);
}

export function benchmarkRunId() {
  cachedRunId ??= process.env.KAUR_KHOR_BENCHMARK_RUN_ID?.trim() || DEFAULT_RUN_ID;
  return cachedRunId;
}

export function benchmarkOutputDirectory() {
  cachedOutputDirectory ??= resolve(
    process.env.KAUR_KHOR_BENCHMARK_OUTPUT_DIR?.trim() || join(process.cwd(), 'bench-results', benchmarkRunId()),
  );
  return cachedOutputDirectory;
}

function eventStreamPath() {
  return join(benchmarkOutputDirectory(), 'events.jsonl');
}

function hydrateBenchmarkEventCountsFromDisk() {
  if (benchmarkEventCountsHydrated) {
    return;
  }
  benchmarkEventCountsHydrated = true;
  if (!benchmarkEnabled()) {
    return;
  }
  const path = eventStreamPath();
  if (!existsSync(path)) {
    return;
  }
  let raw = '';
  try {
    raw = readFileSync(path, 'utf8');
  } catch (error) {
    console.warn('[benchmark] failed to read existing events for hydration', error);
    return;
  }
  for (const line of raw.split('\n')) {
    if (!line.trim()) {
      continue;
    }
    try {
      const event = JSON.parse(line) as Partial<KaurKhorBenchmarkEvent>;
      const name = typeof event.name === 'string' ? event.name : null;
      if (!name) {
        continue;
      }
      const current = benchmarkEventCounts.get(name) ?? { count: 0, lastTs: null };
      const ts = typeof event.ts === 'number' && Number.isFinite(event.ts) ? event.ts : null;
      benchmarkEventCounts.set(name, {
        count: current.count + 1,
        lastTs: ts != null && (current.lastTs == null || ts > current.lastTs) ? ts : current.lastTs,
      });
    } catch {
      // Ignore malformed lines in partially-written benchmark files.
    }
  }
}

export function normalizeBenchmarkEvent(event: KaurKhorBenchmarkEventInput): KaurKhorBenchmarkEvent {
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

function resolveBenchmarkEventWaiters(name: string) {
  const counts = benchmarkEventCounts.get(name) ?? { count: 0, lastTs: null };
  const waiters = benchmarkEventWaiters.get(name);
  if (!waiters || waiters.length === 0) {
    return;
  }
  const pending = [...waiters];
  const unresolved: typeof pending = [];
  for (const waiter of pending) {
    if (counts.count >= waiter.minimumCount) {
      clearTimeout(waiter.timeout);
      waiter.resolve({
        count: counts.count,
        ts: counts.lastTs,
      });
      continue;
    }
    unresolved.push(waiter);
  }
  if (unresolved.length === 0) {
    benchmarkEventWaiters.delete(name);
    return;
  }
  benchmarkEventWaiters.set(name, unresolved);
}

function registerBenchmarkEvent(normalized: KaurKhorBenchmarkEvent) {
  const current = benchmarkEventCounts.get(normalized.name) ?? { count: 0, lastTs: null };
  benchmarkEventCounts.set(normalized.name, {
    count: current.count + 1,
    lastTs: normalized.ts ?? null,
  });
  resolveBenchmarkEventWaiters(normalized.name);
}

export function recordBenchmarkEvent(event: KaurKhorBenchmarkEventInput) {
  if (!benchmarkEnabled()) {
    return;
  }

  hydrateBenchmarkEventCountsFromDisk();
  const normalized = normalizeBenchmarkEvent(event);
  registerBenchmarkEvent(normalized);
  try {
    mkdirSync(benchmarkOutputDirectory(), { recursive: true });
    appendFileSync(eventStreamPath(), `${JSON.stringify(normalized)}\n`, 'utf8');
  } catch (error) {
    console.warn('[benchmark] failed to write event', error);
  }
}

export function recordExternalBenchmarkEvent(event: KaurKhorBenchmarkEvent) {
  if (!benchmarkEnabled()) {
    return;
  }
  recordBenchmarkEvent({
    ...event,
    runId: event.runId || benchmarkRunId(),
    ts: event.ts || Date.now(),
  });
}

export function benchmarkEventCount(name: string) {
  hydrateBenchmarkEventCountsFromDisk();
  return benchmarkEventCounts.get(name)?.count ?? 0;
}

export function waitForBenchmarkEventCount({
  minimumCount,
  name,
  timeoutMs = DEFAULT_BENCHMARK_EVENT_WAIT_TIMEOUT_MS,
}: {
  name: string;
  minimumCount: number;
  timeoutMs?: number;
}): Promise<{ count: number; ts: number | null }> {
  if (!benchmarkEnabled()) {
    return Promise.reject(new Error('Benchmark mode is disabled.'));
  }
  hydrateBenchmarkEventCountsFromDisk();
  const count = benchmarkEventCount(name);
  if (count >= minimumCount) {
    return Promise.resolve({
      count,
      ts: benchmarkEventCounts.get(name)?.lastTs ?? null,
    });
  }
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      const pending = benchmarkEventWaiters.get(name) ?? [];
      benchmarkEventWaiters.set(
        name,
        pending.filter((waiter) => waiter.resolve !== resolve),
      );
      reject(new Error(`Timed out waiting for benchmark event "${name}" count >= ${minimumCount}`));
    }, timeoutMs);
    const waiters = benchmarkEventWaiters.get(name) ?? [];
    waiters.push({
      minimumCount,
      resolve,
      reject,
      timeout,
    });
    benchmarkEventWaiters.set(name, waiters);
  });
}

export function startBenchmarkSpan({
  category,
  name,
  layer = 'main',
  detail,
  command,
}: {
  category: KaurKhorBenchmarkCategory;
  name: string;
  layer?: KaurKhorBenchmarkEvent['layer'];
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
