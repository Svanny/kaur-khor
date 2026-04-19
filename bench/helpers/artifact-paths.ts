import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

export function benchmarkRunId(scenarioName: string) {
  const slug = scenarioName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug}-${Date.now()}-${process.pid}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function benchmarkOutputDirectory(runId: string) {
  const directory = resolve('bench-results', runId);
  await mkdir(directory, { recursive: true });
  return directory;
}

export async function benchmarkDataDirectory(runId: string) {
  const directory = resolve('bench-results', 'data', runId);
  await mkdir(directory, { recursive: true });
  return directory;
}
