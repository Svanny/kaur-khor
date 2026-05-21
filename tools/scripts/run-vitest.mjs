#!/usr/bin/env node

import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { normalize } from 'node:path';

const userArgs = process.argv.slice(2);
if (userArgs[0] === '--') {
  userArgs.shift();
}

const serialTestFiles = [
  'tests/bench/helpers/bench-metrics.test.ts',
  'src/renderer/src/routes/inventory/service-form.test.tsx',
  'src/renderer/src/routes/inventory/sku-form.test.tsx',
  'src/renderer/src/routes/records/stock-update-session.test.tsx',
  'src/renderer/src/routes/web/index.test.tsx',
];
const posixTestPath = (value) => normalize(value).replace(/^\.\//, '').replace(/\\/g, '/');
const serialTestFileSet = new Set(serialTestFiles.map(posixTestPath));
const serialFlags = new Set(['--serial', '--no-file-parallelism']);
const forwardedArgs = userArgs.filter((arg) => !serialFlags.has(arg));
const hasExplicitSerialFlag =
  process.env.KAUR_KHOR_VITEST_SERIAL === '1' || userArgs.some((arg) => serialFlags.has(arg));
const defaultWorkerCount = process.env.KAUR_KHOR_VITEST_WORKERS ?? '4';

function hasFileFilter(args) {
  return args.some((arg) => !arg.startsWith('-') && existsSync(arg));
}

function shouldRunFocusedSerial(args) {
  return args.some((arg) => serialTestFileSet.has(posixTestPath(arg)));
}

function hasWorkerLimit(args) {
  return args.some((arg) => arg === '--maxWorkers' || arg.startsWith('--maxWorkers='));
}

function hasReporter(args) {
  return args.some((arg) => arg === '--reporter' || arg.startsWith('--reporter='));
}

function hasOutputFile(args) {
  return args.some((arg) => arg === '--outputFile' || arg.startsWith('--outputFile='));
}

function runVitest(args, { serial = false } = {}) {
  const result = spawnSync('vitest', [
    'run',
    '--config',
    'config/test/vitest.config.ts',
    ...(hasReporter(args) ? [] : ['--reporter=dot']),
    ...(!serial && !hasWorkerLimit(args) ? [`--maxWorkers=${defaultWorkerCount}`] : []),
    ...(serial ? ['--no-file-parallelism'] : []),
    ...args,
  ], {
    stdio: 'inherit',
  });

  if (result.error) {
    throw result.error;
  }

  return result.status ?? 1;
}

if (hasExplicitSerialFlag || hasFileFilter(forwardedArgs) || hasOutputFile(forwardedArgs)) {
  process.exit(runVitest(forwardedArgs, {
    serial: hasExplicitSerialFlag || shouldRunFocusedSerial(forwardedArgs) || hasOutputFile(forwardedArgs),
  }));
}

const parallelStatus = runVitest([
  ...serialTestFiles.flatMap((file) => ['--exclude', file]),
  ...forwardedArgs,
]);
let serialStatus = 0;
for (const file of serialTestFiles) {
  const nextStatus = runVitest([file, ...forwardedArgs], { serial: true });
  if (nextStatus !== 0 && serialStatus === 0) {
    serialStatus = nextStatus;
  }
}

process.exit(parallelStatus || serialStatus);
