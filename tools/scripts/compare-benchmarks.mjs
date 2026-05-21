#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

async function readSummaries(directory) {
  const entries = await readdir(directory, { recursive: true });
  const summaries = [];
  for (const entry of entries) {
    if (!entry.endsWith('.summary.json')) {
      continue;
    }
    const raw = await readFile(join(directory, entry), 'utf8');
    summaries.push(JSON.parse(raw));
  }
  return summaries;
}

function metricValue(summary, name) {
  return summary.metrics?.[name]?.median ?? null;
}

const [, , baselineArg, candidateArg] = process.argv;
if (!baselineArg || !candidateArg) {
  console.error('Usage: pnpm bench:compare <baseline-summary-dir> <candidate-summary-dir>');
  process.exit(1);
}

const baselineDirectory = resolve(baselineArg);
const candidateDirectory = resolve(candidateArg);
const baseline = await readSummaries(baselineDirectory);
const candidate = await readSummaries(candidateDirectory);
const baselineByScenario = new Map(baseline.map((summary) => [summary.scenario, summary]));

for (const candidateSummary of candidate) {
  const baselineSummary = baselineByScenario.get(candidateSummary.scenario);
  if (!baselineSummary) {
    console.log(`NEW ${candidateSummary.scenario}`);
    continue;
  }

  console.log(`\n${candidateSummary.scenario}`);
  const metricNames = new Set([
    ...Object.keys(baselineSummary.metrics ?? {}),
    ...Object.keys(candidateSummary.metrics ?? {}),
  ]);
  for (const name of [...metricNames].sort()) {
    const before = metricValue(baselineSummary, name);
    const after = metricValue(candidateSummary, name);
    if (before == null || after == null) {
      continue;
    }
    const delta = after - before;
    const pct = before === 0 ? 0 : (delta / before) * 100;
    const marker = pct > 10 ? 'REGRESSION' : pct < -10 ? 'IMPROVEMENT' : 'same';
    console.log(`${marker} ${name}: ${before.toFixed(1)}ms -> ${after.toFixed(1)}ms (${pct.toFixed(1)}%)`);
  }
}
