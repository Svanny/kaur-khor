import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { BrowserWindow, Notification, ipcMain, shell } from 'electron';
import {
  KAUR_KHOR_BENCHMARK_SCENARIOS,
  aggregateBenchmarkScenarioSummaries,
  benchmarkRunStatusForTargets,
  benchmarkTargetStatusCounts,
  type KaurKhorBenchmarkCategory,
  type KaurKhorBenchmarkComparison,
  type KaurKhorBenchmarkComparisonMetric,
  type KaurKhorBenchmarkEvent,
  type KaurKhorBenchmarkFlamegraphArtifact,
  type KaurKhorBenchmarkFlamegraphRequest,
  type KaurKhorBenchmarkRunEvent,
  type KaurKhorBenchmarkRunOptions,
  type KaurKhorBenchmarkRunRecord,
  type KaurKhorBenchmarkRunStatus,
  type KaurKhorBenchmarkScenarioId,
  type KaurKhorBenchmarkScenarioSummary,
  type KaurKhorBenchmarkTargetEvaluation,
} from '@shared/benchmark';
import { IPC_CHANNELS } from '@shared/ipc';
import {
  benchmarkRunCompletionNotification,
  cancelBenchmarkRunRecord,
  isBenchmarkRunInFlight,
  isBenchmarkRunTerminal,
  reconcileBenchmarkRunRecord,
} from './benchmark-runner-state';
import { settleBenchmarkTasksSequentially } from './benchmark-runner-scheduling';

const MAX_TAIL_LINES = 200;
const RUN_RECORD_DIRECTORY = 'gui-runs';
const FLAMEGRAPH_DIRECTORY = 'flamegraphs';

export const SCENARIO_FILE_BY_ID = Object.fromEntries(
  KAUR_KHOR_BENCHMARK_SCENARIOS.map((scenario) => [scenario.id, scenario.file]),
) as Record<KaurKhorBenchmarkScenarioId, string>;

type ActiveBenchmarkRun = {
  children: Set<ChildProcessWithoutNullStreams>;
  record: KaurKhorBenchmarkRunRecord;
  cancelled: boolean;
};

export function benchmarkOutputDirectoryForRun(resultsDirectory: string, runId: string) {
  return join(resultsDirectory, safeRunId(runId));
}

export function normalizeBenchmarkRunRecordOutputDirectory(
  resultsDirectory: string,
  record: KaurKhorBenchmarkRunRecord,
): KaurKhorBenchmarkRunRecord {
  const outputDirectory = benchmarkOutputDirectoryForRun(resultsDirectory, record.runId);
  return record.outputDirectory === outputDirectory
    ? record
    : {
        ...record,
        outputDirectory,
      };
}

export function benchmarkChildSpawnOptions(projectRoot: string, env: NodeJS.ProcessEnv) {
  return {
    cwd: projectRoot,
    detached: process.platform !== 'win32',
    env,
    stdio: 'pipe' as const,
  };
}

export function terminateBenchmarkChild(child: Pick<ChildProcessWithoutNullStreams, 'kill' | 'pid' | 'killed'>) {
  if (child.killed) {
    return;
  }

  if (process.platform !== 'win32' && child.pid) {
    try {
      process.kill(-child.pid, 'SIGTERM');
      return;
    } catch {
      // Fall back to the direct child if the process group is already gone.
    }
  }

  child.kill('SIGTERM');
}

export interface FlamegraphNode {
  name: string;
  value: number;
  children?: FlamegraphNode[];
}

interface ScenarioEventBundle {
  directory: string;
  events: KaurKhorBenchmarkEvent[];
  summary: KaurKhorBenchmarkScenarioSummary;
}

function boundedTail(lines: string[], nextLine: string) {
  return [...lines, nextLine].slice(-MAX_TAIL_LINES);
}

function safeRunId(runId: string) {
  if (
    typeof runId !== 'string' ||
    runId.length === 0 ||
    runId === '.' ||
    runId === '..' ||
    !/^[a-zA-Z0-9._-]+$/.test(runId)
  ) {
    throw new Error('Invalid benchmark run id.');
  }
  return runId;
}

function summarizeMetricValue(summary: KaurKhorBenchmarkScenarioSummary, name: string) {
  return summary.derivedMetrics?.[name] ?? summary.metrics?.[name]?.median ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function finiteNumberOrNull(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function normalizeMetricSummary(value: unknown): KaurKhorBenchmarkScenarioSummary['metrics'][string] | null {
  if (!isRecord(value)) {
    return null;
  }

  const count = finiteNumberOrNull(value.count);
  if (count == null) {
    return null;
  }

  return {
    count,
    max: finiteNumberOrNull(value.max),
    median: finiteNumberOrNull(value.median),
    min: finiteNumberOrNull(value.min),
    p95: finiteNumberOrNull(value.p95),
  };
}

function normalizeBenchmarkMetrics(value: unknown): KaurKhorBenchmarkScenarioSummary['metrics'] {
  if (!isRecord(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([name, metric]) => {
      const normalizedMetric = normalizeMetricSummary(metric);
      return normalizedMetric ? [[name, normalizedMetric]] : [];
    }),
  );
}

function normalizeDerivedMetrics(value: unknown): Record<string, number> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const entries = Object.entries(value).filter((entry): entry is [string, number] => (
    typeof entry[1] === 'number' && Number.isFinite(entry[1])
  ));
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function normalizeBenchmarkTargets(value: unknown): KaurKhorBenchmarkScenarioSummary['targets'] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const validStatuses = new Set(['pass', 'watch', 'fail', 'missing']);
  const validUnits = new Set(['ms', 'percent', 'boolean']);
  const validCategories = new Set(['startup', 'navigation', 'interaction', 'ipc', 'core-command', 'memory', 'stability']);
  const validScenarioIds = new Set(KAUR_KHOR_BENCHMARK_SCENARIOS.map((scenario) => scenario.id));
  const targets = value.flatMap((target) => {
    const nonNegotiable = isRecord(target) ? finiteNumberOrNull(target.nonNegotiable) : null;
    const acceptable = isRecord(target) ? finiteNumberOrNull(target.acceptable) : null;
    if (
      !isRecord(target)
      || typeof target.metricName !== 'string'
      || typeof target.label !== 'string'
      || !validCategories.has(target.category as string)
      || !Array.isArray(target.scenarios)
      || !target.scenarios.every((scenario) => validScenarioIds.has(scenario as KaurKhorBenchmarkScenarioId))
      || !validUnits.has(target.unit as string)
      || !validStatuses.has(target.status as string)
      || nonNegotiable == null
      || acceptable == null
      || typeof target.source !== 'string'
      || typeof target.rationale !== 'string'
    ) {
      return [];
    }

    return [{
      metricName: target.metricName,
      label: target.label,
      value: finiteNumberOrNull(target.value),
      unit: target.unit as KaurKhorBenchmarkTargetEvaluation['unit'],
      status: target.status as KaurKhorBenchmarkTargetEvaluation['status'],
      nonNegotiable,
      acceptable,
      source: target.source,
      rationale: target.rationale,
      category: target.category as KaurKhorBenchmarkCategory,
      scenarios: target.scenarios as KaurKhorBenchmarkScenarioId[],
      p95: finiteNumberOrNull(target.p95),
      jitterBudget: finiteNumberOrNull(target.jitterBudget),
    }];
  });
  return targets.length > 0 ? targets : undefined;
}

function normalizeSlowestIpc(value: unknown): KaurKhorBenchmarkScenarioSummary['slowestIpc'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.name !== 'string') {
      return [];
    }
    const durationMs = finiteNumberOrNull(entry.durationMs);
    return durationMs == null ? [] : [{ name: entry.name, durationMs }];
  });
}

function normalizeSlowestCore(value: unknown): KaurKhorBenchmarkScenarioSummary['slowestCore'] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.name !== 'string') {
      return [];
    }
    const durationMs = finiteNumberOrNull(entry.durationMs);
    if (durationMs == null) {
      return [];
    }
    return [{
      name: entry.name,
      command: typeof entry.command === 'string' ? entry.command : null,
      durationMs,
    }];
  });
}

function normalizeBenchmarkSummaries(value: unknown, runId: string): KaurKhorBenchmarkScenarioSummary[] {
  const validScenarioIds = new Set(KAUR_KHOR_BENCHMARK_SCENARIOS.map((scenario) => scenario.id));
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((summary) => {
    if (!isRecord(summary) || !validScenarioIds.has(summary.scenario as KaurKhorBenchmarkScenarioId)) {
      return [];
    }
    return [{
      scenario: summary.scenario as KaurKhorBenchmarkScenarioId,
      runId: typeof summary.runId === 'string' ? summary.runId : runId,
      generatedAt: typeof summary.generatedAt === 'string' ? summary.generatedAt : '',
      metrics: normalizeBenchmarkMetrics(summary.metrics),
      derivedMetrics: normalizeDerivedMetrics(summary.derivedMetrics),
      targets: normalizeBenchmarkTargets(summary.targets),
      slowestIpc: normalizeSlowestIpc(summary.slowestIpc),
      slowestCore: normalizeSlowestCore(summary.slowestCore),
    }];
  });
}

function safeRunIdOrNull(runId: unknown) {
  try {
    return safeRunId(runId as string);
  } catch {
    return null;
  }
}

function normalizePersistedIsoTimestamp(value: unknown) {
  if (typeof value !== 'string') {
    return null;
  }
  const timestamp = new Date(value);
  if (!Number.isFinite(timestamp.getTime())) {
    return null;
  }
  const normalizedValue = value.includes('.') ? value : value.replace('Z', '.000Z');
  return timestamp.toISOString() === normalizedValue ? timestamp.toISOString() : null;
}

export function normalizePersistedBenchmarkRunRecord(
  resultsDirectory: string,
  value: unknown,
): KaurKhorBenchmarkRunRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const record = value as Partial<KaurKhorBenchmarkRunRecord>;
  const runId = safeRunIdOrNull(record.runId);
  if (!runId) {
    return null;
  }

  const validScenarioIds = new Set(KAUR_KHOR_BENCHMARK_SCENARIOS.map((scenario) => scenario.id));
  const scenarios = Array.isArray(record.scenarios)
    ? record.scenarios.filter((scenario): scenario is KaurKhorBenchmarkScenarioId => validScenarioIds.has(scenario as KaurKhorBenchmarkScenarioId))
    : [];
  if (scenarios.length === 0) {
    return null;
  }

  const status = record.status;
  if (!status || !['queued', 'running', 'passed', 'warning', 'failed', 'cancelled'].includes(status)) {
    return null;
  }
  const startedAt = normalizePersistedIsoTimestamp(record.startedAt);
  if (!startedAt) {
    return null;
  }

  const fixtureSize = ['minimal', 'medium', 'heavy', 'power-user'].includes(record.fixtureSize as string)
    ? record.fixtureSize as KaurKhorBenchmarkRunRecord['fixtureSize']
    : 'medium';
  const completedAt = normalizePersistedIsoTimestamp(record.completedAt);

  return normalizeBenchmarkRunRecordOutputDirectory(resultsDirectory, {
    runId,
    scenarios,
    status,
    startedAt,
    completedAt,
    fixtureSize,
    traceEnabled: Boolean(record.traceEnabled),
    repeatCount: Math.min(5, Math.max(1, Math.floor(Number(record.repeatCount) || 1))),
    buildBeforeRun: record.buildBeforeRun !== false,
    outputDirectory: '',
    exitCode: typeof record.exitCode === 'number' && Number.isFinite(record.exitCode) ? record.exitCode : null,
    summaries: normalizeBenchmarkSummaries(record.summaries, runId),
    stdoutTail: Array.isArray(record.stdoutTail) ? record.stdoutTail.filter((line): line is string => typeof line === 'string').slice(-MAX_TAIL_LINES) : [],
    stderrTail: Array.isArray(record.stderrTail) ? record.stderrTail.filter((line): line is string => typeof line === 'string').slice(-MAX_TAIL_LINES) : [],
    error: typeof record.error === 'string' ? record.error : null,
  });
}

export async function readBenchmarkJsonFile<T>(path: string): Promise<T | null> {
  const raw = await readFile(path, 'utf8').catch(() => null);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as T;
  } catch {
    return null;
  }
}

async function readJsonlFile<T>(path: string): Promise<T[]> {
  const raw = await readFile(path, 'utf8').catch(() => '');
  return raw
    .split('\n')
    .filter(Boolean)
    .flatMap((line) => {
      try {
        return [JSON.parse(line) as T];
      } catch {
        return [];
      }
    });
}

async function walkFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) {
        return walkFiles(path);
      }
      return [path];
    }),
  );
  return files.flat();
}

export function normalizeRunOptions(options: KaurKhorBenchmarkRunOptions): KaurKhorBenchmarkRunOptions {
  if (!options || typeof options !== 'object') {
    throw new Error('Benchmark run options must be an object.');
  }
  const validScenarioIds = new Set(KAUR_KHOR_BENCHMARK_SCENARIOS.map((scenario) => scenario.id));
  const requestedScenarios = Array.isArray(options.scenarios) ? options.scenarios : [];
  const scenarios = requestedScenarios.filter((scenario) => validScenarioIds.has(scenario));
  if (scenarios.length === 0) {
    throw new Error('Select at least one benchmark scenario.');
  }
  return {
    scenarios,
    fixtureSize: ['minimal', 'medium', 'heavy', 'power-user'].includes(options.fixtureSize) ? options.fixtureSize : 'medium',
    traceEnabled: Boolean(options.traceEnabled),
    repeatCount: Math.min(5, Math.max(1, Math.floor(Number(options.repeatCount) || 1))),
    buildBeforeRun: options.buildBeforeRun !== false,
  };
}

export function normalizeBenchmarkComparisonPayload(payload: {
  baselineRunId: string;
  candidateRunId: string;
}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Benchmark comparison requires two run ids.');
  }
  return {
    baselineRunId: safeRunId(payload.baselineRunId),
    candidateRunId: safeRunId(payload.candidateRunId),
  };
}

export function normalizeBenchmarkFlamegraphRequest(payload: KaurKhorBenchmarkFlamegraphRequest) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Benchmark flame graph request must be an object.');
  }
  return {
    runId: safeRunId(payload.runId),
    scenario: payload.scenario,
  } satisfies KaurKhorBenchmarkFlamegraphRequest;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatMs(value: number) {
  return `${Math.round(value)} ms`;
}

function flamegraphPercent(value: number, total: number) {
  if (!Number.isFinite(value) || !Number.isFinite(total) || total <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(100, (value / total) * 100));
}

function flamegraphHue(depth: number) {
  return [203, 168, 28, 338, 252, 145][depth % 6];
}

function eventDuration(event: KaurKhorBenchmarkEvent) {
  return typeof event.durationMs === 'number' && Number.isFinite(event.durationMs) && event.durationMs > 0
    ? event.durationMs
    : null;
}

function eventLabel(event: KaurKhorBenchmarkEvent) {
  const command = event.command ? ` (${event.command})` : '';
  return `${event.layer}/${event.category}: ${event.name}${command}`;
}

function metricNode(name: string, value: number | null | undefined): FlamegraphNode | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return { name: `${name} - ${formatMs(value)}`, value };
}

function groupDurationNodes(events: KaurKhorBenchmarkEvent[], groupName: string, predicate: (event: KaurKhorBenchmarkEvent) => boolean) {
  const totals = new Map<string, number>();
  for (const event of events) {
    if (!predicate(event)) {
      continue;
    }
    const duration = eventDuration(event);
    if (duration == null) {
      continue;
    }
    const label = eventLabel(event);
    totals.set(label, (totals.get(label) ?? 0) + duration);
  }
  const children = [...totals.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 24)
    .map(([name, value]) => ({ name: `${name} - ${formatMs(value)}`, value }));
  if (children.length === 0) {
    return null;
  }
  return {
    name: groupName,
    value: children.reduce((sum, child) => sum + child.value, 0),
    children,
  } satisfies FlamegraphNode;
}

function observedTimelineMs(events: KaurKhorBenchmarkEvent[]) {
  const firstTs = events[0]?.ts ?? 0;
  const lastTs = events.at(-1)?.ts ?? firstTs;
  return Math.max(1, lastTs - firstTs);
}

function buildScenarioFlamegraphData(bundle: ScenarioEventBundle, label: string) {
  const { events, summary } = bundle;
  const observedWindowMs = observedTimelineMs(events);
  const derivedMetricNodes = Object.entries(summary.derivedMetrics ?? {})
    .flatMap(([name, value]) => {
      const node = metricNode(name, value);
      return node ? [node] : [];
    });
  const targetNodes = (summary.targets ?? [])
    .flatMap((target) => {
      const node = metricNode(`${target.status.toUpperCase()} target: ${target.metricName}`, target.value);
      return node ? [node] : [];
    });
  const maybeGroups: Array<FlamegraphNode | null> = [
    derivedMetricNodes.length > 0
      ? {
          name: 'Derived target metrics',
          value: derivedMetricNodes.reduce((sum, child) => sum + child.value, 0),
          children: derivedMetricNodes,
        }
      : null,
    targetNodes.length > 0
      ? {
          name: 'Target evaluations',
          value: targetNodes.reduce((sum, child) => sum + child.value, 0),
          children: targetNodes,
        }
      : null,
    groupDurationNodes(events, 'Startup spans', (event) => event.category === 'startup'),
    groupDurationNodes(events, 'IPC spans', (event) => event.category === 'ipc'),
    groupDurationNodes(events, 'Core command spans', (event) => event.category === 'core-command'),
    groupDurationNodes(events, 'Renderer and interaction spans', (event) => event.layer === 'renderer' || event.category === 'interaction'),
    groupDurationNodes(events, 'Memory snapshots', (event) => event.category === 'memory'),
  ];
  const groups: FlamegraphNode[] = [];
  for (const node of maybeGroups) {
    if (node) {
      groups.push(node);
    }
  }
  const value = groups.reduce((sum, node) => sum + node.value, 0) || observedWindowMs;
  return {
    name: `${summary.scenario} ${label} - observed ${formatMs(observedWindowMs)}`,
    value,
    children: groups,
  } satisfies FlamegraphNode;
}

function renderStaticFlamegraphNode(node: FlamegraphNode, total: number, depth = 0): string {
  const percent = flamegraphPercent(node.value, total);
  const hue = flamegraphHue(depth);
  const children = node.children ?? [];
  const childMarkup = children
    .map((child) => renderStaticFlamegraphNode(child, total, depth + 1))
    .join('');
  const summary = `
    <summary>
      <span class="node-indent" style="width: ${depth * 18}px"></span>
      <span class="node-bar" style="width: ${percent.toFixed(3)}%; --node-hue: ${hue};"></span>
      <span class="node-label">${escapeHtml(node.name)}</span>
      <span class="node-value">${escapeHtml(formatMs(node.value))} - ${percent.toFixed(1)}%</span>
    </summary>`;
  if (childMarkup.length === 0) {
    return `<details class="flame-node leaf" open>${summary}</details>`;
  }
  return `<details class="flame-node" open>${summary}<div class="children">${childMarkup}</div></details>`;
}

export function buildFlamegraphHtml({
  data,
  record,
  scenario,
}: {
  data: FlamegraphNode;
  record: KaurKhorBenchmarkRunRecord;
  scenario: KaurKhorBenchmarkScenarioId;
}) {
  const title = `${scenario} flame graph - ${record.runId}`;
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root {
      color-scheme: light;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #f8fafc;
      color: #111827;
    }
    body {
      margin: 0;
      padding: 32px;
    }
    main {
      display: grid;
      gap: 18px;
    }
    .meta {
      display: grid;
      gap: 8px;
      max-width: 1100px;
    }
    h1 {
      margin: 0;
      font-size: 28px;
      line-height: 1.2;
      letter-spacing: 0;
    }
    p {
      margin: 0;
      color: #475569;
      line-height: 1.6;
    }
    .chart-shell {
      overflow-x: auto;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      background: #ffffff;
      padding: 16px;
    }
    #chart {
      min-width: 1280px;
    }
    .flame-node {
      display: block;
      color: #111827;
    }
    .flame-node summary {
      position: relative;
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      align-items: center;
      min-height: 32px;
      gap: 12px;
      list-style: none;
      white-space: nowrap;
    }
    .flame-node summary::-webkit-details-marker {
      display: none;
    }
    .node-indent {
      grid-column: 1;
      grid-row: 1;
      height: 1px;
    }
    .node-bar {
      grid-column: 2 / 4;
      grid-row: 1;
      min-width: 2px;
      height: 26px;
      border: 1px solid hsl(var(--node-hue) 70% 36%);
      border-radius: 4px;
      background: hsl(var(--node-hue) 82% 72%);
    }
    .node-label {
      grid-column: 2;
      grid-row: 1;
      overflow: hidden;
      padding-left: 10px;
      font-size: 13px;
      font-weight: 600;
      text-overflow: ellipsis;
      z-index: 1;
    }
    .node-value {
      grid-column: 3;
      grid-row: 1;
      padding-right: 10px;
      color: #0f172a;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      z-index: 1;
    }
    .children {
      display: grid;
      gap: 2px;
    }
  </style>
</head>
<body>
  <main>
    <section class="meta">
      <h1>${escapeHtml(title)}</h1>
      <p>Generated from persisted Kaur Khor benchmark events for one scope only: <strong>${escapeHtml(scenario)}</strong>. Fixture: ${escapeHtml(record.fixtureSize)}. Repeat count: ${record.repeatCount}. When repeats exist, this artifact uses the worst-case repeat by longest observed timeline.</p>
      <p>This self-contained static flame graph uses benchmark event durations and derived target metrics; it is not a sampled CPU profiler capture.</p>
    </section>
    <section class="chart-shell">
      <div id="chart">${renderStaticFlamegraphNode(data, data.value)}</div>
    </section>
  </main>
</body>
</html>
`;
}

export function registerBenchmarkRunnerIpc({
  appIsPackaged,
  projectRoot,
}: {
  appIsPackaged: boolean;
  projectRoot: string;
}) {
  const resultsDirectory = resolve(projectRoot, 'bench-results');
  const desktopCoreBinary = join(
    projectRoot,
    'apps/desktop-core/target/debug',
    process.platform === 'win32' ? 'kaur-khor-desktop-core.exe' : 'kaur-khor-desktop-core',
  );
  const runRecordsDirectory = join(resultsDirectory, RUN_RECORD_DIRECTORY);
  let activeRun: ActiveBenchmarkRun | null = null;
  const notifiedRunIds = new Set<string>();

  function recordPath(runId: string) {
    return join(runRecordsDirectory, `${safeRunId(runId)}.json`);
  }

  async function persistRecord(record: KaurKhorBenchmarkRunRecord) {
    await mkdir(runRecordsDirectory, { recursive: true });
    await writeFile(recordPath(record.runId), `${JSON.stringify(record, null, 2)}\n`, 'utf8');
  }

  function emitRunEvent(event: KaurKhorBenchmarkRunEvent) {
    for (const window of BrowserWindow.getAllWindows()) {
      window.webContents.send(IPC_CHANNELS.benchmarkRunnerEvent, event);
    }
  }

  function notifyRunCompletion(record: KaurKhorBenchmarkRunRecord) {
    if (!isBenchmarkRunTerminal(record.status) || notifiedRunIds.has(record.runId)) {
      return;
    }
    notifiedRunIds.add(record.runId);

    if (!Notification.isSupported()) {
      return;
    }
    const notification = benchmarkRunCompletionNotification(record);
    if (!notification) {
      return;
    }
    const desktopNotification = new Notification(notification);
    desktopNotification.on('click', () => {
      const [window] = BrowserWindow.getAllWindows();
      window?.show();
      window?.focus();
    });
    desktopNotification.show();
  }

  async function setRunStatus(
    run: ActiveBenchmarkRun,
    status: KaurKhorBenchmarkRunStatus,
    message: string,
    extra?: Partial<KaurKhorBenchmarkRunRecord>,
  ) {
    run.record = {
      ...run.record,
      ...extra,
      status,
      completedAt: ['passed', 'warning', 'failed', 'cancelled'].includes(status) ? new Date().toISOString() : run.record.completedAt,
    };
    await persistRecord(run.record);
    emitRunEvent({ runId: run.record.runId, status, message, record: run.record });
    notifyRunCompletion(run.record);
  }

  async function readRun(runId: string) {
    const record = normalizePersistedBenchmarkRunRecord(
      resultsDirectory,
      await readBenchmarkJsonFile<unknown>(recordPath(runId)),
    );
    if (!record) {
      return null;
    }
    if (activeRun && activeRun.record.runId === record.runId) {
      return activeRun.record;
    }
    const reconciled = reconcileBenchmarkRunRecord(record, activeRun?.record.runId ?? null);
    if (reconciled !== record) {
      await persistRecord(reconciled);
    }
    return reconciled;
  }

  async function readStoredRun(runId: string) {
    return normalizePersistedBenchmarkRunRecord(
      resultsDirectory,
      await readBenchmarkJsonFile<unknown>(recordPath(runId)),
    );
  }

  async function collectSummaries(record: KaurKhorBenchmarkRunRecord): Promise<KaurKhorBenchmarkScenarioSummary[]> {
    const startedMs = new Date(record.startedAt).getTime();
    const files = await walkFiles(record.outputDirectory);
    const summaries = await Promise.all(
      files
        .filter((file) => file.endsWith('.summary.json'))
        .map(async (file) => {
          const fileStat = await stat(file).catch(() => null);
          if (!fileStat || fileStat.mtimeMs < startedMs) {
            return null;
          }
          return readBenchmarkJsonFile<KaurKhorBenchmarkScenarioSummary>(file);
        }),
    );
    const freshSummaries = summaries
      .filter((summary): summary is KaurKhorBenchmarkScenarioSummary => Boolean(summary))
      .sort((left, right) => left.generatedAt.localeCompare(right.generatedAt));
    return aggregateBenchmarkScenarioSummaries({
      runId: record.runId,
      summaries: freshSummaries,
    });
  }

  async function collectScenarioEventBundles(
    record: KaurKhorBenchmarkRunRecord,
    scenario: KaurKhorBenchmarkScenarioId,
  ): Promise<ScenarioEventBundle[]> {
    if (!record.scenarios.includes(scenario)) {
      throw new Error(`Benchmark run ${record.runId} did not include ${scenario}.`);
    }
    const startedMs = new Date(record.startedAt).getTime();
    const completedMs = record.completedAt ? new Date(record.completedAt).getTime() : Number.POSITIVE_INFINITY;
    const files = await walkFiles(record.outputDirectory);
    const summaryFiles = files.filter((file) => file.endsWith(`${scenario}.summary.json`));
    const bundles = await Promise.all(
      summaryFiles.map(async (summaryFile) => {
        const fileStat = await stat(summaryFile).catch(() => null);
        if (!fileStat || fileStat.mtimeMs < startedMs || fileStat.mtimeMs > completedMs + 120_000) {
          return null;
        }
        const summary = await readBenchmarkJsonFile<KaurKhorBenchmarkScenarioSummary>(summaryFile);
        if (!summary || summary.scenario !== scenario) {
          return null;
        }
        const directory = dirname(summaryFile);
        const directoryEntries = await readdir(directory).catch(() => []);
        const coreEventFiles = directoryEntries
          .filter((entry) => entry === 'core-events.jsonl' || /^core-events-.+\.jsonl$/.test(entry))
          .map((entry) => join(directory, entry));
        const [rendererEvents, ...coreEventStreams] = await Promise.all([
          readJsonlFile<KaurKhorBenchmarkEvent>(join(directory, 'events.jsonl')),
          ...coreEventFiles.map((file) => readJsonlFile<KaurKhorBenchmarkEvent>(file)),
        ]);
        const coreEvents = coreEventStreams.flat();
        const events = [...rendererEvents, ...coreEvents].sort((left, right) => left.ts - right.ts);
        if (events.length === 0) {
          return null;
        }
        return { directory, events, summary } satisfies ScenarioEventBundle;
      }),
    );
    return bundles
      .filter((bundle): bundle is ScenarioEventBundle => Boolean(bundle))
      .sort((left, right) => left.summary.generatedAt.localeCompare(right.summary.generatedAt));
  }

  async function generateFlamegraphArtifact(
    payload: KaurKhorBenchmarkFlamegraphRequest,
  ): Promise<KaurKhorBenchmarkFlamegraphArtifact> {
    const flamegraphRequest = normalizeBenchmarkFlamegraphRequest(payload);
    const run = await readRun(flamegraphRequest.runId);
    if (!run) {
      throw new Error('Benchmark run not found.');
    }
    if (isBenchmarkRunInFlight(run.status)) {
      throw new Error('Wait for the benchmark run to finish before generating a flame graph.');
    }
    const scenario = flamegraphRequest.scenario;
    if (!KAUR_KHOR_BENCHMARK_SCENARIOS.some((entry) => entry.id === scenario)) {
      throw new Error('Choose a single benchmark scope before generating a flame graph.');
    }
    const bundles = await collectScenarioEventBundles(run, scenario);
    if (bundles.length === 0) {
      throw new Error(`No persisted ${scenario} benchmark events were found for this run.`);
    }
    const worstCaseBundle = bundles.reduce((currentWorst, candidate) =>
      observedTimelineMs(candidate.events) > observedTimelineMs(currentWorst.events) ? candidate : currentWorst);
    const worstCaseIndex = bundles.indexOf(worstCaseBundle);
    const worstCaseLabel = bundles.length > 1
      ? `worst-case repeat ${worstCaseIndex + 1} of ${bundles.length}`
      : 'repeat 1 of 1';
    const child = buildScenarioFlamegraphData(worstCaseBundle, worstCaseLabel);
    const data: FlamegraphNode = {
      name: `${scenario} flame graph - ${run.runId}`,
      value: child.value,
      children: [child],
    };
    const artifactDirectory = join(resultsDirectory, FLAMEGRAPH_DIRECTORY, safeRunId(run.runId));
    await mkdir(artifactDirectory, { recursive: true });
    const artifactPath = join(artifactDirectory, `${scenario}.html`);
    await writeFile(
      artifactPath,
      buildFlamegraphHtml({ data, record: run, scenario }),
      'utf8',
    );
    const openError = await shell.openPath(artifactPath);
    if (openError) {
      throw new Error(openError);
    }
    return {
      runId: run.runId,
      scenario,
      artifactPath,
    };
  }

  async function spawnStep(
    run: ActiveBenchmarkRun,
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
  ) {
    await setRunStatus(run, 'running', `${command} ${args.join(' ')}`);
    const child = spawn(command, args, {
      ...benchmarkChildSpawnOptions(projectRoot, env),
    });
    run.children.add(child);

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      for (const line of chunk.split(/\r?\n/).filter(Boolean)) {
        run.record.stdoutTail = boundedTail(run.record.stdoutTail, line);
        emitRunEvent({
          runId: run.record.runId,
          status: run.record.status,
          message: line,
          stream: 'stdout',
          line,
        });
      }
    });
    child.stderr.on('data', (chunk: string) => {
      for (const line of chunk.split(/\r?\n/).filter(Boolean)) {
        run.record.stderrTail = boundedTail(run.record.stderrTail, line);
        emitRunEvent({
          runId: run.record.runId,
          status: run.record.status,
          message: line,
          stream: 'stderr',
          line,
        });
      }
    });

    const exitCode = await new Promise<number | null>((resolveExit) => {
      child.once('exit', (code) => resolveExit(code));
    });
    run.children.delete(child);
    await persistRecord(run.record);
    if (run.cancelled) {
      throw new Error('cancelled');
    }
    if (exitCode !== 0) {
      throw new Error(`${command} ${args.join(' ')} exited with ${exitCode ?? 'unknown'}`);
    }
  }

  async function spawnScenarioRepeat(
    run: ActiveBenchmarkRun,
    scenario: KaurKhorBenchmarkScenarioId,
    repeatIndex: number,
    env: NodeJS.ProcessEnv,
  ) {
    const repeatLabel = run.record.repeatCount > 1
      ? `repeat ${repeatIndex + 1}/${run.record.repeatCount}`
      : 'repeat 1/1';
    const reportDirectory = join(run.record.outputDirectory, 'playwright-reports');
    const artifactsDirectory = join(
      run.record.outputDirectory,
      'playwright-artifacts',
      `${run.record.runId}-${scenario}-repeat-${repeatIndex + 1}`,
    );
    await mkdir(reportDirectory, { recursive: true });
    await mkdir(artifactsDirectory, { recursive: true });
    const repeatEnv = {
      ...env,
      KAUR_KHOR_BENCHMARK_REPEAT_INDEX: String(repeatIndex),
      KAUR_KHOR_BENCHMARK_PLAYWRIGHT_REPORT: join(
        reportDirectory,
        `${run.record.runId}-${scenario}-repeat-${repeatIndex + 1}.json`,
      ),
      KAUR_KHOR_BENCHMARK_PLAYWRIGHT_ARTIFACTS_DIR: artifactsDirectory,
    };

    await spawnStep(
      run,
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        '-c',
        'playwright.bench.config.ts',
        SCENARIO_FILE_BY_ID[scenario],
      ],
      repeatEnv,
    ).catch((error) => {
      if (error instanceof Error) {
        throw new Error(`${scenario} ${repeatLabel} failed: ${error.message}`);
      }
      throw error;
    });
  }

  async function runBenchmark(record: KaurKhorBenchmarkRunRecord) {
    if (!activeRun || activeRun.record.runId !== record.runId) {
      return;
    }
    const run = activeRun;
    const env = {
      ...process.env,
      KAUR_KHOR_DESKTOP_CORE_BINARY: process.env.KAUR_KHOR_DESKTOP_CORE_BINARY ?? desktopCoreBinary,
      KAUR_KHOR_BENCHMARK_OUTPUT_DIR: record.outputDirectory,
      KAUR_KHOR_BENCHMARK_TRACE: record.traceEnabled ? '1' : '0',
      KAUR_KHOR_BENCHMARK_FIXTURE_SIZE: record.fixtureSize,
    };

    try {
      if (record.buildBeforeRun) {
        await spawnStep(run, 'pnpm', ['build'], env);
        await spawnStep(run, 'cargo', ['build', '--manifest-path', resolve(projectRoot, 'apps/desktop-core/Cargo.toml')], env);
      }
      for (const scenario of record.scenarios) {
        await setRunStatus(
          run,
          'running',
          `Running ${scenario} with ${record.repeatCount} sequential repeat${record.repeatCount === 1 ? '' : 's'}.`,
        );
        const results = await settleBenchmarkTasksSequentially(
          Array.from({ length: record.repeatCount }, (_value, repeatIndex) =>
            () => spawnScenarioRepeat(run, scenario, repeatIndex, env)),
        );
        if (run.cancelled) {
          throw new Error('cancelled');
        }
        const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        if (failed) {
          throw failed.reason;
        }
      }
      const summaries = await collectSummaries(record);
      const targetStatus = benchmarkRunStatusForTargets(summaries, record.scenarios);
      const counts = benchmarkTargetStatusCounts(summaries, record.scenarios);
      await setRunStatus(
        run,
        targetStatus,
        targetStatus === 'warning'
          ? `Benchmark run completed with ${counts.watch} watch target${counts.watch === 1 ? '' : 's'}.`
          : targetStatus === 'failed'
            ? `Benchmark run completed with ${counts.fail} failed, ${counts.missing} missing, ${counts.missingScenarios} missing scenario, and ${counts.zeroTargetSummaries} zero-target summary issue${counts.fail + counts.missing + counts.missingScenarios + counts.zeroTargetSummaries === 1 ? '' : 's'}.`
            : 'Benchmark run completed with all targets passing.',
        {
          summaries,
          exitCode: targetStatus === 'failed' ? 1 : 0,
          error: targetStatus === 'failed'
            ? `Benchmark targets failed or were missing: ${counts.fail} failed, ${counts.missing} missing, ${counts.missingScenarios} missing scenario, ${counts.zeroTargetSummaries} zero-target summary.`
            : null,
        },
      );
    } catch (error) {
      const cancelled = run.cancelled || (error instanceof Error && error.message === 'cancelled');
      const summaries = await collectSummaries(record);
      await setRunStatus(run, cancelled ? 'cancelled' : 'failed', cancelled ? 'Benchmark run cancelled.' : 'Benchmark run failed.', {
        summaries,
        exitCode: cancelled ? null : 1,
        error: cancelled ? null : error instanceof Error ? error.message : String(error),
      });
    } finally {
      activeRun = null;
    }
  }

  ipcMain.handle(IPC_CHANNELS.benchmarkRunnerGetAvailability, async () => ({
    available: !appIsPackaged,
    reason: appIsPackaged ? 'Benchmark runner is disabled in packaged builds.' : null,
    projectRoot,
    resultsDirectory,
    activeRunId: activeRun?.record.runId ?? null,
  }));

  ipcMain.handle(IPC_CHANNELS.benchmarkRunnerListRuns, async () => {
    await mkdir(runRecordsDirectory, { recursive: true });
    const entries = await readdir(runRecordsDirectory).catch(() => []);
    const runs = await Promise.all(
      entries
        .filter((entry) => entry.endsWith('.json'))
        .map(async (entry) => {
          const record = normalizePersistedBenchmarkRunRecord(
            resultsDirectory,
            await readBenchmarkJsonFile<unknown>(join(runRecordsDirectory, entry)),
          );
          if (!record) {
            return null;
          }
          if (activeRun && activeRun.record.runId === record.runId) {
            return activeRun.record;
          }
          const reconciled = reconcileBenchmarkRunRecord(record, activeRun?.record.runId ?? null);
          if (reconciled !== record) {
            await persistRecord(reconciled);
          }
          return reconciled;
        }),
    );
    return runs
      .filter((run): run is KaurKhorBenchmarkRunRecord => Boolean(run))
      .sort((left, right) => right.startedAt.localeCompare(left.startedAt));
  });

  ipcMain.handle(IPC_CHANNELS.benchmarkRunnerReadRun, async (_event, runId: string) =>
    readRun(runId),
  );

  ipcMain.handle(IPC_CHANNELS.benchmarkRunnerStartRun, async (_event, options: KaurKhorBenchmarkRunOptions) => {
    if (appIsPackaged) {
      throw new Error('Benchmark runner is disabled in packaged builds.');
    }
    if (activeRun) {
      throw new Error(`Benchmark run ${activeRun.record.runId} is already running.`);
    }

    const normalizedOptions = normalizeRunOptions(options);
    const runId = `gui-${Date.now()}`;
    const outputDirectory = benchmarkOutputDirectoryForRun(resultsDirectory, runId);
    const record: KaurKhorBenchmarkRunRecord = {
      runId,
      scenarios: normalizedOptions.scenarios,
      status: 'queued',
      startedAt: new Date().toISOString(),
      completedAt: null,
      fixtureSize: normalizedOptions.fixtureSize,
      traceEnabled: normalizedOptions.traceEnabled,
      repeatCount: normalizedOptions.repeatCount,
      buildBeforeRun: normalizedOptions.buildBeforeRun,
      outputDirectory,
      exitCode: null,
      summaries: [],
      stdoutTail: [],
      stderrTail: [],
      error: null,
    };
    activeRun = { children: new Set(), record, cancelled: false };
    await persistRecord(record);
    emitRunEvent({ runId, status: 'queued', message: 'Benchmark run queued.', record });
    void runBenchmark(record);
    return record;
  });

  ipcMain.handle(IPC_CHANNELS.benchmarkRunnerCancelRun, async (_event, runId: string) => {
    if (activeRun && activeRun.record.runId === runId) {
      activeRun.cancelled = true;
      for (const child of activeRun.children) {
        terminateBenchmarkChild(child);
      }
      await setRunStatus(activeRun, 'cancelled', 'Benchmark cancellation requested.');
      return activeRun.record;
    }

    const storedRun = await readStoredRun(runId);
    if (!storedRun) {
      throw new Error('Benchmark run not found.');
    }

    const cancelledRun = isBenchmarkRunInFlight(storedRun.status)
      ? cancelBenchmarkRunRecord(storedRun)
      : storedRun;
    if (cancelledRun !== storedRun) {
      await persistRecord(cancelledRun);
      emitRunEvent({
        runId: cancelledRun.runId,
        status: cancelledRun.status,
        message: 'Benchmark cancellation requested.',
        record: cancelledRun,
      });
      notifyRunCompletion(cancelledRun);
    }
    return cancelledRun;
  });

  ipcMain.handle(IPC_CHANNELS.benchmarkRunnerCompareRuns, async (_event, payload: { baselineRunId: string; candidateRunId: string }) => {
    const comparisonPayload = normalizeBenchmarkComparisonPayload(payload);
    const baseline = await readRun(comparisonPayload.baselineRunId);
    const candidate = await readRun(comparisonPayload.candidateRunId);
    if (!baseline || !candidate) {
      throw new Error('Both benchmark runs are required for comparison.');
    }

    const metricNames = new Set<string>();
    for (const run of [baseline, candidate]) {
      for (const summary of run.summaries) {
        Object.keys(summary.metrics ?? {}).forEach((metric) => metricNames.add(metric));
        Object.keys(summary.derivedMetrics ?? {}).forEach((metric) => metricNames.add(metric));
      }
    }

    function valueFor(run: KaurKhorBenchmarkRunRecord, metricName: string) {
      for (const summary of run.summaries) {
        const value = summarizeMetricValue(summary, metricName);
        if (value != null) {
          return value;
        }
      }
      return null;
    }

    const metrics: KaurKhorBenchmarkComparisonMetric[] = [...metricNames].sort().map((metricName) => {
      const baselineValue = valueFor(baseline, metricName);
      const candidateValue = valueFor(candidate, metricName);
      if (baselineValue == null || candidateValue == null) {
        return {
          metricName,
          baseline: baselineValue,
          candidate: candidateValue,
          delta: null,
          percent: null,
          status: 'missing',
        };
      }
      const delta = candidateValue - baselineValue;
      const percent = baselineValue === 0 ? 0 : (delta / baselineValue) * 100;
      return {
        metricName,
        baseline: baselineValue,
        candidate: candidateValue,
        delta,
        percent,
        status: percent > 10 ? 'regression' : percent < -10 ? 'improvement' : 'same',
      };
    });

    return {
      baselineRunId: baseline.runId,
      candidateRunId: candidate.runId,
      metrics,
    } satisfies KaurKhorBenchmarkComparison;
  });

  ipcMain.handle(IPC_CHANNELS.benchmarkRunnerGenerateFlamegraph, async (_event, payload: KaurKhorBenchmarkFlamegraphRequest) =>
    generateFlamegraphArtifact(payload),
  );

  ipcMain.handle(IPC_CHANNELS.benchmarkRunnerRevealRun, async (_event, runId: string) => {
    const run = await readRun(runId);
    if (!run) {
      throw new Error('Benchmark run not found.');
    }
    const openError = await shell.openPath(run.outputDirectory);
    if (openError) {
      throw new Error(openError);
    }
  });
}
