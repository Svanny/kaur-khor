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

export type BanjiBenchmarkScenarioId =
  | 'startup'
  | 'navigation'
  | 'record-update'
  | 'detail-pages'
  | 'stability';

export type BanjiBenchmarkFixtureSize = 'minimal' | 'medium' | 'heavy';

export type BanjiBenchmarkRunStatus = 'queued' | 'running' | 'passed' | 'failed' | 'cancelled';

export type BanjiBenchmarkTargetStatus = 'pass' | 'watch' | 'fail' | 'missing';

export interface BanjiBenchmarkMetricSummary {
  count: number;
  max: number | null;
  median: number | null;
  min: number | null;
  p95: number | null;
}

export interface BanjiBenchmarkTarget {
  metricName: string;
  label: string;
  category: BanjiBenchmarkCategory;
  unit: 'ms' | 'percent' | 'boolean';
  nonNegotiable: number;
  acceptable: number;
  technicalTarget?: number;
  source: string;
  rationale: string;
}

export interface BanjiBenchmarkTargetEvaluation {
  metricName: string;
  label: string;
  value: number | null;
  unit: BanjiBenchmarkTarget['unit'];
  status: BanjiBenchmarkTargetStatus;
  nonNegotiable: number;
  acceptable: number;
  source: string;
  rationale: string;
}

export interface BanjiBenchmarkScenarioSummary {
  scenario: string;
  runId: string;
  generatedAt: string;
  metrics: Record<string, BanjiBenchmarkMetricSummary>;
  derivedMetrics?: Record<string, number>;
  targets?: BanjiBenchmarkTargetEvaluation[];
  slowestIpc: Array<{ name: string; durationMs: number }>;
  slowestCore: Array<{ name: string; command: string | null; durationMs: number }>;
}

export interface BanjiBenchmarkRunRecord {
  runId: string;
  scenarios: BanjiBenchmarkScenarioId[];
  status: BanjiBenchmarkRunStatus;
  startedAt: string;
  completedAt: string | null;
  fixtureSize: BanjiBenchmarkFixtureSize;
  traceEnabled: boolean;
  repeatCount: number;
  buildBeforeRun: boolean;
  outputDirectory: string;
  exitCode: number | null;
  summaries: BanjiBenchmarkScenarioSummary[];
  stdoutTail: string[];
  stderrTail: string[];
  error: string | null;
}

export interface BanjiBenchmarkRunOptions {
  scenarios: BanjiBenchmarkScenarioId[];
  fixtureSize: BanjiBenchmarkFixtureSize;
  traceEnabled: boolean;
  repeatCount: number;
  buildBeforeRun: boolean;
}

export interface BanjiBenchmarkRunnerAvailability {
  available: boolean;
  reason: string | null;
  projectRoot: string;
  resultsDirectory: string;
  activeRunId: string | null;
}

export interface BanjiBenchmarkRunEvent {
  runId: string;
  status: BanjiBenchmarkRunStatus;
  message: string;
  stream?: 'stdout' | 'stderr';
  line?: string;
  record?: BanjiBenchmarkRunRecord;
}

export interface BanjiBenchmarkComparisonMetric {
  metricName: string;
  baseline: number | null;
  candidate: number | null;
  delta: number | null;
  percent: number | null;
  status: 'regression' | 'improvement' | 'same' | 'missing';
}

export interface BanjiBenchmarkComparison {
  baselineRunId: string;
  candidateRunId: string;
  metrics: BanjiBenchmarkComparisonMetric[];
}

export interface BanjiBenchmarkRunnerBridge {
  getAvailability: () => Promise<BanjiBenchmarkRunnerAvailability>;
  listRuns: () => Promise<BanjiBenchmarkRunRecord[]>;
  readRun: (runId: string) => Promise<BanjiBenchmarkRunRecord | null>;
  startRun: (options: BanjiBenchmarkRunOptions) => Promise<BanjiBenchmarkRunRecord>;
  cancelRun: (runId: string) => Promise<BanjiBenchmarkRunRecord>;
  compareRuns: (payload: { baselineRunId: string; candidateRunId: string }) => Promise<BanjiBenchmarkComparison>;
  revealRun: (runId: string) => Promise<void>;
  onRunEvent: (listener: (event: BanjiBenchmarkRunEvent) => void) => () => void;
}

export const BANJI_BENCHMARK_SCENARIOS: Array<{
  id: BanjiBenchmarkScenarioId;
  label: string;
  script: string;
}> = [
  { id: 'startup', label: 'Startup', script: 'bench:startup' },
  { id: 'navigation', label: 'Navigation', script: 'bench:navigation' },
  { id: 'record-update', label: 'Record update', script: 'bench:record-update' },
  { id: 'detail-pages', label: 'Detail pages', script: 'bench:detail-pages' },
  { id: 'stability', label: 'Stability', script: 'bench:stability' },
];

export const BANJI_BENCHMARK_TARGETS: BanjiBenchmarkTarget[] = [
  {
    metricName: 'startup.app_to_workspace_ready_ms',
    label: 'App to usable workspace',
    category: 'startup',
    unit: 'ms',
    nonNegotiable: 2500,
    acceptable: 5000,
    source: 'Windows startup, Android startup, Core Web Vitals LCP',
    rationale: 'Startup ends when the workspace can be used, not when the first frame appears.',
  },
  {
    metricName: 'startup.warm_workspace_ready_ms',
    label: 'Warm workspace ready',
    category: 'startup',
    unit: 'ms',
    nonNegotiable: 1500,
    acceptable: 2000,
    source: 'Android startup vitals',
    rationale: 'Warm launches should not feel like cold boots.',
  },
  {
    metricName: 'nav.dashboard_to_record_update_ms',
    label: 'Dashboard to record update',
    category: 'navigation',
    unit: 'ms',
    nonNegotiable: 300,
    acceptable: 500,
    source: 'RAIL response, Core Web Vitals INP',
    rationale: 'Operator navigation should feel continuous and never interrupt data-entry flow.',
  },
  {
    metricName: 'nav.dashboard_to_catalog_ms',
    label: 'Dashboard to catalog',
    category: 'navigation',
    unit: 'ms',
    nonNegotiable: 300,
    acceptable: 500,
    source: 'RAIL response, Core Web Vitals INP',
    rationale: 'Catalog access is an operator path, not a heavy analysis path.',
  },
  {
    metricName: 'nav.record_update_lane_switch_ms',
    label: 'Record update lane switch',
    category: 'navigation',
    unit: 'ms',
    nonNegotiable: 250,
    acceptable: 500,
    source: 'RAIL response, Core Web Vitals INP',
    rationale: 'Lane switches should preserve data-entry momentum.',
  },
  {
    metricName: 'interaction.open_task_drawer_ms',
    label: 'Open task drawer',
    category: 'interaction',
    unit: 'ms',
    nonNegotiable: 150,
    acceptable: 200,
    source: 'RAIL response, Core Web Vitals INP',
    rationale: 'Opening an action surface should be visually immediate.',
  },
  {
    metricName: 'interaction.save_stock_count_ms',
    label: 'Save stock count',
    category: 'interaction',
    unit: 'ms',
    nonNegotiable: 500,
    acceptable: 900,
    source: 'RAIL response, Core Web Vitals INP',
    rationale: 'Save confirmation is a critical operator trust signal.',
  },
  {
    metricName: 'interaction.save_supplier_receipt_ms',
    label: 'Save supplier receipt',
    category: 'interaction',
    unit: 'ms',
    nonNegotiable: 700,
    acceptable: 1000,
    source: 'RAIL response, Core Web Vitals INP',
    rationale: 'Receipt saves can do more backend work but still need clear confirmation.',
  },
  {
    metricName: 'detail.sku_first_load_ms',
    label: 'SKU detail first load',
    category: 'navigation',
    unit: 'ms',
    nonNegotiable: 700,
    acceptable: 1500,
    source: 'RAIL task progression',
    rationale: 'First detail load may hydrate data but should remain below the loss-of-focus range.',
  },
  {
    metricName: 'detail.sku_repeat_load_ms',
    label: 'SKU detail repeat load',
    category: 'navigation',
    unit: 'ms',
    nonNegotiable: 250,
    acceptable: 500,
    source: 'RAIL response',
    rationale: 'Repeat loads should show cache benefit.',
  },
  {
    metricName: 'detail.service_first_load_ms',
    label: 'Service detail first load',
    category: 'navigation',
    unit: 'ms',
    nonNegotiable: 800,
    acceptable: 1500,
    source: 'RAIL task progression',
    rationale: 'Service details can include dependency context but should not stall.',
  },
  {
    metricName: 'detail.service_repeat_load_ms',
    label: 'Service detail repeat load',
    category: 'navigation',
    unit: 'ms',
    nonNegotiable: 300,
    acceptable: 500,
    source: 'RAIL response',
    rationale: 'Repeat service loads should show cache benefit.',
  },
  {
    metricName: 'nav.dashboard_to_performance_ms',
    label: 'Dashboard to performance',
    category: 'navigation',
    unit: 'ms',
    nonNegotiable: 900,
    acceptable: 1500,
    source: 'RAIL task progression, Core Web Vitals LCP',
    rationale: 'Heavy pages can be deliberate but should stay composed.',
  },
  {
    metricName: 'nav.performance_to_financials_ms',
    label: 'Performance to financials',
    category: 'navigation',
    unit: 'ms',
    nonNegotiable: 1000,
    acceptable: 1500,
    source: 'RAIL task progression, Core Web Vitals LCP',
    rationale: 'Financial summaries are heavy enough to allow a wider budget.',
  },
  {
    metricName: 'nav.financials_to_analysis_ms',
    label: 'Financials to analysis',
    category: 'navigation',
    unit: 'ms',
    nonNegotiable: 1200,
    acceptable: 2000,
    source: 'RAIL task progression, Core Web Vitals LCP',
    rationale: 'Analysis is the heaviest route and gets the widest route budget.',
  },
  {
    metricName: 'ipc.system_get_app_context_ms',
    label: 'Get app context IPC',
    category: 'ipc',
    unit: 'ms',
    nonNegotiable: 100,
    acceptable: 200,
    source: 'RAIL response',
    rationale: 'Startup-critical IPC must not block the first usable state.',
  },
  {
    metricName: 'ipc.sena_get_workspace_summary_ms',
    label: 'Workspace summary IPC',
    category: 'ipc',
    unit: 'ms',
    nonNegotiable: 200,
    acceptable: 400,
    source: 'RAIL response',
    rationale: 'Common read calls should stay below visible interaction delay.',
  },
  {
    metricName: 'ipc.sena_get_diagnostics_ms',
    label: 'Diagnostics IPC',
    category: 'ipc',
    unit: 'ms',
    nonNegotiable: 250,
    acceptable: 500,
    source: 'RAIL response',
    rationale: 'Diagnostics is common route support data.',
  },
  {
    metricName: 'ipc.sena_get_sku_detail_ms',
    label: 'SKU detail IPC',
    category: 'ipc',
    unit: 'ms',
    nonNegotiable: 300,
    acceptable: 600,
    source: 'RAIL task progression',
    rationale: 'Detail IPC is user-facing and must not dominate route load.',
  },
  {
    metricName: 'ipc.sena_get_service_detail_ms',
    label: 'Service detail IPC',
    category: 'ipc',
    unit: 'ms',
    nonNegotiable: 350,
    acceptable: 700,
    source: 'RAIL task progression',
    rationale: 'Service detail IPC may do dependency work but should stay bounded.',
  },
  {
    metricName: 'backend.core.queue_wait_p95_ms',
    label: 'Core queue wait p95',
    category: 'core-command',
    unit: 'ms',
    nonNegotiable: 100,
    acceptable: 200,
    source: 'Electron performance, RAIL response',
    rationale: 'Serialized backend queueing should not become hidden latency.',
  },
  {
    metricName: 'renderer.long_task_max_ms',
    label: 'Renderer long task max',
    category: 'stability',
    unit: 'ms',
    nonNegotiable: 100,
    acceptable: 200,
    source: 'Chrome Long Tasks API',
    rationale: 'Long tasks start at 50 ms; this flags damaging stalls.',
  },
  {
    metricName: 'renderer.loaf_blocking_max_ms',
    label: 'Long animation frame blocking max',
    category: 'stability',
    unit: 'ms',
    nonNegotiable: 100,
    acceptable: 200,
    source: 'Chrome Long Animation Frames API',
    rationale: 'LoAF blocking duration explains delayed paints around interactions.',
  },
  {
    metricName: 'memory.renderer_stability_growth_pct',
    label: 'Renderer memory growth',
    category: 'memory',
    unit: 'percent',
    nonNegotiable: 10,
    acceptable: 15,
    source: 'Chromium memory benchmarks',
    rationale: 'Repeated navigation should not produce a steady heap ratchet.',
  },
  {
    metricName: 'memory.main_stability_growth_pct',
    label: 'Main memory growth',
    category: 'memory',
    unit: 'percent',
    nonNegotiable: 10,
    acceptable: 15,
    source: 'Electron performance, Chromium memory benchmarks',
    rationale: 'Main process memory should stay flat across stability runs.',
  },
  {
    metricName: 'stability.crash_free',
    label: 'Crash-free completion',
    category: 'stability',
    unit: 'boolean',
    nonNegotiable: 1,
    acceptable: 1,
    source: 'Operational stability',
    rationale: 'Any benchmark crash is a failed run.',
  },
];

export function classifyBenchmarkTarget(
  value: number | null | undefined,
  target: BanjiBenchmarkTarget,
): BanjiBenchmarkTargetStatus {
  if (value == null || Number.isNaN(value)) {
    return 'missing';
  }
  if (target.unit === 'boolean') {
    return value >= target.nonNegotiable ? 'pass' : 'fail';
  }
  if (value <= target.nonNegotiable) {
    return 'pass';
  }
  if (value <= target.acceptable) {
    return 'watch';
  }
  return 'fail';
}

export function evaluateBenchmarkTargets(metrics: Record<string, number>) {
  return BANJI_BENCHMARK_TARGETS.map((target) => {
    const value = metrics[target.metricName] ?? null;
    return {
      metricName: target.metricName,
      label: target.label,
      value,
      unit: target.unit,
      status: classifyBenchmarkTarget(value, target),
      nonNegotiable: target.nonNegotiable,
      acceptable: target.acceptable,
      source: target.source,
      rationale: target.rationale,
    } satisfies BanjiBenchmarkTargetEvaluation;
  });
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
