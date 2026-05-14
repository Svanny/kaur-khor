#!/usr/bin/env node

import { spawnSync } from 'node:child_process';

const userArgs = process.argv.slice(2);
if (userArgs[0] === '--') {
  userArgs.shift();
}

const result = spawnSync('vitest', [
  'run',
  '--reporter=dot',
  '--no-file-parallelism',
  ...userArgs,
], {
  stdio: 'inherit',
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
