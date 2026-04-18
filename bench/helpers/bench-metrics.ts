import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { BanjiBenchmarkEvent } from '../../src/shared/benchmark';

export interface BenchmarkMetricSummary {
  count: number;
  max: number | null;
  median: number | null;
  min: number | null;
  p95: number | null;
}

export interface BenchmarkScenarioSummary {
  scenario: string;
  runId: string;
  generatedAt: string;
  metrics: Record<string, BenchmarkMetricSummary>;
  slowestIpc: Array<{ name: string; durationMs: number }>;
  slowestCore: Array<{ name: string; command: string | null; durationMs: number }>;
}

export async function readBenchmarkEvents(outputDirectory: string) {
  const streams = await Promise.all(
    ['events.jsonl', 'core-events.jsonl'].map(async (fileName) => {
      const path = join(outputDirectory, fileName);
      const raw = await readFile(path, 'utf8').catch(() => '');
      return raw
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line) as BanjiBenchmarkEvent);
    }),
  );
  return streams.flat().sort((a, b) => a.ts - b.ts);
}

function percentile(values: number[], p: number) {
  if (values.length === 0) {
    return null;
  }
  const index = Math.min(values.length - 1, Math.ceil((p / 100) * values.length) - 1);
  return values[index] ?? null;
}

export function summarizeDurations(values: number[]): BenchmarkMetricSummary {
  const sorted = [...values].sort((a, b) => a - b);
  return {
    count: sorted.length,
    max: sorted.at(-1) ?? null,
    median: percentile(sorted, 50),
    min: sorted[0] ?? null,
    p95: percentile(sorted, 95),
  };
}

export function buildScenarioSummary({
  events,
  runId,
  scenario,
}: {
  events: BanjiBenchmarkEvent[];
  runId: string;
  scenario: string;
}): BenchmarkScenarioSummary {
  const durationsByName = new Map<string, number[]>();
  for (const event of events) {
    if (event.phase !== 'end' || typeof event.durationMs !== 'number') {
      continue;
    }
    const bucket = durationsByName.get(event.name) ?? [];
    bucket.push(event.durationMs);
    durationsByName.set(event.name, bucket);
  }

  const metrics = Object.fromEntries(
    [...durationsByName.entries()].map(([name, values]) => [name, summarizeDurations(values)]),
  );

  const slowestIpc = events
    .filter((event) => event.category === 'ipc' && typeof event.durationMs === 'number')
    .map((event) => ({ name: event.name, durationMs: event.durationMs ?? 0 }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10);

  const slowestCore = events
    .filter((event) => event.category === 'core-command' && typeof event.durationMs === 'number')
    .map((event) => ({
      name: event.name,
      command: event.command ?? null,
      durationMs: event.durationMs ?? 0,
    }))
    .sort((a, b) => b.durationMs - a.durationMs)
    .slice(0, 10);

  return {
    scenario,
    runId,
    generatedAt: new Date().toISOString(),
    metrics,
    slowestIpc,
    slowestCore,
  };
}

export async function writeScenarioSummary(
  outputDirectory: string,
  summary: BenchmarkScenarioSummary,
) {
  await writeFile(
    join(outputDirectory, `${summary.scenario}.summary.json`),
    `${JSON.stringify(summary, null, 2)}\n`,
    'utf8',
  );
}
