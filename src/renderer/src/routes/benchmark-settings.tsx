import { useEffect, useMemo, useState } from 'react';
import {
  BANJI_BENCHMARK_SCENARIOS,
  BANJI_BENCHMARK_TARGETS,
  type BanjiBenchmarkComparison,
  type BanjiBenchmarkDistributionSummary,
  type BanjiBenchmarkFixtureSize,
  type BanjiBenchmarkRunRecord,
  type BanjiBenchmarkScenarioId,
  type BanjiBenchmarkTargetEvaluation,
} from '@shared/benchmark';
import { ActionOpenFolderIcon, ActionUndoIcon } from '@icons/actions';
import { NavigationPerformanceIcon } from '@icons/navigation';
import { WorkspaceActionRow, WorkspacePanel } from '@/components/system/workspace';
import { AnchoredMenu } from '@/components/ui/anchored-menu';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

const statusClassName = {
  pass: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  watch: 'bg-amber-50 text-amber-700 ring-amber-200',
  fail: 'bg-rose-50 text-rose-700 ring-rose-200',
  missing: 'bg-muted text-muted-foreground ring-border',
};

type TargetStatusFilter = BanjiBenchmarkTargetEvaluation['status'];
type TargetResultSortDirection = 'asc' | 'desc';

const TARGET_RESULT_FILTER_OPTIONS: Array<{ label: string; value: TargetStatusFilter }> = [
  { label: 'Pass', value: 'pass' },
  { label: 'Watch', value: 'watch' },
  { label: 'Fail', value: 'fail' },
  { label: 'Missing', value: 'missing' },
];
const SUMMARY_FILTER_ALL = 'all';

function compareText(left: string, right: string, direction: TargetResultSortDirection) {
  const result = left.localeCompare(right);
  return direction === 'asc' ? result : -result;
}

function ResultSortHeader({
  direction,
  onClick,
}: {
  direction: TargetResultSortDirection;
  onClick: () => void;
}) {
  return (
    <button
      className="inline-flex items-center gap-1 font-semibold transition-colors hover:text-foreground"
      type="button"
      onClick={onClick}
    >
      <span>Result</span>
      <span className="text-[0.7rem] text-foreground">{direction === 'asc' ? '↑' : '↓'}</span>
    </button>
  );
}
function formatMetricValue(value: number | null, unit: 'ms' | 'percent' | 'boolean') {
  if (value == null) {
    return 'No data';
  }
  if (unit === 'boolean') {
    return value >= 1 ? 'Yes' : 'No';
  }
  if (unit === 'percent') {
    return `${value.toFixed(1)}%`;
  }
  return `${Math.round(value)} ms`;
}

function formatDistributionValue(
  distribution: BanjiBenchmarkDistributionSummary | undefined,
  key: keyof Pick<BanjiBenchmarkDistributionSummary, 'mean' | 'median' | 'iqr' | 'min' | 'max'>,
  unit: 'ms' | 'percent' | 'boolean',
) {
  if (!distribution || distribution.count <= 1) {
    return null;
  }
  return formatMetricValue(distribution[key], unit);
}

function TargetDistributionDetails({ target }: { target: BanjiBenchmarkTargetEvaluation }) {
  const distribution = target.distribution;
  if (!distribution || distribution.count <= 1) {
    return <div className="mt-1 text-muted-foreground">{formatMetricValue(target.value, target.unit)}</div>;
  }

  return (
    <div className="mt-1 grid gap-1 text-xs text-muted-foreground">
      <div>Median {formatDistributionValue(distribution, 'median', target.unit)}</div>
      <div>Mean {formatDistributionValue(distribution, 'mean', target.unit)}</div>
      <div>IQR {formatDistributionValue(distribution, 'iqr', target.unit)}</div>
      <div>Min {formatDistributionValue(distribution, 'min', target.unit)} · Max {formatDistributionValue(distribution, 'max', target.unit)}</div>
    </div>
  );
}

function formatRunLabel(run: BanjiBenchmarkRunRecord) {
  const date = new Date(run.startedAt);
  return `${date.toLocaleString()} - ${run.status}`;
}

function formatScenarioLabel(scenario: string) {
  return BANJI_BENCHMARK_SCENARIOS.find((entry) => entry.id === scenario)?.label ?? scenario;
}

function runTargetCounts(run: BanjiBenchmarkRunRecord | null) {
  const targets = run?.summaries.flatMap((summary) => summary.targets ?? []) ?? [];
  return {
    pass: targets.filter((target) => target.status === 'pass').length,
    watch: targets.filter((target) => target.status === 'watch').length,
    fail: targets.filter((target) => target.status === 'fail').length,
    missing: targets.filter((target) => target.status === 'missing').length,
  };
}

function findTargetMeta(target: BanjiBenchmarkTargetEvaluation) {
  return BANJI_BENCHMARK_TARGETS.find((candidate) => candidate.metricName === target.metricName);
}

function ScenarioToggle({
  checked,
  id,
  label,
  onToggle,
}: {
  checked: boolean;
  id: BanjiBenchmarkScenarioId;
  label: string;
  onToggle: (id: BanjiBenchmarkScenarioId) => void;
}) {
  return (
    <label className="flex min-w-0 items-center gap-3 rounded-lg border border-border/60 px-3 py-2 text-sm">
      <Checkbox checked={checked} onCheckedChange={() => onToggle(id)} />
      <span className="min-w-0 truncate">{label}</span>
    </label>
  );
}

function TargetTable({
  resultSortDirection,
  targets,
  onToggleResultSort,
}: {
  resultSortDirection: TargetResultSortDirection;
  targets: BanjiBenchmarkTargetEvaluation[];
  onToggleResultSort: () => void;
}) {
  if (targets.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No target evaluations yet. Run a benchmark scenario to populate this table.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-border/70 text-xs uppercase tracking-[0.16em] text-muted-foreground">
          <tr>
            <th className="py-3 pr-4 font-semibold">Target</th>
            <th className="py-3 pr-4 font-semibold">
              <ResultSortHeader direction={resultSortDirection} onClick={onToggleResultSort} />
            </th>
            <th className="py-3 pr-4 font-semibold">Goal</th>
            <th className="py-3 pr-4 font-semibold">Acceptable</th>
            <th className="py-3 pr-4 font-semibold">Basis</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {targets.map((target, index) => {
            const meta = findTargetMeta(target);
            return (
              <tr key={`${target.metricName}:${index}`}>
                <td className="py-3 pr-4 align-top">
                  <div className="font-medium text-foreground">{target.label}</div>
                  <div className="mt-1 font-mono text-xs text-muted-foreground">{target.metricName}</div>
                </td>
                <td className="py-3 pr-4 align-top">
                  <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1', statusClassName[target.status])}>
                    {target.status}
                  </span>
                  <TargetDistributionDetails target={target} />
                </td>
                <td className="py-3 pr-4 align-top">{formatMetricValue(target.nonNegotiable, target.unit)}</td>
                <td className="py-3 pr-4 align-top">{formatMetricValue(target.acceptable, target.unit)}</td>
                <td className="max-w-[18rem] py-3 pr-4 align-top text-muted-foreground">
                  <div>{target.source}</div>
                  {meta ? <div className="mt-1 text-xs leading-5">{meta.rationale}</div> : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ComparisonTable({ comparison }: { comparison: BanjiBenchmarkComparison | null }) {
  if (!comparison) {
    return <p className="text-sm text-muted-foreground">Choose two completed runs to compare.</p>;
  }
  const visibleMetrics = comparison.metrics
    .filter((metric) => metric.status !== 'missing')
    .slice(0, 20);

  return (
    <div className="grid gap-3">
      <p className="text-sm text-muted-foreground">
        Comparing {comparison.baselineRunId} to {comparison.candidateRunId}.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-border/70 text-xs uppercase tracking-[0.16em] text-muted-foreground">
            <tr>
              <th className="py-3 pr-4 font-semibold">Metric</th>
              <th className="py-3 pr-4 font-semibold">Baseline</th>
              <th className="py-3 pr-4 font-semibold">Candidate</th>
              <th className="py-3 pr-4 font-semibold">Delta</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {visibleMetrics.map((metric) => (
              <tr key={metric.metricName}>
                <td className="py-3 pr-4 font-mono text-xs">{metric.metricName}</td>
                <td className="py-3 pr-4">{metric.baseline == null ? 'No data' : metric.baseline.toFixed(1)}</td>
                <td className="py-3 pr-4">{metric.candidate == null ? 'No data' : metric.candidate.toFixed(1)}</td>
                <td className="py-3 pr-4">
                  <span className={cn(
                    'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1',
                    metric.status === 'regression'
                      ? statusClassName.fail
                      : metric.status === 'improvement'
                        ? statusClassName.pass
                        : statusClassName.missing,
                  )}
                  >
                    {metric.percent == null ? 'No data' : `${metric.percent.toFixed(1)}% ${metric.status}`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function BenchmarkSettingsPage() {
  const [runs, setRuns] = useState<BanjiBenchmarkRunRecord[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [selectedScenarios, setSelectedScenarios] = useState<BanjiBenchmarkScenarioId[]>(
    BANJI_BENCHMARK_SCENARIOS.map((scenario) => scenario.id),
  );
  const [fixtureSize, setFixtureSize] = useState<BanjiBenchmarkFixtureSize>('medium');
  const [traceEnabled, setTraceEnabled] = useState(false);
  const [repeatCount, setRepeatCount] = useState('1');
  const [buildBeforeRun, setBuildBeforeRun] = useState(true);
  const [status, setStatus] = useState('Loading benchmark runner...');
  const [available, setAvailable] = useState(false);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [baselineRunId, setBaselineRunId] = useState<string | null>(null);
  const [candidateRunId, setCandidateRunId] = useState<string | null>(null);
  const [comparison, setComparison] = useState<BanjiBenchmarkComparison | null>(null);
  const [selectedSummaryScenario, setSelectedSummaryScenario] = useState<string>(SUMMARY_FILTER_ALL);
  const [flamegraphScenario, setFlamegraphScenario] = useState<BanjiBenchmarkScenarioId | null>(null);
  const [isGeneratingFlamegraph, setIsGeneratingFlamegraph] = useState(false);
  const [targetResultFilters, setTargetResultFilters] = useState<TargetStatusFilter[]>(
    TARGET_RESULT_FILTER_OPTIONS.map((option) => option.value),
  );
  const [targetResultSortDirection, setTargetResultSortDirection] = useState<TargetResultSortDirection>('asc');

  const selectedRun = runs.find((run) => run.runId === selectedRunId) ?? runs[0] ?? null;
  const activeRun = activeRunId ? runs.find((run) => run.runId === activeRunId) ?? null : null;
  const selectedSummary = selectedRun?.summaries.find((summary) => summary.scenario === selectedSummaryScenario)
    ?? null;
  const targetCounts = runTargetCounts(selectedRun);
  const completedRuns = runs.filter((run) => run.status === 'passed' || run.status === 'failed');
  const selectedTargets = useMemo(() => {
    const targets = selectedSummaryScenario === SUMMARY_FILTER_ALL
      ? selectedRun?.summaries.flatMap((summary) => summary.targets ?? []) ?? []
      : selectedSummary?.targets ?? [];
    return targets
      .filter((target) => targetResultFilters.includes(target.status))
      .sort((left, right) => {
        const statusOrder = compareText(left.status, right.status, targetResultSortDirection);
        if (statusOrder !== 0) {
          return statusOrder;
        }
        return compareText(left.label, right.label, targetResultSortDirection);
      });
  }, [selectedRun, selectedSummary, selectedSummaryScenario, targetResultFilters, targetResultSortDirection]);

  useEffect(() => {
    if (!selectedRun || selectedRun.summaries.length === 0) {
      setSelectedSummaryScenario(SUMMARY_FILTER_ALL);
      return;
    }
    if (selectedSummaryScenario === SUMMARY_FILTER_ALL) {
      return;
    }
    if (
      selectedSummaryScenario
      && selectedRun.summaries.some((summary) => summary.scenario === selectedSummaryScenario)
    ) {
      return;
    }
    setSelectedSummaryScenario(SUMMARY_FILTER_ALL);
  }, [selectedRun, selectedSummaryScenario]);

  useEffect(() => {
    const firstScenario = selectedRun?.summaries[0]?.scenario ?? null;
    if (!selectedRun || selectedRun.summaries.length === 0) {
      setFlamegraphScenario(null);
      return;
    }
    if (flamegraphScenario && selectedRun.summaries.some((summary) => summary.scenario === flamegraphScenario)) {
      return;
    }
    setFlamegraphScenario(firstScenario);
  }, [flamegraphScenario, selectedRun]);

  async function refreshRuns(nextSelectedRunId?: string | null) {
    const nextRuns = await window.banjiDesktop.benchmarkRunner?.listRuns() ?? [];
    setRuns(nextRuns);
    const nextActiveRun = nextRuns.find((run) => run.status === 'queued' || run.status === 'running') ?? null;
    setActiveRunId(nextActiveRun?.runId ?? null);
    if (nextSelectedRunId) {
      setSelectedRunId(nextSelectedRunId);
    } else if (!selectedRunId && nextRuns[0]) {
      setSelectedRunId(nextRuns[0].runId);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const availability = await window.banjiDesktop.benchmarkRunner?.getAvailability();
        if (cancelled) {
          return;
        }
        setAvailable(Boolean(availability?.available));
        setActiveRunId(availability?.activeRunId ?? null);
        setStatus(availability?.available ? 'Ready to run benchmarks.' : availability?.reason ?? 'Benchmark runner unavailable.');
        await refreshRuns();
      } catch (error) {
        if (!cancelled) {
          setStatus(error instanceof Error ? error.message : 'Failed to load benchmark runner.');
        }
      }
    }
    void load();
    const unsubscribe = window.banjiDesktop.benchmarkRunner?.onRunEvent((event) => {
      setStatus(event.message);
      if (event.record) {
        setRuns((currentRuns) => {
          const without = currentRuns.filter((run) => run.runId !== event.record?.runId);
          return [event.record, ...without].sort((left, right) => right.startedAt.localeCompare(left.startedAt));
        });
        setSelectedRunId(event.record.runId);
        setActiveRunId(event.record.status === 'queued' || event.record.status === 'running' ? event.record.runId : null);
      } else if (event.stream && event.line) {
        setRuns((currentRuns) =>
          currentRuns.map((run) => {
            if (run.runId !== event.runId) {
              return run;
            }
            const nextTail = [...run[event.stream === 'stdout' ? 'stdoutTail' : 'stderrTail'], event.line ?? ''].slice(-200);
            return event.stream === 'stdout'
              ? { ...run, stdoutTail: nextTail }
              : { ...run, stderrTail: nextTail };
          }),
        );
      }
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function toggleScenario(id: BanjiBenchmarkScenarioId) {
    setSelectedScenarios((current) => {
      if (current.includes(id)) {
        return current.length === 1 ? current : current.filter((scenario) => scenario !== id);
      }
      return [...current, id];
    });
  }

  async function startRun() {
    if (!window.banjiDesktop.benchmarkRunner) {
      return;
    }
    try {
      setStatus('Starting benchmark run...');
      const run = await window.banjiDesktop.benchmarkRunner.startRun({
        scenarios: selectedScenarios,
        fixtureSize,
        traceEnabled,
        repeatCount: Number(repeatCount) || 1,
        buildBeforeRun,
      });
      setSelectedRunId(run.runId);
      setActiveRunId(run.runId);
      await refreshRuns(run.runId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to start benchmark run.');
      await refreshRuns();
    }
  }

  async function cancelRun() {
    if (!activeRunId || !window.banjiDesktop.benchmarkRunner) {
      return;
    }
    try {
      setStatus('Cancelling benchmark run...');
      const run = await window.banjiDesktop.benchmarkRunner.cancelRun(activeRunId);
      setSelectedRunId(run.runId);
      await refreshRuns(run.runId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to cancel benchmark run.');
      await refreshRuns(activeRunId);
    }
  }

  async function compareRuns() {
    if (!baselineRunId || !candidateRunId || !window.banjiDesktop.benchmarkRunner) {
      return;
    }
    setComparison(await window.banjiDesktop.benchmarkRunner.compareRuns({ baselineRunId, candidateRunId }));
  }

  async function revealSelectedRun() {
    if (selectedRun && window.banjiDesktop.benchmarkRunner) {
      await window.banjiDesktop.benchmarkRunner.revealRun(selectedRun.runId);
    }
  }

  async function generateFlamegraph() {
    if (!selectedRun || !flamegraphScenario || !window.banjiDesktop.benchmarkRunner) {
      return;
    }
    try {
      setIsGeneratingFlamegraph(true);
      setStatus(`Generating ${formatScenarioLabel(flamegraphScenario)} flame graph...`);
      await window.banjiDesktop.benchmarkRunner.generateFlamegraph({
        runId: selectedRun.runId,
        scenario: flamegraphScenario,
      });
      setStatus(`Opened ${formatScenarioLabel(flamegraphScenario)} flame graph HTML artifact.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Failed to generate flame graph.');
    } finally {
      setIsGeneratingFlamegraph(false);
    }
  }

  function toggleTargetResultFilter(nextStatus: TargetStatusFilter) {
    setTargetResultFilters((current) => {
      if (current.includes(nextStatus)) {
        return current.length === 1 ? current : current.filter((status) => status !== nextStatus);
      }
      return [...current, nextStatus];
    });
  }

  function toggleTargetResultSort() {
    setTargetResultSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
  }

  return (
    <div className="grid gap-4">
      <WorkspacePanel>
        <div className="grid gap-6">
          <div className="grid gap-2">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <NavigationPerformanceIcon className="size-5" />
              </span>
              <div>
                <p className="text-sm font-semibold text-foreground">Benchmark control</p>
                <p className="text-sm text-muted-foreground">{status}</p>
              </div>
            </div>
          </div>

          <section className="grid gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Scenarios</p>
            <div className="grid gap-2">
              {BANJI_BENCHMARK_SCENARIOS.map((scenario) => (
                <ScenarioToggle
                  key={scenario.id}
                  checked={selectedScenarios.includes(scenario.id)}
                  id={scenario.id}
                  label={scenario.label}
                  onToggle={toggleScenario}
                />
              ))}
            </div>
          </section>

          <section className="grid gap-3 border-t border-border/60 pt-5">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm">
                <span>Fixture size</span>
                <Select value={fixtureSize} onValueChange={(value) => setFixtureSize(value as BanjiBenchmarkFixtureSize)}>
                  <SelectTrigger aria-label="Fixture size">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="minimal">Minimal</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="heavy">Heavy</SelectItem>
                    <SelectItem value="power-user">Power User</SelectItem>
                  </SelectContent>
                </Select>
              </label>
              <label className="grid gap-2 text-sm">
                <span>Repeat count</span>
                <Select value={repeatCount} onValueChange={setRepeatCount}>
                  <SelectTrigger aria-label="Repeat count">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1</SelectItem>
                    <SelectItem value="2">2</SelectItem>
                    <SelectItem value="3">3</SelectItem>
                    <SelectItem value="4">4</SelectItem>
                    <SelectItem value="5">5</SelectItem>
                  </SelectContent>
                </Select>
              </label>
            </div>
            <label className="flex items-center gap-3 text-sm">
              <Checkbox checked={traceEnabled} onCheckedChange={(value) => setTraceEnabled(Boolean(value))} />
              Capture Playwright trace artifacts
            </label>
            <label className="flex items-center gap-3 text-sm">
              <Checkbox checked={buildBeforeRun} onCheckedChange={(value) => setBuildBeforeRun(Boolean(value))} />
              Build before running
            </label>
          </section>

          <WorkspaceActionRow>
            <Button disabled={!available || Boolean(activeRunId)} type="button" onClick={() => void startRun()}>
              Run selected
            </Button>
            <Button disabled={!activeRunId} type="button" variant="outline" onClick={() => void cancelRun()}>
              Cancel
            </Button>
            <Button type="button" variant="outline" onClick={() => void refreshRuns()}>
              <ActionUndoIcon data-icon="inline-start" />
              Refresh
            </Button>
          </WorkspaceActionRow>

          <section className="grid gap-3 border-t border-border/60 pt-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Runs</p>
            {runs.length === 0 ? (
              <p className="text-sm text-muted-foreground">No GUI benchmark runs yet.</p>
            ) : (
              <Select value={selectedRun?.runId ?? ''} onValueChange={setSelectedRunId}>
                <SelectTrigger aria-label="Selected benchmark run">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {runs.map((run) => (
                    <SelectItem key={run.runId} value={run.runId}>
                      {formatRunLabel(run)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </section>
        </div>
      </WorkspacePanel>

      <WorkspacePanel>
        {selectedRun ? (
          <div className="grid gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{selectedRun.runId}</p>
                <p className="text-sm text-muted-foreground">
                  {formatRunLabel(selectedRun)} · {selectedRun.fixtureSize} fixture · {selectedRun.repeatCount} repeat
                </p>
              </div>
              <WorkspaceActionRow>
                <Button type="button" variant="outline" onClick={() => void revealSelectedRun()}>
                  <ActionOpenFolderIcon data-icon="inline-start" />
                  Reveal artifacts
                </Button>
              </WorkspaceActionRow>
            </div>

            <section className="grid gap-3 border-t border-border/60 pt-5">
              <div>
                <p className="text-sm font-semibold text-foreground">Flame graph</p>
                <p className="text-sm text-muted-foreground">
                  Generate one HTML artifact for one benchmark scope at a time. Repeated runs use the longest observed timeline.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                <Select
                  value={flamegraphScenario ?? ''}
                  onValueChange={(value) => setFlamegraphScenario(value as BanjiBenchmarkScenarioId)}
                >
                  <SelectTrigger aria-label="Flame graph scope">
                    <SelectValue placeholder="Scope" />
                  </SelectTrigger>
                  <SelectContent>
                    {selectedRun.summaries.map((summary) => (
                      <SelectItem key={summary.scenario} value={summary.scenario}>
                        {formatScenarioLabel(summary.scenario)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  disabled={!flamegraphScenario || isGeneratingFlamegraph || selectedRun.status === 'queued' || selectedRun.status === 'running'}
                  type="button"
                  variant="outline"
                  onClick={() => void generateFlamegraph()}
                >
                  Generate flame graph
                </Button>
              </div>
            </section>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {(['pass', 'watch', 'fail', 'missing'] as const).map((statusKey) => (
                <div key={statusKey} className="rounded-lg border border-border/60 px-3 py-3">
                  <p className="text-2xl font-semibold text-foreground">{targetCounts[statusKey]}</p>
                  <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{statusKey}</p>
                </div>
              ))}
            </div>

            {selectedRun.error ? (
              <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {selectedRun.error}
              </p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Select or run a benchmark to inspect results.</p>
        )}
      </WorkspacePanel>

      <WorkspacePanel>
        <div className="grid gap-4">
          <div>
            <p className="text-sm font-semibold text-foreground">Compare runs</p>
            <p className="text-sm text-muted-foreground">Compare medians and derived metrics. More than 10% slower is marked as a regression.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
            <Select value={baselineRunId ?? ''} onValueChange={setBaselineRunId}>
              <SelectTrigger aria-label="Baseline run">
                <SelectValue placeholder="Baseline" />
              </SelectTrigger>
              <SelectContent>
                {completedRuns.map((run) => (
                  <SelectItem key={run.runId} value={run.runId}>
                    {formatRunLabel(run)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={candidateRunId ?? ''} onValueChange={setCandidateRunId}>
              <SelectTrigger aria-label="Candidate run">
                <SelectValue placeholder="Candidate" />
              </SelectTrigger>
              <SelectContent>
                {completedRuns.map((run) => (
                  <SelectItem key={run.runId} value={run.runId}>
                    {formatRunLabel(run)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button disabled={!baselineRunId || !candidateRunId} type="button" onClick={() => void compareRuns()}>
              Compare
            </Button>
          </div>
          <ComparisonTable comparison={comparison} />
        </div>
      </WorkspacePanel>

      <WorkspacePanel>
        <div className="grid gap-3">
          <p className="text-sm font-semibold text-foreground">Output tail</p>
          {activeRun ? (
            <pre className="max-h-72 overflow-auto rounded-lg bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
              {[...activeRun.stdoutTail, ...activeRun.stderrTail].slice(-80).join('\n') || 'Waiting for output...'}
            </pre>
          ) : selectedRun ? (
            <pre className="max-h-72 overflow-auto rounded-lg bg-muted/50 p-3 text-xs leading-5 text-muted-foreground">
              {[...selectedRun.stdoutTail, ...selectedRun.stderrTail].slice(-80).join('\n') || 'No output captured.'}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground">No output yet.</p>
          )}
        </div>
      </WorkspacePanel>

      <WorkspacePanel>
        <div className="grid gap-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-foreground">Target status</p>
              <p className="text-sm text-muted-foreground">
                Non-negotiable, acceptable, and technical targets are based on desktop app startup guidance, RAIL, Core Web Vitals, Electron performance guidance, and Chromium jank diagnostics.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {selectedRun && selectedRun.summaries.length > 1 ? (
                <Select
                  value={selectedSummaryScenario}
                  onValueChange={setSelectedSummaryScenario}
                >
                  <SelectTrigger aria-label="Selected benchmark summary" className="min-w-[12rem]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={SUMMARY_FILTER_ALL}>All</SelectItem>
                    {selectedRun.summaries.map((summary) => (
                      <SelectItem key={summary.scenario} value={summary.scenario}>
                        {formatScenarioLabel(summary.scenario)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}
              <AnchoredMenu
                align="right"
                label="Filter result states"
                triggerClassName="min-w-[10rem] justify-between"
                triggerIcon={(
                  <>
                    <span>Results</span>
                    <span className="text-xs text-muted-foreground">
                      {targetResultFilters.length}/{TARGET_RESULT_FILTER_OPTIONS.length}
                    </span>
                  </>
                )}
                triggerSize="sm"
              >
                {() => (
                  <div className="grid gap-1">
                    {TARGET_RESULT_FILTER_OPTIONS.map((option) => {
                      const checked = targetResultFilters.includes(option.value);
                      const locked = checked && targetResultFilters.length === 1;
                      return (
                        <label
                          key={option.value}
                          className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent',
                            locked ? 'opacity-70' : null,
                          )}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={locked}
                            onCheckedChange={() => toggleTargetResultFilter(option.value)}
                          />
                          <span>{option.label}</span>
                        </label>
                      );
                    })}
                  </div>
                )}
              </AnchoredMenu>
            </div>
          </div>
          <TargetTable
            resultSortDirection={targetResultSortDirection}
            targets={selectedTargets}
            onToggleResultSort={toggleTargetResultSort}
          />
        </div>
      </WorkspacePanel>
    </div>
  );
}
