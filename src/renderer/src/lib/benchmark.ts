import type {
  BanjiBenchmarkCategory,
  BanjiBenchmarkEvent,
  BanjiBenchmarkEventInput,
} from '@shared/benchmark';

type RendererMemoryPerformance = Performance & {
  memory?: {
    jsHeapSizeLimit: number;
    totalJSHeapSize: number;
    usedJSHeapSize: number;
  };
};

const activeSpans = new Map<string, number>();

function currentBenchmarkRoute() {
  if (window.location.hash.startsWith('#/')) {
    return window.location.hash.slice(1) || '/';
  }
  return `${window.location.pathname}${window.location.search}` || '/';
}

function benchmarkMetadata() {
  return window.banjiDesktop?.benchmark ?? {
    enabled: false,
    runId: `renderer-${Date.now()}`,
  };
}

export function benchmarkEnabled() {
  return benchmarkMetadata().enabled;
}

export function currentBenchmarkRunId() {
  return benchmarkMetadata().runId;
}

export function recordBenchmarkEvent(event: BanjiBenchmarkEventInput) {
  if (!benchmarkEnabled()) {
    return;
  }

  const normalized: BanjiBenchmarkEvent = {
    ...event,
    runId: event.runId ?? currentBenchmarkRunId(),
    ts: event.ts ?? Date.now(),
    layer: 'renderer',
    route: event.route ?? currentBenchmarkRoute(),
    entityType: event.entityType ?? null,
    entityId: event.entityId ?? null,
    command: event.command ?? null,
    durationMs: event.durationMs ?? null,
  };

  const eventWindow = window as Window & {
    __BANJI_BENCHMARK_EVENTS__?: BanjiBenchmarkEvent[];
  };
  eventWindow.__BANJI_BENCHMARK_EVENTS__ ??= [];
  eventWindow.__BANJI_BENCHMARK_EVENTS__.push(normalized);
  window.banjiDesktop?.benchmark?.recordEvent(normalized);
}

export function markBenchmarkStart(
  name: string,
  category: BanjiBenchmarkCategory = 'interaction',
  detail?: Record<string, unknown>,
) {
  if (!benchmarkEnabled()) {
    return;
  }
  activeSpans.set(name, Date.now());
  performance.mark(`${name}.start`);
  recordBenchmarkEvent({
    layer: 'renderer',
    category,
    name,
    phase: 'start',
    detail,
  });
}

export function markBenchmarkEnd(
  name: string,
  category: BanjiBenchmarkCategory = 'interaction',
  detail?: Record<string, unknown>,
) {
  if (!benchmarkEnabled()) {
    return;
  }
  const startedAt = activeSpans.get(name);
  activeSpans.delete(name);
  performance.mark(`${name}.end`);
  try {
    performance.measure(name, `${name}.start`, `${name}.end`);
  } catch {
    // Marks are best-effort. The JSONL event is the durable record.
  }
  recordBenchmarkEvent({
    layer: 'renderer',
    category,
    name,
    phase: 'end',
    durationMs: startedAt ? Date.now() - startedAt : null,
    detail,
  });
}

export function recordBenchmarkInstant(
  name: string,
  category: BanjiBenchmarkCategory = 'interaction',
  detail?: Record<string, unknown>,
) {
  recordBenchmarkEvent({
    layer: 'renderer',
    category,
    name,
    phase: 'instant',
    detail,
  });
}

export function markRouteReady(routeName: string, detail?: Record<string, unknown>) {
  recordBenchmarkInstant(`route.${routeName}.ready`, 'navigation', detail);
  markBenchmarkEnd('renderer.route.navigation', 'navigation', detail);
}

export function snapshotRendererMemory(name: string, detail?: Record<string, unknown>) {
  if (!benchmarkEnabled()) {
    return;
  }

  const memory = (performance as RendererMemoryPerformance).memory;
  recordBenchmarkInstant(name, 'memory', {
    available: Boolean(memory),
    jsHeapSizeLimitMb: memory ? memory.jsHeapSizeLimit / 1024 / 1024 : null,
    totalJSHeapSizeMb: memory ? memory.totalJSHeapSize / 1024 / 1024 : null,
    usedJSHeapSizeMb: memory ? memory.usedJSHeapSize / 1024 / 1024 : null,
    ...(detail ?? {}),
  });
}

export function installLongTaskObserver() {
  if (!benchmarkEnabled() || typeof PerformanceObserver === 'undefined') {
    return () => undefined;
  }

  const cleanups: Array<() => void> = [];

  try {
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        recordBenchmarkInstant('renderer.long-task', 'interaction', {
          startTime: entry.startTime,
          durationMs: entry.duration,
          route: currentBenchmarkRoute(),
        });
      }
    });
    observer.observe({ entryTypes: ['longtask'] });
    cleanups.push(() => observer.disconnect());
  } catch {
    recordBenchmarkInstant('renderer.long-task.unavailable', 'interaction');
  }

  try {
    const supportedEntryTypes = PerformanceObserver.supportedEntryTypes ?? [];
    if (supportedEntryTypes.includes('long-animation-frame')) {
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          const loafEntry = entry as PerformanceEntry & {
            blockingDuration?: number;
          };
          recordBenchmarkInstant('renderer.long-animation-frame', 'interaction', {
            startTime: loafEntry.startTime,
            durationMs: loafEntry.duration,
            blockingDuration: loafEntry.blockingDuration ?? null,
            route: currentBenchmarkRoute(),
          });
        }
      });
      observer.observe({ type: 'long-animation-frame', buffered: true });
      cleanups.push(() => observer.disconnect());
    } else {
      recordBenchmarkInstant('renderer.long-animation-frame.unavailable', 'interaction');
    }
  } catch {
    recordBenchmarkInstant('renderer.long-animation-frame.unavailable', 'interaction');
  }

  return () => {
    cleanups.forEach((cleanup) => cleanup());
  };
}
