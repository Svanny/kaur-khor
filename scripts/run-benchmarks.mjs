#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { readdir, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

delete process.env.NO_COLOR;

const playwrightArgs = process.argv.slice(2);
const runStartedAt = Date.now();
const managedScenarios = JSON.parse(await readFile(resolve('src/shared/benchmark-scenarios.json'), 'utf8'));
const managedScenarioFiles = managedScenarios.map((scenario) => scenario.file);
const managedScenarioByFile = new Map(managedScenarios.map((scenario) => [scenario.file, scenario]));
const managedScenarioByBasename = new Map(managedScenarios.map((scenario) => [scenario.file.split('/').at(-1), scenario]));

function isScenarioArg(arg) {
  return arg.endsWith('.bench.ts') || arg.includes('bench/scenarios/');
}

function normalizeScenarioArg(arg) {
  return arg.replaceAll('\\', '/').replace(/^\.\//, '');
}

function scenarioForArg(arg) {
  const normalized = normalizeScenarioArg(arg);
  return managedScenarioByFile.get(normalized) ?? managedScenarioByBasename.get(normalized.split('/').at(-1));
}

function requestedScenariosForArgs(args) {
  const explicitScenarios = args.filter(isScenarioArg);
  if (explicitScenarios.length === 0) {
    return managedScenarios;
  }
  return explicitScenarios
    .map(scenarioForArg)
    .filter(Boolean);
}

function playwrightScenarioArgs(args) {
  if (args.filter(isScenarioArg).length > 0) {
    return args;
  }
  return [...managedScenarioFiles, ...args];
}

if (playwrightArgs.includes('--list-managed-scenarios')) {
  for (const file of managedScenarioFiles) {
    console.log(file);
  }
  process.exit(0);
}

const requestedScenarioIds = requestedScenariosForArgs(playwrightArgs).map((scenario) => scenario.id);
const testArgs = playwrightScenarioArgs(playwrightArgs);

async function walkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) {
        return walkFiles(path);
      }
      return [path];
    }),
  );
  return files.flat();
}

async function readFreshSummaries() {
  const files = await walkFiles(resolve('bench-results'));
  const summaries = await Promise.all(
    files
      .filter((file) => file.endsWith('.summary.json'))
      .map(async (file) => {
        const fileStat = await stat(file).catch(() => null);
        if (!fileStat || fileStat.mtimeMs < runStartedAt) {
          return null;
        }
        const raw = await readFile(file, 'utf8').catch(() => null);
        return raw ? JSON.parse(raw) : null;
      }),
  );
  return summaries.filter(Boolean);
}

function targetStatusCounts(summaries, requestedScenarioIds) {
  const targets = summaries.flatMap((summary) => summary.targets ?? []);
  const summarizedScenarios = new Set(summaries.map((summary) => summary.scenario));
  const missingScenarios = requestedScenarioIds.filter((scenario) => !summarizedScenarios.has(scenario));
  const zeroTargetSummaries = summaries.filter((summary) => (summary.targets ?? []).length === 0).length;
  return {
    pass: targets.filter((target) => target.status === 'pass').length,
    watch: targets.filter((target) => target.status === 'watch').length,
    fail: targets.filter((target) => target.status === 'fail').length,
    missing: targets.filter((target) => target.status === 'missing').length,
    total: targets.length,
    summaries: summaries.length,
    missingScenarios,
    zeroTargetSummaries,
  };
}

function printTargetStatusSummary(summaries, requestedScenarioIds) {
  const counts = targetStatusCounts(summaries, requestedScenarioIds);
  if (
    counts.summaries === 0 ||
    counts.total === 0 ||
    counts.fail > 0 ||
    counts.missing > 0 ||
    counts.missingScenarios.length > 0 ||
    counts.zeroTargetSummaries > 0
  ) {
    console.error(`[benchmark] target failure: ${counts.fail} failed, ${counts.missing} missing, ${counts.watch} watch, ${counts.pass} pass.`);
    if (counts.summaries === 0) {
      console.error('[benchmark] no fresh benchmark summaries were collected.');
    }
    if (counts.total === 0) {
      console.error('[benchmark] no benchmark targets were collected.');
    }
    for (const scenario of counts.missingScenarios) {
      console.error(`[benchmark] missing summary: ${scenario}`);
    }
    if (counts.zeroTargetSummaries > 0) {
      console.error(`[benchmark] ${counts.zeroTargetSummaries} summary file${counts.zeroTargetSummaries === 1 ? '' : 's'} had zero targets.`);
    }
    for (const summary of summaries) {
      for (const target of summary.targets ?? []) {
        if (target.status === 'fail' || target.status === 'missing') {
          console.error(`[benchmark] ${target.status}: ${summary.scenario} ${target.metricName} = ${target.value ?? 'missing'}`);
        }
      }
    }
    return 1;
  }
  if (counts.watch > 0) {
    console.warn(`[benchmark] warning: ${counts.watch} watch target${counts.watch === 1 ? '' : 's'}, ${counts.pass} pass. Process succeeded, but targets are not all green.`);
    for (const summary of summaries) {
      for (const target of summary.targets ?? []) {
        if (target.status === 'watch') {
          console.warn(`[benchmark] watch: ${summary.scenario} ${target.metricName} = ${Math.round(target.value ?? 0)} ${target.unit} (goal ${target.nonNegotiable}, acceptable ${target.acceptable})`);
        }
      }
    }
    return 0;
  }
  console.log(`[benchmark] all ${counts.pass} benchmark targets passed.`);
  return 0;
}

const build = spawn('pnpm', ['build'], { stdio: 'inherit' });
const buildCode = await new Promise((resolve) => build.once('exit', resolve));
if (buildCode !== 0) {
  process.exit(buildCode ?? 1);
}

const coreBuild = spawn('cargo', ['build', '--manifest-path', resolve('apps/desktop-core/Cargo.toml')], {
  stdio: 'inherit',
});
const coreBuildCode = await new Promise((resolve) => coreBuild.once('exit', resolve));
if (coreBuildCode !== 0) {
  process.exit(coreBuildCode ?? 1);
}

const desktopCoreBinary = resolve(
  'apps/desktop-core/target/debug',
  process.platform === 'win32' ? 'banji-desktop-core.exe' : 'banji-desktop-core',
);
const testEnv = {
  ...process.env,
  BANJI_DESKTOP_CORE_BINARY: process.env.BANJI_DESKTOP_CORE_BINARY ?? desktopCoreBinary,
  BANJI_BENCHMARK_TRACE: process.env.BANJI_BENCHMARK_TRACE ?? '0',
};
if (testEnv.NO_COLOR) {
  delete testEnv.NO_COLOR;
}

const test = spawn('pnpm', ['exec', 'playwright', 'test', '-c', 'playwright.bench.config.ts', ...testArgs], {
  env: {
    ...testEnv,
  },
  stdio: 'inherit',
});
const testCode = await new Promise((resolve) => test.once('exit', resolve));
if (testCode !== 0) {
  process.exit(testCode ?? 1);
}
const summaries = await readFreshSummaries();
process.exit(printTargetStatusSummary(summaries, requestedScenarioIds));
