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
  | 'work'
  | 'capture'
  | 'detail-pages'
  | 'stability';

export type BanjiBenchmarkFixtureSize = 'minimal' | 'medium' | 'heavy' | 'power-user';

export type BanjiBenchmarkRunStatus = 'queued' | 'running' | 'passed' | 'warning' | 'failed' | 'cancelled';

export type BanjiBenchmarkTargetStatus = 'pass' | 'watch' | 'fail' | 'missing';

export interface BanjiBenchmarkMetricSummary {
  count: number;
  max: number | null;
  median: number | null;
  min: number | null;
  p95: number | null;
}

export interface BanjiBenchmarkDistributionSummary {
  count: number;
  iqr: number | null;
  max: number | null;
  mean: number | null;
  median: number | null;
  min: number | null;
  p95: number | null;
  q1: number | null;
  q3: number | null;
}

export interface BanjiBenchmarkTarget {
  metricName: string;
  label: string;
  category: BanjiBenchmarkCategory;
  scenarios: BanjiBenchmarkScenarioId[];
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
  distribution?: BanjiBenchmarkDistributionSummary;
  p95?: number | null;
  jitterBudget?: number | null;
  unit: BanjiBenchmarkTarget['unit'];
  status: BanjiBenchmarkTargetStatus;
  nonNegotiable: number;
  acceptable: number;
  source: string;
  rationale: string;
}

export interface BanjiBenchmarkScenarioSummary {
  scenario: BanjiBenchmarkScenarioId;
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

export interface BanjiBenchmarkFlamegraphRequest {
  runId: string;
  scenario: BanjiBenchmarkScenarioId;
}

export interface BanjiBenchmarkFlamegraphArtifact {
  runId: string;
  scenario: BanjiBenchmarkScenarioId;
  artifactPath: string;
}

export interface BanjiBenchmarkRunnerBridge {
  getAvailability: () => Promise<BanjiBenchmarkRunnerAvailability>;
  listRuns: () => Promise<BanjiBenchmarkRunRecord[]>;
  readRun: (runId: string) => Promise<BanjiBenchmarkRunRecord | null>;
  startRun: (options: BanjiBenchmarkRunOptions) => Promise<BanjiBenchmarkRunRecord>;
  cancelRun: (runId: string) => Promise<BanjiBenchmarkRunRecord>;
  compareRuns: (payload: { baselineRunId: string; candidateRunId: string }) => Promise<BanjiBenchmarkComparison>;
  generateFlamegraph: (payload: BanjiBenchmarkFlamegraphRequest) => Promise<BanjiBenchmarkFlamegraphArtifact>;
  revealRun: (runId: string) => Promise<void>;
  onRunEvent: (listener: (event: BanjiBenchmarkRunEvent) => void) => () => void;
}

export const BANJI_BENCHMARK_SCENARIOS: Array<{
  file: string;
  id: BanjiBenchmarkScenarioId;
  label: string;
  script: string;
}> = [
  { file: 'bench/scenarios/startup.bench.ts', id: 'startup', label: 'Startup', script: 'bench:startup' },
  { file: 'bench/scenarios/navigation.bench.ts', id: 'navigation', label: 'Navigation', script: 'bench:navigation' },
  { file: 'bench/scenarios/work.bench.ts', id: 'work', label: 'Work', script: 'bench:work' },
  { file: 'bench/scenarios/capture.bench.ts', id: 'capture', label: 'Capture', script: 'bench:capture' },
  { file: 'bench/scenarios/detail-pages.bench.ts', id: 'detail-pages', label: 'Detail pages', script: 'bench:detail-pages' },
  { file: 'bench/scenarios/stability.bench.ts', id: 'stability', label: 'Stability', script: 'bench:stability' },
];

export const BANJI_BENCHMARK_TARGETS: BanjiBenchmarkTarget[] = [
  {
    metricName: 'startup.app_to_workspace_ready_ms',
    label: 'App to usable workspace',
    category: 'startup',
    scenarios: ['startup'],
    unit: 'ms',
    nonNegotiable: 2500,
    acceptable: 5000,
    source: 'web.dev RAIL, Electron performance guidance',
    rationale: 'Startup ends when the workspace can be used, not when the first frame appears.',
  },
  {
    metricName: 'startup.warm_workspace_ready_ms',
    label: 'Warm workspace ready',
    category: 'startup',
    scenarios: ['startup'],
    unit: 'ms',
    nonNegotiable: 1500,
    acceptable: 2000,
    source: 'web.dev RAIL, Electron performance guidance',
    rationale: 'Warm launches should not feel like cold boots.',
  },
  {
    metricName: 'nav.home_to_work_ms',
    label: 'Home to work',
    category: 'navigation',
    scenarios: ['navigation'],
    unit: 'ms',
    nonNegotiable: 200,
    acceptable: 500,
    source: 'web.dev INP, web.dev RAIL',
    rationale: 'The first daily-work transition should feel continuous and never interrupt operator flow.',
  },
  {
    metricName: 'nav.work_to_catalog_ms',
    label: 'Work to catalog',
    category: 'navigation',
    scenarios: ['navigation'],
    unit: 'ms',
    nonNegotiable: 200,
    acceptable: 500,
    source: 'web.dev INP, web.dev RAIL',
    rationale: 'Catalog access is an operator path, not a heavy analysis path.',
  },
  {
    metricName: 'nav.work_queue_to_capture_ms',
    label: 'Work queue to capture',
    category: 'navigation',
    scenarios: ['capture'],
    unit: 'ms',
    nonNegotiable: 200,
    acceptable: 500,
    source: 'web.dev INP, web.dev RAIL',
    rationale: 'Moving from decision queue to reality capture should keep operator momentum.',
  },
  {
    metricName: 'nav.capture_hub_to_lane_ms',
    label: 'Capture hub to lane',
    category: 'navigation',
    scenarios: ['capture'],
    unit: 'ms',
    nonNegotiable: 200,
    acceptable: 500,
    source: 'web.dev INP, web.dev RAIL',
    rationale: 'Opening a lane from the capture hub should preserve data-entry momentum.',
  },
  {
    metricName: 'interaction.work_workflow_toggle_ms',
    label: 'Work workflow toggle',
    category: 'interaction',
    scenarios: ['work'],
    unit: 'ms',
    nonNegotiable: 100,
    acceptable: 200,
    source: 'web.dev INP, web.dev RAIL',
    rationale: 'Switching between supplier and customer workflows should be immediate.',
  },
  {
    metricName: 'interaction.work_supplier_filter_ms',
    label: 'Work supplier filter',
    category: 'interaction',
    scenarios: ['work'],
    unit: 'ms',
    nonNegotiable: 100,
    acceptable: 200,
    source: 'web.dev INP, web.dev RAIL',
    rationale: 'Supplier filtering is a direct operator control and should update instantly.',
  },
  {
    metricName: 'interaction.work_task_tab_transition_ms',
    label: 'Work task-tab transition',
    category: 'interaction',
    scenarios: ['work'],
    unit: 'ms',
    nonNegotiable: 100,
    acceptable: 200,
    source: 'web.dev INP, web.dev RAIL',
    rationale: 'Switching task tabs should not interrupt operator scanning flow.',
  },
  {
    metricName: 'interaction.open_work_supplier_drawer_ms',
    label: 'Open work supplier drawer',
    category: 'interaction',
    scenarios: ['work'],
    unit: 'ms',
    nonNegotiable: 100,
    acceptable: 200,
    source: 'web.dev INP, web.dev RAIL',
    rationale: 'Supplier drawer opens are instant controls and must be visually immediate.',
  },
  {
    metricName: 'interaction.open_work_customer_intake_drawer_ms',
    label: 'Open work customer intake drawer',
    category: 'interaction',
    scenarios: ['work'],
    unit: 'ms',
    nonNegotiable: 100,
    acceptable: 200,
    source: 'web.dev INP, web.dev RAIL',
    rationale: 'Customer intake drawer opens should respond without visible lag.',
  },
  {
    metricName: 'interaction.save_stock_count_ms',
    label: 'Save stock count',
    category: 'interaction',
    scenarios: ['capture'],
    unit: 'ms',
    nonNegotiable: 1000,
    acceptable: 2000,
    source: 'web.dev RAIL, Electron performance guidance',
    rationale: 'Save confirmation is a critical operator trust signal.',
  },
  {
    metricName: 'interaction.save_supplier_order_receipt_ms',
    label: 'Save supplier-order receipt',
    category: 'interaction',
    scenarios: ['capture'],
    unit: 'ms',
    nonNegotiable: 1000,
    acceptable: 2000,
    source: 'web.dev RAIL, Electron performance guidance',
    rationale: 'Receipt saves inside the supplier-order flow can do more backend work but still need clear confirmation.',
  },
  {
    metricName: 'detail.sku_first_load_ms',
    label: 'SKU detail first load',
    category: 'navigation',
    scenarios: ['detail-pages'],
    unit: 'ms',
    nonNegotiable: 1000,
    acceptable: 2000,
    source: 'web.dev RAIL',
    rationale: 'First detail load may hydrate data but should remain below the loss-of-focus range.',
  },
  {
    metricName: 'detail.sku_repeat_load_ms',
    label: 'SKU detail repeat load',
    category: 'navigation',
    scenarios: ['detail-pages'],
    unit: 'ms',
    nonNegotiable: 200,
    acceptable: 500,
    source: 'web.dev INP, web.dev RAIL',
    rationale: 'Repeat loads should show cache benefit.',
  },
  {
    metricName: 'detail.service_first_load_ms',
    label: 'Service detail first load',
    category: 'navigation',
    scenarios: ['detail-pages'],
    unit: 'ms',
    nonNegotiable: 1000,
    acceptable: 2000,
    source: 'web.dev RAIL',
    rationale: 'Service details can include dependency context but should not stall.',
  },
  {
    metricName: 'detail.service_repeat_load_ms',
    label: 'Service detail repeat load',
    category: 'navigation',
    scenarios: ['detail-pages'],
    unit: 'ms',
    nonNegotiable: 200,
    acceptable: 500,
    source: 'web.dev INP, web.dev RAIL',
    rationale: 'Repeat service loads should show cache benefit.',
  },
  {
    metricName: 'nav.work_to_insights_ms',
    label: 'Work to insights',
    category: 'navigation',
    scenarios: ['navigation', 'stability'],
    unit: 'ms',
    nonNegotiable: 1000,
    acceptable: 2000,
    source: 'web.dev RAIL',
    rationale: 'Heavy pages can be deliberate but should stay composed.',
  },
  {
    metricName: 'nav.insights_pressure_to_money_ms',
    label: 'Insights pressure to money',
    category: 'navigation',
    scenarios: ['navigation', 'stability'],
    unit: 'ms',
    nonNegotiable: 1000,
    acceptable: 2000,
    source: 'web.dev RAIL',
    rationale: 'Financial summaries are heavy enough to allow a wider budget.',
  },
  {
    metricName: 'nav.insights_money_to_explain_ms',
    label: 'Insights money to explain',
    category: 'navigation',
    scenarios: ['navigation', 'stability'],
    unit: 'ms',
    nonNegotiable: 1000,
    acceptable: 2000,
    source: 'web.dev RAIL',
    rationale: 'Explain is the heaviest insights mode and gets the widest route budget.',
  },
  {
    metricName: 'ipc.system_get_app_context_ms',
    label: 'Get app context IPC',
    category: 'ipc',
    scenarios: ['startup'],
    unit: 'ms',
    nonNegotiable: 100,
    acceptable: 200,
    source: 'web.dev INP, web.dev RAIL',
    rationale: 'Startup-critical IPC must not block the first usable state.',
  },
  {
    metricName: 'ipc.sena_get_startup_workspace_ms',
    label: 'Startup workspace IPC',
    category: 'ipc',
    scenarios: ['startup'],
    unit: 'ms',
    nonNegotiable: 200,
    acceptable: 500,
    source: 'web.dev INP, web.dev RAIL',
    rationale: 'Startup should use one compact workspace IPC instead of read fanout.',
  },
  {
    metricName: 'ipc.sena_get_capture_context_ms',
    label: 'Capture context IPC',
    category: 'ipc',
    scenarios: ['capture'],
    unit: 'ms',
    nonNegotiable: 150,
    acceptable: 300,
    source: 'web.dev INP, web.dev RAIL',
    rationale: 'Record-entry defaults should come from compact anchors instead of full observation scans.',
  },
  {
    metricName: 'ipc.sena_get_sku_detail_ms',
    label: 'SKU detail IPC',
    category: 'ipc',
    scenarios: ['detail-pages'],
    unit: 'ms',
    nonNegotiable: 500,
    acceptable: 1000,
    source: 'web.dev RAIL, Electron performance guidance',
    rationale: 'Detail IPC is user-facing and must not dominate route load.',
  },
  {
    metricName: 'ipc.sena_get_service_detail_ms',
    label: 'Service detail IPC',
    category: 'ipc',
    scenarios: ['detail-pages'],
    unit: 'ms',
    nonNegotiable: 500,
    acceptable: 1000,
    source: 'web.dev RAIL, Electron performance guidance',
    rationale: 'Service detail IPC may do dependency work but should stay bounded.',
  },
  {
    metricName: 'backend.core.interactive_queue_wait_p95_ms',
    label: 'Interactive core queue wait p95',
    category: 'core-command',
    scenarios: ['startup', 'navigation', 'work', 'capture', 'detail-pages', 'stability'],
    unit: 'ms',
    nonNegotiable: 50,
    acceptable: 100,
    source: 'Electron performance guidance, web.dev INP',
    rationale: 'Interactive backend queueing should stay low during the measured user-action window.',
  },
  {
    metricName: 'backend.core.read_pool_queue_wait_p95_ms',
    label: 'Read pool queue wait p95',
    category: 'core-command',
    scenarios: ['startup', 'navigation', 'work', 'capture', 'detail-pages', 'stability'],
    unit: 'ms',
    nonNegotiable: 50,
    acceptable: 100,
    source: 'Electron performance guidance, web.dev INP',
    rationale: 'Read-only fanout in the measurement window should not wait behind writer-only work.',
  },
  {
    metricName: 'backend.core.setup_queue_wait_p95_ms',
    label: 'Setup queue wait p95',
    category: 'core-command',
    scenarios: ['startup', 'navigation', 'work', 'capture', 'detail-pages', 'stability'],
    unit: 'ms',
    nonNegotiable: 200,
    acceptable: 500,
    source: 'Benchmark phase isolation guidance',
    rationale: 'Setup/background queueing is tracked separately from user-interaction latency budgets.',
  },
  {
    metricName: 'backend.core.writer_queue_wait_p95_ms',
    label: 'Writer queue wait p95',
    category: 'core-command',
    scenarios: ['capture'],
    unit: 'ms',
    nonNegotiable: 50,
    acceptable: 100,
    source: 'Electron performance guidance, web.dev INP',
    rationale: 'Mutations stay serialized but should not accumulate hidden queue delay.',
  },
  {
    metricName: 'renderer.long_task_max_ms',
    label: 'Renderer long task max',
    category: 'stability',
    scenarios: ['stability'],
    unit: 'ms',
    nonNegotiable: 100,
    acceptable: 200,
    source: 'Chrome Long Tasks API, Electron performance guidance',
    rationale: 'Long tasks start at 50 ms; repeated desktop route cycles should stay below damaging stall budgets.',
  },
  {
    metricName: 'renderer.loaf_blocking_max_ms',
    label: 'Long animation frame blocking max',
    category: 'stability',
    scenarios: ['stability'],
    unit: 'ms',
    nonNegotiable: 50,
    acceptable: 100,
    source: 'Chrome Long Animation Frames API',
    rationale: 'LoAF blocking duration explains delayed paints around interactions.',
  },
  {
    metricName: 'memory.renderer_stability_growth_pct',
    label: 'Renderer memory growth',
    category: 'memory',
    scenarios: ['stability'],
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
    scenarios: ['stability'],
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
    scenarios: ['stability'],
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

function percentileValue(values: number[], p: number) {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[index] ?? null;
}

export function summarizeBenchmarkDistribution(values: number[]): BanjiBenchmarkDistributionSummary {
  const finiteValues = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  const q1 = percentileValue(finiteValues, 25);
  const q3 = percentileValue(finiteValues, 75);
  return {
    count: finiteValues.length,
    iqr: q1 == null || q3 == null ? null : q3 - q1,
    max: finiteValues.at(-1) ?? null,
    mean: finiteValues.length === 0
      ? null
      : finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length,
    median: percentileValue(finiteValues, 50),
    min: finiteValues[0] ?? null,
    p95: percentileValue(finiteValues, 95),
    q1,
    q3,
  };
}

function classifyBenchmarkDistributionTarget(
  value: number | null | undefined,
  target: BanjiBenchmarkTarget,
  distribution?: BanjiBenchmarkDistributionSummary,
) {
  if (!distribution || target.unit === 'boolean') {
    return {
      jitterBudget: null,
      p95: null,
      status: classifyBenchmarkTarget(value, target),
    } as const;
  }
  const p95 = distribution.p95;
  const baselineStatus = classifyBenchmarkTarget(value, target);
  if (p95 == null || !Number.isFinite(p95)) {
    return {
      jitterBudget: null,
      p95: null,
      status: baselineStatus,
    } as const;
  }

  const jitterBudget = Math.max(
    target.acceptable - target.nonNegotiable,
    target.nonNegotiable * 0.15,
  );
  const nonNegotiableWithJitter = target.nonNegotiable + jitterBudget;
  const acceptableWithJitter = target.acceptable + jitterBudget;

  if ((value ?? Number.POSITIVE_INFINITY) <= target.nonNegotiable && p95 <= nonNegotiableWithJitter) {
    return {
      jitterBudget,
      p95,
      status: 'pass' as const,
    };
  }
  if ((value ?? Number.POSITIVE_INFINITY) <= target.acceptable && p95 <= acceptableWithJitter) {
    return {
      jitterBudget,
      p95,
      status: 'watch' as const,
    };
  }
  return {
    jitterBudget,
    p95,
    status: baselineStatus === 'missing' ? 'missing' : 'fail',
  } as const;
}

export function benchmarkTargetsForScenario(scenario: BanjiBenchmarkScenarioId) {
  return BANJI_BENCHMARK_TARGETS.filter((target) => target.scenarios.includes(scenario));
}

export function evaluateBenchmarkTargets(
  metrics: Record<string, number>,
  scenario: BanjiBenchmarkScenarioId,
  distributions?: Record<string, BanjiBenchmarkDistributionSummary>,
) {
  return benchmarkTargetsForScenario(scenario).map((target) => {
    const distribution = distributions?.[target.metricName];
    const value = distribution?.median ?? metrics[target.metricName] ?? null;
    const classified = classifyBenchmarkDistributionTarget(value, target, distribution);
    return {
      metricName: target.metricName,
      label: target.label,
      value,
      ...(distribution ? { distribution } : {}),
      ...(classified.p95 == null ? {} : { p95: classified.p95 }),
      ...(classified.jitterBudget == null ? {} : { jitterBudget: classified.jitterBudget }),
      unit: target.unit,
      status: classified.status,
      nonNegotiable: target.nonNegotiable,
      acceptable: target.acceptable,
      source: target.source,
      rationale: target.rationale,
    } satisfies BanjiBenchmarkTargetEvaluation;
  });
}

export function benchmarkTargetStatusCounts(summaries: BanjiBenchmarkScenarioSummary[]) {
  const targets = summaries.flatMap((summary) => summary.targets ?? []);
  return {
    pass: targets.filter((target) => target.status === 'pass').length,
    watch: targets.filter((target) => target.status === 'watch').length,
    fail: targets.filter((target) => target.status === 'fail').length,
    missing: targets.filter((target) => target.status === 'missing').length,
  };
}

export function benchmarkRunStatusForTargets(summaries: BanjiBenchmarkScenarioSummary[]): BanjiBenchmarkRunStatus {
  const counts = benchmarkTargetStatusCounts(summaries);
  if (counts.fail > 0 || counts.missing > 0) {
    return 'failed';
  }
  if (counts.watch > 0) {
    return 'warning';
  }
  return 'passed';
}

export function aggregateBenchmarkScenarioSummaries({
  runId,
  summaries,
}: {
  runId: string;
  summaries: BanjiBenchmarkScenarioSummary[];
}) {
  const summariesByScenario = new Map<BanjiBenchmarkScenarioId, BanjiBenchmarkScenarioSummary[]>();
  for (const summary of summaries) {
    const bucket = summariesByScenario.get(summary.scenario) ?? [];
    bucket.push(summary);
    summariesByScenario.set(summary.scenario, bucket);
  }

  return [...summariesByScenario.entries()]
    .map(([scenario, scenarioSummaries]) => {
      if (scenarioSummaries.length === 1) {
        return {
          ...scenarioSummaries[0]!,
          runId,
        };
      }

      const targetValues = new Map<string, number[]>();
      for (const summary of scenarioSummaries) {
        for (const target of summary.targets ?? []) {
          if (target.value == null || !Number.isFinite(target.value)) {
            continue;
          }
          const values = targetValues.get(target.metricName) ?? [];
          values.push(target.value);
          targetValues.set(target.metricName, values);
        }
      }

      const distributions = Object.fromEntries(
        [...targetValues.entries()].map(([metricName, values]) => [
          metricName,
          summarizeBenchmarkDistribution(values),
        ]),
      );
      const medianMetrics = Object.fromEntries(
        Object.entries(distributions).flatMap(([metricName, distribution]) =>
          distribution.median == null ? [] : [[metricName, distribution.median]]),
      );

      return {
        scenario,
        runId,
        generatedAt: new Date().toISOString(),
        metrics: scenarioSummaries[0]?.metrics ?? {},
        derivedMetrics: medianMetrics,
        targets: evaluateBenchmarkTargets(medianMetrics, scenario, distributions),
        slowestIpc: scenarioSummaries
          .flatMap((summary) => summary.slowestIpc)
          .sort((left, right) => right.durationMs - left.durationMs)
          .slice(0, 10),
        slowestCore: scenarioSummaries
          .flatMap((summary) => summary.slowestCore)
          .sort((left, right) => right.durationMs - left.durationMs)
          .slice(0, 10),
      } satisfies BanjiBenchmarkScenarioSummary;
    })
    .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));
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
